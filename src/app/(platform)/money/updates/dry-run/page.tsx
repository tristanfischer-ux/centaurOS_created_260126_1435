/**
 * @file money/updates/dry-run/page.tsx — /money/updates/dry-run
 *
 * @description Xero dry-run preview surface for Money V2. Mockup-faithful
 * port of MONEY-MOCKUP-DRY-RUN.html.
 *
 * The dry-run scan is the safe preview between Xero "Confirm mappings" and
 * "Start sync" — it reads a year of Xero data without touching the
 * ForgeOS ledger, clusters into categories, and surfaces anything that
 * looks miscategorised. The scan is NOT wired today; the Xero OAuth
 * handshake + sync action still need to land (per HANDOVER-money.md §B).
 *
 * This page therefore renders as an HONEST PREVIEW: every section from
 * the mockup is visible (stats tiles, category rollup, sample
 * transactions, review queue, action bar) with em-dash placeholders and
 * honest empty-state copy in place of fabricated numbers. "Run dry-run"
 * is the primary action — click fires a toast but no scan runs.
 *
 * @security Requires an authenticated user. Redirects to /login otherwise.
 *   No writes to Supabase today — preview only.
 *
 * @related
 *   - Mockup:   /MONEY-MOCKUP-DRY-RUN.html
 *   - View:     ./dry-run-view.tsx
 *   - Styles:   ./dry-run-v2.css (scoped .dry2 — do NOT modify)
 *   - Handover: /HANDOVER-money.md §B Routes · Cockpit · Connect Xero
 *   - Sibling:  /money/connect/xero (the step immediately before dry-run)
 *   - Orphan actions: /src/actions/finance-integrations.ts
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { DryRunView } from "./dry-run-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Dry-run preview · Xero · Money · ForgeOS",
    description:
        "Preview of the Xero dry-run scan. Non-destructive preview of what would import. Scan wires up once the Xero connector lands.",
}

export default async function MoneyDryRunPage(): Promise<React.ReactNode> {
    // AUTH: page must not be reachable to anonymous users
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    return <DryRunView />
}
