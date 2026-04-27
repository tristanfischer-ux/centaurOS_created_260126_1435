/**
 * @file apply-design-patches.test.ts — Loop 16 Block G applier invariants.
 *
 * Covers the six bug classes the council flagged on 2026-04-27:
 *
 *   1. Audit row consistency — `applied=true` only ever lands AFTER the
 *      spec mutation persists (atomic RPC enforces this).
 *   2. Optimistic-lock conflicts surface as `lock_conflict` halt.
 *   3. Audit row source_rank reflects patch.source rank, not a literal 90.
 *   4. (Migration-level — covered by the SQL CHECK + backfill.)
 *   5. part_cost patches with unknown partId are rejected, not silently
 *      promoted to phantom parts.
 *   6. Rank-denied no-ops are NOT counted as `applied` and NOT audited as
 *      such — they appear in `rejections` with reason RANK_DENIED_OR_NOOP.
 *
 * Plus the existing loop invariants:
 *   - oscillation duplicate
 *   - cost-ceiling exceeded
 *   - schema-invalid patch
 *   - max iterations
 *   - happy path apply
 */

import { applyDesignPatches } from "../apply-design-patches"
import {
    emptyCanonicalSpecs,
    upsertCanonicalSpec,
    upsertCanonicalPart,
    recomputeCostRollup,
    type CanonicalSpecs,
} from "../canonical-ledger"
import type { SpecPatch } from "../spec-patch-types"

// ─── Mock Supabase client ─────────────────────────────────────────────

interface MockState {
    project: {
        id: string
        canonical_specs: CanonicalSpecs
        canonical_specs_revision: number
        canonical_specs_digest: string | null
    } | null
    auditRows: Array<{
        project_id: string
        patch_payload: SpecPatch
        patch_hash: string
        source: string
        source_rank: number
        iteration: number
        cost_impact_gbp_pence: number | null
        applied: boolean
        applied_at: string | null
        rejection_reason: string | null
    }>
    /** Return value the next rpcApplyAtomic call will use to override default. */
    forceConflict?: boolean
    /** Track rpc call sequence for tests that need ordering visibility. */
    rpcCalls: Array<{ args: Record<string, unknown> }>
}

