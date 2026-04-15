import Stripe from 'stripe'

// DECISION: Simple lazy singleton instead of Proxy pattern.
// The Proxy approach caused StripeConnectionError on Vercel serverless
// because Proxy forwarding doesn't preserve the Stripe SDK's internal
// HTTP agent and connection pooling correctly in bundled environments.
let stripeInstance: Stripe | null = null

/**
 * Get the Stripe client. Lazily initializes on first call.
 * Use this function instead of the `stripe` export if you need
 * guaranteed direct access to the Stripe instance.
 */
export function getStripe(): Stripe {
  if (!stripeInstance) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim()
    if (!stripeSecretKey) {
      throw new Error('Missing STRIPE_SECRET_KEY environment variable')
    }
    stripeInstance = new Stripe(stripeSecretKey, {
      typescript: true,
    })
  }
  return stripeInstance
}

// Backward-compatible export — calls getStripe() on first property access
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return getStripe()[prop as keyof Stripe]
  }
})

// Type for Stripe Connect account
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

// Supported currencies
export const SUPPORTED_CURRENCIES = ['gbp', 'eur', 'usd'] as const
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

// Validate currency
export function isValidCurrency(currency: string): currency is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(currency.toLowerCase() as SupportedCurrency)
}
