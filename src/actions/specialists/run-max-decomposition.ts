"use server"

/**
 * @file run-max-decomposition.ts — Max (CTO) module decomposition orchestrator.
 *
 * @description The canonical entry point that runs Max over a V2 project to
 * produce the module decomposition. Every caller (Modules empty-state CTA,
 * brief-lock auto-trigger, future re-runs) funnels through this action so
 * the pipeline_runs row is always written atomically alongside the mutation.
 *
 * Stage is `brief.decompose`. Trigger is either `manual` (founder clicked
 * the "Decompose with Max" button) or `auto.brief-lock` (brief lock just
 * landed and we're kicking off the first stage of the chain). The wrapper
 * is identical — only the trigger string changes.
 *
 * Pipeline:
 *   1. withAuth → user + foundryId
 *   2. Load project, verify ownership, check preconditions (research.report)
 *   3. Pre-flight tier budget check via checkAILimit(foundryId)
 *   4. startPipelineRun (specialist_id='cto', stage='brief.decompose')
 *   5. skeletonDecompose → skeleton modules
 *   6. expandModuleDetail × N with concurrency cap of 3 (Vercel 300s safety)
 *   7. Merge skeleton + expansions into CadLabModule[]
 *   8. saveCadLabModules
 *   9. completePipelineRun with token totals + output_ref
 *
 * Concurrency cap: expandModuleDetail typically takes 15-30s per module. At
 * concurrency 3, a 9-module decomposition wall-clocks around 45-90s plus
 * ~30s skeleton = well under Vercel's 300s cap. Running unbounded fan-out
 * would race the timeout for anything ≥ 12 modules.
 *
 * Token / cost tracking: both inner actions return tokensIn/tokensOut. We
 * sum them into the pipeline_run row. cost_gbp_pence stays null for now —
 * computing it needs the model's GBP-per-token price table, which today
 * lives in src/lib/ai/usage-tracking.ts and is foundry-tier aware. A
 * future pass wires that in; null is honest, fabricated numbers aren't.
 *
 * Error codes exposed to callers:
 *   - BUDGET_CAPPED    — tier AI budget exhausted; inner check refused
 *   - BUDGET_NOT_CHECKABLE — foundry tier / usage lookup threw
 *   - MISSING_BRIEF    — project has no research.report to decompose from
 *   - PROJECT_NOT_FOUND | PROJECT_FORBIDDEN — ownership guard failed
 *   - SKELETON_FAILED  — inner skeletonDecompose returned success=false
 *   - EXPAND_ALL_FAILED — every module expansion failed (catastrophic)
 *   - SAVE_FAILED      — saveCadLabModules returned an error
 *   - INTERNAL         — unclassified throw
 *
 * @related
 *   - Pre-read arch doc: /tmp/forge-v2-pipeline-arch/PIPELINE-ARCHITECTURE.md
 *   - Inner engines: src/actions/cad-lab.ts (skeletonDecompose, expandModuleDetail)
 *   - Pipeline wrappers: src/actions/pipeline-runs.ts
 *   - UI consumers: src/app/(platform)/the-forge-v2/projects/[id]/modules/
 *                   src/app/(platform)/the-forge-v2/projects/[id]/page.tsx
 */

import { skeletonDecompose, expandModuleDetail } from "@/actions/cad-lab"
import { saveCadLabModules } from "@/actions/cad-lab-projects"
import {
    completePipelineRun,
    failPipelineRun,
    loadLatestRunForStage,
    startPipelineRun,
} from "@/actions/pipeline-runs"
import { sweepStalledRuns } from "@/actions/pipeline-runs-watchdog"
import { after } from "next/server"

import { checkAILimit } from "@/lib/ai/limit-check"
import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import type {
    CadLabModule,
    SkeletonModule,
} from "@/lib/cad-lab-types"

// ─── Public types ──────────────────────────────────────────────────────

export type MaxRunStatusChip =
    | "not-started"
    | "queued"
    | "running"
    | "done"
    | "failed"
    | "cancelled"

export interface RunMaxDecompositionResult {
    ok: true
    runId: string
    moduleCount: number
}

