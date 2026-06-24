#!/usr/bin/env -S npx tsx
/**
 * @file scripts/test-class-standards-db.tsx
 *
 * Smoke test for the DB-first per-class standards overlay
 * (src/lib/pdf-engine-v2/lib/knowledge/class-standards-db.ts), the READ-SLICE of
 * ForgeOS strengthening #2 — wiring the live pretraining_extracted_standards
 * corpus into the G1b compliance gate so UNSEEN archetypes get a populated
 * §Compliance section instead of the baked "Add an entry to class-standards.ts"
 * stub.
 *
 * Assertions:
 *   1. classifyStandardName VERIFIES genuine standards + DROPS noise
 *      (the anti-hallucination guard).
 *   2. Flag OFF (default): getClassStandardsDBFirst returns the baked stub
 *      UNCHANGED for an unseen class (no behaviour change vs today).
 *   3. Baked class always wins: a curated class (energy_storage) returns the
 *      baked block whether the flag is on or off.
 *   4. Flag ON + unseen class WITH DB rows: the overlay populates standards from
 *      the DB, every promoted standard passes classifyStandardName, and none is
 *      asserted mandatory (DB standards are advisory).
 *
 * Run:
 *   npx tsx scripts/test-class-standards-db.tsx
 *
 * Exit 0 = all assertions passed. Exit 1 = at least one failed.
 */

import {
  getClassStandardsDBFirst,
  buildClassStandardsFromDB,
  classifyStandardName,
  standardsDbLiveEnabled,
  _resetForTests,
} from '../src/lib/pdf-engine-v2/lib/knowledge/class-standards-db.js'

let passed = 0
let failed = 0

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`)
    passed++
  } else {
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

async function main(): Promise<void> {
  console.log('[smoke] class-standards-db — starting\n')

  // ── Test 1: classifier verifies real standards, drops noise ────────────────
  console.log('Test 1: classifyStandardName — verification guard')
  assert('accepts "IEC 62619"',        classifyStandardName('IEC 62619') === 'IEC')
  assert('accepts "UL 9540A"',         classifyStandardName('UL 9540A') === 'US')
  assert('accepts "BS EN 61439"',      classifyStandardName('BS EN 61439') === 'UK')
  assert('accepts "MIL-STD 810"',      classifyStandardName('MIL-STD 810') === 'US')
  assert('accepts "14 CFR Part 89"',   classifyStandardName('14 CFR Part 89') === 'US')
  assert('accepts "ISO 9001:2015"',    classifyStandardName('ISO 9001:2015') === 'ISO')
  assert('accepts "UN 38.3"',          classifyStandardName('UN 38.3') === 'global')
  assert('accepts "2014/30/EU"',       classifyStandardName('2014/30/EU') === 'EU')
  // Noise that MUST be dropped:
  assert('drops "10/100/1000BASE-T"',  classifyStandardName('10/100/1000BASE-T') === null)
  assert('drops "DVB-S2"',             classifyStandardName('DVB-S2') === null)
  assert('drops "UN Sustainable Development Goals"', classifyStandardName('UN Sustainable Development Goals') === null)
  assert('drops "Svalbard Act"',       classifyStandardName('Svalbard Act') === null)
  assert('drops empty',                classifyStandardName('') === null)
  console.log('')

  // ── Test 2: flag OFF → baked stub unchanged for an unseen class ─────────────
  console.log('Test 2: flag OFF → baked behaviour preserved')
  delete process.env.STANDARDS_DB_LIVE
  _resetForTests()
  assert('flag reads OFF by default', standardsDbLiveEnabled() === false)
  const unseenOff = getClassStandardsDBFirst('satellite_ground_station')
  assert('unseen class (flag off) → empty standards stub',
    Array.isArray(unseenOff.standards) && unseenOff.standards.length === 0,
    `got ${unseenOff.standards.length} standards`)
  console.log('')

  // ── Test 3: baked class always wins ────────────────────────────────────────
  console.log('Test 3: baked curated class wins (flag off AND on)')
  delete process.env.STANDARDS_DB_LIVE
  _resetForTests()
  const bakedOff = getClassStandardsDBFirst('energy_storage')
  assert('energy_storage (flag off) → baked standards present',
    bakedOff.standards.length > 0, `got ${bakedOff.standards.length}`)
  process.env.STANDARDS_DB_LIVE = '1'
  _resetForTests()
  const bakedOn = getClassStandardsDBFirst('energy_storage')
  assert('energy_storage (flag on) → SAME baked block (DB never overrides curated)',
    bakedOn.standards.length === bakedOff.standards.length,
    `off=${bakedOff.standards.length} on=${bakedOn.standards.length}`)
  console.log('')

  // ── Test 4: flag ON + unseen class with DB rows → populated overlay ─────────
  console.log('Test 4: flag ON → DB overlay populates an unseen class')
  process.env.STANDARDS_DB_LIVE = '1'
  _resetForTests()
  // Probe the DB directly first to choose a class that actually has rows. We try a
  // few classes the corpus is known to cover; the test is SKIP-tolerant if the DB
  // is absent (CI without ~/.forge-truth) so it never produces a false failure.
  const candidates = ['satellite_ground_station', 'distribution_transformer', 'launch_vehicle_upper_stage', 'chiller']
  let probed: { cls: string; block: ReturnType<typeof buildClassStandardsFromDB> } | null = null
  for (const cls of candidates) {
    const block = buildClassStandardsFromDB(cls)
    if (block && block.standards.length > 0) { probed = { cls, block }; break }
  }

  if (!probed) {
    console.log('  SKIP  no DB rows reachable (forge-truth.db absent or empty) — overlay path not exercised')
  } else {
    const { cls, block } = probed
    console.log(`  info: probed class="${cls}" → ${block!.standards.length} verified standards`)
    assert('overlay yields ≥1 standard', block!.standards.length >= 1)
    assert('every promoted standard passes the verification guard',
      block!.standards.every(s => classifyStandardName(s.code) !== null),
      'a promoted standard failed classifyStandardName')
    assert('no DB standard asserted mandatory (advisory only)',
      block!.standards.every(s => s.mandatory === false))
    assert('DB standards carry zero fabricated cost estimate',
      block!.standards.every(s => s.typical_compliance_cost_gbp === 0))
    // And via the public flag-gated path:
    const viaPublic = getClassStandardsDBFirst(cls)
    assert('getClassStandardsDBFirst(flag on) surfaces the DB block',
      viaPublic.standards.length === block!.standards.length,
      `public=${viaPublic.standards.length} direct=${block!.standards.length}`)
  }
  console.log('')

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n[smoke] class-standards-db — ${passed} passed, ${failed} failed`)
  delete process.env.STANDARDS_DB_LIVE
  _resetForTests()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('[smoke] threw:', err)
  process.exit(1)
})
