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
 * Block G follow-up (council 2026-04-27): six bugs closed in this rewrite.
 *
 *   1. logPatch(applied=true) used to fire BEFORE saveCanonicalSpecs returned.
 *      A save failure left the audit table claiming patches landed that
 *      didn't, which then poisoned the oscillation guard. Resolved by
 *      collapsing the per-patch UPDATE + INSERT into the
 *      `apply_canonical_patch_atomic` RPC (single Postgres transaction).
 *
 *   2. saveCanonicalSpecs.single() made the OPTIMISTIC_LOCK_CONFLICT branch
 *      unreachable. Resolved in canonical-ledger.ts (plain .select()).
 *      This file now also routes through the atomic RPC, which returns a
 *      typed `outcome` discriminator — no more error-code archaeology.
 *
 *   3. logPatch hardcoded source_rank=90 regardless of patch.source. Resolved
 *      by reading SOURCE_RANK[patch.source]. Migration 20260427210000 added
 *      a CHECK on source_rank IN allowed values to prevent regression.
 *
 *   5. part_cost patches with unknown partId silently created phantom parts
 *      (moduleId:null) that inflated bomSubtotalGbp without showing on any
 *      module page. Resolved by rejecting unknown-partId part_cost patches
 *      with REJECTED_UNKNOWN_PART; only callers with full-fat part rows
 *      (description, qty, isPurchased, moduleId) can introduce a new part,
 *      via the BOM generator path.
 *
 *   6. Rank-gated no-ops were silently counted as `applied=true` AND audited
 *      as such. Resolved by switching to the discriminated
 *      `upsertCanonicalSpecChecked` / `upsertCanonicalPartChecked` helpers
 *      and only counting / auditing when `applied=true`.
 *
 * @see src/lib/cad-lab/canonical-ledger.ts
 * @see src/lib/cad-lab/spec-patch-types.ts
 * @see supabase/migrations/20260427210000_canonical_specs_atomicity_and_constraints.sql
 */

import {
    loadCanonicalSpecs,
    upsertCanonicalSpecChecked,
    upsertCanonicalPartChecked,
    recomputeCostRollup,
    canonicalDigest,
    type CanonicalSpecs,
    type SpecKey,
    type UpsertResult,
} from "./canonical-ledger"
import { SOURCE_RANK } from "./source-rank"
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
    halt: { reason: "applied" | "fixed_point" | "oscillation" | "max_iterations" | "cost_ceiling" | "lock_conflict"; detail?: string }
}

export interface PatchApplicationError {
    ok: false
    error: string
    errorCode?: string
}

