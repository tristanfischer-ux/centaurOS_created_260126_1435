import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { Database } from '@/types/database.types'

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
    '/',  // Marketing homepage
    '/login',
    '/auth',
    '/auth/callback',  // Email verification callback
    '/join',
    '/invite',
    '/experts',  // Public expert directory (SEO)
    '/expert',   // Individual expert profiles (SEO)
    '/api/health',
    '/api/waitlist',  // One-click approve/reject from email (token-signed)
    '/api/webhooks',
    '/api/dev-login',  // Dev-only auto-login for AI agents/tests (returns 404 in production)
    '/access-revoked',  // Access revoked page for deactivated users
    '/workspace-picker', // Multi-foundry workspace selector
]

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

    // ── Unauthenticated users ──────────────────────────────────────────
    if (!user && !isPublicRoute) {
        const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || 'https://fractionalforge.app'
        const loginUrl = new URL('/login', appDomain)
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

            // Suppliers go to supplier portal
            if (profile.account_type === 'supplier') {
                redirectUrl.pathname = '/supplier-portal'
                return NextResponse.redirect(redirectUrl)
            }

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
            const lastVisited = request.cookies.get('forge-last-path')?.value
            redirectUrl.pathname = lastVisited && lastVisited !== '/' && lastVisited !== '/dashboard' ? lastVisited : '/today'
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

        // Route suppliers to supplier portal for platform-only routes
        if (profile?.account_type === 'supplier') {
            const supplierAllowedRoutes = [
                '/supplier-portal',
                '/marketplace',
                '/help',
                '/rfq',
                '/profile',
            ]

            const isAllowedForSupplier = supplierAllowedRoutes.some(route =>
                pathname === route || pathname.startsWith(`${route}/`)
            )

            // SECURITY: Restrict supplier API access to an explicit allowlist
            const supplierAllowedApiRoutes = [
                '/api/marketplace', '/api/rfq', '/api/messages',
                '/api/billing', '/api/webhooks', '/api/google',
                '/api/settings', '/api/health', '/api/shared',
            ]
            const isAllowedApiForSupplier = supplierAllowedApiRoutes.some(route =>
                pathname === route || pathname.startsWith(`${route}/`)
            )

            if (!isAllowedForSupplier && !isAllowedApiForSupplier) {
                const referer = request.headers.get('referer')
                if (referer?.includes('/supplier-portal')) {
                    console.warn('[Middleware] Potential redirect loop detected for supplier, allowing access to:', pathname)
                    return response
                }

                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = '/supplier-portal'
                return NextResponse.redirect(redirectUrl)
            }
        }
    }

    return response
}
