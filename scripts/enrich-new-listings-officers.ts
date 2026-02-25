#!/usr/bin/env npx tsx

/**
 * enrich-new-listings-officers.ts
 * ================================
 * Fetches directors (officers) and PSC data from Companies House for
 * marketplace listings that have a ch_company_number but lack ch_directors.
 *
 * INTENT: The discover-manufacturers-by-sic.ts script inserts basic profile
 * data but skips officers/PSC to stay fast. This script backfills those.
 *
 * Usage:
 *   npx tsx scripts/enrich-new-listings-officers.ts
 *   npx tsx scripts/enrich-new-listings-officers.ts --dry-run
 *   npx tsx scripts/enrich-new-listings-officers.ts --limit 10
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

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")
const limitIdx = args.indexOf("--limit")
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : undefined

if (DRY_RUN) console.log("DRY RUN — no writes\n")
if (LIMIT) console.log(`LIMIT: ${LIMIT} listings\n`)

// ---------------------------------------------------------------------------
// CH API helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

interface Officer {
  name: string
  role: string
  appointed: string | null
  resigned: string | null
  nationality: string | null
}

interface PSCEntry {
  name: string
  natures_of_control: string[]
  notified_on: string | null
  ceased_on: string | null
}

async function fetchOfficers(companyNumber: string): Promise<{ officers: Officer[]; error: string | null }> {
  try {
    const res = await fetch(`${CH_BASE}/company/${companyNumber}/officers?items_per_page=50`, {
      headers: { Authorization: `Basic ${CH_AUTH}` },
    })
    if (!res.ok) return { officers: [], error: `HTTP ${res.status}` }

    const data = await res.json()
    const items = data?.items ?? []

    const officers: Officer[] = items.map((o: Record<string, unknown>) => ({
      name: (o.name as string) ?? "Unknown",
      role: (o.officer_role as string) ?? "unknown",
      appointed: (o.appointed_on as string) ?? null,
      resigned: (o.resigned_on as string) ?? null,
      nationality: (o.nationality as string) ?? null,
    }))

    return { officers, error: null }
  } catch (err: unknown) {
    return { officers: [], error: err instanceof Error ? err.message : String(err) }
  }
}

async function fetchPSC(companyNumber: string): Promise<{ psc: PSCEntry[]; error: string | null }> {
  try {
    const res = await fetch(`${CH_BASE}/company/${companyNumber}/persons-with-significant-control?items_per_page=50`, {
      headers: { Authorization: `Basic ${CH_AUTH}` },
    })
    if (!res.ok) return { psc: [], error: `HTTP ${res.status}` }

    const data = await res.json()
    const items = data?.items ?? []

    const psc: PSCEntry[] = items.map((p: Record<string, unknown>) => ({
      name: (p.name as string) ?? (p.name_elements as Record<string, string>)?.surname ?? "Unknown",
      natures_of_control: (p.natures_of_control as string[]) ?? [],
      notified_on: (p.notified_on as string) ?? null,
      ceased_on: (p.ceased_on as string) ?? null,
    }))

    return { psc, error: null }
  } catch (err: unknown) {
    return { psc: [], error: err instanceof Error ? err.message : String(err) }
  }
}

async function fetchSICCodes(companyNumber: string): Promise<{ sicCodes: string[]; error: string | null }> {
  try {
    const res = await fetch(`${CH_BASE}/company/${companyNumber}`, {
      headers: { Authorization: `Basic ${CH_AUTH}` },
    })
    if (!res.ok) return { sicCodes: [], error: `HTTP ${res.status}` }

    const data = await res.json()
    return { sicCodes: (data?.sic_codes as string[]) ?? [], error: null }
  } catch (err: unknown) {
    return { sicCodes: [], error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Fetch listings that have a ch_company_number but no ch_directors
  let query = supabase
    .from("marketplace_listings")
    .select("id, attributes")
    .not("attributes->>ch_company_number", "is", null)
    .is("attributes->>ch_directors", null)

  if (LIMIT) query = query.limit(LIMIT)

  const { data: listings, error } = await query

  if (error) {
    console.error("Query failed:", error.message)
    process.exit(1)
  }

  if (!listings || listings.length === 0) {
    console.log("No listings need officer enrichment. All done.")
    return
  }

  console.log(`Found ${listings.length} listings to enrich with officers/PSC\n`)

  let enriched = 0
  let errored = 0

  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i]
    const attrs = listing.attributes as Record<string, unknown>
    const companyNumber = attrs.ch_company_number as string

    // Rate limit: 2 API calls per listing (officers + PSC), sometimes 3 (SIC)
    // 0.15s between each call = ~6.5/sec, well within 600/min
    if (i > 0) await sleep(150)

    // Fetch officers
    const { officers, error: offErr } = await fetchOfficers(companyNumber)
    if (offErr) {
      console.log(`[${i + 1}/${listings.length}] ${companyNumber} — officers ERROR: ${offErr}`)
      errored++
      continue
    }

    await sleep(150)

    // Fetch PSC
    const { psc, error: pscErr } = await fetchPSC(companyNumber)
    if (pscErr) {
      console.log(`[${i + 1}/${listings.length}] ${companyNumber} — PSC ERROR: ${pscErr}`)
    }

    // Fetch SIC codes if not already present
    let sicCodes = attrs.ch_sic_codes as string[] | null
    if (!sicCodes) {
      await sleep(150)
      const { sicCodes: fetched, error: sicErr } = await fetchSICCodes(companyNumber)
      if (!sicErr) sicCodes = fetched
    }

    // Active directors only
    const activeDirectors = officers.filter((o) => !o.resigned && o.role === "director")
    const activePSC = psc.filter((p) => !p.ceased_on)

    const summary = `${activeDirectors.length} directors, ${activePSC.length} PSC, ${(sicCodes ?? []).length} SIC codes`
    console.log(`[${i + 1}/${listings.length}] ${companyNumber} — ${summary}${DRY_RUN ? " (dry run)" : ""}`)

    if (!DRY_RUN) {
      const newAttrs = {
        ...attrs,
        ch_directors: officers,
        ch_psc: psc,
        ...(sicCodes && sicCodes.length > 0 ? { ch_sic_codes: sicCodes } : {}),
      }

      const { error: updateErr } = await supabase
        .from("marketplace_listings")
        .update({ attributes: newAttrs })
        .eq("id", listing.id)

      if (updateErr) {
        console.error(`  Update failed: ${updateErr.message}`)
        errored++
        continue
      }
    }

    enriched++
  }

  console.log("\n--- Summary ---")
  console.log(`Total:    ${listings.length}`)
  console.log(`Enriched: ${enriched}${DRY_RUN ? " (would enrich)" : ""}`)
  console.log(`Errored:  ${errored}`)
  if (DRY_RUN) console.log("\nDry run — no changes written.")
  else console.log("\nDone.")
}

main().catch((err) => {
  console.error("Unhandled error:", err)
  process.exit(1)
})
