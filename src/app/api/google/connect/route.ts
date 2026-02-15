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
    // AUTH: Verify the user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // SECURITY: Limit OAuth connect initiations per user to reduce abuse.
    const rateLimitResult = await rateLimit('api', `google-connect:${user.id}`, {
        limit: 20,
        window: 10 * 60 * 1000,
    })
    if (!rateLimitResult.success) {
        return NextResponse.json(
            { error: 'Rate limit exceeded. Please try again shortly.' },
            { status: 429 }
        )
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
        return NextResponse.json({ error: 'No active foundry' }, { status: 400 })
    }

    // Determine which features to request scopes for
    const featuresParam = req.nextUrl.searchParams.get('features') || 'calendar'
    const features = featuresParam.split(',').filter(
        (f): f is 'calendar' | 'drive' | 'gmail' => ['calendar', 'drive', 'gmail'].includes(f)
    )

    const scopes = getScopesForFeatures(features.length > 0 ? features : ['calendar'])

    // Build the redirect URI based on the current host
    const origin = req.nextUrl.origin
    const redirectUri = `${origin}/api/google/callback`

    const oauth2Client = createOAuth2Client(redirectUri)

    // SECURITY: Sign OAuth state to prevent tampering between connect and callback.
    const oauthStateSecret = process.env.GOOGLE_OAUTH_STATE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET
    if (!oauthStateSecret) {
        console.error('[GoogleConnect] Missing OAuth state signing secret')
        return NextResponse.json({ error: 'OAuth state signing not configured' }, { status: 503 })
    }

    const statePayload = buildOAuthStatePayload({ userId: user.id, foundryId })
    const stateEncoded = createSignedOAuthState(statePayload, oauthStateSecret)

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        state: stateEncoded,
        prompt: 'consent', // Force consent to always get refresh_token
        include_granted_scopes: true,
    })

    return NextResponse.redirect(authUrl)
}
