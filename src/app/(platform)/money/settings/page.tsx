/**
 * @file money/settings/page.tsx — /money/settings.
 * Mockup-faithful port of MONEY-MOCKUP-SETTINGS.html (Round 4).
 *
 * @description Server component that loads the current foundry's
 * `money_settings` row and hands it to the client view. When no row
 * exists yet (new foundry) the action returns the defaults shape so
 * the form still renders with sensible starting values.
 *
 * @security Requires authenticated user inside a foundry. `withAuth`
 * inside `loadMoneySettings` enforces both checks and returns an
 * error string when either fails. We redirect to `/login` on an auth
 * failure so the URL stays stable (no half-populated page).
 *
 * @related
 *   - Mockup:  MONEY-MOCKUP-SETTINGS.html (repo root)
 *   - View:    ./settings-view.tsx
 *   - Styles:  ./mst2.css (scoped `.mst2`)
 *   - Actions: src/actions/money-settings.ts
 *   - Schema:  MONEY-SCHEMA.md §2 money_settings
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { loadMoneySettings } from "@/actions/money-settings"
import {
    DEFAULT_MONEY_SETTINGS,
    type MoneySettingsRow,
} from "@/actions/money-settings-types"

import { SettingsView } from "./settings-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Settings · Money · ForgeOS",
    description:
        "Foundry-wide defaults for Money — reporting currency, fiscal year, alert thresholds, specialist toggles, and data retention.",
}

export default async function MoneySettingsPage(): Promise<React.ReactNode> {
    const result = await loadMoneySettings()

    if ("error" in result) {
        // AUTH: `withAuth` returns `{ error: 'Unauthorized' }` when the
        // session is missing and `{ error: 'User not in a foundry' }`
        // when the profile has no foundry yet. Both collapse to a
        // login bounce — the platform layout only reaches this route
        // for authenticated users so in practice this path is rare.
        if (result.error === "Unauthorized") redirect("/login")

        // Any other error: render the form anyway with defaults so the
        // founder can still see the page chrome. The save button will
        // fail if the user truly has no foundry, which is the correct
        // surface for that edge case.
        const fallback: MoneySettingsRow = {
            foundry_id: "",
            ...DEFAULT_MONEY_SETTINGS,
        }
        return <SettingsView initialSettings={fallback} />
    }

    return <SettingsView initialSettings={result.settings} />
}
