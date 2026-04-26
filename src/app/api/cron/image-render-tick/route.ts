/**
 * @file route.ts — /api/cron/image-render-tick
 *
 * @description Cron backstop for the per-module image render chain. Fires
 * every 2 minutes (vercel.json) and re-fires `renderNextModuleStage` for
 * any project whose `image_render_state` is stale.
 *
 * ## Why this exists
 *
 * `forge-v2-render-all-modules.ts` chains stages via fire-and-forget HTTP
 * POST to /api/render-stage with a 5s abort. On Vercel cold-start the
 * receiver routinely takes 3-7s to land, and the abort fires before the
 * request reaches the receiver. The chain dies in place — no failure
 * record, no log, no retry.
 *
 * The only recovery before this file existed was `tickImageRenderChain()`,
 * which ONLY runs when a human renders the workspace page. If the user
 * closed the tab, the chain rotted forever.
 *
 * Observed 2026-04-26: 13 of 34 module images across 4 demo projects had
 * `imageStatus=null` for 12-36 hours, with empty `failed_ids` and empty
 * `failed_reasons`. Pure silent drop. Same architecture pattern
 * `autopilot-tick` solves for the autopilot stage chain.
 *
 * ## Tick rules
 *
 * For each project where `image_render_state.finished_at IS NULL`:
 *
 *   - If `updated_at` < now() - 60s AND `current_id` is set → re-fire
 *     `renderNextModuleStage(projectId)`. Idempotent — the stage runner
 *     re-reads state and skips if it's already finished.
 *   - If `updated_at` is recent (<60s) → skip; the chain is making
 *     progress (a render is in flight or just persisted).
 *
 * ## Auth
 *
 * Bearer CRON_SECRET (Vercel-injected on the X-Vercel-Cron-Job header
 * pathway). Same pattern as every other cron in this repo.
 *
 * @related
 *   - Stage runner: src/actions/forge-v2-render-all-modules.ts
 *   - Pattern ref:  src/app/api/cron/autopilot-tick/route.ts
 *   - Vercel cfg:   vercel.json (path: /api/cron/image-render-tick, schedule: every 2 minutes)
 */

import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { verifyCronSecret } from "@/lib/security/cron-auth"
import {
    renderNextModuleStage,
    type ImageRenderState,
} from "@/actions/forge-v2-render-all-modules"

export const dynamic = "force-dynamic"
// Each fired stage runs ONE module render (~30-60s) inside its OWN Vercel
// invocation via the existing scheduleNextStageViaHttp path. This cron
// handler itself only NEEDS to call renderNextModuleStage which kicks off
// that flow. Set 60s budget so the SQL scan + dispatch never times out.
export const maxDuration = 60

/** Stale threshold — if a chain hasn't moved in this many ms, re-fire. */
const STALE_MS = 60_000
/** Cap projects per tick so a stale-chain stampede doesn't blow the budget. */
const MAX_PER_TICK = 8

interface TickDetail {
    projectId: string
    action: "fire" | "skip_recent" | "skip_finished" | "skip_no_current"
    staleSeconds?: number
}

/** GET /api/cron/image-render-tick — Bearer CRON_SECRET. */
export async function GET(request: Request): Promise<NextResponse> {
    const authFailure = verifyCronSecret(request)
    if (authFailure) return authFailure

    const admin = createAdminClient()
    const details: TickDetail[] = []
    let fired = 0
    let skipped = 0

    // Pull projects whose render chain is "running" (finished_at null,
    // current_id set). filter on jsonb keys directly so the SQL is fast.
    const { data: projects, error } = await admin
        .from("cad_lab_projects")
        .select("id, image_render_state, updated_at")
        .not("image_render_state", "is", null)
        .is("image_render_state->>finished_at", null)
        .order("updated_at", { ascending: true })
        .limit(MAX_PER_TICK)

    if (error) {
        console.error(
            "[image-render-tick] project lookup failed:",
            error.message,
        )
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    for (const project of projects ?? []) {
        const state = project.image_render_state as ImageRenderState | null
        if (!state) continue
        if (state.finished_at !== null) {
            details.push({ projectId: project.id, action: "skip_finished" })
            skipped++
            continue
        }
        if (state.current_id === null) {
            details.push({ projectId: project.id, action: "skip_no_current" })
            skipped++
            continue
        }

        const updatedMs = Date.parse(project.updated_at as unknown as string)
        if (Number.isNaN(updatedMs)) continue
        const staleMs = Date.now() - updatedMs
        if (staleMs < STALE_MS) {
            details.push({
                projectId: project.id,
                action: "skip_recent",
                staleSeconds: Math.round(staleMs / 1000),
            })
            skipped++
            continue
        }

        // Re-fire the next stage. renderNextModuleStage is idempotent —
        // it re-reads state and short-circuits if the chain is finished or
        // someone else picked up the next module. We don't await long
        // because the fire-and-forget HTTP hop inside the stage gives the
        // ACTUAL work its own fresh Vercel invocation (300s budget).
        console.info(
            `[image-render-tick] re-firing stale chain for ${project.id} ` +
                `(stale ${Math.round(staleMs / 1000)}s, current_id=${state.current_id})`,
        )
        try {
            await renderNextModuleStage(project.id)
        } catch (err) {
            console.error(
                `[image-render-tick] re-fire threw for ${project.id}:`,
                err instanceof Error ? err.message : err,
            )
        }
        details.push({
            projectId: project.id,
            action: "fire",
            staleSeconds: Math.round(staleMs / 1000),
        })
        fired++
    }

    console.info(
        `[image-render-tick] fired=${fired} skipped=${skipped}`,
    )
    return NextResponse.json(
        { ok: true, fired, skipped, details },
        { status: 200 },
    )
}
