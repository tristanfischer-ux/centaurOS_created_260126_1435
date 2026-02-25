#!/usr/bin/env npx tsx
/**
 * import-vcpe-to-marketplace.ts
 * ==============================
 * Reads output/uk_vcpe_firms_enriched.csv and upserts into:
 *   - public.marketplace_listings  (Finance category, VC/PE firms)
 *   - public.vc_pe_contacts        (contacts from output/uk_vcpe_contacts.csv)
 *
 * Usage:
 *   npx tsx scripts/import-vcpe-to-marketplace.ts
 *   npx tsx scripts/import-vcpe-to-marketplace.ts --dry-run
 *   npx tsx scripts/import-vcpe-to-marketplace.ts --firms-only
 *   npx tsx scripts/import-vcpe-to-marketplace.ts --contacts-only
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

const FIRMS_CSV = resolve(__dirname_compat, "../output/uk_vcpe_firms_enriched.csv")
const CONTACTS_CSV = resolve(__dirname_compat, "../output/uk_vcpe_contacts.csv")
const BATCH_SIZE = 100

// ---------------------------------------------------------------------------
// Member type → subcategory + is_investor
// ---------------------------------------------------------------------------
// INTENT: Maps UKPC member types (from profile pages) to our internal subcategory.
// The 'sectors' column from the scraped CSV uses UKPC tags like "UK General Partner"
// which we also map here as a fallback.
const TYPE_MAP: Record<string, { subcategory: string; isInvestor: boolean }> = {
  // Profile page "Member type" values — singular and plural variants both mapped
  "UK General Partner":           { subcategory: "Venture Capital / Private Equity", isInvestor: true },
  "UK General Partners":          { subcategory: "Venture Capital / Private Equity", isInvestor: true },
  "Overseas General Partner":     { subcategory: "Venture Capital / Private Equity", isInvestor: true },
  "Emerging Manager":             { subcategory: "Venture Capital", isInvestor: true },
  "First Time Fund Manager":      { subcategory: "Venture Capital", isInvestor: true },
  "Third-party Fund Manager":     { subcategory: "Venture Capital / Private Equity", isInvestor: true },
  "Corporate Venturers":          { subcategory: "Corporate Venture Capital", isInvestor: true },
  "Corporate Venture":            { subcategory: "Corporate Venture Capital", isInvestor: true },
  "Direct Investors":             { subcategory: "Family Office", isInvestor: true },
  "Direct Investor":              { subcategory: "Family Office", isInvestor: true },
  "Private Credit":               { subcategory: "Private Credit", isInvestor: true },
  "Impact Investment Fund":       { subcategory: "Impact / ESG", isInvestor: true },
  "Accelerator":                  { subcategory: "Accelerator", isInvestor: true },
  "Investee Company":             { subcategory: "Portfolio Company", isInvestor: false },
  "Professional Services":        { subcategory: "Advisory Services", isInvestor: false },
  "Law Firms":                    { subcategory: "Legal Services", isInvestor: false },
  "Financial Institutions":       { subcategory: "Financial Institution", isInvestor: false },
  "Financial Institution":        { subcategory: "Financial Institution", isInvestor: false },
  "Limited Partners":             { subcategory: "Institutional Investor", isInvestor: false },
  "Institutional Investor":       { subcategory: "Institutional Investor", isInvestor: false },
  "Academic Institutions":        { subcategory: "Academic", isInvestor: false },
  "Academic Institution":         { subcategory: "Academic", isInvestor: false },
  "Honorary":                     { subcategory: "Advisory Services", isInvestor: false },
  // firm_type column fallbacks (from original scraper classification)
  "VC":          { subcategory: "Venture Capital", isInvestor: true },
  "PE":          { subcategory: "Private Equity", isInvestor: true },
  "Growth":      { subcategory: "Growth Equity", isInvestor: true },
  "Debt":        { subcategory: "Private Credit", isInvestor: true },
  "CVC":         { subcategory: "Corporate Venture Capital", isInvestor: true },
  "VCT":         { subcategory: "Venture Capital Trust", isInvestor: true },
  "VC/PE":       { subcategory: "Venture Capital / Private Equity", isInvestor: true },
}

function classifyFirm(row: Record<string, string>): { subcategory: string; isInvestor: boolean } {
  // Priority 1: member_type from profile scrape
  const memberType = row.member_type?.trim()
  if (memberType && TYPE_MAP[memberType]) {
    return TYPE_MAP[memberType]
  }

  // Priority 2: sectors field contains UKPC tags (e.g. "UK General Partner, Venture Capital")
  const sectors = row.sectors || ""
  for (const [key, val] of Object.entries(TYPE_MAP)) {
    if (sectors.toLowerCase().includes(key.toLowerCase())) {
      return val
    }
  }

  // Priority 3: firm_type column
  const firmType = row.firm_type?.trim()
  if (firmType && TYPE_MAP[firmType]) {
    return TYPE_MAP[firmType]
  }

  // Default: treat as investor (VC/PE is the primary source)
  return { subcategory: "Venture Capital / Private Equity", isInvestor: true }
}

// ---------------------------------------------------------------------------
// CSV parser (no external deps — handles quoted fields with embedded commas/newlines)
// ---------------------------------------------------------------------------
function parseCSV(content: string): Record<string, string>[] {
  const lines: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    if (ch === '"') {
      if (inQuotes && content[i + 1] === '"') {
        // Escaped quote
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
        current += ch
      }
    } else if (ch === "\n" && !inQuotes) {
      lines.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  if (current) lines.push(current)

  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0])
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseCSVLine(line)
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? ""
    }
    rows.push(row)
  }

  return rows
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

// ---------------------------------------------------------------------------
// Build listing payload
// ---------------------------------------------------------------------------
function buildListingPayload(row: Record<string, string>) {
  const { subcategory, isInvestor } = classifyFirm(row)

  const attrs: Record<string, unknown> = {
    website_url: row.website || null,
    linkedin_company_url: null,
    firm_type: row.firm_type || row.member_type || null,
    member_type: row.member_type || null,
    hq_city: row.hq_city || null,
    hq_country: row.hq_country || "UK",
    is_active_deploying: row.status === "active",
    companies_house_number: row.companies_house_number || null,
    registered_address: row.registered_address || null,
    incorporation_date: row.incorporation_date || null,
    stage_focus: row.stage_focus || null,
    sectors: row.sectors || null,
    is_investor: isInvestor,
    outreach_priority: "B",
    outreach_status: "not_started",
    bvca_member: row.bvca_member === "Yes",
    data_source: row.source || "ukpc_directory",
    last_verified: new Date().toISOString().slice(0, 7), // YYYY-MM
  }

  return {
    category: "Finance" as const,
    subcategory,
    title: row.name,
    description: row.description || null,
    attributes: attrs,
    image_url: null,
    is_verified: false,
    is_demo: true,
    verification_tier: "unverified",
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const firmsOnly = args.includes("--firms-only")
  const contactsOnly = args.includes("--contacts-only")

  console.log("=".repeat(60))
  console.log("UK VC/PE Marketplace Import")
  console.log("=".repeat(60))
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`)
  console.log()

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ---------------------------------------------------------------------------
  // Step 1: Import firms
  // ---------------------------------------------------------------------------
  if (!contactsOnly) {
    console.log("Step 1: Loading firms CSV...")

    if (!existsSync(FIRMS_CSV)) {
      console.error(`Firms CSV not found: ${FIRMS_CSV}`)
      process.exit(1)
    }

    const firmRows = parseCSV(readFileSync(FIRMS_CSV, "utf8"))
    console.log(`  Loaded ${firmRows.length} rows`)

    // Filter out rows with no name
    const validFirms = firmRows.filter((r) => r.name?.trim())
    console.log(`  Valid rows: ${validFirms.length}`)

    // Get existing Finance listings to avoid duplicates
    console.log("\nStep 2: Checking existing Finance listings for duplicates...")
    const { data: existingListings, error: existingErr } = await supabase
      .from("marketplace_listings")
      .select("title")
      .eq("category", "Finance")

    if (existingErr) {
      console.error("Failed to fetch existing listings:", existingErr.message)
      process.exit(1)
    }

    const existingTitles = new Set(
      (existingListings || []).map((l) => l.title.toLowerCase().trim())
    )
    console.log(`  Existing Finance listings: ${existingTitles.size}`)

    // Build payloads, skipping duplicates
    const toInsert = []
    const skipped = []

    for (const row of validFirms) {
      const titleKey = row.name.toLowerCase().trim()
      if (existingTitles.has(titleKey)) {
        skipped.push(row.name)
        continue
      }
      toInsert.push(buildListingPayload(row))
    }

    console.log(`  To insert: ${toInsert.length}`)
    console.log(`  Skipped (duplicate): ${skipped.length}`)

    if (dryRun) {
      console.log("\n[DRY RUN] Sample payloads (first 3):")
      for (const p of toInsert.slice(0, 3)) {
        console.log(`  ${p.title} | ${p.subcategory} | website=${(p.attributes as Record<string, unknown>).website_url}`)
      }
    } else {
      // Batch upsert
      console.log("\nStep 3: Upserting firms...")
      let inserted = 0
      let failed = 0

      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE)
        const { error } = await supabase.from("marketplace_listings").insert(batch)

        if (error) {
          console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} error: ${error.message}`)
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
          `\r  Progress: ${Math.min(i + BATCH_SIZE, toInsert.length)}/${toInsert.length}`
        )
      }
      console.log()
      console.log(`  Inserted: ${inserted}  Failed: ${failed}`)
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2: Import contacts
  // ---------------------------------------------------------------------------
  if (!firmsOnly) {
    console.log("\nStep 4: Loading contacts CSV...")

    if (!existsSync(CONTACTS_CSV)) {
      console.warn(`  [WARN] Contacts CSV not found: ${CONTACTS_CSV}`)
      console.warn("  Run: python3 scripts/extract-vcpe-contacts.py first")
    } else {
      const contactRows = parseCSV(readFileSync(CONTACTS_CSV, "utf8"))
      console.log(`  Loaded ${contactRows.length} contacts`)

      if (contactRows.length > 0) {
        // Fetch all Finance listings (id + title) to link contacts
        const { data: listings, error: listingsErr } = await supabase
          .from("marketplace_listings")
          .select("id, title")
          .eq("category", "Finance")

        if (listingsErr) {
          console.error("Failed to fetch listings for contact linking:", listingsErr.message)
        } else {
          // Build title → id map (normalised)
          const listingMap = new Map<string, string>()
          for (const l of listings || []) {
            listingMap.set(l.title.toLowerCase().trim(), l.id)
          }

          console.log(`  Finance listings available to link: ${listingMap.size}`)

          // Check existing contacts to avoid duplicates
          const { data: existingContacts } = await supabase
            .from("vc_pe_contacts")
            .select("listing_id, full_name")

          const existingContactKeys = new Set(
            (existingContacts || []).map(
              (c) => `${c.listing_id}::${c.full_name.toLowerCase().trim()}`
            )
          )
          console.log(`  Existing contacts: ${existingContactKeys.size}`)

          const contactPayloads = []
          let unlinked = 0

          for (const row of contactRows) {
            const listingId = listingMap.get(row.firm_name?.toLowerCase().trim())
            if (!listingId) {
              unlinked++
              continue
            }

            const fullName = row.person_name?.trim()
            if (!fullName) continue

            const contactKey = `${listingId}::${fullName.toLowerCase().trim()}`
            if (existingContactKeys.has(contactKey)) continue

            contactPayloads.push({
              listing_id: listingId,
              full_name: fullName,
              title: row.title || null,
              seniority: mapSeniority(row.role_type),
              is_decision_maker: isDecisionMaker(row.role_type),
              outreach_status: "not_started",
            })
          }

          console.log(`  Contacts to insert: ${contactPayloads.length}`)
          console.log(`  Unlinked (no matching firm): ${unlinked}`)

          if (!dryRun && contactPayloads.length > 0) {
            let contactsInserted = 0
            let contactsFailed = 0

            for (let i = 0; i < contactPayloads.length; i += BATCH_SIZE) {
              const batch = contactPayloads.slice(i, i + BATCH_SIZE)
              const { error } = await supabase.from("vc_pe_contacts").insert(batch)
              if (error) {
                console.error(`  Contact batch error: ${error.message}`)
                contactsFailed += batch.length
              } else {
                contactsInserted += batch.length
              }
              process.stdout.write(
                `\r  Contacts progress: ${Math.min(i + BATCH_SIZE, contactPayloads.length)}/${contactPayloads.length}`
              )
            }
            console.log()
            console.log(`  Contacts inserted: ${contactsInserted}  Failed: ${contactsFailed}`)
          } else if (dryRun) {
            console.log("\n[DRY RUN] Sample contacts (first 3):")
            for (const c of contactPayloads.slice(0, 3)) {
              console.log(`  ${c.full_name} | ${c.title} @ listing ${c.listing_id}`)
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Final summary
  // ---------------------------------------------------------------------------
  console.log("\n" + "=".repeat(60))
  console.log("Import Complete")
  console.log("=".repeat(60))

  // Count Finance listings
  const { count: listingCount } = await supabase
    .from("marketplace_listings")
    .select("*", { count: "exact", head: true })
    .eq("category", "Finance")

  const { count: contactCount } = await supabase
    .from("vc_pe_contacts")
    .select("*", { count: "exact", head: true })

  console.log(`Finance listings in DB: ${listingCount ?? "unknown"}`)
  console.log(`VC/PE contacts in DB:   ${contactCount ?? "unknown"}`)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mapSeniority(role: string): string {
  const r = role?.toLowerCase() ?? ""
  if (r.includes("llp-designated") || r.includes("managing")) return "managing_director"
  if (r.includes("partner")) return "partner"
  if (r.includes("director")) return "director"
  return "other"
}

function isDecisionMaker(role: string): boolean {
  const r = role?.toLowerCase() ?? ""
  return r.includes("director") || r.includes("designated") || r.includes("managing")
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
