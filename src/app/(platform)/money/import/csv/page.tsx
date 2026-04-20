/**
 * @file money/import/csv/page.tsx — Mockup-faithful port of
 * MONEY-MOCKUP-CSV-IMPORT.html. Three-step flow rendered as one scrollable
 * page: (1) upload, (2) column mapping, (3) review + commit.
 *
 * @description Parse-and-preview is wired client-side — founders can drop a
 * file and see their own headers + sample rows mapped against the canonical
 * plan_line_items fields. **Persistence is NOT wired** — the commit CTA is
 * disabled with an honest chip ("Persistence wires up next round") because
 * the server action that inserts preview rows into plan_line_items (via the
 * existing cash-burn-import.ts engine) has not been adapted to the Money V2
 * shape yet. Every affordance the mockup shows is present; only the final
 * insert is stubbed.
 *
 * @security Requires authenticated user. Redirects to /login if not. No
 * file content is sent to the server on this page — parsing is entirely
 * browser-local, so the row preview stays on the founder's machine until
 * they hit Commit (disabled for now).
 *
 * @related
 *   - View:   ./csv-import-view.tsx
 *   - Styles: ./csv-import-v2.css (scoped .csv2 — do NOT modify alongside
 *             other /money/* CSS files)
 *   - Mockup: MONEY-MOCKUP-CSV-IMPORT.html
 *   - Ref:    ../gmail/gmail-import-view.tsx (same shape — preview without
 *             wired persistence)
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { CsvImportView } from "./csv-import-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Import from CSV · Plan · Money · ForgeOS",
    description:
        "Upload a spreadsheet — we'll guess which column is which and you review the mapping before commit.",
}

export default async function MoneyCsvImportPage(): Promise<React.ReactNode> {
    // AUTH: verify user is authenticated — this is a platform-gated route.
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    return <CsvImportView />
}
