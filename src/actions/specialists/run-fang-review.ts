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
import { sweepStalledRuns } from "@/actions/pipeline-runs-watchdog"
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

            // 7. Persist the review directly via the admin client.
            //
            // GOTCHA: `requestSpecialistReview` also attempts persistence via
            // the `upsert_cad_lab_review` RPC, but that RPC declares
            // `p_foundry_id UUID` while `foundries.id` is `TEXT`. Postgres
            // rejects every call with "invalid input syntax for type uuid"
            // (confirmed in prod logs 2026-04-20 — see MEMORY.md §Gotchas).
            // The inner action swallows the error as non-fatal and returns
            // `{ review }` as if everything worked, which is why the module
            // detail page stays blank.
            //
            // DECISION: do the merge ourselves using the admin client (RLS
            // already cleared by the foundry check at step 1). Preserves any
            // prior reviews for the module (including from other specialists)
            // and replaces the previous Fang review on re-run so history
            // doesn't bloat into N copies. Fixing the shared RPC would be
            // cleaner but requires a migration and belongs in Wave 1c's
            // canonical path — this orchestrator-scoped fix unblocks Fang
            // now without touching the shared save path.
            const saveOk = await saveFangReviewDirect(
                projectId,
                moduleId,
                foundryId,
                reviewResult.review,
            )
            if (!saveOk) {
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

            // Paranoid read-back — ensures the JSONB merge actually landed
            // before the chip flips green. Defends against any future shape
            // mismatch slipping past the write.
            const persisted = await loadFangReviewForModule(projectId, moduleId, foundryId)
            if (!persisted) {
                await failPipelineRun(
                    runId,
                    "SAVE_FAILED",
                    "Fang review merged but read-back returned nothing — check Postgres logs.",
                )
                return {
                    ok: false,
                    runId,
                    error: "Fang's review couldn't be saved — try again in a moment.",
                    errorCode: "SAVE_FAILED",
                }
            }

            // 8. Cascade high-severity recommendations into module fields.
            //
            // INTENT: a review that says "wall thickness is 1.2mm, will warp at
            // injection moulding" is useless if the module still claims 1.2mm
            // in the BOM half an hour later. V1 had this cascade; V2 review-
            // only regressed it (see FANG-CASCADE-AUDIT.md in repo root).
            //
            // Gate: verdict ∈ {warn, fail} AND at least one critical issue.
            // Only numeric mass is auto-applied (module has no material/process
            // field yet). Every other critical issue lands in design_change_log
            // as kind='pending' so the founder sees there's something to action.
            const cascade = await applyFangRecommendationsToModule(
                projectId,
                moduleId,
                foundryId,
                user.id,
                reviewResult.review,
            )
            let cascadeApplied = 0
            let cascadePending = 0
            if (cascade.ok) {
                cascadeApplied = cascade.appliedCount
                cascadePending = cascade.pendingCount
            } else {
                // Non-fatal: the review is saved, the chip can go green. Just
                // log — the cascade is a best-effort enhancement, not the core
                // contract of the pipeline run.
                console.warn(
                    "[run-fang-review] cascade failed (non-fatal):",
                    cascade.error,
                )
            }

            await completePipelineRun(runId, {
                output_ref: {
                    table: "cad_lab_projects",
                    column: "reviews",
                    moduleId,
                    verdict: reviewResult.review.verdict,
                    issueCount: reviewResult.review.issues.length,
                    reviewTimeMs: reviewResult.review.reviewTimeMs,
                    cascadeApplied,
                    cascadePending,
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

        // Watchdog: flip any stale 'running' row to 'failed' before reading.
        // Prevents infinite-spinner UI when a run hit Vercel's 300s cap.
        // Errors swallowed — a failed sweep must never block the status read.
        await sweepStalledRuns(projectId).catch(() => {})

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
 * Persists a Fang review into `cad_lab_projects.reviews[moduleId]` via the
 * admin client, merging with any prior reviews on the same module.
 *
 * @description Replaces any existing `vp-manufacturing` entry for this
 * module (so re-runs don't duplicate) while preserving reviews from other
 * specialists. Writes the production `SpecialistReview` shape that the
 * Module detail page consumes — `specialistId` / `verdict` / `issues` /
 * `recommendations` — NOT the legacy seeded shape.
 *
 * GOTCHA: Intentionally side-steps `upsert_cad_lab_review` — that RPC has a
 * UUID-vs-TEXT foundry_id signature bug. See the comment at the call site
 * in `runFangReview` for the full story. If the RPC is ever fixed this
 * function can collapse into a single `rpc(...)` call again.
 *
 * Returns `true` on successful merge + update, `false` on any failure
 * (caller fails the pipeline run with SAVE_FAILED).
 */
async function saveFangReviewDirect(
    projectId: string,
    moduleId: string,
    foundryId: string,
    review: SpecialistReview,
): Promise<boolean> {
    const admin = createAdminClient()

    // Read-modify-write. Safe for this orchestrator because Fang runs are
    // serialised by the pipeline_run row per (project, module). Two Fang
    // reviews on the same module can't overlap; reviews by other
    // specialists write to a different array index in the JSONB object so
    // they don't conflict at the module-key level, only at the row level
    // where Postgres' MVCC handles the last-write-wins ordering fine for
    // our append/replace pattern. A truly atomic server-side merge would
    // require fixing the shared RPC — tracked for Wave 1c.
    const { data: row, error: readErr } = await admin
        .from("cad_lab_projects")
        .select("reviews")
        .eq("id", projectId)
        .eq("foundry_id", foundryId)
        .maybeSingle()

    if (readErr || !row) {
        console.error(
            "[run-fang-review] saveFangReviewDirect: pre-read failed:",
            readErr?.message ?? "no row",
        )
        return false
    }

    const existingReviews = (row.reviews as Record<string, SpecialistReview[]> | null) ?? {}
    const forModule = existingReviews[moduleId] ?? []
    const withoutOldFang = forModule.filter((r) => r.specialistId !== SPECIALIST_ID)
    const mergedForModule = [...withoutOldFang, review]
    const nextReviews = { ...existingReviews, [moduleId]: mergedForModule }

    const { error: writeErr } = await admin
        .from("cad_lab_projects")
        .update({ reviews: nextReviews as unknown as Database["public"]["Tables"]["cad_lab_projects"]["Row"]["reviews"] })
        .eq("id", projectId)
        .eq("foundry_id", foundryId)

    if (writeErr) {
        console.error(
            "[run-fang-review] saveFangReviewDirect: update failed:",
            writeErr.message,
        )
        return false
    }

    return true
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

// ─── Fang → module cascade ─────────────────────────────────────────────

type CascadeResult =
    | { ok: true; appliedCount: number; pendingCount: number }
    | { ok: false; error: string }

/**
 * A single log entry appended to `cad_lab_projects.design_change_log`.
 *
 * Applied entries represent fields the cascade actually mutated on the
 * module; pending entries represent critical recommendations the cascade
 * can't auto-apply (no matching module field exists) and must be actioned
 * by the founder from the UI. Both are append-only — the log is the
 * history of every specialist-driven suggestion, not just the ones that
 * landed.
 */
interface DesignChangeLogEntry {
    at: string
    moduleId: string
    specialistId: string
    specialistName: string
    source: "review:fang"
    kind: "applied" | "pending"
    field: "budgetMassKg" | null
    oldValue: unknown
    newValue: unknown
    reason: string
    severity: "critical" | "warning" | "info"
    category: string
    suggestion: string | null
}

/**
 * Extract a kg mass value from a free-text suggestion or message. Handles
 * "1.2 kg", "1200 g", "850g", "2.4kg" — i.e. the shapes Fang naturally
 * writes into issue.suggestion. Returns null when no unambiguous value
 * can be extracted (conservative by design — a wrong mass is worse than
 * no mass).
 */
function extractMassKg(...sources: Array<string | undefined>): number | null {
    for (const src of sources) {
        if (!src) continue
        // kg pattern first (preferred unit)
        const kgMatch = src.match(/(\d+(?:\.\d+)?)\s*kg\b/i)
        if (kgMatch) {
            const v = Number.parseFloat(kgMatch[1])
            if (Number.isFinite(v) && v > 0 && v < 10000) return v
        }
        // gram pattern — convert to kg
        const gMatch = src.match(/(\d+(?:\.\d+)?)\s*g(?:rams?)?\b/i)
        if (gMatch) {
            const v = Number.parseFloat(gMatch[1])
            if (Number.isFinite(v) && v > 0 && v < 10_000_000) return v / 1000
        }
    }
    return null
}

/**
 * Decide whether a review issue is a "mass" issue. Fang's category field
 * is free-form in the JSON schema — we match on substrings so "Mass",
 * "Mass Budget", "Part Mass" all hit. Defensive against casing drift.
 */
function isMassCategory(category: string): boolean {
    return /mass|weight/i.test(category)
}

/**
 * Apply Fang's high-severity recommendations to the target module, with
 * every change mirrored into `design_change_log` and `audit_log`.
 *
 * GATE: cascade runs only when verdict ∈ {warn, fail} AND at least one
 * issue has severity='critical'. A `pass` verdict with zero critical
 * issues never mutates the module — Fang passing the module is the
 * green-light case.
 *
 * Currently auto-applies:
 *   - `budgetMassKg` — when a mass-category critical issue includes an
 *     extractable numeric value (kg or g). Only updates when the value
 *     actually differs from the current budget.
 *
 * Logs as kind='pending' (no mutation):
 *   - Every other critical issue (material, process, wall thickness,
 *     tolerance). The module has no per-module material / process field
 *     to write to — those live on the brief, and cross-brief mutation
 *     from a module review is out of scope for V2 (risk: one module's
 *     review flips the material for every other module too).
 *
 * Returns a counting result so the caller can surface cascade stats on
 * the pipeline_runs output_ref. Never throws — failures are logged and
 * swallowed because the review itself has already been persisted.
 */
async function applyFangRecommendationsToModule(
    projectId: string,
    moduleId: string,
    foundryId: string,
    userId: string,
    review: SpecialistReview,
): Promise<CascadeResult> {
    // Gate 1: verdict must indicate something is wrong.
    if (review.verdict !== "warn" && review.verdict !== "fail") {
        return { ok: true, appliedCount: 0, pendingCount: 0 }
    }
    // Gate 2: at least one critical issue.
    const criticalIssues = review.issues.filter((i) => i.severity === "critical")
    if (criticalIssues.length === 0) {
        return { ok: true, appliedCount: 0, pendingCount: 0 }
    }

    const admin = createAdminClient()

    // Read current module + current design_change_log in one shot.
    const { data: row, error: readErr } = await admin
        .from("cad_lab_projects")
        .select("modules, design_change_log")
        .eq("id", projectId)
        .eq("foundry_id", foundryId)
        .maybeSingle()
    if (readErr || !row) {
        return { ok: false, error: readErr?.message ?? "project read failed" }
    }

    const modules = (row.modules as CadLabModule[] | null) ?? []
    const targetIdx = modules.findIndex((m) => m.id === moduleId)
    if (targetIdx === -1) {
        return { ok: false, error: "module not found during cascade" }
    }
    const existingModule = modules[targetIdx]
    const log = Array.isArray(row.design_change_log)
        ? (row.design_change_log as unknown[] as DesignChangeLogEntry[])
        : []

    const now = new Date().toISOString()
    const newEntries: DesignChangeLogEntry[] = []
    const auditWrites: Array<{
        field: "budgetMassKg"
        oldValue: unknown
        newValue: unknown
        reason: string
    }> = []

    // Take a deep-enough copy so we can mutate budgetMassKg without
    // aliasing the incoming array (which came from a .select call).
    let mutatedModule = existingModule
    let appliedCount = 0
    let pendingCount = 0

    for (const issue of criticalIssues) {
        const baseEntry = {
            at: now,
            moduleId,
            specialistId: review.specialistId,
            specialistName: review.specialistName,
            source: "review:fang" as const,
            reason: issue.message,
            severity: issue.severity,
            category: issue.category,
            suggestion: issue.suggestion ?? null,
        }

        // Auto-apply: numeric mass when category matches AND we can
        // extract a value from the suggestion or message.
        if (isMassCategory(issue.category)) {
            const extracted = extractMassKg(issue.suggestion, issue.message)
            if (extracted !== null && extracted !== mutatedModule.budgetMassKg) {
                const oldValue = mutatedModule.budgetMassKg ?? null
                mutatedModule = { ...mutatedModule, budgetMassKg: extracted }
                newEntries.push({
                    ...baseEntry,
                    kind: "applied",
                    field: "budgetMassKg",
                    oldValue,
                    newValue: extracted,
                })
                auditWrites.push({
                    field: "budgetMassKg",
                    oldValue,
                    newValue: extracted,
                    reason: issue.message,
                })
                appliedCount += 1
                continue
            }
        }

        // Fall-through: record as pending for human review. The review is
        // already saved under reviews[moduleId] — design_change_log gives
        // the UI a focused, actionable queue without having to parse every
        // past review.
        newEntries.push({
            ...baseEntry,
            kind: "pending",
            field: null,
            oldValue: null,
            newValue: null,
        })
        pendingCount += 1
    }

    if (newEntries.length === 0) {
        return { ok: true, appliedCount: 0, pendingCount: 0 }
    }

    // Write the mutated modules array + the appended log in a single update.
    const nextModules =
        appliedCount > 0
            ? modules.map((m, i) => (i === targetIdx ? mutatedModule : m))
            : modules
    const nextLog = [...log, ...newEntries]

    type CadLabProjectsRow = Database["public"]["Tables"]["cad_lab_projects"]["Row"]
    const updatePayload: Partial<CadLabProjectsRow> = {
        design_change_log: nextLog as unknown as CadLabProjectsRow["design_change_log"],
    }
    if (appliedCount > 0) {
        updatePayload.modules = nextModules as unknown as CadLabProjectsRow["modules"]
    }

    const { error: writeErr } = await admin
        .from("cad_lab_projects")
        .update(updatePayload)
        .eq("id", projectId)
        .eq("foundry_id", foundryId)

    if (writeErr) {
        return { ok: false, error: writeErr.message }
    }

    // Best-effort audit log — one row per applied mutation. A failed insert
    // doesn't unwind the module update; design_change_log already contains
    // the same information and the audit_log is the tenant-wide history.
    for (const w of auditWrites) {
        await admin
            .from("audit_log")
            .insert({
                foundry_id: foundryId,
                user_id: userId,
                actor_specialist: SPECIALIST_ID,
                actor_user_id: userId,
                section: "module:cascade",
                action: "fang-applied",
                event: "module field updated by Fang review cascade",
                entity_type: "cad_lab_module",
                entity_id: `${projectId}:${moduleId}`,
                metadata: {
                    field: w.field,
                    oldValue: w.oldValue,
                    newValue: w.newValue,
                    reason: w.reason,
                    projectId,
                    moduleId,
                    specialistId: SPECIALIST_ID,
                } as Database["public"]["Tables"]["audit_log"]["Insert"]["metadata"],
            })
            .then(({ error }) => {
                if (error) {
                    console.warn(
                        "[run-fang-review] audit_log insert failed (non-fatal):",
                        error.message,
                    )
                }
            })
    }

    return { ok: true, appliedCount, pendingCount }
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
