/**
 * @file local-corpus.ts — read-only access to the local Nightshift supplier corpus.
 *
 * Nightshift is the Forge-Capital crawler/enrichment pipeline. It has produced
 * a rich local dataset of ~27,953 UK/EU companies with:
 *   - ~17,547 synthesised public profiles (capability summaries, marketplace tags)
 *   - ~18,840 with structured process_capabilities_json (process, materials, tolerances)
 *   - ~13,771 with 1536-dim OpenAI text-embedding-3-small embeddings
 *
 * Primary DB: ~/Library/Application Support/com.fractionalforge.nightshift/nightshift.db
 * Secondary: ~/Developer/Forge-Capital/nightshift/crawler/corpus.db — 1.9M page chunks.
 *
 * This module is deliberately LOCAL ONLY. It returns null for any query if the
 * underlying SQLite files aren't present (Vercel, CI, other Macs). The pdf
 * engine gracefully falls back to stock behaviour when null is returned.
 *
 * The query functions do not write — db is opened read-only.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const NIGHTSHIFT_DB = join(
  homedir(),
  'Library/Application Support/com.fractionalforge.nightshift/nightshift.db',
)

// ─── Connection (lazy, cached) ────────────────────────────────────────────

let _db: Database.Database | null = null
let _dbAttempted = false

function getDb(): Database.Database | null {
  if (_dbAttempted) return _db
  _dbAttempted = true
  try {
    if (!existsSync(NIGHTSHIFT_DB)) {
      console.log('[local-corpus] nightshift.db not found, falling back to Supabase-only grounding')
      return null
    }
    _db = new Database(NIGHTSHIFT_DB, { readonly: true, fileMustExist: true })
    _db.pragma('query_only = true')
    const n = _db.prepare(
      "SELECT COUNT(*) AS n FROM supplier_embeddings WHERE model = 'text-embedding-3-small' AND dims = 1536",
    ).get() as { n: number }
    console.log(`[local-corpus] nightshift.db open — ${n.n.toLocaleString()} compatible embeddings`)
    return _db
  } catch (err) {
    console.warn('[local-corpus] failed to open nightshift.db:', (err as Error).message)
    return null
  }
}

export function isLocalCorpusAvailable(): boolean {
  return getDb() !== null
}

// ─── Embedding helpers ────────────────────────────────────────────────────

/**
 * Parse an embedding_json column ("[0.123,-0.045,...]") into a Float64Array.
 * Returns null if parsing fails.
 */
function parseEmbeddingJson(text: string | null | undefined): Float64Array | null {
  if (!text) return null
  try {
    const arr = JSON.parse(text) as number[]
    if (!Array.isArray(arr)) return null
    return Float64Array.from(arr)
  } catch {
    return null
  }
}

