#!/usr/bin/env npx tsx

/**
 * discover-manufacturers-by-sic.ts
 * =================================
 * Uses the Companies House Advanced Search API to discover real active UK
 * manufacturers by SIC code, then inserts them into marketplace_listings.
 *
 * Usage:
 *   npx tsx scripts/discover-manufacturers-by-sic.ts
 *   npx tsx scripts/discover-manufacturers-by-sic.ts --dry-run
 *   npx tsx scripts/discover-manufacturers-by-sic.ts --sic-code 25620
 *   npx tsx scripts/discover-manufacturers-by-sic.ts --limit 5
 *   npx tsx scripts/discover-manufacturers-by-sic.ts --dry-run --sic-code 25620 --limit 3
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and COMPANIES_HOUSE_API_KEY
 *   must be set. These are loaded from .env.local automatically if present.
 */

import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------
const __dirname_compat = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname_compat, "../.env.local")
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const [key, ...rest] = trimmed.split("=")
    const val = rest.join("=").replace(/^['"]|['"]$/g, "")
    if (key && !(key in process.env)) {
      process.env[key.trim()] = val.trim()
    }
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const COMPANIES_HOUSE_API_KEY = process.env.COMPANIES_HOUSE_API_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

if (!COMPANIES_HOUSE_API_KEY) {
  console.error("Missing COMPANIES_HOUSE_API_KEY in .env.local")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CH_BASE = "https://api.company-information.service.gov.uk"
const CH_AUTH = Buffer.from(`${COMPANIES_HOUSE_API_KEY}:`).toString("base64")
const BATCH_SIZE = 100

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")

const sicCodeIdx = args.indexOf("--sic-code")
const SINGLE_SIC = sicCodeIdx !== -1 ? args[sicCodeIdx + 1] : null

const limitIdx = args.indexOf("--limit")
const LIMIT_OVERRIDE = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null

// ---------------------------------------------------------------------------
// Target SIC codes
// ---------------------------------------------------------------------------
interface SicTarget {
  code: string
  description: string
  subcategory: string
  companyType: string
  target: number
}

const SIC_TARGETS: SicTarget[] = [
  { code: "25620", description: "Machining", subcategory: "Manufacturer", companyType: "CNC Machining", target: 20 },
  { code: "25110", description: "Metal structures", subcategory: "Manufacturer", companyType: "Structural Steel", target: 15 },
  { code: "22210", description: "Plastic plates/sheets", subcategory: "Manufacturer", companyType: "Plastics Manufacturing", target: 10 },
  { code: "25730", description: "Tool manufacture", subcategory: "Manufacturer", companyType: "Toolmaking", target: 15 },
  { code: "24200", description: "Steel tubes/pipes", subcategory: "Manufacturer", companyType: "Steel Manufacturing", target: 10 },
  { code: "22190", description: "Other rubber products", subcategory: "Manufacturer", companyType: "Rubber Moulding", target: 10 },
  { code: "25500", description: "Forging/pressing/stamping", subcategory: "Manufacturer", companyType: "Forging & Pressing", target: 10 },
  { code: "17210", description: "Corrugated paper/packaging", subcategory: "Manufacturer", companyType: "Packaging Manufacturing", target: 15 },
  { code: "13100", description: "Textile fibre preparation", subcategory: "Manufacturer", companyType: "Textile Manufacturing", target: 10 },
  { code: "26110", description: "Electronic components", subcategory: "Manufacturer", companyType: "Electronics Manufacturing", target: 10 },
  { code: "71200", description: "Technical testing/analysis", subcategory: "Manufacturer", companyType: "Metrology & Testing", target: 15 },
  { code: "25610", description: "Treatment/coating of metals", subcategory: "Manufacturer", companyType: "Surface Treatment & Finishing", target: 15 },
  { code: "23190", description: "Glass products", subcategory: "Manufacturer", companyType: "Glass Manufacturing", target: 10 },
  { code: "23440", description: "Ceramic products", subcategory: "Manufacturer", companyType: "Ceramics Manufacturing", target: 10 },
]

// ---------------------------------------------------------------------------
// Companies House accounts type -> company size mapping
// FLOW: Same mapping as patch-company-size.ts
// ---------------------------------------------------------------------------
const ACCOUNT_TYPE_TO_SIZE: Record<string, string> = {
  "micro-entity": "Micro",
  "total-exemption-full": "Micro",

  small: "Small",
  "total-exemption-small": "Small",
  "unaudited-abridged": "Small",
  "audit-exemption-subsidiary": "Small",
  "filing-exemption-subsidiary": "Small",

  medium: "Medium",
  "partial-exemption": "Medium",
  "audited-abridged": "Medium",

  full: "Large",
  group: "Large",

  dormant: "Dormant",
}

function mapAccountTypeToSize(accountType: string | undefined | null): string {
  if (!accountType) return "Unknown"
  return ACCOUNT_TYPE_TO_SIZE[accountType] ?? "Unknown"
}

// ---------------------------------------------------------------------------
// Companies House API helpers
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface CHAdvancedSearchResult {
  company_name: string
  company_number: string
  company_status: string
  company_type: string
  registered_office_address?: {
    address_line_1?: string
    address_line_2?: string
    locality?: string
    region?: string
    postal_code?: string
    country?: string
  }
  date_of_creation?: string
  sic_codes?: string[]
}

interface CHAdvancedSearchResponse {
  items?: CHAdvancedSearchResult[]
  total_results?: number
}

interface CHCompanyProfile {
  company_name: string
  company_number: string
  company_status: string
  type: string
  date_of_creation?: string
  registered_office_address?: {
    address_line_1?: string
    address_line_2?: string
    locality?: string
    region?: string
    postal_code?: string
    country?: string
  }
  sic_codes?: string[]
  accounts?: {
    last_accounts?: {
      type?: string
    }
  }
}

/**
 * Search the CH Advanced Search API for active companies with a given SIC code.
 */
async function searchBySicCode(
  sicCode: string,
  limit: number
): Promise<CHAdvancedSearchResult[]> {
  const url = new URL(`${CH_BASE}/advanced-search/companies`)
  url.searchParams.set("sic_codes", sicCode)
  url.searchParams.set("company_status", "active")
  url.searchParams.set("size", String(Math.min(limit, 100)))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${CH_AUTH}` },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(
      `CH Advanced Search failed: HTTP ${res.status} ${res.statusText} — ${body}`
    )
  }

  const data: CHAdvancedSearchResponse = await res.json()
  return data.items ?? []
}

/**
 * Fetch the full company profile from Companies House.
 */
async function fetchCompanyProfile(
  companyNumber: string
): Promise<CHCompanyProfile | null> {
  const res = await fetch(`${CH_BASE}/company/${companyNumber}`, {
    headers: { Authorization: `Basic ${CH_AUTH}` },
  })

  if (!res.ok) {
    console.warn(
      `    [WARN] Failed to fetch profile for ${companyNumber}: HTTP ${res.status}`
    )
    return null
  }

  return (await res.json()) as CHCompanyProfile
}

// ---------------------------------------------------------------------------
// Filtering helpers
// ---------------------------------------------------------------------------

/**
 * INTENT: Only include ltd/plc companies — filter out LLPs, partnerships,
 * overseas entities, etc. that aren't relevant for manufacturer discovery.
 */
function isLtdOrPlc(companyType: string): boolean {
  const normalised = companyType.toLowerCase()
  return (
    normalised.includes("ltd") ||
    normalised.includes("limited") ||
    normalised.includes("plc") ||
    normalised === "private-limited-guarant-nsc" ||
    normalised === "private-limited-guarant-nsc-limited-exemption" ||
    normalised === "private-limited-shares-section-30-exemption"
  )
}

function hasRegisteredAddress(
  address: CHAdvancedSearchResult["registered_office_address"]
): boolean {
  if (!address) return false
  // At minimum, must have a postal code or locality
  return !!(address.postal_code || address.locality)
}

// ---------------------------------------------------------------------------
// Build listing from company profile
// ---------------------------------------------------------------------------
function formatAddress(
  address: CHCompanyProfile["registered_office_address"]
): string {
  if (!address) return ""
  const parts = [
    address.address_line_1,
    address.address_line_2,
    address.locality,
    address.region,
    address.postal_code,
    address.country,
  ].filter(Boolean)
  return parts.join(", ")
}

function buildListing(
  profile: CHCompanyProfile,
  sicTarget: SicTarget
): Record<string, unknown> {
  const addr = profile.registered_office_address
  const locality = addr?.locality ?? addr?.region ?? "the UK"
  const postalCode = addr?.postal_code ?? ""
  const accountType = profile.accounts?.last_accounts?.type ?? null
  const chCompanySize = mapAccountTypeToSize(accountType)

  const locationParts = [locality, postalCode].filter(Boolean).join(", ")

  const description = `${profile.company_name} is a ${profile.company_status} company based in ${locationParts}, operating in ${sicTarget.description}. Incorporated ${profile.date_of_creation ?? "N/A"}.`

  const attributes: Record<string, unknown> = {
    company_type: sicTarget.companyType,
    location: locationParts,
    ch_company_number: profile.company_number,
    ch_company_status: profile.company_status,
    ch_registered_address: formatAddress(addr),
    ch_incorporation_date: profile.date_of_creation ?? null,
    ch_company_size: chCompanySize,
    data_source: "companies_house_sic_discovery",
  }

  return {
    title: profile.company_name,
    category: "Products",
    subcategory: sicTarget.subcategory,
    description,
    attributes,
    is_demo: true,
    verification_tier: "claimed",
    is_verified: true,
    image_url: null,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=".repeat(60))
  console.log("Discover UK Manufacturers by SIC Code")
  console.log("=".repeat(60))
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`)
  if (SINGLE_SIC) console.log(`SIC filter: ${SINGLE_SIC}`)
  if (LIMIT_OVERRIDE) console.log(`Limit override: ${LIMIT_OVERRIDE} per SIC code`)
  console.log()

  // -------------------------------------------------------------------------
  // 1. Load existing Products listings for duplicate checking
  // -------------------------------------------------------------------------
  console.log("Loading existing Products listings for duplicate check...")
  const existingTitles = new Set<string>()
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select("title")
      .eq("category", "Products")
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error("Failed to fetch existing listings:", error.message)
      process.exit(1)
    }

    if (!data || data.length === 0) break
    for (const row of data) {
      existingTitles.add(row.title.toLowerCase().trim())
    }
    if (data.length < pageSize) break
    offset += pageSize
  }

  console.log(`  Existing Products listings: ${existingTitles.size}`)
  console.log()

  // -------------------------------------------------------------------------
  // 2. Filter SIC targets
  // -------------------------------------------------------------------------
  const targets = SINGLE_SIC
    ? SIC_TARGETS.filter((t) => t.code === SINGLE_SIC)
    : SIC_TARGETS

  if (targets.length === 0) {
    console.error(`No SIC target found for code: ${SINGLE_SIC}`)
    process.exit(1)
  }

  // -------------------------------------------------------------------------
  // 3. Process each SIC code
  // -------------------------------------------------------------------------
  const allToInsert: Record<string, unknown>[] = []
  let totalSearched = 0
  let totalFiltered = 0
  let totalDuplicates = 0
  let totalProfileErrors = 0

  for (const sicTarget of targets) {
    const targetLimit = LIMIT_OVERRIDE ?? sicTarget.target

    console.log("-".repeat(60))
    console.log(
      `SIC ${sicTarget.code}: ${sicTarget.description} (${sicTarget.companyType})`
    )
    console.log(`  Target: ${targetLimit} companies`)

    // 3a. Search CH Advanced Search API
    let results: CHAdvancedSearchResult[]
    try {
      results = await searchBySicCode(sicTarget.code, targetLimit)
    } catch (err) {
      console.error(`  ERROR searching SIC ${sicTarget.code}:`, err)
      continue
    }

    console.log(`  CH results: ${results.length}`)
    totalSearched += results.length

    // 3b. Filter: ltd/plc only, must have registered address
    const filtered = results.filter(
      (r) => isLtdOrPlc(r.company_type) && hasRegisteredAddress(r.registered_office_address)
    )

    console.log(`  After filter (ltd/plc + address): ${filtered.length}`)
    totalFiltered += results.length - filtered.length

    // 3c. For each result, fetch full profile and build listing
    let added = 0
    let duplicates = 0
    let profileErrors = 0

    for (const result of filtered) {
      if (added >= targetLimit) break

      // Check for duplicate by title (case-insensitive)
      const titleKey = result.company_name.toLowerCase().trim()
      if (existingTitles.has(titleKey)) {
        duplicates++
        continue
      }

      // Rate limit: 0.12s between CH API calls (600 req/min)
      await sleep(120)

      // Fetch full company profile
      const profile = await fetchCompanyProfile(result.company_number)
      if (!profile) {
        profileErrors++
        continue
      }

      const listing = buildListing(profile, sicTarget)

      // Also check the newly-added titles to avoid duplicates within this run
      if (existingTitles.has(titleKey)) {
        duplicates++
        continue
      }

      allToInsert.push(listing)
      existingTitles.add(titleKey) // Prevent intra-run duplicates
      added++
    }

    totalDuplicates += duplicates
    totalProfileErrors += profileErrors

    console.log(
      `  Added: ${added}  Duplicates: ${duplicates}  Profile errors: ${profileErrors}`
    )
  }

  // -------------------------------------------------------------------------
  // 4. Insert into marketplace_listings
  // -------------------------------------------------------------------------
  console.log()
  console.log("=".repeat(60))
  console.log(`Total listings to insert: ${allToInsert.length}`)
  console.log("=".repeat(60))

  if (allToInsert.length === 0) {
    console.log("Nothing to insert.")
  } else if (DRY_RUN) {
    console.log()
    console.log("[DRY RUN] Sample listings (first 5):")
    for (const listing of allToInsert.slice(0, 5)) {
      const attrs = listing.attributes as Record<string, unknown>
      console.log(
        `  ${listing.title} | ${attrs.company_type} | ${attrs.location} | size=${attrs.ch_company_size}`
      )
    }
    console.log()
    console.log("[DRY RUN] No rows were inserted.")
  } else {
    console.log()
    let inserted = 0
    let failed = 0

    for (let i = 0; i < allToInsert.length; i += BATCH_SIZE) {
      const batch = allToInsert.slice(i, i + BATCH_SIZE)
      const { error } = await supabase
        .from("marketplace_listings")
        .insert(batch)

      if (error) {
        console.error(
          `  Batch ${Math.floor(i / BATCH_SIZE) + 1} error: ${error.message}`
        )
        // Retry individually
        for (const item of batch) {
          const { error: singleErr } = await supabase
            .from("marketplace_listings")
            .insert(item)
          if (singleErr) {
            console.error(`    Failed: ${item.title} — ${singleErr.message}`)
            failed++
          } else {
            inserted++
          }
        }
      } else {
        inserted += batch.length
      }

      process.stdout.write(
        `\r  Progress: ${Math.min(i + BATCH_SIZE, allToInsert.length)}/${allToInsert.length}`
      )
    }
    console.log()
    console.log(`  Inserted: ${inserted}  Failed: ${failed}`)
  }

  // -------------------------------------------------------------------------
  // 5. Summary
  // -------------------------------------------------------------------------
  console.log()
  console.log("=".repeat(60))
  console.log("Discovery Summary")
  console.log("=".repeat(60))
  console.log(`SIC codes processed:     ${targets.length}`)
  console.log(`CH results searched:     ${totalSearched}`)
  console.log(`Filtered out:            ${totalFiltered}`)
  console.log(`Duplicates skipped:      ${totalDuplicates}`)
  console.log(`Profile fetch errors:    ${totalProfileErrors}`)
  console.log(`Listings to insert:      ${allToInsert.length}`)
  console.log()

  if (DRY_RUN) {
    console.log("Dry run complete — no changes were written.")
  } else {
    console.log("Done.")
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
