/**
 * @file route.ts
 *
 * @description Initiates the Google OAuth flow. Generates an authorization URL
 * and redirects the user to Google's consent screen.
 *
 * @security
 * - Requires authenticated user
 * - Uses state parameter with user/foundry IDs to prevent CSRF
 * - Requests only scopes needed for enabled features
 * - Forces consent prompt to always get refresh_token
 *
 * @related src/app/api/google/callback/route.ts - Handles the OAuth callback
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { createOAuth2Client } from '@/lib/google/client'
import { getScopesForFeatures } from '@/lib/google/scopes'
import { buildOAuthStatePayload, createSignedOAuthState } from '@/lib/security/oauth-state'
import { rateLimit } from '@/lib/security/rate-limit'

export async function GET(req: NextRequest): Promise<NextResponse> {
    const origin = req.nextUrl.origin

    /**
     * Redirect back to the Google Apps page with an error code.
     * Since this route is navigated to via <a href>, returning JSON
     * would cause the browser to download a file instead of displaying it.
     */
    function redirectWithError(errorCode: string): NextResponse {
        const redirectUrl = new URL('/google-apps', origin)
        redirectUrl.searchParams.set('error', errorCode)
        return NextResponse.redirect(redirectUrl)
    }

    // AUTH: Verify the user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.redirect(new URL('/login', origin))
    }

    // SECURITY: Limit OAuth connect initiations per user to reduce abuse.
    const rateLimitResult = await rateLimit('api', `google-connect:${user.id}`, {
        limit: 20,
        window: 10 * 60 * 1000,
    })
    if (!rateLimitResult.success) {
        return redirectWithError('rate_limited')
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
        return redirectWithError('no_foundry')
    }

    // Determine which features to request scopes for
    const featuresParam = req.nextUrl.searchParams.get('features') || 'calendar'
    const features = featuresParam.split(',').filter(
        (f): f is 'calendar' | 'drive' | 'gmail' => ['calendar', 'drive', 'gmail'].includes(f)
    )

    const scopes = getScopesForFeatures(features.length > 0 ? features : ['calendar'])

    // Build the redirect URI based on the current host
    const redirectUri = `${origin}/api/google/callback`

    // SECURITY: Catch missing env vars gracefully instead of throwing
    let oauth2Client: ReturnType<typeof createOAuth2Client>
    try {
        oauth2Client = createOAuth2Client(redirectUri)
    } catch (err) {
        console.error('[GoogleConnect] Failed to create OAuth client:', {
            error: err instanceof Error ? err.message : 'Unknown error',
        })
        return redirectWithError('not_configured')
    }

    // SECURITY: Sign OAuth state to prevent tampering between connect and callback.
    const oauthStateSecret = process.env.GOOGLE_OAUTH_STATE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET
    if (!oauthStateSecret) {
        console.error('[GoogleConnect] Missing OAuth state signing secret')
        return redirectWithError('not_configured')
    }

    const statePayload = buildOAuthStatePayload({ userId: user.id, foundryId, requestedScopes: scopes })
    const stateEncoded = createSignedOAuthState(statePayload, oauthStateSecret)

    console.info('[GoogleConnect] Initiating OAuth flow:', {
        userId: user.id,
        foundryId,
        redirectUri,
        features,
        scopeCount: scopes.length,
    })

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        state: stateEncoded,
        prompt: 'consent', // Force consent to always get refresh_token
        include_granted_scopes: true,
    })

    const response = NextResponse.redirect(authUrl)

    // Store optional post-connect redirect path in a short-lived cookie
    // so the callback route can redirect back to the originating page
    const postConnectRedirect = req.nextUrl.searchParams.get('redirect')
    if (postConnectRedirect && postConnectRedirect.startsWith('/')) {
        response.cookies.set('google_oauth_redirect', postConnectRedirect, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 600, // 10 minutes — matches state TTL
            path: '/',
        })
    }

    return response
}
