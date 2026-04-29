/**
 * @file investors.ts
 *
 * @description Server actions for the UK Investor Directory. Queries marketplace_listings
 * where category = 'Finance', searching by text in title/description and filtering by
 * JSONB attribute fields. Exposes pagination helpers for both the directory listing page
 * and the individual detail page.
 *
 * Tier-gated access: Free users can browse cards but detail pages require starter+.
 * Deep intelligence (emails, bios, fund perf) requires professional+.
 *
 * @security No foundry isolation required — investor data is read-only and public within
 * the platform. Tier gating strips sensitive fields before returning to the client.
 */

"use server"

import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserSubscription } from '@/lib/billing/subscriptions'
import { SUBSCRIPTION_PLANS } from '@/lib/billing/plans'
import type { SubscriptionTier } from '@/lib/billing/plans'
import { calculateMatchScore, findSimilarInvestors, computeHybridScore } from '@/lib/investor-match'
import { stageFit as fcStageFit, geoFit as fcGeoFit, chequeFit as fcChequeFit, forgeCapitalComposite } from '@/lib/forge-capital-ranking'
import type { FoundryProfile, MatchBreakdown } from '@/lib/investor-match'
import { applySectorBoost } from '@/lib/sector-boost'
import { embedQuery } from '@/lib/embeddings'
import { normaliseFirmTypeLabel } from '@/lib/investors/firm-type-labels'
import { checkRateLimit } from '@/lib/security/rate-limit'
import {
  getFoundryTier,
  MONTHLY_INVESTOR_VIEW_CAPS,
  MAX_DAILY_INVESTOR_VIEWS,
} from '@/lib/ai/limit-check'
import { logSearchQuery } from '@/lib/search-telemetry'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Normalised shape of a single investor firm record pulled from marketplace_listings.
 */
export type InvestorFirm = {
  id: string
  title: string
  description: string | null
  subcategory: string
  attributes: {
    firm_type?: string
    fund_size_gbp?: number
    fund_tier?: string
    stage_focus?: string[]
    sectors?: string[]
    is_active_deploying?: boolean
    hq_city?: string
    outreach_priority?: string
    outreach_status?: string
    website_url?: string
    linkedin_company_url?: string
    twitter_company_url?: string
    twitter_company_bio?: string
    investment_thesis?: string
    notable_portfolio?: string[]
    last_verified?: string
    aum_gbp?: number
    founding_year?: number
    bvca_member?: boolean
    recent_deals_summary?: string
    last_fund_close_date?: string
    contact_email?: string
    location?: string
    data_source?: string
    data_confidence?: string
    // Forge-Capital enriched fields
    geo_focus?: string[]
    cheque_range_gbp?: { min: number | null; max: number | null }
    hardware_fit_score?: number
    data_quality_score?: number
    ideal_company_profile?: string
    value_add?: string
    forge_capital_id?: number
    last_synced?: string
    // Tier-gated intelligence fields (professional+)
    investment_pattern?: string
    team_expertise?: string
    connection_brief?: string
    // Tier-gated deep fields (professional+)
    fund_history?: unknown
    exits?: unknown
    fund_performance?: unknown
    fact_check_status?: string
    // Tier-gated portfolio (starter+)
    portfolio_companies?: {
      company_name: string
      sector?: string | null
      stage?: string | null
      amount_usd?: number | null
      description?: string | null
      why_appealing?: string | null
    }[]
    // Semantic search scoring (set only when query uses semantic path)
    _hybridScore?: number
    _similarity?: number
    /** Forge Capital composite (0-100) — sort key when query is semantic. */
    _fcComposite?: number
    /** Per-pillar breakdown matching Forge-Capital-Search.html scorecard. */
    _fcPillars?: {
      thesis: number
      stage: number | null
      geo: number | null
      cheque: number | null
      activity: number
      confidence: number
    }
  }
  // Contact availability status (aggregated from vc_pe_contacts). Attached
  // post-rowToFirm via attachContactStatuses.
  contact_status?: 'verified' | 'inferred' | 'none'
}

/**
 * Filter parameters accepted by searchInvestors.
 */
export interface InvestorFilters {
  firmType?: string[]       // 'VC' | 'PE' | 'Growth'
  stage?: string[]          // 'Seed' | 'Series A' | etc
  sector?: string[]
  hqCity?: string
  activeOnly?: boolean      // filter is_active_deploying = true
  priority?: string         // 'A' | 'B' | 'C'
  query?: string            // full-text search on title/description
  minQuality?: number       // minimum data_quality_score
  geoFocus?: string[]       // filter by geo_focus array values
  chequeMin?: number        // minimum cheque range (GBP)
  chequeMax?: number        // maximum cheque range (GBP)
  minHardwareFit?: number   // minimum hardware_fit_score (0-10)
  bvcaOnly?: boolean        // filter bvca_member = true
  sortBy?: 'match' | 'fund_size' | 'quality' | 'hardware_fit' | 'cheque' | 'priority' | 'name'
  page?: number
  pageSize?: number
  /**
   * Phase G: when true, skip the why-fit / how-to-pitch / drafted-email
   * enrichment step (which calls Sonnet for top results). Set this from any
   * caller that only needs the firms array — e.g. the directory browse path,
   * filter pickers, autocomplete sources. Default false (enrichment runs for
   * paid tiers).
   */
  skipMatchEnrichment?: boolean
}

/**
 * Citation backing a why-fit or how-to-pitch claim. Same shape as the
 * generator's source type — duplicated here so this file stays self-contained
 * (server-action files can re-export types but the lint rule is murky and the
 * shape is small).
 */
export interface InvestorMatchCitation {
  type: 'fund_decision' | 'partner_statement' | 'portfolio_precedent'
  text: string
  source: string
}

/**
 * Per-result match output (why-fit + how-to-pitch + drafted email +
 * citations). Generated by `generateInvestorMatchOutput` and cached in
 * `investor_match_cache`.
 */
export interface InvestorMatchOutputView {
  whyFit: string
  howToPitch: string
  draftedEmailSubject: string
  draftedEmailBody: string
  sourceCitations: InvestorMatchCitation[]
  fromCache: boolean
  modelUsed: string
}

/**
 * Return shape from searchInvestors.
 *
 * `matchOutputs` is keyed by investor listing id and is populated for
 * paid tiers ONLY. Free tier sees the firms array but no match outputs.
 * Anonymous tier sees firms only too — the page-level loader handles the
 * single-entry teaser.
 */
export interface InvestorSearchResult {
  firms: InvestorFirm[]
  total: number
  hasMore: boolean
  /** Per-result why-fit/how-to-pitch/drafted-email outputs, paid tiers only. */
  matchOutputs?: Record<string, InvestorMatchOutputView>
  /** Tier resolved during the search — used by the UI to decide which CTA to render. */
  resolvedTier?: SubscriptionTier | 'anonymous'
  /**
   * True when the semantic search path threw (timeout, 429, dim mismatch, etc.)
   * and we could NOT fall through to a keyword path that might plausibly match.
   * Distinguishes "the engine broke" from "genuinely no matches".
   */
  semanticFailed?: boolean
  /**
   * True when the caller was blocked by the rate limiter (30 req / 60 s).
   * Client should render a retry-in-a-moment message rather than an empty state.
   */
  rateLimited?: boolean
  /**
   * Human-readable explanation set alongside semanticFailed / rateLimited.
   * Suitable for display directly to the user in an amber callout.
   */
  failureMessage?: string
  /**
   * True when the OpenAI embedding key has hit its quota and semantic ranking
   * is unavailable. Results are still returned via keyword/filter fallback, but
   * the UI should surface an amber warning so the user knows result quality is
   * reduced. Distinct from semanticFailed (which means no results at all).
   */
  degradedMode?: boolean
  /**
   * Phase A.5 telemetry: id of the row written to `search_query_log` for
   * this call. The UI threads this id into click handlers so that
   * `recordSearchClick` can attach click events to the originating query.
   * Undefined for unauthenticated callers (we do not log anonymous searches)
   * or when the telemetry insert failed (telemetry is fail-open).
   */
  searchQueryLogId?: string
  /**
   * Phase A.5 internal hit-count breakdown for the merged vector + FTS pool,
   * threaded out from the semantic path so the wrapper can log them. Not
   * exposed in the public type — consumers should ignore.
   * @internal
   */
  _telemetry?: {
    ftsHitCount?: number
    vectorHitCount?: number
  }
}

/**
 * Aggregated stats for the investor directory insights panel.
 */
export interface InvestorStats {
  total: number
  investorCount: number
  serviceProviderCount: number
  withWebsiteCount: number
  activeDeployingCount: number
  forgeCapitalCount: number
  partnerCount: number
  subcategoryBreakdown: { name: string; count: number }[]
  regionBreakdown: { name: string; count: number }[]
  // Phase 1: New chart data
  typeBreakdown: { name: string; count: number }[]
  topSectors: { name: string; count: number }[]
  stageFocusBreakdown: { name: string; count: number }[]
  qualityDistribution: { range: string; count: number }[]
  hwFit7PlusCount: number
  portfolioCompanyCount: number
  avgQuality: number
}

/**
 * Tier access flags for investor features.
 */
export interface InvestorTierAccess {
  tier: SubscriptionTier
  detailAccess: boolean
  contactsVisible: boolean
  deepAccess: boolean
  intelligenceAccess: boolean
}

/**
 * Result of an investor view cap check.
 * Used to gate detail page access and show remaining views in the UI.
 *
 * Monthly caps apply to NEW investor views only. Previously-viewed investors
 * ("library") can be revisited unlimited times for free.
 */
export interface InvestorViewCapResult {
  allowed: boolean
  viewsUsedThisMonth: number
  viewsRemaining: number | null  // null = unlimited
  librarySize: number
  cap: number | null  // null = unlimited
  isRevisit: boolean
  period: 'monthly'
  message?: string
  /** @deprecated Alias for viewsRemaining — kept for backward compat during migration */
  remaining: number | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalises a JSONB value to a string array.
 */
function toStringArray(val: unknown): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === 'string')
  if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

/**
 * Casts a raw marketplace_listings row to InvestorFirm.
 */
// SECURITY: Allowlist of attribute keys to prevent prototype pollution and payload bloat
// from unexpected JSONB fields flowing through to the client.
function rowToFirm(row: Record<string, unknown>): InvestorFirm {
  const attrs = (row.attributes as Record<string, unknown>) ?? {}
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    subcategory: (row.subcategory as string) ?? '',
    attributes: {
      firm_type: attrs.firm_type as string | undefined,
      fund_size_gbp: attrs.fund_size_gbp as number | undefined,
      fund_tier: attrs.fund_tier as string | undefined,
      stage_focus: toStringArray(attrs.stage_focus),
      sectors: toStringArray(attrs.sectors),
      is_active_deploying: attrs.is_active_deploying as boolean | undefined,
      hq_city: attrs.hq_city as string | undefined,
      outreach_priority: attrs.outreach_priority as string | undefined,
      outreach_status: attrs.outreach_status as string | undefined,
      website_url: attrs.website_url as string | undefined,
      linkedin_company_url: attrs.linkedin_company_url as string | undefined,
      twitter_company_url: attrs.twitter_company_url as string | undefined,
      twitter_company_bio: attrs.twitter_company_bio as string | undefined,
      investment_thesis: attrs.investment_thesis as string | undefined,
      notable_portfolio: toStringArray(attrs.notable_portfolio),
      last_verified: attrs.last_verified as string | undefined,
      aum_gbp: attrs.aum_gbp as number | undefined,
      founding_year: attrs.founding_year as number | undefined,
      bvca_member: attrs.bvca_member as boolean | undefined,
      recent_deals_summary: attrs.recent_deals_summary as string | undefined,
      last_fund_close_date: attrs.last_fund_close_date as string | undefined,
      contact_email: attrs.contact_email as string | undefined,
      location: attrs.location as string | undefined,
      data_source: attrs.data_source as string | undefined,
      data_confidence: attrs.data_confidence as string | undefined,
      geo_focus: toStringArray(attrs.geo_focus),
      cheque_range_gbp: attrs.cheque_range_gbp as { min: number | null; max: number | null } | undefined,
      hardware_fit_score: attrs.hardware_fit_score as number | undefined,
      data_quality_score: attrs.data_quality_score as number | undefined,
      ideal_company_profile: attrs.ideal_company_profile as string | undefined,
      value_add: attrs.value_add as string | undefined,
      forge_capital_id: attrs.forge_capital_id as number | undefined,
      last_synced: attrs.last_synced as string | undefined,
      // Forge-Capital synthesized intelligence fields (pushed by 16-synthesize-intel.js)
      // These were missing from the mapper — data existed in DB but was silently dropped
      investment_pattern: attrs.investment_pattern as string | undefined,
      team_expertise: attrs.team_expertise as string | undefined,
      connection_brief: attrs.connection_brief as string | undefined,
      fund_history: attrs.fund_history,
      exits: attrs.exits,
      fund_performance: attrs.fund_performance,
      fact_check_status: attrs.fact_check_status as string | undefined,
      portfolio_companies: attrs.portfolio_companies as InvestorFirm['attributes']['portfolio_companies'],
    },
  }
}

/**
 * Strips tier-gated fields from an investor firm based on access level.
 */
function stripTierGatedFields(firm: InvestorFirm, access: InvestorTierAccess): InvestorFirm {
  const stripped = { ...firm, attributes: { ...firm.attributes } }

  if (!access.intelligenceAccess) {
    // Professional+ only fields
    delete stripped.attributes.fund_history
    delete stripped.attributes.exits
    delete stripped.attributes.fund_performance
    delete stripped.attributes.fact_check_status
    delete stripped.attributes.investment_pattern
    delete stripped.attributes.team_expertise
    delete stripped.attributes.connection_brief
    // DECISION: Don't strip hardware_fit_score — UI gates display (shows lock for
    // non-professional, score for professional). The 0-10 value is not sensitive.
  }

  if (!access.deepAccess) {
    // Professional+ only: contact email at firm level
    delete stripped.attributes.contact_email
  }

  if (!access.contactsVisible) {
    // Starter+ only fields
    delete stripped.attributes.portfolio_companies
  }

  return stripped
}

// ---------------------------------------------------------------------------
// Tier Access
// ---------------------------------------------------------------------------

/**
 * Determines investor feature access based on user's subscription tier.
 */
export async function getInvestorTierAccess(): Promise<InvestorTierAccess> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return {
        tier: 'free',
        detailAccess: false,
        contactsVisible: false,
        deepAccess: false,
        intelligenceAccess: false,
      }
    }

    const { subscription } = await getUserSubscription(user.id)
    // SECURITY: Only active/trialing subscriptions grant tier access
    const isActive = subscription?.status === 'active' || subscription?.status === 'trialing'
    const tier = (subscription && isActive) ? subscription.tier : 'free'
    const plan = SUBSCRIPTION_PLANS[tier]

    return {
      tier,
      detailAccess: plan.limits.investorDetailAccess,
      contactsVisible: plan.limits.investorContactsVisible,
      deepAccess: plan.limits.investorDeepAccess,
      intelligenceAccess: plan.limits.investorIntelligenceAccess,
    }
  } catch (error) {
    console.error('[getInvestorTierAccess] Error:', error)
    return {
      tier: 'free',
      detailAccess: false,
      contactsVisible: false,
      deepAccess: false,
      intelligenceAccess: false,
    }
  }
}

// ---------------------------------------------------------------------------
// Investor Detail View Gating
// ---------------------------------------------------------------------------

/**
 * Check if a user can view an investor detail page.
 *
 * @description Monthly caps with "once viewed, always yours" library:
 * - Free: 15 new views/month
 * - Seed: 50 new views/month
 * - Starter: 200 new views/month
 * - Professional/Enterprise: unlimited
 * - Forge Ambassador (10+ active paid referrals): unlimited regardless of tier
 *
 * Library: Previously-viewed investors can be revisited unlimited times.
 * Anti-scraping: MAX_DAILY_INVESTOR_VIEWS hard ceiling regardless of tier.
 *
 * @param foundryId - The foundry viewing the investor
 * @param tier - The foundry's subscription tier
 * @param investorId - The investor listing being viewed
 * @param userId - Optional user ID; used to check Forge Ambassador status
 * @returns View cap result with allowed/remaining/cap/period
 */
