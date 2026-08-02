#!/usr/bin/env npx tsx
/**
 * backfill-embeddings.ts — one-off, idempotent, resumable embedding backfill for
 * the forge-truth.db pretraining corpus tables (2026-06-04).
 *
 * THE GAP (audited 2026-06-04): the growing-DB write-back paths added rows to
 * `pretraining_extracted_parts` over time (distributor cascade hits, emitter
 * on-the-fly completions, curated seeds) WITHOUT computing the 1536-d embedding.
 * The Stage 17.6 RAG (`scripts/rag/reference_lookup.py` / `radical/g5-rag.ts` /
 * `library-candidate-query.ts`) retrieves by embedding cosine similarity, so a
 * NULL-embedded row is INVISIBLE to retrieval — the moat grew in rows but not in
 * retrievable coverage. ~7,284 of ~38,987 parts (19%) carried no vector, plus a
 * handful of specs/standards rows.
 *
 * This script sweeps EVERY corpus table that has an `embedding` column and embeds
 * every row WHERE embedding IS NULL, in batches, resumable, idempotent:
 *   - pretraining_extracted_parts      (the main backlog)
 *   - pretraining_extracted_specs
 *   - pretraining_extracted_standards
 *   - pretraining_extracted_suppliers
 *
 * It is SOURCE-AGNOSTIC — unlike the older `scripts/embed-distributor-rows.ts`
 * (which only matched `source_type='distributor_listing'` joined via
 * spec_documents and therefore MISSED the live cascade rows, whose doc row is
 * `source_type='distributor_cascade'`). The only predicate here is
 * `embedding IS NULL`, so it cannot miss a source.
 *
 * Embedding model + encoding match every read + write path:
 *   text-embedding-3-small, dimensions=1536, Float32LE BLOB.
 * embed_hash = sha256(embed_source).slice(0,32) — the corpus convention
 * (background-enrichment.ts, _ingest-co2-harvest.mjs).
 *
 * IDEMPOTENT: only rows WHERE embedding IS NULL are selected, so a re-run never
 * re-embeds an already-embedded row and never double-charges OpenAI. Safe to
 * Ctrl-C and resume — committed batches stay committed (each batch is its own
 * transaction).
 *
 * COST (est): text-embedding-3-small = $0.02 / 1M tokens. ~7,300 rows × ~40
 * tokens ≈ 0.3M tokens ≈ $0.006 (≈ £0.005). Negligible.
 *
 * Usage:
 *   set -a; source ~/.claude/secrets/openai.env; set +a   # or any OPENAI_API_KEY source
 *   npx tsx scripts/ingest/backfill-embeddings.ts
 *   npx tsx scripts/ingest/backfill-embeddings.ts --dry-run
 *   npx tsx scripts/ingest/backfill-embeddings.ts --batch=512 --table=pretraining_extracted_parts
 *   npx tsx scripts/ingest/backfill-embeddings.ts --limit=1000
 *
 * British spelling throughout.
 */

import Database from 'better-sqlite3'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

const DB_PATH = join(homedir(), '.forge-truth', 'forge-truth.db')
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMS = 1536

function arg(name: string, fallback?: string): string | undefined {
  const flag = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(flag))
  return hit ? hit.slice(flag.length) : fallback
}

const BATCH = Math.max(1, Math.min(2048, parseInt(arg('batch', '256')!, 10)))
const LIMIT = arg('limit') ? parseInt(arg('limit')!, 10) : Infinity
const ONLY_TABLE = arg('table') // optional — restrict to a single table
const DRY_RUN = process.argv.includes('--dry-run')

// ---------------------------------------------------------------------------
// Per-table backfill spec. `selectCols` are the columns we SELECT to build the
// embed text; `embedSourceOf` maps a row to the canonical embed string for that
// table (matching how the table is embedded elsewhere in the corpus).
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>
interface TableSpec {
  table: string
  selectCols: string[]
  embedSourceOf: (r: Row) => string
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length ? s : null
}

