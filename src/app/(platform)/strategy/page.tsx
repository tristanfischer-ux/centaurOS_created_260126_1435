import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getStrategicGoals, getGoalBundle } from '@/actions/canvas'
import { StrategyDashboard } from './strategy-dashboard'
import type { StrategicGoal, GoalBundle } from '@/types/canvas'
import type { FoundryPurposeData } from '@/types/foundry'
import type { WhiteboardRow } from '@/actions/whiteboards'

export const dynamic = 'force-dynamic'

/**
 * Strategy page — strategic dashboard showing purpose, pillars with progress rollup,
 * and a toggleable Strategy River visualization.
 *
 * @description Fetches strategic goals, objectives, tasks, and bundles server-side,
 * computes progress rollup per pillar, and passes everything to the dashboard shell.
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
    redirect('/login')
  }

  const foundryId = profile.foundry_id

  // Fetch foundry with purpose_data via RPC (bypasses RLS issue on foundries table)
  const { data: foundry, error: foundryError } = await supabase.rpc('ensure_foundry_exists', {
    p_foundry_id: foundryId,
  })

  if (foundryError) {
    console.error('[Strategy] Failed to fetch foundry:', { foundryId, error: foundryError.message, code: foundryError.code })
  }

  // Fetch strategic goals, objectives, tasks, and strategic obj list in parallel
  const [goalsResult, objectivesResult, strategicObjResult, tasksResult] = await Promise.all([
    getStrategicGoals(),
    supabase
      .from('objectives')
      .select('id, title, parent_objective_id, is_strategic_goal, status, progress')
      .eq('foundry_id', foundryId)
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('objectives')
      .select('id, title, created_at')
      .eq('foundry_id', foundryId)
      .eq('is_strategic_goal', true)
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('tasks')
      .select('id, status, objective_id, end_date')
      .eq('foundry_id', foundryId)
      .eq('is_ghost', false)
      .is('deleted_at', null),
  ])

  if (objectivesResult.error) {
    console.error('[Strategy] Error loading objectives:', { foundryId, error: objectivesResult.error.message })
  }
  if (strategicObjResult.error) {
    console.error('[Strategy] Error loading strategic objectives:', { foundryId, error: strategicObjResult.error.message })
  }
  if (tasksResult.error) {
    console.error('[Strategy] Error loading tasks:', { foundryId, error: tasksResult.error.message })
  }

  // Extract goals from result — goalsResult is a server action return
  const goals: StrategicGoal[] =
    goalsResult && typeof goalsResult === 'object' && 'data' in goalsResult
      ? (goalsResult as { data: StrategicGoal[] }).data
      : []

  // Fetch goal bundles in parallel for the Strategy River visualization
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
    parent_objective_id: string | null
    is_strategic_goal: boolean | null
    status: string | null
    progress: number | null
  }>

  // Regular objectives (non-strategic) for linking
  const regularObjectives = allObjectives
    .filter((o) => !o.is_strategic_goal)
    .map((o) => ({
      id: o.id,
      title: o.title,
      parent_objective_id: o.parent_objective_id,
      status: o.status,
      progress: o.progress ?? 0,
    }))

  // Strategic objectives
  const strategicObjectives = (strategicObjResult.data || []).map((o) => ({
    id: o.id,
    title: o.title,
    created_at: o.created_at ?? new Date().toISOString(),
  }))

  // All tasks for rollup calculation
  const allTasks = (tasksResult.data || []) as Array<{
    id: string
    status: string
    objective_id: string | null
    end_date: string | null
  }>

  // ── Compute progress rollup per strategic pillar ──
  // For each strategic objective, find its child objectives, then aggregate task progress
  interface PillarRollup {
    id: string
    title: string
    createdAt: string
    objectiveCount: number
    totalTasks: number
    completedTasks: number
    overdueTasks: number
    progress: number
    health: 'on-track' | 'at-risk' | 'off-track' | 'completed' | 'not-started'
  }

  const pillarRollups: PillarRollup[] = strategicObjectives.map((so) => {
    // Find child objectives linked to this strategy
    const childObjectives = regularObjectives.filter((o) => o.parent_objective_id === so.id)
    const childObjectiveIds = new Set(childObjectives.map((o) => o.id))

    // Find tasks belonging to those child objectives
    const pillarTasks = allTasks.filter((t) => t.objective_id && childObjectiveIds.has(t.objective_id))
    const totalTasks = pillarTasks.length
    const completedTasks = pillarTasks.filter((t) => t.status === 'Completed').length
    const overdueTasks = pillarTasks.filter((t) => {
      if (!t.end_date || t.status === 'Completed') return false
      return new Date(t.end_date) < new Date()
    }).length
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    // Health: completed > on-track > at-risk > off-track > not-started
    let health: PillarRollup['health']
    if (totalTasks > 0 && progress === 100) {
      health = 'completed'
    } else if (childObjectives.length === 0 || totalTasks === 0) {
      health = 'not-started'
    } else if (overdueTasks > 0) {
      health = 'off-track'
    } else if (progress >= 50) {
      health = 'on-track'
    } else {
      health = 'at-risk'
    }

    return {
      id: so.id,
      title: so.title,
      createdAt: so.created_at,
      objectiveCount: childObjectives.length,
      totalTasks,
      completedTasks,
      overdueTasks,
      progress,
      health,
    }
  })

  // Count unaligned objectives (not linked to any strategy)
  const unalignedCount = regularObjectives.filter((o) => !o.parent_objective_id).length

  return (
    <StrategyDashboard
      pillarRollups={pillarRollups}
      unalignedObjectiveCount={unalignedCount}
      totalObjectiveCount={regularObjectives.length}
      initialBundles={bundles}
      strategicObjectives={strategicObjectives}
      regularObjectives={regularObjectives}
      purposeData={(foundry as { purpose_data?: FoundryPurposeData | null } | null)?.purpose_data ?? null}
      isFounder={profile.role === 'Founder'}
      foundryId={foundryId}
      userId={user.id}
    />
  )
}
