/**
 * scripts/ingest/seed-material-prices.ts
 *
 * Seeds the `material_prices` table in ~/.forge-truth/forge-truth.db from the
 * curated MATERIAL_PRICES anchor (src/lib/pdf-engine-v2/lib/material-prices.ts).
 *
 * This is the materials GROWING-DB foundation (Tristan-decided 2026-05-30,
 * UNIVERSAL-ENGINE-PLAN.md Lever 5). The engine reads material costs DB-first
 * (getMaterialPrice in material-prices.ts) and falls back to the static table;
 * a refresh job (refresh-material-prices.ts) web-updates rows over time
 * (DB-first → web-on-stale → write-back → grow). INGEST-side (read-write) per
 * the CHAIN-AS-DB-CONSUMER principle — the chain itself only reads.
 *
 * Re-running is safe + idempotent: it upserts the curated rows but NEVER
 * clobbers a row whose origin is 'web' (a live-refreshed price), so the seed
 * can't overwrite fresher market data.
 *
 * Usage: npx tsx scripts/ingest/seed-material-prices.ts [--dry]
 */
import Database from 'better-sqlite3'
import { homedir } from 'os'
import { resolve } from 'path'
import { existsSync } from 'fs'
import { MATERIAL_PRICES } from '../../src/lib/pdf-engine-v2/lib/material-prices'

const DB_PATH = resolve(homedir(), '.forge-truth', 'forge-truth.db')
const DRY = process.argv.includes('--dry')

function main(): void {
  if (!existsSync(DB_PATH)) {
    console.error(`[seed-materials] forge-truth.db not found at ${DB_PATH}`)
    process.exit(1)
  }
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS material_prices (
      material        TEXT PRIMARY KEY,
      raw_gbp_per_kg  REAL NOT NULL,
      mfg_mult_low    REAL NOT NULL,
      mfg_mult_high   REAL NOT NULL,
      source          TEXT NOT NULL,
      updated         TEXT NOT NULL,
      origin          TEXT NOT NULL DEFAULT 'seed'
    );
  `)
  // Upsert each curated row, but only overwrite a row that is still seed-origin
  // — a 'web' (live-refreshed) row is fresher and must survive a re-seed.
  const upsert = db.prepare(`
    INSERT INTO material_prices (material, raw_gbp_per_kg, mfg_mult_low, mfg_mult_high, source, updated, origin)
    VALUES (@material, @raw_gbp_per_kg, @mfg_mult_low, @mfg_mult_high, @source, @updated, 'seed')
    ON CONFLICT(material) DO UPDATE SET
      raw_gbp_per_kg = excluded.raw_gbp_per_kg,
      mfg_mult_low   = excluded.mfg_mult_low,
      mfg_mult_high  = excluded.mfg_mult_high,
      source         = excluded.source,
      updated        = excluded.updated
      WHERE material_prices.origin = 'seed'
  `)
  let n = 0
  const tx = db.transaction(() => {
    for (const [material, p] of Object.entries(MATERIAL_PRICES)) {
      if (!DRY) {
        upsert.run({
          material,
          raw_gbp_per_kg: p.raw_gbp_per_kg,
          mfg_mult_low: p.mfg_mult_low,
          mfg_mult_high: p.mfg_mult_high,
          source: p.source,
          updated: p.updated,
        })
      }
      n++
    }
  })
  tx()
  const count = (db.prepare('SELECT COUNT(*) AS c FROM material_prices').get() as { c: number }).c
  console.log(`[seed-materials] ${DRY ? '(dry) would seed' : 'seeded'} ${n} materials; material_prices now has ${count} rows`)
  db.close()
}

main()