const TABLES: TableSpec[] = [
  {
    table: 'pretraining_extracted_parts',
    selectCols: ['part_name', 'manufacturer', 'part_number', 'raw_excerpt'],
    // Matches background-enrichment.ts processPart + _ingest-co2-harvest.mjs +
    // library-writeback.ts: [part_name, manufacturer, part_number, raw_excerpt].
    embedSourceOf: (r) =>
      [str(r.part_name), str(r.manufacturer), str(r.part_number), str(r.raw_excerpt)]
        .filter(Boolean)
        .join(' '),
  },
  {
    table: 'pretraining_extracted_specs',
    selectCols: ['spec_key', 'spec_value', 'spec_unit', 'raw_excerpt'],
    embedSourceOf: (r) =>
      [str(r.spec_key), str(r.spec_value), str(r.spec_unit), str(r.raw_excerpt)]
        .filter(Boolean)
        .join(' '),
  },
  {
    // ⭐ ADDED 2026-08-02. This table had NO embedding column at all, so it
    // searched LEXICAL ONLY while fpk_extracted_claims searched hybrid — a
    // 24,946-row corpus half-invisible to retrieval. The column was added
    // (additive ALTER TABLE, matching fpk_extracted_claims: embed_hash TEXT,
    // embedding BLOB) and the table registered here so this existing tool
    // backfills it rather than anyone writing a second one.
    table: 'fpk_component_literature',
    selectCols: ['contribution', 'component_id', 'topic_id', 'doi'],
    embedSourceOf: (r) =>
      [str(r.contribution), str(r.component_id), str(r.topic_id), str(r.doi)]
        .filter(Boolean)
        .join(' '),
  },
  {
    table: 'pretraining_extracted_standards',
    selectCols: ['standard_name', 'scope', 'raw_excerpt'],
    embedSourceOf: (r) =>
      [str(r.standard_name), str(r.scope), str(r.raw_excerpt)].filter(Boolean).join(' '),
  },
  {
    table: 'pretraining_extracted_suppliers',
    selectCols: ['company_name', 'role', 'website', 'raw_excerpt'],
    embedSourceOf: (r) =>
      [str(r.company_name), str(r.role), str(r.website), str(r.raw_excerpt)]
        .filter(Boolean)
        .join(' '),
  },
]

function embedHashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32)
}

function vectorToBlob(vec: number[]): Buffer {
  const buf = Buffer.alloc(vec.length * 4)
  for (let i = 0; i < vec.length; i++) buf.writeFloatLE(vec[i], i * 4)
  return buf
}

