#!/usr/bin/env -S npx tsx
/**
 * @file scripts/ingest/enrich-new-suppliers.ts
 *
 * Automatic enrichment stage for newly-merged supplier rows in
 * ~/.forge-truth/forge-truth.db `companies` table.
 *
 * Targets rows that are under-enriched:
 *   enrichment_quality IS NULL OR enrichment_quality = 0
 *   AND discovery_source = 'pretraining_extracted_suppliers'
 *
 * Pipeline per company:
 *   1. Website discovery — Brave search "<name> official website" → extract
 *      apex domain, store as website_url.  Skips rows that already have a URL.
 *   2. Website scrape — fetch home + /about pages; extract plain text.
 *   3. LLM capability extraction — Flash-Lite via OpenRouter; extracts
 *      description, capability, country, founded_year, employee_band.
 *   4. Write-back — UPDATE companies SET … enrichment_quality=40 where
 *      we got a description; =20 where we only got a URL; =10 where
 *      Brave found a result but nothing extractable.
 *
 * IMPORTANT: Intentionally lightweight — 40/100 quality is not "done", it is
 * "meaningfully better than zero".  Higher quality (Companies House verification,
 * deep scrape, capability synthesis) comes from the existing
 * scripts/supplier-enrichment/ pipeline which targets enriched rows.
 *
 * Usage:
 *   npx tsx scripts/ingest/enrich-new-suppliers.ts [--dry-run] [--limit N]
 *   npx tsx scripts/ingest/enrich-new-suppliers.ts --write [--limit N]
 *
 * --dry-run (default)  Print how many rows would be processed; no DB writes.
 * --write              Actually enrich and update the DB.
 * --limit N            Cap processing at N rows (default: 50 per run for safety).
 *
 * The script is idempotent: already-enriched rows (quality > 0) are skipped.
 * Re-running with --write only touches still-unenriched rows.
 *
 * Auto-fire hook:
 *   merge-extracted-suppliers.ts calls this script at the end of a --write run
 *   via `spawnSync('npx', ['tsx', ...thisFile, '--write', '--limit', '828'])`.
 *   This ensures every newly-merged batch is enriched without manual follow-up.
 *
 * Pre-change mempalace search: supplier enrichment companies forge-truth → 0 drawers loaded
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import Database from 'better-sqlite3'
// Supplier embed-on-write guarantee (growing-DB): a newly-enriched supplier
// MUST also get a supplier_embeddings row so it is semantically searchable.
// Shared with persist-web-fallback.ts + background-enrichment.ts.
import { upsertSupplierEmbedding } from '../supplier-enrichment/embed-supplier'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DB_PATH = resolve(homedir(), '.forge-truth', 'forge-truth.db')
const DISCOVERY_SOURCE = 'pretraining_extracted_suppliers'
const DEFAULT_BATCH_LIMIT = 50
const BRAVE_INTER_CALL_MS = 1200   // ~50 req/min — within free tier
const SCRAPE_TIMEOUT_MS   = 8_000
const OPENROUTER_MODEL    = 'google/gemini-3.1-flash-lite'  // match the chain's canonical Flash-Lite (was 2.0, a generation behind)

// ---------------------------------------------------------------------------
// API key loading
// ---------------------------------------------------------------------------

function loadKey(envVar: string, ...files: string[]): string {
  if (process.env[envVar]) return process.env[envVar]!
  for (const f of files) {
    if (existsSync(f)) {
      const content = readFileSync(f, 'utf-8')
      const m = content.match(new RegExp(`${envVar}=([^\\s\\n]+)`))
      if (m) return m[1]
    }
  }
  return ''
}

const BRAVE_KEY = loadKey(
  'BRAVE_API_KEY',
  '/Users/tristanfischer/.claude/secrets/brave.env',
  '/Users/tristanfischer/Developer/Forge-Capital/.env',
  '/Users/tristanfischer/secrets/brave.env',
)

const OPENROUTER_KEY = loadKey(
  'OPENROUTER_API_KEY',
  '/Users/tristanfischer/.claude/secrets/openrouter.env',
  '/Users/tristanfischer/secrets/openrouter.env',
)

// OpenAI key for the supplier embed-on-write step. Absent → embed degrades to
// a skip and the one-off backfill fills it later (the row is still written).
const OPENAI_KEY = loadKey(
  'OPENAI_API_KEY',
  resolve(process.cwd(), '.env.local'),
  '/Users/tristanfischer/.claude/secrets/openai.env',
  '/Users/tristanfischer/secrets/openai.env',
  '/Users/tristanfischer/Developer/Forge-Capital/.env',
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompanyRow {
  id: string
  name: string
  website_url: string | null
  enrichment_quality: number | null
  discovery_source: string
}

interface EnrichResult {
  website_url: string | null
  description: string | null
  capability: string | null
  country: string | null
  founded_year: number | null
  employee_band: string | null
  enrichment_quality: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(...args: unknown[]): void {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  console.log(`[${ts}]`, ...args)
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function sqlEscape(s: string): string {
  return (s ?? '').replace(/'/g, "''")
}

function queryDb(sql: string): unknown[] {
  try {
    const out = execFileSync('sqlite3', ['-cmd', '.mode json', DB_PATH, sql], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }).trim()
    if (!out) return []
    return JSON.parse(out)
  } catch (err: any) {
    log('DB query error:', err.message)
    return []
  }
}

function execDb(sql: string): void {
  execFileSync('sqlite3', [DB_PATH, sql], { encoding: 'utf8' })
}

/**
 * Extract the apex host from a URL.
 * "https://www.acme.co.uk/about" → "acme.co.uk"
 */
function apexHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// Step 1 — Website discovery via Brave
// ---------------------------------------------------------------------------

async function braveSearch(query: string): Promise<Array<{ name: string; url: string; description: string }>> {
  if (!BRAVE_KEY) return []
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
      {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': BRAVE_KEY,
        },
        signal: AbortSignal.timeout(8000),
      },
    )
    if (!res.ok) return []
    const json = await res.json() as any
    const results = json?.web?.results ?? []
    return results.map((r: any) => ({
      name: r.title ?? '',
      url: r.url ?? '',
      description: r.description ?? '',
    }))
  } catch {
    return []
  }
}

/** Aggregator / directory domains we should NOT store as the company website. */
const AGGREGATOR_DOMAINS = new Set([
  // Social
  'linkedin.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com',
  'youtube.com',
  // Encyclopaedia / reference
  'wikipedia.org', 'wikidata.org',
  // Financial data / news
  'bloomberg.com', 'reuters.com', 'ft.com', 'wsj.com', 'businesswire.com',
  // Company registries / databases
  'crunchbase.com', 'dnb.com', 'companieshouse.gov.uk',
  'find-and-update.company-information.service.gov.uk',
  'opencorporates.com', 'info-clipper.com', 'companysearch.co.uk',
  'companies-house.co.uk', 'registries.co.uk',
  // Industrial directories / marketplaces / aggregators
  'kompass.com', 'thomasnet.com', 'manta.com', 'globalspec.com',
  'europages.co.uk', 'europages.com', 'aliexpress.com', 'alibaba.com',
  'made-in-china.com', 'satsearch.co', 'thepartsdirect.com',
  'onninen.se', 'onninen.com', 'altruan.com', 'tradesparq.com',
  'panjiva.com', 'importyeti.com', 'tradewheel.com', 'indiamart.com',
  'tradeford.com', 'go4worldbusiness.com', 'yellowpages.com',
  'bbb.org', 'trustpilot.com', 'glassdoor.com', 'indeed.com',
  'zoominfo.com', 'apollo.io', 'lusha.com', 'rocketreach.co',
  'leadiq.com', 'govtribe.com', 'usaspending.gov', 'fpds.gov',
  'sam.gov', 'grants.gov', 'tendata.com',
  // News wires / press release aggregators
  'prnewswire.com', 'businesswire.com', 'globenewswire.com', 'accesswire.com',
  'newswire.com', 'einpresswire.com',
  // Space/tech sector directories
  'satcatalog.com', 'nanoavionics.com', 'satsearch.co', 'data.ark.ai',
  // Innovation hubs / incubators that have member pages
  'greentownlabs.com',
])

/** Aggregator partial-domain tokens (subdomain or TLD-agnostic). */
const AGGREGATOR_TOKENS = [
  'thomasnet', 'kompass', 'satsearch', 'europages', 'globalspec',
  'opencorporates', 'info-clipper', 'thepartsdirect', 'altruan', 'onninen',
  'tradesparq', 'panjiva', 'importyeti', 'zoominfo', 'apollo.io',
  'leadiq', 'govtribe', 'rocketreach', 'lusha',
  'prnewswire', 'businesswire', 'globenewswire',
  'satcatalog', 'greentownlabs',
]

