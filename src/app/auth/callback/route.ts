import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { setupNewUser } from '@/lib/auth/setup-new-user'
import { escapeHtml } from '@/lib/security/sanitize'

/**
 * Validates redirect path to prevent open redirect attacks.
 * Only allows relative paths (starting with /) that don't redirect to external domains.
 *
 * @security Prevents open redirect via crafted next= parameter
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
 * Auth callback handler for email confirmation, magic links, and OAuth.
 * When users click the verification link or return from Google OAuth,
 * they are redirected here. This route exchanges the code for a session
 * and redirects to the dashboard.
 *
 * For NEW OAuth users (no profile yet): reads the forge_signup_context
 * cookie to determine their role, then calls setupNewUser() to create
 * profile/foundry/memberships/demo data.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = sanitizeRedirectPath(requestUrl.searchParams.get('next'))
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')

  // Handle auth errors from Supabase
  if (error) {
    console.error('Auth callback error:', error, errorDescription)
    const loginUrl = new URL('/login', requestUrl.origin)
    loginUrl.searchParams.set('error', errorDescription || error)
    return NextResponse.redirect(loginUrl)
  }

  if (code) {
    const supabase = await createClient()

    // Exchange the code for a session
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      console.error('Error exchanging code for session:', exchangeError)
      const loginUrl = new URL('/login', requestUrl.origin)
      loginUrl.searchParams.set('error', 'Failed to verify email. Please try again.')
      return NextResponse.redirect(loginUrl)
    }

    // Get the user to check their role for appropriate redirect
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      // Fetch user profile to get role and account type
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, account_type')
        .eq('id', user.id)
        .single()

      // NEW USER via OAuth — no profile exists yet
      if (!profile) {
        console.info('[Auth Callback] New OAuth user, setting up profile:', user.id)

        // Read signup context from cookie (set by GoogleOAuthButton before redirect)
        const cookieStore = await cookies()
        const contextCookie = cookieStore.get('forge_signup_context')
        let signupRole: 'founder' | 'executive' | 'apprentice' | 'supplier' = 'apprentice'
        let companyName: string | undefined
        let signupIndustry: string | undefined
        let signupStage: string | undefined

        if (contextCookie?.value) {
          try {
            const ctx = JSON.parse(decodeURIComponent(contextCookie.value))
            if (ctx.role && ['founder', 'executive', 'apprentice', 'supplier'].includes(ctx.role)) {
              signupRole = ctx.role
            }
            companyName = ctx.companyName
            signupIndustry = ctx.industry
            signupStage = ctx.stage
          } catch (e) {
            console.warn('[Auth Callback] Failed to parse signup context cookie:', e)
          }
        }

        // SECURITY: Sanitize all user-derived values before DB writes
        const rawName = user.user_metadata?.full_name
          || user.user_metadata?.name
          || user.email?.split('@')[0]
          || 'User'
        const fullName = escapeHtml(String(rawName).trim().slice(0, 100))
        const sanitizedCompany = companyName ? escapeHtml(String(companyName).trim().slice(0, 100)) : undefined
        const sanitizedIndustry = signupIndustry ? escapeHtml(String(signupIndustry).trim().slice(0, 100)) : undefined
        const sanitizedStage = signupStage ? escapeHtml(String(signupStage).trim().slice(0, 100)) : undefined

        // Read referral code from cookie (set via ?ref= on join page)
        const referralCode = cookieStore.get('forge_ref')?.value || null

        const { redirectPath } = await setupNewUser({
          supabase,
          userId: user.id,
          email: user.email || '',
          fullName,
          role: signupRole,
          companyName: sanitizedCompany,
          industry: sanitizedIndustry,
          stage: sanitizedStage,
          referralCode,
        })

        // Honor `next` param for claim flow — user needs to land on /claim/<token>
        const finalRedirect = (next !== '/today' && next.startsWith('/')) ? next : redirectPath

        // Clear signup cookies
        const response = NextResponse.redirect(new URL(finalRedirect, requestUrl.origin))
        response.cookies.set('forge_signup_context', '', { path: '/', maxAge: 0 })
        response.cookies.set('forge_ref', '', { path: '/', maxAge: 0 })
        return response
      }

      // EXISTING USER — redirect based on account type and role
      let redirectPath = next

      // Suppliers go to supplier portal
      if (profile.account_type === 'supplier') {
        redirectPath = '/supplier-portal'
      } else if (profile.role === 'Founder' || profile.role === 'Executive' || profile.role === 'Apprentice') {
        redirectPath = '/today'
      } else {
        // Check if user has marketplace orders (buyer)
        const { count: orderCount } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('buyer_id', user.id)

        if (orderCount && orderCount > 0) {
          redirectPath = '/buyer'
        } else {
          redirectPath = '/today'
        }
      }

      const redirectUrl = new URL(redirectPath, requestUrl.origin)
      redirectUrl.searchParams.set('verified', 'true')
      return NextResponse.redirect(redirectUrl)
    }
  }

  // No code provided, redirect to login
  const loginUrl = new URL('/login', requestUrl.origin)
  return NextResponse.redirect(loginUrl)
}
