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
 * embed its description and search the Phase 4 corpus
 * (`~/.forge-truth/forge-truth.db` table `pretraining_extracted_parts`,
 * ~38k rows with text-embedding-3-small 1536-d vectors) for the closest real
 * part. If a strong match exists (similarity ≥ threshold), the chain surfaces
 * it as a "Plausible alternative based on corpus" suggestion on the BoM row.
 *
 * HYBRID RETRIEVAL (P2, 2026-06-04 audit fix): this used to be cosine-ONLY
 * (`topMatch` over an in-memory matrix). The audit (FORGE-ENGINE-DB-AUDIT.md)
 * flagged parts as the one store that embeds its writes but never FUSES the
 * lexical + semantic arms — so an exact part-name / MPN-token the embedding
 * ranks low was invisible here. The retrieval now routes through the shared
 * `dualSearch` (lib/retrieval/dual-search.ts): SQL-LIKE lexical arm over
 * [part_name, manufacturer, raw_excerpt] + cosine semantic arm over the
 * same-table f32le_blob embedding, fused by Reciprocal Rank Fusion. The
 * confidence bucket below is still keyed on the cosine of the FUSED winner
 * (computed from its stored embedding) so the honesty thresholds are unchanged
 * — the lexical arm only ever RESCUES a row the cosine missed, never relaxes
 * the bar. The single batched query embedding is computed once and injected
 * into dualSearch (`queryEmbedding`) so cost/latency is unchanged.
 *
 * Design constraints:
 *   - Universal across product classes — no per-class hard-coding (the optional
 *     productClass only prepends a short DOMAIN-ANCHOR phrase to the query text,
 *     mirroring scripts/lib/orchestrator/library-candidate-query.ts, so cosine
 *     biases toward the right domain — it does NOT branch behaviour by class).
 *   - Fail-soft: corpus missing, OPENAI_API_KEY missing, OpenAI 5xx, etc.
 *     all return an empty map and let G5 proceed without the RAG annotation.
 *   - Batched: one OpenAI embeddings call for ALL unverified parts in the
 *     run; each vector is then injected into dualSearch per query.
 *   - Persisted on PartVerification as `g5_rag_suggestion`. Renderer reads
 *     it from there and surfaces a note next to the unverified line.
 *
 * Threshold tuning (similarity is cosine on text-embedding-3-small vectors,
 * so cos ∈ [-1, 1]):
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

import { existsSync } from 'fs'
import { homedir } from 'os'
import { resolve as resolvePath } from 'path'
import {
  dualSearch,
  parseEmbedding,
  cosineSimilarity,
  EMBEDDING_DIMS as DUAL_EMBEDDING_DIMS,
} from '../lib/retrieval/dual-search'

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
/** Per-query fused candidate depth. dualSearch RRF-fuses the lexical + semantic
 * arms and returns the top-k FUSED rows; the WINNER (rank 0) is the hybrid pick
 * (a row strong in BOTH arms can outrank a row strong in only one — the whole
 * point of fusion). We emit that winner; the small k keeps the per-query work
 * tight. The cosine of the winner (re-scored from its own embedding) drives the
 * honesty bucket so the SIM_* thresholds stay anchored on semantic closeness. */
const FUSED_TOP_K = 5

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
// Product-class domain anchor (mirrors library-candidate-query.ts).
//
// Without a domain prefix the cosine arm drifts toward adjacent domains whose
// corpus is denser (BESS L26: a Generac generator fuse out-ranked a BESS fuse
// for "safety consumable for battery cabinet"). Prepending a short (≤10-token)
// domain phrase anchors the embedding in the right product domain BEFORE the
// part description steers further. Optional — empty when no class is supplied
// or the class is unknown (behaviour-preserving for callers that pass nothing).
// ───────────────────────────────────────────────────────────────────────────

const PRODUCT_CLASS_ANCHOR_TERMS: Record<string, string> = {
  bess:                      'battery energy storage system lithium iron phosphate LFP grid-scale containerised',
  energy_storage:            'battery energy storage system lithium iron phosphate LFP grid-scale containerised',
  'bess-utility-scale':      'battery energy storage system lithium iron phosphate LFP grid-scale containerised',
  residential_ess:           'residential battery energy storage LFP home inverter',
  haps:                      'high altitude platform station solar stratospheric drone pseudo-satellite',
  wind:                      'wind turbine nacelle rotor blade gearbox tower offshore onshore',
  wind_turbine:              'wind turbine nacelle rotor blade gearbox tower offshore onshore',
  'vertical-farm':           'vertical farm hydroponic LED lighting climate-controlled indoor agriculture',
  vertical_farm:             'vertical farm hydroponic LED lighting climate-controlled indoor agriculture',
  heatpump:                  'heat pump compressor R290 refrigerant evaporator condenser HVAC residential',
  heat_pump:                 'heat pump compressor R290 refrigerant evaporator condenser HVAC residential',
  thermal_system:            'heat pump compressor refrigerant evaporator condenser HVAC thermal',
  mini_split_heatpump:       'heat pump compressor R290 refrigerant mini-split HVAC',
  'ev-charger':              'electric vehicle charger DC fast charging CCS2 SiC inverter',
  ev_charger:                'electric vehicle charger DC fast charging CCS2 SiC inverter',
  dc_fast_ev_charger:        'electric vehicle charger DC fast charging CCS2 SiC inverter',
  bioreactor:                'bioreactor GMP single-use mammalian cell culture sterile peristaltic',
  auv:                       'autonomous underwater vehicle AUV subsea sonar INS thruster',
  drone:                     'drone consumer cinematography quadrotor BLDC',
  consumer_cinematography_drone: 'drone consumer cinematography quadrotor BLDC',
  'edge-ai':                 'edge AI inference server GPU rack-mount NVMe',
  edge_ai_server:            'edge AI inference server GPU rack-mount NVMe',
  cgm:                       'continuous glucose monitor wearable medical biosensor disposable',
  wearable_medical:          'wearable medical biosensor disposable glucose monitor',
  wearable_medical_device:   'wearable medical biosensor disposable glucose monitor',
}

