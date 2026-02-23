/**
 * @file common.ts — Tool handlers available to all specialists.
 *
 * @description Implements query_objectives, query_tasks, query_team_members,
 * and query_activity_metrics. All handlers receive foundryId for tenant isolation,
 * query Supabase, and return formatted markdown (tables/lists).
 *
 * @security All queries filter by foundry_id. Read-only — no data modification.
 *
 * @related
 * - Tool definitions: src/lib/agents/tools/definitions.ts
 * - Tool registry: src/lib/agents/tools/registry.ts
 * - Database types: src/types/database.types.ts
 */

import { createAdminClient } from "@/lib/supabase/admin"

// ─── Types ───────────────────────────────────────────────────────────

export interface ToolHandlerContext {
    foundryId: string
}

export type ToolHandler = (
    args: Record<string, unknown>,
    ctx: ToolHandlerContext,
) => Promise<string>

// ─── Helpers ─────────────────────────────────────────────────────────

/** Format a date string to a human-friendly format, or "—" if null. */
function fmtDate(d: string | null | undefined): string {
    if (!d) return "—"
    try {
        return new Date(d).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        })
    } catch {
        return d
    }
}

/** Truncate text to a max length with ellipsis. */
function truncate(s: string | null | undefined, max: number): string {
    if (!s) return "—"
    return s.length > max ? s.slice(0, max) + "…" : s
}

// ─── query_objectives ────────────────────────────────────────────────

export const handleQueryObjectives: ToolHandler = async (args, ctx) => {
    const supabase = createAdminClient()
    const status = (args.status as string) ?? "active"
    const limit = Math.min((args.limit as number) ?? 20, 50)

    let query = supabase
        .from("objectives")
        .select(
            "id, title, description, status, progress, start_date, end_date, parent_objective_id, is_strategic_goal, created_at",
        )
        .eq("foundry_id", ctx.foundryId)
        .eq("is_ghost", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit)

    if (status !== "all") {
        if (status === "active") {
            query = query.not("status", "eq", "Completed").not("status", "eq", "Archived")
        } else if (status === "completed") {
            query = query.eq("status", "Completed")
        } else if (status === "archived") {
            query = query.eq("status", "Archived")
        }
    }

    const { data, error } = await query

    if (error) return `Error querying objectives: ${error.message}`
    if (!data || data.length === 0) return "No objectives found matching the criteria."

    const strategicGoals = data.filter((o) => o.is_strategic_goal)
    const objectives = data.filter((o) => !o.is_strategic_goal)

    let md = `## Objectives (${data.length} total)\n\n`

    if (strategicGoals.length > 0) {
        md += `### Strategic Goals\n\n`
        md += `| Goal | Status | Progress |\n|------|--------|----------|\n`
        for (const g of strategicGoals) {
            md += `| ${g.title} | ${g.status ?? "—"} | ${g.progress ?? 0}% |\n`
        }
        md += "\n"
    }

    if (objectives.length > 0) {
        md += `### Objectives\n\n`
        md += `| Objective | Status | Progress | Due |\n|-----------|--------|----------|-----|\n`
        for (const o of objectives) {
            md += `| ${truncate(o.title, 60)} | ${o.status ?? "—"} | ${o.progress ?? 0}% | ${fmtDate(o.end_date)} |\n`
        }
    }

    return md
}

// ─── query_tasks ─────────────────────────────────────────────────────

export const handleQueryTasks: ToolHandler = async (args, ctx) => {
    const supabase = createAdminClient()
    const status = (args.status as string) ?? "all"
    const assigneeId = args.assignee_id as string | undefined
    const objectiveId = args.objective_id as string | undefined
    const priority = args.priority as string | undefined
    const limit = Math.min((args.limit as number) ?? 30, 100)

    let query = supabase
        .from("tasks")
        .select(
            "id, title, description, status, progress, risk_level, start_date, end_date, objective_id, assignee_id, created_at",
        )
        .eq("foundry_id", ctx.foundryId)
        .eq("is_ghost", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit)

    if (status !== "all") {
        const statusMap: Record<string, string> = {
            todo: "Not Started",
            in_progress: "In Progress",
            done: "Completed",
            blocked: "Blocked",
        }
        const dbStatus = statusMap[status]
        if (dbStatus) query = query.eq("status", dbStatus)
    }

    if (assigneeId) query = query.eq("assignee_id", assigneeId)
    if (objectiveId) query = query.eq("objective_id", objectiveId)
    if (priority) query = query.eq("risk_level", priority)

    const { data, error } = await query

    if (error) return `Error querying tasks: ${error.message}`
    if (!data || data.length === 0) return "No tasks found matching the criteria."

    // Group by status for readability
    const grouped: Record<string, typeof data> = {}
    for (const t of data) {
        const s = (t.status as string) ?? "Unknown"
        if (!grouped[s]) grouped[s] = []
        grouped[s].push(t)
    }

    let md = `## Tasks (${data.length} total)\n\n`
    for (const [statusName, tasks] of Object.entries(grouped)) {
        md += `### ${statusName} (${tasks.length})\n\n`
        md += `| Task | Risk | Due | Progress |\n|------|------|-----|----------|\n`
        for (const t of tasks) {
            md += `| ${truncate(t.title, 55)} | ${t.risk_level ?? "—"} | ${fmtDate(t.end_date)} | ${t.progress ?? 0}% |\n`
        }
        md += "\n"
    }

    return md
}

