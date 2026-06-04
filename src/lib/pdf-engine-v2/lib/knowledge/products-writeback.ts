/**
 * @file knowledge/products-writeback.ts — DB-first lookup + web-search
 * fallback + UPSERT writeback for `pretraining_products`.
 *
 * Closes the gap documented in drawer `forgeos_gotchas_25df555e549213ca`:
 * the 587-row pretraining_products table had ZERO INSERT paths.
 *
 * API contract:
 *
 *   lookupProduct({ product_name, product_class? })
 *     → Promise<{ found: boolean; key_specs: Record<string, unknown>; source: 'db' | 'web' | null }>
 *
 * Behaviour:
 *   1. DB-first HYBRID: route the lookup through the shared dual-search.ts
 *      (lexical LIKE over product_name + manufacturer + the modules/specs text
 *      AND semantic cosine over the new `embedding` column, RRF-fused). Falls
 *      back to the legacy exact-then-LIKE prepared statements when dualSearch
 *      finds nothing (so a lexical-only deployment, or a row written before the
 *      backfill, still resolves).
 *   2. Web-search fallback via OpenRouter web-search model.
 *   3. On web hit, UPSERT into pretraining_products with key_specs_json +
 *      envelope_json populated AND its 1536-d embedding (so the row is
 *      retrievable by the hybrid query the moment it is written — closes the
 *      audited 2026-06-04 "grows a DB nobody reads" gap, products P5).
 *   4. On web miss, returns { found: false, key_specs: {}, source: null }.
 *
 * The pretraining_products table uses product_name as TEXT PRIMARY KEY, so
 * INSERT OR REPLACE is safe for dedup (no FK complications). The `embedding`
 * BLOB + `embed_hash` TEXT columns (added 2026-06-04, Float32LE convention
 * matching pretraining_extracted_*) carry the semantic arm.
 *
 * British spelling throughout.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { dualSearch } from '../retrieval/dual-search'

// ── Constants ──────────────────────────────────────────────────────────────────
const DB_PATH = resolve(homedir(), '.forge-truth', 'forge-truth.db')
// Audit-log tag for extraction_model column. Actual call goes via callFastExtract
// default (Gemini 3.1 Flash-Lite) because groundWithGoogleSearch only takes
// effect on that model.
const WEB_SEARCH_MODEL = 'google/gemini-3.1-flash-lite+grounding'

// ── Embedding (text-embedding-3-small, 1536-d, Float32LE BLOB) ───────────────
// MIRRORS library-writeback.ts:52-81 + specs-writeback.ts:56-85 EXACTLY so a
// web-discovered product row is retrievable by the same hybrid (dual-search.ts)
// cosine query the moment it is written. Without this the UPSERT lands
// embedding=NULL and the row stays semantically invisible until the manual
// scripts/ingest backfill runs (the audited 2026-06-04 products gap, P5/step 4).
const OPENAI_KEY = process.env.OPENAI_API_KEY || ''
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMS = 1536

/** sha256(embed_source) prefix — same idempotency convention as the corpus. */
function embedHashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32)
}

/** Embed one string → Float32LE Buffer, or null on any failure (graceful). */
async function embedText(text: string): Promise<Buffer | null> {
  if (!OPENAI_KEY) return null
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text.slice(0, 4096), model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMS }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> }
    const vec = data.data?.[0]?.embedding
    if (!vec || vec.length !== EMBEDDING_DIMS) return null
    const buf = Buffer.alloc(EMBEDDING_DIMS * 4)
    for (let i = 0; i < EMBEDDING_DIMS; i++) buf.writeFloatLE(vec[i], i * 4)
    return buf
  } catch {
    return null
  }
}

/**
 * Canonical embed recipe for a product row — the same text the hybrid lexical
 * arm searches, so query↔index align: product name + manufacturer + the module
 * names + the key-spec values, space-joined. Exported-shape kept private; the
 * UPSERT and the backfill BOTH call this so a row written in-chain and a row
 * written by the backfill carry an identical-recipe vector.
 */
function buildProductEmbedSource(args: {
  product_name: string
  manufacturer?: string | null
  modules?: unknown
  key_specs?: Record<string, unknown>
}): string {
  const moduleNames = Array.isArray(args.modules)
    ? (args.modules as Array<{ module?: string; sub_modules?: string[] }>)
        .flatMap((m) => [m?.module, ...(Array.isArray(m?.sub_modules) ? m.sub_modules : [])])
        .filter(Boolean)
        .join(' ')
    : ''
  const specText = args.key_specs
    ? Object.entries(args.key_specs)
        .map(([k, v]) => `${k} ${v}`)
        .join(' ')
    : ''
  return [args.product_name, args.manufacturer ?? '', moduleNames, specText]
    .filter(Boolean)
    .join(' ')
    .slice(0, 4096)
}

