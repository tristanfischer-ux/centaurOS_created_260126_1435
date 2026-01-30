import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { Database } from '@/types/database.types'

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
    '/',  // Marketing homepage
    '/login',
    '/auth',
    '/join',
    '/invite',
    '/api/health',
    '/api/webhooks',
    '/api/marketplace/preview',
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
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
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

    // Check if route is public
    const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route))

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

    // Security: Check admin routes require proper role
    if (user && ADMIN_ROUTES.some(route => pathname.startsWith(route))) {
        // Fetch user's role from profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        const isAdmin = profile?.role === 'Executive' || profile?.role === 'Founder'

        if (!isAdmin) {
            // User doesn't have admin access - redirect to dashboard with error
            console.warn(`[SECURITY] Non-admin user ${user.id} attempted to access ${pathname}`)
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/dashboard'
            redirectUrl.searchParams.set('error', 'Access denied')
            return NextResponse.redirect(redirectUrl)
        }
    }

    return response
}
