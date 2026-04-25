/**
 * @file page.tsx — /onboarding/foundry (Forge V2 Onboarding Step 2 of 7).
 *
 * @description Server component that pre-fills the foundry form with whatever
 * we already know about the user's foundry (if any). Mockup-faithful port of
 * FORGE-MOCKUP-ONBOARD-FOUNDRY.html — the view handles all interactivity.
 *
 * Empty-state policy (per brief):
 *   - New user with no foundry → show the create form (initial values null)
 *   - User who already has a real foundry → still renderable, but we pre-fill
 *     the existing name/slug/industry/tier/role so the form becomes an
 *     "update" flow rather than overwriting blindly.
 *   - If the user has already completed the foundry step (stamp on
 *     onboarding_data) AND the foundry is not a shared placeholder, we
 *     redirect to /today so the onboarding page never overwrites a real
 *     foundry the user set up elsewhere.
 *
 * @security Requires authenticated user. Redirects to /login if not.
 *
 * @related
 *   View: ./onboarding-foundry-view.tsx
 *   Action: src/actions/foundry-onboarding.ts
 *   Mockup: FORGE-MOCKUP-ONBOARD-FOUNDRY.html
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import type { OnboardingData } from "@/actions/onboarding"
import type {
    FoundryOnboardingRole,
    FoundryOnboardingTier,
} from "@/actions/foundry-onboarding"

import { OnboardingFoundryView } from "./onboarding-foundry-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Your foundry · ForgeOS onboarding",
    description:
        "Step 2 of 7 — name your foundry, pick an industry, declare your team size. Your foundry is the tenant boundary for everything that follows.",
}

// ─── Tier coercion ────────────────────────────────────────────────────

const ALLOWED_TIERS: ReadonlyArray<FoundryOnboardingTier> = ["solo", "2-5", "6-15", "16+"]
const ALLOWED_ROLES: ReadonlyArray<FoundryOnboardingRole> = [
    "Founder",
    "CTO",
    "Head of ops",
    "Engineering lead",
    "Other",
]

function coerceTier(raw: string | null | undefined): FoundryOnboardingTier | null {
    if (!raw) return null
    return ALLOWED_TIERS.includes(raw as FoundryOnboardingTier)
        ? (raw as FoundryOnboardingTier)
        : null
}

function coerceRole(raw: string | null | undefined): FoundryOnboardingRole {
    if (!raw) return "Founder"
    return ALLOWED_ROLES.includes(raw as FoundryOnboardingRole)
        ? (raw as FoundryOnboardingRole)
        : "Founder"
}

// ─── Page ─────────────────────────────────────────────────────────────

export default async function OnboardingFoundryPage(): Promise<React.ReactNode> {
    // AUTH: Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    // Load profile + current foundry in parallel.
    const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, foundry_id, onboarding_data")
        .eq("id", user.id)
        .maybeSingle()

    const foundryId = profile?.foundry_id ?? null
    const isSharedPlaceholder =
        foundryId === "forge-guild" ||
        foundryId === "forge-suppliers" ||
        (foundryId ?? "").startsWith("sandbox-")

    let foundryName: string | null = null
    let foundrySlug: string | null = null
    let foundryIndustry: string | null = null
    let foundryTier: FoundryOnboardingTier | null = null

    if (foundryId && !isSharedPlaceholder) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- foundries.tier is part of the generated Row type
        const { data: foundry } = await (supabase as any)
            .from("foundries")
            .select("name, slug, industry, tier")
            .eq("id", foundryId)
            .maybeSingle()
        if (foundry) {
            foundryName = typeof foundry.name === "string" ? foundry.name : null
            foundrySlug = typeof foundry.slug === "string" ? foundry.slug : null
            foundryIndustry = typeof foundry.industry === "string" ? foundry.industry : null
            foundryTier = coerceTier(foundry.tier ?? null)
        }
    }

    const onboarding = (profile?.onboarding_data as OnboardingData & Record<string, unknown> | null) ?? {}
    const hasCompletedStep =
        typeof onboarding["foundry_step_completed_at"] === "string" &&
        (onboarding["foundry_step_completed_at"] as string).length > 0
    const alreadyRealFoundry = Boolean(foundryId && !isSharedPlaceholder)

    // Empty-state policy: real foundry + step already completed → /today.
    // Users can still revisit Settings to edit names; this route is the
    // first-time-setup surface.
    if (hasCompletedStep && alreadyRealFoundry) {
        redirect("/investors")
    }

    const firstName = profile?.full_name?.split(" ")[0] || undefined
    const initialRole = coerceRole(
        typeof onboarding["foundry_self_role"] === "string"
            ? (onboarding["foundry_self_role"] as string)
            : null,
    )
    const initialCountry =
        typeof onboarding["foundry_hq_country"] === "string"
            ? (onboarding["foundry_hq_country"] as string)
            : null
    const initialFiscalYearStart =
        typeof onboarding["foundry_fiscal_year_start"] === "string"
            ? (onboarding["foundry_fiscal_year_start"] as string)
            : null

    return (
        <OnboardingFoundryView
            initialName={foundryName}
            initialSlug={foundrySlug}
            initialIndustry={foundryIndustry}
            initialTier={foundryTier}
            initialRole={initialRole}
            initialCountry={initialCountry}
            initialFiscalYearStart={initialFiscalYearStart}
            firstName={firstName}
        />
    )
}
