/**
 * @file grants.ts
 *
 * @description Server actions for the non-dilutive funding grants directory.
 * Queries investor_grants table with text search, country filtering, and pagination.
 *
 * @security No foundry isolation required — grant data is public reference data,
 * read-only for authenticated users (RLS policy). No tier-gating.
 */

"use server"

import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Normalised shape of a single grant record from investor_grants.
 */
export interface InvestorGrant {
  id: string
  grant_name: string
  managing_body: string | null
  country: string | null
  region: string | null
  website: string | null
  application_url: string | null
  description: string | null
  amount_min_usd: number | null
  amount_max_usd: number | null
  total_pool_usd: number | null
  sector_focus: string[] | null
  stage_focus: string[] | null
  trl_min: number | null
  trl_max: number | null
  equity_free: boolean
  deadline: string | null
  deadline_type: string | null
  cofunding_pct: number | null
  eligibility_summary: string | null
  company_size_max: number | null
  company_age_max_years: number | null
  actively_accepting: boolean
  deep_profile: string | null
  data_quality_score: number
}

/**
 * Filter parameters accepted by searchGrants.
 */
export interface GrantSearchFilters {
  query?: string
  country?: string
  activeOnly?: boolean
  equityFreeOnly?: boolean
  page?: number
  pageSize?: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_SIZE = 50
/** SECURITY: Cap page size to prevent abuse */
const MAX_PAGE_SIZE = 100

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Search and filter grants with pagination.
 *
 * @param filters - Search query, country filter, active/equity toggles, pagination
 * @returns Paginated grant results with total count
 */
export async function searchGrants(filters: GrantSearchFilters = {}): Promise<{
  grants: InvestorGrant[]
  total: number
  hasMore: boolean
}> {
  const supabase = await createClient()

  // SECURITY: Sanitize and cap pagination
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE))
  const offset = (page - 1) * pageSize

  // SECURITY: Sanitize search query — strip control characters
  const query = filters.query?.trim().replace(/[^\w\s\-.,&()'/]/g, '') ?? ''

  // Build query
  let dbQuery = supabase
    .from('investor_grants')
    .select('*', { count: 'exact' })

  // Text search across grant_name, managing_body, description
  if (query.length > 0) {
    dbQuery = dbQuery.or(
      `grant_name.ilike.%${query}%,managing_body.ilike.%${query}%,description.ilike.%${query}%`
    )
  }

  // Country filter
  if (filters.country) {
    dbQuery = dbQuery.eq('country', filters.country)
  }

  // Active applications filter
  if (filters.activeOnly) {
    dbQuery = dbQuery.eq('actively_accepting', true)
  }

  // Equity-free filter
  if (filters.equityFreeOnly) {
    dbQuery = dbQuery.eq('equity_free', true)
  }

  // Order: quality DESC, then name ASC for deterministic ordering
  dbQuery = dbQuery
    .order('data_quality_score', { ascending: false })
    .order('grant_name', { ascending: true })
    .range(offset, offset + pageSize - 1)

  const { data, count, error } = await dbQuery

  if (error) {
    console.error('[searchGrants] Query failed:', error.message)
    return { grants: [], total: 0, hasMore: false }
  }

  const total = count ?? 0
  const grants: InvestorGrant[] = (data ?? []).map(row => ({
    id: row.id,
    grant_name: row.grant_name,
    managing_body: row.managing_body,
    country: row.country,
    region: row.region,
    website: row.website,
    application_url: row.application_url,
    description: row.description,
    amount_min_usd: row.amount_min_usd ? Number(row.amount_min_usd) : null,
    amount_max_usd: row.amount_max_usd ? Number(row.amount_max_usd) : null,
    total_pool_usd: row.total_pool_usd ? Number(row.total_pool_usd) : null,
    sector_focus: row.sector_focus,
    stage_focus: row.stage_focus,
    trl_min: row.trl_min,
    trl_max: row.trl_max,
    equity_free: row.equity_free ?? true,
    deadline: row.deadline,
    deadline_type: row.deadline_type,
    cofunding_pct: row.cofunding_pct ? Number(row.cofunding_pct) : null,
    eligibility_summary: row.eligibility_summary,
    company_size_max: row.company_size_max,
    company_age_max_years: row.company_age_max_years,
    actively_accepting: row.actively_accepting ?? true,
    deep_profile: row.deep_profile,
    data_quality_score: row.data_quality_score ? Number(row.data_quality_score) : 0,
  }))

  return {
    grants,
    total,
    hasMore: offset + pageSize < total,
  }
}

/**
 * Get aggregate stats for the grants directory (total, active count, country breakdown).
 *
 * @returns Grant statistics for filter dropdowns and summary display
 */
export async function getGrantStats(): Promise<{
  total: number
  activeCount: number
  countries: { name: string; count: number }[]
}> {
  const supabase = await createClient()

  // INTENT: Run total + active count in parallel for performance
  const [totalResult, activeResult] = await Promise.all([
    supabase.from('investor_grants').select('*', { count: 'exact', head: true }),
    supabase.from('investor_grants').select('*', { count: 'exact', head: true }).eq('actively_accepting', true),
  ])

  const total = totalResult.count ?? 0
  const activeCount = activeResult.count ?? 0

  // Country breakdown — fetch all countries and count client-side
  // DECISION: Using a raw select + JS grouping instead of RPC because the table
  // is small enough (~3K rows) and avoids needing a custom SQL function
  const { data: countryRows } = await supabase
    .from('investor_grants')
    .select('country')

  const countryMap = new Map<string, number>()
  for (const row of countryRows ?? []) {
    const name = row.country ?? 'Unknown'
    countryMap.set(name, (countryMap.get(name) ?? 0) + 1)
  }

  const countries = Array.from(countryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  return { total, activeCount, countries }
}
