/**
 * @file page.tsx — /onboarding/cockpit-tour
 *
 * @description Step 7 of 7 of the getting-started flow. A quick orientation
 * to the Today page — four numbered callouts on a scaled-down Today layout,
 * explaining what a founder cares about each morning: the priority slab, the
 * runway card, the waiting-on-you queue, and the calendar peek. Mockup-faithful
 * port of FORGE-MOCKUP-ONBOARD-COCKPIT-TOUR.html.
 *
 * Empty-state policy:
 *   - First-time user (no `onboarding_data.has_completed_tour`): show tour.
 *   - Already completed: redirect to /today so repeat visits don't re-run it.
 *
 * The primary CTA ("Start my day") calls `markCockpitTourComplete` to flip
 * `profiles.onboarding_data.has_completed_tour = true`, mirroring the
 * `has_completed_welcome` pattern — same JSONB column, no new columns.
 *
 * @security Requires authenticated user. Redirects to /login if not.
 *
 * @related
 *   - View:    ./cockpit-tour-view.tsx
 *   - Styles:  ./cockpit-tour.css (scoped .oct2)
 *   - Action:  src/actions/welcome.ts → markCockpitTourComplete
 *   - Mockup:  FORGE-MOCKUP-ONBOARD-COCKPIT-TOUR.html
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { CockpitTourView } from "./cockpit-tour-view"

export const metadata: Metadata = {
    title: "Tour of Today · ForgeOS onboarding",
    description:
        "A quick orientation to Today — the four things a founder cares about each morning.",
}

export const dynamic = "force-dynamic"

export default async function CockpitTourPage(): Promise<React.ReactNode> {
    // AUTH: Verify user is authenticated.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, onboarding_data")
        .eq("id", user.id)
        .single()

    // EMPTY STATE: If the user has already walked through the tour, skip
    // straight to Today. Keeps repeat logins unburdened.
    const onboarding = (profile?.onboarding_data as Record<string, unknown> | null) ?? {}
    if (onboarding.has_completed_tour === true) {
        redirect("/today")
    }

    const firstName = profile?.full_name?.split(" ")[0] || undefined

    return <CockpitTourView firstName={firstName} />
}
