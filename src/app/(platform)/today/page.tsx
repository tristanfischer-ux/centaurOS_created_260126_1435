/**
 * @file page.tsx — "Today" page (V2 — mockup-faithful rebuild).
 *
 * @description Personalised daily landing. Ports FORGE-MOCKUP-TODAY-V2.html
 * verbatim into production React: greeting + signal chips, priority slab,
 * runway, Waiting-on-you inbox, ranked queue, calendar peek, 14-day risk
 * horizon, builds row, Operations/Team footer strips.
 *
 * This commit ships the visual shell with stubbed mockup content so Tristan
 * can parity-check the rendered page against FORGE-MOCKUP-TODAY-V2.html.
 * Data wiring (real briefing, runway, queue items, calendar, projects, team)
 * lands in a follow-up commit per MOCKUP-PARITY-PLAN.md.
 */

import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { TodayView } from "./today-view"

export const metadata: Metadata = {
    title: "Today",
    description: "Your personalised daily focus — what needs attention, what's waiting on you, what threatens the window",
}

export default async function TodayPage(): Promise<React.ReactNode> {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()

    let fullName: string | null = null
    if (authData?.user) {
        const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", authData.user.id)
            .single()
        fullName = (profile as { full_name?: string } | null)?.full_name ?? null
    }

    const userName = fullName ?? authData?.user?.email?.split("@")[0] ?? "there"

    return <TodayView userName={userName} />
}
