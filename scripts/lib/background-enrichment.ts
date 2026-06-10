#!/usr/bin/env npx tsx
/**
 * scripts/lib/background-enrichment.ts
 *
 * Tristan 2026-05-24: "Any time that a new project happens, when you do the
 * search and you find something and you add new parts and you find a new
 * supplier, they need to be added to the database... happening live with
 * every project... should be happening in the background."
 *
 * This script runs DETACHED from the chain process. It walks a finished
 * state.json plus the chain's outDir and pushes two kinds of fresh
 * discoveries back into ~/.forge-truth/forge-truth.db:
 *
 *   1) PARTS — reviewer-introduced parts not yet in the library. A reviewer
 *      that picks a part NOT in the Stage 17.6 advisory sets the word's
 *      source_detail to start with "Library override: <justification>".
 *      Every such word is a fresh real-world part we should remember for
 *      the next project. We Brave-verify (manufacturer + part_number +
 *      datasheet), then INSERT INTO pretraining_extracted_parts with an
 *      embedding so future Stage 17.6 queries can retrieve it.
 *
 *   2) SUPPLIERS — companies discovered via Brave web fallback this run
 *      (persist-web-fallback.ts already INSERTED them with the minimum
 *      fields when the supplier section was rendered). We follow up
 *      asynchronously: Brave search for official site / LinkedIn /
 *      Companies House signal, summarise the snippets with Flash-Lite to
 *      extract capability + materials + certifications + revenue band +
 *      etc., then UPDATE the row.
 *
 * Wired into scripts/serial-design-chain-v2.tsx as a detached child
 * process AFTER the final PDF + audits pass. The chain process exits
 * promptly; this process keeps running, appending to background-
 * enrichment.jsonl in the same outDir.
 *
 * Idempotent: rerunning on the same state.json is safe.
 *   - INSERT OR IGNORE on pretraining_extracted_parts via the (manufacturer,
 *     part_number) UNIQUE INDEX created at startup.
 *   - Supplier UPDATE skips rows already enriched_at within the last 30
 *     days (re-enrichment only when stale).
 *
 * Constraints honoured:
 *   - better-sqlite3 (matches scripts/ingest-distributor-catalogue.ts).
 *   - British spelling everywhere (capability, behaviour, enriched).
 *   - Hard runtime cap 600 s — bail with status='timeout' if exceeded.
 *   - Graceful degradation: missing BRAVE_API_KEY → skip Brave; missing
 *     OPENAI_API_KEY → skip embedding (part still inserted, just without
 *     a vector — later embed-backfill picks it up).
 *
 * Usage:
 *   npx tsx scripts/lib/background-enrichment.ts <state.json> <outDir>
 */

import Database from 'better-sqlite3'
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'
import { createHash } from 'crypto'
// Supplier embed-on-write guarantee (growing-DB principle): every supplier row
// we touch ALSO gets a supplier_embeddings row so it is semantically
// searchable. Shared with persist-web-fallback.ts.
import { upsertSupplierEmbedding } from '../supplier-enrichment/embed-supplier'
// Shared MPN-shape predicate — the verify leg's POISON GUARD compares
// normaliseMpn(returned) === normaliseMpn(proposed). Same module the chain
// (Stage 10.6) + gate 20 use, so all three agree on equality.
import { normaliseMpn } from './mpn-shape'

// ---------------------------------------------------------------------------
// Entry-point detection. This file is BOTH an executable (detached post-chain
// enrichment job) AND a library (the chain imports verifyProposedParts for the
// Stage 10.6 synchronous part-verification leg). When IMPORTED, none of the
// script bootstrap below — argv parse, real-DB open + migrations, prepared
// statements, main() — must fire; importing only needs the exported library
// functions + the Brave/embedding helpers. The script bootstrap is gated on
// IS_MAIN (same idiom as fictional-pn-audit.ts). verifyProposedParts is fully
// self-contained: it opens its OWN DB handle from opts.dbPath and never touches
// the script singletons below, so the test + the chain reach it without the
// real forge-truth.db ever being opened.
// ---------------------------------------------------------------------------

const IS_MAIN = /background-enrichment\.(?:ts|js|mjs|cjs)$/.test(process.argv[1] ?? '')

// ---------------------------------------------------------------------------
// CLI args + env loading (mirror chain's pattern so detached child has keys)
// ---------------------------------------------------------------------------

// Script-only bindings (assigned in the IS_MAIN bootstrap below; left undefined
// on import — every consumer of them runs only via main(), which is itself
// IS_MAIN-gated).
let STATE_PATH = ''
let OUT_DIR = ''

if (IS_MAIN) {
  const argv = process.argv.slice(2)
  if (argv.length < 2) {
    console.error('Usage: background-enrichment.ts <state.json> <outDir>')
    process.exit(1)
  }
  STATE_PATH = resolve(argv[0])
  OUT_DIR = resolve(argv[1])

  if (!existsSync(STATE_PATH)) {
    console.error(`[background-enrichment] state file missing: ${STATE_PATH}`)
    process.exit(1)
  }
}

// Load env from the same places the chain does. Detached children don't
// inherit shell env modifications, so we re-read .env.local + secrets files.
for (const envPath of [
  resolve(process.cwd(), '.env.local'),
  resolve(homedir(), '.claude/secrets/distributor-apis.env'),
  resolve(homedir(), '.claude/secrets/tavily.env'),
  resolve(homedir(), '.claude/secrets/brave.env'),
  resolve(homedir(), '.claude/secrets/openrouter.env'),
  resolve(homedir(), 'Developer/Forge-Capital/.env'),
]) {
  try {
    if (!existsSync(envPath)) continue
    const c = readFileSync(envPath, 'utf-8')
    for (const line of c.split('\n')) {
      const t = line.trim()
      if (t && !t.startsWith('#') && t.includes('=')) {
        const [k, ...rest] = t.split('=')
        const v = rest.join('=').replace(/^["']|["']$/g, '')
        if (!process.env[k]) process.env[k] = v
      }
    }
  } catch { /* non-fatal */ }
}

const BRAVE_KEY =
  process.env.BRAVE_API_KEY ||
  (() => {
    for (const f of [
      resolve(homedir(), '.claude/secrets/brave.env'),
      resolve(homedir(), 'Developer/Forge-Capital/.env'),
      resolve(homedir(), 'secrets/brave.env'),
    ]) {
      try {
        if (!existsSync(f)) continue
        const m = readFileSync(f, 'utf-8').match(/BRAVE_API_KEY=([^\s]+)/)
        if (m) return m[1]
      } catch { /* ignore */ }
    }
    return ''
  })()

const OPENAI_KEY = process.env.OPENAI_API_KEY || ''
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DB_PATH = resolve(homedir(), '.forge-truth/forge-truth.db')
// Script-only — assigned in the IS_MAIN bootstrap once OUT_DIR is known.
let LOG_PATH = ''
const RUNTIME_CAP_MS = 600_000 // hard 10 min ceiling
const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'
const BRAVE_INTER_CALL_MS = 1_100 // free-tier rate-limit gate
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMS = 1536
const FLASH_LITE_MODEL = 'google/gemini-3.1-flash-lite'
const SUPPLIER_REENRICH_DAYS = 30

const T_START = Date.now()
let braveCalls = 0
let llmCalls = 0
let dbWrites = 0

// ---------------------------------------------------------------------------
// Append-only JSONL logger
// ---------------------------------------------------------------------------

interface LogRecord {
  ts: string
  action_type: string
  target_kind: 'part' | 'supplier' | 'meta'
  target_key: string
  status: 'ok' | 'skipped' | 'failed' | 'timeout'
  error?: string
  brave_calls?: number
  llm_calls?: number
  db_writes?: number
  details?: Record<string, any>
}

function logAction(rec: Omit<LogRecord, 'ts'>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...rec }) + '\n'
  try {
    appendFileSync(LOG_PATH, line)
  } catch (err) {
    // If we can't even write the log, dump to stderr; otherwise stay quiet.
    process.stderr.write(`[background-enrichment] log append failed: ${(err as Error).message}\n`)
  }
}

