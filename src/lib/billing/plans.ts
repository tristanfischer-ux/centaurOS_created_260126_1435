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

export type SubscriptionTier = 'free' | 'seed' | 'starter' | 'professional' | 'enterprise'
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete'

export interface SubscriptionPlan {
  tier: SubscriptionTier
  name: string
  description: string
  /** Short persona-based subtitle explaining who this plan is for */
  bestFor: string
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
    /** Maximum conversation mode available for this tier */
    maxConversationMode: 'text' | 'voice' | 'avatar'
    /** Minutes of real-time voice per month (0 = not available) */
    voiceMinutesPerMonth: number
    /** Minutes of avatar video per month (0 = not available) */
    avatarMinutesPerMonth: number
    /** Can view investor detail pages */
    investorDetailAccess: boolean
    /** Can see partner names, titles, LinkedIn */
    investorContactsVisible: boolean
    /** Can see verified emails and deep bios */
    investorDeepAccess: boolean
    /** Can see portfolio companies, fund performance, exits */
    investorIntelligenceAccess: boolean
    /** Maximum storage in MB per foundry (undefined = unlimited) */
    maxStorageMB?: number
    /**
     * Maximum AI compute spend in USD per month.
     * Acts as a secondary cost ceiling alongside task counts — whichever
     * limit is hit first blocks further AI calls. Prevents expensive
     * model usage from exceeding tier revenue.
     */
    maxComputeBudgetUsd: number
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
// ENTERPRISE OVERAGE CONFIGURATION
// ==========================================

/**
 * Overage billing config for all paid tiers.
 *
 * When users exceed their included compute budget, they can continue
 * using AI features at a premium rate (10x markup). Usage is reported
 * to Stripe via metered billing and invoiced at period end.
 *
 * Economics: $1 compute → $10 billed (10x markup, 90% gross margin).
 * This strongly incentivises upgrading to the next tier for better value.
 */
export const ENTERPRISE_OVERAGE_CONFIG = {
  /** Markup multiplier on compute cost (10x = $1 compute costs customer $10) */
  markupMultiplier: 10,
  /** Maximum overage compute cost in USD per month before hard block */
  maxOverageComputeUsd: 600,
  /** Stripe price ID for the metered overage component (env var) */
  stripePriceIdOverage: process.env.STRIPE_PRICE_ENTERPRISE_OVERAGE?.trim(),
  /**
   * Number of units reported to Stripe per $1 of compute cost.
   * With £0.01/unit pricing in Stripe, 1000 units × £0.01 = £10 billed.
   * So $1 of compute = 1000 units → billed at £10 = 10x markup.
   */
  stripeUnitsPerComputeDollar: 1000,
  /**
   * Stripe Billing Meter event name.
   * Usage is reported via meter events (required for Stripe API ≥ 2025-03-31).
   */
  stripeMeterEventName: 'ai_compute_overage',
} as const

// ==========================================
// SUBSCRIPTION PLANS CONFIGURATION
// ==========================================

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, SubscriptionPlan> = {
  free: {
    tier: 'free',
    name: 'Explorer',
    description: 'Get started with ForgeOS',
    bestFor: 'Explore ForgeOS with a 14-day full-access trial. Get your first engineering assessment free.',
    priceMonthlyGBP: 0,
    priceAnnualGBP: 0,
    features: [
      '50 AI tasks per month',
      'Marketplace browse',
      'Voice-to-task',
      '15 investor profiles per month',
      'Email support',
    ],
    limits: {
      maxOrders: 5,
      maxTeamMembers: 1,
      maxRetainers: 0,
      maxAiTasksPerMonth: 50,
      apiAccess: false,
      prioritySupport: false,
      dedicatedAccount: false,
      maxConversationMode: 'text',
      voiceMinutesPerMonth: 0,
      avatarMinutesPerMonth: 0,
      investorDetailAccess: false,
      investorContactsVisible: false,
      investorDeepAccess: false,
      investorIntelligenceAccess: false,
      maxStorageMB: 500,
      maxComputeBudgetUsd: 9,
    },
  },
  seed: {
    tier: 'seed',
    name: 'Seed',
    description: 'For solo founders getting serious',
    bestFor: 'Unlock 10 AI specialists and investor profiles. The serious starting point for solo founders.',
    priceMonthlyGBP: 1999, // £19.99/month
    priceAnnualGBP: 19190, // £191.90/year (save ~20%)
    features: [
      '250 AI tasks per month',
      '10 AI specialists (of 13)',
      '50 investor profiles per month',
      'Marketplace browse + orders',
      'Voice-to-task',
      'Email support',
    ],
    limits: {
      maxOrders: 5,
      maxTeamMembers: 1,
      maxRetainers: 0,
      maxAiTasksPerMonth: 250,
      apiAccess: false,
      prioritySupport: false,
      dedicatedAccount: false,
      maxConversationMode: 'text' as const,
      voiceMinutesPerMonth: 0,
      avatarMinutesPerMonth: 0,
      investorDetailAccess: true,
      investorContactsVisible: false,
      investorDeepAccess: false,
      investorIntelligenceAccess: false,
      maxStorageMB: 1_000,
      maxComputeBudgetUsd: 18,
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_SEED_MONTHLY?.trim(),
    stripePriceIdAnnual: process.env.STRIPE_PRICE_SEED_ANNUAL?.trim(),
  },
  starter: {
    tier: 'starter',
    name: 'Startup Team',
    description: 'For growing businesses',
    bestFor: 'Go from idea to first purchase order. Full supplier matching, team workspace, and 0% fee on your first 3 orders.',
    priceMonthlyGBP: 4900, // £49/month
    priceAnnualGBP: 47000, // £470/year (save ~20%)
    features: [
      '750 AI tasks per month',
      'Full marketplace access',
      'AI comparison assistant',
      'Investor detail pages + contacts',
      'Supplier matching',
      'Email support',
    ],
    limits: {
      maxOrders: 25,
      maxTeamMembers: 3,
      maxRetainers: 1,
      maxAiTasksPerMonth: 750,
      apiAccess: false,
      prioritySupport: false,
      dedicatedAccount: false,
      maxConversationMode: 'text',
      voiceMinutesPerMonth: 0,
      avatarMinutesPerMonth: 0,
      investorDetailAccess: true,
      investorContactsVisible: true,
      investorDeepAccess: false,
      investorIntelligenceAccess: false,
      maxStorageMB: 5_000,
      maxComputeBudgetUsd: 25,
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY?.trim(),
    stripePriceIdAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL?.trim(),
  },
  professional: {
    tier: 'professional',
    name: 'Professional',
    description: 'For established companies',
    bestFor: 'Scale multiple product programs with unlimited orders, priority supplier matching, and reduced 5% marketplace fees.',
    priceMonthlyGBP: 14900, // £149/month
    priceAnnualGBP: 142800, // £1,428/year (save ~20%)
    features: [
      '2,500 AI tasks per month',
      'Everything in Startup Team',
      'Verified investor emails + deep profiles',
      'Fund performance + hardware fit scores',
      'Reduced 5% marketplace fee',
      'Priority support',
    ],
    limits: {
      maxOrders: undefined, // unlimited
      maxTeamMembers: 10,
      maxRetainers: undefined, // unlimited
      maxAiTasksPerMonth: 2500,
      apiAccess: true,
      prioritySupport: true,
      dedicatedAccount: false,
      maxConversationMode: 'voice',
      voiceMinutesPerMonth: 120, // 2 hours of real-time voice per month
      avatarMinutesPerMonth: 0,
      investorDetailAccess: true,
      investorContactsVisible: true,
      investorDeepAccess: true,
      investorIntelligenceAccess: true,
      maxStorageMB: 50_000,
      maxComputeBudgetUsd: 100,
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY?.trim(),
    stripePriceIdAnnual: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL?.trim(),
  },
  enterprise: {
    tier: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations',
    bestFor: 'Built for large teams with complex needs: automation, branding, and dedicated support.',
    priceMonthlyGBP: 49900, // £499/month
    priceAnnualGBP: 478800, // £4,788/year (save ~20%)
    features: [
      'Everything in Professional',
      'Unlimited AI tasks',
      'Unlimited team members',
      'Dedicated account manager',
      'Custom onboarding',
    ],
    limits: {
      maxOrders: undefined,
      maxTeamMembers: undefined,
      maxRetainers: undefined,
      maxAiTasksPerMonth: 10000, // effectively unlimited
      apiAccess: true,
      prioritySupport: true,
      dedicatedAccount: true,
      maxConversationMode: 'avatar',
      voiceMinutesPerMonth: 600, // 10 hours of real-time voice per month
      avatarMinutesPerMonth: 60, // 1 hour of avatar video per month
      investorDetailAccess: true,
      investorContactsVisible: true,
      investorDeepAccess: true,
      investorIntelligenceAccess: true,
      maxComputeBudgetUsd: 400,
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY?.trim(),
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL?.trim(),
  },
}
