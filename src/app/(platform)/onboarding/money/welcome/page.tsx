/**
 * @file page.tsx — /onboarding/money/welcome (Money onboarding 1/5)
 *
 * @description Step 1 of the Money onboarding flow. Sets the 4-minute
 * expectation, lays out the 5 steps, introduces the three value pillars
 * (runway / plan / raise). Mockup-faithful port of
 * MONEY-MOCKUP-ONBOARDING-WELCOME.html.
 *
 * Empty-state policy:
 *   - First-time user (no `onboarding_data.money_welcome_complete`): show step.
 *   - Already complete: redirect to /money so repeat visits don't re-run it.
 *
 * The primary CTA ("Start setup") calls `markMoneyOnboardingStepComplete("welcome")`
 * and routes to /onboarding/money/connect.
 *
 * @security Requires authenticated user. Redirects to /login if not.
 *
 * @related
 *   - View:    ./money-welcome-view.tsx
 *   - Styles:  ./money-welcome.css (scoped .mob2-welcome)
 *   - Action:  src/actions/welcome.ts → markMoneyOnboardingStepComplete
 *   - Mockup:  MONEY-MOCKUP-ONBOARDING-WELCOME.html
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { MoneyWelcomeView } from "./money-welcome-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Welcome to Money · ForgeOS onboarding",
    description:
        "Step 1 of 5 — the 4-minute setup that gets you a useful Money cockpit. Runway, plan, and fundraise pipeline.",
}

export default async function MoneyOnboardingWelcomePage(): Promise<React.ReactNode> {
    // AUTH: Verify user is authenticated.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, foundry_id, onboarding_data")
        .eq("id", user.id)
        .maybeSingle()

    const onboarding = (profile?.onboarding_data as Record<string, unknown> | null) ?? {}

    // EMPTY STATE: If the user has already finished Money onboarding's welcome
    // step, skip straight to /money. Keeps repeat logins unburdened.
    if (onboarding.money_welcome_complete === true) {
        redirect("/money")
    }

    // Load foundry name for the hero line. Falls back to "your foundry".
    let foundryName: string | null = null
    if (profile?.foundry_id) {
        const { data: foundry } = await supabase
            .from("foundries")
            .select("name")
            .eq("id", profile.foundry_id)
            .maybeSingle()
        foundryName = typeof foundry?.name === "string" ? foundry.name : null
    }

    return <MoneyWelcomeView foundryName={foundryName} />
}