/** Return the domain anchor string for a product class slug, or empty string. */
function anchorTermsForClass(productClass: string | undefined): string {
  if (!productClass) return ''
  const anchor = PRODUCT_CLASS_ANCHOR_TERMS[productClass]
  if (anchor) return anchor
  const lower = productClass.toLowerCase()
  for (const [key, terms] of Object.entries(PRODUCT_CLASS_ANCHOR_TERMS)) {
    if (lower.includes(key) || key.includes(lower.split(/[-_]/)[0])) return terms
  }
  return ''
}

// ───────────────────────────────────────────────────────────────────────────
// Query-text composition
//
// Mirrors the corpus's `_compose_text_row()` in scripts/rag/retrieve.py L96-111
// so query embeddings live in the same semantic space the corpus rows were
// embedded against. The corpus joins (part_name, manufacturer, part_number)
// with a "|" + raw_excerpt. We match the structure on the query side, with an
// optional product-class domain anchor prepended (see above).
// ───────────────────────────────────────────────────────────────────────────

function composeQueryText(q: RagQuery, productClass?: string): string {
  const anchor = anchorTermsForClass(productClass)
  const head = [q.word_name, q.manufacturer, q.part_number].filter(s => s && String(s).trim().length > 0).join(' ')
  const techSummary = q.technical_summary && q.technical_summary.trim().length > 0
    ? ' | ' + q.technical_summary.trim()
    : ''
  const anchorPrefix = anchor ? anchor + ' ' : ''
  return (anchorPrefix + head + techSummary).slice(0, QUERY_TEXT_CAP)
}

// ───────────────────────────────────────────────────────────────────────────
// Corpus row shape + the seed-exclusion predicate
// ───────────────────────────────────────────────────────────────────────────

/** The columns dualSearch hands back per fused hit (lexicalCols + selectCols).
 *  `embedding` rides along so we can re-score the FUSED winner's cosine and keep
 *  the honesty-threshold buckets unchanged. */
interface CorpusRow {
  id: number
  part_name: string | null
  manufacturer: string | null
  raw_excerpt: string | null
  part_number: string | null
  component_class: string | null
  document_id: number | null
  embedding: Buffer | string | null
}

/**
 * Same-table SQL predicate (appended with AND to BOTH dualSearch arms).
 *
 * 1. embedding IS NOT NULL — only rows the semantic arm can score.
 * 2. part_number present — a description-only "match" doesn't help pick a SKU.
 * 3. EXCLUDE source_type='engine_c_seed' (2026-05-20 Task #69 audit): those ~72
 *    synthetic seed rows were generated to MATCH the briefs that produce our
 *    fabricated SKUs, so they self-match at ~0.85 and would turn the RAG layer
 *    into a circular "the engine matches the engine" hallucination amplifier.
 *    Expressed as a same-table correlated sub-query (dualSearch has no LEFT JOIN
 *    to pretraining_spec_documents) — NULL-source_type docs are NOT in the
 *    sub-query so legacy real-datasheet rows are correctly KEPT.
 *
 * Trusted/static SQL (no user input) — safe to inline per dualSearch's `where`
 * contract.
 */
const CORPUS_WHERE =
  `embedding IS NOT NULL ` +
  `AND part_number IS NOT NULL AND TRIM(part_number) != '' ` +
  `AND document_id NOT IN (SELECT id FROM pretraining_spec_documents WHERE source_type = 'engine_c_seed')`

// ───────────────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────────────

export interface RagLookupOptions {
  /** Override corpus path (defaults to ~/.forge-truth/forge-truth.db). */
  dbPath?: string
  /** Override OpenAI API key (defaults to process.env.OPENAI_API_KEY). */
  apiKey?: string
  /** Optional product-class slug (e.g. 'bess'). When set, a short domain-anchor
   *  phrase is prepended to the query text so the semantic arm biases toward the
   *  right product domain (mirrors library-candidate-query.ts). Omit for the
   *  legacy un-anchored behaviour. */
  productClass?: string
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
  if (!existsSync(dbPath)) {
    stats.error = `corpus unavailable at ${dbPath}`
    return { suggestions: out, stats }
  }

