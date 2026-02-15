import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getStrategicGoals, getGoalBundle } from '@/actions/canvas'
import { StrategyDashboard } from './strategy-dashboard'
import type { StrategicGoal, GoalBundle } from '@/types/canvas'
import type { FoundryPurposeData } from '@/types/foundry'

export const dynamic = 'force-dynamic'

/**
 * @description Strategy page — the top of the strategic cascade.
 * Shows company purpose, strategic pillars with progress rollup,
 * and optional Strategy River visualization.
 *
 * @security Authenticates user and scopes all queries to their foundry.
 */
export default async function StrategyPage() {
  // AUTH: Verify user session
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // AUTH: Resolve foundry context
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, foundry_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.foundry_id) {
    return (
      <div className="p-8">
        <h1 className="font-bold mb-2 text-destructive">No Foundry Found</h1>
        <p className="text-muted-foreground">
          No foundry associated with your account. Please contact support.
        </p>
      </div>
    )
  }

  const foundryId = profile.foundry_id

  // Fetch foundry with purpose_data via RPC (bypasses RLS issue on foundries table)
  const { data: foundry, error: foundryError } = await supabase.rpc('ensure_foundry_exists', {
    p_foundry_id: foundryId,
  })

  if (foundryError) {
    console.error('[Strategy] Failed to fetch foundry:', { foundryId, error: foundryError.message })
  }

  // Fetch strategic goals, objectives, and tasks in parallel
  const [goalsResult, objectivesResult, tasksResult] = await Promise.all([
    getStrategicGoals(),
    supabase
      .from('objectives')
      .select('id, title, description, parent_objective_id, is_strategic_goal, status, progress')
      .eq('foundry_id', foundryId)
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('tasks')
      .select('id, status, end_date, start_date, created_at, objective_id')
      .eq('foundry_id', foundryId)
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .not('objective_id', 'is', null),
  ])

  if (objectivesResult.error) {
    console.error('[Strategy] Error loading objectives:', { foundryId, error: objectivesResult.error.message })
  }

  // Extract goals from server action result
  const goals: StrategicGoal[] =
    goalsResult && typeof goalsResult === 'object' && 'data' in goalsResult
      ? (goalsResult as { data: StrategicGoal[] }).data
      : []

  // Fetch goal bundles in parallel for Strategy River visualization
  const bundleResults = await Promise.all(
    goals.map((goal) => getGoalBundle(goal.id))
  )

  const bundles: GoalBundle[] = bundleResults
    .map((result) => ('data' in result ? result.data : null))
    .filter((b): b is GoalBundle => b !== null)

  // All objectives
  const allObjectives = (objectivesResult.data || []) as Array<{
    id: string
    title: string
    description: string | null
    parent_objective_id: string | null
    is_strategic_goal: boolean | null
    status: string | null
    progress: number | null
  }>

  // All tasks (for progress rollup)
  const allTasks = (tasksResult.data || []) as Array<{
    id: string
    status: string
    end_date: string | null
    start_date: string | null
    created_at: string
    objective_id: string | null
  }>

  // Strategic objectives
  const strategicObjectives = allObjectives
    .filter((o) => o.is_strategic_goal === true)
    .map((o) => ({
      id: o.id,
      title: o.title,
      description: o.description,
    }))

  // Regular objectives (non-strategic)
  const regularObjectives = allObjectives
    .filter((o) => !o.is_strategic_goal)
    .map((o) => ({
      id: o.id,
      title: o.title,
      parent_objective_id: o.parent_objective_id,
      status: o.status,
      progress: o.progress ?? 0,
    }))

  // Build pillar data with progress rollup
  const pillars = strategicObjectives.map((so) => {
    const linkedObjectives = regularObjectives.filter((o) => o.parent_objective_id === so.id)
    const linkedObjectiveIds = new Set(linkedObjectives.map((o) => o.id))

    // Tasks under linked objectives
    const linkedTasks = allTasks.filter((t) => t.objective_id && linkedObjectiveIds.has(t.objective_id))
    const totalTasks = linkedTasks.length
    const completedTasks = linkedTasks.filter((t) => t.status === 'Completed').length
    const overdueTasks = linkedTasks.filter((t) => {
      if (!t.end_date || t.status === 'Completed') return false
      return new Date(t.end_date) < new Date()
    }).length

    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    // Timeline-aware health: compare progress % vs elapsed time %
    // Find earliest start and latest deadline among linked tasks
    const now = new Date()
    let earliestStart: Date | null = null
    let latestDeadline: Date | null = null

    for (const t of linkedTasks) {
      const start = t.start_date ? new Date(t.start_date) : new Date(t.created_at)
      const end = t.end_date ? new Date(t.end_date) : null

      if (!earliestStart || start < earliestStart) earliestStart = start
      if (end && (!latestDeadline || end > latestDeadline)) latestDeadline = end
    }

    // Elapsed time percentage (0-100): how much of the timeline has passed
    let elapsedPercent = 0
    if (earliestStart && latestDeadline && latestDeadline > earliestStart) {
      const totalDuration = latestDeadline.getTime() - earliestStart.getTime()
      const elapsed = Math.max(0, now.getTime() - earliestStart.getTime())
      elapsedPercent = Math.min(100, Math.round((elapsed / totalDuration) * 100))
    }

    // Compute health (timeline-aware)
    let health: 'on-track' | 'at-risk' | 'off-track' | 'completed' | 'not-started'
    if (linkedObjectives.length === 0) {
      health = 'not-started'
    } else if (progress === 100) {
      health = 'completed'
    } else if (overdueTasks > 0) {
      // Any overdue tasks immediately signal trouble
      health = 'off-track'
    } else if (elapsedPercent > 0 && latestDeadline) {
      // Timeline-aware comparison: progress should keep pace with elapsed time
      const progressGap = elapsedPercent - progress
      if (progressGap <= 10) {
        health = 'on-track' // Progress is within 10% of elapsed time
      } else if (progressGap <= 25) {
        health = 'at-risk' // Falling behind by 10-25%
      } else {
        health = 'off-track' // Significantly behind schedule
      }
    } else {
      // No timeline data available -- fall back to simple thresholds
      health = progress >= 50 ? 'on-track' : progress >= 20 ? 'at-risk' : 'off-track'
    }

    return {
      id: so.id,
      title: so.title,
      description: so.description,
      objectiveCount: linkedObjectives.length,
      totalTasks,
      completedTasks,
      overdueTasks,
      progress,
      health,
      elapsedPercent,
    }
  })

  // Unlinked objectives count
  const unlinkedCount = regularObjectives.filter((o) => !o.parent_objective_id).length

  return (
    <StrategyDashboard
      pillars={pillars}
      unlinkedObjectiveCount={unlinkedCount}
      totalObjectives={regularObjectives.length}
      purposeData={(foundry as { purpose_data?: FoundryPurposeData | null } | null)?.purpose_data ?? null}
      isFounder={profile.role === 'Founder'}
      foundryId={foundryId}
      userId={user.id}
      initialBundles={bundles}
      strategicObjectives={strategicObjectives.map((so) => ({
        id: so.id,
        title: so.title,
        created_at: '',
      }))}
      regularObjectives={regularObjectives}
    />
  )
}
