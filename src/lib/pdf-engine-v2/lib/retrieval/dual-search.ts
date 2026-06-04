/**
 * src/lib/pdf-engine-v2/lib/retrieval/dual-search.ts
 *
 * UNIFORM hybrid (lexical + semantic) DB-first retrieval — the shared substrate.
 *
 * Tristan's directive (2026-06-04): "every DB lookup should be HYBRID — query
 * by LIKE (lexical) AND by embedding (semantic), FUSE the two (higher quality
 * than either alone), DB-first; on a miss → web → write + EMBED → re-retrieve."
 *
 * Mempalace `forgeos_decisions` (2026-04-28, Tristan-validated): "for needle in
 * haystack search at scale, the gold-standard architecture is hybrid retrieval
 * + Reciprocal Rank Fusion + LLM re-rank on top-50". This helper is the
 * retrieval+RRF substrate of that architecture (the LLM re-rank stays in the
 * caller — for suppliers it is the existing Flash-Lite `scoreCandidate`).
 *
 * WHY HYBRID BEATS EITHER ALONE (each retriever catches a different needle):
 *   - LEXICAL (SQL LIKE) catches EXACT strings the embedding ranks low: a
 *     company name, an "ISO 13485", a postcode, an MPN token.
 *   - SEMANTIC (cosine) catches SYNONYMS the LIKE misses: "battery" ↔
 *     "lithium-ion energy storage", "machining" ↔ "precision turning".
 *   A single retriever systematically misses one class; RRF merges the
 *   union-of-strengths into one coherent ranking.
 *
 * WHY RRF (not score-normalisation): LIKE match-count and cosine similarity are
 * on incomparable scales. Reciprocal Rank Fusion is RANK-based —
 *   score(row) = Σ over each list of 1 / (RRF_K + rank0)
 * (rank0 is 0-based; RRF_K=60 is the canonical constant from Cormack et al.
 * 2009 and the mempalace drawer) — so it needs no normalisation and rewards
 * rows that rank well in MULTIPLE lists. Naïve "union + sum of raw scores" is
 * strictly worse and is the trap most first attempts reach for.
 *
 * STORAGE-FORMAT AGNOSTIC — the two ForgeOS embedding tables differ:
 *   - `format: 'f32le_blob'` → pretraining_extracted_* (Float32LE BLOB, the
 *     parts RAG convention; see scripts/lib/orchestrator/library-candidate-query.ts).
 *   - `format: 'json_text'`  → supplier_embeddings (a JSON-array TEXT column
 *     "[-0.038, ...]"; see scripts/supplier-enrichment/embed-supplier.ts).
 *   `parseEmbedding(format)` switches between them so ONE helper serves both.
 *
 * REUSABLE FOR PARTS LATER: the parts RAG (library-candidate-query.ts) is
 * embedding-ONLY today. It can call `dualSearch({ table:'pretraining_extracted_parts',
 * lexicalCols:['part_name','manufacturer','raw_excerpt'], embedding:{ table:
 * 'pretraining_extracted_parts', column:'embedding', format:'f32le_blob' },
 * queryText, k, where:"component_class = 'battery_cell'" })` with NO change to
 * this file — the LIKE arm is what it is currently missing.
 *
 * Read-only DB connection + `busy_timeout` — the supplier embed-on-write
 * backfill (background-enrichment.ts / persist-web-fallback.ts) may still be
 * writing while a chain reads.
 *
 * British spelling throughout (behaviour, normalise, optimise).
 */

