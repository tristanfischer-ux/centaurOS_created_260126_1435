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
import {
  extractPostcode,
  deriveRegionFromPostcode,
  deriveRegionFromKeywords,
} from '@/lib/postcode-utils'
import { getUserSubscription } from '@/lib/billing/subscriptions'
import { SUBSCRIPTION_PLANS } from '@/lib/billing/plans'
import type { SubscriptionTier } from '@/lib/billing/plans'
import { calculateMatchScore, findSimilarInvestors, computeHybridScore } from '@/lib/investor-match'
import type { FoundryProfile } from '@/lib/investor-match'
import { embedQuery } from '@/lib/embeddings'

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
  }
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
}

/**
 * Return shape from searchInvestors.
 */
export interface InvestorSearchResult {
  firms: InvestorFirm[]
  total: number
  hasMore: boolean
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
 * SECURITY: Sanitize a string for use in PostgREST filter expressions.
 * Escapes ilike wildcards (%, _) and strips PostgREST control characters.
 */
function sanitizeFilterValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/[,()\."*:!'[\]{}]/g, '')
}

/**
 * Searches and filters the UK investor directory.
 */
export async function searchInvestors(
  filters: InvestorFilters = {}
): Promise<InvestorSearchResult> {
  const {
    firmType,
    stage,
    sector,
    hqCity,
    activeOnly,
    priority,
    query,
    minQuality,
    geoFocus,
    chequeMin,
    chequeMax,
    minHardwareFit,
    bvcaOnly,
    sortBy = 'name',
    page = 1,
    pageSize = 24,
  } = filters

  // SECURITY: Bound pagination to prevent DoS
  const safePage = Math.max(1, page)
  const safePageSize = Math.min(Math.max(1, pageSize), 100)
  const from = (safePage - 1) * safePageSize

  const supabase = await createClient()

  // ── Semantic search path ──
  // INTENT: When the user types a meaningful query (> 5 chars), use pgvector cosine
  // similarity for far better recall than naive ilike (e.g. "pre-seed deep tech London"
  // finds relevant firms even when those exact words aren't in the title).
  if (query && query.trim().length > 5) {
    try {
      const queryEmbedding = await embedQuery(query.trim())
      // GOTCHA: over-fetch to allow for post-RPC filtering (firm_type, stage, geo, etc.)
      const { data: semanticData, error: semanticError } = await supabase.rpc(
        'match_marketplace_listings',
        {
          query_embedding: JSON.stringify(queryEmbedding) as unknown as string,
          match_threshold: 0.5,
          match_count: 200,
        }
      )

      if (semanticError) throw semanticError

      // Filter to Finance category only (investors) and extract IDs + similarity scores
      const financeMatches = (semanticData || [])
        .filter((r: Record<string, unknown>) => r.category === 'Finance')

      if (financeMatches.length === 0) {
        return { firms: [], total: 0, searchMode: 'semantic' as const }
      }

      // DECISION: The RPC returns only id, category, title, description, similarity — NOT
      // the `attributes` JSONB or other top-level columns needed for filtering and display.
      // Re-fetch full rows by ID so all JSONB filters work correctly.
      const matchIds = financeMatches.map((r: Record<string, unknown>) => r.id as string)
      const similarityMap = new Map<string, number>(
        financeMatches.map((r: Record<string, unknown>) => [r.id as string, r.similarity as number])
      )

      const { data: fullRows, error: fullError } = await supabase
        .from('marketplace_listings')
        .select('*')
        .in('id', matchIds)

      if (fullError) throw fullError

      // Merge similarity scores back into full rows
      let results = (fullRows || []).map((row: Record<string, unknown>) => ({
        ...row,
        similarity: similarityMap.get(row.id as string) ?? 0,
      }))

      // Apply JSONB filters on top of semantic results (now with full attributes)
      if (firmType && firmType.length > 0) {
        const safeFirmTypes = firmType.filter((t: string) => VALID_FIRM_TYPES.has(t))
        if (safeFirmTypes.length > 0) {
          results = results.filter((r: Record<string, unknown>) => {
            const attrs = (r.attributes as Record<string, unknown>) || {}
            return safeFirmTypes.includes(attrs.firm_type as string)
          })
        }
      }
      if (activeOnly) {
        results = results.filter((r: Record<string, unknown>) => {
          const attrs = (r.attributes as Record<string, unknown>) || {}
          return attrs.is_active_deploying === true
        })
      }
      if (stage && stage.length > 0) {
        results = results.filter((r: Record<string, unknown>) => {
          const attrs = (r.attributes as Record<string, unknown>) || {}
          const sf = toStringArray(attrs.stage_focus)
          return stage.some((s: string) => sf.some(f => f.toLowerCase() === s.toLowerCase()))
        })
      }
      if (sector && sector.length > 0) {
        results = results.filter((r: Record<string, unknown>) => {
          const attrs = (r.attributes as Record<string, unknown>) || {}
          const sec = toStringArray(attrs.sectors)
          return sector.some((s: string) => sec.some(f => f.toLowerCase() === s.toLowerCase()))
        })
      }
      if (geoFocus && geoFocus.length > 0) {
        results = results.filter((r: Record<string, unknown>) => {
          const attrs = (r.attributes as Record<string, unknown>) || {}
          const gf = toStringArray(attrs.geo_focus)
          return geoFocus.some((g: string) => gf.some(f => f.toLowerCase().includes(g.toLowerCase())))
        })
      }
      if (minQuality != null && minQuality > 0) {
        results = results.filter((r: Record<string, unknown>) => {
          const attrs = (r.attributes as Record<string, unknown>) || {}
          return (attrs.data_quality_score as number ?? 0) >= minQuality
        })
      }
      if (minHardwareFit != null && minHardwareFit > 0) {
        results = results.filter((r: Record<string, unknown>) => {
          const attrs = (r.attributes as Record<string, unknown>) || {}
          return (attrs.hardware_fit_score as number ?? 0) >= minHardwareFit
        })
      }
      if (bvcaOnly) {
        results = results.filter((r: Record<string, unknown>) => {
          const attrs = (r.attributes as Record<string, unknown>) || {}
          return attrs.bvca_member === true
        })
      }
      if (hqCity && hqCity.trim().length > 0) {
        const cityLower = hqCity.trim().toLowerCase()
        results = results.filter((r: Record<string, unknown>) => {
          const attrs = (r.attributes as Record<string, unknown>) || {}
          return ((attrs.hq_city as string) || '').toLowerCase().includes(cityLower)
        })
      }

      // Convert to InvestorFirm and apply tier gating
      const access = await getInvestorTierAccess()
      let firms = results.map((r: Record<string, unknown>) => {
        const firm = rowToFirm(r)
        return stripTierGatedFields(firm, access)
      })

      // INTENT: Blend semantic similarity with attribute match for ranking.
      // Fetch foundry profile for attribute scoring (best-effort — null = skip).
      const profile = await getFoundryProfileCached()
      if (profile) {
        firms = firms.map(firm => {
          const matchedRow = results.find((r: Record<string, unknown>) => r.id === firm.id)
          const simScore = (matchedRow?.similarity as number) ?? 0
          const attrBreakdown = calculateMatchScore(firm, profile)
          const hybridScore = computeHybridScore(simScore, attrBreakdown.total)
          return { ...firm, attributes: { ...firm.attributes, _hybridScore: hybridScore, _similarity: simScore } }
        })
        // Sort by hybrid score descending
        firms.sort((a, b) => (b.attributes._hybridScore ?? 0) - (a.attributes._hybridScore ?? 0))
      } else {
        // No profile — sort by raw semantic similarity
        firms = firms.map(firm => {
          const matchedRow = results.find((r: Record<string, unknown>) => r.id === firm.id)
          const simScore = (matchedRow?.similarity as number) ?? 0
          return { ...firm, attributes: { ...firm.attributes, _similarity: simScore } }
        })
        firms.sort((a, b) => (b.attributes._similarity ?? 0) - (a.attributes._similarity ?? 0))
      }

      const total = firms.length
      const paginatedFirms = firms.slice(from, from + safePageSize)
      const hasMore = from + paginatedFirms.length < total

      return { firms: paginatedFirms, total, hasMore }
    } catch (err) {
      // FLOW: Semantic search failed — fall through to keyword path below
      console.error('[searchInvestors] Semantic search failed, falling back to keyword:', err)
    }
  }

  // ── Keyword/browse path (fallback or short/no query) ──

  let q = supabase
    .from('marketplace_listings')
    .select('id, title, description, subcategory, attributes', { count: 'exact' })
    .eq('category', 'Finance')

  // Full-text search
  // SECURITY: Cap query length to prevent DoS via huge ilike patterns
  if (query && query.trim().length > 0) {
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

  // JSONB array filter: stage_focus (push to DB via containment)
  // DECISION: Use cs (contains) operator — firm must contain at least one of the requested stages.
  // PostgREST cs requires exact array match, so we use OR for each value.
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
  // GOTCHA: Use -> (JSONB) not ->> (TEXT) for numeric comparisons — ->> returns text,
  // which causes lexicographic comparison ("9" > "10" would be true).
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
    // Exclude firms whose max cheque is below our min
    q = q.filter('attributes->cheque_range_gbp->max', 'gte', chequeMin)
  }
  if (chequeMax != null) {
    // Exclude firms whose min cheque is above our max
    q = q.filter('attributes->cheque_range_gbp->min', 'lte', chequeMax)
  }

  // Pagination + sorting
  // DECISION: For JSONB attribute sorts (fund_size, quality, etc.), PostgREST can't natively
  // order by nested JSONB paths. We fetch all matching rows (capped at 2000), sort server-side,
  // then manually paginate. For name sort, DB handles ordering + pagination directly.
  // GOTCHA: 'match' sort is handled client-side — exclude from server-sort path
  // to avoid fetching 2000 rows for a no-op sort (the switch has no 'match' case).
  const needsServerSort = sortBy != null && sortBy !== 'name' && sortBy !== 'match'

  if (needsServerSort) {
    // Fetch all matching rows for correct cross-page ordering
    q = q.order('title', { ascending: true }).limit(2000)
  } else {
    const to = from + safePageSize - 1
    q = q.range(from, to).order('title', { ascending: true })
  }

  const { data, count, error } = await q

  if (error) {
    console.error('[searchInvestors] Supabase error:', error)
    return { firms: [], total: 0, hasMore: false }
  }

  let firms = (data ?? []).map((row: Record<string, unknown>) => rowToFirm(row))

  // SECURITY: Strip tier-gated fields from search results
  const access = await getInvestorTierAccess()
  firms = firms.map(f => stripTierGatedFields(f, access))

  // Server-side sort for JSONB attributes — applied BEFORE pagination
  const PRIORITY_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 }
  if (needsServerSort) {
    firms.sort((a: InvestorFirm, b: InvestorFirm) => {
      switch (sortBy) {
        case 'fund_size':
          return (b.attributes.fund_size_gbp ?? 0) - (a.attributes.fund_size_gbp ?? 0)
        case 'quality':
          return (b.attributes.data_quality_score ?? 0) - (a.attributes.data_quality_score ?? 0)
        case 'hardware_fit':
          return (b.attributes.hardware_fit_score ?? 0) - (a.attributes.hardware_fit_score ?? 0)
        case 'cheque': {
          const aMin = a.attributes.cheque_range_gbp?.min ?? 0
          const bMin = b.attributes.cheque_range_gbp?.min ?? 0
          return bMin - aMin
        }
        case 'priority': {
          const aP = PRIORITY_ORDER[a.attributes.outreach_priority ?? ''] ?? 99
          const bP = PRIORITY_ORDER[b.attributes.outreach_priority ?? ''] ?? 99
          return aP - bP
        }
        default:
          return 0
      }
    })
  }

