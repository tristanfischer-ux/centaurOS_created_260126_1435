/**
 * @file google-workspace.ts
 *
 * @description Server actions for managing Google Workspace connections.
 * Handles checking connection status and disconnecting accounts.
 *
 * @security Requires authenticated user with active foundry
 * @audit Connection and disconnection events are logged
 *
 * @related
 * - src/lib/google/tokens.ts - Token CRUD
 * - src/app/api/google/connect/route.ts - OAuth initiation
 * - src/app/api/google/callback/route.ts - OAuth callback
 */

'use server'

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { getGoogleToken, deleteGoogleToken } from '@/lib/google/tokens'
import { hasRequiredScopes } from '@/lib/google/scopes'
import { revalidatePath } from 'next/cache'

export interface GoogleConnectionStatus {
    connected: boolean
    googleEmail: string | null
    scopes: string[]
    features: {
        calendar: boolean
        drive: boolean
        gmail: boolean
    }
}

/**
 * Get the current Google Workspace connection status for the user.
 *
 * @returns Connection status including email and enabled features
 */
export async function getGoogleConnectionStatus(): Promise<{
    status: GoogleConnectionStatus | null
    error?: string
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { status: null, error: 'Unauthorized' }
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
        return { status: null, error: 'No active foundry' }
    }

    const token = await getGoogleToken(user.id, foundryId)

    if (!token) {
        return {
            status: {
                connected: false,
                googleEmail: null,
                scopes: [],
                features: { calendar: false, drive: false, gmail: false },
            },
        }
    }

    return {
        status: {
            connected: true,
            googleEmail: token.google_email,
            scopes: token.scopes,
            features: {
                calendar: hasRequiredScopes(token.scopes, 'calendar'),
                drive: hasRequiredScopes(token.scopes, 'drive'),
                gmail: hasRequiredScopes(token.scopes, 'gmail'),
            },
        },
    }
}

/**
 * Check if the user has Google connected in any other foundry.
 * Used for multi-foundry awareness on the Google Apps page.
 *
 * @returns The foundry name where Google is connected, or null
 */
export async function getGoogleConnectionInOtherFoundries(): Promise<{
    connectedFoundryName: string | null
    error?: string
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { connectedFoundryName: null, error: 'Unauthorized' }
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
        return { connectedFoundryName: null, error: 'No active foundry' }
    }

    // Find tokens for this user in OTHER foundries
    const { data: otherTokens } = await supabase
        .from('google_oauth_tokens')
        .select('foundry_id')
        .eq('user_id', user.id)
        .neq('foundry_id', foundryId)
        .limit(1)

    if (!otherTokens || otherTokens.length === 0) {
        return { connectedFoundryName: null }
    }

    // Get the foundry name
    const { data: foundry } = await supabase
        .from('foundries')
        .select('name')
        .eq('id', otherTokens[0].foundry_id)
        .single()

    return {
        connectedFoundryName: foundry?.name || 'another workspace',
    }
}

/**
 * Disconnect the user's Google account from their current foundry.
 * Revokes stored tokens and removes all calendar sync mappings.
 *
 * @returns Success status
 *
 * @security Requires authenticated user
 * @audit Logs google_account_disconnected event
 */
export async function disconnectGoogle(): Promise<{
    success: boolean
    error?: string
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, error: 'Unauthorized' }
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
        return { success: false, error: 'No active foundry' }
    }

    const result = await deleteGoogleToken(user.id, foundryId)

    if (result.success) {
        // AUDIT: Log disconnection
        console.info('[GoogleWorkspace] Account disconnected:', {
            userId: user.id,
            foundryId,
        })
        revalidatePath('/settings/integrations')
    }

    return result
}
