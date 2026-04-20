/**
 * @file page.tsx — /onboarding/money/thesis (Money onboarding 4/5)
 *
 * @description Step 4 of the Money onboarding flow. Three lightweight
 * thesis questions (stage / tags / cheque range) that seed the match
 * engine. The full thesis editor with 8 fields + weighting + data sources
 * is available later at /money/raise/thesis. Mockup-faithful port of
 * MONEY-MOCKUP-ONBOARDING-THESIS.html.
 *
 * Empty-state policy:
 *   - First-time user (no `onboarding_data.money_thesis_complete`): show step.
 *   - Already complete: redirect to /money so repeat visits don't re-run it.
 *
 * The `investor_thesis` table isn't live yet (MONEY-SCHEMA.md §investor_thesis)
 * so the answers are recorded in `onboarding_data.money_thesis_draft` and a
 * later migration will copy them into the real thesis row when the schema
 * lands.
 *
 * @security Requires authenticated user. Redirects to /login if not.
 *
 * @related
 *   - View:    ./money-thesis-view.tsx
 *   - Styles:  ./money-thesis.css (scoped .mob2-thesis)
 *   - Action:  src/actions/welcome.ts → markMoneyOnboardingStepComplete
 *   - Mockup:  MONEY-MOCKUP-ONBOARDING-THESIS.html
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { MoneyThesisView } from "./money-thesis-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Investor thesis · ForgeOS onboarding",
    description:
        "Step 4 of 5 — three questions to seed the match engine. Stage, tags, cheque range. 60 seconds and you get 180 matches.",
}

export default async function MoneyOnboardingThesisPage(): Promise<React.ReactNode> {
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

    // EMPTY STATE: If the user has already finished this step, skip to /money.
    if (onboarding.money_thesis_complete === true) {
        redirect("/money")
    }

    return <MoneyThesisView />
}