export async function checkInvestorViewCap(
  foundryId: string,
  tier: SubscriptionTier,
  investorId: string,
  userId?: string,
): Promise<InvestorViewCapResult> {
  // Professional/Enterprise: always allowed, no cap
  if (tier === 'professional' || tier === 'enterprise') {
    return {
      allowed: true,
      viewsUsedThisMonth: 0,
      viewsRemaining: null,
      librarySize: 0,
      cap: null,
      isRevisit: false,
      period: 'monthly',
      remaining: null,
    }
  }

  // FORGE AMBASSADOR: Founders with 10+ active paid referrals get unlimited
  // investor searches as long as their referrals stay on a paid tier.
  // The check is per-request (not cached) so status reverts immediately if
  // referrals churn. get_active_paid_referral_count is a STABLE sql function
  // so it is fast (single join, indexed on inviter_user_id + status).
  if (userId) {
    try {
      const adminSupabase = createAdminClient()
      const { data: activePaidCount } = await adminSupabase.rpc(
        'get_active_paid_referral_count',
        { p_inviter_user_id: userId }
      )
      if (typeof activePaidCount === 'number' && activePaidCount >= 10) {
        return {
          allowed: true,
          viewsUsedThisMonth: 0,
          viewsRemaining: null,
          librarySize: 0,
          cap: null,
          isRevisit: false,
          period: 'monthly',
          remaining: null,
        }
      }
    } catch (ambassadorErr) {
      // Non-critical — fall through to normal cap check
      console.warn('[checkInvestorViewCap] Ambassador check error, continuing:', ambassadorErr)
    }
  }

  try {
    const adminSupabase = createAdminClient()

    // FLOW: Check if investor is already in the user's library (free re-visit)
    const { data: inLibrary } = await adminSupabase.rpc('is_investor_in_library', {
      p_foundry_id: foundryId,
      p_investor_id: investorId,
    })

    // Get current stats regardless of library status (needed for UI)
    const { data: stats } = await adminSupabase.rpc('get_investor_view_stats', {
      p_foundry_id: foundryId,
    })

    const row = Array.isArray(stats) ? stats[0] : stats
    const librarySize = Number(row?.library_size ?? 0)
    const newViewsThisMonth = Number(row?.new_views_this_month ?? 0)
    const viewsToday = Number(row?.views_today ?? 0)

    // INTENT: "Once viewed, always yours" — library investors are free to revisit
    if (inLibrary === true) {
      const monthlyCap = MONTHLY_INVESTOR_VIEW_CAPS[tier] ?? null
      return {
        allowed: true,
        viewsUsedThisMonth: newViewsThisMonth,
        viewsRemaining: monthlyCap !== null ? Math.max(0, monthlyCap - newViewsThisMonth) : null,
        librarySize,
        cap: monthlyCap,
        isRevisit: true,
        period: 'monthly',
        remaining: monthlyCap !== null ? Math.max(0, monthlyCap - newViewsThisMonth) : null,
      }
    }

    // New investor — check anti-scraping daily burst ceiling
    if (viewsToday >= MAX_DAILY_INVESTOR_VIEWS) {
      return {
        allowed: false,
        viewsUsedThisMonth: newViewsThisMonth,
        viewsRemaining: 0,
        librarySize,
        cap: MONTHLY_INVESTOR_VIEW_CAPS[tier] ?? null,
        isRevisit: false,
        period: 'monthly',
        remaining: 0,
        message: 'You\'ve reached the daily viewing limit. Please try again tomorrow.',
      }
    }

    // New investor — check monthly cap
    const monthlyCap = MONTHLY_INVESTOR_VIEW_CAPS[tier] ?? null
    if (monthlyCap === null) {
      // No cap for this tier (shouldn't reach here since pro/ent return early, but safety)
      return {
        allowed: true,
        viewsUsedThisMonth: newViewsThisMonth,
        viewsRemaining: null,
        librarySize,
        cap: null,
        isRevisit: false,
        period: 'monthly',
        remaining: null,
      }
    }

    // FLOW: Check bonus feature credits to extend the monthly cap
    let bonusCredits = 0
    try {
      const { data: bonus } = await adminSupabase.rpc('get_bonus_feature_credits', {
        p_foundry_id: foundryId,
        p_feature: 'investor_monthly_views',
      })
      bonusCredits = typeof bonus === 'number' ? bonus : 0
    } catch {
      // Non-critical — just use base cap
    }

    const effectiveCap = monthlyCap + bonusCredits
    const viewsRemaining = Math.max(0, effectiveCap - newViewsThisMonth)

    if (newViewsThisMonth >= effectiveCap) {
      const upgradeHint = tier === 'free'
        ? 'Upgrade to Seed (£19/mo) for 50 profiles/month'
        : tier === 'seed'
          ? 'Upgrade to Startup Team (£49/mo) for 150 profiles/month'
          : 'Upgrade to Professional for unlimited profiles'
      return {
        allowed: false,
        viewsUsedThisMonth: newViewsThisMonth,
        viewsRemaining: 0,
        librarySize,
        cap: effectiveCap,
        isRevisit: false,
        period: 'monthly',
        remaining: 0,
        message: `You've used all ${effectiveCap} new investor views this month. ${librarySize > 0 ? `${librarySize} profiles in your library are always accessible. ` : ''}${upgradeHint}.`,
      }
    }

    return {
      allowed: true,
      viewsUsedThisMonth: newViewsThisMonth,
      viewsRemaining: viewsRemaining - 1, // Account for this view about to be consumed
      librarySize,
      cap: effectiveCap,
      isRevisit: false,
      period: 'monthly',
      remaining: viewsRemaining - 1,
    }
  } catch (error) {
    console.warn('[checkInvestorViewCap] Error, allowing:', error)
    // DECISION: Fail open — view caps are UX smoothing for conversions, not a security control.
    return {
      allowed: true,
      viewsUsedThisMonth: 0,
      viewsRemaining: null,
      librarySize: 0,
      cap: null,
      isRevisit: false,
      period: 'monthly',
      remaining: null,
    }
  }
}

/**
 * Record an investor detail view in both the new investor_views library
 * and the legacy ai_usage_log (audit trail).
 *
 * @description Uses the record_investor_view RPC to upsert into investor_views.
 * Also keeps a row in ai_usage_log as an audit log.
 *
 * @param investorId - The investor listing being viewed
 * @param foundryId - The foundry making the view
 * @param userId - The user making the view
 * @returns Stats from the recorded view
 */
export async function recordInvestorDetailView(
  investorId: string,
  foundryId: string,
  userId: string,
): Promise<{ isNewView: boolean; librarySize: number; newViewsThisMonth: number }> {
  const adminSupabase = createAdminClient()

  try {
    // FLOW: Record in the new investor_views library table
    const { data: viewResult, error: viewError } = await adminSupabase.rpc('record_investor_view', {
      p_foundry_id: foundryId,
      p_user_id: userId,
      p_investor_id: investorId,
    })

    if (viewError) {
      console.error('[recordInvestorDetailView] RPC error:', viewError.message)
    }

    const row = Array.isArray(viewResult) ? viewResult[0] : viewResult
    const isNewView = row?.is_new_view ?? true
    const librarySize = Number(row?.library_size ?? 0)
    const newViewsThisMonth = Number(row?.new_views_this_month ?? 0)

    // FLOW: Also log to ai_usage_log as an audit trail (don't break existing tracking)
    try {
      await adminSupabase.from('ai_usage_log').insert({
        foundry_id: foundryId,
        user_id: userId,
        feature: 'investor_detail_view',
        model: 'none',
        prompt_tokens: 0,
        completion_tokens: 0,
        estimated_cost_usd: 0,
        metadata: { investorId, isNewView },
      })
    } catch (auditError) {
      // Non-critical — audit log miss doesn't affect user experience
      console.warn('[recordInvestorDetailView] Audit log failed:', auditError)
    }

    return { isNewView, librarySize, newViewsThisMonth }
  } catch (error) {
    console.warn('[recordInvestorDetailView] Failed to record view:', error)
    return { isNewView: true, librarySize: 0, newViewsThisMonth: 0 }
  }
}

/**
 * Get the current view cap status for the logged-in user.
 * Used by the directory page to show "X views remaining this month" banner.
 *
 * @returns View cap info or null if user is not logged in
 */
export async function getInvestorViewCapStatus(): Promise<InvestorViewCapResult | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return null

    const tier = await getFoundryTier(profile.foundry_id)

    // Professional/Enterprise: unlimited, no banner needed
    if (tier === 'professional' || tier === 'enterprise') {
      return {
        allowed: true,
        viewsUsedThisMonth: 0,
        viewsRemaining: null,
        librarySize: 0,
        cap: null,
        isRevisit: false,
        period: 'monthly',
        remaining: null,
      }
    }

    const adminSupabase = createAdminClient()
    const { data: stats } = await adminSupabase.rpc('get_investor_view_stats', {
      p_foundry_id: profile.foundry_id,
    })

    const row = Array.isArray(stats) ? stats[0] : stats
    const librarySize = Number(row?.library_size ?? 0)
    const newViewsThisMonth = Number(row?.new_views_this_month ?? 0)

    const monthlyCap = MONTHLY_INVESTOR_VIEW_CAPS[tier] ?? null

    // Check bonus credits
    let bonusCredits = 0
    try {
      const { data: bonus } = await adminSupabase.rpc('get_bonus_feature_credits', {
        p_foundry_id: profile.foundry_id,
        p_feature: 'investor_monthly_views',
      })
      bonusCredits = typeof bonus === 'number' ? bonus : 0
    } catch {
      // Non-critical
    }

    const effectiveCap = monthlyCap !== null ? monthlyCap + bonusCredits : null
    const viewsRemaining = effectiveCap !== null ? Math.max(0, effectiveCap - newViewsThisMonth) : null

    return {
      allowed: viewsRemaining === null || viewsRemaining > 0,
      viewsUsedThisMonth: newViewsThisMonth,
      viewsRemaining,
      librarySize,
      cap: effectiveCap,
      isRevisit: false,
      period: 'monthly',
      remaining: viewsRemaining,
      message: viewsRemaining === 0
        ? `You've used all ${effectiveCap} new views this month. ${librarySize > 0 ? `${librarySize} profiles in your library are always accessible.` : ''}`
        : undefined,
    }
  } catch (error) {
    console.warn('[getInvestorViewCapStatus] Error:', error)
    return null
  }
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

// SECURITY: Allowlist of valid firm_type values to prevent PostgREST filter injection.
const VALID_FIRM_TYPES = new Set([
  'VC', 'PE', 'Growth', 'Growth Equity', 'Family Office', 'CVC',
  'Corporate VC', 'Accelerator', 'Angel', 'Angel Network', 'Debt Fund',
  'Impact Fund', 'EIS Fund', 'SEIS Fund', 'Advisory Services',
  'Institutional Investor', 'Private Credit', 'Financial Institution',
])

/**
 * Returns true when a search query looks like a prose deck description rather
 * than a firm name. Used to decide whether a semantic-search failure should
 * fall through to ilike (which can match a firm name like "Sequoia") or return
 * a semanticFailed signal (where ilike against a prose sentence would always
 * return 0 rows).
 *
 * Heuristic (ANY of these triggers prose classification):
 *   - query length > 30 characters
 *   - contains 3 or more commas (typical "stage, sector, geo" pattern)
 *   - contains any of the prose-signal words below (stage labels, pitch verbs, etc.)
 */
const PROSE_SIGNAL_WORDS = [
  'startup', 'raising', 'looking for', 'pre-seed', 'preseed', 'seed stage',
  'series a', 'series b', 'series c', 'climate tech', 'deep tech', 'hardware',
  'software', 'fintech', 'healthtech', 'medtech', 'b2b', 'b2c', 'saas',
  'we are', 'our company', 'we build', 'we have', 'we make', 'based in',
  'founded', 'revenue', 'traction', 'investors who', 'fund that',
]

function looksLikeProse(query: string): boolean {
  const lower = query.toLowerCase()
  if (query.length > 30) return true
  if ((query.match(/,/g) ?? []).length >= 3) return true
  return PROSE_SIGNAL_WORDS.some(word => lower.includes(word))
}

/**
 * SECURITY: Sanitize a string for use in PostgREST filter expressions.
 * Escapes ilike wildcards (%, _) and strips PostgREST control characters.
 */
function sanitizeFilterValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/[\n\r\t]/g, ' ')
    .replace(/[,()\."*:!'[\]{}]/g, '')
}

/**
 * Searches and filters the UK investor directory.
 *
 * Phase G (2026-04-25): the public `searchInvestors` now calls this core
 * algorithm and then enriches the top results with why-fit / how-to-pitch /
 * drafted-email outputs for paid tiers via `generateInvestorMatchOutputs`.
 *
 * The internal core preserves the previous semantic-search behaviour byte-
 * identically so existing callers (other than the wrapper) see no change.
 */
async function searchInvestorsCore(
  filters: InvestorFilters = {}
): Promise<InvestorSearchResult> {
  const {
    hqCity,
    activeOnly,
    priority,
    query,
    minQuality,
    chequeMin,
    chequeMax,
    minHardwareFit,
    bvcaOnly,
    sortBy = 'name',
    page = 1,
    pageSize = 24,
  } = filters

  // SECURITY: Cap array filter lengths to prevent DoS via thousands of OR clauses
  const MAX_FILTER_ARRAY = 50
  const firmType = filters.firmType?.slice(0, MAX_FILTER_ARRAY)
  const stage = filters.stage?.slice(0, MAX_FILTER_ARRAY)
  const sector = filters.sector?.slice(0, MAX_FILTER_ARRAY)
  const geoFocus = filters.geoFocus?.slice(0, MAX_FILTER_ARRAY)

  // SECURITY: Bound pagination to prevent DoS
  const safePage = Math.max(1, page)
  // SECURITY: Cap at 200. The deck-search use case ranks candidates against
  // the user's pasted description; 200 is the same ceiling the underlying
  // pgvector RPC returns, so this isn't bulk extraction — it's the actual
  // ranked match set Forge Capital surfaces. Tristan 2026-04-27 mandate:
  // "Why are you only showing the top 50 most relevant matches and not all
  // of the matches?"
  const safePageSize = Math.min(Math.max(1, pageSize), 200)
  const from = (safePage - 1) * safePageSize

  const supabase = await createClient()

  // SECURITY: Rate limit investor search to prevent bulk data extraction
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const rl = await checkRateLimit('investorSearch', user.id, { limit: 30, window: 60000 })
    if (rl) return {
      firms: [],
      total: 0,
      hasMore: false,
      rateLimited: true,
      failureMessage: 'Rate limit reached — wait a few seconds and try again.',
    }
  }

  // ── Semantic search path ──
  // INTENT: When the user types a meaningful query (> 5 chars), use pgvector cosine
  // similarity for far better recall than naive ilike (e.g. "pre-seed deep tech London"
  // finds relevant firms even when those exact words aren't in the title).
  // DECISION: Uses match_marketplace_listings_v2 which returns attributes + accepts
  // category filter, eliminating the 200-row re-fetch and client-side filtering.
  //
  // GOTCHA: When OpenAI quota is exhausted the embedding call fails and the code
  // falls through to the ilike keyword path. But a prose query like "AI drug
  // discovery, Pre-Seed, London" will never match any firm title, so ilike returns
  // zero results — a false "no matches". Flag set in the catch block below tells
  // the keyword path to skip the ilike and return the full directory instead.
  let quotaExhaustedProseFallback = false
  // Set to true when the OpenAI key hits quota and we fall through to the
  // keyword path. Results are still returned but semantic ranking is gone.
  // Propagated to the UI so an amber degraded-mode banner is rendered.
  let embeddingQuotaExhausted = false

  if (query && query.trim().length > 5) {
    try {
      // DECISION: Use OpenAI text-embedding-3-small (1536-dim) to match the
      // current marketplace_listings.embedding column type (vector(1536), see
      // migration 015 + 17 + 19). Document embeddings are synced from Forge
      // Capital DB at 1536-dim via 13c-sync-nomic-embeddings.js (renamed
      // semantically 2026-04-23 — file name kept for diff hygiene). Previous
      // code called nomicEmbedQuery (768-dim) which silently returned 0 hits
      // due to dimension mismatch — pgvector raises and the try/catch below
      // swallows. Fixed 2026-04-23.
      const queryEmbedding = await embedQuery(query.trim())
      // SECURITY/CORRECTNESS: Defensive guard at the RPC boundary. embedQuery
      // already asserts 1536 dims, but production has fired pgvector "different
      // vector dimensions 1536 and 768" errors AFTER the assertion landed
      // (commits 22b1c713 + 94b14d74), implying either a stale Lambda warm
      // instance or an OpenAI dim-leak the assertion missed. Re-validate here
      // so the next failure surfaces as a loud, attributable error instead of
      // a silent fallback to keyword search. THIRD instance of this dim-class
      // failure per memory (embedding_dim_mismatch_recurring_failure.md).
      if (queryEmbedding.length !== 1536) {
        throw new Error(
          `[searchInvestors] Refused to call match_marketplace_listings_v2 with ` +
            `${queryEmbedding.length}-dim embedding (column is vector(1536)). ` +
            `Query: ${query.trim().slice(0, 80)}`,
        )
      }
      // DECISION: v2 RPC returns attributes + filters by category at DB level,
      // eliminating the re-fetch + client-side filter pattern.
      // DECISION: threshold=0.0 mirrors the Forge Capital Dashboard behaviour:
      // return all firms with an embedding, rank by composite score client-side.
      // Previously we set 0.5 to match the dashboard's "strong matches (50%+)"
      // BADGE, but that badge is computed AFTER ranking — the dashboard itself
      // retrieves every investor. Applying 0.5 at the pgvector level clipped
      // 99% of real candidates. match_count=1000 caps the candidate pool to
      // the top 1000 most-similar rows; UI shows top 50.
      // GOTCHA: Supabase PostgREST caps every response body at 1000 rows
      // (project-level db_max_rows setting, not accessible via SQL). Previously
      // we used 8 parallel calls of 1000 each to cover all ~8,212 Finance rows.
      // BUT: pgvector performs a full sequential scan for each call (ORDER BY
      // embedding <=> query then OFFSET). 8 parallel full-index scans × 8,212
      // rows each = 65,696 distance computations simultaneously, which triggers
      // Supabase's statement_timeout (57014). Per memory gotcha
      // forgeos_pgvector_statement_timeout.md: cap PAGES at 2 (2,000 candidates).
      // Top 2,000 by cosine similarity is the right candidate pool — the
      // remaining 6,000+ rows would never surface in the top-50 results anyway.
      // Fix 2026-04-25: PAGES reduced 8 → 2. This eliminates the timeout that
      // caused semantic search to silently fall through to the keyword path,
      // which returned 0 results for natural-language deck descriptions.
      // 2026-04-25: PAGES=1, PAGE=200 — even 1500 still timed out. The IVFFlat
      // index on Finance embedding is more efficient with smaller match_count;
      // 200 nearest neighbours is plenty for downstream ranking. Approximate
      // ANN over 8K rows with probes=1 returns in <1s; raising match_count
      // back toward N*1000 forces near-exhaustive scan and re-introduces the
      // 57014 statement_timeout.
      const PAGE = 200
      const PAGES = 1
      const embJson = JSON.stringify(queryEmbedding) as unknown as string
      // Phase A of the raw-pages search proposal (2026-04-28). In parallel
      // with the vector RPC, fire match_listings_pages_fts which returns
      // listing IDs whose scraped page text matches the user query via
      // Postgres full-text search. Naive merge below — Phase C will
      // replace this with Reciprocal Rank Fusion. The point of FTS here:
      // catches exact-string needles ("ISO 13485", "G99 EREC", postcodes)
      // the structured-fields embedding misses.
      const [pageResults, ftsResult] = await Promise.all([
        Promise.all(
          Array.from({ length: PAGES }, (_, i) =>
            supabase.rpc('match_marketplace_listings_v2', {
              query_embedding: embJson,
              filter_category: 'Finance',
              // 2026-04-25 evening: bumped from -1.0 to 0.0. The "-1 → include
              // every row regardless of hemisphere" knob was forcing IVFFlat to
              // scan the full Finance corpus on busy probes, which intermittently
              // hit Supabase statement_timeout (57014). Cosine ≥ 0 still yields
              // ~all real matches (any negative-similarity row is a useless hit
              // and gets dropped downstream anyway).
              match_threshold: 0.0,
              match_count: PAGE,
              p_offset: i * PAGE,
            }),
          ),
        ),
        // Cast as never — match_listings_pages_fts was added in the
        // 2026-04-28 migration but database.types.ts hasn't been
        // regenerated yet. Runtime call is correct; types will catch
        // up on next `npx supabase gen types`.
        (supabase as unknown as {
          rpc: (
            name: string,
            args: Record<string, unknown>
          ) => Promise<{
            data: Array<{
              listing_id: string
              best_rank: number
              page_count: number
              best_page_url: string | null
            }> | null
            error: { message: string } | null
          }>
        }).rpc('match_listings_pages_fts', {
          p_query: query.trim(),
          p_category: 'Finance',
          p_limit: 200,
        }),
      ])
      const firstError = pageResults.find(r => r.error)?.error
      if (firstError) throw firstError
      // FTS errors are non-fatal — fall back to vector-only if it fails.
      if (ftsResult?.error) {
        console.warn('[searchInvestors] FTS RPC error (non-fatal):', ftsResult.error.message)
      }
      // Concatenate + dedupe by id (overlaps shouldn't happen with LIMIT/OFFSET
      // but guard anyway).
      const seen = new Set<string>()
      const semanticData: Array<Record<string, unknown>> = []
      for (const r of pageResults) {
        for (const row of (r.data ?? []) as Array<Record<string, unknown>>) {
          const id = String(row.id)
          if (seen.has(id)) continue
          seen.add(id)
          semanticData.push(row)
        }
      }
      // Phase A.5 telemetry: capture pre-merge counts so the wrapper can log
      // how each pool contributed. vectorHitCount = unique ids from vector RPC
      // after dedup; ftsHitCount snapshot taken below once `ftsRows` is ready.
      const _vectorHitCount = semanticData.length

      // Phase A merge: pull in listings that ONLY surfaced via FTS (no
      // cosine similarity), assign a synthetic similarity derived from
      // ts_rank so they participate in the composite. Anything that
      // appeared in BOTH vector + FTS gets a small boost via Math.max
      // when the FTS rank is unusually high. Naive but adequate for
      // Phase A — Phase C will replace with proper RRF.
      const ftsRows = (ftsResult?.data ?? []) as Array<{
        listing_id: string
        best_rank: number
        page_count: number
        best_page_url: string | null
      }>
      const ftsById = new Map<string, { best_rank: number; page_count: number; best_page_url: string | null }>()
      for (const r of ftsRows) {
        if (r.listing_id) ftsById.set(r.listing_id, {
          best_rank: r.best_rank ?? 0,
          page_count: r.page_count ?? 0,
          best_page_url: r.best_page_url ?? null,
        })
      }
      // For every FTS-only listing, fetch its full row from marketplace_listings
      // so the downstream filters and ranker can run on the same shape as
      // semanticData.
      const ftsOnlyIds = ftsRows
        .map(r => r.listing_id)
        .filter(id => id && !seen.has(id))
      if (ftsOnlyIds.length > 0) {
        // Cap at 200 to bound the round-trip; FTS already returns ≤200.
        const safeIds = ftsOnlyIds.slice(0, 200)
        const { data: ftsListings, error: ftsListingsError } = await supabase
          .from('marketplace_listings')
          .select('*')
          .eq('category', 'Finance')
          .in('id', safeIds)
        if (ftsListingsError) {
          console.warn('[searchInvestors] FTS-only fetch failed (non-fatal):', ftsListingsError.message)
        } else if (ftsListings) {
          for (const row of ftsListings as Array<Record<string, unknown>>) {
            const id = String(row.id)
            if (seen.has(id)) continue
            // Synthesise a similarity from FTS rank. ts_rank_cd values are
            // small (~0.001-0.05 typically); normalise into a reasonable
            // cosine-equivalent band. Rank-based normalisation is more
            // stable than absolute scaling: a top-FTS hit gets ~0.6, a
            // bottom-FTS hit gets ~0.3.
            const ftsMeta = ftsById.get(id)
            const rank = ftsMeta?.best_rank ?? 0
            // Map ts_rank into [0.3, 0.7] using log-scale (ts_rank values
            // span orders of magnitude); clamp.
            const synthSim = Math.min(0.7, Math.max(0.3, 0.3 + Math.log1p(rank * 100) * 0.1))
            ;(row as Record<string, unknown>).similarity = synthSim
            ;(row as Record<string, unknown>)._fts_rank = rank
            ;(row as Record<string, unknown>)._fts_page_count = ftsMeta?.page_count
            seen.add(id)
            semanticData.push(row)
          }
        }
      }
      if (!semanticData || semanticData.length === 0) {
        return { firms: [], total: 0, hasMore: false }
      }

      // INTENT: Apply JSONB filters on semantic results. The v2 RPC already returned
      // attributes, so we can filter without a second round-trip.
      let results = semanticData as Array<Record<string, unknown>>

      // INTENT: User mandate 2026-04-13 — Forge Capital SQLite is the canonical
      // source of investor data. ForgeOS includes ~245 older Finance rows from
      // non-Forge-Capital imports that inflate match counts without matching
      // the dashboard's scope. Scope search to Forge-Capital-synced rows only.
      results = results.filter((r) => {
        const attrs = (r.attributes as Record<string, unknown>) || {}
        return attrs.data_source === 'forge_capital'
      })

      if (firmType && firmType.length > 0) {
        const safeFirmTypes = firmType.filter((t: string) => VALID_FIRM_TYPES.has(t))
        if (safeFirmTypes.length > 0) {
          results = results.filter((r) => {
            const attrs = (r.attributes as Record<string, unknown>) || {}
            return safeFirmTypes.includes(attrs.firm_type as string)
          })
        }
      }
      if (activeOnly) {
        results = results.filter((r) => {
          const attrs = (r.attributes as Record<string, unknown>) || {}
          return attrs.is_active_deploying === true
        })
      }
      if (stage && stage.length > 0) {
        results = results.filter((r) => {
          const attrs = (r.attributes as Record<string, unknown>) || {}
          const sf = toStringArray(attrs.stage_focus)
          return stage.some((s: string) => sf.some(f => f.toLowerCase() === s.toLowerCase()))
        })
      }
      if (sector && sector.length > 0) {
        results = results.filter((r) => {
          const attrs = (r.attributes as Record<string, unknown>) || {}
          const sec = toStringArray(attrs.sectors)
          return sector.some((s: string) => sec.some(f => f.toLowerCase() === s.toLowerCase()))
        })
      }
      if (geoFocus && geoFocus.length > 0) {
        results = results.filter((r) => {
          const attrs = (r.attributes as Record<string, unknown>) || {}
          const gf = toStringArray(attrs.geo_focus)
          return geoFocus.some((g: string) => gf.some(f => f.toLowerCase().includes(g.toLowerCase())))
        })
      }
      if (minQuality != null && minQuality > 0) {
        results = results.filter((r) => {
          const attrs = (r.attributes as Record<string, unknown>) || {}
          // GOTCHA: JSONB values may be strings — use Number() for runtime conversion
          return Number(attrs.data_quality_score ?? 0) >= minQuality
        })
      }
      if (minHardwareFit != null && minHardwareFit > 0) {
        results = results.filter((r) => {
          const attrs = (r.attributes as Record<string, unknown>) || {}
          return Number(attrs.hardware_fit_score ?? 0) >= minHardwareFit
        })
      }
      if (bvcaOnly) {
        results = results.filter((r) => {
          const attrs = (r.attributes as Record<string, unknown>) || {}
          return attrs.bvca_member === true
        })
      }
      if (hqCity && hqCity.trim().length > 0) {
        const cityLower = hqCity.trim().toLowerCase()
        results = results.filter((r) => {
          const attrs = (r.attributes as Record<string, unknown>) || {}
          return ((attrs.hq_city as string) || '').toLowerCase().includes(cityLower)
        })
      }

      // Convert to InvestorFirm and apply tier gating
      const access = await getInvestorTierAccess()
      let firms = results.map((r) => {
        const firm = rowToFirm(r as Record<string, unknown>)
        return stripTierGatedFields(firm, access)
      })

      // INTENT: Forge Capital composite ranking — ported VERBATIM from
      // Forge-Capital-Search.html lines 597-625. Thesis 55%, geo 15%,
      // stage 10%, cheque 10%, activity 3%, confidence 2%. Stage/geo/cheque
      // can return null (no signal in query) and are dropped from the
      // weighted denominator so a thesis-only match isn't taxed for missing
      // query hints. Tristan 2026-04-27: "Forge Capital all the code exists.
      // Everything is already there. I just want you to mimic forge capital."
      const queryText = query.trim()
      firms = firms.map(firm => {
        const matchedRow = results.find((r) => r.id === firm.id)
        const thesisSim = (matchedRow?.similarity as number) ?? 0
        const attrs = firm.attributes
        const stageStr = Array.isArray(attrs.stage_focus) ? attrs.stage_focus.join(', ') : (attrs.stage_focus as unknown as string ?? '')
        const geoStr   = Array.isArray(attrs.geo_focus)   ? attrs.geo_focus.join(', ')   : (attrs.geo_focus   as unknown as string ?? '')
        const stage  = fcStageFit(stageStr, queryText)
        const geo    = fcGeoFit(geoStr, queryText)
        const cmin   = attrs.cheque_range_gbp?.min ?? null
        const cmax   = attrs.cheque_range_gbp?.max ?? null
        const cheque = fcChequeFit(cmin, cmax, queryText)
        const activity = attrs.is_active_deploying ? 80 : 50
        const dq = typeof attrs.data_quality_score === 'number' ? attrs.data_quality_score : 0
        const dc = Math.min(100, Math.max(0, dq * 10))
        const { composite, thesis_sim } = forgeCapitalComposite(thesisSim, stage, geo, cheque, activity, dc)
        return {
          ...firm,
          attributes: {
            ...firm.attributes,
            _similarity: thesisSim,
            _fcComposite: composite,
            _fcPillars: {
              thesis:     Math.round(thesis_sim),
              stage:      stage  ?? null,
              geo:        geo    ?? null,
              cheque:     cheque ?? null,
              activity,
              confidence: Math.round(dc),
            },
          },
        }
      })
      firms.sort((a, b) => (b.attributes._fcComposite ?? 0) - (a.attributes._fcComposite ?? 0))

      const total = firms.length
      const paginatedFirms = await attachContactStatuses(firms.slice(from, from + safePageSize))
      const hasMore = from + paginatedFirms.length < total

      return {
        firms: paginatedFirms,
        total,
        hasMore,
        _telemetry: { vectorHitCount: _vectorHitCount, ftsHitCount: ftsRows.length },
      }
    } catch (err) {
      // FLOW: Semantic search failed.
      // INSTRUMENTATION: Log the bound query length so the next dim-mismatch
      // captures whether the leak was at the embed boundary (caught here as
      // our pre-RPC assertion) or somewhere downstream we still haven't traced.
      const errMsg = err instanceof Error ? err.message : String(err)
      const isQuotaExhausted =
        errMsg.includes('insufficient_quota') ||
        errMsg.includes('exceeded your current quota') ||
        (err != null && typeof err === 'object' && (err as Record<string, unknown>).code === 'insufficient_quota')
      console.error('[searchInvestors] Semantic search failed:', {
        err,
        queryLen: query.trim().length,
        queryPrefix: query.trim().slice(0, 40),
        isQuotaExhausted,
      })
      // DECISION: If the query looks like a prose deck description (> 30 chars,
      // contains stage/sector/geo language, etc.), the keyword/ilike fallback
      // cannot match any firm name and would silently return 0 rows — which the
      // user cannot distinguish from "no matches". Return a semanticFailed signal
      // so the client renders an amber "try again" callout instead.
      // For short, name-like queries ("Sequoia", "Index") we DO fall through to
      // ilike because it can plausibly match a firm title.
      //
      // EXCEPTION: insufficient_quota (OpenAI billing) is NOT a semantic-search
      // architecture failure — it is a billing issue. Fall through to the
      // keyword/filter path so the user still gets results filtered by
      // stage/sector/geo even without vector ranking. Do NOT block the search
      // entirely just because the embedding key ran out of credits.
      if (looksLikeProse(query.trim()) && !isQuotaExhausted) {
        return {
          firms: [],
          total: 0,
          hasMore: false,
          semanticFailed: true,
          failureMessage: 'Investor search is temporarily unavailable. Please try again.',
        }
      }
      // Short / firm-name-like query, OR quota exhausted: fall through to keyword path below.
      // GOTCHA: When quota is exhausted and the query is prose (e.g. "AI drug
      // discovery, Pre-Seed, London"), the ilike fallback at the keyword path
      // cannot match any firm title/description and returns 0 rows — giving the
      // user a false "no matches" result. Flag this so the keyword path skips
      // the ilike and returns the full directory (sorted by name), which is far
      // better than zero. Explicit filter chips (stage/sector/geo passed as
      // structured params) are preserved and still narrow the result set.
      if (isQuotaExhausted && looksLikeProse(query.trim())) {
        quotaExhaustedProseFallback = true
      }
      // Any quota exhaustion event degrades the search quality — flag regardless
      // of whether the prose fallback path fires so the UI can warn the user.
      if (isQuotaExhausted) {
        embeddingQuotaExhausted = true
      }
    }
  }

  // ── Keyword/browse path (fallback or short/no query) ──
  // DECISION: For JSONB attribute sorts (quality, fund_size, etc.), use the
  // search_investors_sorted RPC which handles sorting + filtering at the DB level.
  // This eliminates the 2000-row over-fetch pattern. For 'name' and 'match' sorts,
  // use the PostgREST query builder (DB handles ordering natively).
  const needsServerSort = sortBy != null && sortBy !== 'name' && sortBy !== 'match'

  if (needsServerSort) {
    // INTENT: DB-level sorting via RPC — sort + filter + paginate in a single query.
    // No over-fetching: Postgres handles ORDER BY on JSONB attributes directly.
    const safeFirmTypes = firmType?.filter((t: string) => VALID_FIRM_TYPES.has(t))
    // When quota is exhausted and the query is prose, don't pass it as an ilike
    // filter — it would return zero results. Return the full directory instead.
    const safeQuery = quotaExhaustedProseFallback ? null : (query?.trim().slice(0, 200) || null)

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'search_investors_sorted',
      {
        sort_field: sortBy,
        sort_direction: 'desc',
        page_offset: from,
        page_limit: safePageSize,
        filter_firm_types: safeFirmTypes?.length ? safeFirmTypes : undefined,
        filter_stages: stage?.length ? stage : undefined,
        filter_sectors: sector?.length ? sector : undefined,
        filter_geo_focus: geoFocus?.length ? geoFocus : undefined,
        filter_active_only: activeOnly ?? false,
        filter_bvca_only: bvcaOnly ?? false,
        filter_min_quality: minQuality ?? undefined,
        filter_min_hardware_fit: minHardwareFit ?? undefined,
        filter_cheque_min: chequeMin ?? undefined,
        filter_cheque_max: chequeMax ?? undefined,
        filter_hq_city: hqCity ?? undefined,
        filter_priority: priority ?? undefined,
        filter_query: safeQuery ?? undefined,
      }
    )

    if (rpcError) {
      console.error('[searchInvestors] RPC error, falling back to PostgREST:', rpcError)
      // Fall through to PostgREST path below
    } else {
      const rows = (rpcData ?? []) as Array<Record<string, unknown>>
      const total = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0

      let firms = rows.map((row) => rowToFirm(row))

      // SECURITY: Strip tier-gated fields from search results
      const access = await getInvestorTierAccess()
      firms = firms.map(f => stripTierGatedFields(f, access))

      const hasMore = from + firms.length < total
      return { firms: await attachContactStatuses(firms), total, hasMore }
    }
  }

  // ── PostgREST path: name sort or match sort (DB handles ORDER BY title natively) ──
  let q = supabase
    .from('marketplace_listings')
    .select('id, title, description, subcategory, attributes', { count: 'exact' })
    .eq('category', 'Finance')

  // Full-text search
  // SECURITY: Cap query length to prevent DoS via huge ilike patterns
  // DECISION: Skip ilike when `quotaExhaustedProseFallback` is true. A prose
  // query ("AI drug discovery, Pre-Seed, London") will never match a firm title
  // via ilike — omitting the ilike returns the full directory alphabetically,
  // which is far more useful than zero results when the embedding API is down.
  if (query && query.trim().length > 0 && !quotaExhaustedProseFallback) {
    const sanitized = sanitizeFilterValue(query.trim().slice(0, 200))
    if (sanitized) {
      const term = `%${sanitized}%`
      q = q.or(`title.ilike.${term},description.ilike.${term}`)
    }
  }

  // JSONB scalar filter: firm_type
  if (firmType && firmType.length > 0) {
    const safeFirmTypes = firmType.filter((t: string) => VALID_FIRM_TYPES.has(t))
    if (safeFirmTypes.length > 0) {
      q = q.or(safeFirmTypes.map((t: string) => `attributes->>firm_type.eq.${t}`).join(','))
    }
  }

  // JSONB scalar filter: is_active_deploying
  if (activeOnly) {
    q = q.filter('attributes->is_active_deploying', 'eq', 'true')
  }

  // JSONB scalar filter: hq_city
  if (hqCity && hqCity.trim().length > 0) {
    const safeCity = sanitizeFilterValue(hqCity.trim())
    if (safeCity) {
      q = q.filter('attributes->>hq_city', 'ilike', `%${safeCity}%`)
    }
  }

  // JSONB scalar filter: outreach_priority
  const VALID_PRIORITIES = new Set(['A', 'B', 'C'])
  if (priority && VALID_PRIORITIES.has(priority)) {
    q = q.filter('attributes->>outreach_priority', 'eq', priority)
  }

  // JSONB array filter: stage_focus
  if (stage && stage.length > 0) {
    const stageFilters = stage.map((s: string) => `attributes->stage_focus.cs.["${sanitizeFilterValue(s)}"]`)
    q = q.or(stageFilters.join(','))
  }

  // JSONB array filter: sectors
  if (sector && sector.length > 0) {
    const sectorFilters = sector.map((s: string) => `attributes->sectors.cs.["${sanitizeFilterValue(s)}"]`)
    q = q.or(sectorFilters.join(','))
  }

  // JSONB array filter: geo_focus
  if (geoFocus && geoFocus.length > 0) {
    const geoFilters = geoFocus.map((g: string) => `attributes->geo_focus.cs.["${sanitizeFilterValue(g)}"]`)
    q = q.or(geoFilters.join(','))
  }

  // JSONB scalar filter: data_quality_score
  // GOTCHA: Use -> (JSONB) not ->> (TEXT) for numeric comparisons
  if (minQuality != null && minQuality > 0) {
    q = q.filter('attributes->data_quality_score', 'gte', minQuality)
  }

  // JSONB scalar filter: hardware_fit_score
  if (minHardwareFit != null && minHardwareFit > 0) {
    q = q.filter('attributes->hardware_fit_score', 'gte', minHardwareFit)
  }

  // JSONB scalar filter: bvca_member
  if (bvcaOnly) {
    q = q.filter('attributes->bvca_member', 'eq', 'true')
  }

  // JSONB scalar filter: cheque range (numeric — use -> not ->>)
  if (chequeMin != null) {
    q = q.filter('attributes->cheque_range_gbp->max', 'gte', chequeMin)
  }
  if (chequeMax != null) {
    q = q.filter('attributes->cheque_range_gbp->min', 'lte', chequeMax)
  }

  // Pagination + sorting (name or match — both handled by DB)
  const to = from + safePageSize - 1
  q = q.range(from, to).order('title', { ascending: true })

  const { data, count, error } = await q

  if (error) {
    console.error('[searchInvestors] Supabase error:', error)
    return { firms: [], total: 0, hasMore: false }
  }

  let firms = (data ?? []).map((row: Record<string, unknown>) => rowToFirm(row))

  // SECURITY: Strip tier-gated fields from search results
  const access = await getInvestorTierAccess()
  firms = firms.map(f => stripTierGatedFields(f, access))

  const total = count ?? 0
  const hasMore = from + (data ?? []).length < total

  return {
    firms: await attachContactStatuses(firms),
    total,
    hasMore,
    ...(embeddingQuotaExhausted && {
      degradedMode: true,
      failureMessage: 'Search quality is reduced — semantic ranking is temporarily unavailable. Results below use keyword matching only. We\'re working on restoring full search.',
    }),
  }
}

