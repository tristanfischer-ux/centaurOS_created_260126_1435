/**
 * @file companies-house-sync.ts — Item #8: enrich UK suppliers from Companies House.
 *
 * For rows with country_iso='GB' and missing founded_year or employee_count,
 * search the free Companies House API by company name and pull structured data.
 *
 * AUTH: Companies House API uses HTTP Basic with your API key (free on signup
 * at https://developer.company-information.service.gov.uk/). Set COMPANIES_HOUSE_API_KEY.
 *
 * RATE LIMIT: 600 req/5min. Script sleeps 500ms between calls.
 *
 * USAGE:
 *   COMPANIES_HOUSE_API_KEY=xyz npx tsx scripts/supplier-enrichment/companies-house-sync.ts [--limit 50] [--dry-run]
 */

import { getAdminClient, parseArgs, appendEnrichmentSource, log, sleep } from "./_shared"

interface CHCompany {
  company_number?: string
  company_name?: string
  date_of_creation?: string
  registered_office_address?: { address_line_1?: string; locality?: string; postal_code?: string }
  company_status?: string
  sic_codes?: string[]
}

async function chSearch(name: string, apiKey: string): Promise<CHCompany | null> {
  const url = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(name)}&items_per_page=3`
  const res = await fetch(url, {
    headers: { "Authorization": `Basic ${Buffer.from(apiKey + ":").toString("base64")}` },
  })
  if (!res.ok) return null
  const json = await res.json() as { items?: Array<{ company_number?: string; title?: string; date_of_creation?: string; company_status?: string }> }
  const top = json.items?.[0]
  if (!top?.company_number) return null
  return {
    company_number: top.company_number,
    company_name: top.title,
    date_of_creation: top.date_of_creation,
    company_status: top.company_status,
  }
}

async function main() {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY
  if (!apiKey) { log("COMPANIES_HOUSE_API_KEY not set — skipping. Get one free at https://developer.company-information.service.gov.uk/"); process.exit(0) }

  const { dryRun, limit } = parseArgs(process.argv)
  const supabase = getAdminClient()

  log(`companies-house-sync starting${dryRun ? " (DRY-RUN)" : ""}${limit ? ` limit=${limit}` : ""}`)

  let query = supabase
    .from("marketplace_listings")
    .select("id, title, country_iso, founded_year, enrichment_sources")
    .eq("country_iso", "GB")
    .is("founded_year", null)
  if (limit) query = query.limit(limit)
  const { data, error } = await query
  if (error) { log("fetch error:", error.message); process.exit(1) }
  log(`UK candidates missing founded_year: ${data?.length ?? 0}`)

  let enriched = 0
  for (const row of data ?? []) {
    try {
      const match = await chSearch(row.title, apiKey)
      if (!match?.date_of_creation) { await sleep(500); continue }
      const foundedYear = parseInt(match.date_of_creation.slice(0, 4), 10)
      if (Number.isNaN(foundedYear)) { await sleep(500); continue }
      if (dryRun) {
        log(`CH MATCH ${row.title} → CN=${match.company_number} founded=${foundedYear}`)
      } else {
        const { error: upErr } = await supabase
          .from("marketplace_listings")
          .update({
            founded_year: foundedYear,
            enrichment_sources: appendEnrichmentSource(row.enrichment_sources, "companies_house", ["founded_year"]),
            last_enriched_at: new Date().toISOString(),
          })
          .eq("id", row.id)
        if (upErr) log(`update failed ${row.id}:`, upErr.message)
        else enriched++
      }
    } catch (err) {
      log(`CH search failed for "${row.title}":`, err)
    }
    await sleep(500) // 500ms between calls = 120 req/min, well under 600/5min
  }
  log(`Done. Enriched: ${enriched}.`)
}

main().catch((e) => { log("FATAL:", e); process.exit(1) })
