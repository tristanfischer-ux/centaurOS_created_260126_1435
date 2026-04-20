/**
 * @file money/expenses/new/page.tsx — /money/expenses/new
 *
 * @description "Log an expense" — mockup-faithful port of
 * MONEY-MOCKUP-LOG-EXPENSE.html. Manual one-off expense entry. This is the
 * primary path for non-recurring costs that aren't in Plan (conference
 * ticket, hardware order, contractor one-off).
 *
 * The mockup's engineering note calls out a `finance_expenses` extension.
 * Per the brief from the sub-agent wave, the table name being targeted is
 * `money_transactions` — which does NOT exist in the current schema. Rather
 * than silently rerouting to a lookalike table (`finance_expenses` overlaps
 * but is a different surface owned by the legacy reimbursement flow), the
 * page renders as an HONEST PREVIEW: every field is interactive, the form
 * validates client-side, and the submit handler surfaces a clear "not yet
 * persisted" banner instead of pretending to save. When the
 * `money_transactions` migration lands, the view wires up without any DOM
 * changes.
 *
 * @security Requires authenticated user. Redirects to /login otherwise. No
 *   data is read from or written to Supabase on this page today — preview.
 *
 * @related
 *   - Mockup:   /MONEY-MOCKUP-LOG-EXPENSE.html
 *   - View:     ./log-expense-view.tsx
 *   - Styles:   ./log-expense-v2.css (scoped .lex2)
 *   - Schema:   /MONEY-SCHEMA.md — `money_transactions` not yet defined;
 *               `finance_expenses` exists as adjacent legacy table.
 *   - Handover: /HANDOVER-money.md
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { LogExpenseView } from "./log-expense-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Log an expense · Money · ForgeOS",
    description:
        "Log a one-off cost that isn't in your Plan. Appears in Cockpit movers once persistence ships.",
}

export default async function MoneyLogExpensePage(): Promise<React.ReactNode> {
    // AUTH: page must not be crawlable or reachable to anonymous users.
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    return <LogExpenseView />
}
