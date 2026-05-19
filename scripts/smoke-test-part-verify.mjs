#!/usr/bin/env node
/**
 * scripts/smoke-test-part-verify.mjs
 *
 * Smoke test for Stage 4.5 — part-number verification.
 *
 * Builds a synthetic 50-line BoM (mix of real-looking SKUs across BESS-grade
 * vendors + obvious fakes + ambiguous formats), runs the stage with mocked
 * distributor + web-search callbacks (so we don't burn API quota), and
 * reports the hit-rate distribution.
 *
 * Real-pipeline cost would be near zero (only 1 Brave call per unverified
 * candidate × £0.001). This mock-run cost: 0p.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')

// Use a tsx subprocess so we can import the stage file directly.
const driver = `
import { runPartNumberVerify } from './src/lib/pdf-engine-v2/stages/4.5-part-number-verify.ts'

// ── Synthetic 50-line BoM ─────────────────────────────────────────────────
const REAL_SKUS = new Set([
  'STM32H743ZIT6', 'ESP32-S3-WROOM-1', 'NRF52840-QIAA',
  '170M6017', 'QUINT-PS-1AC/24DC/40', 'PSR-SCP-24UC/ESL4/3X1/1X2/B',
  'TMS320F28379D', 'LT3796', 'LM2596S-5.0', 'NCP1271',
  'BLM21AG121SN1D', 'GRM188R71H104KA93D', 'CL10A106KQ8NNNC',
  'DMG2305UX-7', 'IRFB7434PBF', 'CSD18540Q5B',
  'AT24C256C-SSHL-T', 'W25Q128JVSIQ',
  'INA226AIDGSR', 'MAX17320',
  'STH40P-AKHX-Z08C', 'SDP-S',
])

const FAKE_SKUS = new Set([
  'BESS-FAKE-001', 'CONTAINER-X9000',
  'ULTRA-CELL-9999', 'PHOTON-DRIVE-X1',
  'INFINITE-POWER-PACK',
])

function buildSyntheticBom() {
  const skus = []
  // 22 real, 5 fake, 23 ambiguous → total 50
  for (const s of REAL_SKUS) skus.push({ part_number: s, manufacturer: pickMfr(s), real: true })
  for (const s of FAKE_SKUS) skus.push({ part_number: s, manufacturer: 'Acme Corp', real: false })
  for (let i = 0; i < 23; i++) skus.push({ part_number: 'AMB-' + i.toString().padStart(3, '0'), manufacturer: 'Generic Ltd', real: 'ambiguous' })
  return skus.map((s, i) => ({
    id: 'p' + i,
    module: 'power',
    sub_module_id: 'sm-' + (i % 5),
    word_id: 'w-' + i,
    word_name: 'Component ' + i,
    manufacturer: s.manufacturer,
    part_number: s.part_number,
    status: 'uncertain',
    confidence: 'low',
    reasoning: 'pre-stage seed',
    source_url: null,
    source_title: null,
    generated_by: 'seed',
    generated_at: new Date().toISOString(),
    real: s.real,
  }))
}

function pickMfr(s) {
  if (s.startsWith('STM') || s.startsWith('IRFB')) return 'STMicroelectronics'
  if (s.startsWith('NRF') || s.includes('NCP')) return 'Nordic'
  if (s.startsWith('ESP')) return 'Espressif'
  if (s.startsWith('LT') || s.includes('LM2596') || s.includes('INA') || s.includes('TMS')) return 'Texas Instruments'
  if (s.startsWith('BLM') || s.startsWith('GRM') || s.startsWith('CL10')) return 'Murata'
  if (s.startsWith('DMG') || s.includes('CSD')) return 'Diodes Inc'
  if (s.startsWith('AT24') || s.startsWith('W25')) return 'Microchip'
  if (s.startsWith('170M')) return 'Bussmann'
  if (s.startsWith('QUINT') || s.startsWith('PSR')) return 'Phoenix Contact'
  if (s.startsWith('STH')) return 'TE Connectivity'
  if (s.startsWith('MAX')) return 'Analog Devices'
  return 'Unknown Mfg'
}

// ── Mocked distributor lookup ─────────────────────────────────────────────
function mockFindSku(mpn) {
  if (REAL_SKUS.has(mpn)) {
    // Pretend Mouser found it.
    return Promise.resolve({
      mpn,
      best: {
        source: 'mouser',
        mpn,
        manufacturer: pickMfr(mpn),
        description: 'Test description for ' + mpn,
        priceGBP: [{ qty: 1, unitPriceGbp: 1.23 }],
        stockUK: 1000,
        datasheetUrl: 'https://example.com/ds/' + mpn + '.pdf',
        productUrl: 'https://www.mouser.co.uk/p/' + mpn,
        leadWeeks: 2,
        fetchedAt: new Date().toISOString(),
      },
      alternates: [],
      misses: ['digikey', 'farnell', 'lcsc'],
      qty1GBP: 1.23,
    })
  }
  return Promise.resolve(null)
}

// ── Mocked web search ─────────────────────────────────────────────────────
// Ambiguous SKUs get a search hit on 40% of them (simulates real Brave behaviour).
function mockSearch({ query }) {
  if (query.includes('FAKE') || query.includes('CONTAINER-X9000') ||
      query.includes('ULTRA-CELL-9999') || query.includes('PHOTON-DRIVE-X1') ||
      query.includes('INFINITE-POWER-PACK')) {
    return Promise.resolve([])
  }
  if (query.includes('AMB-')) {
    // Simulate 40% recovery on ambiguous parts.
    const m = query.match(/AMB-(\\d+)/)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n % 5 < 2) {  // 40% of these resolve via web search
        return Promise.resolve([{
          title: 'Datasheet — ' + (m[0]),
          url: 'https://generic-ltd.com/parts/' + m[0],
          snippet: 'AMB-' + m[1].padStart(3, '0') + ' is a Generic Ltd component...',
          source: 'tavily',
        }])
      }
    }
  }
  return Promise.resolve([])
}

const bom = buildSyntheticBom()
const state = { partVerifications: bom }
const out = await runPartNumberVerify(state, {
  findSkuFn: mockFindSku,
  webSearchFn: mockSearch,
})

const summary = {
  total: out.data.total,
  attempted: out.data.attempted,
  verifiedCount: out.data.verifiedCount,
  byTier: out.data.byTier,
  hitRate: (out.data.verifiedCount / out.data.attempted * 100).toFixed(1) + '%',
  durationMs: out.data.durationMs,
  // Cross-check honesty: how many fakes did we let through?
  falsePositives: out.data.verifications.filter(v => v.real === false && v.verified).length,
  truePositives: out.data.verifications.filter(v => v.real === true && v.verified).length,
  trueRealCount: out.data.verifications.filter(v => v.real === true).length,
  fakeCount: out.data.verifications.filter(v => v.real === false).length,
  ambiguousVerified: out.data.verifications.filter(v => v.real === 'ambiguous' && v.verified).length,
  ambiguousCount: out.data.verifications.filter(v => v.real === 'ambiguous').length,
}
console.log(JSON.stringify(summary, null, 2))
`

const driverPath = resolve(REPO_ROOT, '.smoke-test-part-verify.mts')
writeFileSync(driverPath, driver)
try {
    const proc = spawn('npx', ['tsx', driverPath], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
    })
    await new Promise((res, rej) => {
        proc.on('exit', (code) => (code === 0 ? res() : rej(new Error(`tsx exited ${code}`))))
        proc.on('error', rej)
    })
} finally {
    try { unlinkSync(driverPath) } catch {}
}
