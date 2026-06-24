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
import { createHash } from 'node:crypto'
import { dualSearch } from '../retrieval/dual-search'

// ── Constants ──────────────────────────────────────────────────────────────────
const DB_PATH = resolve(homedir(), '.forge-truth', 'forge-truth.db')
const TTL_WEB_EXTRACTED_DAYS = 30

// ── Embedding (text-embedding-3-small, 1536-d, Float32LE BLOB) ───────────────
// MIRRORS library-writeback.ts:52-81 (recordDistributorHit) EXACTLY so a
// web-discovered standard row is retrievable by the same hybrid (dual-search.ts)
// cosine query the moment it is written — without this the INSERT lands
// embedding=NULL and the row stays search-invisible until the MANUAL
// scripts/ingest/backfill-embeddings.ts runs (the audited 2026-06-04 gap, P1).
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
        (document_id, standard_name, scope, raw_excerpt, embedding, embed_hash)
      VALUES (?, ?, ?, ?, ?, ?)
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
    // VERIFY-BEFORE-WRITEBACK (Tristan 2026-06-24): require a real authoritative URL + a verbatim
    // excerpt that references the standard NUMBER — so a fabricated "scope" for a standard the LLM
    // can't actually cite is not persisted. value = standard_name (the number, e.g. "62619", must
    // appear in the cited sentence).
    const { isVerifiedWebExtraction } = await import('./web-extraction-verify')
    const verdict = isVerifiedWebExtraction({ value: standard_name, source_url: String(parsed.source_url ?? ''), raw_excerpt: String(parsed.raw_excerpt ?? ''), requireValueInExcerpt: true })
    if (!verdict.ok) {
      console.error(`[standards-writeback] REJECTED unverified web standard ${standard_name}: ${verdict.reason}`)
      return null
    }
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

// ── Hybrid (lexical + semantic) DB read ───────────────────────────────────────
//
// Routes the standards read through the shared dualSearch (the P2/P3 audit fix).
// Fired AFTER the exact + LIKE keyed lookups miss, BEFORE the web search: now
// that the writeback embeds on insert (P1), a standard written under a reworded
// name ("BS EN 62619" vs "IEC 62619") is reachable semantically. Lexical arm over
// [standard_name, scope] + cosine arm over the same-table f32le_blob embedding,
// RRF-fused. PRECISION GUARD: a fused hit is accepted only when its standard_name
// NORMALISES (case + non-alphanumerics stripped) to contain, or be contained by,
// the requested name — so "IEC 62619" matches "IEC62619" / "BS EN 62619" but never
// an unrelated standard.
function normaliseStandardName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

async function hybridLookupStandard(args: {
  standard_name: string
  product_class?: string
}): Promise<{ scope: string; raw_excerpt: string } | null> {
  const { standard_name, product_class } = args
  if (!existsSync(DB_PATH)) return null
  const queryText = [standard_name, product_class].filter(Boolean).join(' ')
  const wantNorm = normaliseStandardName(standard_name)
  if (!wantNorm) return null
  try {
    const res = await dualSearch<{
      id: number
      standard_name: string | null
      scope: string | null
      raw_excerpt: string | null
    }>({
      table: 'pretraining_extracted_standards',
      idColumn: 'id',
      lexicalCols: ['standard_name', 'scope'],
      selectCols: ['raw_excerpt'],
      embedding: {
        table: 'pretraining_extracted_standards',
        column: 'embedding',
        format: 'f32le_blob',
        joinColumn: 'id',
      },
      queryText,
      k: 8,
      where: `embedding IS NOT NULL AND (scope IS NOT NULL OR raw_excerpt IS NOT NULL)`,
      dbPath: DB_PATH,
    })
    for (const hit of res.hits) {
      const row = hit.row
      const gotNorm = normaliseStandardName(row.standard_name ?? '')
      if (!gotNorm) continue
      // Containment in either direction handles "IEC62619" ↔ "BSEN62619".
      if ((gotNorm.includes(wantNorm) || wantNorm.includes(gotNorm)) && (row.scope || row.raw_excerpt)) {
        return {
          scope: String(row.scope ?? ''),
          raw_excerpt: String(row.raw_excerpt ?? ''),
        }
      }
    }
  } catch (err) {
    console.warn(`[standards-writeback] hybrid lookup failed: ${(err as Error).message}`)
  }
  return null
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

  // ── 1b. Hybrid DB read (lexical+semantic, RRF-fused) ─────────────────
  // The exact + LIKE keyed lookups missed; try the shared dualSearch over the
  // embedded standards rows before paying for a web search (P2/P3 audit fix).
  // Normalised-name containment guarded so a reworded-name hit is the SAME
  // standard, never an unrelated one.
  {
    const hybrid = await hybridLookupStandard({ standard_name, product_class })
    if (hybrid && (hybrid.scope || hybrid.raw_excerpt)) {
      const latencyMs = Date.now() - t0
      console.error(`[standards-writeback] ${JSON.stringify({ standard_name, hit: 'db_hybrid', latency_ms: latencyMs })}`)
      return { scope: hybrid.scope, raw_excerpt: hybrid.raw_excerpt, source: 'db' }
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
          // Embed-on-write (P1): the standard's natural text = scope + name + excerpt.
          // Computed BEFORE the INSERT so the row is hybrid-searchable (dual-search.ts
          // f32le_blob) immediately. Degrades to NULL-embedded only when OPENAI_API_KEY
          // is absent / the embed call fails (backfill-embeddings.ts sweeps those).
          const embedSource = [webResult.scope, standard_name, webResult.raw_excerpt].filter(Boolean).join(' ')
          const embedding = await embedText(embedSource)
          const embedHash = embedding ? embedHashOf(embedSource) : null
          stmtInsertStandard.run(
            docId,
            standard_name,
            webResult.scope,
            webResult.raw_excerpt,
            embedding,   // 1536-d Float32LE BLOB (nullable — graceful)
            embedHash,   // sha256(embed_source) prefix
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
