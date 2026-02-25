"use server"

import { unstable_cache } from 'next/cache'
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  extractPostcode,
  deriveRegionFromPostcode,
  deriveRegionFromKeywords,
} from "@/lib/postcode-utils"
import type { MarketplaceStats } from "./marketplace-stats"

/**
 * @file recruits-stats.ts
 * @description Server action to compute aggregate statistics for the Recruits
 * (People) page. Queries marketplace_listings WHERE category = 'People' and
 * returns the same MarketplaceStats shape used by MarketplaceStatsSection.
 *
 * FLOW: Called from recruits/page.tsx → passed as `stats` prop to MarketplaceBrowse.
 */

/**
 * Compute aggregate recruits statistics for the analytics dashboard.
 *
 * @description Fetches all People listings and computes stats reusing the
 * shared `MarketplaceStats` shape. Field name mappings for the Recruits context:
 *
 * | MarketplaceStats field | Recruits meaning                          | StatsLabels key        |
 * |------------------------|-------------------------------------------|------------------------|
 * | `totalListings`        | Total talent (people count)               | "Total Talent"         |
 * | `verifiedCount`        | Verified talent count                     | KPI 2                  |
 * | `manufacturingTypes`   | Distinct specialization count             | "Specializations"      |
 * | `companyTypeCounts`    | Subcategory (specialization) distribution | "Specialization Dist." |
 * | `companySizeCounts`    | Availability breakdown (FT/PT/Contract)   | "Availability"         |
 * | `regionCounts`         | UK regional coverage from postcodes       | "Regional Coverage"    |
 * | `avgCompanyAge`        | Unused — always null for People           | —                      |
 *
 * @returns MarketplaceStats or null on error
 */
export async function getRecruitsStats(): Promise<MarketplaceStats | null> {
  const supabase = await createClient()

  // AUTH: Require authenticated user before querying listings
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  return getCachedRecruitsStats()
}

// DECISION: Using admin client (service role) for the cached function because
// unstable_cache can revalidate during a different user's request. RLS would
// reject the query if user B's cookies triggered revalidation of user A's cache.
// Safe because auth is verified in getRecruitsStats() before calling this.
const fetchRecruitsStats = async (): Promise<MarketplaceStats | null> => {
  const supabase = createAdminClient()

  // Paginate to handle large datasets
  const allRows: {
    is_verified: boolean | null
    subcategory: string | null
    attributes: unknown
  }[] = []
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select("is_verified, subcategory, attributes")
      .eq("category", "People")
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error("[getRecruitsStats] Query failed:", error.message)
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

  const totalListings = allRows.length
  const verifiedCount = allRows.filter((r) => r.is_verified === true).length

  // Subcategory (specialization) distribution → maps to companyTypeCounts
  const subcatCounts = new Map<string, number>()
  for (const row of allRows) {
    const sub = row.subcategory
    if (sub) {
      subcatCounts.set(sub, (subcatCounts.get(sub) ?? 0) + 1)
    }
  }
  const companyTypeCounts = [...subcatCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }))

  // manufacturingTypes → distinct specialization count
  const manufacturingTypes = subcatCounts.size

  // Availability breakdown → maps to companySizeCounts
  const availCounts = new Map<string, number>()
  for (const row of allRows) {
    const attrs = row.attributes as Record<string, unknown> | null
    const avail = attrs?.availability as string | undefined
    if (avail) {
      availCounts.set(avail, (availCounts.get(avail) ?? 0) + 1)
    }
  }
  const companySizeCounts = [...availCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))

  // Regional coverage — derive from postcode in attributes
  const regionMap = new Map<string, number>()
  for (const row of allRows) {
    const attrs = row.attributes as Record<string, unknown> | null
    if (!attrs) continue

    let region: string | null = null

    // Try location attribute first
    const location = attrs.location as string | undefined
    if (location) {
      const postcode = extractPostcode(location)
      if (postcode) {
        region = deriveRegionFromPostcode(postcode)
      }
    }

    // Fallback: try ch_registered_address
    if (!region) {
      const chAddress = attrs.ch_registered_address as string | undefined
      if (chAddress) {
        const postcode = extractPostcode(chAddress)
        if (postcode) {
          region = deriveRegionFromPostcode(postcode)
        }
      }
    }

    // Fallback: keyword-based matching on any location-like field
    if (!region) {
      const locationText = (attrs.location as string)
        ?? (attrs.ch_registered_address as string)
      if (locationText) {
        region = deriveRegionFromKeywords(locationText)
      }
    }

    if (region) {
      regionMap.set(region, (regionMap.get(region) ?? 0) + 1)
    }
  }
  const regionCounts = [...regionMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))

  const regionCount = regionMap.size

  return {
    totalListings,
    verifiedCount,
    manufacturingTypes,
    regionCount,
    companyTypeCounts,
    companySizeCounts,
    regionCounts,
    avgCompanyAge: null,
  }
}

/** Cached recruits stats — 5 minute TTL, shared across all users. */
const getCachedRecruitsStats = unstable_cache(
  fetchRecruitsStats,
  ['recruits-stats'],
  { revalidate: 300, tags: ['recruits-stats'] }
)
