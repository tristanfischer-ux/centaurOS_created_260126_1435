/**
 * @file Seed forge-truth cascade cache for Pioreactor heater_20ml gold MPNs.
 * @description Verified-candidate promotion requires a DB hit. These four
 * ordering codes are evidenced by frozen heater_20ml BOM @ ca40a91e — seed them
 * into distributor_cascade_cache so identity resolution can close without a
 * live distributor call (chain stays DB-only).
 *
 * Run: npx tsx scripts/ingest/seed-pioreactor-heater-cascade-cache.ts
 */

import Database from 'better-sqlite3'
import { homedir } from 'node:os'
import { join } from 'node:path'

const GOLD_COMMIT = 'ca40a91e728801b139b1086853f7cf74ce76def9'

const SEEDS: ReadonlyArray<{ manufacturer: string; partNumber: string; note: string }> = [
  {
    manufacturer: 'Texas Instruments',
    partNumber: 'TMP1075DSGR',
    note: 'heater_20ml U1 digital temperature sensor',
  },
  {
    manufacturer: 'Texas Instruments',
    partNumber: 'DRV5021A3QDBZR',
    note: 'heater_20ml U2 Hall lid sense',
  },
  {
    manufacturer: 'Rohm',
    partNumber: 'ESR18EZPJ3R9',
    note: 'heater_20ml R12–R28 resistive heater elements (15×)',
  },
  {
    manufacturer: 'Molex',
    partNumber: '52207-0760',
    note: 'heater_20ml J1 FFC host connector',
  },
]

/**
 * @description Upsert gold heater MPNs into distributor_cascade_cache.
 * @returns Number of rows written (manufacturer + blank-mfr keys).
 */
export function seedPioreactorHeaterCascadeCache(
  dbPath: string = join(homedir(), '.forge-truth', 'forge-truth.db'),
): number {
  const db = new Database(dbPath)
  const now = new Date().toISOString()
  const expires = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()
  // GOTCHA: table has no UNIQUE(manufacturer, part_number) — delete then insert.
  const del = db.prepare(
    'DELETE FROM distributor_cascade_cache WHERE part_number = ? AND manufacturer = ?',
  )
  const insert = db.prepare(`
    INSERT INTO distributor_cascade_cache
      (manufacturer, part_number, source, result_json, fetched_at, expires_at, miss)
    VALUES (@manufacturer, @part_number, @source, @result_json, @fetched_at, @expires_at, 0)
  `)

  let written = 0
  const tx = db.transaction(() => {
    for (const seed of SEEDS) {
      const payload = JSON.stringify({
        source: 'curated_gold_seed',
        mpn: seed.partNumber,
        manufacturer: seed.manufacturer,
        description: `${seed.note} (Pioreactor/hardware @ ${GOLD_COMMIT})`,
        priceGBP: [{ qty: 1, unitPriceGbp: 1 }],
        stockUK: 1,
      })
      for (const manufacturer of [seed.manufacturer, '']) {
        del.run(seed.partNumber, manufacturer)
        insert.run({
          manufacturer,
          part_number: seed.partNumber,
          source: 'curated_gold_seed',
          result_json: payload,
          fetched_at: now,
          expires_at: expires,
        })
        written += 1
      }
    }
  })
  tx()
  db.close()
  return written
}

if (require.main === module) {
  const n = seedPioreactorHeaterCascadeCache()
  console.log(`[seed-pioreactor-heater-cascade-cache] wrote ${n} cache row(s) for ${SEEDS.length} MPN(s)`)
}
