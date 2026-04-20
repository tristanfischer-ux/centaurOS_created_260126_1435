/**
 * @file page.tsx — /onboarding/money/tour (Money onboarding 5/5)
 *
 * @description Final step of the Money onboarding flow. Renders a mini
 * Cockpit preview with a 4-step tour overlay: runway tile → cash out →
 * cash in → raise pipeline. Terminal CTA routes to /money. Mockup-faithful
 * port of MONEY-MOCKUP-ONBOARDING-TOUR.html.
 *
 * Empty-state policy:
 *   - First-time user (no `onboarding_data.money_tour_complete`): show tour.
 *   - Already complete: redirect to /money.
 *
 * The primary CTA ("Open my Cockpit") calls
 * `markMoneyOnboardingStepComplete("tour")` and routes to /money.
 *
 * @security Requires authenticated user. Redirects to /login if not.
 *
 * @related
 *   - View:    ./money-tour-view.tsx
 *   - Styles:  ./money-tour.css (scoped .mob2-tour)
 *   - Action:  src/actions/welcome.ts → markMoneyOnboardingStepComplete
 *   - Mockup:  MONEY-MOCKUP-ONBOARDING-TOUR.html
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { MoneyTourView } from "./money-tour-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "First cockpit tour · ForgeOS onboarding",
    description:
        "Step 5 of 5 — a quick orientation to the Money Cockpit. Runway, cash flow, and raise pipeline.",
}

export default async function MoneyOnboardingTourPage(): Promise<React.ReactNode> {
    // AUTH: Verify user is authenticated.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_data")
        .eq("id", user.id)
        .maybeSingle()

    const onboarding = (profile?.onboarding_data as Record<string, unknown> | null) ?? {}

    // EMPTY STATE: If the user has already walked through the tour, skip to /money.
    if (onboarding.money_tour_complete === true) {
        redirect("/money")
    }

    return <MoneyTourView />
}
