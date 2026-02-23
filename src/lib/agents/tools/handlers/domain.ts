/**
 * @file domain.ts — Domain-specific tool handlers for Product, People, and Strategy specialists.
 *
 * @description Implements query_product_roadmap, query_team_overview, and
 * query_strategic_goals. Each queries Supabase with foundry isolation.
 *
 * @security All queries filter by foundry_id. Read-only.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { ToolHandler } from "./common"

// ─── query_product_roadmap ───────────────────────────────────────────

export const handleQueryProductRoadmap: ToolHandler = async (args, ctx) => {
    const supabase = createAdminClient()
    const includeCompleted = (args.include_completed as boolean) ?? false

    let query = supabase
        .from("objectives")
        .select("id, title, description, status, progress, end_date, parent_objective_id")
        .eq("foundry_id", ctx.foundryId)
        .eq("is_ghost", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(30)

    if (!includeCompleted) {
        query = query.not("status", "eq", "Completed").not("status", "eq", "Archived")
    }

    const { data: objectives, error: objErr } = await query
    if (objErr) return `Error querying product roadmap: ${objErr.message}`

    if (!objectives || objectives.length === 0) return "No active objectives found for the product roadmap."

    // Fetch tasks for these objectives
    const objIds = objectives.map((o) => o.id)
    const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, status, objective_id, end_date, risk_level")
        .eq("foundry_id", ctx.foundryId)
        .in("objective_id", objIds)
        .is("deleted_at", null)
        .eq("is_ghost", false)
        .limit(200)

    const tasksByObj: Record<string, typeof tasks> = {}
    for (const t of tasks ?? []) {
        if (!tasksByObj[t.objective_id]) tasksByObj[t.objective_id] = []
        tasksByObj[t.objective_id]!.push(t)
    }

    let md = `## Product Roadmap\n\n`
    for (const obj of objectives) {
        const objTasks = tasksByObj[obj.id] ?? []
        const completed = objTasks.filter((t) => t.status === "Completed").length
        md += `### ${obj.title}\n`
        md += `**Status:** ${obj.status ?? "—"} | **Progress:** ${obj.progress ?? 0}% | **Due:** ${obj.end_date ?? "—"} | **Tasks:** ${completed}/${objTasks.length} done\n\n`

        if (objTasks.length > 0) {
            md += `| Task | Status | Due | Risk |\n|------|--------|-----|------|\n`
            for (const t of objTasks.slice(0, 10)) {
                md += `| ${t.title.length > 50 ? t.title.slice(0, 50) + "…" : t.title} | ${t.status ?? "—"} | ${t.end_date ?? "—"} | ${t.risk_level ?? "—"} |\n`
            }
            if (objTasks.length > 10) {
                md += `| *(${objTasks.length - 10} more tasks)* | | | |\n`
            }
            md += "\n"
        }
    }

    return md
}

// ─── query_team_overview ─────────────────────────────────────────────

export const handleQueryTeamOverview: ToolHandler = async (_args, ctx) => {
    const supabase = createAdminClient()

    const { data: members, error } = await supabase
        .from("profiles")
        .select(
            "id, full_name, email, role, headline, expertise_areas, skills, is_active, availability_hours_per_week, availability_type, created_at",
        )
        .eq("foundry_id", ctx.foundryId)
        .eq("is_active", true)
        .neq("role", "ai_agent")
        .order("created_at", { ascending: true })
        .limit(100)

    if (error) return `Error querying team overview: ${error.message}`
    if (!members || members.length === 0) return "No team members found."

    // Role distribution
    const roleCounts: Record<string, number> = {}
    for (const m of members) {
        const r = (m.role as string) ?? "unknown"
        roleCounts[r] = (roleCounts[r] ?? 0) + 1
    }

    // Availability summary
    const totalHours = members.reduce(
        (sum, m) => sum + ((m.availability_hours_per_week as number) ?? 0),
        0,
    )

    // Recent joins (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const recentJoins = members.filter((m) => m.created_at && m.created_at >= thirtyDaysAgo)

    // Expertise aggregation
    const expertiseCounts: Record<string, number> = {}
    for (const m of members) {
        if (Array.isArray(m.expertise_areas)) {
            for (const e of m.expertise_areas) {
                expertiseCounts[e] = (expertiseCounts[e] ?? 0) + 1
            }
        }
    }

    let md = `## Team Overview (${members.length} members)\n\n`

    md += `### Summary\n\n`
    md += `| Metric | Value |\n|--------|-------|\n`
    md += `| Total members | ${members.length} |\n`
    md += `| Total weekly hours | ${totalHours} |\n`
    md += `| Recent joins (30d) | ${recentJoins.length} |\n`

    md += `\n### Role Distribution\n\n`
    md += `| Role | Count |\n|------|-------|\n`
    for (const [r, c] of Object.entries(roleCounts).sort((a, b) => b[1] - a[1])) {
        md += `| ${r} | ${c} |\n`
    }

    if (Object.keys(expertiseCounts).length > 0) {
        const topExpertise = Object.entries(expertiseCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
        md += `\n### Top Expertise Areas\n\n`
        md += `| Expertise | Members |\n|-----------|----------|\n`
        for (const [e, c] of topExpertise) {
            md += `| ${e} | ${c} |\n`
        }
    }

    md += `\n### All Members\n\n`
    md += `| Name | Role | Headline | Hours/Week |\n|------|------|----------|------------|\n`
    for (const m of members) {
        const name = m.full_name ?? m.email
        const headline = m.headline ? (m.headline.length > 35 ? m.headline.slice(0, 35) + "…" : m.headline) : "—"
        md += `| ${name} | ${m.role ?? "—"} | ${headline} | ${m.availability_hours_per_week ?? "—"} |\n`
    }

    return md
}

// ─── query_strategic_goals ───────────────────────────────────────────

export const handleQueryStrategicGoals: ToolHandler = async (args, ctx) => {
    const supabase = createAdminClient()
    const includeArchived = (args.include_archived as boolean) ?? false

    // Fetch strategic goals
    let goalQuery = supabase
        .from("objectives")
        .select("id, title, description, status, progress, created_at")
        .eq("foundry_id", ctx.foundryId)
        .eq("is_strategic_goal", true)
        .eq("is_ghost", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20)

    if (!includeArchived) {
        goalQuery = goalQuery.not("status", "eq", "Archived")
    }

    const { data: goals, error: goalErr } = await goalQuery
    if (goalErr) return `Error querying strategic goals: ${goalErr.message}`
    if (!goals || goals.length === 0) return "No strategic goals found."

    // Fetch child objectives for each goal
    const goalIds = goals.map((g) => g.id)
    const { data: childObjs } = await supabase
        .from("objectives")
        .select("id, title, status, progress, parent_objective_id")
        .eq("foundry_id", ctx.foundryId)
        .in("parent_objective_id", goalIds)
        .eq("is_ghost", false)
        .is("deleted_at", null)
        .limit(200)

    const childByParent: Record<string, typeof childObjs> = {}
    for (const c of childObjs ?? []) {
        const pid = c.parent_objective_id as string
        if (!childByParent[pid]) childByParent[pid] = []
        childByParent[pid]!.push(c)
    }

    let md = `## Strategic Goals (${goals.length})\n\n`

    for (const goal of goals) {
        const children = childByParent[goal.id] ?? []
        const completedChildren = children.filter((c) => c.status === "Completed")
        md += `### ${goal.title}\n`
        md += `**Status:** ${goal.status ?? "—"} | **Progress:** ${goal.progress ?? 0}% | **Objectives:** ${completedChildren.length}/${children.length} completed\n`

        if (goal.description) {
            md += `\n${goal.description.length > 200 ? goal.description.slice(0, 200) + "…" : goal.description}\n`
        }

        if (children.length > 0) {
            md += `\n| Objective | Status | Progress |\n|-----------|--------|----------|\n`
            for (const c of children) {
                md += `| ${c.title.length > 50 ? c.title.slice(0, 50) + "…" : c.title} | ${c.status ?? "—"} | ${c.progress ?? 0}% |\n`
            }
        }
        md += "\n"
    }

    return md
}
