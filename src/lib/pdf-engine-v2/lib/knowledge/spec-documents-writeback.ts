/**
 * @file knowledge/spec-documents-writeback.ts — ingest a REAL datasheet PDF
 * into `pretraining_spec_documents` (source_type='datasheet') and populate
 * child `pretraining_extracted_specs` + `pretraining_extracted_standards`
 * rows from the extracted text.
 *
 * Distinct from the synthetic stubs created by library-writeback.ts
 * (source_type='distributor_cascade'). This module downloads a real PDF,
 * extracts text via pdftotext, runs an LLM extraction pass, and persists
 * the results atomically.
 *
 * API contract:
 *
 *   ingestSpecDocument({ datasheet_url, manufacturer, part_number? })
 *     → Promise<{ document_id: number; spec_count: number; standards_count: number }>
 *
 * Behaviour:
 *   1. Check whether this URL is already in pretraining_spec_documents
 *      (file_hash dedup OR source_url match). Return early if already ingested
 *      and extraction_status = 'done'.
 *   2. Download PDF to a temp file.
 *   3. Extract text via `pdftotext -layout` (already a dependency for
 *      layout audit gate 11).
 *   4. Run LLM extraction via ask_alt_llm (Flash-Lite — cheap, good at
 *      structured JSON extraction). Prompt extracts:
 *        - Array of {spec_key, spec_value, spec_unit, raw_excerpt} pairs
 *        - Array of {standard_name, scope, raw_excerpt} pairs
 *   5. INSERT spec_documents row (source_type='datasheet'), then batch
 *      INSERT OR IGNORE child rows into extracted_specs + extracted_standards.
 *   6. Returns { document_id, spec_count, standards_count }.
 *
 * Hard limits:
 *   - PDF size cap: 50 MB (avoids bloating the store with marketing PDFs)
 *   - Max specs per document: 200 (extraction prompt cap)
 *   - Max standards per document: 50
 *   - Timeout: 60s total (download 30s + extraction 30s)
 *
 * Skipped paths:
 *   - SKIP_LIBRARY_WRITEBACK=1
 *   - NODE_ENV === 'test'
 *   - Missing pdftotext binary (logs warning, returns zeros gracefully)
 *   - Missing forge-truth.db
 *
 * British spelling throughout.
 */

import Database from 'better-sqlite3'
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

// ── Constants ──────────────────────────────────────────────────────────────────
const DB_PATH = resolve(homedir(), '.forge-truth', 'forge-truth.db')
const SPEC_PDFS_DIR = resolve(homedir(), '.forge-truth', 'spec-pdfs')
const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024  // 50 MB
const MAX_SPECS_PER_DOC = 200
const MAX_STANDARDS_PER_DOC = 50
const EXTRACTION_MODEL = 'google/gemini-3.1-flash-lite'

// ── Module-scoped DB handle ───────────────────────────────────────────────────
let dbHandle: Database.Database | null | undefined = undefined
let warnedMissing = false

