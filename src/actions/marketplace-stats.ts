"use server"

import { createClient } from "@/lib/supabase/server"
import {
  extractPostcode,
  deriveRegionFromPostcode,
  deriveRegionFromKeywords,
} from "@/lib/postcode-utils"

/**
 * @file marketplace-stats.ts
 * @description Server action to compute aggregate marketplace statistics
 * for the analytics dashboard. Reads from marketplace_listings and computes
 * counts by company type, company size, and UK region.
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
}

// ─── Main Stats Function ────────────────────────────────────────────────────

/**
 * Compute aggregate marketplace statistics for the analytics dashboard.
 *
 * @description Fetches all visible (verified) marketplace listings and computes:
 * - Total and verified counts
 * - Company type distribution (top 15)
 * - Company size breakdown (for donut chart)
 * - UK regional coverage
 * - Average company age from incorporation dates
 *
 * @returns MarketplaceStats or null on error
 */
export async function getMarketplaceStats(): Promise<MarketplaceStats | null> {
  const supabase = await createClient()

  // Fetch all Products & Services listings with attributes
  // INTENT: We only count Products and Services for the marketplace stats
  // (Finance listings are separate). Paginate to handle large datasets.
  // GOTCHA: Supabase returns `Json` type for JSONB columns, which is a union
  // of string | number | boolean | null | Json[] | { [key: string]: Json }.
  // We cast to our expected shape after fetching.
  const allRows: { is_verified: boolean | null; attributes: unknown }[] = []
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select("is_verified, attributes")
      .in("category", ["Products", "Services"])
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error("[getMarketplaceStats] Query failed:", error.message)
      return null
    }

    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < pageSize) break
    offset += pageSize
  }

  if (allRows.length === 0) {
    return {
      totalListings: 0,
      verifiedCount: 0,
      manufacturingTypes: 0,
      regionCount: 0,
      companyTypeCounts: [],
      companySizeCounts: [],
      regionCounts: [],
      avgCompanyAge: null,
    }
  }

  // ── Compute stats (single pass) ─────────────────────────────────────────

  const totalListings = allRows.length
  const currentYear = new Date().getFullYear()
  let verifiedCount = 0
  let totalAge = 0
  let ageCount = 0
  const typeCounts = new Map<string, number>()
  const sizeCounts = new Map<string, number>()
  const regionMap = new Map<string, number>()

  for (const row of allRows) {
    const attrs = row.attributes as Record<string, unknown> | null

    // Verified count
    if (row.is_verified === true) verifiedCount++

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

    // Region — derive from postal code or keywords
    let region: string | null = null

    const chAddress = attrs.ch_registered_address as string | undefined
    if (chAddress) {
      const postcode = extractPostcode(chAddress)
      if (postcode) region = deriveRegionFromPostcode(postcode)
    }

    if (!region) {
      const location = attrs.location as string | undefined
      if (location) {
        const postcode = extractPostcode(location)
        if (postcode) region = deriveRegionFromPostcode(postcode)
      }
    }

    if (!region) {
      const hq = attrs.headquarters as string | undefined
      if (hq) {
        const postcode = extractPostcode(hq)
        if (postcode) region = deriveRegionFromPostcode(postcode)
      }
    }

    if (!region) {
      const locationText = (attrs.ch_registered_address as string)
        ?? (attrs.location as string)
        ?? (attrs.headquarters as string)
      if (locationText) region = deriveRegionFromKeywords(locationText)
    }

    if (region) {
      regionMap.set(region, (regionMap.get(region) ?? 0) + 1)
    }

    // Company age
    const incDate =
      (attrs.ch_incorporation_date as string) ??
      (attrs.incorporation_date as string) ??
      (attrs.founded_year as string)
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
  }
}
