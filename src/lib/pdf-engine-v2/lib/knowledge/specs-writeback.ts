/**
 * @file knowledge/specs-writeback.ts — DB-first lookup + web-search
 * fallback + INSERT OR IGNORE writeback for `pretraining_extracted_specs`.
 *
 * Closes the gap documented in drawer `forgeos_gotchas_25df555e549213ca`:
 * the chain previously read BAKED 2026-05-18 TypeScript snapshots; the
 * 15,027-row pretraining_extracted_specs table had ZERO INSERT paths.
 *
 * API contract — mirrors library-writeback.ts "DB-first → web-search on
 * miss → INSERT OR IGNORE → grows over time":
 *
 *   lookupSpec({ manufacturer, part_number, spec_key, hint_url? })
 *     → Promise<{ value: string; unit: string; source: 'db' | 'web' | null }>
 *
 * Behaviour:
 *   1. DB-first: JOIN pretraining_extracted_specs + pretraining_spec_documents
 *      WHERE source_type IN ('datasheet','manufacturer','distributor_cascade',
 *      'web_extracted') AND spec_key = ? AND <part match via document columns>.
 *      Returns on hit.
 *   2. Web-search fallback via ask_alt_llm (gpt-4.1-mini web-search-enabled
 *      model). Prompt asks for the specific spec + cites a URL.
 *   3. On web hit, INSERT synthetic spec_documents stub
 *      (source_type='web_extracted') + INSERT OR IGNORE into
 *      pretraining_extracted_specs keyed on (document_id, spec_key).
 *   4. On web miss, returns { value: '', unit: '', source: null }.
 *   5. Structured audit log per lookup: spec_key, part_number, hit, latency_ms.
 *
 * Skipped paths:
 *   - SKIP_LIBRARY_WRITEBACK=1 (tests, dry-runs)
 *   - NODE_ENV === 'test'
 *   - Missing forge-truth.db (graceful log + no-op)
 *   - Web search disabled: SKIP_SPECS_WEB_SEARCH=1 (chain-only dry-runs)
 *
 * TTL: 30-day TTL on web-extracted rows (source_url + extracted_at tracked
 * in spec_documents). Re-query if extracted_at < 30d ago.
 *
 * British spelling throughout.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

// ── Constants ──────────────────────────────────────────────────────────────────
const DB_PATH = resolve(homedir(), '.forge-truth', 'forge-truth.db')
const TTL_WEB_EXTRACTED_DAYS = 30

// ── Module-scoped DB handle (lazy-init, singleton per process) ────────────────
let dbHandle: Database.Database | null | undefined = undefined
let warnedMissing = false

// ── Prepared statements (lazy-init, reused per process) ──────────────────────
let stmtLookup: Database.Statement | null = null
let stmtInsertDoc: Database.Statement | null = null
let stmtInsertSpec: Database.Statement | null = null
let stmtExistsSpec: Database.Statement | null = null

function getDb(): Database.Database | null {
  if (dbHandle !== undefined) return dbHandle
  if (process.env.SKIP_LIBRARY_WRITEBACK === '1' || process.env.NODE_ENV === 'test') {
    dbHandle = null
    return null
  }
  try {
    if (!existsSync(DB_PATH)) {
      if (!warnedMissing) {
        console.warn(`[specs-writeback] forge-truth.db not found at ${DB_PATH} — writeback disabled`)
        warnedMissing = true
      }
      dbHandle = null
      return null
    }
    const db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 2000')

    // Ensure dedup index exists — idempotent
    db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_specs_wb_dedup
        ON pretraining_extracted_specs(document_id, spec_key)
    `).run()

    stmtLookup = db.prepare(`
      SELECT s.spec_value, s.spec_unit, s.raw_excerpt, d.source_url, d.extracted_at
      FROM pretraining_extracted_specs s
      JOIN pretraining_spec_documents d ON s.document_id = d.id
      WHERE d.source_type IN ('datasheet','manufacturer','distributor_cascade','web_extracted')
        AND LOWER(s.spec_key) = LOWER(?)
        AND (
          LOWER(COALESCE(d.manufacturer,'')) LIKE LOWER('%' || ? || '%')
          OR LOWER(COALESCE(d.product_name,'')) LIKE LOWER('%' || ? || '%')
        )
      ORDER BY
        CASE d.source_type
          WHEN 'datasheet' THEN 0
          WHEN 'manufacturer' THEN 1
          WHEN 'distributor_cascade' THEN 2
          ELSE 3
        END ASC
      LIMIT 1
    `)

    stmtInsertDoc = db.prepare(`
      INSERT INTO pretraining_spec_documents
        (source_type, product_class, manufacturer, product_name, source_url,
         document_type, extraction_status, extracted_at)
      VALUES ('web_extracted', NULL, ?, ?, ?, 'web_search_result', 'done', ?)
    `)

    stmtInsertSpec = db.prepare(`
      INSERT OR IGNORE INTO pretraining_extracted_specs
        (document_id, spec_key, spec_value, spec_unit, raw_excerpt)
      VALUES (?, ?, ?, ?, ?)
    `)

    dbHandle = db
    return db
  } catch (err) {
    if (!warnedMissing) {
      console.warn(`[specs-writeback] init failed: ${(err as Error).message} — writeback disabled`)
      warnedMissing = true
    }
    dbHandle = null
    return null
  }
}

// ── Web search fallback ───────────────────────────────────────────────────────

interface WebSpecResult {
  value: string
  unit: string
  source_url: string
  raw_excerpt: string
}

async function searchSpecOnWeb(args: {
  manufacturer: string
  part_number: string
  spec_key: string
  hint_url?: string
}): Promise<WebSpecResult | null> {
  if (process.env.SKIP_SPECS_WEB_SEARCH === '1') return null
  if (!process.env.OPENROUTER_API_KEY) return null

  const { manufacturer, part_number, spec_key, hint_url } = args
  const hintClause = hint_url ? ` (check this datasheet URL first: ${hint_url})` : ''
  const prompt =
    `You are an engineering datasheet lookup assistant. Return ONLY a JSON object with no markdown.
Find the authoritative value for: manufacturer="${manufacturer}", part_number="${part_number}", spec_key="${spec_key}".${hintClause}
Search manufacturer datasheets, Octopart, Mouser, Digi-Key, or official product pages.
Return: {"value":"<numeric or text value>","unit":"<unit string>","source_url":"<URL where you found it>","raw_excerpt":"<verbatim sentence from datasheet>"}
If you cannot find an authoritative value, return: {"value":"","unit":"","source_url":"","raw_excerpt":"not found"}`

  try {
    const t0 = Date.now()
    const { callFastExtract } = await import('../openrouter-models')
    const raw = await callFastExtract(prompt, {
      model: WEB_SEARCH_MODEL,
      maxTokens: 512,
      temperature: 0,
      groundWithGoogleSearch: true,
    })
    const latencyMs = Date.now() - t0
    console.error(`[specs-writeback] web search: ${manufacturer} ${part_number} ${spec_key} — ${latencyMs}ms`)

    // Strip markdown fences if present
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    let parsed: any
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      return null
    }
    if (!parsed.value || parsed.value === 'not found' || parsed.raw_excerpt === 'not found') return null
    return {
      value: String(parsed.value),
      unit: String(parsed.unit ?? ''),
      source_url: String(parsed.source_url ?? ''),
      raw_excerpt: String(parsed.raw_excerpt ?? '').slice(0, 1024),
    }
  } catch (err) {
    console.warn(`[specs-writeback] web search failed: ${(err as Error).message}`)
    return null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SpecLookupResult {
  value: string
  unit: string
  source: 'db' | 'web' | null
}

/**
 * DB-first lookup with web-search fallback + writeback.
 * Never throws. Returns { source: null } when both paths miss.
 *
 * @param args.manufacturer  Manufacturer name (e.g. 'Schaltbau')
 * @param args.part_number   Part number as emitted (e.g. 'C310K/500')
 * @param args.spec_key      Canonical spec key (e.g. 'rated_voltage_dc_v')
 * @param args.hint_url      Optional datasheet URL for the web-search prompt
 */
