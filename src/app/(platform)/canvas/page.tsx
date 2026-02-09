import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { typography } from '@/lib/design-system'
import { getStrategicGoals } from '@/actions/canvas'
import { CanvasShell } from './canvas-shell'
import { WhiteboardList } from './components/whiteboard-list'
import type { WhiteboardRow } from '@/actions/whiteboards'
import type { StrategicGoal } from '@/types/canvas'

export const dynamic = 'force-dynamic'

/**
 * @description Canvas page — strategic timeline + whiteboards.
 *
 * Server component that fetches initial data (strategic goals + whiteboards)
 * and hands them to the client-side CanvasShell for interactive rendering.
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
    .select('id, foundry_id')
    .eq('id', user.id)
    .single()

  if (!profile?.foundry_id) {
    redirect('/login')
  }

  const foundryId = profile.foundry_id

  // Fetch strategic goals and whiteboards in parallel
  const [goalsResult, whiteboardsResult, objectivesResult] = await Promise.all([
    getStrategicGoals(),
    supabase
      .from('whiteboards')
      .select('*')
      .eq('foundry_id', foundryId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('objectives')
      .select('id, title')
      .eq('foundry_id', foundryId)
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  if (whiteboardsResult.error) {
    console.error('[Canvas] Error loading whiteboards:', whiteboardsResult.error)
  }

  // Extract goals from result
  const goals: StrategicGoal[] =
    goalsResult && 'data' in goalsResult ? goalsResult.data : []

  const whiteboards = (whiteboardsResult.data || []) as WhiteboardRow[]
  const objectivesForDialog = (objectivesResult.data || []).map((o) => ({
    id: o.id,
    title: o.title,
  }))

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 -mb-32 lg:-mb-8">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Canvas</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Strategic timeline &mdash; work backwards from your goals
          </p>
        </div>
      </div>

      {/* Client shell handles tab switching, toolbar, and ReactFlow */}
      <CanvasShell
        initialGoals={goals}
        whiteboardList={
          <WhiteboardList
            whiteboards={whiteboards}
            objectives={objectivesForDialog}
          />
        }
      />
    </div>
  )
}
