/**
 * @file db.ts — Parts catalogue SQLite database client.
 *
 * Single source of truth for verified parts across all chain runs. Phase 0
 * of the cascade reads from here before any external API call. New verified
 * parts are written back so the next run gets them for free.
 *
 * Tristan directive 2026-05-16: the engine should learn — every part found
 * once should never need to be re-searched.
 */

import Database from 'better-sqlite3'
import { readFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { homedir } from 'os'

export const DEFAULT_DB_PATH = resolve(homedir(), '.forgeos', 'parts-catalogue.db')
const SCHEMA_PATH = resolve(__dirname, 'schema.sql')

// Freshness window — entries verified more than this many days ago are stale
// and need to be re-cascaded. Default 60 days; the cascade marks the entry
// stale and re-runs from Phase 1.
export const STALE_AFTER_DAYS = 60

// URL re-check window — for entries with non-distributor source_methods, if
// the URL hasn't been HEAD-checked in this many days, re-check on read.
// Distributor URLs are exempt (they bot-block and would always 403).
export const URL_RECHECK_AFTER_DAYS = 30

export interface PartCatalogueRow {
  manufacturer_norm: string
  part_number_norm: string
  manufacturer: string
  part_number: string
  source_method: string
  source_url: string | null
  source_title: string | null
  distributor_price_gbp: number | null
  distributor_availability: string | null
  distributor_datasheet_url: string | null
  verified_at: string
  last_head_check_at: string | null
  last_head_check_ok: number | null  // SQLite has no bool; 0/1
  generated_by: string | null
  first_seen_in: string | null
}

let _db: Database.Database | null = null

/**
 * Lazily open the database. Creates the file + applies schema if missing.
 * Idempotent — safe to call multiple times.
 */
export function getDb(path: string = DEFAULT_DB_PATH): Database.Database {
  if (_db) return _db
  mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  // Apply schema — split into individual CREATE statements and run each.
  applySchema(db)
  _db = db
  return db
}

function applySchema(db: Database.Database): void {
  const schemaSql = readFileSync(SCHEMA_PATH, 'utf8')
  // Strip line comments + split on ; that's outside parentheses.
  const stripped = schemaSql.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
  const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0)
  for (const stmt of statements) {
    db.prepare(stmt).run()
  }
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

// ─── Normalisation ──────────────────────────────────────────────────────────
//
// Same input → same key, regardless of cosmetic differences. "TI BQ79616",
// "T.I. BQ-79616", "Texas Instruments bq79616" all map to (texasinstruments,
// bq79616) — except we don't expand abbreviations, just strip non-alphanum
// + lowercase.

export function normManufacturer(mfr: string): string {
  return String(mfr || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function normPartNumber(pn: string): string {
  // Take only the first whitespace-separated token (drops descriptive suffix
  // like "5055700801 Micro-Fit 8-pin" → "5055700801"). Then lowercase + strip
  // non-alphanumeric.
  const first = String(pn || '').trim().split(/\s+/)[0]
  return first.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// ─── Lookup ─────────────────────────────────────────────────────────────────

/**
 * Look up a part by (manufacturer, part_number). Returns the row if present
 * and still fresh; null otherwise.
 */
export function lookupPart(manufacturer: string, partNumber: string, db: Database.Database = getDb()): PartCatalogueRow | null {
  const mfrNorm = normManufacturer(manufacturer)
  const pnNorm = normPartNumber(partNumber)
  if (!mfrNorm || !pnNorm) return null
  const stmt = db.prepare<[string, string], PartCatalogueRow>(`
    SELECT * FROM parts
    WHERE manufacturer_norm = ? AND part_number_norm = ?
      AND verified_at > datetime('now', '-${STALE_AFTER_DAYS} days')
    LIMIT 1
  `)
  const row = stmt.get(mfrNorm, pnNorm)
  return row ?? null
}

/**
 * Bulk lookup — preferred for cascade Phase 0 because we process up to ~100
 * parts in a single query.
 *
 * Returns a Map keyed by `${manufacturer_norm}::${part_number_norm}` so
 * callers can match against their own normalised keys.
 */
export function lookupPartsBulk(
  pairs: Array<{ manufacturer: string; part_number: string }>,
  db: Database.Database = getDb(),
): Map<string, PartCatalogueRow> {
  const out = new Map<string, PartCatalogueRow>()
  if (pairs.length === 0) return out
  // SQLite has a default max of 999 parameters. We split into chunks of
  // ~200 (each row uses 2 params).
  const chunkSize = 200
  for (let i = 0; i < pairs.length; i += chunkSize) {
    const chunk = pairs.slice(i, i + chunkSize).map(p => ({
      mfr: normManufacturer(p.manufacturer),
      pn: normPartNumber(p.part_number),
    })).filter(p => p.mfr && p.pn)
    if (chunk.length === 0) continue
    const placeholders = chunk.map(() => '(? || ?)').join(',')
    const stmt = db.prepare<any[], PartCatalogueRow>(`
      SELECT * FROM parts
      WHERE (manufacturer_norm || part_number_norm) IN (${placeholders})
        AND verified_at > datetime('now', '-${STALE_AFTER_DAYS} days')
    `)
    const params: string[] = []
    for (const p of chunk) { params.push(p.mfr, p.pn) }
    const rows = stmt.all(...params)
    for (const r of rows) {
      out.set(`${r.manufacturer_norm}::${r.part_number_norm}`, r)
    }
  }
  return out
}

// ─── Upsert ─────────────────────────────────────────────────────────────────

export interface UpsertInput {
  manufacturer: string
  part_number: string
  source_method: string
  source_url: string | null
  source_title: string | null
  distributor_price_gbp?: number | null
  distributor_availability?: string | null
  distributor_datasheet_url?: string | null
  generated_by?: string | null
  first_seen_in?: string | null
  /** Whether the URL passed urlResolves() at write time. Distributor URLs
   * default to true (trusted by construction). */
  head_check_ok?: boolean
}

/**
 * Insert or refresh a part in the catalogue. Replaces existing entry on
 * same (manufacturer_norm, part_number_norm). Updates verified_at to now.
 */
export function upsertPart(p: UpsertInput, db: Database.Database = getDb()): void {
  const mfrNorm = normManufacturer(p.manufacturer)
  const pnNorm = normPartNumber(p.part_number)
  if (!mfrNorm || !pnNorm) return
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    INSERT INTO parts (
      manufacturer_norm, part_number_norm,
      manufacturer, part_number,
      source_method, source_url, source_title,
      distributor_price_gbp, distributor_availability, distributor_datasheet_url,
      verified_at, last_head_check_at, last_head_check_ok,
      generated_by, first_seen_in
    ) VALUES (
      @manufacturer_norm, @part_number_norm,
      @manufacturer, @part_number,
      @source_method, @source_url, @source_title,
      @distributor_price_gbp, @distributor_availability, @distributor_datasheet_url,
      @verified_at, @last_head_check_at, @last_head_check_ok,
      @generated_by, @first_seen_in
    )
    ON CONFLICT (manufacturer_norm, part_number_norm) DO UPDATE SET
      manufacturer = excluded.manufacturer,
      part_number = excluded.part_number,
      source_method = excluded.source_method,
      source_url = excluded.source_url,
      source_title = excluded.source_title,
      distributor_price_gbp = excluded.distributor_price_gbp,
      distributor_availability = excluded.distributor_availability,
      distributor_datasheet_url = excluded.distributor_datasheet_url,
      verified_at = excluded.verified_at,
      last_head_check_at = excluded.last_head_check_at,
      last_head_check_ok = excluded.last_head_check_ok,
      generated_by = excluded.generated_by
  `)
  stmt.run({
    manufacturer_norm: mfrNorm,
    part_number_norm: pnNorm,
    manufacturer: p.manufacturer,
    part_number: p.part_number,
    source_method: p.source_method,
    source_url: p.source_url ?? null,
    source_title: p.source_title ?? null,
    distributor_price_gbp: p.distributor_price_gbp ?? null,
    distributor_availability: p.distributor_availability ?? null,
    distributor_datasheet_url: p.distributor_datasheet_url ?? null,
    verified_at: now,
    last_head_check_at: p.head_check_ok !== undefined ? now : null,
    last_head_check_ok: p.head_check_ok !== undefined ? (p.head_check_ok ? 1 : 0) : null,
    generated_by: p.generated_by ?? null,
    first_seen_in: p.first_seen_in ?? null,
  })
}

/**
 * Mark a part as stale — its URL failed re-HEAD-check on read. Caller should
 * then re-cascade. Setting verified_at backward by 100 days makes it stale
 * for future Phase 0 lookups.
 */
export function markStale(manufacturer: string, partNumber: string, db: Database.Database = getDb()): void {
  const mfrNorm = normManufacturer(manufacturer)
  const pnNorm = normPartNumber(partNumber)
  if (!mfrNorm || !pnNorm) return
  db.prepare(`
    UPDATE parts SET
      verified_at = datetime('now', '-100 days'),
      last_head_check_at = datetime('now'),
      last_head_check_ok = 0
    WHERE manufacturer_norm = ? AND part_number_norm = ?
  `).run(mfrNorm, pnNorm)
}

export function totalCount(db: Database.Database = getDb()): number {
  const r = db.prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM parts`).get()
  return r?.n ?? 0
}

export function countsBySource(db: Database.Database = getDb()): Array<{ source_method: string; n: number; avg_price_gbp: number | null }> {
  return db.prepare<[], { source_method: string; n: number; avg_price_gbp: number | null }>(
    `SELECT * FROM v_parts_by_source`
  ).all() as any
}
