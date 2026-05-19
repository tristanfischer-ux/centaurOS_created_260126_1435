"use server"

/**
 * @file run-bom-generator.ts — BOM generation pipeline orchestrator.
 *
 * @description The canonical entry point that runs BOM generation over a V2
 * project once Max has decomposed the modules. Every caller (BOM empty-state
 * CTA, auto-fire from Max's success path, future re-runs) funnels through
 * this action.
 *
 * Stage is `bom.generate`. Trigger is `manual`, `auto.max-complete`, or
 * `manual.rerun`.
 *
 * ──────────────────────────────────────────────────────────────────────
 * ARCHITECTURE (2026-04-22): DISTRIBUTED STAGE CHAIN
 * ──────────────────────────────────────────────────────────────────────
 *
 * The BOM generator no longer runs inside one lambda. On industrial projects
 * (BESS, HV switchgear, 40ft battery container) a skeleton of ~60-70 parts
 * plus batched expansion plus the merge/persist pass repeatedly exceeded
 * Vercel's 300s lambda cap, stranding the `pipeline_runs` row in
 * `status='running'` forever (no code ran to stamp it failed).
 *
 * The fix splits generation into chained stages in `bom.ts`:
 *
 *   runBomSkeletonStage   (~15s)  — Claude skeleton call + chunk into batches
 *   runBomBatchStage      (~60s)  — one batch of up to EXPAND_BATCH_SIZE parts;
 *                                   reschedules itself until queue empty
 *   runBomMergeStage      (~30s)  — merge skeleton + expansions, write parts +
 *                                   bom_lines, stamp pipeline_run done
 *
 * `runBomGenerator` seeds `cad_lab_projects.bom_generation_state`, inserts
 * the `pipeline_runs` row, schedules the skeleton stage via `after()`, and
 * returns immediately with `ok: true, runId`. `partCount` on the return type
 * is always 0 from the entry point — the UI polls `loadBomRunStatus` (which
 * reads the pipeline_runs row) and picks up the real count from
 * `output_ref.partCount` once the merge stage stamps it.
 *
 * Specialist attribution: specialist_id='cto' (Max). BOM generation is Max's
 * artefact; Fang's DFM review runs separately. If specialists-config.ts adds
 * a dedicated `bom-generator` id, swap SPECIALIST_ID below.
 *
 * Pipeline:
 *   1. withAuth → user + foundryId
 *   2. Load project via admin client, verify foundry ownership
 *   3. Precondition: project.modules must be non-empty (NO_MODULES otherwise)
 *   4. Pre-flight tier budget check via checkAILimit(foundryId)
 *   5. Idempotency + stall-recovery check on existing bom_generation_state
 *   6. startPipelineRun (specialist_id='cto', stage='bom.generate')
 *   7. Seed bom_generation_state with pipeline_run_id + started_at
 *   8. Schedule runBomSkeletonStage via after()
 *   9. Return { ok: true, runId, partCount: 0 }
 *
 * Error codes exposed to callers:
 *   - BUDGET_CAPPED          — tier AI budget exhausted
 *   - BUDGET_NOT_CHECKABLE   — foundry tier / usage lookup threw
 *   - PROJECT_NOT_FOUND      — id doesn't exist
 *   - PROJECT_FORBIDDEN      — project belongs to a different foundry
 *   - NO_MODULES             — Max hasn't decomposed yet
 *   - ALREADY_RUNNING        — fresh run refused; another chain in flight
 *   - INTERNAL               — unclassified throw
 *
 * @related
 *   - Stage runners:     src/actions/bom.ts (runBomSkeletonStage, runBomBatchStage, runBomMergeStage)
 *   - Sibling pattern:   src/actions/forge-v2-render-all-modules.ts
 *   - Pipeline wrappers: src/actions/pipeline-runs.ts
 *   - Migration:         supabase/migrations/20260422130000_cad_lab_bom_generation_state.sql
 *   - UI consumers:      src/app/(platform)/the-forge-v2/projects/[id]/bom/
 */


import {
    failPipelineRun,
    loadLatestRunForStage,
    startPipelineRun,
} from "@/actions/pipeline-runs"
import { sweepStalledRuns } from "@/actions/pipeline-runs-watchdog"

import { checkAILimit } from "@/lib/ai/limit-check"
import { extractStageSection, extractConstraintAnchors, compressReferenceDossier } from "@/lib/reference-dossier"
import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import type {
    CadLabModule,
} from "@/lib/cad-lab-types"
import type { BomGenerationState } from "@/actions/bom"

