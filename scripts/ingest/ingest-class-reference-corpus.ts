/**
 * @file ingest-class-reference-corpus.ts
 * @description Ingest a class-reference seed (literature + optional PDFs) into
 *   forge-truth.db with hybrid search support (extracted_full_text + FTS5).
 *
 * INTENT (2026-07-29): Universal rail — every product class gets a seed JSON.
 * Gold imagery URLs are recorded as document stubs (no illegal scrape of press
 * binary assets). Direct PDFs are downloaded to ~/.forge-truth/spec-pdfs and
 * text-extracted. Specs from `key_extracts` are written deterministically so
 * regulations work without an LLM. dualSearch / FTS then find them at design time.
 *
 * Usage:
 *   npx tsx scripts/ingest/ingest-class-reference-corpus.ts formula_e_rear_mgu
 *   npx tsx scripts/ingest/ingest-class-reference-corpus.ts --all
 *   npx tsx scripts/ingest/ingest-class-reference-corpus.ts --selftest
 */

import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const DB_PATH = resolve(homedir(), '.forge-truth', 'forge-truth.db')
const SPEC_PDFS_DIR = resolve(homedir(), '.forge-truth', 'spec-pdfs')
const SEEDS_DIR = resolve(__dirname, 'class-reference-seeds')
const MAX_PDF_BYTES = 50 * 1024 * 1024

interface LitEntry {
  id?: string
  title: string
  org?: string
  year?: number
  url: string
  document_type?: string
  pdf_direct?: boolean
  key_extracts?: string[]
  contributes?: string[]
}

interface GoldEntry {
  id?: string
  url: string
  owner?: string
  year?: number
  view_role?: string
  teaches?: string
  access?: string
}

interface ClassSeed {
  product_class: string
  literature?: LitEntry[]
  gold_imagery?: GoldEntry[]
  visual_invariants?: string[]
  search_hints?: string[]
}

function ensureSchema(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(pretraining_spec_documents)`).all() as Array<{ name: string }>
  if (!cols.find((c) => c.name === 'extracted_full_text')) {
    db.prepare(`ALTER TABLE pretraining_spec_documents ADD COLUMN extracted_full_text TEXT`).run()
    console.info('[class-ref-ingest] migrated: added extracted_full_text')
  }
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS pretraining_spec_documents_fts
    USING fts5(
      document_id UNINDEXED,
      product_class,
      title,
      body,
      tokenize = 'porter unicode61'
    );
  `)
}

function extractPdfText(buf: Buffer): string {
  const tmp = join(tmpdir(), `cls-ref-${Date.now()}.pdf`)
  try {
    writeFileSync(tmp, buf)
    const text = execFileSync('pdftotext', ['-layout', '-q', tmp, '-'], {
      encoding: 'utf-8',
      maxBuffer: 20 * 1024 * 1024,
      timeout: 60_000,
    })
    return String(text || '')
  } catch (err) {
    console.warn('[class-ref-ingest] pdftotext failed:',
      err instanceof Error ? err.message : err)
    return ''
  } finally {
    try { unlinkSync(tmp) } catch { /* ignore */ }
  }
}

async function fetchUrl(url: string): Promise<{ kind: 'pdf' | 'html'; buf: Buffer } | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 45_000)
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'ForgeOS-class-reference-ingest/1.0 (public corpus; research)' },
      redirect: 'follow',
    })
    clearTimeout(t)
    if (!res.ok) {
      console.warn(`[class-ref-ingest] HTTP ${res.status} for ${url}`)
      return null
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    const ab = await res.arrayBuffer()
    const buf = Buffer.from(ab)
    if (buf.length > MAX_PDF_BYTES) {
      console.warn(`[class-ref-ingest] skip oversized ${buf.length} bytes: ${url}`)
      return null
    }
    if (ct.includes('pdf') || url.toLowerCase().endsWith('.pdf') || buf.slice(0, 4).toString() === '%PDF') {
      return { kind: 'pdf', buf }
    }
    return { kind: 'html', buf }
  } catch (err) {
    console.warn('[class-ref-ingest] fetch failed:', url,
      err instanceof Error ? err.message : err)
    return null
  }
}

