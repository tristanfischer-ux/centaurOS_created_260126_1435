#!/usr/bin/env -S npx tsx
/**
 * @file scripts/ingest/ingest-priced-principals.ts
 *
 * The SECOND HALF of the "growing database" loop (the writeback half).
 *
 * ── THE LOOP ─────────────────────────────────────────────────────────────────
 * The BoM engine prices parts DB-FIRST from `~/.forge-truth/forge-truth.db`
 * table `pretraining_extracted_parts`. When it can't find a comparable part for
 * a big PRINCIPAL (an 86 kW chiller, a 1 MW PCS, a 1500 A bus contactor), it
 * falls back to a hand-coded rating-based estimate AND appends the miss to a
 * queue file: `~/.forge-truth/price-ingest-queue.jsonl`.
 *
 * THIS job drains that queue: for each missing principal it asks a capable LLM
 * for a REAL commercial product + UK trade price, VERIFIES the answer against
 * the engine's own estimate (the sanity anchor) so no hallucinated junk reaches
 * the DB, and writes the row back so the NEXT engine run prices it from real
 * data instead of the estimate. Over time the DB grows and the estimates retire.
 *
 * This is an OFF-CHAIN INGEST job (scripts/ingest/*), NOT a chain script — it is
 * allowed to call the live OpenRouter LLM and to write the DB (the chain reads
 * DB-only; see the CHAIN-AS-DB-CONSUMER PRINCIPLE in CLAUDE.md). It does NOT call
 * any live distributor API (those stay in the distributor ingest jobs).
 *
 * ── INPUT — the queue ────────────────────────────────────────────────────────
 *   ~/.forge-truth/price-ingest-queue.jsonl  (one JSON object per line)
 *   { key, noun, spec, name, requirement, est_unit_gbp, tag }
 *   - key:          dedup id (e.g. "chiller|86kw")
 *   - noun/spec:    "chiller" / "86kw"
 *   - name:         "liquid cooling chiller"
 *   - requirement:  full text incl. the rating
 *   - est_unit_gbp: the engine's current hand-coded estimate (the SANITY ANCHOR)
 *
 * ── OUTPUT — writeback to pretraining_extracted_parts ────────────────────────
 * Column set + conventions mirror scripts/ingest/seed-industrial-oem-prices.ts
 * exactly (a synthetic parent doc as the NOT-NULL FK target; part_name /
 * manufacturer / part_number / quantity / unit_price_gbp / component_class /
 * confidence / source_doc_id / discovered_at / discovery_source). embedding is
 * left NULL — a separate backfill computes embeddings.
 *   discovery_source = 'price_ingest_<YYYY-MM-DD>'  (date via --date / INGEST_DATE)
 *
 * ── VERIFICATION (no hallucinated junk in the DB) ────────────────────────────
 * A result is REJECTED (skipped + logged, never written) when ANY holds:
 *   - confidence === 'low'
 *   - unit_price_gbp ≤ 0 or non-finite or absurd (> £50,000,000)
 *   - unit_price_gbp diverges from est_unit_gbp by more than 4× either way
 *     (the estimate is a sanity anchor — a real 86 kW chiller is within a few×
 *      of £51,600, not £5 or £5M). Skipped when est_unit_gbp ≤ 0 (no anchor).
 *   - manufacturer or part_number empty / obviously fake (N/A, generic, TBD,
 *     example, unknown, tbc, n.a., none, …)
 *
 * ── SAFETY + ERGONOMICS ──────────────────────────────────────────────────────
 *   - DRY-RUN by default: prints each proposed writeback + accept/reject reason,
 *     writes NOTHING. Only `--commit` opens the DB writable and INSERTs.
 *   - IDEMPOTENT: a key is skipped if a price_ingest_% row already exists whose
 *     part_name contains the noun + the spec (re-runs don't duplicate).
 *   - DRAINING: after a successful --commit of a key, that line is removed from
 *     the queue file (the file is rewritten without the processed keys).
 *   - Concurrency ≤ 3 LLM calls; each call capped ~30 s; individual failures are
 *     skipped + logged, never crash the batch.
 *   - `--selftest` exercises the PURE verification predicate (no LLM, no DB).
 *
 * Usage:
 *   npx tsx scripts/ingest/ingest-priced-principals.ts            # DRY RUN
 *   npx tsx scripts/ingest/ingest-priced-principals.ts --commit   # write + drain
 *   npx tsx scripts/ingest/ingest-priced-principals.ts --selftest # pure predicate
 *   npx tsx scripts/ingest/ingest-priced-principals.ts --date 2026-06-25
 *
 * British spelling throughout.
 */