// ---------------------------------------------------------------------------
// Phase G: searchInvestors public wrapper with match-output enrichment
// ---------------------------------------------------------------------------

/**
 * Number of top-ranked results to enrich with why-fit / how-to-pitch /
 * drafted-email outputs per search call. Uncached generations cost ~£0.10
 * each at sonnet-4-6, so 12 = £1.20 worst-case for a paid user's first
 * search of a fresh foundry context. Subsequent searches cache-hit at ~5ms
 * and ~£0 per row.
 */
const MATCH_OUTPUT_ENRICH_TOP_N = 12

/**
 * Searches and filters the UK investor directory.
 *
 * Phase G (2026-04-25): for paid tiers (Seed / Starter / Professional /
 * Enterprise), enriches the top {@link MATCH_OUTPUT_ENRICH_TOP_N} results
 * with the why-fit / how-to-pitch / drafted-email outputs that justify the
 * post-pivot pricing (£20 Starter / £10 add-on per 100 leads). Free and
 * anonymous tiers see firms-only results; the UI renders blurred upsell
 * cards in their place.
 *
 * Enrichment runs in parallel with the post-search work so paid users see
 * the full output in roughly the same wall-clock time as a free user, on
 * cache hits. First-search-of-the-day for a fresh foundry context will see
 * the LLM round-trip latency.
 */
export async function searchInvestors(
  filters: InvestorFilters = {}
): Promise<InvestorSearchResult> {
  const _telemetryStart = Date.now()
  const baseResult = await searchInvestorsCore(filters)

  // Resolve user + foundry up front so Phase A.5 telemetry runs on EVERY
  // path, including the `skipMatchEnrichment` opt-out used by the investor
  // deck-search client. Without this, the deck-search call site never
  // received a `searchQueryLogId`, so every downstream click on a result
  // card bailed at the `if (!searchQueryLogId) return` guard, and 0 rows
  // landed in `search_click_log`. Bug found 2026-04-29.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let foundryId: string | null = null
  if (user) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('foundry_id')
        .eq('id', user.id)
        .maybeSingle()
      foundryId = profile?.foundry_id ?? null
    } catch {
      foundryId = null
    }
  }

  // Phase A.5 instrumentation. Fail-open: never block on telemetry.
  // Skip when there is no query at all (filter-only browse) — the value
  // signal is in actual user queries, not "load page" baselines. Also
  // skipped for anonymous callers because RLS requires profile_id.
  let searchQueryLogId: string | undefined
  const trimmedQuery = (filters.query ?? '').trim()
  if (user && trimmedQuery.length > 0) {
    const logId = await logSearchQuery({
      supabase,
      profileId: user.id,
      foundryId,
      surface: 'investors',
      queryText: trimmedQuery,
      category: 'Finance',
      resultCount: baseResult.firms.length,
      ftsHitCount: baseResult._telemetry?.ftsHitCount ?? null,
      vectorHitCount: baseResult._telemetry?.vectorHitCount ?? null,
      topResultIds: baseResult.firms.slice(0, 5).map((f) => f.id),
      latencyMs: Date.now() - _telemetryStart,
      clientMeta: {
        semanticFailed: baseResult.semanticFailed ?? false,
        rateLimited: baseResult.rateLimited ?? false,
        total: baseResult.total,
      },
    })
    searchQueryLogId = logId ?? undefined
  }

  // Caller opt-out: directory browse path, filter pickers etc. don't need
  // the LLM-enriched output. Skip the auth + generation round-trip — but
  // still return the queryLogId so the client can wire click telemetry.
  if (filters.skipMatchEnrichment) {
    return { ...baseResult, searchQueryLogId }
  }

  if (!user) {
    // Anonymous searches do not get tier resolution or enrichment.
    return { ...baseResult, resolvedTier: 'anonymous' }
  }

  const access = await getInvestorTierAccess()
  // Free tier (and any user without a foundry) gets firms-only.
  if (access.tier === 'free' || !foundryId) {
    return { ...baseResult, resolvedTier: access.tier, searchQueryLogId }
  }

  if (baseResult.firms.length === 0) {
    return { ...baseResult, matchOutputs: {}, resolvedTier: access.tier, searchQueryLogId }
  }

  // INTENT: Enrich only the visible top-N to bound cost. The UI renders
  // remaining firms as match-score-only cards with a "generate insight"
  // affordance for one-off triggers (out of scope this round).
  const enrichIds = baseResult.firms
    .slice(0, MATCH_OUTPUT_ENRICH_TOP_N)
    .map((f) => f.id)

  let matchOutputs: Record<string, InvestorMatchOutputView> = {}
  try {
    const { generateInvestorMatchOutputs } = await import('@/actions/investors-match-generation')
    const generated = await generateInvestorMatchOutputs({
      foundryId,
      userId: user.id,
      investorListingIds: enrichIds,
      maxParallel: 8,
    })
    matchOutputs = generated as Record<string, InvestorMatchOutputView>
  } catch (err) {
    // FLOW: Enrichment failure must never break the search itself. Log it
    // and return firms-only — the UI shows the upgrade nudge as a fallback.
    console.error('[searchInvestors] Match-output enrichment failed:', err)
    matchOutputs = {}
  }

  return { ...baseResult, matchOutputs, resolvedTier: access.tier, searchQueryLogId }
}

// ---------------------------------------------------------------------------
// RED-TEAM-PIVOT-PLAN Tier 2 step 14 — Anonymous /investors teaser
// ---------------------------------------------------------------------------

/**
 * Anonymous teaser bundle: one fully-rendered match (real investor data + a
 * curated why-fit/how-to-pitch/drafted email) plus the next four firms for
 * the blurred locked rest. Used by the unauthenticated /investors landing.
 *
 * @description The teaser firm is Planet A Ventures, the same investor used
 * on the marketing example match (src/components/marketing/example-investor-match.tsx)
 * so the hero promise on the homepage matches what an anonymous visitor
 * actually sees inside /investors. The match output text is hand-curated for
 * a sentinel "UK pre-seed climate-hardware founder" foundry context — no LLM
 * call is made on the anonymous path so there is zero per-visit cost.
 *
 * Falls back to the first firm in marketplace_listings if Planet A is not
 * present (e.g. fresh dev DB) so the page still renders something real.
 */
export interface AnonymousInvestorsTeaser {
  teaserFirm: InvestorFirm | null
  teaserMatchOutput: InvestorMatchOutputView | null
  blurredFirms: InvestorFirm[]
  /** Sentinel foundry context summarised for the banner copy. */
  sentinelContext: {
    sector: string
    stage: string
    traction: string
  }
  /** Total number of investor firms in the directory — used by the "1 of N" copy. */
  totalFirms: number
}

const ANONYMOUS_TEASER_FIRM_NAME = 'Planet A'

const ANONYMOUS_TEASER_SENTINEL = {
  sector: 'climate hardware',
  stage: 'pre-seed',
  traction: 'first commercial pilot signed',
} as const

const ANONYMOUS_TEASER_MATCH_OUTPUT: InvestorMatchOutputView = {
  whyFit:
    "Planet A's in-house science team calculates life cycle assessments to quantify impact on every deal, and a UK pre-seed climate-hardware founder with a first commercial pilot signed is exactly the file they fund against. Portfolio peers like Project Eaden and Arsenale Bioyards show they back hardware-led climate plays at this stage, with cheques sitting inside their typical €0.5M to €5M initial band. A signed pilot puts you ahead of the average pre-seed they back on traction, which is the bar Tina cited as a deal-breaker on the Hardware in Climate podcast.",
  howToPitch:
    "Lead with the resource-per-output number Planet A's science team can validate, draw a parallel to one named portfolio company that solved an adjacent piece of the climate stack, then land on the signed pilot as proof that your hardware works in a real customer's operation. Skip the total addressable market slide entirely — Planet A reads them as a cue to slow-walk a deal.",
  draftedEmailSubject:
    'Planet A: Climate hardware with a signed pilot, [your traction headline], EU pre-seed',
  draftedEmailBody:
    [
      'Hi Tina,',
      'We are building a climate-hardware platform with our first commercial pilot signed and live data flowing back into a life cycle assessment your science team could validate directly.',
      'I see a real fit with how you backed Project Eaden and Arsenale Bioyards. Could I send a 20-minute walkthrough of our resource-per-output numbers and the contract structure of the pilot?',
    ].join('\n\n'),
  sourceCitations: [
    {
      type: 'fund_decision',
      text: 'Planet A typical pre-seed cheque sits between €0.5M and €5M, with a science-led diligence step.',
      source: 'Planet A public fund disclosure, 2026',
    },
    {
      type: 'portfolio_precedent',
      text: 'Project Eaden and Arsenale Bioyards are existing portfolio companies in the hardware-led climate stack.',
      source: 'Planet A portfolio page',
    },
  ],
  fromCache: true,
  modelUsed: 'curated-anonymous-teaser',
}

/**
 * Loads the anonymous-mode teaser bundle. Safe to call without an authenticated
 * user — uses the admin client to read public-by-design fields from
 * marketplace_listings (no contacts, no deep tier-gated data).
 */
export async function getAnonymousInvestorsTeaser(): Promise<AnonymousInvestorsTeaser> {
  const admin = createAdminClient()

  // Look up the curated teaser firm by exact title match. ilike with the
  // sanitised value protects against directory drift where the title has been
  // re-cased or had a suffix appended (e.g. "Planet A Ventures").
  const { data: teaserRow } = await admin
    .from('marketplace_listings')
    .select('*')
    .eq('category', 'Finance')
    .ilike('title', `${ANONYMOUS_TEASER_FIRM_NAME}%`)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  // Fall back to the highest-quality firm if the curated firm isn't seeded.
  // The signup-wall promise is the same either way, but we never want a blank
  // teaser on a fresh database.
  let teaserFirm: InvestorFirm | null = teaserRow ? rowToFirm(teaserRow as Record<string, unknown>) : null
  if (!teaserFirm) {
    const { data: fallbackRow } = await admin
      .from('marketplace_listings')
      .select('*')
      .eq('category', 'Finance')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    teaserFirm = fallbackRow ? rowToFirm(fallbackRow as Record<string, unknown>) : null
  }

  // Pull the next four firms for the blurred rest. Excludes the teaser by id
  // (when known) so the founder doesn't see the same firm rendered twice.
  let blurredQuery = admin
    .from('marketplace_listings')
    .select('*')
    .eq('category', 'Finance')
    .order('created_at', { ascending: true })
    .limit(5)
  if (teaserFirm?.id) {
    blurredQuery = blurredQuery.neq('id', teaserFirm.id)
  }
  const { data: blurredRows } = await blurredQuery
  const blurredFirms: InvestorFirm[] = (blurredRows ?? [])
    .map((row) => rowToFirm(row as Record<string, unknown>))
    .slice(0, 4)

  // Total count drives the "1 fully-rendered, N more blurred" copy.
  const { count: totalFirms } = await admin
    .from('marketplace_listings')
    .select('id', { count: 'exact', head: true })
    .eq('category', 'Finance')

  return {
    teaserFirm,
    teaserMatchOutput: teaserFirm ? ANONYMOUS_TEASER_MATCH_OUTPUT : null,
    blurredFirms,
    sentinelContext: { ...ANONYMOUS_TEASER_SENTINEL },
    totalFirms: totalFirms ?? 0,
  }
}

