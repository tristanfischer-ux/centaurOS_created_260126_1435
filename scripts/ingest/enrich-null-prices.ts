#!/usr/bin/env npx tsx
/**
 * scripts/ingest/enrich-null-prices.ts — INGEST-SIDE price back-fill for the
 * self-building parts DB (~/.forge-truth/forge-truth.db).
 *
 * ── THE LEVER (BoM ≥8 long-pole) ──────────────────────────────────────────────
 * The design chain already MATCHES real branded parts from the DB and PINS their
 * price: emitter-completion.ts::dbFirstLookup SELECTs `unit_price_gbp`, and
 * buildCompletionWord emits a `mod('list_price_gbp', …)` modifier so Engine B's
 * pre-step pins the catalogue price past the component-class anchor. The chain is
 * NOT bottlenecked on matching or coverage — it is bottlenecked on the fact that
 * the high-value rows it matches carry `unit_price_gbp = NULL`. A NULL-price row
 * cannot fire a list_price_gbp pin, so the BoM line falls back to the class anchor
 * (e.g. a £130 sensor median for a £1,112 mass-flow controller).
 *
 * This job back-fills `unit_price_gbp` on those NULL-price rows by EXACT-MPN
 * distributor lookup (1 call/part — high precision, low quota). It is the
 * INGEST-side complement to ingest-part-list.ts (which seeds distributor_cascade_cache
 * but never touches pretraining_extracted_parts.unit_price_gbp, the field
 * dbFirstLookup actually reads).
 *
 * ── INGEST SIDE — live distributor calls ARE allowed here ─────────────────────
 * This lives under scripts/ingest/* (see CLAUDE.md "CHAIN-AS-DB-CONSUMER"): live
 * Mouser/Digi-Key/Farnell/Nexar adapter calls are permitted ONLY in ingest jobs,
 * never in the chain. Native-first (mouser → digikey → farnell), Nexar last-resort,
 * every call gated through tryAcquire() so it can never exceed a source's daily cap.
 *
 * ── VERIFY-BEFORE-WRITEBACK (absolute — forge-truth.db is GLOBAL/shared) ───────
 * Council was explicit (drawer emitter-completion.ts 2026-06-01): a grown-row
 * price must stay NULL until a verify-leg exists, because a wrong price in the
 * shared DB poisons EVERY future BoM (gate-20/21 fabrication risk). THIS script is
 * that verify-leg. It writes ONLY a price that came from a real distributor listing
 * for THAT EXACT manufacturer + MPN:
 *   • findSkuForPart() is called manufacturer-STRICT — a distributor row whose
 *     manufacturer doesn't match the DB row is rejected by construction.
 *   • the price is the cheapest qty-1 GBP price-break the distributor returned
 *     (a real catalogue number, inherently verified — NOT an LLM/web guess).
 *   • a per-component-class sanity band rejects an out-of-band match (a £0.01 or a
 *     £5,000,000 hit is dropped and the row left NULL rather than risk a bad write).
 * It UPDATEs ONLY `unit_price_gbp` (+ a `discovery_source='price_enrich'` /
 * `discovered_at` provenance stamp); it NEVER touches manufacturer / part_number /
 * component_class. It never clobbers a row that already has a price, and it skips
 * curated-seed rows.
 *
 * Web search is deliberately NOT used as a writeback source: industrial process
 * instruments (Sartorius/Mettler/Bronkhorst probes + MFCs) are predominantly
 * QUOTE-ONLY and their web prices are variant/condition-ambiguous (the same
 * InPro 6860i base MPN renders $1,150 used / $1,815 / $5,670 new across resellers
 * depending on cable length + condition). Writing any single web number against a
 * bare base-MPN row is exactly the fabrication the verify-leg exists to prevent.
 * An honest NULL with a reported coverage rate beats a plausible-looking wrong price.
 *
 * ── DRY-RUN (default) ─────────────────────────────────────────────────────────
 * Default mode prints what it WOULD write (mpn → £price → source) and writes
 * nothing. `--commit` performs the UPDATE inside a transaction.
 *
 * Usage (source ~/.claude/secrets/distributor-apis.env first for keys):
 *   set -a; source ~/.claude/secrets/distributor-apis.env; set +a
 *   npx tsx scripts/ingest/enrich-null-prices.ts                       # dry-run, ALL classes (sizes the crawl)
 *   npx tsx scripts/ingest/enrich-null-prices.ts --class bioreactor    # dry-run, bioreactor instrument slice
 *   npx tsx scripts/ingest/enrich-null-prices.ts --limit 200           # dry-run, first 200 rows
 *   npx tsx scripts/ingest/enrich-null-prices.ts --class bioreactor --commit   # WRITE verified prices
 *
 * British spelling throughout.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { lookupSkuMouser } from '../../src/lib/pdf-engine-v2/lib/distributors/mouser'
import { lookupSkuDigikey } from '../../src/lib/pdf-engine-v2/lib/distributors/digikey'
import { lookupSkuFarnell } from '../../src/lib/pdf-engine-v2/lib/distributors/farnell'
import { lookupSkuNexar } from '../../src/lib/pdf-engine-v2/lib/distributors/nexar'
import type { DistributorResult } from '../../src/lib/pdf-engine-v2/lib/distributors/mouser'
import { tryAcquire } from '../lib/quota-semaphore'

const DB_PATH = resolve(homedir(), '.forge-truth', 'forge-truth.db')
const ENRICH_SOURCE = 'price_enrich' // pretraining_extracted_parts.discovery_source stamp
const NOW_ISO = new Date().toISOString()
const MAX_CONCURRENCY = 3

// ── Component-class sanity bands (qty-1 GBP) ──────────────────────────────────
// A distributor exact-MPN + manufacturer-strict hit is already inherently
// verified; the band is a LAST-LINE guard against an absurd write (a corrupt
// price-break, a currency mix-up, a $0.00 placeholder). Bounds are deliberately
// WIDE — the goal is to reject the impossible, not to second-guess a real
// catalogue price. A class not listed uses DEFAULT_BAND. A hit outside its band
// is NOT written (row left NULL, reported as a band-reject in the coverage stats).
const DEFAULT_BAND: [number, number] = [0.01, 200_000]
const CLASS_PRICE_BANDS: Record<string, [number, number]> = {
  electronic_passive: [0.001, 2_000],
  electronic_discrete: [0.001, 3_000],
  electronic_ic: [0.02, 8_000],
  electronic_connector: [0.05, 3_000],
  electronic_cable: [0.05, 5_000],
  electronic_pcb: [0.5, 60_000],
  electronic_power_module: [1, 80_000],
  sensor: [0.1, 60_000],
  optical: [0.1, 40_000],
  magnetic: [0.1, 120_000],
  mechanical_fastener: [0.001, 500],
  safety_consumable: [0.05, 20_000],
  fluid_path: [0.05, 30_000],
  thermal: [0.5, 120_000],
  motor_actuator: [1, 150_000],
  mechanical_assembly: [1, 200_000],
}

// ── A part_number that is really a free-text descriptor, not an MPN ───────────
// dbFirstLookup already requires length>=4; this additionally rejects rows whose
// "part_number" is a spec phrase ("316L stainless plate", "M6 x 20 bolt", "TBD").
const DESCRIPTOR_RE = /\b(tbd|n\/?a|generic|various|assorted|custom|see\s+spec|to\s+be|specify|standard|grade|sheet|plate|bar|rod|tube|angle|wire|cable\s+\d|bolt|screw|nut|washer|gasket|o-?ring)\b/i
function looksLikeRealMpn(pn: string): boolean {
  const s = pn.trim()
  if (s.length < 4) return false
  if (DESCRIPTOR_RE.test(s)) return false
  // Must contain at least one digit OR be an uppercase-alphanumeric token block
  // (real MPNs are alphanumeric; pure lowercase prose words are descriptors).
  if (!/\d/.test(s) && !/[A-Z]{2,}/.test(s)) return false
  // Reject if it reads as a multi-word English phrase (>=3 space-separated words
  // and no separator/digit cluster) — e.g. "low pressure relief valve".
  const words = s.split(/\s+/)
  if (words.length >= 3 && !/[-_/.]/.test(s) && !/\d/.test(s)) return false
  return true
}

// ── Distributor exact-MPN lookup (native-first, Nexar last-resort) ────────────
// Mirrors ingest-part-list.ts / findSkuForPart cascade ordering, but quota-gates
// each source and returns the cheapest qty-1 GBP across the hits that match the
// declared manufacturer. Returns null on miss / quota-exhausted-before-any-call.
const NATIVE: Array<[string, (mpn: string, hint?: string | null) => Promise<DistributorResult | null>]> = [
  ['mouser', lookupSkuMouser],
  ['digikey', lookupSkuDigikey],
  ['farnell', lookupSkuFarnell],
]

function manufacturerMatches(declared: string, rowMfr: string): boolean {
  const d = declared.trim().toLowerCase()
  if (!d) return true
  const r = (rowMfr ?? '').trim().toLowerCase()
  if (!r) return true // distributor returned no manufacturer — don't reject
  return r.includes(d) || d.includes(r)
}

function qty1Gbp(r: DistributorResult): number | null {
  if (!r.priceGBP || r.priceGBP.length === 0) return null
  const sorted = [...r.priceGBP].sort((a, b) => a.qty - b.qty)
  const p = sorted[0].unitPriceGbp
  return Number.isFinite(p) && p > 0 ? p : null
}

type LookupOutcome =
  | { kind: 'hit'; priceGbp: number; source: string; returnedMfr: string; desc: string }
  | { kind: 'miss' }
  | { kind: 'quota' } // every source capped before a single call could be made

async function lookupPrice(manufacturer: string, mpn: string): Promise<LookupOutcome> {
  let anyCalled = false
  const candidates: Array<{ priceGbp: number; source: string; returnedMfr: string; desc: string }> = []

  for (const [src, fn] of NATIVE) {
    if (!tryAcquire(src)) continue // daily cap reached for this source
    anyCalled = true
    try {
      const r = await fn(mpn, manufacturer || null)
      if (r && manufacturerMatches(manufacturer, r.manufacturer)) {
        const p = qty1Gbp(r)
        if (p != null) candidates.push({ priceGbp: p, source: r.source, returnedMfr: r.manufacturer, desc: r.description })
      }
    } catch { /* try next distributor */ }
  }

  // Nexar last-resort ONLY if no native hit (protects the 100/mo Evaluation quota).
  if (candidates.length === 0 && tryAcquire('nexar')) {
    anyCalled = true
    try {
      const r = await lookupSkuNexar(mpn)
      if (r && manufacturerMatches(manufacturer, r.manufacturer)) {
        const p = qty1Gbp(r)
        if (p != null) candidates.push({ priceGbp: p, source: r.source, returnedMfr: r.manufacturer, desc: r.description })
      }
    } catch { /* fall through */ }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => a.priceGbp - b.priceGbp) // cheapest qty-1
    return { kind: 'hit', ...candidates[0] }
  }
  if (!anyCalled) return { kind: 'quota' }
  return { kind: 'miss' }
}

