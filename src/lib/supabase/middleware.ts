import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { Database } from '@/types/database.types'

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
    '/',  // Marketing homepage
    '/login',
    '/auth',
    '/auth/callback',  // Email verification callback
    '/signup',  // Canonical signup URL (industry convention)
    '/join',  // Legacy alias — redirects to /signup
    '/invite',
    '/experts',  // Public expert directory (SEO)
    '/expert',   // Individual expert profiles (SEO)
    '/api/health',
    '/api/waitlist',  // One-click approve/reject from email (token-signed)
    '/api/webhooks',
    '/api/dev-login',  // Dev-only auto-login for AI agents/tests (returns 404 in production)
    '/api/cron',  // Cron endpoints (Bearer secret auth at route level — see lib/security/cron-auth.ts)
    '/api/autopilot-step',  // Internal autopilot stage hop (FORGE_RENDER_STAGE_SECRET Bearer at route)
    '/api/render-stage',  // Internal per-module render hop (same secret as autopilot-step)
    '/access-revoked',  // Access revoked page for deactivated users
    '/workspace-picker', // Multi-foundry workspace selector
    '/claim',  // Public listing claim flow (outreach)
    '/forgot-password',  // Password reset request
    '/update-password',  // Set new password (after reset link)
    '/pricing',  // Public pricing page
    '/techniques',  // Public manufacturing techniques explorer (SEO)
    '/demo',  // Public demo page
    '/blog',  // Public blog (content group)
    '/api/admin/dashboard',  // Standalone admin dashboard (own password gate)
    '/api/admin/snapshot-pdf',  // Agent-callable PDF download (CRON_SECRET Bearer at route)
]

// RED-TEAM-PIVOT-PLAN Tier 2 step 14: anonymous /investors landing. The
// page itself lives in (public-investors)/investors/page.tsx with its own
// layout that does not enforce auth, so middleware doesn't strictly need to
// know about /investors — but we mark it here too as a defence-in-depth
// guard. If a future refactor accidentally moves /investors back under the
// (platform) group, this check prevents the middleware-level login redirect
// from kicking in. Exact-match only — `/investors/[id]/*` stays gated.
// Kept separate from PUBLIC_ROUTES because that list permits nested-path
// matching, which we explicitly do not want for /investors.
const ANONYMOUS_INVESTORS_PATH = '/investors'

// Routes that require company admin (Executive/Founder) role
// Note: Platform ops (/ops/*) is handled separately via subdomain isolation
const COMPANY_ADMIN_ROUTES = [
    '/admin',
]