function getDb(): Database.Database | null {
  if (dbHandle !== undefined) return dbHandle
  if (process.env.SKIP_LIBRARY_WRITEBACK === '1' || process.env.NODE_ENV === 'test') {
    dbHandle = null
    return null
  }
  try {
    if (!existsSync(DB_PATH)) {
      if (!warnedMissing) {
        console.warn(`[spec-documents-writeback] forge-truth.db not found — writeback disabled`)
        warnedMissing = true
      }
      dbHandle = null
      return null
    }
    const db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 5000')

    // Add extracted_full_text column if it doesn't yet exist (migration)
    const cols = db.prepare(`PRAGMA table_info(pretraining_spec_documents)`).all() as Array<{ name: string }>
    if (!cols.find((c) => c.name === 'extracted_full_text')) {
      db.prepare(`ALTER TABLE pretraining_spec_documents ADD COLUMN extracted_full_text TEXT`).run()
      console.error(`[spec-documents-writeback] migrated: added extracted_full_text column to pretraining_spec_documents`)
    }

    // Dedup indices (idempotent). NOTE: pre-existing duplicate rows
    // (specs: 477 dup groups, standards: 227 dup groups as of 2026-05-26)
    // preclude UNIQUE indices. Dedup is enforced application-side via the
    // app-level pre-check pattern in specs-writeback.ts and
    // standards-writeback.ts. Inside this module we INSERT children in a
    // single transaction per newly-created spec_documents row, so
    // (document_id, spec_key) collisions cannot occur within one call.
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_specs_wb_dedup_nonunique ON pretraining_extracted_specs(document_id, spec_key)`).run()
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_standards_wb_dedup_nonunique ON pretraining_extracted_standards(document_id, standard_name)`).run()
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_spec_docs_source_url ON pretraining_spec_documents(source_url) WHERE source_url IS NOT NULL`).run()

    dbHandle = db
    return db
  } catch (err) {
    if (!warnedMissing) {
      console.warn(`[spec-documents-writeback] init failed: ${(err as Error).message} — writeback disabled`)
      warnedMissing = true
    }
    dbHandle = null
    return null
  }
}

// ── PDF download + text extraction ───────────────────────────────────────────

async function downloadPdf(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)
    const resp = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!resp.ok) return null
    const contentLength = Number(resp.headers.get('content-length') ?? 0)
    if (contentLength > MAX_PDF_SIZE_BYTES) {
      console.warn(`[spec-documents-writeback] PDF too large (${contentLength} bytes) at ${url} — skipped`)
      return null
    }
    const buf = Buffer.from(await resp.arrayBuffer())
    if (buf.length > MAX_PDF_SIZE_BYTES) return null
    return buf
  } catch (err) {
    console.warn(`[spec-documents-writeback] download failed for ${url}: ${(err as Error).message}`)
    return null
  }
}

function extractTextFromPdf(pdfBuffer: Buffer): string | null {
  try {
    // Check pdftotext availability
    execFileSync('which', ['pdftotext'], { stdio: 'ignore' })
  } catch {
    console.warn(`[spec-documents-writeback] pdftotext not found — text extraction unavailable`)
    return null
  }
  const tmpFile = join(tmpdir(), `forge-spec-${Date.now()}.pdf`)
  try {
    writeFileSync(tmpFile, pdfBuffer)
    const text = execFileSync('pdftotext', ['-layout', tmpFile, '-'], {
      encoding: 'utf-8',
      timeout: 20_000,
      maxBuffer: 10 * 1024 * 1024,
    })
    return text
  } catch (err) {
    console.warn(`[spec-documents-writeback] pdftotext failed: ${(err as Error).message}`)
    return null
  } finally {
    try { unlinkSync(tmpFile) } catch { /* no-op */ }
  }
}

// ── LLM extraction pass ───────────────────────────────────────────────────────

interface ExtractionResult {
  specs: Array<{ spec_key: string; spec_value: string; spec_unit: string; raw_excerpt: string }>
  standards: Array<{ standard_name: string; scope: string; raw_excerpt: string }>
}

async function extractSpecsAndStandards(
  text: string,
  manufacturer: string,
  partNumber: string | undefined,
): Promise<ExtractionResult> {
  if (!process.env.OPENROUTER_API_KEY) return { specs: [], standards: [] }

  const truncated = text.slice(0, 12_000)  // ~3K tokens to stay within budget
  const prompt =
    `You are a datasheet parser. Extract engineering specs and standards citations from this datasheet text for ${manufacturer}${partNumber ? ` part ${partNumber}` : ''}.

Return ONLY valid JSON (no markdown) with shape:
{
  "specs": [{"spec_key":"<snake_case_key>","spec_value":"<numeric or text>","spec_unit":"<unit>","raw_excerpt":"<verbatim sentence>"}],
  "standards": [{"standard_name":"<e.g. IEC 60947-4-1>","scope":"<what it covers>","raw_excerpt":"<verbatim sentence>"}]
}

Rules:
- spec_key MUST be snake_case (e.g. rated_voltage_dc_v, max_operating_temp_c, rated_current_a)
- Include at most ${MAX_SPECS_PER_DOC} specs and ${MAX_STANDARDS_PER_DOC} standards
- Do NOT invent values — only extract what is explicitly stated in the text
- If the text contains no specs or standards, return {"specs":[],"standards":[]}

Datasheet text:
${truncated}`

  try {
    const { callFastExtract } = await import('../openrouter-models')
    const raw = await callFastExtract(prompt, {
      model: EXTRACTION_MODEL,
      maxTokens: 4096,
      temperature: 0,
    })
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(jsonStr) as ExtractionResult
    return {
      specs: Array.isArray(parsed.specs) ? parsed.specs.slice(0, MAX_SPECS_PER_DOC) : [],
      standards: Array.isArray(parsed.standards) ? parsed.standards.slice(0, MAX_STANDARDS_PER_DOC) : [],
    }
  } catch (err) {
    console.warn(`[spec-documents-writeback] LLM extraction failed: ${(err as Error).message}`)
    return { specs: [], standards: [] }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface IngestResult {
  document_id: number
  spec_count: number
  standards_count: number
}

/**
 * Download a real datasheet PDF and ingest its specs + standards into the DB.
 * Never throws. Returns zeros on any failure.
 *
 * @param args.datasheet_url  Canonical URL of the manufacturer datasheet PDF
 * @param args.manufacturer   Manufacturer name
 * @param args.part_number    Optional part number
 */
export async function ingestSpecDocument(args: {
  datasheet_url: string
  manufacturer: string
  part_number?: string
}): Promise<IngestResult> {
  const { datasheet_url, manufacturer, part_number } = args
  const ZERO: IngestResult = { document_id: 0, spec_count: 0, standards_count: 0 }

  const db = getDb()
  if (!db) return ZERO

  try {
    // ── 1. Check for existing ingested document ────────────────────────
    const existing = db.prepare(`
      SELECT id, extraction_status FROM pretraining_spec_documents
      WHERE source_url = ? AND source_type = 'datasheet'
      LIMIT 1
    `).get(datasheet_url) as { id: number; extraction_status: string } | undefined

    if (existing?.extraction_status === 'done') {
      const specCount = (db.prepare(`SELECT COUNT(*) as n FROM pretraining_extracted_specs WHERE document_id = ?`).get(existing.id) as any)?.n ?? 0
      const stdCount = (db.prepare(`SELECT COUNT(*) as n FROM pretraining_extracted_standards WHERE document_id = ?`).get(existing.id) as any)?.n ?? 0
      console.error(`[spec-documents-writeback] already ingested: doc_id=${existing.id} specs=${specCount} standards=${stdCount}`)
      return { document_id: existing.id, spec_count: specCount, standards_count: stdCount }
    }

    // ── 2. Download PDF ────────────────────────────────────────────────
    const t0 = Date.now()
    const pdfBuf = await downloadPdf(datasheet_url)
    if (!pdfBuf) return ZERO

    const fileHash = createHash('sha256').update(pdfBuf).digest('hex')

    // Dedup by hash
    const byHash = db.prepare(`SELECT id FROM pretraining_spec_documents WHERE file_hash = ? LIMIT 1`).get(fileHash) as { id: number } | undefined
    if (byHash) {
      console.error(`[spec-documents-writeback] dedup by hash: doc_id=${byHash.id}`)
      return { document_id: byHash.id, spec_count: 0, standards_count: 0 }
    }

    // Persist PDF to disk
    try {
      mkdirSync(SPEC_PDFS_DIR, { recursive: true })
      const pdfPath = join(SPEC_PDFS_DIR, `${fileHash}.pdf`)
      if (!existsSync(pdfPath)) writeFileSync(pdfPath, pdfBuf)
    } catch { /* non-fatal */ }

    // ── 3. Extract text ────────────────────────────────────────────────
    const extractedText = extractTextFromPdf(pdfBuf)

    // ── 4. INSERT spec_documents row ───────────────────────────────────
    const nowIso = new Date().toISOString()
    const docResult = db.prepare(`
      INSERT INTO pretraining_spec_documents
        (source_type, manufacturer, product_name, source_url, document_type,
         pages, downloaded_at, file_hash, file_path, extraction_status,
         extracted_at, extracted_full_text)
      VALUES ('datasheet', ?, ?, ?, 'datasheet', NULL, ?, ?, ?, 'done', ?, ?)
    `).run(
      manufacturer,
      part_number ? `${manufacturer} ${part_number}` : manufacturer,
      datasheet_url,
      nowIso,
      fileHash,
      join(SPEC_PDFS_DIR, `${fileHash}.pdf`),
      nowIso,
      extractedText ? extractedText.slice(0, 50_000) : null,
    )
    const docId = Number(docResult.lastInsertRowid)

    if (!docId || !extractedText) {
      console.error(`[spec-documents-writeback] inserted doc_id=${docId} but no text extracted`)
      return { document_id: docId, spec_count: 0, standards_count: 0 }
    }

    // ── 5. LLM extraction pass ─────────────────────────────────────────
    const extracted = await extractSpecsAndStandards(extractedText, manufacturer, part_number)

    // ── 6. Batch INSERT child rows (transaction) ───────────────────────
    const insertSpec = db.prepare(`
      INSERT OR IGNORE INTO pretraining_extracted_specs (document_id, spec_key, spec_value, spec_unit, raw_excerpt)
      VALUES (?, ?, ?, ?, ?)
    `)
    const insertStandard = db.prepare(`
      INSERT OR IGNORE INTO pretraining_extracted_standards (document_id, standard_name, scope, raw_excerpt)
      VALUES (?, ?, ?, ?)
    `)

    let specCount = 0
    let standardsCount = 0

    const ingestTx = db.transaction(() => {
      for (const s of extracted.specs) {
        if (!s.spec_key || !s.spec_value) continue
        const r = insertSpec.run(docId, s.spec_key, s.spec_value, s.spec_unit ?? '', (s.raw_excerpt ?? '').slice(0, 1024))
        if (r.changes > 0) specCount++
      }
      for (const std of extracted.standards) {
        if (!std.standard_name) continue
        const r = insertStandard.run(docId, std.standard_name, std.scope ?? '', (std.raw_excerpt ?? '').slice(0, 1024))
        if (r.changes > 0) standardsCount++
      }
    })
    ingestTx()

    const latencyMs = Date.now() - t0
    console.error(`[spec-documents-writeback] ingested doc_id=${docId} specs=${specCount} standards=${standardsCount} latency_ms=${latencyMs} url=${datasheet_url}`)
    return { document_id: docId, spec_count: specCount, standards_count: standardsCount }
  } catch (err) {
    console.warn(`[spec-documents-writeback] ingestSpecDocument failed for ${datasheet_url}: ${(err as Error).message}`)
    return ZERO
  }
}

/** Test-only reset hook */
export function _resetForTests(): void {
  if (dbHandle) {
    try { dbHandle.close() } catch { /* no-op */ }
  }
  dbHandle = undefined
  warnedMissing = false
}
