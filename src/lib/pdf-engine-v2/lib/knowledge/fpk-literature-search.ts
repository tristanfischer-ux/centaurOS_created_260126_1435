/**
 * @file fpk-literature-search.ts
 * @description Lookup / FTS / claim search over the FPK literature corpus.
 *
 * INTENT: Anvil designs FPKs from peer literature — every component_id can
 * retrieve associated papers + extracted formulas/materials/physics.
 *
 * FLOW: harvest-fpk-literature.py → extract-fpk-literature-claims.py → here
 * Chain is DB-only (no live HTTP).
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_DB = join(homedir(), '.forge-truth', 'forge-truth.db')

export interface FpkPaperHit {
  document_id: number
  component_id: string
  topic_id: string | null
  title: string
  source_url: string
  doi: string | null
  peer_reviewed: boolean
  contribution: string | null
  excerpt: string
}

export interface FpkClaimHit {
  id: number
  document_id: number
  component_id: string | null
  claim_kind: string
  symbol: string | null
  expression: string | null
  value_text: string | null
  unit: string | null
  material_grade: string | null
  excerpt: string | null
  confidence: number | null
}

function openDb(dbPath: string = DEFAULT_DB): Database.Database | null {
  if (!existsSync(dbPath)) return null
  const db = new Database(dbPath, { readonly: true })
  db.pragma('busy_timeout = 3000')
  return db
}

/**
 * Papers linked to a physics-tree / checklist component_id.
 */
export function lookupFpkComponentLiterature(args: {
  componentId: string
  productClass?: string
  k?: number
  dbPath?: string
}): FpkPaperHit[] {
  const db = openDb(args.dbPath)
  if (!db) return []
  try {
    const has = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='fpk_component_literature'`,
      )
      .get()
    if (!has) return []
    const pc = args.productClass ?? 'formula_e_front_mgu'
    const rows = db
      .prepare(
        `
      SELECT cl.document_id, cl.component_id, cl.topic_id, cl.doi, cl.contribution,
             cl.peer_reviewed, d.product_name AS title, d.source_url,
             substr(COALESCE(d.extracted_full_text, ''), 1, 400) AS excerpt
      FROM fpk_component_literature cl
      JOIN pretraining_spec_documents d ON d.id = cl.document_id
      WHERE cl.product_class = ?
        AND cl.component_id = ?
      GROUP BY cl.document_id
      ORDER BY cl.peer_reviewed DESC, cl.relevance DESC
      LIMIT ?
    `,
      )
      .all(pc, args.componentId, args.k ?? 12) as Array<{
      document_id: number
      component_id: string
      topic_id: string | null
      doi: string | null
      contribution: string | null
      peer_reviewed: number
      title: string
      source_url: string
      excerpt: string
    }>
    return rows.map((r) => ({
      document_id: r.document_id,
      component_id: r.component_id,
      topic_id: r.topic_id,
      title: r.title,
      source_url: r.source_url,
      doi: r.doi,
      peer_reviewed: !!r.peer_reviewed,
      contribution: r.contribution,
      excerpt: r.excerpt,
    }))
  } finally {
    db.close()
  }
}

/**
 * Extracted claims (formulas, materials, physics, FEA…) for a component or kind.
 */
export function lookupFpkClaims(args: {
  componentId?: string
  claimKind?: string
  productClass?: string
  k?: number
  dbPath?: string
}): FpkClaimHit[] {
  const db = openDb(args.dbPath)
  if (!db) return []
  try {
    const has = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='fpk_extracted_claims'`)
      .get()
    if (!has) return []
    const pc = args.productClass ?? 'formula_e_front_mgu'
    const clauses = ['product_class = ?']
    const params: Array<string | number> = [pc]
    if (args.componentId) {
      clauses.push('component_id = ?')
      params.push(args.componentId)
    }
    if (args.claimKind) {
      clauses.push('claim_kind = ?')
      params.push(args.claimKind)
    }
    params.push(args.k ?? 20)
    const rows = db
      .prepare(
        `
      SELECT id, document_id, component_id, claim_kind, symbol, expression,
             value_text, unit, material_grade, excerpt, confidence
      FROM fpk_extracted_claims
      WHERE ${clauses.join(' AND ')}
      ORDER BY confidence DESC, id DESC
      LIMIT ?
    `,
      )
      .all(...params) as FpkClaimHit[]
    return rows
  } finally {
    db.close()
  }
}

/**
 * Coverage report: papers per topic / component vs min target.
 */
export function fpkLiteratureCoverage(args?: {
  productClass?: string
  minPapers?: number
  dbPath?: string
}): {
  topics: Array<{ topic_id: string; docs: number; peer: number; ok: boolean }>
  components_below_min: Array<{ component_id: string; docs: number }>
} {
  const db = openDb(args?.dbPath)
  if (!db) return { topics: [], components_below_min: [] }
  try {
    const has = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='fpk_component_literature'`,
      )
      .get()
    if (!has) return { topics: [], components_below_min: [] }
    const pc = args?.productClass ?? 'formula_e_front_mgu'
    const min = args?.minPapers ?? 10
    const topics = db
      .prepare(
        `
      SELECT topic_id,
             COUNT(DISTINCT document_id) AS docs,
             SUM(CASE WHEN peer_reviewed=1 THEN 1 ELSE 0 END) AS peer_links
      FROM fpk_component_literature
      WHERE product_class = ? AND topic_id IS NOT NULL
      GROUP BY topic_id
    `,
      )
      .all(pc) as Array<{ topic_id: string; docs: number; peer_links: number }>
    const comps = db
      .prepare(
        `
      SELECT component_id, COUNT(DISTINCT document_id) AS docs
      FROM fpk_component_literature
      WHERE product_class = ?
      GROUP BY component_id
      HAVING docs < ?
      ORDER BY docs ASC
    `,
      )
      .all(pc, min) as Array<{ component_id: string; docs: number }>
    return {
      topics: topics.map((t) => ({
        topic_id: t.topic_id,
        docs: t.docs,
        peer: t.peer_links,
        ok: t.docs >= min,
      })),
      components_below_min: comps,
    }
  } finally {
    db.close()
  }
}
