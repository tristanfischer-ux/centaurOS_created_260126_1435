/**
 * @file tokens.ts
 *
 * @description Manages Microsoft OAuth token storage, retrieval, and refresh.
 * Tokens are stored per-user, per-foundry in the microsoft_oauth_tokens table.
 *
 * @security Tokens are stored in the database. In production, use Supabase Vault
 * or application-level encryption for the access_token and refresh_token columns.
 * @audit Token creation, refresh, and revocation are logged.
 *
 * @related src/lib/microsoft/client.ts - Consumes tokens to create API clients
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface MicrosoftTokenRecord {
    id: string
    user_id: string
    foundry_id: string
    access_token: string
    refresh_token: string | null
    token_expires_at: string
    scopes: string[]
    microsoft_email: string
    created_at: string
    updated_at: string
}

export interface SaveMicrosoftTokenParams {
    userId: string
    foundryId: string
    accessToken: string
    refreshToken: string | null
    expiresAt: Date
    scopes: string[]
    microsoftEmail: string
}

/**
 * Retrieve the Microsoft OAuth token for a user in their active foundry.
 *
 * @param userId - The authenticated user ID
 * @param foundryId - The active foundry ID
 * @returns The token record or null if not connected
 */
export async function getMicrosoftToken(
    userId: string,
    foundryId: string
): Promise<MicrosoftTokenRecord | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('microsoft_oauth_tokens')
        .select('*')
        .eq('user_id', userId)
        .eq('foundry_id', foundryId)
        .single()

    if (error || !data) {
        if (error && error.code !== 'PGRST116') {
            console.error('[MicrosoftTokens] Failed to fetch token:', {
                userId,
                foundryId,
                error: error.message,
            })
        }
        return null
    }

    return data as MicrosoftTokenRecord
}

const UPSERT_PAYLOAD = (params: SaveMicrosoftTokenParams) => ({
    user_id: params.userId,
    foundry_id: params.foundryId,
    access_token: params.accessToken,
    refresh_token: params.refreshToken,
    token_expires_at: params.expiresAt.toISOString(),
    scopes: params.scopes,
    microsoft_email: params.microsoftEmail,
    updated_at: new Date().toISOString(),
})

/**
 * Save or update a Microsoft OAuth token for a user-foundry pair.
 * Tries the regular RLS client first (user is authenticated during callback);
 * falls back to admin client if RLS blocks the write (e.g. legacy key issues).
 *
 * @param params - Token data to save
 * @returns Success status
 *
 * @audit Logs token_saved event
 */
export async function saveMicrosoftToken(
    params: SaveMicrosoftTokenParams
): Promise<{ success: boolean; error?: string }> {
    const payload = UPSERT_PAYLOAD(params)
    const upsertOptions = { onConflict: 'user_id,foundry_id' as const }

    // Try regular client first (user is authenticated during OAuth callback).
    const supabase = await createClient()
    const { error: rlsError } = await supabase
        .from('microsoft_oauth_tokens')
        .upsert(payload, upsertOptions)

    if (!rlsError) {
        console.info('[MicrosoftTokens] Token saved (RLS client):', {
            userId: params.userId,
            foundryId: params.foundryId,
            microsoftEmail: params.microsoftEmail,
            scopes: params.scopes,
        })
        return { success: true }
    }

    // SECURITY: admin client — fallback for OAuth token upsert when RLS blocks, scoped by userId+foundryId params
    let adminClient
    try {
        adminClient = createAdminClient()
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error creating admin client'
        console.error('[MicrosoftTokens] Admin client creation failed:', msg)
        return { success: false, error: `${rlsError.message}; admin fallback: ${msg}` }
    }

    const { error: adminError } = await adminClient
        .from('microsoft_oauth_tokens')
        .upsert(payload, upsertOptions)

    if (adminError) {
        console.error('[MicrosoftTokens] Failed to save token (RLS and admin):', {
            userId: params.userId,
            foundryId: params.foundryId,
            rlsError: rlsError.message,
            adminError: adminError.message,
        })
        return { success: false, error: adminError.message }
    }

    console.info('[MicrosoftTokens] Token saved (admin client fallback):', {
        userId: params.userId,
        foundryId: params.foundryId,
        microsoftEmail: params.microsoftEmail,
        scopes: params.scopes,
    })
    return { success: true }
}

/**
 * Delete a user's Microsoft OAuth token (disconnect Microsoft account).
 *
 * @param userId - The authenticated user ID
 * @param foundryId - The active foundry ID
 * @returns Success status
 *
 * @audit Logs token_revoked event
 */
export async function deleteMicrosoftToken(
    userId: string,
    foundryId: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('microsoft_oauth_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('foundry_id', foundryId)

    if (error) {
        console.error('[MicrosoftTokens] Failed to delete token:', {
            userId,
            foundryId,
            error: error.message,
        })
        return { success: false, error: error.message }
    }

    // AUDIT: Log token revocation
    console.info('[MicrosoftTokens] Token revoked:', { userId, foundryId })

    return { success: true }
}

/**
 * Check if a token is expired or about to expire (within 5 minutes).
 *
 * @param token - The token record to check
 * @returns True if the token needs refreshing
 */
export function isMicrosoftTokenExpired(token: MicrosoftTokenRecord): boolean {
    const BUFFER_MS = 5 * 60 * 1000 // 5 minutes buffer
    const expiresAt = new Date(token.token_expires_at).getTime()
    return Date.now() >= expiresAt - BUFFER_MS
}