// ── Module-scoped DB handle ───────────────────────────────────────────────────
let dbHandle: Database.Database | null | undefined = undefined
let warnedMissing = false
let stmtLookupExact: Database.Statement | null = null
let stmtLookupLike: Database.Statement | null = null
let stmtLookupByName: Database.Statement | null = null
let stmtUpsert: Database.Statement | null = null

function getDb(): Database.Database | null {
  if (dbHandle !== undefined) return dbHandle
  if (process.env.SKIP_LIBRARY_WRITEBACK === '1' || process.env.NODE_ENV === 'test') {
    dbHandle = null
    return null
  }
  try {
    if (!existsSync(DB_PATH)) {
      if (!warnedMissing) {
        console.warn(`[products-writeback] forge-truth.db not found — writeback disabled`)
        warnedMissing = true
      }
      dbHandle = null
      return null
    }
    const db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 2000')

    stmtLookupExact = db.prepare(`
      SELECT product_name, product_class, manufacturer, key_specs_json, envelope_json,
             standards_json, modules_json, suppliers_json
      FROM pretraining_products
      WHERE LOWER(product_name) = LOWER(?)
        AND (? IS NULL OR product_class IS NULL OR LOWER(product_class) LIKE LOWER('%' || ? || '%'))
      LIMIT 1
    `)

    stmtLookupLike = db.prepare(`
      SELECT product_name, product_class, manufacturer, key_specs_json, envelope_json,
             standards_json, modules_json, suppliers_json
      FROM pretraining_products
      WHERE LOWER(product_name) LIKE LOWER('%' || ? || '%')
        AND (? IS NULL OR product_class IS NULL OR LOWER(product_class) LIKE LOWER('%' || ? || '%'))
      ORDER BY LENGTH(product_name) ASC
      LIMIT 1
    `)

    // Fetch a full row by exact product_name — used to hydrate the row dualSearch
    // returns (dualSearch returns the lexical columns; this gets the JSON blobs).
    stmtLookupByName = db.prepare(`
      SELECT product_name, product_class, manufacturer, key_specs_json, envelope_json,
             standards_json, modules_json, suppliers_json
      FROM pretraining_products
      WHERE product_name = ?
      LIMIT 1
    `)

    stmtUpsert = db.prepare(`
      INSERT INTO pretraining_products
        (product_name, product_class, manufacturer, source_urls, key_specs_json,
         envelope_json, modules_json, suppliers_json, standards_json,
         embedding, embed_hash, extracted_at, extraction_model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(product_name) DO UPDATE SET
        key_specs_json   = COALESCE(excluded.key_specs_json, key_specs_json),
        envelope_json    = COALESCE(excluded.envelope_json, envelope_json),
        modules_json     = COALESCE(excluded.modules_json, modules_json),
        suppliers_json   = COALESCE(excluded.suppliers_json, suppliers_json),
        standards_json   = COALESCE(excluded.standards_json, standards_json),
        source_urls      = COALESCE(excluded.source_urls, source_urls),
        embedding        = COALESCE(excluded.embedding, embedding),
        embed_hash       = COALESCE(excluded.embed_hash, embed_hash),
        extracted_at     = excluded.extracted_at,
        extraction_model = excluded.extraction_model
    `)

    dbHandle = db
    return db
  } catch (err) {
    if (!warnedMissing) {
      console.warn(`[products-writeback] init failed: ${(err as Error).message} — writeback disabled`)
      warnedMissing = true
    }
    dbHandle = null
    return null
  }
}

// ── Web search fallback ───────────────────────────────────────────────────────

interface WebProductResult {
  manufacturer: string
  key_specs: Record<string, unknown>
  envelope: Record<string, unknown>
  modules: ProductModule[]
  suppliers: ProductSupplier[]
  standards: string[]
  source_url: string
}

