/**
 * @file apply-design-patches.ts — Loop 16 Block G review-revise applier.
 *
 * @description Reads SpecPatch[] emitted by Fang (run-fang-review.ts), applies
 * each one to the canonical specs ledger via rank-gated upsert, and persists.
 * Audited via cad_lab_design_patches (every patch INSERTed before mutation,
 * with applied/rejection metadata).
 *
 * Loop control (council unanimity):
 *   - Max 3 iterations per project
 *   - Halt on state-hash unchanged (fixed-point detected)
 *   - Halt on duplicate patch hash (oscillation detected)
 *   - Halt on cost-impact ceiling exceeded (cumulative |delta| > 200% of original BOM)
 *
 * The renderer reads from the canonical ledger AFTER patches are applied; it
 * never sees the un-patched state.
 *
 * @see src/lib/cad-lab/canonical-ledger.ts
 * @see src/lib/cad-lab/spec-patch-types.ts
 */

import {
    loadCanonicalSpecs,
    saveCanonicalSpecs,
    upsertCanonicalSpec,
    upsertCanonicalPart,
    recomputeCostRollup,
    canonicalDigest,
    type CanonicalSpecs,
    type SpecKey,
} from "./canonical-ledger"
import {
    type SpecPatch,
    SpecPatchSchema,
    specPatchHash,
} from "./spec-patch-types"

const MAX_ITERATIONS = 3

export interface ApplyDesignPatchesArgs {
    projectId: string
    patches: SpecPatch[]
    /** Iteration number this batch belongs to (for cad_lab_design_patches.iteration). 0 on first call. */
    iteration?: number
}

export interface PatchApplicationResult {
    ok: true
    applied: number
    rejected: number
    rejections: Array<{ hash: string; reason: string }>
    revisionAfter: number
    digestAfter: string
    halt: { reason: "applied" | "fixed_point" | "oscillation" | "max_iterations" | "cost_ceiling"; detail?: string }
}

export interface PatchApplicationError {
    ok: false
    error: string
    errorCode?: string
}

/**
 * The Supabase admin client (from createAdminClient()) supports all the
 * surface area we need (load, save, insert, select). The structural types
 * we declare on each helper are subsets of the real client; widening to
 * `any` here avoids fighting the structural-subtype unions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

/**
 * Apply a batch of Fang patches to a project's canonical specs.
 */
