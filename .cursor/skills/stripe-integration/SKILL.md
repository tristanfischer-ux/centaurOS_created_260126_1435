---
name: stripe-integration
description: Patterns for Stripe integration including Connect accounts, payments, subscriptions, and webhooks. Use when implementing payment, stripe, billing, subscription, checkout, connect, or marketplace payment features.
---

# Stripe Integration Patterns

This skill provides patterns for integrating Stripe payments in ForgeOS.

## Reference Files

- `src/lib/stripe/client.ts` - Stripe client initialization
- `src/lib/stripe/connect.ts` - Connect account management
- `src/lib/billing/` - Billing utilities
- `src/app/api/webhooks/stripe/route.ts` - Webhook handler

---

## Architecture Overview

```
Stripe Integration Architecture:

┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│  Server Actions  │────▶│   Stripe API    │
│   Components    │     │  src/actions/    │     │                 │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │    Webhooks     │
                                                 │  /api/webhooks/ │
                                                 └────────┬────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │    Database     │
                                                 │   (Supabase)    │
                                                 └─────────────────┘
```

---

## 1. Stripe Client Setup

### Environment Variables

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Client Initialization

```typescript
// src/lib/stripe/client.ts
import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  typescript: true,
})

export interface StripeConnectAccount {
  id: string
  email: string | null
  charges_enabled: boolean
  payouts_enabled: boolean
  details_submitted: boolean
  requirements?: {
    currently_due: string[]
    eventually_due: string[]
    past_due: string[]
    pending_verification: string[]
  }
}
```

---

## 2. Connect Accounts (Marketplace)

### Create Connect Account

```typescript
// src/lib/stripe/connect.ts
export async function createConnectAccount(
  userId: string,
  email: string
): Promise<{ accountId: string; error: null } | { accountId: null; error: string }> {
  try {
    const account = await stripe.accounts.create({
      type: 'standard',  // or 'express' for simpler onboarding
      email,
      metadata: {
        user_id: userId,  // Link to your database
      },
    })

    return { accountId: account.id, error: null }
  } catch (error) {
    console.error('Error creating Connect account:', error)
    return {
      accountId: null,
      error: error instanceof Error ? error.message : 'Failed to create Connect account',
    }
  }
}
```

### Account Onboarding Link

```typescript
export async function createAccountLink(
  accountId: string,
  refreshUrl: string,  // URL if link expires
  returnUrl: string    // URL after completion
): Promise<{ url: string; error: null } | { url: null; error: string }> {
  try {
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    })

    return { url: accountLink.url, error: null }
  } catch (error) {
    return {
      url: null,
      error: error instanceof Error ? error.message : 'Failed to create account link',
    }
  }
}
```

### Check Account Status

```typescript
export async function getAccountStatus(accountId: string) {
  const account = await stripe.accounts.retrieve(accountId)
  
  return {
    id: account.id,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    details_submitted: account.details_submitted,
    requirements: account.requirements,
  }
}

export async function isAccountReady(accountId: string): Promise<boolean> {
  const status = await getAccountStatus(accountId)
  return status.charges_enabled && status.payouts_enabled && status.details_submitted
}
```

---

## 3. Payment Intent (One-Time Payments)

### Create Payment Intent

```typescript
export async function createPaymentIntent(
  amount: number,        // In smallest currency unit (cents)
  currency: string,      // 'gbp', 'usd', etc.
  metadata: Record<string, string>
) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency,
    metadata: {
      ...metadata,
      order_id: metadata.orderId,
      buyer_id: metadata.buyerId,
    },
    // For Connect marketplace with platform fee
    application_fee_amount: calculatePlatformFee(amount),
    transfer_data: {
      destination: metadata.sellerStripeAccountId,
    },
  })

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  }
}
```

### Frontend Payment Form

```tsx
'use client'

import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

function PaymentForm({ clientSecret }: { clientSecret: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setIsLoading(true)
    
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/orders/success`,
      },
    })

    if (error) {
      toast.error(error.message)
    }
    setIsLoading(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <Button type="submit" disabled={!stripe || isLoading}>
        {isLoading ? 'Processing...' : 'Pay Now'}
      </Button>
    </form>
  )
}

export function PaymentWrapper({ clientSecret }: { clientSecret: string }) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <PaymentForm clientSecret={clientSecret} />
    </Elements>
  )
}
```

---

## 4. Webhook Handler

### Webhook Route Setup

```typescript
// src/app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe/client'

