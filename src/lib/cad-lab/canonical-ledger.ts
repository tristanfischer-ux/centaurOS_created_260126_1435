/**
 * @file canonical-ledger.ts — Loop 16 Block A1 single source of truth.
 *
 * @description The 8-of-8 council consensus on Loop 16 was that ForgeOS could
 * not reach 9/10 until every section of the report read from one canonical
 * spec ledger instead of generating numerical claims independently. Today the
 * 12.5x motor-power mismatch and the 60% Finn-vs-BOM cost gap surface on the
 * Reconciliation page as warnings; this ledger removes them at source.
 *
 * The ledger is a JSONB column `canonical_specs` on cad_lab_projects with the
 * shape below. Specialists call upsertCanonicalSpec / upsertCanonicalPart
 * which apply source-rank gating: a Fang post-review patch (rank 90)
 * supersedes a BOM-generator estimate (rank 70) which supersedes a
 * Max-decomposition guess (rank 50). Reconciliation gate uses the canonical
 * value as ground truth.
 *
 * The renderer reads ONLY from this ledger for numerical values. Module
 * descriptions, BOM rows, sizing configurations are still authored by their
 * respective specialists, but the numbers come from here.
 *
 * @see supabase/migrations/20260427180000_canonical_specs_ledger.sql
 * @see src/lib/cad-lab/source-rank.ts — rank constants + canOverwrite
 * @see src/lib/cad-lab/apply-design-patches.ts — Fang patch application
 */

import { createHash } from "node:crypto"

import { SOURCE_RANK, type CanonicalSource, canOverwrite } from "./source-rank"

/**
 * Portable deep-clone. structuredClone is the Node 17+ / browser native, but
 * Jest's jsdom test env (used by `npm test`) doesn't expose it on every
 * Node version. JSON-clone is fine here: canonical specs are pure data.
 */
function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

// ─── Types ────────────────────────────────────────────────────────────

/**
 * A single canonical numeric value. Stamped with provenance so a downstream
 * specialist can reason about whether to overwrite (canOverwrite checks the
 * source rank).
 */
export interface CanonicalValue<T = number> {
    value: T
    unit: string
    source: CanonicalSource
    sourceRank: number
    updatedAt: string
    /** Optional 0-1 confidence score the emitting specialist can attach. */
    confidence?: number
    /** Optional human-readable rationale (e.g. "from Rittal AX catalogue Loop 16 patch"). */
    rationale?: string
}

/**
 * Per-module canonical specs. Keys are stable shorthand: powerW, voltageV,
 * pressureBar, massKg, etc. Specialists agree on the key naming through
 * SPEC_KEYS below — adding a new key requires updating this constant.
 */
export interface CanonicalModule {
    moduleId: string
    moduleName: string
    /** Map of stable spec key → CanonicalValue. Unknown values are simply absent. */
    specs: Record<string, CanonicalValue<number>>
    /** Part numbers (BOM rows) that belong to this module. */
    linkedPartIds: string[]
}

/** Per-part canonical numeric values (cost, mass, qty). */
export interface CanonicalPart {
    partId: string
    moduleId: string | null
    partNumber: string
    description: string
    qty: number
    isPurchased: boolean
    /** Unit cost in GBP. CanonicalValue so a Fang Rittal-AX patch can supersede the BOM-gen estimate. */
    unitCostGbp?: CanonicalValue<number>
    /** Mass per unit in kg. */
    massKg?: CanonicalValue<number>
    /** MPN / catalogue identifier when known. */
    mpn?: string
    manufacturer?: string
}

/**
 * Cost rollup derived purely from canonical_specs.parts. Finn's prose section
 * READS from here; it does NOT author its own total. This kills the 60%
 * Finn-vs-BOM gap class by construction (council F4 / Block I1+I2).
 */
export interface CanonicalCostRollup {
    bomSubtotalGbp: number
    /** Finn's coarse estimate is logged for explanation only — never canonical. */
    finnEstimateGbp: number | null
    contingencyGbp: number
    projectTotalGbp: number
    derivedAt: string
}

