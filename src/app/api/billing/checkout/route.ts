/**
 * @file Billing Checkout API Route
 *
 * @description Creates a Stripe Checkout session for upgrading subscription tier.
 *
 * @security Requires authentication. Only creates sessions for the authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createSubscriptionCheckout } from '@/lib/billing/subscriptions'
import { rateLimit } from '@/lib/security/rate-limit'

// VALIDATION: Zod schema prevents invalid tier and billing period values
const checkoutSchema = z.object({
  tier: z.enum(['starter', 'professional', 'enterprise']),
  billingPeriod: z.enum(['monthly', 'annual']).default('monthly'),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // AUTH: Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // SECURITY: Rate limit to prevent abuse
    const rateLimitResult = await rateLimit('api', `billing-checkout:${user.id}`, { limit: 5, window: 60 * 1000 })
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before trying again.' },
        { status: 429 }
      )
    }

    // VALIDATION: Parse and validate request body with Zod schema
    const body = await request.json()
    const parsed = checkoutSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { tier, billingPeriod } = parsed.data

    console.log('[BillingCheckout] Creating session:', { userId: user.id, tier, billingPeriod })

    const { url, error } = await createSubscriptionCheckout(
      user.id,
      tier,
      billingPeriod
    )

    if (error || !url) {
      console.error('[BillingCheckout] Failed:', { userId: user.id, tier, billingPeriod, error })
      return NextResponse.json(
        { error: error || 'Failed to create checkout session' },
        { status: 500 }
      )
    }

    console.log('[BillingCheckout] Session created, redirecting to Stripe')
    return NextResponse.json({ url })
  } catch (error) {
    const err = error as { message?: string; type?: string; code?: string }
    console.error('[BillingCheckout] Unexpected error:', {
      message: err.message,
      type: err.type,
      code: err.code,
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined,
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
