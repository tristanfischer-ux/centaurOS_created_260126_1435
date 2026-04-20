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
        // 1. Load + verify project. Same rationale as Max's orchestrator —
        //    we use the admin client so RLS doesn't hide a project the
        //    caller DOES own from a different session angle, then we
        //    check foundry_id ourselves to block cross-tenant spoofs.
        const admin = createAdminClient()
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
                triggered_by: user.id,
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

        try {
            // 5. Delegate the heavy research lift to the canonical
            //    cad-lab action. It handles Gemini + Google Search,
            //    Thingiverse CAD lookup, domain detection, standards
            //    retrieval, and the Claude→OpenAI→Gemini synthesis
            //    fallback chain. We wrap it — don't duplicate it.
            const researchResult: CadLabResearchResult = await runCadLabResearch(
                description,
                priorDesignBrief
                    ? {
                          designBrief: priorDesignBrief,
                          assumptionNotes: priorAssumptionNotes,
                      }
                    : undefined,
            )

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
                // these from the extraction. Preserve any founder-set
                // values so a re-run doesn't overwrite a manual edit.
                mission:
                    priorDesignBrief?.mission || extraction.brief?.mission,
                targetCustomers:
                    priorDesignBrief?.targetCustomers ||
                    extraction.brief?.targetCustomers,
                whyNow:
                    priorDesignBrief?.whyNow || extraction.brief?.whyNow,
                constraints:
                    priorDesignBrief?.constraints || extraction.brief?.constraints,
                regulatory:
                    priorDesignBrief?.regulatory || extraction.brief?.regulatory,
            }

            // 7. Persist. saveCadLabResearch expects a CadLabResearchResult —
            //    we reuse the one we got back with our merged designBrief
            //    substituted in.
            const researchToSave: CadLabResearchResult = {
                ...researchResult,
                designBrief: mergedDesignBrief,
            }
            const saveResult = await saveCadLabResearch(projectId, researchToSave)
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
    })
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
async function extractDesignBriefFromReport(
    subject: string,
    report: string,
    priorBrief: CadLabDesignBrief | undefined,
): Promise<ExtractionResult> {
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
    { "code": "AS9100D", "name": "Quality management", "summary": "One line", "status": "not-started" }
  ]
}

Rules:
- Ground every field in the report. If the report doesn't mention a constraint, use null — do NOT invent numbers or dates.
- "regulatory" must reference standards the report or subject implies. Empty array is fine if no regulatory posture is obvious.
- British English ("programme" not "program"). First-person voice not required here — this is extraction, not narrative.
- Do NOT use the words "AI", "smart", or "intelligent" in the values. This lands in-product.
- Output must parse as JSON.`

    const userPrompt = `Subject: ${subject}

${priorBrief?.mission || priorBrief?.targetCustomers ? `Founder has already typed:\n${JSON.stringify(priorBrief, null, 2).slice(0, 1000)}\n\nPrefer these over anything the report implies.\n\n` : ""}Research report:
${trimmedReport}

Output JSON only.`

    try {
        const { text, tokensIn, tokensOut } = await callClaude(
            systemPrompt,
            userPrompt,
            "claude-sonnet-4-6",
            4096,
            120_000,
            1, // maxRetries — fail fast; extraction is a nice-to-have
        )

        const parsed = tryParseBriefJson(text)
        if (!parsed) {
            console.warn(
                "[run-chase-research] extraction returned non-JSON; report still saved",
            )
            return { ok: false, brief: null, tokensIn, tokensOut }
        }
        return { ok: true, brief: parsed, tokensIn, tokensOut }
    } catch (err) {
        console.warn(
            "[run-chase-research] extraction threw (non-fatal):",
            err instanceof Error ? err.message : err,
        )
        return { ok: false, brief: null, tokensIn: 0, tokensOut: 0 }
    }
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
                return { code, name, summary, status }
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
