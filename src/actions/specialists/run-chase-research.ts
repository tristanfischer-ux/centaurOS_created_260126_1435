"use server"

/**
 * @file run-chase-research.ts — Chase (VP Supply Chain / Strategist seed)
 * research orchestrator.
 *
 * @description Canonical entry point for running Chase over a V2 project to
 * seed `project.research.report` + `project.research.designBrief`. Every
 * downstream specialist (Max decomposition, Finn cost, Fang review, Jian
 * engineering) depends on `research.report >= 200 chars` as its first
 * precondition (see run-max-decomposition.ts §MISSING_BRIEF). Nothing
 * populates that field today — Chase is the seeder that fixes it.
 *
 * Stage is `research.seed`. Trigger is either `manual` (founder clicked
 * "Draft with Chase") or `auto.project-create` (the future new-project
 * flow auto-kicks Chase as soon as the founder types the subject). The
 * wrapper is identical — only the trigger string changes.
 *
 * Pipeline:
 *   1. withAuth → user + foundryId
 *   2. Load project, verify ownership, check preconditions (subject)
 *   3. Pre-flight tier budget check via checkAILimit(foundryId)
 *   4. startPipelineRun (specialist_id='vp-supply-chain', stage='research.seed')
 *   5. runCadLabResearch → sources + multi-paragraph report (Claude/OpenAI/Gemini
 *      fallback chain already lives inside runCadLabResearch; we don't re-route)
 *   6. Follow-up structured-brief extraction with Sonnet — parses the report
 *      into a designBrief jsonb (targetUser / useCase / constraints /
 *      successCriteria / keyRisks / openQuestions)
 *   7. saveCadLabResearch writes both back to cad_lab_projects.research
 *   8. completePipelineRun with token totals + output_ref
 *
 * Token / cost tracking: the inner runCadLabResearch doesn't surface token
 * counts (it's an older action written before pipeline_runs existed); the
 * follow-up Sonnet extraction DOES return tokensIn/tokensOut, so we record
 * THOSE only. cost_gbp_pence stays null for now — same precedent as Max
 * (see run-max-decomposition.ts header for why).
 *
 * Error codes exposed to callers:
 *   - BUDGET_CAPPED         — tier AI budget exhausted; inner check refused
 *   - BUDGET_NOT_CHECKABLE  — foundry tier / usage lookup threw
 *   - MISSING_SUBJECT       — project.subject is empty; Chase needs the concept
 *   - PROJECT_NOT_FOUND | PROJECT_FORBIDDEN — ownership guard failed
 *   - RESEARCH_FAILED       — runCadLabResearch returned error / empty report
 *   - SAVE_FAILED           — saveCadLabResearch returned an error
 *   - INTERNAL              — unclassified throw
 *
 * @related
 *   - Pre-read arch doc: /tmp/forge-v2-pipeline-arch/PIPELINE-ARCHITECTURE.md
 *   - Inner engine:      src/actions/cad-lab.ts → runCadLabResearch
 *   - Persistence:       src/actions/cad-lab-projects.ts → saveCadLabResearch
 *   - Pipeline wrappers: src/actions/pipeline-runs.ts
 *   - UI consumers:      src/app/(platform)/the-forge-v2/projects/[id]/brief/
 *                        src/app/(platform)/the-forge-v2/projects/[id]/page.tsx
 *   - Sibling (Max):     src/actions/specialists/run-max-decomposition.ts
 */

import { runCadLabResearch } from "@/actions/cad-lab"
import { saveCadLabResearch } from "@/actions/cad-lab-projects"
import {
    completePipelineRun,
    failPipelineRun,
    loadLatestRunForStage,
    startPipelineRun,
} from "@/actions/pipeline-runs"
import { sweepStalledRuns } from "@/actions/pipeline-runs-watchdog"
import { callClaude } from "@/lib/cad-lab/api-helpers"
import { checkAILimit } from "@/lib/ai/limit-check"
import type {
    CadLabDesignBrief,
    CadLabResearchResult,
} from "@/lib/cad-lab-types"
import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"

// ─── Public types ──────────────────────────────────────────────────────

export type ChaseRunStatusChip =
    | "not-started"
    | "queued"
    | "running"
    | "done"
    | "failed"
    | "cancelled"

export interface RunChaseResearchResult {
    ok: true
    runId: string
    /** Character count of the report saved to research.report. */
    reportChars: number
}

export interface RunChaseResearchError {
    ok: false
    error: string
    errorCode?: string
    runId?: string
}

export type RunChaseResearchReturn =
    | RunChaseResearchResult
    | RunChaseResearchError

export interface LoadChaseRunStatusResult {
    status: ChaseRunStatusChip
    startedAt?: string | null
    finishedAt?: string | null
    errorMessage?: string | null
    errorCode?: string | null
    reportChars?: number | null
}

// ─── Constants ─────────────────────────────────────────────────────────

const SPECIALIST_ID = "vp-supply-chain"
const STAGE = "research.seed"
/** Minimum report length Max requires. Must stay in lockstep with
 *  run-max-decomposition.ts §MISSING_BRIEF (currently 200 chars). */
const MIN_REPORT_CHARS = 200

/**
 * Classifies inner runCadLabResearch errors as transient (worth a retry) or
 * hard (caller error, budget cap, validation) where retrying would burn the
 * budget without any chance of success. Keep the regex tight — anything
 * broader risks double-charging founders on genuine hard failures.
 *
 * Transient signals observed so far:
 *   - "Claude synthesis failed" — the Sonnet call threw mid-stream (cold
 *     start, provider hiccup). The grounded-search sources were gathered
 *     fine; only synthesis flaked. This is the dominant E2E-round-3 mode.
 *   - "timeout" / "timed out" — HTTP or AbortSignal.timeout from the
 *     inner API helpers.
 *   - "network" / "fetch" — TCP-layer blip.
 *   - "rate limit" / "429" — provider throttling; a 2s wait often clears.
 *   - "transient" — explicit marker the inner engine may surface.
 */
const TRANSIENT_ERROR_PATTERN =
    /timeout|timed out|synthesis failed|network|fetch failed|rate.?limit|429|transient|ECONNRESET|ETIMEDOUT/i

/** Delay before the retry attempt. Short — we're not backing off, we're
 *  just letting a cold-start finish warming. */
const RETRY_DELAY_MS = 2000

// ─── runChaseResearch ──────────────────────────────────────────────────

