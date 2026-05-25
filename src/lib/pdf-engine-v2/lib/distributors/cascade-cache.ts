/**
 * @file lib/distributors/cascade-cache.ts — SQLite-backed cache for the
 * distributor cascade, keyed by (manufacturer, part_number, source).
 *
 * Motivation: Nexar Evaluation plan = 100 matched parts/MONTH. A single
 * BESS L23 chain burned 137 Nexar calls (138 BoM lines, virtually all four
 * native distributors missed on obscure/hallucinated MPNs). Without this
 * cache layer, each fresh chain run on the same archetype class would
 * consume the entire monthly Nexar quota. Gate 20 + gate 21 both call the
 * cheap cascade + Nexar fallback per BoM line — cache serves both audits
 * automatically because the cache is wired into each per-distributor
 * function, not at the audit level.
 *
 * Cache semantics:
 *   - `getCached` returns:
 *       DistributorResult  — valid hit (use it, skip live API)
 *       null               — confirmed miss for this source (skip live API)
 *       undefined          — no cached row or TTL expired (call live API)
 *   - `setCached` is fire-and-forget. Errors are swallowed and logged once.
 *   - TTL: 30 days for hits, 7 days for misses (recently-listed parts get
 *     re-checked sooner; hallucinated MPNs stop burning quota for 7 days).
 *
 * Keying strategy: (LOWER(manufacturer), LOWER(part_number), source).
 * When manufacturer is unknown at call time, pass '' — the cache key still
 * deduplicates by MPN+source which is the primary quota-protection axis.
 *
 * Respects SKIP_LIBRARY_WRITEBACK=1 (same toggle as library-writeback.ts)
 * so tests and dry-runs bypass both write-back AND the cache.
 *
 * FK-silent-drop trap avoided (drawer `drawer_forgeos_gotchas_c214eda4c42399fa`,
 * commit 19c177234): distributor_cascade_cache has NO FK columns, so
 * INSERT ... ON CONFLICT DO UPDATE cannot silently drop rows due to a NOT NULL
 * FK violation.
 *
 * British spelling throughout.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import type { DistributorResult } from './mouser'

export type DistributorSource = 'mouser' | 'digikey' | 'farnell' | 'lcsc' | 'nexar'

// ── TTLs ──────────────────────────────────────────────────────────────────────
const TTL_HIT_MS  = 30 * 24 * 60 * 60 * 1000   // 30 days for confirmed hits
const TTL_MISS_MS =  7 * 24 * 60 * 60 * 1000   //  7 days for confirmed misses

// ── Module-scoped DB handle (lazy-init, singleton per process) ────────────────
let dbHandle: Database.Database | null | undefined = undefined
let getStmt: Database.Statement | null = null
let upsertStmt: Database.Statement | null = null
let warnedMissing = false

// ── Lazy initialisation ───────────────────────────────────────────────────────

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
        console.warn(`[cascade-cache] forge-truth.db not found at ${dbPath} — cache disabled`)
        warnedMissing = true
      }
      dbHandle = null
      return null
    }
    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 2000')

    // Bootstrap schema on first import — each statement is idempotent (IF NOT EXISTS).
    db.prepare(`
      CREATE TABLE IF NOT EXISTS distributor_cascade_cache (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        manufacturer TEXT NOT NULL,
        part_number  TEXT NOT NULL,
        source       TEXT NOT NULL,
        result_json  TEXT,
        fetched_at   TEXT NOT NULL,
        expires_at   TEXT NOT NULL,
        miss         INTEGER NOT NULL DEFAULT 0
      )
    `).run()

    db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_dcc_unique
        ON distributor_cascade_cache(LOWER(manufacturer), LOWER(part_number), source)
    `).run()

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_dcc_expires
        ON distributor_cascade_cache(expires_at)
    `).run()

    getStmt = db.prepare(`
      SELECT result_json, miss, expires_at
      FROM distributor_cascade_cache
      WHERE LOWER(manufacturer) = LOWER(?)
        AND LOWER(part_number)  = LOWER(?)
        AND source = ?
      LIMIT 1
    `)

    upsertStmt = db.prepare(`
      INSERT INTO distributor_cascade_cache
        (manufacturer, part_number, source, result_json, fetched_at, expires_at, miss)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(LOWER(manufacturer), LOWER(part_number), source)
      DO UPDATE SET
        result_json = excluded.result_json,
        fetched_at  = excluded.fetched_at,
        expires_at  = excluded.expires_at,
        miss        = excluded.miss
    `)

    dbHandle = db
    return db
  } catch (err) {
    if (!warnedMissing) {
      console.warn(`[cascade-cache] init failed: ${(err as Error).message} — cache disabled`)
      warnedMissing = true
    }
    dbHandle = null
    return null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Query the cache for a (manufacturer, part_number, source) triple.
 *
 * Returns:
 *   DistributorResult  — cached hit; caller should return it directly.
 *   null               — cached confirmed miss; caller should return null.
 *   undefined          — no row, or TTL expired; caller should hit live API.
 */
export function getCached(
  mfg: string,
  mpn: string,
  source: DistributorSource,
): DistributorResult | null | undefined {
  const db = getDb()
  if (!db || !getStmt) return undefined
  try {
    const row = getStmt.get(mfg ?? '', mpn, source) as
      | { result_json: string | null; miss: number; expires_at: string }
      | undefined

    if (!row) return undefined  // cache miss

    // Check TTL
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return undefined  // expired — treat as cache miss, caller will refresh
    }

    if (row.miss === 1) return null  // confirmed miss, still within TTL

    if (!row.result_json) return undefined  // malformed row
    return JSON.parse(row.result_json) as DistributorResult
  } catch (err) {
    if (!warnedMissing) {
      console.warn(`[cascade-cache] getCached error: ${(err as Error).message}`)
      warnedMissing = true
    }
    return undefined
  }
}

/**
 * Persist a distributor result (or confirmed miss) to the cache.
 * Fire-and-forget — never throws, never blocks the caller.
 *
 * @param mfg    - Manufacturer string from the BoM line (may be '').
 * @param mpn    - Manufacturer part number.
 * @param source - Which distributor produced (or missed) the result.
 * @param result - DistributorResult on hit, null on confirmed miss.
 */
export function setCached(
  mfg: string,
  mpn: string,
  source: DistributorSource,
  result: DistributorResult | null,
): void {
  const db = getDb()
  if (!db || !upsertStmt) return
  try {
    const now = new Date()
    const ttlMs = result === null ? TTL_MISS_MS : TTL_HIT_MS
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString()
    const fetchedAt = now.toISOString()
    const isMiss = result === null ? 1 : 0
    const resultJson = result !== null ? JSON.stringify(result) : null

    upsertStmt.run(mfg ?? '', mpn, source, resultJson, fetchedAt, expiresAt, isMiss)
  } catch (err) {
    if (!warnedMissing) {
      console.warn(`[cascade-cache] setCached error for ${mfg}|${mpn}|${source}: ${(err as Error).message}`)
      warnedMissing = true
    }
  }
}

/** Test-only reset hook — clears module-level state so tests can re-init. */
export function _resetCacheForTests(): void {
  if (dbHandle) {
    try { dbHandle.close() } catch { /* no-op */ }
  }
  dbHandle = undefined
  getStmt = null
  upsertStmt = null
  warnedMissing = false
}