export async function updateSession(request: NextRequest) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!url || !key) {
        throw new Error('Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required')
    }

    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    const isProduction = process.env.NODE_ENV === 'production'
    
    const supabase = createServerClient<Database>(url, key, {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    // SECURITY: Set secure cookie attributes
                    // domain is set to parent domain in production to enable
                    // cross-subdomain auth (main app + ops subdomain)
                    const cookieDomain = isProduction 
                        ? (process.env.COOKIE_DOMAIN || undefined)
                        : undefined
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, {
                            ...options,
                            sameSite: 'lax', // Protect against CSRF
                            secure: isProduction, // HTTPS only in production
                            httpOnly: true, // Prevent XSS access to cookies
                            path: '/',
                            ...(cookieDomain ? { domain: cookieDomain } : {}),
                        })
                    )
                },
            },
        }
    )

    const {
        data: { user },
    } = await supabase.auth.getUser()

    const pathname = request.nextUrl.pathname
    const hostname = request.headers.get('host') || ''

    // Check if route is public (use exact matching to prevent bypass attacks)
    const isPublicRoute = PUBLIC_ROUTES.some(route => {
        // Exact match
        if (pathname === route) return true
        // Match with trailing slash
        if (pathname === `${route}/`) return true
        // Match nested paths under the route (e.g., /api/webhooks/stripe matches /api/webhooks)
        if (pathname.startsWith(`${route}/`)) return true
        return false
    })

    // FLOW: /investors is publicly accessible at the EXACT path only — the
    // page itself renders an anonymous teaser variant when there's no user.
    // /investors/[id] is intentionally NOT included so deep dives stay gated.
    const isAnonymousInvestorsLanding =
        pathname === ANONYMOUS_INVESTORS_PATH ||
        pathname === `${ANONYMOUS_INVESTORS_PATH}/`

    // ── Unauthenticated users ──────────────────────────────────────────
    if (!user && !isPublicRoute && !isAnonymousInvestorsLanding) {
        // Stay on the CURRENT host for the login bounce. Previously this
        // redirected to NEXT_PUBLIC_APP_DOMAIN (hardcoded
        // https://fractionalforge.app) which broke preview deploys:
        // anyone clicking a preview URL got kicked to production login,
        // signed in there, and never reached the preview they wanted
        // to test. Using request.nextUrl.origin keeps them on the same
        // domain (vercel.app preview → preview login, fractionalforge.app
        // → prod login, forgeos.io → that host's login) — which is what
        // the caller wants in every case. Legacy-domain bounces (centauros.io
        // → fractionalforge.app) happen earlier in the root middleware,
        // not here.
        const loginUrl = new URL('/login', request.nextUrl.origin)
        loginUrl.searchParams.set('redirect', pathname)
        return NextResponse.redirect(loginUrl)
    }

    // ── Authenticated user routing ──────────────────────────────────────
    // PERF: Single profile query covers root redirect, deactivation check,
    // admin gating, and supplier routing. Only runs for authenticated users
    // on non-public routes (skipped for API routes, static assets, etc.)
    if (user && !isPublicRoute) {
        const isAppDomainRoot = (hostname.includes('fractionalforge.app') || hostname.includes('forgeos.io')) && pathname === '/'
        const needsAdminCheck = COMPANY_ADMIN_ROUTES.some(route => pathname.startsWith(route))

        // Single profile query — select all fields needed for every check
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role, is_active, account_type, active_foundry_id')
            .eq('id', user.id)
            .single()

        // RED TEAM FIX: Handle case where profile doesn't exist yet (new user)
        // PGRST116 = "no rows returned" — expected for brand-new signups
        if (profileError && profileError.code !== 'PGRST116') {
            console.error(`[MIDDLEWARE] Failed to fetch profile for user ${user.id}:`, profileError)
            // SECURITY: Block access when profile check fails — don't rely solely on RLS
            return new NextResponse('Service temporarily unavailable', { status: 503 })
        }

        // SECURITY: Check if user has been deactivated
        if (profile && profile.is_active === false) {
            console.warn(`[SECURITY] Deactivated user ${user.id} attempted to access ${pathname}`)
            const revokedUrl = request.nextUrl.clone()
            revokedUrl.pathname = '/access-revoked'
            return NextResponse.redirect(revokedUrl)
        }

        // App domain root: redirect authenticated users to their portal
        if (isAppDomainRoot && profile) {
            const redirectUrl = request.nextUrl.clone()

            // DECISION 2026-04-16: founder-first architecture. Every authenticated
            // user lands on the founder side. Supplier / fractional-executive are
            // opt-in flags, not separate routing paths. The supplier divert is gone.

            // PERF: Foundry membership count only runs for root "/" redirect
            // (not on every page load like before)
            const { count } = await supabase
                .from('foundry_memberships')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)

            const foundryCount = count || 0

            // Multiple foundries — always show workspace picker
            if (foundryCount > 1) {
                redirectUrl.pathname = '/workspace-picker'
                return NextResponse.redirect(redirectUrl)
            }

            // Otherwise go to last visited page or /today
            // SECURITY: Validate last-path to prevent open redirect via cookie manipulation
            const lastVisited = request.cookies.get('forge-last-path')?.value
            const safePath = (lastVisited && lastVisited.startsWith('/') && !lastVisited.startsWith('//') && lastVisited !== '/' && lastVisited !== '/dashboard')
              ? lastVisited
              : '/today'
            redirectUrl.pathname = safePath
            return NextResponse.redirect(redirectUrl)
        }

        // SECURITY: Check company admin routes require Founder/Executive role
        if (profile && needsAdminCheck) {
            const isCompanyAdmin = profile.role === 'Executive' || profile.role === 'Founder'

            if (!isCompanyAdmin) {
                console.warn(`[SECURITY] Non-admin user ${user.id} attempted to access ${pathname}`)
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = '/timeline'
                redirectUrl.searchParams.set('error', 'Access denied')
                return NextResponse.redirect(redirectUrl)
            }
        }

        // DECISION 2026-04-16: founder-first architecture. The supplier
        // route-allowlist gate (and the fence that redirected non-allowlisted
        // paths back to /supplier-portal) has been removed. Suppliers now have
        // the full platform available; the supplier-specific pages will be
        // rehomed under a sidebar section in Phase 3.
    }

    return response
}
