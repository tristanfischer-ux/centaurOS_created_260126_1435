"use server"

import { createClient } from "@/lib/supabase/server"

/**
 * Marks the current user's Welcome tour as seen by merging
 * `has_completed_welcome: true` into `profiles.onboarding_data`.
 *
 * INTENT: Called from the Welcome page's "Take me to Today" CTA so
 * we can track who has walked through the tour at least once. The
 * Welcome nav item stays visible in the sidebar either way — this
 * flag drives first-login redirect logic, not permanent hiding.
 *
 * @security Uses the RLS-scoped client (not admin). Users can only
 * mutate their own profile per the canonical UPDATE policy.
 */
export async function markWelcomeComplete(): Promise<{ success: boolean }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false }

    const { data: profile, error: readError } = await supabase
        .from("profiles")
        .select("onboarding_data")
        .eq("id", user.id)
        .single()

    if (readError) {
        console.error("[welcome] Failed to read profile onboarding_data:", readError.message)
        return { success: false }
    }

    const existing = (profile?.onboarding_data as Record<string, unknown> | null) ?? {}
    const updated = { ...existing, has_completed_welcome: true }

    const { error: updateError } = await supabase
        .from("profiles")
        .update({ onboarding_data: updated })
        .eq("id", user.id)

    if (updateError) {
        console.error("[welcome] Failed to mark welcome complete:", updateError.message)
        return { success: false }
    }

    return { success: true }
}

/**
 * Sets the foundry's stage / sector / industry from the Welcome page
 * "Quick set-up" card. Allows non-Founder roles (Executive, Apprentice)
 * to fill in their own sandbox foundry's profile fields.
 *
 * INTENT: New email/password signups land with role="Executive" and a
 * sandbox foundry whose stage/sector/industry are NULL. The previous
 * onboarding tour captured these — that tour was retired
 * 2026-04-27, leaving the fields un-populatable from the UI for a
 * non-Founder. updateCompanyProfile() in src/actions/foundry.ts
 * gates on role==='Founder'. This action is the deliberate
 * sandbox-only escape hatch: any user may set their OWN foundry's
 * stage/sector/industry, but ONLY if the foundry is flagged
 * is_sandbox=true (so we never let a non-Founder mutate a real
 * shared workspace).
 *
 * @security RLS-scoped client; user can only update their own
 * foundry via FK (foundry_id from profiles). Sandbox-only check
 * prevents shared-foundry tampering.
 */
export async function setFoundryQuickProfile(input: {
    stage: string | null
    sector: string | null
    industry: string | null
}): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "not-authed" }

    // Look up the user's foundry via their profile.
    const { data: profile } = await supabase
        .from("profiles")
        .select("foundry_id")
        .eq("id", user.id)
        .single()

    if (!profile?.foundry_id) {
        return { success: false, error: "no-foundry" }
    }

    // Sandbox-only: refuse to mutate a non-sandbox (shared) foundry
    // unless the user is the owner. Belt-and-braces.
    const { data: foundry } = await supabase
        .from("foundries")
        .select("is_sandbox, owner_id")
        .eq("id", profile.foundry_id)
        .single()

    if (!foundry) return { success: false, error: "foundry-not-found" }
    if (!foundry.is_sandbox && foundry.owner_id !== user.id) {
        return { success: false, error: "not-allowed-on-shared-foundry" }
    }

    const updates: Record<string, string | null> = {}
    if (input.stage !== null && input.stage !== "") updates.stage = input.stage
    if (input.sector !== null && input.sector !== "") updates.sector = input.sector
    if (input.industry !== null && input.industry !== "") updates.industry = input.industry

    if (Object.keys(updates).length === 0) {
        return { success: false, error: "no-fields" }
    }

    const { error: updateError } = await supabase
        .from("foundries")
        .update(updates)
        .eq("id", profile.foundry_id)

    if (updateError) {
        console.error("[welcome] setFoundryQuickProfile failed:", updateError.message)
        return { success: false, error: "update-failed" }
    }

    return { success: true }
}

