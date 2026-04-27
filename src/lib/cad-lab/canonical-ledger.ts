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
 * Discriminated result of an upsert. Block G bug #6: rank-gated no-ops were
 * silently counted as "applied" by the caller. Now the caller can branch on
 * `applied` and skip both `appliedCount += 1` and the audit log.
 */
export interface UpsertResult {
    /** The next ledger state (always returned, even on no-op — equal-by-reference to input on no-op). */
    specs: CanonicalSpecs
    /** True iff the value actually changed in the ledger. */
    applied: boolean
    /** Reason the upsert was rejected as a no-op. Populated only when applied=false. */
    reason?: "RANK_DENIED" | "VALUE_UNCHANGED"
}

/**
 * Upserts a single module spec. Returns the new ledger state PLUS an `applied`
 * discriminator so callers don't silently count no-ops as successes.
 *
 * Rank gating: if the existing value's source has higher rank, the new value
 * is ignored. Equal-or-greater rank: overwrite.
 *
 * @deprecated The legacy `upsertCanonicalSpec` returning bare CanonicalSpecs
 *   exists for backwards compatibility with the existing test suite. New
 *   callers should use `upsertCanonicalSpecChecked` so they can distinguish
 *   "applied" from "rank-denied no-op". See Block G bug #6.
 */
export function upsertCanonicalSpec(
    specs: CanonicalSpecs,
    args: UpsertSpecArgs,
): CanonicalSpecs {
    return upsertCanonicalSpecChecked(specs, args).specs
}

/**
 * The discriminated variant. Returns `{ specs, applied, reason? }` so the
 * caller can branch.
 */
export function upsertCanonicalSpecChecked(
    specs: CanonicalSpecs,
    args: UpsertSpecArgs,
): UpsertResult {
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
        return { specs, applied: false, reason: "RANK_DENIED" }
    }

    // Block G bug #6 follow-on: if the incoming value matches the current
    // value AND the source is the same, treat as a no-op too — there's
    // nothing to record. Different source at equal rank still counts as
    // "applied" because provenance changed.
    if (
        existing &&
        existing.value === args.value &&
        existing.source === args.source &&
        existing.unit === meta.unit
    ) {
        return { specs, applied: false, reason: "VALUE_UNCHANGED" }
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
    return { specs: next, applied: true }
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

/**
 * Upserts a part with rank-gated cost and mass values.
 *
 * @deprecated Use `upsertCanonicalPartChecked` for new callers — it returns
 *   a discriminated result so rank-denied writes are not silently counted
 *   as applied.
 */
export function upsertCanonicalPart(
    specs: CanonicalSpecs,
    args: UpsertPartArgs,
): CanonicalSpecs {
    return upsertCanonicalPartChecked(specs, args).specs
}

/**
 * Discriminated variant of `upsertCanonicalPart`. Reports `applied=false`
 * when every numeric field was rank-denied AND the part already existed
 * with identical identity fields.
 */
export function upsertCanonicalPartChecked(
    specs: CanonicalSpecs,
    args: UpsertPartArgs,
): UpsertResult {
    const incomingRank = SOURCE_RANK[args.source]
    const next = deepClone(specs)

    const existing = next.parts[args.partId]
    const part: CanonicalPart = existing
        ? { ...existing }
        : {
              partId: args.partId,
              moduleId: args.moduleId,
              partNumber: args.partNumber,
              description: args.description,
              qty: args.qty,
              isPurchased: args.isPurchased,
          }

    let mutated = !existing

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
            mutated = true
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
            mutated = true
        }
    }
    // Identity fields: latest write wins (description / mpn / manufacturer
    // are textual and not subject to numerical-rank precedence; if Fang's
    // patch identifies a Rittal AX cabinet, that description supersedes
    // the bespoke one even though both are "valid" in their own context).
    if (args.mpn !== undefined && args.mpn !== part.mpn) {
        part.mpn = args.mpn
        mutated = true
    }
    if (args.manufacturer !== undefined && args.manufacturer !== part.manufacturer) {
        part.manufacturer = args.manufacturer
        mutated = true
    }
    if (args.description && args.description !== part.description) {
        part.description = args.description
        mutated = true
    }
    if (args.partNumber && args.partNumber !== part.partNumber) {
        part.partNumber = args.partNumber
        mutated = true
    }
    if (part.qty !== args.qty) {
        part.qty = args.qty
        mutated = true
    }
    if (part.isPurchased !== args.isPurchased) {
        part.isPurchased = args.isPurchased
        mutated = true
    }
    if (args.moduleId !== undefined && part.moduleId !== args.moduleId) {
        part.moduleId = args.moduleId
        mutated = true
    }

    if (!mutated) {
        return { specs, applied: false, reason: "RANK_DENIED" }
    }

    next.parts[args.partId] = part

    // Wire part into the module's linkedPartIds for the reverse lookup.
    if (args.moduleId) {
        const mod = next.modules[args.moduleId]
        if (mod && !mod.linkedPartIds.includes(args.partId)) {
            mod.linkedPartIds.push(args.partId)
        }
    }
    return { specs: next, applied: true }
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
 * Block G bug #2: the previous implementation used `.select().single()`
 * after the UPDATE, which throws PGRST116 when zero rows match. The
 * generic `if (error)` branch swallowed the optimistic-lock conflict as
 * a generic Postgres error, so the typed `OPTIMISTIC_LOCK_CONFLICT`
 * branch was unreachable. Now we use plain `.select()` (returns array)
 * and detect conflict explicitly via `data.length === 0`.
 *
 * @param supabase a service-role client (createAdminClient()).
 * @param projectId UUID of the cad_lab_projects row.
 * @param specs the new ledger.
 * @returns { ok, revision } on success, { ok: false, error: 'OPTIMISTIC_LOCK_CONFLICT' | string } on conflict / DB error.
 */
export async function saveCanonicalSpecs(
    supabase: {
        from: (table: string) => {
            update: (values: Record<string, unknown>) => {
                eq: (col: string, val: string) => {
                    eq: (col: string, val: number) => {
                        select: (cols?: string) => Promise<{
                            data: Array<{ canonical_specs_revision: number }> | null
                            error: { message: string; code?: string } | null
                        }>
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
        .select("canonical_specs_revision")

    if (error) {
        return { ok: false, error: error.message }
    }
    if (!data || data.length === 0) {
        // Zero rows matched -> either project missing or revision mismatched.
        // The atomic RPC distinguishes these; this fallback path treats both
        // as OPTIMISTIC_LOCK_CONFLICT (caller can probe further if needed).
        return { ok: false, error: "OPTIMISTIC_LOCK_CONFLICT" }
    }
    if (data.length > 1) {
        // This should be impossible (id is PK) but surface it explicitly
        // rather than silently picking [0].
        return { ok: false, error: "MULTIPLE_ROWS_MATCHED" }
    }
    return { ok: true, revision: data[0].canonical_specs_revision }
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
