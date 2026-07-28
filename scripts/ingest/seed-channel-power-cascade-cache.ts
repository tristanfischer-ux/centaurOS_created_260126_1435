/**
 * @file Seed forge-truth cascade cache for channel electronics PCB identities.
 * @description Verified-candidate promotion requires a DB hit. Channel MOSFET /
 * AFE / shunt / thermistor / safety / mains / thermal identities are evidenced by
 * frozen Yuri boards + manufacturer datasheets — seed distributor_cascade_cache
 * so identity resolution and fillBlank can close without a live distributor call
 * (chain stays DB-only).
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
  {
    manufacturer: 'Diodes Incorporated',
    partNumber: 'BSS84-7-F',
    note: 'P-channel 50 V MOSFET SOT-23 — reverse polarity protection',
  },
  {
    manufacturer: 'Texas Instruments',
    partNumber: 'LM393DR',
    note: 'Dual differential comparator SO-8 — channel OV/UV / OC / OT hardware trips',
  },
  {
    manufacturer: 'Vishay Dale',
    partNumber: 'RH05010R00FE02',
    note: '10 Ohm 50 W wirewound — linear discharge pass bank',
  },
  {
    manufacturer: 'Schurter',
    partNumber: '6100.4215',
    note: 'IEC C14 panel-mount fused inlet 10 A / 250 VAC',
  },
  {
    manufacturer: 'MEAN WELL',
    partNumber: 'RPS-500-12',
    note: '500 W medical/ITE 12 V open-frame AC-DC — instrument bulk supply',
  },
  {
    manufacturer: 'Fischer Elektronik',
    partNumber: 'SK 81 50 SA',
    note: 'Extruded finned heatsink for TO-220 / channel power stages',
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
