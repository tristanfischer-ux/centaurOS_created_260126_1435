/**
 * @file tokens.ts
 *
 * @description Manages Google OAuth token storage, retrieval, and refresh.
 * Tokens are stored per-user, per-foundry in the google_oauth_tokens table.
 *
 * @security Tokens are stored in the database. In production, use Supabase Vault
 * or application-level encryption for the access_token and refresh_token columns.
 * @audit Token creation, refresh, and revocation are logged.
 *
 * @related src/lib/google/client.ts - Consumes tokens to create API clients
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface GoogleTokenRecord {
    id: string
    user_id: string
    foundry_id: string
    access_token: string
    refresh_token: string | null
    token_expires_at: string
    scopes: string[]
    google_email: string
    created_at: string
    updated_at: string
}

export interface SaveTokenParams {
    userId: string
    foundryId: string
    accessToken: string
    refreshToken: string | null
    expiresAt: Date
    scopes: string[]
    googleEmail: string
}

/**
 * Retrieve the Google OAuth token for a user in their active foundry.
 *
 * @param userId - The authenticated user ID
 * @param foundryId - The active foundry ID
 * @returns The token record or null if not connected
 */
export async function getGoogleToken(
    userId: string,
    foundryId: string
): Promise<GoogleTokenRecord | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('google_oauth_tokens')
        .select('*')
        .eq('user_id', userId)
        .eq('foundry_id', foundryId)
        .single()

    if (error || !data) {
        if (error && error.code !== 'PGRST116') {
            console.error('[GoogleTokens] Failed to fetch token:', {
                userId,
                foundryId,
                error: error.message,
            })
        }
        return null
    }

    return data as GoogleTokenRecord
}

/**
 * Save or update a Google OAuth token for a user-foundry pair.
 * Uses upsert to handle both new connections and token refreshes.
 *
 * @param params - Token data to save
 * @returns Success status
 *
 * @audit Logs token_saved event
 */
export async function saveGoogleToken(
    params: SaveTokenParams
): Promise<{ success: boolean; error?: string }> {
    // SECURITY: Use admin client to bypass RLS for server-side token storage.
    // The caller (OAuth callback) has already verified the user's identity
    // via the signed state parameter, so RLS is not needed here.
    // The cookie-based client's auth.uid() may not be available during
    // the OAuth redirect round-trip, causing silent RLS INSERT failures.
    const supabase = createAdminClient()

    const { error } = await supabase
        .from('google_oauth_tokens')
        .upsert(
            {
                user_id: params.userId,
                foundry_id: params.foundryId,
                access_token: params.accessToken,
                refresh_token: params.refreshToken,
                token_expires_at: params.expiresAt.toISOString(),
                scopes: params.scopes,
                google_email: params.googleEmail,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,foundry_id' }
        )

    if (error) {
        console.error('[GoogleTokens] Failed to save token:', {
            userId: params.userId,
            foundryId: params.foundryId,
            error: error.message,
        })
        return { success: false, error: error.message }
    }

    // AUDIT: Log token save
    console.info('[GoogleTokens] Token saved:', {
        userId: params.userId,
        foundryId: params.foundryId,
        googleEmail: params.googleEmail,
        scopes: params.scopes,
    })

    return { success: true }
}

/**
 * Delete a user's Google OAuth token (disconnect Google account).
 *
 * @param userId - The authenticated user ID
 * @param foundryId - The active foundry ID
 * @returns Success status
 *
 * @audit Logs token_revoked event
 */
export async function deleteGoogleToken(
    userId: string,
    foundryId: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    // Also delete all calendar sync mappings for this user-foundry
    await supabase
        .from('calendar_sync_mappings')
        .delete()
        .eq('user_id', userId)
        .eq('foundry_id', foundryId)

    const { error } = await supabase
        .from('google_oauth_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('foundry_id', foundryId)

    if (error) {
        console.error('[GoogleTokens] Failed to delete token:', {
            userId,
            foundryId,
            error: error.message,
        })
        return { success: false, error: error.message }
    }

    // AUDIT: Log token revocation
    console.info('[GoogleTokens] Token revoked:', { userId, foundryId })

    return { success: true }
}

/**
 * Check if a token is expired or about to expire (within 5 minutes).
 *
 * @param token - The token record to check
 * @returns True if the token needs refreshing
 */
export function isTokenExpired(token: GoogleTokenRecord): boolean {
    const BUFFER_MS = 5 * 60 * 1000 // 5 minutes buffer
    const expiresAt = new Date(token.token_expires_at).getTime()
    return Date.now() >= expiresAt - BUFFER_MS
}
