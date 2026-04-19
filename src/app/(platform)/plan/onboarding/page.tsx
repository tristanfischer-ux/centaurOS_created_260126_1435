/**
 * @file page.tsx — Plan onboarding 5-step first-run flow (flag-gated).
 *
 * @description Server wrapper. When `new_plan_experience` is OFF for the user,
 * redirects to `/welcome` (the legacy first-login tour). When the flag is ON,
 * renders the 5-step conversational setup flow: Welcome → Purpose → First
 * Strategic Goal → Invite fractional (skippable) → Workspace tour.
 *
 * The flow is authored in British English ("programme", "organisation") and
 * follows the "No AI Emphasis" rule: specialists referenced by first name +
 * role ("Sage — Strategy"), never "Sage AI" or "AI-powered".
 *
 * @security Requires authenticated user. Redirects to /login if not.
 * @flag FLAG_NEW_PLAN_EXPERIENCE — OFF redirects to /welcome.
 *
 * @related
 * - Client flow: ./onboarding-flow.tsx
 * - Per-step components: ./steps/*.tsx
 * - Legacy tour: src/app/(platform)/welcome/welcome-view.tsx
 * - Server actions called: updateFoundryPurpose (foundry.ts),
 *   createStrategicGoal (plan/goals.ts — Agent B.4),
 *   inviteFractional (plan/fractionals.ts — Agent B.4).
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getFeatureFlag } from "@/lib/features/flags"
import { FLAG_NEW_PLAN_EXPERIENCE } from "@/lib/features/keys"
import { OnboardingFlow } from "./onboarding-flow"

export const metadata: Metadata = {
    title: "Plan · Setup",
    description: "Define your foundry's purpose and first Strategic Goal.",
}

export const dynamic = "force-dynamic"

interface OnboardingPageProps {
    searchParams: Promise<{ step?: string }>
}

export default async function PlanOnboardingPage({
    searchParams,
}: OnboardingPageProps): Promise<React.ReactNode> {
    // AUTH: Verify user
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    // FLAG: Gate behind new_plan_experience
    const enabled = await getFeatureFlag(supabase, user.id, FLAG_NEW_PLAN_EXPERIENCE)
    if (!enabled) redirect("/welcome")

    // Foundry id + greeting name
    const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, foundry_id")
        .eq("id", user.id)
        .maybeSingle()

    if (!profile?.foundry_id) {
        // Should never happen post-setup; bail to welcome to avoid a broken flow.
        redirect("/welcome")
    }

    const firstName = profile.full_name?.split(" ")[0] || undefined

    const params = await searchParams
    const rawStep = Number.parseInt(params.step ?? "1", 10)
    const initialStep =
        Number.isFinite(rawStep) && rawStep >= 1 && rawStep <= 5
            ? (rawStep as 1 | 2 | 3 | 4 | 5)
            : 1

    return (
        <OnboardingFlow
            firstName={firstName}
            foundryId={profile.foundry_id}
            userId={user.id}
            initialStep={initialStep}
        />
    )
}
