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
 * @architecture (2026-04-25 rewrite) The cron at /api/cron/autopilot-tick
 * is the actual orchestrator. It fires every minute, reads all in-flight
 * autopilot_state rows, and for each project calls the matching fire-endpoint
 * at /api/autopilot-step directly (inline-await fetch with 2s abort). Each
 * stage runs on a fresh Vercel container with its own 300s budget.
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
 *   - Cron: src/app/api/cron/autopilot-tick/route.ts
 */

import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"

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
    | "proofreading"    // v1.4 (2026-04-25 NIGHT): Engine self-review before PDF
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
 * Step names used by the cron orchestrator and the fire-endpoint route
 * /api/autopilot-step. Each maps 1:1 to a stage the cron can dispatch.
 *
 * `lockBrief` is intentionally absent: locking_brief runs synchronously
 * inline in the cron tick via lockBriefSynchronously() and never round-trips
 * through the fire endpoint or STEP_TO_STAGE map.
 *
 * Exported so the route handler can type-narrow request bodies.
 */
export type AutopilotStepName =
    | "waitForChase"
    | "waitForMax"
    | "waitForSizing"
    | "waitForLayout"
    | "waitForBom"
    | "waitForFinn"
    | "generateIllustration"
    | "matchSuppliers"
    | "runFangReviews"
    | "runProofreader"
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
              | "FOUNDRY_LIMIT"
              | "INTERNAL"
      }

// ─── Constants ─────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Max concurrent autopilot chains per foundry. Today (April 2026) the
 *  Anthropic key is shared across the whole platform. A single foundry
 *  starting 5+ projects at once would exhaust org-level rate limits and
 *  starve every other foundry's chain. Cap of 3 lines up with how many
 *  concurrent chains a real founder is likely to want, while bounding
 *  any one tenant's blast radius into the shared LLM quota. */
