/**
 * @file finance.ts — Finance-specific tool handlers for Finn (CFO) specialist.
 *
 * @description Implements query_financial_overview which pulls from the company
 * profile and finance tables (expenses, invoices, budgets, funding).
 *
 * @security All queries filter by foundry_id. Read-only.
 *
 * @related
 * - Common handlers: src/lib/agents/tools/handlers/common.ts
 * - Finance tables: finance_expenses, finance_standalone_invoices, finance_budgets
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { ToolHandler } from "./common"

// ─── query_financial_overview ────────────────────────────────────────

export const handleQueryFinancialOverview: ToolHandler = async (_args, ctx) => {
    const supabase = createAdminClient()

    // Fetch foundry profile for high-level financial data
    const { data: foundry } = await supabase
        .from("foundries")
        .select("name, revenue_range, team_size, funding_stage, sector, currency")
        .eq("id", ctx.foundryId)
        .single()

    // Recent expenses (last 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const { data: expenses } = await supabase
        .from("finance_expenses")
        .select("id, amount, currency, category, description, expense_date, vendor, status")
        .eq("foundry_id", ctx.foundryId)
        .gte("expense_date", ninetyDaysAgo.split("T")[0])
        .order("expense_date", { ascending: false })
        .limit(50)

    // Active budgets
    const { data: budgets } = await supabase
        .from("finance_budgets")
        .select("id, name, category, amount, currency, period, is_active")
        .eq("foundry_id", ctx.foundryId)
        .eq("is_active", true)
        .limit(20)

    // Recent invoices
    const { data: invoices } = await supabase
        .from("finance_standalone_invoices")
        .select("id, invoice_number, total, currency, status, due_date, recipient_name")
        .eq("foundry_id", ctx.foundryId)
        .order("created_at", { ascending: false })
        .limit(20)

    // Funding opportunities
    const { data: funding } = await supabase
        .from("finance_funding_opportunities")
        .select("id, name, type, stage, amount, currency, funder_name, deadline, probability_pct")
        .eq("foundry_id", ctx.foundryId)
        .order("created_at", { ascending: false })
        .limit(10)

    let md = `## Financial Overview\n\n`

    // Company profile
    if (foundry) {
        md += `### Company Profile\n\n`
        md += `| Attribute | Value |\n|-----------|-------|\n`
        md += `| Company | ${foundry.name ?? "—"} |\n`
        md += `| Revenue range | ${foundry.revenue_range ?? "—"} |\n`
        md += `| Team size | ${foundry.team_size ?? "—"} |\n`
        md += `| Funding stage | ${foundry.funding_stage ?? "—"} |\n`
        md += `| Sector | ${foundry.sector ?? "—"} |\n`
        md += `| Currency | ${foundry.currency ?? "USD"} |\n`
        md += "\n"
    }

    // Expenses summary
    if (expenses && expenses.length > 0) {
        const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0)
        const byCategory: Record<string, number> = {}
        for (const e of expenses) {
            const cat = e.category ?? "Uncategorized"
            byCategory[cat] = (byCategory[cat] ?? 0) + (e.amount ?? 0)
        }

        md += `### Expenses (Last 90 days)\n\n`
        md += `**Total:** ${totalExpenses.toLocaleString()} ${expenses[0]?.currency ?? "USD"}\n\n`
        md += `| Category | Amount |\n|----------|--------|\n`
        for (const [cat, amt] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
            md += `| ${cat} | ${amt.toLocaleString()} |\n`
        }
        md += "\n"
    } else {
        md += `### Expenses\nNo expenses recorded in the last 90 days.\n\n`
    }

    // Budgets
    if (budgets && budgets.length > 0) {
        md += `### Active Budgets\n\n`
        md += `| Budget | Category | Amount | Period |\n|--------|----------|--------|--------|\n`
        for (const b of budgets) {
            md += `| ${b.name} | ${b.category} | ${b.amount.toLocaleString()} ${b.currency} | ${b.period} |\n`
        }
        md += "\n"
    }

    // Invoices
    if (invoices && invoices.length > 0) {
        const totalInvoiced = invoices.reduce((sum, i) => sum + (i.total ?? 0), 0)
        const statusDist: Record<string, number> = {}
        for (const i of invoices) {
            const s = i.status ?? "unknown"
            statusDist[s] = (statusDist[s] ?? 0) + 1
        }

        md += `### Recent Invoices\n\n`
        md += `**Total invoiced:** ${totalInvoiced.toLocaleString()} | `
        md += `**Status:** ${Object.entries(statusDist).map(([s, c]) => `${s}: ${c}`).join(", ")}\n\n`
        md += `| # | Recipient | Total | Status | Due |\n|---|-----------|-------|--------|-----|\n`
        for (const i of invoices.slice(0, 10)) {
            md += `| ${i.invoice_number} | ${i.recipient_name ?? "—"} | ${i.total?.toLocaleString() ?? "—"} ${i.currency} | ${i.status} | ${i.due_date ?? "—"} |\n`
        }
        md += "\n"
    }

    // Funding pipeline
    if (funding && funding.length > 0) {
        md += `### Funding Pipeline\n\n`
        md += `| Opportunity | Type | Stage | Amount | Funder | Probability |\n|-------------|------|-------|--------|--------|-------------|\n`
        for (const f of funding) {
            md += `| ${f.name} | ${f.type} | ${f.stage} | ${f.amount?.toLocaleString() ?? "—"} ${f.currency} | ${f.funder_name ?? "—"} | ${f.probability_pct ?? "—"}% |\n`
        }
        md += "\n"
    }

    return md
}