  if (needsServerSort) {
    // Manual pagination after sorting
    // GOTCHA: Use DB exact count (may exceed 2000-row fetch cap), not array length
    const total = count ?? firms.length
    const paginatedFirms = firms.slice(from, from + safePageSize)
    const hasMore = from + paginatedFirms.length < total
    return { firms: paginatedFirms, total, hasMore }
  }

  const total = count ?? 0
  const hasMore = from + (data ?? []).length < total

  return { firms, total, hasMore }
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
}> {
  const access = await getInvestorTierAccess()

  // SECURITY: Validate UUID format before hitting Supabase (reject bot/scanner probes early)
  if (!UUID_RE.test(id)) {
    return { firm: null, access, gated: false }
  }

  const supabase = await createClient()
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

  // Free tier: return minimal teaser data + gated flag
  // SECURITY: explicit fields only — no spread to avoid leaking description or other data
  if (!access.detailAccess) {
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

  // Strip deep fields based on tier
  return { firm: stripTierGatedFields(firm, access), access, gated: false }
}

// DECISION: firm_type is the reliable discriminator for investor vs service provider.
const INVESTOR_FIRM_TYPES = new Set([
  'VC', 'PE', 'Growth', 'Growth Equity', 'Family Office', 'CVC',
  'Corporate VC', 'Accelerator', 'Angel', 'Angel Network', 'Debt Fund',
  'Impact Fund', 'EIS Fund', 'SEIS Fund',
])

/**
 * Fetches aggregated stats for the investor directory insights panel.
 */
export const getInvestorStats = unstable_cache(
  async (): Promise<InvestorStats> => {
    // SECURITY: admin client — aggregate stats over marketplace_listings (cross-foundry by design), foundry_id not needed
    const supabase = createAdminClient()

    // INTENT: Fetch ALL investors for stats computation (not capped by PostgREST default of 1000).
    // Stats computation is O(n) but acceptable for ~10k investors on modern servers.
    // GOTCHA: Supabase PostgREST defaults to 1000 rows without an explicit limit.
    const { data, error } = await supabase
      .from('marketplace_listings')
      .select('subcategory, attributes')
      .eq('category', 'Finance')
      .limit(20000)

    if (error) {
      console.error('[getInvestorStats] Supabase error:', error)
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

      // Track type breakdown
      if (firmType) {
        typeCounts[firmType] = (typeCounts[firmType] ?? 0) + 1
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

      // Portfolio companies
      const portfolio = (attrs.portfolio_companies as Array<{ company_name?: string }>) ?? []
      portfolioCompanyCount += portfolio.length

      // Sectors
      const sectors = toStringArray(attrs.sector_focus ?? attrs.sectors)
      for (const sector of sectors) {
        sectorCounts[sector] = (sectorCounts[sector] ?? 0) + 1
      }

      // Stage focus
      const stages = toStringArray(attrs.stage_focus)
      for (const stage of stages) {
        stageCounts[stage] = (stageCounts[stage] ?? 0) + 1
      }

      const sub = (row.subcategory as string) || 'Unknown'
      subcategoryCounts[sub] = (subcategoryCounts[sub] ?? 0) + 1

      let region: string | null = null
      const hqCity = (attrs.hq_city as string) || ''
      const location = (attrs.location as string) || ''
      const locationText = hqCity || location

      if (locationText) {
        const postcode = extractPostcode(locationText)
        if (postcode) region = deriveRegionFromPostcode(postcode)
        if (!region) region = deriveRegionFromKeywords(locationText)
      }

      if (region) regionCounts[region] = (regionCounts[region] ?? 0) + 1
    }

    const avgQuality = qualityScoreCount > 0 ? totalQualityScore / qualityScoreCount : 0

    // Count total partners
    const { count: partnerCount } = await supabase
      .from('vc_pe_contacts')
      .select('id', { count: 'exact', head: true })

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
  ['investor-stats-v3'],
  { revalidate: 60 }
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
    .select('id, full_name, title, seniority, email, email_verified, linkedin_url, is_decision_maker, outreach_status, notes, deep_bio, warm_intro_path')
    .eq('listing_id', listingId)
    .order('is_decision_maker', { ascending: false })
    .order('full_name', { ascending: true })

  if (error) {
    console.error('[getInvestorContacts] Supabase error:', error)
    return { contacts: [], access }
  }

  let contacts = (data ?? []) as InvestorContact[]

  // Strip deep fields for users below professional tier
  // DECISION: Expose has_deep_bio/has_email flags so the UI can show lock indicators
  // only when there is actually data behind the lock (avoids misleading upgrade prompts).
  if (!access.deepAccess) {
    contacts = contacts.map(c => ({
      ...c,
      has_deep_bio: !!c.deep_bio,
      has_email: !!c.email,
      email: null,
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
 * Computes match scores for a set of investor firms against the current user's profile.
 *
 * @param firmIds - Array of listing IDs to score. Max 200 per call.
 * @returns Record mapping listing ID to 0–100 match score.
 */
export async function computeMatchScores(
  firmIds: string[]
): Promise<Record<string, number>> {
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

  const result: Record<string, number> = {}
  for (const row of data) {
    const firm = rowToFirm(row as Record<string, unknown>)
    const breakdown = calculateMatchScore(firm, profile)
    result[firm.id] = breakdown.total
  }
  return result
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
  const firmMap = new Map<string, InvestorFirm>()
  for (const row of listings) {
    const firm = stripTierGatedFields(rowToFirm(row as Record<string, unknown>), access)
    firmMap.set(firm.id, firm)
  }

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
  // so fetching all is manageable. Limit at 2000 as safety cap.
  const { data: candidateRows } = await supabase
    .from('marketplace_listings')
    .select('id, title, description, subcategory, attributes')
    .eq('category', 'Finance')
    .limit(2000)

  if (!candidateRows) return { firms: [], similarityScores: {} }

  const candidates = candidateRows.map(r => rowToFirm(r as Record<string, unknown>))
  const similar = findSimilarInvestors(target, candidates, limit)

  const access = precomputedAccess ?? await getInvestorTierAccess()
  const similarityScores: Record<string, number> = {}
  for (const s of similar) similarityScores[s.firm.id] = s.similarity
  return { firms: similar.map(s => stripTierGatedFields(s.firm, access)), similarityScores }
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
        (f.attributes.stage_focus ?? []).some(s =>
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
        (f.attributes.sectors ?? []).some(s => s.toLowerCase().includes(sectorLower))
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

  const supabase = await createClient()

  // Build query — join marketplace_listings for firm name (title)
  let dbQuery = supabase
    .from('vc_pe_contacts')
    .select(
      'id, full_name, title, seniority, email, email_verified, linkedin_url, is_decision_maker, notes, deep_bio, listing_id, marketplace_listings!inner(title)',
      { count: 'exact' },
    )

  // SECURITY: sanitize text search input
  if (query && query.trim().length > 0) {
    const sanitized = sanitizeFilterValue(query.trim().slice(0, 200))
    // Search across full_name and title (role)
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

  const total = count ?? 0

  // Tier gating — contacts directory is accessible to all authenticated users.
  // Sensitive fields (email, deep_bio) are gated by tier.
  const access = await getInvestorTierAccess()

  const contacts: ContactSearchResult[] = (data ?? []).map((row: Record<string, unknown>) => {
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
