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
    name: 'Explorer',
    description: 'Get started with ForgeOS',
    bestFor: 'Explore ForgeOS with a 14-day full-access trial. Get your first engineering assessment free.',
    priceMonthlyGBP: 0,
    priceAnnualGBP: 0,
    features: [
      '50 AI tasks per month',
      'Marketplace browse',
      'Voice-to-task',
      'Investor directory browse',
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
    },
  },
  starter: {
    tier: 'starter',
    name: 'Startup Team',
    description: 'For growing businesses',
    bestFor: 'Go from idea to first purchase order. Full supplier matching, team workspace, and 0% fee on your first £10K of orders.',
    priceMonthlyGBP: 4900, // £49/month
    priceAnnualGBP: 47000, // £470/year (save ~20%)
    features: [
      '100 AI tasks per month',
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
      maxAiTasksPerMonth: 100,
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
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL,
  },
  professional: {
    tier: 'professional',
    name: 'Professional',
    description: 'For established companies',
    bestFor: 'Scale multiple product programs with unlimited orders, priority supplier matching, and reduced 5% marketplace fees.',
    priceMonthlyGBP: 14900, // £149/month
    priceAnnualGBP: 142800, // £1,428/year (save ~20%)
    features: [
      '500 AI tasks per month',
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
      maxAiTasksPerMonth: 500,
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
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL,
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
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL,
  },
}