function timedOut(): boolean {
  return Date.now() - T_START > RUNTIME_CAP_MS
}

// ---------------------------------------------------------------------------
// DB open + schema migration (idempotent — IF NOT EXISTS pattern)
//
// SCRIPT-ONLY: the real forge-truth.db handle, its migrations, prepared
// statements and the synthetic doc id are all gated behind IS_MAIN (assigned by
// bootstrapScriptDb() at the bottom of the file). On IMPORT none of this runs —
// verifyProposedParts opens its OWN handle from opts.dbPath, so the real DB is
// never touched by the chain's import or by the unit test.
// ---------------------------------------------------------------------------

let db: Database.Database | null = null
let CHAIN_REVIEW_DOC_ID = 1

function ensureColumn(table: string, col: string, type: string) {
  if (!db) return
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!cols.find((c) => c.name === col)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`).run()
    logAction({ action_type: 'schema_migration', target_kind: 'meta', target_key: `${table}.${col}`, status: 'ok', details: { type } })
  }
}

function bootstrapScriptDb(): void {
  // OUT_DIR is set by the IS_MAIN argv block; the JSONL log lives beside it.
  LOG_PATH = resolve(OUT_DIR, 'background-enrichment.jsonl')
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')

  // companies columns the supplier-enrichment payload needs.
  ensureColumn('companies', 'capability', 'TEXT')
  ensureColumn('companies', 'materials_handled', 'TEXT')
  ensureColumn('companies', 'founded_year', 'INTEGER')
  ensureColumn('companies', 'employee_band', 'TEXT')
  ensureColumn('companies', 'revenue_band', 'TEXT')
  ensureColumn('companies', 'geographic_reach', 'TEXT')
  ensureColumn('companies', 'recent_news', 'TEXT')
  ensureColumn('companies', 'enriched_at', 'TEXT')
  // certifications already exists on companies (column index 14, default-NULL).
  // Reuse rather than adding a duplicate column.

  // pretraining_extracted_parts: source_doc_id may exist; ensure idempotency
  // columns + UNIQUE INDEX on (manufacturer, part_number) so re-runs are no-ops.
  ensureColumn('pretraining_extracted_parts', 'source_doc_id', 'TEXT')
  ensureColumn('pretraining_extracted_parts', 'discovered_at', 'TEXT')
  ensureColumn('pretraining_extracted_parts', 'discovery_source', 'TEXT')

  // NOTE: pretraining_extracted_parts already contains ~400 case-insensitive
  // duplicate (manufacturer, part_number) groups from the historical distributor
  // ingest sweep. A UNIQUE INDEX would FAIL at creation against the existing
  // data. We rely on the `partExistsStmt` pre-check below for idempotency
  // instead. Future cleanup (separate task) could de-dup the table and add the
  // index then. The pre-check is sufficient for our use-case: each chain run
  // adds at most a handful of new parts, and each is looked up before insert.

  // pretraining_extracted_parts requires a non-NULL document_id with a FK to
  // pretraining_spec_documents.id. We get-or-create a single "chain_review"
  // synthetic document row up-front and reuse its id for every part we INSERT.
  CHAIN_REVIEW_DOC_ID = (() => {
    try {
      const row = db!.prepare(`
        SELECT id FROM pretraining_spec_documents
        WHERE source_type = 'chain_review' AND distributor IS NULL
        ORDER BY id ASC LIMIT 1
      `).get() as { id: number } | undefined
      if (row?.id) return row.id
      // Insert one. pretraining_spec_documents schema: most fields nullable, only
      // id is the PK. We populate source_type so the row is distinguishable.
      const r = db!.prepare(`
        INSERT INTO pretraining_spec_documents (source_type)
        VALUES ('chain_review')
      `).run()
      return Number(r.lastInsertRowid)
    } catch (err) {
      logAction({ action_type: 'doc_create', target_kind: 'meta', target_key: 'chain_review_doc', status: 'failed', error: String(err).slice(0, 200) })
      return 1 // fall back to id=1 (highest probability existing row); insert will likely fail but log will record it
    }
  })()
  logAction({ action_type: 'doc_create', target_kind: 'meta', target_key: 'chain_review_doc', status: 'ok', details: { document_id: CHAIN_REVIEW_DOC_ID } })

  // Prepared statements bound to the freshly-opened handle.
  classifierStmt = db.prepare(CLASSIFIER_SQL)
  partExistsStmt = db.prepare(PART_EXISTS_SQL)
  partInsertStmt = db.prepare(PART_INSERT_SQL)
  supplierLookupStmt = db.prepare(SUPPLIER_LOOKUP_SQL)
  supplierUpdateStmt = db.prepare(SUPPLIER_UPDATE_SQL)
}

// ---------------------------------------------------------------------------
// Brave search helper (matches enrich-state-with-suppliers.tsx behaviour:
// 1.1 s gate, JSON parse, return cleaned results.)
// ---------------------------------------------------------------------------

interface BraveResult {
  url: string
  name: string
  description: string
}

let lastBraveCallTs = 0
async function braveSearch(query: string, count = 8): Promise<BraveResult[]> {
  if (!BRAVE_KEY) return []
  const wait = BRAVE_INTER_CALL_MS - (Date.now() - lastBraveCallTs)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastBraveCallTs = Date.now()
  braveCalls += 1
  try {
    const params = new URLSearchParams({ q: query, country: 'GB', count: String(count) })
    const res = await fetch(`${BRAVE_ENDPOINT}?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-Subscription-Token': BRAVE_KEY },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return []
    const j: any = await res.json()
    const rows: any[] = j?.web?.results ?? []
    return rows
      .map((r) => ({
        url: String(r?.url ?? '').trim(),
        name: String(r?.title ?? '').trim(),
        description: String(r?.description ?? '').trim(),
      }))
      .filter((r) => r.url && r.name)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Embedding helper (text-embedding-3-small, Float32LE BLOB — matches the
// library-candidate-query.ts read side so rows we INSERT are indexable by
// the same Stage 17.6 query path.)
// ---------------------------------------------------------------------------

async function embedText(text: string): Promise<Buffer | null> {
  if (!OPENAI_KEY) return null
  try {
    llmCalls += 1
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text.slice(0, 4096), model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMS }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> }
    const vec = data.data?.[0]?.embedding
    if (!vec || vec.length !== EMBEDDING_DIMS) return null
    const buf = Buffer.alloc(EMBEDDING_DIMS * 4)
    for (let i = 0; i < EMBEDDING_DIMS; i++) buf.writeFloatLE(vec[i], i * 4)
    return buf
  } catch {
    return null
  }
}

