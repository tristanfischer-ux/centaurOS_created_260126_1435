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

export async function GET(req: NextRequest): Promise<NextResponse> {
    // AUTH: Verify the user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    // SECURITY: State parameter encodes user+foundry for CSRF protection
    const state = JSON.stringify({ userId: user.id, foundryId })
    const stateEncoded = Buffer.from(state).toString('base64url')

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        state: stateEncoded,
        prompt: 'consent', // Force consent to always get refresh_token
        include_granted_scopes: true,
    })

    return NextResponse.redirect(authUrl)
}
