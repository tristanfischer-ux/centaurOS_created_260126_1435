import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TeamPageView } from './team-page-view'

/**
 * Team page — server component that authenticates and renders the Team view.
 *
 * @description Currently uses mock data for the orbital/list views.
 * Server-side data fetching will be integrated once capability_coverage
 * and marketplace tables exist.
 */
export default async function TeamPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // AUTH: Verify user has a foundry
    const { data: currentUserProfile } = await supabase
        .from('profiles')
        .select('foundry_id')
        .eq('id', user.id)
        .single()

    const foundry_id = currentUserProfile?.foundry_id || user.app_metadata?.foundry_id

    if (!foundry_id) {
        return <div className="p-8 text-destructive">Error: No Foundry associated with your account.</div>
    }

    return <TeamPageView />
}
