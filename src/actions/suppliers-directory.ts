'use server'

/**
 * @file suppliers-directory.ts
 *
 * @description Server actions powering the Suppliers tab in /marketplace
 * (tracker #13 Phase B). Mirrors the Forge Capital Nightshift Supplier
 * Dashboard's Suppliers tab (`Nightshift-Supplier-Dashboard.html` lines
 * 185-219): paginated table with 4 filter dropdowns
 * (Category / Country / Status / Quality) + free-text search.
 *
 * Two actions:
 *   - getSuppliersDirectoryFacets() — country + status options for the
 *     dropdowns. Cached at the action level via revalidate.
 *   - getSuppliersDirectoryPage(params) — paginated rows for the table.
 *
 * @related src/app/(platform)/marketplace/_components/SuppliersTable.tsx
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SuppliersDirectoryRow {
  id: string
  title: string
  category: 'Products' | 'Services' | 'People' | 'Finance' | 'AI'
  subcategory: string | null
  country: string | null
  city: string | null
  /** Top 2 industries from attributes.industries[]. */
  industries: string[]
  /** First certification, if any. */
  certification: string | null
  /** 0–100 quality / nightshift score. */
  score: number | null
  /** Public verification timestamp (column on marketplace_listings). */
  verifiedAt: string | null
  websiteUrl: string | null
}

export interface SuppliersDirectoryFacets {
  /** Distinct country values that appear in supplier attributes,
   *  sorted by row count descending. Top 30 only. */
  countries: { value: string; count: number }[]
  /** Distinct status options based on whether the listing is verified
   *  / has been pushed to the marketplace / is fully enriched. */
  statuses: { value: string; label: string }[]
}

export interface GetSuppliersDirectoryPageParams {
  search?: string
  category?: 'Products' | 'Services' | ''
  country?: string
  /** 'verified' | 'pushed' | 'enriched' | '' */
  status?: string
  /** Minimum quality score (0–100). */
  minScore?: number
  page?: number
  pageSize?: number
}

export interface SuppliersDirectoryPageResult {
  rows: SuppliersDirectoryRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToDirectoryRow(row: Record<string, unknown>): SuppliersDirectoryRow {
  const attrs = (row.attributes as Record<string, unknown>) || {}
  const industries = Array.isArray(attrs.industries)
    ? (attrs.industries as string[]).slice(0, 2)
    : []
  const certs = Array.isArray(attrs.certifications) ? (attrs.certifications as unknown[]) : []
  const firstCert = certs.length > 0 ? String(certs[0]) : null
  const scoreRaw = attrs.nightshift_score ?? attrs.data_quality_score
  const score = typeof scoreRaw === 'number'
    ? scoreRaw
    : typeof scoreRaw === 'string' ? parseFloat(scoreRaw) : null
  return {
    id: String(row.id),
    title: String(row.title ?? '—'),
    category: row.category as SuppliersDirectoryRow['category'],
    subcategory: (row.subcategory as string | null) ?? null,
    country: (attrs.country as string | null) ?? null,
    city: (attrs.city as string | null) ?? null,
    industries,
    certification: firstCert,
    score: score != null && !isNaN(score) ? Math.round(score) : null,
    verifiedAt: (row.verified_at as string | null) ?? null,
    websiteUrl: (attrs.website_url as string | null) ?? null,
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Fetch dropdown options for the Suppliers tab filters.
 *
 * NOTE: country list is approximated by reading the top 30 most common
 * `attributes->>country` values among Products+Services rows. It uses
 * the admin client so it surfaces the full directory, not the user's
 * tenant-scoped subset.
 */
export async function getSuppliersDirectoryFacets(): Promise<SuppliersDirectoryFacets> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketplace_listings')
    .select('attributes')
    .in('category', ['Products', 'Services'])
    .filter('attributes->>country', 'not.is', null)
    .limit(20000)

  const counts = new Map<string, number>()
  if (!error && Array.isArray(data)) {
    for (const row of data as Array<{ attributes: Record<string, unknown> }>) {
      const c = (row.attributes?.country as string | undefined)?.trim()
      if (!c) continue
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
  }

  const countries = Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30)

  // Status options mirror the Nightshift dashboard's filter list.
  const statuses: SuppliersDirectoryFacets['statuses'] = [
    { value: 'verified', label: 'Verified' },
    { value: 'pushed',   label: 'Pushed to ForgeOS' },
    { value: 'enriched', label: 'Synthesised' },
  ]

  return { countries, statuses }
}

/**
 * Paginated supplier directory row fetch. Filters server-side so
 * pagination stays accurate.
 */
export async function getSuppliersDirectoryPage(
  params: GetSuppliersDirectoryPageParams = {},
): Promise<SuppliersDirectoryPageResult> {
  const admin = createAdminClient()

  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 20))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = admin
    .from('marketplace_listings')
    .select('id, title, category, subcategory, attributes, verified_at', { count: 'exact' })
    .eq('is_demo', false)

  // Category filter — default Products + Services for the "Suppliers" tab.
  if (params.category === 'Products' || params.category === 'Services') {
    query = query.eq('category', params.category)
  } else {
    query = query.in('category', ['Products', 'Services'])
  }

  // Country filter — exact match against attributes->>'country'.
  if (params.country) {
    query = query.filter('attributes->>country', 'eq', params.country)
  }

  // Status filter:
  //   verified  → verified_at IS NOT NULL
  //   pushed    → attributes->>data_source = 'nightshift_pushed'
  //   enriched  → attributes->>capability_summary IS NOT NULL  (proxy for synth)
  if (params.status === 'verified') {
    query = query.not('verified_at', 'is', null)
  } else if (params.status === 'pushed') {
    query = query.filter('attributes->>data_source', 'eq', 'nightshift_pushed')
  } else if (params.status === 'enriched') {
    query = query.filter('attributes->>capability_summary', 'not.is', null)
  }

  // Quality score filter — `attributes->>nightshift_score` cast to numeric.
  // PostgREST doesn't parse jsonb numerics, so use rpc-style filter via gte.
  if (params.minScore != null && params.minScore > 0) {
    query = query.gte('attributes->>nightshift_score', String(params.minScore))
  }

  // Free-text search — title only (full-text on attributes is too noisy).
  const trimmedSearch = params.search?.trim()
  if (trimmedSearch) {
    // SECURITY: ilike on user input — sanitise % and _ to prevent wildcard
    // injection that turns the search into a slow scan.
    const safe = trimmedSearch.replace(/[%_]/g, '\\$&')
    query = query.ilike('title', `%${safe}%`)
  }

  // Sort: verified first, then by score descending (nulls last).
  query = query
    .order('verified_at', { ascending: false, nullsFirst: false })
    .order('title', { ascending: true })
    .range(from, to)

  const { data, error, count } = await query

  if (error) {
    console.error('[getSuppliersDirectoryPage] query failed:', error.message)
    return { rows: [], total: 0, page, pageSize, totalPages: 0 }
  }

  const rows = (data as Array<Record<string, unknown>>).map(rowToDirectoryRow)
  const total = count ?? rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return { rows, total, page, pageSize, totalPages }
}
