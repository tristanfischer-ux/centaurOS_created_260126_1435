"use server"

/**
 * @file forge-v2-render-all-modules.ts — tab-close-safe per-module render loop.
 *
 * @description The "Generate module renders" button used to drive a client-side
 * sequential for-loop that called `generateOneModuleImage()` once per module.
 * If the founder closed the tab or navigated away mid-loop, the browser JS
 * context tore down and any unrendered modules were stranded.
 *
 * Observed 2026-04-21: Container Farm CF-40's Starboard Grow Rack was never
 * rendered because the agent navigated agent-browser to /suppliers mid-loop.
 *
 * @architecture Vercel caps serverless functions at 300s. One module = 30-60s
 * typical. A fire-and-forget batch action rendering all N modules blows that
 * cap on ~6+ modules. A single-module action is safe but must not rely on the
 * client to chain the next module — that's exactly the tab-close failure
 * mode this file exists to fix.
 *
 * Solution: split the walk into stages, one module per stage, chained via
 * `after()` from next/server. Each stage:
 *   1. Reads the current `image_render_state` from the project row
 *   2. Picks the next unrendered module (primaries-first ordering, same as
 *      the old client-loop used)
 *   3. Calls `generateOneModuleImage(projectId, moduleId)` — one 30-60s call
 *   4. Persists progress (completed_ids / failed_ids / current_id / error)
 *   5. If more work remains, `after(() => renderNextModuleStage(projectId))`
 *   6. Otherwise stamps `finished_at` and stops
 *
 * The client never drives the loop — it only triggers start via
 * `startRenderAllRemainingModuleImages()` and polls state via
 * `router.refresh()` on the modules page.
 *
 * @failure policy A failed module render is recorded in `failed_ids` and
 * the walk continues to the next module. One bad module doesn't abort the
 * whole loop — the founder can retry the failed ones from the "Render
 * remaining" button which only queues modules still missing an imageUrl.
 *
 * @concurrency safety Last-writer-wins on the jsonb column is acceptable.
 * The idempotency gate in `startRenderAllRemainingModuleImages` returns
 * ALREADY_RUNNING if a walk is already in flight (finished_at === null),
 * so two concurrent stage chains for the same project don't co-exist. A
 * double-click on the button therefore doesn't double the render cost.
 *
 * @related
 *   - Migration: supabase/migrations/20260425000000_cad_lab_image_render_state.sql
 *   - Per-module unit of work: src/actions/forge-v2-generate-one-module-image.ts
 *   - Pattern reference:       src/actions/forge-v2-autopilot.ts
 *   - Client:                  src/app/(platform)/the-forge-v2/projects/[id]/
 *                              modules/generate-module-images-button.tsx
 */

import { after } from "next/server"

import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import { getBaseUrl } from "@/lib/domains"
import type { CadLabModule } from "@/lib/cad-lab-types"
import { generateOneModuleImageBackground } from "./forge-v2-generate-one-module-image"

// ─── Types ─────────────────────────────────────────────────────────────

/**
 * Per-module failure detail, persisted alongside `failed_ids` so the
 * DB records the WHY of every failure, not just the id. Added 2026-04-23
 * (P1.5) to solve the "40× stage X failed, zero signal" debugging trap.
 *
 *   - `provider`   — which image provider threw (e.g. "gpt-image-2"),
 *                    `null` when the failure happened before we reached
 *                    a provider (project load, ownership, bad input).
 *   - `rawError`   — RAW, un-sanitised error message + stack. Truncated
 *                    to `RAW_ERROR_MAX_LEN` upstream by
 *                    `extractRawErrorMessage()`. DO NOT surface this to
 *                    the UI — it's surface 2 of the three-surface
 *                    policy (see `src/lib/security/sanitize.ts` header).
 *   - `attempt`    — 1-indexed attempt count for this module within the
 *                    current render chain. Always 1 today; here so that
 *                    when per-module retry lands the same field can
 *                    carry "failed on attempt 3" without another
 *                    migration.
 *   - `timestamp`  — ISO-8601 wall clock for when the failure was
 *                    recorded. Lets the log-pull helper correlate with
 *                    Vercel logs whose retention is only ~1 hour.
 */
