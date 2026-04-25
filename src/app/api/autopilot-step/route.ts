/**
 * @file route.ts — internal /api/autopilot-step endpoint.
 *
 * @description P0.1b (2026-04-23): breaks the `after()` self-chain in the
 * autopilot stage walker. Same root cause as P0.1 (/api/render-stage) but for
 * the autopilot chain instead of the per-module render chain.
 *
 * The autopilot chain looked like:
 *   startAutopilot → after(stepWaitForChase)
 *   stepWaitForChase.onDone → after(stepLockBrief)
 *   stepLockBrief → after(runMaxBackground + stepWaitForMax)
 *   stepWaitForMax.onDone → after(stepWaitForSizing)
 *   ... and so on through 11 stages.
 *
 * `after()` in Next.js EXTENDS the CURRENT serverless invocation — it does
 * NOT spawn a new one. So the entire cascade shared ONE Vercel 300s budget.
 * Observed 2026-04-24 on BESS project abcb2581: Chase 118s + Max 110s +
 * BOM-start ~70s hit `Vercel Runtime Timeout Error: Task timed out after
 * 300 seconds` mid-BOM, leaving BOM `running` forever, cost never firing,
 * autopilot wedged.
 *
 * The fix is a single HTTP hop between stages: each stage persists its
 * progress, then fire-and-forget fetches this route with
 * `{ projectId, step }` + a shared secret. The fetch lands on a NEW Vercel
 * invocation (fresh 300s budget) and immediately calls the matching stage
 * runner directly.
 *
 * Recovery: `tickAutopilotStage()` still runs on workspace-page render, so
 * if a fetch fails to land (cold-start flake, transient network issue),
 * the stale-state detector re-fires the current stage on page refresh.
 *
 * ## Environment
 *
 * Reuses `FORGE_RENDER_STAGE_SECRET` — one shared secret for both
 * /api/render-stage and /api/autopilot-step. Simplifies rotation and env
 * management: one secret in Vercel Production + Preview + .env.local rather
 * than maintaining two parallel keys.
 *
 * Missing env var → 503 (fail-closed). Matches `src/lib/security/cron-auth.ts`
 * and /api/render-stage.
 *
 * ## Security model
 *
 * - Shared-secret gate: only callers with the env-stored secret can invoke
 *   a stage runner. Prevents random internet drive-by POSTs from triggering
 *   expensive Max/BOM/Finn calls on arbitrary project ids.
 * - Project-scoped work only: the route loads the project row, refuses to
 *   run if `autopilot_state` is null or already finished.
 * - Step allowlist: `step` must match one of the known stage names. Unknown
 *   step → 400. Prevents injection into a future-added stage runner.
 * - No cookies / no foundry check: stage runners use the admin client
 *   internally and trust that ownership was verified at the TOP of the
 *   chain by `startAutopilot` (withAuth wrapper).
 *
 * @related
 * - Caller (emitter):  src/actions/forge-v2-autopilot.ts (scheduleAutopilotStep helper)
 * - Parallel route:    src/app/api/render-stage/route.ts (same pattern, per-module chain)
 * - Auth pattern:      src/lib/security/cron-auth.ts
 * - Base URL helper:   src/lib/domains.ts (getBaseUrl)
 */

import { NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"

import { createAdminClient } from "@/lib/supabase/admin"
import {
    dispatchAutopilotStep,
    type AutopilotStepName,
    type AutopilotState,
} from "@/actions/forge-v2-autopilot"

// Allowlist for incoming step names. Mirrors the switch inside
// `dispatchAutopilotStep` — defined inline here (not exported from the
// "use server" file) because `"use server"` modules can ONLY export async
// functions. Exporting the array from forge-v2-autopilot.ts would pass
// tsc but crash next build at page-data collect.
const AUTOPILOT_STEP_NAMES = [
    "waitForChase",
    "lockBrief",
    "waitForMax",
    "waitForSizing",
    "waitForLayout",
    "waitForBom",
    "waitForFinn",
    "generateIllustration",
    "matchSuppliers",
    "runFangReviews",
    "generatePdf",
] as const satisfies readonly AutopilotStepName[]

function isAutopilotStepName(value: string): value is AutopilotStepName {
    return (AUTOPILOT_STEP_NAMES as readonly string[]).includes(value)
}

export const dynamic = "force-dynamic"
// Autopilot stages poll pipeline_runs for up to 240s and may additionally
// block on a Background runner (Max ~120s, BOM ~90s, Fang review 45-60s
// × N). 300s is the Vercel Pro cap and the budget each stage gets.
export const maxDuration = 300

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Verifies the FORGE_RENDER_STAGE_SECRET Bearer token. Returns a
 * NextResponse on auth failure (caller should return immediately), or null
 * on success. Mirrors `verifyCronSecret` in cron-auth.ts and the matching
 * helper in /api/render-stage/route.ts.
 */
function verifyStageSecret(req: Request): NextResponse | null {
    const secret = process.env.FORGE_RENDER_STAGE_SECRET

    // SECURITY: Fail closed when secret is not configured. Missing env var
    // is a deployment misconfiguration — better to surface it loudly than
    // silently accept unauthenticated POSTs.
    if (!secret) {
        console.error(
            "[autopilot-step] FORGE_RENDER_STAGE_SECRET not configured",
        )
        return NextResponse.json(
            { error: "Autopilot step secret not configured" },
            { status: 503 },
        )
    }

    const authHeader = req.headers.get("authorization") || ""
    const expected = `Bearer ${secret}`
    // SECURITY: Timing-safe compare to avoid a length-leak oracle. Buffers
    // must be the same length before timingSafeEqual or it throws — the
    // length check doubles as a pre-filter and an error-prevention guard.
    if (
        authHeader.length !== expected.length ||
        !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
    ) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    return null
}

interface AutopilotStepRequestBody {
    projectId?: unknown
    step?: unknown
}

/**
 * POST /api/autopilot-step
 *
 * Body: `{ projectId: string, step: AutopilotStepName }`
 *   - `projectId` — UUID of the project whose autopilot chain should run
 *     the named stage.
 *   - `step`       — the stage to run (see `AutopilotStepName` in
 *     forge-v2-autopilot.ts for the allowlist).
 *
 * Headers: `Authorization: Bearer $FORGE_RENDER_STAGE_SECRET`
 *
 * Response: `{ ok: true, ran: boolean }` on success, `{ error }` on failure.
 *           `ran: false` means the state was already finished or null
 *           (cheap no-op — not treated as an error).
 */
export async function POST(request: Request): Promise<NextResponse> {
    const authFailure = verifyStageSecret(request)
    if (authFailure) return authFailure

    let body: AutopilotStepRequestBody
    try {
        body = (await request.json()) as AutopilotStepRequestBody
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 },
        )
    }

    const projectId = typeof body.projectId === "string" ? body.projectId : ""
    if (!projectId || !UUID_RE.test(projectId)) {
        return NextResponse.json(
            { error: "projectId must be a UUID string" },
            { status: 400 },
        )
    }

    const rawStep = typeof body.step === "string" ? body.step : ""
    if (!rawStep || !isAutopilotStepName(rawStep)) {
        return NextResponse.json(
            { error: "step must be a known autopilot stage name" },
            { status: 400 },
        )
    }
    const step: AutopilotStepName = rawStep

    // Pre-flight: confirm the project exists and has a running autopilot
    // state. Running without this check would be correct (stage runners
    // themselves read state and short-circuit), but we want to return a
    // meaningful HTTP response so upstream tooling (tests, log analysis)
    // can distinguish "project gone" from "stage ran".
    const admin = createAdminClient()
    const { data: project, error: projectErr } = await admin
        .from("cad_lab_projects")
        .select("id, autopilot_state")
        .eq("id", projectId)
        .maybeSingle()

    if (projectErr) {
        console.error(
            "[autopilot-step] project lookup failed:",
            projectErr.message,
        )
        return NextResponse.json(
            { error: "Project lookup failed" },
            { status: 500 },
        )
    }
    if (!project) {
        return NextResponse.json(
            { error: "Project not found" },
            { status: 404 },
        )
    }

    const state = project.autopilot_state as AutopilotState | null
    if (!state) {
        return NextResponse.json(
            { ok: true, ran: false, reason: "no_autopilot_state" },
            { status: 200 },
        )
    }
    if (state.finished_at != null) {
        return NextResponse.json(
            { ok: true, ran: false, reason: "already_finished" },
            { status: 200 },
        )
    }

    // Dispatch the stage runner. dispatchAutopilotStep wraps each branch in
    // try/catch so a stage throwing doesn't crash the route; it will have
    // already called recordFailure internally if there was a hard error.
    try {
        await dispatchAutopilotStep(projectId, step)
    } catch (err) {
        console.error(
            `[autopilot-step] dispatch ${step} threw:`,
            err instanceof Error ? err.stack ?? err.message : err,
        )
        return NextResponse.json(
            { error: "Stage dispatch failed" },
            { status: 500 },
        )
    }

    return NextResponse.json({ ok: true, ran: true, step }, { status: 200 })
}
