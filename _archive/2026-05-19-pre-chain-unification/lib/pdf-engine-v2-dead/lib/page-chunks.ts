/**
 * @file page-chunks.ts — read-only access to the ~1.9M-chunk page_chunks
 *                       corpus for supplier-backed part notes (E4).
 *
 * corpus.db lives at:
 *   ~/Developer/Forge-Capital/nightshift/crawler/corpus.db
 *
 * Schema:
 *   page_chunks(
 *     id, source, entity_id, page_url, chunk_idx, chunk_text,
 *     embedding_json, embedded_at, UNIQUE(source, entity_id, page_url, chunk_idx)
 *   )
 *   INDEX idx_chunks_entity(source, entity_id) — fast per-entity lookup
 *
 * Counts at build time (2026-05-06):
 *   investor:            864,975
 *   investor_synth:           10
 *   nightshift_company: 1,919,308   ← what E4 uses
 *   nightshift_synth:     17,248
 *   portfolio_company:    46,980
 *
 * Rule: queries must use the index (source + entity_id) otherwise a full
 * scan takes >2 minutes. Never issue a bare LIKE on the full table.
 *
 * This module is LOCAL ONLY. Returns null for any query when corpus.db
 * isn't present (Vercel, CI, other Macs). Callers fall back to returning
 * no snippet rather than crashing.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const CORPUS_DB = join(
  homedir(),
  'Developer/Forge-Capital/nightshift/crawler/corpus.db',
)

let _db: Database.Database | null = null
let _dbAttempted = false

function getCorpusDb(): Database.Database | null {
  if (_dbAttempted) return _db
  _dbAttempted = true
  try {
    if (!existsSync(CORPUS_DB)) {
      console.log('[page-chunks] corpus.db not found, E4 snippets unavailable')
      return null
    }
    _db = new Database(CORPUS_DB, { readonly: true, fileMustExist: true })
    _db.pragma('query_only = true')
    console.log('[page-chunks] corpus.db open (read-only)')
    return _db
  } catch (err) {
    console.warn('[page-chunks] failed to open corpus.db:', (err as Error).message)
    return null
  }
}

export function isPageChunksAvailable(): boolean {
  return getCorpusDb() !== null
}

export interface PartSnippet {
  /** 1-2 sentence excerpt from a supplier page mentioning the part. */
  text: string
  /** URL where the excerpt came from. */
  sourceUrl: string
  /** Which company (supplier) the excerpt is attributed to. */
  companyId: string
  /** Approximate relevance score (keyword-hit count). */
  relevance: number
}

/**
 * Retrieve a short excerpt from supplier pages that mentions keywords from
 * the part. Uses the (source, entity_id) index so lookup is ~5ms per
 * company. Keyword matching is case-insensitive.
 *
 * Strategy:
 *   1. Pull all chunks for the given entity_id (typically 10-100 chunks).
 *   2. Score each chunk by keyword-hit count.
 *   3. Return the best chunk, trimmed to 2 sentences (~300 chars).
 *
 * @param entityId company UUID (matches companies.id in nightshift.db)
 * @param keywords 2-6 short keyword strings derived from part name + material + process
 * @returns best snippet or null if no chunks / no matches
 */
export function getPartSnippetFromSupplier(
  entityId: string,
  keywords: string[],
): PartSnippet | null {
  const db = getCorpusDb()
  if (!db) return null
  if (!entityId) return null
  const terms = keywords
    .map(k => (k || '').toLowerCase().trim())
    .filter(k => k.length >= 3 && k.length <= 40)
  if (terms.length === 0) return null

  type ChunkRow = { page_url: string; chunk_text: string }
  const rows = db.prepare(
    `SELECT page_url, chunk_text
     FROM page_chunks
     WHERE source = 'nightshift_company' AND entity_id = ?
     LIMIT 200`,
  ).all(entityId) as ChunkRow[]

  if (rows.length === 0) return null

  let best: { text: string; url: string; hits: number } | null = null
  for (const row of rows) {
    const lower = (row.chunk_text || '').toLowerCase()
    let hits = 0
    for (const t of terms) {
      if (lower.includes(t)) hits++
    }
    if (hits === 0) continue
    if (!best || hits > best.hits) {
      best = { text: row.chunk_text || '', url: row.page_url || '', hits }
    }
  }

  if (!best) return null

  return {
    text: truncToSentences(best.text, 2),
    sourceUrl: best.url,
    companyId: entityId,
    relevance: best.hits,
  }
}

/**
 * Truncate text to at most N sentences. Strips boilerplate nav text
 * (repeated hyphens, bullet dots, repeated pipe characters).
 */
function truncToSentences(text: string, maxSentences: number): string {
  if (!text) return ''
  // Collapse whitespace
  const cleaned = text
    .replace(/[\s\n\r\t]+/g, ' ')
    // Strip common nav boilerplate patterns
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\s*[•·]\s*/g, '. ')
    .trim()

  // Very short — return as-is
  if (cleaned.length < 60) return cleaned

  // Split on sentence boundaries (keep the punctuation)
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned]
  // Prefer sentences of 30-280 chars (filters nav spam like "Home About Services Contact").
  const filtered = sentences.filter(s => {
    const len = s.trim().length
    return len >= 30 && len <= 320
  })
  const picked = (filtered.length > 0 ? filtered : sentences).slice(0, maxSentences)
  let out = picked.join(' ').trim()
  // Absolute cap at 400 chars just in case.
  if (out.length > 400) out = out.slice(0, 397) + '...'
  return out
}

/**
 * Keyword extractor: turn a Part into a small set of lowercase keyword
 * strings for corpus lookup. Keeps compound terms like "LFP prismatic".
 */
export function partKeywords(part: {
  name: string
  material?: string | null
  process?: string | null
}): string[] {
  const out = new Set<string>()
  const pushAll = (s: string | null | undefined) => {
    if (!s) return
    const lower = s.toLowerCase()
    // Full phrase (if short enough)
    if (lower.length >= 3 && lower.length <= 40) out.add(lower)
    // Individual words >= 4 chars to avoid stop words
    for (const w of lower.split(/[^a-z0-9]+/)) {
      if (w.length >= 4 && w.length <= 20) out.add(w)
    }
  }
  pushAll(part.name)
  pushAll(part.material || null)
  pushAll(part.process || null)
  return Array.from(out).slice(0, 10) // cap to keep scoring cheap
}
