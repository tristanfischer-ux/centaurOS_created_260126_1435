import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { StrategicPlannerLanding } from './strategic-planner-landing'

/**
 * @description Strategic Planner landing page.
 * Shows all strategic goals or prompts user to create one.
 */

export default async function StrategicPlannerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    redirect('/dashboard')
  }

  // Fetch strategic goals
  const { data: goals } = await supabase
    .from('objectives')
    .select('id, title, description, status, progress, milestone_date, created_at')
    .eq('foundry_id', foundryId)
    .eq('is_ghost', false)
    .is('deleted_at', null)
    .eq('is_strategic_goal', true)
    .order('created_at', { ascending: false })

  return <StrategicPlannerLanding goals={goals || []} />
}
