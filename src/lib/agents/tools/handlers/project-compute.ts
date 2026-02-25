/**
 * @file project-compute.ts — Strategic planning computation tools.
 *
 * @description Provides real computation tools for project and objective analysis.
 * Analyzes task dependencies to find critical paths, detects workload imbalances,
 * and predicts completion dates from actual velocity data.
 *
 * INTENT: When the strategist says "we'll finish the MVP by March", that date
 * should be derived from task dependency chains and actual completion velocity —
 * not from optimism bias. These handlers compute real answers from task data.
 *
 * @security All queries filter by foundry_id. Read-only.
 *
 * @related
 * - Common handlers: src/lib/agents/tools/handlers/common.ts
 * - Finance compute pattern: src/lib/agents/tools/handlers/finance-compute.ts
 * - Tool definitions: src/lib/agents/tools/definitions.ts
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { ToolHandler } from "./common"

// ─── analyze_critical_path ──────────────────────────────────────────

/**
 * Builds a dependency graph from tasks, finds the critical path (longest chain),
 * and identifies bottleneck tasks with zero slack.
 */
export const handleAnalyzeCriticalPath: ToolHandler = async (args, ctx) => {
    const objectiveId = args.objective_id as string | undefined
    const supabase = createAdminClient()

    // Fetch non-completed tasks (exclude terminal statuses dynamically)
    let taskQuery = supabase
        .from("tasks")
        .select("id, title, status, start_date, end_date, assignee_id, objective_id, progress")
        .eq("foundry_id", ctx.foundryId)
        .is("deleted_at", null)
        .not("status", "eq", "Completed")
        .not("status", "eq", "Rejected")

    if (objectiveId) {
        taskQuery = taskQuery.eq("objective_id", objectiveId)
    }

    const [tasksRes, depsRes] = await Promise.all([
        taskQuery.limit(200),
        supabase
            .from("task_dependencies")
            .select("task_id, depends_on_task_id, dependency_type")
            .eq("foundry_id", ctx.foundryId),
    ])

    if (tasksRes.error) {
        return `## Critical Path Analysis\n\nError fetching tasks: ${tasksRes.error.message}`
    }
    if (depsRes.error) {
        return `## Critical Path Analysis\n\nError fetching dependencies: ${depsRes.error.message}`
    }

    const tasks = tasksRes.data ?? []
    const deps = depsRes.data ?? []

    if (tasks.length === 0) {
        return "## Critical Path Analysis\n\nNo tasks found. Create tasks with dependencies to enable critical path analysis."
    }

    // Build adjacency list (depends_on_task_id → task_id means task depends on depends_on)
    const taskMap = new Map(tasks.map((t) => [t.id, t]))
    const dependsOn = new Map<string, string[]>() // task_id → [prerequisite task_ids]
    const blocksWhat = new Map<string, string[]>() // task_id → [tasks it blocks]

    for (const d of deps) {
        if (!taskMap.has(d.task_id) || !taskMap.has(d.depends_on_task_id)) continue
        const existing = dependsOn.get(d.task_id) ?? []
        existing.push(d.depends_on_task_id)
        dependsOn.set(d.task_id, existing)

        const blocking = blocksWhat.get(d.depends_on_task_id) ?? []
        blocking.push(d.task_id)
        blocksWhat.set(d.depends_on_task_id, blocking)
    }

    // Estimate task duration in days (from dates or default)
    function estimateDuration(t: typeof tasks[0]): number {
        if (t.start_date && t.end_date) {
            const diff = new Date(t.end_date).getTime() - new Date(t.start_date).getTime()
            return Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)))
        }
        return 5 // default 5 days if no dates
    }

    // Compute earliest start/finish using topological order
    const duration = new Map<string, number>()
    const earliestStart = new Map<string, number>()
    const earliestFinish = new Map<string, number>()

    for (const t of tasks) {
        duration.set(t.id, estimateDuration(t))
    }

    // Topological sort (Kahn's algorithm)
    const inDegree = new Map<string, number>()
    for (const t of tasks) inDegree.set(t.id, 0)
    for (const [taskId, prereqs] of dependsOn) {
        inDegree.set(taskId, (inDegree.get(taskId) ?? 0) + prereqs.length)
    }

    const queue: string[] = []
    for (const [id, deg] of inDegree) {
        if (deg === 0) queue.push(id)
    }

    const topoOrder: string[] = []
    while (queue.length > 0) {
        const current = queue.shift()!
        topoOrder.push(current)

        const blocked = blocksWhat.get(current) ?? []
        for (const next of blocked) {
            const newDeg = (inDegree.get(next) ?? 1) - 1
            inDegree.set(next, newDeg)
            if (newDeg === 0) queue.push(next)
        }
    }

    // Forward pass: compute earliest start/finish
    for (const id of topoOrder) {
        const prereqs = dependsOn.get(id) ?? []
        const es = prereqs.length > 0
            ? Math.max(...prereqs.map((p) => earliestFinish.get(p) ?? 0))
            : 0
        earliestStart.set(id, es)
        earliestFinish.set(id, es + (duration.get(id) ?? 5))
    }

    // Find total project duration
    const totalDuration = Math.max(...[...earliestFinish.values()], 0)

    // Backward pass: compute latest start/finish and slack
    const latestFinish = new Map<string, number>()
    const latestStart = new Map<string, number>()
    const slack = new Map<string, number>()

    for (const id of [...topoOrder].reverse()) {
        const blocked = blocksWhat.get(id) ?? []
        const lf = blocked.length > 0
            ? Math.min(...blocked.map((b) => latestStart.get(b) ?? totalDuration))
            : totalDuration
        latestFinish.set(id, lf)
        latestStart.set(id, lf - (duration.get(id) ?? 5))
        // GOTCHA: Slack can go negative if there are circular deps or data inconsistencies.
        // Clamp to 0 — negative slack means "already late", which we flag separately.
        slack.set(id, Math.max(0, lf - (earliestFinish.get(id) ?? 0)))
    }

    // Critical path = tasks with zero slack
    const criticalTasks = topoOrder.filter((id) => (slack.get(id) ?? 0) === 0)

    // Status counts
    const statusCounts: Record<string, number> = {}
    for (const t of tasks) {
        const s = t.status ?? "Pending"
        statusCounts[s] = (statusCounts[s] ?? 0) + 1
    }

    let md = `## Critical Path Analysis\n\n`
    md += `### Summary\n\n`
    md += `| Metric | Value |\n|--------|-------|\n`
    md += `| Total tasks | ${tasks.length} |\n`
    md += `| Dependencies tracked | ${deps.length} |\n`
    md += `| Estimated project duration | ${totalDuration} days |\n`
    md += `| Critical path tasks | ${criticalTasks.length} |\n`
    md += `| Status breakdown | ${Object.entries(statusCounts).map(([s, c]) => `${s}: ${c}`).join(", ")} |\n`
    md += "\n"

    if (criticalTasks.length > 0) {
        md += `### Critical Path (zero slack — any delay here delays the project)\n\n`
        md += `| # | Task | Status | Duration (days) | Earliest Start (day) | Assignee |\n`
        md += `|---|------|--------|-----------------|---------------------|----------|\n`
        for (let i = 0; i < criticalTasks.length; i++) {
            const t = taskMap.get(criticalTasks[i])!
            md += `| ${i + 1} | ${t.title} | ${t.status ?? "Pending"} | ${duration.get(t.id) ?? 5} | Day ${earliestStart.get(t.id) ?? 0} | ${t.assignee_id ? "Assigned" : "Unassigned"} |\n`
        }
        md += "\n"
    }

    // Tasks with most slack (can be deprioritized)
    const nonCritical = topoOrder
        .filter((id) => (slack.get(id) ?? 0) > 0)
        .sort((a, b) => (slack.get(b) ?? 0) - (slack.get(a) ?? 0))
        .slice(0, 10)

    if (nonCritical.length > 0) {
        md += `### Tasks with Most Slack (can absorb delays)\n\n`
        md += `| Task | Slack (days) | Status |\n|------|-------------|--------|\n`
        for (const id of nonCritical) {
            const t = taskMap.get(id)!
            md += `| ${t.title} | ${slack.get(id) ?? 0} days | ${t.status ?? "Pending"} |\n`
        }
        md += "\n"
    }

    // Bottleneck detection: tasks that block the most other tasks
    const blockingCounts = [...blocksWhat.entries()]
        .map(([id, blocked]) => ({ id, count: blocked.length }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

    if (blockingCounts.length > 0 && blockingCounts[0].count > 1) {
        md += `### Bottleneck Tasks (blocking multiple downstream tasks)\n\n`
        md += `| Task | Blocks # Tasks | Status |\n|------|---------------|--------|\n`
        for (const b of blockingCounts) {
            const t = taskMap.get(b.id)
            if (t) {
                md += `| ${t.title} | ${b.count} | ${t.status ?? "Pending"} |\n`
            }
        }
        md += "\n"
    }

    return md
}

// ─── analyze_workload ───────────────────────────────────────────────

/**
 * Analyzes task distribution across team members to identify
 * overallocation and unassigned work.
 */
export const handleAnalyzeWorkload: ToolHandler = async (_args, ctx) => {
    const supabase = createAdminClient()

    // Fetch non-terminal tasks (exclude Completed and Rejected dynamically
    // rather than hardcoding all active status names)
    const [tasksRes, profilesRes] = await Promise.all([
        supabase
            .from("tasks")
            .select("id, title, status, assignee_id, start_date, end_date, objective_id")
            .eq("foundry_id", ctx.foundryId)
            .is("deleted_at", null)
            .not("status", "eq", "Completed")
            .not("status", "eq", "Rejected")
            .limit(300),
        supabase
            .from("profiles")
            .select("id, first_name, last_name, role")
            .eq("foundry_id", ctx.foundryId)
            .limit(100),
    ])

    if (tasksRes.error) {
        return `## Workload Analysis\n\nError fetching tasks: ${tasksRes.error.message}`
    }
    if (profilesRes.error) {
        return `## Workload Analysis\n\nError fetching profiles: ${profilesRes.error.message}`
    }

    const tasks = tasksRes.data ?? []
    const profiles = profilesRes.data ?? []

    if (tasks.length === 0) {
        return "## Workload Analysis\n\nNo active tasks found."
    }

    const profileMap = new Map(profiles.map((p) => [p.id, p]))

    // Aggregate by assignee
    const workload: Record<string, { name: string; role: string; tasks: typeof tasks }> = {}
    let unassignedCount = 0

    for (const t of tasks) {
        if (!t.assignee_id) {
            unassignedCount++
            continue
        }
        if (!workload[t.assignee_id]) {
            const p = profileMap.get(t.assignee_id)
            workload[t.assignee_id] = {
                name: p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "Unknown",
                role: p?.role ?? "—",
                tasks: [],
            }
        }
        workload[t.assignee_id].tasks.push(t)
    }

    // Sort by task count descending
    const sorted = Object.entries(workload).sort((a, b) => b[1].tasks.length - a[1].tasks.length)

    const avgLoad = sorted.length > 0
        ? sorted.reduce((s, [, w]) => s + w.tasks.length, 0) / sorted.length
        : 0

    let md = `## Workload Analysis\n\n`
    md += `### Summary\n\n`
    md += `| Metric | Value |\n|--------|-------|\n`
    md += `| Total active tasks | ${tasks.length} |\n`
    md += `| Assigned | ${tasks.length - unassignedCount} |\n`
    md += `| Unassigned | ${unassignedCount} |\n`
    md += `| Team members with tasks | ${sorted.length} |\n`
    md += `| Average tasks per person | ${avgLoad.toFixed(1)} |\n`
    md += "\n"

    // Workload table
    md += `### Task Distribution\n\n`
    md += `| Team Member | Role | Active Tasks | Status |\n`
    md += `|-------------|------|-------------|--------|\n`

    for (const [, w] of sorted) {
        const ratio = avgLoad > 0 ? w.tasks.length / avgLoad : 0
        let status: string
        if (ratio >= 1.5) {
            status = "**Overloaded** (50%+ above average)"
        } else if (ratio >= 1.2) {
            status = "Heavy load"
        } else if (ratio <= 0.5 && avgLoad > 2) {
            status = "Light — has capacity"
        } else {
            status = "Balanced"
        }

        // Status breakdown for this person
        const statusMap: Record<string, number> = {}
        for (const t of w.tasks) {
            const s = t.status ?? "Pending"
            statusMap[s] = (statusMap[s] ?? 0) + 1
        }
        const statusSummary = Object.entries(statusMap).map(([s, c]) => `${s}: ${c}`).join(", ")

        md += `| ${w.name} | ${w.role} | ${w.tasks.length} (${statusSummary}) | ${status} |\n`
    }
    md += "\n"

    if (unassignedCount > 0) {
        md += `### Unassigned Tasks (${unassignedCount})\n\n`
        md += `These tasks need owners:\n\n`
        const unassigned = tasks.filter((t) => !t.assignee_id).slice(0, 15)
        md += `| Task | Status |\n|------|--------|\n`
        for (const t of unassigned) {
            md += `| ${t.title} | ${t.status ?? "Pending"} |\n`
        }
        if (unassignedCount > 15) {
            md += `| ...and ${unassignedCount - 15} more | |\n`
        }
        md += "\n"
    }

    // Chart: tasks per person
    const chartData = sorted.slice(0, 10).map(([, w]) => ({
        label: w.name.split(" ")[0] || "Unknown",
        value: w.tasks.length,
    }))
    if (unassignedCount > 0) {
        chartData.push({ label: "Unassigned", value: unassignedCount })
    }
    md += `\n<!-- CHART ${JSON.stringify({
        type: "bar",
        title: "Task Distribution by Team Member",
        data: chartData,
        xLabel: "Team Member",
        yLabel: "Active Tasks",
    })} -->`

    return md
}

// ─── predict_completion ─────────────────────────────────────────────

/**
 * Predicts objective completion dates based on actual task completion velocity.
 * Uses rolling completion rate to extrapolate when remaining tasks will be done.
 */
export const handlePredictCompletion: ToolHandler = async (args, ctx) => {
    const objectiveId = args.objective_id as string | undefined
    const supabase = createAdminClient()

    // Fetch objectives
    let objQuery = supabase
        .from("objectives")
        .select("id, title, progress, status, target_date")
        .eq("foundry_id", ctx.foundryId)

    if (objectiveId) {
        objQuery = objQuery.eq("id", objectiveId)
    } else {
        objQuery = objQuery.in("status", ["active", "in_progress"])
    }

    const { data: objectives, error: objError } = await objQuery.limit(20)

    if (objError) {
        return `## Completion Prediction\n\nError fetching objectives: ${objError.message}`
    }

    if (!objectives || objectives.length === 0) {
        return "## Completion Prediction\n\nNo active objectives found."
    }

    // Fetch all tasks for these objectives
    const objIds = objectives.map((o) => o.id)
    const { data: allTasks, error: taskError } = await supabase
        .from("tasks")
        .select("id, status, objective_id, created_at, updated_at")
        .eq("foundry_id", ctx.foundryId)
        .is("deleted_at", null)
        .in("objective_id", objIds)
        .limit(500)

    if (taskError) {
        return `## Completion Prediction\n\nError fetching tasks: ${taskError.message}`
    }

    const tasks = allTasks ?? []

    // Count recently completed tasks for velocity (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const recentlyCompleted = tasks.filter(
        (t) => t.status === "Completed" && t.updated_at && t.updated_at >= thirtyDaysAgo,
    )
    const dailyVelocity = recentlyCompleted.length / 30

    let md = `## Completion Prediction\n\n`
    md += `### Velocity\n\n`
    md += `| Metric | Value |\n|--------|-------|\n`
    md += `| Tasks completed (last 30 days) | ${recentlyCompleted.length} |\n`
    md += `| Average daily velocity | ${dailyVelocity.toFixed(2)} tasks/day |\n`
    md += `| Average weekly velocity | ${(dailyVelocity * 7).toFixed(1)} tasks/week |\n`
    md += "\n"

    if (dailyVelocity === 0) {
        md += `**Warning:** No tasks completed in the last 30 days. Predictions require recent completion data.\n\n`
    }

    // Per-objective prediction
    md += `### Objective Predictions\n\n`
    md += `| Objective | Progress | Total Tasks | Remaining | Predicted Completion | Target Date | On Track? |\n`
    md += `|-----------|----------|-------------|-----------|---------------------|-------------|----------|\n`

    for (const obj of objectives) {
        const objTasks = tasks.filter((t) => t.objective_id === obj.id)
        const completed = objTasks.filter((t) => t.status === "Completed").length
        const remaining = objTasks.length - completed
        const progress = objTasks.length > 0 ? Math.round((completed / objTasks.length) * 100) : (obj.progress ?? 0)

        let predictedDate = "—"
        let onTrack = "—"

        if (remaining === 0) {
            predictedDate = "Done"
            onTrack = "Complete"
        } else if (dailyVelocity > 0) {
            // Scale velocity to this objective (proportion of total work)
            const objVelocity = objTasks.length > 0
                ? dailyVelocity * (objTasks.length / tasks.length)
                : dailyVelocity / objectives.length
            const daysRemaining = remaining / Math.max(objVelocity, 0.01)
            const predicted = new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000)
            predictedDate = predicted.toISOString().split("T")[0]

            if (obj.target_date) {
                const target = new Date(obj.target_date)
                if (predicted <= target) {
                    onTrack = "On track"
                } else {
                    const daysLate = Math.ceil((predicted.getTime() - target.getTime()) / (24 * 60 * 60 * 1000))
                    onTrack = `**${daysLate} days late**`
                }
            } else {
                onTrack = "No target set"
            }
        } else {
            predictedDate = "Cannot predict (no velocity)"
            onTrack = "At risk"
        }

        md += `| ${obj.title} | ${progress}% | ${objTasks.length} | ${remaining} | ${predictedDate} | ${obj.target_date ?? "—"} | ${onTrack} |\n`
    }
    md += "\n"

    // Velocity trend (weekly buckets over last 8 weeks)
    const weeklyCompleted: number[] = []
    for (let w = 7; w >= 0; w--) {
        const weekStart = new Date(Date.now() - (w + 1) * 7 * 24 * 60 * 60 * 1000).toISOString()
        const weekEnd = new Date(Date.now() - w * 7 * 24 * 60 * 60 * 1000).toISOString()
        const count = tasks.filter(
            (t) => t.status === "Completed" && t.updated_at && t.updated_at >= weekStart && t.updated_at < weekEnd,
        ).length
        weeklyCompleted.push(count)
    }

    const chartData = weeklyCompleted.map((count, i) => ({
        label: `Week -${7 - i}`,
        value: count,
    }))
    md += `\n<!-- CHART ${JSON.stringify({
        type: "bar",
        title: "Weekly Task Completion Velocity",
        data: chartData,
        xLabel: "Week",
        yLabel: "Tasks Completed",
    })} -->`

    return md
}
