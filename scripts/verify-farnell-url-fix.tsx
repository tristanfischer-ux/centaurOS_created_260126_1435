/**
 * @file verify-farnell-url-fix.tsx — Smoke-test the Farnell URL pattern fix.
 * Calls farnellLookup() for the two previously-broken cases and probes the
 * resulting URLs via execFileSync curl to confirm they 200.
 */

import { farnellLookup } from '../src/lib/pdf-engine-v2/radical/part-verification'
import { execFileSync } from 'child_process'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

function curlStatus(url: string): number {
  try {
    const out = execFileSync('curl', [
      '-sIo', '/dev/null',
      '-w', '%{http_code}',
      '-A', UA,
      '-H', 'Accept-Language: en-GB,en;q=0.9',
      url,
    ], { encoding: 'utf8' })
    return parseInt(out.trim(), 10) || 0
  } catch {
    return 0
  }
}

;(async () => {
  const cases: Array<{ mfr: string; pn: string }> = [
    { mfr: 'STMicroelectronics', pn: 'STM32F427VGT6' },
    { mfr: 'Molex', pn: '5057-9416' },
    { mfr: 'Texas Instruments', pn: 'TPS54331DR' },
    { mfr: 'Werma', pn: '975.840' },
  ]
  for (const c of cases) {
    process.stdout.write(`\n${c.mfr} / ${c.pn}\n`)
    const r = await farnellLookup(c.mfr, c.pn)
    if (!r) { console.log('  null return (no key?)'); continue }
    if (!r.found) { console.log('  not found in Farnell catalogue'); continue }
    console.log(`  sku=${r.sku} mfr=${r.manufacturer}`)
    console.log(`  url=${r.product_url}`)
    if (r.product_url) {
      const status = curlStatus(r.product_url)
      console.log(`  → HTTP ${status} ${status === 200 ? 'OK' : 'FAIL'}`)
    }
  }
})().catch(e => { console.error(e); process.exit(1) })
