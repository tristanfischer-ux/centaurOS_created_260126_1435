import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProfileSetupRequired } from '@/components/ProfileSetupRequired'
import { getFundingRequirements } from '@/actions/business-plan'
import { FundingPageView } from './funding-page-view'

/**
 * Funding page — server component that authenticates, fetches funding
 * requirements from the Business Plan Intelligence Engine, and renders
 * the FundingPageView client component.
 *
 * @security Requires authenticated user with foundry membership.
 */
export default async function FundingPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('foundry_id, role')
        .eq('id', user.id)
        .single()

    const foundryId = profile?.foundry_id || user.app_metadata?.foundry_id

    if (!foundryId) {
        return <ProfileSetupRequired userRole={profile?.role} />
    }

    const { data: fundingRequirements, error } = await getFundingRequirements()

    if (error) {
        console.error('[FundingPage] Failed to fetch funding requirements:', error)
    }

    return (
        <FundingPageView
            fundingRequirements={fundingRequirements || []}
        />
    )
}
