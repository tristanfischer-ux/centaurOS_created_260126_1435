/**
 * @file money/import/gmail/page.tsx — Mockup-faithful port of
 * MONEY-MOCKUP-GMAIL-IMPORT.html. Whole page is a preparation / preview
 * state. No Gmail OAuth, no thread fetch, no extraction plumbing exists in
 * the codebase today — there is no `src/actions/money/gmail/*`, no
 * per-foundry forward-to-inbox addresses provisioned, and no LLM
 * extraction pipeline wired. Rather than render connect buttons that lead
 * nowhere, the page renders the full layout the founder will see once
 * Gmail import lands, with a visible preview banner at the top and a
 * sample of what would be imported for the "Simon King · Octopus
 * Ventures" thread shown in the mockup.
 *
 * @description The only real affordance on this page is navigation —
 * Cancel links back to the Log-touch entry point (which also does not
 * exist yet; falls back to /today until /money/raise/log-touch is built
 * in the wave that covers Raise). Every other control is disabled with
 * honest copy.
 *
 * @security Requires authenticated user. Redirects to /login if not.
 *
 * @related
 *   - View:   ./gmail-import-view.tsx
 *   - Styles: ./gmail-import-v2.css (scoped .gml2 — do NOT modify
 *             alongside other /money/* CSS files)
 *   - Mockup: MONEY-MOCKUP-GMAIL-IMPORT.html
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { GmailImportView } from "./gmail-import-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Import from Gmail · Raise · Money · ForgeOS",
    description:
        "Import a Gmail thread as a touch rather than copy-pasting. Preview of the flow before OAuth wiring lands.",
}

export default async function MoneyGmailImportPage(): Promise<React.ReactNode> {
    // AUTH: verify user is authenticated — this is a platform-gated route.
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    return <GmailImportView />
}