// ─── Public types ──────────────────────────────────────────────────────

export type BomRunStatusChip =
    | "not-started"
    | "queued"
    | "running"
    | "done"
    | "failed"
    | "cancelled"

export interface RunBomGeneratorResult {
    ok: true
    runId: string
    /**
     * Always 0 at start — BOM generation is now asynchronous. The UI polls
     * `loadBomRunStatus` for the real count once `runBomMergeStage` stamps
     * `pipeline_runs.output_ref.partCount`.
     */
    partCount: number
}

export interface RunBomGeneratorError {
    ok: false
    error: string
    errorCode?: string
    runId?: string
}

export type RunBomGeneratorReturn =
    | RunBomGeneratorResult
    | RunBomGeneratorError

export interface LoadBomRunStatusResult {
    status: BomRunStatusChip
    startedAt?: string | null
    finishedAt?: string | null
    errorMessage?: string | null
    errorCode?: string | null
    partCount?: number | null
}

// ─── Constants ─────────────────────────────────────────────────────────

const SPECIALIST_ID = "cto"
const STAGE = "bom.generate"

/**
 * Idempotency window. Matches `forge-v2-render-all-modules.ts`:
 * `bom_generation_state.finished_at === null` with a recent `started_at`
 * means another chain is legitimately in flight; older than this we treat
 * it as a stalled run (Vercel container died mid-chain) and sweep so the
 * founder's Retry actually restarts things. Covers Vercel's 300s cap
 * three times over — a healthy chain finishes well inside 15 minutes.
 */
const STALL_THRESHOLD_MS = 15 * 60 * 1000

// ─── runBomGenerator ───────────────────────────────────────────────────

/**
 * Kicks off the distributed BOM generation chain. Returns immediately after
 * seeding `bom_generation_state` + `pipeline_runs` and scheduling the
 * skeleton stage via `after()`. The stage chain drives itself to completion.
 */
export async function runBomGenerator(
    projectId: string,
    trigger: "manual" | "auto.max-complete" | "manual.rerun",
): Promise<RunBomGeneratorReturn> {
    return withAuth<RunBomGeneratorReturn>(async ({ user, foundryId }) => {
        return runBomGeneratorInternal(projectId, foundryId, user.id, trigger)
    })
}

/**
 * Background entry point — used by Max's after() chain (post-response,
 * cookies gone, withAuth would fail). Caller MUST have already resolved
 * foundryId from the authenticated context before scheduling.
 *
 * This is the fix for #90 (auto-fire after() can't read cookies). Every
 * cross-stage handoff must use a *Background variant that plumbs foundryId
 * explicitly instead of relying on withAuth.
 */
export async function runBomGeneratorBackground(
    projectId: string,
    foundryId: string,
    userId: string | null,
    trigger: "auto.max-complete" | "manual.rerun" = "auto.max-complete",
): Promise<RunBomGeneratorReturn> {
    return runBomGeneratorInternal(projectId, foundryId, userId, trigger)
}

