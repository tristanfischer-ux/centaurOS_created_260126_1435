/**
 * @file route.ts
 *
 * @description Handles the Microsoft OAuth callback after user grants consent.
 * Exchanges the authorization code for tokens and stores them.
 *
 * @security
 * - Validates signed state parameter to prevent CSRF
 * - Verifies authenticated user matches the state
 * - Verifies user belongs to state-scoped foundry
 * - Stores tokens in microsoft_oauth_tokens table
 * - Never logs token values
 *
 * @audit Logs microsoft_account_connected event
 * @related src/app/api/microsoft/connect/route.ts - Initiates the flow
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { saveMicrosoftToken } from '@/lib/microsoft/tokens'
import { MICROSOFT_SCOPES } from '@/lib/microsoft/client'
import { verifySignedOAuthState } from '@/lib/security/oauth-state'
import { rateLimit } from '@/lib/security/rate-limit'

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET

/** Microsoft token endpoint for the common (multi-tenant) authority */
const MICROSOFT_TOKEN_ENDPOINT =
    'https://login.microsoftonline.com/common/oauth2/v2.0/token'

/** Microsoft Graph user info endpoint */
const MICROSOFT_GRAPH_ME_ENDPOINT = 'https://graph.microsoft.com/v1.0/me'

export async function GET(req: NextRequest): Promise<NextResponse> {
    const code = req.nextUrl.searchParams.get('code')
    const stateParam = req.nextUrl.searchParams.get('state')
    const errorParam = req.nextUrl.searchParams.get('error')
    const origin = req.nextUrl.origin

    // Handle user denying consent
    if (errorParam) {
        console.warn('[MicrosoftCallback] User denied consent:', errorParam)
        return NextResponse.redirect(
            new URL('/settings/integrations?error=consent_denied', origin)
        )
    }

    if (!code || !stateParam) {
        return NextResponse.redirect(
            new URL('/settings/integrations?error=missing_params', origin)
        )
    }

    // AUTH: Verify the user is still authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.redirect(
            new URL('/login?redirect=/settings/integrations', origin)
        )
    }

    // SECURITY: Throttle callback handling per user to reduce replay abuse.
    const rateLimitResult = await rateLimit('api', `microsoft-callback:${user.id}`, {
        limit: 30,
        window: 10 * 60 * 1000,
    })
    if (!rateLimitResult.success) {
        return NextResponse.redirect(
            new URL('/settings/integrations?error=rate_limited', origin)
        )
    }

    // SECURITY: Validate signed state parameter to prevent CSRF/tampering.
    // Prefers a dedicated secret; falls back to MICROSOFT_CLIENT_SECRET with a warning.
    const oauthStateSecret =
        process.env.MICROSOFT_OAUTH_STATE_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET
    if (!process.env.MICROSOFT_OAUTH_STATE_SECRET && process.env.MICROSOFT_CLIENT_SECRET) {
        console.warn(
            '[SECURITY] MICROSOFT_OAUTH_STATE_SECRET not set — falling back to MICROSOFT_CLIENT_SECRET. Set a dedicated secret to eliminate this warning.'
        )
    }
    if (!oauthStateSecret) {
        console.error('[SECURITY] No OAuth state signing secret available')
        return NextResponse.redirect(
            new URL('/settings/integrations?error=not_configured', origin)
        )
    }

    const stateData = verifySignedOAuthState(stateParam, oauthStateSecret, 10 * 60 * 1000)
    if (!stateData) {
        console.error('[MicrosoftCallback] Invalid or expired state parameter')
        return NextResponse.redirect(
            new URL('/settings/integrations?error=state_invalid', origin)
        )
    }

    // SECURITY: Ensure the state user matches the authenticated user
    if (stateData.userId !== user.id) {
        console.error('[MicrosoftCallback] State user mismatch:', {
            stateUserId: stateData.userId,
            authUserId: user.id,
        })
        return NextResponse.redirect(
            new URL('/settings/integrations?error=user_mismatch', origin)
        )
    }

    // AUTH: Ensure user belongs to state-scoped foundry to prevent context tampering.
    const { data: membership } = await supabase
        .from('foundry_memberships')
        .select('foundry_id')
        .eq('user_id', user.id)
        .eq('foundry_id', stateData.foundryId)
        .maybeSingle()

    if (!membership) {
        console.error('[MicrosoftCallback] State foundry mismatch for user:', {
            userId: user.id,
            foundryId: stateData.foundryId,
        })
        return NextResponse.redirect(
            new URL('/settings/integrations?error=foundry_mismatch', origin)
        )
    }

    // SECURITY: Verify env vars are available for token exchange
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
        console.error('[MicrosoftCallback] Missing MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET')
        return NextResponse.redirect(
            new URL('/settings/integrations?error=not_configured', origin)
        )
    }

    // Exchange authorization code for tokens
    const redirectUri = `${origin}/api/microsoft/callback`

    try {
        const tokenBody = new URLSearchParams({
            client_id: MICROSOFT_CLIENT_ID,
            client_secret: MICROSOFT_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            scope: MICROSOFT_SCOPES.join(' '),
        })

        const tokenResponse = await fetch(MICROSOFT_TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenBody.toString(),
        })

        if (!tokenResponse.ok) {
            const errorBody = await tokenResponse.text()
            console.error('[MicrosoftCallback] Token exchange HTTP error:', {
                status: tokenResponse.status,
                error: errorBody.slice(0, 500),
            })
            return NextResponse.redirect(
                new URL('/settings/integrations?error=exchange_failed', origin)
            )
        }

        const tokens = (await tokenResponse.json()) as {
            access_token?: string
            refresh_token?: string
            expires_in?: number
            scope?: string
        }

        if (!tokens.access_token) {
            console.error('[MicrosoftCallback] No access token received')
            return NextResponse.redirect(
                new URL('/settings/integrations?error=no_token', origin)
            )
        }

        // Fetch the user's Microsoft email from Graph API; fallback to Supabase email
        let microsoftEmail = user.email || 'unknown'
        try {
            const meResponse = await fetch(MICROSOFT_GRAPH_ME_ENDPOINT, {
                headers: { Authorization: `Bearer ${tokens.access_token}` },
            })

            if (meResponse.ok) {
                const meData = (await meResponse.json()) as {
                    mail?: string
                    userPrincipalName?: string
                }
                // DECISION: Prefer `mail` over `userPrincipalName` because mail is the
                // user's actual email, while UPN may be an org-specific identifier.
                microsoftEmail = meData.mail || meData.userPrincipalName || microsoftEmail
            } else {
                console.warn('[MicrosoftCallback] Could not fetch Microsoft user info:', {
                    status: meResponse.status,
                })
            }
        } catch (infoErr) {
            console.warn(
                '[MicrosoftCallback] Could not fetch Microsoft user info, using Supabase email:',
                {
                    error: infoErr instanceof Error ? infoErr.message : 'Unknown',
                }
            )
        }

        // Scopes: Use state-requested scopes as the base, merge with token response
        const base =
            stateData.requestedScopes && stateData.requestedScopes.length > 0
                ? stateData.requestedScopes
                : [...MICROSOFT_SCOPES]
        const tokenScopes = tokens.scope?.trim() ? tokens.scope.trim().split(/\s+/) : []
        const scopesToSave =
            tokenScopes.length > 0 ? [...new Set([...base, ...tokenScopes])] : base

        if (scopesToSave.length > 0) {
            console.info('[MicrosoftCallback] Scopes to save:', {
                tokenScopeCount: tokenScopes.length,
                baseCount: base.length,
                finalScopeCount: scopesToSave.length,
            })
        }

        // Store the token
        const saveResult = await saveMicrosoftToken({
            userId: user.id,
            foundryId: stateData.foundryId,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            expiresAt: tokens.expires_in
                ? new Date(Date.now() + tokens.expires_in * 1000)
                : new Date(Date.now() + 3600 * 1000),
            scopes: scopesToSave,
            microsoftEmail,
        })

        if (!saveResult.success) {
            console.error('[MicrosoftCallback] Failed to save token:', saveResult.error)
            const saveErrorUrl = new URL('/settings/integrations', origin)
            saveErrorUrl.searchParams.set('error', 'save_failed')
            saveErrorUrl.searchParams.set(
                'detail',
                (saveResult.error || 'Unknown save error').slice(0, 200)
            )
            return NextResponse.redirect(saveErrorUrl)
        }

        // AUDIT: Log successful connection
        console.info('[MicrosoftCallback] Microsoft account connected:', {
            userId: user.id,
            foundryId: stateData.foundryId,
            microsoftEmail,
        })

        // Read optional post-connect redirect from cookie
        const postRedirect = req.cookies.get('microsoft_oauth_redirect')?.value
        const redirectPath =
            postRedirect && postRedirect.startsWith('/')
                ? `${postRedirect}?success=connected`
                : '/settings/integrations?success=connected'

        const response = NextResponse.redirect(new URL(redirectPath, origin))

        // Clear the redirect cookie
        response.cookies.delete('microsoft_oauth_redirect')

        return response
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        console.error('[MicrosoftCallback] Token exchange failed:', {
            error: errorMessage,
            origin,
            redirectUri,
        })
        const errorUrl = new URL('/settings/integrations', origin)
        errorUrl.searchParams.set('error', 'exchange_failed')
        errorUrl.searchParams.set('detail', errorMessage.slice(0, 200))
        return NextResponse.redirect(errorUrl)
    }
}
