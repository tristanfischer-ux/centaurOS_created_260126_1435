/**
 * @file route.ts — Modal-to-Vercel tool callback endpoint for Fang reviews.
 *
 * @description Receives tool-call requests from the Fang Modal app
 * (scripts/modal/fang-review/main.py). Modal can't run the specialist tool
 * handlers directly because they read from Supabase tables with foundry-id
 * isolation, dispatch into other Modal compute apps (FEA/thermal/CFD), and
 * inherit env vars from the Vercel runtime.
 *
 * Pattern: Modal POSTs here per tool invocation. We dispatch into the
 * existing tool registry (src/lib/agents/tools/registry.ts) and return the
 * formatted markdown string the LLM expects as a tool_result.
 *
 * Auth: Bearer token from header. Token lives in env as
 * FANG_TOOL_CALLBACK_TOKEN — must match what the Modal app sends.
 *
 * Time budget: Vercel maxDuration=300s. Most tool handlers complete in
 * <30s; engineering compute via Modal can take 1-5 min. 300s leaves headroom.
 *
 * @related
 *   - Modal app: scripts/modal/fang-review/main.py
 *   - TS wrapper: src/actions/specialists/run-fang-review-via-modal.ts
 *   - Tool registry: src/lib/agents/tools/registry.ts
 */

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { executeToolCall } from "@/lib/agents/tools/registry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

interface CallbackBody {
    request_id?: string
    tool_name?: string
    tool_input?: Record<string, unknown>
    ctx?: {
        foundryId?: string
        specialistId?: string
        userId?: string
    }
}

export async function POST(req: NextRequest): Promise<Response> {
    const expectedToken = (process.env.FANG_TOOL_CALLBACK_TOKEN ?? "").trim()
    if (!expectedToken) {
        return NextResponse.json(
            { ok: false, error: "FANG_TOOL_CALLBACK_TOKEN not configured" },
            { status: 500 },
        )
    }

    const auth = (req.headers.get("authorization") ?? "").trim()
    const presented = auth.startsWith("Bearer ") ? auth.slice(7) : ""
    if (presented !== expectedToken) {
        return NextResponse.json(
            { ok: false, error: "Unauthorised" },
            { status: 401 },
        )
    }

    let body: CallbackBody
    try {
        body = (await req.json()) as CallbackBody
    } catch {
        return NextResponse.json(
            { ok: false, error: "Bad JSON" },
            { status: 400 },
        )
    }

    const toolName = (body.tool_name ?? "").trim()
    if (!toolName) {
        return NextResponse.json(
            { ok: false, error: "tool_name required" },
            { status: 400 },
        )
    }

    const ctx = {
        foundryId: body.ctx?.foundryId ?? "",
        specialistId: body.ctx?.specialistId ?? "vp-manufacturing",
        userId: body.ctx?.userId,
    }
    if (!ctx.foundryId) {
        return NextResponse.json(
            { ok: false, error: "ctx.foundryId required" },
            { status: 400 },
        )
    }

    try {
        const result = await executeToolCall(
            toolName,
            (body.tool_input ?? {}) as Record<string, unknown>,
            ctx,
        )
        return NextResponse.json({ ok: true, result })
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(
            `[fang-execute-tool] tool=${toolName} request_id=${body.request_id ?? "?"} ERROR:`,
            msg,
        )
        return NextResponse.json(
            { ok: false, error: msg.slice(0, 500) },
            { status: 500 },
        )
    }
}
