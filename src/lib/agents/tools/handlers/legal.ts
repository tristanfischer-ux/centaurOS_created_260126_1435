/**
 * @file legal.ts — Legal-specific tool handlers for Leo (Legal Counsel).
 *
 * @description Implements query_compliance_status and query_contracts_overview.
 * Compliance status surfaces high-risk/urgent/blocked tasks for legal review.
 * Contracts overview pulls invoice history and funding for contract context.
 *
 * @security All queries filter by foundry_id. Read-only.
 *
 * @related
 * - Common handlers: src/lib/agents/tools/handlers/common.ts
 * - Tool definitions: src/lib/agents/tools/definitions.ts
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { ToolHandler } from "./common"

const COMPLIANCE_KEYWORDS = [
    "compliance", "legal", "regulation", "policy", "contract", "agreement",
    "license", "patent", "trademark", "ip", "gdpr", "data protection",
    "risk", "audit", "governance", "terms", "liability", "insurance",
]

// ─── query_compliance_status ─────────────────────────────────────

export const handleQueryComplianceStatus: ToolHandler = async (_args, ctx) => {
    const supabase = createAdminClient()
    const now = new Date().toISOString()

    // High-risk and urgent tasks
    const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, status, risk_level, end_date, created_at, updated_at")
        .eq("foundry_id", ctx.foundryId)
        .eq("is_ghost", false)
        .is("deleted_at", null)
        .not("status", "eq", "Completed")
        .not("status", "eq", "Archived")
        .order("created_at", { ascending: false })
        .limit(200)

    const allTasks = tasks ?? []

    // High-risk tasks
    const highRisk = allTasks.filter(
        (t) => t.risk_level === "high" || t.risk_level === "urgent",
    )

    // Blocked tasks
    const blocked = allTasks.filter((t) => t.status === "Blocked")

    // Overdue tasks
    const overdue = allTasks.filter((t) => t.end_date && t.end_date < now)

    // Compliance-related tasks (keyword match)
    const complianceTasks = allTasks.filter((t) => {
        const text = t.title.toLowerCase()
        return COMPLIANCE_KEYWORDS.some((kw) => text.includes(kw))
    })

    let md = `## Compliance Status\n\n`

    md += `### Risk Summary\n\n`
    md += `| Category | Count |\n|----------|-------|\n`
    md += `| High-risk/Urgent tasks | ${highRisk.length} |\n`
    md += `| Blocked tasks | ${blocked.length} |\n`
    md += `| Overdue tasks | ${overdue.length} |\n`
    md += `| Compliance-related tasks | ${complianceTasks.length} |\n`

    if (highRisk.length > 0) {
        md += `\n### High-Risk / Urgent Tasks\n\n`
        md += `| Task | Risk | Status | Due |\n|------|------|--------|-----|\n`
        for (const t of highRisk.slice(0, 15)) {
            const title = t.title.length > 50 ? t.title.slice(0, 50) + "…" : t.title
            md += `| ${title} | ${t.risk_level ?? "—"} | ${t.status ?? "—"} | ${t.end_date ?? "—"} |\n`
        }
    }

    if (blocked.length > 0) {
        md += `\n### Blocked Items\n\n`
        md += `| Task | Risk | Due |\n|------|------|-----|\n`
        for (const t of blocked.slice(0, 10)) {
            const title = t.title.length > 50 ? t.title.slice(0, 50) + "…" : t.title
            md += `| ${title} | ${t.risk_level ?? "—"} | ${t.end_date ?? "—"} |\n`
        }
    }

    if (overdue.length > 0) {
        md += `\n### Overdue Work\n\n`
        md += `| Task | Due | Risk | Status |\n|------|-----|------|--------|\n`
        for (const t of overdue.slice(0, 10)) {
            const title = t.title.length > 50 ? t.title.slice(0, 50) + "…" : t.title
            md += `| ${title} | ${t.end_date ?? "—"} | ${t.risk_level ?? "—"} | ${t.status ?? "—"} |\n`
        }
    }

    if (complianceTasks.length > 0) {
        md += `\n### Compliance-Related Tasks\n\n`
        md += `| Task | Status | Risk | Due |\n|------|--------|------|-----|\n`
        for (const t of complianceTasks.slice(0, 15)) {
            const title = t.title.length > 50 ? t.title.slice(0, 50) + "…" : t.title
            md += `| ${title} | ${t.status ?? "—"} | ${t.risk_level ?? "—"} | ${t.end_date ?? "—"} |\n`
        }
    }

    return md
}

// ─── query_contracts_overview ────────────────────────────────────

export const handleQueryContractsOverview: ToolHandler = async (_args, ctx) => {
    const supabase = createAdminClient()

    // Invoice history (financial commitments)
    const { data: invoices } = await supabase
        .from("finance_standalone_invoices")
        .select("id, invoice_number, total, currency, status, due_date, recipient_name, created_at")
        .eq("foundry_id", ctx.foundryId)
        .order("created_at", { ascending: false })
        .limit(30)

    // Funding opportunities (financial obligations)
    const { data: funding } = await supabase
        .from("finance_funding_opportunities")
        .select("id, name, type, stage, amount, currency, funder_name, deadline, probability_pct")
        .eq("foundry_id", ctx.foundryId)
        .order("created_at", { ascending: false })
        .limit(15)

    // Recent expenses for contract context
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const { data: expenses } = await supabase
        .from("finance_expenses")
        .select("id, amount, currency, category, description, vendor, status")
        .eq("foundry_id", ctx.foundryId)
        .gte("expense_date", ninetyDaysAgo.split("T")[0])
        .order("expense_date", { ascending: false })
        .limit(30)

    let md = `## Contracts & Financial Commitments Overview\n\n`

    // Invoice summary
    if (invoices && invoices.length > 0) {
        const statusDist: Record<string, number> = {}
        let totalOutstanding = 0
        for (const inv of invoices) {
            const s = (inv.status as string) ?? "unknown"
            statusDist[s] = (statusDist[s] ?? 0) + 1
            if (s !== "paid" && s !== "cancelled") {
                totalOutstanding += (inv.total ?? 0)
            }
        }

        md += `### Invoices (${invoices.length} recent)\n\n`
        md += `**Outstanding total:** ${totalOutstanding.toLocaleString()} | **Status:** ${Object.entries(statusDist).map(([s, c]) => `${s}: ${c}`).join(", ")}\n\n`
        md += `| # | Recipient | Total | Status | Due |\n|---|-----------|-------|--------|-----|\n`
        for (const inv of invoices.slice(0, 15)) {
            md += `| ${inv.invoice_number ?? "—"} | ${inv.recipient_name ?? "—"} | ${inv.total?.toLocaleString() ?? "—"} ${inv.currency ?? ""} | ${inv.status ?? "—"} | ${inv.due_date ?? "—"} |\n`
        }
        md += "\n"
    } else {
        md += `### Invoices\nNo invoices on record.\n\n`
    }

    // Funding pipeline
    if (funding && funding.length > 0) {
        md += `### Funding & Investment Commitments\n\n`
        md += `| Opportunity | Type | Stage | Amount | Funder | Probability |\n|-------------|------|-------|--------|--------|-------------|\n`
        for (const f of funding) {
            md += `| ${f.name} | ${f.type ?? "—"} | ${f.stage ?? "—"} | ${f.amount?.toLocaleString() ?? "—"} ${f.currency ?? ""} | ${f.funder_name ?? "—"} | ${f.probability_pct ?? "—"}% |\n`
        }
        md += "\n"
    }

    // Vendor relationships from expenses
    if (expenses && expenses.length > 0) {
        const vendorTotals: Record<string, number> = {}
        for (const e of expenses) {
            const vendor = (e.vendor as string) ?? "Unknown"
            vendorTotals[vendor] = (vendorTotals[vendor] ?? 0) + (e.amount ?? 0)
        }
        const topVendors = Object.entries(vendorTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)

        if (topVendors.length > 0) {
            md += `### Top Vendors (90-day spend)\n\n`
            md += `| Vendor | Total Spend |\n|--------|-------------|\n`
            for (const [vendor, total] of topVendors) {
                md += `| ${vendor} | ${total.toLocaleString()} |\n`
            }
        }
    }

    return md
}
