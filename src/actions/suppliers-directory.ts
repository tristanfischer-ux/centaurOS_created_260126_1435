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
  /** Whether the listing has been verified (is_verified column). */
  isVerified: boolean
  /** Last enrichment timestamp (last_enriched_at column). */
  lastEnrichedAt: string | null
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
    country: (attrs.country as string | null) ?? (row.country as string | null) ?? null,
    city: (attrs.city as string | null) ?? (row.city as string | null) ?? null,
    industries,
    certification: firstCert,
    score: score != null && !isNaN(score) ? Math.round(score) : null,
    isVerified: Boolean(row.is_verified),
    lastEnrichedAt: (row.last_enriched_at as string | null) ?? null,
    websiteUrl: (attrs.website_url as string | null) ?? (row.website_url as string | null) ?? null,
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

// ---------------------------------------------------------------------------
// Phase C — Contacts tab (supplier key_people directory)
// ---------------------------------------------------------------------------

export interface SupplierContactRow {
  /** Stable UI key derived from supplier id + index. */
  key: string
  /** Parent supplier id (links back to /marketplace/<id>). */
  supplierId: string
  supplierName: string
  supplierCountry: string | null
  /** Best-effort name extracted from heterogeneous key_people shape. */
  name: string
  /** Best-effort title / role extracted from the same. */
  title: string | null
}

export interface SupplierContactsFacets {
  /** Total contacts across the directory (deduped per supplier+name). */
  totalContacts: number
  /** Number of suppliers with at least one key person on file. */
  suppliersWithContacts: number
  /** Top 20 country values by supplier count (for the Country filter). */
  countries: { value: string; count: number }[]
}

export interface GetSupplierContactsPageParams {
  search?: string
  country?: string
  page?: number
  pageSize?: number
}

export interface SupplierContactsPageResult {
  rows: SupplierContactRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * Normalise one element of a supplier's `key_people` array. The Nightshift
 * pipeline writes three shapes — sometimes inconsistently within one row:
 *
 *   1. `{ "name": "...", "title": "..." }`           — object form
 *   2. `"Pius Weber, Managing Director"`             — comma-delimited string
 *   3. `"Faye Tomson|Founder & Sustainable Energy"`  — pipe-delimited string
 *
 * Returns `{ name, title }` with name always non-empty (skip the row in
 * the caller if it is). Handles each shape defensively without assuming
 * the array is uniform.
 */
function normaliseKeyPerson(raw: unknown): { name: string; title: string | null } | null {
  if (raw == null) return null
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>
    const name = String(obj.name ?? obj.full_name ?? '').trim()
    if (!name) return null
    const title = String(obj.title ?? obj.role ?? '').trim() || null
    return { name, title }
  }
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return null
    const pipeIdx = s.indexOf('|')
    if (pipeIdx > 0) {
      return { name: s.slice(0, pipeIdx).trim(), title: s.slice(pipeIdx + 1).trim() || null }
    }
    const commaIdx = s.indexOf(',')
    if (commaIdx > 0) {
      return { name: s.slice(0, commaIdx).trim(), title: s.slice(commaIdx + 1).trim() || null }
    }
    return { name: s, title: null }
  }
  return null
}

/**
 * Facet counts for the Contacts tab. Cheap aggregate over array shapes
 * only — no rows expanded server-side.
 */
export async function getSupplierContactsFacets(): Promise<SupplierContactsFacets> {
  const admin = createAdminClient()

  // Fetch the slim shape we need, scoped to suppliers with a key_people array.
  const { data, error } = await admin
    .from('marketplace_listings')
    .select('id, attributes')
    .in('category', ['Products', 'Services'])
    .filter('attributes->key_people', 'not.is', null)
    .limit(20000)

  if (error || !Array.isArray(data)) {
    return { totalContacts: 0, suppliersWithContacts: 0, countries: [] }
  }

  let total = 0
  let suppliersWithContacts = 0
  const countryCounts = new Map<string, number>()

  for (const row of data as Array<{ attributes: Record<string, unknown> }>) {
    const kp = row.attributes?.key_people
    if (!Array.isArray(kp)) continue
    const peopleHere = kp.map(normaliseKeyPerson).filter((p): p is { name: string; title: string | null } => p !== null)
    if (peopleHere.length === 0) continue
    suppliersWithContacts += 1
    total += peopleHere.length
    const c = (row.attributes.country as string | undefined)?.trim()
    if (c) countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1)
  }

  const countries = Array.from(countryCounts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  return { totalContacts: total, suppliersWithContacts, countries }
}

