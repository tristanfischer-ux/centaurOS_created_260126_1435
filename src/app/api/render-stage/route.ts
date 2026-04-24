/**
 * @file route.ts — internal /api/render-stage endpoint.
 *
 * @description P0.1 (2026-04-23): breaks the `after()` self-chain that
 * caused every autopilot render pipeline to share ONE Vercel 300s budget.
 * Previously `renderNextModuleStage` scheduled itself via `after()`, which
 * EXTENDS the current serverless invocation rather than spawning a new one.
 * Result: "2 of 8 modules" died at 300s when module 3 or 4 busted the cap.
 *
 * The fix is a single HTTP hop between stages: each stage persists its
 * progress, then fire-and-forget fetches this route with `{ projectId }` +
 * a shared secret. The fetch lands on a NEW Vercel invocation (fresh 300s
 * budget) and immediately calls `renderNextModuleStage(projectId)` directly.
 *
 * Recovery: `tickImageRenderChain()` still runs on workspace-page render, so
 * if a fetch fails to land (cold-start flake, transient network issue),
 * the stale-state detector re-fires the next stage within 90s.
 *
 * ## Environment
 *
 * Requires `FORGE_RENDER_STAGE_SECRET` (a random 32-byte hex generated with
 * `openssl rand -hex 32`) to be set in every environment (Vercel Production,
 * Vercel Preview, .env.local for dev). Requests without a matching
 * `Authorization: Bearer $FORGE_RENDER_STAGE_SECRET` header get 401.
 *
 * Missing env var → 503 (fail-closed). This matches the pattern used by
 * `src/lib/security/cron-auth.ts` for Vercel cron jobs.
 *
 * ## Security model
 *
 * - Shared-secret gate: only callers with the env-stored secret can invoke
 *   `renderNextModuleStage`. Prevents random internet drive-by POSTs from
 *   triggering gpt-image-2 calls on arbitrary project ids.
 * - Project-scoped work only: the route loads the project row, refuses to
 *   run if `image_render_state` is null or already finished. A call for a
 *   project that isn't in "running" state is a cheap no-op, not a crash.
 * - No cookies / no foundry check: `renderNextModuleStage` uses the admin
 *   client internally and trusts that ownership was verified at the TOP of
 *   the chain by `startRenderAllRemainingModuleImages` (withAuth wrapper).
 *
 * @related
 * - Caller (emitter):  src/actions/forge-v2-render-all-modules.ts
 * - Auth pattern:      src/lib/security/cron-auth.ts
 * - Base URL helper:   src/lib/domains.ts (getBaseUrl)
 */

import { NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"

import { createAdminClient } from "@/lib/supabase/admin"
import {
    renderNextModuleStage,
    type ImageRenderState,
} from "@/actions/forge-v2-render-all-modules"

export const dynamic = "force-dynamic"
// Each module render inside renderNextModuleStage can take up to ~300s in
// the worst case (gpt-image-2 + consistency-score retry). Vercel Pro caps
// maxDuration at 300s — this route's budget is the per-module budget.
export const maxDuration = 300

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Verifies the FORGE_RENDER_STAGE_SECRET Bearer token. Returns a
 * NextResponse on auth failure (caller should return immediately), or null
 * on success. Mirrors `verifyCronSecret` in cron-auth.ts.
 */
function verifyStageSecret(req: Request): NextResponse | null {
    const secret = process.env.FORGE_RENDER_STAGE_SECRET

    // SECURITY: Fail closed when secret is not configured. Missing env var
    // is a deployment misconfiguration — better to surface it loudly than
    // silently accept unauthenticated POSTs.
    if (!secret) {
        console.error(
            "[render-stage] FORGE_RENDER_STAGE_SECRET not configured",
        )
        return NextResponse.json(
            { error: "Render stage secret not configured" },
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

interface RenderStageRequestBody {
    projectId?: unknown
}

/**
 * POST /api/render-stage
 *
 * Body: `{ projectId: string }` — UUID of the project whose render chain
 *       should advance by one stage.
 *
 * Headers: `Authorization: Bearer $FORGE_RENDER_STAGE_SECRET`
 *
 * Response: `{ ok: true, advanced: boolean }` on success, `{ error }` on
 *           failure. `advanced: false` means the state was already finished
 *           or null (cheap no-op — not treated as an error).
 */
export async function POST(request: Request): Promise<NextResponse> {
    const authFailure = verifyStageSecret(request)
    if (authFailure) return authFailure

    let body: RenderStageRequestBody
    try {
        body = (await request.json()) as RenderStageRequestBody
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

    // Pre-flight: confirm the project exists and has a running render
    // state. Running without this check would be correct (the stage runner
    // itself short-circuits on null / finished state), but we want to
    // return a meaningful HTTP response so upstream tooling can log it.
    const admin = createAdminClient()
    const { data: project, error: projectErr } = await admin
        .from("cad_lab_projects")
        .select("id, image_render_state")
        .eq("id", projectId)
        .maybeSingle()

    if (projectErr) {
        console.error(
            "[render-stage] project lookup failed:",
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

    const state = project.image_render_state as ImageRenderState | null
    if (!state) {
        return NextResponse.json(
            { ok: true, advanced: false, reason: "no_render_state" },
            { status: 200 },
        )
    }
    if (state.finished_at !== null) {
        return NextResponse.json(
            { ok: true, advanced: false, reason: "already_finished" },
            { status: 200 },
        )
    }

    // Advance one stage. renderNextModuleStage is idempotent w.r.t.
    // finished state and missing modules, so a lost-race double-call is a
    // no-op rather than a crash.
    try {
        await renderNextModuleStage(projectId)
    } catch (err) {
        console.error(
            "[render-stage] renderNextModuleStage threw:",
            err instanceof Error ? err.stack ?? err.message : err,
        )
        return NextResponse.json(
            { error: "Stage advance failed" },
            { status: 500 },
        )
    }

    return NextResponse.json({ ok: true, advanced: true }, { status: 200 })
}
