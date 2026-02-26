/**
 * @file client.ts
 *
 * @description Factory for creating authenticated Microsoft Graph API clients.
 * Unlike Google (which uses an OAuth2 client object), Microsoft Graph uses
 * Bearer tokens directly, so this module returns an access token string.
 * Handles token refresh automatically before returning a usable token.
 *
 * @security
 * - Tokens are refreshed automatically when expired
 * - Refresh failures are logged and surfaced to the caller
 * - Never logs token values
 *
 * @related
 * - src/lib/microsoft/tokens.ts - Token storage and retrieval
 */

import {
    getMicrosoftToken,
    saveMicrosoftToken,
    isMicrosoftTokenExpired,
} from './tokens'
import type { MicrosoftTokenRecord } from './tokens'

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET

/** Microsoft token endpoint for the common (multi-tenant) authority */
const MICROSOFT_TOKEN_ENDPOINT =
    'https://login.microsoftonline.com/common/oauth2/v2.0/token'

/**
 * Scopes requested during Microsoft OAuth.
 *
 * - openid, email, profile: identity claims
 * - offline_access: required to receive a refresh_token
 * - Files.ReadWrite: OneDrive file access
 * - Sites.ReadWrite.All: SharePoint site access
 */
export const MICROSOFT_SCOPES = [
    'openid',
    'email',
    'profile',
    'offline_access',
    'Files.ReadWrite',
    'Sites.ReadWrite.All',
] as const

/**
 * Get a valid Microsoft access token for a user-foundry pair.
 * Automatically refreshes expired tokens before returning.
 *
 * @param userId - The authenticated user ID
 * @param foundryId - The active foundry ID
 * @returns A valid access token string, or null if not connected
 *
 * @throws {Error} If token refresh fails and no valid token is available
 */
export async function getMicrosoftClient(
    userId: string,
    foundryId: string
): Promise<string | null> {
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
        console.error(
            '[MicrosoftClient] Missing MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET env vars'
        )
        return null
    }

    const token = await getMicrosoftToken(userId, foundryId)
    if (!token) {
        return null
    }

    // AUTH: Refresh token if expired
    if (isMicrosoftTokenExpired(token)) {
        const refreshed = await refreshMicrosoftToken(token)
        if (!refreshed) {
            console.error(
                '[MicrosoftClient] Token refresh failed, no valid token available:',
                {
                    userId,
                    foundryId,
                }
            )
            return null
        }
        return refreshed
    }

    return token.access_token
}

/**
 * Refresh an expired Microsoft access token using the refresh token.
 *
 * @param token - The current token record containing the refresh_token
 * @returns The new access token string if refresh succeeded, null otherwise
 *
 * @security Uses client_secret for confidential client authentication
 */
export async function refreshMicrosoftToken(
    token: MicrosoftTokenRecord
): Promise<string | null> {
    if (!token.refresh_token) {
        console.warn('[MicrosoftClient] No refresh token available:', {
            userId: token.user_id,
            foundryId: token.foundry_id,
        })
        return null
    }

    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
        console.error(
            '[MicrosoftClient] Missing MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET env vars'
        )
        return null
    }

    try {
        const body = new URLSearchParams({
            client_id: MICROSOFT_CLIENT_ID,
            client_secret: MICROSOFT_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: token.refresh_token,
            scope: MICROSOFT_SCOPES.join(' '),
        })

        const response = await fetch(MICROSOFT_TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        })

        if (!response.ok) {
            const errorBody = await response.text()
            console.error('[MicrosoftClient] Token refresh HTTP error:', {
                userId: token.user_id,
                foundryId: token.foundry_id,
                status: response.status,
                error: errorBody.slice(0, 500),
            })
            return null
        }

        const data = (await response.json()) as {
            access_token?: string
            refresh_token?: string
            expires_in?: number
        }

        if (!data.access_token) {
            console.error(
                '[MicrosoftClient] Refresh returned no access token:',
                {
                    userId: token.user_id,
                    foundryId: token.foundry_id,
                }
            )
            return null
        }

        // SECURITY: Update stored token with new access token
        await saveMicrosoftToken({
            userId: token.user_id,
            foundryId: token.foundry_id,
            accessToken: data.access_token,
            refreshToken: data.refresh_token || token.refresh_token,
            expiresAt: data.expires_in
                ? new Date(Date.now() + data.expires_in * 1000)
                : new Date(Date.now() + 3600 * 1000),
            scopes: token.scopes,
            microsoftEmail: token.microsoft_email,
        })

        console.info('[MicrosoftClient] Token refreshed successfully:', {
            userId: token.user_id,
            foundryId: token.foundry_id,
        })

        return data.access_token
    } catch (err) {
        console.error('[MicrosoftClient] Token refresh failed:', {
            userId: token.user_id,
            foundryId: token.foundry_id,
            error: err instanceof Error ? err.message : 'Unknown error',
        })
        return null
    }
}
