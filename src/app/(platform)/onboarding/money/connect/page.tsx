/**
 * @file page.tsx — /onboarding/money/connect (Money onboarding 2/5)
 *
 * @description Step 2 of the Money onboarding flow. Offers 4 accounting
 * provider tiles (Xero / QuickBooks / FreeAgent / Direct-bank via Plaid)
 * plus a first-class Skip affordance. Accounting connection is optional —
 * many founders land here before opening Xero. Mockup-faithful port of
 * MONEY-MOCKUP-ONBOARDING-CONNECT.html.
 *
 * Empty-state policy:
 *   - First-time user (no `onboarding_data.money_connect_complete`): show step.
 *   - Already complete: redirect to /money so repeat visits don't re-run it.
 *
 * Both the Skip CTA and a provider tile call
 * `markMoneyOnboardingStepComplete("connect")` before routing to
 * /onboarding/money/first-plan. The actual OAuth flow to Xero/QBO/etc isn't
 * wired yet — provider tiles advance the step for now and the real
 * connection flow will bolt on in a later migration.
 *
 * @security Requires authenticated user. Redirects to /login if not.
 *
 * @related
 *   - View:    ./money-connect-view.tsx
 *   - Styles:  ./money-connect.css (scoped .mob2-connect)
 *   - Action:  src/actions/welcome.ts → markMoneyOnboardingStepComplete
 *   - Mockup:  MONEY-MOCKUP-ONBOARDING-CONNECT.html
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { MoneyConnectView } from "./money-connect-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Connect accounting · ForgeOS onboarding",
    description:
        "Step 2 of 5 — link Xero, QuickBooks, FreeAgent or your bank for real runway. Or skip and enter costs manually.",
}

export default async function MoneyOnboardingConnectPage(): Promise<React.ReactNode> {
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
    if (onboarding.money_connect_complete === true) {
        redirect("/money")
    }

    return <MoneyConnectView />
}
