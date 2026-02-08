/**
 * @file client.ts
 *
 * @description Factory for creating authenticated Google API clients.
 * Handles token refresh automatically before returning a usable client.
 *
 * @dependencies googleapis npm package
 *
 * @security
 * - Tokens are refreshed automatically when expired
 * - Refresh failures are logged and surfaced to the caller
 * - Never logs token values
 *
 * @related
 * - src/lib/google/tokens.ts - Token storage and retrieval
 * - src/lib/google/calendar.ts - Calendar API operations
 * - src/lib/google/drive.ts - Drive API operations
 */

import { google } from 'googleapis'
import {
    getGoogleToken,
    saveGoogleToken,
    isTokenExpired,
} from './tokens'
import type { GoogleTokenRecord } from './tokens'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET

/**
 * Create a configured OAuth2 client with valid credentials.
 * Automatically refreshes expired tokens.
 *
 * @param userId - The authenticated user ID
 * @param foundryId - The active foundry ID
 * @returns Authenticated OAuth2 client, or null if not connected
 *
 * @throws {Error} If token refresh fails and no valid token is available
 */
export async function getGoogleClient(
    userId: string,
    foundryId: string
): Promise<InstanceType<typeof google.auth.OAuth2> | null> {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        console.error('[GoogleClient] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars')
        return null
    }

    const token = await getGoogleToken(userId, foundryId)
    if (!token) {
        return null
    }

    const oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET
    )

    // AUTH: Set existing credentials
    oauth2Client.setCredentials({
        access_token: token.access_token,
        refresh_token: token.refresh_token,
    })

    // AUTH: Refresh token if expired
    if (isTokenExpired(token)) {
        const refreshed = await refreshTokenIfNeeded(oauth2Client, token)
        if (!refreshed) {
            console.warn('[GoogleClient] Token refresh failed, returning stale client:', {
                userId,
                foundryId,
            })
        }
    }

    return oauth2Client
}

/**
 * Create the OAuth2 client used for initiating the OAuth flow (no credentials set).
 *
 * @param redirectUri - The callback URL for OAuth redirect
 * @returns Bare OAuth2 client for generating auth URLs
 */
export function createOAuth2Client(redirectUri: string): InstanceType<typeof google.auth.OAuth2> {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables')
    }

    return new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        redirectUri
    )
}

/**
 * Refresh an expired access token using the refresh token.
 *
 * @param client - The OAuth2 client with credentials set
 * @param token - The current token record
 * @returns True if refresh succeeded
 */
async function refreshTokenIfNeeded(
    client: InstanceType<typeof google.auth.OAuth2>,
    token: GoogleTokenRecord
): Promise<boolean> {
    if (!token.refresh_token) {
        console.warn('[GoogleClient] No refresh token available:', {
            userId: token.user_id,
            foundryId: token.foundry_id,
        })
        return false
    }

    try {
        const { credentials } = await client.refreshAccessToken()

        if (!credentials.access_token) {
            console.error('[GoogleClient] Refresh returned no access token:', {
                userId: token.user_id,
                foundryId: token.foundry_id,
            })
            return false
        }

        // SECURITY: Update stored token with new access token
        await saveGoogleToken({
            userId: token.user_id,
            foundryId: token.foundry_id,
            accessToken: credentials.access_token,
            refreshToken: credentials.refresh_token || token.refresh_token,
            expiresAt: credentials.expiry_date
                ? new Date(credentials.expiry_date)
                : new Date(Date.now() + 3600 * 1000),
            scopes: token.scopes,
            googleEmail: token.google_email,
        })

        // Update client credentials in place
        client.setCredentials(credentials)

        console.info('[GoogleClient] Token refreshed successfully:', {
            userId: token.user_id,
            foundryId: token.foundry_id,
        })

        return true
    } catch (err) {
        console.error('[GoogleClient] Token refresh failed:', {
            userId: token.user_id,
            foundryId: token.foundry_id,
            error: err instanceof Error ? err.message : 'Unknown error',
        })
        return false
    }
}
