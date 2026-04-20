/**
 * @file onboarding-preferences.ts — Server action for /onboarding/preferences.
 *
 * @description Persists the subset of the Preferences step that actually
 * maps to columns in the database. Today that is the email-digest cadence
 * only. The illustration-style, timezone, and language fields on the
 * mockup have no profile-level column to write to, so the view renders
 * them as read-only preview chrome and this action ignores them.
 *
 * Cadence radio → email_preferences table:
 *   - "daily"   → morning_digest = true,  unsubscribed_all_at = null,
 *                 paused_all_until = null
 *   - "off"     → morning_digest = false
 *   - "weekly"  and "critical" options exist on the mockup for parity
 *                 but no weekly / critical column exists yet; the view
 *                 does not allow them to be the submitted value.
 *
 * @security Uses the RLS-scoped client. Derives user from the session.
 * Never trusts a client-supplied user id.
 */

"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

/** Digest cadence values accepted by the server. */
export type DigestCadence = "daily" | "off"

const VALID_CADENCES: ReadonlyArray<DigestCadence> = ["daily", "off"]

/**
 * Save the onboarding preferences for the current user.
 *
 * Returns `{ success: true }` on any recognised input. Unknown cadence
 * values are rejected with an explicit error so bad clients can see why.
 */
export async function saveOnboardingPreferences(input: {
    cadence: DigestCadence
}): Promise<{ success: true } | { error: string }> {
    if (!VALID_CADENCES.includes(input.cadence)) {
        return { error: `Unknown cadence: ${input.cadence}` }
    }

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: "Unauthorized" }

    // Map the radio to the boolean column. When the user picks "Off" we
    // also clear any account-wide pause/unsubscribe so the choice is
    // explicit; future toggles from Settings still work from here.
    const morningDigest = input.cadence === "daily"

    const patch: {
        user_id: string
        morning_digest: boolean
        unsubscribed_all_at: string | null
        paused_all_until: string | null
    } = {
        user_id: user.id,
        morning_digest: morningDigest,
        unsubscribed_all_at: null,
        paused_all_until: null,
    }

    const { error } = await supabase
        .from("email_preferences")
        .upsert(patch, { onConflict: "user_id" })

    if (error) {
        console.error(
            "[onboarding-preferences] save failed",
            { userId: user.id, error: error.message },
        )
        return { error: "Could not save preferences. Please try again." }
    }

    revalidatePath("/onboarding/preferences")
    revalidatePath("/settings/email")

    return { success: true }
}
