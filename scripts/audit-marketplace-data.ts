#!/usr/bin/env npx tsx

/**
 * audit-marketplace-data.ts
 * =========================
 * Reports attribute completeness across all marketplace listings.
 * Outputs: field population rates, most/least populated listings,
 * stored-but-hidden fields. Informational only — no mutations.
 *
 * Usage:
 *   npx tsx scripts/audit-marketplace-data.ts
 *   npx tsx scripts/audit-marketplace-data.ts --top 20
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Parse --top N flag
const topN = (() => {
  const idx = process.argv.indexOf("--top")
  return idx !== -1 && process.argv[idx + 1] ? parseInt(process.argv[idx + 1], 10) : 10
})()

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=".repeat(60))
  console.log("Marketplace Data Quality Audit")
  console.log("=".repeat(60))

  // Fetch all listings
  const allListings: { id: string; title: string; category: string; attributes: Record<string, unknown> | null }[] = []
  let cursor = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select("id, title, category, attributes")
      .range(cursor, cursor + pageSize - 1)

    if (error) {
      console.error("Query error:", error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    allListings.push(...data)
    if (data.length < pageSize) break
    cursor += pageSize
  }

  console.log(`\nTotal listings: ${allListings.length}\n`)

  if (allListings.length === 0) {
    console.log("No listings found.")
    return
  }

  // Count field populations
  const fieldCounts = new Map<string, number>()
  const listingFieldCounts: { id: string; title: string; count: number }[] = []

  for (const listing of allListings) {
    const attrs = listing.attributes ?? {}
    let count = 0
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === "") continue
      if (Array.isArray(value) && value.length === 0) continue
      count++
      fieldCounts.set(key, (fieldCounts.get(key) || 0) + 1)
    }
    listingFieldCounts.push({ id: listing.id, title: listing.title, count })
  }

  // Sort fields by population rate
  const sortedFields = [...fieldCounts.entries()].sort((a, b) => b[1] - a[1])
  const total = allListings.length

  console.log("─".repeat(60))
  console.log("FIELD POPULATION RATES")
  console.log("─".repeat(60))
  console.log(
    `${"Field".padEnd(35)} ${"Count".padStart(6)} ${"Rate".padStart(7)}`
  )
  console.log("─".repeat(60))

  for (const [field, count] of sortedFields) {
    const pct = ((count / total) * 100).toFixed(1)
    console.log(`${field.padEnd(35)} ${String(count).padStart(6)} ${(pct + "%").padStart(7)}`)
  }

  // Category breakdown
  const categories = new Map<string, number>()
  for (const l of allListings) {
    categories.set(l.category, (categories.get(l.category) || 0) + 1)
  }

  console.log(`\n${"─".repeat(60)}`)
  console.log("CATEGORY BREAKDOWN")
  console.log("─".repeat(60))
  for (const [cat, count] of [...categories.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(20)} ${count}`)
  }

  // Most populated listings
  listingFieldCounts.sort((a, b) => b.count - a.count)
  console.log(`\n${"─".repeat(60)}`)
  console.log(`TOP ${topN} MOST POPULATED LISTINGS`)
  console.log("─".repeat(60))
  for (const l of listingFieldCounts.slice(0, topN)) {
    console.log(`  [${l.count} fields] ${l.title.slice(0, 50)}`)
  }

  // Least populated listings
  listingFieldCounts.sort((a, b) => a.count - b.count)
  console.log(`\n${"─".repeat(60)}`)
  console.log(`TOP ${topN} LEAST POPULATED LISTINGS`)
  console.log("─".repeat(60))
  for (const l of listingFieldCounts.slice(0, topN)) {
    console.log(`  [${l.count} fields] ${l.title.slice(0, 50)}`)
  }

  // CH enrichment coverage
  const chFields = ["ch_company_number", "ch_company_status", "ch_registered_address", "ch_incorporation_date", "ch_company_size", "ch_directors", "ch_psc", "ch_sic_codes", "ch_company_type"]
  console.log(`\n${"─".repeat(60)}`)
  console.log("COMPANIES HOUSE ENRICHMENT COVERAGE")
  console.log("─".repeat(60))
  for (const field of chFields) {
    const count = fieldCounts.get(field) || 0
    const pct = ((count / total) * 100).toFixed(1)
    console.log(`  ${field.padEnd(30)} ${String(count).padStart(6)} / ${total} (${pct}%)`)
  }

  // Summary stats
  const avgFields = listingFieldCounts.reduce((s, l) => s + l.count, 0) / total
  const medianIdx = Math.floor(listingFieldCounts.length / 2)
  const medianFields = listingFieldCounts[medianIdx].count

  console.log(`\n${"─".repeat(60)}`)
  console.log("SUMMARY")
  console.log("─".repeat(60))
  console.log(`  Total listings:     ${total}`)
  console.log(`  Unique fields:      ${fieldCounts.size}`)
  console.log(`  Avg fields/listing: ${avgFields.toFixed(1)}`)
  console.log(`  Median fields:      ${medianFields}`)
  console.log(`  Max fields:         ${listingFieldCounts[listingFieldCounts.length - 1].count}`)
  console.log(`  Min fields:         ${listingFieldCounts[0].count}`)
  console.log()
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
