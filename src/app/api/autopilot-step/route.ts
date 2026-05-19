/**
 * @file route.ts — /api/autopilot-step (RETIRED 2026-05-19)
 *
 * @description Tristan unification directive (2026-05-19): ONE engine
 * end-to-end. The legacy "autopilot specialist" path (Chase / Max / Fang /
 * Finn / Jian / Auggie + state-machine + score-and-gate council) has been
 * retired. The canonical engine is now `scripts/serial-design-chain-v2.tsx`
 * driven by the Mac Studio worker (`scripts/pdf-engine-worker.mjs`) which
 * polls `pdf_engine_runs` rows.
 *
 * This route is kept (rather than 404'd) so any stale UI button or external
 * caller gets a clear 410 Gone signal with `canonical_engine: "chain"` —
 * silent 404s would look like a transient outage and trigger retries.
 *
 * Original ~1700-line implementation preserved at:
 *   _archive/2026-05-19-pre-chain-unification/api/autopilot-step-route.ts.archived
 *
 * Companion retirements (same date):
 *   - /api/cron/autopilot-tick → no-op
 *   - src/actions/cad-lab-projects.ts → Chase auto-fire disabled
 *   - src/actions/start-project-with-autopilot.ts → routes to pdf_engine_runs
 *
 * Drawer: [[forgeos_decisions_d43cbc3af134f902]]
 */

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST(): Promise<NextResponse> {
    return NextResponse.json(
        {
            error: "Gone — autopilot specialists retired 2026-05-19",
            canonical_engine: "chain",
            replacement: "INSERT into pdf_engine_runs(project_id, brief_text, status='pending')",
        },
        { status: 410 },
    )
}

export async function GET(): Promise<NextResponse> {
    return NextResponse.json(
        {
            ok: true,
            retired: "autopilot-step",
            since: "2026-05-19",
            canonical_engine: "chain",
        },
        { status: 200 },
    )
}
