import Stripe from 'stripe'

// Validate environment variable
const stripeSecretKey = process.env.STRIPE_SECRET_KEY
if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable')
}

// Initialize Stripe with the secret key
export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2025-02-24.acacia',
  typescript: true,
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