  // Dedup queries by composed text to save embedding budget when two
  // unverified parts have identical descriptions (rare but happens with
  // generic descriptors like "container door" × N).
  const composed: string[] = queries.map((q) => composeQueryText(q, options.productClass))
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
  // 100 to keep latency tight + give clear retry granularity). The vectors are
  // INJECTED into dualSearch (queryEmbedding) so the hybrid retrieval re-uses
  // the single batched embed rather than embedding once per query.
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

  // HYBRID search per query via the shared dualSearch (lexical LIKE over
  // [part_name, manufacturer, raw_excerpt] + cosine semantic arm over the
  // same-table f32le_blob embedding, RRF-fused). Each query injects its
  // pre-computed vector so the batched embed is re-used. The confidence bucket
  // is re-derived from the cosine of the FUSED WINNER (parseEmbedding of the
  // hit's own embedding cell) — so the lexical arm can RESCUE a row the cosine
  // ranked low, while the honesty thresholds (SIM_*) stay anchored on cosine.
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i]
    const vec = embeddings[queryToText[i]]
    if (!vec || vec.length !== DUAL_EMBEDDING_DIMS) continue
    const queryText = composed[queryToText[i]]

    let result
    try {
      result = await dualSearch<CorpusRow>({
        table: 'pretraining_extracted_parts',
        idColumn: 'id',
        lexicalCols: ['part_name', 'manufacturer', 'raw_excerpt'],
        // `embedding` rides along so we can re-score the winner's cosine;
        // the rest are the display/provenance fields the suggestion needs.
        selectCols: ['part_number', 'component_class', 'document_id', 'embedding'],
        embedding: {
          table: 'pretraining_extracted_parts',
          column: 'embedding',
          format: 'f32le_blob',
          joinColumn: 'id',
        },
        queryText,
        queryEmbedding: vec,
        k: FUSED_TOP_K,
        where: CORPUS_WHERE,
        dbPath,
      })
    } catch {
      continue
    }
    stats.corpus_rows = Math.max(stats.corpus_rows, result.semantic_count, result.lexical_count)
    if (result.hits.length === 0) continue

    // The RRF WINNER (rank 0) is the HYBRID pick — a row that ranks well in
    // BOTH the lexical (exact part-name / MPN-token) and semantic arms beats a
    // row strong in only one. This is exactly what the cosine-only path could
    // not do: rescue an exact-name match the embedding buried. The cosine of
    // THAT winner (from its own embedding) drives the honesty bucket so the
    // SIM_* thresholds remain anchored on semantic closeness — the lexical arm
    // changes WHICH row wins, never RELAXES the bar.
    const winner = result.hits[0].row
    const winnerVec = winner.embedding != null
      ? parseEmbedding(winner.embedding as Buffer | string, 'f32le_blob')
      : null
    const sim = winnerVec ? cosineSimilarity(vec, winnerVec) : Number.NaN
    if (!(sim >= SIM_LOW)) {
      // Below the honesty floor (or unparseable vector) — do not claim a match.
      stats.suggestions_below_threshold++
      continue
    }
    const row = winner
    const manufacturer = (row.manufacturer ?? '').trim()
    const partNumber = (row.part_number ?? '').trim()
    const confidence: 'high' | 'medium' | 'low' =
      sim >= SIM_HIGH ? 'high' : sim >= SIM_MEDIUM ? 'medium' : 'low'
    if (confidence === 'high') stats.suggestions_high++
    else if (confidence === 'medium') stats.suggestions_medium++
    else stats.suggestions_low++

    const reasoning = (
      confidence === 'high'
        ? `Corpus has a real ${manufacturer || 'manufacturer'} part (${partNumber}) closely matching "${q.word_name}" — similarity ${sim.toFixed(3)} (hybrid lexical+semantic).`
        : confidence === 'medium'
          ? `Corpus contains a related real part (${manufacturer || '?'} ${partNumber}); consider as a starting point — similarity ${sim.toFixed(3)} (hybrid lexical+semantic).`
          : `Closest real corpus part is ${manufacturer || '?'} ${partNumber}, but similarity is low (${sim.toFixed(3)}); use as a search hint only.`
    )

    out.set(q.id, {
      similarity: sim,
      confidence,
      match: {
        part_name: (row.part_name ?? '').trim(),
        manufacturer,
        part_number: partNumber,
        component_class: row.component_class ?? null,
        excerpt: (row.raw_excerpt ?? '').slice(0, 240) || null,
      },
      source_row_id: Number(row.id),
      source_document_id: row.document_id ?? null,
      generated_at: new Date().toISOString(),
      reasoning,
    })
  }

  return { suggestions: out, stats }
}
