/**
 * proveCatch for F1f Layer 0 — the design scale tier is pinned from PHYSICS, never a part noun.
 *
 * The core guarantee (Tristan's "heater" example): a 20 mL / 35 W benchtop instrument whose brief
 * text contains the word "heater" must pin to `benchtop`, NEVER `plant` — so downstream retrieval
 * / tool-pick / word-expand can gate on the pinned tier instead of chasing the noun into a
 * fish-farm template. Run: npx tsx scripts/lib/orchestrator/generic/design-scale-tier-selftest.ts
 */
import {
  deriveDesignScaleTier, buildDesignIdentity, compatibleTiers,
} from './design-scale-tier'

function main(): number {
  const fails: string[] = []
  const ok = (c: boolean, m: string) => { if (!c) fails.push(m) }

  // (1) THE CORE CATCH: the frozen organoid-bioreactor 2150 signals → benchtop. The word
  //     "heater" is in the brief, but the PHYSICS (0.004 m³, 35 W, 20 mL) pins benchtop.
  ok(deriveDesignScaleTier({ enclosure_volume_m3: 0.00403, peak_electrical_power_w: 35, working_volume_ml: 20 }) === 'benchtop',
    'organoid 2150 (0.004 m³ / 35 W / 20 mL) must pin benchtop, never plant')
  // a device DUTY signal with no enclosure figure (envelope not yet computed) still pins device.
  ok(deriveDesignScaleTier({ working_volume_ml: 20, peak_electrical_power_w: 35 }) === 'benchtop',
    '20 mL / 35 W with no enclosure figure must still pin a device tier (benchtop), not unknown/plant')

  // (2) HANDHELD: a small edge + device duty.
  ok(deriveDesignScaleTier({ enclosure_volume_m3: 0.001, peak_electrical_power_w: 5, max_edge_mm: 120 }) === 'handheld',
    'a sub-0.02 m³ / 5 W / 120 mm edge device must pin handheld')

  // (3) PLANT / FIELD: unambiguous large-scale signals win.
  ok(deriveDesignScaleTier({ enclosure_volume_m3: 38, connected_electrical_load_kw: 850 }) === 'field',
    'a 38 m³ / 850 kW plant must pin field')
  ok(deriveDesignScaleTier({ enclosure_volume_m3: 3, connected_electrical_load_kw: 40 }) === 'plant',
    'a 3 m³ / 40 kW process unit must pin plant')
  ok(deriveDesignScaleTier({ connected_electrical_load_kw: 200 }) === 'plant',
    'a 200 kW load must pin plant even with no enclosure figure')

  // (4) A PLANT with a "heater"/"vessel" noun must NOT be dragged to benchtop by low working
  //     volume elsewhere — the plant signals (38 m³) dominate.
  ok(deriveDesignScaleTier({ enclosure_volume_m3: 38, working_volume_ml: 20 }) !== 'benchtop',
    'a 38 m³ plant must not pin benchtop just because some working_volume_ml is small')

  // (5) UNKNOWN: no usable physical signal → never fabricate a tier.
  ok(deriveDesignScaleTier({}) === 'unknown', 'no signal → unknown (never a fabricated tier)')

  // (6) compatibility gating (Layer 1 veto input): benchtop borrows handheld, never plant.
  ok(!compatibleTiers('benchtop').includes('plant'),
    'a benchtop identity must NOT be compatible with plant tools')
  ok(compatibleTiers('plant').includes('field'),
    'a plant identity may borrow field kit')

  // (7) buildDesignIdentity on the frozen-2150-shaped state → benchtop, locked, basis names physics.
  const st = {
    engineeringContract: { shared_quantities: { enclosure_volume_m3: 0.00403, connected_electrical_load_kw: 0.035, working_volume_ml: 20 } },
    moduleDecomposition: { product_class: 'benchtop_bioreactor', modules: [{ derived_parameters: { peak_electrical_power_w: 35 } }] },
  }
  const id = buildDesignIdentity(st)
  ok(id.scale_tier === 'benchtop' && id.identity_locked === true,
    `buildDesignIdentity(2150-shape) must pin benchtop + locked (got ${id.scale_tier})`)
  ok(/physics/.test(id.basis) && !/heater/i.test(id.basis),
    `identity basis must cite physics, never a part noun (got ${id.basis})`)

  if (fails.length) {
    console.error('[design-scale-tier][selftest] FAIL:')
    for (const f of fails) console.error('  ✗ ' + f)
    return 1
  }
  console.error('[design-scale-tier] _selftest passed — F1f Layer 0 scale tier pinned from '
    + 'physics (benchtop from 20 mL/35 W despite "heater"; plant/field from m³/kW; unknown when no signal)')
  return 0
}

process.exit(main())