function makeMockSupabase(state: MockState) {
    return {
        from(table: string) {
            if (table === "cad_lab_projects") {
                return {
                    select(_cols: string) {
                        return {
                            eq(_col: string, _val: string) {
                                return {
                                    async single() {
                                        if (!state.project) {
                                            return { data: null, error: { message: "PROJECT_NOT_FOUND" } }
                                        }
                                        return {
                                            data: {
                                                canonical_specs: state.project.canonical_specs,
                                                canonical_specs_revision: state.project.canonical_specs_revision,
                                            },
                                            error: null,
                                        }
                                    },
                                }
                            },
                        }
                    },
                }
            }
            if (table === "cad_lab_design_patches") {
                return {
                    select(_cols: string) {
                        return {
                            eq(_col1: string, _val1: string) {
                                return {
                                    eq(_col2: string, _val2: unknown) {
                                        return {
                                            async gte(_col3: string, _val3: string) {
                                                return {
                                                    data: state.auditRows
                                                        .filter((r) => r.applied)
                                                        .map((r) => ({ patch_hash: r.patch_hash })),
                                                    error: null,
                                                }
                                            },
                                        }
                                    },
                                }
                            },
                        }
                    },
                }
            }
            throw new Error(`unexpected table ${table}`)
        },
        async rpc(name: string, args: Record<string, unknown>) {
            state.rpcCalls.push({ args: { ...args } })
            if (name !== "apply_canonical_patch_atomic") {
                return { data: null, error: { message: `unexpected rpc ${name}` } }
            }
            const applied = args.p_applied as boolean
            const projectId = args.p_project_id as string

            // Rejection path — log row + return.
            if (!applied) {
                state.auditRows.push({
                    project_id: projectId,
                    patch_payload: args.p_patch_payload as SpecPatch,
                    patch_hash: args.p_patch_hash as string,
                    source: args.p_source as string,
                    source_rank: args.p_source_rank as number,
                    iteration: args.p_iteration as number,
                    cost_impact_gbp_pence: (args.p_cost_impact_pence as number | null) ?? null,
                    applied: false,
                    applied_at: null,
                    rejection_reason: args.p_rejection_reason as string,
                })
                return {
                    data: { outcome: "REJECTED_LOGGED", revision: args.p_expected_revision, digest: null },
                    error: null,
                }
            }

            // Applied path — simulate optimistic-lock match.
            if (state.forceConflict) {
                return {
                    data: { outcome: "OPTIMISTIC_LOCK_CONFLICT", revision: null, digest: null },
                    error: null,
                }
            }
            if (!state.project || state.project.id !== projectId) {
                return {
                    data: { outcome: "PROJECT_NOT_FOUND", revision: null, digest: null },
                    error: null,
                }
            }
            if (state.project.canonical_specs_revision !== (args.p_expected_revision as number)) {
                return {
                    data: { outcome: "OPTIMISTIC_LOCK_CONFLICT", revision: null, digest: null },
                    error: null,
                }
            }
            const newRevision = state.project.canonical_specs_revision + 1
            state.project.canonical_specs = args.p_new_specs as CanonicalSpecs
            state.project.canonical_specs_revision = newRevision
            state.project.canonical_specs_digest = args.p_new_digest as string

            state.auditRows.push({
                project_id: projectId,
                patch_payload: args.p_patch_payload as SpecPatch,
                patch_hash: args.p_patch_hash as string,
                source: args.p_source as string,
                source_rank: args.p_source_rank as number,
                iteration: args.p_iteration as number,
                cost_impact_gbp_pence: (args.p_cost_impact_pence as number | null) ?? null,
                applied: true,
                applied_at: new Date().toISOString(),
                rejection_reason: null,
            })

            return {
                data: { outcome: "APPLIED", revision: newRevision, digest: args.p_new_digest },
                error: null,
            }
        },
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function makeProject(specs: CanonicalSpecs = emptyCanonicalSpecs()): MockState {
    return {
        project: {
            id: "00000000-0000-0000-0000-000000000001",
            canonical_specs: specs,
            canonical_specs_revision: 0,
            canonical_specs_digest: null,
        },
        auditRows: [],
        rpcCalls: [],
    }
}

const VALID_REASON = "Sufficiently long reason text for Zod min(20)"

// ─── Bug #1 — audit row consistency ──────────────────────────────────

describe("apply-design-patches: audit-row atomicity (bug #1)", () => {
    it("audit row applied=true only persists after successful spec UPDATE", async () => {
        const state = makeProject()
        const supabase = makeMockSupabase(state)

        const patch: SpecPatch = {
            scope: "module_spec",
            op: "replace",
            moduleId: "PowerCabinet",
            specKey: "powerW",
            value: 2000,
            reason: VALID_REASON,
            source: "applied_review_patch",
        }

        const res = await applyDesignPatches(supabase, { projectId: state.project!.id, patches: [patch] })
        expect(res.ok).toBe(true)
        if (!res.ok) return

        // Spec landed.
        expect(state.project!.canonical_specs.modules.PowerCabinet.specs.powerW.value).toBe(2000)
        // Audit row is applied=true.
        const audit = state.auditRows.find((r) => r.applied)
        expect(audit).toBeDefined()
        expect(audit!.source_rank).toBe(90) // applied_review_patch rank, NOT hardcoded
        expect(audit!.rejection_reason).toBeNull()
    })

    it("audit row applied=false on optimistic-lock conflict — no spec mutation", async () => {
        const state = makeProject()
        state.forceConflict = true
        const supabase = makeMockSupabase(state)

        const patch: SpecPatch = {
            scope: "module_spec",
            op: "replace",
            moduleId: "PowerCabinet",
            specKey: "powerW",
            value: 2000,
            reason: VALID_REASON,
            source: "applied_review_patch",
        }

        const res = await applyDesignPatches(supabase, { projectId: state.project!.id, patches: [patch] })
        expect(res.ok).toBe(true)
        if (!res.ok) return
        // No applied audit rows because the RPC reported conflict.
        expect(state.auditRows.filter((r) => r.applied)).toHaveLength(0)
        expect(res.halt.reason).toBe("lock_conflict")
    })
})

// ─── Bug #3 — source_rank uses patch.source ──────────────────────────

describe("apply-design-patches: source_rank uses SOURCE_RANK[patch.source] (bug #3)", () => {
    it("supplier_matcher patch records source_rank=75, NOT 90", async () => {
        const state = makeProject()
        const supabase = makeMockSupabase(state)

        const patch: SpecPatch = {
            scope: "module_spec",
            op: "replace",
            moduleId: "M",
            specKey: "powerW",
            value: 1000,
            reason: VALID_REASON,
            source: "supplier_matcher",
        }
        await applyDesignPatches(supabase, { projectId: state.project!.id, patches: [patch] })
        const audit = state.auditRows.find((r) => r.applied)
        expect(audit?.source_rank).toBe(75)
    })

    it("sizing_solver patch records source_rank=80", async () => {
        const state = makeProject()
        const supabase = makeMockSupabase(state)

        const patch: SpecPatch = {
            scope: "module_spec",
            op: "replace",
            moduleId: "M",
            specKey: "powerW",
            value: 1000,
            reason: VALID_REASON,
            source: "sizing_solver",
        }
        await applyDesignPatches(supabase, { projectId: state.project!.id, patches: [patch] })
        const audit = state.auditRows.find((r) => r.applied)
        expect(audit?.source_rank).toBe(80)
    })
})

// ─── Bug #5 — unknown partId rejected ────────────────────────────────

describe("apply-design-patches: part_cost with unknown partId (bug #5)", () => {
    it("rejects part_cost referencing unknown partId — no phantom part created", async () => {
        const state = makeProject()
        const supabase = makeMockSupabase(state)

        const patch: SpecPatch = {
            scope: "part_cost",
            op: "replace",
            partId: "DOES-NOT-EXIST",
            value: 18000,
            reason: VALID_REASON,
            source: "applied_review_patch",
        }
        const res = await applyDesignPatches(supabase, { projectId: state.project!.id, patches: [patch] })
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.applied).toBe(0)
        expect(res.rejected).toBe(1)
        expect(res.rejections[0].reason).toMatch(/REJECTED_UNKNOWN_PART/)
        // No phantom part landed.
        expect(state.project!.canonical_specs.parts["DOES-NOT-EXIST"]).toBeUndefined()
        // Bom subtotal not inflated (still null/0).
        expect(state.project!.canonical_specs.cost?.bomSubtotalGbp ?? 0).toBe(0)
    })

    it("accepts part_cost on existing partId", async () => {
        let specs = emptyCanonicalSpecs()
        specs = upsertCanonicalPart(specs, {
            partId: "PC-001",
            moduleId: "PowerCabinet",
            partNumber: "PC-001",
            description: "Bespoke fabricated cabinet",
            qty: 1,
            isPurchased: false,
            unitCostGbp: 145000,
            source: "bom_generator",
        })
        specs = recomputeCostRollup(specs)
        const state = makeProject(specs)
        const supabase = makeMockSupabase(state)

        const patch: SpecPatch = {
            scope: "part_cost",
            op: "replace",
            partId: "PC-001",
            value: 18000,
            reason: VALID_REASON,
            source: "applied_review_patch",
        }
        const res = await applyDesignPatches(supabase, { projectId: state.project!.id, patches: [patch] })
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.applied).toBe(1)
        expect(state.project!.canonical_specs.parts["PC-001"].unitCostGbp?.value).toBe(18000)
    })
})

