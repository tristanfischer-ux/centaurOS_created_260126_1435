/**
 * @file marketplace.ts — Marketplace-aware tool handler for Sales, Growth, and Supply Chain specialists.
 *
 * @description Implements query_marketplace which surfaces sales pipeline, market positioning,
 * or supply capacity data depending on the requested focus. Uses the same foundry-scoped
 * tables as finance and marketing handlers but slices for marketplace-relevant insights.
 *
 * @security All queries filter by foundry_id. Read-only.
 *
 * @related
 * - Finance handler: src/lib/agents/tools/handlers/finance.ts
 * - Marketing handler: src/lib/agents/tools/handlers/marketing.ts
 * - Tool definitions: src/lib/agents/tools/definitions.ts (TOOL_QUERY_MARKETPLACE)
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { ToolHandler } from "./common"

type MarketplaceFocus = "sales_pipeline" | "market_positioning" | "supply_capacity"

// ─── query_marketplace ───────────────────────────────────────────

export const handleQueryMarketplace: ToolHandler = async (args, ctx) => {
    const focus = (args.focus as MarketplaceFocus) ?? "sales_pipeline"
    const supabase = createAdminClient()

    switch (focus) {
        case "sales_pipeline":
            return buildSalesPipeline(supabase, ctx.foundryId)
        case "market_positioning":
            return buildMarketPositioning(supabase, ctx.foundryId)
        case "supply_capacity":
            return buildSupplyCapacity(supabase, ctx.foundryId)
        default:
            return `Error: Invalid focus "${focus}". Use: sales_pipeline, market_positioning, or supply_capacity.`
    }
}

// ─── Sales Pipeline ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildSalesPipeline(supabase: any, foundryId: string): Promise<string> {
    // Invoices for revenue indicators
    const { data: invoices } = await supabase
        .from("finance_standalone_invoices")
        .select("id, invoice_number, total, currency, status, due_date, recipient_name, created_at")
        .eq("foundry_id", foundryId)
        .order("created_at", { ascending: false })
        .limit(30)

    // Funding opportunities as deal pipeline proxy
    const { data: funding } = await supabase
        .from("finance_funding_opportunities")
        .select("id, name, type, stage, amount, currency, funder_name, deadline, probability_pct")
        .eq("foundry_id", foundryId)
        .order("created_at", { ascending: false })
        .limit(15)

    // Sales-related tasks
    const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, status, risk_level, end_date")
        .eq("foundry_id", foundryId)
        .eq("is_ghost", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200)

    const SALES_KEYWORDS = ["sales", "revenue", "deal", "pipeline", "prospect", "customer", "client", "contract", "close", "proposal", "quote"]
    const salesTasks = (tasks ?? []).filter((t: { title: string }) => {
        const text = t.title.toLowerCase()
        return SALES_KEYWORDS.some((kw) => text.includes(kw))
    })

    let md = `## Sales Pipeline Overview\n\n`

    // Invoice summary
    const allInvoices = invoices ?? []
    if (allInvoices.length > 0) {
        const total = allInvoices.reduce((s: number, i: { total?: number }) => s + (i.total ?? 0), 0)
        const statusDist: Record<string, number> = {}
        for (const i of allInvoices) {
            const s = (i.status as string) ?? "unknown"
            statusDist[s] = (statusDist[s] ?? 0) + 1
        }

        md += `### Revenue Indicators\n\n`
        md += `**Total invoiced:** ${total.toLocaleString()} | `
        md += `**Status:** ${Object.entries(statusDist).map(([s, c]) => `${s}: ${c}`).join(", ")}\n\n`
        md += `| Recipient | Total | Status | Due |\n|-----------|-------|--------|-----|\n`
        for (const i of allInvoices.slice(0, 10)) {
            md += `| ${i.recipient_name ?? "—"} | ${i.total?.toLocaleString() ?? "—"} ${i.currency} | ${i.status} | ${i.due_date ?? "—"} |\n`
        }
        md += "\n"
    } else {
        md += `No invoices found.\n\n`
    }

    // Funding/deal pipeline
    if (funding && funding.length > 0) {
        md += `### Deal Pipeline\n\n`
        md += `| Opportunity | Type | Stage | Amount | Probability |\n|-------------|------|-------|--------|-------------|\n`
        for (const f of funding) {
            md += `| ${f.name} | ${f.type} | ${f.stage} | ${f.amount?.toLocaleString() ?? "—"} ${f.currency} | ${f.probability_pct ?? "—"}% |\n`
        }
        md += "\n"
    }

    // Sales tasks
    if (salesTasks.length > 0) {
        const statusGroups: Record<string, number> = {}
        for (const t of salesTasks) {
            const s = (t.status as string) ?? "Unknown"
            statusGroups[s] = (statusGroups[s] ?? 0) + 1
        }
        md += `### Sales Tasks (${salesTasks.length} total)\n\n`
        md += `| Status | Count |\n|--------|-------|\n`
        for (const [s, c] of Object.entries(statusGroups)) {
            md += `| ${s} | ${c} |\n`
        }
    }

    return md
}

// ─── Market Positioning ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildMarketPositioning(supabase: any, foundryId: string): Promise<string> {
    // Foundry profile
    const { data: foundry } = await supabase
        .from("foundries")
        .select("name, sector, funding_stage, revenue_range, team_size, purpose")
        .eq("id", foundryId)
        .single()

    // Strategic goals for competitive context
    const { data: goals } = await supabase
        .from("objectives")
        .select("id, title, description, status, progress")
        .eq("foundry_id", foundryId)
        .eq("is_strategic_goal", true)
        .eq("is_ghost", false)
        .is("deleted_at", null)
        .not("status", "eq", "Archived")
        .limit(10)

    let md = `## Market Positioning\n\n`

    if (foundry) {
        md += `### Company Profile\n\n`
        md += `| Attribute | Value |\n|-----------|-------|\n`
        md += `| Company | ${foundry.name ?? "—"} |\n`
        md += `| Sector | ${foundry.sector ?? "—"} |\n`
        md += `| Funding stage | ${foundry.funding_stage ?? "—"} |\n`
        md += `| Revenue range | ${foundry.revenue_range ?? "—"} |\n`
        md += `| Team size | ${foundry.team_size ?? "—"} |\n`
        if (foundry.purpose) {
            md += `\n**Purpose:** ${foundry.purpose}\n`
        }
        md += "\n"
    }

    if (goals && goals.length > 0) {
        md += `### Strategic Goals\n\n`
        md += `| Goal | Status | Progress |\n|------|--------|----------|\n`
        for (const g of goals) {
            const title = g.title.length > 55 ? g.title.slice(0, 55) + "…" : g.title
            md += `| ${title} | ${g.status ?? "—"} | ${g.progress ?? 0}% |\n`
        }
    }

    return md
}

// ─── Supply Capacity ────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildSupplyCapacity(supabase: any, foundryId: string): Promise<string> {
    // Team capacity
    const { data: members } = await supabase
        .from("profiles")
        .select("id, full_name, role, department, status")
        .eq("foundry_id", foundryId)
        .limit(100)

    // Supply/manufacturing tasks
    const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, status, risk_level, end_date, updated_at")
        .eq("foundry_id", foundryId)
        .eq("is_ghost", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200)

    const SUPPLY_KEYWORDS = ["supply", "procurement", "vendor", "manufacturing", "inventory", "logistics", "material", "sourcing", "warehouse", "shipping", "capacity"]
    const allTasks = tasks ?? []
    const supplyTasks = allTasks.filter((t: { title: string }) => {
        const text = t.title.toLowerCase()
        return SUPPLY_KEYWORDS.some((kw) => text.includes(kw))
    })

    // Overdue tasks
    const now = new Date().toISOString().split("T")[0]
    const overdueTasks = allTasks.filter(
        (t: { status?: string; end_date?: string }) => t.end_date && t.end_date < now && t.status !== "Completed",
    )

    let md = `## Supply & Capacity Overview\n\n`

    // Team capacity
    const allMembers = members ?? []
    if (allMembers.length > 0) {
        const byRole: Record<string, number> = {}
        for (const m of allMembers) {
            const role = (m.role as string) ?? "Unknown"
            byRole[role] = (byRole[role] ?? 0) + 1
        }
        md += `### Team Capacity (${allMembers.length} members)\n\n`
        md += `| Role | Count |\n|------|-------|\n`
        for (const [r, c] of Object.entries(byRole)) {
            md += `| ${r} | ${c} |\n`
        }
        md += "\n"
    }

    // Supply tasks
    if (supplyTasks.length > 0) {
        const statusGroups: Record<string, number> = {}
        for (const t of supplyTasks) {
            const s = (t.status as string) ?? "Unknown"
            statusGroups[s] = (statusGroups[s] ?? 0) + 1
        }
        md += `### Supply Chain Tasks (${supplyTasks.length} total)\n\n`
        md += `| Status | Count |\n|--------|-------|\n`
        for (const [s, c] of Object.entries(statusGroups)) {
            md += `| ${s} | ${c} |\n`
        }
        md += "\n"
    }

    // Overdue summary
    if (overdueTasks.length > 0) {
        md += `### Overdue Tasks (${overdueTasks.length})\n\n`
        md += `| Task | Due | Risk |\n|------|-----|------|\n`
        for (const t of overdueTasks.slice(0, 15)) {
            const title = t.title.length > 50 ? t.title.slice(0, 50) + "…" : t.title
            md += `| ${title} | ${t.end_date} | ${t.risk_level ?? "—"} |\n`
        }
    }

    if (supplyTasks.length === 0 && overdueTasks.length === 0) {
        md += `No supply chain-specific tasks found.\n`
    }

    return md
}