/** Cosine similarity between two same-length float vectors. */
function cosine(a: Float64Array, b: Float64Array): number {
  const n = Math.min(a.length, b.length)
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// ─── Public API ───────────────────────────────────────────────────────────

export interface LocalSupplier {
  companyId: string
  name: string
  website: string | null
  country: string | null
  city: string | null
  description: string | null
  category: string | null
  specialties: string[]
  certifications: string[]
  industries: string[]
  enrichmentQuality: number
  supabaseListingId: string | null
  processCapabilities: Array<{
    processName: string
    processCategory?: string
    materials?: string[]
    tolerance?: string
    batchSize?: string
    confidence?: number
  }>
  similarity: number
}

function safeJsonArray(text: string | null | undefined): any[] {
  if (!text) return []
  try {
    const v = JSON.parse(text)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/**
 * Semantic supplier search: given a 1536-dim query embedding, return the
 * top-K most similar suppliers from the local corpus with full enrichment
 * data. O(n) over ~13.7k vectors, ~80 ms on an M1 Mac Studio.
 *
 * Returns null if the local corpus isn't available.
 */
export function semanticSupplierSearch(
  queryEmbedding: number[],
  topK: number = 5,
  minSimilarity: number = 0.25,
): LocalSupplier[] | null {
  const db = getDb()
  if (!db) return null
  if (!queryEmbedding || queryEmbedding.length !== 1536) {
    throw new Error(`semanticSupplierSearch: expected 1536-dim vector, got ${queryEmbedding?.length}`)
  }

  const q = Float64Array.from(queryEmbedding)

  type EmbRow = { company_id: string; embedding: string }
  const rows = db.prepare(
    `SELECT company_id, embedding
     FROM supplier_embeddings
     WHERE model = 'text-embedding-3-small' AND dims = 1536`,
  ).all() as EmbRow[]

  const scored: Array<{ companyId: string; score: number }> = []
  for (const row of rows) {
    const vec = parseEmbeddingJson(row.embedding)
    if (!vec) continue
    const s = cosine(q, vec)
    if (s >= minSimilarity) scored.push({ companyId: row.company_id, score: s })
  }
  scored.sort((a, b) => b.score - a.score)
  const topCompanies = scored.slice(0, topK)
  if (topCompanies.length === 0) return []

  // Resolve to company detail
  type CompanyRow = {
    id: string
    name: string
    website_url: string | null
    country: string | null
    city: string | null
    description: string | null
    category: string | null
    specialties: string | null
    certifications: string | null
    industries: string | null
    enrichment_quality: number | null
    supabase_listing_id: string | null
    process_capabilities_json: string | null
    synthesis_public_json: string | null
  }

  const placeholders = topCompanies.map(() => '?').join(',')
  const companyRows = db.prepare(
    `SELECT id, name, website_url, country, city, description, category,
            specialties, certifications, industries, enrichment_quality,
            supabase_listing_id, process_capabilities_json, synthesis_public_json
     FROM companies
     WHERE id IN (${placeholders})`,
  ).all(...topCompanies.map(c => c.companyId)) as CompanyRow[]

  const byId = new Map(companyRows.map(c => [c.id, c]))

  return topCompanies.map((tc): LocalSupplier => {
    const c = byId.get(tc.companyId)
    if (!c) {
      return {
        companyId: tc.companyId,
        name: '(unknown)',
        website: null, country: null, city: null,
        description: null, category: null,
        specialties: [], certifications: [], industries: [],
        enrichmentQuality: 0,
        supabaseListingId: null,
        processCapabilities: [],
        similarity: tc.score,
      }
    }

    const procCaps = safeJsonArray(c.process_capabilities_json).map((p: any) => ({
      processName: String(p.process_name ?? ''),
      processCategory: p.process_category ? String(p.process_category) : undefined,
      materials: Array.isArray(p.materials_worked) ? p.materials_worked.map(String) : undefined,
      tolerance: p.tolerance_claimed ? String(p.tolerance_claimed) : undefined,
      batchSize: p.batch_size_range ? String(p.batch_size_range) : undefined,
      confidence: typeof p.confidence === 'number' ? p.confidence : undefined,
    }))

    return {
      companyId: c.id,
      name: c.name,
      website: c.website_url,
      country: c.country,
      city: c.city,
      description: c.description,
      category: c.category,
      specialties: safeJsonArray(c.specialties).map(String),
      certifications: safeJsonArray(c.certifications).map(String),
      industries: safeJsonArray(c.industries).map(String),
      enrichmentQuality: c.enrichment_quality ?? 0,
      supabaseListingId: c.supabase_listing_id,
      processCapabilities: procCaps,
      similarity: tc.score,
    }
  })
}

// ─── Domain → specialism tag mapping ─────────────────────────────────────────
//
// Maps each Radical product class to the Nightshift specialism tags that
// indicate a relevant OEM or system integrator. Used by findSuppliersBySpecialism
// to surface 1-3 real candidate companies for oem_subsystem leaves.
//
// Source: Play 1 corpus enrichment (commit 19ad938 in Forge-Capital/nightshift).
// Specialism tags use the exact strings in the companies.specialism JSON array.

export const PRODUCT_CLASS_TO_SPECIALISM: Record<string, string[]> = {
  energy_storage:   ['bess_integrator', 'pcs_power_electronics', 'bms_specialist'],
  thermal_system:   ['hvac_system_oem'],
  ev_charger:       ['ev_charger_integrator', 'pcs_power_electronics'],
  drone:            ['precision_machining_cnc', 'composite_layup', 'additive_3d_print_metal'],
  edge_ai_server:   ['industrial_enclosure_oem', 'precision_machining_cnc'],
  wearable_medical: ['wearable_medical', 'medical_device_cm'],
  bioreactor:       ['medical_device_cm', 'precision_machining_cnc'],
  vertical_farm:    ['vertical_farm_systems'],
  auv:              ['auv_marine_systems', 'precision_machining_cnc'],
  haps:             ['haps_aerospace', 'aerospace_composite'],
}

export interface SpecialismSupplier {
  companyId: string
  name: string
  website: string | null
  country: string | null
  city: string | null
  description: string | null
  specialism: string[]
  enrichmentQuality: number
}

/**
 * Specialism-based supplier lookup — no embedding required.
 * Queries the companies.specialism JSON array for matching tags and returns
 * up to topK companies ordered by enrichment_quality DESC.
 *
 * Returns null if the corpus is unavailable, empty array if no matches.
 *
 * Used by Phase 2 resolution (4b-radical-resolution.ts) to surface candidate
 * OEM suppliers for oem_subsystem leaves without requiring an LLM call or
 * embedding.
 */
export function findSuppliersBySpecialism(
  productClass: string,
  topK: number = 3,
): SpecialismSupplier[] | null {
  const db = getDb()
  if (!db) return null

  const tags = PRODUCT_CLASS_TO_SPECIALISM[productClass]
  if (!tags || tags.length === 0) return []

  // Build a LIKE clause for each tag — the specialism column is a JSON array string.
  // e.g. specialism = '["bess_integrator","pcs_power_electronics"]'
  const clauses = tags.map(() => `specialism LIKE ?`).join(' OR ')
  const params = tags.map(t => `%${t}%`)

  type Row = {
    id: string
    name: string
    website_url: string | null
    country: string | null
    city: string | null
    description: string | null
    specialism: string | null
    enrichment_quality: number | null
  }

  try {
    const rows = db.prepare(
      `SELECT id, name, website_url, country, city, description, specialism, enrichment_quality
       FROM companies
       WHERE (${clauses})
         AND status != 'rejected'
         AND enrichment_quality >= 40
       ORDER BY enrichment_quality DESC
       LIMIT ?`,
    ).all(...params, topK) as Row[]

    return rows.map(r => ({
      companyId: r.id,
      name: r.name,
      website: r.website_url,
      country: r.country,
      city: r.city,
      description: r.description,
      specialism: r.specialism ? ((() => { try { return JSON.parse(r.specialism) } catch { return [] } })()) : [],
      enrichmentQuality: r.enrichment_quality ?? 0,
    }))
  } catch (err) {
    console.warn('[local-corpus] findSuppliersBySpecialism failed:', (err as Error).message)
    return []
  }
}

/**
 * Lightweight stat for logging: count how many companies have embeddings,
 * process capabilities, and synthesised profiles. Useful for the pipeline
 * startup log to show the quality of the grounding available.
 */
export function getCorpusStats(): {
  available: boolean
  companies: number
  embedded: number
  withProcessCapabilities: number
  withSynthesis: number
} {
  const db = getDb()
  if (!db) {
    return { available: false, companies: 0, embedded: 0, withProcessCapabilities: 0, withSynthesis: 0 }
  }
  const c = (db.prepare('SELECT COUNT(*) AS n FROM companies').get() as { n: number }).n
  const e = (db.prepare(
    "SELECT COUNT(*) AS n FROM supplier_embeddings WHERE model='text-embedding-3-small' AND dims=1536",
  ).get() as { n: number }).n
  const p = (db.prepare(
    'SELECT COUNT(*) AS n FROM companies WHERE process_capabilities_json IS NOT NULL',
  ).get() as { n: number }).n
  const s = (db.prepare(
    'SELECT COUNT(*) AS n FROM companies WHERE synthesis_public_json IS NOT NULL',
  ).get() as { n: number }).n
  return { available: true, companies: c, embedded: e, withProcessCapabilities: p, withSynthesis: s }
}
