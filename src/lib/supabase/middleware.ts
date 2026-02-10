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

    // Special handling for app domain root: authenticated users go to their portal
    if ((hostname.includes('centauros.io') || hostname.includes('forgeos.io')) && pathname === '/') {
        if (user) {
            // Check user's account type and active foundry to determine redirect
            const { data: profile } = await supabase
                .from('profiles')
                .select('account_type, active_foundry_id')
                .eq('id', user.id)
                .single()
            
            const redirectUrl = request.nextUrl.clone()
            
            // Suppliers go to supplier portal
            if (profile?.account_type === 'supplier') {
                redirectUrl.pathname = '/supplier-portal'
                return NextResponse.redirect(redirectUrl)
            }
            
            // Check foundry membership count for multi-foundry users
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { count } = await (supabase as any)
                .from('foundry_memberships')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
            
            const foundryCount = count || 0
            
            // Multiple foundries without active selection - show picker
            if (foundryCount > 1 && !profile?.active_foundry_id) {
                redirectUrl.pathname = '/workspace-picker'
                return NextResponse.redirect(redirectUrl)
            }
            
            // Otherwise go to dashboard (or last visited page from cookie)
            const lastVisited = request.cookies.get('forge-last-path')?.value
            redirectUrl.pathname = lastVisited && lastVisited !== '/' && lastVisited !== '/dashboard' ? lastVisited : '/updates'
            return NextResponse.redirect(redirectUrl)
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
            .select('role, is_active, account_type')
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

        // Security: Check company admin routes require Founder/Executive role
        if (profile && COMPANY_ADMIN_ROUTES.some(route => pathname.startsWith(route))) {
            const isCompanyAdmin = profile.role === 'Executive' || profile.role === 'Founder'

            if (!isCompanyAdmin) {
                // User doesn't have company admin access - redirect with error
                console.warn(`[SECURITY] Non-admin user ${user.id} attempted to access ${pathname}`)
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = '/timeline'
                redirectUrl.searchParams.set('error', 'Access denied')
                return NextResponse.redirect(redirectUrl)
            }
        }

        // Route suppliers to supplier portal for platform-only routes
        // Suppliers can access: /supplier-portal/*, /marketplace, /help, /settings
        if (profile?.account_type === 'supplier') {
            const supplierAllowedRoutes = [
                '/supplier-portal',
                '/marketplace',
                '/help',
                '/rfq', // Allow viewing RFQs
                '/profile', // Public profiles
            ]
            
            const isAllowedForSupplier = supplierAllowedRoutes.some(route => 
                pathname === route || pathname.startsWith(`${route}/`)
            )
            
            if (!isAllowedForSupplier && !pathname.startsWith('/api/')) {
                // Check for potential redirect loop by examining referer
                const referer = request.headers.get('referer')
                if (referer?.includes('/supplier-portal')) {
                    // Already tried supplier-portal, don't redirect back (prevents loop)
                    console.warn('[Middleware] Potential redirect loop detected for supplier, allowing access to:', pathname)
                    return response
                }
                
                // Supplier trying to access platform routes - redirect to supplier portal
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = '/supplier-portal'
                return NextResponse.redirect(redirectUrl)
            }
        }
    }

    return response
}