export async function lookupSpec(args: {
  manufacturer: string
  part_number: string
  spec_key: string
  hint_url?: string
}): Promise<SpecLookupResult> {
  const { manufacturer, part_number, spec_key, hint_url } = args
  const t0 = Date.now()

  // ── 1. DB-first ──────────────────────────────────────────────────────
  const db = getDb()
  if (db && stmtLookup) {
    try {
      const row = stmtLookup.get(spec_key, manufacturer, part_number) as
        | { spec_value: string; spec_unit: string; raw_excerpt: string; source_url: string | null; extracted_at: string | null }
        | undefined

      if (row && row.spec_value) {
        // Check TTL for web_extracted rows
        const shouldSkip = (() => {
          if (!row.extracted_at) return false
          const age = Date.now() - new Date(row.extracted_at).getTime()
          return age > TTL_WEB_EXTRACTED_DAYS * 24 * 60 * 60 * 1000
        })()

        if (!shouldSkip) {
          const latencyMs = Date.now() - t0
          console.error(`[specs-writeback] ${JSON.stringify({ spec_key, part_number, hit: 'db', latency_ms: latencyMs })}`)
          return { value: row.spec_value, unit: row.spec_unit ?? '', source: 'db' }
        }
      }
    } catch (err) {
      console.warn(`[specs-writeback] DB lookup failed: ${(err as Error).message}`)
    }
  }

  // ── 2. Web-search fallback ───────────────────────────────────────────
  const webResult = await searchSpecOnWeb({ manufacturer, part_number, spec_key, hint_url })
  const latencyMs = Date.now() - t0

  if (!webResult || !webResult.value) {
    console.error(`[specs-writeback] ${JSON.stringify({ spec_key, part_number, hit: 'miss', latency_ms: latencyMs })}`)
    return { value: '', unit: '', source: null }
  }

  // ── 3. Writeback ─────────────────────────────────────────────────────
  if (db && stmtInsertDoc && stmtInsertSpec) {
    try {
      const nowIso = new Date().toISOString()
      const docResult = stmtInsertDoc.run(
        manufacturer,
        `${manufacturer} ${part_number}`,
        webResult.source_url || null,
        nowIso,
      )
      const docId = Number(docResult.lastInsertRowid)
      if (docId > 0) {
        stmtInsertSpec.run(
          docId,
          spec_key,
          webResult.value,
          webResult.unit,
          // Embed source URL in raw_excerpt per datasheet-citation discipline
          `${webResult.raw_excerpt} [source: ${webResult.source_url}]`.slice(0, 1024),
        )
      }
    } catch (err) {
      // Fire-and-forget — never block the chain
      console.warn(`[specs-writeback] writeback failed for ${manufacturer}|${part_number}|${spec_key}: ${(err as Error).message}`)
    }
  }

  console.error(`[specs-writeback] ${JSON.stringify({ spec_key, part_number, hit: 'web', latency_ms: latencyMs, source_url: webResult.source_url })}`)
  return { value: webResult.value, unit: webResult.unit, source: 'web' }
}

/** Test-only reset hook */
export function _resetForTests(): void {
  if (dbHandle) {
    try { dbHandle.close() } catch { /* no-op */ }
  }
  dbHandle = undefined
  stmtLookup = null
  stmtInsertDoc = null
  stmtInsertSpec = null
  warnedMissing = false
}