/**
 * The Supabase admin client (from createAdminClient()) supports all the
 * surface area we need (load, save, insert, select, rpc). The structural
 * types we declare on each helper are subsets of the real client; widening
 * to `any` here avoids fighting the structural-subtype unions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

/**
 * Apply a batch of Fang patches to a project's canonical specs.
 *
 * Each accepted patch is applied to a working copy of the ledger; the working
 * copy is then persisted via `apply_canonical_patch_atomic` once at the end
 * of the batch with the final aggregate state. Rejections are also written
 * via the atomic RPC (with applied=false) so the audit table preserves
 * reasons even when no spec mutation lands.
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
    const recentHashes = await loadRecentPatchHashes(supabase, projectId)

    // 3. Apply patches one at a time against a working copy.
    let working = priorSpecs
    const rejections: Array<{ hash: string; reason: string }> = []
    /** Patches that produced a real ledger mutation, awaiting atomic persist. */
    const acceptedPatches: Array<{ patch: SpecPatch; hash: string }> = []
    /** Patches rejected before persist — audit-only writes via atomic RPC. */
    const auditOnlyRejections: Array<{ patch: SpecPatch; hash: string; reason: string }> = []
    let cumulativeDeltaPence = 0

    for (const rawPatch of patches) {
        const parsed = SpecPatchSchema.safeParse(rawPatch)
        if (!parsed.success) {
            const hash = specPatchHash(rawPatch as SpecPatch)
            const reason = `SCHEMA_INVALID: ${parsed.error.issues.map((i) => i.message).join("; ")}`
            rejections.push({ hash, reason })
            // Schema-invalid patches CANNOT pass the source CHECK / source_rank CHECK
            // in the audit table reliably, so we don't try to log them via the RPC.
            // The in-memory rejections array is the surface for the caller / logs.
            continue
        }
        const patch = parsed.data
        const hash = specPatchHash(patch)

        // Oscillation guard.
        if (recentHashes.has(hash)) {
            rejections.push({ hash, reason: "OSCILLATION_DUPLICATE_PATCH" })
            auditOnlyRejections.push({ patch, hash, reason: "OSCILLATION_DUPLICATE_PATCH" })
            continue
        }

        // Cost-impact ceiling: cumulative |delta| ≤ 200% of original BOM (or
        // £50,000 floor for tiny projects).
        if (patch.costImpactGbpPence !== undefined) {
            cumulativeDeltaPence += Math.abs(patch.costImpactGbpPence)
            const ceilingPence = Math.max(priorBomTotal * 100 * 2, 5_000_000)
            if (cumulativeDeltaPence > ceilingPence) {
                const reason = `COST_CEILING_EXCEEDED (delta ~£${(cumulativeDeltaPence / 100).toFixed(0)} > 2x BOM)`
                rejections.push({ hash, reason })
                auditOnlyRejections.push({ patch, hash, reason })
                continue
            }
        }

        // Block G bug #5: part_cost patches with unknown partId used to
        // silently create phantom rows. Reject explicitly.
        if (patch.scope === "part_cost") {
            const partId = patch.partId
            if (!partId || !working.parts[partId]) {
                const reason = "REJECTED_UNKNOWN_PART (part_cost requires existing partId — BOM generator must create the part first)"
                rejections.push({ hash, reason })
                auditOnlyRejections.push({ patch, hash, reason })
                continue
            }
        }

        // Apply via the discriminated checked-upsert helpers (Block G bug #6).
        try {
            const result = applySinglePatchChecked(working, patch)
            if (!result.applied) {
                const reason = `RANK_DENIED_OR_NOOP (${result.reason ?? "no_change"})`
                rejections.push({ hash, reason })
                auditOnlyRejections.push({ patch, hash, reason })
                continue
            }
            working = result.specs
            acceptedPatches.push({ patch, hash })
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            const reason = `APPLY_THREW: ${message}`
            rejections.push({ hash, reason })
            auditOnlyRejections.push({ patch, hash, reason })
        }
    }

    // 4. Recompute cost rollup if anything changed.
    if (acceptedPatches.length > 0) {
        working = recomputeCostRollup(
            working,
            working.cost?.finnEstimateGbp ?? null,
            working.cost?.contingencyGbp ?? 0,
        )
    }

    // 5. Fixed-point check.
    const newDigest = canonicalDigest(working)
    if (newDigest === priorDigest && acceptedPatches.length === 0) {
        // No spec mutation — but we still owe audit rows for rejections.
        for (const r of auditOnlyRejections) {
            await rpcLogRejection(supabase, projectId, r.patch, r.hash, iteration, r.reason)
        }
        return {
            ok: true,
            applied: 0,
            rejected: rejections.length,
            rejections,
            revisionAfter: priorRevision,
            digestAfter: priorDigest,
            halt: rejections.some((r) => r.reason.startsWith("OSCILLATION"))
                ? { reason: "oscillation" }
                : rejections.some((r) => r.reason.startsWith("COST_CEILING"))
                    ? { reason: "cost_ceiling" }
                    : { reason: "fixed_point" },
        }
    }

    // 6. Persist accepted patches via the atomic RPC. Each accepted patch
    //    gets its own atomic call (UPDATE specs + INSERT audit row in one
    //    Postgres transaction). The first call uses priorRevision; each
    //    subsequent call uses the revision returned by the previous one.
    //
    //    NB: this is N round-trips (one per accepted patch). For batches >5
    //    we may want to introduce a single-call multi-patch RPC; deferring
    //    that until benchmarks demand it.
    let currentRevision = priorRevision
    let currentDigest = priorDigest
    let runningSpecs = priorSpecs

    for (const { patch, hash } of acceptedPatches) {
        // Re-apply this patch against runningSpecs so the JSONB sent to the
        // RPC is the post-this-patch state (the atomic UPDATE replaces the
        // whole canonical_specs JSONB; we cannot rely on partial updates).
        const stepResult = applySinglePatchChecked(runningSpecs, patch)
        if (!stepResult.applied) {
            // Should not happen — we already verified applied=true above. Skip.
            continue
        }
        runningSpecs = recomputeCostRollup(
            stepResult.specs,
            stepResult.specs.cost?.finnEstimateGbp ?? null,
            stepResult.specs.cost?.contingencyGbp ?? 0,
        )
        currentDigest = canonicalDigest(runningSpecs)
        const sourceRank = SOURCE_RANK[patch.source]

        const rpcResult = await rpcApplyAtomic(supabase, {
            projectId,
            expectedRevision: currentRevision,
            newSpecs: { ...runningSpecs, revision: currentRevision + 1, digest: currentDigest },
            newDigest: currentDigest,
            patchPayload: patch,
            patchHash: hash,
            source: patch.source,
            sourceRank,
            iteration,
            costImpactPence: patch.costImpactGbpPence ?? null,
            applied: true,
            rejectionReason: null,
        })

        if (!rpcResult.ok) {
            return { ok: false, error: rpcResult.error, errorCode: "RPC_FAILED" }
        }
        if (rpcResult.outcome === "OPTIMISTIC_LOCK_CONFLICT") {
            // Another writer landed first. Caller should reload & retry.
            return {
                ok: true,
                applied: acceptedPatches.indexOf({ patch, hash }),
                rejected: rejections.length + 1,
                rejections: [...rejections, { hash, reason: "OPTIMISTIC_LOCK_CONFLICT" }],
                revisionAfter: currentRevision,
                digestAfter: currentDigest,
                halt: { reason: "lock_conflict", detail: "concurrent writer; caller should reload + retry" },
            }
        }
        if (rpcResult.outcome === "PROJECT_NOT_FOUND") {
            return { ok: false, error: "PROJECT_NOT_FOUND", errorCode: "PROJECT_NOT_FOUND" }
        }
        if (rpcResult.outcome !== "APPLIED") {
            return { ok: false, error: `UNKNOWN_RPC_OUTCOME: ${rpcResult.outcome}`, errorCode: "RPC_UNKNOWN" }
        }
        currentRevision = rpcResult.revision
    }

    // 7. Now write the rejection audit rows (after the spec mutations land
    //    so any FK or CHECK failure on a rejection row doesn't roll back
    //    the spec UPDATE).
    for (const r of auditOnlyRejections) {
        await rpcLogRejection(supabase, projectId, r.patch, r.hash, iteration, r.reason)
    }

    return {
        ok: true,
        applied: acceptedPatches.length,
        rejected: rejections.length,
        rejections,
        revisionAfter: currentRevision,
        digestAfter: currentDigest,
        halt: { reason: "applied" },
    }
}

