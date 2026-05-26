/**
 * @file knowledge/standards-writeback.ts — DB-first lookup + web-search
 * fallback + INSERT OR IGNORE writeback for `pretraining_extracted_standards`.
 *
 * Closes the gap documented in drawer `forgeos_gotchas_25df555e549213ca`:
 * the 4,094-row pretraining_extracted_standards table had ZERO INSERT paths.
 *
 * API contract:
 *
 *   lookupStandard({ standard_name, product_class? })
 *     → Promise<{ scope: string; raw_excerpt: string; source: 'db' | 'web' | null }>
 *
 * Behaviour:
 *   1. DB-first: query pretraining_extracted_standards JOIN
 *      pretraining_spec_documents WHERE standard_name matches (exact then
 *      LIKE). Returns on hit.
 *   2. Web-search fallback via OpenRouter web-search-enabled model.
 *      Domain-restricted to BSI, IEC, NFPA, UL, ISO publication pages.
 *   3. On web hit, INSERT synthetic spec_documents stub + INSERT OR IGNORE
 *      into pretraining_extracted_standards keyed on (document_id,
 *      standard_name).
 *   4. On web miss, returns { scope: '', raw_excerpt: '', source: null }.
 *   5. Structured audit log per lookup.
 *
 * 30-day TTL on web_extracted rows (same pattern as specs-writeback.ts).
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

// ── Module-scoped DB handle ───────────────────────────────────────────────────
let dbHandle: Database.Database | null | undefined = undefined
let warnedMissing = false
let stmtLookupExact: Database.Statement | null = null
let stmtLookupLike: Database.Statement | null = null
let stmtInsertDoc: Database.Statement | null = null
let stmtInsertStandard: Database.Statement | null = null
let stmtExistsStandard: Database.Statement | null = null

function getDb(): Database.Database | null {
  if (dbHandle !== undefined) return dbHandle
  if (process.env.SKIP_LIBRARY_WRITEBACK === '1' || process.env.NODE_ENV === 'test') {
    dbHandle = null
    return null
  }
  try {
    if (!existsSync(DB_PATH)) {
      if (!warnedMissing) {
        console.warn(`[standards-writeback] forge-truth.db not found at ${DB_PATH} — writeback disabled`)
        warnedMissing = true
      }
      dbHandle = null
      return null
    }
    const db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 2000')

    // NOTE: pre-existing duplicates in pretraining_extracted_standards
    // (227 dup groups as of 2026-05-26) preclude a UNIQUE index. Dedup is
    // enforced application-side via stmtExistsStandard pre-check below.
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_standards_wb_dedup_nonunique
        ON pretraining_extracted_standards(document_id, standard_name)
    `).run()

    stmtLookupExact = db.prepare(`
      SELECT st.scope, st.raw_excerpt, d.extracted_at
      FROM pretraining_extracted_standards st
      JOIN pretraining_spec_documents d ON st.document_id = d.id
      WHERE LOWER(st.standard_name) = LOWER(?)
        AND (? IS NULL OR d.product_class IS NULL OR LOWER(d.product_class) LIKE LOWER('%' || ? || '%'))
      ORDER BY
        CASE d.source_type
          WHEN 'datasheet' THEN 0
          WHEN 'manufacturer' THEN 1
          ELSE 2
        END ASC
      LIMIT 1
    `)

    stmtLookupLike = db.prepare(`
      SELECT st.scope, st.raw_excerpt, d.extracted_at
      FROM pretraining_extracted_standards st
      JOIN pretraining_spec_documents d ON st.document_id = d.id
      WHERE LOWER(st.standard_name) LIKE LOWER('%' || ? || '%')
        AND (? IS NULL OR d.product_class IS NULL OR LOWER(d.product_class) LIKE LOWER('%' || ? || '%'))
      ORDER BY LENGTH(st.standard_name) ASC
      LIMIT 1
    `)

    stmtInsertDoc = db.prepare(`
      INSERT INTO pretraining_spec_documents
        (source_type, product_class, manufacturer, product_name, source_url,
         document_type, extraction_status, extracted_at)
      VALUES ('web_extracted', ?, NULL, ?, ?, 'standards_publication', 'done', ?)
    `)

    stmtInsertStandard = db.prepare(`
      INSERT INTO pretraining_extracted_standards
        (document_id, standard_name, scope, raw_excerpt)
      VALUES (?, ?, ?, ?)
    `)

    // App-side dedup pre-check (UNIQUE index not allowed; see comment above)
    stmtExistsStandard = db.prepare(`
      SELECT 1 FROM pretraining_extracted_standards
      WHERE document_id = ? AND standard_name = ?
      LIMIT 1
    `)

    dbHandle = db
    return db
  } catch (err) {
    if (!warnedMissing) {
      console.warn(`[standards-writeback] init failed: ${(err as Error).message} — writeback disabled`)
      warnedMissing = true
    }
    dbHandle = null
    return null
  }
}

// ── Web search fallback ───────────────────────────────────────────────────────

interface WebStandardResult {
  scope: string
  raw_excerpt: string
  source_url: string
}

async function searchStandardOnWeb(args: {
  standard_name: string
  product_class?: string
}): Promise<WebStandardResult | null> {
  if (process.env.SKIP_SPECS_WEB_SEARCH === '1') return null
  if (!process.env.OPENROUTER_API_KEY) return null

  const { standard_name, product_class } = args
  const classHint = product_class ? ` (relevant product class: ${product_class})` : ''
  const prompt =
    `You are a standards research assistant. Return ONLY a JSON object with no markdown.
Look up the standard: "${standard_name}"${classHint}.
Search BSI (bsigroup.com), IEC (iec.ch), NFPA (nfpa.org), UL (ul.com), ISO (iso.org), or IEEE publication pages.
Return: {"scope":"<one sentence describing what the standard covers>","raw_excerpt":"<verbatim sentence from the standard or its abstract>","source_url":"<URL of the publication page>"}
If you cannot find the standard, return: {"scope":"","raw_excerpt":"not found","source_url":""}`

  try {
    const t0 = Date.now()
    const { callFastExtract } = await import('../openrouter-models')
    // NOTE: groundWithGoogleSearch only takes effect on Gemini 3.1 Flash-Lite
    // (the default model in callFastExtract). Do NOT pass a model override.
    const raw = await callFastExtract(prompt, {
      maxTokens: 512,
      temperature: 0,
      thinkingLevel: 'low',
      groundWithGoogleSearch: true,
    })
    const latencyMs = Date.now() - t0
    console.error(`[standards-writeback] web search: ${standard_name} — ${latencyMs}ms`)

    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    let parsed: any
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      return null
    }
    if (!parsed.scope || parsed.raw_excerpt === 'not found') return null
    return {
      scope: String(parsed.scope).slice(0, 512),
      raw_excerpt: `${String(parsed.raw_excerpt ?? '').slice(0, 900)} [source: ${parsed.source_url ?? ''}]`.slice(0, 1024),
      source_url: String(parsed.source_url ?? ''),
    }
  } catch (err) {
    console.warn(`[standards-writeback] web search failed: ${(err as Error).message}`)
    return null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface StandardLookupResult {
  scope: string
  raw_excerpt: string
  source: 'db' | 'web' | null
}

/**
 * DB-first lookup of a regulatory standard with web-search fallback + writeback.
 * Never throws. Returns { source: null } when both paths miss.
 *
 * @param args.standard_name  Standard code (e.g. 'IEC 62933-5-2', 'BS 7671')
 * @param args.product_class  Optional product class for scope-filtered lookups
 */
