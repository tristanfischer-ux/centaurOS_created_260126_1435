/**
 * scripts/lib/orchestrator/library-candidate-query.ts
 *
 * Stage 17.6 — LIBRARY-INFORMED CANDIDATE QUERY (advisory, codified 2026-05-24).
 *
 * Tristan's architecture statement:
 *   "Physics defines the space; library populates the options within that
 *    space; LLM picks from options with override allowed; tools verify the
 *    pick."
 *
 * This helper closes the gap between Stage 17.5 (orchestrator tools compute
 * physics specs — pybamm, ngspice, coolprop, pandapower, etc.) and Stage 4
 * (LLM Generator / reviewers refine the BoM). Today the Generator INVENTS
 * part numbers from imagination; the renderer queries the library post-hoc
 * to LOOKUP price/manufacturer and often misses. With this helper the
 * library is queried BEFORE the Generator sees the prompt — top-N real
 * parts per (component_class, physics_specs) tuple are surfaced as ADVISORY
 * suggestions, with override allowed.
 *
 * The library lives at ~/.forge-truth/forge-truth.db, table
 * pretraining_extracted_parts (31,625 rows as of 2026-05-24, 31,584 with
 * embeddings). Embeddings are text-embedding-3-small @ 1536 dims, stored
 * as Float32LE BLOB (see scripts/embed-distributor-rows.ts). Component
 * classes: 21 distinct values, top-20 covered (battery_cell,
 * electronic_power_module, motor_actuator, thermal, structural_metal,
 * sensor, etc.).
 *
 * Retrieval strategy:
 *   1. Filter rows by component_class (LIKE pattern OR exact) AND
 *      confidence >= MIN_CONFIDENCE (default 0.5).
 *   2. If OPENAI_API_KEY is set + the filter returned > top_n rows,
 *      embed the natural-language query string ("`${component_class}` for
 *      `${physics_specs_summary}`") and rank candidates by cosine
 *      similarity against the row's BLOB embedding.
 *   3. If OPENAI_API_KEY is NOT set OR the embed request fails, fall back
 *      to confidence DESC ordering (no semantic match). The graceful
 *      fallback path is documented inline + flagged in the diagnostic
 *      string returned to the caller.
 *   4. Empty result handles gracefully — returns [] + a "no library match
 *      for <class>" diagnostic, NOT an error.
 *
 * Universal across product classes — pretraining_extracted_parts is the
 * single source of "real parts I've seen in the wild" (Tesla Megapacks,
 * CATL cells, Schneider/ABB switchgear, etc.).
 */

import Database from 'better-sqlite3'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'

// ---------------------------------------------------------------------------
// PUBLIC TYPES
// ---------------------------------------------------------------------------

export interface PhysicsSpecs {
  /** Free-form short summary of the physics constraints (e.g.
   *  "LFP prismatic cell, 280 Ah, 3.2 V nominal, 6000-cycle life"). The
   *  helper appends this to the query string so semantic match can bias
   *  toward chemistry / form factor / rating. Optional — empty string is
   *  fine, the helper still filters by component_class. */
  summary?: string
  /** Optional structured fields if the caller has them — appended to the
   *  query string in a deterministic order. */
  fields?: Record<string, string | number>
}

export interface LibraryCandidate {
  part_name: string | null
  manufacturer: string | null
  part_number: string | null
  raw_excerpt: string | null
  confidence: number
  similarity: number  // 0..1 cosine when embedding ran, NaN when class-only fallback
  unit_price_gbp: number | null
  component_class: string | null
}

export interface LibraryCandidateResult {
  candidates: LibraryCandidate[]
  /** Diagnostic string — e.g. "ok (5 candidates, embedding match)" or
   *  "fallback: class-only filter, OPENAI_API_KEY not set" or "empty: no
   *  library row for class=foo". Always set so the caller can log + emit
   *  this into the advisory block. */
  diagnostic: string
  /** True when retrieval used cosine similarity, false when class-only. */
  used_embedding: boolean
}

// ---------------------------------------------------------------------------
// CONSTANTS — mirror embed-distributor-rows.ts
// ---------------------------------------------------------------------------

const DB_PATH = join(homedir(), '.forge-truth', 'forge-truth.db')
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMS = 1536
const MIN_CONFIDENCE = 0.5
/** Hard cap on rows we read from sqlite for cosine ranking. 31k row scan +
 *  cosine math is ~150 ms; raising this beyond 500 only matters for very
 *  rare classes. Below this number we just rank everything that filtered. */
