/**
 * @file lib/distributors/db-only-cascade.ts — DB-only distributor lookup.
 *
 * ARCHITECTURE: The chain is a PURE consumer of ~/.forge-truth/forge-truth.db.
 * This module is the ONLY distributor-lookup path that chain-side code is
 * permitted to import. It never calls any live distributor API — that is
 * exclusively the responsibility of scripts/ingest/* jobs running on a
 * schedule independent of chain runs.
 *
 * This is the architectural fix for the quota-burn problem (codified
 * 2026-05-25, drawer_forgeos_decisions_e30f5e00a59dc3ff): every BESS chain
 * (L23-L26) exhausted Mouser/Digi-Key/Nexar free-tier quotas within hours
 * because gate 20, gate 21, and distributor-cascade-real.ts all called live
 * APIs for every BoM line. Those ~200 validation calls per chain = quota gone
 * before the high-value expansion calls could fire.
 *
 * Two-table read strategy:
 *   1. `distributor_cascade_cache` — primary source. Populated by ingest jobs
 *      + by prior chain runs before this refactor. Has full DistributorResult
 *      JSON. TTL-aware: if the row is expired (>30 days for hits, >7 days for
 *      misses) it is treated as 'unknown' so the ingest job will refresh it.
 *   2. `pretraining_extracted_parts` — secondary/fallback. Has manufacturer +
 *      part_number + discovery_source + confidence. Used when the cache table
 *      has no row. Returns a partial result (source = 'library_only') with
 *      limited pricing/stock data.
 *
 * Source enum semantics:
 *   'cache_hit'              — distributor_cascade_cache row within TTL, result_json present
 *   'cache_miss_confirmed'   — distributor_cascade_cache row within TTL, miss=1
 *                              (ingest previously confirmed the MPN does not exist)
 *   'library_only'           — found only in pretraining_extracted_parts
 *                              (curated knowledge; treat as confirmed-real)
 *   'unknown'                — no row in either table (ingest hasn't touched this MPN yet)
 *
 * Consumer severity rules (canonical, documented here and in gate logic):
 *   'cache_hit'            → PASS (confirmed real, data fresh)
 *   'cache_miss_confirmed' → FAIL — gate 20 purpose: detect fictional MPNs
 *   'library_only'         → PASS (library rows = curated knowledge)
 *   'unknown'              → MED severity "needs ingest", NOT HIGH — prevents
 *                            chain from blocking on un-ingested parts
 *
 * British spelling throughout.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import type { DistributorResult } from './mouser'

// ── Module state — lazy-init, singleton per process ──────────────────────────

let dbHandle: Database.Database | null | undefined = undefined
let cacheGetStmt: Database.Statement | null = null
let libraryGetStmt: Database.Statement | null = null
let warnedMissing = false

// ── TTL thresholds (must match cascade-cache.ts so decisions are consistent) ──
const TTL_HIT_MS  = 30 * 24 * 60 * 60 * 1000   // 30 days for confirmed hits
const TTL_MISS_MS =  7 * 24 * 60 * 60 * 1000   //  7 days for confirmed misses

// ── Public types ─────────────────────────────────────────────────────────────

export type DbCascadeSource =
  | 'cache_hit'
  | 'cache_miss_confirmed'
  | 'library_only'
  | 'unknown'

export interface DbCascadeResult {
  /** Whether a real part was found (cache_hit or library_only). */
  found: boolean
  /** Full DistributorResult when source is 'cache_hit'. null otherwise. */
  result: DistributorResult | null
  /** Where the data came from — drives severity decisions in consumers. */
  source: DbCascadeSource
  /** Age of the cache row in hours. null for library_only and unknown. */
  ageHours: number | null
}

// ── Lazy DB initialisation ────────────────────────────────────────────────────

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
        console.warn(`[db-only-cascade] forge-truth.db not found at ${dbPath} — lookups return 'unknown'`)
        warnedMissing = true
      }
      dbHandle = null
      return null
    }
    const db = new Database(dbPath, { readonly: true })
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 2000')

    // Cache table query: prefer rows with result_json (hits) over miss rows,
    // within TTL. Returns the single best row keyed on (manufacturer, part_number).
    // We query for ANY source because chain-side code doesn't need per-source data.
    cacheGetStmt = db.prepare(`
      SELECT result_json, miss, fetched_at, expires_at
      FROM distributor_cascade_cache
      WHERE LOWER(part_number) = LOWER(?)
        AND (? = '' OR LOWER(manufacturer) = LOWER(?))
      ORDER BY miss ASC, fetched_at DESC
      LIMIT 1
    `)

    // Library table query: just need to know the part exists + basic metadata.
    libraryGetStmt = db.prepare(`
      SELECT manufacturer, part_number, discovery_source, confidence
      FROM pretraining_extracted_parts
      WHERE LOWER(part_number) = LOWER(?)
        AND (? = '' OR LOWER(manufacturer) LIKE '%' || LOWER(?) || '%')
      ORDER BY confidence DESC
      LIMIT 1
    `)

    dbHandle = db
    return db
  } catch (err) {
    if (!warnedMissing) {
      console.warn(`[db-only-cascade] init failed: ${(err as Error).message} — lookups return 'unknown'`)
      warnedMissing = true
    }
    dbHandle = null
    return null
  }
}

