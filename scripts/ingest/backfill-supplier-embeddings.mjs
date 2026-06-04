/**
 * One-off, idempotent backfill: embed every `companies` row that has NO
 * `supplier_embeddings` row, so ~100% of suppliers become semantically
 * searchable (the growing-DB embed-on-write guarantee, applied retroactively).
 *
 * Audit finding: `companies` has 28,833 rows but only 13,771 have an embedding
 * (~48%). The remaining ~15,000 — including every legacy web-sourced supplier —
 * are invisible to semantic supplier search. The chain's two write paths now
 * embed-on-write (persist-web-fallback.ts + background-enrichment.ts via
 * scripts/supplier-enrichment/embed-supplier.ts); this script closes the
 * historical gap.
 *
 * STORAGE FORMAT — `supplier_embeddings.embedding` is a JSON-array TEXT column
 * ("[-0.038, ...]"), NOT a Float32LE BLOB. The read side (local-corpus.ts
 * semanticSupplierSearch + the Nightshift crawler) JSON.parse's it. We store
 * JSON.stringify(number[]) so new rows match the existing 13,771. (This DIFFERS
 * from scripts/ingest/_ingest-co2-harvest.mjs, which writes BLOBs to the
 * pretraining_extracted_* tables — different table, different convention.)
 *
 * EMBED MODEL — OpenAI text-embedding-3-small, dimensions: 1536, copied from
 * scripts/lib/background-enrichment.ts, identical to every existing row.
 * source_text_hash = sha256(embed_text).slice(0,16) (matches existing length-16
 * hashes). model + dims columns set to the same values.
 *
 * EMBED-TEXT shape mirrors scripts/supplier-enrichment/embed-supplier.ts
 * buildSupplierEmbedText(): name — capability — description — category —
 * specialties — materials — certifications — "city, country" — snippet.
 *
 * CONCURRENCY — the parts-embedding agent may be writing the SAME forge-truth.db
 * at the same time. WAL + busy_timeout=15000 + an explicit retry-on-lock wrapper
 * (SQLITE_BUSY / "database is locked" → backoff + retry) make this safe. Writes
 * are committed in small batches so a long backfill never holds one giant
 * transaction against the writer.
 *
 * IDEMPOTENT — re-running skips rows that already have a supplier_embeddings
 * row (the WHERE NOT EXISTS selection) AND, defensively, rows whose
 * source_text_hash already matches (no-op). Safe to Ctrl-C and resume.
 *
 * Plain .mjs (tsx is not installed locally); better-sqlite3 12.x loads on
 * system Node 25 (verified). British spelling throughout.
 *
 * Usage:
 *   node scripts/ingest/backfill-supplier-embeddings.mjs [--limit N] [--dry-run] [--batch N]
 *     --limit N    embed at most N rows this run (default: all missing)
 *     --batch N    commit + log every N rows (default 100)
 *     --dry-run    select + count only; no embed calls, no writes
 */

import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