/**
 * Top-level shape stored in cad_lab_projects.canonical_specs. Versioned by
 * schemaVersion so future migrations can detect old payloads.
 */
export interface CanonicalSpecs {
    schemaVersion: 1
    revision: number
    digest: string
    currency: "GBP"
    units: "SI"
    modules: Record<string, CanonicalModule>
    parts: Record<string, CanonicalPart>
    cost: CanonicalCostRollup | null
    /** Issues the deterministic gate could not auto-repair (rendered as a
     *  shrunken Reconciliation section — see Block I1+I2). */
    unresolvedFindings: Array<{
        id: string
        section: string
        summary: string
        leftSource: CanonicalSource
        rightSource: CanonicalSource
        leftValue: number
        rightValue: number
        unit: string
    }>
}

// ─── Spec key registry ────────────────────────────────────────────────

/** Stable, lowerCamelCase keys for module-level numeric specs. */
export const SPEC_KEYS = {
    powerW: { unit: "W", description: "Power draw / rating" },
    voltageV: { unit: "V", description: "Operating voltage" },
    currentA: { unit: "A", description: "Operating current" },
    pressureBar: { unit: "bar", description: "Operating pressure" },
    flowLpm: { unit: "L/min", description: "Volumetric flow" },
    torqueNm: { unit: "N·m", description: "Torque" },
    massKg: { unit: "kg", description: "Module mass" },
    energyKwh: { unit: "kWh", description: "Energy capacity" },
    capacityWh: { unit: "Wh", description: "Energy capacity (small)" },
    enduranceHours: { unit: "h", description: "Endurance / runtime" },
    envelopeXMm: { unit: "mm", description: "Bounding box X" },
    envelopeYMm: { unit: "mm", description: "Bounding box Y" },
    envelopeZMm: { unit: "mm", description: "Bounding box Z" },
} as const

export type SpecKey = keyof typeof SPEC_KEYS

// ─── Constructors ─────────────────────────────────────────────────────

export function emptyCanonicalSpecs(): CanonicalSpecs {
    return {
        schemaVersion: 1,
        revision: 0,
        digest: "",
        currency: "GBP",
        units: "SI",
        modules: {},
        parts: {},
        cost: null,
        unresolvedFindings: [],
    }
}

/** Stable JSON stringify (sorted keys) so digest is deterministic. */
function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value)
    if (Array.isArray(value)) {
        return "[" + value.map(stableStringify).join(",") + "]"
    }
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    return (
        "{" +
        keys
            .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
            .join(",") +
        "}"
    )
}

/**
 * Canonical SHA-256 digest used for fixed-point detection in the review-revise
 * loop (halt when digest unchanged between iterations). Computed over
 * everything EXCEPT revision / digest / unresolvedFindings (so applying a
 * patch that yields the same value twice halts the loop).
 */
export function canonicalDigest(specs: CanonicalSpecs): string {
    const { revision: _r, digest: _d, unresolvedFindings: _u, ...rest } = specs
    void _r
    void _d
    void _u
    const stable = stableStringify(rest)
    return createHash("sha256").update(stable).digest("hex").slice(0, 16)
}

// ─── Source-rank-gated upsert ─────────────────────────────────────────

export interface UpsertSpecArgs {
    moduleId: string
    moduleName?: string
    key: SpecKey
    value: number
    source: CanonicalSource
    confidence?: number
    rationale?: string
}

/**
 * Upserts a single module spec. Returns a NEW CanonicalSpecs object (we never
 * mutate input). The caller is responsible for persisting via saveCanonicalSpecs.
 *
 * Rank gating: if the existing value's source has higher rank, the new value
 * is ignored (returned unchanged). If lower or equal, overwritten.
 */
