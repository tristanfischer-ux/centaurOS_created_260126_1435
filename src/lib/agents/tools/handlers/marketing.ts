/**
 * @file marketing.ts — Marketing-specific tool handlers for Mia (Growth Marketer).
 *
 * @description Implements query_growth_metrics and query_competitor_landscape.
 * Growth metrics surfaces objectives/tasks with marketing keywords and activity trends.
 * Competitor landscape pulls foundry profile for sector/stage positioning context.
 *
 * @security All queries filter by foundry_id. Read-only.
 *
 * @related
 * - Common handlers: src/lib/agents/tools/handlers/common.ts
 * - Tool definitions: src/lib/agents/tools/definitions.ts
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { ToolHandler } from "./common"

const GROWTH_KEYWORDS = [
    "growth", "marketing", "acquisition", "retention", "conversion",
    "campaign", "content", "seo", "social", "brand", "leads", "funnel",
    "cac", "ltv", "churn", "engagement", "traffic", "launch",
]

// ─── query_growth_metrics ────────────────────────────────────────

export const handleQueryGrowthMetrics: ToolHandler = async (args, ctx) => {
    const supabase = createAdminClient()
    const days = Math.min((args.days as number) ?? 30, 90)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // Growth-related objectives (keyword match on title/description)
    const { data: objectives } = await supabase
        .from("objectives")
        .select("id, title, description, status, progress, end_date")
        .eq("foundry_id", ctx.foundryId)
        .eq("is_ghost", false)
        .is("deleted_at", null)
        .not("status", "eq", "Archived")
        .order("created_at", { ascending: false })
        .limit(50)

    const growthObjectives = (objectives ?? []).filter((o) => {
        const text = `${o.title} ${o.description ?? ""}`.toLowerCase()
        return GROWTH_KEYWORDS.some((kw) => text.includes(kw))
    })

    // Growth-related tasks
    const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, status, risk_level, end_date, created_at, updated_at")
        .eq("foundry_id", ctx.foundryId)
        .eq("is_ghost", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200)

    const allTasks = tasks ?? []
    const growthTasks = allTasks.filter((t) => {
        const text = t.title.toLowerCase()
        return GROWTH_KEYWORDS.some((kw) => text.includes(kw))
    })

    // Activity trends: tasks created and completed in period
    const recentCreated = allTasks.filter((t) => t.created_at && t.created_at >= since)
    const recentCompleted = allTasks.filter(
        (t) => t.status === "Completed" && t.updated_at && t.updated_at >= since,
    )

    let md = `## Growth Metrics (Last ${days} days)\n\n`

    md += `### Activity Trends\n\n`
    md += `| Metric | Value |\n|--------|-------|\n`
    md += `| Tasks created (${days}d) | ${recentCreated.length} |\n`
    md += `| Tasks completed (${days}d) | ${recentCompleted.length} |\n`
    md += `| Growth-related objectives | ${growthObjectives.length} |\n`
    md += `| Growth-related tasks | ${growthTasks.length} |\n`

    if (days > 0 && recentCompleted.length > 0) {
        md += `| Completion velocity | ${(recentCompleted.length / days).toFixed(1)} tasks/day |\n`
    }

    if (growthObjectives.length > 0) {
        md += `\n### Growth Objectives\n\n`
        md += `| Objective | Status | Progress | Due |\n|-----------|--------|----------|-----|\n`
        for (const o of growthObjectives.slice(0, 15)) {
            const title = o.title.length > 55 ? o.title.slice(0, 55) + "…" : o.title
            md += `| ${title} | ${o.status ?? "—"} | ${o.progress ?? 0}% | ${o.end_date ?? "—"} |\n`
        }
    }

    if (growthTasks.length > 0) {
        // Group by status
        const statusGroups: Record<string, typeof growthTasks> = {}
        for (const t of growthTasks) {
            const s = (t.status as string) ?? "Unknown"
            if (!statusGroups[s]) statusGroups[s] = []
            statusGroups[s].push(t)
        }

        md += `\n### Growth Tasks by Status\n\n`
        md += `| Status | Count |\n|--------|-------|\n`
        for (const [s, items] of Object.entries(statusGroups)) {
            md += `| ${s} | ${items.length} |\n`
        }
    }

    if (growthObjectives.length === 0 && growthTasks.length === 0) {
        md += `\nNo growth/marketing-specific objectives or tasks found. Consider creating marketing-focused objectives to track growth initiatives.\n`
    }

    return md
}

// ─── query_competitor_landscape ──────────────────────────────────

export const handleQueryCompetitorLandscape: ToolHandler = async (_args, ctx) => {
    const supabase = createAdminClient()

    // Foundry profile for sector/stage context
    const { data: foundry } = await supabase
        .from("foundries")
        .select("name, sector, funding_stage, revenue_range, team_size, purpose, currency")
        .eq("id", ctx.foundryId)
        .single()

    // Strategic goals for competitive positioning
    const { data: goals } = await supabase
        .from("objectives")
        .select("id, title, description, status, progress")
        .eq("foundry_id", ctx.foundryId)
        .eq("is_strategic_goal", true)
        .eq("is_ghost", false)
        .is("deleted_at", null)
        .not("status", "eq", "Archived")
        .order("created_at", { ascending: false })
        .limit(10)

    let md = `## Competitive Landscape Context\n\n`

    if (foundry) {
        md += `### Company Profile\n\n`
        md += `| Attribute | Value |\n|-----------|-------|\n`
        md += `| Company | ${foundry.name ?? "—"} |\n`
        md += `| Sector | ${foundry.sector ?? "—"} |\n`
        md += `| Funding stage | ${foundry.funding_stage ?? "—"} |\n`
        md += `| Revenue range | ${foundry.revenue_range ?? "—"} |\n`
        md += `| Team size | ${foundry.team_size ?? "—"} |\n`
        if (foundry.purpose) {
            md += `\n**Company Purpose:** ${foundry.purpose}\n`
        }
    }

    if (goals && goals.length > 0) {
        md += `\n### Strategic Goals (Competitive Positioning)\n\n`
        md += `| Goal | Status | Progress |\n|------|--------|----------|\n`
        for (const g of goals) {
            const title = g.title.length > 55 ? g.title.slice(0, 55) + "…" : g.title
            md += `| ${title} | ${g.status ?? "—"} | ${g.progress ?? 0}% |\n`
        }
        md += "\n"

        // Surface any goals with competitive keywords
        const competitiveGoals = goals.filter((g) => {
            const text = `${g.title} ${g.description ?? ""}`.toLowerCase()
            return ["competitor", "market share", "differentiat", "positioning", "competitive"].some((kw) => text.includes(kw))
        })

        if (competitiveGoals.length > 0) {
            md += `### Explicitly Competitive Goals\n\n`
            for (const g of competitiveGoals) {
                md += `- **${g.title}** (${g.progress ?? 0}%): ${g.description ? g.description.slice(0, 200) : "—"}\n`
            }
        }
    }

    return md
}