async function runBomGeneratorInternal(
    projectId: string,
    foundryId: string,
    userId: string | null,
    trigger: "manual" | "auto.max-complete" | "manual.rerun",
): Promise<RunBomGeneratorReturn> {
    {
        const admin = createAdminClient()

        // 1. Load + verify project (ownership check via admin; RLS would also
        //    enforce this but we want explicit codes back to the caller).
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select(
                "id, foundry_id, subject, modules, bom_generation_state, reference_dossier",
            )
            .eq("id", projectId)
            .maybeSingle()

        if (projectErr) {
            return {
                ok: false,
                error: "Couldn't load project",
                errorCode: "INTERNAL",
            }
        }
        if (!project) {
            return {
                ok: false,
                error: "Project not found",
                errorCode: "PROJECT_NOT_FOUND",
            }
        }
        if (project.foundry_id !== foundryId) {
            // SECURITY: don't leak other-foundry project existence.
            return {
                ok: false,
                error: "Project not found",
                errorCode: "PROJECT_FORBIDDEN",
            }
        }

        // Prepare Stage 0 reference dossier context for BOM generation.
        // The stages (runBomSkeletonStage, runBomBatchStage) load their own
        // project data via loadBomGenerationState, which also fetches
        // reference_dossier and computes the context. This computation here
        // is available for any future direct BOM function calls from this
        // orchestrator.
        const bomDossierContext = (() => {
          const raw = (project as unknown as { reference_dossier?: unknown }).reference_dossier
          if (typeof raw !== "string" || raw.length === 0) return undefined
          const stageSection = extractStageSection(raw, "bom")
          const anchors = extractConstraintAnchors(raw)
          if (stageSection && anchors) return `${stageSection}\n\n${anchors}`
          if (stageSection) return stageSection
          return compressReferenceDossier(raw)
        })()
        if (bomDossierContext) {
          console.info(
            `[run-bom-generator] reference dossier context prepared (${bomDossierContext.length} chars)`,
          )
        }

        // 2. Precondition: need Max's modules.
        const modulesRaw = project.modules as unknown
        const modules = (Array.isArray(modulesRaw)
            ? modulesRaw
            : []) as CadLabModule[]
        if (modules.length === 0) {
            return {
                ok: false,
                error:
                    "This project hasn't been decomposed yet — run Max's module decomposition first.",
                errorCode: "NO_MODULES",
            }
        }

        // 3. Pre-flight tier budget check. Kept BEFORE state seeding so a
        //    BUDGET_CAPPED refusal doesn't leave a half-baked state + orphan
        //    pipeline_runs row behind.
        try {
            const gate = await checkAILimit(foundryId)
            if (!gate.allowed) {
                return {
                    ok: false,
                    error:
                        gate.message ??
                        "AI usage limit reached for this billing period.",
                    errorCode: "BUDGET_CAPPED",
                }
            }
        } catch (err) {
            console.error(
                "[run-bom-generator] checkAILimit threw:",
                err instanceof Error ? err.message : err,
            )
            return {
                ok: false,
                error:
                    "Couldn't verify your AI usage budget — try again in a moment.",
                errorCode: "BUDGET_NOT_CHECKABLE",
            }
        }

        // 4. Idempotency + stall recovery. Mirrors the pattern in
        //    `startRenderAllRemainingModuleImages`. If bom_generation_state
        //    is non-null with finished_at=null AND started_at is within the
        //    stall window, a chain is legitimately in flight — reject.
        //    Older than the window: treat as stalled (Vercel container
        //    died mid-chain), stamp the old state finished, sweep stale
        //    pipeline_runs, and fall through to seed fresh.
        const existingRaw = (project as unknown as {
            bom_generation_state?: unknown
        }).bom_generation_state
        const existingState = (existingRaw ?? null) as BomGenerationState | null
        if (existingState && existingState.finished_at === null) {
            const startedMs = Date.parse(existingState.started_at)
            const stalled =
                !Number.isNaN(startedMs) &&
                Date.now() - startedMs > STALL_THRESHOLD_MS
            if (!stalled) {
                return {
                    ok: false,
                    error:
                        "BOM generation is already running on this project.",
                    errorCode: "ALREADY_RUNNING",
                    runId: existingState.pipeline_run_id ?? undefined,
                }
            }
            console.warn(
                `[run-bom-generator] stalled bom_generation_state for ${projectId} ` +
                    `(started ${existingState.started_at}). Auto-recovering.`,
            )
            // Stamp old state finished (for audit) + sweep stale runs (flips
            // any hung pipeline_runs row to 'failed' so the UI stops lying).
            const recovered: BomGenerationState = {
                ...existingState,
                finished_at: new Date().toISOString(),
                error:
                    existingState.error ??
                    `Chain stalled after ${(Date.now() - startedMs) / 1000}s; auto-recovered.`,
            }
            await admin
                .from("cad_lab_projects")
                .update({
                    bom_generation_state: recovered,
                } as unknown as never)
                .eq("id", projectId)
            await sweepStalledRuns(projectId).catch(() => {})
        }

        // 5. Also sweep any dangling running row for this stage that isn't
        //    tied to state (belt + braces — handles pre-distributed legacy
        //    runs that hung before the schema change).
        await sweepStalledRuns(projectId).catch(() => {})

        // 5b. Pre-run cleanup: delete skeleton/stub parts from previous
        //     failed expansions. These are parts with null material, null
        //     cost, or placeholder provenance that tank BOM quality scores.
        //     Council diagnosis (6/6 consensus 2026-05-01): stale skeleton
        //     parts from pre-quality-gate runs bypass the new gate because
        //     they're already in the DB. Cleaning before re-run ensures the
        //     quality gate evaluates only fresh expansion output.
        const { count: deletedSkeletons } = await admin
            .from("parts")
            .delete({ count: "exact" })
            .eq("cad_lab_project_id", projectId)
            .or(
                "material.is.null,material.eq.,estimated_unit_cost_gbp.is.null,cost_provenance.eq.todo",
            )
        if (deletedSkeletons && deletedSkeletons > 0) {
            console.info(
                `[run-bom-generator] pre-run cleanup: deleted ${deletedSkeletons} skeleton/stub parts for ${projectId}`,
            )
        }

        // 6. Start pipeline_run. Once this returns, every exit path MUST
        //    either complete or fail it.
        let runId: string
        try {
            const started = await startPipelineRun({
                foundry_id: foundryId,
                project_id: projectId,
                specialist_id: SPECIALIST_ID,
                stage: STAGE,
                trigger,
                triggered_by: userId ?? undefined,
                model_provider: "deepseek",
                input_ref: {
                    source: "modules",
                    moduleCount: modules.length,
                    totalKeyParts: modules.reduce(
                        (acc, m) => acc + (m.keyParts?.length ?? 0),
                        0,
                    ),
                    orchestration: "distributed",
                },
            })
            runId = started.runId
        } catch (err) {
            console.error(
                "[run-bom-generator] startPipelineRun threw:",
                err instanceof Error ? err.message : err,
            )
            return {
                ok: false,
                error: "Couldn't start the pipeline run.",
                errorCode: "INTERNAL",
            }
        }

        // 7. Seed bom_generation_state. The skeleton stage will fill
        //    skeleton_parts + pending_batch_ids; we only record the
        //    lifecycle markers here.
        const initialState: BomGenerationState = {
            started_at: new Date().toISOString(),
            finished_at: null,
            skeleton_parts: null,
            skeleton_bom_lines: null,
            expansions: {},
            pending_batch_ids: [],
            failed_batch_count: 0,
            error: null,
            pipeline_run_id: runId,
        }
        const { error: seedErr } = await admin
            .from("cad_lab_projects")
            .update({
                bom_generation_state: initialState,
            } as unknown as never)
            .eq("id", projectId)
            .eq("foundry_id", foundryId)
        if (seedErr) {
            console.error(
                "[run-bom-generator] seed state failed:",
                seedErr.message,
            )
            // Fail the pipeline_run we already inserted so the UI chip
            // doesn't lie.
            try {
                await failPipelineRun(
                    runId,
                    "INTERNAL",
                    "Failed to seed bom_generation_state.",
                )
            } catch (failErr) {
                console.error(
                    "[run-bom-generator] failPipelineRun after seed error threw:",
                    failErr instanceof Error ? failErr.message : failErr,
                )
            }
            return {
                ok: false,
                error: "Couldn't start BOM generation.",
                errorCode: "INTERNAL",
                runId,
            }
        }

        return {
            ok: true,
            runId,
            partCount: 0,
        }
    }
}

