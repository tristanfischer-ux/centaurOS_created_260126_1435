"use server"

/**
 * @file run-fang-review.ts — Fang (VP Manufacturing) per-module review orchestrator.
 *
 * @description The canonical entry point for running Fang over a single V2
 * module. Wraps the pre-existing `requestSpecialistReview` action (which
 * writes the verdict into `cad_lab_projects.reviews[moduleId]` via the
 * `upsert_cad_lab_review` RPC) in a `pipeline_runs` row so the Module detail
 * and Modules list pages can render an honest status chip.
 *
 * Single-module only. Keeps each run under ~45-60s — well inside Vercel's
 * 300s function cap. Fan-out across modules (all modules reviewed at once)
 * is out of scope for this orchestrator; founders trigger each Fang review
 * from the module detail page and a future wave can layer batch / auto
 * triggers on top once the unit price of one review is known.
 *
 * Stage: `module.review.fang`
 * Specialist: `vp-manufacturing`
 * Trigger: `manual` for now (future: `auto.bom-ready` when BOM fans out
 * to per-module Fang reviews on brief-lock).
 *
 * Error codes exposed to callers:
 *   - BUDGET_CAPPED        — tier AI budget exhausted
 *   - BUDGET_NOT_CHECKABLE — foundry tier / usage lookup threw
 *   - PROJECT_NOT_FOUND | PROJECT_FORBIDDEN — ownership guard failed
 *   - MODULE_NOT_FOUND     — moduleId doesn't exist on the project
 *   - MODULE_NO_PARTS      — module has no keyParts, BOM hasn't been generated
 *   - REVIEW_FAILED        — inner requestSpecialistReview returned `error`
 *   - SAVE_FAILED          — inner RPC failed to persist the review
 *   - INTERNAL             — unclassified throw
 *
 * @related
 *   - Pre-read: /tmp/forge-v2-pipeline-arch/PIPELINE-ARCHITECTURE.md §7 "Phase 3"
 *   - Inner engine: src/actions/cad-lab-reviews.ts (`requestSpecialistReview`)
 *   - Pipeline wrappers: src/actions/pipeline-runs.ts
 *   - Sibling orchestrator: src/actions/specialists/run-max-decomposition.ts
 *   - UI consumers: src/app/(platform)/the-forge-v2/projects/[id]/modules/
 */

import { requestSpecialistReview, type ReviewModuleInput } from "@/actions/cad-lab-reviews"
import {
    completePipelineRun,
    failPipelineRun,
    startPipelineRun,
} from "@/actions/pipeline-runs"
import { checkAILimit } from "@/lib/ai/limit-check"
import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import type {
    CadLabDesignBrief,
    CadLabModule,
    SpecialistReview,
} from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import type { Database } from "@/types/database.types"

// ─── Public types ──────────────────────────────────────────────────────

export type FangRunStatusChip =
    | "not-started"
    | "queued"
    | "running"
    | "done"
    | "failed"
    | "cancelled"

export interface RunFangReviewResult {
    ok: true
    runId: string
    moduleId: string
    verdict: SpecialistReview["verdict"]
}

export interface RunFangReviewError {
    ok: false
    error: string
    errorCode?: string
    runId?: string
}

export type RunFangReviewReturn = RunFangReviewResult | RunFangReviewError

export interface LoadFangRunStatusResult {
    status: FangRunStatusChip
    startedAt: string | null
    finishedAt: string | null
    errorCode: string | null
    errorMessage: string | null
    verdict: SpecialistReview["verdict"] | null
}

// ─── Constants ─────────────────────────────────────────────────────────

const SPECIALIST_ID = "vp-manufacturing"
const STAGE = "module.review.fang"

// ─── runFangReview ─────────────────────────────────────────────────────

/**
 * Runs Fang over a single module in the given project. Writes the review
 * through the existing `requestSpecialistReview` path and wraps the call in
 * a `pipeline_runs` row keyed on (specialist, stage, input_ref.moduleId) so
 * the per-module status chip always reflects reality.
 *
 * @param projectId - V2 project UUID
 * @param moduleId  - id of the module inside `project.modules[]`
 * @param trigger   - Why this run was kicked off
 */