import { homedir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'

// ---------------------------------------------------------------------------
// CONSTANTS — mirror the two embed conventions so query↔index alignment holds.
// ---------------------------------------------------------------------------

/** Default forge-truth.db path (overridable via the `dbPath` option). */
export const DEFAULT_DB_PATH = join(homedir(), '.forge-truth', 'forge-truth.db')

/** OpenAI embedding model + dims — identical to BOTH read sides so a query
 *  vector is directly comparable to either stored format. */
export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMS = 1536

/**
 * Reciprocal Rank Fusion constant. 60 is the canonical value (Cormack, Clarke
 * & Buettcher 2009) and the one the ForgeOS hybrid-search drawer fixed. Larger
 * k flattens the contribution of top ranks (more democratic across lists);
 * smaller k sharpens it. Exposed so callers can tune, but 60 is the default.
 */
export const RRF_K = 60

const FETCH_TIMEOUT_MS = 30_000
const DEFAULT_BUSY_TIMEOUT_MS = 5_000

// ---------------------------------------------------------------------------
// PUBLIC TYPES
// ---------------------------------------------------------------------------

/** Storage format of the embedding column. */
export type EmbeddingFormat = 'f32le_blob' | 'json_text'

export interface DualSearchEmbeddingConfig {
  /** Table holding the embedding. May be the SAME table as the lexical rows
   *  (parts: embedding lives on pretraining_extracted_parts) OR a JOINed side
   *  table (suppliers: embedding lives on supplier_embeddings keyed company_id). */
  table: string
  /** Column name of the embedding (e.g. 'embedding'). */
  column: string
  /** Storage format — drives `parseEmbedding`. */
  format: EmbeddingFormat
  /** Column on `embedding.table` that joins to the lexical row id.
   *  Defaults to 'company_id' for the supplier side; for a same-table
   *  embedding pass the lexical table's id column (e.g. 'id'). */
  joinColumn?: string
}

export interface DualSearchArgs {
  /** Lexical table (the row source). */
  table: string
  /** Id column on `table` (default 'id'). */
  idColumn?: string
  /** Columns the LIKE arm searches over (OR'd, per query token). */
  lexicalCols: string[]
  /** Additional columns to SELECT into the returned `row` (besides id +
   *  lexicalCols). Optional — handy so the caller gets a usable row back. */
  selectCols?: string[]
  /** Embedding config (the semantic arm). Omit to run lexical-only (still
   *  RRF-shaped so the return type is stable). */
  embedding?: DualSearchEmbeddingConfig
  /** Free-text query (a supplier-need sentence, a part-slot description). */
  queryText: string
  /** Final number of fused rows to return. */
  k: number
  /** Optional raw SQL predicate appended with AND to BOTH arms (e.g.
   *  "component_class = 'battery_cell'" or "country IN ('GB','DE')"). The
   *  caller is responsible for escaping — pass only trusted/escaped SQL. */
  where?: string
  /** Per-arm candidate depth before fusion. Defaults to max(50, k*5) so RRF
   *  has enough overlap to work with. */
  perArmK?: number
  /** Override DB path (tests). */
  dbPath?: string
  /** Pre-computed query embedding — lets the caller inject a vector (or a test
   *  supply one) and skip the network call. When absent AND an embedding
   *  config is present, the helper embeds `queryText` via OpenAI. */
  queryEmbedding?: number[] | null
  /** busy_timeout in ms (default 5000) — the backfill may be writing. */
  busyTimeoutMs?: number
}

export interface DualSearchHit<Row = Record<string, unknown>> {
  id: string
  row: Row
  /** 0-based rank in the lexical list, or null if it did not appear. */
  lexical_rank: number | null
  /** 0-based rank in the semantic list, or null if it did not appear. */
  semantic_rank: number | null
  /** Fused Reciprocal Rank Fusion score (higher = better). */
  rrf_score: number
}

export interface DualSearchResult<Row = Record<string, unknown>> {
  hits: DualSearchHit<Row>[]
  /** Human-readable diagnostic for logs/advisory blocks. */
  diagnostic: string
  used_embedding: boolean
  lexical_count: number
  semantic_count: number
}

// ---------------------------------------------------------------------------
// PURE: tokenisation + lexical scoring (exported for the harness + tests)
// ---------------------------------------------------------------------------

const LEXICAL_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'at', 'by',
  'with', 'from', 'as', 'is', 'are', 'be', 'that', 'this', 'we', 'our',
  'supplier', 'manufacturer', 'service', 'services', 'company', 'companies',
  'partner', 'provider', 'uk', 'ltd', 'limited', 'plc', 'inc', 'gmbh',
])