export interface ImageRenderFailureReason {
    provider: string | null
    rawError: string
    attempt: number
    timestamp: string
}

export interface ImageRenderState {
    started_at: string
    finished_at: string | null
    total: number
    completed_ids: string[]
    failed_ids: string[]
    /**
     * Per-module reason map. Key = module id (matches entries in
     * `failed_ids`). Added in P1.5 (2026-04-23) — before this field
     * existed, a failure chain produced `failed_ids: [a, b, c, d]` and
     * the ops/console story was "40 identical lines, which module caused
     * which one?". Optional for backwards compatibility with the JSONB
     * column shape; callers that didn't populate it before the migration
     * are treated as `{}`.
     */
    failed_reasons?: Record<string, ImageRenderFailureReason>
    current_id: string | null
    error: string | null
}

export type StartRenderAllResult =
    | { ok: true; state: ImageRenderState }
    | {
          ok: false
          error: string
          errorCode:
              | "PROJECT_NOT_FOUND"
              | "PROJECT_FORBIDDEN"
              | "ALREADY_RUNNING"
              | "NO_UNRENDERED_MODULES"
              | "INTERNAL"
      }

// ─── Constants ─────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Starts the tab-close-safe render loop. Returns immediately after seeding
 * the `image_render_state` column and scheduling the first stage via
 * `after()`. The stage chain then drives itself through every unrendered
 * module on the project.
 *
 * SECURITY: uses withAuth + explicit foundry-ownership check. Subsequent
 * stage runners trust that ownership was verified here and use the admin
 * client directly (the project id is already scoped to this foundry).
 */
export async function startRenderAllRemainingModuleImages(
    projectId: string,
): Promise<StartRenderAllResult> {
    return withAuth<StartRenderAllResult>(async ({ foundryId }) => {
        return startRenderAllRemainingModuleImagesInternal(projectId, foundryId)
    })
}

/**
 * Background entry — called from `after()` post-response contexts (e.g.
 * the autopilot `stepGenerateIllustration` render auto-fire) where
 * cookies are gone and `withAuth` would return "Unauthorized". Caller
 * MUST have already resolved foundryId from an authenticated request.
 *
 * This is the #90 pattern applied to the render-chain kick-off.
 */
export async function startRenderAllRemainingModuleImagesBackground(
    projectId: string,
    foundryId: string,
): Promise<StartRenderAllResult> {
    return startRenderAllRemainingModuleImagesInternal(projectId, foundryId)
}