export function upsertCanonicalSpec(
    specs: CanonicalSpecs,
    args: UpsertSpecArgs,
): CanonicalSpecs {
    const incomingRank = SOURCE_RANK[args.source]
    const meta = SPEC_KEYS[args.key]
    if (!meta) {
        throw new Error(`upsertCanonicalSpec: unknown spec key "${args.key}"`)
    }

    const next = deepClone(specs)
    const mod = next.modules[args.moduleId] ?? {
        moduleId: args.moduleId,
        moduleName: args.moduleName ?? args.moduleId,
        specs: {},
        linkedPartIds: [],
    }
    if (args.moduleName) mod.moduleName = args.moduleName

    const existing = mod.specs[args.key]
    if (existing && !canOverwrite(existing.source, args.source)) {
        // Higher-rank source already owns this value. No-op.
        return specs
    }

    mod.specs[args.key] = {
        value: args.value,
        unit: meta.unit,
        source: args.source,
        sourceRank: incomingRank,
        updatedAt: new Date().toISOString(),
        ...(args.confidence !== undefined ? { confidence: args.confidence } : {}),
        ...(args.rationale ? { rationale: args.rationale } : {}),
    }
    next.modules[args.moduleId] = mod
    return next
}

export interface UpsertPartArgs {
    partId: string
    moduleId: string | null
    partNumber: string
    description: string
    qty: number
    isPurchased: boolean
    unitCostGbp?: number
    massKg?: number
    mpn?: string
    manufacturer?: string
    source: CanonicalSource
    rationale?: string
}

/** Upserts a part with rank-gated cost and mass values. */
export function upsertCanonicalPart(
    specs: CanonicalSpecs,
    args: UpsertPartArgs,
): CanonicalSpecs {
    const incomingRank = SOURCE_RANK[args.source]
    const next = deepClone(specs)

    const existing = next.parts[args.partId]
    const part: CanonicalPart = existing ?? {
        partId: args.partId,
        moduleId: args.moduleId,
        partNumber: args.partNumber,
        description: args.description,
        qty: args.qty,
        isPurchased: args.isPurchased,
    }

    // Cost: rank-gated.
    if (args.unitCostGbp !== undefined) {
        if (!part.unitCostGbp || canOverwrite(part.unitCostGbp.source, args.source)) {
            part.unitCostGbp = {
                value: args.unitCostGbp,
                unit: "GBP",
                source: args.source,
                sourceRank: incomingRank,
                updatedAt: new Date().toISOString(),
                ...(args.rationale ? { rationale: args.rationale } : {}),
            }
        }
    }
    // Mass: rank-gated.
    if (args.massKg !== undefined) {
        if (!part.massKg || canOverwrite(part.massKg.source, args.source)) {
            part.massKg = {
                value: args.massKg,
                unit: "kg",
                source: args.source,
                sourceRank: incomingRank,
                updatedAt: new Date().toISOString(),
            }
        }
    }
    // Identity fields: latest write wins (description / mpn / manufacturer
    // are textual and not subject to numerical-rank precedence; if Fang's
    // patch identifies a Rittal AX cabinet, that description supersedes
    // the bespoke one even though both are "valid" in their own context).
    if (args.mpn) part.mpn = args.mpn
    if (args.manufacturer) part.manufacturer = args.manufacturer
    if (args.description) part.description = args.description
    if (args.partNumber) part.partNumber = args.partNumber
    part.qty = args.qty
    part.isPurchased = args.isPurchased
    if (args.moduleId !== undefined) part.moduleId = args.moduleId

    next.parts[args.partId] = part

    // Wire part into the module's linkedPartIds for the reverse lookup.
    if (args.moduleId) {
        const mod = next.modules[args.moduleId]
        if (mod && !mod.linkedPartIds.includes(args.partId)) {
            mod.linkedPartIds.push(args.partId)
        }
    }
    return next
}

// ─── Cost rollup ──────────────────────────────────────────────────────

/**
 * Recomputes cost.bomSubtotalGbp by SUM(parts × qty). Called after every BOM
 * mutation. Block I1+I2 / council F4: this kills the 60% Finn-vs-BOM gap by
 * construction — Finn's `finnEstimateGbp` is logged for explanation only,
 * `projectTotalGbp` is always the BOM rollup.
 */