// ── Core lookup helpers ───────────────────────────────────────────────────────

/**
 * Look up a (manufacturer, mpn) pair from the DB.
 * manufacturer may be null/empty — when empty, only MPN is matched.
 *
 * Never throws. Returns 'unknown' on any error.
 */
export function lookupCached(manufacturer: string | null, mpn: string): DbCascadeResult {
  if (!mpn || mpn.length < 2) {
    return { found: false, result: null, source: 'unknown', ageHours: null }
  }
  const db = getDb()
  const mfgKey = (manufacturer ?? '').trim()

  // ── 1. Check distributor_cascade_cache ───────────────────────────────────
  if (db && cacheGetStmt) {
    try {
      const row = cacheGetStmt.get(mpn, mfgKey, mfgKey) as
        | { result_json: string | null; miss: number; fetched_at: string; expires_at: string }
        | undefined

      if (row) {
        const expiresMs = new Date(row.expires_at).getTime()
        const now = Date.now()
        const fetchedMs = new Date(row.fetched_at).getTime()
        const ageHours = (now - fetchedMs) / (1000 * 60 * 60)

        // TTL-check: pick the right TTL for hit vs miss
        const ttl = row.miss === 1 ? TTL_MISS_MS : TTL_HIT_MS
        const isExpired = expiresMs < now || (now - fetchedMs) > ttl

        if (!isExpired) {
          if (row.miss === 1) {
            // Confirmed miss — ingest previously tried and the MPN doesn't exist.
            return { found: false, result: null, source: 'cache_miss_confirmed', ageHours }
          }
          if (row.result_json) {
            try {
              const result = JSON.parse(row.result_json) as DistributorResult
              return { found: true, result, source: 'cache_hit', ageHours }
            } catch {
              // Malformed JSON — fall through to library check
            }
          }
        }
        // Row exists but expired — fall through to library check.
        // Source stays 'unknown' so the ingest job will refresh it.
      }
    } catch (err) {
      if (!warnedMissing) {
        console.warn(`[db-only-cascade] cache query error: ${(err as Error).message}`)
        warnedMissing = true
      }
    }
  }

  // ── 2. Fallback to pretraining_extracted_parts ────────────────────────────
  if (db && libraryGetStmt) {
    try {
      const row = libraryGetStmt.get(mpn, mfgKey, mfgKey) as
        | { manufacturer: string; part_number: string; discovery_source: string; confidence: number }
        | undefined

      if (row) {
        // Build a minimal DistributorResult from library data.
        // Pricing/stock fields are unknown — consumers must treat this as
        // "part is real, but no live pricing available".
        const discoverySource = (row.discovery_source ?? '').split(':')
        const sourceStr = (discoverySource[1] as DistributorResult['source']) || 'mouser'
        const minimalResult: DistributorResult = {
          source: sourceStr,
          mpn: row.part_number,
          manufacturer: row.manufacturer || mfgKey,
          description: `${row.manufacturer || mfgKey} ${row.part_number}`,
          priceGBP: [],
          stockUK: null,
          datasheetUrl: null,
          productUrl: '',
          leadWeeks: null,
          fetchedAt: new Date(0).toISOString(), // epoch — signals "library data, not fresh"
        }
        return { found: true, result: minimalResult, source: 'library_only', ageHours: null }
      }
    } catch (err) {
      if (!warnedMissing) {
        console.warn(`[db-only-cascade] library query error: ${(err as Error).message}`)
        warnedMissing = true
      }
    }
  }

  // ── 3. Not in any table ───────────────────────────────────────────────────
  return { found: false, result: null, source: 'unknown', ageHours: null }
}

/**
 * Variant for when manufacturer is truly unknown at call time.
 * Matches on MPN only across all manufacturer rows.
 */
export function lookupCachedAny(mpn: string): DbCascadeResult {
  return lookupCached(null, mpn)
}

/** Test-only reset hook — clears module-level state. */
export function _resetDbForTests(): void {
  if (dbHandle) {
    try { dbHandle.close() } catch { /* no-op */ }
  }
  dbHandle = undefined
  cacheGetStmt = null
  libraryGetStmt = null
  warnedMissing = false
}