export async function lookupStandard(args: {
  standard_name: string
  product_class?: string
}): Promise<StandardLookupResult> {
  const { standard_name, product_class } = args
  const t0 = Date.now()

  // ── 1. DB-first (exact match, then LIKE) ──────────────────────────────
  const db = getDb()
  if (db && stmtLookupExact && stmtLookupLike) {
    try {
      const classArg = product_class ?? null
      let row = stmtLookupExact.get(standard_name, classArg, classArg) as
        | { scope: string; raw_excerpt: string; extracted_at: string | null }
        | undefined

      if (!row) {
        row = stmtLookupLike.get(standard_name, classArg, classArg) as typeof row
      }

      if (row && (row.scope || row.raw_excerpt)) {
        const shouldSkip = (() => {
          if (!row.extracted_at) return false
          const age = Date.now() - new Date(row.extracted_at).getTime()
          return age > TTL_WEB_EXTRACTED_DAYS * 24 * 60 * 60 * 1000
        })()

        if (!shouldSkip) {
          const latencyMs = Date.now() - t0
          console.error(`[standards-writeback] ${JSON.stringify({ standard_name, hit: 'db', latency_ms: latencyMs })}`)
          return { scope: row.scope ?? '', raw_excerpt: row.raw_excerpt ?? '', source: 'db' }
        }
      }
    } catch (err) {
      console.warn(`[standards-writeback] DB lookup failed: ${(err as Error).message}`)
    }
  }

  // ── 2. Web-search fallback ───────────────────────────────────────────
  const webResult = await searchStandardOnWeb({ standard_name, product_class })
  const latencyMs = Date.now() - t0

  if (!webResult || !webResult.scope) {
    console.error(`[standards-writeback] ${JSON.stringify({ standard_name, hit: 'miss', latency_ms: latencyMs })}`)
    return { scope: '', raw_excerpt: '', source: null }
  }

  // ── 3. Writeback ─────────────────────────────────────────────────────
  if (db && stmtInsertDoc && stmtInsertStandard && stmtExistsStandard) {
    try {
      const nowIso = new Date().toISOString()
      const docResult = stmtInsertDoc.run(
        product_class ?? null,
        standard_name,
        webResult.source_url || null,
        nowIso,
      )
      const docId = Number(docResult.lastInsertRowid)
      if (docId > 0) {
        // App-side dedup: never insert duplicate (document_id, standard_name).
        // Since each call creates a fresh spec_documents stub, the duplicate
        // case here is theoretical — but the guard remains in case the writer
        // is invoked twice in the same process for the same standard.
        const exists = stmtExistsStandard.get(docId, standard_name) as { 1: number } | undefined
        if (!exists) {
          stmtInsertStandard.run(
            docId,
            standard_name,
            webResult.scope,
            webResult.raw_excerpt,
          )
        }
      }
    } catch (err) {
      console.warn(`[standards-writeback] writeback failed for ${standard_name}: ${(err as Error).message}`)
    }
  }

  console.error(`[standards-writeback] ${JSON.stringify({ standard_name, hit: 'web', latency_ms: latencyMs })}`)
  return { scope: webResult.scope, raw_excerpt: webResult.raw_excerpt, source: 'web' }
}

/** Test-only reset hook */
export function _resetForTests(): void {
  if (dbHandle) {
    try { dbHandle.close() } catch { /* no-op */ }
  }
  dbHandle = undefined
  stmtLookupExact = null
  stmtLookupLike = null
  stmtInsertDoc = null
  stmtInsertStandard = null
  stmtExistsStandard = null
  warnedMissing = false
}