// ─── Internal: single-patch apply (discriminated) ────────────────────

/**
 * Block G bug #6: returns UpsertResult so the loop can skip rank-denied
 * no-ops. Note that part_cost / part_mass / part_identity patches against
 * unknown partIds throw — the caller should reject these BEFORE invoking
 * applySinglePatchChecked (see bug #5 handling above).
 */
function applySinglePatchChecked(specs: CanonicalSpecs, patch: SpecPatch): UpsertResult {
    if (patch.scope === "module_spec") {
        return upsertCanonicalSpecChecked(specs, {
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
            // Caller MUST have rejected this with REJECTED_UNKNOWN_PART before
            // reaching here. Throwing rather than silently creating a phantom.
            throw new Error(`part_cost patch references unknown partId ${patch.partId} — caller did not reject (bug #5 regression)`)
        }
        return upsertCanonicalPartChecked(specs, {
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
        return upsertCanonicalPartChecked(specs, {
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
        return upsertCanonicalPartChecked(specs, {
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

// ─── Audit-table reads ───────────────────────────────────────────────

async function loadRecentPatchHashes(
    supabase: SupabaseLike,
    projectId: string,
): Promise<Set<string>> {
    // Look back 24h for oscillation detection. Only APPLIED patches count —
    // a rejected patch is not state we should refuse to revisit.
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString()
    const { data, error } = await supabase
        .from("cad_lab_design_patches")
        .select("patch_hash")
        .eq("project_id", projectId)
        .eq("applied", true)
        .gte("created_at", since)

    if (error || !data) return new Set()
    type Row = { patch_hash: string | null }
    return new Set((data as Row[]).filter((r) => r.patch_hash).map((r) => r.patch_hash as string))
}

// ─── Atomic-RPC wrappers ─────────────────────────────────────────────

interface AtomicApplyArgs {
    projectId: string
    expectedRevision: number
    newSpecs: CanonicalSpecs
    newDigest: string
    patchPayload: SpecPatch
    patchHash: string
    source: SpecPatch["source"]
    sourceRank: number
    iteration: number
    costImpactPence: number | null
    applied: boolean
    rejectionReason: string | null
}

type AtomicOutcome = "APPLIED" | "REJECTED_LOGGED" | "OPTIMISTIC_LOCK_CONFLICT" | "PROJECT_NOT_FOUND"

interface AtomicRpcOk {
    ok: true
    outcome: AtomicOutcome
    revision: number
    digest: string | null
}

interface AtomicRpcErr {
    ok: false
    error: string
}

async function rpcApplyAtomic(
    supabase: SupabaseLike,
    args: AtomicApplyArgs,
): Promise<AtomicRpcOk | AtomicRpcErr> {
    const { data, error } = await supabase.rpc("apply_canonical_patch_atomic", {
        p_project_id: args.projectId,
        p_expected_revision: args.expectedRevision,
        p_new_specs: args.newSpecs,
        p_new_digest: args.newDigest,
        p_patch_payload: args.patchPayload,
        p_patch_hash: args.patchHash,
        p_source: args.source,
        p_source_rank: args.sourceRank,
        p_iteration: args.iteration,
        p_cost_impact_pence: args.costImpactPence,
        p_applied: args.applied,
        p_rejection_reason: args.rejectionReason,
    })
    if (error) return { ok: false, error: error.message }
    if (!data || typeof data !== "object") return { ok: false, error: "RPC_NO_DATA" }
    const outcome = (data as { outcome?: string }).outcome as AtomicOutcome | undefined
    if (!outcome) return { ok: false, error: "RPC_MISSING_OUTCOME" }
    const revision = (data as { revision?: number | null }).revision ?? args.expectedRevision
    const digest = (data as { digest?: string | null }).digest ?? null
    return { ok: true, outcome, revision, digest }
}

async function rpcLogRejection(
    supabase: SupabaseLike,
    projectId: string,
    patch: SpecPatch,
    hash: string,
    iteration: number,
    reason: string,
): Promise<void> {
    // Rejection-only writes don't need optimistic lock or new specs payload;
    // the RPC has a fast-path when p_applied=false.
    await supabase.rpc("apply_canonical_patch_atomic", {
        p_project_id: projectId,
        p_expected_revision: 0, // ignored on the rejection path
        p_new_specs: {},
        p_new_digest: "",
        p_patch_payload: patch,
        p_patch_hash: hash,
        p_source: patch.source,
        p_source_rank: SOURCE_RANK[patch.source],
        p_iteration: iteration,
        p_cost_impact_pence: patch.costImpactGbpPence ?? null,
        p_applied: false,
        p_rejection_reason: reason,
    })
}