const MAX_AUTOPILOTS_PER_FOUNDRY = 3

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Kicks off the autopilot walk for a project. Seeds `autopilot_state` to
 * `waiting_chase` and returns. The cron at /api/cron/autopilot-tick picks
 * up the project on its next tick (within ~60s) and drives the pipeline.
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

        // ── 1b. Per-foundry concurrent autopilot cap ────────────────────
        // Today the Anthropic key is shared across the whole platform — a
        // single foundry starting many chains at once exhausts org-level
        // rate limits and starves every other foundry's chains. Cap any
        // one foundry to MAX_AUTOPILOTS_PER_FOUNDRY (= 3) in flight. The
        // count excludes the current project so re-starting a stalled
        // chain on this very project is always allowed.
        const { data: activeRows, error: activeErr } = await admin
            .from("cad_lab_projects")
            .select("id, autopilot_state")
            .eq("foundry_id", foundryId)
            .neq("id", projectId)
            .not("autopilot_state", "is", null)
            .is("autopilot_state->>finished_at", null)
        if (activeErr) {
            console.error(
                "[autopilot:start] active-count lookup failed (non-fatal, allowing start):",
                activeErr.message,
            )
        } else if ((activeRows?.length ?? 0) >= MAX_AUTOPILOTS_PER_FOUNDRY) {
            return {
                ok: false,
                error: `You already have ${MAX_AUTOPILOTS_PER_FOUNDRY} chains running. Wait for one to finish before starting another.`,
                errorCode: "FOUNDRY_LIMIT",
            }
        }

        // Idempotency + stall recovery. A running walk (non-null state,
        // null finished_at) should refuse a second start — EXCEPT when
        // the walk is stalled. Rule: if started_at was more than
        // STALL_THRESHOLD_MS ago, stamp finished_at on the old state (with
        // the stall note) and fall through to seed a fresh walk. 30 min
        // threshold matches the real typical-case envelope.
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
            // seeding the fresh walk. Without this, the cron reads the previous
            // walk's 'failed' or orphaned 'running' row and immediately surfaces
            // a misleading error to the founder.
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

        // ── 3. Cron picks up the project on its next tick (~60s) ────────
        // The cron at /api/cron/autopilot-tick is the actual orchestrator.
        // No hop needed here — seeding autopilot_state is sufficient.
        return { ok: true }
    })
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Pure synchronous brief-lock. Used by the zero-wait cron orchestrator
 * (2026-04-25 rewrite): the cron tick calls this directly when stage ===
 * `locking_brief`, no specialist invocation, no `pipeline_runs` row. All
 * DB ops are <1s; the cron then advances the autopilot_state itself.
 *
 * Returns `{ ok: true }` on success (including the idempotent "already
 * locked" branch) or `{ ok: false, error }` on any DB failure. The cron
 * uses the result to decide between `advance()` and `recordFailure()`.
 */
export async function lockBriefSynchronously(
    projectId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const admin = createAdminClient()

    const { data: project, error: projectErr } = await admin
        .from("cad_lab_projects")
        .select("id, foundry_id, brief_locked_at, design_revision, research")
        .eq("id", projectId)
        .maybeSingle()

    if (projectErr || !project) {
        return {
            ok: false,
            error: projectErr?.message ?? "Project not found",
        }
    }

    if (project.brief_locked_at) {
        // Already locked — idempotent success.
        return { ok: true }
    }

    const lockedAtIso = new Date().toISOString()

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
            return { ok: false, error: updateRevErr.message }
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
            // 23505 = unique violation: a concurrent caller already locked.
            // Treat as idempotent success (the row exists, just not from us).
            if (insertErr.code !== "23505") {
                return { ok: false, error: insertErr.message }
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
        return { ok: false, error: stampErr.message }
    }

    return { ok: true }
}

/**
 * Resolve the foundryId for a project via the admin client. Used by
 * the cron orchestrator and fire-endpoint (which call Background variants
 * of specialists that bypass auth).
 * Returns null when the project is gone.
 */
export async function getProjectFoundryId(projectId: string): Promise<string | null> {
    const admin = createAdminClient()
    const { data } = await admin
        .from("cad_lab_projects")
        .select("foundry_id")
        .eq("id", projectId)
        .maybeSingle()
    return data?.foundry_id ?? null
}

// ─── State management ──────────────────────────────────────────────────

/**
 * Tick — thin status-read. The cron at /api/cron/autopilot-tick is the
 * actual orchestrator and runs every minute.
 *
 * In the cron architecture, tickAutopilotStage no longer needs to dispatch
 * anything. This function exists purely so the workspace page can read the
 * current stage without a separate loadAutopilotState call.
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
        return { ok: true, ticked: false, stage: state?.stage ?? null }
    })
}

/**
 * Reads autopilot_state, flips stage, stamps completed_stages.
 *
 * Forward-only guard (v1.2): `advance(from, to)` is a no-op when
 *   - current.stage !== from (we're not at the from-stage any more), OR
 *   - current.finished_at is set (autopilot already terminated), OR
 *   - to is already in completed_stages (we've passed to before).
 */
export async function advance(
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
export async function recordFailure(
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
    // L9-DEFENSIVE (2026-04-26): manual reset SQL frequently omits
    // `failed_stages` from the rebuilt autopilot_state JSONB, leaving it
    // null. The spread `[...null, x]` throws "is not iterable" — taking
    // the cron tick down 500 across all projects, not just the one with
    // the malformed state. Coalesce to an empty array.
    const failedPrior = Array.isArray(current.failed_stages)
        ? current.failed_stages
        : []
    const failed = Array.from(new Set([...failedPrior, stageSlug]))
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
export async function markDone(
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

// ─── Private helpers ────────────────────────────────────────────────────

/** 1 → "Rev A", 2 → "Rev B", ... 26 → "Rev Z", 27+ → "Rev 27". Same
 *  helper as brief-lock.ts — duplicated here to avoid a cross-import
 *  cycle between two "use server" files. */
function revisionNumberToLabel(n: number): string {
    if (!Number.isFinite(n) || n < 1) return "Rev 1"
    if (n > 26) return `Rev ${n}`
    return `Rev ${String.fromCharCode(64 + n)}`
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