// ===========================================================================
// SYNCHRONOUS PART-VERIFICATION LEG (the engine's "P1") — exported library API
//
// Tristan 2026-06-04: a new class's REAL parts must get distributor-verified
// IN-RUN (BoM climbs), and hallucinated / non-buyable structured MPNs must be
// demoted to an honest descriptor BEFORE gate 20 runs (no exit-20).
//
// The chain's Stage 10.6 collects every structured-MPN word that the DB cannot
// already vouch for (db-only-cascade returned 'unknown') and calls
// verifyProposedParts() ONCE. This is the SINGLE delegated live call — it is
// architecturally legal because it lives in background-enrichment.ts (the
// chain-as-DB-consumer rule exempts this file; the chain itself never touches a
// live API). Brave (web search), NOT a distributor adapter, is the prober.
//
// POISON GUARD (the #1 ship-bug this design exists to avoid): Brave returning a
// SIBLING SKU (proposed PV-200ANH1, the web shows PV-160ANH1) must NEVER cache
// the proposed MPN as verified. Existence requires the NORMALISED PROPOSED MPN
// itself to appear as a bounded token in the hit's TITLE or URL (a sibling in
// the title fails this), AND we only ever write distributor_cascade_cache
// miss=0 / a pretraining_extracted_parts row when
// normaliseMpn(returned) === normaliseMpn(proposed) (matched === true).
//
// No Brave key → every outcome verified:false (the chain then demotes each word
// to the honest descriptor — we NEVER silently keep an unverified structured
// MPN).
// ===========================================================================

export interface ProposedPart {
  module_id: string
  sub_module_id: string
  word_id: string
  manufacturer: string
  proposed_mpn: string
  component_class: string | null
  source: string
}

export interface VerifyOutcome {
  word_id: string
  /** True only when matched (a distributor-grade exact MPN confirmation). */
  verified: boolean
  /** The best structured MPN token found in the winning hit (transparency). */
  returned_mpn: string | null
  /** normaliseMpn(returned) === normaliseMpn(proposed). The poison guard. */
  matched: boolean
  /** 'brave' when a live probe ran; 'no_key' when BRAVE_KEY was absent. */
  source: string
}

export interface VerifyProposedPartsOpts {
  braveKey?: string
  timeoutMsPerPart?: number
  maxConcurrent?: number
  dbPath?: string
  /** Test/seam hook: replace the live Brave call with a deterministic responder.
   *  When provided, NO network call is made. Returns the BraveResult[] for a
   *  ("mfr" "mpn" datasheet) query. */
  braveResponder?: (mfr: string, mpn: string) => Promise<BraveResult[]>
}

