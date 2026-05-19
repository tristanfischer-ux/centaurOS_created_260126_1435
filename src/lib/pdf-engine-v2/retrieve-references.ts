/**
 * @file retrieve-references.ts — W1 RAG-at-emission TypeScript wrapper.
 *
 * Wires the Phase 4 RAG corpus (`~/.forge-truth/forge-truth.db`,
 * `pretraining_extracted_*` tables, 29,899 records) into Stage 1.7 module
 * decomposition. Shells out to the Python helper
 * `scripts/rag/retrieve_json.py` which in turn calls the shipped
 * `scripts/rag/retrieve.py` (`retrieve_relevant_records`) and emits a single
 * JSON object on stdout.
 *
 * Why a child process and not an N-API/native binding:
 *   - The corpus embeddings live in SQLite + numpy floats. The retrieval helper
 *     is already production-ready Python; duplicating the embedding+cosine path
 *     in JS would invite drift.
 *   - The wrapper is invoked ONCE per pipeline run (gated by
 *     `RAG_AT_EMISSION=true`); the spawn cost is negligible next to a £4–5
 *     pipeline run.
 *
 * Feature flag: `RAG_AT_EMISSION=true` enables retrieval injection in
 * Stage 1.7. When OFF, this module's callers must short-circuit and the
 * pipeline behaves identically to the pre-W1 baseline.
 *
 * Spec: PLAN-2026-05-18-spec-reproduction.md §W1 (RAG retrieval layer).
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execFileAsync = promisify(execFile)

/** One retrieved record, lightly normalised across parts/specs/suppliers/standards tables. */
export interface ReferenceRecord {
  table: string
  id: number
  document_id: number
  score: number
  product_class: string | null
  manufacturer_doc: string | null
  product_name: string | null
  source_url: string | null
  // parts table
  part_name: string | null
  manufacturer: string | null
  part_number: string | null
  quantity: number | null
  unit_price_gbp: number | null
  module_assignment: string | null
  // specs table
  spec_key: string | null
  spec_value: string | null
  spec_unit: string | null
  // misc tables
  company_name: string | null
  role: string | null
  standard_name: string | null
  scope: string | null
  // common
  raw_excerpt: string | null
  composed_text: string | null
  /**
   * Council 2026-05-18 BLOCKER-6: confidence grade per retrieved record.
   * Computed AFTER the cosine retrieval — the Python helper has no notion of
   * corpus density, so the grading happens here in TypeScript. Drives the
   * few-shot block's HIGH / MODERATE / LOW annotation so the emitter knows
   * whether to treat the exemplar as canonical or as a non-binding hint.
   * Field is OPTIONAL on the wire because the Python script does not set it;
   * gradeReferenceConfidence() back-fills the value before formatting.
   */
  confidence?: 'high' | 'moderate' | 'low'
}

export interface RetrieveOptions {
  /** Top-K records. Default 5. */
  k?: number
  /**
   * Comma-separated list of table names. Defaults to parts+specs (the two
   * highest-signal tables for module decomposition).
   */
  tables?: readonly string[]
  /**
   * Module-assignment filter applied to the parts table only (per
   * retrieve.py semantics). Generally leave undefined — cosine similarity
   * does the class filtering implicitly via the brief embedding.
   */
  moduleClasses?: readonly string[]
  /** Timeout in milliseconds. Default 60_000 (1 min). */
  timeoutMs?: number
  /** Absolute path to retrieve_json.py — overrideable for tests. */
  scriptPath?: string
}

/** Default tables for Stage 1.7 retrieval. */
export const DEFAULT_RETRIEVE_TABLES = [
  'pretraining_extracted_parts',
  'pretraining_extracted_specs',
] as const

/** Path to the python JSON wrapper. */
function defaultScriptPath(): string {
  return path.resolve(process.cwd(), 'scripts', 'rag', 'retrieve_json.py')
}

/** True when env flag opts Stage 1.7 into RAG retrieval. */
export function isRagAtEmissionEnabled(): boolean {
  const raw = (process.env.RAG_AT_EMISSION ?? '').toLowerCase().trim()
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on'
}

interface PythonResponse {
  ok: boolean
  error?: string
  k?: number
  results?: ReferenceRecord[]
}

/**
 * Retrieve top-K reference records for a brief.
 *
 * Returns an empty array on any failure (network, parse, missing key, etc.) —
 * the caller MUST be tolerant of an empty result. Stage 1.7 falls back to the
 * pre-RAG prompt path in that case.
 */
