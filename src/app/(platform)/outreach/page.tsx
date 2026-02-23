import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProfileSetupRequired } from '@/components/ProfileSetupRequired'
import { OutreachHub } from './outreach-hub'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Outreach | ForgeOS',
    description: 'Cold outreach campaigns — import prospects, generate email sequences, copy and send',
}

export const revalidate = 30

/**
 * Outreach hub page — campaign command center.
 *
 * @description Lists all outreach campaigns with contact counts and progress.
 * Users create campaigns, then drill into them to import contacts and generate
 * email sequences via Sal.
 *
 * @security Authenticates user and scopes all data to their foundry.
 */
export default async function OutreachPage(): Promise<React.ReactNode> {
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
        <OutreachHub
            foundryId={profile.foundry_id}
            userId={user.id}
        />
    )
}
