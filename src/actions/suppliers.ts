/**
 * @file suppliers.ts
 *
 * @description Server actions for the supplier search dashboard. Queries marketplace_listings
 * where category != 'Finance' (i.e. suppliers, not investors). Supports semantic search via
 * match_marketplace_listings RPC with OpenAI embeddings, falling back to keyword/browse.
 *
 * @security No foundry isolation required — supplier data is read-only and public within
 * the platform. Private fields are never included in marketplace_listings.
 */

'use server'

import { createClient } from '@/lib/supabase/server'
import { embedQuery } from '@/lib/embeddings'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SupplierSearchFilters {
  /** Natural language query for semantic search */
  query?: string
  /** Filter by marketplace category */
  category?: string
  /** Geo filter */
  country?: string
  /** e.g. ['AS9100', 'ISO 9001'] */
  certifications?: string[]
  /** manufacturer, distributor, etc. */
  supplierType?: string
  sortBy?: 'relevance' | 'name' | 'rating'
  limit?: number
  offset?: number
}

export interface SupplierSearchResult {
  results: SupplierCard[]
  total: number
  searchMode: 'semantic' | 'keyword' | 'browse'
}

export interface SupplierCard {
  id: string
  name: string
  description: string | null
  category: string
  subcategory: string
  attributes: Record<string, unknown>
  /** Only present for semantic results (0-1) */
  similarity?: number
  is_verified: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps a raw marketplace_listings row to a SupplierCard.
 *
 * DECISION: Nightshift push (script 35) writes enrichment data to top-level
 * columns (certifications, industries, materials, key_equipment, key_people,
 * website_url, country, city, company_size, founded_year) rather than inside
 * the `attributes` JSONB. UI components read everything from `attributes`,
 * so we merge top-level columns into the attributes object here.
 *
 * Top-level columns take precedence over any stale attributes values because
 * they're the most recently pushed data from the Nightshift pipeline.
 */
function mapToSupplierCard(row: Record<string, unknown>): SupplierCard {
  const baseAttrs = (row.attributes as Record<string, unknown>) || {}

  // INTENT: Merge top-level DB columns into attributes so UI components can
  // access enrichment data uniformly via `supplier.attributes.*`
  const mergedAttrs: Record<string, unknown> = {
    ...baseAttrs,
    // Top-level columns from Nightshift push (script 35)
    ...(row.website_url != null && { website_url: row.website_url }),
    ...(row.country != null && { country: row.country }),
    ...(row.city != null && { city: row.city }),
    ...(row.certifications != null && { certifications: row.certifications }),
    ...(row.industries != null && { industries: row.industries }),
    ...(row.materials != null && { materials: row.materials }),
    ...(row.key_equipment != null && { key_equipment: row.key_equipment }),
    ...(row.key_people != null && { key_people: row.key_people }),
    ...(row.company_size != null && { company_size: row.company_size, employee_count: row.company_size }),
    ...(row.founded_year != null && { founded_year: row.founded_year, year_founded: row.founded_year }),
    ...(row.relevance_score != null && { relevance_score: row.relevance_score }),
    ...(row.enrichment_quality != null && { enrichment_quality: row.enrichment_quality }),
  }

  return {
    id: row.id as string,
    name: (row.title as string) || '',
    description: (row.description as string | null) ?? null,
    category: (row.category as string) || '',
    subcategory: (row.subcategory as string) || '',
    attributes: mergedAttrs,
    similarity: row.similarity as number | undefined,
    is_verified: (row.is_verified as boolean) ?? true,
  }
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Searches suppliers in the marketplace. Uses semantic search (pgvector) when a
 * natural-language query is provided (> 5 chars), falling back to keyword/browse.
 *
 * @param filters Search filters including optional query, category, country, certifications, sortBy
 * @returns Ranked supplier results with search mode indicator
 */
export async function searchSuppliers(
  filters: SupplierSearchFilters = {}
): Promise<SupplierSearchResult> {
  const supabase = await createClient()
  const limit = Math.min(filters.limit || 24, 100)
  const offset = filters.offset || 0

  // ── Semantic search path ──
  if (filters.query && filters.query.trim().length > 5) {
    try {
      const queryEmbedding = await embedQuery(filters.query)
      // GOTCHA: Supabase RPC expects vector as string representation, not number[]
      const { data, error } = await supabase.rpc('match_marketplace_listings', {
        query_embedding: JSON.stringify(queryEmbedding) as unknown as string,
        match_threshold: 0.3,
        match_count: limit + offset + 50, // over-fetch for filtering
      })

      if (error) throw error

      // Filter to non-Finance categories (suppliers only) and extract IDs + similarity
      const supplierMatches = (data || [])
        .filter((r: Record<string, unknown>) => r.category !== 'Finance')

      if (supplierMatches.length === 0) {
        return { results: [], total: 0, searchMode: 'semantic' }
      }

      // DECISION: The RPC returns only id, category, title, description, similarity — NOT
      // top-level columns (certifications, country, etc.) or attributes JSONB.
      // Re-fetch full rows by ID so all filters and mapToSupplierCard work correctly.
      const matchIds = supplierMatches.map((r: Record<string, unknown>) => r.id as string)
      const similarityMap = new Map<string, number>(
        supplierMatches.map((r: Record<string, unknown>) => [r.id as string, r.similarity as number])
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

      // Apply additional filters (now with full data from re-fetch)
      if (filters.category) {
        results = results.filter((r: Record<string, unknown>) => r.category === filters.category)
      }
      if (filters.country) {
        const countryLower = filters.country.toLowerCase()
        results = results.filter((r: Record<string, unknown>) => {
          const country = (r.country as string) || ''
          return country.toLowerCase().includes(countryLower)
        })
      }
      if (filters.certifications && filters.certifications.length > 0) {
        results = results.filter((r: Record<string, unknown>) => {
          const certs = r.certifications as string | string[] | null | undefined
          const certsStr = typeof certs === 'string' ? certs.toLowerCase() : Array.isArray(certs) ? certs.map(c => (c as string).toLowerCase()).join(',') : ''
          return filters.certifications!.some(cert => certsStr.includes(cert.toLowerCase()))
        })
      }

      // Apply sorting to semantic results
      if (filters.sortBy === 'name') {
        results = results.sort((a, b) => {
          const nameA = (((a as Record<string, unknown>).title as string) || '').toLowerCase()
          const nameB = (((b as Record<string, unknown>).title as string) || '').toLowerCase()
          return nameA.localeCompare(nameB)
        })
      }

      // Paginate after filtering
      const paginatedResults = results.slice(offset, offset + limit)

      return {
        results: paginatedResults.map(mapToSupplierCard),
        total: results.length,
        searchMode: 'semantic',
      }
    } catch (err) {
      console.error('Semantic search failed, falling back to keyword:', err)
      // Fall through to keyword search
    }
  }

  // ── Keyword/browse path (fallback or no query) ──
  let query = supabase
    .from('marketplace_listings')
    .select('*', { count: 'exact' })
    .neq('category', 'Finance')

  if (filters.query && filters.query.trim().length > 0) {
    const term = `%${filters.query.trim().slice(0, 200)}%`
    query = query.or(`title.ilike.${term},description.ilike.${term}`)
  }
  if (filters.category) {
    // GOTCHA: category is an enum in DB — cast string filter to match
    query = query.eq('category', filters.category as 'People' | 'Products' | 'Services' | 'AI')
  }
  if (filters.country) {
    const countryLower = filters.country.toLowerCase()
    // Note: filtering by country in attributes requires text search or custom logic
    // For now, this is post-filtered on the client side in semantic path
    // For keyword search, we apply it after fetching
  }

  query = query.range(offset, offset + limit - 1)

  if (filters.sortBy === 'name') {
    query = query.order('title', { ascending: true })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  const { data, error, count } = await query
  if (error) {
    console.error('[searchSuppliers] Supabase error:', error)
    throw new Error(`Failed to search suppliers: ${error.message}`)
  }

  // Apply country and certifications filters to keyword results
  let results = (data || []).map((row: Record<string, unknown>) => mapToSupplierCard(row))

  if (filters.country) {
    const countryLower = filters.country.toLowerCase()
    results = results.filter(r => {
      const attrs = r.attributes as Record<string, unknown>
      const country = (attrs.country as string) || ''
      return country.toLowerCase().includes(countryLower)
    })
  }

  if (filters.certifications && filters.certifications.length > 0) {
    results = results.filter(r => {
      const attrs = r.attributes as Record<string, unknown>
      const certs = attrs.certifications as string | string[] | null | undefined
      const certsStr = typeof certs === 'string' ? certs.toLowerCase() : Array.isArray(certs) ? certs.map(c => (c as string).toLowerCase()).join(',') : ''
      return filters.certifications!.some(cert => certsStr.includes(cert.toLowerCase()))
    })
  }

  return {
    results,
    total: results.length,
    searchMode: filters.query ? 'keyword' : 'browse',
  }
}

/**
 * Fetches a single supplier by ID from marketplace_listings (non-Finance only).
 *
 * @param id UUID of the marketplace listing
 * @returns Supplier card or null if not found / is Finance category
 */
export async function getSupplierById(id: string): Promise<SupplierCard | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('*')
    .eq('id', id)
    .neq('category', 'Finance')
    .single()

  if (error || !data) return null
  return mapToSupplierCard(data as Record<string, unknown>)
}
