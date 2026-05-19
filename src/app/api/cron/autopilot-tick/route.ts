/**
 * @file route.ts — /api/cron/autopilot-tick (RETIRED 2026-05-19)
 *
 * @description Tristan unification directive (2026-05-19): one canonical
 * engine. The autopilot state-machine path (Chase/Max/Fang/Finn/Auggie +
 * stage gates + remediation) has been retired. The canonical pipeline is
 * `scripts/serial-design-chain-v2.tsx` driven by the Mac Studio worker
 * (`scripts/pdf-engine-worker.mjs`) polling `pdf_engine_runs`.
 *
 * This route is kept (rather than 404'd) so the Vercel cron schedule that
 * still pings it gets a clean 200 OK instead of building error noise.
 * Returns immediately without claiming or processing any rows.
 *
 * Original ~600-line implementation preserved at:
 *   _archive/2026-05-19-pre-chain-unification/api/autopilot-step-route.ts.archived
 *   (companion to the same-era retirement of /api/autopilot-step)
 *
 * Drawer: [[forgeos_decisions_d43cbc3af134f902]]
 */

import { NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/security/cron-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function GET(request: Request): Promise<NextResponse> {
    const authFailure = verifyCronSecret(request)
    if (authFailure) return authFailure
    return NextResponse.json(
        {
            ok: true,
            retired: "autopilot-tick",
            since: "2026-05-19",
            canonical_engine: "chain",
        },
        { status: 200 },
    )
}
