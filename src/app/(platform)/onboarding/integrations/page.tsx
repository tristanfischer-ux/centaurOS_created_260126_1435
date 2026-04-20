/**
 * @file onboarding/integrations/page.tsx — Step 5 of 7 in the getting-started
 * flow. Mockup-faithful port of FORGE-MOCKUP-ONBOARD-INTEGRATIONS.html.
 *
 * @description All six integration cards render as honest "Coming soon"
 * placeholders. No integration plumbing exists in the codebase today —
 * there is no `src/actions/integrations/*`, no `src/lib/integrations/*`
 * OAuth handshake, and no per-connection table. This page therefore
 * shows the roster of what's coming without faking connect buttons that
 * lead nowhere. Every card's "Connect" control is disabled and every
 * card carries a "Coming soon" chip.
 *
 * The single real action on this page is "Skip for now" (the footer
 * "Continue →" CTA), which will eventually progress the onboarding
 * wizard. Progress-tracking for the multi-step onboarding is not wired
 * yet, so the button currently navigates to `/today` — matching the
 * existing first-login redirect target from `setupNewUser`.
 *
 * @security Requires authenticated user. Redirects to /login if not.
 *
 * @related
 * - View:   ./integrations-view.tsx
 * - Styles: ./onboard-integrations-v2.css (scoped .oin2 — do NOT modify)
 * - Mockup: FORGE-MOCKUP-ONBOARD-INTEGRATIONS.html
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { IntegrationsView } from "./integrations-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Connect your tools · Onboarding · ForgeOS",
    description:
        "Step 5 of 7 — connect Gmail, Calendar and your CAD tools so ForgeOS stops asking for things you already have elsewhere.",
}

export default async function OnboardingIntegrationsPage(): Promise<React.ReactNode> {
    // AUTH: verify user is authenticated
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    return <IntegrationsView />
}