// ---------------------------------------------------------------------------
// OpenAI batch embed (many inputs per request).
// ---------------------------------------------------------------------------
async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: texts, model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMS }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '<no body>')
    throw new Error(`OpenAI embeddings HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> }
  const sorted = [...data.data].sort((a, b) => a.index - b.index)
  const vecs = sorted.map((d) => d.embedding)
  for (const v of vecs) {
    if (!Array.isArray(v) || v.length !== EMBEDDING_DIMS) {
      throw new Error(`embed returned ${v ? v.length : 'null'} dims, expected ${EMBEDDING_DIMS}`)
    }
  }
  return vecs
}

// ---------------------------------------------------------------------------
// Backfill one table.
// ---------------------------------------------------------------------------
async function backfillTable(
  db: Database.Database,
  spec: TableSpec,
  apiKey: string | undefined,
  budget: number,
): Promise<{ embedded: number; skippedEmpty: number; costUsd: number }> {
  const cols = spec.selectCols.join(', ')
  // Page from the front each time: because we UPDATE embedding to non-NULL, the
  // `embedding IS NULL` window shrinks every batch — naturally resumable.
  const selectStmt = db.prepare(
    `SELECT id, ${cols} FROM ${spec.table} WHERE embedding IS NULL ORDER BY id LIMIT ?`,
  )
  const updateStmt = db.prepare(`UPDATE ${spec.table} SET embedding = ?, embed_hash = ? WHERE id = ?`)
  // For a row whose embed text is empty (all source cols NULL/blank), stamp a
  // sentinel embed_hash WITHOUT an embedding so it is not re-selected forever —
  // there is nothing meaningful to embed. (Rare; keeps the sweep terminating.)
  const markEmptyStmt = db.prepare(`UPDATE ${spec.table} SET embed_hash = ? WHERE id = ?`)

  const total = (db.prepare(`SELECT COUNT(*) AS n FROM ${spec.table} WHERE embedding IS NULL`).get() as { n: number }).n
  if (total === 0) {
    console.log(`[${spec.table}] 0 NULL-embedded rows — nothing to do`)
    return { embedded: 0, skippedEmpty: 0, costUsd: 0 }
  }
  console.log(`[${spec.table}] ${total} NULL-embedded rows to backfill (budget ${budget === Infinity ? 'none' : budget})`)

  let embedded = 0
  let skippedEmpty = 0
  let costUsd = 0

  for (;;) {
    if (embedded + skippedEmpty >= budget) break
    const pageSize = Math.min(BATCH, budget - embedded - skippedEmpty)
    const rows = selectStmt.all(pageSize) as Array<Row & { id: number }>
    if (rows.length === 0) break

    // Split empty-source rows out (cannot embed an empty string usefully).
    const toEmbed: Array<{ id: number; text: string }> = []
    const empties: number[] = []
    for (const r of rows) {
      const text = spec.embedSourceOf(r)
      if (text) toEmbed.push({ id: r.id, text })
      else empties.push(r.id)
    }

    if (DRY_RUN) {
      console.log(
        `[${spec.table}] [dry] would embed ${toEmbed.length} (skip ${empties.length} empty); sample: ${toEmbed[0]?.text.slice(0, 160) ?? '—'}`,
      )
      break // one page is enough to validate in dry-run
    }

    if (empties.length) {
      const txE = db.transaction(() => {
        for (const id of empties) markEmptyStmt.run('(empty)', id)
      })
      txE()
      skippedEmpty += empties.length
    }

    if (toEmbed.length) {
      let vectors: number[][]
      try {
        vectors = await embedBatch(
          toEmbed.map((t) => t.text.slice(0, 4096)),
          apiKey!,
        )
      } catch (err) {
        console.error(`[${spec.table}] batch failed: ${(err as Error).message} — backing off 20s`)
        await new Promise((r) => setTimeout(r, 20_000))
        continue
      }
      const tx = db.transaction(() => {
        for (let i = 0; i < toEmbed.length; i++) {
          const blob = vectorToBlob(vectors[i])
          const hash = embedHashOf(toEmbed[i].text)
          updateStmt.run(blob, hash, toEmbed[i].id)
        }
      })
      tx()
      const chars = toEmbed.reduce((s, t) => s + Math.min(t.text.length, 4096), 0)
      costUsd += (chars / 4 / 1_000_000) * 0.02
      embedded += toEmbed.length
    }

    if ((embedded + skippedEmpty) % 1024 === 0 || rows.length < BATCH) {
      console.log(
        `[${spec.table}] +${rows.length} (embedded ${embedded}, empty ${skippedEmpty}, est $${costUsd.toFixed(4)})`,
      )
    }
  }

  console.log(`[${spec.table}] done — embedded ${embedded}, skipped-empty ${skippedEmpty}, est $${costUsd.toFixed(4)}`)
  return { embedded, skippedEmpty, costUsd }
}

async function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`forge-truth.db not found at ${DB_PATH}`)
    process.exit(1)
  }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey && !DRY_RUN) {
    console.error('OPENAI_API_KEY not set (source ~/.claude/secrets/openai.env first)')
    process.exit(1)
  }

  const specs = ONLY_TABLE ? TABLES.filter((t) => t.table === ONLY_TABLE) : TABLES
  if (ONLY_TABLE && specs.length === 0) {
    console.error(`--table=${ONLY_TABLE} is not a known corpus table`)
    process.exit(1)
  }

  console.log('=== forge-truth.db embedding backfill ===')
  console.log(`db:        ${DB_PATH}`)
  console.log(`model:     ${EMBEDDING_MODEL} (${EMBEDDING_DIMS}-d)`)
  console.log(`batch:     ${BATCH}`)
  console.log(`limit:     ${LIMIT === Infinity ? 'none' : LIMIT}`)
  console.log(`tables:    ${specs.map((s) => s.table).join(', ')}`)
  console.log(`dry_run:   ${DRY_RUN}`)
  console.log()

  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 10000')

  const start = Date.now()
  let grandEmbedded = 0
  let grandEmpty = 0
  let grandCost = 0
  for (const spec of specs) {
    const remaining = LIMIT - grandEmbedded - grandEmpty
    if (remaining <= 0) break
    const r = await backfillTable(db, spec, apiKey, remaining === Infinity ? Infinity : remaining)
    grandEmbedded += r.embedded
    grandEmpty += r.skippedEmpty
    grandCost += r.costUsd
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`\n=== Done in ${elapsed}s ===`)
  console.log(`total embedded:     ${grandEmbedded}`)
  console.log(`total skipped-empty: ${grandEmpty}`)
  console.log(`est cost USD:        $${grandCost.toFixed(4)}`)
  db.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