export async function applyDesignPatches(
    supabase: SupabaseLike,
    args: ApplyDesignPatchesArgs,
): Promise<PatchApplicationResult | PatchApplicationError> {
    const { projectId, patches } = args
    const iteration = args.iteration ?? 0

    if (iteration >= MAX_ITERATIONS) {
        return {
            ok: true,
            applied: 0,
            rejected: patches.length,
            rejections: patches.map((p) => ({
                hash: specPatchHash(p),
                reason: `MAX_ITERATIONS_REACHED (${MAX_ITERATIONS})`,
            })),
            revisionAfter: -1,
            digestAfter: "",
            halt: { reason: "max_iterations" },
        }
    }

    // 1. Load current canonical state.
    const loadResult = await loadCanonicalSpecs(supabase, projectId)
    if (!loadResult.ok) {
        return { ok: false, error: loadResult.error, errorCode: "LOAD_FAILED" }
    }
    const { specs: priorSpecs, revision: priorRevision } = loadResult
    const priorDigest = canonicalDigest(priorSpecs)
    const priorBomTotal = priorSpecs.cost?.bomSubtotalGbp ?? 0

    // 2. Pull recent applied patch hashes (for oscillation detection).
    const recentHashes = await loadRecentPatchHashes(supabase as never, projectId)

    // 3. Apply patches one at a time.
    let working = priorSpecs
    const rejections: Array<{ hash: string; reason: string }> = []
    let appliedCount = 0
    let cumulativeDeltaPence = 0

    for (const rawPatch of patches) {
        const parsed = SpecPatchSchema.safeParse(rawPatch)
        if (!parsed.success) {
            rejections.push({
                hash: specPatchHash(rawPatch as SpecPatch),
                reason: `SCHEMA_INVALID: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
            })
            continue
        }
        const patch = parsed.data
        const hash = specPatchHash(patch)

        // Oscillation guard.
        if (recentHashes.has(hash)) {
            rejections.push({ hash, reason: "OSCILLATION_DUPLICATE_PATCH" })
            await logPatch(supabase as never, projectId, patch, hash, iteration, false, "OSCILLATION_DUPLICATE_PATCH")
            continue
        }

        // Cost-impact ceiling: cumulative |delta| ≤ 200% of original BOM.
        if (patch.costImpactGbpPence !== undefined) {
            cumulativeDeltaPence += Math.abs(patch.costImpactGbpPence)
            const ceilingPence = Math.max(priorBomTotal * 100 * 2, 5_000_000)
            if (cumulativeDeltaPence > ceilingPence) {
                rejections.push({
                    hash,
                    reason: `COST_CEILING_EXCEEDED (delta ~£${(cumulativeDeltaPence / 100).toFixed(0)} > 2x BOM)`,
                })
                await logPatch(supabase as never, projectId, patch, hash, iteration, false, "COST_CEILING_EXCEEDED")
                continue
            }
        }

        // Apply.
        try {
            working = applySinglePatch(working, patch)
            appliedCount += 1
            await logPatch(supabase as never, projectId, patch, hash, iteration, true, null)
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            rejections.push({ hash, reason: `APPLY_THREW: ${message}` })
            await logPatch(supabase as never, projectId, patch, hash, iteration, false, `APPLY_THREW: ${message}`)
        }
    }

    // 4. Recompute cost rollup if anything changed.
    if (appliedCount > 0) {
        working = recomputeCostRollup(working, working.cost?.finnEstimateGbp ?? null, working.cost?.contingencyGbp ?? 0)
    }

    // 5. Fixed-point check.
    const newDigest = canonicalDigest(working)
    if (newDigest === priorDigest && appliedCount === 0) {
        return {
            ok: true,
            applied: 0,
            rejected: rejections.length,
            rejections,
            revisionAfter: priorRevision,
            digestAfter: priorDigest,
            halt: { reason: "fixed_point" },
        }
    }

    // 6. Persist with optimistic lock.
    const saveResult = await saveCanonicalSpecs(supabase, projectId, working, priorRevision)
    if (!saveResult.ok) {
        return { ok: false, error: saveResult.error, errorCode: "SAVE_FAILED" }
    }

    return {
        ok: true,
        applied: appliedCount,
        rejected: rejections.length,
        rejections,
        revisionAfter: saveResult.revision,
        digestAfter: newDigest,
        halt: appliedCount === 0
            ? { reason: "fixed_point" }
            : rejections.some((r) => r.reason === "OSCILLATION_DUPLICATE_PATCH")
                ? { reason: "oscillation" }
                : { reason: "applied" },
    }
}

// ─── Internal: single-patch apply ────────────────────────────────────

function applySinglePatch(specs: CanonicalSpecs, patch: SpecPatch): CanonicalSpecs {
    if (patch.scope === "module_spec") {
        return upsertCanonicalSpec(specs, {
            moduleId: patch.moduleId!,
            key: patch.specKey as SpecKey,
            value: patch.value as number,
            source: patch.source,
            confidence: patch.confidence,
            rationale: patch.reason,
        })
    }
    if (patch.scope === "part_cost") {
        const existing = specs.parts[patch.partId!]
        if (!existing) {
            // Patch references a part that doesn't exist yet — create a thin row;
            // BOM generator should fill the rest in next iteration.
            return upsertCanonicalPart(specs, {
                partId: patch.partId!,
                moduleId: null,
                partNumber: patch.partId!,
                description: "",
                qty: 1,
                isPurchased: true,
                unitCostGbp: patch.value as number,
                source: patch.source,
                rationale: patch.reason,
            })
        }
        return upsertCanonicalPart(specs, {
            partId: existing.partId,
            moduleId: existing.moduleId,
            partNumber: existing.partNumber,
            description: existing.description,
            qty: existing.qty,
            isPurchased: existing.isPurchased,
            unitCostGbp: patch.value as number,
            source: patch.source,
            rationale: patch.reason,
        })
    }
    if (patch.scope === "part_mass") {
        const existing = specs.parts[patch.partId!]
        if (!existing) throw new Error(`part_mass patch references unknown partId ${patch.partId}`)
        return upsertCanonicalPart(specs, {
            partId: existing.partId,
            moduleId: existing.moduleId,
            partNumber: existing.partNumber,
            description: existing.description,
            qty: existing.qty,
            isPurchased: existing.isPurchased,
            massKg: patch.value as number,
            source: patch.source,
            rationale: patch.reason,
        })
    }
    if (patch.scope === "part_identity") {
        const existing = specs.parts[patch.partId!]
        if (!existing) throw new Error(`part_identity patch references unknown partId ${patch.partId}`)
        const ident = patch.value as { description?: string; mpn?: string; manufacturer?: string }
        return upsertCanonicalPart(specs, {
            partId: existing.partId,
            moduleId: existing.moduleId,
            partNumber: existing.partNumber,
            description: ident.description ?? existing.description,
            qty: existing.qty,
            isPurchased: existing.isPurchased,
            mpn: ident.mpn,
            manufacturer: ident.manufacturer,
            source: patch.source,
            rationale: patch.reason,
        })
    }
    throw new Error(`unknown patch scope ${(patch as { scope: string }).scope}`)
}

// ─── Audit table writes ──────────────────────────────────────────────

interface AdminLikeClient {
    from(table: string): {
        select(cols: string): {
            eq(col: string, val: string): {
                gte(col: string, val: string): Promise<{ data: Array<{ patch_hash: string }> | null; error: { message: string } | null }>
            }
        }
        insert(row: Record<string, unknown>): Promise<{ error: { message: string } | null }>
    }
}

async function loadRecentPatchHashes(
    supabase: AdminLikeClient,
    projectId: string,
): Promise<Set<string>> {
    // Look back 24h of applied patches for oscillation detection.
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString()
    const { data, error } = await supabase
        .from("cad_lab_design_patches")
        .select("patch_hash")
        .eq("project_id", projectId)
        .gte("created_at", since)

    if (error || !data) return new Set()
    return new Set(data.filter((r) => r.patch_hash).map((r) => r.patch_hash))
}

async function logPatch(
    supabase: AdminLikeClient,
    projectId: string,
    patch: SpecPatch,
    hash: string,
    iteration: number,
    applied: boolean,
    rejectionReason: string | null,
): Promise<void> {
    await supabase.from("cad_lab_design_patches").insert({
        project_id: projectId,
        patch_payload: patch,
        patch_hash: hash,
        source: patch.source,
        source_rank: 90, // applied_review_patch
        iteration,
        cost_impact_gbp_pence: patch.costImpactGbpPence ?? null,
        applied,
        applied_at: applied ? new Date().toISOString() : null,
        rejection_reason: rejectionReason,
    })
}
