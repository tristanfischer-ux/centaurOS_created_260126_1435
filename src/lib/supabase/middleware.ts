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
    '/api/health',
    '/api/webhooks',
    '/api/marketplace/preview',
    '/access-revoked',  // Access revoked page for deactivated users
]

// Routes that require admin (Executive/Founder) role
const ADMIN_ROUTES = [
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
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, {
                            ...options,
                            sameSite: 'lax', // Protect against CSRF
                            secure: isProduction, // HTTPS only in production
                            httpOnly: true, // Prevent XSS access to cookies
                            path: '/',
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

    // Special handling for app domain root: authenticated users go to dashboard
    if (hostname.includes('centauros.io') && pathname === '/') {
        if (user) {
            // User is logged in, redirect to dashboard
            const dashboardUrl = request.nextUrl.clone()
            dashboardUrl.pathname = '/dashboard'
            return NextResponse.redirect(dashboardUrl)
        }
        // User not logged in, let middleware below handle redirect to marketing
    }

    if (!user && !isPublicRoute) {
        // no user, redirect to login page on marketing domain
        const marketingDomain = process.env.NEXT_PUBLIC_MARKETING_DOMAIN || 'https://centaurdynamics.io'
        const loginUrl = new URL('/login', marketingDomain)
        return NextResponse.redirect(loginUrl)
    }

    // Security: Check if user is deactivated (is_active = false)
    // This happens when a user is offboarded or their access is revoked
    if (user && !isPublicRoute) {
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role, is_active')
            .eq('id', user.id)
            .single()
        
        // RED TEAM FIX: Handle case where profile doesn't exist yet (new user)
        // This can happen during signup flow - allow them through
        if (profileError && profileError.code !== 'PGRST116') {
            // Real error, not just "no rows returned"
            console.error(`[MIDDLEWARE] Failed to fetch profile for user ${user.id}:`, profileError)
            // Allow through rather than blocking - RLS will handle data access
        }
        
        // Check if user has been deactivated
        if (profile && profile.is_active === false) {
            // User has been deactivated - redirect to access revoked page
            console.warn(`[SECURITY] Deactivated user ${user.id} attempted to access ${pathname}`)
            const revokedUrl = request.nextUrl.clone()
            revokedUrl.pathname = '/access-revoked'
            return NextResponse.redirect(revokedUrl)
        }

        // Security: Check admin routes require proper role
        if (profile && ADMIN_ROUTES.some(route => pathname.startsWith(route))) {
            const isAdmin = profile.role === 'Executive' || profile.role === 'Founder'

            if (!isAdmin) {
                // User doesn't have admin access - redirect to dashboard with error
                console.warn(`[SECURITY] Non-admin user ${user.id} attempted to access ${pathname}`)
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = '/dashboard'
                redirectUrl.searchParams.set('error', 'Access denied')
                return NextResponse.redirect(redirectUrl)
            }
        }
    }

    return response
}
