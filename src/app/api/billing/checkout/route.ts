/**
 * @file Billing Checkout API Route
 *
 * @description Creates a Stripe Checkout session for upgrading subscription tier.
 *
 * @security Requires authentication. Only creates sessions for the authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSubscriptionCheckout } from '@/lib/billing/subscriptions'
import type { SubscriptionTier } from '@/lib/billing/subscriptions'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // AUTH: Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // VALIDATION: Parse and validate request body
    const body = await request.json()
    const tier = body.tier as SubscriptionTier
    const billingPeriod = body.billingPeriod || 'monthly'

    if (!tier || !['starter', 'professional', 'enterprise'].includes(tier)) {
      return NextResponse.json(
        { error: 'Invalid tier. Must be starter, professional, or enterprise.' },
        { status: 400 }
      )
    }

    if (!['monthly', 'annual'].includes(billingPeriod)) {
      return NextResponse.json(
        { error: 'Invalid billing period. Must be monthly or annual.' },
        { status: 400 }
      )
    }

    const { url, error } = await createSubscriptionCheckout(
      user.id,
      tier,
      billingPeriod as 'monthly' | 'annual'
    )

    if (error || !url) {
      console.error('[BillingCheckout] Failed:', { userId: user.id, tier, error })
      return NextResponse.json(
        { error: error || 'Failed to create checkout session' },
        { status: 500 }
      )
    }

    return NextResponse.json({ url })
  } catch (error) {
    console.error('[BillingCheckout] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