const MAX_SCAN_ROWS = 500
const FETCH_TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// SINGLETON DB HANDLE — opened lazily, shared across calls in one process
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null
let _dbTried = false

function getDb(): Database.Database | null {
  if (_dbTried) return _db
  _dbTried = true
  try {
    if (!existsSync(DB_PATH)) {
      console.error(`[library-candidate-query] sqlite db missing at ${DB_PATH} — graceful fallback to empty result`)
      return null
    }
    _db = new Database(DB_PATH, { readonly: true })
    // WAL is set by writers; readonly handle inherits.
  } catch (err) {
    console.error(`[library-candidate-query] sqlite open failed: ${(err as Error).message}`)
    _db = null
  }
  return _db
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/** Decode a Float32LE BLOB into a number[] of length EMBEDDING_DIMS. */
function blobToVector(blob: Buffer | null): number[] | null {
  if (!blob) return null
  if (blob.length !== EMBEDDING_DIMS * 4) {
    // Older / mismatched rows — skip rather than throw.
    return null
  }
  const out = new Array<number>(EMBEDDING_DIMS)
  for (let i = 0; i < EMBEDDING_DIMS; i++) out[i] = blob.readFloatLE(i * 4)
  return out
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** Build the natural-language query string we embed. Mirrors the
 *  index-time recipe in embed-distributor-rows.ts so query and index
 *  alignment is consistent. */
function buildQueryText(component_class: string, specs: PhysicsSpecs): string {
  const parts: string[] = [component_class.replace(/[_-]+/g, ' ')]
  if (specs.summary && specs.summary.trim().length > 0) parts.push(specs.summary.trim())
  if (specs.fields) {
    // Deterministic order for cache friendliness; the embed call doesn't
    // memoise but the upstream caller can.
    const keys = Object.keys(specs.fields).sort()
    for (const k of keys) {
      const v = specs.fields[k]
      if (v === null || v === undefined || v === '') continue
      parts.push(`${k}=${v}`)
    }
  }
  parts.push(`[class:${component_class}]`)
  return parts.join(' ').slice(0, 4096)
}

/** Embed a single query string. Returns null when OPENAI_API_KEY missing
 *  or fetch fails — caller falls back to class-only filter. */
async function embedQuery(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text, model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMS }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> }
    return data.data?.[0]?.embedding ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

/**
 * Query the pretraining_extracted_parts library for top-N candidates.
 *
 * @param component_class — exact value (e.g. "battery_cell") OR a SQL LIKE
 *   pattern (e.g. "electronic_%"). Caller decides which — exact is faster,
 *   LIKE is more permissive.
 * @param physics_specs — free-form summary + optional structured fields.
 *   Appended to the embedding query so semantic match biases toward
 *   chemistry / form factor / rating.
 * @param top_n — default 5. Caller can ask for more for large modules.
 * @param opts.min_confidence — default 0.5. Raise to bias toward higher
 *   provenance rows.
 *
 * @returns LibraryCandidateResult — never throws. Empty result + a
 *   diagnostic string when no rows match.
 */
export async function queryLibraryCandidates(
  component_class: string,
  physics_specs: PhysicsSpecs,
  top_n: number = 5,
  opts: { min_confidence?: number } = {},
): Promise<LibraryCandidateResult> {
  const minConf = typeof opts.min_confidence === 'number' ? opts.min_confidence : MIN_CONFIDENCE
  const db = getDb()
  if (!db) {
    return { candidates: [], diagnostic: `empty: forge-truth.db not available`, used_embedding: false }
  }

  // Detect LIKE vs exact: caller signals LIKE via '%' in the value.
  const useLike = component_class.includes('%')
  const filterSql = useLike
    ? `component_class LIKE ?`
    : `component_class = ?`

  let scanRows: Array<{
    part_name: string | null
    manufacturer: string | null
    part_number: string | null
    raw_excerpt: string | null
    confidence: number
    unit_price_gbp: number | null
    component_class: string | null
    embedding: Buffer | null
  }>
  try {
    const stmt = db.prepare(`
      SELECT part_name, manufacturer, part_number, raw_excerpt, confidence,
             unit_price_gbp, component_class, embedding
      FROM pretraining_extracted_parts
      WHERE ${filterSql}
        AND confidence >= ?
      ORDER BY confidence DESC
      LIMIT ?
    `)
    scanRows = stmt.all(component_class, minConf, MAX_SCAN_ROWS) as any
  } catch (err) {
    return {
      candidates: [],
      diagnostic: `empty: sqlite query failed (${(err as Error).message.slice(0, 80)})`,
      used_embedding: false,
    }
  }

  if (scanRows.length === 0) {
    return {
      candidates: [],
      diagnostic: `empty: no library row for component_class="${component_class}" (min_confidence=${minConf})`,
      used_embedding: false,
    }
  }

  // If we have <= top_n rows, no point embedding — return all.
  if (scanRows.length <= top_n) {
    const candidates: LibraryCandidate[] = scanRows.map((r) => ({
      part_name: r.part_name,
      manufacturer: r.manufacturer,
      part_number: r.part_number,
      raw_excerpt: r.raw_excerpt,
      confidence: r.confidence,
      similarity: Number.NaN,
      unit_price_gbp: r.unit_price_gbp,
      component_class: r.component_class,
    }))
    return {
      candidates,
      diagnostic: `ok (${candidates.length} candidates, confidence-DESC, class-only filter)`,
      used_embedding: false,
    }
  }

  // Try semantic match. If unavailable, sort by confidence DESC.
  const queryText = buildQueryText(component_class, physics_specs)
  const queryVec = await embedQuery(queryText)

  if (!queryVec) {
    // Class-only fallback — already ordered by confidence DESC from sqlite.
    const candidates: LibraryCandidate[] = scanRows.slice(0, top_n).map((r) => ({
      part_name: r.part_name,
      manufacturer: r.manufacturer,
      part_number: r.part_number,
      raw_excerpt: r.raw_excerpt,
      confidence: r.confidence,
      similarity: Number.NaN,
      unit_price_gbp: r.unit_price_gbp,
      component_class: r.component_class,
    }))
    return {
      candidates,
      diagnostic: `ok (${candidates.length} candidates, fallback: class-only filter, no embedding) — set OPENAI_API_KEY for semantic ranking`,
      used_embedding: false,
    }
  }

  // Semantic match — score every row, pick top-N.
  const scored: Array<{ row: typeof scanRows[number]; sim: number }> = []
  for (const r of scanRows) {
    const vec = blobToVector(r.embedding)
    if (!vec) continue
    scored.push({ row: r, sim: cosineSimilarity(queryVec, vec) })
  }
  scored.sort((a, b) => b.sim - a.sim)
  const top = scored.slice(0, top_n)
  const candidates: LibraryCandidate[] = top.map(({ row, sim }) => ({
    part_name: row.part_name,
    manufacturer: row.manufacturer,
    part_number: row.part_number,
    raw_excerpt: row.raw_excerpt,
    confidence: row.confidence,
    similarity: sim,
    unit_price_gbp: row.unit_price_gbp,
    component_class: row.component_class,
  }))
  return {
    candidates,
    diagnostic: `ok (${candidates.length} candidates, embedding-ranked, scanned ${scored.length} rows)`,
    used_embedding: true,
  }
}

/**
 * Render a compact advisory block string for the LLM reviewer prompt.
 * Stable, human-readable format with one candidate per line. Truncates
 * raw_excerpt to 120 chars per task spec.
 */
export function renderCandidateBlock(
  component_class: string,
  result: LibraryCandidateResult,
): string {
  if (result.candidates.length === 0) {
    return `  ${component_class}: (no library match — pick freely; ${result.diagnostic})`
  }
  const lines: string[] = [`  ${component_class}: (${result.diagnostic})`]
  for (let i = 0; i < result.candidates.length; i++) {
    const c = result.candidates[i]
    const mfr = c.manufacturer ? c.manufacturer : '(unknown mfr)'
    const pn = c.part_number ? c.part_number : '(no SKU)'
    const excerpt = (c.raw_excerpt ?? '').replace(/\s+/g, ' ').slice(0, 120)
    const sim = Number.isFinite(c.similarity) ? `sim=${c.similarity.toFixed(2)}` : `conf=${c.confidence.toFixed(2)}`
    lines.push(`    ${i + 1}. ${mfr} ${pn} [${sim}] — ${excerpt}`)
  }
  return lines.join('\n')
}

/** Optional cleanup — call before process exit if the caller wants to be
 *  tidy. Not strictly necessary as Node closes handles on exit. */
export function closeLibraryDb(): void {
  if (_db) {
    try { _db.close() } catch { /* ignore */ }
    _db = null
  }
  _dbTried = false
}
