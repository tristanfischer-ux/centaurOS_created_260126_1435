/**
 * @file library-writeback.ts — fire-and-forget INSERT OR IGNORE into
 * ~/.forge-truth/forge-truth.db `pretraining_extracted_parts` for every
 * successful distributor-cascade hit.
 *
 * Closes the gap codified in `forgeos_growing_parts_supplier_database_principle`
 * (Tristan 2026-05-25): pre-this-module, the only path that grew the parts
 * library was `scripts/lib/background-enrichment.ts` walking reviewer-overrides
 * after PDF + audits pass. Distributor cascade hits during the orchestrator
 * stage AND during gates 20+21 audits did NOT write back, so a part that
 * Mouser confirmed exists during a gate-20 check would be re-fetched on the
 * next project even though we already knew it existed.
 *
 * This module is called from every per-distributor lookup function
 * (mouser, digikey, farnell, lcsc, nexar) immediately after a successful
 * DistributorResult is built. The write is asynchronous + best-effort:
 *   - INSERT OR IGNORE keys on (manufacturer, part_number) UNIQUE index
 *     created by `scripts/phase4-schema.sql` and `background-enrichment.ts`
 *   - failures are logged to stderr + swallowed (chain never blocks on DB)
 *   - WAL mode enabled lazily so concurrent distributor calls don't lock
 *   - DB handle cached at module scope — opened once per process
 *
 * Skipped paths:
 *   - SKIP_LIBRARY_WRITEBACK=1 env var (tests, dry-runs)
 *   - process.env.NODE_ENV === 'test' (Jest)
 *   - missing forge-truth.db file (graceful: log once, then no-op)
 *
 * British spelling throughout.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import type { DistributorResult } from './mouser'

let dbHandle: Database.Database | null | undefined = undefined
let insertStmt: Database.Statement | null = null
let cascadeDocId: number = 0
let warnedMissing = false

function getDb(): Database.Database | null {
  if (dbHandle !== undefined) return dbHandle
  if (process.env.SKIP_LIBRARY_WRITEBACK === '1' || process.env.NODE_ENV === 'test') {
    dbHandle = null
    return null
  }
  try {
    const dbPath = resolve(homedir(), '.forge-truth', 'forge-truth.db')
    if (!existsSync(dbPath)) {
      if (!warnedMissing) {
        console.warn(`[library-writeback] forge-truth.db not found at ${dbPath} — write-back disabled`)
        warnedMissing = true
      }
      dbHandle = null
      return null
    }
    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 2000')

    // pretraining_extracted_parts requires NOT NULL document_id with FK to
    // pretraining_spec_documents.id (background-enrichment.ts uses the same
    // get-or-create pattern). Lazy-create one synthetic row per source_type.
    const docRow = db.prepare(`
      SELECT id FROM pretraining_spec_documents
      WHERE source_type = 'distributor_cascade' AND distributor IS NULL
      ORDER BY id ASC LIMIT 1
    `).get() as { id: number } | undefined
    if (docRow?.id) {
      cascadeDocId = docRow.id
    } else {
      const r = db.prepare(`
        INSERT INTO pretraining_spec_documents (source_type, document_type, extraction_status)
        VALUES ('distributor_cascade', 'distributor_catalogue_hit', 'done')
      `).run()
      cascadeDocId = Number(r.lastInsertRowid)
    }

    insertStmt = db.prepare(`
      INSERT OR IGNORE INTO pretraining_extracted_parts
      (document_id, part_name, manufacturer, part_number,
       module_assignment, sub_module_assignment, raw_excerpt,
       confidence, component_class, embedding, embed_hash,
       source_doc_id, discovered_at, discovery_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    dbHandle = db
    return db
  } catch (err) {
    if (!warnedMissing) {
      console.warn(`[library-writeback] init failed: ${(err as Error).message} — write-back disabled`)
      warnedMissing = true
    }
    dbHandle = null
    return null
  }
}

/**
 * Fire-and-forget write-back of a single distributor hit.
 * Never throws. Never blocks the caller.
 */
export function recordDistributorHit(result: DistributorResult | null): void {
  if (!result) return
  const mfg = (result.manufacturer || '').trim()
  const mpn = (result.mpn || '').trim()
  if (!mfg || !mpn || mpn.length < 2) return
  const db = getDb()
  if (!db || !insertStmt) return
  try {
    const description = (result.description || `${mfg} ${mpn}`).slice(0, 1024)
    const productUrl = result.productUrl || ''
    insertStmt.run(
      cascadeDocId,                            // document_id — synthetic 'distributor_cascade' row
      description.slice(0, 256),               // part_name
      mfg,                                     // manufacturer
      mpn,                                     // part_number
      null,                                    // module_assignment (unknown at lookup time)
      null,                                    // sub_module_assignment
      description,                             // raw_excerpt
      0.9,                                     // confidence — real distributor catalogue hit
      null,                                    // component_class (unknown)
      null,                                    // embedding — background-enrichment backfills
      null,                                    // embed_hash
      productUrl || null,                      // source_doc_id — distributor product URL
      new Date().toISOString(),                // discovered_at
      `distributor:${result.source}`,          // discovery_source
    )
  } catch (err) {
    // Swallow all DB errors — never block the chain. Log once per process
    // so transient lock contention doesn't spam stderr on every hit.
    if (!warnedMissing) {
      console.warn(`[library-writeback] insert failed for ${mfg}|${mpn}: ${(err as Error).message}`)
      warnedMissing = true
    }
  }
}

/** Test-only reset hook — clears cached handle so a follow-up test can re-init. */
export function _resetForTests(): void {
  if (dbHandle) {
    try { dbHandle.close() } catch { /* no-op */ }
  }
  dbHandle = undefined
  insertStmt = null
  warnedMissing = false
}
