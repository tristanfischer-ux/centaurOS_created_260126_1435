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
 *   1. DB-first: query pretraining_products by product_name (exact, then LIKE).
 *   2. Web-search fallback via OpenRouter web-search model.
 *   3. On web hit, UPSERT into pretraining_products with key_specs_json +
 *      envelope_json populated.
 *   4. On web miss, returns { found: false, key_specs: {}, source: null }.
 *
 * Lower priority than specs/standards but included for completeness per spec.
 * The pretraining_products table uses product_name as TEXT PRIMARY KEY, so
 * INSERT OR REPLACE is safe for dedup (no FK complications).
 *
 * British spelling throughout.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

// ── Constants ──────────────────────────────────────────────────────────────────
const DB_PATH = resolve(homedir(), '.forge-truth', 'forge-truth.db')
// Audit-log tag for extraction_model column. Actual call goes via callFastExtract
// default (Gemini 3.1 Flash-Lite) because groundWithGoogleSearch only takes
// effect on that model.
const WEB_SEARCH_MODEL = 'google/gemini-3.1-flash-lite+grounding'

// ── Module-scoped DB handle ───────────────────────────────────────────────────
let dbHandle: Database.Database | null | undefined = undefined
let warnedMissing = false
let stmtLookupExact: Database.Statement | null = null
let stmtLookupLike: Database.Statement | null = null
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
      SELECT product_name, product_class, manufacturer, key_specs_json, envelope_json, standards_json
      FROM pretraining_products
      WHERE LOWER(product_name) = LOWER(?)
        AND (? IS NULL OR product_class IS NULL OR LOWER(product_class) LIKE LOWER('%' || ? || '%'))
      LIMIT 1
    `)

    stmtLookupLike = db.prepare(`
      SELECT product_name, product_class, manufacturer, key_specs_json, envelope_json, standards_json
      FROM pretraining_products
      WHERE LOWER(product_name) LIKE LOWER('%' || ? || '%')
        AND (? IS NULL OR product_class IS NULL OR LOWER(product_class) LIKE LOWER('%' || ? || '%'))
      ORDER BY LENGTH(product_name) ASC
      LIMIT 1
    `)

    stmtUpsert = db.prepare(`
      INSERT INTO pretraining_products
        (product_name, product_class, manufacturer, source_urls, key_specs_json,
         envelope_json, standards_json, extracted_at, extraction_model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(product_name) DO UPDATE SET
        key_specs_json   = COALESCE(excluded.key_specs_json, key_specs_json),
        envelope_json    = COALESCE(excluded.envelope_json, envelope_json),
        standards_json   = COALESCE(excluded.standards_json, standards_json),
        source_urls      = COALESCE(excluded.source_urls, source_urls),
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
  "standards":["<standard code>"],
  "source_url":"<URL>"
}
If you cannot find the product, return: {"manufacturer":"","key_specs":{},"envelope":{},"standards":[],"source_url":""}`

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
    return {
      manufacturer: String(parsed.manufacturer ?? ''),
      key_specs: typeof parsed.key_specs === 'object' ? parsed.key_specs : {},
      envelope: typeof parsed.envelope === 'object' ? parsed.envelope : {},
      standards: Array.isArray(parsed.standards) ? parsed.standards : [],
      source_url: String(parsed.source_url ?? ''),
    }
  } catch (err) {
    console.warn(`[products-writeback] web search failed: ${(err as Error).message}`)
    return null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ProductLookupResult {
  found: boolean
  key_specs: Record<string, unknown>
  envelope: Record<string, unknown>
  standards: string[]
  source: 'db' | 'web' | null
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
  const EMPTY: ProductLookupResult = { found: false, key_specs: {}, envelope: {}, standards: [], source: null }
  const t0 = Date.now()

  // ── 1. DB-first ──────────────────────────────────────────────────────
  const db = getDb()
  if (db && stmtLookupExact && stmtLookupLike) {
    try {
      const classArg = product_class ?? null
      let row = stmtLookupExact.get(product_name, classArg, classArg) as
        | { product_name: string; product_class: string; manufacturer: string; key_specs_json: string | null; envelope_json: string | null; standards_json: string | null }
        | undefined

      if (!row) {
        row = stmtLookupLike.get(product_name, classArg, classArg) as typeof row
      }

      if (row) {
        const latencyMs = Date.now() - t0
        console.error(`[products-writeback] ${JSON.stringify({ product_name, hit: 'db', latency_ms: latencyMs })}`)
        return {
          found: true,
          key_specs: row.key_specs_json ? JSON.parse(row.key_specs_json) : {},
          envelope: row.envelope_json ? JSON.parse(row.envelope_json) : {},
          standards: row.standards_json ? JSON.parse(row.standards_json) : [],
          source: 'db',
        }
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

  // ── 3. Writeback ─────────────────────────────────────────────────────
  if (db && stmtUpsert) {
    try {
      stmtUpsert.run(
        product_name,
        product_class ?? null,
        webResult.manufacturer || null,
        webResult.source_url ? JSON.stringify([webResult.source_url]) : null,
        Object.keys(webResult.key_specs).length ? JSON.stringify(webResult.key_specs) : null,
        Object.keys(webResult.envelope).length ? JSON.stringify(webResult.envelope) : null,
        webResult.standards.length ? JSON.stringify(webResult.standards) : null,
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
    key_specs: webResult.key_specs,
    envelope: webResult.envelope,
    standards: webResult.standards,
    source: 'web',
  }
}

/** Test-only reset hook */
export function _resetForTests(): void {
  if (dbHandle) {
    try { dbHandle.close() } catch { /* no-op */ }
  }
  dbHandle = undefined
  stmtLookupExact = null
  stmtLookupLike = null
  stmtUpsert = null
  warnedMissing = false
}
