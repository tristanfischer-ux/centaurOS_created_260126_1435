import Stripe from 'stripe'

// Lazy initialization of Stripe client to avoid build-time errors
let stripeInstance: Stripe | null = null

function getStripeClient(): Stripe {
  if (!stripeInstance) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY
    if (!stripeSecretKey) {
      throw new Error('Missing STRIPE_SECRET_KEY environment variable')
    }
    stripeInstance = new Stripe(stripeSecretKey, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
    })
  }
  return stripeInstance
}

// Export a proxy that lazily initializes the Stripe client
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return getStripeClient()[prop as keyof Stripe]
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
