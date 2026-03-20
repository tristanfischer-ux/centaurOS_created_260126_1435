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
  if (Array.isArray(val)) return val as string[]
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
    .replace(/[,()\."*]/g, '')
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

  const total = count ?? 0
  const rawPageSize = (data ?? []).length
  const hasMore = stage?.length || sector?.length || minQuality
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
}

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

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('vc_pe_contacts')
    .select('id, full_name, title, seniority, email, email_verified, linkedin_url, is_decision_maker, outreach_status, notes, deep_bio')
    .eq('listing_id', listingId)
    .order('is_decision_maker', { ascending: false })
    .order('full_name', { ascending: true })

  if (error) {
    console.error('[getInvestorContacts] Supabase error:', error)
    return { contacts: [], access }
  }

  let contacts = (data ?? []) as InvestorContact[]

  // Strip deep fields for users below professional tier
  if (!access.deepAccess) {
    contacts = contacts.map(c => ({
      ...c,
      email: null,
      deep_bio: null,
    }))
  }

  return { contacts, access }
}