export const dynamic = 'force-dynamic'

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: NextRequest) {
  // 1. Verify signature
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    const body = await request.text()
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // 2. Idempotency check (prevent duplicate processing)
  const { acquired, alreadyProcessed } = await acquireEventLock(event)
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, status: 'already_processed' })
  }
  if (!acquired) {
    return NextResponse.json({ received: true, status: 'processing' })
  }

  // 3. Handle event types
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent)
        break
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent)
        break
      case 'account.updated':
        await handleAccountUpdated(event.data.object as Stripe.Account)
        break
      // ... more event types
    }

    await markEventProcessed(event.id)
    return NextResponse.json({ received: true })
  } catch (error) {
    await markEventFailed(event.id, error.message)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
```

### Idempotency Pattern

```typescript
async function acquireEventLock(event: Stripe.Event) {
  const supabase = await createClient()
  
  // Try to insert event with ON CONFLICT handling
  const { data, error } = await supabase
    .from('stripe_events')
    .upsert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event.data.object,
      processed: false,
      processing_started_at: new Date().toISOString(),
    }, {
      onConflict: 'stripe_event_id',
      ignoreDuplicates: false,
    })
    .select('processed')
    .single()
  
  if (data?.processed) {
    return { acquired: false, alreadyProcessed: true }
  }
  
  return { acquired: !error, alreadyProcessed: false }
}
```

---

## 5. Fee Calculation

### Role-Based Platform Fees

```typescript
// src/lib/billing/fees.ts
export const FEE_TIERS = {
  executive: { standardFee: 8, retainerFee: 10 },
  founder: { standardFee: 8, retainerFee: 10 },
  apprentice: { standardFee: 5, retainerFee: 7 },  // Reduced to encourage hiring
  default: { standardFee: 8, retainerFee: 10 },
}

export async function calculateOrderFee(
  amount: number,
  sellerId: string,
  orderType: 'default' | 'retainer' = 'default'
) {
  const feePercent = await getSellerFeePercent(sellerId, orderType)
  const feeAmount = Math.round(amount * (feePercent / 100))
  const sellerAmount = amount - feeAmount
  
  return { feePercent, feeAmount, sellerAmount }
}
```

---

## 6. Subscriptions

### Create Subscription Checkout

```typescript
export async function createSubscriptionCheckout(
  userId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
) {
  // Get or create Stripe customer
  let customerId = await getStripeCustomerId(userId)
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { user_id: userId },
    })
    customerId = customer.id
    await saveStripeCustomerId(userId, customerId)
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
  })

  return { sessionId: session.id, url: session.url }
}
```

### Handle Subscription Events

```typescript
// In webhook handler
case 'customer.subscription.created':
case 'customer.subscription.updated':
  await handleSubscriptionUpdate(event.data.object as Stripe.Subscription)
  break
case 'customer.subscription.deleted':
  await handleSubscriptionCanceled(event.data.object as Stripe.Subscription)
  break
```

---

## 7. Security Checklist

### Webhook Security

- [ ] Verify webhook signature using `stripe.webhooks.constructEvent`
- [ ] Implement idempotency with atomic database lock
- [ ] Use `stripe_events` table to track processed events
- [ ] Return generic error messages (don't leak internal details)
- [ ] Validate payment amounts match database records

### Payment Security

- [ ] Always validate amounts server-side
- [ ] Store payment intent ID before redirecting to checkout
- [ ] Verify payment intent ID matches in webhook
- [ ] Check currency matches expected currency
- [ ] Use metadata to link payments to orders

### Connect Security

- [ ] Store `user_id` in Connect account metadata
- [ ] Validate seller owns the Connect account before transfers
- [ ] Check `charges_enabled` before creating payment intents
- [ ] Handle `account.updated` to track onboarding status

---

## 8. Database Schema

### stripe_events Table

```sql
CREATE TABLE stripe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  payload jsonb,
  processed boolean DEFAULT false,
  error text,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  processing_started_at timestamptz
);

CREATE INDEX idx_stripe_events_stripe_id ON stripe_events(stripe_event_id);
```

### Provider Stripe Fields

```sql
ALTER TABLE provider_profiles ADD COLUMN stripe_account_id text;
ALTER TABLE provider_profiles ADD COLUMN stripe_charges_enabled boolean DEFAULT false;
ALTER TABLE provider_profiles ADD COLUMN stripe_payouts_enabled boolean DEFAULT false;
ALTER TABLE provider_profiles ADD COLUMN stripe_onboarding_complete boolean DEFAULT false;
```

---

## 9. Testing

### Test Cards

```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
Requires Auth: 4000 0025 0000 3155
```

### Webhook Testing

```bash
# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Trigger test events
stripe trigger payment_intent.succeeded
stripe trigger account.updated
```

---

## Quick Reference

### Common Event Types

| Event | When Triggered |
|-------|---------------|
| `payment_intent.succeeded` | Payment completed |
| `payment_intent.payment_failed` | Payment failed |
| `account.updated` | Connect account changed |
| `transfer.created` | Funds sent to seller |
| `charge.dispute.created` | Chargeback filed |
| `payout.paid` | Funds in seller's bank |

### Amount Handling

- Stripe uses **smallest currency unit** (cents for USD/GBP)
- `$10.50` = `1050` in Stripe
- Always use `Math.round()` for fee calculations
- Display: `amount / 100` with currency formatter