/**
 * Tokenise a free-text query into distinct lower-case significant terms.
 * Drops stopwords + tokens shorter than 3 chars. Order-preserving + deduped.
 * Pure — used by both the SQL builder and the harness invariant.
 */
export function tokenize(query: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of String(query ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    const t = raw.trim()
    if (t.length < 3) continue
    if (LEXICAL_STOPWORDS.has(t)) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/**
 * Pure lexical relevance score for a candidate's concatenated searchable text
 * against the query tokens. Rewards (a) number of distinct tokens matched and
 * (b) earliest match position (a hit near the start of the text — typically the
 * NAME column, which is concatenated first — outranks a hit buried in a
 * description). Returns 0 when nothing matches. Deterministic; no SQL.
 *
 * This is what ranks the lexical list AFTER SQL LIKE has filtered to the rows
 * that contain at least one token — SQL gives us the set, this gives us the
 * order, so an exact company-name match floats to lexical rank 0.
 */
export function lexicalScore(text: string, tokens: string[]): number {
  if (tokens.length === 0) return 0
  const hay = String(text ?? '').toLowerCase()
  if (!hay) return 0
  let matched = 0
  let bestPos = Number.POSITIVE_INFINITY
  for (const tok of tokens) {
    const idx = hay.indexOf(tok)
    if (idx === -1) continue
    matched += 1
    if (idx < bestPos) bestPos = idx
  }
  if (matched === 0) return 0
  // Coverage dominates (each matched token >> any position bonus); position is
  // a tie-breaker in [0,1). hay.length+1 guards the divide.
  const coverage = matched / tokens.length
  const positionBonus = bestPos === Number.POSITIVE_INFINITY
    ? 0
    : (1 - bestPos / (hay.length + 1))
  return matched * 1000 + coverage * 10 + positionBonus
}

// ---------------------------------------------------------------------------
// PURE: embedding parse (BOTH formats) + cosine (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Parse a stored embedding cell into a number[] of length EMBEDDING_DIMS,
 * switching on the storage format. Returns null for a malformed / wrong-length
 * cell (skip the row rather than throw). The two ForgeOS formats:
 *   - 'f32le_blob': a Buffer of EMBEDDING_DIMS*4 little-endian float32 bytes
 *     (pretraining_extracted_* — the parts RAG convention).
 *   - 'json_text': a JSON array string "[-0.038, 0.034, ...]" (supplier_embeddings).
 * Pure — the unit test feeds it both shapes.
 */
export function parseEmbedding(
  cell: Buffer | Uint8Array | string | null | undefined,
  format: EmbeddingFormat,
): number[] | null {
  if (cell === null || cell === undefined) return null
  try {
    if (format === 'json_text') {
      const t = typeof cell === 'string' ? cell : Buffer.from(cell as Uint8Array).toString('utf8')
      const arr = JSON.parse(t)
      if (!Array.isArray(arr) || arr.length !== EMBEDDING_DIMS) return null
      const out = new Array<number>(EMBEDDING_DIMS)
      for (let i = 0; i < EMBEDDING_DIMS; i++) {
        const v = Number(arr[i])
        if (!Number.isFinite(v)) return null
        out[i] = v
      }
      return out
    }
    // f32le_blob
    const buf = Buffer.isBuffer(cell)
      ? cell
      : typeof cell === 'string'
        ? Buffer.from(cell, 'binary')
        : Buffer.from(cell as Uint8Array)
    if (buf.length !== EMBEDDING_DIMS * 4) return null
    const out = new Array<number>(EMBEDDING_DIMS)
    for (let i = 0; i < EMBEDDING_DIMS; i++) out[i] = buf.readFloatLE(i * 4)
    return out
  } catch {
    return null
  }
}

/** Cosine similarity of two equal-length vectors. Returns 0 if either is a
 *  zero vector. Mirrors library-candidate-query.ts so parts + suppliers agree. */
export function cosineSimilarity(a: number[], b: number[]): number {
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

// ---------------------------------------------------------------------------
// PURE: Reciprocal Rank Fusion (the heart — exported for the harness + tests)
// ---------------------------------------------------------------------------

/** An ordered (best-first) list of row ids from one retriever. */
export interface RankedList {
  /** Row ids in rank order (index 0 = best). Must be de-duplicated. */
  ids: string[]
  /** Label for diagnostics ('lexical' | 'semantic' | ...). */
  label?: string
}

export interface RrfFusedRow {
  id: string
  rrf_score: number
  /** 0-based rank per list label, null when the row is absent from that list. */
  ranks: Record<string, number | null>
}

/**
 * Reciprocal Rank Fusion. For each input list, a row at 0-based `rank`
 * contributes `1 / (k + rank)` to its fused score; scores sum across lists.
 * Result is sorted by fused score DESC, ties broken by id ASC for determinism.
 *
 *   score(row) = Σ_lists 1 / (k + rank0_in_list)
 *
 * Rank-based ⇒ no normalisation between incomparable retriever scores. A row
 * that ranks well in TWO lists outranks a row that ranks slightly better in
 * only ONE — exactly the "union of strengths" behaviour hybrid search needs.
 *
 * Pure + deterministic. This is what the harness invariant exercises directly.
 */
export function rrfFuse(lists: RankedList[], k: number = RRF_K): RrfFusedRow[] {
  const labels = lists.map((l, i) => l.label ?? `list${i}`)
  const scoreById = new Map<string, number>()
  const ranksById = new Map<string, Record<string, number | null>>()

  // Seed every id with a full null-ranks record so absence is explicit.
  for (let li = 0; li < lists.length; li++) {
    const { ids } = lists[li]
    const seenInThisList = new Set<string>()
    for (let rank = 0; rank < ids.length; rank++) {
      const id = ids[rank]
      if (seenInThisList.has(id)) continue // guard accidental dupes in a list
      seenInThisList.add(id)
      if (!ranksById.has(id)) {
        const rec: Record<string, number | null> = {}
        for (const lab of labels) rec[lab] = null
        ranksById.set(id, rec)
      }
      ranksById.get(id)![labels[li]] = rank
      scoreById.set(id, (scoreById.get(id) ?? 0) + 1 / (k + rank))
    }
  }

  const fused: RrfFusedRow[] = []
  for (const [id, rrf_score] of scoreById.entries()) {
    fused.push({ id, rrf_score, ranks: ranksById.get(id)! })
  }
  fused.sort((a, b) => (b.rrf_score - a.rrf_score) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return fused
}

// ---------------------------------------------------------------------------
// EMBEDDING (network) — single query vector via OpenAI
// ---------------------------------------------------------------------------

/** Embed one query string. Returns null on missing key / non-200 / wrong dims
 *  so the caller degrades to lexical-only. Identical request shape to both
 *  read sides (library-candidate-query.ts + embed-supplier.ts). */
export async function embedQueryText(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  const src = (text || '').trim()
  if (!src) return null
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: src.slice(0, 4096), model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMS }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> }
    const vec = data.data?.[0]?.embedding
    if (!vec || vec.length !== EMBEDDING_DIMS) return null
    return vec
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// SQL helpers (private)
// ---------------------------------------------------------------------------

/** Single-quote-escape a SQL string literal. */
function sqlLit(s: string): string {
  return `'${String(s).replace(/'/g, "''")}'`
}

/** Build the OR'd LIKE predicate: any token matching any lexical column. The
 *  searchable concat is reused so lexicalScore() can rank consistently. */
function buildLikeWhere(lexicalCols: string[], tokens: string[]): string {
  if (tokens.length === 0 || lexicalCols.length === 0) return ''
  const concat = lexicalCols.map((c) => `COALESCE(${c}, '')`).join(" || ' ' || ")
  const ors = tokens.map((t) => `LOWER(${concat}) LIKE ${sqlLit('%' + t.replace(/'/g, "''") + '%')}`)
  return `(${ors.join(' OR ')})`
}

// Lazy require so importing this module for its PURE helpers (the unit test,
// the regression harness — both run under jsdom) never loads the native
// better-sqlite3 binding. Only `dualSearch` (the live path) pulls it in.
type BetterSqlite3Database = import('better-sqlite3').Database
function openReadOnlyDb(dbPath: string, busyTimeoutMs: number): BetterSqlite3Database {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3')
  const db = new Database(dbPath, { readonly: true })
  db.pragma(`busy_timeout = ${Math.max(0, Math.floor(busyTimeoutMs))}`)
  return db
}

// ---------------------------------------------------------------------------
// PUBLIC: dualSearch — the live hybrid retrieval entry point
// ---------------------------------------------------------------------------

/**
 * Hybrid DB-first retrieval over `table`: SQL-LIKE lexical arm + cosine
 * semantic arm, fused by Reciprocal Rank Fusion, top-`k` returned.
 *
 * Never throws — DB-open failure, an empty table, or a missing OPENAI key all
 * degrade gracefully (lexical-only, or empty with a diagnostic). The returned
 * rows preserve `id` + every requested column so the caller can map straight
 * back into its own candidate shape.
 */
export async function dualSearch<Row = Record<string, unknown>>(
  args: DualSearchArgs,
): Promise<DualSearchResult<Row>> {
  const {
    table,
    lexicalCols,
    queryText,
    k,
    where,
    embedding,
    selectCols = [],
    idColumn = 'id',
    perArmK = Math.max(50, k * 5),
    dbPath = DEFAULT_DB_PATH,
    busyTimeoutMs = DEFAULT_BUSY_TIMEOUT_MS,
  } = args

  if (!existsSync(dbPath)) {
    return {
      hits: [], diagnostic: `empty: db not found at ${dbPath}`,
      used_embedding: false, lexical_count: 0, semantic_count: 0,
    }
  }

  let db: BetterSqlite3Database
  try {
    db = openReadOnlyDb(dbPath, busyTimeoutMs)
  } catch (err) {
    return {
      hits: [], diagnostic: `empty: db open failed (${(err as Error).message.slice(0, 80)})`,
      used_embedding: false, lexical_count: 0, semantic_count: 0,
    }
  }

  try {
    const tokens = tokenize(queryText)
    // Distinct columns to SELECT for the row payload.
    const cols = Array.from(new Set([idColumn, ...lexicalCols, ...selectCols]))
    const colSelect = cols.map((c) => `${c}`).join(', ')
    const whereClause = where && where.trim() ? ` AND (${where.trim()})` : ''

    // ── LEXICAL ARM ──────────────────────────────────────────────────────
    const lexicalRows: Array<Record<string, unknown>> = []
    const likeWhere = buildLikeWhere(lexicalCols, tokens)
    if (likeWhere) {
      const sql = `
        SELECT ${colSelect}
        FROM ${table}
        WHERE ${likeWhere}${whereClause}
        LIMIT ${Math.max(perArmK * 4, 200)}
      `
      try {
        const rows = db.prepare(sql).all() as Array<Record<string, unknown>>
        // Rank by the pure lexicalScore over the concatenated searchable text.
        const ranked = rows
          .map((r) => {
            const hayParts = lexicalCols.map((c) => String(r[c] ?? ''))
            return { r, s: lexicalScore(hayParts.join(' '), tokens) }
          })
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, perArmK)
        for (const x of ranked) lexicalRows.push(x.r)
      } catch (err) {
        // Lexical arm SQL failure is non-fatal — semantic may still answer.
        // eslint-disable-next-line no-console
        console.error(`[dual-search] lexical arm failed: ${(err as Error).message.slice(0, 120)}`)
      }
    }

    // ── SEMANTIC ARM ─────────────────────────────────────────────────────
    let semanticRows: Array<Record<string, unknown>> = []
    let usedEmbedding = false
    if (embedding) {
      const queryVec = args.queryEmbedding ?? (await embedQueryText(queryText))
      if (queryVec && queryVec.length === EMBEDDING_DIMS) {
        const joinCol = embedding.joinColumn ?? 'company_id'
        const sameTable = embedding.table === table
        // SELECT the row payload + the embedding cell, joined on the id.
        const embSelect = sameTable
          ? `${colSelect}, ${embedding.column} AS __emb`
          : `${cols.map((c) => `t.${c}`).join(', ')}, e.${embedding.column} AS __emb`
        const fromClause = sameTable
          ? `${table}`
          : `${table} t JOIN ${embedding.table} e ON e.${joinCol} = t.${idColumn}`
        const sql = sameTable
          ? `
            SELECT ${embSelect}
            FROM ${fromClause}
            WHERE ${embedding.column} IS NOT NULL${whereClause}
            LIMIT ${perArmK * 8}
          `
          : `
            SELECT ${embSelect}
            FROM ${fromClause}
            WHERE e.${embedding.column} IS NOT NULL${where && where.trim() ? ` AND (${where.trim()})` : ''}
            LIMIT ${perArmK * 8}
          `
        try {
          const rows = db.prepare(sql).all() as Array<Record<string, unknown>>
          const scored: Array<{ r: Record<string, unknown>; sim: number }> = []
          for (const r of rows) {
            const vec = parseEmbedding(r.__emb as Buffer | string | null, embedding.format)
            if (!vec) continue
            scored.push({ r, sim: cosineSimilarity(queryVec, vec) })
          }
          scored.sort((a, b) => b.sim - a.sim)
          semanticRows = scored.slice(0, perArmK).map((x) => {
            const { __emb, ...rest } = x.r
            void __emb
            return rest
          })
          usedEmbedding = true
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[dual-search] semantic arm failed: ${(err as Error).message.slice(0, 120)}`)
        }
      }
    }

    // ── FUSE (RRF) ───────────────────────────────────────────────────────
    const idOf = (r: Record<string, unknown>) => String(r[idColumn])
    const rowById = new Map<string, Record<string, unknown>>()
    for (const r of lexicalRows) rowById.set(idOf(r), r)
    for (const r of semanticRows) if (!rowById.has(idOf(r))) rowById.set(idOf(r), r)

    const fused = rrfFuse(
      [
        { label: 'lexical', ids: lexicalRows.map(idOf) },
        { label: 'semantic', ids: semanticRows.map(idOf) },
      ],
      RRF_K,
    )

    const hits: DualSearchHit<Row>[] = fused.slice(0, k).map((f) => ({
      id: f.id,
      row: (rowById.get(f.id) ?? {}) as Row,
      lexical_rank: f.ranks.lexical,
      semantic_rank: f.ranks.semantic,
      rrf_score: f.rrf_score,
    }))

    const diagnostic = usedEmbedding
      ? `ok (hybrid: ${lexicalRows.length} lexical + ${semanticRows.length} semantic → ${hits.length} fused, RRF k=${RRF_K})`
      : embedding
        ? `lexical-only (${lexicalRows.length} lexical → ${hits.length}; semantic skipped — no query vector)`
        : `lexical-only (${lexicalRows.length} lexical → ${hits.length}; no embedding config)`

    return {
      hits,
      diagnostic,
      used_embedding: usedEmbedding,
      lexical_count: lexicalRows.length,
      semantic_count: semanticRows.length,
    }
  } finally {
    try { db.close() } catch { /* ignore */ }
  }
}