export async function retrieveReferences(
  brief: string,
  productClass: string,
  options: RetrieveOptions = {},
): Promise<ReferenceRecord[]> {
  if (!brief || !brief.trim()) return []
  const k = options.k ?? 5
  const tables = (options.tables ?? DEFAULT_RETRIEVE_TABLES).join(',')
  const scriptPath = options.scriptPath ?? defaultScriptPath()
  const timeoutMs = options.timeoutMs ?? 60_000

  // Compose the query: the brief is the dominant signal; appending product_class
  // gives the embedding a strong hint when the brief is terse.
  const composedQuery = `${brief.trim()}\n\n[product_class: ${productClass}]`

  const args: string[] = [
    scriptPath,
    '--query', composedQuery,
    '--k', String(k),
    '--tables', tables,
  ]
  if (options.moduleClasses && options.moduleClasses.length > 0) {
    args.push('--classes', options.moduleClasses.join(','))
  }

  try {
    const { stdout } = await execFileAsync('python3', args, {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      env: process.env,
    })
    const payload = JSON.parse(stdout) as PythonResponse
    if (!payload.ok) {
      console.warn(`[retrieve-references] python wrapper error: ${payload.error ?? 'unknown'}`)
      return []
    }
    const records = payload.results ?? []
    // B6: back-fill the confidence grade now that we have the corpus-side
    // counts available. Pure-deterministic — uses the same record set; no
    // extra database query needed when CORPUS_CLASS_COUNTS is populated by
    // the caller. When unset, grades default to 'moderate'.
    return gradeRecords(records, productClass)
  } catch (err) {
    const msg = (err as Error).message
    console.warn(`[retrieve-references] retrieval failed: ${msg}`)
    return []
  }
}

// ─── B6: per-record confidence grading ──────────────────────────────────────

/**
 * Council 2026-05-18 BLOCKER-6: each retrieved record carries a HIGH /
 * MODERATE / LOW confidence grade. The grade drives the few-shot block
 * annotation so the emitter knows whether to treat the exemplar as a
 * canonical reference (HIGH — Megapack, Daikin Altherma) or as a non-binding
 * hint (LOW — niche product, sparse corpus).
 *
 * Grading rules (per the brief):
 *   - HIGH:     corpus has ≥10 docs in the class, record's product is
 *               widely-referenced (canonical product names appear in the
 *               CANONICAL_PRODUCTS table below).
 *   - MODERATE: corpus has 5-10 docs, record from a less-canonical product.
 *   - LOW:      corpus has <5 docs, OR product is niche / cosine score below
 *               the LOW threshold (0.45).
 *
 * Corpus density per class can be populated via the
 * `populateCorpusClassCounts()` helper at pipeline startup; in its absence
 * the grade falls back to score-only logic which is conservative (defaults
 * to MODERATE / LOW).
 */
export const CANONICAL_PRODUCTS: Record<string, string[]> = {
  energy_storage: [
    'megapack', 'powerpack', 'eneronone', 'enerc', 'cube',
    'bess', 'sungrow', 'fluence', 'gridstack', 'kore', 'ess',
  ],
  thermal_system: [
    'altherma', 'daikin', 'ecodan', 'mitsubishi', 'samsung ehs',
    'nibe', 'vaillant arotherm', 'viessmann vitocal', 'panasonic aquarea',
  ],
  ev_charger: [
    'wallbox', 'pulsar', 'easee', 'ohme', 'zappi', 'pod point',
    'tritium', 'kempower', 'alpitronic',
  ],
  wearable_medical: ['dexcom g6', 'dexcom g7', 'libre', 'eversense'],
  drone: ['mavic', 'phantom', 'parrot anafi', 'skydio'],
  edge_ai_server: ['jetson', 'coral', 'movidius', 'hailo'],
  bioreactor: ['sartorius', 'eppendorf', 'applikon', 'infors'],
  auv: ['remus', 'gavia', 'iver', 'sparus'],
  haps: ['zephyr', 'phasa', 'aalto haps', 'sunglider'],
  vertical_farm: ['plenty', '80 acres', 'aerofarms', 'bowery'],
}

/**
 * Runtime corpus class-count table. Populated by the W1 wiring layer at
 * pipeline startup; if empty, grading falls back to product-name + score
 * heuristics only. Counts are keyed by normalised product_class string.
 */
const CORPUS_CLASS_COUNTS: Record<string, number> = {}

/**
 * Populate CORPUS_CLASS_COUNTS. The W1 agent calls this once at startup with
 * the result of `SELECT product_class, COUNT(*) FROM pretraining_extracted_*
 * GROUP BY product_class`. Idempotent — re-calling replaces the table.
 */
export function populateCorpusClassCounts(counts: Record<string, number>): void {
  for (const k of Object.keys(CORPUS_CLASS_COUNTS)) delete CORPUS_CLASS_COUNTS[k]
  for (const [k, v] of Object.entries(counts)) CORPUS_CLASS_COUNTS[k] = v
}

