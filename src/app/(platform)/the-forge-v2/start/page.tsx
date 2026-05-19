/**
 * @file the-forge-v2/start/page.tsx — the ONE-CLICK project start.
 *
 * @description Tristan's literal ask: "Founder writes a brief, clicks one
 * button, everything happens." This route is the minimal expression of that —
 * a single textarea + a single "Start" button.
 *
 * Chain-engine unification (2026-05-19): on submit the server action creates
 * the cad_lab_projects row, then INSERTs a pdf_engine_runs row with
 * status='pending'. The Mac Studio worker (LaunchAgent, polls every 30s)
 * claims it, spawns scripts/serial-design-chain-v2.tsx, runs the 35-stage
 * chain (~60-90 min for heatpump-class), uploads the PDF to Supabase Storage,
 * and stamps status='ready'. The client redirects to the workspace page which
 * polls until terminal and shows the download link.
 *
 * The retired "autopilot specialist" path (Chase → Max → Fang → Finn state
 * machine) is archived under `_archive/2026-05-19-pre-chain-unification/`.
 *
 * @related
 *   - src/actions/start-project-with-autopilot.ts — INSERT pdf_engine_runs
 *   - scripts/pdf-engine-worker.mjs              — Mac Studio worker
 *   - scripts/serial-design-chain-v2.tsx          — chain orchestrator
 *   - src/app/(platform)/the-forge-v2/projects/[id]/page.tsx — workspace
 */

import type { Metadata } from "next"

import { StartView } from "./start-view"

export const dynamic = "force-dynamic"
// GOTCHA (W18 — 2026-04-28): Edge functions do NOT support next/server `after()`.
// Without this, createCadLabProject's Chase after()-callback runs synchronously
// in-response, hitting the 300s wall and silently dropping the POST back to the
// client (no projectId → no redirect → founder sees nothing). Node.js runtime is
// required for after() to work as intended.
export const runtime = "nodejs"
// The action itself returns in <5s (DB write + autopilot seed). Chase runs
// post-response via after(). 30s budget is plenty for the synchronous path.
export const maxDuration = 30

export const metadata: Metadata = {
    title: "Start a new project · The Forge",
    description:
        "Write a short brief and click Start + Autopilot. The pipeline runs itself — Chase, Max, Fang, Finn — and emails you the PDF when it's ready.",
}

export default function StartPage(): React.ReactElement {
    return <StartView />
}