function isAggregator(url: string): boolean {
  const host = apexHost(url)
  // Exact match or subdomain of known aggregator
  for (const agg of AGGREGATOR_DOMAINS) {
    if (host === agg || host.endsWith('.' + agg)) return true
  }
  // Token match for sites with many TLD variants
  for (const token of AGGREGATOR_TOKENS) {
    if (host.includes(token)) return true
  }
  return false
}

/**
 * Extract meaningful alphanumeric tokens from a company name, filtering
 * common words that appear in unrelated domains (e.g. "inc", "the", "group").
 * Returns tokens sorted longest-first so we try the most specific match first.
 */
function companyNameTokens(name: string): string[] {
  const SKIP = new Set([
    'the', 'and', 'or', 'of', 'for', 'in', 'inc', 'ltd', 'llc', 'gmbh',
    'plc', 'sa', 'srl', 'co', 'corp', 'company', 'group', 'holding',
    'holdings', 'international', 'global', 'systems', 'solutions',
    'services', 'technologies', 'technology', 'products', 'manufacturing',
    // Generic sector words that appear in directory titles
    'drives', 'motors', 'power', 'energy', 'electric', 'automation',
    'engineering', 'industrial', 'electronics', 'components', 'parts',
  ])
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !SKIP.has(t))
    .sort((a, b) => b.length - a.length)
}

async function discoverWebsite(companyName: string): Promise<string | null> {
  await sleep(BRAVE_INTER_CALL_MS)
  const results = await braveSearch(`"${companyName}" official website manufacturer supplier`)
  const nameTokens = companyNameTokens(companyName)

  for (const r of results) {
    if (!r.url) continue
    if (isAggregator(r.url)) continue
    const host = apexHost(r.url)
    if (!host) continue

    const hostClean = host.replace(/[^a-z0-9]/g, '')
    const titleClean = r.name.toLowerCase().replace(/[^a-z0-9]/g, '')

    // Require that at least one meaningful name token (length ≥ 4) appears
    // in the result's domain OR title. Short tokens (3 chars) are only accepted
    // in the domain (less likely to be a coincidental substring in a title).
    let matched = false
    for (const token of nameTokens) {
      if (hostClean.includes(token)) { matched = true; break }
      if (token.length >= 4 && titleClean.includes(token)) { matched = true; break }
    }
    if (!matched) continue

    // Normalise to origin only
    try {
      const u = new URL(r.url)
      return u.origin
    } catch {
      return r.url.split('/').slice(0, 3).join('/')
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Step 2 — Website scrape
// ---------------------------------------------------------------------------

async function fetchPage(baseUrl: string, path: string): Promise<string | null> {
  try {
    const url = new URL(path, baseUrl).toString()
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ForgeOS supplier enrichment (contact: ops@fractionalforge.app)' },
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const html = await res.text()
    // Strip HTML tags, collapse whitespace, cap length
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 30_000)
  } catch {
    return null
  }
}

async function scrapeWebsite(websiteUrl: string): Promise<string> {
  const paths = ['', '/about', '/about-us', '/company', '/who-we-are', '/capabilities']
  const pages = await Promise.all(paths.slice(0, 3).map(p => fetchPage(websiteUrl, p)))
  return pages.filter(Boolean).join(' ').slice(0, 40_000)
}

// ---------------------------------------------------------------------------
// Step 3 — LLM capability extraction (Flash-Lite via OpenRouter)
// ---------------------------------------------------------------------------

interface LLMExtraction {
  description: string | null
  capability: string | null
  country: string | null
  founded_year: number | null
  employee_band: string | null
}

async function extractCapabilities(companyName: string, websiteText: string): Promise<LLMExtraction | null> {
  if (!OPENROUTER_KEY) return null
  if (websiteText.length < 200) return null

  const prompt = `Extract structured data about this company from its website text.

COMPANY NAME: ${companyName}

WEBSITE TEXT (first 5000 chars):
${websiteText.slice(0, 5000)}

Return ONLY a JSON object with these fields (use null for missing):
{
  "description": "2-3 sentence description of what this company makes or does, specific and factual",
  "capability": "One-line capability statement, max 110 chars, must name a specific product/service/technology",
  "country": "Country name (e.g. Germany, UK, USA) or null",
  "founded_year": integer or null,
  "employee_band": "e.g. 1-10, 11-50, 51-200, 201-500, 500+" or null
}`

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fractionalforge.com',
        'X-Title': 'ForgeOS supplier enrichment',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: 400,
        temperature: 0.0,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      log(`  [llm] HTTP ${res.status}: ${errBody.slice(0, 200)}`)
      return null
    }
    const json = await res.json() as any
    const text = json?.choices?.[0]?.message?.content ?? ''
    if (!text) {
      log(`  [llm] empty content from model`)
      return null
    }
    const parsed = JSON.parse(text.trim())
    return {
      description: typeof parsed.description === 'string' ? parsed.description.slice(0, 600) : null,
      capability: typeof parsed.capability === 'string' ? parsed.capability.slice(0, 140) : null,
      country: typeof parsed.country === 'string' ? parsed.country.slice(0, 80) : null,
      founded_year: typeof parsed.founded_year === 'number' ? parsed.founded_year : null,
      employee_band: typeof parsed.employee_band === 'string' ? parsed.employee_band.slice(0, 30) : null,
    }
  } catch (err: any) {
    log(`  [llm] exception: ${err?.message ?? String(err)}`)
    return null
  }
}