// --- env loading: identical set + precedence to background-enrichment.ts ----
for (const envPath of [
  resolve(process.cwd(), '.env.local'),
  resolve(homedir(), '.claude/secrets/openai.env'),
  resolve(homedir(), 'secrets/openai.env'),
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

const OPENAI_KEY = process.env.OPENAI_API_KEY || ''
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMS = 1536

// --- CLI args ----------------------------------------------------------------
const argv = process.argv.slice(2)
const argVal = (flag, def) => {
  const i = argv.indexOf(flag)
  return i !== -1 && argv[i + 1] ? argv[i + 1] : def
}
const DRY_RUN = argv.includes('--dry-run')
const LIMIT = Number(argVal('--limit', '0')) || 0 // 0 = all
const BATCH = Number(argVal('--batch', '100')) || 100

if (!OPENAI_KEY && !DRY_RUN) {
  console.error('FATAL: OPENAI_API_KEY not found in .env.local or secrets. Aborting (would write NULL/garbage embeddings — the exact failure we are fixing). Use --dry-run to count without a key.')
  process.exit(1)
}

const DB_PATH = resolve(homedir(), '.forge-truth/forge-truth.db')
if (!existsSync(DB_PATH)) {
  console.error(`FATAL: forge-truth.db not found at ${DB_PATH}`)
  process.exit(1)
}

// --- embedding helper: same request shape as background-enrichment.ts --------
async function embedVector(text) {
  const src = (text || '').trim() || '(empty)'
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: src.slice(0, 4096), model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMS }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`embed failed ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  const vec = data?.data?.[0]?.embedding
  if (!vec || vec.length !== EMBEDDING_DIMS) throw new Error(`embed returned ${vec ? vec.length : 'null'} dims, expected ${EMBEDDING_DIMS}`)
  return vec
}

// Embed with one retry. Returns the raw float vector, or throws if both fail.
async function embedWithRetry(text) {
  try {
    return await embedVector(text)
  } catch {
    await new Promise((r) => setTimeout(r, 1500))
    return await embedVector(text)
  }
}

const hashOf = (text) => createHash('sha256').update((text || '').trim() || '(empty)').digest('hex').slice(0, 16)

// --- embed-text shape: mirrors embed-supplier.ts buildSupplierEmbedText ------
function flattenMaybeJsonArray(v) {
  if (!v) return ''
  const t = String(v).trim()
  if (!t) return ''
  if (t.startsWith('[')) {
    try {
      const arr = JSON.parse(t)
      if (Array.isArray(arr)) return arr.map((x) => String(x)).filter(Boolean).join(' ')
    } catch { /* fall through */ }
  }
  return t
}

function buildEmbedText(row) {
  const parts = []
  const push = (s) => { const t = (s ?? '').toString().trim(); if (t) parts.push(t) }
  push(row.name)
  push(row.capability)
  push(row.description)
  push(row.category)
  push(row.subcategory)
  push(flattenMaybeJsonArray(row.specialties))
  push(flattenMaybeJsonArray(row.materials_handled))
  push(flattenMaybeJsonArray(row.certifications))
  const loc = [row.city, row.country].map((x) => (x ?? '').toString().trim()).filter(Boolean).join(', ')
  push(loc)
  push(row.recent_news ?? row.raw_snippet)
  return parts.join(' — ').replace(/\s+/g, ' ').trim()
}

// --- retry-on-lock wrapper for writes ----------------------------------------
// The parts-embedding agent may hold the write lock; WAL + busy_timeout handles
// most contention, but SQLITE_BUSY can still surface under sustained pressure.
async function runWithRetry(fn, label, attempts = 6) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      return fn()
    } catch (err) {
      const msg = String(err?.message ?? err)
      const locked = err?.code === 'SQLITE_BUSY' || err?.code === 'SQLITE_BUSY_SNAPSHOT' || /database is locked|database table is locked/i.test(msg)
      if (!locked || i === attempts - 1) {
        if (locked) console.error(`[backfill] giving up on ${label} after ${attempts} lock retries`)
        throw err
      }
      const backoff = 250 * Math.pow(2, i) + Math.floor(Math.random() * 200)
      await new Promise((r) => setTimeout(r, backoff))
      lastErr = err
    }
  }
  throw lastErr
}

// --- open DB -----------------------------------------------------------------
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 15000')

// --- select the rows missing an embedding ------------------------------------
// LEFT JOIN / NOT EXISTS against supplier_embeddings. Only rows with a usable
// name are embeddable (a NULL/empty name yields an empty embed-text). Ordered
// by id for stable, resumable paging.
const selectSql = `
  SELECT c.id, c.name, c.description, c.capability, c.category, c.subcategory,
         c.specialties, c.materials_handled, c.certifications, c.country, c.city,
         c.raw_snippet, c.recent_news, c.supabase_listing_id
  FROM companies c
  WHERE NOT EXISTS (SELECT 1 FROM supplier_embeddings se WHERE se.company_id = c.id)
    AND c.name IS NOT NULL AND TRIM(c.name) != ''
  ORDER BY c.id ASC
  ${LIMIT > 0 ? `LIMIT ${LIMIT}` : ''}
`
const missing = db.prepare(selectSql).all()

const totalCompanies = db.prepare('SELECT COUNT(*) AS n FROM companies').get().n
const alreadyEmbedded = db.prepare('SELECT COUNT(*) AS n FROM supplier_embeddings').get().n
console.log(`[backfill] companies=${totalCompanies}, already-embedded=${alreadyEmbedded}, missing(selected)=${missing.length}${LIMIT ? ` (capped at --limit ${LIMIT})` : ''}`)

if (DRY_RUN) {
  console.log('[backfill] --dry-run: no embeds, no writes. Exiting.')
  db.close()
  process.exit(0)
}

if (missing.length === 0) {
  console.log('[backfill] nothing to do — every named company already has an embedding.')
  db.close()
  process.exit(0)
}

// --- prepared UPSERT (JSON-array TEXT embedding) -----------------------------
const upsertStmt = db.prepare(`
  INSERT INTO supplier_embeddings
    (company_id, embedding, source_text_hash, model, dims, supabase_listing_id, created_at, updated_at)
  VALUES (@company_id, @embedding, @source_text_hash, @model, @dims, @supabase_listing_id, @created_at, @updated_at)
  ON CONFLICT(company_id) DO UPDATE SET
    embedding = excluded.embedding,
    source_text_hash = excluded.source_text_hash,
    model = excluded.model,
    dims = excluded.dims,
    supabase_listing_id = COALESCE(excluded.supabase_listing_id, supplier_embeddings.supabase_listing_id),
    updated_at = excluded.updated_at
`)

const stats = { embedded: 0, skipped_empty: 0, embed_failed: 0, skipped_hash: 0 }
let pending = [] // {rowObj} fully prepared for insert

// Commit the current pending batch inside one retry-wrapped transaction.
async function flushBatch() {
  if (pending.length === 0) return
  const rows = pending
  pending = []
  await runWithRetry(() => {
    const tx = db.transaction((batch) => {
      for (const r of batch) upsertStmt.run(r)
    })
    tx(rows)
  }, `batch of ${rows.length}`)
  stats.embedded += rows.length
}

const T0 = Date.now()

for (let i = 0; i < missing.length; i++) {
  const row = missing[i]
  const embedText = buildEmbedText(row)
  if (!embedText) { stats.skipped_empty += 1; continue }
  const hash = hashOf(embedText)

  // Defensive idempotency (the NOT EXISTS already excludes embedded rows, but a
  // concurrent embed-on-write could have inserted one mid-run).
  try {
    const existing = db.prepare('SELECT source_text_hash FROM supplier_embeddings WHERE company_id = ? LIMIT 1').get(row.id)
    if (existing && existing.source_text_hash === hash) { stats.skipped_hash += 1; continue }
  } catch { /* fall through */ }

  let vec
  try {
    vec = await embedWithRetry(embedText)
  } catch (err) {
    stats.embed_failed += 1
    console.error(`[backfill] embed failed for ${row.id} (${String(row.name).slice(0, 40)}): ${String(err?.message ?? err).slice(0, 120)}`)
    continue
  }

  const nowIso = new Date().toISOString()
  pending.push({
    company_id: row.id,
    embedding: JSON.stringify(vec), // JSON-array TEXT, matching existing rows
    source_text_hash: hash,
    model: EMBEDDING_MODEL,
    dims: EMBEDDING_DIMS,
    supabase_listing_id: row.supabase_listing_id ?? null,
    created_at: nowIso,
    updated_at: nowIso,
  })

  if (pending.length >= BATCH) {
    await flushBatch()
    const done = stats.embedded
    const rate = done / Math.max(1, (Date.now() - T0) / 1000)
    console.log(`[backfill] embedded ${done}/${missing.length} (${rate.toFixed(1)}/s, failed ${stats.embed_failed}, empty ${stats.skipped_empty})`)
  }
}
await flushBatch()

// --- VERIFY ------------------------------------------------------------------
const q = (sql, ...args) => db.prepare(sql).get(...args)
const finalCompanies = q('SELECT COUNT(*) AS n FROM companies').n
const finalEmbedded = q('SELECT COUNT(*) AS n FROM supplier_embeddings').n
const stillMissing = q(`
  SELECT COUNT(*) AS n FROM companies c
  WHERE NOT EXISTS (SELECT 1 FROM supplier_embeddings se WHERE se.company_id = c.id)
    AND c.name IS NOT NULL AND TRIM(c.name) != ''
`).n
// Sample a row we just wrote and confirm it parses to 1536 floats.
const sample = q(`
  SELECT se.company_id, se.embedding, se.dims, se.model
  FROM supplier_embeddings se
  ORDER BY se.updated_at DESC LIMIT 1
`)
let sampleDim = -1
try { sampleDim = Array.isArray(JSON.parse(sample.embedding)) ? JSON.parse(sample.embedding).length : -1 } catch { sampleDim = -1 }
// Coverage of NAMED companies (the embeddable population).
const namedCompanies = q(`SELECT COUNT(*) AS n FROM companies WHERE name IS NOT NULL AND TRIM(name) != ''`).n
const namedEmbedded = q(`
  SELECT COUNT(*) AS n FROM companies c
  WHERE name IS NOT NULL AND TRIM(name) != ''
    AND EXISTS (SELECT 1 FROM supplier_embeddings se WHERE se.company_id = c.id)
`).n

db.close()

console.log('\n===== SUPPLIER-EMBEDDING BACKFILL COMPLETE =====')
console.log(`embedded this run........ ${stats.embedded}`)
console.log(`embed failures........... ${stats.embed_failed}`)
console.log(`skipped (empty name/text) ${stats.skipped_empty}`)
console.log(`skipped (hash unchanged). ${stats.skipped_hash}`)
console.log('--- DB state after ---')
console.log(`companies................ ${finalCompanies}`)
console.log(`supplier_embeddings...... ${finalEmbedded}`)
console.log(`named companies.......... ${namedCompanies}`)
console.log(`named WITH embedding..... ${namedEmbedded}  (${((namedEmbedded / Math.max(1, namedCompanies)) * 100).toFixed(1)}%)`)
console.log(`named still missing...... ${stillMissing}  (should be ${stats.embed_failed} = embed-failures only)`)
console.log(`sample new embed dim..... ${sampleDim}  (model=${sample?.model}, dims col=${sample?.dims}; expect 1536)`)

if (sampleDim !== EMBEDDING_DIMS) {
  console.error('\nVERIFY FAILED — last-written embedding did not parse to 1536 floats.')
  process.exit(2)
}
console.log('\nAll invariants hold.')
