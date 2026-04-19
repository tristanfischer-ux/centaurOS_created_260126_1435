
import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { maybeRedirectLegacyPlan } from '@/lib/plan/legacy-redirects'

/**
 * Root middleware for fractionalforge.app
 *
 * @description Single-domain architecture — marketing and app share one domain.
 * This middleware handles:
 * 1. Ops subdomain isolation (ops.fractionalforge.app)
 * 2. Auth session refresh (delegated to Supabase middleware)
 *
 * Cross-domain redirects are no longer needed since marketing (/join/*)
 * and app (/dashboard, /tasks, etc.) live on the same domain.
 */
export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl
    const hostname = request.headers.get('host') || ''
    
    // SECURITY: Block /ops/* routes on the main domain entirely.
    // The ops dashboard is only accessible via the ops subdomain.
    // Returns 404 so it looks like the route doesn't exist.
    const isOpsDomain = hostname.startsWith('ops.')
    if (!isOpsDomain && pathname.startsWith('/ops')) {
        return NextResponse.rewrite(new URL('/not-found', request.url))
    }
    
    // OPS SUBDOMAIN: Restrict to /ops/* routes only
    if (isOpsDomain) {
        // Root redirect to /ops dashboard
        if (pathname === '/') {
            return NextResponse.redirect(new URL('/ops', request.url))
        }
        // Allow /ops/*, /api/*, /_next/*, /login, /auth/* (for auth flow)
        const isAllowedOnOps = 
            pathname.startsWith('/ops') || 
            pathname.startsWith('/api') || 
            pathname.startsWith('/_next') ||
            pathname === '/login' ||
            pathname.startsWith('/auth')
        if (!isAllowedOnOps) {
            return NextResponse.redirect(new URL('/ops', request.url))
        }
    }

    // Legacy domain redirects: redirect old domains to fractionalforge.app
    if (
        hostname.includes('centauros.io') ||
        hostname.includes('centaurdynamics.io')
    ) {
        const newUrl = new URL(pathname + request.nextUrl.search, 'https://fractionalforge.app')
        return NextResponse.redirect(newUrl, 301)
    }

    // Products Pre-Phase Coming Soon sidecar — redirect deep links to legacy read-only.
    // /products/[id] (any id not "legacy") → /products/legacy/[id]
    // Runs BEFORE any layout so the redirect is a true HTTP 307. Next.js App Router
    // otherwise swallows page.tsx redirect() calls when the parent ProductsLayout
    // commits render via the Coming Soon route gate (verified 2026-04-19 final agent-
    // browser pass P1 — page-level redirect returned 200 with Coming Soon body instead
    // of a 307). Doing the redirect here at edge time is the correct Next 15 pattern.
    // Temporary: removed when Phase 4 Products ships and the sidecar is torn down.
    if (pathname.startsWith('/products/')) {
        const deepLink = pathname.match(/^\/products\/([^/]+)\/?$/)
        if (deepLink && deepLink[1] !== 'legacy') {
            return NextResponse.redirect(
                new URL(`/products/legacy/${deepLink[1]}`, request.url),
                307,
            )
        }
    }

    // PLAN-SCHEMA §A.3 — redirect legacy Plan routes (/strategy /new-objectives
    // /new-tasks /review /reports /red-team /knowledge) to /plan/* ONLY when
    // the user has new_plan_experience=true. Flag OFF users keep rendering
    // legacy pages untouched.
    const planRedirect = await maybeRedirectLegacyPlan(request)
    if (planRedirect) return planRedirect

    // Continue with auth middleware
    return await updateSession(request)
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
