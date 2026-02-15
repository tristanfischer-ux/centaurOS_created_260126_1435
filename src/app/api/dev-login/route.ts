/**
 * @file dev-login/route.ts — Development-only auto-login for AI agents and test scripts.
 *
 * @description Programmatically authenticates a test user and redirects to any
 * protected page. This eliminates the login-page blocker that prevents AI agents
 * (browser-use subagents, Playwright, curl) from testing authenticated features
 * like The Forge pipeline.
 *
 * Usage:
 *   GET /api/dev-login?role=founder&redirect=/the-forge/cad-lab
 *
 * Supported roles: founder, executive, apprentice, supplier
 * Default role: founder | Default redirect: /today
 *
 * @security HARD-GATED to development only. Returns 404 in production.
 *   Uses real Supabase signInWithPassword — creates a genuine session with
 *   valid cookies. All middleware, RLS, and role checks still apply.
 *   No credentials in source code — reads from TEST_* env vars in .env.local.
 */

import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { getClientIP, rateLimit } from '@/lib/security/rate-limit'
import type { Database } from '@/types/database.types'

/** Maps role names to the env-var keys holding test credentials. */
const ROLE_CREDENTIALS: Record<string, { emailVar: string; passwordVar: string }> = {
  founder: { emailVar: 'TEST_FOUNDER_EMAIL', passwordVar: 'TEST_FOUNDER_PASSWORD' },
  executive: { emailVar: 'TEST_EXECUTIVE_EMAIL', passwordVar: 'TEST_EXECUTIVE_PASSWORD' },
  apprentice: { emailVar: 'TEST_APPRENTICE_EMAIL', passwordVar: 'TEST_APPRENTICE_PASSWORD' },
  supplier: { emailVar: 'TEST_SUPPLIER_EMAIL', passwordVar: 'TEST_SUPPLIER_PASSWORD' },
}

/**
 * Validates the redirect path to prevent open-redirect attacks.
 *
 * @param path - The requested redirect destination
 * @returns A safe relative path (always starts with /)
 *
 * @security Only allows relative paths — blocks protocol-relative and absolute URLs.
 */
function sanitizeRedirectPath(path: string | null): string {
  const defaultPath = '/today'
  if (!path) return defaultPath
  // SECURITY: Must be a relative path, not an absolute URL or protocol-relative URL
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
    return defaultPath
  }
  return path
}

/**
 * Auto-login endpoint for development/testing.
 *
 * @param request - GET request with optional `role` and `redirect` query params
 * @returns Redirect to the target page with valid Supabase session cookies
 *
 * @security Returns 404 in production (NODE_ENV === 'production')
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // SECURITY: Hard block in production — returns 404, not 403, to leak nothing
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // SECURITY: Require explicit opt-in for dev-login support.
  if (process.env.ALLOW_DEV_LOGIN !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // SECURITY: Require shared secret for development auto-login endpoint.
  const devLoginSecret = process.env.DEV_LOGIN_SECRET
  if (!devLoginSecret) {
    console.error('[DEV-LOGIN] DEV_LOGIN_SECRET is not configured')
    return NextResponse.json({ error: 'Dev login secret not configured' }, { status: 503 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${devLoginSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // SECURITY: Rate limit endpoint to reduce credential abuse in dev/test environments.
  const ip = getClientIP(request.headers)
  const rateLimitResult = await rateLimit('api', `dev-login:${ip}`, {
    limit: 20,
    window: 60 * 1000,
  })
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before retrying dev login.' },
      { status: 429 },
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return NextResponse.json(
      { error: 'Missing Supabase environment variables' },
      { status: 500 },
    )
  }

  // VALIDATION: Parse query params
  const requestUrl = new URL(request.url)
  const role = requestUrl.searchParams.get('role') || 'founder'
  const redirect = sanitizeRedirectPath(requestUrl.searchParams.get('redirect'))

  const creds = ROLE_CREDENTIALS[role]
  if (!creds) {
    return NextResponse.json(
      { error: `Invalid role "${role}". Valid: ${Object.keys(ROLE_CREDENTIALS).join(', ')}` },
      { status: 400 },
    )
  }

  const email = process.env[creds.emailVar]
  const password = process.env[creds.passwordVar]

  if (!email || !password) {
    return NextResponse.json(
      {
        error: `Test credentials not configured for role "${role}". Set ${creds.emailVar} and ${creds.passwordVar} in .env.local`,
      },
      { status: 500 },
    )
  }

  // Build the redirect response FIRST so the Supabase SSR client can write
  // session cookies directly onto it via the setAll callback.
  const redirectUrl = new URL(redirect, request.url)
  const response = NextResponse.redirect(redirectUrl)

  // Create a Supabase SSR client whose cookie adapter writes to our response.
  // This mirrors the pattern in src/lib/supabase/middleware.ts and guarantees
  // the chunked cookie format (@supabase/ssr) is identical to a normal login.
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, {
            ...options,
            httpOnly: true,
            sameSite: 'lax',
            secure: false, // Dev mode — no HTTPS
            path: '/',
          })
        })
      },
    },
  })

  // AUTH: Sign in with real Supabase credentials — creates a genuine session
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    console.error('[DEV-LOGIN] Sign-in failed:', { role, email, error: error.message })
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 401 },
    )
  }

  console.info('[DEV-LOGIN] Authenticated:', { role, email, redirect })

  return response
}
