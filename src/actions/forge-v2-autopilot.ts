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
import { getBaseUrl } from "@/lib/domains"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Shape ─────────────────────────────────────────────────────────────

/** Stages in the order the autopilot runs them. The ordering is the
 *  contract: a stage only starts once its predecessor lands in
 *  `completed_stages`, and a failure anywhere stops the walk. */
export type AutopilotStage =
    | "waiting_chase"
    | "locking_brief"
    | "waiting_max"
    | "waiting_sizing"  // v1.1: Fang sizing runs between Max and BOM
    | "waiting_layout"  // v1.3: Fang spatial layout runs after sizing, before BOM
    | "waiting_bom"
    | "waiting_finn"
    | "generating_illustration"
    | "matching_suppliers"
    | "running_fang_reviews"
    | "generating_pdf"  // v1.2: final PDF export so founder gets a deliverable
    | "done"

export interface AutopilotState {
    started_at: string
    stage: AutopilotStage
    completed_stages: string[]
    failed_stages: string[]
    error?: string
    finished_at: string | null
}

/**
 * Step names that can be dispatched via the internal /api/autopilot-step
 * route. Each maps 1:1 to a `stepXxx` runner in this file. See
 * `dispatchAutopilotStep` for the switch.
 *
 * P0.1b (2026-04-23): exported so the route handler can type-narrow
 * request bodies against the same union the dispatcher uses. The
 * runtime allowlist lives inside the route handler (a `"use server"`
 * file can't export a non-async const).
 */
export type AutopilotStepName =
    | "waitForChase"
    | "lockBrief"
    | "waitForMax"
    | "waitForSizing"
    | "waitForLayout"
    | "waitForBom"
    | "waitForFinn"
    | "generateIllustration"
    | "matchSuppliers"
    | "runFangReviews"
    | "generatePdf"

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

/** Max modules to fan Fang reviews across. Historical comment said
 *  "we sequence them serially so the runner stays under Vercel's 300s cap.
 *  Three modules × 60s = 180s." That was accurate for the serial loop.
 *  Commit f0be4d70 switched to parallel Promise.allSettled — 10 modules
 *  in ~90s wall-clock, well inside the 300s cap. Plus: Tristan's review of
 *  the run-15 PDF explicitly called 2/8 reviews "worse than 0/8" and asked
 *  for all modules to be reviewed. Bumping the cap to 20 so it's
 *  effectively unlimited for any real project while still preventing
 *  runaway cost on an exotic 40-module brief. */