// ─── Bug #6 — rank-denied not counted as applied ────────────────────

describe("apply-design-patches: rank-denied no-op handling (bug #6)", () => {
    it("rank-denied module_spec patch is NOT counted as applied AND NOT audited as such", async () => {
        // Seed with applied_review_patch rank 90.
        let specs = emptyCanonicalSpecs()
        specs = upsertCanonicalSpec(specs, {
            moduleId: "M",
            key: "powerW",
            value: 1000,
            source: "applied_review_patch",
        })
        const state = makeProject(specs)
        const supabase = makeMockSupabase(state)

        // Try to overwrite with lower-rank source.
        const patch: SpecPatch = {
            scope: "module_spec",
            op: "replace",
            moduleId: "M",
            specKey: "powerW",
            value: 999,
            reason: VALID_REASON,
            source: "max_decomposition", // rank 50 < 90
        }
        const res = await applyDesignPatches(supabase, { projectId: state.project!.id, patches: [patch] })
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.applied).toBe(0)
        expect(res.rejected).toBe(1)
        expect(res.rejections[0].reason).toMatch(/RANK_DENIED_OR_NOOP/)
        // No applied audit row.
        expect(state.auditRows.filter((r) => r.applied)).toHaveLength(0)
        // A rejection audit row exists.
        expect(state.auditRows.filter((r) => !r.applied)).toHaveLength(1)
        // Spec value untouched.
        expect(state.project!.canonical_specs.modules.M.specs.powerW.value).toBe(1000)
    })
})

// ─── Loop guards ─────────────────────────────────────────────────────

