/**
 * @file page.tsx — /onboarding/money/first-plan (Money onboarding 3/5)
 *
 * @description Step 3 of the Money onboarding flow. Template-driven first
 * plan: picking a template pre-populates ~8 typical cost + revenue lines
 * so the Plan grid is never empty. Mockup-faithful port of
 * MONEY-MOCKUP-ONBOARDING-FIRST-PLAN.html.
 *
 * Empty-state policy:
 *   - First-time user (no `onboarding_data.money_first_plan_complete`): show step.
 *   - Already complete: redirect to /money so repeat visits don't re-run it.
 *
 * The `plan_templates` seed table is on MONEY-SCHEMA.md §6.4a — it doesn't
 * exist in the DB yet, so template-pick simply flips the step flag. The
 * chosen template id is recorded in `onboarding_data.money_first_plan_template`
 * so a later migration can clone the seed rows into `plan_line_items`.
 *
 * @security Requires authenticated user. Redirects to /login if not.
 *
 * @related
 *   - View:    ./money-first-plan-view.tsx
 *   - Styles:  ./money-first-plan.css (scoped .mob2-first-plan)
 *   - Action:  src/actions/welcome.ts → markMoneyOnboardingStepComplete
 *   - Mockup:  MONEY-MOCKUP-ONBOARDING-FIRST-PLAN.html
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { MoneyFirstPlanView } from "./money-first-plan-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "First plan lines · ForgeOS onboarding",
    description:
        "Step 3 of 5 — pick a template. We'll pre-fill typical cost and revenue lines; you edit amounts to match reality.",
}

export default async function MoneyOnboardingFirstPlanPage(): Promise<React.ReactNode> {
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
    if (onboarding.money_first_plan_complete === true) {
        redirect("/money")
    }

    return <MoneyFirstPlanView />
}
