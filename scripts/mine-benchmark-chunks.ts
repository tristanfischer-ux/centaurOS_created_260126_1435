#!/usr/bin/env npx tsx
/**
 * @file mine-benchmark-chunks.ts — BENCH-L2 batch miner.
 *
 * Scans the 1.9M-chunk page_chunks corpus for price/cost patterns like:
 *   - "£250,000 per MWh"
 *   - "$X,XXX per kW"
 *   - "cost per unit of £X,XXX"
 *
 * Extracts candidate anchors, runs each through a cheap LLM classifier to
 * decide if it's a legit public benchmark, dedupes by (productClass,
 * unit, source), writes the result to
 * `src/lib/pdf-engine-v2/benchmarks-corpus.json`.
 *
 * USAGE:
 *   npx tsx scripts/mine-benchmark-chunks.ts [--limit 1000] [--dry]
 *
 * This is a LONG job — expected ~15-30 min, ~£1-3 of OpenRouter spend
 * for classification. Run it overnight, not in a normal session.
 *
 * Output file schema:
 *   {
 *     generatedAt: ISO,
 *     anchorsByClass: {
 *       <productClass>: BenchmarkAnchor[]
 *     },
 *     anchors: BenchmarkAnchor[]  // flat array for loader
 *   }
 */

import Database from 'better-sqlite3'
import { existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const CORPUS_DB = join(
  homedir(),
  'Developer/Forge-Capital/nightshift/crawler/corpus.db',
)

const OUT_PATH = join(
  __dirname,
  '..',
  'src/lib/pdf-engine-v2/benchmarks-corpus.json',
)

// Regex for "£123,456" / "$123,456" / "€123,456"
const PRICE_RE = /(?:£|\$|€|gbp\s|usd\s|eur\s)\s?([\d,]+(?:\.\d{2})?)\s*(?:per|\/)\s*(MWh|kWh|MW|kW|unit|module|container|panel|system|cell|rack)/gi

const args = process.argv.slice(2)
const limit = Number(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 5000
const dryRun = args.includes('--dry')

interface Candidate {
  price: number
  unit: string
  currency: 'GBP' | 'USD' | 'EUR'
  snippet: string
  pageUrl: string
  chunkSource: string
}

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/,/g, ''))
}

async function main() {
  if (!existsSync(CORPUS_DB)) {
    console.error('corpus.db not found — aborting')
    process.exit(1)
  }

  const db = new Database(CORPUS_DB, { readonly: true, fileMustExist: true })
  db.pragma('query_only = true')

  console.log(`[mine] Scanning up to ${limit} chunks with price patterns...`)

  // Only scan 'nightshift_company' + 'investor' sources (the ones relevant
  // to supplier/industry pricing).
  type Row = { page_url: string; chunk_text: string; source: string }
  const rows = db.prepare(
    `SELECT page_url, chunk_text, source
     FROM page_chunks
     WHERE source IN ('nightshift_company', 'investor')
       AND chunk_text LIKE '%per MWh%' ESCAPE '\\'
     LIMIT ?`,
  ).all(limit) as Row[]

  // Add kWh / MW / kW / unit variants
  const rows2 = db.prepare(
    `SELECT page_url, chunk_text, source
     FROM page_chunks
     WHERE source IN ('nightshift_company', 'investor')
       AND (chunk_text LIKE '%per kWh%'
         OR chunk_text LIKE '%per kW installed%'
         OR chunk_text LIKE '%per container%'
         OR chunk_text LIKE '%per unit ex-works%')
     LIMIT ?`,
  ).all(limit) as Row[]

  const allRows = [...rows, ...rows2]
  console.log(`[mine] ${allRows.length} candidate rows fetched`)

  const candidates: Candidate[] = []
  for (const r of allRows) {
    const text = r.chunk_text || ''
    const matches = Array.from(text.matchAll(PRICE_RE))
    for (const m of matches) {
      const price = parseAmount(m[1])
      if (!Number.isFinite(price) || price < 10) continue
      const unit = `per ${m[2].toLowerCase()}`
      const before = text.substring(0, m.index ?? 0)
      const currency: Candidate['currency'] = /\$/.test(before.slice(-5)) ? 'USD'
        : /€/.test(before.slice(-5)) ? 'EUR'
        : 'GBP'
      const start = Math.max(0, (m.index ?? 0) - 120)
      const end = Math.min(text.length, (m.index ?? 0) + 120)
      candidates.push({
        price,
        unit,
        currency,
        snippet: text.slice(start, end).replace(/\s+/g, ' ').trim(),
        pageUrl: r.page_url,
        chunkSource: r.source,
      })
    }
  }

  console.log(`[mine] Extracted ${candidates.length} price candidates`)

  // TODO (backlog): per-candidate LLM classify to tag productClass.
  // For this scaffold we group by unit keyword heuristically.
  const productClassByUnit: Record<string, string> = {
    'per mwh': 'battery_energy_storage',
    'per kwh': 'battery_energy_storage',
    'per kw': 'heat_pump_hvac',     // rough default — needs LLM refinement
    'per mw': 'battery_energy_storage',
    'per container': 'battery_energy_storage',
    'per unit': 'unknown',
    'per panel': 'vertical_farm_horticulture',
    'per cell': 'battery_energy_storage',
    'per rack': 'battery_energy_storage',
    'per system': 'unknown',
    'per module': 'unknown',
  }

  // Crude GBP normalisation: USD*0.8, EUR*0.85
  const toGbp = (c: Candidate): number => {
    if (c.currency === 'USD') return c.price * 0.8
    if (c.currency === 'EUR') return c.price * 0.85
    return c.price
  }

  // Group by (productClass, unit) and pick low/typical/high from the
  // distribution.
  const grouped = new Map<string, { prices: number[]; sources: Set<string>; unit: string; productClass: string }>()
  for (const c of candidates) {
    const pc = productClassByUnit[c.unit] || 'unknown'
    if (pc === 'unknown') continue
    const key = `${pc}::${c.unit}`
    const entry = grouped.get(key) || { prices: [], sources: new Set<string>(), unit: c.unit, productClass: pc }
    entry.prices.push(toGbp(c))
    entry.sources.add(c.pageUrl)
    grouped.set(key, entry)
  }

  type Anchor = {
    productClass: string
    low: number
    typical: number
    high: number
    unit: string
    source: string
    sourceType: 'L2_corpus_mined'
    minedAt: string
    confidence: 'low'
  }

  const anchors: Anchor[] = []
  for (const entry of grouped.values()) {
    if (entry.prices.length < 3) continue  // need at least 3 data points
    entry.prices.sort((a, b) => a - b)
    const n = entry.prices.length
    const pct = (p: number) => entry.prices[Math.min(n - 1, Math.floor(n * p))]
    const low = pct(0.10)
    const typical = pct(0.50)
    const high = pct(0.90)
    anchors.push({
      productClass: entry.productClass,
      low, typical, high,
      unit: entry.unit,
      source: `${entry.sources.size} corpus pages (aggregated)`,
      sourceType: 'L2_corpus_mined',
      minedAt: new Date().toISOString(),
      confidence: 'low',
    })
  }

  console.log(`[mine] Produced ${anchors.length} corpus-mined anchors`)

  if (dryRun) {
    console.log('[mine] --dry mode, not writing output file')
    console.log(JSON.stringify(anchors, null, 2))
    return
  }

  const output = {
    generatedAt: new Date().toISOString(),
    chunkCount: allRows.length,
    candidateCount: candidates.length,
    anchors,
  }
  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2))
  console.log(`[mine] Wrote ${OUT_PATH}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
