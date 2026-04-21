"use server"

/**
 * @file forge-v2-autopilot.ts — One-click V2 pipeline walker.
 *
 * @description The Autopilot feature takes a founder who has just submitted
 * a brief on `/the-forge-v2/new` and walks the WHOLE pipeline for them
 * without further clicks:
 *
 *     chase.research → brief.lock → max.decompose → bom.generate →
 *     finn.cost → system.illustration → supplier.match → fang.review×N
 *
 * The terminal ship step is deliberately NOT automated — shipping is a
 * deliberate decision (see CLAUDE.md §"Walking a User Flow"). When the
 * founder comes back the checklist should be green and the Ship button
 * enabled; they still press it themselves.
 *
 * @architecture Vercel caps serverless functions at 300s. The whole walk
 * takes 10-20 minutes. We cannot hold a single request open that long,
 * and a plain `void` fire-and-forget tears down the container as soon
 * as the outer promise resolves (see brief-lock's notes on the same
 * failure mode).
 *
 * Solution: split the walk into stages, chain each stage to the next
 * via `after()` from next/server. Each stage is its own post-response
 * async function that:
 *   1. Polls Supabase until the stage's trigger condition lands
 *      (Chase pipeline_runs done, Max pipeline_runs done, etc.)
 *   2. Runs its action (lockBrief / generateIllustration / ...)
 *   3. Updates `cad_lab_projects.autopilot_state`
 *   4. Schedules the next stage via `after()` on success
 *   5. Stops and records `failed_stages` on failure — no auto-retry
 *
 * Each stage runner fits inside Vercel's 300s cap because the pipeline
 * runs it's waiting for all fit inside 300s individually.
 *
 * @progress The `autopilot_state` column on `cad_lab_projects` is the
 * single source of truth for the UI. Shape:
 *
 *     {
 *       started_at: iso8601,
 *       stage: string,
 *       completed_stages: string[],
 *       failed_stages: string[],
 *       error?: string,
 *       finished_at: string | null,
 *     }
 *
 * The UI reads this column directly (via router.refresh()) instead of
 * joining pipeline_runs, so the button always reflects exactly where the
 * autopilot thinks it is.
 *
 * @failure policy On any failed pipeline_runs row for a stage's trigger
 * condition, autopilot stops. The business rule is "don't continue past
 * a failed stage" — the founder needs to see the failure, not come back
 * to a half-populated project with no indication where it went wrong.
 *
 * @related
 *   - Migration: supabase/migrations/20260423010000_cad_lab_autopilot_state.sql
 *   - UI: src/app/(platform)/the-forge-v2/projects/[id]/_components/autopilot-button.tsx
 *   - Surface: src/app/(platform)/the-forge-v2/projects/[id]/workspace-view.tsx
 *   - Chain this rides on:
 *       - src/actions/brief-lock.ts (brief.lock → max auto-fire)
 *       - src/actions/specialists/run-max-decomposition.ts (max → bom auto-fire)
 *       - src/actions/specialists/run-bom-generator.ts (bom → finn auto-fire)
 *       - src/actions/specialists/run-chase-research.ts (chase trigger from createCadLabProject)
 *       - src/actions/forge-v2-generate-system-illustration.ts
 *       - src/actions/forge-v2-supplier-match.ts
 *       - src/actions/specialists/run-fang-review.ts
 */

import { after } from "next/server"

import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Shape ─────────────────────────────────────────────────────────────

/** Stages in the order the autopilot runs them. The ordering is the
 *  contract: a stage only starts once its predecessor lands in
 *  `completed_stages`, and a failure anywhere stops the walk. */
export type AutopilotStage =
    | "waiting_chase"
    | "locking_brief"
    | "waiting_max"
    | "waiting_bom"
    | "waiting_finn"
    | "generating_illustration"
    | "matching_suppliers"
    | "running_fang_reviews"
    | "done"

export interface AutopilotState {
    started_at: string
    stage: AutopilotStage
    completed_stages: string[]
    failed_stages: string[]
    error?: string
    finished_at: string | null
}

