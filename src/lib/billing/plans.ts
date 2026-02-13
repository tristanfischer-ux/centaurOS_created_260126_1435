/**
 * @file plans.ts — Static subscription plan data and types.
 *
 * @description Shared module that contains ONLY static configuration
 * and TypeScript types for billing plans. It has zero server-side
 * imports (no Supabase, no Stripe SDK) so it is safe to import from
 * both server actions AND 'use client' components.
 *
 * Server-side billing logic that needs Supabase / Stripe lives in
 * `subscriptions.ts` and re-exports these types for convenience.
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
    maxAiTasksPerMonth: number
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
      '20 smart assists per month',
      'Standard support',
    ],
    limits: {
      maxOrders: 5,
      maxTeamMembers: 1,
      maxRetainers: 0,
      maxAiTasksPerMonth: 20,
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
      '100 smart assists per month',
      'Email support',
    ],
    limits: {
      maxOrders: 25,
      maxTeamMembers: 3,
      maxRetainers: 1,
      maxAiTasksPerMonth: 100,
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
      '500 smart assists per month',
      'API access',
      'Priority support',
    ],
    limits: {
      maxOrders: undefined, // unlimited
      maxTeamMembers: 10,
      maxRetainers: undefined, // unlimited
      maxAiTasksPerMonth: 500,
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
      'Unlimited smart assists',
      'Dedicated account manager',
      'Custom integrations',
      'SLA guarantees',
      'SSO/SAML',
    ],
    limits: {
      maxOrders: undefined,
      maxTeamMembers: undefined,
      maxRetainers: undefined,
      maxAiTasksPerMonth: 10000, // effectively unlimited
      apiAccess: true,
      prioritySupport: true,
      dedicatedAccount: true,
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL,
  },
}