/**
 * Runs Chase over the given project, producing the research report + a
 * structured design brief, and writing both to cad_lab_projects.research.
 * Wraps the call in a pipeline_runs row for observability.
 *
 * @param projectId - V2 project UUID
 * @param trigger   - Why this run was kicked off (routed to pipeline_runs.trigger)
 */
export async function runChaseResearch(
    projectId: string,
    trigger: "manual" | "auto.project-create",
): Promise<RunChaseResearchReturn> {
    return withAuth<RunChaseResearchReturn>(async ({ user, foundryId }) => {
        return runChaseResearchInternal(projectId, foundryId, user.id, trigger)
    })
}

/**
 * Background entry — called from `after()` post-response contexts (e.g. the
 * project-create auto-fire in `cad-lab-projects.ts`) where cookies are gone
 * and `withAuth` would fail. Caller MUST have already resolved foundryId
 * from an authenticated request.
 *
 * This is the #90 pattern applied to Chase. Mirrors
 * `runMaxDecompositionBackground` — every chained post-response handoff
 * calls a *Background variant that plumbs foundryId + userId explicitly.
 */
export async function runChaseResearchBackground(
    projectId: string,
    foundryId: string,
    userId: string | null,
    trigger: "manual" | "auto.project-create" = "auto.project-create",
): Promise<RunChaseResearchReturn> {
    return runChaseResearchInternal(projectId, foundryId, userId, trigger)
}

