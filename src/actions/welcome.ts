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
