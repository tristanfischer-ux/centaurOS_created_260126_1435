"use server"

import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  extractPostcode,
  deriveRegionFromPostcode,
  deriveRegionFromKeywords,
} from "@/lib/postcode-utils"

/**
 * @file marketplace-stats.ts
 * @description Server action to compute aggregate marketplace statistics
 * for the analytics dashboard. Reads from marketplace_listings and computes
 * counts by company type, company size, UK region, subcategory, industry,
 * and certification distributions.
 *
 * DECISION: Wrapped in unstable_cache with 5-min TTL to avoid 6+ sequential
 * Supabase calls on every page load. Uses createAdminClient() (service role)
 * because cookies() cannot be called inside unstable_cache — same pattern as
 * getInvestorStats in investors.ts.
 *
 * FLOW: Region/postcode helpers live in @/lib/postcode-utils (shared with recruits-stats).
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MarketplaceStats {
  totalListings: number
  verifiedCount: number
  manufacturingTypes: number
  regionCount: number
  companyTypeCounts: { name: string; count: number }[]
  companySizeCounts: { name: string; count: number }[]
  regionCounts: { name: string; count: number }[]
  avgCompanyAge: number | null
  subcategoryCounts: { name: string; count: number }[]
  industryCounts: { name: string; count: number }[]
  certificationCounts: { name: string; count: number }[]
  withCapabilitiesCount: number
  withCertificationsCount: number
}

// ─── Fetch + Aggregate (runs inside cache) ──────────────────────────────────

const fetchMarketplaceStats = async (): Promise<MarketplaceStats | null> => {
  // SECURITY: admin client — aggregate stats over marketplace_listings (cross-foundry by design), foundry_id not needed
  const supabase = createAdminClient()

  // Fetch all Products & Services listings with attributes + new columns
  // INTENT: We only count Products and Services for the marketplace stats
  // (Finance listings are separate). Paginate to handle large datasets.
  // GOTCHA: Supabase returns `Json` type for JSONB columns, which is a union
  // of string | number | boolean | null | Json[] | { [key: string]: Json }.
  // We cast to our expected shape after fetching.
  const allRows: {
    is_verified: boolean | null
    attributes: unknown
    subcategory: string | null
    industries: unknown
    certifications: unknown
    process_capabilities: unknown
    country: string | null
  }[] = []
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select("is_verified, attributes, subcategory, industries, certifications, process_capabilities, country")
      .in("category", ["Products", "Services"])
      .eq("is_demo", false)
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error("[getMarketplaceStats] Query failed:", error.message)
      return null
    }

    if (!data || data.length === 0) break
    allRows.push(...(data as typeof allRows))
    if (data.length < pageSize) break
    offset += pageSize
  }

  // DECISION: Get the accurate total via a count query (not limited by pagination).
  // The row iteration above may hit PostgREST row limits on large datasets.
  const { count: exactTotalCount } = await supabase
    .from("marketplace_listings")
    .select("id", { count: "exact", head: true })
    .in("category", ["Products", "Services"])
    .eq("is_demo", false)

  if (allRows.length === 0 && !exactTotalCount) {
    return {
      totalListings: 0,
      verifiedCount: 0,
      manufacturingTypes: 0,
      regionCount: 0,
      companyTypeCounts: [],
      companySizeCounts: [],
      regionCounts: [],
      avgCompanyAge: null,
      subcategoryCounts: [],
      industryCounts: [],
      certificationCounts: [],
      withCapabilitiesCount: 0,
      withCertificationsCount: 0,
    }
  }

  // ── Compute stats (single pass) ─────────────────────────────────────────

  // INTENT: Use the exact count query for the headline number, not allRows.length.
  // allRows may be capped by PostgREST pagination limits on large datasets.
  const totalListings = exactTotalCount ?? allRows.length
  const currentYear = new Date().getFullYear()
  let verifiedCount = 0
  let totalAge = 0
  let ageCount = 0
  let withCapabilitiesCount = 0
  let withCertificationsCount = 0
  const typeCounts = new Map<string, number>()
  const sizeCounts = new Map<string, number>()
  const regionMap = new Map<string, number>()
  const subcategoryMap = new Map<string, number>()
  const industryMap = new Map<string, number>()
  const certificationMap = new Map<string, number>()

  for (const row of allRows) {
    const attrs = row.attributes as Record<string, unknown> | null

    // Verified count
    if (row.is_verified === true) verifiedCount++

    // Subcategory (top-level column, not inside attributes)
    if (row.subcategory) {
      subcategoryMap.set(row.subcategory, (subcategoryMap.get(row.subcategory) ?? 0) + 1)
    }

    // Industries — top-level JSONB array column + attributes.industries fallback
    const industriesRaw = row.industries ?? (attrs as Record<string, unknown> | null)?.industries
    if (Array.isArray(industriesRaw)) {
      for (const ind of industriesRaw) {
        if (typeof ind === "string" && ind.trim()) {
          const name = ind.trim()
          industryMap.set(name, (industryMap.get(name) ?? 0) + 1)
        }
      }
    }

    // Certifications — top-level JSONB array column + attributes.certifications fallback
    const certsRaw = row.certifications ?? (attrs as Record<string, unknown> | null)?.certifications
    if (Array.isArray(certsRaw) && certsRaw.length > 0) {
      withCertificationsCount++
      for (const cert of certsRaw) {
        if (typeof cert === "string" && cert.trim()) {
          const name = cert.trim()
          certificationMap.set(name, (certificationMap.get(name) ?? 0) + 1)
        }
      }
    }

    // Process capabilities (count companies that have data)
    const caps = row.process_capabilities
    if (Array.isArray(caps) && caps.length > 0) {
      withCapabilitiesCount++
    }

    if (!attrs) continue

    // Company type
    const companyType = attrs.company_type as string | undefined
    if (companyType) {
      typeCounts.set(companyType, (typeCounts.get(companyType) ?? 0) + 1)
    }

    // Company size
    const size = (attrs.ch_company_size as string) || (attrs.company_size as string)
    if (size) {
      sizeCounts.set(size, (sizeCounts.get(size) ?? 0) + 1)
    }

    // Region — check country first, then derive from postcode/keywords for UK
    let region: string | null = null

    // INTENT: Non-UK suppliers show their country name as the region.
    // UK suppliers get the detailed regional breakdown (Midlands, Yorkshire, etc.).
    const country = row.country || (attrs?.country as string | undefined)
    const isUK = !country || ["GB", "UK", "United Kingdom", "England", "Scotland", "Wales"].includes(country)

    if (!isUK && country) {
      // European/international suppliers — use country name as region
      region = country
    }

    // UK suppliers — derive region from postcode
    if (!region) {
      const chAddress = attrs?.ch_registered_address as string | undefined
      if (chAddress) {
        const postcode = extractPostcode(chAddress)
        if (postcode) region = deriveRegionFromPostcode(postcode)
      }
    }

    if (!region) {
      const location = attrs?.location as string | undefined
      if (location) {
        const postcode = extractPostcode(location)
        if (postcode) region = deriveRegionFromPostcode(postcode)
      }
    }

    if (!region) {
      const hq = attrs?.headquarters as string | undefined
      if (hq) {
        const postcode = extractPostcode(hq)
        if (postcode) region = deriveRegionFromPostcode(postcode)
      }
    }

    if (!region) {
      const locationText = (attrs?.ch_registered_address as string)
        ?? (attrs?.location as string)
        ?? (attrs?.headquarters as string)
      if (locationText) region = deriveRegionFromKeywords(locationText)
    }

    if (region) {
      regionMap.set(region, (regionMap.get(region) ?? 0) + 1)
    }

    // Company age
    const incDateRaw =
      attrs.ch_incorporation_date ??
      attrs.incorporation_date ??
      attrs.founded_year
    const incDate = incDateRaw != null ? String(incDateRaw) : undefined
    if (incDate) {
      const year = parseInt(incDate.slice(0, 4), 10)
      if (!isNaN(year) && year > 1800 && year <= currentYear) {
        totalAge += currentYear - year
        ageCount++
      }
    }
  }

  const companyTypeCounts = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }))

  const manufacturingTypes = typeCounts.size

  const companySizeCounts = [...sizeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))

  const regionCounts = [...regionMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))

  const subcategoryCounts = [...subcategoryMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }))

  const industryCounts = [...industryMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }))

  const certificationCounts = [...certificationMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))

  const regionCount = regionMap.size
  const avgCompanyAge = ageCount > 0 ? Math.round(totalAge / ageCount) : null

  return {
    totalListings,
    verifiedCount,
    manufacturingTypes,
    regionCount,
    companyTypeCounts,
    companySizeCounts,
    regionCounts,
    avgCompanyAge,
    subcategoryCounts,
    industryCounts,
    certificationCounts,
    withCapabilitiesCount,
    withCertificationsCount,
  }
}

// ─── Cached Export ──────────────────────────────────────────────────────────

/**
 * Compute aggregate marketplace statistics for the analytics dashboard.
 *
 * @description Cached with 5-minute TTL. Uses admin client (service role)
 * because unstable_cache can revalidate during a different user's request
 * and cookies() inside unstable_cache() causes a Next.js error.
 *
 * @returns MarketplaceStats or null on error
 */
export const getMarketplaceStats = unstable_cache(
  fetchMarketplaceStats,
  ["marketplace-stats"],
  { revalidate: 300 }
)