// ─── loadBomRunStatus ──────────────────────────────────────────────────

/**
 * Reads the latest pipeline_runs row for (project, 'cto', 'bom.generate')
 * and returns a chip-friendly shape. Unchanged from the monolithic
 * implementation — the UI still polls this and picks up `partCount` from
 * `output_ref` once the merge stage stamps it.
 */
export async function loadBomRunStatus(
    projectId: string,
): Promise<LoadBomRunStatusResult> {
    return withAuth<LoadBomRunStatusResult>(async ({ foundryId }) => {
        const admin = createAdminClient()
        const { data: project } = await admin
            .from("cad_lab_projects")
            .select("foundry_id")
            .eq("id", projectId)
            .maybeSingle()
        if (!project || project.foundry_id !== foundryId) {
            return { status: "not-started" }
        }

        // Watchdog: flip any stale 'running' row to 'failed' before reading.
        await sweepStalledRuns(projectId).catch(() => {})

        const row = await loadLatestRunForStage(projectId, SPECIALIST_ID, STAGE)
        if (!row) {
            return { status: "not-started" }
        }

        const status = mapDbStatusToChip(row.status)
        const partCount =
            row.output_ref &&
            typeof row.output_ref === "object" &&
            row.output_ref !== null
                ? ((row.output_ref as { partCount?: unknown }).partCount as
                      | number
                      | undefined)
                : undefined
        return {
            status,
            startedAt: row.started_at,
            finishedAt: row.finished_at,
            errorCode: row.error_code,
            errorMessage: row.error_message,
            partCount: typeof partCount === "number" ? partCount : null,
        }
    })
}

// ─── Internals ─────────────────────────────────────────────────────────

function mapDbStatusToChip(dbStatus: string): BomRunStatusChip {
    switch (dbStatus) {
        case "queued":
            return "queued"
        case "running":
            return "running"
        case "done":
            return "done"
        case "failed":
            return "failed"
        case "cancelled":
            return "cancelled"
        default:
            return "not-started"
    }
}