/**
 * Paginated supplier-contacts page. Expands `key_people` server-side.
 *
 * GOTCHA: this scans every supplier with a key_people array. ~14K rows,
 * fast enough for a free-tier query. If it grows past 30K rows we'll need
 * a flattened materialized view.
 */
export async function getSupplierContactsPage(
  params: GetSupplierContactsPageParams = {},
): Promise<SupplierContactsPageResult> {
  const admin = createAdminClient()

  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 25))
  const search = params.search?.trim().toLowerCase() ?? ''
  const country = params.country?.trim() ?? ''

  let query = admin
    .from('marketplace_listings')
    .select('id, title, attributes')
    .in('category', ['Products', 'Services'])
    .filter('attributes->key_people', 'not.is', null)
    .limit(15000)

  if (country) {
    query = query.filter('attributes->>country', 'eq', country)
  }
  // We can't ilike on title at the supplier level when the search is a
  // contact's name — instead, expand all and filter post-fetch. Acceptable
  // for the 14K-row scale.

  const { data, error } = await query

  if (error || !Array.isArray(data)) {
    console.error('[getSupplierContactsPage] query failed:', error?.message)
    return { rows: [], total: 0, page, pageSize, totalPages: 0 }
  }

  const expanded: SupplierContactRow[] = []
  for (const row of data as Array<{
    id: string
    title: string
    attributes: Record<string, unknown>
  }>) {
    const kp = row.attributes?.key_people
    if (!Array.isArray(kp)) continue
    const supplierName = String(row.title ?? '—')
    const supplierCountry = (row.attributes?.country as string | undefined) ?? null
    let i = 0
    for (const elem of kp) {
      const person = normaliseKeyPerson(elem)
      if (!person) continue
      if (search) {
        const haystack = `${person.name} ${person.title ?? ''} ${supplierName}`.toLowerCase()
        if (!haystack.includes(search)) {
          i += 1
          continue
        }
      }
      expanded.push({
        key: `${row.id}::${i}`,
        supplierId: row.id,
        supplierName,
        supplierCountry,
        name: person.name,
        title: person.title,
      })
      i += 1
    }
  }

  // Sort: alphabetical by supplier then person name for stable pagination.
  expanded.sort((a, b) => {
    const s = a.supplierName.localeCompare(b.supplierName)
    return s !== 0 ? s : a.name.localeCompare(b.name)
  })

  const total = expanded.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = (page - 1) * pageSize
  const rows = expanded.slice(from, from + pageSize)

  return { rows, total, page, pageSize, totalPages }
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
    .select('id, title, category, subcategory, attributes, is_verified, last_enriched_at, website_url, country, city', { count: 'exact' })
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
  //   verified  → is_verified = true (boolean column on marketplace_listings)
  //   pushed    → attributes->>data_source = 'nightshift_pushed'
  //   enriched  → attributes->>capability_summary IS NOT NULL  (proxy for synth)
  if (params.status === 'verified') {
    query = query.eq('is_verified', true)
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

  // Sort: verified first (boolean DESC), then by last_enriched_at DESC as
  // tiebreaker (most recently enriched rows surface first), then title ASC.
  // NOTE: verified_at does not exist on marketplace_listings — the boolean
  // is_verified column is the correct verified indicator (fixed 2026-04-27).
  query = query
    .order('is_verified', { ascending: false })
    .order('last_enriched_at', { ascending: false, nullsFirst: false })
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
