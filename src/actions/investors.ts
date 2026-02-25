/**
 * @file investors.ts
 *
 * @description Server actions for the UK Investor Directory. Queries marketplace_listings
 * where category = 'Finance', searching by text in title/description and filtering by
 * JSONB attribute fields. Exposes pagination helpers for both the directory listing page
 * and the individual detail page.
 *
 * @security No foundry isolation required — investor data is read-only and public within
 * the platform. The marketplace_listings table is append-only for admins.
 *
 * GOTCHA: The database enum marketplace_category does not yet include 'Finance'. We cast
 * the category filter to `string` via a raw `.filter()` call to bypass the TypeScript
 * enum constraint while the schema migration is pending.
 */

"use server"

import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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
  subcategoryBreakdown: { name: string; count: number }[]
  cityBreakdown: { name: string; count: number }[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalises a JSONB value to a string array.
 * Handles: undefined/null → [], existing array → pass-through,
 * CSV string (from import) → split on comma.
 */
function toStringArray(val: unknown): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val as string[]
  if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

/**
 * Casts a raw marketplace_listings row to InvestorFirm.
 * Normalises array fields so consumers never need to handle CSV strings.
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

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Searches and filters the UK investor directory.
 *
 * @description Queries marketplace_listings where category = 'Finance'.
 * Applies optional ILIKE search on title/description, JSONB attribute filters,
 * and standard pagination. Stage/sector array filtering is applied in-memory
 * because PostgREST does not support JSONB array containment without a custom RPC.
 *
 * @param filters - Optional filter parameters
 * @returns Paginated list of investor firms with total count and hasMore flag
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
    page = 1,
    pageSize = 24,
  } = filters

  const supabase = await createClient()

  // INTENT: Build the query progressively, filtered to Finance category (VC/PE firms).
  let q = supabase
    .from('marketplace_listings')
    .select('id, title, description, subcategory, attributes', { count: 'exact' })
    .eq('category', 'Finance')

  // Full-text search on title and description
  if (query && query.trim().length > 0) {
    const term = `%${query.trim()}%`
    q = q.or(`title.ilike.${term},description.ilike.${term}`)
  }

  // JSONB scalar filter: firm_type
  if (firmType && firmType.length > 0) {
    q = q.or(firmType.map((t: string) => `attributes->firm_type.eq."${t}"`).join(','))
  }

  // JSONB scalar filter: is_active_deploying
  if (activeOnly) {
    q = q.filter('attributes->is_active_deploying', 'eq', 'true')
  }

  // JSONB scalar filter: hq_city
  if (hqCity && hqCity.trim().length > 0) {
    q = q.filter('attributes->>hq_city', 'ilike', `%${hqCity.trim()}%`)
  }

  // JSONB scalar filter: outreach_priority
  if (priority) {
    q = q.filter('attributes->>outreach_priority', 'eq', priority)
  }

  // Pagination
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  q = q.range(from, to).order('title', { ascending: true })

  const { data, count, error } = await q

  if (error) {
    console.error('[searchInvestors] Supabase error:', error)
    return { firms: [], total: 0, hasMore: false }
  }

  let firms = (data ?? []).map((row: Record<string, unknown>) => rowToFirm(row))

  // DECISION: Apply stage/sector client-side after DB fetch because Supabase
  // PostgREST does not support @> (array containment) on JSONB array fields
  // without a custom RPC. Dataset is small enough (<1000 rows/page) for this.
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

  const total = count ?? 0
  // GOTCHA: When stage/sector filters are applied client-side, firms.length
  // after filtering can be less than pageSize even when more DB rows exist.
  // Use the raw page size (before filtering) to detect whether the DB has more
  // pages — if the DB returned a full page, there may be more to fetch.
  const rawPageSize = (data ?? []).length
  const hasMore = stage?.length || sector?.length
    ? rawPageSize >= pageSize  // client-filtered: more pages if DB returned a full page
    : from + rawPageSize < total  // unfiltered: exact count is reliable

  return { firms, total, hasMore }
}

/**
 * Fetches a single investor firm by ID.
 *
 * @description Returns the full marketplace_listings record for the given ID,
 * restricted to category = 'Finance' for safety.
 *
 * @param id - The marketplace_listings UUID
 * @returns The investor firm or null if not found
 */
export async function getInvestorById(id: string): Promise<InvestorFirm | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('id, title, description, subcategory, attributes')
    .eq('id', id)
    .eq('category', 'Finance')
    .single()

  if (error || !data) {
    console.error('[getInvestorById] Not found or error:', error)
    return null
  }

  return rowToFirm(data as Record<string, unknown>)
}

// DECISION: firm_type is the reliable discriminator for investor vs service
// provider. The is_investor flag was absent from the data (CSV import never
// set it), so counts were always 0/596. These are the known capital-deployer
// firm types in the UK Finance directory.
const INVESTOR_FIRM_TYPES = new Set([
  'VC', 'PE', 'Growth', 'Growth Equity', 'Family Office', 'CVC',
  'Corporate VC', 'Accelerator', 'Angel', 'Angel Network', 'Debt Fund',
  'Impact Fund', 'EIS Fund', 'SEIS Fund',
])

/**
 * Fetches aggregated stats for the investor directory insights panel.
 *
 * @description Pulls all Finance listings (subcategory + attributes only),
 * then aggregates counts and breakdowns in JS. Designed for the insights panel
 * header above the directory grid.
 *
 * DECISION: Wrapped with unstable_cache (5 min TTL) to avoid a full-table
 * scan on every ISR revalidation. The page revalidates every 60s but investor
 * data changes infrequently — 5 min is a safe window.
 *
 * @returns Aggregated InvestorStats
 */
export const getInvestorStats = unstable_cache(
  async (): Promise<InvestorStats> => {
    const supabase = await createClient()

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
        subcategoryBreakdown: [],
        cityBreakdown: [],
      }
    }

    const rows = data ?? []
    const total = rows.length

    let investorCount = 0
    let serviceProviderCount = 0
    let withWebsiteCount = 0
    let activeDeployingCount = 0
    const subcategoryCounts: Record<string, number> = {}
    const cityCounts: Record<string, number> = {}

    for (const row of rows) {
      const attrs = (row.attributes as Record<string, unknown>) ?? {}

      // DECISION: Use firm_type to distinguish capital-deployers from service
      // providers. is_investor flag was unreliable (never populated from CSV).
      const firmType = (attrs.firm_type as string) ?? ''
      if (INVESTOR_FIRM_TYPES.has(firmType)) {
        investorCount++
      } else {
        serviceProviderCount++
      }

      if (attrs.website_url) withWebsiteCount++
      if (attrs.is_active_deploying === true) activeDeployingCount++

      const sub = (row.subcategory as string) || 'Unknown'
      subcategoryCounts[sub] = (subcategoryCounts[sub] ?? 0) + 1

      const city = (attrs.hq_city as string) || ''
      if (city) cityCounts[city] = (cityCounts[city] ?? 0) + 1
    }

    const subcategoryBreakdown = Object.entries(subcategoryCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const cityBreakdown = Object.entries(cityCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return {
      total,
      investorCount,
      serviceProviderCount,
      withWebsiteCount,
      activeDeployingCount,
      subcategoryBreakdown,
      cityBreakdown,
    }
  },
  ['investor-stats'],
  { revalidate: 300 }
)