async function runChaseResearchInternal(
    projectId: string,
    foundryId: string,
    userId: string | null,
    trigger: "manual" | "auto.project-create",
): Promise<RunChaseResearchReturn> {
    // Shim: expose user.id under the original closure name so the body
    // continues to work. GOTCHA: triggered_by has an FK to auth.users, so
    // passing a zero UUID when the caller didn't supply a userId blows up
    // with a FK violation — same pattern as run-max-decomposition.
    const user: { id: string | null } = { id: userId }
    void foundryId
    {
        // 1. Load + verify project. Same rationale as Max's orchestrator —
        //    we use the admin client so RLS doesn't hide a project the
        //    caller DOES own from a different session angle, then we
        //    check foundry_id ourselves to block cross-tenant spoofs.
        const admin = createAdminClient()

        // When autopilot fires Chase via background (userId null), the
        // downstream runCadLabResearch + saveCadLabResearch still need a
        // trusted identity to skip cookie-backed auth that fails inside
        // after() contexts. Fall back to the foundry owner — the legitimate
        // "system user" for this tenant. Mirrors the pattern in
        // run-max-decomposition.ts:180-189 (RT4 Option A).
        if (!user.id) {
            const { data: foundry } = await admin
                .from("foundries")
                .select("owner_id")
                .eq("id", foundryId)
                .maybeSingle()
            if (foundry?.owner_id) user.id = foundry.owner_id
        }

        // TrustedContext for the deep call chain (runCadLabResearch,
        // saveCadLabResearch). Only construct when we have a resolved
        // userId — otherwise fall back to untrusted (cookie) path which
        // will fail the same way it did before this patch, but at least
        // loudly.
        const trusted = user.id
            ? { userId: user.id, foundryId }
            : undefined
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, subject, research")
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

        // 2. Precondition: Chase needs the founder's short concept
        //    (project.subject). Without it runCadLabResearch has nothing
        //    to search for — it would either refuse or synthesise a
        //    low-quality generic report. Fail loud instead.
        const description =
            typeof project.subject === "string" ? project.subject.trim() : ""

        if (!description) {
            return {
                ok: false,
                error:
                    "This project doesn't have a subject yet — Chase needs your concept first.",
                errorCode: "MISSING_SUBJECT",
            }
        }

        // Carry any designBrief fields the founder may already have typed
        // into the Brief form forward into the new research object so a
        // re-run doesn't wipe them.
        const priorResearch = (project.research ?? null) as
            | { designBrief?: CadLabDesignBrief; assumptionNotes?: string }
            | null
        const priorDesignBrief = priorResearch?.designBrief
        const priorAssumptionNotes = priorResearch?.assumptionNotes

        // 3. Pre-flight tier budget check. Mirrors Max's pattern exactly —
        //    inner runCadLabResearch calls enforceCadLabLimit too; this
        //    outer one lets us return a clean BUDGET_CAPPED errorCode
        //    before we've opened a pipeline_runs row.
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
            console.error(
                "[run-chase-research] checkAILimit threw:",
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

        // 4. Start pipeline_run. Every exit path below MUST either
        //    complete or fail the run — otherwise it hangs in 'running'
        //    and the chip lies.
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
                input_ref: {
                    source: "project.subject",
                    charCount: description.length,
                },
            })
            runId = started.runId
        } catch (err) {
            console.error(
                "[run-chase-research] startPipelineRun threw:",
                err instanceof Error ? err.message : err,
            )
            return {
                ok: false,
                error: "Couldn't start the pipeline run.",
                errorCode: "INTERNAL",
            }
        }

        // Tracks whether the first inner call failed transiently and a
        // retry was needed. Surfaced in pipeline_runs.output_ref so ops
        // can see transient-recovery rate without trawling logs.
        let retried = false
        let firstErrorMessage: string | null = null

        try {
            // 5. Delegate the heavy research lift to the canonical
            //    cad-lab action. It handles Gemini + Google Search,
            //    Thingiverse CAD lookup, domain detection, standards
            //    retrieval, and the Claude→OpenAI→Gemini synthesis
            //    fallback chain. We wrap it — don't duplicate it.
            //
            //    E2E round 3 found the auto-fire on project-create fails
            //    ~40s in with "Claude synthesis failed — sources were
            //    still collected" on the first call, then succeeds on a
            //    manual retry 87s later. Classic cold-start / transient
            //    synthesis flake. One-shot retry inside this orchestrator
            //    converts that failure mode into an invisible recovery
            //    without papering over hard errors (budget cap, auth,
            //    validation) that retry can't fix.
            const researchResult: CadLabResearchResult =
                await runResearchWithOneRetry(description, {
                    priorDesignBrief,
                    priorAssumptionNotes,
                    onRetry: (firstErr) => {
                        retried = true
                        firstErrorMessage = firstErr
                    },
                    trusted,
                })

            const report =
                typeof researchResult.report === "string"
                    ? researchResult.report
                    : ""

            // runCadLabResearch returns success=false when synthesis fails
            // OR when the model refused, but it still hands back any web
            // sources it gathered. We refuse to save a truncated report
            // that wouldn't clear Max's MISSING_BRIEF threshold — better
            // to fail cleanly so the founder knows to retry.
            if (!researchResult.success || report.trim().length < MIN_REPORT_CHARS) {
                const detail =
                    researchResult.error ||
                    (report.trim().length < MIN_REPORT_CHARS
                        ? `Research synthesis returned only ${report.trim().length} chars (needs ${MIN_REPORT_CHARS}+).`
                        : "Research synthesis failed.")
                await failPipelineRun(runId, "RESEARCH_FAILED", detail, {
                    model_id:
                        typeof researchResult.modelUsed === "string"
                            ? researchResult.modelUsed
                            : null,
                    // If the retry ALSO failed, record both messages so
                    // ops can distinguish "retry didn't help" from
                    // "first attempt was a hard failure we didn't retry".
                    ...(retried
                        ? {
                              output_ref: {
                                  retried: true,
                                  firstErrorMessage,
                              },
                          }
                        : {}),
                })
                return {
                    ok: false,
                    runId,
                    error: detail,
                    errorCode: "RESEARCH_FAILED",
                }
            }

            // 6. Follow-up structured-brief extraction. We hand the
            //    report to Sonnet and ask it to pull out the Chase-level
            //    strategic fields (targetUser / useCase / constraints /
            //    successCriteria / keyRisks / openQuestions). This is
            //    what makes Chase's output visible in the Brief narrative
            //    and the downstream Cost / BOM tiles — a wall of research
            //    prose isn't enough.
            const extraction = await extractDesignBriefFromReport(
                description,
                report,
                priorDesignBrief,
            )

            // Even if extraction fails we still save the report — Max
            // only needs research.report. The structured brief is a
            // bonus that unlocks richer narrative rendering.
            const mergedDesignBrief: CadLabDesignBrief = {
                // Legacy six fields — preserve whatever the founder
                // already typed; fall back to runCadLabResearch's
                // echo; final fallback is empty strings so the Brief
                // empty-state variants render correctly.
                useCase:
                    priorDesignBrief?.useCase ||
                    extraction.brief?.useCase ||
                    researchResult.designBrief?.useCase ||
                    "",
                targetProcess:
                    priorDesignBrief?.targetProcess ||
                    researchResult.designBrief?.targetProcess ||
                    "",
                targetMaterial:
                    priorDesignBrief?.targetMaterial ||
                    researchResult.designBrief?.targetMaterial ||
                    "",
                toleranceTarget:
                    priorDesignBrief?.toleranceTarget ||
                    researchResult.designBrief?.toleranceTarget ||
                    "",
                quantityTarget:
                    priorDesignBrief?.quantityTarget ||
                    researchResult.designBrief?.quantityTarget ||
                    "",
                complianceNotes:
                    priorDesignBrief?.complianceNotes ||
                    researchResult.designBrief?.complianceNotes ||
                    "",
                // V2 narrative + structured constraints — Chase fills
                // these from the extraction.
                //
                // L9-P2 (2026-04-26): merge precedence flipped from
                // `prior || fresh` to `fresh || prior` for these
                // extraction-derived fields. The old order kept stale
                // legacy-shape `regulatory` (4 columns: code/name/status/
                // summary) on top of a fresh matrix-shape extraction (9
                // columns). Founder edits on these narrative fields
                // happen via the Brief UI, not Chase — there's nothing
                // to preserve here that justifies starving the renderer
                // of the freshest schema. constraints is a special case:
                // founder-typed scalars belong to prior; merge field-by-
                // field.
                mission:
                    extraction.brief?.mission || priorDesignBrief?.mission,
                targetCustomers:
                    extraction.brief?.targetCustomers ||
                    priorDesignBrief?.targetCustomers,
                whyNow:
                    extraction.brief?.whyNow || priorDesignBrief?.whyNow,
                constraints: {
                    ...(extraction.brief?.constraints ?? {}),
                    ...(priorDesignBrief?.constraints ?? {}),
                },
                regulatory:
                    extraction.brief?.regulatory || priorDesignBrief?.regulatory,
            }

            // 7. Persist. saveCadLabResearch expects a CadLabResearchResult —
            //    we reuse the one we got back with our merged designBrief
            //    substituted in.
            const researchToSave: CadLabResearchResult = {
                ...researchResult,
                designBrief: mergedDesignBrief,
            }
            const saveResult = await saveCadLabResearch(projectId, researchToSave, trusted)
            if ("error" in saveResult) {
                await failPipelineRun(runId, "SAVE_FAILED", saveResult.error, {
                    input_tokens: extraction.tokensIn,
                    output_tokens: extraction.tokensOut,
                })
                return {
                    ok: false,
                    runId,
                    error: saveResult.error,
                    errorCode: "SAVE_FAILED",
                }
            }

            // 8. Done. Record token counts from the structured-brief
            //    extraction (the inner runCadLabResearch doesn't surface
            //    them). cost_gbp_pence stays null — see header.
            await completePipelineRun(runId, {
                input_tokens: extraction.tokensIn,
                output_tokens: extraction.tokensOut,
                model_id:
                    typeof researchResult.modelUsed === "string"
                        ? researchResult.modelUsed
                        : null,
                output_ref: {
                    table: "cad_lab_projects",
                    column: "research",
                    reportChars: report.length,
                    sourcesCount: Array.isArray(researchResult.sources)
                        ? researchResult.sources.length
                        : 0,
                    extractionOk: extraction.ok,
                    // Observability for the transient-retry path. When
                    // retried=true the row went first-attempt→fail→
                    // second-attempt→success; firstErrorMessage preserves
                    // the original failure message for trend analysis.
                    ...(retried
                        ? { retried: true, firstErrorMessage }
                        : {}),
                },
            })

            return {
                ok: true,
                runId,
                reportChars: report.length,
            }
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Unknown research error"
            console.error("[run-chase-research] unexpected throw:", message)
            try {
                await failPipelineRun(runId, "INTERNAL", message)
            } catch (failErr) {
                console.error(
                    "[run-chase-research] failPipelineRun also threw:",
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

// ─── loadChaseRunStatus ────────────────────────────────────────────────

/**
 * Reads the latest pipeline_runs row for (project_id, specialist='vp-supply-chain',
 * stage='research.seed') and returns a chip-friendly shape. Used by the
 * Brief page loader and the Workspace page loader.
 *
 * When no row exists the chip shows "not-started". The orchestrator is
 * still safe to call from that state — it writes the first row atomically.
 */
export async function loadChaseRunStatus(
    projectId: string,
): Promise<LoadChaseRunStatusResult> {
    return withAuth<LoadChaseRunStatusResult>(async ({ foundryId }) => {
        // Ownership check — same rationale as runChaseResearch.
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
        const reportChars =
            row.output_ref && typeof row.output_ref === "object" && row.output_ref !== null
                ? ((row.output_ref as { reportChars?: unknown }).reportChars as number | undefined)
                : undefined
        return {
            status,
            startedAt: row.started_at,
            finishedAt: row.finished_at,
            errorCode: row.error_code,
            errorMessage: row.error_message,
            reportChars: typeof reportChars === "number" ? reportChars : null,
        }
    })
}

// ─── Internals ─────────────────────────────────────────────────────────

/**
 * Wraps runCadLabResearch with a single transient-failure retry. The inner
 * engine returns `{ success: false, error }` rather than throwing, so we
 * inspect the error string and decide whether to retry.
 *
 * Hard failures (budget cap, auth, validation, unknown non-transient) are
 * returned as-is after the first attempt — retrying those would just burn
 * the tier budget without any chance of success.
 *
 * Transient failures (cold-start synthesis flake, network blip, timeout,
 * rate-limit) get exactly one more attempt after a 2s pause. Whatever the
 * second attempt returns is the final answer — no further loops.
 *
 * Timing budget: first call ~40s (observed failure window), delay 2s,
 * retry ~87s → worst-case ~130s. Still well under Vercel's 300s cap.
 */
async function runResearchWithOneRetry(
    description: string,
    opts: {
        priorDesignBrief: CadLabDesignBrief | undefined
        priorAssumptionNotes: string | undefined
        onRetry: (firstErrorMessage: string) => void
        /**
         * TrustedContext for the after()-context calls — skips the cookie
         * read inside `runCadLabResearch` that would otherwise fail.
         */
        trusted?: { userId: string; foundryId: string }
    },
): Promise<CadLabResearchResult> {
    const researchArg = opts.priorDesignBrief
        ? {
              designBrief: opts.priorDesignBrief,
              assumptionNotes: opts.priorAssumptionNotes,
          }
        : undefined

    const first = await runCadLabResearch(description, researchArg, opts.trusted)
    if (first.success) return first

    const errMsg = typeof first.error === "string" ? first.error : ""
    if (!TRANSIENT_ERROR_PATTERN.test(errMsg)) {
        // Hard failure — don't retry. Caller will surface as-is.
        return first
    }

    // Transient. Log, notify orchestrator so it can flag the pipeline_run,
    // wait briefly, try once more.
    console.warn(
        `[run-chase-research] transient inner failure on first attempt; retrying once. First error: ${errMsg}`,
    )
    opts.onRetry(errMsg)
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
    return runCadLabResearch(description, researchArg, opts.trusted)
}

interface ExtractionResult {
    ok: boolean
    brief: Partial<CadLabDesignBrief> | null
    tokensIn: number
    tokensOut: number
}

/**
 * Asks Sonnet to pull structured strategic fields out of the research
 * report. We ask for JSON only so the parse is deterministic; if the
 * model misbehaves we return `{ ok: false }` and the caller still saves
 * the raw report (Max can work off report alone).
 */
// Loop 8 P5 (per-stage harness): exported so the per-stage-loop runner can
// drive a fresh extraction on the current prompt against each demo's stored
// `research.report`, score the freshly extracted regulatory array, and
// iterate. Production callers go through runChaseResearchBackground; the
// harness is the only direct caller. The exported prompt-builder +
// parser let the harness route through OpenRouter when the direct
// Anthropic key is dry (different credit pool).
export async function extractDesignBriefFromReport(
    subject: string,
    report: string,
    priorBrief: CadLabDesignBrief | undefined,
): Promise<ExtractionResult> {
    const { systemPrompt, userPrompt } = await buildChaseExtractionPrompts(
        subject,
        report,
        priorBrief,
    )
    return await callExtractionWithPrompts(systemPrompt, userPrompt)
}

/**
 * Loop 8 P5: split the prompt-builder out so the per-stage harness can
 * call OpenRouter (separate credit pool) with the same prompt and parse
 * via tryParseBriefJson. Avoids duplicating the long few-shot block.
 *
 * Marked async so it can live in this "use server" file — Next.js
 * forbids non-async exports from server-action modules and surfaces it
 * as a Server Component build error (see memory
 * `forgeos_use_server_non_async_exports.md`).
 */
export async function buildChaseExtractionPrompts(
    subject: string,
    report: string,
    priorBrief: CadLabDesignBrief | undefined,
): Promise<{ systemPrompt: string; userPrompt: string }> {
    // Keep the report preamble bounded — strategic extraction only needs
    // the first chunk of context (which is the synthesis summary in the
    // domain-specific prompts; deeper sections are dimension tables that
    // don't help this task).
    const trimmedReport = report.length > 8000 ? report.slice(0, 8000) : report

    const systemPrompt = `You are Chase, a strategist advising a hardware founder. Read the research report and extract a crisp strategic brief. Return ONLY minified JSON — no prose, no markdown fences.

JSON shape:
{
  "mission": "1–2 sentence product mission statement",
  "targetCustomers": "Named segments (not personas)",
  "whyNow": "Why this matters now — market, regulatory, or technology moment",
  "useCase": "Short use case sentence",
  "constraints": {
    "unitCostCeilingGbp": number or null,
    "firstShipDate": "YYYY-MM-DD" or null,
    "maxMassKg": number or null,
    "batchSize": number or null,
    "markets": ["GB","US"] or null,
    "productionRegion": string or null
  },
  "regulatory": [
    {
      "code": "BS EN IEC 62933-5-2",
      "name": "Safety requirements for grid-integrated electrical energy storage systems",
      "summary": "One-line scope statement.",
      "applicability": "Where this standard bites for THIS project — be specific, e.g. 'AC interface, battery system safety scope', 'informational only', 'invalidated once container is modified'.",
      "designImpact": "What this standard forces the design to do — e.g. 'protection coordination + isolation strategy', 'deflagration vent area + burst pressure calculation', 'cell-level abuse-test pack'.",
      "evidenceRequired": "Concrete artefact the founder must obtain — type-test certificate, supplier declaration, calculation pack, insurer sign-off, Authority Having Jurisdiction acceptance letter.",
      "status": "not-started",
      "ownerRole": "Electrical lead | Safety lead | Battery lead | Mechanical lead | Founder",
      "gapAction": "Next concrete action to move status forward."
    }
  ]
}

Rules:
- Ground every field in the report. If the report doesn't mention a constraint, use null — do NOT invent numbers or dates.
- "regulatory" must be a project-specific compliance matrix, NOT a list of well-known standards. Each row needs applicability + designImpact + evidenceRequired + ownerRole + gapAction filled out. Generic standard descriptions without project-mapped obligations are a regression — every row must connect a clause to a design decision.
- "applicability" MUST start with one of these regime tags, followed by " — " and the project-specific scope text:
  - "UK statutory" — Acts, Regulations, or statutory instruments that legally apply (UKCA marking, BS 7671, ESQCR, EAWR, Electrical Equipment Safety Regs, Supply of Machinery Safety Regs, EMC Regs, RED, RoHS, WEEE, PSTI, PESR, CDM, GPSR, HSWA, Food Safety Act, MHRA Class designation, Ofcom radio, etc.).
  - "UK designated standard" — BS/EN/IEC/ISO standards that PROVE compliance with the underlying statutory regime. The standard is designated, not the law itself; reference the statute it serves.
  - "UK approved code" — codes of practice an enforcing body endorses (HSE Approved Codes of Practice, IET Code of Practice, ENA Engineering Recommendations like G99/G100).
  - "Voluntary reference" — international peers an insurer/AHJ/NFCC may cite (NFPA, UL, ASTM) but not UK law.
  - "Insurer best-practice" — guidance the founder's commercial insurer will likely require even though it isn't statutory.
- Do NOT label a BS/IEC harmonised standard as "UK statutory". The regulation is statutory; the standard demonstrates compliance. BS EN IEC 62619 is "UK designated standard"; the Electrical Equipment (Safety) Regulations 2016 it serves is "UK statutory".
- Coverage check before you finalise — for any UK hardware project that could plausibly fall under a regime, include at least one row from each applicable regime. Do not skip a regime just because the report didn't mention it; the founder needs the matrix complete:
  - Always relevant to almost any UK product: UKCA marking obligations (the umbrella scheme), GPSR (consumer-facing), HSWA (workplace duty), CDM (if construction/install on UK sites).
  - Electrical product (mains): Electrical Equipment (Safety) Regs 2016 + EMC Regs 2016 + BS 7671 + EAWR. Add LV designated standards (BS EN 60335 for appliances, BS EN 61010 for lab/industrial, BS EN 60950/62368 for IT).
  - Connected / IoT consumer (Wi-Fi, Bluetooth, cellular, sensors with apps): RED 2017, PSTI Act 2022, RoHS 2012, WEEE 2013. Cellular: Ofcom + GSMA SGP.02 if eSIM.
  - Battery-bearing: UN 38.3 + ADR + Batteries Regulations 2008/EU Batteries Regulation. Lithium specifically: BS EN IEC 62133 (consumer) or BS EN IEC 62619/63056 (industrial/grid).
  - Grid-connected energy storage: ESQCR + ENA G99 (>16 A) or G100 (export-limited). NFPA 855 / UL 9540 are voluntary-reference only.
  - Pressure systems (water, hydraulic, refrigerant): PESR 2016 (manufactured) + PSSR 2000 (installed in service).
  - Machinery (moving parts, automated function): Supply of Machinery (Safety) Regs 2008 + BS EN ISO 12100 + BS EN ISO 13849.
  - Food production / contact / vertical farms: Food Safety Act 1990 + Reg (EC) 852/2004 + BS EN 1672 (food machinery hygiene). Cleaning chemicals: BPR (UK) and HSE registration.
  - Medical devices: UK MDR 2002 + BS EN ISO 13485 + BS EN ISO 14971 + MHRA registration. Medical electrical: BS EN 60601-1 family. Software: BS EN 62304.
  - Water treatment / desalination producing potable water: WSR Regulation 4 (UK Drinking Water Regulations 2016) + BS 6920 (non-metallic) + WHO Drinking Water Guidelines (reference).
  - Optical / radiation: BS EN 62471 (LED photobiological), BS EN ISO 15004-2 (ophthalmic if relevant).
- ISO 1496-1 / ISO 1161 (freight container structural standards) apply ONLY if the container is unmodified. Once vents, doors, or rack reinforcements are added, the container loses CSC certification — flag the consequence in applicability.
- Do NOT cite a US-only standard (NFPA, UL, ASTM, IEEE-only) as UK statutory. Always pair with the UK statutory peer that actually applies.
- Standards-body codes pass through verbatim — UL, IEC, ISO, NFPA, BS, EN. Do NOT invent expansions ("United Laboratories" is a hallucination; "Underwriters Laboratories" is the correct full name; but the code "UL" stays as-is).
- British English ("programme" not "program"). First-person voice not required here — this is extraction, not narrative.
- Do NOT use the words "AI", "smart", or "intelligent" in the values. This lands in-product.
- Output must parse as JSON.

COVERAGE AUDIT (mandatory): before returning, walk down the coverage checklist above and confirm your regulatory[] array contains AT LEAST ONE row for every regime that plausibly applies to this project. The Loop 8 council scored every prior output 3-4/10 on coverage despite the prompt naming the regimes — the model emitted 6-10 rows when 12-20 were warranted. Targets per project class:
- UK consumer connected IoT (e.g. garden bird feeder, walking aid, weather station): MINIMUM 12 rows. UKCA + RED + EMC Regs 2016 + Electrical Equipment Safety Regs 2016 + RoHS + WEEE + PSTI Act 2022 + GPSR + Battery Regs 2009 + UN 38.3 + IEC 62133 + GDPR/PECR if data; add MHRA if medical, Ofcom for spectrum.
- UK containerised energy storage (BESS): MINIMUM 14 rows. ESQCR + ENA G99/G100 + BS EN IEC 62933-5-2 + BS EN IEC 62619 + BS EN IEC 63056 + BS 7671 + EAWR + UKCA umbrella + EMC Regs + Supply of Machinery (Safety) Regs + UN 38.3 + ADR + ISO 1496-1 (with CSC consequence) + insurer-reference NFPA 855/UL 9540/UL 9540A.
- UK container vertical farm (food production): MINIMUM 14 rows. Food Safety Act 1990 + EC 852/2004 + BS EN 1672 + BPR + HSE registration + UKCA + Supply of Machinery (Safety) Regs + Electrical Equipment Safety Regs + EMC + BS 7671 + EAWR + WRAS for water + WRR for abstraction + F-Gas Regs operator duties.
- UK container desalination (potable water): MINIMUM 12 rows. WSR/Drinking Water Regs 2016 + BS 6920 + UKCA + Supply of Machinery (Safety) Regs + PESR + PSSR + EMC + BS 7671 + EAWR + ISO 1496-1 + Water Resources (Control of Pollution) for brine discharge + insurer-reference WHO Drinking Water Guidelines.
- UK connected mobility aid / medical device: MINIMUM 12 rows. UK MDR 2002 + BS EN ISO 13485 + BS EN ISO 14971 + MHRA + RED + EMC + Electrical Equipment Safety Regs + RoHS + WEEE + PSTI + UN 38.3 + IEC 62133 + GDPR.
The checklist is not exhaustive — add product-specific regimes (e.g. children's product safety, EX/ATEX zones for hazardous areas, marine for offshore, automotive UNECE for road vehicles) when applicable. Less than the minimum count above signals to the council that coverage is incomplete and the score drops.

FEW-SHOT EXAMPLE — what an expert UK-BESS regulatory section looks like (Loop 7, V4-Pro generated). The "regulatory" array on a UK 3.5 MWh containerised LFP BESS should look LIKE THIS — one row per standard, every field filled out, statutory vs reference clearly distinguished:

[
  {
    "code": "ENA G99",
    "name": "Requirements for Connection of Generation Equipment in Parallel with Public Distribution Networks above 16A",
    "summary": "Mandatory UK grid code for behind-the-meter storage connecting in parallel with the distribution network; requires grid-forming capability and compliance with ESQCR.",
    "applicability": "UK approved code — Grid connection point >16 A behind-the-meter; ENA G99 is the Engineering Recommendation enforced by every DNO, sitting under ESQCR.",
    "designImpact": "Inverter must support grid-forming mode, islanding detection, and specified frequency/voltage ride-through parameters.",
    "evidenceRequired": "G99 commissioning test record signed by host DNO, generation connection agreement.",
    "status": "not-started",
    "ownerRole": "Electrical Engineer",
    "gapAction": "Engage Distribution Network Operator to submit G99 application and schedule commissioning witness test."
  },
  {
    "code": "BS EN IEC 62933-5-2",
    "name": "Electrical energy storage (EES) systems — Part 5-2: Safety requirements for grid-integrated EES systems",
    "summary": "UKCA harmonised standard for stationary battery energy storage safety; replaces US UL 9540 for UK market access.",
    "applicability": "UK designated standard — Complete BESS enclosure + integration; demonstrates compliance with the Electrical Equipment (Safety) Regulations 2016 + UKCA marking under the Low Voltage scheme.",
    "designImpact": "System must pass specified fire propagation, thermal runaway, and containment tests; dictates ventilation, fire detection/suppression integration.",
    "evidenceRequired": "Test report from UKAS-accredited lab demonstrating compliance with BS EN IEC 62933-5-2.",
    "status": "not-started",
    "ownerRole": "Product Safety Manager",
    "gapAction": "Identify UKAS-accredited test house and scope testing programme for system-level safety."
  },
  {
    "code": "BS 7671",
    "name": "Requirements for Electrical Installations (IET Wiring Regulations)",
    "summary": "UK wiring regulations for the fixed installation within the BESS container.",
    "applicability": "UK statutory — Internal low-voltage wiring + protection inside the container; BS 7671 IET Wiring Regulations are the de facto enforcement of the Electricity at Work Regulations 1989 (EAWR) for fixed installations.",
    "designImpact": "Design must comply with shock protection, earthing, overcurrent protection, and isolation requirements; may require RCD protection on auxiliary circuits.",
    "evidenceRequired": "Electrical installation certificate (EIC) signed by a competent person, plus schedule of inspections and test results.",
    "status": "not-started",
    "ownerRole": "Electrical Engineer",
    "gapAction": "Design internal distribution per BS 7671 and engage qualified electrician to produce EIC after installation."
  },
  {
    "code": "UN 38.3",
    "name": "UN Manual of Tests and Criteria, Part III, sub-section 38.3 — Lithium metal and lithium ion batteries",
    "summary": "Mandatory transport safety tests for lithium cells and batteries; required before shipping battery modules.",
    "applicability": "UK statutory — Battery cells/modules during transport (road/sea/air); UN 38.3 + ADR / Carriage of Dangerous Goods Regulations 2009 + IATA DGR for air freight.",
    "designImpact": "Cells must pass altitude simulation, thermal cycling, vibration, shock, overcharge, and forced discharge tests.",
    "evidenceRequired": "UN 38.3 test summary report from cell supplier or accredited lab; ADR dangerous goods note for road transport.",
    "status": "not-started",
    "ownerRole": "Supply Chain Manager",
    "gapAction": "Confirm cell supplier has valid UN 38.3 certification, and prepare ADR documentation for road shipment."
  },
  {
    "code": "NFPA 855",
    "name": "Standard for the Installation of Stationary Energy Storage Systems",
    "summary": "US reference standard often cited by UK insurers and NFCC guidance; not statutory in the UK.",
    "applicability": "Voluntary reference — Fire safety design; NFCC Grid Scale BESS Operational Guidance + insurer underwriting reference, NOT UK statute. UK statutory peer for system-level fire safety is BS EN IEC 62933-5-2.",
    "designImpact": "Spacing, fire suppression density, smoke control, and explosion prevention concepts can inform design but UK compliance is via BS EN IEC 62933-5-2.",
    "evidenceRequired": "Not mandated; insurer may request alignment report or justification.",
    "status": "not-started",
    "ownerRole": "Product Safety Manager",
    "gapAction": "Review NFPA 855 recommendations and incorporate where they strengthen the fire safety case; prepare statement for insurer if needed."
  },
  {
    "code": "ISO 1496-1",
    "name": "Series 1 freight containers — Specification and testing — Part 1: General cargo containers for general purposes",
    "summary": "Container structural certification under CSC; becomes invalid once container shell is structurally modified (vents, large openings, internal reinforcements).",
    "applicability": "Voluntary reference — Shipping container enclosure; the original CSC plate is voided once the shell is structurally modified (vents, large openings, bracing). Re-certification path is alternative structural compliance, not ISO 1496-1.",
    "designImpact": "Original CSC plate voided; design must rely on alternative structural certification (FEA to EN 1993 or new classification-society inspection).",
    "evidenceRequired": "Finite element analysis report or new structural certification under a recognised classification society.",
    "status": "not-started",
    "ownerRole": "Mechanical Design Lead",
    "gapAction": "Commission structural analysis of modified container per design loads and engage classification society for re-certification."
  }
]

Match this STYLE and DEPTH for any project. The fields applicability + designImpact + evidenceRequired + ownerRole + gapAction must be specific to the project's actual configuration — not generic boilerplate. For non-BESS projects the standards differ but the structure stays identical.`

    const userPrompt = `Subject: ${subject}

${priorBrief?.mission || priorBrief?.targetCustomers ? `Founder has already typed:\n${JSON.stringify(priorBrief, null, 2).slice(0, 1000)}\n\nPrefer these over anything the report implies.\n\n` : ""}Research report:
${trimmedReport}

Output JSON only.`

    return { systemPrompt, userPrompt }
}

async function callExtractionWithPrompts(
    systemPrompt: string,
    userPrompt: string,
): Promise<ExtractionResult> {
    // Loop 8 cost cut (2026-04-26 — Tristan flagged "very, very, very
    // expensive"): default to DeepSeek V4-Pro via OpenRouter (~10× cheaper
    // than claude-sonnet-4-6 for structured-JSON extraction).
    // Override to direct Anthropic by setting CHASE_EXTRACTION_VIA=anthropic.
    //
    // V4-Pro is documented safe for STRUCTURED reasoning ONLY (per memory
    // `v4_flash_production_gotchas.md` + `forgeos_specialist_model_swap_findings_20260425.md`).
    // The Chase extraction is structured JSON output, so it lands cleanly.
    // V4-Pro reasoning routes through OpenRouter using max_tokens 16384 to
    // accommodate the reasoning trace + JSON output budget.
    const route = process.env.CHASE_EXTRACTION_VIA ?? "openrouter"
    if (route === "openrouter") {
        const { callOpenRouter } = await import("@/lib/ai/openrouter")
        const result = await callOpenRouter({
            model: "deepseek/deepseek-v4-pro",
            system: systemPrompt,
            prompt: userPrompt,
            maxTokens: 16384,
            temperature: 0.1,
            timeoutMs: 240_000,
        })
        if (!result.ok) {
            console.warn(
                `[run-chase-research] OpenRouter V4-Pro failed (${result.error}); report still saved`,
            )
            return { ok: false, brief: null, tokensIn: 0, tokensOut: 0 }
        }
        const parsed = tryParseBriefJson(result.text)
        if (!parsed) {
            console.warn(
                "[run-chase-research] V4-Pro returned non-JSON; falling back to Sonnet",
            )
            // L9-P2: V4-Pro non-JSON → Sonnet fallback (was: silent fail).
            // Hedgerow + Vertfarm Briefs both hit this branch and persisted
            // empty regulatory.
            return await callExtractionViaAnthropic(
                systemPrompt,
                userPrompt,
                result.inputTokens,
                result.outputTokens,
            )
        }
        // L9-P2 (2026-04-26): V4-Pro is silently dropping the 5 matrix
        // columns (applicability / designImpact / evidenceRequired /
        // ownerRole / gapAction) under reasoning-trace pressure, even when
        // the prompt + few-shot demand them. Detect bibliography-shape
        // output and fall back to Sonnet, which preserves matrix shape.
        // Heuristic: regulatory has rows, but NONE carry any matrix field.
        const reg = (parsed as { regulatory?: unknown }).regulatory
        const hasMatrixShape =
            Array.isArray(reg) &&
            reg.length > 0 &&
            reg.some(
                (r) =>
                    r &&
                    typeof r === "object" &&
                    (typeof (r as Record<string, unknown>).applicability === "string" ||
                        typeof (r as Record<string, unknown>).designImpact === "string" ||
                        typeof (r as Record<string, unknown>).evidenceRequired === "string" ||
                        typeof (r as Record<string, unknown>).ownerRole === "string" ||
                        typeof (r as Record<string, unknown>).gapAction === "string"),
            )
        if (Array.isArray(reg) && reg.length > 0 && !hasMatrixShape) {
            console.warn(
                `[run-chase-research] V4-Pro emitted bibliography shape (${reg.length} rows, 0 matrix fields); falling back to Sonnet`,
            )
            return await callExtractionViaAnthropic(
                systemPrompt,
                userPrompt,
                result.inputTokens,
                result.outputTokens,
            )
        }
        return {
            ok: true,
            brief: parsed,
            tokensIn: result.inputTokens,
            tokensOut: result.outputTokens,
        }
    }
    return callExtractionViaAnthropic(systemPrompt, userPrompt, 0, 0)
}

/**
 * Sonnet-via-Anthropic extraction path. Used either as the primary route
 * (when CHASE_EXTRACTION_VIA=anthropic) or as a fallback from V4-Pro when
 * that route returns non-JSON or bibliography-shape regulatory.
 *
 * `priorTokensIn` / `priorTokensOut` accumulate the failed V4-Pro call's
 * token spend so the caller's total remains accurate.
 */
async function callExtractionViaAnthropic(
    systemPrompt: string,
    userPrompt: string,
    priorTokensIn: number,
    priorTokensOut: number,
): Promise<ExtractionResult> {
    try {
        // Loop 7+ fix (2026-04-26 NIGHT): bumped 4096 → 8192. The Loop 7
        // few-shot example block (UK-BESS regulatory matrix, ~3000 chars
        // with 8 standards × 9 fields each) inflates Sonnet's response
        // past 4096 tokens, truncating mid-JSON.
        const { text, tokensIn, tokensOut } = await callClaude(
            systemPrompt,
            userPrompt,
            "claude-sonnet-4-6",
            8192,
            120_000,
            1, // maxRetries — fail fast; extraction is a nice-to-have
        )
        const parsed = tryParseBriefJson(text)
        if (!parsed) {
            console.warn(
                "[run-chase-research] Sonnet extraction returned non-JSON; report still saved",
            )
            return {
                ok: false,
                brief: null,
                tokensIn: priorTokensIn + tokensIn,
                tokensOut: priorTokensOut + tokensOut,
            }
        }
        return {
            ok: true,
            brief: parsed,
            tokensIn: priorTokensIn + tokensIn,
            tokensOut: priorTokensOut + tokensOut,
        }
    } catch (err) {
        console.warn(
            "[run-chase-research] Sonnet extraction threw (non-fatal):",
            err instanceof Error ? err.message : err,
        )
        return {
            ok: false,
            brief: null,
            tokensIn: priorTokensIn,
            tokensOut: priorTokensOut,
        }
    }
}

/**
 * Loop 8 P5: harness-only parser export. The harness calls OpenRouter
 * directly with the same buildChaseExtractionPrompts output and feeds
 * the response text through this parser to get the same shape as the
 * production extractor. Async to satisfy the "use server" rule.
 */
export async function parseChaseExtraction(
    raw: string,
): Promise<Partial<CadLabDesignBrief> | null> {
    return tryParseBriefJson(raw)
}

/**
 * Best-effort JSON parse of the extraction result. Tolerates a fenced
 * code block (```json ... ```) wrapping so a slightly misbehaved model
 * still produces usable output. Returns null when the text isn't
 * salvageable — caller falls back to raw-report-only persistence.
 */
function tryParseBriefJson(raw: string): Partial<CadLabDesignBrief> | null {
    if (!raw || typeof raw !== "string") return null
    let candidate = raw.trim()
    // Strip ```json ... ``` fences.
    const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenceMatch && fenceMatch[1]) {
        candidate = fenceMatch[1].trim()
    }
    // Fall back to finding the first { ... } block if prose leaked in.
    if (!candidate.startsWith("{")) {
        const firstBrace = candidate.indexOf("{")
        const lastBrace = candidate.lastIndexOf("}")
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            candidate = candidate.slice(firstBrace, lastBrace + 1)
        }
    }
    try {
        const parsed = JSON.parse(candidate) as Record<string, unknown>
        return normaliseBriefShape(parsed)
    } catch {
        return null
    }
}

/**
 * Filters / coerces the parsed object to the CadLabDesignBrief shape.
 * We silently drop unknown keys and reject values of the wrong type so
 * a misbehaved model can't corrupt the jsonb column.
 */
function normaliseBriefShape(
    raw: Record<string, unknown>,
): Partial<CadLabDesignBrief> {
    const brief: Partial<CadLabDesignBrief> = {}

    if (typeof raw.mission === "string" && raw.mission.trim()) {
        brief.mission = raw.mission.trim()
    }
    if (typeof raw.targetCustomers === "string" && raw.targetCustomers.trim()) {
        brief.targetCustomers = raw.targetCustomers.trim()
    }
    if (typeof raw.whyNow === "string" && raw.whyNow.trim()) {
        brief.whyNow = raw.whyNow.trim()
    }
    if (typeof raw.useCase === "string" && raw.useCase.trim()) {
        brief.useCase = raw.useCase.trim()
    }

    if (raw.constraints && typeof raw.constraints === "object") {
        const c = raw.constraints as Record<string, unknown>
        const constraints: NonNullable<CadLabDesignBrief["constraints"]> = {}
        if (typeof c.unitCostCeilingGbp === "number" && Number.isFinite(c.unitCostCeilingGbp)) {
            constraints.unitCostCeilingGbp = c.unitCostCeilingGbp
        }
        if (typeof c.firstShipDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.firstShipDate)) {
            constraints.firstShipDate = c.firstShipDate
        }
        if (typeof c.maxMassKg === "number" && Number.isFinite(c.maxMassKg)) {
            constraints.maxMassKg = c.maxMassKg
        }
        if (typeof c.batchSize === "number" && Number.isFinite(c.batchSize)) {
            constraints.batchSize = c.batchSize
        }
        if (Array.isArray(c.markets)) {
            const markets = c.markets.filter(
                (m): m is string => typeof m === "string" && m.trim().length > 0,
            )
            if (markets.length > 0) constraints.markets = markets
        }
        if (typeof c.productionRegion === "string" && c.productionRegion.trim()) {
            constraints.productionRegion = c.productionRegion.trim()
        }
        if (Object.keys(constraints).length > 0) {
            brief.constraints = constraints
        }
    }

    if (Array.isArray(raw.regulatory)) {
        const regulatory = raw.regulatory
            .filter(
                (r): r is Record<string, unknown> =>
                    !!r && typeof r === "object",
            )
            .map((r) => {
                const code = typeof r.code === "string" ? r.code.trim() : ""
                const name = typeof r.name === "string" ? r.name.trim() : ""
                const summary = typeof r.summary === "string" ? r.summary.trim() : ""
                const statusRaw = typeof r.status === "string" ? r.status : ""
                const status: "met" | "in-progress" | "not-started" =
                    statusRaw === "met"
                        ? "met"
                        : statusRaw === "in-progress"
                            ? "in-progress"
                            : "not-started"
                // Loop 3 P4: extended compliance-matrix fields. Optional —
                // older Chase outputs that pre-date this change still
                // round-trip cleanly; the PDF renderer falls back to the
                // 1-line summary shape when these are absent.
                const extras: {
                    applicability?: string
                    designImpact?: string
                    evidenceRequired?: string
                    ownerRole?: string
                    gapAction?: string
                } = {}
                if (typeof r.applicability === "string" && r.applicability.trim().length > 0) {
                    extras.applicability = r.applicability.trim()
                }
                if (typeof r.designImpact === "string" && r.designImpact.trim().length > 0) {
                    extras.designImpact = r.designImpact.trim()
                }
                if (typeof r.evidenceRequired === "string" && r.evidenceRequired.trim().length > 0) {
                    extras.evidenceRequired = r.evidenceRequired.trim()
                }
                if (typeof r.ownerRole === "string" && r.ownerRole.trim().length > 0) {
                    extras.ownerRole = r.ownerRole.trim()
                }
                if (typeof r.gapAction === "string" && r.gapAction.trim().length > 0) {
                    extras.gapAction = r.gapAction.trim()
                }
                return { code, name, summary, status, ...extras }
            })
            .filter((r) => r.code.length > 0 && r.name.length > 0)
        if (regulatory.length > 0) {
            brief.regulatory = regulatory
        }
    }

    return brief
}

function mapDbStatusToChip(dbStatus: string): ChaseRunStatusChip {
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
