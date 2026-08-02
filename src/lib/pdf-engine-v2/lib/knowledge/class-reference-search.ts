/**
 * @file class-reference-search.ts
 * @description Hybrid + whole-word (FTS5) search over class-reference literature
 *   ingested into forge-truth (`pretraining_spec_documents` + FTS).
 *
 * INTENT (2026-07-29): When designing ANY class (bioreactor, FE rear MGU, …),
 * look up public gold/literature exemplars so form-follows-function stays
 * grounded. Never returns meshes to paste — titles, excerpts, URLs only.
 *
 * FLOW: seed JSON → ingest-class-reference-corpus.ts → this search →
 *   research / tool bootstrap consumers.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { DEFAULT_DB_PATH, dualSearch } from '../retrieval/dual-search'

export interface ClassReferenceHit {
  document_id: number
  product_class: string
  title: string
  document_type: string
  source_url: string
  excerpt: string
  score: number
  via: 'fts' | 'dual' | 'both'
}

function openDb(dbPath: string = DEFAULT_DB_PATH): Database.Database | null {
  if (!existsSync(dbPath)) return null
  const db = new Database(dbPath, { readonly: true })
  db.pragma('busy_timeout = 3000')
  return db
}

/**
 * Whole-word / phrase search via FTS5 (porter tokenizer).
 */
export function searchClassReferenceFts(args: {
  productClass: string
  query: string
  k?: number
  dbPath?: string
}): ClassReferenceHit[] {
  const db = openDb(args.dbPath)
  if (!db) return []
  try {
    const hasFts = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='pretraining_spec_documents_fts'
    `).get()
    if (!hasFts) return []
    // Quote multi-word as AND of tokens for whole-word behaviour.
    const tokens = String(args.query || '')
      .split(/[^a-zA-Z0-9_]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
      .slice(0, 8)
    if (!tokens.length) return []
    const match = tokens.join(' AND ')
    const rows = db.prepare(`
      SELECT f.document_id, f.product_class, f.title, f.body,
             d.document_type, d.source_url,
             bm25(pretraining_spec_documents_fts) AS rank
      FROM pretraining_spec_documents_fts f
      JOIN pretraining_spec_documents d ON d.id = f.document_id
      WHERE pretraining_spec_documents_fts MATCH ?
        AND f.product_class = ?
      ORDER BY rank
      LIMIT ?
    `).all(match, args.productClass, args.k ?? 8) as Array<{
      document_id: number
      product_class: string
      title: string
      body: string
      document_type: string
      source_url: string
      rank: number
    }>
    return rows.map((r, i) => ({
      document_id: r.document_id,
      product_class: r.product_class,
      title: r.title,
      document_type: r.document_type || '',
      source_url: r.source_url || '',
      excerpt: String(r.body || '').slice(0, 280),
      score: 1 / (1 + i + Math.abs(Number(r.rank) || 0)),
      via: 'fts' as const,
    }))
  } catch (err) {
    console.warn('[class-reference-search] FTS failed:',
      err instanceof Error ? err.message : err)
    return []
  } finally {
    db.close()
  }
}

/**
 * Hybrid lexical+vector search over extracted specs for the class, fused with FTS.
 */
export async function searchClassReference(args: {
  productClass: string
  query: string
  k?: number
  dbPath?: string
}): Promise<ClassReferenceHit[]> {
  const k = args.k ?? 8
  const fts = searchClassReferenceFts(args)
  let dual: ClassReferenceHit[] = []
  try {
    const result = await dualSearch({
      table: 'pretraining_extracted_specs',
      lexicalCols: ['spec_key', 'spec_value', 'raw_excerpt'],
      selectCols: ['document_id'],
      // Lexical-only by default here — embeddings may be empty on freshly
      // ingested class-ref rows; FTS arm already covers whole-word.
      queryText: args.query,
      k,
      where: `document_id IN (SELECT id FROM pretraining_spec_documents WHERE product_class = '${args.productClass.replace(/'/g, "''")}')`,
      dbPath: args.dbPath ?? join(homedir(), '.forge-truth', 'forge-truth.db'),
    })
    dual = (result.hits || []).map((h, i) => {
      const r = h.row as Record<string, unknown>
      return {
        document_id: Number(r.document_id || h.id || 0),
        product_class: args.productClass,
        title: String(r.spec_key || r.raw_excerpt || '').slice(0, 120),
        document_type: 'spec',
        source_url: '',
        excerpt: String(r.raw_excerpt || r.spec_value || '').slice(0, 280),
        score: h.rrf_score || 1 / (60 + i),
        via: 'dual' as const,
      }
    })
  } catch (err) {
    console.warn('[class-reference-search] dualSearch failed:',
      err instanceof Error ? err.message : err)
  }

  const byId = new Map<string, ClassReferenceHit>()
  for (const h of [...fts, ...dual]) {
    const key = `${h.document_id}:${h.title}`
    const prev = byId.get(key)
    if (!prev) {
      byId.set(key, h)
    } else {
      byId.set(key, {
        ...prev,
        score: prev.score + h.score,
        via: 'both',
        excerpt: prev.excerpt || h.excerpt,
      })
    }
  }
  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, k)
}
