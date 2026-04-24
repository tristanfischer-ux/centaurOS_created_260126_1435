"use server"

/**
 * @file run-finn-cost.ts — Finn (Finance Lead) cost estimate orchestrator.
 *
 * @description The canonical entry point that runs Finn over a V2 project to
 * produce per-module cost estimates. Every caller (Cost empty-state CTA,
 * future auto-trigger from BOM completion, manual re-runs) funnels through
 * this action so the pipeline_runs row is always written atomically alongside
 * the mutation.
 *
 * Stage is `cost.estimate`. Trigger is either `manual` (founder clicked
 * "Estimate with Finn" on the Cost page) or `auto.bom-complete` (reserved —
 * not yet wired; BOM orchestrator owns its own action in a sibling file
 * during Wave 1c so we don't race it. Next wave wires the chain).
 *
 * Specialist attribution: `finance-lead` — matches `SpecialistId` union in
 * specialists-config.ts:53. Finn's modelTier is `deepseek` (the inner
 * `estimateModuleCostsAi` already hits DeepSeek directly).
 *
 * Pipeline:
 *   1. withAuth → user + foundryId
 *   2. Load project via admin client, verify foundry ownership
 *   3. Precondition: project.modules must be non-empty AND each module must
 *      carry keyParts[] — without a BOM seed there's nothing to cost.
 *   4. Pre-flight tier budget check via checkAILimit(foundryId)
 *   5. startPipelineRun (specialist_id='finance-lead', stage='cost.estimate')
 *   6. Call estimateModuleCostsAi — inner action wraps its own withAIGate
 *      (re-checks the limit) and returns `Record<moduleId, AiCostEstimate>`
 *   7. saveCadLabAiCostEstimates — persists the JSONB onto cad_lab_projects
 *   8. completePipelineRun with module_count + output_ref
 *
 * Token tracking: `estimateModuleCostsAi` does not currently surface token
 * counts to the caller (it logs them internally). We record
 * input_tokens/output_tokens as null rather than fabricate — the existing
 * `trackAIUsage` path inside `withAIGate` still enforces the monthly quota.
 * When the inner action is extended to return usage, wire it in here.
 *
 * Error codes exposed to callers:
 *   - BUDGET_CAPPED          — tier AI budget exhausted; outer check refused
 *   - BUDGET_NOT_CHECKABLE   — foundry tier / usage lookup threw
 *   - PROJECT_NOT_FOUND      — id doesn't exist
 *   - PROJECT_FORBIDDEN      — project belongs to a different foundry
 *   - NO_BOM                 — modules empty OR every module's keyParts[] is empty
 *   - ESTIMATE_FAILED        — inner estimateModuleCostsAi returned success=false
 *   - SAVE_FAILED            — saveCadLabAiCostEstimates returned an error
 *   - INTERNAL               — unclassified throw
 *
 * @related
 *   - Pre-read arch doc: /tmp/forge-v2-pipeline-arch/PIPELINE-ARCHITECTURE.md §1, §7
 *   - Sibling orchestrator: src/actions/specialists/run-max-decomposition.ts
 *                           src/actions/specialists/run-bom-generator.ts
 *   - Inner engine: src/actions/cad-lab-cost.ts (estimateModuleCostsAi)
 *   - Save helper: src/actions/cad-lab-projects.ts (saveCadLabAiCostEstimates)
 *   - Pipeline wrappers: src/actions/pipeline-runs.ts
 *   - UI consumers: src/app/(platform)/the-forge-v2/projects/[id]/cost/
 *                   src/app/(platform)/the-forge-v2/projects/[id]/page.tsx
 */

import { estimateModuleCostsAi } from "@/actions/cad-lab-cost"
import { saveCadLabAiCostEstimates } from "@/actions/cad-lab-projects"
import {
    completePipelineRun,
    failPipelineRun,
    loadLatestRunForStage,
    startPipelineRun,
} from "@/actions/pipeline-runs"
import { sweepStalledRuns } from "@/actions/pipeline-runs-watchdog"
import { checkAILimit } from "@/lib/ai/limit-check"
import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"

