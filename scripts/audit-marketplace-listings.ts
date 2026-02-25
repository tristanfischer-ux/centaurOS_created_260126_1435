#!/usr/bin/env npx tsx

/**
 * audit-marketplace-listings.ts
 * =============================
 * Reporting script that queries marketplace_listings and prints summary stats:
 *   - Total count
 *   - Count by category
 *   - Count by subcategory
 *   - Count by is_verified status
 *   - Count of listings with companies_house_number in attributes
 *   - Count by company_type attribute (top 10)
 *
 * Usage:
 *   npx tsx scripts/audit-marketplace-listings.ts
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.
 *   These are loaded from .env.local automatically if present.
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

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function printSection(title: string) {
  console.log()
  console.log("-".repeat(60))
  console.log(title)
  console.log("-".repeat(60))
}

function printTable(rows: [string, number][], label: string = "Count") {
  if (rows.length === 0) {
    console.log("  (none)")
    return
  }
  const maxKeyLen = Math.max(...rows.map(([k]) => k.length), label.length)
  for (const [key, count] of rows) {
    console.log(`  ${key.padEnd(maxKeyLen + 2)} ${count}`)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=".repeat(60))
  console.log("Marketplace Listings Audit Report")
  console.log("=".repeat(60))
  console.log(`Generated: ${new Date().toISOString()}`)

  // -------------------------------------------------------------------------
  // 1. Total count
  // -------------------------------------------------------------------------
  const { count: totalCount, error: totalErr } = await supabase
    .from("marketplace_listings")
    .select("*", { count: "exact", head: true })

  if (totalErr) {
    console.error("Failed to fetch total count:", totalErr.message)
    process.exit(1)
  }

  printSection("1. Total Listings")
  console.log(`  ${totalCount ?? 0}`)

  // -------------------------------------------------------------------------
  // 2. Fetch all listings (id, category, subcategory, is_verified, attributes)
  //    We need to paginate since Supabase default limit is 1000
  // -------------------------------------------------------------------------
  const allListings: {
    id: string
    category: string | null
    subcategory: string | null
    is_verified: boolean | null
    attributes: Record<string, unknown> | null
  }[] = []

  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select("id, category, subcategory, is_verified, attributes")
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error("Failed to fetch listings:", error.message)
      process.exit(1)
    }

    if (!data || data.length === 0) break
    allListings.push(...data)
    if (data.length < pageSize) break
    offset += pageSize
  }

  console.log(`  (fetched ${allListings.length} rows for analysis)`)

  // -------------------------------------------------------------------------
  // 3. Count by category
  // -------------------------------------------------------------------------
  const categoryCounts = new Map<string, number>()
  for (const listing of allListings) {
    const cat = listing.category || "(null)"
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1)
  }

  printSection("2. Count by Category")
  const categoryRows = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])
  printTable(categoryRows)

  // -------------------------------------------------------------------------
  // 4. Count by subcategory
  // -------------------------------------------------------------------------
  const subcategoryCounts = new Map<string, number>()
  for (const listing of allListings) {
    const sub = listing.subcategory || "(null)"
    subcategoryCounts.set(sub, (subcategoryCounts.get(sub) ?? 0) + 1)
  }

  printSection("3. Count by Subcategory")
  const subcategoryRows = [...subcategoryCounts.entries()].sort((a, b) => b[1] - a[1])
  printTable(subcategoryRows)

  // -------------------------------------------------------------------------
  // 5. Count by is_verified status
  // -------------------------------------------------------------------------
  const verifiedCounts = new Map<string, number>()
  for (const listing of allListings) {
    const key =
      listing.is_verified === true
        ? "verified"
        : listing.is_verified === false
          ? "unverified"
          : "(null)"
    verifiedCounts.set(key, (verifiedCounts.get(key) ?? 0) + 1)
  }

  printSection("4. Count by is_verified Status")
  const verifiedRows = [...verifiedCounts.entries()].sort((a, b) => b[1] - a[1])
  printTable(verifiedRows)

  // -------------------------------------------------------------------------
  // 6. Count of listings with companies_house_number in attributes
  // -------------------------------------------------------------------------
  let withCHNumber = 0
  for (const listing of allListings) {
    const attrs = listing.attributes as Record<string, unknown> | null
    if (attrs && attrs.companies_house_number != null && attrs.companies_house_number !== "") {
      withCHNumber++
    }
  }

  // INTENT: Also verify via direct DB query for accuracy
  const { count: chCount } = await supabase
    .from("marketplace_listings")
    .select("*", { count: "exact", head: true })
    .not("attributes->>companies_house_number", "is", null)

  printSection("5. Listings with companies_house_number")
  console.log(`  In-memory count:  ${withCHNumber}`)
  console.log(`  DB query count:   ${chCount ?? "N/A"}`)

  // -------------------------------------------------------------------------
  // 7. Count by company_type attribute
  // -------------------------------------------------------------------------
  const companyTypeCounts = new Map<string, number>()
  for (const listing of allListings) {
    const attrs = listing.attributes as Record<string, unknown> | null
    const companyType = attrs?.company_type as string | null | undefined
    if (companyType) {
      companyTypeCounts.set(companyType, (companyTypeCounts.get(companyType) ?? 0) + 1)
    }
  }

  printSection("6. Count by company_type Attribute (All)")
  const companyTypeRows = [...companyTypeCounts.entries()].sort((a, b) => b[1] - a[1])
  printTable(companyTypeRows)

  // -------------------------------------------------------------------------
  // 8. Top 10 company types
  // -------------------------------------------------------------------------
  printSection("7. Top 10 Company Types")
  const top10 = companyTypeRows.slice(0, 10)
  printTable(top10)

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log()
  console.log("=".repeat(60))
  console.log("Audit Complete")
  console.log("=".repeat(60))
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
