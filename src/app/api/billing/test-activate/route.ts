/**
 * @file Test Subscription Activation Endpoint
 *
 * @description Simulates a Stripe webhook subscription activation by directly
 * upserting a user_subscriptions row. This allows end-to-end testing of the
 * billing flow without a real Stripe account or products configured.
 *
 * @security Only available when STRIPE_PRICE_STARTER_MONTHLY is NOT set.
 * When real Stripe products are configured, this endpoint returns 403.
 * Requires authentication — only activates for the current user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SubscriptionTier } from '@/lib/billing/subscriptions'

const VALID_TIERS: SubscriptionTier[] = ['starter', 'professional', 'enterprise']

export async function POST(request: NextRequest): Promise<NextResponse> {
  // SECURITY: Only available in test mode (no Stripe prices configured)
  if (process.env.STRIPE_PRICE_STARTER_MONTHLY) {
    return NextResponse.json(
      { error: 'Test mode is disabled when Stripe is configured' },
      { status: 403 }
    )
  }

  try {
    // AUTH: Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // VALIDATION: Parse and validate tier
    const body = await request.json()
    const tier = body.tier as SubscriptionTier

    if (!tier || !VALID_TIERS.includes(tier)) {
      return NextResponse.json(
        { error: 'Invalid tier. Must be starter, professional, or enterprise.' },
        { status: 400 }
      )
    }

    // Simulate subscription activation — upsert user_subscriptions row
    // SECURITY: Use admin client to bypass RLS (same pattern as webhook handler)
    const adminClient = createAdminClient()
    const now = new Date()
    const periodEnd = new Date(now)
    periodEnd.setMonth(periodEnd.getMonth() + 1)

    const { error: upsertError } = await adminClient
      .from('user_subscriptions')
      .upsert(
        {
          user_id: user.id,
          stripe_subscription_id: `test_sub_${Date.now()}`,
          stripe_customer_id: `test_cus_${user.id.slice(0, 8)}`,
          tier,
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
        },
        { onConflict: 'user_id' }
      )

    if (upsertError) {
      console.error('[TestActivate] Failed to upsert subscription:', {
        userId: user.id,
        tier,
        error: upsertError.message,
      })
      return NextResponse.json(
        { error: 'Failed to activate test subscription' },
        { status: 500 }
      )
    }

    console.info('[TestActivate] Test subscription activated:', {
      userId: user.id,
      tier,
    })

    return NextResponse.json({
      success: true,
      tier,
      message: `Test subscription activated: ${tier}`,
    })
  } catch (error) {
    console.error('[TestActivate] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
