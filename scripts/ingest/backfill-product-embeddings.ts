#!/usr/bin/env npx tsx
/**
 * backfill-product-embeddings.ts — one-off, idempotent, resumable embedding
 * backfill for the forge-truth.db `pretraining_products` table (2026-06-04).
 *
 * THE GAP (audited 2026-06-04, products step 4): pretraining_products had NO
 * `embedding` column at all, so the lock-gate's product lookup was lexical-only
 * and could never go hybrid. The embedding BLOB + embed_hash TEXT columns were
 * added (Float32LE, matching pretraining_extracted_*); products-writeback.ts now
 * embeds-on-write. This script back-fills the pre-existing rows so the WHOLE
 * table is retrievable by the hybrid semantic arm (dual-search.ts), not just
 * rows written after the change.
 *
 * Keyed on `product_name` (the TEXT PRIMARY KEY — this table has no `id`),
 * unlike the parts/specs/standards/suppliers backfill (scripts/ingest/
 * backfill-embeddings.ts) which keys on `id`. The embed recipe is delegated to
 * `embedProductRow()` in products-writeback.ts so the backfill vector and the
 * in-chain write vector are IDENTICAL (product name + manufacturer + module
 * names + key-spec values) — no query↔index drift.
 *
 * IDEMPOTENT: only rows WHERE embedding IS NULL are selected, so a re-run never
 * re-embeds. Safe to Ctrl-C and resume (each batch is its own transaction).
 * busy_timeout=10s so a concurrent chain read never wedges the write.
 *
 * Usage:
 *   set -a; source ~/.claude/secrets/openai.env; set +a   # any OPENAI_API_KEY source
 *   npx tsx scripts/ingest/backfill-product-embeddings.ts
 *   npx tsx scripts/ingest/backfill-product-embeddings.ts --dry-run
 *   npx tsx scripts/ingest/backfill-product-embeddings.ts --batch=200 --limit=50
 *
 * British spelling throughout.
 */

import Database from 'better-sqlite3'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { embedProductRow } from '../../src/lib/pdf-engine-v2/lib/knowledge/products-writeback'

const DB_PATH = join(homedir(), '.forge-truth', 'forge-truth.db')

function arg(name: string, fallback?: string): string | undefined {
  const flag = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(flag))
  return hit ? hit.slice(flag.length) : fallback
}

const BATCH = Math.max(1, Math.min(2048, parseInt(arg('batch', '128')!, 10)))
const LIMIT = arg('limit') ? parseInt(arg('limit')!, 10) : Infinity
const DRY_RUN = process.argv.includes('--dry-run')

interface ProductRow {
  product_name: string
  manufacturer: string | null
  modules_json: string | null
  key_specs_json: string | null
}

function parseJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback
  try { return JSON.parse(s) as T } catch { return fallback }
}

async function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`forge-truth.db not found at ${DB_PATH}`)
    process.exit(1)
  }
  if (!process.env.OPENAI_API_KEY && !DRY_RUN) {
    console.error('OPENAI_API_KEY not set (source ~/.claude/secrets/openai.env first)')
    process.exit(1)
  }

  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 10000')

  // Guard: the embedding column must exist (the ALTER ran).
  const cols = (db.prepare(`PRAGMA table_info(pretraining_products)`).all() as Array<{ name: string }>).map((c) => c.name)
  if (!cols.includes('embedding') || !cols.includes('embed_hash')) {
    console.error('pretraining_products is missing embedding/embed_hash columns — run the ALTER first.')
    process.exit(1)
  }

  const total = (db.prepare(`SELECT COUNT(*) AS n FROM pretraining_products WHERE embedding IS NULL`).get() as { n: number }).n
  console.log('=== pretraining_products embedding backfill ===')
  console.log(`db:       ${DB_PATH}`)
  console.log(`null-rows: ${total}`)
  console.log(`batch:    ${BATCH}`)
  console.log(`limit:    ${LIMIT === Infinity ? 'none' : LIMIT}`)
  console.log(`dry_run:  ${DRY_RUN}`)
  console.log()
  if (total === 0) {
    console.log('Nothing to do — every product row already embedded.')
    db.close()
    return
  }

  const selectStmt = db.prepare(
    `SELECT product_name, manufacturer, modules_json, key_specs_json
     FROM pretraining_products WHERE embedding IS NULL ORDER BY product_name LIMIT ?`,
  )
  const updateStmt = db.prepare(`UPDATE pretraining_products SET embedding = ?, embed_hash = ? WHERE product_name = ?`)
  // Sentinel for an un-embeddable (empty-source) row so the sweep terminates.
  const markEmptyStmt = db.prepare(`UPDATE pretraining_products SET embed_hash = ? WHERE product_name = ?`)

  let embedded = 0
  let skippedEmpty = 0
  const start = Date.now()

  for (;;) {
    if (embedded + skippedEmpty >= LIMIT) break
    const pageSize = Math.min(BATCH, LIMIT - embedded - skippedEmpty)
    const rows = selectStmt.all(pageSize) as ProductRow[]
    if (rows.length === 0) break

    if (DRY_RUN) {
      const sample = rows[0]
      console.log(`[dry] would embed ${rows.length} rows; sample product_name="${sample.product_name}" mfr="${sample.manufacturer ?? ''}"`)
      break
    }

    for (const r of rows) {
      const modules = parseJson<unknown>(r.modules_json, [])
      const key_specs = parseJson<Record<string, unknown>>(r.key_specs_json, {})
      const res = await embedProductRow({
        product_name: r.product_name,
        manufacturer: r.manufacturer,
        modules,
        key_specs,
      })
      if (res) {
        updateStmt.run(res.embedding, res.embed_hash, r.product_name)
        embedded += 1
      } else {
        // Either empty source (nothing to embed) or a transient embed failure.
        // Stamp a sentinel ONLY when the source is genuinely empty, so a real
        // network blip is retried on the next run rather than masked forever.
        const src = [r.product_name, r.manufacturer ?? ''].filter(Boolean).join(' ').trim()
        if (!src) {
          markEmptyStmt.run('(empty)', r.product_name)
          skippedEmpty += 1
        } else {
          // Transient failure with a non-empty source: stop and let a re-run
          // resume (the row stays embedding IS NULL, so it is re-selected).
          console.error(`[backfill] embed failed for "${r.product_name}" with non-empty source — stopping; re-run to resume.`)
          db.close()
          process.exit(2)
        }
      }
    }
    console.log(`[backfill] +${rows.length} (embedded ${embedded}, empty ${skippedEmpty})`)
    if (rows.length < pageSize) break
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`\n=== Done in ${elapsed}s ===`)
  console.log(`embedded:      ${embedded}`)
  console.log(`skipped-empty: ${skippedEmpty}`)
  const remaining = (db.prepare(`SELECT COUNT(*) AS n FROM pretraining_products WHERE embedding IS NULL AND embed_hash IS NULL`).get() as { n: number }).n
  console.log(`remaining NULL (no sentinel): ${remaining}`)
  db.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
