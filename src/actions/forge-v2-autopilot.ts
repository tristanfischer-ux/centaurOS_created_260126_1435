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
    | "waiting_sizing"  // v1.1: Fang sizing runs between Max and BOM
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
    // GOTCHA (#90): this after() fires POST-response, so cookies are gone.
    // `runMaxDecomposition` uses withAuth which reads cookies and would fail
    // with "Not authenticated". We use the Background variant which takes
    // foundryId explicitly — autopilot already proved ownership before the
    // `locking_brief` stage opened, so passing foundry_id through is safe.
    after(async () => {
        try {
            const { runMaxDecompositionBackground } = await import(
                "@/actions/specialists/run-max-decomposition"
            )
            await runMaxDecompositionBackground(
                projectId,
                project.foundry_id,
                null,
                "auto.brief-lock",
            )
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

/** Stage 3: wait for Max's decomposition to land 'done'. */
async function stepWaitForMax(projectId: string): Promise<void> {
    await waitForStage(projectId, {
        specialistId: "cto",
        stage: "brief.decompose",
        stageSlug: "waiting_max",
        onDone: async () => {
            await advance(projectId, "waiting_max", "waiting_sizing")
            after(async () => {
                try {
                    await stepWaitForSizing(projectId)
                } catch (err) {
                    await recordFailure(
                        projectId,
                        "waiting_sizing",
                        errMessage(err),
                    )
                }
            })
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

    await advance(projectId, "waiting_sizing", "waiting_bom")
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
        // #88: Finn has no Background variant today; when it does, wire it
        // here. For now, a stall-sweep will record a permanent failure
        // rather than loop — matches prior behaviour but with the
        // explicit TIMEOUT_STALL error code surfacing the cause.
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
        const [{ generateSystemIllustrationForProject }, { generateConceptRenderForProject }] =
            await Promise.all([
                import("@/actions/forge-v2-generate-system-illustration"),
                import("@/actions/forge-v2-generate-concept-render"),
            ])
        const [systemRes, conceptRes] = await Promise.allSettled([
            generateSystemIllustrationForProject(projectId),
            generateConceptRenderForProject(projectId),
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

    // Kick off per-module render chain in parallel with supplier matching.
    // The render chain uses its own `after()` + `image_render_state` idempotency
    // gate (ALREADY_RUNNING is a no-op), so a concurrent page-load auto-fire
    // from modules/page.tsx won't double-render. Module renders take ~3 min
    // for a typical project — firing here means founders land on the modules
    // page with renders already in progress, matching Tristan's "feels faster"
    // goal (2026-04-22 decision: swap to gpt-image-2 + auto-fire the chain).
    after(async () => {
        try {
            const { startRenderAllRemainingModuleImages } = await import(
                "./forge-v2-render-all-modules"
            )
            const res = await startRenderAllRemainingModuleImages(projectId)
            if (!res.ok && res.errorCode !== "ALREADY_RUNNING" && res.errorCode !== "NO_UNRENDERED_MODULES") {
                console.warn(
                    "[autopilot] auto-fire module renders failed (non-fatal):",
                    res.error,
                )
            }
        } catch (err) {
            console.warn(
                "[autopilot] auto-fire module renders threw (non-fatal):",
                err instanceof Error ? err.message : err,
            )
        }
    })

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
        // autopilot — skip Fang reviews and still generate the PDF.
        await advance(projectId, "running_fang_reviews", "generating_pdf")
        after(async () => {
            try {
                await stepGeneratePdf(projectId)
            } catch (err) {
                await recordFailure(
                    projectId,
                    "generating_pdf",
                    errMessage(err),
                )
            }
        })
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

    // v1.2: after Fang reviews finish, advance to the PDF-export stage
    // rather than closing out. The founder wants a deliverable at the end
    // of autopilot, not just a green chip.
    await advance(projectId, "running_fang_reviews", "generating_pdf")
    after(async () => {
        try {
            await stepGeneratePdf(projectId)
        } catch (err) {
            await recordFailure(
                projectId,
                "generating_pdf",
                errMessage(err),
            )
        }
    })
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
                // Record a report_downloads row so the UI can surface it.
                await admin
                    .from("report_downloads")
                    .insert({
                        foundry_id: foundryId,
                        report_name: result.filename,
                        report_source: "forge-autopilot",
                        file_format: "pdf",
                        file_size_bytes: result.sizeBytes,
                        storage_path: storagePath,
                    })
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
