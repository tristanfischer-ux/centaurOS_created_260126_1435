import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getStrategicGoals, getGoalBundle } from '@/actions/canvas'
import { CanvasShell } from './canvas-shell'
import { WhiteboardList } from './components/whiteboard-list'
import type { WhiteboardRow } from '@/actions/whiteboards'
import type { StrategicGoal, GoalBundle } from '@/types/canvas'
import type { FoundryPurposeData } from '@/types/foundry'

export const dynamic = 'force-dynamic'

/**
 * @description Strategy page — river visualization, whiteboards, money map,
 * and cost of delay tools.
 *
 * Server component that fetches initial data (strategic goals, goal bundles,
 * whiteboards) and hands them to the client-side CanvasShell for rendering.
 *
 * Goal bundles are fetched in parallel for all goals so the Strategy River
 * can render immediately without client-side waterfall requests.
 *
 * @security Authenticates user and scopes all queries to their foundry.
 */
export default async function CanvasPage() {
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

  // Fetch strategic goals, whiteboards, and objectives in parallel
  const [goalsResult, whiteboardsResult, objectivesResult, strategicObjResult] = await Promise.all([
    getStrategicGoals(),
    supabase
      .from('whiteboards')
      .select('*')
      .eq('foundry_id', foundryId)
      .order('updated_at', { ascending: false }),
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
  ])

  if (whiteboardsResult.error) {
    console.error('[Strategy] Error loading whiteboards:', { foundryId, error: whiteboardsResult.error.message })
  }
  if (objectivesResult.error) {
    console.error('[Strategy] Error loading objectives:', { foundryId, error: objectivesResult.error.message })
  }
  if (strategicObjResult.error) {
    console.error('[Strategy] Error loading strategic objectives:', { foundryId, error: strategicObjResult.error.message })
  }

  // Extract goals from result — goalsResult is a server action return, not a Supabase query
  const goals: StrategicGoal[] =
    goalsResult && typeof goalsResult === 'object' && 'data' in goalsResult
      ? (goalsResult as { data: StrategicGoal[] }).data
      : []

  // Fetch goal bundles in parallel for the Strategy River visualization
  // Each bundle contains milestones, objectives, and tasks
  const bundleResults = await Promise.all(
    goals.map((goal) => getGoalBundle(goal.id))
  )

  const bundles: GoalBundle[] = bundleResults
    .map((result) => ('data' in result ? result.data : null))
    .filter((b): b is GoalBundle => b !== null)

  const whiteboards = (whiteboardsResult.data || []) as WhiteboardRow[]

  // All objectives (for dialog and link view)
  const allObjectives = (objectivesResult.data || []) as Array<{
    id: string
    title: string
    parent_objective_id: string | null
    is_strategic_goal: boolean | null
    status: string | null
    progress: number | null
  }>

  const objectivesForDialog = allObjectives.map((o) => ({
    id: o.id,
    title: o.title,
  }))

  // Regular objectives (non-strategic) for the link view and counting
  const regularObjectives = allObjectives
    .filter((o) => !o.is_strategic_goal)
    .map((o) => ({
      id: o.id,
      title: o.title,
      parent_objective_id: o.parent_objective_id,
      status: o.status,
      progress: o.progress ?? 0,
    }))

  // Strategic objectives for the CRUD manager
  const strategicObjectives = (strategicObjResult.data || []).map((o) => ({
    id: o.id,
    title: o.title,
    created_at: o.created_at ?? new Date().toISOString(),
  }))

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 -mb-32 lg:-mb-8">
      {/* Strategy River has its own built-in title bar + stats header */}
      <CanvasShell
        initialBundles={bundles}
        strategicObjectives={strategicObjectives}
        regularObjectives={regularObjectives}
        whiteboardList={
          <WhiteboardList
            whiteboards={whiteboards}
            objectives={objectivesForDialog}
          />
        }
        purposeData={(foundry as { purpose_data?: FoundryPurposeData | null } | null)?.purpose_data ?? null}
        isFounder={profile.role === 'Founder'}
        foundryId={foundryId}
        userId={user.id}
      />
    </div>
  )
}
