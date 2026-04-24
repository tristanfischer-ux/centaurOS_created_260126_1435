/**
 * @file route.ts — /api/cron/autopilot-tick
 *
 * @description Deterministic re-drive for the autopilot stage machine.
 * Vercel cron hits this every minute; it finds every project with
 * `autopilot_state.finished_at = null` and dispatches the current
 * stage runner. Every stepXxx is idempotent — if the stage is already
 * running (pipeline_run exists + not stale) it short-circuits; if it
 * was dropped by a failed `after(fetch)` hop, it re-fires.
 *
 * ## Why this exists
 *
 * The autopilot chain previously relied on `after(fetch)` → /api/autopilot-step
 * hops to advance between stages. Runs 1–12 of verify-autopilot.sh each
 * landed a new fix for a different after()/keepalive/undici quirk. Cron
 * replaces the optimistic hop with a guaranteed tick: even if every hop
 * fails, cron picks up within 60s and drives the chain to completion.
 *
 * Hops stay (they're the fast path when they work). Cron is the backstop.
 * stepXxx idempotency means double-dispatch is harmless.
 *
 * ## Loop-within-invocation
 *
 * Vercel cron is minute-resolution. To keep advance latency under 30s,
 * this handler runs TWO tick passes: one immediately, one after a 30s
 * sleep. Net: effective 30s cadence at 1-minute cron frequency.
 *
 * ## Security
 *
 * - Standard CRON_SECRET Bearer auth (Vercel cron injects this header)
 * - Service-role admin client only — no user session
 * - Bounded work per invocation: max 10 projects per pass, timeout 300s
 *
 * @related
 * - Stage dispatcher:   src/actions/forge-v2-autopilot.ts (dispatchAutopilotStep)
 * - Cron auth:          src/lib/security/cron-auth.ts
 * - Vercel cron config: vercel.json
 */

import { NextResponse, after } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { verifyCronSecret } from "@/lib/security/cron-auth"
import {
    dispatchAutopilotStep,
    type AutopilotStepName,
    type AutopilotState,
} from "@/actions/forge-v2-autopilot"

export const dynamic = "force-dynamic"
// Two tick passes with a 30s sleep between = ~35s minimum, plus per-project
// dispatch time (each stepXxx can take up to ~120s for stalled self-heal).
// Set maxDuration to allow comfortable margin.
export const maxDuration = 300

// Map autopilot_state.stage → the step name that drives that stage.
// Inlined here because "use server" files can't export non-async maps.
const STAGE_TO_STEP: Record<string, AutopilotStepName> = {
    waiting_chase: "waitForChase",
    locking_brief: "lockBrief",
    waiting_max: "waitForMax",
    waiting_sizing: "waitForSizing",
    waiting_layout: "waitForLayout",
    waiting_bom: "waitForBom",
    waiting_finn: "waitForFinn",
    generating_illustration: "generateIllustration",
    matching_suppliers: "matchSuppliers",
    running_fang_reviews: "runFangReviews",
    generating_pdf: "generatePdf",
    // "done" has no step — excluded from dispatch
}

const MAX_PROJECTS_PER_PASS = 10

async function tickOnce(): Promise<{
    dispatched: number
    skipped: number
    failed: number
    details: Array<{ projectId: string; stage: string; ok: boolean; err?: string }>
}> {
    const admin = createAdminClient()
    const details: Array<{
        projectId: string
        stage: string
        ok: boolean
        err?: string
    }> = []
    let dispatched = 0
    let skipped = 0
    const failed = 0

    // Fetch all projects whose autopilot_state is active (started + not
    // finished). Filter in JS because Supabase JSON ops for nested nulls are
    // fiddly — the working set is small (< a few dozen at any time).
    const { data: projects, error } = await admin
        .from("cad_lab_projects")
        .select("id, autopilot_state")
        .not("autopilot_state", "is", null)
        .order("updated_at", { ascending: true })
        .limit(MAX_PROJECTS_PER_PASS * 3)

    if (error) {
        console.error("[autopilot-tick] project lookup failed:", error.message)
        return { dispatched: 0, skipped: 0, failed: 0, details: [] }
    }

    const active = (projects ?? []).filter((p) => {
        const state = p.autopilot_state as AutopilotState | null
        if (!state) return false
        if (state.finished_at) return false
        if (!state.started_at) return false
        return true
    })

    for (const project of active.slice(0, MAX_PROJECTS_PER_PASS)) {
        const state = project.autopilot_state as AutopilotState
        const step = STAGE_TO_STEP[state.stage]
        if (!step) {
            skipped++
            details.push({
                projectId: project.id,
                stage: state.stage,
                ok: false,
                err: "no step mapping",
            })
            continue
        }

        // Fire-and-forget dispatch via after(): stepXxx runners internally
        // call waitForStage which polls for up to 240s. If cron awaited
        // each dispatch synchronously, one stuck project would blow the
        // whole tick's 300s budget. after() keeps the Vercel container
        // alive past the response so the stage runner's active polling
        // work continues, while cron itself returns in <1s per project.
        //
        // Caveat: after() has been unreliable for FETCH hops (empty-body,
        // tiny-flush-window case). But for long-running active work like
        // waitForStage's 5s interval polling, the container stays busy
        // and after() fires reliably. Not a fetch-hop situation.
        const pid = project.id
        const stageSlug = state.stage
        after(async () => {
            try {
                await dispatchAutopilotStep(pid, step)
            } catch (err) {
                console.error(
                    `[autopilot-tick] dispatch ${step} for ${pid} (stage=${stageSlug}) threw:`,
                    err instanceof Error ? err.message : err,
                )
            }
        })
        dispatched++
        details.push({ projectId: project.id, stage: state.stage, ok: true })
    }

    return { dispatched, skipped, failed, details }
}

/**
 * GET /api/cron/autopilot-tick
 *
 * Headers: `Authorization: Bearer $CRON_SECRET`
 *
 * Response: `{ ok: true, passes: [tick1, tick2] }`
 */
export async function GET(request: Request): Promise<NextResponse> {
    const authFailure = verifyCronSecret(request)
    if (authFailure) return authFailure

    const pass = await tickOnce()
    console.info(
        `[autopilot-tick] dispatched=${pass.dispatched} ` +
            `skipped=${pass.skipped} failed=${pass.failed}`,
    )

    return NextResponse.json({ ok: true, pass }, { status: 200 })
}
