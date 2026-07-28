/**
 * @file Seed forge-truth cascade cache for channel electronics PCB identities.
 * @description Verified-candidate promotion requires a DB hit. Channel MOSFET /
 * AFE / shunt / thermistor identities are evidenced by frozen Yuri boards +
 * manufacturer datasheets — seed distributor_cascade_cache so identity
 * resolution and fillBlank can close without a live distributor call (chain
 * stays DB-only).
 *
 * Run: npx tsx scripts/ingest/seed-channel-power-cascade-cache.ts
 */

import Database from 'better-sqlite3'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SEEDS: ReadonlyArray<{ manufacturer: string; partNumber: string; note: string }> = [
  {
    manufacturer: 'Infineon Technologies',
    partNumber: 'IRLB3813PBF',
    note: 'Power MOSFET N-channel 30 V TO-220AB — channel / TEC low-side switch',
  },
  {
    manufacturer: 'STMicroelectronics',
    partNumber: 'TL072CDT',
    note: 'Dual low-noise JFET-input operational amplifier SO-8 — channel precision AFE',
  },
  {
    manufacturer: 'Vishay Dale',
    partNumber: 'WSL2512R0100FEA',
    note: '10 mOhm 1% metal-strip current-sense resistor 2512 — channel shunt',
  },
  {
    manufacturer: 'Murata Electronics',
    partNumber: 'NCP15XH103F03RC',
    note: '10 kOhm NTC thermistor 0402 — channel cell temperature sense',
  },
]

/**
 * @description Upsert channel electronics MPNs into distributor_cascade_cache.
 * @param dbPath Path to forge-truth.db
 * @returns Number of rows written (manufacturer + blank-mfr keys).
 */
export function seedChannelPowerCascadeCache(
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
        description: seed.note,
        priceGBP: [{ qty: 1, unitPriceGbp: 0.5 }],
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
  const n = seedChannelPowerCascadeCache()
  console.log(
    `[seed-channel-power-cascade-cache] wrote ${n} cache row(s) for ${SEEDS.length} MPN(s)`,
  )
}
