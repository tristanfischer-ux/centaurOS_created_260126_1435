import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isValidUUID } from '@/lib/validations'
import { StrategicPlannerView } from './strategic-planner-view'

/**
 * @description Strategic Planner page that visualizes a strategic goal
 * as an interactive timeline canvas with phases, tasks, dependencies,
 * resource gaps, and AI suggestions.
 */

interface StrategicPlannerPageProps {
  params: Promise<{ objectiveId: string }>
}

export default async function StrategicPlannerPage({ params }: StrategicPlannerPageProps) {
  const { objectiveId } = await params

  // SECURITY: UUID gate before we touch auth or DB. Prevents enumeration
  // oracle + malformed-input paths. RLS + foundry filter is defense in depth;
  // this is the first line.
  if (!isValidUUID(objectiveId)) {
    notFound()
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <StrategicPlannerView objectiveId={objectiveId} />
}