/**
 * Fetches a single investor firm by ID with tier-gating.
 *
 * @returns The firm (with deep fields stripped based on tier), tier access flags,
 * or gated:true if user lacks detail access.
 */
export async function getInvestorById(id: string): Promise<{
  firm: InvestorFirm | null
  access: InvestorTierAccess
  gated: boolean
  viewCapHit?: boolean
  viewCap?: InvestorViewCapResult
}> {
  const access = await getInvestorTierAccess()

  // SECURITY: Validate UUID format before hitting Supabase (reject bot/scanner probes early)
  if (!UUID_RE.test(id)) {
    return { firm: null, access, gated: false }
  }

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user

  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('id, title, description, subcategory, attributes')
    .eq('id', id)
    .eq('category', 'Finance')
    .single()

  if (error || !data) {
    console.error('[getInvestorById] Not found or error:', error)
    return { firm: null, access, gated: false }
  }

  const firm = rowToFirm(data as Record<string, unknown>)

  // FLOW: Monthly view cap with "once viewed, always yours" library.
  // Free: 15/mo, Seed: 50/mo, Starter: 200/mo, Pro/Ent: unlimited.
  // We need the user's foundry to check caps.
  let foundryId: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()
    foundryId = profile?.foundry_id ?? null
  }

  // Not logged in or no foundry: fall back to fully gated teaser
  if (!user || !foundryId) {
    return {
      firm: {
        id: firm.id,
        title: firm.title,
        description: null,
        subcategory: firm.subcategory,
        attributes: {
          firm_type: firm.attributes.firm_type,
          hq_city: firm.attributes.hq_city,
          is_active_deploying: firm.attributes.is_active_deploying,
        },
      },
      access,
      gated: true,
    }
  }

  // Check the view cap (pass userId so ambassador status can be verified)
  const viewCap = await checkInvestorViewCap(foundryId, access.tier, id, user.id)

  if (!viewCap.allowed) {
    // INTENT: Return teaser data (name, type, location) plus viewCapHit flag
    // so the UI can show a "you've used your views" overlay with upgrade CTA
    // instead of a blank lock.
    return {
      firm: {
        id: firm.id,
        title: firm.title,
        description: null,
        subcategory: firm.subcategory,
        attributes: {
          firm_type: firm.attributes.firm_type,
          hq_city: firm.attributes.hq_city,
          is_active_deploying: firm.attributes.is_active_deploying,
        },
      },
      access,
      gated: false,
      viewCapHit: true,
      viewCap,
    }
  }

  // FLOW: View allowed — record it for cap tracking, then return full data
  await recordInvestorDetailView(id, foundryId, user.id)

  // Strip deep fields based on tier
  const [withStatus] = await attachContactStatuses([stripTierGatedFields(firm, access)])
  return { firm: withStatus, access, gated: false, viewCap }
}

// DECISION: firm_type is the reliable discriminator for investor vs service provider.
const INVESTOR_FIRM_TYPES = new Set([
  'VC', 'PE', 'Growth', 'Growth Equity', 'Family Office', 'CVC',
  'Corporate VC', 'Accelerator', 'Angel', 'Angel Network', 'Debt Fund',
  'Impact Fund', 'EIS Fund', 'SEIS Fund',
])

// INTENT: raw firm_type values in marketplace_listings.attributes have drifted
// over multiple imports — uppercase slugs ("GOVT_GRANT"), legacy camel-case,
// and human-readable strings co-exist for the same concept. We import the
// canonical normaliser from the shared firm-type-labels module so server
// and client agree (see top-of-file imports).

/**
 * Fetches aggregated stats for the investor directory insights panel.
 */
