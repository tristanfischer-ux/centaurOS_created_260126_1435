/**
 * @file money/raise/pitch/page.tsx — /money/raise/pitch
 *
 * @description Money V2 · Raise · Pitch prep section editor. Mockup-faithful
 * port of MONEY-MOCKUP-PITCH-SECTION.html. Two-column surface: the left is a
 * sectioned narrative form ("path to gross profitability", "three scenarios",
 * "key sensitivities", "supporting assumptions"); the right rail is Sending-
 * to / Checklist / Inspiration / Version history. A sections-tab strip sits
 * across the top (8 tabs: Company + one-liner, Target market, Problem +
 * solution, Traction, Team, Ask, Financial model (active), Cap table).
 *
 * Data contract:
 *   - Target tables `pitch_prep_section` and `pitch_prep_slide` are defined
 *     in MONEY-SCHEMA §2 but the migration has NOT landed yet. The page
 *     therefore persists the narrative fields + slide drafts to
 *     `localStorage` under a stable key and shows an honest "Drafts save
 *     to this browser" banner — same shape as the Compose page.
 *   - Rail copy is generic (not bound to the mockup's Nimbus/Octopus/Simon
 *     specifics) because we have no investor_round / DD-queue action wired
 *     for this surface yet.
 *   - Auto-pulled-from-Plan callout renders as an honest empty state — the
 *     plan_line_items wire-up to slide bindings ships with the persistence
 *     migration.
 *
 * Empty-state policy:
 *   - No deck → "Start your first deck" with a single call to action.
 *   - New slide → empty editor (see ./edit/[slideId]/page.tsx).
 *
 * Scope clause (parallel sub-agent safety):
 *   - Writes ONLY to files under /money/raise/pitch/*.
 *   - Does NOT touch database.types.ts, migrations, sidebar, /cash-burn/*,
 *     or other /money/<x>/* routes.
 *
 * @related
 *   - View:   ./pitch-view.tsx
 *   - Styles: ./pitch-v2.css (scoped `.ptc2`)
 *   - Mockup: MONEY-MOCKUP-PITCH-SECTION.html
 *   - Schema: MONEY-SCHEMA.md §pitch_prep_section + §pitch_prep_slide
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { PitchView } from "./pitch-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Pitch prep · Money",
    description:
        "Draft your pitch section by section — the narrative is yours, the numbers stay wired to your plan.",
}

export default async function MoneyRaisePitchPage(): Promise<React.ReactNode> {
    // AUTH: behind login — platform layout already gates this, belt-and-braces.
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    return <PitchView />
}
