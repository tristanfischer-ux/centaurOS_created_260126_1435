/**
 * @file structural-cache-policy.ts
 * @description Shared policy for the three structural caches that were class-keyed
 *   (class_graph_candidates, class_tool_plan_candidates, tool_creation_proposals).
 *
 * INTENT: Class-alone reuse let the first product in a class define every later one
 * (cell cycler inherited an RPM appliance — CLASS-KEYED-CONTAMINATION-REPORT-2026-07-27).
 * Council: quarantine fossil rows; measure cold miss-path; admission invariant later.
 *
 * Env:
 *   STRUCTURAL_CACHE_REUSE=0|false|off|cold  → never read prior candidates (miss path)
 *   STRUCTURAL_CORPUS_NEIGHBOURS=0            → skip neighbour-class graphs in harvest
 *
 * Quarantine: column `quarantined INTEGER NOT NULL DEFAULT 0` on each store.
 * latestCandidate / loadProposal skip quarantined=1 rows.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export const FORGE_TRUTH_DB =
  process.env.FORGE_TRUTH_DB?.trim() || join(homedir(), '.forge-truth', 'forge-truth.db')

const STRUCTURAL_TABLES = [
  'class_graph_candidates',
  'class_tool_plan_candidates',
  'tool_creation_proposals',
] as const

export type StructuralTable = (typeof STRUCTURAL_TABLES)[number]

/**
 * @description True when structural candidate reuse is allowed.
 * Cold measurement sets STRUCTURAL_CACHE_REUSE=0 (or cold/false/off).
 */
export function structuralCacheReuseEnabled(): boolean {
  const raw = String(process.env.STRUCTURAL_CACHE_REUSE ?? '1').trim().toLowerCase()
  if (raw === '' || raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes') return true
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no' || raw === 'cold') return false
  return true
}

/**
 * @description When false, bootstrap-class-graph must not feed neighbour class graphs
 * into the harvest prompt (secondary contamination path: BESS graphs for consumer_electronics).
 */
export function structuralCorpusNeighboursEnabled(): boolean {
  const raw = String(process.env.STRUCTURAL_CORPUS_NEIGHBOURS ?? '1').trim().toLowerCase()
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return false
  return true
}

/** Ensure `quarantined` column exists (idempotent ALTER). */
export function ensureQuarantineColumn(
  db: Database.Database,
  table: StructuralTable,
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (cols.some((c) => c.name === 'quarantined')) return
  db.exec(
    `ALTER TABLE ${table} ADD COLUMN quarantined INTEGER NOT NULL DEFAULT 0`,
  )
}

/**
 * @description Mark every existing row in the three structural stores as quarantined.
 * New bootstraps stay quarantined=0 so same-input memoization can return later.
 * @returns per-table row counts marked
 */
export function quarantineAllExistingStructuralCandidates(
  dbPath: string = FORGE_TRUTH_DB,
): Record<StructuralTable, number> {
  const out = {
    class_graph_candidates: 0,
    class_tool_plan_candidates: 0,
    tool_creation_proposals: 0,
  } satisfies Record<StructuralTable, number>
  if (!existsSync(dbPath)) return out
  const db = new Database(dbPath, { timeout: 30_000 })
  try {
    db.pragma('journal_mode = WAL')
    for (const table of STRUCTURAL_TABLES) {
      const exists = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(table)
      if (!exists) continue
      ensureQuarantineColumn(db, table)
      const info = db
        .prepare(`UPDATE ${table} SET quarantined = 1 WHERE COALESCE(quarantined, 0) = 0`)
        .run()
      out[table] = Number(info.changes ?? 0)
    }
  } finally {
    try {
      db.close()
    } catch {
      /* no-op */
    }
  }
  return out
}

/**
 * @description SQL fragment: row is eligible for reuse (not quarantined).
 * Callers must have run ensureQuarantineColumn on a writable open first, or the
 * column may be missing on very old DBs — then treat as no quarantine filter.
 */
export function reusableCandidateWhereSql(hasQuarantineCol: boolean): string {
  return hasQuarantineCol ? 'AND COALESCE(quarantined, 0) = 0' : ''
}

export function tableHasQuarantineColumn(
  db: Database.Database,
  table: StructuralTable,
): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return cols.some((c) => c.name === 'quarantined')
}

/** proveCatch + CLI selftest */
export function selftestStructuralCachePolicy(): number {
  let bad = 0
  const prev = process.env.STRUCTURAL_CACHE_REUSE
  try {
    process.env.STRUCTURAL_CACHE_REUSE = 'cold'
    if (structuralCacheReuseEnabled()) {
      console.error('FAIL: STRUCTURAL_CACHE_REUSE=cold must disable reuse')
      bad++
    }
    process.env.STRUCTURAL_CACHE_REUSE = '1'
    if (!structuralCacheReuseEnabled()) {
      console.error('FAIL: STRUCTURAL_CACHE_REUSE=1 must enable reuse')
      bad++
    }
    process.env.STRUCTURAL_CORPUS_NEIGHBOURS = '0'
    if (structuralCorpusNeighboursEnabled()) {
      console.error('FAIL: STRUCTURAL_CORPUS_NEIGHBOURS=0 must disable neighbours')
      bad++
    }
  } finally {
    if (prev === undefined) delete process.env.STRUCTURAL_CACHE_REUSE
    else process.env.STRUCTURAL_CACHE_REUSE = prev
    delete process.env.STRUCTURAL_CORPUS_NEIGHBOURS
  }
  if (bad === 0) console.error('[structural-cache-policy] selftest OK')
  return bad
}

if (require.main === module) {
  const mode = process.argv[2]
  if (mode === '--selftest') {
    process.exit(selftestStructuralCachePolicy() === 0 ? 0 : 1)
  }
  if (mode === '--quarantine') {
    const counts = quarantineAllExistingStructuralCandidates()
    console.log(JSON.stringify({ ok: true, quarantined: counts }, null, 2))
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    if (total === 0) {
      console.warn('[structural-cache-policy] quarantine: 0 rows updated (already clean or empty DB)')
    } else {
      console.error(`[structural-cache-policy] quarantined ${total} fossil row(s)`)
    }
    process.exit(0)
  }
  console.error('Usage: structural-cache-policy.ts --selftest | --quarantine')
  process.exit(2)
}