function normaliseClassKey(raw: string | null | undefined): string {
  if (!raw) return ''
  const lower = String(raw).toLowerCase().replace(/[_-]/g, ' ').trim()
  if (/(bess|battery energy storage|energy storage)/.test(lower)) return 'energy_storage'
  if (/(heat ?pump|thermal system|hvac)/.test(lower)) return 'thermal_system'
  if (/(vertical farm|indoor farm|hydroponic)/.test(lower)) return 'vertical_farm'
  if (/(ev ?charger|charging station|charge point)/.test(lower)) return 'ev_charger'
  if (/(cgm|continuous glucose|wearable medical|patch monitor)/.test(lower)) return 'wearable_medical'
  if (/(drone|uav|quadcopter)/.test(lower)) return 'drone'
  if (/(edge ai|edge compute|inference)/.test(lower)) return 'edge_ai_server'
  if (/(bioreactor|fermenter|cell culture)/.test(lower)) return 'bioreactor'
  if (/(auv|underwater vehicle|subsea)/.test(lower)) return 'auv'
  if (/(haps|stratospheric|high altitude platform)/.test(lower)) return 'haps'
  return lower.replace(/\s+/g, '_')
}

export function gradeReferenceConfidence(rec: ReferenceRecord, productClass: string): 'high' | 'moderate' | 'low' {
  const classKey = normaliseClassKey(productClass)
  const docs = CORPUS_CLASS_COUNTS[classKey] ?? 0
  const score = typeof rec.score === 'number' ? rec.score : 0
  const productHaystack = [rec.product_name, rec.manufacturer_doc, rec.part_name]
    .filter(Boolean)
    .map(s => String(s).toLowerCase())
    .join(' | ')
  const canon = CANONICAL_PRODUCTS[classKey] ?? []
  const isCanonical = canon.some(p => productHaystack.includes(p))

  // HIGH — well-populated class, canonical product, decent cosine.
  if (docs >= 10 && isCanonical && score >= 0.55) return 'high'
  // LOW — sparse class OR cosine below the trust threshold.
  if (docs > 0 && docs < 5) return 'low'
  if (score < 0.45) return 'low'
  // Default — MODERATE.
  return 'moderate'
}

/** Apply gradeReferenceConfidence() across a result set. Pure function. */
export function gradeRecords(records: ReferenceRecord[], productClass: string): ReferenceRecord[] {
  return records.map(r => ({ ...r, confidence: gradeReferenceConfidence(r, productClass) }))
}

/**
 * Format a retrieved record as a 3–5 line block for the emitter prompt.
 *
 * Output shape (per the W1 brief — "3-5 lines (excerpt + source product +
 * module assignment)"):
 *
 *   [1] (score 0.66) energy_storage_source — bess-utility-scale
 *       Source: CATL — EnerOne BESS Product Brochure
 *       Excerpt: "280Ah LFP Cell ..."
 *       Part: 280Ah LFP Cell (CATL M20280-E)
 */
/**
 * Sanitise a free-text field from a corpus record before injecting into the
 * prompt. Strips control characters, square-bracket section delimiters that
 * could collide with the few-shot block markers, and clips to a hard length
 * cap. Council 2026-05-18 (W1): all 3 seats flagged prompt-injection risk —
 * this is the layer that hardens it.
 */
function sanitiseRecordText(value: string | null | undefined, maxLen = 240): string {
  if (!value) return ''
  let s = String(value)
  // Strip control chars (except newline/tab) — these can wreck prompt formatting.
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
  // Collapse whitespace.
  s = s.replace(/\s+/g, ' ').trim()
  // Neutralise tokens that look like the few-shot block delimiters so a corpus
  // excerpt cannot fake an "[end of reference records]" line and trick the
  // emitter into ignoring downstream content.
  s = s.replace(/\[Reference records[^\]]*\]/gi, '(Reference-records-token-removed)')
  s = s.replace(/\[end of reference records\]/gi, '(end-token-removed)')
  if (s.length > maxLen) s = s.slice(0, maxLen - 1) + '…'
  return s
}

