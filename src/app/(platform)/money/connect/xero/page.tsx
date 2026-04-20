/**
 * @file money/connect/xero/page.tsx — /money/connect/xero
 *
 * @description Connect-accounting page for Money V2. Mockup-faithful port
 * of MONEY-MOCKUP-CONNECT-XERO.html. The mockup is a 5-step flow (provider
 * choice → OAuth → account mapping → historical import → sync settings)
 * driven by a provider abstraction in `src/actions/finance-integrations.ts`.
 *
 * The actions file exists but the Xero OAuth handshake is NOT wired today —
 * there is no OAuth route, no `xero_connection` table, no token store, no
 * per-foundry `account_map` rows. Per MONEY-SCHEMA.md §5 the Xero tables
 * ship as part of the Phase 2 migration chunk. This page therefore renders
 * as an HONEST PREVIEW: every section from the mockup is visible (stepper,
 * provider tiles, OAuth card, mapping table, import + sync settings, rail
 * cards, footer) but the live-action controls are disabled, and a "Preview"
 * chip + a top-of-page banner make the state unambiguous. The "Connect with
 * Xero" button fires a `console.info` + a toast; no redirect happens.
 *
 * This is the right shape for the "preparation state" called out in the
 * sub-agent brief: the founder can see exactly what the connector will look
 * like and what it will import, without any fake interactions pretending
 * to work. When Xero OAuth lands, the disabled buttons + banner flip off;
 * the rest of the mockup stays.
 *
 * @security Requires an authenticated user. Redirects to /login otherwise.
 *   No data is read from or written to Supabase on this page — preview only.
 *
 * @related
 *   - Mockup: /MONEY-MOCKUP-CONNECT-XERO.html
 *   - View:   ./connect-xero-view.tsx
 *   - Styles: ./connect-xero-v2.css (scoped .xer2 — do NOT modify)
 *   - Handover: /HANDOVER-money.md  §B Routes · Cockpit · Connect Xero
 *   - Orphan actions (not yet wired): /src/actions/finance-integrations.ts
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { ConnectXeroView } from "./connect-xero-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Connect accounting · Money · ForgeOS",
    description:
        "Preview of the Xero / QuickBooks / FreeAgent / direct-bank connector. OAuth handshake wires up next round.",
}

export default async function MoneyConnectXeroPage(): Promise<React.ReactNode> {
    // AUTH: page must not be crawlable or reachable to anonymous users
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    return <ConnectXeroView />
}