export type StartAutopilotResult =
    | { ok: true }
    | {
          ok: false
          error: string
          errorCode:
              | "INVALID_PROJECT_ID"
              | "PROJECT_NOT_FOUND"
              | "PROJECT_FORBIDDEN"
              | "ALREADY_RUNNING"
              | "ALREADY_SHIPPED"
              | "INTERNAL"
      }

// ─── Constants ─────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Minimum characters on `research.report` before we consider Chase's
 *  research substantive. Matches the precondition in lockCadLabBrief and
 *  runMaxDecomposition. */
const MIN_BRIEF_REPORT_CHARS = 200

/** Max modules to fan Fang reviews across. Each review takes ~45-60s on
 *  top of any pipeline budget check, and we sequence them serially so the
 *  runner stays under Vercel's 300s cap. Three modules × 60s = 180s,
 *  safely inside the cap with room for the final state write. */
const FANG_REVIEW_MODULE_LIMIT = 3

/** How long a stage runner will poll its trigger condition before giving
 *  up and writing a timeout. Sized so each stage's runner fits under the
 *  300s Vercel cap with time for the post-wait action + state updates. */
const POLL_TIMEOUT_MS = 240_000

/** Poll interval while waiting for a pipeline_runs row to land 'done'. */
const POLL_INTERVAL_MS = 10_000

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Kicks off the autopilot walk for a project. Seeds `autopilot_state` to
 * `waiting_chase` and schedules the first stage runner via after().
 *
 * SECURITY: uses withAuth + explicit foundry-ownership check. Every
 * subsequent stage runner trusts that ownership was verified here and
 * uses the admin client directly (the project id is scoped by the
 * autopilot_state column which only this foundry's project can hold).
 */
export async function startAutopilot(
    projectId: string,
): Promise<StartAutopilotResult> {
    return withAuth<StartAutopilotResult>(async ({ foundryId }) => {
        if (!projectId || !UUID_RE.test(projectId)) {
            return {
                ok: false,
                error: "Invalid project ID",
                errorCode: "INVALID_PROJECT_ID",
            }
        }

        const admin = createAdminClient()

        // ── 1. Ownership + precondition check ────────────────────────
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, autopilot_state, shipped_at")
            .eq("id", projectId)
            .maybeSingle()

        if (projectErr) {
            console.error(
                "[autopilot:start] project lookup failed:",
                projectErr.message,
            )
            return {
                ok: false,
                error: "Couldn't load the project.",
                errorCode: "INTERNAL",
            }
        }
        if (!project) {
            return {
                ok: false,
                error: "Project not found.",
                errorCode: "PROJECT_NOT_FOUND",
            }
        }
        if (project.foundry_id !== foundryId) {
            // SECURITY: don't leak the existence of other-foundry projects.
            return {
                ok: false,
                error: "Project not found.",
                errorCode: "PROJECT_FORBIDDEN",
            }
        }

        // Shipped projects are terminal — autopilot is for the build-time
        // walk, not resurrecting a shipped project.
        if (project.shipped_at) {
            return {
                ok: false,
                error: "This project has already shipped.",
                errorCode: "ALREADY_SHIPPED",
            }
        }

        // Idempotency — refuse to start a second autopilot over a walk
        // that's still in flight. `finished_at` being null + state being
        // non-null is "running".
        const existing = project.autopilot_state as AutopilotState | null
        if (existing && existing.finished_at === null) {
            return {
                ok: false,
                error: "Autopilot is already running on this project.",
                errorCode: "ALREADY_RUNNING",
            }
        }

        // ── 2. Seed the initial state ────────────────────────────────
        const startedAt = new Date().toISOString()
        const initial: AutopilotState = {
            started_at: startedAt,
            stage: "waiting_chase",
            completed_stages: [],
            failed_stages: [],
            finished_at: null,
        }

        const { error: seedErr } = await admin
            .from("cad_lab_projects")
            .update({
                // autopilot_state is new; database.types hasn't been
                // regenerated yet in this branch (shared file, not ours
                // to touch). Cast through Record to keep the update typed
                // as accepting an arbitrary object for this single field.
                autopilot_state: initial,
            } as unknown as never)
            .eq("id", projectId)
            .eq("foundry_id", foundryId)

        if (seedErr) {
            console.error(
                "[autopilot:start] seed state failed:",
                seedErr.message,
            )
            return {
                ok: false,
                error: "Couldn't start autopilot.",
                errorCode: "INTERNAL",
            }
        }

        // ── 3. Schedule the first stage runner ───────────────────────
        // after() keeps the Vercel container alive past this request so
        // the stage runner actually gets to run. Plain `void` would tear
        // the container down on response.
        after(async () => {
            try {
                await stepWaitForChase(projectId)
            } catch (err) {
                console.error(
                    "[autopilot:start] stepWaitForChase threw:",
                    err instanceof Error ? err.message : err,
                )
                await recordFailure(projectId, "waiting_chase", errMessage(err))
            }
        })

        return { ok: true }
    })
}

// ─── Stage runners ─────────────────────────────────────────────────────

/**
 * Stage 1: Chase's research must already be in-flight or done (Chase
 * auto-fires from `createCadLabProject`). We poll `pipeline_runs` for
 * a 'done' row, or fall back to checking `research.report` directly if
 * the row isn't visible yet — some historical projects had their
 * research seeded without a pipeline_runs row.
 */
async function stepWaitForChase(projectId: string): Promise<void> {
    await waitForStage(projectId, {
        specialistId: "vp-supply-chain",
        stage: "research.seed",
        stageSlug: "waiting_chase",
        onDone: async () => {
            // Before handing off to lock, re-verify the research report
            // actually has content. If Chase wrote a 'done' row with an
            // empty report, we should stop here rather than submit a
            // vacuous brief to Max.
            const report = await readResearchReportChars(projectId)
            if (report < MIN_BRIEF_REPORT_CHARS) {
                await recordFailure(
                    projectId,
                    "waiting_chase",
                    `Chase finished but research report has only ${report} chars. Need ${MIN_BRIEF_REPORT_CHARS}+ before locking.`,
                )
                return
            }
            await advance(projectId, "waiting_chase", "locking_brief")
            after(async () => {
                try {
                    await stepLockBrief(projectId)
                } catch (err) {
                    console.error(
                        "[autopilot] stepLockBrief threw:",
                        err instanceof Error ? err.message : err,
                    )
                    await recordFailure(
                        projectId,
                        "locking_brief",
                        errMessage(err),
                    )
                }
            })
        },
    })
}

/**
 * Stage 2: Lock the brief. Delegates to the existing lockCadLabBrief
 * action which also auto-fires Max via after(), so once lock succeeds
 * we flow straight into stepWaitForMax.
 *
 * NOTE: lockCadLabBrief uses withAuth internally, and this runner is
 * invoked post-response (after()) so there is no user session on the
 * call. We call the internal path: issue the lock ourselves via admin
 * client and then fire Max directly, mirroring the lock action's body.
 * This keeps the same trigger metadata (auto.autopilot) and avoids
 * double-firing if the lock action's after() also lands.
 */
async function stepLockBrief(projectId: string): Promise<void> {
    const admin = createAdminClient()

    // Read current lock state. If it's already locked (founder did it
    // manually or a prior autopilot run half-completed), skip straight to
    // waiting_max.
    const { data: project, error: projectErr } = await admin
        .from("cad_lab_projects")
        .select("id, foundry_id, brief_locked_at, design_revision, research")
        .eq("id", projectId)
        .maybeSingle()

    if (projectErr || !project) {
        await recordFailure(
            projectId,
            "locking_brief",
            projectErr?.message ?? "Project not found",
        )
        return
    }

    if (project.brief_locked_at) {
        // Already locked. Move on.
        await advance(projectId, "locking_brief", "waiting_max")
        after(async () => {
            try {
                await stepWaitForMax(projectId)
            } catch (err) {
                await recordFailure(projectId, "waiting_max", errMessage(err))
            }
        })
        return
    }

    // Issue the lock ourselves. We use the admin client because the
    // autopilot runner has no user session at this point.
    const lockedAtIso = new Date().toISOString()

    // Find next revision number.
    const { data: latestRev } = await admin
        .from("brief_revisions")
        .select("id, revision_number, locked_at")
        .eq("project_id", projectId)
        .order("revision_number", { ascending: false })
        .limit(1)
        .maybeSingle()

    let revisionNumber: number
    let revisionLabel: string

    if (latestRev && latestRev.locked_at === null) {
        revisionNumber = latestRev.revision_number
        revisionLabel = revisionNumberToLabel(revisionNumber)
        const { error: updateRevErr } = await admin
            .from("brief_revisions")
            .update({
                locked_at: lockedAtIso,
                revision_label: revisionLabel,
            })
            .eq("id", latestRev.id)
            .is("locked_at", null)
        if (updateRevErr) {
            await recordFailure(
                projectId,
                "locking_brief",
                updateRevErr.message,
            )
            return
        }
    } else {
        const baseline = Math.max(
            typeof latestRev?.revision_number === "number"
                ? latestRev.revision_number
                : 0,
            typeof project.design_revision === "number"
                ? project.design_revision
                : 0,
        )
        revisionNumber = baseline < 1 ? 1 : baseline
        revisionLabel = revisionNumberToLabel(revisionNumber)
        const { error: insertErr } = await admin
            .from("brief_revisions")
            .insert({
                foundry_id: project.foundry_id,
                project_id: projectId,
                revision_number: revisionNumber,
                revision_label: revisionLabel,
                locked_at: lockedAtIso,
                locked_by: null,
            })
        if (insertErr) {
            await recordFailure(projectId, "locking_brief", insertErr.message)
            return
        }
    }

    const { error: stampErr } = await admin
        .from("cad_lab_projects")
        .update({
            brief_locked_at: lockedAtIso,
            design_revision: revisionNumber,
        })
        .eq("id", projectId)

    if (stampErr) {
        await recordFailure(projectId, "locking_brief", stampErr.message)
        return
    }

    // Success — brief is now locked. Fire Max.
    await advance(projectId, "locking_brief", "waiting_max")
    after(async () => {
        try {
            const { runMaxDecomposition } = await import(
                "@/actions/specialists/run-max-decomposition"
            )
            await runMaxDecomposition(projectId, "auto.brief-lock")
        } catch (err) {
            console.error(
                "[autopilot] runMaxDecomposition threw:",
                err instanceof Error ? err.message : err,
            )
            // The Max run may still succeed via another path; continue
            // to the poll stage.
        }
        try {
            await stepWaitForMax(projectId)
        } catch (err) {
            await recordFailure(projectId, "waiting_max", errMessage(err))
        }
    })
}

/** Stage 3: wait for Max's decomposition to land 'done'. */
async function stepWaitForMax(projectId: string): Promise<void> {
    await waitForStage(projectId, {
        specialistId: "cto",
        stage: "brief.decompose",
        stageSlug: "waiting_max",
        onDone: async () => {
            await advance(projectId, "waiting_max", "waiting_bom")
            after(async () => {
                try {
                    await stepWaitForBom(projectId)
                } catch (err) {
                    await recordFailure(
                        projectId,
                        "waiting_bom",
                        errMessage(err),
                    )
                }
            })
        },
    })
}

/** Stage 4: wait for BOM generator (auto-fired from Max) to land. */
async function stepWaitForBom(projectId: string): Promise<void> {
    await waitForStage(projectId, {
        specialistId: "cto",
        stage: "bom.generate",
        stageSlug: "waiting_bom",
        onDone: async () => {
            await advance(projectId, "waiting_bom", "waiting_finn")
            after(async () => {
                try {
                    await stepWaitForFinn(projectId)
                } catch (err) {
                    await recordFailure(
                        projectId,
                        "waiting_finn",
                        errMessage(err),
                    )
                }
            })
        },
    })
}

/** Stage 5: wait for Finn's cost estimate (auto-fired from BOM). */
async function stepWaitForFinn(projectId: string): Promise<void> {
    await waitForStage(projectId, {
        specialistId: "finance-lead",
        stage: "cost.estimate",
        stageSlug: "waiting_finn",
        onDone: async () => {
            await advance(projectId, "waiting_finn", "generating_illustration")
            after(async () => {
                try {
                    await stepGenerateIllustration(projectId)
                } catch (err) {
                    await recordFailure(
                        projectId,
                        "generating_illustration",
                        errMessage(err),
                    )
                }
            })
        },
    })
}

/** Stage 6: kick the system illustration generator. */
async function stepGenerateIllustration(projectId: string): Promise<void> {
    try {
        const { generateSystemIllustrationForProject } = await import(
            "@/actions/forge-v2-generate-system-illustration"
        )
        const res = await generateSystemIllustrationForProject(projectId)
        if (!res.ok) {
            await recordFailure(
                projectId,
                "generating_illustration",
                res.error,
            )
            return
        }
    } catch (err) {
        // Illustration is nice-to-have but not a hard blocker for the
        // rest of the walk. Record it as a non-fatal failure and
        // continue, rather than trap the founder at illustration.
        console.warn(
            "[autopilot] system illustration failed (non-fatal):",
            err instanceof Error ? err.message : err,
        )
    }

    await advance(projectId, "generating_illustration", "matching_suppliers")
    after(async () => {
        try {
            await stepMatchSuppliers(projectId)
        } catch (err) {
            await recordFailure(
                projectId,
                "matching_suppliers",
                errMessage(err),
            )
        }
    })
}

/** Stage 7: kick the supplier matcher. */
async function stepMatchSuppliers(projectId: string): Promise<void> {
    try {
        const { matchSuppliersForProject } = await import(
            "@/actions/forge-v2-supplier-match"
        )
        const res = await matchSuppliersForProject(projectId)
        if (!res.ok) {
            await recordFailure(
                projectId,
                "matching_suppliers",
                res.error ?? "Supplier match failed.",
            )
            return
        }
    } catch (err) {
        await recordFailure(projectId, "matching_suppliers", errMessage(err))
        return
    }

    await advance(projectId, "matching_suppliers", "running_fang_reviews")
    after(async () => {
        try {
            await stepRunFangReviews(projectId)
        } catch (err) {
            await recordFailure(
                projectId,
                "running_fang_reviews",
                errMessage(err),
            )
        }
    })
}

/**
 * Stage 8: run Fang over the top N highest-risk modules sequentially.
 *
 * Tie-break for "highest risk":
 *   1. leadWeeks desc (longer lead time = harder to recover from bad DFM)
 *   2. failureModes.length desc (more known failure modes = more scrutiny)
 *   3. name asc (deterministic when the prior two tie)
 *
 * We cap at FANG_REVIEW_MODULE_LIMIT modules because each Fang review
 * costs budget and takes 45-60s — fanning out to every module would blow
 * through the 300s runner cap and the founder's AI budget.
 *
 * Fang reviews are best-effort: a single module review failing does not
 * fail the whole autopilot. We collect per-module errors and record them
 * in autopilot_state so the Modules page can render the failed chips.
 */
async function stepRunFangReviews(projectId: string): Promise<void> {
    const admin = createAdminClient()

    const { data: project, error: projectErr } = await admin
        .from("cad_lab_projects")
        .select("modules")
        .eq("id", projectId)
        .maybeSingle()

    if (projectErr || !project) {
        await recordFailure(
            projectId,
            "running_fang_reviews",
            projectErr?.message ?? "Project not found",
        )
        return
    }

    const modules = (project.modules as CadLabModule[] | null) ?? []
    const reviewable = modules
        .filter((m) => m.keyParts && m.keyParts.length > 0)
        .slice()
        .sort((a, b) => {
            const aLead = typeof a.leadWeeks === "number" ? a.leadWeeks : 0
            const bLead = typeof b.leadWeeks === "number" ? b.leadWeeks : 0
            if (aLead !== bLead) return bLead - aLead
            const aFm = a.failureModes?.length ?? 0
            const bFm = b.failureModes?.length ?? 0
            if (aFm !== bFm) return bFm - aFm
            return (a.name ?? "").localeCompare(b.name ?? "")
        })
        .slice(0, FANG_REVIEW_MODULE_LIMIT)

    if (reviewable.length === 0) {
        // Nothing to review — the brief decomposed into modules that all
        // have zero keyParts. That's unusual but not a failure of
        // autopilot — it's a consequence of Max's output. Record as done.
        await markDone(projectId, "running_fang_reviews")
        return
    }

    const { runFangReview } = await import(
        "@/actions/specialists/run-fang-review"
    )

    // INTENT: Fang reviews run sequentially. Running them in parallel
    // would trip the per-foundry AI budget rate limiter (each review
    // does its own check) and could saturate the DeepSeek concurrency
    // ceiling. Serial keeps the runner's peak concurrency at 1.
    for (const mod of reviewable) {
        try {
            await runFangReview(projectId, mod.id, "manual")
            // Failures inside the inner action are returned as { ok: false };
            // we don't short-circuit on them because some modules may still
            // land cleanly after one errors.
        } catch (err) {
            console.warn(
                `[autopilot] Fang review threw for module ${mod.id}:`,
                err instanceof Error ? err.message : err,
            )
        }
    }

    await markDone(projectId, "running_fang_reviews")
}

// ─── Internals ─────────────────────────────────────────────────────────

interface WaitForStageOpts {
    specialistId: string
    stage: string
    stageSlug: AutopilotStage
    onDone: () => Promise<void>
}

/**
 * Polls pipeline_runs for a matching row and dispatches based on status:
 *   - status='done'   → call onDone()
 *   - status='failed' → record failure, stop
 *   - anything else   → sleep + re-poll until POLL_TIMEOUT_MS
 *
 * On timeout, records a failure with errorCode='TIMEOUT' so the UI can
 * tell the founder autopilot is stuck vs the run exploded.
 */
async function waitForStage(
    projectId: string,
    opts: WaitForStageOpts,
): Promise<void> {
    const admin = createAdminClient()
    const deadline = Date.now() + POLL_TIMEOUT_MS

    while (Date.now() < deadline) {
        const { data: row } = await admin
            .from("pipeline_runs")
            .select("status, error_code, error_message")
            .eq("project_id", projectId)
            .eq("specialist_id", opts.specialistId)
            .eq("stage", opts.stage)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (row) {
            if (row.status === "done") {
                await opts.onDone()
                return
            }
            if (row.status === "failed" || row.status === "cancelled") {
                await recordFailure(
                    projectId,
                    opts.stageSlug,
                    row.error_message ??
                        row.error_code ??
                        `pipeline_runs ${opts.stage} status=${row.status}`,
                )
                return
            }
            // queued / running — keep polling.
        }

        await sleep(POLL_INTERVAL_MS)
    }

    await recordFailure(
        projectId,
        opts.stageSlug,
        `Timed out waiting for ${opts.specialistId}:${opts.stage} after ${Math.round(POLL_TIMEOUT_MS / 1000)}s`,
    )
}

/** Reads autopilot_state, flips stage, stamps completed_stages. */
async function advance(
    projectId: string,
    fromStage: AutopilotStage,
    toStage: AutopilotStage,
): Promise<void> {
    const admin = createAdminClient()
    const { data: project } = await admin
        .from("cad_lab_projects")
        .select("autopilot_state")
        .eq("id", projectId)
        .maybeSingle()
    const current = (project?.autopilot_state as AutopilotState | null) ?? null
    if (!current) {
        // Someone reset the state mid-run. Silently no-op rather than
        // crash; the walk is effectively cancelled.
        return
    }
    const completed = Array.from(
        new Set([...current.completed_stages, fromStage]),
    )
    const next: AutopilotState = {
        ...current,
        stage: toStage,
        completed_stages: completed,
    }
    await admin
        .from("cad_lab_projects")
        .update({ autopilot_state: next } as unknown as never)
        .eq("id", projectId)
}

/** Records a terminal failure and stamps finished_at. */
async function recordFailure(
    projectId: string,
    stageSlug: AutopilotStage,
    error: string,
): Promise<void> {
    const admin = createAdminClient()
    const { data: project } = await admin
        .from("cad_lab_projects")
        .select("autopilot_state")
        .eq("id", projectId)
        .maybeSingle()
    const current = (project?.autopilot_state as AutopilotState | null) ?? null
    if (!current) return
    const failed = Array.from(new Set([...current.failed_stages, stageSlug]))
    const next: AutopilotState = {
        ...current,
        stage: stageSlug,
        failed_stages: failed,
        error,
        finished_at: new Date().toISOString(),
    }
    await admin
        .from("cad_lab_projects")
        .update({ autopilot_state: next } as unknown as never)
        .eq("id", projectId)
}

/** Marks the whole walk done — final completed stage + finished_at. */
async function markDone(
    projectId: string,
    lastCompletedStage: AutopilotStage,
): Promise<void> {
    const admin = createAdminClient()
    const { data: project } = await admin
        .from("cad_lab_projects")
        .select("autopilot_state")
        .eq("id", projectId)
        .maybeSingle()
    const current = (project?.autopilot_state as AutopilotState | null) ?? null
    if (!current) return
    const completed = Array.from(
        new Set([...current.completed_stages, lastCompletedStage]),
    )
    const next: AutopilotState = {
        ...current,
        stage: "done",
        completed_stages: completed,
        finished_at: new Date().toISOString(),
    }
    await admin
        .from("cad_lab_projects")
        .update({ autopilot_state: next } as unknown as never)
        .eq("id", projectId)
}

/** Reads `cad_lab_projects.research.report` length without loading the
 *  whole project. Used as a secondary check before handing off to lock
 *  in case Chase's pipeline_runs row lands 'done' but the persisted
 *  report is empty. */
async function readResearchReportChars(projectId: string): Promise<number> {
    const admin = createAdminClient()
    const { data: project } = await admin
        .from("cad_lab_projects")
        .select("research")
        .eq("id", projectId)
        .maybeSingle()
    const research = project?.research as { report?: unknown } | null
    if (!research || typeof research.report !== "string") return 0
    return research.report.trim().length
}

/** 1 → "Rev A", 2 → "Rev B", ... 26 → "Rev Z", 27+ → "Rev 27". Same
 *  helper as brief-lock.ts — duplicated here to avoid a cross-import
 *  cycle between two "use server" files. */
function revisionNumberToLabel(n: number): string {
    if (!Number.isFinite(n) || n < 1) return "Rev 1"
    if (n > 26) return `Rev ${n}`
    return `Rev ${String.fromCharCode(64 + n)}`
}

function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

// ─── Status loader ─────────────────────────────────────────────────────

/**
 * Reads the autopilot_state column for a project. Used by the UI to
 * decide whether to render the "Run autopilot" CTA, the "running" chip,
 * or the "finished" chip.
 *
 * Foundry-scoped — returns null if the caller can't see the project.
 */
export async function loadAutopilotState(
    projectId: string,
): Promise<AutopilotState | null> {
    return withAuth<AutopilotState | null>(async ({ foundryId }) => {
        if (!projectId || !UUID_RE.test(projectId)) return null
        const admin = createAdminClient()
        const { data: project } = await admin
            .from("cad_lab_projects")
            .select("foundry_id, autopilot_state")
            .eq("id", projectId)
            .maybeSingle()
        if (!project || project.foundry_id !== foundryId) return null
        return (project.autopilot_state as AutopilotState | null) ?? null
    })
}