export interface RunMaxDecompositionError {
    ok: false
    error: string
    errorCode?: string
    runId?: string
}

export type RunMaxDecompositionReturn =
    | RunMaxDecompositionResult
    | RunMaxDecompositionError

export interface LoadMaxRunStatusResult {
    status: MaxRunStatusChip
    startedAt?: string | null
    finishedAt?: string | null
    errorMessage?: string | null
    errorCode?: string | null
    moduleCount?: number | null
}

// ─── Constants ─────────────────────────────────────────────────────────

const SPECIALIST_ID = "cto"
const STAGE = "brief.decompose"
/** Max number of expandModuleDetail calls running concurrently. See header. */
const EXPAND_CONCURRENCY = 3

// ─── runMaxDecomposition ───────────────────────────────────────────────

/**
 * Runs Max over the given project, producing the module decomposition and
 * writing it to cad_lab_projects.modules. Wraps the call in a pipeline_runs
 * row for observability.
 *
 * @param projectId - V2 project UUID
 * @param trigger   - Why this run was kicked off (routed to pipeline_runs.trigger)
 */
export async function runMaxDecomposition(
    projectId: string,
    trigger: "manual" | "auto.brief-lock",
): Promise<RunMaxDecompositionReturn> {
    return withAuth<RunMaxDecompositionReturn>(async ({ user, foundryId }) => {
        return runMaxDecompositionInternal(
            projectId,
            foundryId,
            user.id,
            trigger,
        )
    })
}

/**
 * Background entry — called from `after()` post-response contexts (e.g. the
 * autopilot chain) where cookies are gone and `withAuth` would fail. Caller
 * MUST have already resolved foundryId from an authenticated request.
 *
 * This is the fix for #90. Every chained post-response handoff calls a
 * *Background variant that plumbs foundryId + userId explicitly.
 */
export async function runMaxDecompositionBackground(
    projectId: string,
    foundryId: string,
    userId: string | null,
    trigger: "auto.brief-lock" = "auto.brief-lock",
): Promise<RunMaxDecompositionReturn> {
    return runMaxDecompositionInternal(projectId, foundryId, userId, trigger)
}

