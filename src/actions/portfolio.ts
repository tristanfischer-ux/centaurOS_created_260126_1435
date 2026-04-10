"use server"

/**
 * Portfolio actions module
 * Additional portfolio-specific server actions beyond trust-signals.ts
 */

import { updatePortfolioItem } from './trust-signals'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Fetches portfolio items for a given provider (public read).
 *
 * @param providerId - The provider's user ID
 * @returns Array of portfolio items with id, title, client_name, description, image_urls
 */
export async function getProviderPortfolio(providerId: string): Promise<{
    id: string
    title: string
    client_name?: string
    description?: string
    image_urls?: string[]
}[]> {
    const supabase = await createClient()

    // AUTH: Verify user is authenticated before serving portfolio data
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('provider_portfolio')
        .select('id, title, client_name, description, image_urls')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false })
        .limit(10)

    if (error || !data) return []
    return data as { id: string; title: string; client_name?: string; description?: string; image_urls?: string[] }[]
}

/**
 * Set an item as featured (convenience wrapper)
 */
export async function setFeaturedItem(id: string): Promise<{
    success: boolean
    error: string | null
}> {
    const result = await updatePortfolioItem(id, { is_featured: true })

    if (result.error) {
        return { success: false, error: result.error }
    }

    return { success: true, error: null }
}

// ---------------------------------------------------------------------------
// Investor Portfolio Companies Directory
// ---------------------------------------------------------------------------

export interface PortfolioCompanyResult {
  company_name: string
  sector: string | null
  stage: string | null
  amount_usd: number | null
  description: string | null
  listing_id: string | null
  firm_name: string
  /** Number of investors who invested in this company */
  investor_count: number
  /** Names of investors (for display) */
  investor_names: string[]
}

interface PortfolioSearchFilters {
  query?: string
  sector?: string
  page?: number
  pageSize?: number
}

/**
 * Search portfolio companies across all investors.
 *
 * @description Tries materialized investor_portfolio_companies table first.
 * Falls back to aggregating portfolio_companies JSONB from marketplace_listings
 * if the materialized table is empty (e.g. before first push).
 */