// ─── Public types ──────────────────────────────────────────────────────

export type FinnRunStatusChip =
    | "not-started"
    | "queued"
    | "running"
    | "done"
    | "failed"
    | "cancelled"

export interface RunFinnCostResult {
    ok: true
    runId: string
    moduleCount: number
}

export interface RunFinnCostError {
    ok: false
    error: string
    errorCode?: string
    runId?: string
}

export type RunFinnCostReturn = RunFinnCostResult | RunFinnCostError

export interface LoadFinnRunStatusResult {
    status: FinnRunStatusChip
    startedAt?: string | null
    finishedAt?: string | null
    errorMessage?: string | null
    errorCode?: string | null
    moduleCount?: number | null
}

// ─── Constants ─────────────────────────────────────────────────────────

/**
 * Specialist id recorded on the pipeline_run row. Matches SpecialistId
 * union in src/lib/agents/specialists-config.ts:53 — Finn's canonical id
 * is `finance-lead` (his personality row has id: "finance-lead", name:
 * "Finn"). Keep this constant as the single source of truth for Finn's
 * pipeline attribution.
 */
const SPECIALIST_ID = "finance-lead"
const STAGE = "cost.estimate"

// ─── runFinnCost ───────────────────────────────────────────────────────

/**
 * Runs Finn over the given project's decomposed modules + seeded parts and
 * persists per-module cost estimates into cad_lab_projects.ai_cost_estimates.
 * Wraps the call in a pipeline_runs row for observability.
 *
 * @param projectId - V2 project UUID
 * @param trigger   - Why this run was kicked off (routed to pipeline_runs.trigger)
 */
export async function runFinnCost(
    projectId: string,
    trigger: "manual" | "auto.bom-complete",
): Promise<RunFinnCostReturn> {
    return withAuth<RunFinnCostReturn>(async ({ user, foundryId }) => {
        return runFinnCostInternal(projectId, foundryId, user.id, trigger)
    })
}

/**
 * Background entry point — called from `after()` post-response contexts (the
 * autopilot chain, BOM → Finn auto-fire) where cookies are gone and
 * `withAuth` would fail with "Unauthorized". Caller MUST have already
 * resolved `foundryId` from an authenticated request.
 *
 * This is the #90 fix applied to Finn — mirrors `runBomGeneratorBackground`
 * and `runMaxDecompositionBackground`. See run-max-decomposition.ts header
 * for the full rationale.
 */
export async function runFinnCostBackground(
    projectId: string,
    foundryId: string,
    userId: string | null,
    trigger: "auto.bom-complete" | "manual.rerun" = "auto.bom-complete",
): Promise<RunFinnCostReturn> {
    return runFinnCostInternal(projectId, foundryId, userId, trigger)
}

