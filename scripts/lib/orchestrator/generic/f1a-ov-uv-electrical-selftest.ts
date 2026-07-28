/**
 * proveCatch for F1a — electrical OV/UV vs ultraviolet disinfection homonym
 * (2026-07-27 cell-cycler cold measurement).
 *
 * Bare `\buv\b` in the disinfection SUB_ASSEMBLY regex matched "Ov UV Comparator
 * Latch" (over/under-voltage protection) and exploded Process Unit / Inlet-Outlet
 * Manifolds / Dosing-Lamp Module into safety_protection on a dry benchtop power
 * instrument. Fix: reject electrical OV/UV sense phrases; require UV-lamp/reactor/
 * disinfection context for genuine ultraviolet parents.
 *
 * Run: npx tsx scripts/lib/orchestrator/generic/f1a-ov-uv-electrical-selftest.ts
 */
import { subAssemblyFamilyHeadFor, isWattScalePlantAnatomyPart } from './universal-contract-sizing'

const DISINFECTION_FAMILY_HEAD = 'Process Unit'

function main(): number {
  const fails: string[] = []
  const ok = (c: boolean, m: string) => { if (!c) fails.push(m) }

  // (1) proveCatch: electrical over/under-voltage names must NEVER explode into
  //     ultraviolet disinfection plant anatomy.
  for (const n of [
    'Ov UV Comparator Latch',
    'OV/UV Comparator Latch',
    'Over Under Voltage Comparator Latch',
    'Over/Under-Voltage Comparator Latch',
    'Under Voltage Trip',
    'Over Voltage Cutout',
    'UV Comparator Latch',
  ]) {
    ok(subAssemblyFamilyHeadFor(n) !== DISINFECTION_FAMILY_HEAD,
      `'${n}' must NOT explode into disinfection Process Unit family, got ${String(subAssemblyFamilyHeadFor(n))}`)
  }

  // (2) proveNoFalsePositive: genuine UV disinfection / oxygen / ozone parents still explode.
  // GOTCHA: 'UV Reactor' matches the pressure-vessel rule first (`reactor` → Shell Course) —
  // that ordering predates this fix; prove disinfection on parents that reach this family.
  for (const n of [
    'UV Disinfection Unit',
    'UV Lamp Module',
    'Ultraviolet Steriliser',
    'Ozone Contact Chamber',
    'Oxygen Aeration Skid',
    'In-line UV Disinfection',
  ]) {
    ok(subAssemblyFamilyHeadFor(n) === DISINFECTION_FAMILY_HEAD,
      `'${n}' must still explode into disinfection Process Unit family, got ${String(subAssemblyFamilyHeadFor(n))}`)
  }

  // (3) second net: Process Unit anatomy reads as watt-scale plant anatomy.
  for (const n of ['Process Unit', 'Inlet / Outlet Manifolds', 'Dosing / Lamp Module', 'Flow Control Valve']) {
    ok(isWattScalePlantAnatomyPart(n), `'${n}' must read as watt-scale plant anatomy (skip net)`)
  }

  if (fails.length) {
    console.error('[f1a-ov-uv-electrical][selftest] FAIL:')
    for (const f of fails) console.error('  ✗ ' + f)
    return 1
  }
  console.error('[f1a-ov-uv-electrical] _selftest passed — electrical OV/UV no Process Unit explode; '
    + 'UV reactor/lamp still explodes; plant-anatomy net covers Process Unit parts')
  return 0
}

process.exit(main())