// ---------------------------------------------------------------------------
// Step 4 — DB write-back
// ---------------------------------------------------------------------------

function isDomainTaken(domain: string, excludeId: string): boolean {
  try {
    const rows = queryDb(
      `SELECT id FROM companies WHERE domain = '${sqlEscape(domain)}' AND id != '${sqlEscape(excludeId)}' LIMIT 1`,
    )
    return rows.length > 0
  } catch {
    return false
  }
}

function writeBack(row: CompanyRow, result: EnrichResult): void {
  const sets: string[] = [
    `updated_at = datetime('now')`,
    `enrichment_quality = ${result.enrichment_quality}`,
    `status = 'discovered'`,  // keep 'discovered' — not yet 'enriched' (that requires CH verification)
    `enriched_at = datetime('now')`,
  ]
  if (result.website_url) {
    sets.push(`website_url = '${sqlEscape(result.website_url)}'`)
    const domain = apexHost(result.website_url)
    // Only write domain if it is not already claimed by another row —
    // companies.domain has a UNIQUE partial index; a conflict crashes the batch.
    if (domain && !isDomainTaken(domain, row.id)) {
      sets.push(`domain = '${sqlEscape(domain)}'`)
    }
  }
  if (result.description) sets.push(`description = '${sqlEscape(result.description)}'`)
  if (result.capability)  sets.push(`capability = '${sqlEscape(result.capability)}'`)
  if (result.country)     sets.push(`country = '${sqlEscape(result.country)}'`)
  if (result.founded_year) sets.push(`founded_year = ${result.founded_year}`)
  if (result.employee_band) sets.push(`employee_band = '${sqlEscape(result.employee_band)}'`)

  execDb(`UPDATE companies SET ${sets.join(', ')} WHERE id = '${sqlEscape(row.id)}'`)
}

/**
 * Embed-on-write: after writeBack UPDATEs the companies row, (re-)embed it so
 * the freshly-enriched supplier is semantically searchable. Opens its own
 * better-sqlite3 handle (the writeBack above uses the sqlite3 CLI). Non-fatal:
 * a missing OPENAI key / embed failure leaves the supplier_embeddings row to
 * the one-off backfill. busy_timeout + WAL for concurrency safety with the
 * parts-embedding agent.
 */
async function embedWriteBack(row: CompanyRow, result: EnrichResult): Promise<void> {
  if (!OPENAI_KEY) return
  let db: Database.Database | null = null
  try {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 10000')
    await upsertSupplierEmbedding(
      db,
      row.id,
      {
        name: row.name,
        capability: result.capability,
        description: result.description,
        country: result.country,
        snippet: result.capability,
      },
      OPENAI_KEY,
    )
  } catch (err: any) {
    log(`  [embed] ${row.name} → embed-on-write failed: ${err?.message ?? err}`)
  } finally {
    try { db?.close() } catch { /* no-op */ }
  }
}

// ---------------------------------------------------------------------------
// Core enrichment loop
// ---------------------------------------------------------------------------

