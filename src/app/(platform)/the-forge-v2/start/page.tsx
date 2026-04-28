/**
 * @file the-forge-v2/start/page.tsx — the ONE-CLICK project start.
 *
 * @description Tristan's literal ask: "Founder writes a brief, clicks one
 * button, everything happens." This route is the minimal expression of that —
 * a single textarea + a single "Start + Autopilot" button.
 *
 * On submit: server creates the project, fires Chase research, flips
 * autopilot_state so the state machine walks through Chase → brief.lock →
 * Max → Fang sizing → BOM → Finn → illustration → modules → supplier match →
 * Fang reviews → PDF export. The client redirects to the workspace where the
 * progress ticker takes over.
 *
 * The 5-step wizard at /the-forge-v2/new stays for founders who want to fill
 * in every metadata field upfront. This page is the default.
 *
 * @related
 *   - src/actions/start-project-with-autopilot.ts
 *   - src/actions/forge-v2-autopilot.ts (startAutopilot)
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