import Database from 'better-sqlite3'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

// ── env (same places the chain + benchmark-expectation read) ────────────────────
for (const p of [
  resolve(process.cwd(), '.env.local'),
  resolve(homedir(), '.claude/secrets/openrouter.env'),
]) {
  try {
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* ignore */ }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const DB_PATH = resolve(homedir(), '.forge-truth', 'forge-truth.db')
const QUEUE_PATH = resolve(homedir(), '.forge-truth', 'price-ingest-queue.jsonl')
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''
const INGEST_MODEL = process.env.INGEST_MODEL || 'z-ai/glm-5.2' // most capable in the stack
const MAX_CONCURRENCY = 3
// Default ~30 s per the cost-discipline cap. A reasoning model (GLM-5.2) needs
// more room before it emits the JSON — raise via INGEST_LLM_TIMEOUT_MS when the
// configured model thinks before answering.
const LLM_TIMEOUT_MS = Number(process.env.INGEST_LLM_TIMEOUT_MS || 30_000)
// The estimate is a SANITY ANCHOR. A real part should be within a few× of it.
const DIVERGENCE_FACTOR = Number(process.env.INGEST_DIVERGENCE_FACTOR || 4)
const ABSURD_PRICE_GBP = 50_000_000

const PARENT_DOC_URL = 'internal:price-ingest'
const PARENT_DOC_HASH = 'internal:price-ingest-principals' // file_hash sentinel (stable, reused)
const NOW_ISO = new Date().toISOString()

const FAKE_TOKENS = new Set([
  'n/a', 'na', 'n.a.', 'n.a', 'none', 'null', 'generic', 'tbd', 'tbc',
  'example', 'unknown', 'unspecified', 'placeholder', 'sample', 'xxx', 'todo',
  '-', '—', '?', 'various', 'assorted',
])

// ── args ────────────────────────────────────────────────────────────────────
const ARGV = process.argv.slice(2)
const COMMIT = ARGV.includes('--commit')
const SELFTEST = ARGV.includes('--selftest')
function argValue(flag: string): string | undefined {
  const i = ARGV.indexOf(flag)
  return i >= 0 && i + 1 < ARGV.length ? ARGV[i + 1] : undefined
}
const INGEST_DATE = argValue('--date') || process.env.INGEST_DATE || NOW_ISO.slice(0, 10)
const DISCOVERY_SOURCE = `price_ingest_${INGEST_DATE}`

// ── types ───────────────────────────────────────────────────────────────────
interface QueueEntry {
  key: string
  noun: string
  spec: string
  name: string
  requirement: string
  est_unit_gbp: number
  tag?: string
}

interface LlmResult {
  manufacturer: string
  part_number: string
  part_name: string
  unit_price_gbp: number
  component_class: string
  description: string
  confidence: 'high' | 'medium' | 'low' | string
}

type Verdict = { accept: true } | { accept: false; reason: string }

// ── PURE verification predicate (testable without LLM or DB) ─────────────────
function looksFake(s: string): boolean {
  const t = String(s || '').trim().toLowerCase()
  if (!t) return true
  if (FAKE_TOKENS.has(t)) return true
  // e.g. "example part", "generic chiller", "tbd-001"
  if (/^(example|generic|placeholder|sample|unknown|tbd|tbc)\b/.test(t)) return true
  return false
}

// ── canonical unit casing ───────────────────────────────────────────────────
// The DB price resolver (`_db_spec_price` in scripts/requirements_bom.py) matches
// a part by  lower(part_name) LIKE '%<noun>%' AND lower(part_name) LIKE '%<spec>%'
// — where <spec> is the SPACED human form ("86 kw", "1500 a", "1.25 mva"). So a
// row whose part_name reads "Aermec AN 086 Air-Cooled Liquid Chiller" (has the
// noun but NOT "86 kW") can never be found. We therefore GUARANTEE both the noun
// and a canonical "<Number> <UNIT>" form are present in the stored part_name.
//
// Standard unit casing (lowercase compact token → canonical display form). The
// match key is the lower-cased unit; the value is how it should render.
const UNIT_CASING: Record<string, string> = {
  // power / energy
  w: 'W', kw: 'kW', mw: 'MW', gw: 'GW',
  wh: 'Wh', kwh: 'kWh', mwh: 'MWh', gwh: 'GWh',
  va: 'VA', kva: 'kVA', mva: 'MVA', gva: 'GVA',
  // electrical
  v: 'V', kv: 'kV', mv: 'mV',
  a: 'A', ka: 'kA', ma: 'mA',
  ah: 'Ah', mah: 'mAh', kah: 'kAh',
  // misc that may appear as a spec unit
  hz: 'Hz', khz: 'kHz', mhz: 'MHz',
  bar: 'bar', pa: 'Pa', kpa: 'kPa', mpa: 'MPa',
  l: 'L', kg: 'kg', t: 't', m: 'm', mm: 'mm',
}

/**
 * Convert a compact spec token (e.g. "86kw", "1500a", "1.25mva", "280ah", "11kv")
 * into its spaced, correctly-cased human form ("86 kW", "1500 A", "1.25 MVA",
 * "280 Ah", "11 kV"). Returns null when the token has no recognisable
 * <number><unit> shape so callers can fall back gracefully.
 * PURE — no I/O.
 */
export function humaniseSpec(spec: string): { number: string; unit: string; human: string } | null {
  const t = String(spec || '').trim()
  if (!t) return null
  // <number><optional space><unit-letters>. Number may carry a decimal point.
  const m = t.match(/^([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z]+)$/)
  if (!m) return null
  const number = m[1]
  const unitKey = m[2].toLowerCase()
  const unit = UNIT_CASING[unitKey] ?? m[2].toUpperCase()
  return { number, unit, human: `${number} ${unit}` }
}

/**
 * Build the part_name to STORE so the DB price resolver can find it on the next
 * engine run: keep the LLM's descriptive name, but GUARANTEE it contains BOTH the
 * queue entry's `noun` and a human-readable form of its `spec`. A canonical
 * " · <Number> <UNIT>" suffix is appended only for whichever of (noun, spec) is
 * not already present (case-insensitive). The description is NOT touched.
 * PURE — no LLM, no DB. Tested by --selftest.
 */
export function canonicalPartName(llmName: string, noun: string, spec: string): string {
  let name = String(llmName || '').trim()
  const lower = () => name.toLowerCase()

  const suffixes: string[] = []

  // 1) Noun must be present (case-insensitive substring).
  const nounT = String(noun || '').trim()
  if (nounT && !lower().includes(nounT.toLowerCase())) {
    suffixes.push(nounT)
  }

  // 2) Spec must be present as its human form (case-insensitive substring).
  const h = humaniseSpec(spec)
  if (h) {
    // Already present in either the spaced human form OR a compact form
    // (e.g. "86kW")? Then nothing to add.
    const compact = `${h.number}${h.unit}`.toLowerCase()
    if (!lower().includes(h.human.toLowerCase()) && !lower().includes(compact)) {
      suffixes.push(h.human)
    }
  }

  if (suffixes.length) {
    name = (name ? `${name} · ` : '') + suffixes.join(' · ')
  }
  return name
}

/**
 * The two LIKE needles the idempotency check matches against a stored part_name.
 * MUST mirror what `canonicalPartName` actually writes:
 *   - the noun, lower-cased
 *   - the spec in its HUMANISED, spaced form ("86 kW" → "86 kw"), NOT the raw
 *     compact token ("86kw") — because canonicalPartName stores the spaced form.
 * Falls back to the raw spec (lower-cased) when humaniseSpec returns null
 * (non-spec token), and to `name` when `noun` is empty. A '' needle becomes a
 * '%%' LIKE that matches anything, so the other needle is the real filter.
 * PURE — no I/O. Tested by --selftest.
 */
export function existsLikeNeedles(noun: string, name: string, spec: string): { noun: string; spec: string } {
  const nounNeedle = String(noun || name || '').trim().toLowerCase()
  const h = humaniseSpec(spec)
  // Match the SPACED human form ("86 kw") — that's what canonicalPartName stored.
  const specNeedle = (h ? h.human : String(spec || '')).trim().toLowerCase()
  return { noun: nounNeedle, spec: specNeedle }
}

/**
 * Decide whether an LLM-sourced part is safe to write back, using the engine's
 * own estimate as a sanity anchor. PURE — no I/O. Exported logic, tested by --selftest.
 */
export function verifyResult(r: LlmResult, estUnitGbp: number): Verdict {
  if (!r || typeof r !== 'object') return { accept: false, reason: 'no result object' }
  const conf = String(r.confidence || '').trim().toLowerCase()
  if (conf === 'low') return { accept: false, reason: 'confidence=low' }

  const price = Number(r.unit_price_gbp)
  if (!Number.isFinite(price) || price <= 0)
    return { accept: false, reason: `non-positive/non-finite price (£${r.unit_price_gbp})` }
  if (price > ABSURD_PRICE_GBP)
    return { accept: false, reason: `absurd price (£${Math.round(price).toLocaleString()})` }

  if (looksFake(r.manufacturer))
    return { accept: false, reason: `manufacturer empty/fake ("${r.manufacturer}")` }
  if (looksFake(r.part_number))
    return { accept: false, reason: `part_number empty/fake ("${r.part_number}")` }

  // Divergence-from-estimate sanity anchor (only when there IS a positive anchor).
  const est = Number(estUnitGbp)
  if (Number.isFinite(est) && est > 0) {
    const ratio = price >= est ? price / est : est / price
    if (ratio > DIVERGENCE_FACTOR)
      return {
        accept: false,
        reason: `price £${Math.round(price).toLocaleString()} diverges ${ratio.toFixed(
          1,
        )}× from estimate £${Math.round(est).toLocaleString()} (> ${DIVERGENCE_FACTOR}×)`,
      }
  }
  return { accept: true }
}

// ── the LLM call (OpenRouter, same pattern as benchmark-expectation.ts) ──────────
async function sourceRealPart(e: QueueEntry): Promise<LlmResult | null> {
  if (!OPENROUTER_KEY) return null
  const rating = e.requirement || `${e.name} · ${e.spec}`
  const prompt =
    `You are a senior procurement engineer sourcing a REAL, currently-available commercial ` +
    `product for the UK market. Identify ONE genuine product (real manufacturer + real ` +
    `manufacturer part number / model) that matches this principal item:\n\n` +
    `  Item:        ${e.name}\n` +
    `  Type (noun): ${e.noun}\n` +
    `  Spec:        ${e.spec || '(unspecified)'}\n` +
    `  Requirement: ${rating}\n\n` +
    `Return REALISTIC UK trade (qty-1 list/trade) pricing in GBP and a real manufacturer + MPN. ` +
    `If you are not confident a specific real product matches this spec, set "confidence":"low" ` +
    `(do NOT invent a plausible-looking part number). Never return "N/A", "generic", "TBD" or an ` +
    `example placeholder for the manufacturer or part_number.\n\n` +
    `Return ONLY strict JSON, no commentary:\n` +
    `{\n` +
    `  "manufacturer": "<real manufacturer>",\n` +
    `  "part_number": "<real manufacturer part number / model>",\n` +
    `  "part_name": "<short product name including the rating>",\n` +
    `  "unit_price_gbp": <number, realistic UK qty-1 trade price>,\n` +
    `  "component_class": "<e.g. thermal, mechanical_assembly, electronic_power_module, safety_consumable, magnetic>",\n` +
    `  "description": "<one line: what it is + the matched rating>",\n` +
    `  "confidence": "high|medium|low"\n` +
    `}`
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fractionalforge.com',
        'X-Title': 'ForgeOS price-ingest (growing DB)',
      },
      body: JSON.stringify({
        model: INGEST_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    })
    if (!res.ok) {
      console.error(`[ingest]   LLM HTTP ${res.status} for "${e.key}"`)
      return null
    }
    const j: any = await res.json()
    let raw = j?.choices?.[0]?.message?.content
    if (!raw || typeof raw !== 'string') return null
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) raw = fence[1]
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}')
    if (a === -1 || b === -1) return null
    const p = JSON.parse(raw.slice(a, b + 1))
    return {
      manufacturer: String(p.manufacturer ?? '').trim(),
      part_number: String(p.part_number ?? '').trim(),
      part_name: String(p.part_name ?? '').trim() || `${e.name} ${e.spec}`.trim(),
      unit_price_gbp: Number(p.unit_price_gbp),
      component_class: String(p.component_class ?? '').trim() || 'mechanical_assembly',
      description: String(p.description ?? '').trim() || rating,
      confidence: String(p.confidence ?? '').trim().toLowerCase(),
    }
  } catch (err) {
    console.error(`[ingest]   LLM failed for "${e.key}": ${(err as Error).message}`)
    return null
  }
}

