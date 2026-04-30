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
 *   - INFEASIBLE_DESIGN      — feasibility_verdict.passed === false (preflight oracle
 *                              detected a physics violation) OR dimension_sheet.feasible
 *                              === false (sizing solver could not fit the design). Cost
 *                              numbers on physically impossible designs are meaningless
 *                              so Finn refuses to run. Fix the physics first.
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
import { runCostReconciliation } from "@/actions/specialists/run-cost-reconciliation"
import { checkAILimit } from "@/lib/ai/limit-check"
import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import type { AiCostEstimate, CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import { estimateNreCosts } from "@/lib/cost/nre-cost-layer"

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
                "id, foundry_id, modules, research, diagnostic_answers, product_overview, feasibility_verdict, dimension_sheet",
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

        // 2a. Feasibility gate — block Finn on physically infeasible designs.
        //
        //     Council consensus (6/6 models, 2026-04-29): cost numbers on
        //     physically impossible designs are hallucinated and mislead founders
        //     (e.g. Vertical Farm 1870% over container volume → Finn reported a
        //     10% cost overrun as if it were meaningful). The fix: refuse to run
        //     when EITHER the preflight oracle OR the sizing solver has declared
        //     the design infeasible.
        //
        //     Two independent infeasibility signals:
        //       (a) feasibility_verdict.passed === false  — set by the preflight
        //           oracle at brief-lock time when physics ceilings are breached.
        //       (b) dimension_sheet.feasible === false    — set by Fang's sizing
        //           solver when the dimensions cannot fit in the declared envelope.
        //
        //     DECISION: on infeasibility we SKIP (return INFEASIBLE_DESIGN) rather
        //     than label outputs "indicative only". A labelled number anchors the
        //     founder on a figure that is geometrically impossible — eroding trust
        //     more than a clean refusal. The UI routes them to fix the physics
        //     first, then re-run Finn.
        //
        //     LEGACY PROJECTS: if both columns are null (project pre-dates the
        //     preflight oracle / sizing solver), we allow Finn to run rather than
        //     silently block all existing projects. A null verdict is NOT the same
        //     as a FAILED verdict.
        //
        //     CONFLICT: if verdicts disagree (oracle passed but sizing failed or
        //     vice versa), we take the stricter signal and block.
        {
            const feasibilityVerdict = (project.feasibility_verdict as {
                passed?: boolean
                blockers?: Array<{ axis?: string; explanation?: string }>
                domain?: string
            } | null) ?? null

            const dimensionSheet = (project.dimension_sheet as {
                feasible?: boolean
                conflicts?: string[]
            } | null) ?? null

            // Check both signals — block on any hard infeasibility.
            const oracleFailed =
                feasibilityVerdict !== null && feasibilityVerdict.passed === false
            const solverFailed =
                dimensionSheet !== null && dimensionSheet.feasible === false

            if (oracleFailed || solverFailed) {
                // Marginal tolerance: if ONLY the solver failed (not the
                // oracle) and the overshoot is ≤5%, proceed with a warning
                // rather than hard-blocking. A 2% floor-area shortfall
                // shouldn't prevent costing — the founder needs to see the
                // numbers to make an informed trade-off.
                //
                // GOTCHA (2026-04-30): The layout stage can rename / split a
                // single solver module into mirror-pair keys in module_dimensions
                // (e.g. "battery_racks" → "battery_rack_port" + "battery_rack_starboard",
                // each carrying the full floor_m2). Re-summing module_dimensions
                // then double-counts every mirror-pair module and produces a
                // wildly inflated "usedFloor" (e.g. 36.5 m² instead of 21.5 m²).
                //
                // The solver's own iterations[0].used_floor_m2 is the
                // authoritative floor sum — it was computed at solve time from
                // the engineering coefficients, before any layout renaming.
                // Use it instead of re-summing module_dimensions.
                const MARGINAL_THRESHOLD = 0.05
                let marginal = false
                if (solverFailed && !oracleFailed && dimensionSheet) {
                    const floorBudget = (dimensionSheet as { floor_budget_m2?: number }).floor_budget_m2
                    // Prefer the solver's authoritative used_floor_m2 from iterations.
                    // Fall back to summing module_dimensions only when iterations is absent
                    // (legacy projects that pre-date the iterations field).
                    const solverIterations = (dimensionSheet as {
                        iterations?: Array<{ used_floor_m2?: number }>
                    }).iterations
                    const solverUsedFloor = solverIterations?.[0]?.used_floor_m2 ?? null
                    const moduleDims = solverUsedFloor === null
                        ? (dimensionSheet as { module_dimensions?: Record<string, { floor_m2?: number }> }).module_dimensions
                        : null
                    if (floorBudget && floorBudget > 0) {
                        // Use the solver's own sum when available; otherwise fall back
                        // to summing module_dimensions (excluding envelope/shell entries).
                        const usedFloor = solverUsedFloor !== null
                            ? solverUsedFloor
                            : moduleDims
                                ? Object.entries(moduleDims).reduce(
                                    (sum, [key, m]) => {
                                        if (/enclosure|envelope|building_shell/i.test(key)) return sum
                                        return sum + (m.floor_m2 ?? 0)
                                    }, 0
                                )
                                : null
                        if (usedFloor !== null) {
                            const overFraction = (usedFloor - floorBudget) / floorBudget
                            if (overFraction > 0 && overFraction <= MARGINAL_THRESHOLD) {
                                marginal = true
                                console.info(
                                    `[run-finn-cost] marginal infeasibility (${(overFraction * 100).toFixed(1)}% over) — proceeding with warning`,
                                    `project=${projectId}`,
                                    `used_floor_m2=${usedFloor} floor_budget_m2=${floorBudget} source=${solverUsedFloor !== null ? "solver-iterations" : "module_dimensions-sum"}`,
                                )
                            }
                        }
                    }
                }

                if (!marginal) {
                    // Build a human-readable summary from whichever signal fired.
                    const reasonParts: string[] = []

                    if (oracleFailed && feasibilityVerdict?.blockers?.length) {
                        const oracleBlockers = feasibilityVerdict.blockers
                            .filter((b) => b.explanation)
                            .map((b) => b.explanation!)
                            .slice(0, 3)
                            .join("; ")
                        if (oracleBlockers) reasonParts.push(oracleBlockers)
                    }

                    if (solverFailed && dimensionSheet?.conflicts?.length) {
                        const solverConflicts = dimensionSheet.conflicts
                            .slice(0, 2)
                            .join("; ")
                        if (solverConflicts) reasonParts.push(solverConflicts)
                    }

                    const reason =
                        reasonParts.length > 0
                            ? reasonParts.join(" | ")
                            : "The design does not pass physics checks. Resolve the sizing issues and re-run."

                    console.warn(
                        `[run-finn-cost] blocking cost run on infeasible design: project=${projectId}`,
                        `oracle_failed=${oracleFailed} solver_failed=${solverFailed}`,
                    )

                    return {
                        ok: false,
                        error: `Cost estimation skipped — the design is not physically feasible. ${reason}`,
                        errorCode: "INFEASIBLE_DESIGN",
                    }
                }
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

        // Loop 7 fix (2026-04-26 NIGHT): the precondition was checking
        // modules.every(m.keyParts.length > 0) which fails for any project
        // where Max decomposed without populating keyParts but BOM was
        // generated downstream into the parts table. The parts table IS
        // the canonical BOM data — the legacy keyParts array on each
        // module is a separate per-module hint that's optional. Bug bit
        // Desal + Sentinel: 9 modules with 0 keyParts but parts table
        // had 90 + 45 rows respectively; Finn refused to run for hours
        // until traced. Fix: check parts table directly.
        const { count: partsCount } = await admin
            .from("parts")
            .select("id", { count: "exact", head: true })
            .eq("cad_lab_project_id", projectId)
        if (!partsCount || partsCount === 0) {
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

            // 8. NRE cost layer (F1, GPT-5.5 + Kimi critical).
            //    Estimate non-recurring costs that Finn's unit cost excludes:
            //    tooling, certification, testing, fixtures, warranty, freight.
            //    Non-blocking — NRE estimation failure must never break the pipeline.
            try {
                const bomTotal = Object.values(estimates as Record<string, AiCostEstimate>)
                    .reduce((sum, est) => sum + (est.totalPerUnit ?? 0), 0)

                const productClassHint =
                    typeof project.product_overview === "string"
                        ? project.product_overview
                        : ""

                // Geography defaults to United Kingdom — the brief constraints
                // may contain a markets array, but the NRE heuristic only needs
                // a broad geography band, not a per-market breakdown.
                const briefConstraints =
                    ((research as { designBrief?: { constraints?: { markets?: unknown[] } } } | null)
                        ?.designBrief?.constraints)
                const geographyHint =
                    Array.isArray(briefConstraints?.markets) &&
                    briefConstraints.markets.some((m) => typeof m === "string" && /GB|UK/i.test(m as string))
                        ? "United Kingdom"
                        : "global"

                const nreBreakdown = estimateNreCosts(
                    bomTotal,
                    productClassHint,
                    geographyHint,
                )

                await admin
                    .from("cad_lab_projects")
                    .update({
                        ai_cost_estimates: {
                            ...(estimates as Record<string, unknown>),
                            _nre_breakdown: nreBreakdown,
                        } as unknown as Record<string, unknown>,
                    })
                    .eq("id", projectId)
            } catch (nreErr) {
                console.warn(
                    "[run-finn-cost] NRE estimation failed (non-blocking):",
                    nreErr instanceof Error ? nreErr.message : nreErr,
                )
            }

            // 9. Post-Finn cost reconciliation (Item 7 fix).
            //    Compares Finn's canonical total against the BOM-derived
            //    total, supplier quotes, and the brief's cost ceiling.
            //    This MUST NOT block the pipeline even if it throws —
            //    reconciliation failure is a diagnostic concern, not a
            //    pipeline blocker. The result is persisted to
            //    cad_lab_projects.cost_reconciliation for the PDF and UI.
            try {
                const reconcileResult = await runCostReconciliation(projectId, foundryId)
                if (!reconcileResult.ok) {
                    console.warn(
                        `[run-finn-cost] Cost reconciliation failed (non-blocking): ${reconcileResult.error}`,
                    )
                }
            } catch (reconcileErr) {
                // Swallow — reconciliation must never break the Finn pipeline.
                console.warn(
                    "[run-finn-cost] Cost reconciliation threw (non-blocking):",
                    reconcileErr instanceof Error ? reconcileErr.message : reconcileErr,
                )
            }

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
