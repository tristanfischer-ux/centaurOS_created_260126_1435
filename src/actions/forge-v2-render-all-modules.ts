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
import type { CadLabModule } from "@/lib/cad-lab-types"
import { generateOneModuleImage } from "./forge-v2-generate-one-module-image"

// ─── Types ─────────────────────────────────────────────────────────────

export interface ImageRenderState {
    started_at: string
    finished_at: string | null
    total: number
    completed_ids: string[]
    failed_ids: string[]
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

        // Idempotency — refuse to start a second walk over one that's
        // still in flight. `finished_at === null` with a non-null state
        // is "running".
        const existing = project.image_render_state as ImageRenderState | null
        if (existing && existing.finished_at === null) {
            return {
                ok: false,
                error: "A render loop is already running on this project.",
                errorCode: "ALREADY_RUNNING",
            }
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
    })
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

    // 1. Load project state
    const { data: project, error: projectErr } = await admin
        .from("cad_lab_projects")
        .select("id, modules, image_render_state")
        .eq("id", projectId)
        .maybeSingle()

    if (projectErr || !project) {
        console.error(
            "[render-all-modules:stage] project lookup failed:",
            projectErr?.message ?? "not found",
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

    // 2. Find next unrendered module
    const modules = (project.modules as CadLabModule[] | null) ?? []
    const ordered = orderForRender(modules)
    const next = ordered.find((m) => !hasImage(m))

    if (!next) {
        // Nothing left to render — stamp finished_at and stop.
        await persistState(projectId, {
            ...state,
            current_id: null,
            finished_at: new Date().toISOString(),
        })
        return
    }

    // 3. Mark current_id so the UI can say "rendering X"
    await persistState(projectId, {
        ...state,
        current_id: next.id,
    })

    // 4. Run the single-module render (30-60s typical)
    let renderOk = false
    let renderError: string | null = null
    try {
        const res = await generateOneModuleImage(projectId, next.id)
        if (res.ok) {
            renderOk = true
        } else {
            renderError = res.error
            console.warn(
                `[render-all-modules:stage] module ${next.id} failed:`,
                res.error,
                res.errorCode,
            )
        }
    } catch (err) {
        renderError = errMessage(err)
        console.error(
            `[render-all-modules:stage] module ${next.id} threw:`,
            err instanceof Error ? err.message : err,
        )
    }

    // 5. Persist progress (re-read so parallel edits to modules/state
    //    don't clobber each other; the module render itself updates
    //    modules[].imageUrl in a separate splice, which we don't want
    //    to overwrite here).
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

    const completed = renderOk
        ? Array.from(new Set([...current.completed_ids, next.id]))
        : current.completed_ids
    const failed = renderOk
        ? current.failed_ids
        : Array.from(new Set([...current.failed_ids, next.id]))

    // 6. Figure out if more work remains. We re-read the modules list
    //    here so a concurrent Max re-run that added modules is picked
    //    up, and so the decision uses the most recent imageUrl splice.
    const freshModules = (fresh?.modules as CadLabModule[] | null) ?? modules
    const orderedFresh = orderForRender(freshModules)
    const remaining = orderedFresh.find(
        (m) => !hasImage(m) && !failed.includes(m.id),
    )

    const updated: ImageRenderState = {
        ...current,
        completed_ids: completed,
        failed_ids: failed,
        current_id: remaining?.id ?? null,
        error: renderError,
        finished_at: remaining ? null : new Date().toISOString(),
    }

    await persistState(projectId, updated)

    // 7. If more work remains, schedule the next stage
    if (remaining) {
        after(async () => {
            try {
                const { renderNextModuleStage: selfRef } = await import(
                    "./forge-v2-render-all-modules"
                )
                await selfRef(projectId)
            } catch (err) {
                console.error(
                    "[render-all-modules:stage] next stage schedule threw:",
                    err instanceof Error ? err.message : err,
                )
                await recordFatalFailure(projectId, errMessage(err))
            }
        })
    }
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