// Bounded-token existence: does the normalised proposed MPN appear as a whole
// whitespace/URL-delimited token in the text? Splitting on separators that are
// NOT part of an MPN ([\s/?&=#,;]) keeps "PV-200ANH1" whole, so a sibling
// "PV-160ANH1" token normalises to a DIFFERENT value and fails the check.
function mpnAppearsAsBoundedToken(text: string, proposedMpn: string): boolean {
  const want = normaliseMpn(proposedMpn)
  if (!want) return false
  for (const tok of String(text ?? '').split(/[\s/?&=#,;()[\]{}"'<>|]+/)) {
    if (tok && normaliseMpn(tok) === want) return true
  }
  return false
}

// Pull the single structured MPN-looking token that drove the existence claim
// from the winning hit — used to populate returned_mpn. We prefer the token
// that normalises to the proposed MPN (the match); otherwise the longest
// alphanumeric-with-separator token (a likely sibling SKU, for transparency).
function extractReturnedMpn(text: string, proposedMpn: string): string | null {
  const want = normaliseMpn(proposedMpn)
  const toks = String(text ?? '').split(/[\s/?&=#,;()[\]{}"'<>|]+/).filter(Boolean)
  for (const tok of toks) if (normaliseMpn(tok) === want) return tok
  let best: string | null = null
  for (const tok of toks) {
    // A SKU-shaped token: has a digit and a separator and ≥4 alnum chars.
    if (/[-_/.]/.test(tok) && /\d/.test(tok) && normaliseMpn(tok).length >= 4) {
      if (!best || tok.length > best.length) best = tok
    }
  }
  return best
}

// Manufacturer co-occurrence: the OEM name (or a meaningful token of it)
// appears in the hit's title/description/url. Short/stop tokens are ignored so
// a one-letter brand fragment can't spuriously satisfy the check.
function manufacturerCoOccurs(hit: BraveResult, manufacturer: string): boolean {
  const hay = `${hit.name} ${hit.description} ${hit.url}`.toLowerCase()
  const mfr = String(manufacturer ?? '').toLowerCase().trim()
  if (!mfr) return false
  if (hay.includes(mfr)) return true
  const toks = mfr.split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !MFR_STOP.has(t))
  if (toks.length === 0) return false
  return toks.some((t) => hay.includes(t))
}
const MFR_STOP = new Set(['the', 'and', 'inc', 'ltd', 'llc', 'gmbh', 'co', 'corp', 'group', 'international', 'industries', 'technologies', 'technology', 'systems', 'electric', 'electronics'])

// Upsert distributor_cascade_cache, honouring idx_dcc_unique(LOWER(mfr),
// LOWER(pn), source). source is always 'brave' for verify-leg writes so we
// never collide with an ingest-written 'mouser'/'farnell' row for the same MPN.
// expires_at uses the SAME TTL the reader (db-only-cascade) applies: 30 days
// for a hit (miss=0), 7 days for a confirmed miss (miss=1).
function upsertCascadeCache(
  verifyDb: Database.Database,
  manufacturer: string,
  partNumber: string,
  miss: 0 | 1,
  resultJson: string | null,
): void {
  const now = Date.now()
  const ttlMs = miss === 1 ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000
  const fetchedAt = new Date(now).toISOString()
  const expiresAt = new Date(now + ttlMs).toISOString()
  try {
    verifyDb.prepare(`
      INSERT INTO distributor_cascade_cache
        (manufacturer, part_number, source, result_json, fetched_at, expires_at, miss)
      VALUES (?, ?, 'brave', ?, ?, ?, ?)
      ON CONFLICT(LOWER(manufacturer), LOWER(part_number), source)
      DO UPDATE SET
        result_json = excluded.result_json,
        fetched_at  = excluded.fetched_at,
        expires_at  = excluded.expires_at,
        miss        = excluded.miss
    `).run(manufacturer, partNumber, resultJson, fetchedAt, expiresAt, miss)
  } catch {
    // Best-effort: a malformed row must never break the verify leg.
  }
}

/**
 * Verify a batch of proposed (manufacturer, MPN) pairs against live Brave web
 * search, growing the DB on confirmation. Network-free when opts.braveResponder
 * is supplied (test seam). Opens its OWN read-write DB handle from opts.dbPath
 * (default forge-truth.db) — never the script singleton — so it is safe to call
 * from the chain or a unit test.
 *
 * For each proposed part:
 *   • matched (proposed MPN bounded in title/URL + mfr co-occurs + returned ===
 *     proposed) → verified:true; upsert distributor_cascade_cache(miss=0,
 *     'brave') AND a class-tagged pretraining_extracted_parts row
 *     (discovery_source 'verify_leg:brave_confirmed', confidence 0.85).
 *   • Brave returns hits but none matches (sibling SKU / description-only /
 *     wrong mfr) → verified:false, matched:false, NO miss=0 write (poison
 *     guard).
 *   • Brave returns ZERO hits → verified:false; upsert
 *     distributor_cascade_cache(miss=1, 'brave') (confirmed-absent).
 *   • No Brave key (and no responder) → verified:false, source 'no_key', no
 *     write (the chain demotes to honest descriptor).
 */
export async function verifyProposedParts(
  proposed: ProposedPart[],
  opts: VerifyProposedPartsOpts = {},
): Promise<VerifyOutcome[]> {
  const braveKey = opts.braveKey ?? BRAVE_KEY
  const timeoutMs = opts.timeoutMsPerPart ?? 8_000
  const maxConcurrent = Math.max(1, opts.maxConcurrent ?? 4)
  const dbPath = opts.dbPath ?? DB_PATH
  const responder = opts.braveResponder

  // No way to probe → every word falls back to honest descriptor downstream.
  if (!responder && !braveKey) {
    return proposed.map((p) => ({
      word_id: p.word_id,
      verified: false,
      returned_mpn: null,
      matched: false,
      source: 'no_key',
    }))
  }

  // Own handle (read-write) — NEVER the script singleton. Missing file → we
  // can still verify, just can't write back (graceful).
  let verifyDb: Database.Database | null = null
  try {
    if (existsSync(dbPath)) {
      verifyDb = new Database(dbPath)
      verifyDb.pragma('journal_mode = WAL')
      verifyDb.pragma('busy_timeout = 5000')
    }
  } catch {
    verifyDb = null
  }

  const partInsert = verifyDb
    ? verifyDb.prepare(PART_INSERT_SQL)
    : null
  const partExists = verifyDb
    ? verifyDb.prepare(PART_EXISTS_SQL)
    : null
  const verifyDocId = verifyDb ? getVerifyLegDocId(verifyDb) : 1

  const probe = async (p: ProposedPart): Promise<VerifyOutcome> => {
    const outcome: VerifyOutcome = {
      word_id: p.word_id,
      verified: false,
      returned_mpn: null,
      matched: false,
      source: 'brave',
    }
    let hits: BraveResult[] = []
    try {
      const call = responder
        ? responder(p.manufacturer, p.proposed_mpn)
        : braveSearch(`"${p.manufacturer}" "${p.proposed_mpn}" datasheet`, 5)
      hits = await withTimeout(call, timeoutMs, [] as BraveResult[])
    } catch {
      hits = []
    }

    // CONFIRMED ABSENT — zero hits → write a miss=1 row so the next run is a
    // fast cache_miss_confirmed (db-only-cascade) and the word is demoted
    // without ever hitting Brave again.
    if (hits.length === 0) {
      if (verifyDb) upsertCascadeCache(verifyDb, p.manufacturer, p.proposed_mpn, 1, null)
      return outcome
    }

    // EXISTENCE: the proposed MPN must appear as a bounded token in a hit's
    // TITLE or URL (NOT description-only) AND the manufacturer must co-occur in
    // that SAME hit.
    let winningHit: BraveResult | null = null
    for (const hit of hits) {
      const inTitleOrUrl =
        mpnAppearsAsBoundedToken(hit.name, p.proposed_mpn) ||
        mpnAppearsAsBoundedToken(hit.url, p.proposed_mpn)
      if (inTitleOrUrl && manufacturerCoOccurs(hit, p.manufacturer)) {
        winningHit = hit
        break
      }
    }

    if (!winningHit) {
      // Hits exist but none confirms the proposed MPN (sibling SKU, wrong mfr,
      // or proposed only in the description). POISON GUARD: NO miss=0 write.
      // For transparency, surface the best sibling token we saw.
      const sample = hits[0]
      outcome.returned_mpn = extractReturnedMpn(`${sample.name} ${sample.url}`, p.proposed_mpn)
      return outcome
    }

    // MATCHED — returned === proposed by construction of the existence check.
    const returned = extractReturnedMpn(`${winningHit.name} ${winningHit.url}`, p.proposed_mpn)
    outcome.returned_mpn = returned
    outcome.matched = normaliseMpn(returned) === normaliseMpn(p.proposed_mpn)
    outcome.verified = outcome.matched

    if (outcome.matched && verifyDb) {
      // (a) keep the structured MPN → cache it as a verified hit (miss=0).
      const resultJson = JSON.stringify({
        source: 'brave',
        mpn: p.proposed_mpn,
        manufacturer: p.manufacturer,
        description: `${winningHit.name}`.slice(0, 300),
        priceGBP: [],
        stockUK: null,
        datasheetUrl: winningHit.url || null,
        productUrl: winningHit.url || '',
        leadWeeks: null,
        fetchedAt: new Date().toISOString(),
      })
      upsertCascadeCache(verifyDb, p.manufacturer, p.proposed_mpn, 0, resultJson)

      // (b) grow pretraining_extracted_parts (class-tagged) so a future run
      // serves this as a DB-first hit. Idempotent via partExists pre-check
      // (the table can't carry the UNIQUE index — see bootstrap note).
      try {
        const already = partExists?.get(p.manufacturer, p.proposed_mpn) as { id: number } | undefined
        if (!already && partInsert) {
          const className = (p.component_class && p.component_class.trim())
            ? p.component_class.trim()
            : 'verify_leg'
          const partName = `${p.manufacturer} ${p.proposed_mpn}`.slice(0, 256)
          const embedSource = [partName, p.manufacturer, p.proposed_mpn, winningHit.name]
            .filter(Boolean)
            .join(' ')
          const embedding = await embedText(embedSource)
          const embedHash = embedding
            ? createHash('sha256').update(embedSource).digest('hex').slice(0, 32)
            : null
          partInsert.run(
            verifyDocId,
            partName,
            p.manufacturer,
            p.proposed_mpn,
            p.module_id,
            p.sub_module_id,
            `${winningHit.name} — ${winningHit.description}`.slice(0, 1200),
            0.85,                                       // brave-confirmed (> generated 0.6, < distributor 0.9)
            className,
            embedding,
            embedHash,
            `verify_leg:${p.word_id}`,
            new Date().toISOString(),
            'verify_leg:brave_confirmed',
          )
        }
      } catch {
        // Writeback is best-effort; the verified outcome still stands.
      }
    }
    return outcome
  }

  // Bounded-concurrency pool (default 4). braveSearch enforces the 1.1 s
  // inter-call rate gate internally, so a small pool stays inside free-tier.
  const outcomes: VerifyOutcome[] = new Array(proposed.length)
  let next = 0
  async function worker() {
    while (next < proposed.length) {
      const i = next++
      outcomes[i] = await probe(proposed[i])
    }
  }
  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(maxConcurrent, proposed.length); i++) workers.push(worker())
  await Promise.all(workers)

  try { verifyDb?.close() } catch { /* no-op */ }
  return outcomes
}

// Per-process timeout wrapper that resolves to a fallback rather than rejecting
// (a slow Brave probe must not abort the whole batch).
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((res) => {
    let settled = false
    const t = setTimeout(() => { if (!settled) { settled = true; res(fallback) } }, ms)
    p.then((v) => { if (!settled) { settled = true; clearTimeout(t); res(v) } })
     .catch(() => { if (!settled) { settled = true; clearTimeout(t); res(fallback) } })
  })
}

// get-or-create a synthetic spec-document row for verify-leg parts (FK target
// for pretraining_extracted_parts.document_id, which is NOT NULL).
function getVerifyLegDocId(verifyDb: Database.Database): number {
  try {
    const row = verifyDb.prepare(`
      SELECT id FROM pretraining_spec_documents
      WHERE source_type = 'verify_leg' ORDER BY id ASC LIMIT 1
    `).get() as { id: number } | undefined
    if (row?.id) return row.id
    const r = verifyDb.prepare(`
      INSERT INTO pretraining_spec_documents (source_type) VALUES ('verify_leg')
    `).run()
    return Number(r.lastInsertRowid)
  } catch {
    return 1
  }
}

// ---------------------------------------------------------------------------
// Flash-Lite summariser for supplier snippet → structured fields.
// ---------------------------------------------------------------------------

interface SupplierExtract {
  capability: string | null
  materials_handled: string[] | null
  certifications: string[] | null
  founded_year: number | null
  employee_band: string | null
  revenue_band: string | null
  geographic_reach: string | null
  recent_news: string | null
}

async function extractSupplierFromSnippets(
  companyName: string,
  snippets: string[],
): Promise<SupplierExtract | null> {
  if (!OPENROUTER_KEY) return null
  if (snippets.length === 0) return null
  const joined = snippets.slice(0, 8).map((s, i) => `[${i + 1}] ${s}`).join('\n')
  const prompt =
    `From the snippets below about "${companyName}", extract structured fields. ` +
    `Return STRICT JSON only — no prose, no markdown fence.\n\n` +
    `Schema:\n` +
    `  capability: string (one sentence describing what they DO; null if unknown)\n` +
    `  materials_handled: string[] (e.g. ["aluminium", "steel"]; null if unknown)\n` +
    `  certifications: string[] (e.g. ["ISO 9001", "IATF 16949"]; null if unknown)\n` +
    `  founded_year: integer | null\n` +
    `  employee_band: one of "1-10" | "11-50" | "51-200" | "201-1000" | "1000+" | null\n` +
    `  revenue_band: one of "under £1M" | "£1-10M" | "£10-100M" | "£100M-£1B" | "£1B+" | null\n` +
    `  geographic_reach: one of "UK" | "EU" | "global" | "regional" | null\n` +
    `  recent_news: string (one sentence from the last 12 months; null if none in snippets)\n\n` +
    `Snippets:\n${joined}\n\n` +
    `Output (JSON, no commentary):`
  try {
    llmCalls += 1
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fractionalforge.com',
        'X-Title': 'ForgeOS background enrichment',
      },
      body: JSON.stringify({
        model: FLASH_LITE_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(45_000),
    })
    if (!res.ok) return null
    const j: any = await res.json()
    const raw = j?.choices?.[0]?.message?.content
    if (!raw || typeof raw !== 'string') return null
    // Tolerate ```json fences and leading/trailing prose.
    let cleaned = raw.trim()
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) cleaned = fence[1].trim()
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    if (firstBrace === -1 || lastBrace === -1) return null
    const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1))
    return {
      capability: typeof parsed.capability === 'string' ? parsed.capability.slice(0, 400) : null,
      materials_handled: Array.isArray(parsed.materials_handled) ? parsed.materials_handled.slice(0, 20).map((s: any) => String(s).slice(0, 80)) : null,
      certifications: Array.isArray(parsed.certifications) ? parsed.certifications.slice(0, 20).map((s: any) => String(s).slice(0, 80)) : null,
      founded_year: Number.isFinite(parsed.founded_year) ? Math.round(Number(parsed.founded_year)) : null,
      employee_band: typeof parsed.employee_band === 'string' ? parsed.employee_band.slice(0, 30) : null,
      revenue_band: typeof parsed.revenue_band === 'string' ? parsed.revenue_band.slice(0, 30) : null,
      geographic_reach: typeof parsed.geographic_reach === 'string' ? parsed.geographic_reach.slice(0, 30) : null,
      recent_news: typeof parsed.recent_news === 'string' ? parsed.recent_news.slice(0, 400) : null,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Inferring component_class — same strategy as render-minimal-pdf.tsx
// RenderEngineBClassifier.lookup(): full-phrase LIKE first, then token
// fallback. Kept lightweight; falls back to 'unclassified' so we never lose
// a row. (Token stop-list mirrors render-minimal-pdf.tsx so the two paths
// agree on classifications.)
// ---------------------------------------------------------------------------

const CLASSIFIER_STOPS = new Set([
  'the', 'a', 'an', 'for', 'of', 'with', 'to', 'and', 'or', 'in', 'on', 'at', 'from', 'by',
  'word', 'assembly', 'pack', 'unit', 'module', 'board', 'main', 'primary', 'secondary',
])
const CLASSIFIER_SQL = `
  SELECT component_class, COUNT(*) AS n
  FROM pretraining_extracted_parts
  WHERE component_class IS NOT NULL
    AND part_name IS NOT NULL
    AND LOWER(part_name) LIKE ?
  GROUP BY component_class
  ORDER BY n DESC
  LIMIT 1
`
let classifierStmt: Database.Statement | null = null
function inferComponentClass(partName: string): string | null {
  if (!partName) return null
  if (!classifierStmt) return null
  const key = String(partName).toLowerCase().trim()
  if (!key) return null
  try {
    let row: any = classifierStmt.get(`%${key.slice(0, 80)}%`)
    if (row?.component_class && row.component_class !== 'unknown') return row.component_class
    const tokens = key.split(/[^a-z0-9]+/).filter((t) => t && t.length > 2 && !CLASSIFIER_STOPS.has(t))
    tokens.sort((a, b) => b.length - a.length)
    for (const t of tokens.slice(0, 4)) {
      row = classifierStmt.get(`%${t}%`)
      if (row?.component_class && row.component_class !== 'unknown') return row.component_class
    }
  } catch {
    return null
  }
  return null
}

// ---------------------------------------------------------------------------
// Walk state.json
// ---------------------------------------------------------------------------

interface DiscoveredPart {
  word_id: string
  word_name: string
  manufacturer: string
  part_number: string
  module_assignment: string
  sub_module_assignment: string
  source_detail: string
}

interface DiscoveredSupplier {
  company_name: string
  domain: string
  uk_flagged: boolean
}

function walkParts(state: any): DiscoveredPart[] {
  const out: DiscoveredPart[] = []
  const modules = Array.isArray(state?.moduleDecomposition?.modules) ? state.moduleDecomposition.modules : []
  for (const mod of modules) {
    const modId = String(mod?.id ?? mod?.module ?? 'unknown')
    const subs = Array.isArray(mod?.sub_modules) ? mod.sub_modules : []
    for (const sub of subs) {
      const subId = String(sub?.id ?? 'unknown')
      const words = Array.isArray(sub?.words) ? sub.words : []
      for (const w of words) {
        const sd = String((w as any)?.source_detail ?? '').trim()
        if (!sd.toLowerCase().startsWith('library override:')) continue
        const mfg = String((w as any)?.manufacturer ?? '').trim()
        const pn = String((w as any)?.part_number ?? '').trim()
        if (!mfg || !pn) continue
        out.push({
          word_id: String((w as any)?.id ?? ''),
          word_name: String((w as any)?.name_human ?? (w as any)?.word_name ?? '').trim(),
          manufacturer: mfg,
          part_number: pn,
          module_assignment: modId,
          sub_module_assignment: subId,
          source_detail: sd,
        })
      }
    }
  }
  return out
}

function walkSuppliers(state: any): DiscoveredSupplier[] {
  const out: DiscoveredSupplier[] = []
  const groups = Array.isArray(state?.suppliers) ? state.suppliers : []
  for (const g of groups) {
    const candidates = Array.isArray(g?.candidates) ? g.candidates : []
    for (const c of candidates) {
      // Web-fallback suppliers carry source='web-fallback'. The persist-
      // web-fallback.ts module already inserted minimal rows; we follow up
      // here with Brave + Flash-Lite enrichment.
      if (c?.source !== 'web-fallback') continue
      const url = String(c?.website_url ?? '').trim()
      if (!url) continue
      let domain = ''
      try { domain = new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { continue }
      if (!domain) continue
      const name = String(c?.name ?? '').trim()
      if (!name) continue
      const ukFlagged = String(c?.country ?? '').toUpperCase() === 'GB' || domain.endsWith('.co.uk') || domain.endsWith('.uk')
      out.push({ company_name: name, domain, uk_flagged: ukFlagged })
    }
  }
  // Dedup by domain — multiple archetypes may surface the same supplier.
  const seen = new Set<string>()
  return out.filter((s) => (seen.has(s.domain) ? false : (seen.add(s.domain), true)))
}

// ---------------------------------------------------------------------------
// Persist a part
// ---------------------------------------------------------------------------

const PART_EXISTS_SQL = `
  SELECT id FROM pretraining_extracted_parts
  WHERE LOWER(manufacturer) = LOWER(?)
    AND LOWER(part_number) = LOWER(?)
  LIMIT 1
`
const PART_INSERT_SQL = `
  INSERT OR IGNORE INTO pretraining_extracted_parts
  (document_id, part_name, manufacturer, part_number,
   module_assignment, sub_module_assignment, raw_excerpt,
   confidence, component_class, embedding, embed_hash,
   source_doc_id, discovered_at, discovery_source)
  VALUES
  (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`
let partExistsStmt: Database.Statement | null = null
let partInsertStmt: Database.Statement | null = null

async function processPart(part: DiscoveredPart): Promise<'inserted' | 'skipped' | 'failed'> {
  if (!partExistsStmt || !partInsertStmt) return 'failed' // bootstrap not run (script-only path)
  // 1. Idempotency check.
  const existing = partExistsStmt.get(part.manufacturer, part.part_number) as { id: number } | undefined
  if (existing) {
    logAction({
      action_type: 'part_insert',
      target_kind: 'part',
      target_key: `${part.manufacturer}|${part.part_number}`,
      status: 'skipped',
      details: { reason: 'already_in_library', existing_id: existing.id },
    })
    return 'skipped'
  }

  // 2. Brave-verify the part exists. Skip the row entirely if Brave returns
  // zero hits — we don't want to pollute the library with hallucinated SKUs.
  // When BRAVE_KEY is missing, skip verification gate (trust the reviewer's
  // override + accept the row; the part_verified=false signal already lives
  // on the word).
  let braveVerified = false
  let braveSnippet: string | null = null
  if (BRAVE_KEY) {
    const q = `"${part.manufacturer}" "${part.part_number}" datasheet`
    const results = await braveSearch(q, 5)
    braveVerified = results.length > 0
    if (results[0]) braveSnippet = `${results[0].name} — ${results[0].description}`.slice(0, 400)
    if (!braveVerified) {
      logAction({
        action_type: 'part_insert',
        target_kind: 'part',
        target_key: `${part.manufacturer}|${part.part_number}`,
        status: 'skipped',
        details: { reason: 'brave_zero_hits', query: q },
      })
      return 'skipped'
    }
  }

  // 3. Component class + embedding.
  const componentClass = inferComponentClass(part.word_name || `${part.manufacturer} ${part.part_number}`)
  const embedSource = [part.word_name, part.manufacturer, part.part_number, part.source_detail].filter(Boolean).join(' ')
  const embedding = await embedText(embedSource)
  const embedHash = embedding ? createHash('sha256').update(embedSource).digest('hex').slice(0, 32) : null

  // 4. INSERT OR IGNORE. document_id is NOT NULL on the table — use 0 as
  //    a synthetic id (we have no real source PDF; the reviewer is the
  //    source). source_doc_id carries the human-readable provenance.
  const rawExcerpt = (braveSnippet ? braveSnippet + ' || ' : '') + part.source_detail
  try {
    const r = partInsertStmt.run(
      CHAIN_REVIEW_DOC_ID,                          // FK-valid synthetic doc id
      part.word_name || `${part.manufacturer} ${part.part_number}`,
      part.manufacturer,
      part.part_number,
      part.module_assignment,
      part.sub_module_assignment,
      rawExcerpt.slice(0, 1200),
      0.6,                                          // confidence (reviewer-introduced, not corpus-extracted)
      componentClass,
      embedding,                                    // nullable BLOB
      embedHash,
      `chain_review:${part.word_id || part.word_name}`,
      new Date().toISOString(),
      'serial_design_chain_v2_review',
    )
    dbWrites += 1
    if (r.changes === 0) {
      logAction({
        action_type: 'part_insert',
        target_kind: 'part',
        target_key: `${part.manufacturer}|${part.part_number}`,
        status: 'skipped',
        details: { reason: 'race_or_index_collision' },
      })
      return 'skipped'
    }
    logAction({
      action_type: 'part_insert',
      target_kind: 'part',
      target_key: `${part.manufacturer}|${part.part_number}`,
      status: 'ok',
      details: {
        component_class: componentClass,
        embedded: embedding !== null,
        brave_verified: braveVerified,
        module: part.module_assignment,
        sub_module: part.sub_module_assignment,
      },
    })
    return 'inserted'
  } catch (err) {
    logAction({
      action_type: 'part_insert',
      target_kind: 'part',
      target_key: `${part.manufacturer}|${part.part_number}`,
      status: 'failed',
      error: String(err).slice(0, 200),
    })
    return 'failed'
  }
}

// ---------------------------------------------------------------------------
// Persist a supplier (UPDATE existing row by domain)
// ---------------------------------------------------------------------------

const SUPPLIER_LOOKUP_SQL = `
  SELECT id, name, enriched_at, capability, description, category, subcategory,
         specialties, materials_handled, certifications, country, city,
         raw_snippet, recent_news, supabase_listing_id
  FROM companies
  WHERE domain = ?
  LIMIT 1
`
const SUPPLIER_UPDATE_SQL = `
  UPDATE companies
  SET capability = COALESCE(?, capability),
      materials_handled = COALESCE(?, materials_handled),
      certifications = COALESCE(?, certifications),
      founded_year = COALESCE(?, founded_year),
      employee_band = COALESCE(?, employee_band),
      revenue_band = COALESCE(?, revenue_band),
      geographic_reach = COALESCE(?, geographic_reach),
      recent_news = COALESCE(?, recent_news),
      enriched_at = ?,
      updated_at = datetime('now')
  WHERE id = ?
`
let supplierLookupStmt: Database.Statement | null = null
let supplierUpdateStmt: Database.Statement | null = null

interface SupplierRow {
  id: string
  name: string
  enriched_at: string | null
  capability: string | null
  description: string | null
  category: string | null
  subcategory: string | null
  specialties: string | null
  materials_handled: string | null
  certifications: string | null
  country: string | null
  city: string | null
  raw_snippet: string | null
  recent_news: string | null
  supabase_listing_id: string | null
}

async function processSupplier(supplier: DiscoveredSupplier): Promise<'enriched' | 'skipped' | 'failed'> {
  if (!db || !supplierLookupStmt || !supplierUpdateStmt) return 'failed' // bootstrap not run (script-only path)
  const row = supplierLookupStmt.get(supplier.domain) as SupplierRow | undefined
  if (!row) {
    // Web-fallback persist hasn't fired yet, or the row was created with a
    // different domain. Skip — we never CREATE supplier rows in this script
    // (that's persist-web-fallback.ts's job, in-line during the chain).
    logAction({
      action_type: 'supplier_enrich',
      target_kind: 'supplier',
      target_key: supplier.domain,
      status: 'skipped',
      details: { reason: 'no_row_for_domain' },
    })
    return 'skipped'
  }

  // Re-enrichment guard — skip rows already enriched within the last 30 days.
  if (row.enriched_at) {
    const ageMs = Date.now() - Date.parse(row.enriched_at)
    if (Number.isFinite(ageMs) && ageMs < SUPPLIER_REENRICH_DAYS * 24 * 3600 * 1000) {
      logAction({
        action_type: 'supplier_enrich',
        target_kind: 'supplier',
        target_key: supplier.domain,
        status: 'skipped',
        details: { reason: 'already_enriched_recently', enriched_at: row.enriched_at },
      })
      return 'skipped'
    }
  }

  // 1. Brave search for the company's official site, LinkedIn, and (when
  // UK-flagged) Companies House signal.
  const queries = [`"${supplier.company_name}" official site`, `"${supplier.company_name}" LinkedIn`]
  if (supplier.uk_flagged) queries.push(`"${supplier.company_name}" companies house`)
  const snippets: string[] = []
  for (const q of queries) {
    if (timedOut()) break
    const r = await braveSearch(q, 5)
    for (const hit of r.slice(0, 3)) {
      snippets.push(`${hit.name} — ${hit.description}`)
    }
  }
  if (snippets.length === 0) {
    logAction({
      action_type: 'supplier_enrich',
      target_kind: 'supplier',
      target_key: supplier.domain,
      status: 'skipped',
      details: { reason: 'brave_returned_nothing', queries },
    })
    return 'skipped'
  }

  // 2. Flash-Lite snippet → fields extraction.
  const extract = await extractSupplierFromSnippets(supplier.company_name, snippets)
  if (!extract) {
    logAction({
      action_type: 'supplier_enrich',
      target_kind: 'supplier',
      target_key: supplier.domain,
      status: 'skipped',
      details: { reason: 'extractor_returned_null', llm_calls: llmCalls },
    })
    return 'skipped'
  }

  // 3. UPDATE the row.
  try {
    supplierUpdateStmt.run(
      extract.capability,
      extract.materials_handled ? JSON.stringify(extract.materials_handled) : null,
      extract.certifications ? JSON.stringify(extract.certifications) : null,
      extract.founded_year,
      extract.employee_band,
      extract.revenue_band,
      extract.geographic_reach,
      extract.recent_news,
      new Date().toISOString(),
      row.id,
    )
    dbWrites += 1

    // Embed-on-write (growing-DB): the row now carries fresh capability /
    // materials / certifications — (re-)embed it so it is semantically
    // searchable. Uses the post-enrichment best-of values (extract fields
    // override the prior row). Non-fatal: a missing OPENAI key or embed failure
    // leaves the supplier_embeddings row to the one-off backfill.
    let embedAction = 'skip'
    try {
      const r = await upsertSupplierEmbedding(
        db,
        row.id,
        {
          name: row.name,
          capability: extract.capability ?? row.capability,
          description: row.description,
          category: row.category,
          subcategory: row.subcategory,
          specialties: row.specialties,
          materials_handled: extract.materials_handled ? JSON.stringify(extract.materials_handled) : row.materials_handled,
          certifications: extract.certifications ? JSON.stringify(extract.certifications) : row.certifications,
          country: row.country,
          city: row.city,
          snippet: extract.recent_news ?? row.recent_news ?? row.raw_snippet,
        },
        OPENAI_KEY,
        row.supabase_listing_id,
      )
      embedAction = r.action
      if (r.action === 'embedded') dbWrites += 1
    } catch (err) {
      embedAction = 'failed'
      process.stderr.write(`[background-enrichment] supplier embed failed for ${supplier.domain}: ${(err as Error).message}\n`)
    }

    logAction({
      action_type: 'supplier_enrich',
      target_kind: 'supplier',
      target_key: supplier.domain,
      status: 'ok',
      details: {
        company_id: row.id,
        capability_chars: extract.capability?.length ?? 0,
        materials_count: extract.materials_handled?.length ?? 0,
        certifications_count: extract.certifications?.length ?? 0,
        founded_year: extract.founded_year,
        revenue_band: extract.revenue_band,
        embed_action: embedAction,
      },
    })
    return 'enriched'
  } catch (err) {
    logAction({
      action_type: 'supplier_enrich',
      target_kind: 'supplier',
      target_key: supplier.domain,
      status: 'failed',
      error: String(err).slice(0, 200),
    })
    return 'failed'
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  logAction({
    action_type: 'run_start',
    target_kind: 'meta',
    target_key: STATE_PATH,
    status: 'ok',
    details: {
      brave_key_present: Boolean(BRAVE_KEY),
      openai_key_present: Boolean(OPENAI_KEY),
      openrouter_key_present: Boolean(OPENROUTER_KEY),
    },
  })

  let state: any
  try {
    state = JSON.parse(readFileSync(STATE_PATH, 'utf-8'))
  } catch (err) {
    logAction({
      action_type: 'run_start',
      target_kind: 'meta',
      target_key: STATE_PATH,
      status: 'failed',
      error: `state parse failed: ${String(err).slice(0, 200)}`,
    })
    return 1
  }

  const parts = walkParts(state)
  const suppliers = walkSuppliers(state)
  logAction({
    action_type: 'scan_complete',
    target_kind: 'meta',
    target_key: STATE_PATH,
    status: 'ok',
    details: { parts_discovered: parts.length, suppliers_discovered: suppliers.length },
  })

  let partInserted = 0
  let partSkipped = 0
  let partFailed = 0
  for (const p of parts) {
    if (timedOut()) {
      logAction({
        action_type: 'part_insert',
        target_kind: 'part',
        target_key: `${p.manufacturer}|${p.part_number}`,
        status: 'timeout',
      })
      partSkipped += 1
      continue
    }
    const r = await processPart(p)
    if (r === 'inserted') partInserted += 1
    else if (r === 'skipped') partSkipped += 1
    else partFailed += 1
  }

  let supplierEnriched = 0
  let supplierSkipped = 0
  let supplierFailed = 0
  for (const s of suppliers) {
    if (timedOut()) {
      logAction({
        action_type: 'supplier_enrich',
        target_kind: 'supplier',
        target_key: s.domain,
        status: 'timeout',
      })
      supplierSkipped += 1
      continue
    }
    const r = await processSupplier(s)
    if (r === 'enriched') supplierEnriched += 1
    else if (r === 'skipped') supplierSkipped += 1
    else supplierFailed += 1
  }

  logAction({
    action_type: 'run_complete',
    target_kind: 'meta',
    target_key: STATE_PATH,
    status: timedOut() ? 'timeout' : 'ok',
    brave_calls: braveCalls,
    llm_calls: llmCalls,
    db_writes: dbWrites,
    details: {
      runtime_ms: Date.now() - T_START,
      parts: { discovered: parts.length, inserted: partInserted, skipped: partSkipped, failed: partFailed },
      suppliers: { discovered: suppliers.length, enriched: supplierEnriched, skipped: supplierSkipped, failed: supplierFailed },
    },
  })

  // Also drop a summary so a human grepping the log can see one-line status.
  try {
    writeFileSync(
      resolve(OUT_DIR, 'background-enrichment.summary.json'),
      JSON.stringify(
        {
          ts: new Date().toISOString(),
          state_path: STATE_PATH,
          parts: { discovered: parts.length, inserted: partInserted, skipped: partSkipped, failed: partFailed },
          suppliers: { discovered: suppliers.length, enriched: supplierEnriched, skipped: supplierSkipped, failed: supplierFailed },
          brave_calls: braveCalls,
          llm_calls: llmCalls,
          db_writes: dbWrites,
          runtime_ms: Date.now() - T_START,
        },
        null,
        2,
      ),
    )
  } catch { /* non-fatal */ }

  try { db?.close() } catch { /* ignore */ }
  return 0
}

// Run the detached enrichment job ONLY when invoked as a script. On import (the
// chain's Stage 10.6 verify leg, or the unit test) this block is skipped — no
// argv, no real-DB open, no main(). bootstrapScriptDb() opens the real handle +
// prepares the script statements just before main() needs them.
if (IS_MAIN) {
  bootstrapScriptDb()
  main().catch((err) => {
    logAction({
      action_type: 'fatal',
      target_kind: 'meta',
      target_key: STATE_PATH,
      status: 'failed',
      error: String(err).slice(0, 300),
    })
    try { db?.close() } catch { /* ignore */ }
    process.exit(1)
  }).then((code) => {
    if (typeof code === 'number') process.exit(code)
  })
}