export function recomputeCostRollup(
    specs: CanonicalSpecs,
    finnEstimateGbp: number | null = null,
    contingencyGbp = 0,
): CanonicalSpecs {
    const next = deepClone(specs)
    let subtotal = 0
    for (const part of Object.values(next.parts)) {
        if (part.unitCostGbp && Number.isFinite(part.unitCostGbp.value)) {
            subtotal += part.unitCostGbp.value * (part.qty ?? 1)
        }
    }
    next.cost = {
        bomSubtotalGbp: Math.round(subtotal * 100) / 100,
        finnEstimateGbp:
            finnEstimateGbp !== null && finnEstimateGbp !== undefined
                ? Math.round(finnEstimateGbp * 100) / 100
                : (next.cost?.finnEstimateGbp ?? null),
        contingencyGbp,
        projectTotalGbp: Math.round((subtotal + contingencyGbp) * 100) / 100,
        derivedAt: new Date().toISOString(),
    }
    return next
}

// ─── Persistence helpers ──────────────────────────────────────────────

/**
 * Writes the ledger to cad_lab_projects.canonical_specs with optimistic-lock
 * on canonical_specs_revision. Bumps revision and recomputes digest.
 *
 * @param supabase a service-role client (createAdminClient()).
 * @param projectId UUID of the cad_lab_projects row.
 * @param specs the new ledger.
 * @returns { ok, revision } on success, { ok: false, error } on conflict.
 */
export async function saveCanonicalSpecs(
    supabase: {
        from: (table: string) => {
            update: (values: Record<string, unknown>) => {
                eq: (col: string, val: string) => {
                    eq: (col: string, val: number) => {
                        select: () => {
                            single: () => Promise<{
                                data: { canonical_specs_revision: number } | null
                                error: { message: string } | null
                            }>
                        }
                    }
                }
            }
        }
    },
    projectId: string,
    specs: CanonicalSpecs,
    expectedRevision: number,
): Promise<{ ok: true; revision: number } | { ok: false; error: string }> {
    const nextRevision = expectedRevision + 1
    const digest = canonicalDigest(specs)
    const payload: CanonicalSpecs = {
        ...specs,
        revision: nextRevision,
        digest,
    }

    const { data, error } = await supabase
        .from("cad_lab_projects")
        .update({
            canonical_specs: payload,
            canonical_specs_revision: nextRevision,
            canonical_specs_digest: digest,
        })
        .eq("id", projectId)
        .eq("canonical_specs_revision", expectedRevision)
        .select()
        .single()

    if (error) {
        return { ok: false, error: error.message }
    }
    if (!data) {
        return { ok: false, error: "OPTIMISTIC_LOCK_CONFLICT" }
    }
    return { ok: true, revision: data.canonical_specs_revision }
}

/**
 * Loads the canonical ledger. Returns the empty ledger if none exists yet.
 */
export async function loadCanonicalSpecs(
    supabase: {
        from: (table: string) => {
            select: (cols: string) => {
                eq: (col: string, val: string) => {
                    single: () => Promise<{
                        data: {
                            canonical_specs: CanonicalSpecs | null
                            canonical_specs_revision: number | null
                        } | null
                        error: { message: string } | null
                    }>
                }
            }
        }
    },
    projectId: string,
): Promise<{ ok: true; specs: CanonicalSpecs; revision: number } | { ok: false; error: string }> {
    const { data, error } = await supabase
        .from("cad_lab_projects")
        .select("canonical_specs, canonical_specs_revision")
        .eq("id", projectId)
        .single()

    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: "PROJECT_NOT_FOUND" }

    const raw = data.canonical_specs ?? null
    const revision = data.canonical_specs_revision ?? 0

    if (!raw || Object.keys(raw).length === 0) {
        return { ok: true, specs: emptyCanonicalSpecs(), revision: 0 }
    }
    return { ok: true, specs: raw, revision }
}
