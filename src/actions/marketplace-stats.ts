"use server"

import { createClient } from "@/lib/supabase/server"

/**
 * @file marketplace-stats.ts
 * @description Server action to compute aggregate marketplace statistics
 * for the analytics dashboard. Reads from marketplace_listings and computes
 * counts by company type, company size, and UK region.
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

// ─── Region Mapping ─────────────────────────────────────────────────────────

// INTENT: Map UK postal code prefixes to broad regions for the regional chart.
// We use the first 1-2 characters of the postal code to determine region.
const POSTCODE_REGION_MAP: Record<string, string> = {
  // London
  E: "London", EC: "London", N: "London", NW: "London",
  SE: "London", SW: "London", W: "London", WC: "London",
  // South East
  BN: "South East", CT: "South East", GU: "South East", HP: "South East",
  ME: "South East", MK: "South East", OX: "South East", PO: "South East",
  RG: "South East", RH: "South East", SL: "South East", SO: "South East",
  TN: "South East", AL: "South East", CM: "South East", CO: "South East",
  DA: "South East", EN: "South East", HA: "South East", IG: "South East",
  KT: "South East", LU: "South East", RM: "South East", SG: "South East",
  SM: "South East", SS: "South East", TW: "South East", UB: "South East",
  WD: "South East", BR: "South East", CR: "South East",
  // South West
  BA: "South West", BH: "South West", BS: "South West", DT: "South West",
  EX: "South West", GL: "South West", PL: "South West", SN: "South West",
  SP: "South West", TA: "South West", TQ: "South West", TR: "South West",
  // Midlands
  B: "Midlands", CV: "Midlands", DE: "Midlands", DY: "Midlands",
  LE: "Midlands", NG: "Midlands", NN: "Midlands", PE: "Midlands",
  ST: "Midlands", TF: "Midlands", WR: "Midlands", WS: "Midlands",
  WV: "Midlands", HR: "Midlands", SY: "Midlands",
  // North West
  BB: "North West", BL: "North West", CA: "North West", CH: "North West",
  CW: "North West", FY: "North West", L: "North West", LA: "North West",
  M: "North West", OL: "North West", PR: "North West", SK: "North West",
  WA: "North West", WN: "North West",
  // North East
  DH: "North East", DL: "North East", NE: "North East", SR: "North East",
  TS: "North East",
  // Yorkshire
  BD: "Yorkshire", DN: "Yorkshire", HD: "Yorkshire", HG: "Yorkshire",
  HU: "Yorkshire", HX: "Yorkshire", LS: "Yorkshire", S: "Yorkshire",
  WF: "Yorkshire", YO: "Yorkshire", LN: "Yorkshire",
  // Scotland
  AB: "Scotland", DD: "Scotland", DG: "Scotland", EH: "Scotland",
  FK: "Scotland", G: "Scotland", HS: "Scotland", IV: "Scotland",
  KA: "Scotland", KW: "Scotland", KY: "Scotland", ML: "Scotland",
  PA: "Scotland", PH: "Scotland", TD: "Scotland", ZE: "Scotland",
  // Wales
  CF: "Wales", LD: "Wales", LL: "Wales", NP: "Wales", SA: "Wales",
  // Northern Ireland
  BT: "Northern Ireland",
}

/**
 * Derive a UK region from a postal code string.
 * Tries 2-char prefix first, then 1-char.
 */
function deriveRegionFromPostcode(postcode: string): string | null {
  const clean = postcode.toUpperCase().replace(/\s+/g, "")
  if (clean.length < 2) return null

  // Try 2-char prefix first (e.g., "NW", "SE", "EC")
  const prefix2 = clean.slice(0, 2)
  if (POSTCODE_REGION_MAP[prefix2]) return POSTCODE_REGION_MAP[prefix2]

  // Fall back to 1-char prefix (e.g., "B", "M", "L")
  const prefix1 = clean[0]
  if (POSTCODE_REGION_MAP[prefix1]) return POSTCODE_REGION_MAP[prefix1]

  return null
}

/**
 * Extract a postal code from an address string.
 * UK postcodes follow the pattern: A9 9AA, A99 9AA, A9A 9AA, AA9 9AA, AA99 9AA, AA9A 9AA
 */
function extractPostcode(address: string): string | null {
  const match = address.match(
    /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i
  )
  return match ? match[1] : null
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

  // ── Compute stats ──────────────────────────────────────────────────────

  const totalListings = allRows.length
  const verifiedCount = allRows.filter((r) => r.is_verified === true).length

  // Company type counts
  const typeCounts = new Map<string, number>()
  for (const row of allRows) {
    const attrs = row.attributes as Record<string, unknown> | null
    const companyType = attrs?.company_type as string | undefined
    if (companyType) {
      typeCounts.set(companyType, (typeCounts.get(companyType) ?? 0) + 1)
    }
  }
  const companyTypeCounts = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }))

  const manufacturingTypes = typeCounts.size

  // Company size counts
  const sizeCounts = new Map<string, number>()
  for (const row of allRows) {
    const attrs = row.attributes as Record<string, unknown> | null
    const size = (attrs?.ch_company_size as string) || (attrs?.company_size as string)
    if (size) {
      sizeCounts.set(size, (sizeCounts.get(size) ?? 0) + 1)
    }
  }
  const companySizeCounts = [...sizeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))

  // Region counts — derive from ch_registered_address postal code or location
  const regionMap = new Map<string, number>()
  for (const row of allRows) {
    const attrs = row.attributes as Record<string, unknown> | null
    if (!attrs) continue

    let region: string | null = null

    // Try ch_registered_address first (has postal code)
    const chAddress = attrs.ch_registered_address as string | undefined
    if (chAddress) {
      const postcode = extractPostcode(chAddress)
      if (postcode) {
        region = deriveRegionFromPostcode(postcode)
      }
    }

    // Fallback: try location attribute
    if (!region) {
      const location = attrs.location as string | undefined
      if (location) {
        const postcode = extractPostcode(location)
        if (postcode) {
          region = deriveRegionFromPostcode(postcode)
        }
      }
    }

    // Fallback: try headquarters
    if (!region) {
      const hq = attrs.headquarters as string | undefined
      if (hq) {
        const postcode = extractPostcode(hq)
        if (postcode) {
          region = deriveRegionFromPostcode(postcode)
        }
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

  // Average company age from incorporation dates
  const currentYear = new Date().getFullYear()
  let totalAge = 0
  let ageCount = 0
  for (const row of allRows) {
    const attrs = row.attributes as Record<string, unknown> | null
    const incDate =
      (attrs?.ch_incorporation_date as string) ??
      (attrs?.incorporation_date as string) ??
      (attrs?.founded_year as string)
    if (incDate) {
      const year = parseInt(incDate.slice(0, 4), 10)
      if (!isNaN(year) && year > 1800 && year <= currentYear) {
        totalAge += currentYear - year
        ageCount++
      }
    }
  }
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