async function enrichRow(row: CompanyRow): Promise<EnrichResult> {
  const result: EnrichResult = {
    website_url: row.website_url,
    description: null,
    capability: null,
    country: null,
    founded_year: null,
    employee_band: null,
    enrichment_quality: 10,  // floor: "we tried, found nothing"
  }

  // Step 1: discover website if missing
  if (!result.website_url) {
    const found = await discoverWebsite(row.name)
    if (found) {
      result.website_url = found
      result.enrichment_quality = 20  // has URL now
      log(`  [website] ${row.name} → ${found}`)
    } else {
      log(`  [website] ${row.name} → not found`)
      return result
    }
  }

  // Step 2: scrape
  const websiteText = await scrapeWebsite(result.website_url)
  if (websiteText.length < 200) {
    log(`  [scrape] ${row.name} → too short (${websiteText.length} chars)`)
    return result
  }
  log(`  [scrape] ${row.name} → ${websiteText.length} chars`)

  // Step 3: LLM extraction
  const extraction = await extractCapabilities(row.name, websiteText)
  if (extraction) {
    result.description   = extraction.description
    result.capability    = extraction.capability
    result.country       = extraction.country
    result.founded_year  = extraction.founded_year
    result.employee_band = extraction.employee_band
    if (result.description) {
      result.enrichment_quality = 40  // has description — meaningfully enriched
    }
    log(`  [llm] ${row.name} → quality=${result.enrichment_quality}`)
  } else {
    log(`  [llm] ${row.name} → extraction failed`)
  }

  return result
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun  = !args.includes('--write')
  const limitArg = (() => {
    const i = args.indexOf('--limit')
    if (i === -1) return DEFAULT_BATCH_LIMIT
    const n = parseInt(args[i + 1], 10)
    return Number.isNaN(n) ? DEFAULT_BATCH_LIMIT : n
  })()

  log(`enrich-new-suppliers starting — mode=${dryRun ? 'DRY-RUN' : 'WRITE'} limit=${limitArg}`)
  log(`DB: ${DB_PATH}`)
  log(`Brave: ${BRAVE_KEY ? 'present' : 'MISSING — website discovery disabled'}`)
  log(`OpenRouter: ${OPENROUTER_KEY ? 'present' : 'MISSING — LLM extraction disabled'}`)

  // Count total candidates (no limit) for the dry-run report
  const countRows = queryDb(
    `SELECT COUNT(*) as n FROM companies
     WHERE discovery_source = '${DISCOVERY_SOURCE}'
     AND (enrichment_quality IS NULL OR enrichment_quality = 0)`,
  )
  const totalCandidates = (countRows[0] as any)?.n ?? 0
  log(`Un-enriched candidates (quality IS NULL or 0, source=${DISCOVERY_SOURCE}): ${totalCandidates}`)

  if (dryRun) {
    log()
    log('DRY-RUN — no DB writes. Re-run with --write to process.')
    log(`Command to back-fill all ${totalCandidates}:`)
    log(`  npx tsx scripts/ingest/enrich-new-suppliers.ts --write --limit ${totalCandidates}`)
    log()
    log('Pipeline per row:')
    log('  1. Brave search "<name> official website manufacturer supplier" → website_url (quality=20)')
    log('  2. Scrape home + /about pages')
    log('  3. Flash-Lite extraction → description + capability + country (quality=40)')
    log('  4. UPDATE companies (never touches enrichment_quality > 0 rows)')
    return
  }

  // Fetch batch
  const rows = queryDb(
    `SELECT id, name, website_url, enrichment_quality, discovery_source
     FROM companies
     WHERE discovery_source = '${DISCOVERY_SOURCE}'
     AND (enrichment_quality IS NULL OR enrichment_quality = 0)
     ORDER BY name ASC
     LIMIT ${limitArg}`,
  ) as CompanyRow[]

  log(`Processing batch of ${rows.length} rows...`)
  log()

  let countWebsite = 0
  let countDescription = 0
  let countSkipped = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    log(`[${i + 1}/${rows.length}] ${row.name}`)
    try {
      const result = await enrichRow(row)
      writeBack(row, result)
      // Embed-on-write: the row was just (re-)enriched — make it semantically
      // searchable in the same pass (growing-DB invariant: no companies write
      // without a supplier_embeddings row).
      await embedWriteBack(row, result)
      if (result.description) countDescription++
      else if (result.website_url && !row.website_url) countWebsite++
      else countSkipped++
    } catch (err: any) {
      log(`  ERROR: ${err.message}`)
      countSkipped++
    }
  }

  log()
  log(`Done.`)
  log(`  description extracted : ${countDescription}  (quality=40)`)
  log(`  website found only    : ${countWebsite}  (quality=20)`)
  log(`  skipped/failed        : ${countSkipped}  (quality=10)`)
  log(`  total remaining       : ${totalCandidates - rows.length}`)
}

main().catch(err => {
  console.error('[enrich-new-suppliers] FATAL:', err)
  process.exit(1)
})