/**
 * Marks the current user's cockpit tour as seen by merging
 * `has_completed_tour: true` into `profiles.onboarding_data`.
 *
 * INTENT: Called from the /onboarding/cockpit-tour page's
 * "Start my day" CTA — the terminal step (7 of 7) of the
 * getting-started flow. Mirrors `markWelcomeComplete` so the
 * JSONB column stays the single source of truth for onboarding
 * progress. The page uses this flag as its empty-state gate:
 * first-time users see the tour, repeat visitors redirect to
 * /today.
 *
 * @security Uses the RLS-scoped client (not admin). Users can only
 * mutate their own profile per the canonical UPDATE policy.
 */
export async function markCockpitTourComplete(): Promise<{ success: boolean }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false }

    const { data: profile, error: readError } = await supabase
        .from("profiles")
        .select("onboarding_data")
        .eq("id", user.id)
        .single()

    if (readError) {
        console.error("[cockpit-tour] Failed to read profile onboarding_data:", readError.message)
        return { success: false }
    }

    const existing = (profile?.onboarding_data as Record<string, unknown> | null) ?? {}
    const updated = { ...existing, has_completed_tour: true }

    const { error: updateError } = await supabase
        .from("profiles")
        .update({ onboarding_data: updated })
        .eq("id", user.id)

    if (updateError) {
        console.error("[cockpit-tour] Failed to mark tour complete:", updateError.message)
        return { success: false }
    }

    return { success: true }
}

/**
 * Allowed step IDs for the Money onboarding flow.
 *
 * INTENT: Each step of the 5-step Money onboarding (welcome → connect →
 * first-plan → thesis → tour) flips its own flag on
 * `profiles.onboarding_data` under a `money_<step>_completed_at` ISO
 * timestamp. Keeps the progress visible per-step so we can build a
 * sidebar progress widget later without a schema change.
 */
export type MoneyOnboardingStepId =
    | "welcome"
    | "connect"
    | "first_plan"
    | "thesis"
    | "tour"

const MONEY_STEP_IDS: ReadonlyArray<MoneyOnboardingStepId> = [
    "welcome",
    "connect",
    "first_plan",
    "thesis",
    "tour",
]

/**
 * Marks a Money onboarding step complete by merging
 * `money_<step>_completed_at: <ISO>` and
 * `money_<step>_complete: true` into `profiles.onboarding_data`.
 *
 * INTENT: Mirrors `markWelcomeComplete` / `markCockpitTourComplete` — same
 * JSONB column, no new columns. When the Money schema lands,
 * `money_settings.onboarding_progress` will carry the foundry-level
 * summary; until then the per-user flags here are the single source of
 * truth for "has this founder seen this step".
 *
 * Valid step IDs: welcome, connect, first_plan, thesis, tour.
 *
 * @security Uses the RLS-scoped client (not admin). Users can only
 * mutate their own profile per the canonical UPDATE policy.
 */
export async function markMoneyOnboardingStepComplete(
    stepId: MoneyOnboardingStepId,
): Promise<{ success: boolean }> {
    if (!MONEY_STEP_IDS.includes(stepId)) {
        console.error("[money-onboarding] Unknown step id:", stepId)
        return { success: false }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false }

    const { data: profile, error: readError } = await supabase
        .from("profiles")
        .select("onboarding_data")
        .eq("id", user.id)
        .single()

    if (readError) {
        console.error(
            "[money-onboarding] Failed to read profile onboarding_data:",
            readError.message,
        )
        return { success: false }
    }

    // NOTE: We cast through a Record type so TS can spread `existing`, then
    // pass the object back to Supabase. The profiles.onboarding_data column
    // is a JSONB; every value we set here is a JSON-safe primitive.
    const existing = (profile?.onboarding_data as Record<string, unknown> | null) ?? {}
    const nowIso = new Date().toISOString()
    const updated = {
        ...existing,
        [`money_${stepId}_complete`]: true,
        [`money_${stepId}_completed_at`]: nowIso,
    } as Record<string, unknown>

    const { error: updateError } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- onboarding_data is JSONB; the Json type from generated types is awkward to satisfy for a spread object
        .update({ onboarding_data: updated as any })
        .eq("id", user.id)

    if (updateError) {
        console.error(
            "[money-onboarding] Failed to mark step complete:",
            updateError.message,
        )
        return { success: false }
    }

    return { success: true }
}