// ── Concurrency-capped map (≤3) ───────────────────────────────────────────────
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  let stopped = false
  async function worker() {
    while (true) {
      const i = next++
      if (i >= items.length || stopped) return
      out[i] = await fn(items[i], i)
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return out
}

// ── Band helpers (EXPORTED for the regression harness) ────────────────────────
export function bandFor(componentClass: string | null | undefined): [number, number] {
  return CLASS_PRICE_BANDS[String(componentClass ?? '')] ?? DEFAULT_BAND
}
export function priceInBand(priceGbp: number, componentClass: string | null | undefined): boolean {
  const [lo, hi] = bandFor(componentClass)
  return Number.isFinite(priceGbp) && priceGbp >= lo && priceGbp <= hi
}
export { looksLikeRealMpn }

// ── Main ──────────────────────────────────────────────────────────────────────
interface Row {
  id: number
  manufacturer: string
  part_number: string
  component_class: string | null
  part_name: string | null
  discovery_source: string | null
}

function flag(name: string): string | null {
  const argv = process.argv
  const eq = argv.find((a) => a.startsWith(`${name}=`))
  if (eq) return eq.slice(name.length + 1)
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}

async function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`[enrich-null-prices] forge-truth.db not found at ${DB_PATH}`)
    process.exit(1)
  }
  const COMMIT = process.argv.includes('--commit')
  const classFilter = flag('--class')
  const limit = Number(flag('--limit') ?? 0) || 0

  const db = new Database(DB_PATH, { readonly: !COMMIT })
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')

  // ── Size the crawl: total NULL-price rows with a real MPN (no class filter) ──
  const totalNull = (db.prepare(
    `SELECT COUNT(*) AS n FROM pretraining_extracted_parts
       WHERE part_number IS NOT NULL AND LENGTH(TRIM(part_number)) >= 4
         AND unit_price_gbp IS NULL`,
  ).get() as { n: number }).n

  // ── Candidate rows for this run ──────────────────────────────────────────────
  // A `--class foo` filter matches BOTH the exact component_class AND the
  // `foo_completion` self-learning class (so `--class bioreactor` catches the
  // emitter-completion rows tagged `bioreactor_completion`).
  const where: string[] = [
    `part_number IS NOT NULL`,
    `LENGTH(TRIM(part_number)) >= 4`,
    `unit_price_gbp IS NULL`,
    `manufacturer IS NOT NULL`,
    `manufacturer != ''`,
    // never re-touch a curated seed row
    `(discovery_source IS NULL OR discovery_source NOT LIKE 'curated_oem_seed%')`,
  ]
  const params: unknown[] = []
  if (classFilter) {
    where.push(`(LOWER(IFNULL(component_class,'')) = LOWER(?) OR LOWER(IFNULL(component_class,'')) = LOWER(?))`)
    params.push(classFilter, `${classFilter}_completion`)
  }
  let sql = `SELECT id, manufacturer, part_number, component_class, part_name, discovery_source
             FROM pretraining_extracted_parts
             WHERE ${where.join(' AND ')}
             ORDER BY id`
  if (limit > 0) sql += ` LIMIT ${limit}`

  const raw = db.prepare(sql).all(...params) as Row[]
  // Drop rows whose "part_number" is really a descriptor.
  const rows = raw.filter((r) => looksLikeRealMpn(r.part_number))
  const droppedDescriptors = raw.length - rows.length

  console.log(`[enrich-null-prices] DB: ${DB_PATH}`)
  console.log(`[enrich-null-prices] mode: ${COMMIT ? 'COMMIT (writes verified prices)' : 'DRY-RUN (no writes)'}`)
  console.log(`[enrich-null-prices] TOTAL NULL-price rows with a real MPN (sizes the full crawl): ${totalNull}`)
  if (classFilter) console.log(`[enrich-null-prices] --class ${classFilter} (+ ${classFilter}_completion)`)
  if (limit > 0) console.log(`[enrich-null-prices] --limit ${limit}`)
  console.log(`[enrich-null-prices] candidate rows this run: ${rows.length} (dropped ${droppedDescriptors} descriptor-like part_numbers)`)
  console.log('')

  // ── Prepared UPDATE (price + provenance stamp ONLY) ──────────────────────────
  const updateStmt = db.prepare(
    `UPDATE pretraining_extracted_parts
       SET unit_price_gbp = ?, discovery_source = ?, discovered_at = ?
     WHERE id = ? AND unit_price_gbp IS NULL`,
  )

  const tally = { hit: 0, miss: 0, bandReject: 0, quota: 0, written: 0 }
  const toWrite: Array<{ id: number; price: number; source: string; mpn: string; mfr: string }> = []
  let quotaStop = false

  await mapWithConcurrency(rows, MAX_CONCURRENCY, async (r) => {
    if (quotaStop) return
    const outcome = await lookupPrice(r.manufacturer, r.part_number)
    if (outcome.kind === 'quota') {
      quotaStop = true
      console.log(`[enrich-null-prices]   QUOTA — all distributor sources capped; stopping. Resume after the daily reset.`)
      return
    }
    if (outcome.kind === 'miss') {
      tally.miss++
      return
    }
    // hit
    if (!priceInBand(outcome.priceGbp, r.component_class)) {
      tally.bandReject++
      const [lo, hi] = bandFor(r.component_class)
      console.log(`  BAND-REJECT ${r.manufacturer} ${r.part_number} → £${outcome.priceGbp} via ${outcome.source} (outside ${r.component_class ?? '?'} band [£${lo}, £${hi}]) — left NULL`)
      return
    }
    tally.hit++
    toWrite.push({ id: r.id, price: outcome.priceGbp, source: outcome.source, mpn: r.part_number, mfr: r.manufacturer })
    console.log(`  ${COMMIT ? 'WRITE' : 'WOULD-WRITE'} ${r.manufacturer.slice(0, 22).padEnd(22)} ${r.part_number.padEnd(20)} → £${outcome.priceGbp}  (${outcome.source}, ${r.component_class ?? '?'})`)
  })

  if (COMMIT && toWrite.length > 0) {
    const apply = db.transaction(() => {
      for (const w of toWrite) {
        const info = updateStmt.run(w.price, ENRICH_SOURCE, NOW_ISO, w.id)
        if (info.changes === 1) tally.written++
      }
    })
    apply()
  }

  db.close()

  const attempted = tally.hit + tally.miss + tally.bandReject
  const coverage = attempted > 0 ? ((tally.hit / attempted) * 100).toFixed(1) : '0.0'
  console.log('')
  console.log(`[enrich-null-prices] ── result ──`)
  console.log(`[enrich-null-prices]   attempted (live-looked-up): ${attempted}`)
  console.log(`[enrich-null-prices]   distributor-verified hits : ${tally.hit}`)
  console.log(`[enrich-null-prices]   misses (no catalogue listing): ${tally.miss}`)
  console.log(`[enrich-null-prices]   band-rejects (hit out of sane band): ${tally.bandReject}`)
  console.log(`[enrich-null-prices]   coverage (priced / attempted): ${coverage}%`)
  if (quotaStop) console.log(`[enrich-null-prices]   NOTE: stopped early on quota — coverage is over the rows reached.`)
  if (COMMIT) {
    console.log(`[enrich-null-prices]   ROWS WRITTEN: ${tally.written} (unit_price_gbp + discovery_source='${ENRICH_SOURCE}')`)
    console.log(`[enrich-null-prices]   reverse with: UPDATE pretraining_extracted_parts SET unit_price_gbp=NULL, discovery_source=NULL WHERE discovery_source='${ENRICH_SOURCE}';`)
  } else {
    console.log(`[enrich-null-prices]   DRY-RUN — no writes. Re-run with --commit to write the ${tally.hit} verified price(s).`)
  }
}

// Run only when invoked directly (not when imported, e.g. by the regression
// harness which exercises the exported band/MPN helpers without touching the DB
// or the network). argv[1] is the entry script under tsx.
const invokedDirectly = (() => {
  try {
    const entry = process.argv[1] ?? ''
    return entry.endsWith('enrich-null-prices.ts') || entry.endsWith('enrich-null-prices')
  } catch { return false }
})()
if (invokedDirectly) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
