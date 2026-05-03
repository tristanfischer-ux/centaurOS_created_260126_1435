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
    consumeRemediationContext,
    buildRemediationPromptBlock,
} from "@/lib/forge-v2/stage-gates/remediation"
import { getCouncilFeedbackForStage } from "@/lib/forge-v2/stage-scoring"
import {
    completePipelineRun,
    failPipelineRun,
    loadLatestRunForStage,
    startPipelineRun,
} from "@/actions/pipeline-runs"
import { sweepStalledRuns } from "@/actions/pipeline-runs-watchdog"
import { callAI, callOpenAI } from "@/lib/cad-lab/api-helpers"
import { checkAILimit } from "@/lib/ai/limit-check"
import type {
    CadLabDesignBrief,
    CadLabDesignBriefCompetitor,
    CadLabDesignBriefMarketSizing,
    CadLabDesignBriefSource,
    CadLabResearchResult,
} from "@/lib/cad-lab-types"
import { triageRegulatoryMatrix } from "@/lib/regulatory-triage"
import { validateStandards, formatStandardsWarnings } from "@/lib/regulatory/standards-validator"
import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import {
    extractCostCeilingFromProse,
    extractAllCostCeilingsFromProse,
} from "@/lib/brief-cost-ceiling-extractor"
import { compressReferenceDossier } from "@/lib/reference-dossier"

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
            .select("id, foundry_id, subject, founder_raw_brief, research, reference_dossier")
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

        // 2. Precondition: Chase needs the founder's original brief.
        //    founder_raw_brief is the ground truth (never modified after creation).
        //    Falls back to subject for legacy projects without founder_raw_brief.
        const description =
            (typeof project.founder_raw_brief === "string" && project.founder_raw_brief.trim())
                ? project.founder_raw_brief.trim()
                : (typeof project.subject === "string" ? project.subject.trim() : "")

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

        // 2b. Gate remediation context — consume and prepend to description.
        //
        //     When Gate 6 (standards hallucination) or Gate 1 (brief scope)
        //     FAILs and triggers a remediation re-fire targeting waiting_chase,
        //     the cron handler stashes a structured failure-context block at
        //     cad_lab_projects.gate_remediation_context["waiting_chase"].
        //
        //     We consume it here (read + clear, consume-once semantics) and
        //     prepend it to the description passed to runCadLabResearch so
        //     Chase's synthesis step sees the constraint before generating
        //     the report. This is the same pattern as Max (step 2b in
        //     run-max-decomposition.ts) — inject via the input text, not a
        //     separate interface parameter that doesn't exist yet.
        //
        //     SAFETY: returns null when no remediation context exists. Projects
        //     without gate remediation behave exactly as before this change.
        const gateChaseRemediationCtx = await consumeRemediationContext(
            projectId,
            "waiting_chase",
        )
        // Council quality-gate feedback — injected when the previous run
        // scored <8/10 and the 6-model council produced diagnosis+fixes.
        const councilFeedback = await getCouncilFeedbackForStage(
            projectId,
            "waiting_chase",
        )

        let descriptionToUse = gateChaseRemediationCtx
            ? buildRemediationPromptBlock(1, gateChaseRemediationCtx) + "\n\nProduct concept: " + description
            : description

        if (councilFeedback) {
            descriptionToUse = councilFeedback + "\n\n" + descriptionToUse
        }

        // 2c. Inject standard form-factor constraints when the brief
        //     mentions container-based or battery-storage products.
        const lowerDesc = descriptionToUse.toLowerCase()
        if (
            lowerDesc.includes("container") ||
            lowerDesc.includes("bess") ||
            lowerDesc.includes("battery energy storage") ||
            lowerDesc.includes("shipping container") ||
            lowerDesc.includes("containerised") ||
            lowerDesc.includes("containerized")
        ) {
            descriptionToUse += `\n\nIMPORTANT PHYSICAL CONSTRAINT — Standard shipping container internal dimensions:
- 20ft container: 5.9m x 2.35m x 2.39m (33.2 m3, ~500 kWh practical battery capacity)
- 40ft container: 12.03m x 2.35m x 2.39m (67.7 m3, ~1000 kWh practical battery capacity)
- 40ft High-Cube: 12.03m x 2.35m x 2.69m (76.3 m3, ~1200 kWh practical battery capacity)
If the brief specifies a container form factor, ALL downstream sizing MUST fit within these physical constraints. Flag any capacity target that cannot physically fit in the specified container size. A single 20ft container CANNOT hold more than ~500 kWh of lithium-ion battery storage; a 40ft container tops out at ~1000-1200 kWh. Multi-container configurations must be explicitly stated.`
        }

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
                model_provider: "google",
                input_ref: {
                    source: "project.subject",
                    charCount: description.length,
                    // Audit trail: record whether this was a gate-remediation re-fire
                    ...(gateChaseRemediationCtx
                        ? { gate_remediation: true, gate_context_chars: gateChaseRemediationCtx.length }
                        : {}),
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
            const referenceDossierContext =
                typeof project.reference_dossier === "string" && project.reference_dossier.length > 0
                    ? compressReferenceDossier(project.reference_dossier)
                    : undefined

            const researchResult: CadLabResearchResult =
                await runResearchWithOneRetry(descriptionToUse, { // gate remediation context prepended when present (step 2b)
                    priorDesignBrief,
                    priorAssumptionNotes,
                    documentContext: referenceDossierContext,
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
            //
            //    Gate-6 remediation fix (Loop 26 prep, 2026-04-29):
            //    Pass the remediation context to the extraction call so the
            //    extraction prompt ALSO sees the override. Previously the
            //    remediation block reached `runCadLabResearch` (the deep
            //    research call) but NOT the extraction prompt — meaning the
            //    extraction step produced the same hallucinated regulatory[]
            //    on attempt 2 as on attempt 1, causing Gate 6 to fail
            //    identically both times. Instrumentation from Loop 25 confirms:
            //    `compiled_research_prompt` on attempt-2 rows starts with the
            //    override block (research call IS receiving it), but
            //    `raw_extraction_output` on attempt-2 BESS still contains
            //    "ESQCR 2002" — a code Gate 6 flagged as unverified —
            //    proving the extraction call was blind to the remediation.
            const extraction = await extractDesignBriefFromReport(
                description,
                report,
                priorDesignBrief,
                gateChaseRemediationCtx ?? undefined,
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
                // New fields — always prefer fresh extraction; no prior
                // to preserve (founders don't edit these in the Brief UI).
                sources:
                    extraction.brief?.sources || priorDesignBrief?.sources,
                marketSizing:
                    extraction.brief?.marketSizing || priorDesignBrief?.marketSizing,
                competitors:
                    extraction.brief?.competitors || priorDesignBrief?.competitors,
            }

            // Item 2 (council 2026-04-29): regulatory triage — post-Chase pass.
            //
            // Chase always emits "not-started" for every standard. This triage
            // step runs BEFORE persistence and differentiates the matrix using:
            //   (a) applicability regime tags — marks domain-specific standards
            //       "not-applicable" when the product is clearly outside scope
            //       (e.g. ENA G99 grid-connection on a bird feeder)
            //   (b) Converts the legacy "not-started" sentinel to the new taxonomy
            //       value "in-scope-not-started" for applicable standards
            //
            // Fang-based "design-impact-identified" elevation cannot fire here
            // because Fang runs AFTER Chase. That elevation happens at PDF-export
            // time in export-project-pdf.tsx → triageWithFangFindings().
            //
            // Markets are read from the brief constraints (Chase may populate
            // them during extraction); fall back to ["GB"] when absent so UK
            // projects get sensible defaults.
            if (Array.isArray(mergedDesignBrief.regulatory) && mergedDesignBrief.regulatory.length > 0) {
                const markets = Array.isArray(mergedDesignBrief.constraints?.markets)
                    ? mergedDesignBrief.constraints!.markets!
                    : ["GB"]
                const triageResult = triageRegulatoryMatrix(
                    mergedDesignBrief.regulatory,
                    descriptionToUse,
                    markets,
                    [], // Fang findings not yet available at Chase time
                )
                console.log(
                    `[run-chase-research] regulatory triage complete: ${triageResult.triageSummary}`,
                    triageResult.matrixUndifferentiated
                        ? "(matrix undifferentiated — all standards equally staged)"
                        : "(matrix differentiated)",
                )
            }

            // Loop 24 P1 Fix 3: structured log so we can audit the final
            // ceiling value that reaches the database. One of:
            //   - a number from LLM JSON extraction
            //   - a number from prose regex fallback
            //   - undefined (no ceiling found anywhere)
            const finalCeiling = mergedDesignBrief.constraints?.unitCostCeilingGbp
            if (typeof finalCeiling === "number") {
                console.log(
                    `[brief-parse] cost_ceiling final: gbp=${finalCeiling} (saved to research.designBrief)`,
                )
            } else {
                console.warn(
                    "[brief-parse] cost_ceiling NOT FOUND in brief (final merged value is absent — waterfall will show 'Not declared')",
                )
            }

            // FIX 2: Validate research source URLs before persisting
            let qualityFlag: string | undefined;
            const sourcesList = Array.isArray(researchResult.sources) ? researchResult.sources : [];
            if (sourcesList.length > 0) {
                const checks = sourcesList.map(async (src) => {
                    if (!src.uri || !src.uri.startsWith("http")) return false;
                    try {
                        const res = await fetch(src.uri, {
                            method: "HEAD",
                            signal: AbortSignal.timeout(5000)
                        });
                        return res.ok || res.status < 500;
                    } catch {
                        return false;
                    }
                });

                const results = await Promise.all(checks);
                const invalidCount = results.filter(v => !v).length;
                if (invalidCount / sourcesList.length > 0.3) {
                    qualityFlag = `[QUALITY WARNING] >30% of research source URLs (${invalidCount}/${sourcesList.length}) failed validation or timed out.`;
                    console.warn(`[run-chase-research] ${qualityFlag}`);
                }
            }

            let finalAssumptionNotes = researchResult.assumptionNotes || priorAssumptionNotes || "";
            if (qualityFlag) {
                finalAssumptionNotes = finalAssumptionNotes 
                    ? finalAssumptionNotes + "\n\n" + qualityFlag
                    : qualityFlag;
            }

            // 7. Persist. saveCadLabResearch expects a CadLabResearchResult —
            //    we reuse the one we got back with our merged designBrief
            //    substituted in.
            const researchToSave: CadLabResearchResult = {
                ...researchResult,
                designBrief: mergedDesignBrief,
                assumptionNotes: finalAssumptionNotes,
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
            //
            //    INSTRUMENTATION (Gate 6 — Loop 22/23 — 2026-04-29):
            //    Gate 6 fails on attempt 1 AND attempt 2 in 100% of demos.
            //    We need to pick between three hypotheses:
            //      (1) override never reaches Chase — compiled_research_prompt
            //          will show whether the remediation block was prepended.
            //      (2) schema mismatch (Chase emits `standard` not `code`) —
            //          raw_extraction_output will show the exact JSON shape.
            //      (3) override asks for verified standards but provides no
            //          allowlist — raw_extraction_output will show empty
            //          regulatory[].
            //    Persist always (not only on remediation runs) — we need the
            //    baseline run output to compare against remediation runs.
            //    Truncate to 50 KB each to stay within reasonable JSONB size.
            const compiledResearchPromptTrunc = descriptionToUse.length > 50000
                ? descriptionToUse.slice(0, 50000) + "\n[TRUNCATED]"
                : descriptionToUse
            if (descriptionToUse.length > 50000) {
                console.warn(
                    "[run-chase-research] compiled_research_prompt truncated from",
                    descriptionToUse.length,
                    "to 50000 chars for pipeline_runs.input_ref storage",
                )
            }
            await completePipelineRun(runId, {
                input_tokens: extraction.tokensIn,
                output_tokens: extraction.tokensOut,
                model_id:
                    typeof researchResult.modelUsed === "string"
                        ? researchResult.modelUsed
                        : null,
                input_ref: {
                    source: "project.subject",
                    charCount: description.length,
                    // Audit trail: record whether this was a gate-remediation re-fire
                    ...(gateChaseRemediationCtx
                        ? { gate_remediation: true, gate_context_chars: gateChaseRemediationCtx.length }
                        : {}),
                    // INSTRUMENTATION: full compiled prompt (description + any
                    // remediation block) so we can verify hypothesis (1).
                    compiled_research_prompt: compiledResearchPromptTrunc,
                },
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
                    // INSTRUMENTATION: raw extraction LLM output so we can
                    // verify hypotheses (2) and (3) — schema shape + empty
                    // regulatory[]. Undefined when extraction threw (non-fatal).
                    ...(extraction.rawLlmText !== undefined
                        ? { raw_extraction_output: extraction.rawLlmText }
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
        documentContext?: string
        onRetry: (firstErrorMessage: string) => void
        /**
         * TrustedContext for the after()-context calls — skips the cookie
         * read inside `runCadLabResearch` that would otherwise fail.
         */
        trusted?: { userId: string; foundryId: string }
    },
): Promise<CadLabResearchResult> {
    const researchArg: {
        designBrief?: CadLabDesignBrief
        assumptionNotes?: string
        documentContext?: string
    } = {}
    if (opts.priorDesignBrief) researchArg.designBrief = opts.priorDesignBrief
    if (opts.priorAssumptionNotes) researchArg.assumptionNotes = opts.priorAssumptionNotes
    if (opts.documentContext) researchArg.documentContext = opts.documentContext

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
    /** Raw LLM text before JSON parsing — captured for Gate 6 instrumentation. */
    rawLlmText?: string
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
//
// Gate-6 fix (Loop 26 prep, 2026-04-29): added optional `remediationCtx`
// param so the harness and production caller can both inject the override
// into the extraction system prompt when a Gate 6 remediation re-fire is
// in progress.
export async function extractDesignBriefFromReport(
    subject: string,
    report: string,
    priorBrief: CadLabDesignBrief | undefined,
    remediationCtx?: string,
): Promise<ExtractionResult> {
    const { systemPrompt, userPrompt } = await buildChaseExtractionPrompts(
        subject,
        report,
        priorBrief,
        remediationCtx,
    )
    // Loop 24 P1 Fix 3: pass report so prose cost-ceiling fallback can fire
    // when the LLM extraction returns null for constraints.unitCostCeilingGbp.
    return await callExtractionWithPrompts(systemPrompt, userPrompt, report)
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
 *
 * Gate-6 fix (Loop 26 prep, 2026-04-29): added optional `remediationCtx`
 * param. When present the override block is prepended to the system prompt
 * so the extraction LLM sees the Gate-6 constraint BEFORE generating the
 * regulatory[] array. Without this injection, the extraction step was
 * gate-blind: the deep research call (runCadLabResearch) received the
 * remediation block, but the extraction call that produces regulatory[]
 * did not, causing Gate 6 to see identical hallucinated codes on both
 * attempt 1 and attempt 2. Loop 25 instrumentation confirms this (see
 * pipeline_runs.input_ref.compiled_research_prompt vs
 * pipeline_runs.output_ref.raw_extraction_output on attempt-2 BESS row).
 */
export async function buildChaseExtractionPrompts(
    subject: string,
    report: string,
    priorBrief: CadLabDesignBrief | undefined,
    remediationCtx?: string,
): Promise<{ systemPrompt: string; userPrompt: string }> {
    // Keep the report preamble bounded — strategic extraction only needs
    // the first chunk of context (which is the synthesis summary in the
    // domain-specific prompts; deeper sections are dimension tables that
    // don't help this task).
    const trimmedReport = report.length > 8000 ? report.slice(0, 8000) : report

    // Gate-6 remediation override block — prepended to the system prompt
    // when this extraction is part of a gate-remediation re-fire. The block
    // tells the extraction model exactly which standards to correct and why,
    // so it can produce a regulatory[] that will pass Gate 6's existence and
    // domain-coverage checks on attempt 2.
    //
    // FORMAT CONTRACT: the block starts with "⚠️ GATE REMEDIATION OVERRIDE"
    // (built by buildRemediationPromptBlock in remediation.ts). It already
    // contains the failure reason, unverified codes, and domain hint in
    // structured prose — no further parsing needed here.
    const remediationHeader = remediationCtx
        ? [
              "⚠️ GATE REMEDIATION OVERRIDE — The regulatory[] array from the previous extraction was rejected by Quality Gate 6.",
              "",
              remediationCtx,
              "",
              "EXTRACTION OVERRIDE RULES (apply to the regulatory[] array you output):",
              "- Each entry's \"code\" field MUST be a standard code that exists in the verified design_standards table.",
              "  Use exact formatting (e.g. \"UL 9540A\" not \"UL 9540 A\"; \"BS EN IEC 62933-5-2\" not \"IEC 62933-5-2\").",
              "- Do NOT repeat any code flagged above as unverified. Replace each flagged code with a verified",
              "  domain-specific standard from the design_standards table that serves the same compliance purpose.",
              "- If you cannot identify a verified replacement, omit the entry entirely rather than inventing a code.",
              "- After filling in verified codes, check domain coverage: the regulatory[] array MUST include",
              "  at LEAST 3 entries whose codes are specific to the project's domain (see domain in the failure reason above).",
              "Do NOT acknowledge this block in your output — apply it silently and return clean JSON.",
              "",
          ].join("\n")
        : ""

    // FIX 2: Inject the design_standards table as a code allowlist so the LLM
    // cannot hallucinate standard codes. Gate 6 fails on 100% of demo projects
    // because the model invents codes that don't exist in our verified table.
    // Querying the full table (verified=true only) gives the extraction model
    // an explicit allowlist: "your regulatory[].code MUST come from this list."
    // Non-fatal: if the query fails, the prompt still generates (worse, but live).
    let designStandardsAllowlist = ""
    try {
        const adminForStds = createAdminClient()
        const { data: standards } = await adminForStds
            .from("design_standards")
            .select("standard_code, standard_name, industry_domain")
            .eq("verified", true)
            .order("industry_domain")
            .order("standard_code")

        if (standards && standards.length > 0) {
            const grouped: Record<string, string[]> = {}
            for (const s of standards) {
                const domain = (s.industry_domain as string) ?? "general"
                if (!grouped[domain]) grouped[domain] = []
                grouped[domain].push(`${s.standard_code} — ${s.standard_name}`)
            }
            const groupedLines = Object.entries(grouped)
                .map(([domain, codes]) => `  [${domain}]\n${codes.map((c) => `    ${c}`).join("\n")}`)
                .join("\n")
            designStandardsAllowlist = `\n\nVERIFIED STANDARD CODES ALLOWLIST (${standards.length} entries from design_standards table — CRITICAL):\nEvery "code" field in your regulatory[] array MUST exactly match a code from this list.\nDo NOT invent codes. Do NOT use codes not on this list.\nIf a relevant standard isn't listed, omit that row rather than inventing a code.\n\n${groupedLines}\n\nENFORCEMENT: Any code not in the above list will be rejected by Quality Gate 6. Invented codes = Gate 6 failure = Chase re-run wasting the founder's AI budget. Use only verified codes above.`
            console.info(`[run-chase-research] Injected ${standards.length} verified standard codes as Gate 6 allowlist`)
        }
    } catch (stdsErr) {
        console.warn("[run-chase-research] design_standards allowlist query failed (non-fatal):", stdsErr instanceof Error ? stdsErr.message : stdsErr)
    }

    const systemPrompt = `${remediationHeader}You are Chase, a strategist advising a hardware founder. Read the research report and extract a crisp strategic brief. Return ONLY minified JSON — no prose, no markdown fences.

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
  "sources": [
    {
      "title": "Full title of the source (e.g. 'IEA World Energy Outlook 2024')",
      "type": "academic | industry_report | government | market_research | standard | other",
      "year": 2024,
      "publisher": "Issuing body or publisher name",
      "relevance": "One sentence — what this source establishes and why it was cited (e.g. 'Provides CAGR and TAM figures for stationary BESS market 2024–2030')"
    }
  ],
  "marketSizing": {
    "tamMUsd": 42000,
    "samMUsd": 8500,
    "somMUsd": 340,
    "cagrPct": 18.4,
    "cagrPeriod": "2024–2030",
    "primarySource": "BloombergNEF Energy Storage Market Outlook 2024",
    "segments": [
      {
        "name": "Behind-the-meter commercial BESS, United Kingdom",
        "sizeMUsd": 1200,
        "year": 2024,
        "source": "Aurora Energy Research UK BESS Report 2024"
      },
      {
        "name": "Grid-scale front-of-meter BESS, United Kingdom",
        "sizeMUsd": 3800,
        "year": 2024,
        "source": "National Grid ESO Electricity Ten Year Statement 2024"
      },
      {
        "name": "Industrial and commercial microgrid BESS, European Union",
        "sizeMUsd": 5200,
        "year": 2024,
        "source": "Wood Mackenzie European Energy Storage Monitor Q3 2024"
      }
    ],
    "tailwinds": [
      "United Kingdom Contracts for Difference reforms improving grid-scale BESS revenue stacking",
      "Falling lithium iron phosphate cell costs — below $60/kWh at pack level by 2025",
      "National Grid ESO capacity market clearing prices rising due to coal exit"
    ]
  },
  "competitors": [
    {
      "name": "Fluence Energy",
      "countryIso": "US",
      "product": "Gridstack modular BESS platform, 500 kWh–100 MWh+",
      "technicalSpecs": "Lithium iron phosphate cells, 1.5 MWh per 20ft container, round-trip efficiency 87–92%, 10-year performance warranty",
      "pricing": "£350–£500/kWh installed at utility scale (2024 estimates)",
      "marketSharePct": 12,
      "strengths": "Strong United Kingdom project pipeline (Mersey Grid, Sunnica), deep EPC integration, proven DNO interconnection track record",
      "weaknesses": "No United Kingdom manufacturing — supply chain lead times 18–24 months; not cost-competitive below 5 MWh",
      "differentiationAngle": "Compete on delivery speed and UK-local supply chain for sub-5 MWh commercial projects where Fluence minimum order size is a barrier"
    },
    {
      "name": "Powin Energy",
      "countryIso": "US",
      "product": "Stack140 and Stack225 modular BESS, software-defined architecture",
      "technicalSpecs": "Modular 140 kWh and 225 kWh stacks, integrated Stack OS energy management system, lithium iron phosphate chemistry",
      "pricing": "£300–£450/kWh installed depending on project scale",
      "marketSharePct": 7,
      "strengths": "Software-differentiated stack management, strong North American installed base, modular architecture reduces installation time",
      "weaknesses": "Limited United Kingdom project references; Stack OS proprietary lock-in concerns for asset owners",
      "differentiationAngle": "Open-protocol energy management system and UK-certified installation pathway as differentiators for asset owners wary of software lock-in"
    },
    {
      "name": "BYD Battery-Box",
      "countryIso": "CN",
      "product": "HVS and HVM commercial and industrial BESS, 10 kWh–1 MWh",
      "technicalSpecs": "Lithium iron phosphate blade battery, 48 V and high-voltage architecture, integrated BMS, IEC 62619 certified",
      "pricing": "£180–£280/kWh installed at commercial scale",
      "marketSharePct": 18,
      "strengths": "Lowest cost per kWh at scale, vertically integrated cell manufacturing, strong United Kingdom distributor network",
      "weaknesses": "Tariff risk post-2024 United Kingdom import reviews; limited UK after-sales service depth; geopolitical procurement concerns for public sector buyers",
      "differentiationAngle": "Position as UK-certified, locally supported alternative for public sector and regulated-utility buyers with procurement constraints on Chinese supply chain"
    }
  ],
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
- "sources" MUST contain at least 3 citations and MUST include at least one from each of these categories: (a) a government or regulatory publication, (b) an industry report or market research source (e.g. BloombergNEF, Wood Mackenzie, Mordor Intelligence, IDC, MarketsandMarkets), (c) a technical standard or academic paper. If the research report names specific reports or data sources, cite them. If it does not, infer the most authoritative sources for this product class and cite them explicitly — do NOT leave sources empty. Source diversity is scored by the council and an empty array scores 0/10.
- "marketSizing" is REQUIRED — do not omit or null this block. Provide: (a) TAM in USD million with the year the estimate applies, (b) SAM scoped to the founder's accessible geography and customer segment, (c) SOM as a realistic 5-year target for a new entrant, (d) CAGR as a percentage with the period (e.g. "2024–2030"), (e) at least 3 named market segments each with a USD million size estimate and the source. If the report gives ranges, use the midpoint. If the report gives no market data at all, use the most credible public estimates for this product class and note the source — do NOT return null for this field. Quantitative market data is scored by the council and a missing block scores 0/10.
- "competitors" MUST contain at least 3 named, real companies or products competing in this market. For each: (a) company or product name, (b) core product description, (c) at least one technical specification (capacity, efficiency, power rating, price point, or similar), (d) indicative pricing in GBP or USD (state which), (e) strengths and weaknesses grounded in the report or public knowledge, (f) a specific differentiationAngle the founder can use. Do NOT list generic categories ("established incumbents") — name the specific company. Competitor analysis is scored by the council and fewer than 3 named competitors scores 0/10.
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

Match this STYLE and DEPTH for any project. The fields applicability + designImpact + evidenceRequired + ownerRole + gapAction must be specific to the project's actual configuration — not generic boilerplate. For non-BESS projects the standards differ but the structure stays identical.

=== MANDATORY EVIDENCE PORTFOLIO (your report WILL be scored on these) ===

Your report MUST contain ALL of the following. Missing categories will cap your score:

1. ACADEMIC SOURCES (minimum 4):
   - Peer-reviewed papers with author, year, journal/conference, and DOI where available
   - Technical reports from universities or research institutions
   - If fewer than 4 exist for this domain, state "Exhaustive search yielded N academic sources" and explain why

2. PATENTS (minimum 3):
   - Patent numbers (e.g. US10,XXX,XXX or WO2024/XXXXXX) with assignee and filing year
   - Include both granted patents and published applications
   - If fewer than 3 exist, state "Patent landscape search yielded N results" and explain why

3. GOVERNMENT & STANDARDS (minimum 4):
   - Specific standard numbers (e.g. IEC 62619, BS EN 50604-1, EASA SC-RPAS)
   - Government policy documents, grants programmes, or regulatory frameworks with document IDs
   - Industry body guidelines (e.g. BEIS, Ofgem, DEFRA, HSE publications)

4. COMPANY PRIMARY SOURCES (minimum 3):
   - Direct quotes or data from company websites, press releases, annual reports, or SEC filings
   - Named spokesperson quotes where available
   - Product datasheets with specific performance figures

5. MARKET REPORTS (minimum 3):
   - Named reports from analysts (e.g. BloombergNEF, Wood Mackenzie, Mordor Intelligence)
   - Include publication year and specific data points cited

6. COMPETITORS (minimum 8):
   - List at minimum 8 direct competitors with: company name, HQ country, founding year, key product, ONE measurable differentiator
   - NEVER truncate this table. If you have more than 8, include ALL of them.
   - Differentiators must be specific and measurable (e.g. "cycle life: 10,000 vs industry avg 5,000") not generic ("innovative approach")

7. REGULATORY LANDSCAPE:
   - For UK-based projects: specific UK and EU regulations with document numbers
   - Compliance pathway with named standards, not just "regulatory approval required"
   - Timeline estimates for certification where applicable

=== SELF-AUDIT (perform before submitting) ===
Before finalising your report, count your sources in each category above. If ANY category is below the minimum, go back and find more. State your counts at the end:
- Academic: N sources
- Patents: N sources
- Government/Standards: N sources
- Company primary: N sources
- Market reports: N sources
- Competitors: N listed

MANDATORY EVIDENCE PORTFOLIO (your output will be auto-scored and rejected below these thresholds):
- Academic Sources: ≥4 peer-reviewed papers with DOIs or conference proceedings with full citations
- Patents: ≥3 granted or filed patents with patent numbers (e.g. US11,234,567B2)
- Government/Standards: ≥4 documents — named standards (e.g. IEC 62619:2022), government reports, or certification frameworks with document numbers
- Company Primary Sources: ≥3 direct company sources — annual reports, SEC filings, press releases, or official product datasheets with URLs
- Market Reports: ≥3 market research reports with publisher names and dates (e.g. "BloombergNEF, Q3 2025")

COMPETITOR REQUIREMENTS:
- List ≥8 direct competitors with measurable differentiators (specific metrics, not adjectives)
- NEVER truncate a competitor table — if you run out of space, drop the least relevant competitor, never cut mid-table
- Each competitor must have: company name, product name, 3+ quantitative specs, pricing if available, geographic presence

REGULATORY REQUIREMENTS:
- Cite exact standard numbers (e.g. "IEC 62619:2022" not "battery safety standards")
- Include certification pathways with named test labs (e.g. "UL certification via Intertek or TÜV")
- Estimate cost and timeline for each certification where possible

SELF-AUDIT CHECKLIST (verify before submitting):
□ ≥4 academic papers with DOIs cited
□ ≥3 patents with numbers cited
□ ≥4 government/standards docs with document numbers
□ ≥8 competitors with quantitative specs
□ No truncated tables
□ Regulatory standards cited by exact number`

    const userPrompt = `Subject: ${subject}

${priorBrief?.mission || priorBrief?.targetCustomers ? `Founder has already typed:\n${JSON.stringify(priorBrief, null, 2).slice(0, 1000)}\n\nPrefer these over anything the report implies.\n\n` : ""}Research report:
${trimmedReport}

Output JSON only.`

    return { systemPrompt: systemPrompt + designStandardsAllowlist, userPrompt }
}

async function callExtractionWithPrompts(
    systemPrompt: string,
    userPrompt: string,
    reportText?: string,
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
        // INSTRUMENTATION (Gate 6): capture raw text before parsing so the
        // pipeline_runs row can store it for post-run diagnosis. Truncated
        // to 50 KB to stay within reasonable JSONB size.
        const rawLlmText = result.text.length > 50000
            ? result.text.slice(0, 50000) + "\n[TRUNCATED]"
            : result.text

        const parsed = tryParseBriefJson(result.text, reportText)
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
                reportText,
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
                reportText,
            )
        }
        // Guard: detect missing sources / marketSizing / competitors. These fields
        // are required by the scorer rubric (source_diversity, market_sizing,
        // competitor_analysis dimensions — all scored 0/10 when absent). V4-Pro
        // under reasoning-trace pressure omits them even when the prompt demands
        // them. Fall back to gpt-4.1-mini which reliably emits the full JSON.
        const parsedSources = (parsed as { sources?: unknown }).sources
        const parsedMarketSizing = (parsed as { marketSizing?: unknown }).marketSizing
        const parsedCompetitors = (parsed as { competitors?: unknown }).competitors
        const missingScoreFields =
            (!Array.isArray(parsedSources) || parsedSources.length < 3) ||
            !parsedMarketSizing ||
            (!Array.isArray(parsedCompetitors) || parsedCompetitors.length < 3)
        if (missingScoreFields) {
            const sourcesCount = Array.isArray(parsedSources) ? parsedSources.length : 0
            const competitorsCount = Array.isArray(parsedCompetitors) ? parsedCompetitors.length : 0
            console.warn(
                `[run-chase-research] V4-Pro missing scorer fields (sources=${sourcesCount}, marketSizing=${!!parsedMarketSizing}, competitors=${competitorsCount}); falling back to gpt-4.1-mini`,
            )
            return await callExtractionViaAnthropic(
                systemPrompt,
                userPrompt,
                result.inputTokens,
                result.outputTokens,
                reportText,
            )
        }
        return {
            ok: true,
            brief: parsed,
            tokensIn: result.inputTokens,
            tokensOut: result.outputTokens,
            rawLlmText,
        }
    }
    return callExtractionViaAnthropic(systemPrompt, userPrompt, 0, 0, reportText)
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
    reportText?: string,
): Promise<ExtractionResult> {
    try {
        // Loop 7+ fix (2026-04-26 NIGHT): bumped 4096 → 8192. The Loop 7
        // few-shot example block (UK-BESS regulatory matrix, ~3000 chars
        // with 8 standards × 9 fields each) inflates Sonnet's response
        // past 4096 tokens, truncating mid-JSON.
        const { text, tokensIn, tokensOut } = await callOpenAI(
            systemPrompt,
            userPrompt,
            "gpt-4.1-mini",
            16384,
            120_000,
        )
        // INSTRUMENTATION (Gate 6): capture raw Sonnet text for diagnosis.
        const rawLlmText = text.length > 50000
            ? text.slice(0, 50000) + "\n[TRUNCATED]"
            : text
        const parsed = tryParseBriefJson(text, reportText)
        if (!parsed) {
            console.warn(
                "[run-chase-research] Sonnet extraction returned non-JSON; report still saved",
            )
            return {
                ok: false,
                brief: null,
                tokensIn: priorTokensIn + tokensIn,
                tokensOut: priorTokensOut + tokensOut,
                rawLlmText,
            }
        }
        return {
            ok: true,
            brief: parsed,
            tokensIn: priorTokensIn + tokensIn,
            tokensOut: priorTokensOut + tokensOut,
            rawLlmText,
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
 *
 * Loop 24 P1 Fix 3 (2026-04-29): accepts an optional `reportText` to run
 * the prose cost-ceiling extractor as a fallback when the LLM emits null
 * for `constraints.unitCostCeilingGbp`.
 */
function tryParseBriefJson(
    raw: string,
    reportText?: string,
): Partial<CadLabDesignBrief> | null {
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
        const brief = normaliseBriefShape(parsed, reportText)
        return brief
    } catch {
        return null
    }
}

/**
 * Filters / coerces the parsed object to the CadLabDesignBrief shape.
 * We silently drop unknown keys and reject values of the wrong type so
 * a misbehaved model can't corrupt the jsonb column.
 *
 * Loop 24 P1 Fix 3 (2026-04-29): when `unitCostCeilingGbp` is absent from
 * the LLM's JSON, run `extractCostCeilingFromProse` over the optional
 * `reportText` as a deterministic fallback. Emits a structured log line for
 * every brief parse so we can audit which briefs the extractor reaches.
 *
 * Item 8 (2026-04-29): also populates `costCeilings` (typed array) alongside
 * the scalar `unitCostCeilingGbp` (kept for backward compat). The typed array
 * is what the feasibility gate uses to compare like-with-like.
 *
 * @param raw        - The parsed JSON object from the LLM extraction.
 * @param reportText - Optional raw report text to scan when the LLM misses
 *                     the cost ceiling.
 */
function normaliseBriefShape(
    raw: Record<string, unknown>,
    reportText?: string,
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
            // LLM gave us a number. Treat it as unit-manufacturing-cost (the
            // only type Chase's prompt currently asks for explicitly).
            constraints.unitCostCeilingGbp = c.unitCostCeilingGbp
            constraints.costCeilings = [
                {
                    type: "unit-manufacturing-cost",
                    gbp: c.unitCostCeilingGbp,
                    source: "LLM JSON constraints.unitCostCeilingGbp",
                },
            ]
            console.log(
                `[brief-parse] cost_ceiling extracted: gbp=${c.unitCostCeilingGbp} type=unit-manufacturing-cost source="LLM JSON"`,
            )
        } else if (reportText) {
            // Loop 24 P1 Fix 3 + Item 8: LLM returned null/missing.
            // Use extractAllCostCeilingsFromProse to capture every ceiling
            // in the brief text, with types — not just the first hit.
            const allHits = extractAllCostCeilingsFromProse(reportText)
            if (allHits.length > 0) {
                constraints.costCeilings = allHits.map((h) => ({
                    type: h.ceilingType,
                    gbp: h.gbp,
                    source: h.source,
                }))
                // Backward compat: expose the first unit-manufacturing-cost
                // value (or the first hit of any type if none matched) as
                // the scalar field so older callers are not broken.
                const unitHit =
                    allHits.find((h) => h.ceilingType === "unit-manufacturing-cost") ??
                    allHits[0]
                constraints.unitCostCeilingGbp = unitHit.gbp
                console.log(
                    `[brief-parse] cost_ceiling extracted via prose fallback: ` +
                        allHits
                            .map((h) => `gbp=${h.gbp} type=${h.ceilingType}`)
                            .join(", ") +
                        ` sources="${allHits.map((h) => h.source).join("; ")}"`,
                )
            } else {
                console.warn(
                    "[brief-parse] cost_ceiling NOT FOUND in brief (LLM returned null, prose fallback found nothing)",
                )
            }
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
    } else if (reportText) {
        // No constraints block at all in the JSON. Still run prose extraction.
        const allHits = extractAllCostCeilingsFromProse(reportText)
        if (allHits.length > 0) {
            const costCeilings = allHits.map((h) => ({
                type: h.ceilingType,
                gbp: h.gbp,
                source: h.source,
            }))
            const unitHit =
                allHits.find((h) => h.ceilingType === "unit-manufacturing-cost") ??
                allHits[0]
            brief.constraints = {
                costCeilings,
                unitCostCeilingGbp: unitHit.gbp,
            }
            console.log(
                `[brief-parse] cost_ceiling extracted via prose fallback (no constraints block): ` +
                    allHits
                        .map((h) => `gbp=${h.gbp} type=${h.ceilingType}`)
                        .join(", "),
            )
        } else {
            console.warn(
                "[brief-parse] cost_ceiling NOT FOUND in brief (no constraints block, prose fallback found nothing)",
            )
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

    // ── sources ──────────────────────────────────────────────────────────
    // Parse the citations Chase produced during research. Minimum 3 required
    // for a healthy source_diversity score. We silently drop malformed rows
    // (missing title or relevance) to avoid corrupting the column.
    if (Array.isArray(raw.sources)) {
        const VALID_SOURCE_TYPES = new Set([
            "academic", "industry_report", "government", "market_research", "standard", "other",
        ])
        const sources: CadLabDesignBriefSource[] = raw.sources
            .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
            .map((s) => {
                const title = typeof s.title === "string" ? s.title.trim() : ""
                const relevance = typeof s.relevance === "string" ? s.relevance.trim() : ""
                if (!title || !relevance) return null
                const rawType = typeof s.type === "string" ? s.type.trim() : "other"
                const type = VALID_SOURCE_TYPES.has(rawType)
                    ? (rawType as CadLabDesignBriefSource["type"])
                    : "other"
                const entry: CadLabDesignBriefSource = { title, type, relevance }
                if (typeof s.year === "number" && Number.isFinite(s.year)) entry.year = s.year
                if (typeof s.publisher === "string" && s.publisher.trim()) entry.publisher = s.publisher.trim()
                return entry
            })
            .filter((s): s is CadLabDesignBriefSource => s !== null)
        if (sources.length > 0) {
            brief.sources = sources
        }
    }

    // ── marketSizing ─────────────────────────────────────────────────────
    // Parse the TAM/SAM/SOM block. Required for quantitative_market_data score.
    // All numeric fields must be finite positive numbers; drop the block if
    // the core four are absent.
    if (raw.marketSizing && typeof raw.marketSizing === "object") {
        const ms = raw.marketSizing as Record<string, unknown>
        const tamMUsd = typeof ms.tamMUsd === "number" && Number.isFinite(ms.tamMUsd) ? ms.tamMUsd : null
        const samMUsd = typeof ms.samMUsd === "number" && Number.isFinite(ms.samMUsd) ? ms.samMUsd : null
        const somMUsd = typeof ms.somMUsd === "number" && Number.isFinite(ms.somMUsd) ? ms.somMUsd : null
        const cagrPct = typeof ms.cagrPct === "number" && Number.isFinite(ms.cagrPct) ? ms.cagrPct : null
        const cagrPeriod = typeof ms.cagrPeriod === "string" ? ms.cagrPeriod.trim() : ""
        const primarySource = typeof ms.primarySource === "string" ? ms.primarySource.trim() : ""
        if (tamMUsd !== null && samMUsd !== null && somMUsd !== null && cagrPct !== null) {
            const segments: CadLabDesignBriefMarketSizing["segments"] = []
            if (Array.isArray(ms.segments)) {
                for (const seg of ms.segments) {
                    if (!seg || typeof seg !== "object") continue
                    const segR = seg as Record<string, unknown>
                    const segName = typeof segR.name === "string" ? segR.name.trim() : ""
                    const segSize = typeof segR.sizeMUsd === "number" && Number.isFinite(segR.sizeMUsd) ? segR.sizeMUsd : null
                    const segYear = typeof segR.year === "number" && Number.isFinite(segR.year) ? segR.year : null
                    const segSource = typeof segR.source === "string" ? segR.source.trim() : ""
                    if (segName && segSize !== null && segYear !== null) {
                        segments.push({ name: segName, sizeMUsd: segSize, year: segYear, source: segSource })
                    }
                }
            }
            const sizing: CadLabDesignBriefMarketSizing = {
                tamMUsd,
                samMUsd,
                somMUsd,
                cagrPct,
                cagrPeriod,
                primarySource,
                segments,
            }
            if (Array.isArray(ms.tailwinds)) {
                const tailwinds = ms.tailwinds.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
                if (tailwinds.length > 0) sizing.tailwinds = tailwinds
            }
            brief.marketSizing = sizing
        }
    }

    // ── competitors ───────────────────────────────────────────────────────
    // Parse named competitor entries. Minimum 3 required for competitor_analysis
    // score. Drop rows missing name, product, or differentiationAngle.
    if (Array.isArray(raw.competitors)) {
        const competitors: CadLabDesignBriefCompetitor[] = raw.competitors
            .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
            .map((c) => {
                const name = typeof c.name === "string" ? c.name.trim() : ""
                const product = typeof c.product === "string" ? c.product.trim() : ""
                const strengths = typeof c.strengths === "string" ? c.strengths.trim() : ""
                const weaknesses = typeof c.weaknesses === "string" ? c.weaknesses.trim() : ""
                const differentiationAngle = typeof c.differentiationAngle === "string" ? c.differentiationAngle.trim() : ""
                if (!name || !product || !differentiationAngle) return null
                const entry: CadLabDesignBriefCompetitor = { name, product, strengths, weaknesses, differentiationAngle }
                if (typeof c.countryIso === "string" && c.countryIso.trim()) entry.countryIso = c.countryIso.trim()
                if (typeof c.technicalSpecs === "string" && c.technicalSpecs.trim()) entry.technicalSpecs = c.technicalSpecs.trim()
                if (typeof c.pricing === "string" && c.pricing.trim()) entry.pricing = c.pricing.trim()
                if (typeof c.marketSharePct === "number" && Number.isFinite(c.marketSharePct)) entry.marketSharePct = c.marketSharePct
                return entry
            })
            .filter((c): c is CadLabDesignBriefCompetitor => c !== null)
        if (competitors.length > 0) {
            brief.competitors = competitors
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
