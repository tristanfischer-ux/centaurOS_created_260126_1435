/**
 * @file scripts/lib/quota-semaphore.ts — SQLite-backed per-source daily call counter.
 *
 * ARCHITECTURE: Used exclusively by scripts/ingest/* jobs. Chain-side code
 * must never import this module — chain runs must never call live APIs at all.
 *
 * Tracks the number of live API calls made to each distributor per calendar
 * day (UTC). On each call to tryAcquire(), atomically increments the count.
 * Returns false if the count would exceed dailyCap, so the caller can abort
 * early and avoid a 429 / quota-exhaustion error.
 *
 * Free-tier defaults (reference only — pass dailyCap explicitly to override):
 *   mouser:   1000 calls/day
 *   digikey:  1000 calls/day (hard-enforced via x-ratelimit-remaining header)
 *   farnell:  2000 calls/day (more generous, ~1000 enforced in practice)
 *   nexar:      3 calls/day  (Evaluation plan ≈ 100 matched parts/month ÷ 30)
 *   lcsc:       N/A (no documented cap — generous)
 *
 * Storage: distributor_quota_usage table in ~/.forge-truth/forge-truth.db.
 * The table is auto-created on first use (idempotent).
 *
 * Atomic increment: uses SQLite's INSERT ... ON CONFLICT DO UPDATE pattern
 * inside a synchronous better-sqlite3 call. No async needed — SQLite is
 * single-writer-per-connection and the entire increment + check is one
 * statement.
 *
 * British spelling throughout.
 */

import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

// ── Free-tier defaults ────────────────────────────────────────────────────────

export const DAILY_CAPS: Record<string, number> = {
  mouser:  1000,
  digikey: 1000,
  farnell: 2000,
  nexar:      3,   // ≈100 matched-parts/month ÷ 30 days (Evaluation plan)
  lcsc:   99999,   // No documented cap
}

// ── Module state ──────────────────────────────────────────────────────────────

let dbHandle: Database.Database | null | undefined = undefined
let tryAcquireStmt: Database.Statement | null = null
let getCountStmt: Database.Statement | null = null
let warnedMissing = false

// ── Lazy DB initialisation ────────────────────────────────────────────────────

function getDb(): Database.Database | null {
  if (dbHandle !== undefined) return dbHandle
  if (process.env.SKIP_QUOTA_SEMAPHORE === '1' || process.env.NODE_ENV === 'test') {
    dbHandle = null
    return null
  }
  try {
    const dir = resolve(homedir(), '.forge-truth')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const dbPath = resolve(dir, 'forge-truth.db')
    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 5000')

    // Auto-create quota table (idempotent)
    db.prepare(`
      CREATE TABLE IF NOT EXISTS distributor_quota_usage (
        source TEXT NOT NULL,
        day    TEXT NOT NULL,
        count  INTEGER NOT NULL DEFAULT 0,
        UNIQUE(source, day)
      )
    `).run()

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_dqu_source_day
        ON distributor_quota_usage(source, day)
    `).run()

    // Atomic increment: always increments, returns the NEW count.
    tryAcquireStmt = db.prepare(`
      INSERT INTO distributor_quota_usage (source, day, count)
      VALUES (?, ?, 1)
      ON CONFLICT(source, day) DO UPDATE SET count = count + 1
      RETURNING count
    `)

    getCountStmt = db.prepare(`
      SELECT COALESCE(count, 0) AS count
      FROM distributor_quota_usage
      WHERE source = ? AND day = ?
      LIMIT 1
    `)

    dbHandle = db
    return db
  } catch (err) {
    if (!warnedMissing) {
      console.warn(`[quota-semaphore] init failed: ${(err as Error).message} — quota protection disabled`)
      warnedMissing = true
    }
    dbHandle = null
    return null
  }
}

// ── Date helper ───────────────────────────────────────────────────────────────

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)  // 'YYYY-MM-DD'
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Attempt to acquire one call slot for the given source today.
 *
 * Atomically increments the counter. Returns true if the NEW count is within
 * dailyCap; false if it would exceed the cap (caller should not make the API
 * call).
 *
 * If the DB is unavailable (missing forge-truth.db, test env), returns true
 * (permits the call) with a warning — fail-open is preferable to blocking
 * ingest jobs on a missing semaphore.
 *
 * @param source    - Distributor name ('mouser', 'digikey', 'farnell', etc.)
 * @param dailyCap  - Maximum calls allowed per day. Defaults to DAILY_CAPS[source] or 1000.
 */
export function tryAcquire(source: string, dailyCap?: number): boolean {
  const cap = dailyCap ?? DAILY_CAPS[source] ?? 1000
  const db = getDb()
  if (!db || !tryAcquireStmt) {
    // Fail-open: no DB means no tracking
    return true
  }
  try {
    const day = todayUtc()
    const row = tryAcquireStmt.get(source, day) as { count: number } | undefined
    const newCount = row?.count ?? 1
    return newCount <= cap
  } catch (err) {
    console.warn(`[quota-semaphore] tryAcquire error for ${source}: ${(err as Error).message}`)
    return true  // fail-open
  }
}

/**
 * Return the number of remaining calls for the given source today.
 * Never throws. Returns dailyCap (full quota) when DB is unavailable.
 *
 * @param source    - Distributor name.
 * @param dailyCap  - Maximum calls allowed per day.
 */
export function getRemaining(source: string, dailyCap?: number): number {
  const cap = dailyCap ?? DAILY_CAPS[source] ?? 1000
  const db = getDb()
  if (!db || !getCountStmt) return cap
  try {
    const day = todayUtc()
    const row = getCountStmt.get(source, day) as { count: number } | undefined
    const used = row?.count ?? 0
    return Math.max(0, cap - used)
  } catch (err) {
    console.warn(`[quota-semaphore] getRemaining error for ${source}: ${(err as Error).message}`)
    return cap
  }
}

/** Test-only reset hook. */
export function _resetQuotaForTests(): void {
  if (dbHandle) {
    try { dbHandle.close() } catch { /* no-op */ }
  }
  dbHandle = undefined
  tryAcquireStmt = null
  getCountStmt = null
  warnedMissing = false
}