async function startRenderAllRemainingModuleImagesInternal(
    projectId: string,
    foundryId: string,
): Promise<StartRenderAllResult> {
    {
        const admin = createAdminClient()

        // ── 1. Ownership + precondition check ────────────────────────
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, modules, image_render_state")
            .eq("id", projectId)
            .maybeSingle()

        if (projectErr) {
            console.error(
                "[render-all-modules:start] project lookup failed:",
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

        // Idempotency + recovery. `finished_at === null` with a non-null
        // state is "running" in the happy path. BUT — we observed
        // 2026-04-21 that `after()` callbacks can silently die mid-chain
        // on Vercel container teardown: state persists as "current_id:
        // hvac_system, finished_at: null" forever, and every subsequent
        // Run click hits ALREADY_RUNNING. That's a wedge, not idempotency.
        //
        // Recovery rule: if state is non-null, finished_at is null, AND
        // started_at was more than STALL_THRESHOLD_MS ago (no render
        // would legitimately take that long since per-module budget is
        // 300s × 2 parallel), treat it as stalled. We stamp finished_at
        // on the old state, then continue into the fresh seeding below
        // so the founder's click actually restarts the chain.
        const STALL_THRESHOLD_MS = 15 * 60 * 1000
        const existing = project.image_render_state as ImageRenderState | null
        if (existing && existing.finished_at === null) {
            const startedMs = Date.parse(existing.started_at)
            const stalled =
                !Number.isNaN(startedMs) &&
                Date.now() - startedMs > STALL_THRESHOLD_MS
            if (!stalled) {
                return {
                    ok: false,
                    error: "A render loop is already running on this project.",
                    errorCode: "ALREADY_RUNNING",
                }
            }
            console.warn(
                `[render-all-modules:start] detected stalled state for ${projectId} ` +
                    `(started ${existing.started_at}, current_id=${existing.current_id ?? "null"}). ` +
                    `Auto-recovering — marking old state finished and starting fresh chain.`,
            )
            await persistState(projectId, {
                ...existing,
                finished_at: new Date().toISOString(),
                error:
                    existing.error ??
                    `Chain stalled after ${(Date.now() - startedMs) / 1000}s; auto-recovered.`,
            })
        }

        // ── 2. Find unrendered modules ───────────────────────────────
        const modules = (project.modules as CadLabModule[] | null) ?? []
        const unrendered = orderForRender(modules).filter(
            (m) => !hasImage(m),
        )

        if (unrendered.length === 0) {
            return {
                ok: false,
                error: "All modules already have renders.",
                errorCode: "NO_UNRENDERED_MODULES",
            }
        }

        // ── 3. Seed the initial state ────────────────────────────────
        const startedAt = new Date().toISOString()
        const initial: ImageRenderState = {
            started_at: startedAt,
            finished_at: null,
            total: unrendered.length,
            completed_ids: [],
            failed_ids: [],
            failed_reasons: {},
            current_id: unrendered[0].id,
            error: null,
        }

        const { error: seedErr } = await admin
            .from("cad_lab_projects")
            .update({
                // image_render_state is new; database.types may not be
                // regenerated yet on all deploy branches. Cast through
                // Record to keep the update typed as accepting this
                // arbitrary jsonb object.
                image_render_state: initial,
            } as unknown as never)
            .eq("id", projectId)
            .eq("foundry_id", foundryId)

        if (seedErr) {
            console.error(
                "[render-all-modules:start] seed state failed:",
                seedErr.message,
            )
            return {
                ok: false,
                error: "Couldn't start the render loop.",
                errorCode: "INTERNAL",
            }
        }

        // ── 4. Schedule the first stage runner ───────────────────────
        // after() keeps the Vercel container alive past this request so
        // the stage runner actually gets to run. Plain `void` would tear
        // the container down on response. Dynamic import stops `after()`
        // from capturing the outer module's closure — see
        // forge-v2-autopilot.ts for why that matters.
        after(async () => {
            try {
                const { renderNextModuleStage } = await import(
                    "./forge-v2-render-all-modules"
                )
                await renderNextModuleStage(projectId)
            } catch (err) {
                console.error(
                    "[render-all-modules:start] first stage threw:",
                    err instanceof Error ? err.message : err,
                )
                await recordFatalFailure(projectId, errMessage(err))
            }
        })

        return { ok: true, state: initial }
    }
}

/**
 * Internal stage runner — drives one module render, persists progress,
 * then schedules itself via `after()` for the next module. Exported so
 * the dynamic `import("./forge-v2-render-all-modules")` inside `after()`
 * callbacks can resolve it, but not intended as a public server action.
 *
 * Idempotent against both duplicate calls and cleared state:
 *   - If image_render_state is null or finished, returns immediately.
 *   - If no unrendered modules remain, stamps finished_at and returns.
 */
export async function renderNextModuleStage(
    projectId: string,
): Promise<void> {
    const admin = createAdminClient()

    // 1. Load project state. foundry_id is pulled so the per-module render
    //    call can use the Background variant below — this stage runs
    //    without cookies (either /api/render-stage HTTP hop or an after()
    //    chain from the autopilot), so the withAuth-wrapped
    //    generateOneModuleImage would return "Unauthorized" and every
    //    module would appear to "fail" for no legible reason.
    const { data: project, error: projectErr } = await admin
        .from("cad_lab_projects")
        .select("id, foundry_id, modules, image_render_state")
        .eq("id", projectId)
        .maybeSingle()

    if (projectErr || !project) {
        console.error(
            "[render-all-modules:stage] project lookup failed:",
            projectErr?.message ?? "not found",
        )
        return
    }

    const foundryId =
        typeof project.foundry_id === "string" ? project.foundry_id : null
    if (!foundryId) {
        console.error(
            "[render-all-modules:stage] project missing foundry_id — bailing",
            { projectId },
        )
        return
    }

    const state = project.image_render_state as ImageRenderState | null
    if (!state) {
        // Someone reset the state mid-run. Silently no-op.
        return
    }
    if (state.finished_at !== null) {
        // Already finished — don't reprocess.
        return
    }

    // 2. Find next module to render. batch=1 per stage.
    //
    // GOTCHA: batch=2 looked safe on paper (two ~60s gpt-image-2 calls
    // in parallel, 300s Vercel cap) but the reference-aware pipeline adds
    // a geometric-consistency-score check that fires a second gpt-image-2
    // call when score <7/10, and those retries compound in parallel
    // enough that the stage busted 300s roughly 1/3 of the time. Observed
    // 2026-04-23 on HAPS eadae45d: 2-at-a-time lost 2/4 modules to the
    // Vercel cap mid-render, leaving the pipeline with `failed_ids: 2`
    // entries and no way to distinguish "module is genuinely unrenderable"
    // from "Vercel killed the container".
    //
    // batch=1 trades 2x wall-clock (7 modules × ~90s = ~10 min) for
    // guaranteed per-module 300s budget. The tickImageRenderChain()
    // recovery branch handles dropped after()s between stages, so the
    // user doesn't feel the slower walk — they still see the chain make
    // progress every ~90s until finished_at is stamped.
    //
    // GOTCHA (2026-04-23): the batch queue must exclude failed_ids, not
    // just !hasImage. A module that lands in failed_ids (e.g. payload_bay
    // failed with a sanitized "unexpected error" on HAPS) has no imageUrl,
    // so a plain !hasImage filter re-picks it forever. Every tick drives
    // another stage, every stage re-tries the same dead module, logs flood
    // with 40+ identical errors. Excluding failed_ids means the chain
    // skips permanently-failed modules and moves to the next candidate.
    const RENDER_BATCH_SIZE = 1
    /**
     * Per-module retry budget. Tristan flagged 2026-04-25 NIGHT on HAPS
     * that "Starboard Propulsion Pod has no image — they should ALL
     * have images." Previously a single render failure would land the
     * module in failed_ids forever. Now we retry up to MAX_RENDER_ATTEMPTS
     * before giving up, and only blacklist after that. The previous code
     * comment (lines 395-401) optimised for log-cleanliness over render-
     * completeness — the new approach logs only on first failure per
     * attempt batch, not every tick (so log floods don't recur).
     */
    const MAX_RENDER_ATTEMPTS = 3
    const modules = (project.modules as CadLabModule[] | null) ?? []
    const ordered = orderForRender(modules)
    const priorFailed = new Set(state.failed_ids ?? [])
    const failedReasonsAttemptByModuleId: Record<string, number> = {}
    for (const [id, reason] of Object.entries(state.failed_reasons ?? {})) {
        if (typeof reason?.attempt === "number") {
            failedReasonsAttemptByModuleId[id] = reason.attempt
        }
    }
    const unrenderedQueue = ordered.filter((m) => {
        if (hasImage(m)) return false
        if (priorFailed.has(m.id)) return false
        // Allow retry up to MAX_RENDER_ATTEMPTS — the module is queued
        // even if a previous attempt landed in failed_reasons, as long
        // as we haven't exhausted the budget.
        const attempts = failedReasonsAttemptByModuleId[m.id] ?? 0
        return attempts < MAX_RENDER_ATTEMPTS
    })
    const batch = unrenderedQueue.slice(0, RENDER_BATCH_SIZE)

    if (batch.length === 0) {
        // Nothing left to render — stamp finished_at and stop.
        await persistState(projectId, {
            ...state,
            current_id: null,
            finished_at: new Date().toISOString(),
        })
        return
    }

    // 3. Mark current_id to show progress. With batch=2 we note the
    //    first of the pair; the UI progress line is an approximation
    //    either way.
    await persistState(projectId, {
        ...state,
        current_id: batch[0].id,
    })

    // 4. Fire the batch in parallel. Promise.allSettled so one failing
    //    doesn't drop the other's successful write.
    //
    //    P0.2: use the Background variant. This stage runs without cookies
    //    (either the /api/render-stage HTTP hop or an after() chain) so the
    //    withAuth-wrapped `generateOneModuleImage` would fail auth. Ownership
    //    was already verified at the top of the chain by
    //    `startRenderAllRemainingModuleImages` (or its Background sibling).
    const results = await Promise.allSettled(
        batch.map((m) =>
            generateOneModuleImageBackground(projectId, m.id, foundryId),
        ),
    )

    // 5. Tally per-module outcomes. Captures BOTH the sanitised `error`
    //    (surface 1) and the raw `rawError` + `provider` (surfaces 2/3)
    //    so `failed_reasons` can record the real WHY per module. See
    //    `src/lib/security/sanitize.ts` for the three-surface policy.
    interface BatchOutcome {
        id: string
        ok: boolean
        error: string | null
        rawError: string | null
        provider: string | null
    }
    const batchOutcomes: BatchOutcome[] = batch.map((m, i) => {
        const r = results[i]
        if (r.status === "fulfilled") {
            if (r.value.ok) {
                return {
                    id: m.id,
                    ok: true,
                    error: null,
                    rawError: null,
                    provider: null,
                }
            }
            return {
                id: m.id,
                ok: false,
                error: r.value.error,
                rawError: r.value.rawError ?? r.value.error,
                provider: r.value.provider ?? null,
            }
        }
        // Promise rejected — generateOneModuleImage contract is "never
        // throws, always returns an object", so hitting this branch
        // means a withAuth/withUser cookies-in-after() or similar
        // pre-action explosion. Capture the raw reason for DB storage.
        const rejectionMessage =
            r.reason instanceof Error
                ? r.reason.stack ?? r.reason.message
                : String(r.reason ?? "render threw (unknown reason)")
        return {
            id: m.id,
            ok: false,
            error:
                r.reason instanceof Error ? r.reason.message : "render threw",
            rawError: rejectionMessage,
            provider: null,
        }
    })
    const lastError =
        batchOutcomes.find((o) => !o.ok)?.error ?? null
    for (const o of batchOutcomes) {
        if (!o.ok) {
            // Log raw + provider so Vercel log pulls surface the WHY,
            // not the sanitised user-facing string. Mirrors the policy
            // in withAuth's catch-all.
            console.warn(
                `[render-all-modules:stage] module ${o.id} failed (provider=${o.provider ?? "none"}):`,
                o.rawError ?? o.error,
            )
        }
    }

    // 6. Persist progress (re-read so concurrent imageUrl splices from
    //    generateOneModuleImage don't get clobbered by our state write).
    const { data: fresh } = await admin
        .from("cad_lab_projects")
        .select("image_render_state, modules")
        .eq("id", projectId)
        .maybeSingle()

    const current =
        (fresh?.image_render_state as ImageRenderState | null) ?? state
    if (current.finished_at !== null) {
        // Someone else finished the walk (e.g. state was reset). Bail.
        return
    }

    const newlyCompleted = batchOutcomes.filter((o) => o.ok).map((o) => o.id)
    const newlyFailed = batchOutcomes.filter((o) => !o.ok).map((o) => o.id)
    const completed = Array.from(
        new Set([...current.completed_ids, ...newlyCompleted]),
    )

    // P1.5 — build the failed_reasons map. Increment attempt counter
    // each time a module fails. Only promote to failed_ids (permanent
    // blacklist) after MAX_RENDER_ATTEMPTS. Modules below the threshold
    // stay in failed_reasons but get re-queued by the queue filter.
    const nowIso = new Date().toISOString()
    const failedReasons: Record<string, ImageRenderFailureReason> = {
        ...(current.failed_reasons ?? {}),
    }
    const newlyExhausted: string[] = []
    for (const o of batchOutcomes) {
        if (o.ok) {
            // Clear any prior failure entry — the module finally rendered.
            delete failedReasons[o.id]
            continue
        }
        const priorAttempt = failedReasons[o.id]?.attempt ?? 0
        const newAttempt = priorAttempt + 1
        failedReasons[o.id] = {
            provider: o.provider,
            rawError: o.rawError ?? o.error ?? "Unknown error",
            attempt: newAttempt,
            timestamp: nowIso,
        }
        if (newAttempt >= MAX_RENDER_ATTEMPTS) {
            newlyExhausted.push(o.id)
            console.warn(
                `[render-all-modules:stage] module ${o.id} EXHAUSTED retries ` +
                    `(${newAttempt}/${MAX_RENDER_ATTEMPTS}) — promoting to failed_ids`,
            )
        }
    }
    // Only the exhausted modules become permanently blacklisted — others
    // stay queued for the next tick so the chain keeps trying.
    const failed = Array.from(
        new Set([...current.failed_ids, ...newlyExhausted]),
    )

    // 7. Figure out if more work remains. Re-read modules so a
    //    concurrent Max re-run that added modules is picked up, and
    //    the decision uses the most recent imageUrl splice.
    const freshModules = (fresh?.modules as CadLabModule[] | null) ?? modules
    const orderedFresh = orderForRender(freshModules)
    const remaining = orderedFresh.find(
        (m) => !hasImage(m) && !failed.includes(m.id),
    )

    const updated: ImageRenderState = {
        ...current,
        completed_ids: completed,
        failed_ids: failed,
        failed_reasons: failedReasons,
        current_id: remaining?.id ?? null,
        error: lastError,
        finished_at: remaining ? null : new Date().toISOString(),
    }

    await persistState(projectId, updated)

    // 8. If more work remains, fire the next stage via an internal HTTP
    //    hop to /api/render-stage. See `scheduleNextStageViaHttp` below for
    //    why this is NOT `after(() => selfRef(projectId))` anymore — short
    //    version: `after()` extends the CURRENT Vercel invocation instead
    //    of spawning a new one, so chaining stages inside a single
    //    container shares ONE 300s budget for the whole chain, not N × 300s.
    //    The HTTP hop lands on a fresh container with a fresh budget.
    //    Fire-and-forget: don't await so the current stage's response can
    //    land without being blocked by the next stage's execution.
    if (remaining) {
        await scheduleNextStageViaHttp(projectId)
    }
}

// ─── Auto-recovery tick ────────────────────────────────────────────────

/**
 * Self-healing poke for the render chain. Called from the workspace page
 * render. Mirrors the pattern established by `tickAutopilotStage` — if the
 * chain's `image_render_state` shows "running" (finished_at null, current_id
 * set) but the row's `updated_at` hasn't moved for >90s, the `after()` that
 * should have scheduled the next stage dropped on Vercel container teardown.
 * We re-fire `renderNextModuleStage` so the walk resumes without the founder
 * needing to manually click the stall-restart button.
 *
 * Observed 2026-04-23 on HAPS project eadae45d: chain completed 2 modules,
 * stage 1 wrote state + scheduled stage 2 via after(), stage 2 never fired,
 * chain rotted. Same failure pattern BOM had pre-fix.
 *
 * Idempotent: if the chain is healthy, null, or finished, this is a cheap
 * no-op. If it's stale, the refire is itself idempotent because
 * renderNextModuleStage reads state fresh before doing any work.
 */
// 2026-04-25: lowered from 90s → 30s. The HTTP-hop POST has a short abort
// window; if Vercel cold-start delays the next stage, the chain looks idle
// from the founder's perspective. Tighter stall threshold means the next
// page-load (from /modules or /the-forge-v2) recovers the chain inside ~30s
// of going quiet, instead of letting the user stare at "4/8 done" for 90s.
const RENDER_CHAIN_STALE_MS = 30_000

export async function tickImageRenderChain(projectId: string): Promise<void> {
    return withAuth<void>(async ({ foundryId }) => {
        if (!projectId || !UUID_RE.test(projectId)) return
        const admin = createAdminClient()
        const { data: project } = await admin
            .from("cad_lab_projects")
            .select("foundry_id, image_render_state, updated_at")
            .eq("id", projectId)
            .maybeSingle()

        if (!project || project.foundry_id !== foundryId) return

        const state = project.image_render_state as ImageRenderState | null
        if (!state) return
        if (state.finished_at !== null) return
        if (state.current_id === null) return

        const updatedMs = Date.parse(project.updated_at as unknown as string)
        if (Number.isNaN(updatedMs)) return
        const staleMs = Date.now() - updatedMs
        if (staleMs < RENDER_CHAIN_STALE_MS) return

        console.info(
            `[render-tick] chain stale for ${projectId} (${(staleMs / 1000).toFixed(0)}s since last update, current_id=${state.current_id}) — re-firing renderNextModuleStage`,
        )
        after(async () => {
            try {
                await renderNextModuleStage(projectId)
            } catch (err) {
                console.error(
                    "[render-tick] re-fire threw:",
                    err instanceof Error ? err.message : err,
                )
            }
        })
    })
}

// ─── Status loader ─────────────────────────────────────────────────────

/**
 * Reads the image_render_state column for a project. Used by the
 * Modules page to render the button's running/idle/resume state.
 *
 * Foundry-scoped — returns null if the caller can't see the project.
 */
export async function loadImageRenderState(
    projectId: string,
): Promise<ImageRenderState | null> {
    return withAuth<ImageRenderState | null>(async ({ foundryId }) => {
        if (!projectId || !UUID_RE.test(projectId)) return null
        const admin = createAdminClient()
        const { data: project } = await admin
            .from("cad_lab_projects")
            .select("foundry_id, image_render_state")
            .eq("id", projectId)
            .maybeSingle()
        if (!project || project.foundry_id !== foundryId) return null
        return (project.image_render_state as ImageRenderState | null) ?? null
    })
}

// ─── Internals ─────────────────────────────────────────────────────────

/** Primaries-first ordering so mirror modules render after their primary.
 *  The per-module action shortcuts a mirror render by flipping the
 *  primary's PNG (~100ms) instead of burning a fresh Gemini call. Same
 *  ordering the old client-loop used. */
function orderForRender(modules: CadLabModule[]): CadLabModule[] {
    const primaries: CadLabModule[] = []
    const mirrors: CadLabModule[] = []
    for (const m of modules) {
        if (typeof m.mirrorOf === "string" && m.mirrorOf.trim().length > 0) {
            mirrors.push(m)
        } else {
            primaries.push(m)
        }
    }
    return [...primaries, ...mirrors]
}

function hasImage(m: CadLabModule): boolean {
    return typeof m.imageUrl === "string" && m.imageUrl.length > 0
}

async function persistState(
    projectId: string,
    state: ImageRenderState,
): Promise<void> {
    const admin = createAdminClient()
    const { error } = await admin
        .from("cad_lab_projects")
        .update({ image_render_state: state } as unknown as never)
        .eq("id", projectId)
    if (error) {
        console.error(
            "[render-all-modules:persist] state write failed:",
            error.message,
        )
    }
}

/** Records a terminal failure and stamps finished_at. Used when a stage's
 *  `after()` dispatch itself throws (vs the inner render failing, which
 *  is captured as a failed_ids entry and continues). */
async function recordFatalFailure(
    projectId: string,
    error: string,
): Promise<void> {
    const admin = createAdminClient()
    const { data: project } = await admin
        .from("cad_lab_projects")
        .select("image_render_state")
        .eq("id", projectId)
        .maybeSingle()
    const current =
        (project?.image_render_state as ImageRenderState | null) ?? null
    if (!current) return
    if (current.finished_at !== null) return
    const next: ImageRenderState = {
        ...current,
        current_id: null,
        error,
        finished_at: new Date().toISOString(),
    }
    await persistState(projectId, next)
}

function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

/**
 * Fire-and-forget HTTP hop to /api/render-stage, which re-invokes
 * `renderNextModuleStage(projectId)` on a fresh Vercel serverless
 * container (fresh 300s budget per module).
 *
 * ## Why HTTP, not after()
 *
 * `after()` in Next.js EXTENDS the current serverless invocation — it
 * does NOT spawn a new one. So a chain `stage -> after(() -> stage ->
 * after(...))` shares ONE 300s Vercel budget across every stage in the
 * chain, not N × 300s. This was the root cause of the "2 of 8 modules"
 * autopilot failure (2026-04-23) — the chain busted 300s mid-module-3
 * or mid-module-4 and Vercel killed the container.
 *
 * An internal HTTP POST to a NEW route lands on a separate Vercel
 * invocation with its OWN 300s maxDuration. Each module gets its full
 * budget.
 *
 * ## Fire-and-forget semantics
 *
 * We deliberately do NOT await. The caller (`renderNextModuleStage`)
 * has just persisted state and returned; the caller's Vercel container
 * should be free to tear down once its response lands. Awaiting the
 * POST would block that teardown and re-introduce the same chaining
 * problem we're fixing.
 *
 * ## Failure recovery
 *
 * If the fetch fails to land (network blip, cold start, DNS resolution),
 * `tickImageRenderChain()` detects the stale state on the next workspace
 * page render (90s threshold) and re-fires the stage. This is the same
 * self-heal that handled dropped `after()` callbacks pre-P0.1 — no
 * regression in recovery behaviour.
 */
async function scheduleNextStageViaHttp(projectId: string): Promise<void> {
    const secret = process.env.FORGE_RENDER_STAGE_SECRET
    if (!secret) {
        // SECURITY: refuse to fire the hop when the secret isn't
        // configured. Hard-fails the chain rather than issuing an
        // un-authenticated request. Surfaces the misconfiguration loudly
        // so ops can fix it instead of drifting.
        console.error(
            "[render-all-modules:stage] FORGE_RENDER_STAGE_SECRET not set — " +
                "cannot schedule next stage. Chain will stall until " +
                "tickImageRenderChain() recovers it.",
        )
        return
    }

    const url = `${getBaseUrl()}/api/render-stage`

    // GOTCHA (2026-04-24, run 11): `after(fetch)` was unreliable when the
    // calling handler returned in <1s — Vercel tore down the container
    // before the `after()` queue ran the callback. Same root cause as in
    // scheduleAutopilotStep. Fix: inline-await the fetch with a 5s abort.
    //
    // 2026-04-25 retune: bumped from 2s → 5s. Vercel cold-start can take
    // 2-3s on the render-stage container; a 2s abort sometimes fired
    // BEFORE the request landed, leaving the chain genuinely orphaned
    // (not just "container teardown safe"). 5s is still short enough to
    // unblock the caller cleanly, but generous enough to absorb cold-start.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
        await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${secret}`,
            },
            body: JSON.stringify({ projectId }),
            cache: "no-store",
            signal: controller.signal,
        })
        console.info("[render-all-modules:stage] hop dispatched")
    } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
            console.info("[render-all-modules:stage] hop sent (aborted after 5s)")
        } else {
            console.error(
                "[render-all-modules:stage] next stage fetch failed:",
                err instanceof Error ? err.message : err,
            )
        }
    } finally {
        clearTimeout(timer)
    }
}