function upsertDocument(
  db: Database.Database,
  args: {
    productClass: string
    sourceType: string
    documentType: string
    manufacturer: string
    productName: string
    sourceUrl: string
    fullText: string | null
    fileHash: string | null
    filePath: string | null
    keyExtracts: string[]
  },
): number {
  const existing = db.prepare(`
    SELECT id FROM pretraining_spec_documents WHERE source_url = ? LIMIT 1
  `).get(args.sourceUrl) as { id: number } | undefined

  const now = new Date().toISOString()
  let docId: number
  if (existing) {
    docId = existing.id
    db.prepare(`
      UPDATE pretraining_spec_documents
      SET product_class = ?, document_type = ?, extracted_full_text = COALESCE(?, extracted_full_text),
          extraction_status = 'done', extracted_at = ?, manufacturer = ?, product_name = ?
      WHERE id = ?
    `).run(
      args.productClass,
      args.documentType,
      args.fullText ? args.fullText.slice(0, 80_000) : null,
      now,
      args.manufacturer,
      args.productName,
      docId,
    )
  } else {
    const r = db.prepare(`
      INSERT INTO pretraining_spec_documents
        (product_class, manufacturer, product_name, source_url, document_type,
         downloaded_at, file_hash, file_path, extraction_status, extracted_at,
         extracted_full_text, source_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'done', ?, ?, ?)
    `).run(
      args.productClass,
      args.manufacturer,
      args.productName,
      args.sourceUrl,
      args.documentType,
      now,
      args.fileHash,
      args.filePath,
      now,
      args.fullText ? args.fullText.slice(0, 80_000) : null,
      args.sourceType,
    )
    docId = Number(r.lastInsertRowid)
  }

  const insertSpec = db.prepare(`
    INSERT OR IGNORE INTO pretraining_extracted_specs
      (document_id, spec_key, spec_value, spec_unit, raw_excerpt)
    VALUES (?, ?, ?, ?, ?)
  `)
  for (const ex of args.keyExtracts) {
    const key = ex.slice(0, 80).replace(/\s+/g, '_').toLowerCase()
    insertSpec.run(docId, `class_ref:${key}`, ex, null, ex)
  }

  // Refresh FTS row
  db.prepare(`DELETE FROM pretraining_spec_documents_fts WHERE document_id = ?`).run(docId)
  db.prepare(`
    INSERT INTO pretraining_spec_documents_fts (document_id, product_class, title, body)
    VALUES (?, ?, ?, ?)
  `).run(
    docId,
    args.productClass,
    args.productName,
    [args.productName, args.fullText || '', ...args.keyExtracts].join('\n').slice(0, 100_000),
  )
  return docId
}

