import { NextRequest, NextResponse } from "next/server"
import {
    getCalFraming,
    getSpecialistRound1Response,
    getSpecialistRound2Response,
    getCalClosingResponse,
} from "@/actions/brainstorming-council"

export const maxDuration = 120

/**
 * POST /api/agents/council-call
 *
 * Thin proxy that wraps brainstorming-council server actions as a plain
 * fetch endpoint. Exists because Next.js server actions trigger automatic
 * RSC revalidation after each call, which blocks the client until
 * page.tsx fully re-renders on the server. For council orchestration
 * (Cal framing → 4 specialists → Cal closing), this cascade of
 * revalidations makes the UI appear permanently stuck.
 *
 * The API route does NOT trigger RSC revalidation — the client gets the
 * LLM response immediately and updates local state without waiting.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { action, ...params } = body as {
            action: string
            question?: string
            specialistNames?: string[]
            specialist?: { id: string; name: string; title: string; tagline: string }
            calFraming?: string
            specialistResponses?: Array<{ name: string; response: string }>
        }

        switch (action) {
            case "cal-framing": {
                if (!params.question || !params.specialistNames) {
                    return NextResponse.json({ ok: false, error: "Missing question or specialistNames" }, { status: 400 })
                }
                const result = await getCalFraming(params.question, params.specialistNames)
                return NextResponse.json(result)
            }

            case "specialist-r1": {
                if (!params.question || !params.specialist) {
                    return NextResponse.json({ ok: false, error: "Missing question or specialist" }, { status: 400 })
                }
                const result = await getSpecialistRound1Response(params.question, params.specialist)
                return NextResponse.json(result)
            }

            case "specialist-r2": {
                if (!params.question || !params.specialist || !params.calFraming || !params.specialistResponses) {
                    return NextResponse.json({ ok: false, error: "Missing params for R2" }, { status: 400 })
                }
                const result = await getSpecialistRound2Response(
                    params.question,
                    params.specialist,
                    params.calFraming,
                    params.specialistResponses,
                )
                return NextResponse.json(result)
            }

            case "cal-closing": {
                if (!params.question || !params.specialistResponses) {
                    return NextResponse.json({ ok: false, error: "Missing params for closing" }, { status: 400 })
                }
                const result = await getCalClosingResponse(
                    params.question,
                    params.specialistResponses,
                    (params as Record<string, unknown>).round2Responses as Array<{ name: string; response: string }> ?? [],
                )
                return NextResponse.json(result)
            }

            default:
                return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
        }
    } catch (err) {
        console.error("[council-call] EXCEPTION:", err)
        return NextResponse.json(
            { ok: false, error: err instanceof Error ? err.message : "Internal error" },
            { status: 500 },
        )
    }
}