// ── concurrency helper (≤ MAX_CONCURRENCY in flight) ─────────────────────────
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

// ── queue I/O ────────────────────────────────────────────────────────────────
function readQueue(): { entries: QueueEntry[]; rawLines: string[] } {
  if (!existsSync(QUEUE_PATH)) return { entries: [], rawLines: [] }
  const rawLines = readFileSync(QUEUE_PATH, 'utf8').split('\n')
  const entries: QueueEntry[] = []
  for (const line of rawLines) {
    const t = line.trim()
    if (!t) continue
    try {
      const o = JSON.parse(t)
      if (o && typeof o.key === 'string')
        entries.push({
          key: o.key,
          noun: String(o.noun ?? ''),
          spec: String(o.spec ?? ''),
          name: String(o.name ?? ''),
          requirement: String(o.requirement ?? ''),
          est_unit_gbp: Number(o.est_unit_gbp ?? 0),
          tag: o.tag,
        })
    } catch {
      console.error(`[ingest] skipping unparseable queue line: ${t.slice(0, 80)}`)
    }
  }
  return { entries, rawLines }
}

/** Rewrite the queue file keeping only lines whose key is NOT in processedKeys. */
function drainQueue(processedKeys: Set<string>) {
  if (!existsSync(QUEUE_PATH)) return
  const kept: string[] = []
  for (const line of readFileSync(QUEUE_PATH, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      const o = JSON.parse(t)
      if (o && typeof o.key === 'string' && processedKeys.has(o.key)) continue
    } catch { /* keep unparseable lines untouched */ }
    kept.push(t)
  }
  writeFileSync(QUEUE_PATH, kept.length ? kept.join('\n') + '\n' : '')
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`[ingest] forge-truth.db not found at ${DB_PATH}`)
    process.exit(1)
  }

  const { entries } = readQueue()
  console.log(`[ingest] DB:    ${DB_PATH}`)
  console.log(`[ingest] queue: ${QUEUE_PATH}  (${entries.length} entr${entries.length === 1 ? 'y' : 'ies'})`)
  console.log(`[ingest] mode:  ${COMMIT ? 'COMMIT (writes DB + drains queue)' : 'DRY RUN (no writes)'}`)
  console.log(`[ingest] model: ${INGEST_MODEL}   discovery_source: ${DISCOVERY_SOURCE}`)
  console.log(`[ingest] LLM:   ${OPENROUTER_KEY ? 'OPENROUTER_API_KEY present (real calls)' : 'NO KEY — will exercise queue+verify on a STUBBED result'}`)
  console.log('')

  if (!entries.length) {
    console.log('[ingest] queue empty — nothing to do.')
    return
  }

  // De-dup queue keys (keep first occurrence).
  const seen = new Set<string>()
  const unique = entries.filter((e) => (seen.has(e.key) ? false : (seen.add(e.key), true)))

  // Open the DB (readonly in dry-run so we cannot accidentally write).
  const db = new Database(DB_PATH, { readonly: !COMMIT })
  db.pragma('busy_timeout = 5000')

  // Idempotency check: a key already covered by a prior price_ingest_% row
  // whose part_name contains the noun + the spec.
  const findExisting = db.prepare(
    `SELECT id FROM pretraining_extracted_parts
       WHERE discovery_source LIKE 'price_ingest_%'
         AND LOWER(part_name) LIKE '%' || LOWER(?) || '%'
         AND LOWER(part_name) LIKE '%' || LOWER(?) || '%'
       LIMIT 1`,
  )
  function alreadyIngested(e: QueueEntry): boolean {
    // Match against what canonicalPartName ACTUALLY stored: the noun + the SPACED
    // human spec ("86 kw"), not the raw compact token ("86kw"). A '' spec needle
    // becomes a '%%' LIKE that matches anything (noun is the real filter).
    const needles = existsLikeNeedles(e.noun, e.name, e.spec)
    const row = findExisting.get(needles.noun, needles.spec) as { id: number } | undefined
    return !!row
  }

  // Partition: skip already-ingested keys.
  const todo: QueueEntry[] = []
  for (const e of unique) {
    if (alreadyIngested(e)) {
      console.log(`[ingest] SKIP  ${e.key} — already ingested (price_ingest_% row exists for ${e.noun}/${e.spec})`)
    } else {
      todo.push(e)
    }
  }

  // Source each via the LLM (≤3 concurrent). No key → STUB so the verify path still runs.
  const STUB_NOTE = !OPENROUTER_KEY
  const results = await mapLimit(todo, MAX_CONCURRENCY, async (e) => {
    if (STUB_NOTE) {
      console.log(`[ingest] (no LLM key) would call ${INGEST_MODEL} to source: ${e.noun} · ${e.spec || '(unspecified)'}`)
      // Deterministic stub anchored to the estimate so the verify path is exercised.
      const stub: LlmResult = {
        manufacturer: 'STUB',
        part_number: 'STUB-000',
        part_name: `${e.name} ${e.spec}`.trim(),
        unit_price_gbp: e.est_unit_gbp > 0 ? e.est_unit_gbp : 1000,
        component_class: 'mechanical_assembly',
        description: e.requirement,
        confidence: 'low', // stub is never trustworthy → will be rejected
      }
      return { e, r: stub }
    }
    const r = await sourceRealPart(e)
    return { e, r }
  })

  // Verify + (in commit mode) write.
  const insertDoc = COMMIT
    ? db.prepare(
        `INSERT INTO pretraining_spec_documents
           (product_class, manufacturer, product_name, source_url, document_type,
            pages, downloaded_at, file_hash, extraction_status, extracted_at,
            extraction_model, source_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
    : null
  const insertPart = COMMIT
    ? db.prepare(
        `INSERT INTO pretraining_extracted_parts
           (document_id, part_name, manufacturer, part_number, quantity, unit_price_gbp,
            component_class, confidence, source_doc_id, discovered_at, discovery_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
    : null

  // Synthetic parent doc (NOT-NULL FK target) — reused across runs via file_hash.
  let parentDocId = -1
  if (COMMIT) {
    const existingDoc = db
      .prepare(`SELECT id FROM pretraining_spec_documents WHERE file_hash = ?`)
      .get(PARENT_DOC_HASH) as { id: number } | undefined
    if (existingDoc) {
      parentDocId = existingDoc.id
    } else {
      const info = insertDoc!.run(
        'price_ingest_principals',
        '(price ingest)',
        'Price-ingest principals (growing DB writeback)',
        PARENT_DOC_URL,
        'price_ingest',
        0,
        NOW_ISO,
        PARENT_DOC_HASH,
        'done',
        NOW_ISO,
        INGEST_MODEL,
        'price_ingest',
      )
      parentDocId = Number(info.lastInsertRowid)
    }
  }

  let accepted = 0, rejected = 0, llmFailed = 0
  const processedKeys = new Set<string>()

  const writeOne = COMMIT
    ? db.transaction((e: QueueEntry, r: LlmResult) => {
        insertPart!.run(
          parentDocId,
          r.part_name,
          r.manufacturer,
          r.part_number,
          1,
          r.unit_price_gbp,
          r.component_class,
          r.confidence === 'high' ? 0.85 : 0.6, // medium → 0.6
          DISCOVERY_SOURCE, // source_doc_id (also carries the tag for grep)
          NOW_ISO,
          DISCOVERY_SOURCE,
        )
      })
    : null

  console.log('')
  for (const { e, r } of results) {
    if (!r) {
      llmFailed++
      console.log(`[ingest] ⚠ LLM-FAIL  ${e.key} (${e.noun} · ${e.spec}) — no result, left in queue`)
      continue
    }
    const v = verifyResult(r, e.est_unit_gbp)
    const head =
      `${e.noun} · ${e.spec || '(unspecified)'}  →  ${r.manufacturer} ${r.part_number}  ` +
      `£${Number.isFinite(r.unit_price_gbp) ? Math.round(r.unit_price_gbp).toLocaleString() : r.unit_price_gbp}  ` +
      `[${r.confidence}]  (est £${Math.round(e.est_unit_gbp).toLocaleString()})`
    if (v.accept) {
      accepted++
      // GUARANTEE the stored part_name contains BOTH the noun and a human-readable
      // form of the spec, so the engine's DB price resolver (_db_spec_price in
      // requirements_bom.py: LIKE '%<noun>%' AND LIKE '%<spec>%') can find this row
      // on the next run and the growing-DB loop actually closes.
      r.part_name = canonicalPartName(r.part_name, e.noun, e.spec)
      console.log(`[ingest] ✓ ACCEPT  ${head}`)
      console.log(`[ingest]            part_name: ${r.part_name}  ·  class: ${r.component_class}`)
      if (COMMIT) {
        writeOne!(e, r)
        processedKeys.add(e.key)
      } else {
        console.log(`[ingest]            (dry-run — would INSERT into pretraining_extracted_parts, discovery_source=${DISCOVERY_SOURCE})`)
      }
    } else {
      rejected++
      console.log(`[ingest] ✗ REJECT  ${head}`)
      console.log(`[ingest]            reason: ${v.reason} — NOT written, left in queue`)
    }
  }

  db.close()

  // Drain processed keys from the queue (commit mode only).
  if (COMMIT && processedKeys.size) drainQueue(processedKeys)

  console.log('')
  console.log(`[ingest] ── summary ──`)
  console.log(`[ingest]   accepted: ${accepted}${COMMIT ? ` (written + drained)` : ` (dry-run, not written)`}`)
  console.log(`[ingest]   rejected: ${rejected}`)
  console.log(`[ingest]   llm-fail: ${llmFailed}`)
  console.log(`[ingest] ${COMMIT ? 'done.' : 'DRY RUN complete — no writes made, queue unchanged.'}`)
}

// ── selftest (PURE verifyResult — no LLM, no DB) ─────────────────────────────
function selftest() {
  let bad = 0
  const ok = (cond: boolean, msg: string) => { if (!cond) { console.log(`FAIL: ${msg}`); bad++ } }

  // A sane chiller result within a few× of the £51,600 estimate → ACCEPT.
  const sane: LlmResult = {
    manufacturer: 'Trane', part_number: 'CGAM-090', part_name: 'Trane CGAM 86 kW air-cooled chiller',
    unit_price_gbp: 48_000, component_class: 'thermal', description: '86 kW packaged chiller', confidence: 'high',
  }
  ok(verifyResult(sane, 51_600).accept === true, 'sane high-confidence in-band chiller should ACCEPT')

  // Medium confidence still accepts if everything else is sane.
  ok(verifyResult({ ...sane, confidence: 'medium' }, 51_600).accept === true, 'medium confidence should ACCEPT')

  // Low confidence → REJECT.
  ok(verifyResult({ ...sane, confidence: 'low' }, 51_600).accept === false, 'low confidence should REJECT')

  // > 4× too high → REJECT (£5M vs £51.6k ≈ 97×).
  ok(verifyResult({ ...sane, unit_price_gbp: 5_000_000 }, 51_600).accept === false, '£5M vs £51.6k should REJECT (>4×)')
  // > 4× too low → REJECT (£5 vs £51.6k).
  ok(verifyResult({ ...sane, unit_price_gbp: 5 }, 51_600).accept === false, '£5 vs £51.6k should REJECT (>4× low)')
  // Just inside the band (3.5×) → ACCEPT.
  ok(verifyResult({ ...sane, unit_price_gbp: 51_600 * 3.5 }, 51_600).accept === true, '3.5× of estimate should ACCEPT')
  // Just outside the band (4.5×) → REJECT.
  ok(verifyResult({ ...sane, unit_price_gbp: 51_600 * 4.5 }, 51_600).accept === false, '4.5× of estimate should REJECT')

  // Non-positive / non-finite price → REJECT.
  ok(verifyResult({ ...sane, unit_price_gbp: 0 }, 51_600).accept === false, 'zero price should REJECT')
  ok(verifyResult({ ...sane, unit_price_gbp: NaN }, 51_600).accept === false, 'NaN price should REJECT')
  ok(verifyResult({ ...sane, unit_price_gbp: ABSURD_PRICE_GBP + 1 }, 0).accept === false, 'absurd price should REJECT')

  // Fake / empty manufacturer or MPN → REJECT.
  ok(verifyResult({ ...sane, manufacturer: 'N/A' }, 51_600).accept === false, 'manufacturer N/A should REJECT')
  ok(verifyResult({ ...sane, manufacturer: '' }, 51_600).accept === false, 'empty manufacturer should REJECT')
  ok(verifyResult({ ...sane, part_number: 'generic' }, 51_600).accept === false, 'part_number generic should REJECT')
  ok(verifyResult({ ...sane, part_number: 'TBD' }, 51_600).accept === false, 'part_number TBD should REJECT')
  ok(verifyResult({ ...sane, part_number: 'example-001' }, 51_600).accept === false, 'part_number example-* should REJECT')

  // No anchor (est ≤ 0): divergence check is SKIPPED, otherwise-sane result ACCEPTS.
  ok(verifyResult({ ...sane, unit_price_gbp: 999_999 }, 0).accept === true, 'no estimate anchor → skip divergence, ACCEPT')

  // ── canonicalPartName: the resolver-match guarantee ────────────────────────
  // THE bug this closes: the LLM returned "Aermec AN 086 Air-Cooled Liquid
  // Chiller" — contains "chiller" but NOT "86 kW" — so _db_spec_price's
  // LIKE '%chiller%' AND LIKE '%86 kw%' would never find the written row.
  {
    const out = canonicalPartName('Aermec AN 086 Air-Cooled Liquid Chiller', 'chiller', '86kw')
    const lo = out.toLowerCase()
    ok(lo.includes('chiller'), `canonicalPartName must contain noun "chiller" (got: ${out})`)
    ok(lo.includes('86 kw'), `canonicalPartName must contain human spec "86 kw" (got: ${out})`)
  }

  // humaniseSpec: compact token → spaced, correctly-cased form.
  ok(humaniseSpec('86kw')?.human === '86 kW', 'humaniseSpec 86kw → "86 kW"')
  ok(humaniseSpec('1500a')?.human === '1500 A', 'humaniseSpec 1500a → "1500 A"')
  ok(humaniseSpec('1.25mva')?.human === '1.25 MVA', 'humaniseSpec 1.25mva → "1.25 MVA"')
  ok(humaniseSpec('280ah')?.human === '280 Ah', 'humaniseSpec 280ah → "280 Ah"')
  ok(humaniseSpec('11kv')?.human === '11 kV', 'humaniseSpec 11kv → "11 kV"')
  ok(humaniseSpec('400v')?.human === '400 V', 'humaniseSpec 400v → "400 V"')
  ok(humaniseSpec('500kwh')?.human === '500 kWh', 'humaniseSpec 500kwh → "500 kWh"')
  ok(humaniseSpec('garbage')  === null, 'humaniseSpec on non-spec token → null')

  // Noun already present, spec absent → only spec appended.
  {
    const out = canonicalPartName('Trane CGAM air-cooled chiller', 'chiller', '86kw')
    const lo = out.toLowerCase()
    ok(lo.includes('chiller') && lo.includes('86 kw'), `noun present, spec appended (got: ${out})`)
    ok((out.match(/chiller/gi) || []).length === 1, `noun not duplicated when already present (got: ${out})`)
  }

  // Both already present (spaced human form) → name unchanged.
  ok(
    canonicalPartName('86 kW liquid cooling chiller', 'chiller', '86kw') === '86 kW liquid cooling chiller',
    'both noun + spec already present → name unchanged',
  )

  // Compact spec already present ("86kW") → not duplicated as "86 kW".
  {
    const out = canonicalPartName('Aermec 86kW Chiller', 'chiller', '86kw')
    ok(!out.includes('· 86 kW'), `compact spec already present → no redundant suffix (got: ${out})`)
  }

  // Empty spec → only the noun guarantee runs (no spec suffix, no crash).
  {
    const out = canonicalPartName('Some Bus Contactor', 'contactor', '')
    ok(out.toLowerCase().includes('contactor'), `empty spec → noun still guaranteed (got: ${out})`)
  }

  // ── existsLikeNeedles: the idempotency LIKE-needle builder ──────────────────
  // THE bug this closes: rows are STORED via canonicalPartName in the SPACED
  // human form ("86 kW"), but the old existence check matched the RAW compact
  // spec ("86kw") — so a re-run never found the row and would INSERT a duplicate
  // on --commit. The needle must be the spaced human form, lower-cased, with the
  // space preserved so the LIKE is '%86 kw%' (matches stored "86 kW").
  {
    const n = existsLikeNeedles('chiller', 'liquid cooling chiller', '86kw')
    ok(n.noun === 'chiller', `noun needle lower-cased (got: ${n.noun})`)
    ok(n.spec === '86 kw', `spec needle = spaced human form lower-cased (got: ${n.spec})`)
    ok(n.spec.includes(' '), `spaced form keeps its space so LIKE is '%86 kw%' (got: ${n.spec})`)
    // The needle must be a substring of the actual stored part_name (lower-cased)
    // — i.e. the existence check would FIND a row written by canonicalPartName.
    const stored = canonicalPartName('Aermec AN 086 Air-Cooled Liquid Chiller', 'chiller', '86kw').toLowerCase()
    ok(stored.includes(n.noun) && stored.includes(n.spec),
      `needles must match the stored part_name (stored: ${stored} · needles: ${n.noun} / ${n.spec})`)
  }

  // Other unit families humanise the same way ("1500a" → "1500 a", "11kv" → "11 kv").
  ok(existsLikeNeedles('bus contactor', '', '1500a').spec === '1500 a', 'existsLikeNeedles 1500a → "1500 a"')
  ok(existsLikeNeedles('transformer', '', '1.25mva').spec === '1.25 mva', 'existsLikeNeedles 1.25mva → "1.25 mva"')

  // Non-spec token → falls back to the raw spec, lower-cased (no crash, no null).
  ok(existsLikeNeedles('widget', '', 'custom').spec === 'custom', 'non-spec spec → raw lower-cased fallback')

  // Empty spec → '' needle ('%%' matches anything; noun is the real filter).
  ok(existsLikeNeedles('contactor', '', '').spec === '', 'empty spec → empty needle (%% matches anything)')

  // Empty noun → falls back to name.
  ok(existsLikeNeedles('', 'liquid cooling chiller', '86kw').noun === 'liquid cooling chiller',
    'empty noun → falls back to name')

  console.log(bad === 0 ? 'ingest-priced-principals selftest: OK' : `ingest-priced-principals selftest: ${bad} FAIL`)
  if (bad) process.exit(1)
}

// ── entry ────────────────────────────────────────────────────────────────────
if (SELFTEST) selftest()
else main().catch((e) => { console.error(e); process.exit(1) })
