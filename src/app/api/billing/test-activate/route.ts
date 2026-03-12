/**
 * @file Test Subscription Activation Endpoint
 *
 * @description Simulates a Stripe webhook subscription activation by directly
 * upserting a user_subscriptions row. This allows end-to-end testing of the
 * billing flow without a real Stripe account or products configured.
 *
 * @security Requires explicit test-mode enablement and shared-secret auth.
 * Also disabled automatically when real Stripe products are configured.
 * Requires authentication — only activates for the current user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rate-limit'
import type { SubscriptionTier } from '@/lib/billing/subscriptions'

const VALID_TIERS: SubscriptionTier[] = ['starter', 'professional', 'enterprise']

/**
 * Verifies whether test subscription activation is explicitly enabled and authorized.
 *
 * @description Enforces fail-closed access controls for the test activation endpoint.
 * Requires ALLOW_TEST_BILLING_ACTIVATION=true and a matching bearer token in
 * TEST_BILLING_SECRET.
 *
 * @param {NextRequest} request - Incoming API request
 * @returns {NextResponse | null} Failure response or null when authorized
 *
 * @security Requires explicit opt-in + shared secret
 */
function verifyTestBillingAccess(request: NextRequest): NextResponse | null {
  const allowTestBilling = process.env.ALLOW_TEST_BILLING_ACTIVATION === 'true'
  if (!allowTestBilling) {
    return NextResponse.json(
      { error: 'Test billing activation is disabled' },
      { status: 403 }
    )
  }

  const testBillingSecret = process.env.TEST_BILLING_SECRET
  if (!testBillingSecret) {
    console.error('[TestActivate] TEST_BILLING_SECRET is not configured')
    return NextResponse.json(
      { error: 'Test billing secret not configured' },
      { status: 503 }
    )
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${testBillingSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // SECURITY: Only available in test mode. If a live Stripe secret key is
  // configured, test activation must be disabled. Test keys (sk_test_*) are
  // allowed so dev/staging environments retain access to this endpoint.
  if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')) {
    return NextResponse.json(
      { error: 'Test mode is disabled when Stripe is configured' },
      { status: 403 }
    )
  }

  const authFailure = verifyTestBillingAccess(request)
  if (authFailure) {
    return authFailure
  }

  try {
    // AUTH: Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // SECURITY: Rate limit to prevent abuse
    const rateLimitResult = await rateLimit('api', `test-activate:${user.id}`, { limit: 3, window: 60 * 1000 })
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before trying again.' },
        { status: 429 }
      )
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
