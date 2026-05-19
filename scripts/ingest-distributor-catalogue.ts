#!/usr/bin/env npx tsx
/**
 * ingest-distributor-catalogue.ts — Phase 4 corpus distributor ingestion (2026-05-18)
 *
 * Pages through a distributor's keyword search and inserts priced parts into
 * `pretraining_extracted_parts` (~/.forge-truth/forge-truth.db). Each API page
 * becomes one row in `pretraining_spec_documents` so per-part provenance is
 * preserved end-to-end.
 *
 * Unblocks Engine C reference-product anchoring: the existing corpus has 9,121
 * extracted parts but only 48 with prices (5.6%). Distributors publish per-
 * SKU pricing for ~all SKUs, so a single distributor catalogue sweep adds
 * 100s-1000s of priced records per component class.
 *
 * Schema additions (idempotent at script start):
 *   - pretraining_spec_documents.source_type TEXT
 *       'manufacturer_datasheet' (existing rows, set via DEFAULT migration)
 *       'distributor_listing'    (new rows from this script)
 *   - pretraining_spec_documents.distributor TEXT      (e.g. 'mouser')
 *   - pretraining_spec_documents.distributor_keyword TEXT (e.g. 'DC-DC converter')
 *   - pretraining_spec_documents.distributor_page INTEGER
 *
 * Usage:
 *   set -a; source ~/.claude/secrets/distributor-apis.env; set +a
 *   npx tsx scripts/ingest-distributor-catalogue.ts \
 *     --distributor=mouser \
 *     --keyword="DC-DC converter" \
 *     --component-class=oem_subsystem \
 *     --max-pages=20 \
 *     --records-per-page=50
 *
 * Cost / budget: Mouser free tier = 1000 calls/day. DigiKey free tier = 1000
 * calls/day (hard-enforced via x-ratelimit-remaining header). 20 pages × 50 =
 * 1000 records per class per distributor per run.
 */

import Database from 'better-sqlite3'
import { homedir } from 'os'
import { join } from 'path'
import { createHash } from 'crypto'
import { writeFileSync, mkdirSync } from 'fs'
import { KEYWORD_MAP, filterTargets, type KeywordTarget } from './distributor-keyword-map'

const DB_PATH = join(homedir(), '.forge-truth/forge-truth.db')
const PROGRESS_PATH = join(homedir(), '.forge-truth/sweep-progress.json')
const STATUS_PATH = join(homedir(), '.forge-truth/sweep-status')

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
function arg(name: string, fallback?: string): string | undefined {
  const flag = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(flag))
  return hit ? hit.slice(flag.length) : fallback
}

const DISTRIBUTOR = (arg('distributor') || 'mouser') as 'mouser' | 'digikey' | 'farnell'
const KEYWORD = arg('keyword') || 'DC-DC converter'
const COMPONENT_CLASS = arg('component-class') || 'oem_subsystem'
const MAX_PAGES = parseInt(arg('max-pages', '20')!, 10)
const RECORDS_PER_PAGE = parseInt(arg('records-per-page', '50')!, 10)
const DRY_RUN = process.argv.includes('--dry-run')
const ALL_CLASSES = process.argv.includes('--all-classes')
// Filter for --all-classes mode. Comma-separated. e.g. --classes=power_semiconductor,sensor
const CLASS_FILTER = (arg('classes') || '').split(',').filter(Boolean)
// Restrict to one distributor in --all-classes mode.
const DIST_FILTER = (arg('only-distributor') || '') as '' | 'mouser' | 'digikey'

if (!ALL_CLASSES && !['mouser', 'digikey', 'farnell'].includes(DISTRIBUTOR)) {
  console.error(`unsupported distributor: ${DISTRIBUTOR}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Schema migration (idempotent)
// ---------------------------------------------------------------------------
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

function ensureColumn(table: string, col: string, type: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!cols.find((c) => c.name === col)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`).run()
    console.log(`[migrate] added ${table}.${col} ${type}`)
  }
}

