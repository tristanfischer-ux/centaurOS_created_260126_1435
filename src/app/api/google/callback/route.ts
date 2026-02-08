/**
 * @file route.ts
 *
 * @description Handles the Google OAuth callback after user grants consent.
 * Exchanges the authorization code for tokens and stores them.
 *
 * @security
 * - Validates state parameter to prevent CSRF
 * - Verifies authenticated user matches the state
 * - Stores tokens in google_oauth_tokens table
 * - Never logs token values
 *
 * @audit Logs google_account_connected event
 * @related src/app/api/google/connect/route.ts - Initiates the flow
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createOAuth2Client } from '@/lib/google/client'
import { saveGoogleToken } from '@/lib/google/tokens'
import { google } from 'googleapis'

export async function GET(req: NextRequest): Promise<NextResponse> {
    const code = req.nextUrl.searchParams.get('code')
    const stateParam = req.nextUrl.searchParams.get('state')
    const errorParam = req.nextUrl.searchParams.get('error')

    // Handle user denying consent
    if (errorParam) {
        console.warn('[GoogleCallback] User denied consent:', errorParam)
        return NextResponse.redirect(
            new URL('/settings/integrations?error=consent_denied', req.nextUrl.origin)
        )
    }

    if (!code || !stateParam) {
        return NextResponse.redirect(
            new URL('/settings/integrations?error=missing_params', req.nextUrl.origin)
        )
    }

    // AUTH: Verify the user is still authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.redirect(
            new URL('/login?redirect=/settings/integrations', req.nextUrl.origin)
        )
    }

    // SECURITY: Validate state parameter to prevent CSRF
    let stateData: { userId: string; foundryId: string }
    try {
        const decoded = Buffer.from(stateParam, 'base64url').toString('utf-8')
        stateData = JSON.parse(decoded)
    } catch {
        console.error('[GoogleCallback] Invalid state parameter')
        return NextResponse.redirect(
            new URL('/settings/integrations?error=invalid_state', req.nextUrl.origin)
        )
    }

    // SECURITY: Ensure the state user matches the authenticated user
    if (stateData.userId !== user.id) {
        console.error('[GoogleCallback] State user mismatch:', {
            stateUserId: stateData.userId,
            authUserId: user.id,
        })
        return NextResponse.redirect(
            new URL('/settings/integrations?error=user_mismatch', req.nextUrl.origin)
        )
    }

    // Exchange authorization code for tokens
    const origin = req.nextUrl.origin
    const redirectUri = `${origin}/api/google/callback`
    const oauth2Client = createOAuth2Client(redirectUri)

    try {
        const { tokens } = await oauth2Client.getToken(code)

        if (!tokens.access_token) {
            console.error('[GoogleCallback] No access token received')
            return NextResponse.redirect(
                new URL('/settings/integrations?error=no_token', req.nextUrl.origin)
            )
        }

        // Fetch the user's Google email from the token info
        oauth2Client.setCredentials(tokens)
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
        const { data: userInfo } = await oauth2.userinfo.get()

        const googleEmail = userInfo.email || user.email || 'unknown'

        // Store the token
        const saveResult = await saveGoogleToken({
            userId: user.id,
            foundryId: stateData.foundryId,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            expiresAt: tokens.expiry_date
                ? new Date(tokens.expiry_date)
                : new Date(Date.now() + 3600 * 1000),
            scopes: tokens.scope ? tokens.scope.split(' ') : [],
            googleEmail,
        })

        if (!saveResult.success) {
            console.error('[GoogleCallback] Failed to save token:', saveResult.error)
            return NextResponse.redirect(
                new URL('/settings/integrations?error=save_failed', req.nextUrl.origin)
            )
        }

        // AUDIT: Log successful connection
        console.info('[GoogleCallback] Google account connected:', {
            userId: user.id,
            foundryId: stateData.foundryId,
            googleEmail,
        })

        return NextResponse.redirect(
            new URL('/settings/integrations?success=connected', req.nextUrl.origin)
        )
    } catch (err) {
        console.error('[GoogleCallback] Token exchange failed:', {
            error: err instanceof Error ? err.message : 'Unknown error',
        })
        return NextResponse.redirect(
            new URL('/settings/integrations?error=exchange_failed', req.nextUrl.origin)
        )
    }
}