async function runMaxDecompositionInternal(
    projectId: string,
    foundryId: string,
    userId: string | null,
    trigger: "manual" | "auto.brief-lock",
): Promise<RunMaxDecompositionReturn> {
    // Shim: expose `user.id` under the original closure name so the body
    // below continues to work. We only need `user.id` for triggered_by.
    // GOTCHA: triggered_by has an FK to auth.users, so passing a zero UUID
    // when the caller didn't supply a userId blows up with a FK violation
    // and kills the whole pipeline_run insert — observed 2026-04-23 on HAPS
    // autopilot run. triggered_by is nullable on the column, so pass null
    // straight through for system-fired runs (autopilot after() chain).
    const user: { id: string | null } = { id: userId }
    // Foundry is already known — skip the withAuth wrapper.
    void foundryId
        const admin = createAdminClient()
        // When autopilot fires this via background (userId null), skeleton
        // + expand still need a trusted identity to skip their internal
        // cookies-backed auth. Fall back to the foundry owner — that's the
        // legitimate "system user" for this tenant. Observed 2026-04-24 on
        // BESS run 6 where Max still failed "Unauthorized" because
        // trustedUserId was null and skeletonDecompose took the cookie path.
        if (!user.id) {
            const { data: foundry } = await admin
                .from("foundries")
                .select("owner_id")
                .eq("id", foundryId)
                .maybeSingle()
            if (foundry?.owner_id) user.id = foundry.owner_id
        }
        // 1. Load + verify project (foundry scope check via admin client —
        //    we can't use the user-scoped client because RLS on cad_lab_projects
        //    is keyed on foundry membership. The withAuth wrapper has already
        //    confirmed the caller is in foundryId; now confirm THIS project
        //    is in the same foundry, so we never accidentally decompose
        //    another tenant's project on behalf of this caller.)
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, subject, model_id, research")
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
            // SECURITY: don't leak the existence of other-foundry projects
            return {
                ok: false,
                error: "Project not found",
                errorCode: "PROJECT_FORBIDDEN",
            }
        }

        // 2. Precondition: Max needs research.report to decompose.
        //    skeletonDecompose accepts a description + researchReport and
        //    produces garbage (or fails) if research hasn't been run yet.
        //    Expose this honestly so the UI can route the founder to
        //    research first rather than showing a silent empty result.
        const research = (project.research ?? null) as
            | { report?: unknown; designBrief?: unknown }
            | null
        const report =
            research && typeof research.report === "string" ? research.report : ""
        const description =
            typeof project.subject === "string" ? project.subject.trim() : ""

        if (!description) {
            return {
                ok: false,
                error:
                    "This project doesn't have a subject yet — Max needs the founder's concept first.",
                errorCode: "MISSING_BRIEF",
            }
        }

        if (!report || report.trim().length < 200) {
            return {
                ok: false,
                error:
                    "Research hasn't been gathered for this project yet. Run research before decomposing with Max.",
                errorCode: "MISSING_BRIEF",
            }
        }

        // 3. Pre-flight tier budget check.
        //    The inner skeletonDecompose / expandModuleDetail actions ALSO
        //    call enforceCadLabLimit(user.id, …) which re-checks this. That
        //    duplicate check is the source of truth for per-run enforcement;
        //    this outer one exists so the orchestrator can return a clean
        //    BUDGET_CAPPED errorCode before we've written a pipeline_runs
        //    row that would otherwise be immediately marked 'failed'.
        let budgetOk = true
        let budgetMessage: string | null = null
        try {
            const gate = await checkAILimit(foundryId)
            if (!gate.allowed) {
                budgetOk = false
                budgetMessage =
                    gate.message ?? "AI usage limit reached for this billing period."
            }
        } catch (err) {
            // Fail closed with a distinct errorCode so we don't silently let a
            // bad lookup turn into uncharged spend.
            console.error(
                "[run-max-decomposition] checkAILimit threw:",
                err instanceof Error ? err.message : err,
            )
            return {
                ok: false,
                error:
                    "Couldn't verify your AI usage budget — try again in a moment.",
                errorCode: "BUDGET_NOT_CHECKABLE",
            }
        }

        if (!budgetOk) {
            return {
                ok: false,
                error: budgetMessage ?? "AI usage limit reached.",
                errorCode: "BUDGET_CAPPED",
            }
        }

        // 4. Start pipeline_run. Once this returns, every exit path MUST
        //    either complete or fail the run — otherwise it hangs in
        //    'running' forever and the UI chip lies.
        let runId: string
        try {
            const started = await startPipelineRun({
                foundry_id: foundryId,
                project_id: projectId,
                specialist_id: SPECIALIST_ID,
                stage: STAGE,
                trigger,
                triggered_by: user.id ?? undefined,
                model_provider: "anthropic",
                input_ref: { source: "subject+research", charCount: report.length },
            })
            runId = started.runId
        } catch (err) {
            console.error(
                "[run-max-decomposition] startPipelineRun threw:",
                err instanceof Error ? err.message : err,
            )
            return {
                ok: false,
                error: "Couldn't start the pipeline run.",
                errorCode: "INTERNAL",
            }
        }

        // From here on: wrap everything in a try/catch that falls through to
        // failPipelineRun so the chip reflects reality even if something
        // unexpected throws.
        try {
            // 5. Skeleton decomposition — fast, single Claude call, produces
            //    id/name/purpose/inputs/outputs for every module.
            const modelId = (project.model_id || "claude-opus-4-7") as Parameters<
                typeof skeletonDecompose
            >[2]
            const skeletonResult = await skeletonDecompose(
                description,
                report,
                modelId,
                undefined, // domainHint
                undefined, // documentContext
                user.id ?? undefined, // trustedUserId — use resolved user.id (owner-fallback applied above) not raw userId param
            )

            if (!skeletonResult.success || skeletonResult.modules.length === 0) {
                await failPipelineRun(
                    runId,
                    "SKELETON_FAILED",
                    skeletonResult.error ||
                        "Skeleton decomposition returned no modules.",
                    {
                        input_tokens: skeletonResult.tokensIn,
                        output_tokens: skeletonResult.tokensOut,
                        model_id:
                            typeof skeletonResult.modelUsed === "string"
                                ? skeletonResult.modelUsed
                                : null,
                    },
                )
                return {
                    ok: false,
                    runId,
                    error: skeletonResult.error || "Skeleton decomposition failed.",
                    errorCode: "SKELETON_FAILED",
                }
            }

            const skeletonModules = skeletonResult.modules
            let tokensIn = skeletonResult.tokensIn
            let tokensOut = skeletonResult.tokensOut

            // 6. Fan out per-module expansions with a concurrency cap.
            //    We accept partial success here — if 8 of 9 expand and 1
            //    fails, we still save the 8 and mark the run 'done'. Only
            //    if EVERY expansion fails do we roll back to failed.
            const expansions = await runWithConcurrency(
                skeletonModules,
                EXPAND_CONCURRENCY,
                async (sk) =>
                    expandModuleDetail(
                        skeletonModules,
                        sk.id,
                        description,
                        report,
                        modelId,
                        undefined, // domainHint
                        undefined, // consistencyBrief
                        undefined, // documentContext
                        user.id ?? undefined, // trustedUserId — use resolved user.id (owner-fallback applied above)
                    ),
            )

            let successfulExpansions = 0
            for (const exp of expansions) {
                tokensIn += exp.tokensIn
                tokensOut += exp.tokensOut
                if (exp.success) successfulExpansions += 1
            }

            if (successfulExpansions === 0) {
                const firstError = expansions.find((e) => !e.success)?.error
                await failPipelineRun(
                    runId,
                    "EXPAND_ALL_FAILED",
                    firstError ||
                        "Every module expansion failed — decomposition not saved.",
                    {
                        input_tokens: tokensIn,
                        output_tokens: tokensOut,
                    },
                )
                return {
                    ok: false,
                    runId,
                    error:
                        "Max couldn't expand any modules — please try again in a moment.",
                    errorCode: "EXPAND_ALL_FAILED",
                }
            }

            // 7. Merge skeleton + expansions → CadLabModule[].
            const expansionById = new Map(
                expansions
                    .filter((e) => e.success && e.expansion)
                    .map((e) => [e.moduleId, e.expansion!]),
            )
            const modules: CadLabModule[] = skeletonModules.map((sk) =>
                buildCadLabModule(sk, expansionById.get(sk.id)),
            )

            // 8. Persist modules. saveCadLabModules takes a JSON string (see
            //    its own docstring — avoids React Flight depth blowup).
            const saveResult = await saveCadLabModules(
                projectId,
                JSON.stringify(modules),
            )
            if ("error" in saveResult) {
                await failPipelineRun(runId, "SAVE_FAILED", saveResult.error, {
                    input_tokens: tokensIn,
                    output_tokens: tokensOut,
                })
                return {
                    ok: false,
                    runId,
                    error: saveResult.error,
                    errorCode: "SAVE_FAILED",
                }
            }

            // 9. Done. Record final token counts + output pointer. cost_gbp_pence
            //    stays null — see file header for why.
            await completePipelineRun(runId, {
                input_tokens: tokensIn,
                output_tokens: tokensOut,
                model_id:
                    typeof skeletonResult.modelUsed === "string"
                        ? skeletonResult.modelUsed
                        : null,
                output_ref: {
                    table: "cad_lab_projects",
                    column: "modules",
                    moduleCount: modules.length,
                    expansionsOk: successfulExpansions,
                    expansionsTotal: skeletonModules.length,
                },
            })

            // Wave 1c: auto-fire Fang sizing + BOM generator on Max success.
            //
            // Order: sizing → BOM. Sizing produces dimension_sheet which Fang
            // review + the image prompt builders consume; BOM's part
            // envelopes will eventually cross-check against it too. Both
            // stages are independent of each other so we fire both in the
            // same after() but sequence sizing FIRST because it writes a
            // read-before-write row that BOM's dimension-aware part check
            // (future) will read.
            //
            // Must use after() (not plain `void`) so Vercel keeps the container
            // alive past this server action's Promise resolution — otherwise
            // downstream pipeline_runs rows write 'running' and the container
            // is torn down mid-generation, leaving rows stuck until the 6-min
            // watchdog sweeps them. Same pattern as brief-lock → Max.
            //
            // GOTCHA (#90): the `after()` callback runs AFTER the HTTP response
            // has been sent to the client, which means cookies are gone. Any
            // action invoked from inside after() that calls `withAuth` will
            // fail. We plumb foundryId explicitly into `*Background` variants
            // that re-resolve the tenant via the admin client instead. Every
            // chained stage MUST use this pattern.
            //
            // Dynamic import avoids a "use server" module-init cycle between
            // run-max-decomposition and its successors (which also import
            // from this file indirectly via shared types).
            const capturedFoundryId = foundryId
            const capturedProjectId = projectId
            const capturedUserId = user.id
            after(async () => {
                // (1) Sizing first — deterministic solver, single DB write,
                //     finishes in ~100ms. Safe to await before BOM.
                try {
                    const { runFangSizingBackground } = await import(
                        "@/actions/specialists/run-fang-sizing"
                    )
                    await runFangSizingBackground(
                        capturedProjectId,
                        capturedFoundryId,
                        "auto.max-complete",
                    )
                } catch (err) {
                    console.error(
                        "[run-max-decomposition] Fang sizing auto-fire failed:",
                        err instanceof Error ? err.message : err,
                    )
                }

                // (2) BOM generator — distributed, writes its own pipeline_run
                //     + schedules subsequent stages via internal after() calls.
                //     Use the Background variant which takes foundryId + userId
                //     explicitly instead of reading cookies (#90 fix).
                try {
                    const { runBomGeneratorBackground } = await import(
                        "@/actions/specialists/run-bom-generator"
                    )
                    await runBomGeneratorBackground(
                        capturedProjectId,
                        capturedFoundryId,
                        capturedUserId,
                        "auto.max-complete",
                    )
                } catch (err) {
                    console.error(
                        "[run-max-decomposition] BOM auto-fire failed:",
                        err instanceof Error ? err.message : err,
                    )
                }
            })

            return {
                ok: true,
                runId,
                moduleCount: modules.length,
            }
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Unknown decomposition error"
            console.error("[run-max-decomposition] unexpected throw:", message)
            try {
                await failPipelineRun(runId, "INTERNAL", message)
            } catch (failErr) {
                console.error(
                    "[run-max-decomposition] failPipelineRun also threw:",
                    failErr instanceof Error ? failErr.message : failErr,
                )
            }
            return {
                ok: false,
                runId,
                error: message,
                errorCode: "INTERNAL",
            }
        }
}

