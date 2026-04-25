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
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ 2026-04-25 — PRICING RESTRUCTURE (locked)                               │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ Killed: Explorer £2 / 50 brainstorms entry tier (loss-making at full    │
 * │   use). Existing free-tier users keep the original Explorer limits      │
 * │   under tier=`free` so they are NOT price-shocked. New marketing copy   │
 * │   reframes `free` as the new "Free" tier (1 brainstorm/mo + 5 lifetime  │
 * │   saved searches); enforcement of the tighter freemium gate is wired    │
 * │   in a follow-up commit (search "FREEMIUM_GATING_TODO" before then).    │
 * │                                                                         │
 * │ Added: `starter_v2` tier — £20/mo, 100 investor leads/mo with full      │
 * │   why-fit + how-to-pitch + drafted-email, 10 brainstorming sessions/mo. │
 * │   This is the new entry point that replaces Explorer £2.                │
 * │                                                                         │
 * │ Added: INVESTOR_SEARCH_ADDON — £10 per 100 extra investor searches,     │
 * │   one-click upsell from inside /investors. Cash-cow SKU. Wiring to      │
 * │   Stripe metered billing is TODO; data structure here so the UI can     │
 * │   render the upsell card and Tristan can create the Stripe price ID.   │
 * │                                                                         │
 * │ Legacy: `seed` (£19) and existing `starter` (Startup Team £49) are      │
 * │   marked legacy=true. Hidden from the public pricing page and from the  │
 * │   billing-settings upgrade UI. Existing subscribers continue resolving  │
 * │   against these entries until they upgrade or churn.                    │
 * │                                                                         │
 * │ Pending audit: `professional` (£149) and `enterprise` (£499) keep       │
 * │   their numbers and limits — pricing review happens in a separate       │
 * │   pass. Council labels updated: Pro → "Deep Council", Enterprise →      │
 * │   "Strategy Council" (depth-of-context, not depth-of-reasoning).        │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

// ==========================================
// SUBSCRIPTION TYPES
// ==========================================