export async function runFangReview(
    projectId: string,
    moduleId: string,
    trigger: "manual",
): Promise<RunFangReviewReturn> {
    return withAuth<RunFangReviewReturn>(async ({ user, foundryId }) => {
        // 1. Ownership + module existence checks. Uses the admin client for
        //    the same reason run-max-decomposition does — withAuth has already
        //    proven the caller is in foundryId, now we prove the project
        //    belongs to that foundry so we never leak cross-tenant state.
        const admin = createAdminClient()
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, subject, name, modules, research, diagnostic_answers")
            .eq("id", projectId)
            .maybeSingle()

        if (projectErr) {
            return { ok: false, error: "Couldn't load project", errorCode: "INTERNAL" }
        }
        if (!project) {
            return { ok: false, error: "Project not found", errorCode: "PROJECT_NOT_FOUND" }
        }
        if (project.foundry_id !== foundryId) {
            // SECURITY: don't leak the existence of other-foundry projects
            return { ok: false, error: "Project not found", errorCode: "PROJECT_FORBIDDEN" }
        }

        const modules = (project.modules as CadLabModule[] | null) ?? []
        const targetModule = modules.find((m) => m.id === moduleId)
        if (!targetModule) {
            return {
                ok: false,
                error: "That module isn't on this project — refresh and try again.",
                errorCode: "MODULE_NOT_FOUND",
            }
        }

        // 2. Fang needs keyParts to DFM-check anything. If the module is still
        //    at skeleton-only (no BOM yet), route the founder to generate BOM
        //    first rather than silently generating a vacuous review.
        if (!targetModule.keyParts || targetModule.keyParts.length === 0) {
            return {
                ok: false,
                error: "This module has no parts yet — generate BOM first so Fang has something to review.",
                errorCode: "MODULE_NO_PARTS",
            }
        }

        // 3. Pre-flight tier budget check. Same rationale as Max — the inner
        //    action re-checks, but surfacing BUDGET_CAPPED cleanly here lets
        //    the UI render a useful message instead of a generic failure
        //    after a pipeline_runs row has already been opened.
        try {
            const gate = await checkAILimit(foundryId)
            if (!gate.allowed) {
                return {
                    ok: false,
                    error: gate.message ?? "AI usage limit reached for this billing period.",
                    errorCode: "BUDGET_CAPPED",
                }
            }
        } catch (err) {
            console.error(
                "[run-fang-review] checkAILimit threw:",
                err instanceof Error ? err.message : err,
            )
            return {
                ok: false,
                error: "Couldn't verify your AI usage budget — try again in a moment.",
                errorCode: "BUDGET_NOT_CHECKABLE",
            }
        }

        // 4. Open pipeline_run row. Every exit path from here MUST complete
        //    or fail it so the chip can't hang at "running" forever.
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
                input_ref: { moduleId },
            })
            runId = started.runId
        } catch (err) {
            console.error(
                "[run-fang-review] startPipelineRun threw:",
                err instanceof Error ? err.message : err,
            )
            return {
                ok: false,
                error: "Couldn't start the pipeline run.",
                errorCode: "INTERNAL",
            }
        }

        try {
            // 5. Build the review request. We project modules into the
            //    lean ReviewModuleInput shape to stay well inside React
            //    Flight's 4MB serialization limit (see cad-lab-reviews.ts
            //    header comments around `LeanResultFields`).
            const designBrief = extractDesignBrief(
                project.research as { designBrief?: unknown } | null,
            )
            const diagnosticAnswers = extractDiagnosticAnswers(
                project.diagnostic_answers as unknown,
            )
            const projectSubject =
                typeof project.subject === "string" && project.subject.length > 0
                    ? project.subject
                    : typeof project.name === "string"
                        ? project.name
                        : "Project"

            const allModules: ReviewModuleInput[] = modules.map(toReviewModuleInput)

            // 6. Invoke the existing specialist-review engine.
            const reviewResult = await requestSpecialistReview({
                projectId,
                moduleId,
                specialistId: SPECIALIST_ID,
                allModules,
                designBrief: designBrief ?? undefined,
                diagnosticAnswers: diagnosticAnswers ?? undefined,
                projectSubject,
            })

            if ("error" in reviewResult) {
                await failPipelineRun(runId, "REVIEW_FAILED", reviewResult.error)
                return {
                    ok: false,
                    runId,
                    error: reviewResult.error,
                    errorCode: "REVIEW_FAILED",
                }
            }

            // 7. requestSpecialistReview already persists via the upsert RPC
            //    (with a non-fatal log on failure). Re-read the project to
            //    confirm the review landed before marking the run 'done' —
            //    otherwise a silent RPC failure would leave the chip green
            //    on a still-empty tile. If the read shows no Fang row we
            //    fail the pipeline_run honestly.
            const persisted = await loadFangReviewForModule(projectId, moduleId, foundryId)
            if (!persisted) {
                await failPipelineRun(
                    runId,
                    "SAVE_FAILED",
                    "Fang produced a review but it couldn't be persisted — check Postgres logs.",
                )
                return {
                    ok: false,
                    runId,
                    error: "Fang's review couldn't be saved — try again in a moment.",
                    errorCode: "SAVE_FAILED",
                }
            }

            await completePipelineRun(runId, {
                output_ref: {
                    table: "cad_lab_projects",
                    column: "reviews",
                    moduleId,
                    verdict: reviewResult.review.verdict,
                    issueCount: reviewResult.review.issues.length,
                    reviewTimeMs: reviewResult.review.reviewTimeMs,
                },
            })

            return {
                ok: true,
                runId,
                moduleId,
                verdict: reviewResult.review.verdict,
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown review error"
            console.error("[run-fang-review] unexpected throw:", message)
            try {
                await failPipelineRun(runId, "INTERNAL", message)
            } catch (failErr) {
                console.error(
                    "[run-fang-review] failPipelineRun also threw:",
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

// ─── loadFangRunStatus ─────────────────────────────────────────────────

/**
 * Reads the latest Fang `pipeline_runs` row for the given (project, module)
 * pair and returns a chip-friendly shape. Used by the Module detail loader.
 *
 * Returns `not-started` when no row exists. The orchestrator is safe to
 * call from that state — it opens the first row atomically.
 */
export async function loadFangRunStatus(
    projectId: string,
    moduleId: string,
): Promise<LoadFangRunStatusResult> {
    return withAuth<LoadFangRunStatusResult>(async ({ foundryId }) => {
        const empty: LoadFangRunStatusResult = {
            status: "not-started",
            startedAt: null,
            finishedAt: null,
            errorCode: null,
            errorMessage: null,
            verdict: null,
        }

        const admin = createAdminClient()
        const { data: project } = await admin
            .from("cad_lab_projects")
            .select("foundry_id")
            .eq("id", projectId)
            .maybeSingle()
        if (!project || project.foundry_id !== foundryId) {
            return empty
        }

        const row = await loadLatestFangRun(projectId, moduleId)
        if (!row) return empty

        return {
            status: mapDbStatusToChip(row.status),
            startedAt: row.started_at,
            finishedAt: row.finished_at,
            errorCode: row.error_code,
            errorMessage: row.error_message,
            verdict: extractVerdictFromOutputRef(row.output_ref),
        }
    })
}

// ─── loadFangRunStatusesForProject ─────────────────────────────────────

/**
 * Batch loader — returns the latest Fang run per moduleId for a single
 * project. Used by the Modules list page so we stay at ONE DB round-trip
 * regardless of N modules.
 *
 * Per MEMORY.md §Vercel: Vercel Pro caps maxDuration at 300s, and any
 * N-queries-per-card loader is the first thing to blow past that budget
 * once projects get to 20+ modules. One query beats N every time.
 *
 * Returns a Map<moduleId, LoadFangRunStatusResult>. Module ids with no row
 * are omitted — callers should treat "missing" as "not-started".
 */
export async function loadFangRunStatusesForProject(
    projectId: string,
): Promise<Record<string, LoadFangRunStatusResult>> {
    return withAuth<Record<string, LoadFangRunStatusResult>>(async ({ foundryId }) => {
        const out: Record<string, LoadFangRunStatusResult> = {}

        const admin = createAdminClient()
        const { data: project } = await admin
            .from("cad_lab_projects")
            .select("foundry_id")
            .eq("id", projectId)
            .maybeSingle()
        if (!project || project.foundry_id !== foundryId) {
            return out
        }

        // Single query: all Fang runs for this project, newest first.
        // We dedupe in-memory to the latest per moduleId. Postgres
        // DISTINCT ON would be cleaner but PostgREST doesn't expose it.
        const { data: rows, error } = await admin
            .from("pipeline_runs")
            .select("*")
            .eq("project_id", projectId)
            .eq("specialist_id", SPECIALIST_ID)
            .eq("stage", STAGE)
            .order("created_at", { ascending: false })
            .limit(500) // hard ceiling — a project that exceeds this has bigger issues

        if (error) {
            console.error(
                "[run-fang-review] loadFangRunStatusesForProject query failed:",
                error.message,
            )
            return out
        }

        for (const row of rows ?? []) {
            const moduleId = extractModuleIdFromInputRef(row.input_ref)
            if (!moduleId) continue
            if (out[moduleId]) continue // we already have the latest for this module
            out[moduleId] = {
                status: mapDbStatusToChip(row.status),
                startedAt: row.started_at,
                finishedAt: row.finished_at,
                errorCode: row.error_code,
                errorMessage: row.error_message,
                verdict: extractVerdictFromOutputRef(row.output_ref),
            }
        }

        return out
    })
}

// ─── Internals ─────────────────────────────────────────────────────────

/**
 * Project a full CadLabModule into the lean ReviewModuleInput shape that
 * `requestSpecialistReview` expects. The cad-lab-reviews file has a detailed
 * explanation of why we drop image/result binaries here (React Flight 4MB).
 */
function toReviewModuleInput(m: CadLabModule): ReviewModuleInput {
    const leanResult = m.result
        ? {
              bbox: m.result.bbox,
              massGrams: m.result.massGrams,
              volumeMm3: m.result.volumeMm3,
              fillRatio: m.result.fillRatio,
              massProperties: m.result.massProperties,
              dfm: m.result.dfm,
              validationWarnings: m.result.validationWarnings,
              assumptions: m.result.assumptions,
          }
        : undefined
    return {
        id: m.id,
        name: m.name,
        purpose: m.purpose,
        status: m.status,
        leadWeeks: m.leadWeeks,
        keyParts: m.keyParts,
        inputs: m.inputs,
        outputs: m.outputs,
        description: m.description,
        whyItMatters: m.whyItMatters,
        failureModes: m.failureModes,
        unknowns: m.unknowns,
        ...(m.interfaceDefinition ? { interfaceDefinition: m.interfaceDefinition } : {}),
        ...(leanResult ? { result: leanResult } : {}),
    }
}

/**
 * Pulls the designBrief off the project.research JSONB. Returns undefined
 * (and lets the review proceed without it) if the shape doesn't match —
 * designBrief is optional context, not a hard requirement.
 */
function extractDesignBrief(
    research: { designBrief?: unknown } | null,
): CadLabDesignBrief | null {
    if (!research || typeof research !== "object") return null
    const db = (research as { designBrief?: unknown }).designBrief
    if (!db || typeof db !== "object") return null
    return db as CadLabDesignBrief
}

/**
 * Pulls per-module diagnostic answers off the project JSONB. The shape
 * stored in DB matches DiagnosticAnswers exactly — Record<moduleId, Record<questionId, answer>>.
 */
function extractDiagnosticAnswers(raw: unknown): DiagnosticAnswers | null {
    if (!raw || typeof raw !== "object") return null
    return raw as DiagnosticAnswers
}

/**
 * Reads the saved Fang review back off the project row. Returns null
 * when the reviews JSONB doesn't contain a vp-manufacturing entry for
 * this module. Used to verify persistence before marking the pipeline
 * run 'done'.
 */
async function loadFangReviewForModule(
    projectId: string,
    moduleId: string,
    foundryId: string,
): Promise<SpecialistReview | null> {
    const admin = createAdminClient()
    const { data, error } = await admin
        .from("cad_lab_projects")
        .select("reviews")
        .eq("id", projectId)
        .eq("foundry_id", foundryId)
        .maybeSingle()
    if (error || !data) return null
    const reviews = data.reviews as Record<string, SpecialistReview[]> | null
    if (!reviews) return null
    const forModule = reviews[moduleId] ?? []
    return forModule.find((r) => r.specialistId === SPECIALIST_ID) ?? null
}

type PipelineRunRow = Database["public"]["Tables"]["pipeline_runs"]["Row"]

async function loadLatestFangRun(
    projectId: string,
    moduleId: string,
): Promise<PipelineRunRow | null> {
    const admin = createAdminClient()
    // input_ref is JSONB — PostgREST exposes containment via `cs` (contains).
    const { data } = await admin
        .from("pipeline_runs")
        .select("*")
        .eq("project_id", projectId)
        .eq("specialist_id", SPECIALIST_ID)
        .eq("stage", STAGE)
        .contains("input_ref", { moduleId })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    return data
}

function extractModuleIdFromInputRef(raw: unknown): string | null {
    if (!raw || typeof raw !== "object") return null
    const v = (raw as { moduleId?: unknown }).moduleId
    return typeof v === "string" && v.length > 0 ? v : null
}

function extractVerdictFromOutputRef(raw: unknown): SpecialistReview["verdict"] | null {
    if (!raw || typeof raw !== "object") return null
    const v = (raw as { verdict?: unknown }).verdict
    if (v === "pass" || v === "warn" || v === "fail") return v
    return null
}

function mapDbStatusToChip(dbStatus: string): FangRunStatusChip {
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
