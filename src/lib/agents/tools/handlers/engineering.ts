/**
 * @file engineering.ts — Engineering-specific tool handlers for Jian (VP Engineering).
 *
 * @description Implements query_engineering_metrics which provides sprint velocity,
 * task completion trends, and engineering health metrics.
 *
 * @security All queries filter by foundry_id. Read-only.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { ToolHandler } from "./common"

// ─── query_engineering_metrics ───────────────────────────────────────

export const handleQueryEngineeringMetrics: ToolHandler = async (args, ctx) => {
    const supabase = createAdminClient()
    const days = Math.min((args.days as number) ?? 14, 90)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // All tasks
    const { data: tasks, error } = await supabase
        .from("tasks")
        .select("id, title, status, risk_level, created_at, updated_at, end_date, assignee_id")
        .eq("foundry_id", ctx.foundryId)
        .is("deleted_at", null)
        .eq("is_ghost", false)

    if (error) return `Error querying engineering metrics: ${error.message}`
    const allTasks = tasks ?? []

    // Task status distribution
    const statusCounts: Record<string, number> = {}
    for (const t of allTasks) {
        const s = (t.status as string) ?? "Unknown"
        statusCounts[s] = (statusCounts[s] ?? 0) + 1
    }

    // Created in period
    const createdInPeriod = allTasks.filter((t) => t.created_at && t.created_at >= since)

    // Completed in period
    const completedInPeriod = allTasks.filter(
        (t) => t.status === "Completed" && t.updated_at && t.updated_at >= since,
    )

    // Overdue tasks (end_date in the past, not completed)
    const now = new Date().toISOString()
    const overdue = allTasks.filter(
        (t) =>
            t.end_date &&
            t.end_date < now &&
            t.status !== "Completed" &&
            t.status !== "Archived",
    )

    // Blocked tasks
    const blocked = allTasks.filter((t) => t.status === "Blocked")

    // Velocity: tasks completed per day
    const velocity = days > 0 ? (completedInPeriod.length / days).toFixed(1) : "0"

    // Risk distribution for open tasks
    const openTasks = allTasks.filter(
        (t) => t.status !== "Completed" && t.status !== "Archived",
    )
    const riskCounts: Record<string, number> = {}
    for (const t of openTasks) {
        const r = (t.risk_level as string) ?? "none"
        riskCounts[r] = (riskCounts[r] ?? 0) + 1
    }

    // Assignee workload (top 10)
    const assigneeCounts: Record<string, number> = {}
    for (const t of openTasks) {
        if (t.assignee_id) {
            assigneeCounts[t.assignee_id] = (assigneeCounts[t.assignee_id] ?? 0) + 1
        }
    }

    let md = `## Engineering Metrics (Last ${days} days)\n\n`

    md += `### Key Metrics\n\n`
    md += `| Metric | Value |\n|--------|-------|\n`
    md += `| Total tasks | ${allTasks.length} |\n`
    md += `| Created (${days}d) | ${createdInPeriod.length} |\n`
    md += `| Completed (${days}d) | ${completedInPeriod.length} |\n`
    md += `| Velocity | ${velocity} tasks/day |\n`
    md += `| Overdue | ${overdue.length} |\n`
    md += `| Blocked | ${blocked.length} |\n`
    md += `| Open (active) | ${openTasks.length} |\n`

    md += `\n### Status Distribution\n\n`
    md += `| Status | Count |\n|--------|-------|\n`
    for (const [s, c] of Object.entries(statusCounts)) {
        md += `| ${s} | ${c} |\n`
    }

    if (Object.keys(riskCounts).length > 0) {
        md += `\n### Open Tasks by Risk Level\n\n`
        md += `| Risk | Count |\n|------|-------|\n`
        for (const [r, c] of Object.entries(riskCounts).sort((a, b) => b[1] - a[1])) {
            md += `| ${r} | ${c} |\n`
        }
    }

    if (overdue.length > 0) {
        md += `\n### Overdue Tasks (${overdue.length})\n\n`
        md += `| Task | Due Date | Risk |\n|------|----------|------|\n`
        for (const t of overdue.slice(0, 10)) {
            md += `| ${t.title.length > 50 ? t.title.slice(0, 50) + "…" : t.title} | ${t.end_date ?? "—"} | ${t.risk_level ?? "—"} |\n`
        }
    }

    return md
}