const FANG_REVIEW_MODULE_LIMIT = 20

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

        // Idempotency + stall recovery. A running walk (non-null state,
        // null finished_at) should refuse a second start — EXCEPT when
        // the walk is stalled because after() died mid-chain on a
        // Vercel container teardown. Observed 2026-04-21: autopilot
        // stuck in "running_fang_reviews" indefinitely, Run autopilot
        // rejected with ALREADY_RUNNING, needed SQL to reset.
        //
        // Rule: if started_at was more than STALL_THRESHOLD_MS ago,
        // stamp finished_at on the old state (with the stall note) and
        // fall through to seed a fresh walk. 30 min threshold matches
        // the real typical-case envelope: Chase 2m + Max 3m + BOM 3m +
        // Finn 3m + illustration 2m + match 1m + Fang 10m ≈ 24m upper
        // bound.
        const AUTOPILOT_STALL_THRESHOLD_MS = 30 * 60 * 1000
        const existing = project.autopilot_state as AutopilotState | null
        if (existing && existing.finished_at === null) {
            const startedMs = Date.parse(existing.started_at)
            const stalled =
                !Number.isNaN(startedMs) &&
                Date.now() - startedMs > AUTOPILOT_STALL_THRESHOLD_MS
            if (!stalled) {
                return {
                    ok: false,
                    error: "Autopilot is already running on this project.",
                    errorCode: "ALREADY_RUNNING",
                }
            }
            console.warn(
                `[autopilot:start] detected stalled state for ${projectId} ` +
                    `(started ${existing.started_at}, stage=${existing.stage}). ` +
                    `Auto-recovering — marking old state finished and starting fresh walk.`,
            )
            await admin
                .from("cad_lab_projects")
                .update({
                    autopilot_state: {
                        ...existing,
                        finished_at: new Date().toISOString(),
                        error:
                            existing.error ??
                            `Stalled at stage ${existing.stage} after ${(Date.now() - startedMs) / 1000}s; auto-recovered.`,
                    },
                } as unknown as never)
                .eq("id", projectId)

            // Clean up stale open pipeline_runs rows for this project BEFORE
            // seeding the fresh walk. Without this, the next stage's
            // waitForStage() reads the previous walk's 'failed' or orphaned
            // 'running' row (from e.g. a 6-min TIMEOUT_STALL sweep, or a
            // Vercel container teardown mid-run) and immediately surfaces
            // a misleading "autopilot stopped" error to the founder — a
            // ghost failure from the prior walk, not the fresh one.
            //
            // We mark any non-terminal row (queued/running) AND any 'failed'
            // row as 'cancelled' with error_code='AUTOPILOT_SUPERSEDED'. The
            // reason we sweep 'failed' too: waitForStage short-circuits on
            // the most-recent row per (specialist_id, stage), so a lingering
            // 'failed' row from the stalled walk would instantly fail the
            // fresh walk's corresponding stage before any new run is even
            // inserted. 'done' rows are left alone — they represent real
            // completed work (e.g. Chase's research) that the fresh walk
            // can validly reuse without re-running. Matches the existing
            // status-taxonomy convention (see migration 20260422000000).
            const { error: supersedeErr } = await admin
                .from("pipeline_runs")
                .update({
                    status: "cancelled",
                    error_code: "AUTOPILOT_SUPERSEDED",
                    error_message:
                        "Superseded by autopilot restart after stall.",
                    finished_at: new Date().toISOString(),
                })
                .eq("project_id", projectId)
                .in("status", ["queued", "running", "failed"])
            if (supersedeErr) {
                // Non-fatal — the fresh walk may still succeed, it will just
                // surface the old ghost failure to the founder if the next
                // stage's poll reads the stale row first. Log loudly so we
                // notice in Vercel logs.
                console.error(
                    "[autopilot:start] failed to supersede stale pipeline_runs:",
                    supersedeErr.message,
                )
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
        // P0.1b (2026-04-23): HTTP hop to /api/autopilot-step instead of
        // after(() => stepWaitForChase(...)). `after()` extends the
        // current invocation; we need a fresh Vercel container with its
        // own 300s budget for each stage, otherwise Chase+Max+BOM share
        // a single 300s budget and the chain wedges mid-BOM. See
        // `scheduleAutopilotStep` docs for the full rationale.
        await scheduleAutopilotStep(projectId, "waitForChase")

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
            // P0.1b: HTTP hop instead of after(). Fresh Vercel container
            // for lockBrief so the chain doesn't share a single 300s
            // budget with the next several stages.
            await scheduleAutopilotStep(projectId, "lockBrief")
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
        // P0.1b: HTTP hop instead of after() — fresh container for Max.
        await scheduleAutopilotStep(projectId, "waitForMax")
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
            // 23505 = unique violation on (project_id, revision_number) =
            // a concurrent caller (another cron tick or a racing after())
            // already locked. Treat as idempotent success — the row exists,
            // just not written by us. Fall through to the stamp step.
            // Observed 2026-04-24 run 18: cron ticked stepLockBrief twice
            // during waiting_chase→locking_brief handoff, both raced the
            // insert, one 23505'd and autopilot crashed.
            if (insertErr.code === "23505") {
                console.info(
                    "[autopilot] stepLockBrief: brief_revisions row already exists (concurrent lock) — treating as idempotent success",
                )
            } else {
                await recordFailure(projectId, "locking_brief", insertErr.message)
                return
            }
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

    // Success — brief is now locked. Advance + hop to waitForMax.
    await advance(projectId, "locking_brief", "waiting_max")

    // P0.1b (2026-04-23): HTTP hop to a fresh container for stepWaitForMax.
    //
    // Previously this was `after(() => runMaxDecompositionBackground + stepWaitForMax)`
    // which shared the whole chain's budget with the current container. We no
    // longer need to call Max explicitly here — stepWaitForMax has self-healing
    // that checks for an existing Max pipeline_run and fires one itself if
    // missing. So all we have to do is schedule the hop; the fresh container
    // running stepWaitForMax will fire Max on a clean 300s budget. See
    // `scheduleAutopilotStep` docs for the full rationale.
    await scheduleAutopilotStep(projectId, "waitForMax")
}

/**
 * Resolve the foundryId for a project via the admin client. Used by
 * stall-recovery re-trigger callbacks (which fire from background poll
 * loops with no cookie context). Returns null when the project is gone.
 */
async function getProjectFoundryId(projectId: string): Promise<string | null> {
    const admin = createAdminClient()
    const { data } = await admin
        .from("cad_lab_projects")
        .select("foundry_id")
        .eq("id", projectId)
        .maybeSingle()
    return data?.foundry_id ?? null
}

/** Stage 3: wait for Max's decomposition to land 'done'.
 *
 * Self-healing: if no brief.decompose pipeline_run exists by the time we
 * start polling, fire Max directly. Accounts for Vercel's fragile after()
 * cascade where the stage chain can drop mid-flight (observed 2026-04-23
 * on project 1f2f56b5 — autopilot_state said waiting_max but no Max row
 * ever got created). Mirrors the pattern in stepWaitForSizing. */
async function stepWaitForMax(projectId: string): Promise<void> {
    // Check if Max has a pipeline_run yet. If not, fire it ourselves —
    // don't assume a previous after() successfully scheduled it.
    const admin = createAdminClient()
    const { data: existing } = await admin
        .from("pipeline_runs")
        .select("id")
        .eq("project_id", projectId)
        .eq("specialist_id", "cto")
        .eq("stage", "brief.decompose")
        .limit(1)
        .maybeSingle()
    if (!existing) {
        console.info("[autopilot] stepWaitForMax: no Max run found, firing it now")
        const foundryId = await getProjectFoundryId(projectId)
        if (foundryId) {
            try {
                const { runMaxDecompositionBackground } = await import(
                    "@/actions/specialists/run-max-decomposition"
                )
                // AWAIT: fire-and-forget was unreliable — the background fn
                // runs inside its own container slice and Vercel can tear
                // it down before startPipelineRun actually lands. Awaiting
                // means this stepWaitForMax invocation (the tick-scheduled
                // one, in its own lambda) blocks until Max's pipeline_run
                // is written + Max completes. Budget: Max ~90-120s, we
                // still have 180s left for waitForStage + Max's after()
                // to fire BOM.
                const maxResult = await runMaxDecompositionBackground(
                    projectId,
                    foundryId,
                    null,
                    "auto.brief-lock",
                )
                console.info(
                    "[autopilot] stepWaitForMax self-fire result:",
                    maxResult.ok ? `ok runId=${maxResult.runId}` : `error=${"error" in maxResult ? maxResult.error : "unknown"}`,
                )
            } catch (err) {
                console.error(
                    "[autopilot] stepWaitForMax self-fire threw:",
                    err instanceof Error ? err.message : err,
                )
            }
        }
    }

    await waitForStage(projectId, {
        specialistId: "cto",
        stage: "brief.decompose",
        stageSlug: "waiting_max",
        onDone: async () => {
            await advance(projectId, "waiting_max", "waiting_sizing")
            // P0.1b: HTTP hop — fresh container for Fang sizing.
            await scheduleAutopilotStep(projectId, "waitForSizing")
        },
        // #88 Phase-2 fix: if the prior Max run was swept as TIMEOUT_STALL,
        // re-invoke Max via the Background variant so the autopilot chain
        // survives a Vercel 300s kill. One retry per stage.
        reTrigger: async () => {
            const foundryId = await getProjectFoundryId(projectId)
            if (!foundryId) return
            const { runMaxDecompositionBackground } = await import(
                "@/actions/specialists/run-max-decomposition"
            )
            await runMaxDecompositionBackground(
                projectId,
                foundryId,
                null,
                "auto.brief-lock",
            )
        },
    })
}

/**
 * Stage 3.5: Fang sizing — produces dimension_sheet before BOM + images.
 *
 * Runs the sizing engine synchronously via runFangSizingBackground. Unlike
 * the other stages that poll a pipeline_run fired by an earlier specialist's
 * after() callback, this stage FIRES the sizing run itself — the run-max-
 * decomposition.ts after() chain also fires sizing, but if Max was already
 * done (autopilot running on a pre-existing project) that after() never
 * fires and sizing would be skipped. This stage guarantees sizing lands.
 *
 * Idempotent: runFangSizing is safe to re-invoke — it overwrites
 * dimension_sheet and writes a fresh pipeline_runs row.
 */
async function stepWaitForSizing(projectId: string): Promise<void> {
    const foundryId = await getProjectFoundryId(projectId)
    if (!foundryId) {
        await recordFailure(
            projectId,
            "waiting_sizing",
            "project disappeared during sizing stage",
        )
        return
    }

    try {
        const { runFangSizingBackground } = await import(
            "@/actions/specialists/run-fang-sizing"
        )
        const result = await runFangSizingBackground(
            projectId,
            foundryId,
            "auto.max-complete",
        )
        if (!result.ok && !("skipped" in result && result.skipped)) {
            // Hard failure (budget cap, save error). Stop.
            await recordFailure(
                projectId,
                "waiting_sizing",
                ("error" in result && result.error) || "sizing failed",
            )
            return
        }
        // ok=true OR skipped=true — both are legitimate. 'skipped' happens
        // when no rules library matches the industry domain; don't stop
        // autopilot for that, just continue.
    } catch (err) {
        // Non-fatal: sizing is an enhancement, not a hard requirement.
        // Log but continue — BOM + images will degrade gracefully to
        // visual_style-only prompts.
        console.warn(
            "[autopilot] stepWaitForSizing threw — continuing:",
            err instanceof Error ? err.message : err,
        )
    }

    // V1 FIX (2026-04-24): inline Fang layout here, in the SAME fresh
    // container, rather than relying on the waiting_layout hop fire.
    // Run 15 observation: stepWaitForLayout was dispatched by cron ~16
    // times over 8 minutes but NEVER wrote a brief.layout pipeline_run
    // row — the after()-wrapped dispatch was being dropped under cron
    // load (multiple concurrent after() callbacks from other projects
    // saturating the container). runFangLayoutBackground itself is fast
    // (<200ms when tested manually) and depends on dimension_sheet which
    // sizing just wrote, so running it here is cheap + reliable. The
    // separate stepWaitForLayout stage stays for the hop path (belt +
    // braces) — it's idempotent via the 23505 handler.
    try {
        const { runFangLayoutBackground } = await import(
            "@/actions/specialists/run-fang-layout"
        )
        await runFangLayoutBackground(
            projectId,
            foundryId,
            null,
            "auto.sizing-complete",
        )
    } catch (err) {
        console.warn(
            "[autopilot] inline-layout after sizing threw — continuing:",
            err instanceof Error ? err.message : err,
        )
    }

    await advance(projectId, "waiting_sizing", "waiting_layout")
    // P0.1b: HTTP hop — fresh container for Fang spatial layout.
    await scheduleAutopilotStep(projectId, "waitForLayout")
}

/**
 * Stage 3.75 (v1.3): Fang spatial layout — produces spatial_plan using the
 * layout engine, anchored on the dimension_sheet from the sizing stage.
 *
 * Runs synchronously via runFangLayoutBackground. Fully optional: if the
 * sizing stage didn't produce a feasible dimension_sheet, or no layout rules
 * library matches the industry domain, the layout engine returns `null` and
 * persists null to spatial_plan. That is a legitimate skip — autopilot
 * continues to BOM either way.
 *
 * Idempotent: runFangLayout is safe to re-invoke — it overwrites spatial_plan
 * and writes a fresh pipeline_runs row.
 */
async function stepWaitForLayout(projectId: string): Promise<void> {
    const foundryId = await getProjectFoundryId(projectId)
    if (!foundryId) {
        await recordFailure(
            projectId,
            "waiting_layout",
            "project disappeared during layout stage",
        )
        return
    }

    try {
        const { runFangLayoutBackground } = await import(
            "@/actions/specialists/run-fang-layout"
        )
        const result = await runFangLayoutBackground(
            projectId,
            foundryId,
            null,
            "auto.sizing-complete",
        )
        if (!result.ok && !("skipped" in result && result.skipped)) {
            // Hard failure (save error, etc.). Layout is optional — log and
            // continue to BOM anyway rather than block the walk. The pipeline_run
            // row already captured the error for the UI to surface.
            console.warn(
                "[autopilot] stepWaitForLayout hard-errored — continuing:",
                "error" in result ? result.error : "unknown",
            )
        }
        // ok=true OR skipped=true — both are legitimate. 'skipped' happens
        // when no rules library matches the industry domain OR the sizing
        // stage didn't produce a feasible dimension_sheet; don't stop
        // autopilot for that, just continue.
    } catch (err) {
        // Non-fatal: layout is an enhancement, not a hard requirement.
        // Log but continue — image prompts + PDF section will degrade
        // gracefully when spatial_plan IS NULL.
        console.warn(
            "[autopilot] stepWaitForLayout threw — continuing:",
            err instanceof Error ? err.message : err,
        )
    }

    await advance(projectId, "waiting_layout", "waiting_bom")
    // P0.1b: HTTP hop — fresh container for BOM generation.
    await scheduleAutopilotStep(projectId, "waitForBom")
}

/** Stage 4: wait for BOM generator (auto-fired from Max) to land.
 *  Self-healing like stepWaitForMax — if BOM has no pipeline_run, fire it. */
async function stepWaitForBom(projectId: string): Promise<void> {
    const admin = createAdminClient()
    const { data: existing } = await admin
        .from("pipeline_runs")
        .select("id")
        .eq("project_id", projectId)
        .eq("specialist_id", "cto")
        .eq("stage", "bom.generate")
        .limit(1)
        .maybeSingle()
    if (!existing) {
        console.info("[autopilot] stepWaitForBom: no BOM run found, firing it now")
        const foundryId = await getProjectFoundryId(projectId)
        if (foundryId) {
            try {
                const { runBomGeneratorBackground } = await import(
                    "@/actions/specialists/run-bom-generator"
                )
                // AWAIT: see stepWaitForMax for rationale — fire-and-forget
                // on Vercel is unreliable; awaiting keeps this lambda alive
                // until BOM's pipeline_runs row is written.
                const bomResult = await runBomGeneratorBackground(
                    projectId,
                    foundryId,
                    null,
                    "auto.max-complete",
                )
                console.info(
                    "[autopilot] stepWaitForBom self-fire result:",
                    bomResult.ok ? `ok runId=${bomResult.runId}` : `error=${"error" in bomResult ? bomResult.error : "unknown"}`,
                )
            } catch (err) {
                console.error(
                    "[autopilot] stepWaitForBom self-fire threw:",
                    err instanceof Error ? err.message : err,
                )
            }
        }
    }

    await waitForStage(projectId, {
        specialistId: "cto",
        stage: "bom.generate",
        stageSlug: "waiting_bom",
        onDone: async () => {
            await advance(projectId, "waiting_bom", "waiting_finn")
            // P0.1b: HTTP hop — fresh container for Finn cost estimate.
            await scheduleAutopilotStep(projectId, "waitForFinn")
        },
        // #88: re-fire BOM via Background variant if stall-swept.
        reTrigger: async () => {
            const foundryId = await getProjectFoundryId(projectId)
            if (!foundryId) return
            const { runBomGeneratorBackground } = await import(
                "@/actions/specialists/run-bom-generator"
            )
            await runBomGeneratorBackground(
                projectId,
                foundryId,
                null,
                "auto.max-complete",
            )
        },
    })
}

/** Stage 5: wait for Finn's cost estimate (auto-fired from BOM). */
async function stepWaitForFinn(projectId: string): Promise<void> {
    // CHANGED 2026-04-24: BOM's merge stage used to auto-fire Finn via
    // after() inside its own container (the descendant of Max's after-chain).
    // That container's 300s budget was already mostly spent, so Finn's
    // pipeline_run would start but the container would die mid-LLM-call,
    // leaving a zombie row that stalled autopilot for 4+ minutes until
    // startPipelineRun's stale-abandoned recovery kicked in. We removed
    // that auto-fire and instead rely on stepWaitForFinn to self-fire
    // Finn on its own fresh 300s container, mirroring the stepWaitForMax
    // / stepWaitForBom self-heal pattern.
    const admin = createAdminClient()
    const { data: existing } = await admin
        .from("pipeline_runs")
        .select("id, status")
        .eq("project_id", projectId)
        .eq("specialist_id", "finance-lead")
        .eq("stage", "cost.estimate")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle()

    // If no Finn run exists, fire it ourselves synchronously on this
    // fresh 300s container — same pattern as stepWaitForMax self-fire.
    if (!existing) {
        console.info(
            "[autopilot] stepWaitForFinn: no Finn run found, firing it now",
        )
        const foundryId = await getProjectFoundryId(projectId)
        if (foundryId) {
            try {
                const { runFinnCostBackground } = await import(
                    "@/actions/specialists/run-finn-cost"
                )
                const result = await runFinnCostBackground(
                    projectId,
                    foundryId,
                    null,
                    "auto.bom-complete",
                )
                console.info(
                    "[autopilot] stepWaitForFinn self-fire result:",
                    result.ok ? `ok runId=${result.runId}` : `error=${"error" in result ? result.error : "unknown"}`,
                )
            } catch (err) {
                console.error(
                    "[autopilot] stepWaitForFinn self-fire threw:",
                    err instanceof Error ? err.message : err,
                )
            }
        }
    }

    await waitForStage(projectId, {
        specialistId: "finance-lead",
        stage: "cost.estimate",
        stageSlug: "waiting_finn",
        onDone: async () => {
            await advance(projectId, "waiting_finn", "generating_illustration")
            // P0.1b: HTTP hop — fresh container for illustration stage
            // (runs system + concept renders + fires the per-module chain).
            await scheduleAutopilotStep(projectId, "generateIllustration")
        },
        // P2.9: re-fire Finn via Background variant if stall-swept. Previously
        // Finn had no Background variant so a TIMEOUT_STALL ended the walk.
        // Now runFinnCostBackground plumbs foundryId explicitly, mirroring
        // runMaxDecompositionBackground / runBomGeneratorBackground.
        reTrigger: async () => {
            const foundryId = await getProjectFoundryId(projectId)
            if (!foundryId) return
            const { runFinnCostBackground } = await import(
                "@/actions/specialists/run-finn-cost"
            )
            await runFinnCostBackground(
                projectId,
                foundryId,
                null,
                "auto.bom-complete",
            )
        },
    })
}

/**
 * Stage 6: generates BOTH hero images for the project workspace —
 *   - system_illustration_url (technical blueprint, right panel)
 *   - concept_render_url       (photoreal product shot, left panel)
 *
 * Fired in parallel via Promise.allSettled so one failing doesn't block
 * the other. The system illustration is the multimodal reference anchor
 * for per-module renders (Layer C of the image coherence plan), so it
 * needs to land first in the common case — but concept render IS
 * independent, so we take the parallel-and-tolerate-failure path.
 *
 * Both are nice-to-have for the rest of the pipeline — a failed
 * illustration doesn't trap the founder at this stage.
 */
async function stepGenerateIllustration(projectId: string): Promise<void> {
    // GOTCHA (P0.2): this stage runs inside after() chained from earlier
    // stages — cookies are gone. Resolve foundryId up front so the Background
    // variants of the illustration/concept render/render-chain actions can
    // be called instead of their withAuth counterparts (which would return
    // "Unauthorized" → sanitised → silent failure).
    const foundryIdForChain = await getProjectFoundryId(projectId)
    if (!foundryIdForChain) {
        await recordFailure(
            projectId,
            "generating_illustration",
            "project disappeared during illustration stage",
        )
        return
    }

    // v1.2: clear the hero + per-module imageUrls before the render chain
    // fires. On re-autopilot cycles — typical for a founder who adjusted the
    // brief and is running autopilot again — old renders would otherwise be
    // reused even if the dimension_sheet now implies different geometry.
    // Clearing forces fresh renders that pick up the latest sizing.
    try {
        const admin = createAdminClient()
        const { data: project } = await admin
            .from("cad_lab_projects")
            .select("modules, foundry_id")
            .eq("id", projectId)
            .maybeSingle()
        if (project) {
            const modules = (project.modules as CadLabModule[] | null) ?? []
            const cleared = modules.map((m) => ({
                ...m,
                imageUrl: undefined,
                imageStatus: undefined,
                imageError: undefined,
                imageModelUsed: undefined,
            }))
            await admin
                .from("cad_lab_projects")
                .update({
                    modules: cleared as never,
                    system_illustration_url: null,
                    interior_overview_url: null,
                    image_render_state: null,
                })
                .eq("id", projectId)
        }
    } catch (err) {
        // Non-fatal: if we can't clear the urls, the render chain will
        // still run on any missing modules. Worst case: founder sees stale
        // images for modules that were already rendered.
        console.warn(
            "[autopilot] pre-render cleanup failed (non-fatal):",
            err instanceof Error ? err.message : err,
        )
    }

    try {
        // P0.2: Background variants bypass the withAuth cookie read. This
        // stage runs from an after() chain so the user-facing variants
        // would return "Unauthorized" and both hero panels would never
        // land. foundryId was resolved above.
        const [
            { generateSystemIllustrationForProjectBackground },
            { generateConceptRenderForProjectBackground },
        ] = await Promise.all([
            import("@/actions/forge-v2-generate-system-illustration"),
            import("@/actions/forge-v2-generate-concept-render"),
        ])
        const [systemRes, conceptRes] = await Promise.allSettled([
            generateSystemIllustrationForProjectBackground(projectId, foundryIdForChain),
            generateConceptRenderForProjectBackground(projectId, foundryIdForChain),
        ])
        if (systemRes.status === "rejected") {
            console.warn(
                "[autopilot] system illustration threw (non-fatal):",
                systemRes.reason instanceof Error
                    ? systemRes.reason.message
                    : systemRes.reason,
            )
        } else if (!systemRes.value.ok) {
            await recordFailure(
                projectId,
                "generating_illustration",
                systemRes.value.error,
            )
            // Continue anyway — concept render may still have succeeded
            // and suppliers stage doesn't need the illustration.
        }
        if (conceptRes.status === "rejected") {
            console.warn(
                "[autopilot] concept render threw (non-fatal):",
                conceptRes.reason instanceof Error
                    ? conceptRes.reason.message
                    : conceptRes.reason,
            )
        } else if (!conceptRes.value.ok) {
            console.warn(
                "[autopilot] concept render returned error (non-fatal):",
                conceptRes.value.error,
            )
        }
    } catch (err) {
        console.warn(
            "[autopilot] illustration stage threw (non-fatal):",
            err instanceof Error ? err.message : err,
        )
    }

    await advance(projectId, "generating_illustration", "matching_suppliers")

    // V1 CUT (2026-04-24, per Tristan PDF review): drop per-module renders.
    // Rationale: 2/8 modules rendered on the last autopilot run — inconsistent
    // "half-built" look. Cover + hero illustration above already ship. Module
    // renders add ~12 min of the 20 min runtime, are the flakiest pipeline
    // (gpt-image-2 timeouts, consistency retries), and the PDF already
    // degrades gracefully to "no render generated" rows. Bringing them back
    // in V1.1 after we can guarantee 8/8 reliability. To re-enable, restore
    // the startRenderAllRemainingModuleImagesBackground block that was here.
    //
    // Page-load auto-fire on /modules still works (tickImageRenderChain +
    // the user clicking "Render all"), so founders who want per-module
    // imagery can trigger it manually. Autopilot just won't wait for it.

    // P0.1b: HTTP hop — fresh container for supplier matching. The
    // after() above that kicks the per-module render chain STAYS as-is
    // (it calls a *Background variant, not an autopilot stage, and is
    // expected to run in the same stage budget as illustration).
    await scheduleAutopilotStep(projectId, "matchSuppliers")
}

/** Stage 7: kick the supplier matcher. */
async function stepMatchSuppliers(projectId: string): Promise<void> {
    // P0.2: resolve foundryId up front so we can call the Background variant.
    // This stage runs inside an after() chain (cookies gone) — the
    // withAuth-wrapped matchSuppliersForProject would return "Unauthorized"
    // which sanitizeErrorMessage destroys into "An unexpected error
    // occurred" (Red Team 2 §4 — the BESS matching_suppliers failure).
    const foundryId = await getProjectFoundryId(projectId)
    if (!foundryId) {
        await recordFailure(
            projectId,
            "matching_suppliers",
            "project disappeared during supplier-match stage",
        )
        return
    }

    try {
        const { matchSuppliersForProjectBackground } = await import(
            "@/actions/forge-v2-supplier-match"
        )
        const res = await matchSuppliersForProjectBackground(projectId, foundryId)
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
    // P0.1b: HTTP hop — fresh container for the Fang review fan-out
    // (3 sequential ~60s reviews = up to 180s of work).
    await scheduleAutopilotStep(projectId, "runFangReviews")
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

    // P2.9: resolve foundryId up front so the per-module loop can call
    // runFangReviewBackground — the withAuth-wrapped variant can't read
    // cookies inside after() context and returns "Unauthorized", which
    // sanitizeErrorMessage then destroys into "An unexpected error
    // occurred" (Red Team 2 §P1 item 6). Background variant plumbs
    // foundryId explicitly.
    const foundryId = await getProjectFoundryId(projectId)
    if (!foundryId) {
        await recordFailure(
            projectId,
            "running_fang_reviews",
            "project disappeared during Fang review stage",
        )
        return
    }

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
        // autopilot — skip Fang reviews and still generate the PDF.
        await advance(projectId, "running_fang_reviews", "generating_pdf")
        // P0.1b: HTTP hop — fresh container for PDF export.
        await scheduleAutopilotStep(projectId, "generatePdf")
        return
    }

    // P2.9: use the Background variant — this stage runs from an after()
    // context (stepMatchSuppliers → after(stepRunFangReviews)) where cookies
    // are gone and withAuth would return "Unauthorized". The Background
    // variant plumbs foundryId + userId explicitly, mirroring the Max/BOM
    // after() chain fix (#90).
    const { runFangReviewBackground } = await import(
        "@/actions/specialists/run-fang-review"
    )

    // CHANGED 2026-04-24: parallelize Fang reviews. Original comment said
    // serial to avoid rate-limiter + DeepSeek concurrency issues. In
    // practice: 9-module BESS project took ~18 min running serial (2 min
    // per review), which was the dominant cost of the autopilot chain.
    // DeepSeek easily handles 9 concurrent calls. Rate limiter concern
    // is addressed by DEVELOPER_FOUNDRY_IDS bypass for test accounts and
    // by the per-foundry monthly cap (which kicks in BEFORE per-call).
    // Dropping from 18 min to ~2 min end-to-end for the reviews stage.
    await Promise.allSettled(
        reviewable.map((mod) =>
            runFangReviewBackground(
                projectId,
                mod.id,
                foundryId,
                null,
                "auto.supplier-match-complete",
            ).catch((err: unknown) => {
                console.warn(
                    `[autopilot] Fang review threw for module ${mod.id}:`,
                    err instanceof Error ? err.message : err,
                )
                return { ok: false as const, error: "threw" }
            }),
        ),
    )

    // v1.2: after Fang reviews finish, advance to the PDF-export stage
    // rather than closing out. The founder wants a deliverable at the end
    // of autopilot, not just a green chip.
    await advance(projectId, "running_fang_reviews", "generating_pdf")
    // P0.1b: HTTP hop — fresh container for PDF export.
    await scheduleAutopilotStep(projectId, "generatePdf")
}

/**
 * Stage 9 (v1.2): render the Forge project-pack PDF, upload it to Supabase
 * Storage, and record a report_downloads row so the founder can find it
 * from the workspace. Non-fatal on failure — autopilot still closes out
 * "done" even if the PDF render fails (founder can retry from /export).
 */
async function stepGeneratePdf(projectId: string): Promise<void> {
    const foundryId = await getProjectFoundryId(projectId)
    if (!foundryId) {
        await recordFailure(projectId, "generating_pdf", "project not found")
        return
    }

    try {
        const { exportProjectPdfBackground } = await import(
            "@/actions/export-project-pdf"
        )
        const result = await exportProjectPdfBackground(projectId, foundryId)
        if (!result.ok) {
            console.warn(
                "[autopilot] PDF render returned error (non-fatal):",
                result.error,
            )
            // Still close out autopilot — founder can retry from the
            // Export page manually.
            await markDone(projectId, "generating_pdf")
            return
        }

        // Upload to Supabase Storage bucket `report-downloads` so the
        // founder has a persistent link. Bucket policy: public-signed,
        // foundry-scoped paths. If the bucket doesn't exist or upload
        // fails, log + continue — the PDF bytes were generated, we just
        // can't persist the link.
        const admin = createAdminClient()
        const buffer = Buffer.from(result.base64, "base64")
        const storagePath = `${foundryId}/${projectId}/${result.filename}`

        try {
            const { error: uploadErr } = await admin.storage
                .from("report-downloads")
                .upload(storagePath, buffer, {
                    contentType: "application/pdf",
                    upsert: true,
                })
            if (uploadErr) {
                console.warn(
                    "[autopilot] PDF upload failed (non-fatal):",
                    uploadErr.message,
                )
            } else {
                // V1 FIX (2026-04-24): report_downloads.profile_id is NOT NULL
                // with no default. Prior insert omitted it — Postgres rejected
                // the row silently (no error propagation), so the PDF landed
                // in storage but never surfaced in the UI. Resolve the
                // foundry owner's profile_id explicitly.
                const { data: ownerRow } = await admin
                    .from("foundries")
                    .select("owner_id")
                    .eq("id", foundryId)
                    .maybeSingle()
                const profileId = ownerRow?.owner_id ?? null
                if (!profileId) {
                    console.warn(
                        `[autopilot] PDF uploaded but no foundry owner_id for ${foundryId} — skipping report_downloads insert`,
                    )
                } else {
                    // GOTCHA (2026-04-24): report_downloads has CHECK
                    // constraint chk_report_source that only allows
                    // ['cad-lab','reports','investors','finance','agents'].
                    // 'cad-lab' is semantically correct — autopilot is a
                    // CAD-lab product. Using anything else silently fails.
                    const { error: insertErr } = await admin
                        .from("report_downloads")
                        .insert({
                            foundry_id: foundryId,
                            profile_id: profileId,
                            report_name: result.filename,
                            report_source: "cad-lab",
                            file_format: "pdf",
                            file_size_bytes: result.sizeBytes,
                            storage_path: storagePath,
                        })
                    if (insertErr) {
                        console.warn(
                            "[autopilot] report_downloads insert failed (non-fatal, PDF in storage):",
                            insertErr.message,
                        )
                    } else {
                        console.info(
                            `[autopilot] PDF landed in storage + report_downloads for project ${projectId}`,
                        )
                    }
                }
            }
        } catch (uploadThrow) {
            console.warn(
                "[autopilot] PDF storage upload threw (non-fatal):",
                uploadThrow instanceof Error ? uploadThrow.message : uploadThrow,
            )
        }

        await markDone(projectId, "generating_pdf")
    } catch (err) {
        console.error(
            "[autopilot] PDF export threw:",
            err instanceof Error ? err.message : err,
        )
        // Still close out — the project is complete apart from the PDF
        // artefact. Founder can regenerate from /export if needed.
        await markDone(projectId, "generating_pdf")
    }
}

// ─── Internals ─────────────────────────────────────────────────────────

interface WaitForStageOpts {
    specialistId: string
    stage: string
    stageSlug: AutopilotStage
    onDone: () => Promise<void>
    /**
     * Optional re-trigger callback. When the latest pipeline_runs row for
     * this stage was swept as TIMEOUT_STALL (Vercel 300s cap killed the
     * function mid-chain), waitForStage re-invokes this callback once to
     * schedule a fresh run of the underlying action before giving up. #88
     * fix — without this, a stalled stage stays failed forever and the UI
     * chip lies "pipeline run failed" even though no action logic failed.
     */
    reTrigger?: () => Promise<void>
}

/**
 * Polls pipeline_runs for a matching row and dispatches based on status:
 *   - status='done'   → call onDone()
 *   - status='failed' + error_code='TIMEOUT_STALL' → call reTrigger (once),
 *     then continue polling. If reTrigger isn't provided, fall through to
 *     recordFailure so the chip doesn't lie.
 *   - status='failed' (any other code) → record failure, stop
 *   - status='cancelled' → record failure, stop
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
    let reTriggered = false

    while (Date.now() < deadline) {
        // GOTCHA (2026-04-23): when the stage has duplicate runs (e.g.
        // tickImageRenderChain + user "Run autopilot" both fire the same
        // stage, or a TIMEOUT_STALL sweep runs concurrent with a live
        // re-trigger), checking only the most-recent row by created_at
        // hides an earlier `done` behind a later `running` / `failed`.
        // Symptom: BESS dc8c1def's BOM actually succeeded at 17:24:36 but
        // autopilot's poll picked the duplicate `running` row and waited
        // 240s for it, timing out — even though the done row existed
        // throughout. Fix: check for any done row first; any single success
        // on the specialist+stage is a stage completion regardless of how
        // many other rows are still running or failed.
        const { data: doneRow } = await admin
            .from("pipeline_runs")
            .select("id")
            .eq("project_id", projectId)
            .eq("specialist_id", opts.specialistId)
            .eq("stage", opts.stage)
            .eq("status", "done")
            .limit(1)
            .maybeSingle()

        if (doneRow) {
            await opts.onDone()
            return
        }

        const { data: row } = await admin
            .from("pipeline_runs")
            .select("id, status, error_code, error_message")
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
            const isStallSweep =
                row.status === "failed" && row.error_code === "TIMEOUT_STALL"
            if (isStallSweep && opts.reTrigger && !reTriggered) {
                // Phase-2 recovery: the previous run got killed mid-flight by
                // Vercel's 300s cap. Re-fire the underlying action from a
                // fresh lambda and keep polling. One attempt only — if a
                // second stall hits we fall through to permanent failure.
                reTriggered = true
                console.warn(
                    `[autopilot] waitForStage re-triggering after TIMEOUT_STALL for ` +
                        `${opts.specialistId}:${opts.stage} (project ${projectId})`,
                )
                try {
                    await opts.reTrigger()
                } catch (err) {
                    console.error(
                        "[autopilot] waitForStage reTrigger threw:",
                        err instanceof Error ? err.message : err,
                    )
                    await recordFailure(
                        projectId,
                        opts.stageSlug,
                        `Stall re-trigger failed: ${err instanceof Error ? err.message : String(err)}`,
                    )
                    return
                }
                // Keep polling — the new run will land a fresh row with
                // status='running' which the next iteration picks up.
                await sleep(POLL_INTERVAL_MS)
                continue
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

/**
 * Tick — re-enter the current autopilot stage from outside the after() chain.
 *
 * @description The after()-within-after() cascade that drives autopilot is
 * inherently fragile on Vercel: the serverless container can be terminated
 * at any point between stages, silently dropping the in-flight poll loop
 * and leaving autopilot_state stuck on a stage whose runner isn't actually
 * running. Symptom: waiting_max in state but no brief.decompose pipeline_run.
 *
 * This function provides a "ping" entry point the UI can call whenever a
 * founder lands on the workspace page. It reads autopilot_state and, if
 * the current stage looks stuck (no recent pipeline_run activity for the
 * expected specialist/stage), re-invokes the stage runner via `after()` so
 * the chain can resume. Idempotent — if a runner is already in flight,
 * the inner stepWaitForX self-healing check prevents double-firing.
 *
 * Call from:
 *   - the workspace page on initial server render
 *   - the autopilot-button's poll interval (every ~30s)
 */
export async function tickAutopilotStage(
    projectId: string,
): Promise<{ ok: true; ticked: boolean; stage: AutopilotStage | null }> {
    return withAuth<{ ok: true; ticked: boolean; stage: AutopilotStage | null }>(async ({ foundryId }) => {
        const admin = createAdminClient()
        const { data: project } = await admin
            .from("cad_lab_projects")
            .select("foundry_id, autopilot_state")
            .eq("id", projectId)
            .maybeSingle()
        if (!project || project.foundry_id !== foundryId) {
            return { ok: true, ticked: false, stage: null }
        }
        const state = (project.autopilot_state as AutopilotState | null) ?? null
        if (!state || state.finished_at) {
            return { ok: true, ticked: false, stage: state?.stage ?? null }
        }

        // Re-enter the current stage. Each stepXxx has its own self-healing
        // check + idempotency so a duplicate re-entry is safe.
        const stage = state.stage
        after(async () => {
            try {
                switch (stage) {
                    case "waiting_chase":
                        await stepWaitForChase(projectId)
                        break
                    case "locking_brief":
                        await stepLockBrief(projectId)
                        break
                    case "waiting_max":
                        await stepWaitForMax(projectId)
                        break
                    case "waiting_sizing":
                        await stepWaitForSizing(projectId)
                        break
                    case "waiting_layout":
                        await stepWaitForLayout(projectId)
                        break
                    case "waiting_bom":
                        await stepWaitForBom(projectId)
                        break
                    case "waiting_finn":
                        await stepWaitForFinn(projectId)
                        break
                    case "generating_illustration":
                        await stepGenerateIllustration(projectId)
                        break
                    case "matching_suppliers":
                        await stepMatchSuppliers(projectId)
                        break
                    case "running_fang_reviews":
                        await stepRunFangReviews(projectId)
                        break
                    case "generating_pdf":
                        await stepGeneratePdf(projectId)
                        break
                }
            } catch (err) {
                console.error(
                    `[autopilot:tick] re-enter ${stage} threw:`,
                    err instanceof Error ? err.message : err,
                )
            }
        })

        return { ok: true, ticked: true, stage }
    })
}

/**
 * Reads autopilot_state, flips stage, stamps completed_stages.
 *
 * Forward-only guard (v1.2): `advance(from, to)` is a no-op when
 *   - current.stage !== from (we're not at the from-stage any more), OR
 *   - current.finished_at is set (autopilot already terminated), OR
 *   - to is already in completed_stages (we've passed to before).
 *
 * This fixes the race the tickAutopilotStage introduced: when a tick
 * re-enters stepWaitForX while the main pipeline has already moved
 * forward, the tick's onDone would call advance(my-stage → next-stage)
 * which then wrote `stage=next` unconditionally — reverting the pipeline
 * backwards from wherever it actually was. Observed 2026-04-23 on project
 * 0d48c88d: stage flipped back to waiting_chase after Max was already
 * supposed to be running.
 */
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
    if (current.finished_at) {
        // Autopilot already terminated (success or failure). Advances
        // from stragglers are ignored — terminal state is final.
        return
    }
    if (current.stage !== fromStage) {
        // Someone else has moved the pipeline past fromStage already.
        // A stale advance would revert stage backwards. No-op.
        console.warn(
            `[autopilot] advance(${fromStage} → ${toStage}) skipped: current stage is ${current.stage}`,
        )
        return
    }
    if (current.completed_stages.includes(toStage)) {
        // Defensive: somehow toStage is already marked completed. Don't
        // reopen a closed stage.
        console.warn(
            `[autopilot] advance(${fromStage} → ${toStage}) skipped: ${toStage} already in completed_stages`,
        )
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
    if (current.finished_at) {
        // Already terminal — don't re-stamp. Stale failure callbacks from a
        // tick-duplicated runner must not overwrite a success with their
        // own timeout error.
        return
    }
    // Only record failure for the CURRENT stage. A stale runner that polled
    // for an old stage and timed out must not flip the state backwards.
    if (current.stage !== stageSlug) {
        console.warn(
            `[autopilot] recordFailure(${stageSlug}) skipped: current stage is ${current.stage}`,
        )
        return
    }
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

// ─── Stage dispatch (HTTP-hop chain) ───────────────────────────────────

/**
 * Fire-and-forget HTTP hop to /api/autopilot-step, which re-invokes the
 * matching `stepXxx` runner on a fresh Vercel serverless container (fresh
 * 300s budget per stage).
 *
 * ## Why HTTP, not after()
 *
 * `after()` in Next.js EXTENDS the current serverless invocation — it does
 * NOT spawn a new one. So the chain
 *   stepWaitForChase → after(stepLockBrief) → after(stepWaitForMax) → ...
 * shared ONE 300s Vercel budget across every stage in the cascade, not
 * N × 300s. This was the root cause of the autopilot wedge (2026-04-24)
 * where BESS abcb2581 hit "Task timed out after 300 seconds" mid-BOM after
 * burning the budget on Chase + Max + BOM-start inside a single container.
 *
 * An internal HTTP POST to /api/autopilot-step lands on a SEPARATE Vercel
 * invocation with its OWN 300s maxDuration. Each stage gets its full
 * budget — Chase gets 300s, Max gets 300s, BOM gets 300s, not all three
 * sharing 300s.
 *
 * ## Fire-and-forget semantics
 *
 * We deliberately do NOT await. The caller (the previous stage runner)
 * has just persisted autopilot_state and is ready to return; its Vercel
 * container should be free to tear down once its response lands.
 * Awaiting the POST would block teardown and re-introduce the same
 * chaining problem we're fixing.
 *
 * ## Failure recovery
 *
 * If the fetch fails to land (network blip, cold start, DNS resolution),
 * `tickAutopilotStage()` — called on every workspace page render and by
 * the autopilot button's 15s poll — detects the stale state and re-fires
 * the current stage via after(). The self-heal is idempotent because
 * every stepXxx reads state fresh and short-circuits if the stage has
 * already advanced.
 */
async function scheduleAutopilotStep(
    projectId: string,
    step: AutopilotStepName,
): Promise<void> {
    // Reuses FORGE_RENDER_STAGE_SECRET — one secret for both stage-chain
    // routes (/api/render-stage + /api/autopilot-step). Rotating one key
    // covers both surfaces; simpler for ops than parallel keys.
    const secret = process.env.FORGE_RENDER_STAGE_SECRET
    if (!secret) {
        // SECURITY: refuse to fire the hop when the secret isn't
        // configured. Hard-fails the chain rather than issuing an
        // un-authenticated request. Surfaces the misconfiguration loudly
        // so ops can fix it instead of drifting into a silent wedge.
        console.error(
            "[autopilot] FORGE_RENDER_STAGE_SECRET not set — " +
                "cannot schedule next stage. Chain will stall until " +
                "tickAutopilotStage() recovers it.",
        )
        return
    }

    const url = `${getBaseUrl()}/api/autopilot-step`

    // GOTCHA (2026-04-24, run 11): `after(fetch)` is unreliable on Vercel
    // when the calling handler returns very quickly. Observed:
    //   - waitForMax handler ran ~150s → after(fetch) for waitForSizing fired ✓
    //   - waitForSizing handler ran ~0.2s → after(fetch) for waitForLayout
    //     did NOT fire ✗ (no POST in logs, chain wedged at waiting_layout)
    // Hypothesis: short-lived containers get torn down before Vercel
    // processes the `after()` queue, even though the docs say `after()`
    // extends container lifetime.
    //
    // Fix: inline-await the fetch with a 2s client-side abort. The target
    // route runs on a fresh container with full 300s budget; our client
    // only needs to stay alive long enough for the TCP handshake + tiny
    // JSON body to flush (<200ms in practice). Once Vercel's edge has the
    // request, the target handler runs independently of our client socket.
    // keepalive:true hints the runtime to finish the request even if the
    // calling context is unwinding.
    //
    // Budget impact: +200ms (typically) to 2s (worst case) per stage. The
    // autopilot stages each have 300s budget — this is negligible.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2000)
    try {
        await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${secret}`,
            },
            body: JSON.stringify({ projectId, step }),
            cache: "no-store",
            signal: controller.signal,
        })
        console.info(`[autopilot] hop dispatched: ${step}`)
    } catch (err) {
        // AbortError is the expected path — we aborted after 2s to let the
        // caller return. The target server received the request well before
        // that and is processing independently.
        if (err instanceof Error && err.name === "AbortError") {
            console.info(`[autopilot] hop sent (aborted after 2s): ${step}`)
        } else {
            console.error(
                `[autopilot] next stage fetch (${step}) failed:`,
                err instanceof Error ? err.message : err,
            )
        }
    } finally {
        clearTimeout(timer)
    }
}

/**
 * Dispatcher called by /api/autopilot-step on a fresh Vercel container.
 * Maps an `AutopilotStepName` to its matching `stepXxx` runner, wrapping
 * each branch in try/catch so the route handler doesn't have to.
 *
 * Each stage runner internally calls recordFailure() on hard errors, so
 * the catch here is a defensive backstop — if a runner throws past its
 * own catch (truly unexpected), we still want the autopilot state to
 * reflect the failure rather than silently wedge.
 *
 * Exported so the /api/autopilot-step route can invoke it. Must stay
 * `async` to satisfy the "use server" constraint.
 */
export async function dispatchAutopilotStep(
    projectId: string,
    step: AutopilotStepName,
): Promise<void> {
    try {
        switch (step) {
            case "waitForChase":
                await stepWaitForChase(projectId)
                return
            case "lockBrief":
                await stepLockBrief(projectId)
                return
            case "waitForMax":
                await stepWaitForMax(projectId)
                return
            case "waitForSizing":
                await stepWaitForSizing(projectId)
                return
            case "waitForLayout":
                await stepWaitForLayout(projectId)
                return
            case "waitForBom":
                await stepWaitForBom(projectId)
                return
            case "waitForFinn":
                await stepWaitForFinn(projectId)
                return
            case "generateIllustration":
                await stepGenerateIllustration(projectId)
                return
            case "matchSuppliers":
                await stepMatchSuppliers(projectId)
                return
            case "runFangReviews":
                await stepRunFangReviews(projectId)
                return
            case "generatePdf":
                await stepGeneratePdf(projectId)
                return
        }
    } catch (err) {
        console.error(
            `[autopilot:dispatch] stage ${step} threw past its own catch:`,
            err instanceof Error ? err.stack ?? err.message : err,
        )
        // Mirror the stageSlug the runner would have used so the chip in
        // the UI reflects the failing stage, not a generic "unknown".
        // Inlined map (can't pull out to a helper: "use server" files
        // forbid non-async exports/helpers at module scope).
        let stageSlug: AutopilotStage | null
        switch (step) {
            case "waitForChase":
                stageSlug = "waiting_chase"
                break
            case "lockBrief":
                stageSlug = "locking_brief"
                break
            case "waitForMax":
                stageSlug = "waiting_max"
                break
            case "waitForSizing":
                stageSlug = "waiting_sizing"
                break
            case "waitForLayout":
                stageSlug = "waiting_layout"
                break
            case "waitForBom":
                stageSlug = "waiting_bom"
                break
            case "waitForFinn":
                stageSlug = "waiting_finn"
                break
            case "generateIllustration":
                stageSlug = "generating_illustration"
                break
            case "matchSuppliers":
                stageSlug = "matching_suppliers"
                break
            case "runFangReviews":
                stageSlug = "running_fang_reviews"
                break
            case "generatePdf":
                stageSlug = "generating_pdf"
                break
            default:
                stageSlug = null
        }
        if (stageSlug) {
            await recordFailure(projectId, stageSlug, errMessage(err))
        }
    }
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
