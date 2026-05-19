#!/usr/bin/env npx tsx
/**
 * embed-distributor-rows.ts — backfill embeddings for distributor-listing rows
 * (2026-05-18)
 *
 * After ingest-distributor-catalogue.ts --all-classes finishes, the new
 * `pretraining_extracted_parts` rows arrive WITHOUT embeddings (embedding +
 * embed_hash both NULL). Engine C's reference-product anchor needs these
 * vectors so it can retrieve "nearest priced part" by semantic similarity.
 *
 * This script:
 *   1. Scans `pretraining_extracted_parts` for rows where embedding IS NULL
 *      OR embed_hash IS NULL.
 *   2. Batches up to 100 rows per OpenAI request (text-embedding-3-small,
 *      1536 dims — already the schema default elsewhere in the corpus).
 *   3. Embeds the text `${manufacturer} ${part_number} ${part_name}` plus
 *      the raw_excerpt fields when present (manufacturer, description,
 *      category, unitPrice). This is the same recipe Engine C uses at query
 *      time so retrieval is consistent.
 *   4. Writes the 1536-float vector as a Float32 buffer (BLOB) into
 *      `embedding`, and an `embed_hash` = sha256 of the embedded text so
 *      future re-embeds can skip unchanged rows.
 *
 * Cost (est, 2026-05-18):
 *   text-embedding-3-small = $0.02 per 1M tokens
 *   ~250k distributor rows × ~30 tokens each = ~7.5M tokens = $0.15
 *   At GBP rate ≈ £0.12. Tristan budgeted £0.50 — fine.
 *
 * DO NOT RUN until ingest sweep completes — re-running mid-sweep wastes
 * tokens on duplicates the embed_hash will catch on a second pass anyway.
 *
 * Usage:
 *   set -a; source ~/.claude/secrets/openai.env; set +a
 *   npx tsx scripts/embed-distributor-rows.ts --batch=100
 *   npx tsx scripts/embed-distributor-rows.ts --batch=100 --dry-run
 *   npx tsx scripts/embed-distributor-rows.ts --batch=100 --limit=1000
 */

import Database from 'better-sqlite3'
import { homedir } from 'os'
import { join } from 'path'
import { createHash } from 'crypto'

const DB_PATH = join(homedir(), '.forge-truth/forge-truth.db')
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMS = 1536

function arg(name: string, fallback?: string): string | undefined {
  const flag = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(flag))
  return hit ? hit.slice(flag.length) : fallback
}

const BATCH = parseInt(arg('batch', '100')!, 10)
const LIMIT = arg('limit') ? parseInt(arg('limit')!, 10) : Infinity
const DRY_RUN = process.argv.includes('--dry-run')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

// Only embed distributor-listing rows. Manufacturer-datasheet rows are
// embedded elsewhere via the existing extraction pipeline; this script
// targets the new catalogue rows only.
const selectUnembedded = db.prepare(`
  SELECT pep.id, pep.manufacturer, pep.part_number, pep.part_name,
         pep.raw_excerpt, pep.unit_price_gbp, pep.component_class
  FROM pretraining_extracted_parts pep
  JOIN pretraining_spec_documents psd ON psd.id = pep.document_id
  WHERE (pep.embedding IS NULL OR pep.embed_hash IS NULL)
    AND psd.source_type = 'distributor_listing'
  ORDER BY pep.id
  LIMIT ?
`)

const updateRow = db.prepare(`
  UPDATE pretraining_extracted_parts
  SET embedding = ?, embed_hash = ?
  WHERE id = ?
`)

// ---------------------------------------------------------------------------
// Build the text we embed per row. Mirrors the Engine C query-time recipe so
// retrieval is consistent (retrieving by the same canonicalisation we
// indexed by).
// ---------------------------------------------------------------------------
function embedTextFor(row: {
  manufacturer: string | null
  part_number: string | null
  part_name: string | null
  raw_excerpt: string | null
  unit_price_gbp: number | null
  component_class: string | null
}): string {
  const parts = [row.manufacturer, row.part_number, row.part_name].filter(Boolean) as string[]
  let category: string | null = null
  let descFromExcerpt: string | null = null
  if (row.raw_excerpt) {
    try {
      const j = JSON.parse(row.raw_excerpt) as { cat?: string; desc?: string }
      if (j.cat) category = j.cat
      if (j.desc) descFromExcerpt = j.desc
    } catch {
      // ignore — older rows may have unparsed text
    }
  }
  if (category) parts.push(category)
  if (descFromExcerpt && descFromExcerpt !== row.part_name) parts.push(descFromExcerpt)
  if (row.component_class) parts.push(`[class:${row.component_class}]`)
  if (typeof row.unit_price_gbp === 'number') parts.push(`[price:£${row.unit_price_gbp.toFixed(2)}]`)
  return parts.join(' ').slice(0, 4096)
}

