/**
 * @file snapshot-canonical-specs.ts — Loop 16 step 2 wiring.
 *
 * @description Until each specialist (Max, BOM generator, Sizing, Finn, Fang)
 * is rewritten to upsert canonical_specs at its own write site, the canonical
 * ledger sits empty. This module provides a one-shot "snapshot from current
 * state" function called at render time to populate canonical_specs from the
 * already-persisted modules + parts. It does not change any specialist;
 * downstream callers (Block I cost rollup, Block B consistency pass) can read
 * the canonical view without waiting for full ledger wiring.
 *
 * Source ranks used here mirror the architectural intent:
 *   - module specs (mass, power) → max_decomposition (50)
 *   - part costs / mass → bom_generator (70)
 *
 * If a specialist later wants to overwrite (e.g. Fang patch), the rank-gated
 * upsert in canonical-ledger.ts will accept the higher-rank source.
 */

import {
    emptyCanonicalSpecs,
    upsertCanonicalSpec,
    upsertCanonicalPart,
    recomputeCostRollup,
    saveCanonicalSpecs,
    canonicalDigest,
    type CanonicalSpecs,
    type SpecKey,
} from "./canonical-ledger"

interface SnapshotModuleLike {
    id?: string | null
    name?: string | null
    massKg?: number | null
    estimatedMassKg?: number | null
    cost?: { totalPerUnit?: number | null } | null
}

interface SnapshotPartLike {
    id?: string | null
    partNumber?: string | null
    name?: string | null
    description?: string | null
    sourceModuleName?: string | null
    quantity?: number | null
    massKg?: number | null
    estimatedUnitCostGbp?: number | null
    isPurchased?: boolean | null
}

export interface SnapshotResult {
    ok: boolean
    bomTotalGbp: number
    finnTotalGbp: number
    moduleSpecsCount: number
    partRowsCount: number
    digest: string
    error?: string
}

/**
 * Snapshot the current modules + parts arrays into canonical_specs.
 * Idempotent — runs every render. The optimistic-lock guards against
 * concurrent writes; a 409 is logged and ignored (next render will overwrite).
 */
export async function snapshotCanonicalSpecs(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    projectId: string,
    modules: SnapshotModuleLike[],
    parts: SnapshotPartLike[],
    finnEstimateGbp: number | null = null,
): Promise<SnapshotResult> {
    let specs: CanonicalSpecs = emptyCanonicalSpecs()

    // Module specs.
    for (const m of modules) {
        const moduleId = (m.id ?? m.name ?? "").trim()
        if (!moduleId) continue
        const moduleName = m.name ?? moduleId
        const massKg = typeof m.massKg === "number" ? m.massKg : (typeof m.estimatedMassKg === "number" ? m.estimatedMassKg : null)
        if (typeof massKg === "number" && Number.isFinite(massKg)) {
            specs = upsertCanonicalSpec(specs, {
                moduleId,
                moduleName,
                key: "massKg" as SpecKey,
                value: massKg,
                source: "max_decomposition",
            })
        }
        // Ensure the module exists even with no specs (linkedPartIds wiring below).
        if (!specs.modules[moduleId]) {
            specs.modules[moduleId] = {
                moduleId,
                moduleName,
                specs: {},
                linkedPartIds: [],
            }
        }
    }

    // Build a name → moduleId reverse lookup for parts (parts carry
    // sourceModuleName as text, not a foreign key).
    const moduleIdByName = new Map<string, string>()
    for (const m of modules) {
        if (m.name && m.id) moduleIdByName.set(m.name, m.id)
        else if (m.name) moduleIdByName.set(m.name, m.name)
    }

    // Parts.
    let partRowsCount = 0
    for (const p of parts) {
        const partId = (p.id ?? p.partNumber ?? "").trim()
        if (!partId) continue
        const moduleId = p.sourceModuleName ? (moduleIdByName.get(p.sourceModuleName) ?? p.sourceModuleName) : null
        const qty = typeof p.quantity === "number" ? p.quantity : 1
        specs = upsertCanonicalPart(specs, {
            partId,
            moduleId,
            partNumber: p.partNumber ?? partId,
            description: p.description ?? p.name ?? "",
            qty,
            isPurchased: Boolean(p.isPurchased),
            unitCostGbp: typeof p.estimatedUnitCostGbp === "number" ? p.estimatedUnitCostGbp : undefined,
            massKg: typeof p.massKg === "number" ? p.massKg : undefined,
            source: "bom_generator",
        })
        partRowsCount += 1
    }

    // Cost rollup.
    specs = recomputeCostRollup(specs, finnEstimateGbp)

    // Persist via optimistic-lock. We don't know the prior revision here so
    // load it; on conflict we just skip (next render will overwrite).
    const { data: priorRow } = await supabase
        .from("cad_lab_projects")
        .select("canonical_specs_revision")
        .eq("id", projectId)
        .single()
    const priorRevision = (priorRow?.canonical_specs_revision as number | null) ?? 0

    const result = await saveCanonicalSpecs(supabase, projectId, specs, priorRevision)
    const digest = canonicalDigest(specs)
    if (!result.ok) {
        return {
            ok: false,
            bomTotalGbp: specs.cost?.bomSubtotalGbp ?? 0,
            finnTotalGbp: specs.cost?.finnEstimateGbp ?? 0,
            moduleSpecsCount: Object.keys(specs.modules).length,
            partRowsCount,
            digest,
            error: result.error,
        }
    }
    return {
        ok: true,
        bomTotalGbp: specs.cost?.bomSubtotalGbp ?? 0,
        finnTotalGbp: specs.cost?.finnEstimateGbp ?? 0,
        moduleSpecsCount: Object.keys(specs.modules).length,
        partRowsCount,
        digest,
    }
}
