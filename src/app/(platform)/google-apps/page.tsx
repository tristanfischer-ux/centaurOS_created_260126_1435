import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { getGoogleConnectionStatus, getGoogleConnectionInOtherFoundries } from '@/actions/google-workspace'
import { ProfileSetupRequired } from '@/components/ProfileSetupRequired'
import { GoogleAppsView } from './google-apps-view'
import { GoogleAppsNotConnected } from './google-apps-not-connected'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Google Apps | ForgeOS',
    description: 'Access your Google Drive, Docs, Calendar, and Email',
}

export const dynamic = 'force-dynamic'

/**
 * Google Apps page -- unified Google Workspace hub.
 *
 * @description Provides access to Google Drive files, Docs/Sheets/Slides,
 * Calendar events, and (future) Gmail from within ForgeOS. Handles three
 * connection states: connected, not connected, and connected-in-other-foundry.
 *
 * @security Authenticates user and scopes all data to their active foundry.
 */
export default async function GoogleAppsPage(): Promise<React.ReactNode> {
    // AUTH: Verify user session
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // AUTH: Resolve foundry context
    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
        return <ProfileSetupRequired />
    }

    // Check Google connection status for current foundry
    const { status } = await getGoogleConnectionStatus()

    if (!status?.connected) {
        // Check if connected in another foundry (multi-foundry awareness)
        const { connectedFoundryName } = await getGoogleConnectionInOtherFoundries()

        return (
            <GoogleAppsNotConnected
                connectedInOtherFoundry={connectedFoundryName}
            />
        )
    }

    return (
        <GoogleAppsView
            googleEmail={status.googleEmail}
            features={status.features}
        />
    )
}
