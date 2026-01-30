
import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Marketing routes that should stay on centaurdynamics.io
const MARKETING_ROUTES = ['/', '/join']

// Get domain configuration
const MARKETING_DOMAIN = process.env.NEXT_PUBLIC_MARKETING_DOMAIN || 'https://centaurdynamics.io'
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'https://centauros.io'

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl
    const hostname = request.headers.get('host') || ''
    
    // Determine if this is a marketing route
    const isMarketingRoute = MARKETING_ROUTES.some(route => 
        pathname === route || pathname.startsWith(`${route}/`)
    )
    
    // Special handling for login: if on marketing domain, redirect to app domain
    if (hostname.includes('centaurdynamics.io') && pathname === '/login') {
        const url = new URL('/login', APP_DOMAIN)
        return NextResponse.redirect(url)
    }
    
    // If on app domain (centauros.io) and trying to access marketing routes
    if (hostname.includes('centauros.io') && isMarketingRoute) {
        const url = new URL(pathname + request.nextUrl.search, MARKETING_DOMAIN)
        return NextResponse.redirect(url)
    }
    
    // If on marketing domain (centaurdynamics.io) and trying to access app routes (not login)
    if (hostname.includes('centaurdynamics.io') && !isMarketingRoute && pathname !== '/login') {
        const url = new URL(pathname + request.nextUrl.search, APP_DOMAIN)
        return NextResponse.redirect(url)
    }
    
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
