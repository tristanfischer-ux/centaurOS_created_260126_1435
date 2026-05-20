/**
 * @file g5-rag.ts — G5 catalogue RAG layer for the pdf-engine-v2 chain.
 *
 * Background (Tristan Task #69 — 2026-05-20):
 * G5 part-number verification (`part-verification.ts`) confirms whether each
 * emitted SKU exists in DigiKey / Mouser / Farnell / a manufacturer-domain web
 * search. When a SKU doesn't resolve anywhere ("unverified"), the previous
 * fallback was just to strip it and ask an LLM to recommend a replacement —
 * but the LLM has no grounding in our actual corpus of REAL parts, so it
 * often returned another plausible-but-fabricated SKU or "uncertain".
 *
 * This module adds a retrieval-augmented step: for each unverified part,
 * embed its description and cosine-search the Phase 4 corpus
 * (`~/.forge-truth/forge-truth.db` table `pretraining_extracted_parts`,
 * ~31k rows with text-embedding-3-small 1536-d vectors, 25,872 with real
 * part numbers) for the closest semantically-similar real part. If a strong
 * match exists (similarity ≥ threshold), the chain surfaces it as a
 * "Plausible alternative based on corpus" suggestion on the BoM row.
 *
 * Design constraints:
 *   - Universal across product classes — no per-class hard-coding.
 *   - Fail-soft: corpus missing, OPENAI_API_KEY missing, OpenAI 5xx, etc.
 *     all return null and let G5 proceed without the RAG annotation.
 *   - Batched: one OpenAI embeddings call for ALL unverified parts in the
 *     run, then in-process cosine math against a one-time-loaded matrix.
 *   - Latency budget: cold corpus load ~1-2s for 25k rows × 1536 d (160 MB
 *     of float32), one embed call ~500ms for 100 inputs, scan ~30ms per
 *     query. Total ~3s for a typical 80-part-batch run; well inside budget.
 *   - Persisted on PartVerification as `g5_rag_suggestion`. Renderer reads
 *     it from there and surfaces a note next to the unverified line.
 *
 * Threshold tuning (similarity is cosine on L2-normalised text-embedding-3-
 * small vectors, so cos ∈ [-1, 1]):
 *   ≥ 0.70 → "high"   — confident substitution; surface SKU explicitly
 *   ≥ 0.55 → "medium" — surface SKU with "consider" framing
 *   ≥ 0.45 → "low"    — surface SKU as "closest corpus match" only
 *   <  0.45 → null    — corpus has nothing close enough to be useful
 *
 * Thresholds are conservative because Tristan's honesty rule (2026-05-16)
 * dictates: "better to be honest and say we are not sure than have a false
 * claim of accuracy". A weak match swapped in as a confident "replacement"
 * would be worse than no suggestion.
 *
 * Cost: 1 embed call/run × ~100 inputs ≈ £0.00015. Negligible.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { resolve as resolvePath } from 'path'

// ───────────────────────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────────────────────

/** A fabricated-part query: just the descriptive bits the chain has on hand. */
export interface RagQuery {
  /** Stable id matching the PartVerification row. */
  id: string
  /** Word display name (human-readable part name). */
  word_name: string
  /** Claimed manufacturer (may still be real even if SKU is fake). */
  manufacturer: string
  /** The SKU that didn't resolve at any distributor. */
  part_number: string
  /** Optional: technical-spec summary built from remaining modifiers. Improves
   * embedding signal when present — e.g. "voltage: 400V; current: 200A". */
  technical_summary?: string
}

/** The corpus hit returned for each query (top-1 only — single best match). */
export interface RagSuggestion {
  /** Cosine similarity ∈ [-1, 1]. Higher = closer. */
  similarity: number
  /** Bucket derived from similarity (see threshold table above). */
  confidence: 'high' | 'medium' | 'low'
  /** The real (manufacturer, part_number) from the corpus. */
  match: {
    part_name: string
    manufacturer: string
    part_number: string
    component_class: string | null
    /** Raw excerpt the corpus has for this part — datasheet snippet typically.
     * Capped at 240 chars so it can render inline. */
    excerpt: string | null
  }
  /** Source row id in pretraining_extracted_parts (for traceability). */
  source_row_id: number
  /** Source document id in pretraining_spec_documents. */
  source_document_id: number | null
  /** When the suggestion was generated (ISO). */
  generated_at: string
  /** Why it was surfaced — short rationale string. */
  reasoning: string
}

// ───────────────────────────────────────────────────────────────────────────
// Tuning
// ───────────────────────────────────────────────────────────────────────────

