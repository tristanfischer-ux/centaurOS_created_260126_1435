import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFundingRequirements } from '@/actions/business-plan'
import { FundingPageView } from './funding-page-view'
import { ProfileSetupRequired } from '@/components/ProfileSetupRequired'

export const dynamic = 'force-dynamic'

/**
 * @description Funding & Financing page server component.
 * Fetches funding requirements derived from business plan analysis.
 * @security Requires authenticated user with foundry membership.
 */
export default async function FundingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.foundry_id) return <ProfileSetupRequired userRole={profile?.role} />

  const { data: requirements } = await getFundingRequirements()

  return <FundingPageView requirements={requirements ?? []} />
}