// ─── loadMaxRunStatus ──────────────────────────────────────────────────

/**
 * Reads the latest pipeline_runs row for (project_id, specialist='cto',
 * stage='brief.decompose') and returns a chip-friendly shape. Used by the
 * Modules page loader and the Workspace page loader.
 *
 * When no row exists the chip shows "not-started". The orchestrator is
 * still safe to call from that state — it writes the first row atomically.
 */
export async function loadMaxRunStatus(
    projectId: string,
): Promise<LoadMaxRunStatusResult> {
    return withAuth<LoadMaxRunStatusResult>(async ({ foundryId }) => {
        // Ownership check — same rationale as runMaxDecomposition.
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
        // Prevents infinite-spinner UI when a run hit Vercel's 300s cap.
        // Errors swallowed — a failed sweep must never block the status read.
        await sweepStalledRuns(projectId).catch(() => {})

        const row = await loadLatestRunForStage(projectId, SPECIALIST_ID, STAGE)
        if (!row) {
            return { status: "not-started" }
        }

        const status = mapDbStatusToChip(row.status)
        const moduleCount =
            row.output_ref && typeof row.output_ref === "object" && row.output_ref !== null
                ? ((row.output_ref as { moduleCount?: unknown }).moduleCount as number | undefined)
                : undefined
        return {
            status,
            startedAt: row.started_at,
            finishedAt: row.finished_at,
            errorCode: row.error_code,
            errorMessage: row.error_message,
            moduleCount: typeof moduleCount === "number" ? moduleCount : null,
        }
    })
}

