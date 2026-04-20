/**
 * @file onboarding/preferences/page.tsx — Step 6 of 7 in the getting-started
 * flow. Mockup-faithful port of FORGE-MOCKUP-ONBOARD-PREFERENCES.html.
 *
 * @description Server component that reads the current user's
 * email-preferences row (if any) so the notifications radio can start
 * on the saved cadence rather than the default. Every other mockup
 * field (illustration style, timezone, language) has no profile-level
 * column to persist to today — the view renders them with honest
 * "Preview" / "Not yet saved" chrome and the Continue button only
 * writes the cadence value.
 *
 * Empty-state policy: first visit → no email_preferences row exists,
 * `initialMorningDigest` is null and the view treats that as the
 * default "Daily digest" selection. Returning visit → the row is read
 * and the radio reflects the stored boolean.
 *
 * @security Requires authenticated user. Redirects to /login if not.
 *
 * @related
 *   - Mockup:  FORGE-MOCKUP-ONBOARD-PREFERENCES.html (repo root)
 *   - View:    ./preferences-view.tsx
 *   - Styles:  ./onboard-preferences-v2.css (scoped .opr2)
 *   - Writes:  src/actions/onboarding-preferences.ts
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { PreferencesView } from "./preferences-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Preferences · Onboarding · ForgeOS",
    description:
        "Step 6 of 7 — sensible defaults are already picked. Confirm your digest cadence, illustration style, and locale, or change them later from Settings.",
}

export default async function OnboardingPreferencesPage(): Promise<React.ReactNode> {
    // AUTH: verify user is authenticated
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    // Read current email-prefs row so the notifications radio starts
    // on the user's saved cadence if one exists. No row → null → the
    // view uses the default "Daily digest" selection.
    const { data: prefsRow } = await supabase
        .from("email_preferences")
        .select("morning_digest")
        .eq("user_id", user.id)
        .maybeSingle()

    const initialMorningDigest: boolean | null =
        prefsRow?.morning_digest ?? null

    return (
        <PreferencesView
            initialMorningDigest={initialMorningDigest}
            hasExistingPreferences={prefsRow !== null}
        />
    )
}
