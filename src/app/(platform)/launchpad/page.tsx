import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { LaunchpadClient } from './launchpad-client'

/**
 * Launchpad Page - Entrepreneur's guided journey
 * 
 * @description Provides a step-by-step path from idea to operating business.
 * Includes a lean canvas, launch checklist, and learning path.
 * Shows progress and next actions tailored to the user's stage.
 */
export default async function LaunchpadPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const foundryId = await getFoundryIdCached()
  if (!foundryId) redirect('/dashboard')

  // Fetch foundry info including purpose data and stage
  const { data: foundry } = await supabase
    .from('foundries')
    .select('id, name, stage, industry, purpose_data, company_profile')
    .eq('id', foundryId)
    .maybeSingle()

  // Fetch objectives to calculate checklist progress
  const { data: objectives } = await supabase
    .from('objectives')
    .select('id, title, status, progress')
    .eq('foundry_id', foundryId)

  // Fetch tasks for the current foundry
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, status')
    .eq('foundry_id', foundryId)

  // Fetch team members count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: memberCount } = await (supabase as any)
    .from('foundry_memberships')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', foundryId)

  const completedTasks = tasks?.filter(t => t.status === 'Completed').length || 0
  const totalTasks = tasks?.length || 0
  const objectiveCount = objectives?.length || 0

  return (
    <LaunchpadClient
      foundryName={foundry?.name || 'Your Business'}
      foundryStage={foundry?.stage || null}
      foundryIndustry={foundry?.industry || null}
      purposeData={foundry?.purpose_data || null}
      objectiveCount={objectiveCount}
      completedTasks={completedTasks}
      totalTasks={totalTasks}
      memberCount={memberCount || 1}
      foundryId={foundryId}
    />
  )
}
