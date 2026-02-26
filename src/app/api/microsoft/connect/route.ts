/**
 * @file route.ts
 *
 * @description Initiates the Microsoft OAuth flow. Generates an authorization URL
 * and redirects the user to Microsoft's consent screen.
 *
 * @security
 * - Requires authenticated user
 * - Uses signed state parameter with user/foundry IDs to prevent CSRF
 * - Requests only scopes needed for enabled features
 * - Forces consent prompt to always get refresh_token
 *
 * @related src/app/api/microsoft/callback/route.ts - Handles the OAuth callback
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { MICROSOFT_SCOPES } from '@/lib/microsoft/client'
import { buildOAuthStatePayload, createSignedOAuthState } from '@/lib/security/oauth-state'
import { rateLimit } from '@/lib/security/rate-limit'

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID

/** Microsoft authorization endpoint for the common (multi-tenant) authority */
const MICROSOFT_AUTH_ENDPOINT =
    'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'

export async function GET(req: NextRequest): Promise<NextResponse> {
    const origin = req.nextUrl.origin

    /**
     * Redirect back to the integrations settings page with an error code.
     * Since this route is navigated to via <a href>, returning JSON
     * would cause the browser to download a file instead of displaying it.
     */
    function redirectWithError(errorCode: string): NextResponse {
        const redirectUrl = new URL('/settings/integrations', origin)
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
    const rateLimitResult = await rateLimit('api', `microsoft-connect:${user.id}`, {
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

    // SECURITY: Catch missing env vars gracefully instead of throwing
    if (!MICROSOFT_CLIENT_ID) {
        console.error('[MicrosoftConnect] Missing MICROSOFT_CLIENT_ID env var')
        return redirectWithError('not_configured')
    }

    // Build the redirect URI based on the current host
    const redirectUri = `${origin}/api/microsoft/callback`

    // SECURITY: Sign OAuth state to prevent tampering between connect and callback.
    // Prefers a dedicated secret; falls back to MICROSOFT_CLIENT_SECRET with a warning
    // so the app stays functional while the dedicated env var is provisioned.
    const oauthStateSecret =
        process.env.MICROSOFT_OAUTH_STATE_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET
    if (!process.env.MICROSOFT_OAUTH_STATE_SECRET && process.env.MICROSOFT_CLIENT_SECRET) {
        console.warn(
            '[SECURITY] MICROSOFT_OAUTH_STATE_SECRET not set — falling back to MICROSOFT_CLIENT_SECRET. Set a dedicated secret to eliminate this warning.'
        )
    }
    if (!oauthStateSecret) {
        console.error('[SECURITY] No OAuth state signing secret available')
        return redirectWithError('not_configured')
    }

    const scopes = [...MICROSOFT_SCOPES]
    const statePayload = buildOAuthStatePayload({
        userId: user.id,
        foundryId,
        requestedScopes: scopes,
    })
    const stateEncoded = createSignedOAuthState(statePayload, oauthStateSecret)

    console.info('[MicrosoftConnect] Initiating OAuth flow:', {
        userId: user.id,
        foundryId,
        redirectUri,
        scopeCount: scopes.length,
    })

    // Build Microsoft authorization URL
    const authUrl = new URL(MICROSOFT_AUTH_ENDPOINT)
    authUrl.searchParams.set('client_id', MICROSOFT_CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', scopes.join(' '))
    authUrl.searchParams.set('state', stateEncoded)
    authUrl.searchParams.set('prompt', 'consent') // Force consent to always get refresh_token

    const response = NextResponse.redirect(authUrl.toString())

    // Store optional post-connect redirect path in a short-lived cookie
    // so the callback route can redirect back to the originating page
    const postConnectRedirect = req.nextUrl.searchParams.get('redirect')
    if (postConnectRedirect && postConnectRedirect.startsWith('/')) {
        response.cookies.set('microsoft_oauth_redirect', postConnectRedirect, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 600, // 10 minutes — matches state TTL
            path: '/',
        })
    }

    return response
}