// ─── Internals ─────────────────────────────────────────────────────────

/** Merges a skeleton module with its expanded detail (if present).
 *
 * leadTimeSource: Max's expansion prompt returns a raw `leadWeeks: number` but
 * does NOT self-tag its provenance. Without a tag the UI helpers (`leadSourceLabel`
 * on the modules list page, `leadSourceCaption` on the module detail page) and
 * the PDF all render the number with no caption — founders see "14 wk lead"
 * and have no way to judge whether it's a supplier quote or a best-guess.
 *
 * Max IS the specialist and the number IS his estimate, so the honest tag is
 * `specialist-judgement` ("Specialist judgement" in the UI). If a supplier quote
 * or historical analogue later supersedes this, a downstream specialist (Chase
 * via RFQ wins, Sage via benchmark analogue) will overwrite the field. We do
 * NOT backfill pre-existing rows — legacy modules with `leadTimeSource: null`
 * continue to render the honest "Provenance: not yet declared" empty-state in
 * the PDF and nothing (caption hidden) on the list card. */
function buildCadLabModule(
    sk: SkeletonModule,
    expansion:
        | {
              keyParts: string[]
              leadWeeks: number
              estimatedMassKg?: number
              description: string
              whyItMatters: string
              failureModes: string[]
              unknowns: string[]
          }
        | undefined,
): CadLabModule {
    if (!expansion) {
        // Expansion failed for this module — keep the skeleton so the UI
        // can still render it, with honest empty details. leadWeeks=0 means
        // "no estimate" so we deliberately leave leadTimeSource unset —
        // there is no provenance to declare.
        return {
            id: sk.id,
            name: sk.name,
            purpose: sk.purpose,
            inputs: sk.inputs,
            outputs: sk.outputs,
            keyParts: [],
            leadWeeks: 0,
            description: "",
            whyItMatters: "",
            failureModes: [],
            unknowns: [],
            status: "pending",
            ...(sk.mirrorOf ? { mirrorOf: sk.mirrorOf } : {}),
        }
    }
    return {
        id: sk.id,
        name: sk.name,
        purpose: sk.purpose,
        inputs: sk.inputs,
        outputs: sk.outputs,
        keyParts: expansion.keyParts,
        leadWeeks: expansion.leadWeeks,
        leadTimeSource: "specialist-judgement",
        description: expansion.description,
        whyItMatters: expansion.whyItMatters,
        failureModes: expansion.failureModes,
        unknowns: expansion.unknowns,
        status: "pending",
        ...(typeof expansion.estimatedMassKg === "number"
            ? { estimatedMassKg: expansion.estimatedMassKg }
            : {}),
        ...(sk.mirrorOf ? { mirrorOf: sk.mirrorOf } : {}),
    }
}

/**
 * Runs an async mapper over an array with at most `limit` in flight at
 * once. Returns results in the same order as the input — failures are
 * represented by the awaited result of the mapper (so mapping callers
 * that return `{ success: false }` keep working the same way).
 */
async function runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results: R[] = new Array(items.length)
    let cursor = 0
    const workers: Array<Promise<void>> = []
    const workerCount = Math.max(1, Math.min(limit, items.length))

    async function runOne(): Promise<void> {
        while (true) {
            const idx = cursor++
            if (idx >= items.length) return
            try {
                results[idx] = await mapper(items[idx], idx)
            } catch (err) {
                // Surface as a rejected promise so the caller sees the throw
                // — expandModuleDetail itself never throws (it returns
                // { success: false, ... }), so this path is unexpected and
                // should NOT be silently swallowed.
                throw err instanceof Error
                    ? err
                    : new Error("Concurrent mapper threw non-Error value")
            }
        }
    }

    for (let i = 0; i < workerCount; i += 1) {
        workers.push(runOne())
    }
    await Promise.all(workers)
    return results
}

function mapDbStatusToChip(dbStatus: string): MaxRunStatusChip {
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
