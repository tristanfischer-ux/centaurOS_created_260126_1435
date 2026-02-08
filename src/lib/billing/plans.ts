/**
 * @file plans.ts
 * 
 * @description Subscription plan definitions and types.
 * These are pure constants with no server-side dependencies,
 * safe to import from both client and server components.
 */

// ==========================================
// SUBSCRIPTION TYPES
// ==========================================

export type SubscriptionTier = 'free' | 'starter' | 'professional' | 'enterprise'
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete'

export interface SubscriptionPlan {
  tier: SubscriptionTier
  name: string
  description: string
  priceMonthlyGBP: number // in pence
  priceAnnualGBP: number // in pence (annual price, usually discounted)
  features: string[]
  limits: {
    maxOrders?: number
    maxTeamMembers?: number
    maxRetainers?: number
    apiAccess?: boolean
    prioritySupport?: boolean
    dedicatedAccount?: boolean
  }
  stripePriceIdMonthly?: string
  stripePriceIdAnnual?: string
}

export interface UserSubscription {
  id: string
  userId: string
  stripeSubscriptionId: string
  stripeCustomerId: string
  tier: SubscriptionTier
  status: SubscriptionStatus
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  trialEnd: string | null
  createdAt: string
  updatedAt: string
}

// ==========================================
// SUBSCRIPTION PLANS CONFIGURATION
// ==========================================

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, SubscriptionPlan> = {
  free: {
    tier: 'free',
    name: 'Free',
    description: 'Get started with ForgeOS',
    priceMonthlyGBP: 0,
    priceAnnualGBP: 0,
    features: [
      'Up to 5 orders per month',
      'Basic marketplace access',
      'Standard support',
    ],
    limits: {
      maxOrders: 5,
      maxTeamMembers: 1,
      maxRetainers: 0,
      apiAccess: false,
      prioritySupport: false,
      dedicatedAccount: false,
    },
  },
  starter: {
    tier: 'starter',
    name: 'Starter',
    description: 'For growing businesses',
    priceMonthlyGBP: 4900, // £49/month
    priceAnnualGBP: 47000, // £470/year (save ~20%)
    features: [
      'Up to 25 orders per month',
      'Full marketplace access',
      'Up to 3 team members',
      '1 active retainer',
      'Email support',
    ],
    limits: {
      maxOrders: 25,
      maxTeamMembers: 3,
      maxRetainers: 1,
      apiAccess: false,
      prioritySupport: false,
      dedicatedAccount: false,
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL,
  },
  professional: {
    tier: 'professional',
    name: 'Professional',
    description: 'For established companies',
    priceMonthlyGBP: 14900, // £149/month
    priceAnnualGBP: 142800, // £1,428/year (save ~20%)
    features: [
      'Unlimited orders',
      'Full marketplace access',
      'Up to 10 team members',
      'Unlimited retainers',
      'API access',
      'Priority support',
    ],
    limits: {
      maxOrders: undefined, // unlimited
      maxTeamMembers: 10,
      maxRetainers: undefined, // unlimited
      apiAccess: true,
      prioritySupport: true,
      dedicatedAccount: false,
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL,
  },
  enterprise: {
    tier: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations',
    priceMonthlyGBP: 49900, // £499/month
    priceAnnualGBP: 478800, // £4,788/year (save ~20%)
    features: [
      'Everything in Professional',
      'Unlimited team members',
      'Dedicated account manager',
      'Custom integrations',
      'SLA guarantees',
      'SSO/SAML',
    ],
    limits: {
      maxOrders: undefined,
      maxTeamMembers: undefined,
      maxRetainers: undefined,
      apiAccess: true,
      prioritySupport: true,
      dedicatedAccount: true,
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL,
  },
}
