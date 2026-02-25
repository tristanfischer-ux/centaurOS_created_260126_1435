#!/usr/bin/env npx tsx

/**
 * @file fix-placeholder-descriptions.ts
 * @description Finds marketplace listings with placeholder descriptions and
 * regenerates them from their attributes (company type, status, incorporation
 * date, location).
 *
 * Usage:
 *   npx tsx scripts/fix-placeholder-descriptions.ts --dry-run   # preview only
 *   npx tsx scripts/fix-placeholder-descriptions.ts              # live run
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
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Listing {
  id: string
  title: string
  description: string | null
  attributes: Record<string, unknown> | null
}

// ---------------------------------------------------------------------------
// Description generator
// ---------------------------------------------------------------------------

function generateDescription(title: string, attrs: Record<string, unknown> | null): string {
  if (!attrs) return `${title} is a UK-based company listed on the ForgeOS marketplace.`

  const parts: string[] = []

  const status = attrs.ch_company_status as string | undefined
  const companyType = attrs.ch_company_type as string | undefined
  const incDate = attrs.ch_date_of_creation as string | undefined
  const location = (attrs.location as string) ?? (attrs.ch_registered_address as string)
  const mfgType = attrs.company_type as string | undefined

  // Build: "{title} is a {status} {ch_company_type} company"
  if (status || companyType) {
    const statusPart = status ? status.toLowerCase() : ""
    const typePart = companyType ?? ""
    parts.push(`${title} is a ${[statusPart, typePart].filter(Boolean).join(" ")} company`)
  } else {
    parts.push(`${title} is a company`)
  }

  // "incorporated in {date}"
  if (incDate) {
    parts.push(`incorporated in ${incDate}`)
  }

  // "based in {location}"
  if (location) {
    // Trim to city/region (first meaningful part, max 60 chars)
    const shortLocation = location.length > 60 ? location.slice(0, 60).trim() + "..." : location
    parts.push(`based in ${shortLocation}`)
  }

  // "operating in {company_type}"
  if (mfgType) {
    parts.push(`operating in ${mfgType}`)
  }

  return parts.join(", ") + "."
}

// ---------------------------------------------------------------------------
// Placeholder detection
// ---------------------------------------------------------------------------

function isPlaceholder(description: string): boolean {
  const lower = description.toLowerCase()
  return (
    lower.includes("placeholder") ||
    lower.includes("replacing with a distinct entry")
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    dryRun
      ? "=== DRY RUN — no updates will be written ===\n"
      : "=== LIVE RUN — placeholder descriptions will be replaced ===\n"
  )

  // Fetch all listings (paginated)
  const PAGE_SIZE = 1000
  let allListings: Listing[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select("id, title, description, attributes")
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      console.error("Error fetching listings:", error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    allListings = allListings.concat(data as Listing[])
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  console.log(`Total listings fetched: ${allListings.length}`)

  // Filter to those with placeholder descriptions
  const placeholders = allListings.filter(
    (l) => l.description && isPlaceholder(l.description)
  )

  console.log(`Listings with placeholder descriptions: ${placeholders.length}`)

  if (placeholders.length === 0) {
    console.log("No placeholder descriptions found. Nothing to do.")
    return
  }

  let updated = 0

  for (const listing of placeholders) {
    const newDesc = generateDescription(listing.title, listing.attributes)

    if (dryRun) {
      console.log(`  [${listing.id}] "${listing.title}"`)
      console.log(`    OLD: ${listing.description?.slice(0, 80)}...`)
      console.log(`    NEW: ${newDesc.slice(0, 80)}...`)
    } else {
      const { error } = await supabase
        .from("marketplace_listings")
        .update({ description: newDesc })
        .eq("id", listing.id)

      if (error) {
        console.error(`  Error updating ${listing.id}:`, error.message)
      } else {
        updated++
      }
    }
  }

  console.log(`\n${dryRun ? "Would update" : "Updated"}: ${dryRun ? placeholders.length : updated} listings`)
}

main().catch((err) => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
