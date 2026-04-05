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

function mapToSupplierCard(row: Record<string, unknown>): SupplierCard {
  return {
    id: row.id as string,
    name: (row.title as string) || '',
    description: (row.description as string | null) ?? null,
    category: (row.category as string) || '',
    subcategory: (row.subcategory as string) || '',
    attributes: (row.attributes as Record<string, unknown>) || {},
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
 * @param filters Search filters including optional query, category, country
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

      // Filter to non-Finance categories (suppliers only)
      let results = (data || [])
        .filter((r: Record<string, unknown>) => r.category !== 'Finance')

      // Apply additional filters
      if (filters.category) {
        results = results.filter((r: Record<string, unknown>) => r.category === filters.category)
      }
      if (filters.country) {
        const countryLower = filters.country.toLowerCase()
        results = results.filter((r: Record<string, unknown>) => {
          const attrs = (r.attributes as Record<string, unknown>) || {}
          const country = (attrs.country as string) || ''
          return country.toLowerCase().includes(countryLower)
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

  return {
    results: (data || []).map((row: Record<string, unknown>) => mapToSupplierCard(row)),
    total: count || 0,
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