export type SubscriptionTier =
  | 'free'
  | 'seed' // legacy — kept for existing £19/mo subscribers
  | 'starter' // legacy — Startup Team £49, kept for existing subscribers
  | 'starter_v2' // NEW 2026-04-25 — Starter £20/mo, the new entry tier
  | 'professional'
  | 'enterprise'
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
  /**
   * Hides the plan from public-facing surfaces (the /pricing page and
   * the in-app billing-settings upgrade catalogue) while keeping the
   * entry resolvable for limit-checking on existing subscribers.
   *
   * Set to `true` for tiers that have been retired but where existing
   * subscribers must continue to be honoured at their original limits
   * until they upgrade or churn (no price-shock migration).
   */
  legacy?: boolean
  limits: {
    maxOrders?: number
    maxTeamMembers?: number
    maxRetainers?: number
    maxAiTasksPerMonth: number
    apiAccess?: boolean
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
    /**
     * Investor leads (full why-fit + how-to-pitch + drafted-email) the
     * subscriber can pull per month under this tier's allowance. Once
     * exhausted, the user buys top-ups via INVESTOR_SEARCH_ADDON.
     *
     * 2026-04-25: introduced as part of the pricing restructure. Until
     * the freemium-gate enforcement lands, this is display-only on the
     * pricing page; existing limit-check logic still uses
     * MONTHLY_INVESTOR_VIEW_CAPS in src/lib/ai/limit-check.ts.
     *
     * `null` = unlimited.
     */
    investorLeadsPerMonth: number | null
    /**
     * Brainstorming sessions per month bundled with this tier.
     * 2026-04-25: introduced as part of the pricing restructure.
     * `null` = unlimited.
     */
    brainstormSessionsPerMonth: number | null
    /**
     * Lifetime cap on saved investor searches under this tier
     * (only meaningful for the new freemium "Free" tier — hard cap
     * across the lifetime of the account, not per month).
     * `null` = no lifetime cap.
     */
    savedSearchesLifetime: number | null
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
  // ────────────────────────────────────────────────────────────────────────
  // FREE — post-signup freemium tier (was "Explorer", reframed 2026-04-25)
  //
  // The runtime limit fields below are deliberately kept at the OLD Explorer
  // numbers (50 AI tasks, 15 investor views, etc.) so existing free-tier
  // accounts don't get downgraded the moment this ships. The UI advertises
  // the new freemium policy (1 brainstorm/mo + 5 lifetime saved searches)
  // via `brainstormSessionsPerMonth` / `savedSearchesLifetime`. Enforcement
  // of the tighter freemium gate is wired in a follow-up commit — see the
  // PRICING-RESTRUCTURE-NOTES.md "FREEMIUM_GATING_TODO" section.
  // ────────────────────────────────────────────────────────────────────────
  free: {
    tier: 'free',
    name: 'Free',
    description: 'Try ForgeOS without a credit card',
    bestFor: 'Sandbox the platform and tease the workflow. 1 brainstorm a month and a lifetime cap of 5 saved investor searches — perfect for a single founder kicking the tyres.',
    priceMonthlyGBP: 0,
    priceAnnualGBP: 0,
    features: [
      '1 brainstorming session per month',
      '5 saved investor searches (lifetime)',
      'All 13 specialists in read-only sandbox',
      'Marketplace browse',
      'Upgrade to Starter for full investor leads',
    ],
    limits: {
      maxOrders: undefined, // unlimited — we earn commission on every order
      maxTeamMembers: undefined, // no team limit — each person pays individually
      maxRetainers: 0,
      // FREEMIUM_GATING_TODO: drop maxAiTasksPerMonth to a small value once
      // the freemium-gate enforcement work is wired. Holding the legacy 50
      // until then so existing Explorer users aren't price-shocked.
      maxAiTasksPerMonth: 50,
      apiAccess: false,
      dedicatedAccount: false,
      maxConversationMode: 'text',
      voiceMinutesPerMonth: 0,
      avatarMinutesPerMonth: 0,
      investorDetailAccess: true,
      investorContactsVisible: true, // names, titles, LinkedIn — on all tiers
      investorDeepAccess: false, // verified emails — paid tiers only
      investorIntelligenceAccess: false,
      maxStorageMB: 500,
      maxComputeBudgetUsd: 9,
      investorLeadsPerMonth: 0, // browse-only on Free; full leads start on Starter
      brainstormSessionsPerMonth: 1, // new freemium policy
      savedSearchesLifetime: 5, // new freemium policy
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // SEED — LEGACY (£19/mo). Hidden from public catalogue 2026-04-25.
  // Retained so existing £19/mo subscribers continue to resolve against the
  // same limits until they upgrade or churn.
  // ────────────────────────────────────────────────────────────────────────
  seed: {
    tier: 'seed',
    name: 'Seed',
    description: 'For solo founders getting serious (legacy plan)',
    bestFor: 'More AI power and investor access. The serious starting point for solo founders.',
    priceMonthlyGBP: 1900, // £19/month
    priceAnnualGBP: 18240, // £182.40/year (save 20%)
    legacy: true,
    features: [
      '250 AI tasks per month',
      'All 13 specialists',
      '50 investor profiles per month',
      'Verified investor emails',
      'Marketplace browse + orders',
      'Email support',
    ],
    limits: {
      maxOrders: undefined,
      maxTeamMembers: undefined,
      maxRetainers: 0,
      maxAiTasksPerMonth: 250,
      apiAccess: false,
      dedicatedAccount: false,
      maxConversationMode: 'text' as const,
      voiceMinutesPerMonth: 0,
      avatarMinutesPerMonth: 0,
      investorDetailAccess: true,
      investorContactsVisible: true,
      investorDeepAccess: true, // verified emails
      investorIntelligenceAccess: true,
      maxStorageMB: 2_000,
      maxComputeBudgetUsd: 20,
      investorLeadsPerMonth: 50,
      brainstormSessionsPerMonth: null, // legacy — not metered, falls back to maxAiTasksPerMonth
      savedSearchesLifetime: null,
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_SEED_MONTHLY?.trim(),
    stripePriceIdAnnual: process.env.STRIPE_PRICE_SEED_ANNUAL?.trim(),
  },

  // ────────────────────────────────────────────────────────────────────────
  // STARTER — LEGACY (£49/mo Startup Team). Hidden from public catalogue
  // 2026-04-25. The new entry-tier "Starter" is `starter_v2` below.
  // Retained so existing £49/mo subscribers continue to resolve against
  // the same limits until they upgrade or churn.
  // ────────────────────────────────────────────────────────────────────────
  starter: {
    tier: 'starter',
    name: 'Startup Team',
    description: 'For growing businesses (legacy plan)',
    bestFor: 'Go from idea to first purchase order. Full supplier matching, team workspace, and 0% fee on your first 3 orders.',
    priceMonthlyGBP: 4900, // £49/month
    priceAnnualGBP: 47000, // £470/year (save ~20%)
    legacy: true,
    features: [
      '750 AI tasks per month',
      '150 investor profiles per month',
      'Full marketplace + supplier matching',
      'Comparison assistant',
      'Pay-as-you-go beyond limits',
      'Email support',
    ],
    limits: {
      maxOrders: undefined,
      maxTeamMembers: undefined,
      maxRetainers: undefined,
      maxAiTasksPerMonth: 750,
      apiAccess: false,
      dedicatedAccount: false,
      maxConversationMode: 'text',
      voiceMinutesPerMonth: 0,
      avatarMinutesPerMonth: 0,
      investorDetailAccess: true,
      investorContactsVisible: true,
      investorDeepAccess: true,
      investorIntelligenceAccess: true,
      maxStorageMB: 10_000,
      maxComputeBudgetUsd: 50,
      investorLeadsPerMonth: 150,
      brainstormSessionsPerMonth: null,
      savedSearchesLifetime: null,
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY?.trim(),
    stripePriceIdAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL?.trim(),
  },

  // ────────────────────────────────────────────────────────────────────────
  // STARTER (V2) — NEW entry-tier 2026-04-25. £20/mo.
  //
  // 100 investor leads per month with the full why-fit + how-to-pitch +
  // drafted-email payload. 10 brainstorming sessions per month. Replaces
  // the killed Explorer £2 entry tier. Top up beyond 100 leads via the
  // £10-per-100 INVESTOR_SEARCH_ADDON one-click upsell.
  //
  // Stripe price ID lives in env — see PRICING-RESTRUCTURE-NOTES.md for the
  // exact dashboard steps Tristan needs to run.
  // ────────────────────────────────────────────────────────────────────────
  starter_v2: {
    tier: 'starter_v2',
    name: 'Starter',
    description: 'The new entry tier for hardware founders',
    bestFor: '100 investor leads a month with full why-fit + how-to-pitch + drafted-email, plus 10 brainstorming sessions. Top up with £10 per 100 extra leads when you need more.',
    priceMonthlyGBP: 2000, // £20/month
    priceAnnualGBP: 19200, // £192/year (save 20%)
    features: [
      '100 investor leads per month',
      'Full why-fit + how-to-pitch + drafted-email',
      '10 brainstorming sessions per month',
      'All 13 specialists',
      'Marketplace browse + orders',
      '£10 per 100 extra investor leads',
      'Email support',
    ],
    limits: {
      maxOrders: undefined,
      maxTeamMembers: undefined,
      maxRetainers: 0,
      maxAiTasksPerMonth: 200,
      apiAccess: false,
      dedicatedAccount: false,
      maxConversationMode: 'text',
      voiceMinutesPerMonth: 0,
      avatarMinutesPerMonth: 0,
      investorDetailAccess: true,
      investorContactsVisible: true,
      investorDeepAccess: true, // verified emails included on Starter+
      investorIntelligenceAccess: true,
      maxStorageMB: 2_000,
      maxComputeBudgetUsd: 18,
      investorLeadsPerMonth: 100,
      brainstormSessionsPerMonth: 10,
      savedSearchesLifetime: null,
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER_V2_MONTHLY?.trim(),
    stripePriceIdAnnual: process.env.STRIPE_PRICE_STARTER_V2_ANNUAL?.trim(),
  },

  // ────────────────────────────────────────────────────────────────────────
  // PROFESSIONAL — Pro tier (pricing PENDING AUDIT 2026-04-25).
  // Numbers and limits unchanged in this restructure. Council label
  // updated to "Deep Council" (depth-of-reasoning, extended thinking).
  // ────────────────────────────────────────────────────────────────────────
  professional: {
    tier: 'professional',
    name: 'Pro',
    description: 'For established companies',
    bestFor: 'Scale multiple product programmes with unlimited orders, priority supplier matching, the Deep Council with extended thinking, and reduced 5% marketplace fees.',
    priceMonthlyGBP: 14900, // £149/month — PENDING AUDIT (likely £100/month)
    priceAnnualGBP: 142800, // £1,428/year (save ~20%)
    features: [
      '2,500 AI tasks per month',
      'Unlimited investor leads',
      'Deep Council with extended thinking',
      'Fund performance + hardware fit scores',
      'Dual-side data (founders + investors)',
      'Reduced 5% marketplace fee',
      'API access',
    ],
    limits: {
      maxOrders: undefined, // unlimited
      maxTeamMembers: undefined, // each person pays individually
      maxRetainers: undefined, // unlimited
      maxAiTasksPerMonth: 2500,
      apiAccess: true,
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
      investorLeadsPerMonth: null, // unlimited
      brainstormSessionsPerMonth: null, // unlimited (within compute budget)
      savedSearchesLifetime: null,
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY?.trim(),
    stripePriceIdAnnual: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL?.trim(),
  },

  // ────────────────────────────────────────────────────────────────────────
  // ENTERPRISE — Strategy Council tier (pricing PENDING AUDIT 2026-04-25).
  // Numbers and limits unchanged in this restructure. Council label
  // updated to "Strategy Council" (depth-of-context: custom specialists +
  // RAG over the foundry's own data, audit/SSO/SLA).
  // ────────────────────────────────────────────────────────────────────────
  enterprise: {
    tier: 'enterprise',
    name: 'Enterprise',
    description: 'For large organisations',
    bestFor: 'The Strategy Council on top of your own data — custom specialists, RAG over your foundry data, audit/SSO/SLA. Built for large teams with complex needs.',
    priceMonthlyGBP: 49900, // £499/month — PENDING AUDIT (likely £400/month)
    priceAnnualGBP: 478800, // £4,788/year (save ~20%)
    features: [
      'Everything in Pro',
      'Unlimited brainstorming sessions',
      'Strategy Council with custom specialists',
      'RAG over your foundry data',
      'Audit log, SSO, SLA',
      'Dedicated account manager',
      'Custom onboarding',
    ],
    limits: {
      maxOrders: undefined,
      maxTeamMembers: undefined,
      maxRetainers: undefined,
      maxAiTasksPerMonth: 10000, // effectively unlimited
      apiAccess: true,
      dedicatedAccount: true,
      maxConversationMode: 'avatar',
      voiceMinutesPerMonth: 600, // 10 hours of real-time voice per month
      avatarMinutesPerMonth: 60, // 1 hour of avatar video per month
      investorDetailAccess: true,
      investorContactsVisible: true,
      investorDeepAccess: true,
      investorIntelligenceAccess: true,
      maxComputeBudgetUsd: 400,
      investorLeadsPerMonth: null, // unlimited
      brainstormSessionsPerMonth: null, // unlimited
      savedSearchesLifetime: null,
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY?.trim(),
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL?.trim(),
  },
}

// ==========================================
// INVESTOR SEARCH ADD-ON
// ==========================================

/**
 * Investor Search Add-On — £10 per 100 extra investor searches.
 *
 * One-click upsell from inside `/investors` when a Starter (or Pro on a
 * heavy month, future) subscriber exhausts their bundled investorLeadsPerMonth.
 *
 * 2026-04-25: data-only entry — Stripe wiring is TODO. Tristan creates the
 * Stripe price ID in the dashboard (see PRICING-RESTRUCTURE-NOTES.md). Two
 * implementation paths:
 *
 *   (a) Stripe metered billing — report 1 unit per 100-search bundle via
 *       meter events at the moment of purchase. Cleanest UX (frictionless
 *       in-app one-click) and matches the existing
 *       ENTERPRISE_OVERAGE_CONFIG meter pattern in this file.
 *
 *   (b) One-shot Checkout Session for £10 — adds 100 to the user's
 *       monthly cap until the next renewal. Simpler to wire if metered
 *       billing is too heavyweight to set up for a first cut.
 *
 * Recommendation: ship (b) first behind a feature flag so the upsell card
 * works end-to-end, then migrate to (a) when usage justifies the meter.
 */
export const INVESTOR_SEARCH_ADDON = {
  /** Human-readable label for the upsell card */
  label: 'Investor Search Add-On',
  /** One-line marketing pitch shown beneath the price */
  description: '£10 per 100 extra investor searches. One click, no resubscription.',
  /** Price in pence */
  priceGBP: 1000,
  /** Number of extra investor searches added per purchase */
  searchesPerPurchase: 100,
  /** Stripe price ID — created by Tristan in the dashboard, wired via env */
  stripePriceId: process.env.STRIPE_PRICE_INVESTOR_SEARCH_ADDON?.trim(),
  /**
   * Stripe Billing Meter event name (only used by implementation path (a) —
   * metered billing). For path (b) — one-shot Checkout Session — this is
   * unused.
   */
  stripeMeterEventName: 'investor_search_addon',
} as const