export async function searchPortfolioCompanies(
  filters: PortfolioSearchFilters = {}
): Promise<{ companies: PortfolioCompanyResult[]; total: number; hasMore: boolean }> {
  const { query, sector, page = 1, pageSize = 50 } = filters
  const safePage = Math.max(1, page)
  const safePageSize = Math.min(Math.max(1, pageSize), 100)
  const from = (safePage - 1) * safePageSize

  // DECISION: Use admin client to bypass RLS (same issue as contacts)
  const adminDb = createAdminClient()

  // Try materialized table first
  const { count: matCount } = await adminDb
    .from("investor_portfolio_companies")
    .select("id", { count: "exact", head: true })

  if (matCount && matCount > 0) {
    // INTENT: Fetch raw rows and GROUP BY company_name client-side.
    // PostgREST doesn't support GROUP BY, and we can't apply the RPC without
    // DB password access. Fetch a larger window and deduplicate.
    let q = adminDb
      .from("investor_portfolio_companies")
      .select("company_name, sector, stage, amount_usd, description, listing_id, marketplace_listings!inner(title)")

    // INTENT: Semantic search for portfolio queries >= 3 chars; fall back to ilike.
    if (query && query.trim().length >= 3) {
      const { searchPortfolioCompaniesSemantic } = await import('@/lib/search/semantic-search')
      const hits = await searchPortfolioCompaniesSemantic(query.trim())
      if (hits.length > 0) {
        q = q.in('id', hits.map(h => h.id))
      } else {
        const term = `%${query.trim().slice(0, 200)}%`
        q = q.ilike("company_name", term)
      }
    } else if (query && query.trim().length > 0) {
      const term = `%${query.trim().slice(0, 200)}%`
      q = q.ilike("company_name", term)
    }

    if (sector) {
      q = q.ilike("sector", `%${sector}%`)
    }

    // Fetch more rows than needed for dedup (max 5000 for a page)
    q = q.order("company_name", { ascending: true }).limit(5000)

    const { data, error } = await q

    if (error) {
      console.error("[searchPortfolioCompanies] Error:", error)
      return { companies: [], total: 0, hasMore: false }
    }

    // Deduplicate by company_name — group rows into unique companies
    const grouped = new Map<string, PortfolioCompanyResult>()
    for (const row of data ?? []) {
      const r = row as Record<string, unknown>
      const name = (r.company_name as string) || "Unknown"
      const listing = r.marketplace_listings as { title: string } | null
      const firmName = listing?.title ?? "—"
      const key = name.toLowerCase().trim()

      if (grouped.has(key)) {
        const existing = grouped.get(key)!
        existing.investor_count++
        if (firmName !== "—" && !existing.investor_names.includes(firmName)) {
          existing.investor_names.push(firmName)
        }
      } else {
        grouped.set(key, {
          company_name: name,
          sector: (r.sector as string) || null,
          stage: (r.stage as string) || null,
          amount_usd: (r.amount_usd as number) || null,
          description: (r.description as string) || null,
          listing_id: (r.listing_id as string) || null,
          firm_name: firmName,
          investor_count: 1,
          investor_names: firmName !== "—" ? [firmName] : [],
        })
      }
    }

    // Sort by investor_count DESC, then name ASC
    const allDeduped = [...grouped.values()].sort((a, b) =>
      b.investor_count - a.investor_count || a.company_name.localeCompare(b.company_name)
    )

    const total = allDeduped.length
    const paged = allDeduped.slice(from, from + safePageSize)
    return { companies: paged, total, hasMore: from + paged.length < total }
  }

  // Fallback: aggregate from marketplace_listings JSONB
  const { data: listings, error: listError } = await adminDb
    .from("marketplace_listings")
    .select("id, title, attributes")
    .eq("category", "Finance")
    .not("attributes->portfolio_companies", "is", null)
    .limit(10000)

  if (listError || !listings) {
    console.error("[searchPortfolioCompanies] Fallback error:", listError)
    return { companies: [], total: 0, hasMore: false }
  }

  let allCompanies: PortfolioCompanyResult[] = []
  for (const listing of listings) {
    const attrs = (listing.attributes as Record<string, unknown>) || {}
    const portfolio = attrs.portfolio_companies as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(portfolio)) continue
    for (const pc of portfolio) {
      allCompanies.push({
        company_name: (pc.company_name as string) || "Unknown",
        sector: (pc.sector as string) || null,
        stage: (pc.stage as string) || null,
        amount_usd: (pc.amount_usd as number) || null,
        description: (pc.description as string) || null,
        listing_id: listing.id,
        firm_name: listing.title,
        investor_count: 1,
        investor_names: [listing.title],
      })
    }
  }

  // Client-side filters
  if (query && query.trim().length > 0) {
    const q = query.trim().toLowerCase()
    allCompanies = allCompanies.filter(
      (c) => c.company_name.toLowerCase().includes(q) || c.firm_name.toLowerCase().includes(q)
    )
  }

  if (sector) {
    const s = sector.toLowerCase()
    allCompanies = allCompanies.filter((c) => c.sector?.toLowerCase().includes(s))
  }

  allCompanies.sort((a, b) => a.company_name.localeCompare(b.company_name))
  const total = allCompanies.length
  const paged = allCompanies.slice(from, from + safePageSize)

  return { companies: paged, total, hasMore: from + paged.length < total }
}

// ---------------------------------------------------------------------------
// Portfolio Company Detail — All Investors for a Specific Company
// ---------------------------------------------------------------------------

export interface PortfolioCompanyInvestor {
  listing_id: string | null
  firm_name: string
  sector: string | null
  stage: string | null
  amount_usd: number | null
  description: string | null
  firm_type?: string
  fund_size_gbp?: number
  hq_city?: string
}

/**
 * Get all investors who have a specific portfolio company.
 */
export async function getCompanyInvestors(
  companyName: string
): Promise<{ investors: PortfolioCompanyInvestor[]; companyName: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { investors: [], companyName }

  const adminDb = createAdminClient()

  const { data: rows, error } = await adminDb
    .from('investor_portfolio_companies')
    .select('listing_id, sector, stage, amount_usd, description, marketplace_listings!inner(title, attributes)')
    .ilike('company_name', companyName)
    .limit(100)

  if (error || !rows) {
    console.error('[getCompanyInvestors] Error:', error)
    return { investors: [], companyName }
  }

  const investors: PortfolioCompanyInvestor[] = rows.map((row) => {
    const listing = row.marketplace_listings as unknown as { title: string; attributes?: Record<string, unknown> } | null
    const attrs = listing?.attributes ?? {}
    return {
      listing_id: row.listing_id,
      firm_name: listing?.title || '—',
      sector: row.sector as string | null,
      stage: row.stage as string | null,
      amount_usd: row.amount_usd as number | null,
      description: row.description as string | null,
      firm_type: attrs.firm_type as string | undefined,
      fund_size_gbp: attrs.fund_size_gbp as number | undefined,
      hq_city: attrs.hq_city as string | undefined,
    }
  })

  return { investors, companyName }
}