async function searchProductOnWeb(args: {
  product_name: string
  product_class?: string
}): Promise<WebProductResult | null> {
  if (process.env.SKIP_SPECS_WEB_SEARCH === '1') return null
  if (!process.env.OPENROUTER_API_KEY) return null

  const { product_name, product_class } = args
  const classHint = product_class ? ` (product class: ${product_class})` : ''
  const prompt =
    `You are a product specification research assistant. Return ONLY a JSON object with no markdown.
Research the product: "${product_name}"${classHint}.
Search manufacturer websites, product pages, and distributor catalogues.
Return: {
  "manufacturer":"<company name>",
  "key_specs":{"<spec_key>":"<value with unit>"},
  "envelope":{"typical_weight_kg":<n>,"typical_dimensions_mm":"<W×H×D>","certifications":["<cert>"]},
  "modules":[{"module":"<top-level subsystem>","sub_modules":["<part group>"]}],
  "suppliers":[{"role":"manufacturer","name":"<company>","url":"<URL>"}],
  "standards":["<standard code>"],
  "source_url":"<URL>"
}
"modules" = the product's top-level engineering subsystems and the part groups inside each (e.g. for a battery system: energy_storage_source → [cells, racks, busbars]). Use lower_snake_case names.
If you cannot find the product, return: {"manufacturer":"","key_specs":{},"envelope":{},"modules":[],"suppliers":[],"standards":[],"source_url":""}`

  try {
    const t0 = Date.now()
    const { callFastExtract } = await import('../openrouter-models')
    // NOTE: groundWithGoogleSearch only takes effect on Gemini 3.1 Flash-Lite
    // (the default model in callFastExtract). Do NOT pass a model override.
    const raw = await callFastExtract(prompt, {
      maxTokens: 1024,
      temperature: 0,
      thinkingLevel: 'low',
      groundWithGoogleSearch: true,
    })
    const latencyMs = Date.now() - t0
    console.error(`[products-writeback] web search: ${product_name} — ${latencyMs}ms`)

    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    let parsed: any
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      return null
    }
    if (!parsed.manufacturer && !Object.keys(parsed.key_specs ?? {}).length) return null
    const modules: ProductModule[] = Array.isArray(parsed.modules)
      ? parsed.modules
          .filter((m: any) => m && typeof m.module === 'string')
          .map((m: any) => ({
            module: String(m.module),
            sub_modules: Array.isArray(m.sub_modules) ? m.sub_modules.map(String) : [],
          }))
      : []
    const suppliers: ProductSupplier[] = Array.isArray(parsed.suppliers)
      ? parsed.suppliers
          .filter((s: any) => s && typeof s.name === 'string')
          .map((s: any) => ({
            role: s.role ? String(s.role) : undefined,
            name: String(s.name),
            url: s.url ? String(s.url) : undefined,
          }))
      : []
    return {
      manufacturer: String(parsed.manufacturer ?? ''),
      key_specs: typeof parsed.key_specs === 'object' ? parsed.key_specs : {},
      envelope: typeof parsed.envelope === 'object' ? parsed.envelope : {},
      modules,
      suppliers,
      standards: Array.isArray(parsed.standards) ? parsed.standards : [],
      source_url: String(parsed.source_url ?? ''),
    }
  } catch (err) {
    console.warn(`[products-writeback] web search failed: ${(err as Error).message}`)
    return null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** A module/sub-module ontology entry as stored in modules_json. */
export interface ProductModule {
  module: string
  sub_modules: string[]
}

/** A supplier entry as stored in suppliers_json. */
export interface ProductSupplier {
  role?: string
  name: string
  url?: string
}

export interface ProductLookupResult {
  found: boolean
  /** Matched product name (may differ from the query — e.g. a LIKE/hybrid hit). */
  product_name: string | null
  /** Manufacturer of the matched product. */
  manufacturer: string | null
  key_specs: Record<string, unknown>
  envelope: Record<string, unknown>
  /** Module → sub-module ontology (from modules_json). Drives generation. */
  modules: ProductModule[]
  /** Named suppliers (from suppliers_json). Informs the Sourcing section. */
  suppliers: ProductSupplier[]
  standards: string[]
  source: 'db' | 'web' | null
}

/** Shape of a hydrated pretraining_products row (JSON columns still strings). */
interface ProductRow {
  product_name: string
  product_class: string | null
  manufacturer: string | null
  key_specs_json: string | null
  envelope_json: string | null
  standards_json: string | null
  modules_json: string | null
  suppliers_json: string | null
}

/** Parse a hydrated DB row into a ProductLookupResult (source='db'). */
function rowToResult(row: ProductRow): ProductLookupResult {
  const parse = <T,>(s: string | null, fallback: T): T => {
    if (!s) return fallback
    try { return JSON.parse(s) as T } catch { return fallback }
  }
  return {
    found: true,
    product_name: row.product_name,
    manufacturer: row.manufacturer ?? null,
    key_specs: parse<Record<string, unknown>>(row.key_specs_json, {}),
    envelope: parse<Record<string, unknown>>(row.envelope_json, {}),
    modules: parse<ProductModule[]>(row.modules_json, []),
    suppliers: parse<ProductSupplier[]>(row.suppliers_json, []),
    standards: parse<string[]>(row.standards_json, []),
    source: 'db',
  }
}

/**
 * DB-first lookup of product-level metadata with web-search fallback + writeback.
 * Never throws. Returns { found: false } on miss.
 *
 * @param args.product_name   Product name (e.g. 'Tesla Megapack 2 XL')
 * @param args.product_class  Optional class filter (e.g. 'bess-utility-scale')
 */
export async function lookupProduct(args: {
  product_name: string
  product_class?: string
}): Promise<ProductLookupResult> {
  const { product_name, product_class } = args
  const EMPTY: ProductLookupResult = {
    found: false, product_name: null, manufacturer: null,
    key_specs: {}, envelope: {}, modules: [], suppliers: [], standards: [], source: null,
  }
  const t0 = Date.now()

  // ── 1a. DB-first HYBRID via the shared dual-search.ts ────────────────
  // Lexical arm: product_name + manufacturer (the columns a user names). Semantic
  // arm: the new `embedding` column (Float32LE BLOB, f32le_blob format), keyed on
  // product_name (the PK). RRF-fused. A class filter, when given, scopes BOTH
  // arms. This is the same hybrid substrate suppliers use — products now joins it.
  const db = getDb()
  if (db) {
    try {
      const where = product_class
        ? `LOWER(COALESCE(product_class,'')) LIKE LOWER('%${product_class.replace(/'/g, "''")}%')`
        : undefined
      const ds = await dualSearch<ProductRow>({
        table: 'pretraining_products',
        idColumn: 'product_name',
        lexicalCols: ['product_name', 'manufacturer'],
        selectCols: ['product_class'],
        embedding: {
          table: 'pretraining_products',
          column: 'embedding',
          format: 'f32le_blob',
          joinColumn: 'product_name',
        },
        queryText: `${product_name} ${product_class ?? ''}`.trim(),
        // Fetch a small candidate set (not 1) so we can prefer an ONTOLOGY-BEARING
        // row. The whole value of a product hit is its module decomposition; a thin
        // generic class row (e.g. "bess container", 0 modules) can out-rank a rich
        // reference product (e.g. "Tesla Megapack 3", 11 modules) on pure lexical
        // class-token overlap. RRF gives the candidate set; this picks the richest.
        k: 8,
        where,
        dbPath: DB_PATH,
      })
      if (ds.hits.length > 0) {
        // Hydrate the JSON blobs for each candidate (dualSearch returns lexical
        // cols only) and choose: highest fused rank that ALSO carries modules; if
        // none carry modules, fall back to the top fused hit (still has specs).
        let chosen: ProductRow | undefined
        let chosenHadModules = false
        for (const hit of ds.hits) {
          const full = stmtLookupByName
            ? (stmtLookupByName.get(hit.id) as ProductRow | undefined)
            : undefined
          const row = full ?? (hit.row as ProductRow)
          if (!row || !row.product_name) continue
          let nModules = 0
          try { const m = row.modules_json ? JSON.parse(row.modules_json) : []; nModules = Array.isArray(m) ? m.length : 0 } catch { nModules = 0 }
          if (!chosen) chosen = row // top fused hit = default
          if (nModules > 0) { chosen = row; chosenHadModules = true; break } // first rich hit wins
        }
        if (chosen) {
          console.error(`[products-writeback] ${JSON.stringify({ product_name, hit: 'db_hybrid', matched: chosen.product_name, has_modules: chosenHadModules, used_embedding: ds.used_embedding, candidates: ds.hits.length, latency_ms: Date.now() - t0 })}`)
          return rowToResult(chosen)
        }
      }
    } catch (err) {
      console.warn(`[products-writeback] hybrid lookup failed: ${(err as Error).message} — falling back to keyed lookup`)
    }
  }

  // ── 1b. Legacy keyed fallback (exact-then-LIKE) ──────────────────────
  // Backstops dualSearch when it returns nothing (lexical-only deployment with a
  // synonym-only match, or a row written before the embedding backfill).
  if (db && stmtLookupExact && stmtLookupLike) {
    try {
      const classArg = product_class ?? null
      let row = stmtLookupExact.get(product_name, classArg, classArg) as ProductRow | undefined

      if (!row) {
        row = stmtLookupLike.get(product_name, classArg, classArg) as ProductRow | undefined
      }

      if (row) {
        const latencyMs = Date.now() - t0
        console.error(`[products-writeback] ${JSON.stringify({ product_name, hit: 'db_keyed', latency_ms: latencyMs })}`)
        return rowToResult(row)
      }
    } catch (err) {
      console.warn(`[products-writeback] DB lookup failed: ${(err as Error).message}`)
    }
  }

  // ── 2. Web-search fallback ───────────────────────────────────────────
  const webResult = await searchProductOnWeb({ product_name, product_class })
  const latencyMs = Date.now() - t0

  if (!webResult || (!webResult.manufacturer && !Object.keys(webResult.key_specs).length)) {
    console.error(`[products-writeback] ${JSON.stringify({ product_name, hit: 'miss', latency_ms: latencyMs })}`)
    return EMPTY
  }

  // ── 3. Writeback (EMBED-ON-WRITE) ────────────────────────────────────
  // Embed BEFORE the UPSERT so the row is retrievable by the hybrid semantic arm
  // the moment it lands — never a NULL-embedded row when OPENAI_API_KEY is set
  // (mirrors library-writeback.ts + specs-writeback.ts). Degrades to a
  // NULL-embedded row on a missing key / embed failure (the backfill sweeps it).
  if (db && stmtUpsert) {
    try {
      const embedSource = buildProductEmbedSource({
        product_name,
        manufacturer: webResult.manufacturer,
        modules: webResult.modules,
        key_specs: webResult.key_specs,
      })
      const embedding = await embedText(embedSource)
      const embedHash = embedding ? embedHashOf(embedSource) : null
      stmtUpsert.run(
        product_name,
        product_class ?? null,
        webResult.manufacturer || null,
        webResult.source_url ? JSON.stringify([webResult.source_url]) : null,
        Object.keys(webResult.key_specs).length ? JSON.stringify(webResult.key_specs) : null,
        Object.keys(webResult.envelope).length ? JSON.stringify(webResult.envelope) : null,
        webResult.modules.length ? JSON.stringify(webResult.modules) : null,
        webResult.suppliers.length ? JSON.stringify(webResult.suppliers) : null,
        webResult.standards.length ? JSON.stringify(webResult.standards) : null,
        embedding,
        embedHash,
        new Date().toISOString(),
        WEB_SEARCH_MODEL,
      )
    } catch (err) {
      console.warn(`[products-writeback] writeback failed for ${product_name}: ${(err as Error).message}`)
    }
  }

  console.error(`[products-writeback] ${JSON.stringify({ product_name, hit: 'web', latency_ms: latencyMs })}`)
  return {
    found: true,
    product_name,
    manufacturer: webResult.manufacturer || null,
    key_specs: webResult.key_specs,
    envelope: webResult.envelope,
    modules: webResult.modules,
    suppliers: webResult.suppliers,
    standards: webResult.standards,
    source: 'web',
  }
}

/**
 * Embed a single existing product row (used by the backfill). Builds the same
 * canonical recipe as the UPSERT, embeds, and returns the BLOB + hash. Exported
 * so the backfill script + tests reuse the exact recipe — no drift between the
 * in-chain write vector and the backfill vector. Never throws; returns null on
 * any failure (missing key, network, empty source).
 */
export async function embedProductRow(args: {
  product_name: string
  manufacturer?: string | null
  modules?: unknown
  key_specs?: Record<string, unknown>
}): Promise<{ embedding: Buffer; embed_hash: string } | null> {
  const src = buildProductEmbedSource(args)
  if (!src) return null
  const embedding = await embedText(src)
  if (!embedding) return null
  return { embedding, embed_hash: embedHashOf(src) }
}

/** Test-only reset hook */
export function _resetForTests(): void {
  if (dbHandle) {
    try { dbHandle.close() } catch { /* no-op */ }
  }
  dbHandle = undefined
  stmtLookupExact = null
  stmtLookupLike = null
  stmtLookupByName = null
  stmtUpsert = null
  warnedMissing = false
}