describe("apply-design-patches: oscillation guard", () => {
    it("rejects a patch whose hash matches a recently-applied patch", async () => {
        const state = makeProject()
        // Pre-seed an applied audit row with the same hash that the patch
        // we're about to send will produce.
        const patch: SpecPatch = {
            scope: "module_spec",
            op: "replace",
            moduleId: "M",
            specKey: "powerW",
            value: 1000,
            reason: VALID_REASON,
            source: "applied_review_patch",
        }
        // patch hash = "module_spec:M:powerW=1000"
        state.auditRows.push({
            project_id: state.project!.id,
            patch_payload: patch,
            patch_hash: "module_spec:M:powerW=1000",
            source: "applied_review_patch",
            source_rank: 90,
            iteration: 0,
            cost_impact_gbp_pence: null,
            applied: true,
            applied_at: new Date().toISOString(),
            rejection_reason: null,
        })
        const supabase = makeMockSupabase(state)
        const res = await applyDesignPatches(supabase, { projectId: state.project!.id, patches: [patch] })
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.applied).toBe(0)
        expect(res.rejected).toBe(1)
        expect(res.rejections[0].reason).toBe("OSCILLATION_DUPLICATE_PATCH")
        expect(res.halt.reason).toBe("oscillation")
    })
})

describe("apply-design-patches: cost-ceiling guard", () => {
    it("rejects patches whose cumulative |delta| exceeds 200% of BOM (or £50k floor)", async () => {
        const state = makeProject()
        const supabase = makeMockSupabase(state)

        // Two patches each with £40k cost impact — sum £80k > £50k floor.
        const patches: SpecPatch[] = [
            {
                scope: "module_spec",
                op: "replace",
                moduleId: "M1",
                specKey: "powerW",
                value: 1000,
                reason: VALID_REASON,
                source: "applied_review_patch",
                costImpactGbpPence: 4_000_000,
            },
            {
                scope: "module_spec",
                op: "replace",
                moduleId: "M2",
                specKey: "powerW",
                value: 2000,
                reason: VALID_REASON,
                source: "applied_review_patch",
                costImpactGbpPence: 4_000_000,
            },
        ]
        const res = await applyDesignPatches(supabase, { projectId: state.project!.id, patches })
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.applied).toBe(1) // first lands; second rejected
        expect(res.rejections.some((r) => r.reason.startsWith("COST_CEILING"))).toBe(true)
    })
})

describe("apply-design-patches: max-iterations guard", () => {
    it("rejects every patch when iteration >= MAX_ITERATIONS (3)", async () => {
        const state = makeProject()
        const supabase = makeMockSupabase(state)
        const patch: SpecPatch = {
            scope: "module_spec",
            op: "replace",
            moduleId: "M",
            specKey: "powerW",
            value: 1000,
            reason: VALID_REASON,
            source: "applied_review_patch",
        }
        const res = await applyDesignPatches(supabase, {
            projectId: state.project!.id,
            patches: [patch],
            iteration: 3,
        })
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.applied).toBe(0)
        expect(res.halt.reason).toBe("max_iterations")
    })
})

describe("apply-design-patches: schema-invalid patch", () => {
    it("rejects a patch whose Zod parse fails", async () => {
        const state = makeProject()
        const supabase = makeMockSupabase(state)
        // value missing on a module_spec patch — Zod will reject.
        const patch = {
            scope: "module_spec",
            op: "replace",
            moduleId: "M",
            specKey: "powerW",
            // value missing
            reason: VALID_REASON,
            source: "applied_review_patch",
        } as unknown as SpecPatch
        const res = await applyDesignPatches(supabase, { projectId: state.project!.id, patches: [patch] })
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.applied).toBe(0)
        expect(res.rejected).toBe(1)
        expect(res.rejections[0].reason).toMatch(/SCHEMA_INVALID/)
    })
})

// ─── Happy path ──────────────────────────────────────────────────────

describe("apply-design-patches: happy path", () => {
    it("applies a Fang patch end-to-end with cost rollup", async () => {
        let specs = emptyCanonicalSpecs()
        specs = upsertCanonicalPart(specs, {
            partId: "CAB-001",
            moduleId: "PowerCabinet",
            partNumber: "CAB-001",
            description: "Bespoke fabricated cabinet",
            qty: 1,
            isPurchased: false,
            unitCostGbp: 145000,
            source: "bom_generator",
        })
        specs = recomputeCostRollup(specs)
        const state = makeProject(specs)
        const supabase = makeMockSupabase(state)

        const patch: SpecPatch = {
            scope: "part_cost",
            op: "replace",
            partId: "CAB-001",
            value: 18000,
            reason: "Rittal AX 1200x800x400 catalogue match — saves £127k vs bespoke.",
            source: "applied_review_patch",
            costImpactGbpPence: -12_700_000,
        }
        const res = await applyDesignPatches(supabase, { projectId: state.project!.id, patches: [patch] })
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.applied).toBe(1)
        expect(res.rejected).toBe(0)
        expect(res.halt.reason).toBe("applied")
        expect(state.project!.canonical_specs.parts["CAB-001"].unitCostGbp?.value).toBe(18000)
        expect(state.project!.canonical_specs.cost?.bomSubtotalGbp).toBe(18000)
    })
})