// ---------------------------------------------------------------------------
// OpenAI batch embed
// ---------------------------------------------------------------------------
async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: texts,
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMS,
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '<no body>')
    throw new Error(`OpenAI embeddings HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> }
  // OpenAI returns these in input-order but the contract documents index — sort to be safe.
  const sorted = [...data.data].sort((a, b) => a.index - b.index)
  return sorted.map((d) => d.embedding)
}

// Float32 buffer encoding — matches what better-sqlite3 / sqlite-vss expect
// for BLOB-stored embeddings. (Adjust here if you later move to sqlite-vec.)
function vectorToBlob(vec: number[]): Buffer {
  const buf = Buffer.alloc(vec.length * 4)
  for (let i = 0; i < vec.length; i++) buf.writeFloatLE(vec[i], i * 4)
  return buf
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey && !DRY_RUN) {
    console.error('OPENAI_API_KEY not set (source ~/.claude/secrets/openai.env first)')
    process.exit(1)
  }

  console.log(`=== Distributor row embedder ===`)
  console.log(`model:     ${EMBEDDING_MODEL}`)
  console.log(`batch:     ${BATCH}`)
  console.log(`limit:     ${LIMIT === Infinity ? 'none' : LIMIT}`)
  console.log(`dry_run:   ${DRY_RUN}`)
  console.log()

  let totalEmbedded = 0
  let totalCostUsd = 0
  const start = Date.now()

  // Page in batches to keep memory flat over a multi-100k-row run
  for (;;) {
    const remaining = LIMIT - totalEmbedded
    if (remaining <= 0) break
    const pageSize = Math.min(BATCH, remaining)
    const rows = selectUnembedded.all(pageSize) as Array<{
      id: number
      manufacturer: string
      part_number: string
      part_name: string
      raw_excerpt: string
      unit_price_gbp: number | null
      component_class: string | null
    }>
    if (rows.length === 0) break

    const texts = rows.map(embedTextFor)

    if (DRY_RUN) {
      console.log(`[dry] would embed ${rows.length} rows; sample text:`, texts[0]?.slice(0, 200))
      // Don't loop forever in dry-run — single batch is enough to validate
      break
    }

    let vectors: number[][]
    try {
      vectors = await embedBatch(texts, apiKey!)
    } catch (err) {
      console.error(`[embed] batch failed:`, (err as Error).message)
      // Back off then continue — most likely a 429 / transient 5xx
      await new Promise((r) => setTimeout(r, 30_000))
      continue
    }

    if (vectors.length !== rows.length) {
      console.error(`[embed] returned ${vectors.length} vectors for ${rows.length} rows — aborting`)
      break
    }

    const tx = db.transaction(() => {
      for (let i = 0; i < rows.length; i++) {
        const blob = vectorToBlob(vectors[i])
        const hash = createHash('sha256').update(texts[i]).digest('hex')
        updateRow.run(blob, hash, rows[i].id)
      }
    })
    tx()

    // Token-spend estimate. text-embedding-3-small = $0.02 / 1M tokens.
    // Use 4 chars/token approx — fine for cost-tracking precision.
    const charsThisBatch = texts.reduce((s, t) => s + t.length, 0)
    const tokensThisBatch = charsThisBatch / 4
    totalCostUsd += (tokensThisBatch / 1_000_000) * 0.02

    totalEmbedded += rows.length
    if (totalEmbedded % 1000 === 0 || rows.length < BATCH) {
      console.log(`[embed] +${rows.length} (total ${totalEmbedded}, est cost $${totalCostUsd.toFixed(3)})`)
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`\n=== Done in ${elapsed}s ===`)
  console.log(`embedded:     ${totalEmbedded}`)
  console.log(`est cost USD: $${totalCostUsd.toFixed(3)}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.close())