ensureColumn('pretraining_spec_documents', 'source_type', 'TEXT')
ensureColumn('pretraining_spec_documents', 'distributor', 'TEXT')
ensureColumn('pretraining_spec_documents', 'distributor_keyword', 'TEXT')
ensureColumn('pretraining_spec_documents', 'distributor_page', 'INTEGER')

// Backfill existing rows (any row without source_type is a manufacturer datasheet)
const updated = db
  .prepare(
    `UPDATE pretraining_spec_documents SET source_type='manufacturer_datasheet' WHERE source_type IS NULL`,
  )
  .run()
if (updated.changes > 0) console.log(`[migrate] backfilled source_type on ${updated.changes} rows`)

// ---------------------------------------------------------------------------
// Distributor adapters — minimal page fetchers (not the existing MPN-lookup
// adapters which only do exact match)
// ---------------------------------------------------------------------------
interface NormalisedPart {
  partNumber: string
  manufacturer: string
  description: string
  unitPriceGbp: number | null
  productUrl: string
  datasheetUrl: string | null
  category: string | null
  rawExcerpt: string
}

async function pageMouser(
  keyword: string,
  startingRecord: number,
  records: number,
): Promise<NormalisedPart[]> {
  const key = process.env.MOUSER_API_KEY
  if (!key) throw new Error('MOUSER_API_KEY not set')

  const res = await fetch(
    `https://api.mouser.com/api/v2/search/keyword?apiKey=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        SearchByKeywordRequest: {
          keyword,
          records,
          startingRecord,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  )

  if (!res.ok) throw new Error(`Mouser HTTP ${res.status}`)

  const data = (await res.json()) as {
    SearchResults?: {
      NumberOfResult?: number
      Parts?: Array<{
        ManufacturerPartNumber?: string
        Manufacturer?: string
        Description?: string
        DataSheetUrl?: string
        Category?: string
        ProductDetailUrl?: string
        PriceBreaks?: Array<{ Quantity?: string | number; Price?: string; Currency?: string }>
      }>
    }
  }

  const parts = data.SearchResults?.Parts ?? []
  return parts.map((p) => {
    // PriceBreaks for GBP locale arrive as "£1.45"
    let priceGbp: number | null = null
    const breaks = Array.isArray(p.PriceBreaks) ? p.PriceBreaks : []
    if (breaks.length > 0) {
      // Use smallest qty break (qty=1 when present)
      const sorted = [...breaks].sort((a, b) => {
        const qa = typeof a.Quantity === 'number' ? a.Quantity : parseInt(String(a.Quantity || '1'), 10)
        const qb = typeof b.Quantity === 'number' ? b.Quantity : parseInt(String(b.Quantity || '1'), 10)
        return (qa || 0) - (qb || 0)
      })
      const priceStr = String(sorted[0].Price || '').replace(/[^0-9.]/g, '')
      const num = parseFloat(priceStr)
      if (Number.isFinite(num)) priceGbp = num
    }
    return {
      partNumber: p.ManufacturerPartNumber || '',
      manufacturer: p.Manufacturer || '',
      description: p.Description || '',
      unitPriceGbp: priceGbp,
      productUrl: p.ProductDetailUrl || '',
      datasheetUrl: p.DataSheetUrl || null,
      category: p.Category || null,
      rawExcerpt: JSON.stringify({
        mfr: p.Manufacturer,
        pn: p.ManufacturerPartNumber,
        desc: p.Description,
        cat: p.Category,
        breaks,
      }),
    }
  })
}

// Last-seen rate-limit remaining counters per distributor. Mouser does not
// expose a header so it stays null; DigiKey returns `x-ratelimit-remaining`.
const rateLimitRemaining: Record<'mouser' | 'digikey' | 'farnell', number | null> = {
  mouser: null,
  digikey: null,
  farnell: null,
}

async function pageDigikey(
  keyword: string,
  offset: number,
  limit: number,
): Promise<NormalisedPart[]> {
  const id = process.env.DIGIKEY_CLIENT_ID
  const secret = process.env.DIGIKEY_CLIENT_SECRET
  if (!id || !secret) throw new Error('DIGIKEY_CLIENT_ID / DIGIKEY_CLIENT_SECRET not set')

  // Get / cache token
  const cached = (globalThis as any).__dkToken as string | undefined
  const cachedUntil = (globalThis as any).__dkExpiresAt as number | undefined
  let token = cached
  if (!token || !cachedUntil || cachedUntil < Date.now()) {
    const tokRes = await fetch('https://api.digikey.com/v1/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials`,
      signal: AbortSignal.timeout(15_000),
    })
    if (!tokRes.ok) throw new Error(`DigiKey token HTTP ${tokRes.status}`)
    const tok = (await tokRes.json()) as { access_token: string; expires_in: number }
    token = tok.access_token
    ;(globalThis as any).__dkToken = token
    ;(globalThis as any).__dkExpiresAt = Date.now() + (tok.expires_in - 60) * 1000
  }

  const res = await fetch('https://api.digikey.com/products/v4/search/keyword', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-DIGIKEY-Client-Id': id,
      'X-DIGIKEY-Locale-Site': 'UK',
      'X-DIGIKEY-Locale-Currency': 'GBP',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ Keywords: keyword, Limit: limit, Offset: offset }),
    signal: AbortSignal.timeout(30_000),
  })

  // Surface rate-limit headers for budget tracking
  const remaining = res.headers.get('x-ratelimit-remaining')
  if (remaining) {
    const n = parseInt(remaining, 10)
    if (Number.isFinite(n)) rateLimitRemaining.digikey = n
    console.log(`[digikey] x-ratelimit-remaining=${remaining}`)
  }

  if (res.status === 429) {
    // Hard rate-limit hit. Surface as an explicit error type the loop can
    // back off on.
    throw new Error('DigiKey HTTP 429 (rate limit)')
  }
  if (!res.ok) throw new Error(`DigiKey HTTP ${res.status}`)

  const data = (await res.json()) as {
    Products?: Array<{
      ManufacturerProductNumber?: string
      Manufacturer?: { Name?: string }
      Description?: { ProductDescription?: string; DetailedDescription?: string }
      UnitPrice?: number
      DatasheetUrl?: string
      Category?: { Name?: string }
      ProductUrl?: string
    }>
  }

  const products = data.Products ?? []
  return products.map((p) => ({
    partNumber: p.ManufacturerProductNumber || '',
    manufacturer: p.Manufacturer?.Name || '',
    description: p.Description?.ProductDescription || p.Description?.DetailedDescription || '',
    unitPriceGbp: typeof p.UnitPrice === 'number' ? p.UnitPrice : null,
    productUrl: p.ProductUrl || '',
    datasheetUrl: p.DatasheetUrl || null,
    category: p.Category?.Name || null,
    rawExcerpt: JSON.stringify({
      mfr: p.Manufacturer?.Name,
      pn: p.ManufacturerProductNumber,
      desc: p.Description?.ProductDescription,
      cat: p.Category?.Name,
      unitPrice: p.UnitPrice,
    }),
  }))
}

