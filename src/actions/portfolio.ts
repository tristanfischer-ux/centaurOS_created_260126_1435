"use server"

/**
 * Portfolio actions module
 * Additional portfolio-specific server actions beyond trust-signals.ts
 */

import { updatePortfolioItem } from './trust-signals'
import { createClient } from '@/lib/supabase/server'

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

  const supabase = await createClient()

  // Try materialized table first
  const { count: matCount } = await supabase
    .from("investor_portfolio_companies")
    .select("id", { count: "exact", head: true })

  if (matCount && matCount > 0) {
    let q = supabase
      .from("investor_portfolio_companies")
      .select("company_name, sector, stage, amount_usd, description, listing_id", { count: "exact" })

    if (query && query.trim().length > 0) {
      const term = `%${query.trim().slice(0, 200)}%`
      q = q.ilike("company_name", term)
    }

    if (sector) {
      q = q.ilike("sector", `%${sector}%`)
    }

    q = q.order("company_name", { ascending: true }).range(from, from + safePageSize - 1)

    const { data, count, error } = await q

    if (error) {
      console.error("[searchPortfolioCompanies] Error:", error)
      return { companies: [], total: 0, hasMore: false }
    }

    const companies: PortfolioCompanyResult[] = (data ?? []).map((row: Record<string, unknown>) => ({
      company_name: row.company_name as string,
      sector: row.sector as string | null,
      stage: row.stage as string | null,
      amount_usd: row.amount_usd as number | null,
      description: row.description as string | null,
      listing_id: row.listing_id as string | null,
      firm_name: "—", // Would need join for firm name from materialized table
    }))

    const total = count ?? 0
    return { companies, total, hasMore: from + companies.length < total }
  }

  // Fallback: aggregate from marketplace_listings JSONB
  const { data: listings, error: listError } = await supabase
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