// ─── query_team_members ──────────────────────────────────────────────

export const handleQueryTeamMembers: ToolHandler = async (args, ctx) => {
    const supabase = createAdminClient()
    const role = args.role as string | undefined
    const limit = Math.min((args.limit as number) ?? 50, 100)

    let query = supabase
        .from("profiles")
        .select(
            "id, full_name, email, role, headline, expertise_areas, skills, is_active, availability_hours_per_week, created_at",
        )
        .eq("foundry_id", ctx.foundryId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(limit)

    if (role) query = query.eq("role", role)

    // Exclude AI agent profiles from team member queries
    query = query.neq("role", "ai_agent")

    const { data, error } = await query

    if (error) return `Error querying team members: ${error.message}`
    if (!data || data.length === 0) return "No team members found."

    let md = `## Team Members (${data.length})\n\n`
    md += `| Name | Role | Headline | Hours/Week |\n|------|------|----------|------------|\n`
    for (const m of data) {
        md += `| ${m.full_name ?? m.email} | ${m.role ?? "—"} | ${truncate(m.headline, 40)} | ${m.availability_hours_per_week ?? "—"} |\n`
    }

    if (data.length > 0) {
        const roleCounts: Record<string, number> = {}
        for (const m of data) {
            const r = (m.role as string) ?? "unknown"
            roleCounts[r] = (roleCounts[r] ?? 0) + 1
        }
        md += `\n**Breakdown:** ${Object.entries(roleCounts).map(([r, c]) => `${r}: ${c}`).join(", ")}\n`
    }

    return md
}

// ─── query_activity_metrics ──────────────────────────────────────────

export const handleQueryActivityMetrics: ToolHandler = async (args, ctx) => {
    const supabase = createAdminClient()
    const days = Math.min((args.days as number) ?? 7, 90)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // Task stats: count by status
    const { data: tasks, error: taskErr } = await supabase
        .from("tasks")
        .select("id, status, created_at, updated_at")
        .eq("foundry_id", ctx.foundryId)
        .is("deleted_at", null)
        .eq("is_ghost", false)

    if (taskErr) return `Error querying task metrics: ${taskErr.message}`

    const allTasks = tasks ?? []
    const recentTasks = allTasks.filter((t) => t.created_at && t.created_at >= since)
    const recentCompleted = allTasks.filter(
        (t) => t.status === "Completed" && t.updated_at && t.updated_at >= since,
    )
    const overdue = allTasks.filter(
        (t) => t.status !== "Completed" && t.status !== "Archived",
    )

    // Objective stats
    const { data: objs, error: objErr } = await supabase
        .from("objectives")
        .select("id, status, progress")
        .eq("foundry_id", ctx.foundryId)
        .is("deleted_at", null)
        .eq("is_ghost", false)

    if (objErr) return `Error querying objective metrics: ${objErr.message}`

    const allObjs = objs ?? []
    const activeObjs = allObjs.filter(
        (o) => o.status !== "Completed" && o.status !== "Archived",
    )
    const avgProgress =
        activeObjs.length > 0
            ? Math.round(
                  activeObjs.reduce((sum, o) => sum + ((o.progress as number) ?? 0), 0) /
                      activeObjs.length,
              )
            : 0

    // Status distribution
    const statusDist: Record<string, number> = {}
    for (const t of allTasks) {
        const s = (t.status as string) ?? "Unknown"
        statusDist[s] = (statusDist[s] ?? 0) + 1
    }

    let md = `## Activity Metrics (Last ${days} days)\n\n`
    md += `| Metric | Value |\n|--------|-------|\n`
    md += `| Total tasks | ${allTasks.length} |\n`
    md += `| Tasks created (${days}d) | ${recentTasks.length} |\n`
    md += `| Tasks completed (${days}d) | ${recentCompleted.length} |\n`
    md += `| Active objectives | ${activeObjs.length} |\n`
    md += `| Avg objective progress | ${avgProgress}% |\n`
    md += `| Open (not completed) tasks | ${overdue.length} |\n`

    md += `\n### Task Status Distribution\n\n`
    md += `| Status | Count |\n|--------|-------|\n`
    for (const [s, c] of Object.entries(statusDist)) {
        md += `| ${s} | ${c} |\n`
    }

    if (recentCompleted.length > 0 && days > 0) {
        const velocity = (recentCompleted.length / days).toFixed(1)
        md += `\n**Completion velocity:** ${velocity} tasks/day\n`
    }

    return md
}