async function ingestSeed(productClass: string): Promise<{ docs: number; pdfs: number }> {
  const path = join(SEEDS_DIR, `${productClass}.json`)
  if (!existsSync(path)) throw new Error(`missing seed: ${path}`)
  const seed = JSON.parse(readFileSync(path, 'utf-8')) as ClassSeed
  if (seed.product_class !== productClass) {
    throw new Error(`seed product_class mismatch: ${seed.product_class}`)
  }
  if (!existsSync(DB_PATH)) throw new Error(`forge-truth.db missing at ${DB_PATH}`)

  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  ensureSchema(db)
  mkdirSync(SPEC_PDFS_DIR, { recursive: true })

  let docs = 0
  let pdfs = 0

  // Persist visual invariants as a synthetic literature stub (searchable).
  if (seed.visual_invariants?.length) {
    const body = [
      `Class reference visual invariants for ${productClass}`,
      ...(seed.visual_invariants || []),
      ...(seed.search_hints || []),
    ].join('\n')
    upsertDocument(db, {
      productClass,
      sourceType: 'class_reference_seed',
      documentType: 'report',
      manufacturer: 'ForgeOS class-reference',
      productName: `${productClass} visual invariants (FFF training)`,
      sourceUrl: `internal://class-reference/${productClass}/visual_invariants`,
      fullText: body,
      fileHash: null,
      filePath: null,
      keyExtracts: seed.visual_invariants,
    })
    docs++
  }

  for (const lit of seed.literature || []) {
    let fullText: string | null = null
    let fileHash: string | null = null
    let filePath: string | null = null
    if (lit.pdf_direct) {
      const got = await fetchUrl(lit.url)
      if (got?.kind === 'pdf') {
        fileHash = createHash('sha256').update(got.buf).digest('hex')
        filePath = join(SPEC_PDFS_DIR, `${fileHash}.pdf`)
        if (!existsSync(filePath)) writeFileSync(filePath, got.buf)
        fullText = extractPdfText(got.buf)
        pdfs++
      } else if (got?.kind === 'html') {
        fullText = got.buf.toString('utf-8').replace(/<[^>]+>/g, ' ').slice(0, 80_000)
      }
    } else {
      const got = await fetchUrl(lit.url)
      if (got?.kind === 'html') {
        fullText = got.buf.toString('utf-8').replace(/<[^>]+>/g, ' ').slice(0, 80_000)
      } else if (got?.kind === 'pdf') {
        fileHash = createHash('sha256').update(got.buf).digest('hex')
        filePath = join(SPEC_PDFS_DIR, `${fileHash}.pdf`)
        if (!existsSync(filePath)) writeFileSync(filePath, got.buf)
        fullText = extractPdfText(got.buf)
        pdfs++
      }
    }
    upsertDocument(db, {
      productClass,
      sourceType: 'class_reference_literature',
      documentType: lit.document_type || 'report',
      manufacturer: lit.org || 'unknown',
      productName: lit.title,
      sourceUrl: lit.url,
      fullText,
      fileHash,
      filePath,
      keyExtracts: lit.key_extracts || [],
    })
    docs++
    console.info(`[class-ref-ingest] literature ${lit.id || lit.title.slice(0, 40)} → ok`)
  }

  for (const img of seed.gold_imagery || []) {
    const body = [
      img.teaches || '',
      `view_role=${img.view_role || ''}`,
      `owner=${img.owner || ''}`,
      `access=${img.access || ''}`,
      'GOLD_IMAGE_REFERENCE — training check only; do not paste as mesh',
    ].join('\n')
    upsertDocument(db, {
      productClass,
      sourceType: 'class_reference_gold_image',
      documentType: 'report',
      manufacturer: img.owner || 'public',
      productName: `GOLD ${img.id || img.view_role}: ${img.teaches || img.url}`,
      sourceUrl: img.url,
      fullText: body,
      fileHash: null,
      filePath: null,
      keyExtracts: [img.teaches || '', img.view_role || ''].filter(Boolean),
    })
    docs++
  }

  db.close()
  return { docs, pdfs }
}

function ftsSelftest(): void {
  if (!existsSync(DB_PATH)) throw new Error('forge-truth.db missing')
  const db = new Database(DB_PATH, { readonly: true })
  const row = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='pretraining_spec_documents_fts'
  `).get() as { name: string } | undefined
  if (!row) {
    db.close()
    throw new Error('FTS table missing — run ingest first')
  }
  const hit = db.prepare(`
    SELECT document_id, title FROM pretraining_spec_documents_fts
    WHERE pretraining_spec_documents_fts MATCH 'pulse AND inverter'
      AND product_class = 'formula_e_rear_mgu'
    LIMIT 5
  `).all() as Array<{ document_id: number; title: string }>
  db.close()
  if (!hit.length) {
    // Soft: invariants stub may not contain those words; MATCH on regen factor.
    const db2 = new Database(DB_PATH, { readonly: true })
    const hit2 = db2.prepare(`
      SELECT document_id FROM pretraining_spec_documents_fts
      WHERE pretraining_spec_documents_fts MATCH 'regen OR cassette OR transverse'
        AND product_class = 'formula_e_rear_mgu'
      LIMIT 3
    `).all()
    db2.close()
    if (!hit2.length) throw new Error('FTS returned zero FE hits')
  }
  console.info('[class-ref-ingest] --selftest FTS OK')
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) {
    const seedPath = join(SEEDS_DIR, 'formula_e_rear_mgu.json')
    if (!existsSync(seedPath)) throw new Error('missing FE seed')
    JSON.parse(readFileSync(seedPath, 'utf-8'))
    ftsSelftest()
    console.info('ingest-class-reference-corpus.ts --selftest OK')
    return
  }
  const targets: string[] = args.includes('--all')
    ? readdirSync(SEEDS_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
    : args.filter((a) => !a.startsWith('--'))
  if (!targets.length) {
    console.error('Usage: ingest-class-reference-corpus.ts <product_class>|--all|--selftest')
    process.exit(2)
  }
  for (const pc of targets) {
    console.info(`[class-ref-ingest] === ${pc}`)
    const r = await ingestSeed(pc)
    console.info(`[class-ref-ingest] ${pc}: docs=${r.docs} pdfs=${r.pdfs}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