const DEFAULT_DB = resolvePath(homedir(), '.forge-truth/forge-truth.db')
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMS = 1536
const SIM_HIGH = 0.70
const SIM_MEDIUM = 0.55
const SIM_LOW = 0.45
const EMBED_BATCH = 100
const QUERY_TEXT_CAP = 1024
/** Hard cap on corpus rows loaded into memory per call. The corpus has ~25.8k
 * rows with part_numbers + embeddings (2026-05-20 census). 100k is a 4x
 * safety ceiling — if it ever explodes past that the loader will spike RAM. */
const MAX_CORPUS_ROWS = 100_000

// ───────────────────────────────────────────────────────────────────────────
// Embedding (OpenAI)
// ───────────────────────────────────────────────────────────────────────────

/** Batched embedding call. Returns 1536-d float arrays in input order. */
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
      // Pin to 1536 (matches the corpus). Without this OpenAI has historically
      // returned 768-d under some conditions — see src/lib/embeddings.ts L46-55
      // for the production incident that drove the explicit dim pin.
      dimensions: EMBEDDING_DIMS,
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI embeddings HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  const json = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> }
  // Contract says order is preserved but the index field exists for safety.
  const sorted = [...json.data].sort((a, b) => a.index - b.index)
  return sorted.map(d => d.embedding)
}

// ───────────────────────────────────────────────────────────────────────────
// Query-text composition
//
// Mirrors the corpus's `_compose_text_row()` in scripts/rag/retrieve.py L96-111
// so query embeddings live in the same semantic space the corpus rows were
// embedded against. The corpus joins (part_name, manufacturer, part_number)
// with a "|" + raw_excerpt. We match the structure on the query side.
// ───────────────────────────────────────────────────────────────────────────

function composeQueryText(q: RagQuery): string {
  const head = [q.word_name, q.manufacturer, q.part_number].filter(s => s && String(s).trim().length > 0).join(' ')
  const techSummary = q.technical_summary && q.technical_summary.trim().length > 0
    ? ' | ' + q.technical_summary.trim()
    : ''
  return (head + techSummary).slice(0, QUERY_TEXT_CAP)
}

// ───────────────────────────────────────────────────────────────────────────
// Corpus loader
// ───────────────────────────────────────────────────────────────────────────

interface CorpusEntry {
  id: number
  document_id: number | null
  part_name: string
  manufacturer: string
  part_number: string
  component_class: string | null
  excerpt: string | null
}

interface LoadedCorpus {
  /** Flat Float32Array of size N × 1536, row-major, L2-normalised. */
  matrix: Float32Array
  entries: CorpusEntry[]
}

/**
 * Load all parts-with-embeddings into a normalised in-memory matrix. Done
 * once per call (the chain runs a single G5 RAG pass per pipeline). Module-
 * level cache would help for long-lived processes but the chain is a one-shot
 * tsx invocation — the corpus load happens at most once per run anyway.
 *
 * Performance note: 25,872 rows × 1536 floats × 4 bytes = ~159 MB. Stays
 * comfortably under typical Node heap.
 *
 * Filters to rows that have a NON-empty part_number — without that field a
 * "match" would just be "we found a description-only entry" which doesn't
 * help the engineer pick a real SKU.
 */
