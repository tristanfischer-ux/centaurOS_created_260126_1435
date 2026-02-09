/**
 * @file strategy-river-adapter.ts
 *
 * @description Maps existing GoalBundle / Supabase data to the StrategyRiver
 * component's prop types. Handles date fallbacks, status mapping, assignee
 * initials extraction, and empty milestone filtering.
 *
 * Data model mapping:
 *   Strategic Goal (is_strategic_goal)  → RiverStrategicObjective
 *   Milestone (is_milestone)            → RiverObjective
 *   Task                                → RiverTask
 *
 * @related
 * - Component: src/components/canvas/StrategyRiver.tsx
 * - Types: src/types/canvas.ts
 * - Actions: src/actions/canvas.ts
 */

import type {
  RiverStrategicObjective,
  RiverObjective,
  RiverTask,
} from '@/components/canvas/StrategyRiver'

import type {
  GoalBundle,
  CanvasTask,
} from '@/types/canvas'

// ─── Colour palette for strategic objectives ─────────────────────────────────
// Cycles through these for each strategic goal. Matches CentaurOS brand palette.
const SO_COLORS = [
  '#F97316', // orange (International Orange)
  '#6366F1', // indigo
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#EAB308', // yellow
  '#06B6D4', // cyan
  '#F43F5E', // rose
] as const

// ─── Status mapping ──────────────────────────────────────────────────────────

/**
 * Maps Supabase task_status enum values to the 3 river status values.
 *
 * @description Supabase enum: Pending, Accepted, Rejected, Amended,
 * Amended_Pending_Approval, Completed, Pending_Peer_Review, Pending_Executive_Approval.
 * "Completed" → done, "Accepted" → in_progress, everything else → not_started.
 *
 * @param status - The raw status string from Supabase
 * @returns One of the three river status values
 */
function mapStatus(status: string | null | undefined): 'done' | 'in_progress' | 'not_started' {
  const s = status?.toLowerCase().replace(/\s+/g, '_') ?? ''
  if (s === 'completed' || s === 'done' || s === 'complete') return 'done'
  if (s === 'accepted' || s === 'in_progress' || s === 'in progress' || s === 'active') return 'in_progress'
  return 'not_started'
}

// ─── Get assignee initials ───────────────────────────────────────────────────

/**
 * Extracts 2-character initials from the first assignee's name.
 *
 * @param task - A CanvasTask with resolved assignee profiles
 * @returns 2-char uppercase initials, or "—" if no assignee
 */
function getInitials(task: CanvasTask): string {
  if (task.assignees && task.assignees.length > 0) {
    const name = task.assignees[0].full_name ?? '??'
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  return '—'
}

// ─── Convert a single GoalBundle → RiverStrategicObjective ───────────────────

/**
 * Converts a GoalBundle (strategic goal with full hierarchy) into a
 * RiverStrategicObjective for the StrategyRiver component.
 *
 * @param bundle - Complete goal bundle from getGoalBundle()
 * @param colorIndex - Index into the SO_COLORS palette
 * @returns A RiverStrategicObjective ready for rendering
 */
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
        riverTasks.push({
          id: task.id,
          title: task.title,
          // TaskRow uses start_date / end_date (not due_date)
          start: task.start_date?.slice(0, 10) ?? task.created_at?.slice(0, 10) ?? milestone.milestone_date?.slice(0, 10) ?? todayISO,
          end: task.end_date?.slice(0, 10) ?? milestone.milestone_date?.slice(0, 10) ?? goal.milestone_date?.slice(0, 10) ?? todayISO,
          status: mapStatus(task.status),
          assignee: getInitials(task),
        })
      })
    })

    // If no tasks exist yet (milestone has objectives but no tasks),
    // create placeholder tasks from objectives so the river still shows structure
    if (riverTasks.length === 0) {
      msObjectives.forEach((obj) => {
        riverTasks.push({
          id: `obj-as-task-${obj.id}`,
          title: obj.title,
          start: obj.created_at?.slice(0, 10) ?? milestone.milestone_date?.slice(0, 10) ?? todayISO,
          end: milestone.milestone_date?.slice(0, 10) ?? goal.milestone_date?.slice(0, 10) ?? todayISO,
          status: mapStatus(obj.status),
          assignee: '—',
        })
      })
    }

    return {
      id: milestone.id,
      title: milestone.title,
      dueDate: milestone.milestone_date?.slice(0, 10) ?? goal.milestone_date?.slice(0, 10) ?? todayISO,
      tasks: riverTasks,
    }
  })

  // Determine start date: earliest task start, or goal created_at
  // ObjectiveRow has no start_date field — use created_at as the fallback
  const allStarts = riverObjectives.flatMap((o) => o.tasks.map((t) => t.start))
  const startDate = allStarts.length > 0
    ? allStarts.sort()[0]
    : goal.created_at?.slice(0, 10) ?? todayISO

  return {
    id: goal.id,
    title: goal.title,
    color: SO_COLORS[colorIndex % SO_COLORS.length],
    startDate,
    // goal.milestone_date is the target date for strategic goals
    targetDate: goal.milestone_date?.slice(0, 10) ?? todayISO,
    objectives: riverObjectives.filter((o) => o.tasks.length > 0), // skip empty milestones
  }
}

// ─── Main adapter: multiple GoalBundles → StrategyRiver props ────────────────

/**
 * Converts an array of GoalBundles into StrategyRiver props.
 *
 * @description Processes all strategic goal bundles, maps them to
 * RiverStrategicObjective format, and filters out any goals that have
 * no milestones with tasks (nothing to visualise).
 *
 * @param bundles - Array of GoalBundles from getGoalBundle()
 * @returns Array of RiverStrategicObjective for StrategyRiver component
 */
export function goalBundlesToRiverData(
  bundles: GoalBundle[]
): RiverStrategicObjective[] {
  return bundles
    .map((bundle, i) => bundleToRiverSO(bundle, i))
    .filter((so) => so.objectives.length > 0)
}

/**
 * Converts a single GoalBundle into StrategyRiver props.
 *
 * @description Useful when only one goal is selected. Returns an array
 * with 0 or 1 elements (0 if the goal has no milestones with tasks).
 *
 * @param bundle - A single GoalBundle from getGoalBundle()
 * @param colorIndex - Optional colour index (defaults to 0 = orange)
 * @returns Array with 0 or 1 RiverStrategicObjective
 */
export function singleBundleToRiverData(
  bundle: GoalBundle,
  colorIndex = 0
): RiverStrategicObjective[] {
  const so = bundleToRiverSO(bundle, colorIndex)
  return so.objectives.length > 0 ? [so] : []
}
