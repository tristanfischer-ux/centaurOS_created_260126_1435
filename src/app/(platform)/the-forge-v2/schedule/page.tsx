/**
 * @file schedule/page.tsx — /the-forge-v2/schedule
 *
 * @description Global Schedule / Time view — mockup-faithful port of
 * FORGE-MOCKUP-SCHEDULE.html reframed per the build brief. Sidebar "Time"
 * links here. Shows the founder's current-week time blocks across projects
 * (founder sessions, specialist conversations, supplier calls, audits).
 *
 * Data contract (V1):
 *   - No `schedule_blocks` table exists yet. The page renders the week view
 *     with 7 honest-empty day columns ("Nothing scheduled") and honest copy
 *     in the status strip + side cards. We do NOT pull from `tasks.end_date`
 *     in this round — the brief says the schedule "populates from calendar
 *     integration (not yet connected) and from task due dates", so pulling
 *     from tasks without also wiring the UI to render task blocks would be a
 *     half-done scaffold. Task-derived blocks land with the schedule store.
 *   - The server component owns "today" (UTC ISO date) so the week grid SSRs
 *     deterministically — the client never reads Date.now() on first render.
 *
 * Empty-state policy: no fabricated auditor slots, supplier calls, or standing
 * 1:1s. Every day column renders "Nothing scheduled".
 *
 * @related
 *   - View:   ./schedule-view.tsx
 *   - Styles: ./schedule-v2.css (scoped .sh2 — do NOT modify outside port)
 *   - Mockup: FORGE-MOCKUP-SCHEDULE.html
 */

import type { Metadata } from "next"

import { ScheduleView } from "./schedule-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Schedule · The Forge",
    description:
        "One calendar picker for every booking action — audits, expert intros, 1:1s, test-lab bookings, supplier reviews.",
}

export default function ForgeV2SchedulePage(): React.ReactNode {
    // Server-side "today" in UTC, ISO date form. Keeps SSR output stable and
    // independent of the client clock.
    const todayIso = new Date().toISOString().slice(0, 10)

    return <ScheduleView todayIso={todayIso} />
}