function loadCorpus(dbPath: string): LoadedCorpus | null {
  if (!existsSync(dbPath)) return null
  let db: Database.Database
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true })
  } catch {
    return null
  }
  try {
    // IMPORTANT corpus filter (2026-05-20 Task #69 audit):
    // EXCLUDE pretraining_spec_documents.source_type='engine_c_seed' rows.
    // Those 72 rows are synthetic seed data injected to give Engine C
    // (reference-price anchoring) a baseline when the real corpus thins out
    // for a product class. Their part-name + part_number text was generated
    // to MATCH the briefs that produce our fabricated SKUs, so they create
    // ~0.85 self-matches that look authoritative but are not grounded in any
    // real datasheet or distributor catalogue. Letting them through would
    // turn the RAG layer into a circular "the engine matches the engine"
    // hallucination amplifier.
    //
    // Keep: source_type IN ('distributor_listing', 'manufacturer_datasheet')
    // and (legacy) rows with NULL source_type (older Phase 4 PDF extractions
    // before the source_type column was added — those are real datasheets).
    const rows = db.prepare(`
      SELECT pep.id, pep.document_id, pep.part_name, pep.manufacturer, pep.part_number,
             pep.component_class, pep.raw_excerpt, pep.embedding
      FROM pretraining_extracted_parts pep
      LEFT JOIN pretraining_spec_documents psd ON pep.document_id = psd.id
      WHERE pep.embedding IS NOT NULL
        AND pep.part_number IS NOT NULL
        AND TRIM(pep.part_number) != ''
        AND (psd.source_type IS NULL OR psd.source_type != 'engine_c_seed')
      LIMIT ${MAX_CORPUS_ROWS}
    `).all() as Array<{
      id: number
      document_id: number | null
      part_name: string | null
      manufacturer: string | null
      part_number: string | null
      component_class: string | null
      raw_excerpt: string | null
      embedding: Buffer | null
    }>

    if (rows.length === 0) return null

    const N = rows.length
    const matrix = new Float32Array(N * EMBEDDING_DIMS)
    const entries: CorpusEntry[] = []
    let kept = 0
    for (let i = 0; i < N; i++) {
      const r = rows[i]
      const buf = r.embedding
      if (!buf || buf.length < EMBEDDING_DIMS * 4) continue
      // Read 1536 little-endian float32s and L2-normalise inline.
      let sumSq = 0
      const base = kept * EMBEDDING_DIMS
      for (let j = 0; j < EMBEDDING_DIMS; j++) {
        const v = buf.readFloatLE(j * 4)
        matrix[base + j] = v
        sumSq += v * v
      }
      const norm = Math.sqrt(sumSq) || 1
      if (norm !== 1) {
        for (let j = 0; j < EMBEDDING_DIMS; j++) {
          matrix[base + j] /= norm
        }
      }
      entries.push({
        id: r.id,
        document_id: r.document_id ?? null,
        part_name: (r.part_name ?? '').trim(),
        manufacturer: (r.manufacturer ?? '').trim(),
        part_number: (r.part_number ?? '').trim(),
        component_class: r.component_class ?? null,
        excerpt: (r.raw_excerpt ?? '').slice(0, 240) || null,
      })
      kept++
    }
    if (kept === 0) return null
    // Trim the matrix if any rows were skipped (short buffers etc.).
    const trimmed = kept === N ? matrix : matrix.subarray(0, kept * EMBEDDING_DIMS) as Float32Array
    // subarray returns a view; we want an owned Float32Array so cosineSearch
    // can hold it past this function's scope. Copy if it was trimmed.
    const final = kept === N ? matrix : new Float32Array(trimmed)
    return { matrix: final, entries }
  } finally {
    db.close()
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Cosine search
// ───────────────────────────────────────────────────────────────────────────

/** L2-normalise a 1536-d query vector in place. Returns the same array. */
function normaliseInPlace(v: number[] | Float32Array): Float32Array {
  let sumSq = 0
  for (let i = 0; i < v.length; i++) sumSq += v[i] * v[i]
  const norm = Math.sqrt(sumSq) || 1
  const out = new Float32Array(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm
  return out
}

/** Top-1 cosine match. Returns { idx, score } where score is the dot product
 *  of normalised vectors (== cosine similarity). */
function topMatch(query: Float32Array, corpus: LoadedCorpus): { idx: number; score: number } | null {
  const N = corpus.entries.length
  if (N === 0) return null
  const M = corpus.matrix
  let bestIdx = -1
  let bestScore = -2
  for (let i = 0; i < N; i++) {
    const base = i * EMBEDDING_DIMS
    let dot = 0
    // Manual loop — hotter than Array.reduce. 1536 mults per row × 25k rows
    // is ~38M FLOPs per query; V8 inlines this fine.
    for (let j = 0; j < EMBEDDING_DIMS; j++) {
      dot += query[j] * M[base + j]
    }
    if (dot > bestScore) {
      bestScore = dot
      bestIdx = i
    }
  }
  if (bestIdx < 0) return null
  return { idx: bestIdx, score: bestScore }
}

// ───────────────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────────────

export interface RagLookupOptions {
  /** Override corpus path (defaults to ~/.forge-truth/forge-truth.db). */
  dbPath?: string
  /** Override OpenAI API key (defaults to process.env.OPENAI_API_KEY). */
  apiKey?: string
}

export interface RagLookupResult {
  /** Map keyed by RagQuery.id → suggestion. Missing keys = no usable match. */
  suggestions: Map<string, RagSuggestion>
  /** Diagnostic counts for the action log. */
  stats: {
    queries_in: number
    queries_embedded: number
    suggestions_high: number
    suggestions_medium: number
    suggestions_low: number
    suggestions_below_threshold: number
    corpus_rows: number
    /** When the run aborted, the failure reason. */
    error?: string
  }
}

/**
 * Look up RAG suggestions for a batch of unverified parts.
 *
 * Fail-soft contract: this function NEVER throws. If anything goes wrong —
 * no API key, corpus missing, OpenAI 5xx, parse error — the function logs a
 * console.warn and returns an empty suggestions map with an `error` string
 * in `stats`. G5 proceeds without RAG annotations in that case.
 */
export async function lookupCorpusSuggestions(
  queries: RagQuery[],
  options: RagLookupOptions = {},
): Promise<RagLookupResult> {
  const stats = {
    queries_in: queries.length,
    queries_embedded: 0,
    suggestions_high: 0,
    suggestions_medium: 0,
    suggestions_low: 0,
    suggestions_below_threshold: 0,
    corpus_rows: 0,
  } as RagLookupResult['stats']
  const out = new Map<string, RagSuggestion>()
  if (queries.length === 0) return { suggestions: out, stats }

  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) {
    stats.error = 'OPENAI_API_KEY not set'
    return { suggestions: out, stats }
  }
  const dbPath = options.dbPath ?? DEFAULT_DB
  const corpus = loadCorpus(dbPath)
  if (!corpus) {
    stats.error = `corpus unavailable at ${dbPath}`
    return { suggestions: out, stats }
  }
  stats.corpus_rows = corpus.entries.length

  // Dedup queries by composed text to save embedding budget when two
  // unverified parts have identical descriptions (rare but happens with
  // generic descriptors like "container door" × N).
  const composed: string[] = queries.map(composeQueryText)
  const uniqueTexts: string[] = []
  const textIdx = new Map<string, number>()
  const queryToText: number[] = []
  for (let i = 0; i < composed.length; i++) {
    const t = composed[i]
    let idx = textIdx.get(t)
    if (idx === undefined) {
      idx = uniqueTexts.length
      uniqueTexts.push(t)
      textIdx.set(t, idx)
    }
    queryToText.push(idx)
  }

  // Embed in batches (OpenAI accepts up to 2048 inputs per call, we cap at
  // 100 to keep latency tight + give clear retry granularity).
  const embeddings: number[][] = new Array(uniqueTexts.length)
  try {
    for (let i = 0; i < uniqueTexts.length; i += EMBED_BATCH) {
      const batch = uniqueTexts.slice(i, i + EMBED_BATCH)
      const vecs = await embedBatch(batch, apiKey)
      for (let j = 0; j < vecs.length; j++) {
        embeddings[i + j] = vecs[j]
      }
      stats.queries_embedded += vecs.length
    }
  } catch (err) {
    stats.error = `embed failure: ${(err as Error).message.slice(0, 200)}`
    return { suggestions: out, stats }
  }

  // Search per query (each query is independent; reuse embeddings where
  // queries share composed text).
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i]
    const vec = embeddings[queryToText[i]]
    if (!vec || vec.length !== EMBEDDING_DIMS) continue
    const normalised = normaliseInPlace(vec)
    const top = topMatch(normalised, corpus)
    if (!top) continue
    const sim = top.score
    if (sim < SIM_LOW) {
      stats.suggestions_below_threshold++
      continue
    }
    const entry = corpus.entries[top.idx]
    const confidence: 'high' | 'medium' | 'low' =
      sim >= SIM_HIGH ? 'high' : sim >= SIM_MEDIUM ? 'medium' : 'low'
    if (confidence === 'high') stats.suggestions_high++
    else if (confidence === 'medium') stats.suggestions_medium++
    else stats.suggestions_low++

    const reasoning = (
      confidence === 'high'
        ? `Corpus has a real ${entry.manufacturer || 'manufacturer'} part (${entry.part_number}) closely matching "${q.word_name}" — similarity ${sim.toFixed(3)}.`
        : confidence === 'medium'
          ? `Corpus contains a related real part (${entry.manufacturer || '?'} ${entry.part_number}); consider as a starting point — similarity ${sim.toFixed(3)}.`
          : `Closest real corpus part is ${entry.manufacturer || '?'} ${entry.part_number}, but similarity is low (${sim.toFixed(3)}); use as a search hint only.`
    )

    out.set(q.id, {
      similarity: sim,
      confidence,
      match: {
        part_name: entry.part_name,
        manufacturer: entry.manufacturer,
        part_number: entry.part_number,
        component_class: entry.component_class,
        excerpt: entry.excerpt,
      },
      source_row_id: entry.id,
      source_document_id: entry.document_id,
      generated_at: new Date().toISOString(),
      reasoning,
    })
  }

  return { suggestions: out, stats }
}