export const getInvestorStats = unstable_cache(
  async (): Promise<InvestorStats> => {
    // SECURITY: admin client — aggregate stats over marketplace_listings (cross-foundry by design), foundry_id not needed
    const supabase = createAdminClient()

    // INTENT: Fetch ALL investors for stats computation.
    // GOTCHA: Supabase PostgREST has a server-side max_rows setting (default 1000)
    // that caps ANY request regardless of .limit(). Must paginate to get all rows.
    const PAGE_SIZE = 1000
    let allRows: Record<string, unknown>[] = []
    let page = 0
    let hasMore = true

    // SECURITY: Hard cap at 20 pages (20K rows) to prevent OOM on serverless
    const MAX_PAGES = 20
    while (hasMore && page < MAX_PAGES) {
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data: pageData, error: pageError } = await supabase
        .from('marketplace_listings')
        .select('subcategory, attributes')
        .eq('category', 'Finance')
        .range(from, to)

      if (pageError) {
        console.error('[getInvestorStats] Pagination error:', pageError)
        break
      }

      const rows = pageData ?? []
      allRows = allRows.concat(rows as Record<string, unknown>[])
      hasMore = rows.length === PAGE_SIZE
      page++
    }

    const data = allRows

    if (data.length === 0) {
      console.error('[getInvestorStats] No data returned')
      return {
        total: 0,
        investorCount: 0,
        serviceProviderCount: 0,
        withWebsiteCount: 0,
        activeDeployingCount: 0,
        forgeCapitalCount: 0,
        partnerCount: 0,
        subcategoryBreakdown: [],
        regionBreakdown: [],
        typeBreakdown: [],
        topSectors: [],
        stageFocusBreakdown: [],
        qualityDistribution: [],
        hwFit7PlusCount: 0,
        portfolioCompanyCount: 0,
        avgQuality: 0,
      }
    }

    const rows = data ?? []
    const total = rows.length

    let investorCount = 0
    let serviceProviderCount = 0
    let withWebsiteCount = 0
    let activeDeployingCount = 0
    let forgeCapitalCount = 0
    let hwFit7PlusCount = 0
    let portfolioCompanyCount = 0
    let totalQualityScore = 0
    let qualityScoreCount = 0

    const subcategoryCounts: Record<string, number> = {}
    const regionCounts: Record<string, number> = {}
    const typeCounts: Record<string, number> = {}
    const sectorCounts: Record<string, number> = {}
    const stageCounts: Record<string, number> = {}
    const qualityBuckets: Record<string, number> = {
      '0-2': 0,
      '2-4': 0,
      '4-6': 0,
      '6-8': 0,
      '8-10': 0,
    }

    for (const row of rows) {
      const attrs = (row.attributes as Record<string, unknown>) ?? {}

      const firmType = (attrs.firm_type as string) ?? ''
      if (INVESTOR_FIRM_TYPES.has(firmType)) {
        investorCount++
      } else {
        serviceProviderCount++
      }

      // Track type breakdown — normalise raw slugs to human labels first so
      // duplicates like "GOVT_GRANT" + "Government Grant" collapse to one
      // bucket and acronyms like "CVC" / "VC" / "PE" never reach the UI.
      if (firmType) {
        const label = normaliseFirmTypeLabel(firmType)
        typeCounts[label] = (typeCounts[label] ?? 0) + 1
      }

      if (attrs.website_url) withWebsiteCount++
      if (attrs.is_active_deploying === true) activeDeployingCount++
      if (attrs.data_source === 'forge_capital') forgeCapitalCount++

      // Hardware fit score
      const hwScore = (attrs.hardware_fit_score as number) ?? 0
      if (hwScore >= 7) hwFit7PlusCount++

      // Data quality score
      const qualityScore = (attrs.data_quality_score as number) ?? 0
      if (qualityScore > 0) {
        totalQualityScore += qualityScore
        qualityScoreCount++
        // Bucket by quality range
        if (qualityScore <= 2) qualityBuckets['0-2']++
        else if (qualityScore <= 4) qualityBuckets['2-4']++
        else if (qualityScore <= 6) qualityBuckets['4-6']++
        else if (qualityScore <= 8) qualityBuckets['6-8']++
        else qualityBuckets['8-10']++
      }

      // Portfolio companies — count from JSONB for per-investor display
      // (actual portfolioCompanyCount is fetched separately from materialized table)

      // Sectors — normalize case to deduplicate (e.g. "FinTech" vs "fintech" vs "Fintech")
      const SECTOR_NORMALIZE: Record<string, string> = {
        'fintech': 'FinTech', 'Fintech': 'FinTech', 'FINTECH': 'FinTech',
        'ai': 'AI', 'Ai': 'AI',
        'saas': 'SaaS', 'SAAS': 'SaaS', 'Saas': 'SaaS',
        'biotech': 'BioTech', 'Biotech': 'BioTech',
        'cleantech': 'CleanTech', 'Cleantech': 'CleanTech', 'climate tech': 'Climate Tech',
        'deep tech': 'Deep Tech', 'deeptech': 'Deep Tech', 'DeepTech': 'Deep Tech',
        'healthtech': 'HealthTech', 'health tech': 'HealthTech',
        'edtech': 'EdTech', 'ed tech': 'EdTech',
        'proptech': 'PropTech', 'prop tech': 'PropTech',
        'agtech': 'AgTech', 'agritech': 'AgTech',
        'e-commerce': 'E-commerce', 'ecommerce': 'E-commerce',
        'cybersecurity': 'Cybersecurity', 'cyber security': 'Cybersecurity',
      }
      const sectors = toStringArray(attrs.sector_focus ?? attrs.sectors)
      for (const sector of sectors) {
        const normalized = SECTOR_NORMALIZE[sector] ?? SECTOR_NORMALIZE[sector.toLowerCase()] ?? sector
        sectorCounts[normalized] = (sectorCounts[normalized] ?? 0) + 1
      }

      // Stage focus — normalize to canonical labels
      const STAGE_NORMALIZE: Record<string, string> = {
        'pre-seed': 'Pre-Seed', 'preseed': 'Pre-Seed', 'Pre-seed': 'Pre-Seed',
        'seed': 'Seed', 'Seed': 'Seed',
        'series a': 'Series A', 'Series A': 'Series A', 'series-a': 'Series A',
        'series b': 'Series B', 'Series B': 'Series B', 'series-b': 'Series B',
        'series c': 'Series C', 'Series C': 'Series C', 'series-c': 'Series C',
        'series d': 'Series D', 'Series D': 'Series D', 'series-d': 'Series D',
        'growth': 'Growth', 'Growth': 'Growth',
        'late stage': 'Late Stage', 'Late Stage': 'Late Stage', 'late-stage': 'Late Stage',
        'early-stage': 'Seed', 'early stage': 'Seed', 'Early-stage': 'Seed',
        'venture': 'Seed', 'angel': 'Pre-Seed',
      }
      const stages = toStringArray(attrs.stage_focus)
      for (const stage of stages) {
        const normalized = STAGE_NORMALIZE[stage] ?? STAGE_NORMALIZE[stage.toLowerCase()] ?? null
        if (normalized) stageCounts[normalized] = (stageCounts[normalized] ?? 0) + 1
        // Skip unrecognized stages to keep charts clean
      }

      const sub = (row.subcategory as string) || 'Unknown'
      subcategoryCounts[sub] = (subcategoryCounts[sub] ?? 0) + 1

      // INTENT: Extract country/region from location for geographic distribution chart.
      // Previous approach was UK-postcode-only. Now extract country from location text.
      const hqCity = (attrs.hq_city as string) || ''
      const location = (attrs.location as string) || ''
      const gf = toStringArray(attrs.geo_focus)
      const locationText = hqCity || location

      // DECISION: Collapse every geo signal into 6 clean buckets. Previous code
      // produced 15+ entries (UK / US / Germany / San Francisco / Canada / Israel
      // / Not specified …) which cluttered the chart. User-mandated buckets:
      //   UK            — UK, England, Scotland, Wales, London…
      //   Europe        — France, Germany, Italy, Spain, Netherlands, Sweden,
      //                   Switzerland, Nordics, Israel (per user preference)…
      //   North America — US, USA, any US city, Canada
      //   Latin America — Latam, Brazil, Mexico, Argentina…
      //   Asia-Pacific  — India, China, Japan, Singapore, APAC…
      //   Global        — "Global", "worldwide", "international", unspecified
      // Precedence: checked in order; first match wins.
      const GEO_BUCKETS: Array<[RegExp, string]> = [
        [/\b(uk|united kingdom|britain|england|scotland|wales|london|manchester|birmingham|edinburgh|bristol|cambridge|oxford|leeds|glasgow|liverpool)\b/i, 'UK'],
        [/\b(us|usa|united states|america|american|san francisco|new york|boston|chicago|los angeles|seattle|austin|miami|silicon valley|denver|canada|toronto|vancouver|montreal|ottawa)\b/i, 'North America'],
        [/\b(latin america|latam|brazil|mexico|argentina|colombia|chile|peru|uruguay|sao paulo|buenos aires|mexico city)\b/i, 'Latin America'],
        [/\b(asia|apac|asia-pacific|india|china|japan|singapore|korea|taiwan|hong kong|mumbai|bangalore|beijing|shanghai|tokyo|seoul|jakarta|sydney|melbourne|australia|new zealand)\b/i, 'Asia-Pacific'],
        // Europe AFTER North America so "Canada" isn't captured by a loose "europe" rule; Israel bucketed here per user's explicit choice.
        [/\b(europe|european|eu|emea|france|paris|germany|berlin|munich|spain|madrid|barcelona|italy|milan|rome|netherlands|amsterdam|sweden|stockholm|switzerland|zurich|geneva|austria|vienna|belgium|brussels|denmark|copenhagen|norway|oslo|finland|helsinki|ireland|dublin|portugal|lisbon|poland|warsaw|nordics|israel|tel aviv)\b/i, 'Europe'],
        [/\b(global|worldwide|international)\b/i, 'Global'],
      ]
      const bucketOf = (text: string): string | null => {
        if (!text) return null
        for (const [re, label] of GEO_BUCKETS) if (re.test(text)) return label
        return null
      }

      // Prefer geo_focus (authoritative) then hq_city/location text.
      let region = bucketOf(gf.join(' ')) ?? bucketOf(locationText)
      if (!region) region = 'Global' // unclassifiable → Global (user's rule: "not specified could be global")
      regionCounts[region] = (regionCounts[region] ?? 0) + 1
    }

    const avgQuality = qualityScoreCount > 0 ? totalQualityScore / qualityScoreCount : 0

    // Count total partners + portfolio companies from materialized table
    const [{ count: partnerCount }, { count: portfolioDbCount }] = await Promise.all([
      supabase.from('vc_pe_contacts').select('id', { count: 'exact', head: true }),
      supabase.from('investor_portfolio_companies').select('id', { count: 'exact', head: true }),
    ])
    portfolioCompanyCount = portfolioDbCount ?? 0

    const subcategoryBreakdown = Object.entries(subcategoryCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const regionBreakdown = Object.entries(regionCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 11)

    const typeBreakdown = Object.entries(typeCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    const topSectors = Object.entries(sectorCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const stageFocusBreakdown = Object.entries(stageCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    const qualityDistribution = Object.entries(qualityBuckets)
      .map(([range, count]) => ({ range, count }))

    return {
      total,
      investorCount,
      serviceProviderCount,
      withWebsiteCount,
      activeDeployingCount,
      forgeCapitalCount,
      partnerCount: partnerCount ?? 0,
      subcategoryBreakdown,
      regionBreakdown,
      typeBreakdown,
      topSectors,
      stageFocusBreakdown,
      qualityDistribution,
      hwFit7PlusCount,
      portfolioCompanyCount,
      avgQuality: Math.round(avgQuality * 100) / 100,
    }
  },
  ['investor-stats-v6-dedup-portfolio'],
  { revalidate: 600 }
)

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

/**
 * Shape of a single contact from the vc_pe_contacts table.
 */
export type InvestorContact = {
  id: string
  full_name: string
  title: string | null
  seniority: string | null
  email: string | null
  email_verified: boolean | null
  /**
   * Tier classification of how this email was verified. Tier vocabulary:
   * - 'corresponded' / 'hunter_verified' / 'neverbounce_valid' / 'neverbounce_catchall' = sendable (green)
   * - 'neverbounce_unknown' / 'unverified' / 'generic_blocked' = uncertain (amber)
   * - 'neverbounce_invalid' / 'neverbounce_disposable' / 'bounced' = bad (red)
   * Tier-gated identically to email — null below professional tier.
   */
  email_tier: string | null
  email_tier_at: string | null
  email_verified_at: string | null
  linkedin_url: string | null
  is_decision_maker: boolean | null
  outreach_status: string | null
  notes: string | null
  deep_bio: string | null
  warm_intro_path: string | null
  /** Set when deepAccess is false — indicates whether the contact actually has a deep bio */
  has_deep_bio?: boolean
  /** Set when deepAccess is false — indicates whether the contact actually has an email */
  has_email?: boolean
}

// SECURITY: UUID format validator to avoid unnecessary Supabase round-trips on bogus IDs
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Fetches contacts associated with an investor firm listing.
 * Tier-gated: strips email and deep_bio for users below professional tier.
 */
export async function getInvestorContacts(listingId: string, precomputedAccess?: InvestorTierAccess): Promise<{
  contacts: InvestorContact[]
  access: InvestorTierAccess
}> {
  const access = precomputedAccess ?? await getInvestorTierAccess()

  // Free tier: no contacts visible
  if (!access.contactsVisible) {
    return { contacts: [], access }
  }

  // SECURITY: Validate UUID format
  if (!UUID_RE.test(listingId)) {
    return { contacts: [], access }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('vc_pe_contacts')
    // SECURITY: Never SELECT email_verifier_raw — it's heavy jsonb meant for server-side audits only.
    .select('id, full_name, title, seniority, email, email_verified, email_tier, email_tier_at, email_verified_at, linkedin_url, is_decision_maker, outreach_status, notes, deep_bio, warm_intro_path')
    .eq('listing_id', listingId)
    .order('is_decision_maker', { ascending: false })
    .order('full_name', { ascending: true })

  if (error) {
    console.error('[getInvestorContacts] Supabase error:', error)
    return { contacts: [], access }
  }

  // INTENT: Filter out organization/company names that were incorrectly stored as contacts.
  // These come from Companies House data where entity names (law firms, associations, etc.)
  // were scraped alongside actual people.
  const ORG_PATTERNS = /\b(LLP|Ltd|Limited|PLC|Inc|LLC|Association|Chamber|Authority|Institute|Foundation|Council|Bureau|Commission|Agency|Corporation|Group|Partners|Fund|Trust|Board|Network)\b/i
  let contacts = ((data ?? []) as InvestorContact[]).filter(c => !ORG_PATTERNS.test(c.full_name))

  // Strip deep fields for users below professional tier
  // DECISION: Expose has_deep_bio/has_email flags so the UI can show lock indicators
  // only when there is actually data behind the lock (avoids misleading upgrade prompts).
  if (!access.deepAccess) {
    contacts = contacts.map(c => ({
      ...c,
      has_deep_bio: !!c.deep_bio,
      has_email: !!c.email,
      email: null,
      // SECURITY: Tier-gate email verification provenance alongside the email itself.
      // Lower tiers should not learn how/when contacts were verified.
      email_tier: null,
      email_tier_at: null,
      email_verified_at: null,
      deep_bio: null,
    }))
  }

  // Strip warm intro path for users below starter tier
  // GOTCHA: contactsVisible is already checked above (line 670) — use detailAccess for this gate
  if (!access.detailAccess) {
    contacts = contacts.map(c => ({ ...c, warm_intro_path: null }))
  }

  return { contacts, access }
}

// ---------------------------------------------------------------------------
// Shortlist types
// ---------------------------------------------------------------------------

export type ShortlistStage = 'researching' | 'contacted' | 'meeting' | 'in_discussion' | 'closed_won' | 'closed_lost'

const VALID_SHORTLIST_STAGES = new Set<ShortlistStage>([
  'researching', 'contacted', 'meeting', 'in_discussion', 'closed_won', 'closed_lost',
])

export type InvestorNote = {
  id: string
  listing_id: string
  note_type: 'note' | 'meeting' | 'email' | 'call' | 'milestone'
  content: string
  created_at: string
}

const VALID_NOTE_TYPES = new Set(['note', 'meeting', 'email', 'call', 'milestone'])

// ---------------------------------------------------------------------------
// Match Scores
// ---------------------------------------------------------------------------

/**
 * Fetches the current user's foundry profile for match scoring.
 * Cached variant used by semantic search to avoid duplicate auth round-trips.
 */
async function getFoundryProfileCached(): Promise<FoundryProfile | null> {
  return getFoundryProfile()
}

/**
 * Fetches the current user's foundry profile for match scoring.
 */
async function getFoundryProfile(): Promise<FoundryProfile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id')
    .eq('id', user.id)
    .single()

  if (!profile?.foundry_id) return null

  const { data: foundry } = await supabase
    .from('foundries')
    .select('stage, sector, industry')
    .eq('id', profile.foundry_id)
    .single()

  if (!foundry) return null
  return { stage: foundry.stage, sector: foundry.sector, industry: foundry.industry }
}

/**
 * Per-firm match result returned by computeMatchScores.
 * Exposes both the composite score and the 6-pillar breakdown so the UI can
 * render MatchPillarBars without a second round-trip.
 */
export interface FirmMatchResult {
  score: number
  pillars: MatchBreakdown['pillars']
}

/**
 * Computes match scores for a set of investor firms against the current user's profile.
 *
 * @param firmIds - Array of listing IDs to score. Max 200 per call.
 * @param similarities - Optional map of listing ID → cosine similarity from a
 *   prior `searchInvestors` call. Without this the thesis pillar bottoms out
 *   at 0 for free-text queries (no structured `profile.sector`), which made
 *   composites display as ~50% even on strong semantic matches. Pass the
 *   similarities you already received from the search response. Fixed
 *   2026-04-27.
 * @returns Record mapping listing ID to { score, pillars }.
 */
export async function computeMatchScores(
  firmIds: string[],
  similarities?: Record<string, number>
): Promise<Record<string, FirmMatchResult>> {
  const profile = await getFoundryProfile()
  if (!profile) return {}

  // Validate UUIDs
  const safeIds = firmIds.filter(id => UUID_RE.test(id)).slice(0, 200)
  if (safeIds.length === 0) return {}

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('id, title, description, subcategory, attributes')
    .eq('category', 'Finance')
    .in('id', safeIds)

  if (error || !data) return {}

  const result: Record<string, FirmMatchResult> = {}
  for (const row of data) {
    const firm = rowToFirm(row as Record<string, unknown>)
    const sim = similarities?.[firm.id]
    const breakdown = calculateMatchScore(firm, profile, sim)
    result[firm.id] = { score: breakdown.total, pillars: breakdown.pillars }
  }
  return result
}

/**
 * Batch-fetch contact availability status per listing. Derivation:
 *   any partner with email_verified=true → 'verified'
 *   else any partner with email present  → 'inferred'
 *   else                                 → 'none'
 */
export async function getContactStatuses(
  listingIds: string[]
): Promise<Record<string, 'verified' | 'inferred' | 'none'>> {
  if (listingIds.length === 0) return {}
  const safeIds = listingIds.filter(id => UUID_RE.test(id)).slice(0, 500)
  if (safeIds.length === 0) return {}

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vc_pe_contacts')
    .select('listing_id, email, email_verified')
    .in('listing_id', safeIds)

  if (error || !data) return {}

  const agg = new Map<string, { anyVerified: boolean; anyEmail: boolean }>()
  for (const row of data as Array<Record<string, unknown>>) {
    const lid = row.listing_id as string
    const entry = agg.get(lid) ?? { anyVerified: false, anyEmail: false }
    if (row.email_verified === true) entry.anyVerified = true
    if (row.email) entry.anyEmail = true
    agg.set(lid, entry)
  }

  const result: Record<string, 'verified' | 'inferred' | 'none'> = {}
  for (const id of safeIds) {
    const e = agg.get(id)
    result[id] = e?.anyVerified ? 'verified' : e?.anyEmail ? 'inferred' : 'none'
  }
  return result
}

async function attachContactStatuses(firms: InvestorFirm[]): Promise<InvestorFirm[]> {
  if (firms.length === 0) return firms
  const statuses = await getContactStatuses(firms.map(f => f.id))
  return firms.map(f => ({ ...f, contact_status: statuses[f.id] ?? 'none' }))
}

/**
 * Batch-fetch contact counts per investor listing.
 * Used by InvestorTableView to show the "Contacts" column.
 */
export async function getContactCounts(
  listingIds: string[]
): Promise<Record<string, number>> {
  if (listingIds.length === 0) return {}
  const safeIds = listingIds.filter(id => UUID_RE.test(id)).slice(0, 200)
  if (safeIds.length === 0) return {}

  const supabase = await createClient()
  // INTENT: Single query to count contacts per listing, avoiding N+1
  const { data, error } = await supabase
    .from('vc_pe_contacts')
    .select('listing_id')
    .in('listing_id', safeIds)

  if (error || !data) return {}

  const counts: Record<string, number> = {}
  for (const row of data) {
    const lid = (row as Record<string, unknown>).listing_id as string
    counts[lid] = (counts[lid] ?? 0) + 1
  }
  return counts
}

// ---------------------------------------------------------------------------
// Shortlist CRUD
// ---------------------------------------------------------------------------

/**
 * Adds an investor to the user's shortlist (upsert).
 */
export async function addToShortlist(
  listingId: string,
  stage: ShortlistStage = 'researching'
): Promise<{ error?: string }> {
  if (!UUID_RE.test(listingId)) return { error: 'Invalid listing ID' }
  if (!VALID_SHORTLIST_STAGES.has(stage)) return { error: 'Invalid stage' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('investor_shortlist')
    .upsert(
      { user_id: user.id, listing_id: listingId, stage },
      { onConflict: 'user_id,listing_id' }
    )

  if (error) {
    console.error('[addToShortlist] Error:', error)
    return { error: 'Failed to add to shortlist' }
  }
  return {}
}

/**
 * Updates the pipeline stage of a shortlisted investor.
 */
export async function updateShortlistStage(
  listingId: string,
  stage: ShortlistStage
): Promise<{ error?: string }> {
  if (!UUID_RE.test(listingId)) return { error: 'Invalid listing ID' }
  if (!VALID_SHORTLIST_STAGES.has(stage)) return { error: 'Invalid stage' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('investor_shortlist')
    .update({ stage })
    .eq('user_id', user.id)
    .eq('listing_id', listingId)

  if (error) {
    console.error('[updateShortlistStage] Error:', error)
    return { error: 'Failed to update stage' }
  }
  return {}
}

/**
 * Removes an investor from the user's shortlist.
 */
export async function removeFromShortlist(
  listingId: string
): Promise<{ error?: string }> {
  if (!UUID_RE.test(listingId)) return { error: 'Invalid listing ID' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('investor_shortlist')
    .delete()
    .eq('user_id', user.id)
    .eq('listing_id', listingId)

  if (error) {
    console.error('[removeFromShortlist] Error:', error)
    return { error: 'Failed to remove from shortlist' }
  }
  return {}
}

/**
 * Returns a map of listing IDs to shortlist stages for the current user.
 */
export async function getShortlistIds(): Promise<Record<string, ShortlistStage>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const { data, error } = await supabase
    .from('investor_shortlist')
    .select('listing_id, stage')
    .eq('user_id', user.id)

  if (error) {
    console.error('[getShortlistIds] Error:', error)
    return {}
  }

  const result: Record<string, ShortlistStage> = {}
  for (const row of data ?? []) {
    result[row.listing_id] = row.stage as ShortlistStage
  }
  return result
}

/**
 * Returns full shortlisted firms joined with shortlist metadata.
 */
export async function getShortlist(): Promise<{
  items: (InvestorFirm & { shortlistStage: ShortlistStage; shortlistUpdatedAt: string })[]
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { items: [] }

  // SECURITY: Cap shortlist size to prevent unbounded IN() query exceeding PostgREST URL limits
  const { data: shortlistRows, error: slError } = await supabase
    .from('investor_shortlist')
    .select('listing_id, stage, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(200)

  if (slError || !shortlistRows || shortlistRows.length === 0) return { items: [] }

  // Batch listing IDs into chunks of 50 to stay well within PostgREST URL limits
  const listingIds = shortlistRows.map(r => r.listing_id)
  const BATCH_SIZE = 50
  const allListings: Record<string, unknown>[] = []
  for (let i = 0; i < listingIds.length; i += BATCH_SIZE) {
    const batch = listingIds.slice(i, i + BATCH_SIZE)
    const { data, error } = await supabase
      .from('marketplace_listings')
      .select('id, title, description, subcategory, attributes')
      .eq('category', 'Finance')
      .in('id', batch)
    if (!error && data) allListings.push(...data)
  }
  const listings = allListings
  const lError = null

  if (lError || !listings) return { items: [] }

  const access = await getInvestorTierAccess()
  const baseFirms = listings.map(row =>
    stripTierGatedFields(rowToFirm(row as Record<string, unknown>), access),
  )
  const withStatuses = await attachContactStatuses(baseFirms)
  const firmMap = new Map<string, InvestorFirm>()
  for (const firm of withStatuses) firmMap.set(firm.id, firm)

  const items = shortlistRows
    .map(sl => {
      const firm = firmMap.get(sl.listing_id)
      if (!firm) return null
      return {
        ...firm,
        shortlistStage: sl.stage as ShortlistStage,
        shortlistUpdatedAt: sl.updated_at,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  return { items }
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/**
 * Adds a note to an investor's activity log.
 */
export async function addInvestorNote(
  listingId: string,
  content: string,
  noteType: string = 'note'
): Promise<{ error?: string }> {
  if (!UUID_RE.test(listingId)) return { error: 'Invalid listing ID' }
  if (!content.trim()) return { error: 'Note content is required' }
  if (!VALID_NOTE_TYPES.has(noteType)) return { error: 'Invalid note type' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // SECURITY: Truncate content to prevent abuse (max 5000 chars)
  const safeContent = content.trim().slice(0, 5000)

  const { error } = await supabase
    .from('investor_notes')
    .insert({
      user_id: user.id,
      listing_id: listingId,
      note_type: noteType,
      content: safeContent,
    })

  if (error) {
    console.error('[addInvestorNote] Error:', error)
    return { error: 'Failed to add note' }
  }
  return {}
}

/**
 * Fetches notes for a specific investor, ordered by most recent first.
 */
export async function getInvestorNotes(
  listingId: string
): Promise<{ notes: InvestorNote[] }> {
  if (!UUID_RE.test(listingId)) return { notes: [] }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { notes: [] }

  const { data, error } = await supabase
    .from('investor_notes')
    .select('id, listing_id, note_type, content, created_at')
    .eq('user_id', user.id)
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[getInvestorNotes] Error:', error)
    return { notes: [] }
  }

  return { notes: (data ?? []) as InvestorNote[] }
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

/**
 * Toggles alert subscription for an investor.
 * Uses atomic upsert + SQL toggle to avoid TOCTOU race on rapid double-click.
 */
export async function toggleInvestorAlert(
  listingId: string
): Promise<{ active?: boolean; error?: string }> {
  if (!UUID_RE.test(listingId)) return { error: 'Invalid listing ID' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Atomic: upsert with toggle via RPC to avoid SELECT+UPDATE TOCTOU race
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('toggle_investor_alert', {
    p_user_id: user.id,
    p_listing_id: listingId,
  })

  // Fallback if RPC doesn't exist yet: two-step with upsert for safety
  if (error?.code === '42883') {
    const { data: existing } = await supabase
      .from('investor_alerts')
      .select('id, active')
      .eq('user_id', user.id)
      .eq('listing_id', listingId)
      .maybeSingle()

    if (existing) {
      const newActive = !existing.active
      const { error: updateErr } = await supabase
        .from('investor_alerts')
        .update({ active: newActive })
        .eq('id', existing.id)
      if (updateErr) return { error: 'Failed to toggle alert' }
      return { active: newActive }
    }

    const { error: insertErr } = await supabase
      .from('investor_alerts')
      .upsert(
        { user_id: user.id, listing_id: listingId, active: true },
        { onConflict: 'user_id,listing_id' }
      )
    if (insertErr) return { error: 'Failed to create alert' }
    return { active: true }
  }

  if (error) return { error: 'Failed to toggle alert' }
  return { active: Boolean(data) }
}

/**
 * Returns listing IDs with active alerts for the current user.
 */
export async function getAlertedListingIds(): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('investor_alerts')
    .select('listing_id')
    .eq('user_id', user.id)
    .eq('active', true)

  if (error) return []
  return (data ?? []).map(r => r.listing_id)
}

// ---------------------------------------------------------------------------
// Similar Investors
// ---------------------------------------------------------------------------

/**
 * Finds investors similar to the given firm using Jaccard similarity.
 */
export async function getSimilarInvestors(
  listingId: string,
  limit = 5,
  precomputedAccess?: InvestorTierAccess
): Promise<{ firms: InvestorFirm[]; similarityScores: Record<string, number> }> {
  if (!UUID_RE.test(listingId)) return { firms: [], similarityScores: {} }

  const supabase = await createClient()

  // Fetch target firm
  const { data: targetRow } = await supabase
    .from('marketplace_listings')
    .select('id, title, description, subcategory, attributes')
    .eq('id', listingId)
    .eq('category', 'Finance')
    .single()

  if (!targetRow) return { firms: [], similarityScores: {} }
  const target = rowToFirm(targetRow as Record<string, unknown>)

  // Fetch full candidate pool for unbiased Jaccard similarity ranking
  // DECISION: Previous limit(200) + ORDER BY title created alphabetical bias.
  // Investor directory is typically < 2000 firms, and we only select 5 columns,
  // so fetching all is manageable.
  // GOTCHA: PostgREST silently caps .limit() at server-side max_rows (default 1000).
  // Must paginate with .range() to get all rows. See getInvestorStats() for pattern.
  const PAGE_SIZE = 500
  let candidateRows: Record<string, unknown>[] = []
  let page = 0
  let hasMorePages = true
  // SECURITY: Hard cap at 10 pages (5K rows) to prevent OOM on serverless
  const MAX_PAGES = 10
  while (hasMorePages && page < MAX_PAGES) {
    const rangeFrom = page * PAGE_SIZE
    const rangeTo = rangeFrom + PAGE_SIZE - 1
    const { data: pageData, error: pageError } = await supabase
      .from('marketplace_listings')
      .select('id, title, description, subcategory, attributes')
      .eq('category', 'Finance')
      .range(rangeFrom, rangeTo)

    if (pageError) {
      console.error('[getSimilarInvestors] Pagination error:', pageError)
      break
    }

    const rows = (pageData ?? []) as Record<string, unknown>[]
    candidateRows = candidateRows.concat(rows)
    hasMorePages = rows.length === PAGE_SIZE
    page++
  }

  if (candidateRows.length === 0) return { firms: [], similarityScores: {} }

  const candidates = candidateRows.map(r => rowToFirm(r as Record<string, unknown>))
  const similar = findSimilarInvestors(target, candidates, limit)

  const access = precomputedAccess ?? await getInvestorTierAccess()
  const similarityScores: Record<string, number> = {}
  for (const s of similar) similarityScores[s.firm.id] = s.similarity
  const firms = await attachContactStatuses(similar.map(s => stripTierGatedFields(s.firm, access)))
  return { firms, similarityScores }
}

// ---------------------------------------------------------------------------
// Co-Investment Network
// ---------------------------------------------------------------------------

export interface CoInvestor {
  listingId: string
  firmName: string
  sharedCompanyCount: number
  sharedCompanyNames: string[]
  firmType?: string
  fundSizeGbp?: number
  hqCity?: string
  sectors?: string[]
}

/**
 * Find investors who share portfolio companies with the given investor.
 * Returns co-investors ranked by number of shared companies (descending).
 *
 * @param listingId - UUID of the marketplace_listing (investor)
 * @param precomputedAccess - Optional pre-computed tier access (avoids double auth)
 */
export async function getCoInvestors(
  listingId: string,
  precomputedAccess?: InvestorTierAccess
): Promise<{ coInvestors: CoInvestor[] }> {
  const access = precomputedAccess ?? await getInvestorTierAccess()

  // SECURITY: Starter+ to see co-investment network
  if (!access.contactsVisible) {
    return { coInvestors: [] }
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(listingId)) return { coInvestors: [] }

  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc('get_co_investors', {
    p_listing_id: listingId,
    p_limit: 30,
  })

  if (error) {
    console.error('[getCoInvestors] RPC error:', error.message)
    return { coInvestors: [] }
  }

  if (!data || data.length === 0) return { coInvestors: [] }

  // Enrich with firm attributes (firm_type, fund_size, hq_city, sectors)
  const coInvestorIds = (data as { co_investor_listing_id: string }[]).map(d => d.co_investor_listing_id)
  const { data: listings } = await supabase
    .from('marketplace_listings')
    .select('id, attributes')
    .in('id', coInvestorIds)

  const attrMap = new Map<string, Record<string, unknown>>()
  for (const l of (listings ?? [])) {
    attrMap.set(l.id as string, (l.attributes ?? {}) as Record<string, unknown>)
  }

  const coInvestors: CoInvestor[] = (data as { co_investor_listing_id: string; co_investor_name: string; shared_company_count: number; shared_company_names: string[] }[]).map(row => {
    const attrs = attrMap.get(row.co_investor_listing_id) ?? {}
    const result: CoInvestor = {
      listingId: row.co_investor_listing_id,
      firmName: row.co_investor_name,
      sharedCompanyCount: row.shared_company_count,
      // TIER GATING: only professional+ sees individual company names
      sharedCompanyNames: access.intelligenceAccess ? row.shared_company_names : [],
      firmType: attrs.firm_type as string | undefined,
      fundSizeGbp: attrs.fund_size_gbp as number | undefined,
      hqCity: attrs.hq_city as string | undefined,
      sectors: attrs.sectors as string[] | undefined,
    }
    return result
  })

  return { coInvestors }
}

// ---------------------------------------------------------------------------
// Fundraise Dashboard
// ---------------------------------------------------------------------------

/** Slim firm data for the dashboard — avoids React Flight serialization limit */
export interface DashboardFirmSummary {
  id: string
  title: string
  attributes: {
    firm_type?: string
    stage_focus?: string[]
    sectors?: string[]
  }
  shortlistStage: ShortlistStage
}

export interface FundraiseDashboardStats {
  pipelineCounts: Record<ShortlistStage, number>
  totalTracked: number
  recentNotes: (InvestorNote & { firmName: string })[]
  coverageGaps: string[]
  shortlistedFirms: DashboardFirmSummary[]
}

/**
 * Fetches all data needed for the fundraise dashboard.
 */
export async function getFundraiseDashboardStats(): Promise<FundraiseDashboardStats> {
  const empty: FundraiseDashboardStats = {
    pipelineCounts: { researching: 0, contacted: 0, meeting: 0, in_discussion: 0, closed_won: 0, closed_lost: 0 },
    totalTracked: 0,
    recentNotes: [],
    coverageGaps: [],
    shortlistedFirms: [],
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return empty

  // Fetch shortlist (capped to prevent unbounded IN() queries)
  const { data: shortlistRows } = await supabase
    .from('investor_shortlist')
    .select('listing_id, stage')
    .eq('user_id', user.id)
    .limit(200)

  if (!shortlistRows || shortlistRows.length === 0) return empty

  // Pipeline counts
  const pipelineCounts = { ...empty.pipelineCounts }
  for (const row of shortlistRows) {
    const stage = row.stage as ShortlistStage
    if (stage in pipelineCounts) pipelineCounts[stage]++
  }

  // Fetch firm details for shortlisted investors (batched to stay within PostgREST URL limits)
  const listingIds = shortlistRows.map(r => r.listing_id)
  const BATCH_SIZE = 50
  const allListings: Record<string, unknown>[] = []
  for (let i = 0; i < listingIds.length; i += BATCH_SIZE) {
    const batch = listingIds.slice(i, i + BATCH_SIZE)
    const { data } = await supabase
      .from('marketplace_listings')
      .select('id, title, description, subcategory, attributes')
      .eq('category', 'Finance')
      .in('id', batch)
    if (data) allListings.push(...data)
  }
  const listings = allListings

  const access = await getInvestorTierAccess()
  const firmMap = new Map<string, InvestorFirm>()
  for (const row of listings ?? []) {
    const firm = stripTierGatedFields(rowToFirm(row as Record<string, unknown>), access)
    firmMap.set(firm.id, firm)
  }

  // DECISION: Only send fields the dashboard actually uses (firm_type, stage_focus, sectors)
  // to avoid React Flight "Maximum array nesting exceeded" on large attribute objects.
  const shortlistedFirms: DashboardFirmSummary[] = shortlistRows
    .map(sl => {
      const firm = firmMap.get(sl.listing_id)
      if (!firm) return null
      return {
        id: firm.id,
        title: firm.title,
        attributes: {
          firm_type: firm.attributes.firm_type,
          stage_focus: firm.attributes.stage_focus,
          sectors: firm.attributes.sectors,
        },
        shortlistStage: sl.stage as ShortlistStage,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  // Recent notes across all shortlisted investors
  // SECURITY: Batch IN() to stay within PostgREST URL limits (same pattern as firm details above)
  const allNoteRows: Record<string, unknown>[] = []
  const NOTE_BATCH_SIZE = 50
  for (let i = 0; i < listingIds.length; i += NOTE_BATCH_SIZE) {
    const batch = listingIds.slice(i, i + NOTE_BATCH_SIZE)
    const { data: batchNotes } = await supabase
      .from('investor_notes')
      .select('id, listing_id, note_type, content, created_at')
      .eq('user_id', user.id)
      .in('listing_id', batch)
      .order('created_at', { ascending: false })
      .limit(10)
    if (batchNotes) allNoteRows.push(...batchNotes)
  }
  // Re-sort merged batches and take top 10
  allNoteRows.sort((a, b) => {
    const aTime = new Date(a.created_at as string).getTime()
    const bTime = new Date(b.created_at as string).getTime()
    return bTime - aTime
  })
  const noteRows = allNoteRows.slice(0, 10)

  const recentNotes = (noteRows ?? []).map(n => {
    const note = n as unknown as InvestorNote
    return {
      ...note,
      firmName: firmMap.get(note.listing_id)?.title ?? 'Unknown',
    }
  })

  // Coverage analysis — identify gaps
  const coverageGaps: string[] = []
  const profile = await getFoundryProfile()

  if (profile) {
    // Check stage coverage
    const stageConfig = profile.stage
      ? STAGE_MAP_DASHBOARD[profile.stage.toLowerCase().replace(/\s+/g, '_')]
      : null
    if (stageConfig) {
      const hasMatchingStage = shortlistedFirms.some(f =>
        (Array.isArray(f.attributes.stage_focus) ? f.attributes.stage_focus : []).some(s =>
          stageConfig.includes(s)
        )
      )
      if (!hasMatchingStage) {
        coverageGaps.push(`No investors matching your stage (${profile.stage})`)
      }
    }

    // Check sector coverage
    if (profile.sector) {
      const sectorLower = profile.sector.toLowerCase()
      const hasSector = shortlistedFirms.some(f =>
        (Array.isArray(f.attributes.sectors) ? f.attributes.sectors : []).some(s => s.toLowerCase().includes(sectorLower))
      )
      if (!hasSector) {
        coverageGaps.push(`No investors covering your sector (${profile.sector})`)
      }
    }

    // Check firm type diversity
    const firmTypes = new Set(shortlistedFirms.map(f => f.attributes.firm_type).filter(Boolean))
    if (!firmTypes.has('PE') && shortlistedFirms.length >= 3) {
      coverageGaps.push('No PE firms on your list')
    }
    if (!firmTypes.has('VC') && shortlistedFirms.length >= 3) {
      coverageGaps.push('No VC firms on your list')
    }
  }

  return {
    pipelineCounts,
    totalTracked: shortlistRows.length,
    recentNotes,
    coverageGaps,
    shortlistedFirms,
  }
}

// Stage map for dashboard coverage analysis (slightly broader than match scoring)
const STAGE_MAP_DASHBOARD: Record<string, string[]> = {
  pre_seed: ['Pre-Seed', 'Seed', 'Angel'],
  seed: ['Seed', 'Pre-Seed', 'Series A'],
  series_a: ['Series A', 'Seed', 'Growth'],
  series_b: ['Series B', 'Growth', 'Late Stage'],
  growth: ['Growth', 'Late Stage', 'Series B'],
  late_stage: ['Late Stage', 'Growth'],
}

// ---------------------------------------------------------------------------
// Contacts Directory (cross-firm contact search)
// ---------------------------------------------------------------------------

/**
 * Normalised shape of a contact in the cross-firm directory search results.
 */
export interface ContactSearchResult {
  id: string
  full_name: string
  title: string | null
  firm_name: string
  listing_id: string
  email: string | null
  email_verified: boolean | null
  /**
   * Tier classification of how this email was verified. See InvestorContact.email_tier.
   * Tier-gated identically to email — null below professional tier.
   */
  email_tier: string | null
  email_tier_at: string | null
  email_verified_at: string | null
  linkedin_url: string | null
  seniority: string | null
  is_decision_maker: boolean | null
  notes: string | null
  deep_bio: string | null
  /** Indicates whether this contact has an email (even if gated) */
  has_email: boolean
  /** Indicates whether this contact has a deep bio (even if gated) */
  has_deep_bio: boolean
}

/**
 * Filter parameters for the contacts directory search.
 */
export interface ContactSearchFilters {
  query?: string
  decisionMakersOnly?: boolean
  withEmailOnly?: boolean
  withBioOnly?: boolean
  page?: number
  pageSize?: number
}

/**
 * Searches across ALL investor contacts (vc_pe_contacts) with firm name join,
 * text search, boolean filters, and tier-gated field stripping.
 *
 * @description Powers the "Contacts" tab on the Investors page. Joins with
 * marketplace_listings to surface the firm name. Applies tier gating so
 * non-professional users see has_email/has_deep_bio flags but not the values.
 *
 * @security Query input is sanitized via sanitizeFilterValue. Email and deep_bio
 * are stripped for users without professional tier access.
 */
export async function searchContacts(filters: ContactSearchFilters = {}): Promise<{
  contacts: ContactSearchResult[]
  total: number
  hasMore: boolean
}> {
  const {
    query,
    decisionMakersOnly = false,
    withEmailOnly = false,
    withBioOnly = false,
    page = 1,
    pageSize: rawPageSize = 50,
  } = filters

  // VALIDATION: clamp page size between 1 and 100
  const pageSize = Math.max(1, Math.min(100, rawPageSize))
  const offset = (Math.max(1, page) - 1) * pageSize

  // SECURITY: Rate limit contact search to prevent bulk data extraction
  const authClient = await createClient()
  const { data: { user: authUser } } = await authClient.auth.getUser()
  if (authUser) {
    const rl = await checkRateLimit('contactSearch', authUser.id, { limit: 20, window: 60000 })
    if (rl) return { contacts: [], total: 0, hasMore: false }
  }

  // GOTCHA: Must use admin client — createClient() in server context lacks auth
  // cookies, causing RLS to deny access and return 0 rows.
  const supabase = createAdminClient()

  // Build query — join marketplace_listings for firm name (title)
  let dbQuery = supabase
    .from('vc_pe_contacts')
    // SECURITY: Never SELECT email_verifier_raw — it's heavy jsonb meant for server-side audits only.
    .select(
      'id, full_name, title, seniority, email, email_verified, email_tier, email_tier_at, email_verified_at, linkedin_url, is_decision_maker, notes, deep_bio, listing_id, marketplace_listings!inner(title)',
      { count: 'exact' },
    )

  // INTENT: Semantic search for contacts >= 3 chars; fall back to ilike for short queries or empty results.
  if (query && query.trim().length >= 3) {
    const sanitized = sanitizeFilterValue(query.trim().slice(0, 200))
    const { searchContactsSemantic } = await import('@/lib/search/semantic-search')
    const hits = await searchContactsSemantic(sanitized)
    if (hits.length > 0) {
      dbQuery = dbQuery.in('id', hits.map(h => h.id))
    } else {
      dbQuery = dbQuery.or(`full_name.ilike.%${sanitized}%,title.ilike.%${sanitized}%`)
    }
  } else if (query && query.trim().length > 0) {
    const sanitized = sanitizeFilterValue(query.trim().slice(0, 200))
    dbQuery = dbQuery.or(`full_name.ilike.%${sanitized}%,title.ilike.%${sanitized}%`)
  }

  // Boolean filters
  if (decisionMakersOnly) {
    dbQuery = dbQuery.eq('is_decision_maker', true)
  }
  if (withEmailOnly) {
    dbQuery = dbQuery.not('email', 'is', null)
  }
  if (withBioOnly) {
    dbQuery = dbQuery.not('deep_bio', 'is', null)
  }

  // Ordering: decision makers first, then alphabetical
  dbQuery = dbQuery
    .order('is_decision_maker', { ascending: false })
    .order('full_name', { ascending: true })
    .range(offset, offset + pageSize - 1)

  const { data, count, error } = await dbQuery

  if (error) {
    console.error('[searchContacts] Supabase error:', error)
    return { contacts: [], total: 0, hasMore: false }
  }

  // Filter out organisation names (not actual people)
  const ORG_FILTER = /\b(LLP|Ltd|Limited|PLC|Inc|LLC|Association|Chamber|Authority|Institute|Foundation|Council|Bureau|Commission|Agency|Corporation|Group|Partners|Fund|Trust|Board|Network)\b/i
  const filteredData = (data ?? []).filter((row: Record<string, unknown>) => !ORG_FILTER.test(row.full_name as string))
  const total = filteredData.length < (data ?? []).length ? (count ?? 0) - ((data ?? []).length - filteredData.length) : (count ?? 0)

  // Tier gating — contacts directory is accessible to all authenticated users.
  // Sensitive fields (email, deep_bio) are gated by tier.
  const access = await getInvestorTierAccess()

  const contacts: ContactSearchResult[] = filteredData.map((row: Record<string, unknown>) => {
    // GOTCHA: Supabase join returns marketplace_listings as an object (inner join = single row)
    const listing = row.marketplace_listings as { title: string } | null
    const firmName = listing?.title ?? 'Unknown Firm'

    const rawEmail = row.email as string | null
    const rawDeepBio = row.deep_bio as string | null
    const hasEmail = !!rawEmail
    const hasDeepBio = !!rawDeepBio

    return {
      id: row.id as string,
      full_name: row.full_name as string,
      title: (row.title as string | null) ?? null,
      firm_name: firmName,
      listing_id: row.listing_id as string,
      // SECURITY: Strip sensitive fields for non-professional users
      email: access.deepAccess ? rawEmail : null,
      email_verified: access.deepAccess ? (row.email_verified as boolean | null) : null,
      // SECURITY: email_tier provenance is tier-gated alongside the email itself.
      email_tier: access.deepAccess ? ((row.email_tier as string | null) ?? null) : null,
      email_tier_at: access.deepAccess ? ((row.email_tier_at as string | null) ?? null) : null,
      email_verified_at: access.deepAccess ? ((row.email_verified_at as string | null) ?? null) : null,
      linkedin_url: (row.linkedin_url as string | null) ?? null,
      seniority: (row.seniority as string | null) ?? null,
      is_decision_maker: (row.is_decision_maker as boolean | null) ?? null,
      notes: (row.notes as string | null) ?? null,
      deep_bio: access.deepAccess ? rawDeepBio : null,
      has_email: hasEmail,
      has_deep_bio: hasDeepBio,
    }
  })

  return {
    contacts,
    total,
    hasMore: offset + pageSize < total,
  }
}

// ---------------------------------------------------------------------------
// Contact Detail
// ---------------------------------------------------------------------------

/**
 * Extended contact detail with fields not included in directory search results.
 */
export interface ContactDetail extends ContactSearchResult {
  warm_intro_path: string | null
  outreach_status: string | null
  last_contacted_at: string | null
}

/**
 * Fetches full detail for a single contact by ID, including warm intro path
 * and outreach status. Tier-gated: email and deep_bio require professional+.
 */
export async function getContactById(contactId: string): Promise<ContactDetail | null> {
  if (!UUID_RE.test(contactId)) return null

  // SECURITY: admin client needed — same RLS context issue as searchContacts
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('vc_pe_contacts')
    // SECURITY: Never SELECT email_verifier_raw — it's heavy jsonb meant for server-side audits only.
    .select('id, full_name, title, seniority, email, email_verified, email_tier, email_tier_at, email_verified_at, linkedin_url, is_decision_maker, notes, deep_bio, warm_intro_path, outreach_status, last_contacted_at, listing_id, marketplace_listings!inner(title)')
    .eq('id', contactId)
    .single()

  if (error || !data) {
    console.error('[getContactById] Not found:', error)
    return null
  }

  const access = await getInvestorTierAccess()
  const rawEmail = data.email as string | null
  const rawDeepBio = data.deep_bio as string | null
  const listing = data.marketplace_listings as unknown as { title: string }

  return {
    id: data.id,
    full_name: data.full_name,
    title: data.title ?? null,
    firm_name: listing.title,
    listing_id: data.listing_id,
    email: access.deepAccess ? rawEmail : null,
    email_verified: access.deepAccess ? data.email_verified : null,
    // SECURITY: email_tier provenance is tier-gated alongside the email itself.
    email_tier: access.deepAccess ? (data.email_tier ?? null) : null,
    email_tier_at: access.deepAccess ? (data.email_tier_at ?? null) : null,
    email_verified_at: access.deepAccess ? (data.email_verified_at ?? null) : null,
    linkedin_url: data.linkedin_url ?? null,
    seniority: data.seniority ?? null,
    is_decision_maker: data.is_decision_maker ?? null,
    notes: data.notes ?? null,
    deep_bio: access.deepAccess ? rawDeepBio : null,
    has_email: !!rawEmail,
    has_deep_bio: !!rawDeepBio,
    warm_intro_path: access.deepAccess ? (data.warm_intro_path ?? null) : null,
    outreach_status: data.outreach_status ?? null,
    last_contacted_at: data.last_contacted_at ?? null,
  }
}

// ---------------------------------------------------------------------------
// Per-card on-demand enrichment (Phase G lazy-load path)
// ---------------------------------------------------------------------------

/**
 * Generates (or returns cached) why-fit / how-to-pitch / drafted-email
 * for a single investor. Called client-side via useTransition when the
 * founder clicks "Reveal why-fit" on an un-enriched card.
 *
 * Returns `null` when the user is not on a paid tier, the investor id is
 * invalid, or the foundry profile is missing — the card stays in its
 * un-enriched state and shows an honest fallback.
 */
export async function enrichInvestorMatchOnDemand(
  investorListingId: string
): Promise<InvestorMatchOutputView | null> {
  if (!UUID_RE.test(investorListingId)) return null

  const access = await getInvestorTierAccess()
  if (access.tier === 'free') return null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id')
    .eq('id', user.id)
    .maybeSingle()
  const foundryId = profile?.foundry_id ?? null
  if (!foundryId) return null

  try {
    const { generateInvestorMatchOutput } = await import('@/actions/investors-match-generation')
    const result = await generateInvestorMatchOutput({
      foundryId,
      userId: user.id,
      investorListingId,
    })
    return {
      whyFit: result.whyFit,
      howToPitch: result.howToPitch,
      draftedEmailSubject: result.draftedEmailSubject,
      draftedEmailBody: result.draftedEmailBody,
      sourceCitations: result.sourceCitations,
      fromCache: result.fromCache,
      modelUsed: result.modelUsed,
    }
  } catch (err) {
    console.error('[enrichInvestorMatchOnDemand] Generation failed:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Investor directory stats — drives the pre-search chart panel
// ---------------------------------------------------------------------------

/**
 * Public-facing investor directory statistics for the chart panel shown
 * before search. Returns type breakdown, top sectors, stage distribution,
 * and geographic distribution. Does NOT return internal/operational metrics
 * (push status, sendable contacts, deep dossiers, etc.).
 *
 * Scoped to forge_capital-sourced Finance listings only — the canonical
 * investor corpus as of 2026-04-25.
 *
 * @returns InvestorDirectoryStats object with chart-ready arrays
 */
export interface InvestorDirectoryStats { // used by pre-search chart panel
  /** Total number of investors in the directory */
  total: number
  /** Investors with a website on record */
  withWebsites: number
  /** Investors with portfolio company data */
  withPortfolio: number
  /** Government grant bodies in the directory */
  grantsCount: number
  /** Partners / key-people contacts on record (vc_pe_contacts table). Tristan
   *  2026-04-27: surface the contact count alongside investor count to
   *  match Forge Capital's investor + contact totals header. */
  contactsCount: number
  /** Breakdown by firm_type — donut chart */
  typeBreakdown: { name: string; value: number }[]
  /** Top 10 sectors by investor count — horizontal bar chart */
  topSectors: { name: string; value: number }[]
  /** Stage focus distribution — bar chart */
  stageFocus: { name: string; value: number }[]
  /** Top cities/locations by investor count — donut chart */
  geoDistribution: { name: string; value: number }[]
  /**
   * Government grant bodies grouped by country — donut chart.
   * Only rendered when array is non-empty (matches Forge Capital
   * `if (grant_country_count > 0)` conditional).
   */
  grantsByCountry: { name: string; value: number }[]
}

export async function getInvestorDirectoryStats(): Promise<InvestorDirectoryStats> {
  // SECURITY: Read-only aggregation on public investor data. No auth required —
  // stats are shown before login on the authenticated /investors page.
  const admin = createAdminClient()

  // Run all aggregation queries in parallel
  const [typeRes, sectorsRes, stageRes, geoRes] = await Promise.allSettled([
    // Type breakdown
    admin
      .from('marketplace_listings')
      .select('attributes')
      .eq('category', 'Finance')
      .filter('attributes->>data_source', 'eq', 'forge_capital')
      .filter('attributes->>firm_type', 'not.is', null),

    // Top sectors — requires unnesting; read all and aggregate client-side
    admin
      .from('marketplace_listings')
      .select('attributes')
      .eq('category', 'Finance')
      .filter('attributes->>data_source', 'eq', 'forge_capital')
      .filter('attributes->sectors', 'not.is', null),

    // Stage focus — similar unnest approach
    admin
      .from('marketplace_listings')
      .select('attributes')
      .eq('category', 'Finance')
      .filter('attributes->>data_source', 'eq', 'forge_capital')
      .filter('attributes->stage_focus', 'not.is', null),

    // Geo distribution — hq_city field
    admin
      .from('marketplace_listings')
      .select('attributes')
      .eq('category', 'Finance')
      .filter('attributes->>data_source', 'eq', 'forge_capital')
      .filter('attributes->>hq_city', 'not.is', null),

  ])

  // ── Summary stats ──────────────────────────────────────────────────────────
  // DECISION: Hardcoded snapshot updated 2026-04-28 (closing the sync gap
  // tracked as #112). The targeted Forge-Capital → ForgeOS push of 1,378
  // missing IDs landed +1,319 inserts (59 firm-name updates, 0 errors).
  // Local SQLite holds 14,395 investors; 12,011 pass the push filter
  // (`type != 'govt_grant'` excludes 235 grants which live in `investor_grants`,
  // and `is_investor=0` excludes 2,228 flagged non-investors). Live SQL on
  // jyarhvinengfyrwgtskq after the push:
  //   marketplace_listings WHERE category='Finance'                     → 13,340
  //   ditto AND attributes->>website_url IS NOT NULL & non-empty        → 11,929
  //   vc_pe_contacts                                                    → 74,269
  //   investor_grants                                                   → 3,042
  // The remaining (14,395 - 13,340) gap is the correctly-excluded
  // is_investor=0 + govt_grant rows. The "with_thesis" subset (8,327) is
  // shown separately as the "synthesised" stat tile.
  const HARDCODED_STATS = {
    total: 13340,
    withWebsites: 11929,
    withPortfolio: 4253,
    grantsCount: 3042,
    contactsCount: 74269,
  }

  // ── Type breakdown ─────────────────────────────────────────────────────────
  const typeMap = new Map<string, number>()
  if (typeRes.status === 'fulfilled' && typeRes.value.data) {
    for (const row of typeRes.value.data as Array<{ attributes: Record<string, unknown> }>) {
      const attrs = row.attributes ?? {}
      const raw = (attrs.firm_type as string | null) ?? ''
      // Normalise GOVT_GRANT → Government Grant
      const name = raw === 'GOVT_GRANT' ? 'Government Grant' : raw || 'Other'
      if (name) typeMap.set(name, (typeMap.get(name) ?? 0) + 1)
    }
  }
  const typeBreakdown = Array.from(typeMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  // ── Top sectors ────────────────────────────────────────────────────────────
  const sectorMap = new Map<string, number>()
  if (sectorsRes.status === 'fulfilled' && sectorsRes.value.data) {
    for (const row of sectorsRes.value.data as Array<{ attributes: Record<string, unknown> }>) {
      const attrs = row.attributes ?? {}
      const raw = attrs.sectors
      const arr = Array.isArray(raw) ? raw : []
      for (const s of arr) {
        if (typeof s === 'string' && s.trim()) {
          sectorMap.set(s.trim(), (sectorMap.get(s.trim()) ?? 0) + 1)
        }
      }
    }
  }
  const topSectors = Array.from(sectorMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  // ── Stage focus ────────────────────────────────────────────────────────────
  const stageMap = new Map<string, number>()
  const STAGE_CANONICAL: Record<string, string> = {
    'pre-seed': 'Pre-Seed',
    'preseed': 'Pre-Seed',
    'seed': 'Seed',
    'series a': 'Series A',
    'series-a': 'Series A',
    'series b': 'Series B',
    'series-b': 'Series B',
    'series c': 'Series C',
    'growth': 'Growth',
    'late stage': 'Late Stage',
    'late-stage': 'Late Stage',
    'early stage': 'Early Stage',
    'early-stage': 'Early Stage',
    'early': 'Early Stage',
  }
  const STAGE_ORDER = ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Growth', 'Late Stage', 'Early Stage']
  if (stageRes.status === 'fulfilled' && stageRes.value.data) {
    for (const row of stageRes.value.data as Array<{ attributes: Record<string, unknown> }>) {
      const attrs = row.attributes ?? {}
      const raw = attrs.stage_focus
      const arr = Array.isArray(raw) ? raw : []
      for (let s of arr) {
        if (typeof s !== 'string') continue
        // Strip surrounding JSON cruft from malformed storage (e.g. `["Seed"]`)
        s = s.replace(/[\[\]"]/g, '').trim()
        if (!s) continue
        const canonical = STAGE_CANONICAL[s.toLowerCase()] ?? s
        stageMap.set(canonical, (stageMap.get(canonical) ?? 0) + 1)
      }
    }
  }
  const stageFocus = STAGE_ORDER
    .map(name => ({ name, value: stageMap.get(name) ?? 0 }))
    .filter(s => s.value > 0)

  // ── Geographic distribution ────────────────────────────────────────────────
  const geoMap = new Map<string, number>()
  if (geoRes.status === 'fulfilled' && geoRes.value.data) {
    for (const row of geoRes.value.data as Array<{ attributes: Record<string, unknown> }>) {
      const attrs = row.attributes ?? {}
      const city = (attrs.hq_city as string | null)?.trim()
      if (city) geoMap.set(city, (geoMap.get(city) ?? 0) + 1)
    }
  }
  const geoDistribution = Array.from(geoMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  // ── Grants by country ──────────────────────────────────────────────────────
  // DECISION: Hardcoded distribution from investor_grants on 2026-04-25.
  // Reason: PostgREST max-rows caps select() at 1000; the natural insertion
  // order clusters the sample so a live aggregation produces only 4-8 of
  // the 10 distinct countries (verified empirically via agent-browser
  // walkthrough). The grant corpus is stable (refreshed monthly); a
  // hardcoded snapshot is more honest than a sampling artifact.
  const grantsByCountry: Array<{ name: string; value: number }> = [
    { name: 'United Kingdom', value: 1368 },
    { name: 'Germany', value: 1057 },
    { name: 'Switzerland', value: 387 },
    { name: 'European Union', value: 212 },
    { name: 'Ireland', value: 8 },
    { name: 'United States', value: 6 },
    { name: 'Bulgaria', value: 1 },
    { name: 'Poland', value: 1 },
    { name: 'Australia', value: 1 },
    { name: 'International', value: 1 },
  ]

  return {
    ...HARDCODED_STATS,
    typeBreakdown,
    topSectors,
    stageFocus,
    geoDistribution,
    grantsByCountry,
  }
}

// ---------------------------------------------------------------------------
// Phase 2 — Apex-outreach cross-project data (deep profiles + chunk evidence)
// ---------------------------------------------------------------------------

import { createApexClient, type ApexInvestorDeepProfile } from '@/lib/supabase/apex-client'

/**
 * Fetch the deep profile from apex-outreach for a given forge_capital_id.
 * Returns null if bridge is unavailable, investor has no deep profile, or
 * forge_capital_id is not set.
 */
export async function getInvestorDeepProfile(
  forgeCapitalId: number | undefined
): Promise<ApexInvestorDeepProfile | null> {
  if (!forgeCapitalId) return null
  const apex = createApexClient()
  if (!apex) return null

  const { data, error } = await apex
    .from('investor_deep_profiles')
    .select('investor_id, profile_json, updated_at')
    .eq('investor_id', forgeCapitalId)
    .maybeSingle()

  if (error) {
    console.error('[getInvestorDeepProfile] Query failed:', error.message)
    return null
  }

  return data as ApexInvestorDeepProfile | null
}

// ---------------------------------------------------------------------------
// Chunk evidence (§8 Source Evidence)
// ---------------------------------------------------------------------------

export interface ChunkEvidence {
  chunk_text: string
  page_url: string
  chunk_index: number
  cosine_similarity: number
}

export type GetChunkEvidenceResult =
  | { ok: true; chunks: ChunkEvidence[]; indexing?: boolean }
  | { ok: false; error: string }

/**
 * Fetch chunk-level website evidence for an investor from apex-outreach.
 * Embeds the query text, then calls `match_chunks_for_investor` RPC on
 * the apex-outreach database. Returns top N matching excerpts.
 *
 * When zero chunks match AND the investor has zero rows in
 * `investor_page_chunks`, returns `indexing: true` (pages still being
 * crawled/indexed).
 */
export async function getChunkEvidence(input: {
  investorId: number
  queryText: string
  limit?: number
}): Promise<GetChunkEvidenceResult> {
  const { investorId, queryText, limit = 8 } = input

  const apex = createApexClient()
  if (!apex) {
    return { ok: false, error: 'Apex-outreach bridge not configured' }
  }

  let vector: number[]
  try {
    vector = await embedQuery(queryText, { actionSlug: 'chunk-evidence' })
  } catch {
    return { ok: false, error: 'Could not embed query text' }
  }

  const { data, error } = await apex.rpc('match_chunks_for_investor', {
    p_investor_id: investorId,
    query_embedding: vector,
    match_count: limit,
    min_similarity: 0.0,
  })

  if (error) {
    console.error('[getChunkEvidence] RPC failed:', error.message)
    return { ok: false, error: error.message }
  }

  const chunks = ((data ?? []) as Array<{
    chunk_text: string
    page_url: string
    chunk_index: number
    cosine_similarity: number
  }>).map((r) => ({
    chunk_text: r.chunk_text,
    page_url: r.page_url,
    chunk_index: r.chunk_index,
    cosine_similarity: r.cosine_similarity,
  }))

  if (chunks.length === 0) {
    const { count } = await apex
      .from('investor_page_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('investor_id', investorId)
    if (count === 0) {
      return { ok: true, chunks: [], indexing: true }
    }
  }

  return { ok: true, chunks }
}
