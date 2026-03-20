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
import { calculateMatchScore, findSimilarInvestors } from '@/lib/investor-match'
import type { FoundryProfile } from '@/lib/investor-match'

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
function rowToFirm(row: Record<string, unknown>): InvestorFirm {
  const attrs = (row.attributes as Record<string, unknown>) ?? {}
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    subcategory: (row.subcategory as string) ?? '',
    attributes: {
      ...(attrs as InvestorFirm['attributes']),
      stage_focus: toStringArray(attrs.stage_focus),
      sectors: toStringArray(attrs.sectors),
      notable_portfolio: toStringArray(attrs.notable_portfolio),
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
    .replace(/[,()\."*:!]/g, '')
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

  const supabase = await createClient()

  let q = supabase
    .from('marketplace_listings')
    .select('id, title, description, subcategory, attributes', { count: 'exact' })
    .eq('category', 'Finance')

  // Full-text search
  if (query && query.trim().length > 0) {
    const sanitized = sanitizeFilterValue(query.trim())
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

  // Pagination
  const from = (safePage - 1) * safePageSize
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

  // Client-side array filtering
  if (stage && stage.length > 0) {
    firms = firms.filter((f: InvestorFirm) => {
      const stageFocus = f.attributes.stage_focus ?? []
      return stage.some((s: string) => stageFocus.includes(s))
    })
  }

  if (sector && sector.length > 0) {
    firms = firms.filter((f: InvestorFirm) => {
      const sectors = f.attributes.sectors ?? []
      return sector.some((s: string) => sectors.includes(s))
    })
  }

  // Client-side quality filter
  if (minQuality != null && minQuality > 0) {
    firms = firms.filter((f: InvestorFirm) => {
      const score = f.attributes.data_quality_score ?? 0
      return score >= minQuality
    })
  }

  // Client-side geo_focus filter
  if (geoFocus && geoFocus.length > 0) {
    const geoLower = geoFocus.map(g => g.toLowerCase())
    firms = firms.filter((f: InvestorFirm) => {
      const fGeo = (f.attributes.geo_focus ?? []).map(g => g.toLowerCase())
      return geoLower.some(g => fGeo.some(fg => fg.includes(g)))
    })
  }

  // Client-side cheque range filter
  if (chequeMin != null || chequeMax != null) {
    firms = firms.filter((f: InvestorFirm) => {
      const range = f.attributes.cheque_range_gbp
      if (!range) return false
      if (chequeMin != null && range.max != null && range.max < chequeMin) return false
      if (chequeMax != null && range.min != null && range.min > chequeMax) return false
      return true
    })
  }

  // Client-side hardware fit filter
  if (minHardwareFit != null && minHardwareFit > 0) {
    firms = firms.filter((f: InvestorFirm) => {
      return (f.attributes.hardware_fit_score ?? 0) >= minHardwareFit
    })
  }

  // Client-side BVCA filter
  if (bvcaOnly) {
    firms = firms.filter((f: InvestorFirm) => f.attributes.bvca_member === true)
  }

  // Client-side sorting for JSONB attributes
  const PRIORITY_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 }
  if (sortBy && sortBy !== 'name') {
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

  const total = count ?? 0
  const rawPageSize = (data ?? []).length
  const clientFiltered = !!(stage?.length || sector?.length || minQuality || geoFocus?.length || chequeMin != null || chequeMax != null || minHardwareFit || bvcaOnly)
  const hasMore = clientFiltered
    ? rawPageSize >= safePageSize
    : from + rawPageSize < total

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
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('marketplace_listings')
      .select('subcategory, attributes')
      .eq('category', 'Finance')

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
      }
    }

    const rows = data ?? []
    const total = rows.length

    let investorCount = 0
    let serviceProviderCount = 0
    let withWebsiteCount = 0
    let activeDeployingCount = 0
    let forgeCapitalCount = 0
    const subcategoryCounts: Record<string, number> = {}
    const regionCounts: Record<string, number> = {}

    for (const row of rows) {
      const attrs = (row.attributes as Record<string, unknown>) ?? {}

      const firmType = (attrs.firm_type as string) ?? ''
      if (INVESTOR_FIRM_TYPES.has(firmType)) {
        investorCount++
      } else {
        serviceProviderCount++
      }

      if (attrs.website_url) withWebsiteCount++
      if (attrs.is_active_deploying === true) activeDeployingCount++
      if (attrs.data_source === 'forge_capital') forgeCapitalCount++

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
    }
  },
  ['investor-stats'],
  { revalidate: 300 }
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
export async function getInvestorContacts(listingId: string): Promise<{
  contacts: InvestorContact[]
  access: InvestorTierAccess
}> {
  const access = await getInvestorTierAccess()

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

  const { data: shortlistRows, error: slError } = await supabase
    .from('investor_shortlist')
    .select('listing_id, stage, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (slError || !shortlistRows || shortlistRows.length === 0) return { items: [] }

  const listingIds = shortlistRows.map(r => r.listing_id)
  const { data: listings, error: lError } = await supabase
    .from('marketplace_listings')
    .select('id, title, description, subcategory, attributes')
    .eq('category', 'Finance')
    .in('id', listingIds)

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
 */
export async function toggleInvestorAlert(
  listingId: string
): Promise<{ active?: boolean; error?: string }> {
  if (!UUID_RE.test(listingId)) return { error: 'Invalid listing ID' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Check if alert exists
  const { data: existing } = await supabase
    .from('investor_alerts')
    .select('id, active')
    .eq('user_id', user.id)
    .eq('listing_id', listingId)
    .single()

  if (existing) {
    const newActive = !existing.active
    const { error } = await supabase
      .from('investor_alerts')
      .update({ active: newActive })
      .eq('id', existing.id)

    if (error) return { error: 'Failed to toggle alert' }
    return { active: newActive }
  }

  // Create new alert
  const { error } = await supabase
    .from('investor_alerts')
    .insert({ user_id: user.id, listing_id: listingId, active: true })

  if (error) return { error: 'Failed to create alert' }
  return { active: true }
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
  limit = 5
): Promise<{ firms: InvestorFirm[] }> {
  if (!UUID_RE.test(listingId)) return { firms: [] }

  const supabase = await createClient()

  // Fetch target firm
  const { data: targetRow } = await supabase
    .from('marketplace_listings')
    .select('id, title, description, subcategory, attributes')
    .eq('id', listingId)
    .eq('category', 'Finance')
    .single()

  if (!targetRow) return { firms: [] }
  const target = rowToFirm(targetRow as Record<string, unknown>)

  // Fetch top 50 firms by quality for candidate pool
  const { data: candidateRows } = await supabase
    .from('marketplace_listings')
    .select('id, title, description, subcategory, attributes')
    .eq('category', 'Finance')
    .order('data_quality_score', { ascending: false })
    .limit(50)

  if (!candidateRows) return { firms: [] }

  const candidates = candidateRows.map(r => rowToFirm(r as Record<string, unknown>))
  const similar = findSimilarInvestors(target, candidates, limit)

  const access = await getInvestorTierAccess()
  return { firms: similar.map(f => stripTierGatedFields(f, access)) }
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

  // Fetch shortlist
  const { data: shortlistRows } = await supabase
    .from('investor_shortlist')
    .select('listing_id, stage')
    .eq('user_id', user.id)

  if (!shortlistRows || shortlistRows.length === 0) return empty

  // Pipeline counts
  const pipelineCounts = { ...empty.pipelineCounts }
  for (const row of shortlistRows) {
    const stage = row.stage as ShortlistStage
    if (stage in pipelineCounts) pipelineCounts[stage]++
  }

  // Fetch firm details for shortlisted investors
  const listingIds = shortlistRows.map(r => r.listing_id)
  const { data: listings } = await supabase
    .from('marketplace_listings')
    .select('id, title, description, subcategory, attributes')
    .eq('category', 'Finance')
    .in('id', listingIds)

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
  const { data: noteRows } = await supabase
    .from('investor_notes')
    .select('id, listing_id, note_type, content, created_at')
    .eq('user_id', user.id)
    .in('listing_id', listingIds)
    .order('created_at', { ascending: false })
    .limit(10)

  const recentNotes = (noteRows ?? []).map(n => ({
    ...(n as InvestorNote),
    firmName: firmMap.get(n.listing_id)?.title ?? 'Unknown',
  }))

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