async function pageFarnell(
  keyword: string,
  offset: number,
  limit: number,
): Promise<NormalisedPart[]> {
  const key = process.env.FARNELL_API_KEY
  if (!key) throw new Error('FARNELL_API_KEY not set')

  const params = new URLSearchParams({
    term: `any:${keyword}`,
    'storeInfo.id': 'uk.farnell.com',
    'resultsSettings.numberOfResults': String(limit),
    'resultsSettings.offset': String(offset),
    'resultsSettings.responseGroup': 'large',
    'callInfo.responseGroup': 'large',
    'callInfo.apiKey': key,
    versionNumber: '1.4',
  })

  const res = await fetch(`https://api.element14.com/catalog/products?${params.toString()}`, {
    headers: { Accept: 'application/xml' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Farnell HTTP ${res.status}`)
  const xml = await res.text()

  // Extract each <ns1:products>...</ns1:products> block
  const blocks = [...xml.matchAll(/<ns1:products>([\s\S]*?)<\/ns1:products>/g)].map((m) => m[1])
  return blocks.map((b) => {
    const grab = (tag: string): string | null => {
      const m = b.match(new RegExp(`<ns1:${tag}>([^<]*)<\\/ns1:${tag}>`))
      return m ? m[1] : null
    }
    // First price break (lowest qty)
    let priceGbp: number | null = null
    const priceBlocks = [...b.matchAll(/<ns1:prices>([\s\S]*?)<\/ns1:prices>/g)].map((m) => m[1])
    const sorted = priceBlocks
      .map((pb) => {
        const fromM = pb.match(/<ns1:from>([^<]+)<\/ns1:from>/)
        const costM = pb.match(/<ns1:cost>([^<]+)<\/ns1:cost>/)
        if (!fromM || !costM) return null
        return { from: parseInt(fromM[1], 10), cost: parseFloat(costM[1]) }
      })
      .filter((x): x is { from: number; cost: number } => x !== null)
      .sort((a, b) => a.from - b.from)
    if (sorted.length > 0 && Number.isFinite(sorted[0].cost)) priceGbp = sorted[0].cost

    const dsMatch = b.match(/<ns1:datasheets>[\s\S]*?<ns1:url>([^<]+)<\/ns1:url>/)
    return {
      partNumber: grab('translatedManufacturerPartNumber') || '',
      manufacturer: grab('vendorName') || grab('brandName') || '',
      description: grab('displayName') || '',
      unitPriceGbp: priceGbp,
      productUrl: grab('productURL') || '',
      datasheetUrl: dsMatch ? dsMatch[1] : null,
      category: null,
      rawExcerpt: JSON.stringify({
        mfr: grab('vendorName'),
        pn: grab('translatedManufacturerPartNumber'),
        desc: grab('displayName'),
        breaks: sorted,
      }),
    }
  })
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const insertDoc = db.prepare(`
  INSERT INTO pretraining_spec_documents
    (product_class, manufacturer, product_name, source_url, document_type,
     pages, downloaded_at, file_hash, file_path,
     extraction_status, extracted_at, extraction_cost_usd, extraction_model,
     source_type, distributor, distributor_keyword, distributor_page)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const insertPart = db.prepare(`
  INSERT INTO pretraining_extracted_parts
    (document_id, part_name, manufacturer, part_number, quantity,
     unit_price_gbp, module_assignment, sub_module_assignment,
     source_page, raw_excerpt, confidence, component_class)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

// Per-distributor dedup (the POC's behaviour — keeps separate rows when the
// SAME (mfr, mpn) appears under two distributors so we retain dual pricing).
const existingPartSameDist = db.prepare(`
  SELECT 1 FROM pretraining_extracted_parts pep
  JOIN pretraining_spec_documents psd ON psd.id = pep.document_id
  WHERE psd.distributor = ? AND pep.manufacturer = ? AND pep.part_number = ?
  LIMIT 1
`)

// Cross-distributor dedup: in --all-classes mode we DEDUPE across distributors
// by `(manufacturer, part_number)` so we don't double-count parts. The
// preferred distributor (whichever lands first) wins; the second pass
// simply skips. Per-distributor uniqueness above is still enforced inside
// the same distributor too.
const existingPartAnyDist = db.prepare(`
  SELECT 1 FROM pretraining_extracted_parts pep
  WHERE pep.manufacturer = ? AND pep.part_number = ?
  LIMIT 1
`)

// Resume support — find the highest distributor_page already ingested for a
// given (distributor, keyword) tuple. Caller starts at lastPage + 1.
const lastPageFor = db.prepare(`
  SELECT MAX(distributor_page) AS p
  FROM pretraining_spec_documents
  WHERE distributor = ? AND distributor_keyword = ?
`)

// ---------------------------------------------------------------------------
// Structured progress writer — append a record per (target, page) tick to
// ~/.forge-truth/sweep-progress.json plus a single-line status file every
// minute (cheap to read from the engine-watchdog).
// ---------------------------------------------------------------------------

interface ProgressEvent {
  ts: string
  distributor: 'mouser' | 'digikey'
  keyword: string
  componentClass: string
  page: number
  inserted: number
  priced: number
  skipped: number
  rateLimitRemaining: number | null
  totalInserted: number
  durationMs: number
}

const progressEvents: ProgressEvent[] = []

function writeProgress(target?: KeywordTarget) {
  try {
    mkdirSync(join(homedir(), '.forge-truth'), { recursive: true })
    writeFileSync(
      PROGRESS_PATH,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          activeTarget: target
            ? `${target.distributor}:${target.keyword} (${target.componentClass})`
            : null,
          rateLimitRemaining,
          eventCount: progressEvents.length,
          recent: progressEvents.slice(-200),
        },
        null,
        2,
      ),
    )
  } catch (err) {
    console.warn(`[progress] write failed: ${(err as Error).message}`)
  }
}

function writeStatus(line: string) {
  try {
    mkdirSync(join(homedir(), '.forge-truth'), { recursive: true })
    writeFileSync(STATUS_PATH, `${new Date().toISOString()} ${line}\n`)
  } catch (err) {
    console.warn(`[status] write failed: ${(err as Error).message}`)
  }
}

/**
 * Sweep a single (distributor, keyword, componentClass) target. Used by both
 * the legacy single-target CLI mode AND the new --all-classes orchestrator.
 *
 * Resumes from the highest distributor_page already on disk. Cross-distributor
 * dedup is opt-in via the `crossDistributorDedup` flag — set to true only in
 * --all-classes mode, false for single-target mode to preserve the POC's
 * "same MPN under two distributors keeps both rows" semantics.
 */
async function sweepTarget(
  target: KeywordTarget,
  opts: {
    maxPages: number
    recordsPerPage: number
    dryRun: boolean
    crossDistributorDedup: boolean
  },
): Promise<{ inserted: number; priced: number; skipped: number; pages: number }> {
  const start = Date.now()
  let totalInserted = 0
  let totalPriced = 0
  let totalSkipped = 0
  let pagesDone = 0

  // Resume — start one past the highest already-recorded page
  const resumeRow = opts.dryRun
    ? { p: null as number | null }
    : (lastPageFor.get(target.distributor, target.keyword) as { p: number | null })
  const startPage = resumeRow?.p == null ? 0 : resumeRow.p + 1
  if (startPage > 0) {
    console.log(
      `[${target.distributor}:${target.keyword}] resume from page ${startPage} (last seen ${resumeRow.p})`,
    )
  }

  for (let page = startPage; page < startPage + opts.maxPages; page++) {
    const offset = page * opts.recordsPerPage
    let parts: NormalisedPart[] = []
    try {
      if (target.distributor === 'mouser') {
        parts = await pageMouser(target.keyword, offset, opts.recordsPerPage)
      } else if (target.distributor === 'digikey') {
        parts = await pageDigikey(target.keyword, offset, opts.recordsPerPage)
      }
    } catch (err) {
      const msg = (err as Error).message
      console.error(`[${target.distributor}:${target.keyword} p${page}] fetch failed: ${msg}`)
      // On 429 or daily-cap exhaustion, back off long. Otherwise stop this target.
      if (msg.includes('429') || msg.includes('rate limit')) {
        console.warn(`[${target.distributor}] rate-limited — sleeping 60 min before next target`)
        await new Promise((r) => setTimeout(r, 60 * 60 * 1000))
      }
      break
    }

    if (parts.length === 0) {
      console.log(`[${target.distributor}:${target.keyword} p${page}] no more results — stopping`)
      break
    }

    if (opts.dryRun) {
      console.log(
        `[${target.distributor}:${target.keyword} p${page}] DRY: ${parts.length} parts, sample:`,
        { mfr: parts[0].manufacturer, pn: parts[0].partNumber, price: parts[0].unitPriceGbp },
      )
      pagesDone++
      await new Promise((r) => setTimeout(r, 100))
      continue
    }

    const docHash = createHash('sha256')
      .update(
        `${target.distributor}|${target.keyword}|${page}|${opts.recordsPerPage}|${new Date()
          .toISOString()
          .slice(0, 10)}`,
      )
      .digest('hex')

    const txn = db.transaction(() => {
      const docResult = insertDoc.run(
        target.componentClass,
        target.distributor,
        `${target.keyword} (page ${page})`,
        `${target.distributor}-api://${encodeURIComponent(target.keyword)}?page=${page}`,
        'catalogue',
        1,
        new Date().toISOString(),
        docHash,
        '',
        'done',
        new Date().toISOString(),
        0.0,
        `${target.distributor}-api-v1`,
        'distributor_listing',
        target.distributor,
        target.keyword,
        page,
      )
      const documentId = docResult.lastInsertRowid as number

      let priced = 0
      let inserted = 0
      let skipped = 0
      for (const part of parts) {
        if (!part.partNumber || !part.manufacturer) {
          skipped++
          continue
        }
        // Cross-distributor dedup in --all-classes; otherwise same-distributor only
        const dup = opts.crossDistributorDedup
          ? existingPartAnyDist.get(part.manufacturer, part.partNumber)
          : existingPartSameDist.get(target.distributor, part.manufacturer, part.partNumber)
        if (dup) {
          skipped++
          continue
        }
        insertPart.run(
          documentId,
          part.description || part.partNumber,
          part.manufacturer,
          part.partNumber,
          null,
          part.unitPriceGbp,
          null,
          null,
          null,
          part.rawExcerpt,
          1.0,
          target.componentClass,
        )
        inserted++
        if (part.unitPriceGbp !== null) priced++
      }
      return { inserted, priced, skipped }
    })

    const result = txn()
    totalInserted += result.inserted
    totalPriced += result.priced
    totalSkipped += result.skipped
    pagesDone++

    console.log(
      `[${target.distributor}:${target.keyword} p${page}] +${result.inserted} parts (${result.priced} priced, ${result.skipped} skipped), running: ${totalInserted}`,
    )

    progressEvents.push({
      ts: new Date().toISOString(),
      distributor: target.distributor,
      keyword: target.keyword,
      componentClass: target.componentClass,
      page,
      inserted: result.inserted,
      priced: result.priced,
      skipped: result.skipped,
      rateLimitRemaining: rateLimitRemaining[target.distributor],
      totalInserted,
      durationMs: Date.now() - start,
    })
    writeProgress(target)
    writeStatus(
      `sweep ${target.distributor}:${target.keyword} p${page} +${result.inserted} (running ${totalInserted})`,
    )

    // Polite delay (POC default). Mouser tolerates higher; DigiKey we slow on.
    await new Promise((r) => setTimeout(r, target.distributor === 'digikey' ? 500 : 300))

    // Bail early if DigiKey rate-limit is nearly exhausted
    if (target.distributor === 'digikey' && rateLimitRemaining.digikey !== null && rateLimitRemaining.digikey < 20) {
      console.warn(`[digikey] rate-limit remaining=${rateLimitRemaining.digikey} — sleeping 60 min`)
      await new Promise((r) => setTimeout(r, 60 * 60 * 1000))
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(
    `[${target.distributor}:${target.keyword}] done in ${elapsed}s — ${totalInserted} inserted (${totalPriced} priced, ${totalSkipped} skipped)`,
  )
  return { inserted: totalInserted, priced: totalPriced, skipped: totalSkipped, pages: pagesDone }
}

async function runAllClasses() {
  const filterArgs = {
    classes: CLASS_FILTER.length > 0 ? CLASS_FILTER : undefined,
    distributor: DIST_FILTER || undefined,
  }
  const targets = filterTargets(filterArgs as any)
  console.log(`\n=== --all-classes sweep ===`)
  console.log(`tuples:           ${targets.length}`)
  console.log(`mouser targets:   ${targets.filter((t) => t.distributor === 'mouser').length}`)
  console.log(`digikey targets:  ${targets.filter((t) => t.distributor === 'digikey').length}`)
  console.log(`filter.classes:   ${CLASS_FILTER.join(',') || '(all)'}`)
  console.log(`filter.dist:      ${DIST_FILTER || '(both)'}`)
  console.log(`dry_run:          ${DRY_RUN}`)
  console.log()

  const mouserTargets = targets.filter((t) => t.distributor === 'mouser')
  const digikeyTargets = targets.filter((t) => t.distributor === 'digikey')

  // Run the two distributor lanes in parallel — independent rate limits + token buckets.
  const lanes: Array<Promise<void>> = []

  const runLane = async (lane: KeywordTarget[], laneName: string) => {
    let laneInserted = 0
    for (const target of lane) {
      writeStatus(`active lane=${laneName} target=${target.keyword} class=${target.componentClass}`)
      const r = await sweepTarget(target, {
        maxPages: target.maxPages,
        recordsPerPage: 50,
        dryRun: DRY_RUN,
        crossDistributorDedup: true,
      })
      laneInserted += r.inserted
      writeStatus(`lane=${laneName} done target=${target.keyword} inserted=${r.inserted}`)
    }
    console.log(`[lane:${laneName}] DONE — ${laneInserted} total parts inserted across ${lane.length} targets`)
  }

  if (mouserTargets.length > 0) lanes.push(runLane(mouserTargets, 'mouser'))
  if (digikeyTargets.length > 0) lanes.push(runLane(digikeyTargets, 'digikey'))

  await Promise.all(lanes)
  writeProgress()
  writeStatus(`SWEEP COMPLETE at ${new Date().toISOString()}`)
}

async function main() {
  if (ALL_CLASSES) {
    await runAllClasses()
    return
  }

  console.log(`\n=== Distributor ingest (single-target) ===`)
  console.log(`distributor:      ${DISTRIBUTOR}`)
  console.log(`keyword:          ${KEYWORD}`)
  console.log(`component_class:  ${COMPONENT_CLASS}`)
  console.log(`max_pages:        ${MAX_PAGES}`)
  console.log(`records_per_page: ${RECORDS_PER_PAGE}`)
  console.log(`dry_run:          ${DRY_RUN}`)
  console.log()

  if (DISTRIBUTOR === 'farnell') {
    // Single-target Farnell still uses the inline page fetcher path (POC contract)
    // — sweepTarget only supports mouser/digikey for the all-classes sweep.
    console.error('--distributor=farnell not supported in refactored single mode; use POC or extend sweepTarget')
    return
  }

  await sweepTarget(
    {
      componentClass: COMPONENT_CLASS as any,
      distributor: DISTRIBUTOR as any,
      keyword: KEYWORD,
      maxPages: MAX_PAGES,
      rationale: 'single-target CLI invocation',
    },
    {
      maxPages: MAX_PAGES,
      recordsPerPage: RECORDS_PER_PAGE,
      dryRun: DRY_RUN,
      crossDistributorDedup: false,
    },
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.close())
