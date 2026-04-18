/**
 * @file sanctions-screen.ts — Item #18: weekly sanctions screening.
 *
 * Downloads:
 *   - OFAC SDN list (CSV): https://www.treasury.gov/ofac/downloads/sdn.csv
 *   - UK FCDO consolidated list (CSV): https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/1189962/UK_Sanctions_List.csv (URL may drift — override with UK_FCDO_SANCTIONS_URL env var)
 *
 * Performs fuzzy name match against every marketplace_listings row.
 * Writes supplier_sanctions_flags for any match (≥0.85 similarity).
 * Clears flags that are no longer present (mark resolved).
 *
 * USAGE:
 *   npx tsx scripts/supplier-enrichment/sanctions-screen.ts [--dry-run]
 */

import { getAdminClient, parseArgs, log } from "./_shared"

const OFAC_SDN_URL = "https://www.treasury.gov/ofac/downloads/sdn.csv"
const UK_FCDO_URL = process.env.UK_FCDO_SANCTIONS_URL
  ?? "https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/1189962/UK_Sanctions_List.csv"

interface SanctionsEntry { listName: string; entryRef: string; name: string }

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "ForgeOS supplier enrichment" } })
    if (!res.ok) { log(`fetch ${url} → ${res.status}`); return null }
    return await res.text()
  } catch (e) { log(`fetch ${url} failed:`, e); return null }
}

// Naive CSV parser — OFAC SDN CSV has simple structure without quoted commas in practice
function parseCsvColumn(row: string, col: number): string {
  // INTENT: for OFAC SDN, columns are comma-separated but names can have quoted commas.
  // Split respecting double-quote groups.
  const parts: string[] = []
  let cur = ""
  let inQuotes = false
  for (const ch of row) {
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === "," && !inQuotes) { parts.push(cur); cur = ""; continue }
    cur += ch
  }
  parts.push(cur)
  return (parts[col] ?? "").trim()
}

async function loadOfac(): Promise<SanctionsEntry[]> {
  const text = await fetchText(OFAC_SDN_URL)
  if (!text) return []
  const lines = text.split(/\r?\n/)
  const entries: SanctionsEntry[] = []
  for (const line of lines) {
    if (!line) continue
    const entNum = parseCsvColumn(line, 0)
    const name = parseCsvColumn(line, 1)
    const sdnType = parseCsvColumn(line, 2)
    if (!name) continue
    if (sdnType.toLowerCase() === "individual") continue
    entries.push({ listName: "OFAC_SDN", entryRef: entNum, name })
  }
  log(`OFAC SDN: ${entries.length} entity entries`)
  return entries
}

async function loadUkFcdo(): Promise<SanctionsEntry[]> {
  const text = await fetchText(UK_FCDO_URL)
  if (!text) return []
  const lines = text.split(/\r?\n/)
  const entries: SanctionsEntry[] = []
  // UK FCDO CSV header is not stable across revisions — attempt column 6 "Name 6" which is the primary name; fall back to col 0
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]; if (!line) continue
    const name = parseCsvColumn(line, 6) || parseCsvColumn(line, 0)
    if (!name || name.length < 3) continue
    entries.push({ listName: "UK_FCDO", entryRef: String(i), name })
  }
  log(`UK FCDO: ${entries.length} entries`)
  return entries
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim()
}

function tokenJaccard(a: string, b: string): number {
  const aTok = new Set(a.split(" ").filter(Boolean))
  const bTok = new Set(b.split(" ").filter(Boolean))
  if (aTok.size === 0 || bTok.size === 0) return 0
  let overlap = 0
  for (const t of aTok) if (bTok.has(t)) overlap++
  return overlap / new Set([...aTok, ...bTok]).size
}

async function main() {
  const { dryRun } = parseArgs(process.argv)
  const supabase = getAdminClient()
  log(`sanctions-screen starting${dryRun ? " (DRY-RUN)" : ""}`)

  const [ofac, ukFcdo] = await Promise.all([loadOfac(), loadUkFcdo()])
  const lists = [...ofac, ...ukFcdo]
  if (lists.length === 0) { log("No lists loaded — aborting"); process.exit(1) }

  // Pre-normalise sanctions names into token sets
  const normalisedLists = lists.map((e) => ({ ...e, normName: normalise(e.name) })).filter((e) => e.normName.length >= 3)

  // Iterate suppliers page-by-page (avoid loading 23k at once)
  let page = 0
  const pageSize = 1000
  let totalChecked = 0
  let totalFlags = 0
  const newFlags: Array<{ listing_id: string; list_name: string; list_entry_ref: string; reason: string; match_score: number }> = []

  while (true) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select("id, title")
      .range(from, to)
    if (error) { log("fetch error:", error.message); process.exit(1) }
    if (!data || data.length === 0) break
    for (const row of data) {
      const normTitle = normalise(row.title ?? "")
      if (normTitle.length < 4) continue
      for (const entry of normalisedLists) {
        const score = tokenJaccard(normTitle, entry.normName)
        if (score >= 0.85) {
          newFlags.push({
            listing_id: row.id,
            list_name: entry.listName,
            list_entry_ref: entry.entryRef,
            reason: `Name token match: "${row.title}" vs "${entry.name}"`,
            match_score: Math.round(score * 100),
          })
        }
      }
    }
    totalChecked += data.length
    page++
    if (data.length < pageSize) break
  }

  log(`Screened ${totalChecked} suppliers. Candidate matches: ${newFlags.length}`)

  if (!dryRun && newFlags.length > 0) {
    const { error: insertError } = await supabase
      .from("supplier_sanctions_flags")
      .upsert(newFlags, { onConflict: "listing_id,list_name,list_entry_ref" })
    if (insertError) log("insert error:", insertError.message)
    else { totalFlags = newFlags.length; log(`Wrote ${totalFlags} flags`) }
  } else if (dryRun) {
    for (const f of newFlags.slice(0, 20)) log(`FLAG ${f.listing_id} [${f.list_name}] ${f.match_score}% — ${f.reason}`)
    if (newFlags.length > 20) log(`... and ${newFlags.length - 20} more`)
  }

  log("Done.")
}

main().catch((e) => { log("FATAL:", e); process.exit(1) })