async function runFinnCostInternal(
    projectId: string,
    foundryId: string,
    userId: string | null,
    trigger: "manual" | "auto.bom-complete" | "manual.rerun",
): Promise<RunFinnCostReturn> {
    {
        // GOTCHA: triggered_by FKs to auth.users and a zero UUID fails the
        // constraint. For system-fired runs (autopilot after() chain,
        // BOM → Finn auto-fire) userId is null and we pass it straight
        // through — the column is nullable.
        const user: { id: string | null } = { id: userId }
        // 1. Load + verify project. Same rationale as sibling orchestrators:
        //    RLS on cad_lab_projects is keyed on foundry membership and we
        //    never want to silently cost another tenant's project on behalf
        //    of this caller.
        const admin = createAdminClient()

        // When autopilot fires this via background (userId null), downstream
        // estimateModuleCostsAi + saveCadLabAiCostEstimates still need a
        // trusted identity to skip cookie reads that fail inside after()
        // contexts. Fall back to the foundry owner — the legitimate "system
        // user" for this tenant. Mirrors the pattern in
        // run-max-decomposition.ts:180-189 (RT4 Option A).
        if (!user.id) {
            const { data: foundry } = await admin
                .from("foundries")
                .select("owner_id")
                .eq("id", foundryId)
                .maybeSingle()
            if (foundry?.owner_id) user.id = foundry.owner_id
        }
        const trusted = user.id
            ? { userId: user.id, foundryId }
            : undefined
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select(
                "id, foundry_id, modules, research, diagnostic_answers, product_overview",
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
            // SECURITY: don't leak the existence of other-foundry projects
            return {
                ok: false,
                error: "Project not found",
                errorCode: "PROJECT_FORBIDDEN",
            }
        }

        // 2. Precondition: Finn needs a BOM seed — modules decomposed AND
        //    each module carrying keyParts[]. Without those, the inner
        //    estimator has nothing to classify or cost. Fail fast with a
        //    clean error code so the UI can route the founder to BOM first.
        //
        //    DECISION: we require EVERY module to have at least one keyPart.
        //    If any module has zero keyParts, that module silently gets £0
        //    from Finn which misleads the waterfall. Cleaner to refuse
        //    up-front than ship half-costed rollups.
        const modulesRaw = project.modules as unknown
        const modules = (Array.isArray(modulesRaw) ? modulesRaw : []) as CadLabModule[]

        if (modules.length === 0) {
            return {
                ok: false,
                error:
                    "This project hasn't been decomposed yet — run Max's module decomposition first.",
                errorCode: "NO_BOM",
            }
        }

        const hasPartsSeeded = modules.every(
            (m) => Array.isArray(m.keyParts) && m.keyParts.length > 0,
        )
        if (!hasPartsSeeded) {
            return {
                ok: false,
                error:
                    "Generate a BOM first — Finn needs each module's parts list before I can estimate costs.",
                errorCode: "NO_BOM",
            }
        }

        // Research excerpt + diagnostic answers are context the inner action
        // leans on for grounding. They're optional; we pass empty defaults
        // when absent rather than throw.
        const research = project.research as
            | { report?: unknown; designBrief?: unknown }
            | null
        const researchExcerpt =
            research && typeof research.report === "string"
                ? research.report.slice(0, 2000)
                : ""
        const diagnosticAnswers =
            (project.diagnostic_answers as DiagnosticAnswers | null) ?? {}
        const productOverview =
            typeof project.product_overview === "string"
                ? project.product_overview
                : undefined

        // 3. Pre-flight tier budget check.
        //    estimateModuleCostsAi wraps itself in withAIGate which re-checks
        //    this. That duplicate check is authoritative for per-run
        //    enforcement; this outer check exists so the orchestrator can
        //    return a clean BUDGET_CAPPED code before writing a pipeline_runs
        //    row that would otherwise be immediately 'failed'.
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
            // Fail closed with a distinct errorCode so a bad lookup doesn't
            // silently turn into uncharged spend.
            console.error(
                "[run-finn-cost] checkAILimit threw:",
                err instanceof Error ? err.message : err,
            )
            return {
                ok: false,
                error:
                    "Couldn't verify your usage budget — try again in a moment.",
                errorCode: "BUDGET_NOT_CHECKABLE",
            }
        }

        if (!budgetOk) {
            return {
                ok: false,
                error: budgetMessage ?? "Usage limit reached.",
                errorCode: "BUDGET_CAPPED",
            }
        }

        // 4. Start pipeline_run. Once this returns, every exit path MUST
        //    either complete or fail the run — otherwise the row hangs in
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
                model_provider: "deepseek",
                input_ref: {
                    source: "modules+diagnostics",
                    moduleCount: modules.length,
                    totalKeyParts: modules.reduce(
                        (acc, m) => acc + (m.keyParts?.length ?? 0),
                        0,
                    ),
                },
            })
            runId = started.runId
        } catch (err) {
            console.error(
                "[run-finn-cost] startPipelineRun threw:",
                err instanceof Error ? err.message : err,
            )
            return {
                ok: false,
                error: "Couldn't start the pipeline run.",
                errorCode: "INTERNAL",
            }
        }

        // From here on: every exit path routes through complete/fail so the
        // chip reflects reality even if something unexpected throws.
        try {
            // 5. Call the inner estimator. It handles DeepSeek call, JSON
            //    parse, classification overrides, and validation. Returns
            //    `{ success: true, estimates }` or `{ success: false, error }`.
            const estimateResult = await estimateModuleCostsAi(
                modules,
                diagnosticAnswers,
                researchExcerpt,
                productOverview,
                undefined,
                trusted,
            )

            if (!estimateResult.success) {
                await failPipelineRun(
                    runId,
                    "ESTIMATE_FAILED",
                    estimateResult.error || "Cost estimation failed.",
                )
                return {
                    ok: false,
                    runId,
                    error: estimateResult.error || "Cost estimation failed.",
                    errorCode: "ESTIMATE_FAILED",
                }
            }

            const estimates = estimateResult.estimates
            const moduleCount = Object.keys(estimates).length

            // 6. Persist onto cad_lab_projects.ai_cost_estimates JSONB.
            //    saveCadLabAiCostEstimates is itself withAuth-wrapped and
            //    returns `{ success: true }` or `{ error }`.
            const saveResult = await saveCadLabAiCostEstimates(projectId, estimates, trusted)
            if ("error" in saveResult) {
                await failPipelineRun(
                    runId,
                    "SAVE_FAILED",
                    saveResult.error || "Failed to save cost estimates.",
                )
                return {
                    ok: false,
                    runId,
                    error: saveResult.error,
                    errorCode: "SAVE_FAILED",
                }
            }

            // 7. Done. Token counts surface from the inner estimator's
            //    usage aggregate (summed across batches). When DeepSeek
            //    didn't return usage on any batch, stays null — audit
            //    renders "tokens not recorded" rather than zero.
            await completePipelineRun(runId, {
                input_tokens: estimateResult.usage?.inputTokens ?? null,
                output_tokens: estimateResult.usage?.outputTokens ?? null,
                model_id: estimateResult.usage?.modelId ?? null,
                output_ref: {
                    table: "cad_lab_projects",
                    column: "ai_cost_estimates",
                    moduleCount,
                    modulesInProject: modules.length,
                },
            })

            return {
                ok: true,
                runId,
                moduleCount,
            }
        } catch (err) {
            const message =
                err instanceof Error
                    ? err.message
                    : "Unknown cost estimation error"
            console.error("[run-finn-cost] unexpected throw:", message)
            try {
                await failPipelineRun(runId, "INTERNAL", message)
            } catch (failErr) {
                console.error(
                    "[run-finn-cost] failPipelineRun also threw:",
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
}

// ─── loadFinnRunStatus ─────────────────────────────────────────────────

/**
 * Reads the latest pipeline_runs row for (project_id,
 * specialist='finance-lead', stage='cost.estimate') and returns a
 * chip-friendly shape. Used by the Cost page loader and the Workspace
 * page loader to drive the PipelineRunChip.
 *
 * When no row exists the chip shows "not-started". The orchestrator is
 * still safe to call from that state — it writes the first row atomically.
 */
export async function loadFinnRunStatus(
    projectId: string,
): Promise<LoadFinnRunStatusResult> {
    return withAuth<LoadFinnRunStatusResult>(async ({ foundryId }) => {
        // Ownership check — same rationale as runFinnCost.
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
            row.output_ref &&
            typeof row.output_ref === "object" &&
            row.output_ref !== null
                ? ((row.output_ref as { moduleCount?: unknown }).moduleCount as
                      | number
                      | undefined)
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

function mapDbStatusToChip(dbStatus: string): FinnRunStatusChip {
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
