// ═══════════════════════════════════════════════════════════════════════════════
// strategy-river-adapter.ts
//
// Maps existing GoalBundle / Supabase data → StrategyRiver props.
//
// Data model:
//   Strategic Goal  = objectives WHERE is_strategic_goal = true
//   Milestone       = objectives WHERE is_milestone = true, parent → goal
//   Objective       = objectives WHERE parent → milestone, NOT is_milestone
//   Task            = tasks WHERE objective_id → objective
//
// StrategyRiver expects:
//   StrategicObjective → Objective (milestone) → Task
//
// So: Goal = SO, Milestone = RiverObjective, Task = RiverTask
// ═══════════════════════════════════════════════════════════════════════════════

import type {
  RiverStrategicObjective,
  RiverObjective,
  RiverTask,
} from '@/components/canvas/StrategyRiver'

import type {
  GoalBundle,
  CanvasTask,
} from '@/types/canvas'

// ─── Colour palette for SOs ─────────────────────────────────────────────────
// Cycles through these for each strategic goal. Add more as needed.
const SO_COLORS = [
  '#F97316', // orange
  '#6366F1', // indigo
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#EAB308', // yellow
  '#06B6D4', // cyan
  '#F43F5E', // rose
] as const

// ─── Status mapping ──────────────────────────────────────────────────────────
// Map Supabase task_status enum to the 3 river statuses.
function mapStatus(status: string | null | undefined): 'done' | 'in_progress' | 'not_started' {
  const s = status?.toLowerCase().replace(/\s+/g, '_') ?? ''
  if (s === 'done' || s === 'completed' || s === 'complete') return 'done'
  if (s === 'accepted' || s === 'in_progress' || s === 'in progress' || s === 'active') return 'in_progress'
  return 'not_started'
}

// ─── Get assignee initials ───────────────────────────────────────────────────
function getInitials(task: CanvasTask): string {
  if (task.assignees && task.assignees.length > 0) {
    // TaskAssigneeProfile has { id, full_name, role } — no email field
    const name = task.assignees[0].full_name ?? '??'
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  return '—'
}

// ─── Convert a single GoalBundle → RiverStrategicObjective ───────────────────
function bundleToRiverSO(
  bundle: GoalBundle,
  colorIndex: number
): RiverStrategicObjective {
  const goal = bundle.goal
  const todayISO = new Date().toISOString().slice(0, 10)

  // Each milestone becomes a RiverObjective
  const riverObjectives: RiverObjective[] = bundle.milestones.map((milestone) => {
    // Find objectives under this milestone
    const msObjectives = bundle.objectives.filter(
      (obj) => obj.parent_objective_id === milestone.id
    )

    // Collect all tasks under those objectives
    const riverTasks: RiverTask[] = []
    msObjectives.forEach((obj) => {
      const objTasks = bundle.tasks.filter((t) => t.objective_id === obj.id)
      objTasks.forEach((task) => {
        const firstAssignee = task.assignees?.[0] ?? null
        riverTasks.push({
          id: task.id,
          title: task.title,
          // Field fixes: end_date (not due_date), created_at (not goal.start_date)
          start: task.start_date?.slice(0, 10) ?? task.created_at?.slice(0, 10) ?? todayISO,
          end: task.end_date?.slice(0, 10) ?? milestone.milestone_date?.slice(0, 10) ?? goal.milestone_date?.slice(0, 10) ?? todayISO,
          status: mapStatus(task.status),
          assignee: getInitials(task),
          assigneeRole: firstAssignee?.role ?? null,
        })
      })
    })

    return {
      id: milestone.id,
      title: milestone.title,
      dueDate: milestone.milestone_date?.slice(0, 10) ?? goal.milestone_date?.slice(0, 10) ?? todayISO,
      tasks: riverTasks,
    }
  })

  // Determine start date: earliest task start, or goal created_at
  const allStarts = riverObjectives.flatMap((o) => o.tasks.map((t) => t.start))
  const startDate = allStarts.length > 0
    ? allStarts.sort()[0]
    : goal.created_at?.slice(0, 10) ?? todayISO

  return {
    id: goal.id,
    title: goal.title,
    color: SO_COLORS[colorIndex % SO_COLORS.length],
    startDate,
    targetDate: goal.milestone_date?.slice(0, 10) ?? todayISO,
    objectives: riverObjectives.filter((o) => o.tasks.length > 0), // skip empty milestones
  }
}

// ─── Main adapter: multiple GoalBundles → StrategyRiver props ────────────────
export function goalBundlesToRiverData(
  bundles: GoalBundle[]
): RiverStrategicObjective[] {
  return bundles
    .map((bundle, i) => bundleToRiverSO(bundle, i))
    .filter((so) => so.objectives.length > 0) // skip goals with no milestones
}

// ─── Single bundle adapter (for when you only have one goal selected) ────────
export function singleBundleToRiverData(
  bundle: GoalBundle,
  colorIndex = 0
): RiverStrategicObjective[] {
  const so = bundleToRiverSO(bundle, colorIndex)
  return so.objectives.length > 0 ? [so] : []
}