export function formatRecordAsFewShot(rec: ReferenceRecord, index: number): string {
  const lines: string[] = []
  const tableShort = (rec.table || '').replace('pretraining_extracted_', '')
  const headBits: string[] = []
  if (rec.module_assignment) headBits.push(rec.module_assignment)
  if (rec.product_class) headBits.push(rec.product_class)
  const headTrail = headBits.length ? ` — ${headBits.join(' / ')}` : ''
  // Council 2026-05-18 BLOCKER-6: surface confidence on the header line so the
  // emitter sees it without parsing JSON. HIGH = canonical exemplar (Megapack,
  // Altherma); MODERATE = mid-corpus; LOW = sparse / non-canonical.
  const conf = rec.confidence ?? 'moderate'
  const confLabel = conf.toUpperCase()
  lines.push(`[${index}] (score ${rec.score.toFixed(3)} ${tableShort} · confidence=${confLabel})${headTrail}`)

  const sourceBits: string[] = []
  if (rec.manufacturer_doc) sourceBits.push(sanitiseRecordText(rec.manufacturer_doc, 80))
  if (rec.product_name) sourceBits.push(sanitiseRecordText(rec.product_name, 120))
  const cleanSource = sourceBits.filter(Boolean).join(' — ')
  if (cleanSource) lines.push(`    Source: ${cleanSource}`)

  if (rec.table === 'pretraining_extracted_parts') {
    const nameBits: string[] = []
    if (rec.part_name) nameBits.push(sanitiseRecordText(rec.part_name, 120))
    if (rec.manufacturer) nameBits.push(sanitiseRecordText(rec.manufacturer, 60))
    if (rec.part_number) nameBits.push(sanitiseRecordText(rec.part_number, 80))
    const clean = nameBits.filter(Boolean).join(' / ')
    if (clean) lines.push(`    Part: ${clean}`)
  } else if (rec.table === 'pretraining_extracted_specs') {
    const specBits: string[] = []
    if (rec.spec_key) specBits.push(sanitiseRecordText(rec.spec_key, 80))
    if (rec.spec_value) specBits.push(sanitiseRecordText(String(rec.spec_value), 80))
    if (rec.spec_unit) specBits.push(sanitiseRecordText(String(rec.spec_unit), 30))
    const clean = specBits.filter(Boolean).join(' ')
    if (clean) lines.push(`    Spec: ${clean}`)
  } else if (rec.table === 'pretraining_extracted_suppliers') {
    const sBits: string[] = []
    if (rec.company_name) sBits.push(sanitiseRecordText(rec.company_name, 80))
    if (rec.role) sBits.push(sanitiseRecordText(rec.role, 80))
    const clean = sBits.filter(Boolean).join(' — ')
    if (clean) lines.push(`    Supplier: ${clean}`)
  } else if (rec.table === 'pretraining_extracted_standards') {
    const sBits: string[] = []
    if (rec.standard_name) sBits.push(sanitiseRecordText(rec.standard_name, 80))
    if (rec.scope) sBits.push(sanitiseRecordText(String(rec.scope), 120))
    const clean = sBits.filter(Boolean).join(' — ')
    if (clean) lines.push(`    Standard: ${clean}`)
  }

  const excerpt = sanitiseRecordText(rec.raw_excerpt || rec.composed_text, 240)
  if (excerpt) lines.push(`    Excerpt: ${excerpt}`)
  return lines.join('\n')
}

/**
 * Format the retrieved records as the few-shot block that gets concatenated
 * into the Stage 1.7 emitter's user content. Returns an empty string when
 * records is empty so callers can do `userContent + maybeBlock` safely.
 *
 * The header MUST match the `REFERENCE_RECORDS_FEW_SHOT_HEADER` token used in
 * `prompts.ts` so that future migrations can grep one place.
 */
export function formatFewShotBlock(records: readonly ReferenceRecord[]): string {
  if (records.length === 0) return ''
  const formatted = records.map((r, i) => formatRecordAsFewShot(r, i + 1)).join('\n\n')
  // Council 2026-05-18 BLOCKER-6: confidence-grading instruction. Tells the
  // emitter how to weight each exemplar (HIGH = canonical, treat as authority;
  // LOW = sparse / niche, brief takes precedence).
  return [
    '',
    '[Reference records — Phase 4 RAG corpus]',
    `Here are ${records.length} reference records retrieved by cosine similarity from a corpus of real engineering datasheets / installer manuals / service guides. They are VOCABULARY and SHAPE exemplars only — not the BoM. Use them per the priority order in the OPTIONAL RETRIEVAL FEW-SHOT BLOCK section of the system prompt (P0 brief, P1 CORRECT placements, P2 density table, P3 record hints).`,
    `Each record carries a confidence grade (HIGH / MODERATE / LOW) computed from corpus density + canonical-product recognition + cosine score. Treat HIGH-confidence records as canonical exemplars; for LOW-confidence records, the brief takes precedence — they are non-binding analogues only. Some records may belong to a different product_class than this brief — those carry vocabulary weight only.`,
    '',
    formatted,
    '',
    '[end of reference records]',
  ].join('\n')
}
