#!/usr/bin/env npx tsx
/**
 * Live test harness — runs the moment distributor API keys are set.
 *
 * Usage:
 *   set -a; source ~/.claude/secrets/distributor-apis.env; set +a
 *   npx tsx scripts/test-distributor-apis.ts
 *
 * Queries 6 representative MPNs covering different part families:
 *   - MCU (STMicro)
 *   - Battery cell (CATL — likely distributor miss since it's 280Ah prismatic)
 *   - Op-amp (TI)
 *   - IGBT (Infineon)
 *   - Temperature sensor (Maxim)
 *   - Thermistor (Vishay)
 *
 * Reports per API: hit / miss / price / stock. Validates the whole H1 stack
 * works end-to-end before we wire it into the engine.
 */

import { findSkuForPart } from '../src/lib/pdf-engine-v2/lib/distributors'

const TEST_PARTS = [
  { name: 'STM32H743 MCU', mpn: 'STM32H743ZIT6' },
  { name: 'LM358 op-amp', mpn: 'LM358P' },
  { name: 'Infineon IGBT module', mpn: 'FF600R17ME4' },
  { name: 'TI temperature sensor', mpn: 'TMP102AIDRLT' },
  { name: 'Vishay thermistor', mpn: 'NTCLE100E3103JB0' },
  // Expected miss — this is a manufacturer direct-sell, distributors don't stock:
  { name: 'CATL prismatic cell (expected miss)', mpn: 'LF280K' },
]

async function main() {
  console.log('\n=== Distributor API live test ===\n')

  const keysPresent = {
    mouser: Boolean(process.env.MOUSER_API_KEY),
    digikey: Boolean(process.env.DIGIKEY_CLIENT_ID && process.env.DIGIKEY_CLIENT_SECRET),
    farnell: Boolean(process.env.FARNELL_API_KEY),
  }
  console.log(`Keys present: mouser=${keysPresent.mouser}  digikey=${keysPresent.digikey}  farnell=${keysPresent.farnell}`)
  if (!keysPresent.mouser && !keysPresent.digikey && !keysPresent.farnell) {
    console.error('\nNo distributor API keys set. Set any of:')
    console.error('  MOUSER_API_KEY')
    console.error('  DIGIKEY_CLIENT_ID + DIGIKEY_CLIENT_SECRET')
    console.error('  FARNELL_API_KEY')
    console.error('\nAbort.\n')
    process.exit(1)
  }
  console.log()

  for (const part of TEST_PARTS) {
    console.log(`--- ${part.name}  (MPN: ${part.mpn}) ---`)
    const t0 = Date.now()
    const result = await findSkuForPart(part.mpn)
    const ms = Date.now() - t0

    if (!result) {
      console.log(`  no match across any API  (${ms} ms)`)
      console.log()
      continue
    }

    console.log(`  Best: ${result.best.source} — ${result.best.manufacturer} / ${result.best.mpn}`)
    console.log(`        £${result.qty1GBP?.toFixed(2)} at qty=1`)
    console.log(`        stock UK: ${result.best.stockUK ?? 'unknown'}`)
    console.log(`        ${result.best.description.slice(0, 80)}`)
    console.log(`        ${result.best.productUrl}`)
    if (result.alternates.length > 0) {
      console.log(`  Alternates:`)
      for (const alt of result.alternates) {
        const p = alt.priceGBP[0]?.unitPriceGbp
        console.log(`    ${alt.source}: £${p?.toFixed(2) || '-'} (stock ${alt.stockUK ?? '?'})`)
      }
    }
    if (result.misses.length > 0) {
      console.log(`  Missed: ${result.misses.join(', ')}`)
    }
    console.log(`  (${ms} ms)`)
    console.log()
  }

  console.log('=== Complete ===\n')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
