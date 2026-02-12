/**
 * @file Billing Portal API Route
 *
 * @description Creates a Stripe Billing Portal session for managing
 * subscription and payment methods.
 *
 * @security Requires authentication. Only creates sessions for the authenticated user.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createBillingPortalSession } from '@/lib/billing/subscriptions'
import { rateLimit } from '@/lib/security/rate-limit'

export async function POST(): Promise<NextResponse> {
  try {
    // AUTH: Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // SECURITY: Rate limit to prevent abuse
    const rateLimitResult = await rateLimit('api', `billing-portal:${user.id}`, { limit: 10, window: 60 * 1000 })
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before trying again.' },
        { status: 429 }
      )
    }

    const { url, error } = await createBillingPortalSession(user.id)

    if (error || !url) {
      console.error('[BillingPortal] Failed:', { userId: user.id, error })
      return NextResponse.json(
        { error: error || 'Failed to create billing portal session' },
        { status: 500 }
      )
    }

    return NextResponse.json({ url })
  } catch (error) {
    console.error('[BillingPortal] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
