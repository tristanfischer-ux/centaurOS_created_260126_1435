/**
 * proveCatch for F1a — the council-H1 'Cartridge Heater' homonym leak (commit a0dbdedc6).
 *
 * Bare `cartridge` in the pressure-vessel-FILTER SUB_ASSEMBLY regex matched "Cartridge
 * HEATER" (a benchtop thermal part) and exploded it into a pressure-vessel filter
 * (Pressure Vessel Shell / Filter Media / Underdrain / Backwash / Skid Frame …) — 9 phantom
 * plant parts on a 20 mL organoid device. The fix required a filter CONTEXT
 * (cartridge filter/element/housing/vessel), and extended the watt-scale skip to plant-
 * vessel part names as a second net. This tests both, on the REAL exported surfaces.
 *
 * Run: npx tsx scripts/lib/orchestrator/generic/f1a-cartridge-heater-selftest.ts
 */
import { subAssemblyFamilyHeadFor, isWattScalePlantAnatomyPart } from './universal-contract-sizing'

const FILTER_FAMILY_HEAD = 'Pressure Vessel Shell'

function main(): number {
  const fails: string[] = []
  const ok = (c: boolean, m: string) => { if (!c) fails.push(m) }

  // (1) proveCatch: a 'Cartridge Heater' must NOT explode into the pressure-vessel FILTER
  //     family. (The homonym bug: it did, minting Pressure Vessel Shell + 8 plant parts.)
  ok(subAssemblyFamilyHeadFor('Cartridge Heater') !== FILTER_FAMILY_HEAD,
    `'Cartridge Heater' must NOT explode into the pressure-vessel filter family, got ${String(subAssemblyFamilyHeadFor('Cartridge Heater'))}`)
  // a bare thermal 'cartridge heater' / 'cartridge fuse' / 'cartridge valve' likewise never
  // hits the filter family.
  for (const n of ['Cartridge Heater', 'Cartridge Fuse', 'Cartridge Heater Element']) {
    ok(subAssemblyFamilyHeadFor(n) !== FILTER_FAMILY_HEAD,
      `'${n}' must not explode into the filter family`)
  }

  // (2) proveNoFalsePositive: a genuine 'Cartridge Filter' (a real pressure-vessel filter)
  //     STILL explodes into the family — the fix must not over-suppress real filters.
  ok(subAssemblyFamilyHeadFor('Cartridge Filter') === FILTER_FAMILY_HEAD,
    `'Cartridge Filter' must still explode into the pressure-vessel filter family`)
  ok(subAssemblyFamilyHeadFor('Cartridge Filter Housing') === FILTER_FAMILY_HEAD,
    `'Cartridge Filter Housing' must still explode into the filter family`)
  ok(subAssemblyFamilyHeadFor('GAC Filter') === FILTER_FAMILY_HEAD,
    `'GAC Filter' must still explode into the filter family (unaffected by the cartridge fix)`)

  // (3) the watt-scale second net: pressure-vessel / filter plant anatomy part names read as
  //     plant anatomy (so the whole explode is skipped on a watt-scale instrument), while a
  //     genuine device part does not trip it.
  for (const n of ['Pressure Vessel Shell', 'Filter Media / Membrane Elements',
                   'Lower Underdrain / Nozzle Plate', 'Skid Frame & Pipework',
                   'Support Skirt', 'Backwash / Service Valve Nest']) {
    ok(isWattScalePlantAnatomyPart(n), `'${n}' must read as watt-scale plant anatomy (skip net)`)
  }
  for (const n of ['Culture Vessel', 'Microcontroller MCU', 'Power Indicator LED', 'Cuvette']) {
    ok(!isWattScalePlantAnatomyPart(n), `device part '${n}' must NOT trip the plant-anatomy net`)
  }

  if (fails.length) {
    console.error('[f1a-cartridge-heater][selftest] FAIL:')
    for (const f of fails) console.error('  ✗ ' + f)
    return 1
  }
  console.error('[f1a-cartridge-heater] _selftest passed — cartridge-heater no filter-explode; '
    + 'cartridge-filter still explodes; watt-scale plant-anatomy net catches vessel parts')
  return 0
}

process.exit(main())
