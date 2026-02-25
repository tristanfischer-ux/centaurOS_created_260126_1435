#!/usr/bin/env npx tsx

/**
 * @file dedup-marketplace-listings.ts
 * @description Deduplicates marketplace_listings by grouping on
 * title.toLowerCase().trim(). For each group with >1 entry, keeps the "best"
 * row (prefer: has ch_company_number > has is_verified=true > most recent
 * updated_at) and deletes the rest.
 *
 * Usage:
 *   npx tsx scripts/dedup-marketplace-listings.ts --dry-run   # preview only
 *   npx tsx scripts/dedup-marketplace-listings.ts              # live run
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
  is_verified: boolean | null
  created_at: string | null
  attributes: Record<string, unknown> | null
}

// ---------------------------------------------------------------------------
// Scoring: higher = better (keep this row)
// ---------------------------------------------------------------------------

function scoreListing(listing: Listing): number {
  let score = 0
  const attrs = listing.attributes

  // Prefer rows with a Companies House number
  if (attrs && typeof attrs.ch_company_number === "string" && attrs.ch_company_number.trim()) {
    score += 1000
  }

  // Prefer verified listings
  if (listing.is_verified === true) {
    score += 100
  }

  // Tie-break: most recent created_at (seconds since epoch / 1e6 to keep numbers manageable)
  if (listing.created_at) {
    const ts = new Date(listing.created_at).getTime()
    if (!isNaN(ts)) {
      score += ts / 1e6
    }
  }

  return score
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    dryRun
      ? "=== DRY RUN — no deletions will be performed ===\n"
      : "=== LIVE RUN — duplicate rows will be DELETED ===\n"
  )

  // Fetch all listings (paginated)
  const PAGE_SIZE = 1000
  let allListings: Listing[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select("id, title, is_verified, created_at, attributes")
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

  // Group by normalized title
  const groups = new Map<string, Listing[]>()
  for (const listing of allListings) {
    const key = (listing.title ?? "").toLowerCase().trim()
    if (!key) continue
    const group = groups.get(key)
    if (group) {
      group.push(listing)
    } else {
      groups.set(key, [listing])
    }
  }

  // Find duplicate groups (>1 entry)
  const dupGroups = [...groups.entries()].filter(([, listings]) => listings.length > 1)
  console.log(`Duplicate title groups: ${dupGroups.length}`)

  let totalDeleted = 0
  const deleteIds: string[] = []

  for (const [title, listings] of dupGroups) {
    // Sort by score descending — keep the first (highest score)
    listings.sort((a, b) => scoreListing(b) - scoreListing(a))
    const keep = listings[0]
    const toDelete = listings.slice(1)

    if (dryRun && toDelete.length > 0) {
      console.log(`  "${title}" — ${listings.length} dupes, keeping ${keep.id}, deleting ${toDelete.length}`)
    }

    for (const dup of toDelete) {
      deleteIds.push(dup.id)
    }
    totalDeleted += toDelete.length
  }

  console.log(`\nTotal rows to delete: ${totalDeleted}`)

  if (!dryRun && deleteIds.length > 0) {
    // Delete in batches of 100
    const BATCH_SIZE = 100
    for (let i = 0; i < deleteIds.length; i += BATCH_SIZE) {
      const batch = deleteIds.slice(i, i + BATCH_SIZE)
      const { error } = await supabase
        .from("marketplace_listings")
        .delete()
        .in("id", batch)

      if (error) {
        console.error(`Error deleting batch at offset ${i}:`, error.message)
      } else {
        console.log(`  Deleted batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} rows)`)
      }
    }
    console.log(`\nDone. Deleted ${deleteIds.length} duplicate rows.`)
  }

  // Final count
  if (!dryRun) {
    const { count, error } = await supabase
      .from("marketplace_listings")
      .select("id", { count: "exact", head: true })

    if (!error && count !== null) {
      console.log(`Remaining listings: ${count}`)
    }
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
