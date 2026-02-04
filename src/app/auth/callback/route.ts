import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Auth callback handler for email confirmation and magic links.
 * When users click the verification link in their email, they are redirected here.
 * This route exchanges the code for a session and redirects to the dashboard.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/objectives'
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

      // Redirect based on account type first, then role
      let redirectPath = next
      
      // Suppliers go to supplier portal
      if (profile?.account_type === 'supplier') {
        redirectPath = '/supplier-portal'
      } else {
        // Check if user has marketplace orders (buyer)
        const { count: orderCount } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('buyer_id', user.id)

        if (orderCount && orderCount > 0) {
          // User is a buyer with orders, redirect to buyer dashboard
          redirectPath = '/buyer'
        } else {
          // All other users go to objectives page to see "Discover ForgeOS" objective
          redirectPath = '/objectives'
        }
      }
      }

      // Redirect to the appropriate page with a success message
      const redirectUrl = new URL(redirectPath, requestUrl.origin)
      redirectUrl.searchParams.set('verified', 'true')
      return NextResponse.redirect(redirectUrl)
    }
  }

  // No code provided, redirect to login
  const loginUrl = new URL('/login', requestUrl.origin)
  return NextResponse.redirect(loginUrl)
}
