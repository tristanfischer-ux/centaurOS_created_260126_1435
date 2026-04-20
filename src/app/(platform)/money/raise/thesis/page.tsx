/**
 * @file money/raise/thesis/page.tsx — /money/raise/thesis.
 * Mockup-faithful port of MONEY-MOCKUP-THESIS-BUILDER.html.
 *
 * @description Server component that loads the foundry's currently
 * active `investor_thesis` row (via `foundries.active_thesis_id`) plus
 * a count of total versions saved, and hands them to the client view.
 * When no active thesis exists yet, the action returns `DEFAULT_THESIS`
 * so the form still renders with sensible starting values and the
 * founder can save their first version.
 *
 * @security Requires authenticated user inside a foundry. `withAuth`
 * inside `loadThesis` enforces both checks; an auth failure bounces
 * to /login.
 *
 * @related
 *   - Mockup:  MONEY-MOCKUP-THESIS-BUILDER.html (repo root)
 *   - View:    ./thesis-view.tsx
 *   - Styles:  ./ths2.css (scoped `.ths2`)
 *   - Actions: src/actions/money-thesis.ts
 *   - Schema:  MONEY-SCHEMA.md §2 investor_thesis
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import { loadThesis } from "@/actions/money-thesis"
import { DEFAULT_THESIS } from "@/actions/money-thesis-types"

import { ThesisView } from "./thesis-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Investor thesis · Money · ForgeOS",
    description:
        "Describe the investor who's right for you. Weighting and fit criteria power the shortlist once the Raise pipeline lands.",
}

export default async function MoneyThesisPage(): Promise<React.ReactNode> {
    const result = await loadThesis()

    if ("error" in result) {
        // AUTH: `withAuth` returns `{ error: 'Unauthorized' }` when the
        // session is missing and `{ error: 'User not in a foundry' }`
        // when the profile has no foundry yet. Both collapse to a
        // login bounce.
        if (result.error === "Unauthorized") redirect("/login")

        // Any other error: render the form anyway with defaults so the
        // founder can at least see the page chrome. The save button
        // will fail if the user truly has no foundry, which is the
        // correct surface for that edge case.
        return (
            <ThesisView
                initialThesis={DEFAULT_THESIS}
                historyCount={0}
            />
        )
    }

    const historyCount = await loadHistoryCount()

    return (
        <ThesisView
            initialThesis={result.thesis}
            historyCount={historyCount}
        />
    )
}

/**
 * Count how many `investor_thesis` rows exist for this foundry.
 * Drives the "Versions saved" stat tile + rail card. Returns 0 on any
 * error rather than surfacing — the count is chrome, not critical.
 */
async function loadHistoryCount(): Promise<number> {
    try {
        const foundryId = await getFoundryIdCached()
        if (!foundryId) return 0
        const supabase = await createClient()
        const { count, error } = await supabase
            .from("investor_thesis")
            .select("id", { count: "exact", head: true })
            .eq("foundry_id", foundryId)
            .is("archived_at", null)
        if (error) {
            console.error(
                "[money-thesis-page] loadHistoryCount failed:",
                error,
            )
            return 0
        }
        return count ?? 0
    } catch (err) {
        console.error("[money-thesis-page] loadHistoryCount crashed:", err)
        return 0
    }
}
