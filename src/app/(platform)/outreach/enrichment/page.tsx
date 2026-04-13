import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProfileSetupRequired } from '@/components/ProfileSetupRequired'
import { EnrichmentView } from './enrichment-view'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Contact Enrichment',
    description: 'Enrich marketplace listing contacts for outreach campaigns',
}

export const revalidate = 30

/**
 * Enrichment page — manage contact data on marketplace listings.
 *
 * @description Table of all marketplace listings with inline contact editing,
 * CSV export/import, and bulk status management. Feeds into the outreach pipeline.
 *
 * @security Authenticates user, Founder/Executive only.
 */
export default async function EnrichmentPage(): Promise<React.ReactNode> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('id, foundry_id, role')
        .eq('id', user.id)
        .single()

    if (!profile?.foundry_id) {
        return <ProfileSetupRequired userRole={profile?.role} />
    }

    return (
        <EnrichmentView
            foundryId={profile.foundry_id}
        />
    )
}
