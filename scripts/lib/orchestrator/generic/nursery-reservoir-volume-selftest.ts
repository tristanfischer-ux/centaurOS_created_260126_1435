// proveCatch for distinct nursery vs main reservoir volumes (engineering-contract.ts
// water_treatment archetype).
//
// THE BUG: brief states nursery drain reservoir 40 m³ (Ø3.64 m) vs main 91 m³ (Ø5.46 m);
// the builder only emitted main-class volumes, so nursery collapsed onto 91 m³.
// THE RULE: when the brief names a nursery pump unit AND a nursery drain reservoir volume,
// emit nursery_drain_water_tank_volume_each_m3 distinct from drain_water_tank_volume_each_m3.

import { buildContract } from '../../engineering-contract'

function qty(contract: { quantities?: Record<string, { value?: unknown }> }, key: string): number {
  const v = contract.quantities?.[key]?.value
  return typeof v === 'number' ? v : NaN
}

function run(): void {
  const briefWithNursery = {
    original_text: `
Water-handling plant. Reverse-osmosis permeate 8 cubic metres per hour.
One cleanwater reservoir, 5.46 metres diameter, approximately 91 cubic metres.
Two drain-water reservoirs, approximately 91 cubic metres each.
One nursery drain-water reservoir, 3.64 metres diameter by 3.88 metres high, approximately 40 cubic metres.
Pump Unit 1 — 90 cubic metres per hour. Pump Unit 2 — 90 cubic metres per hour.
Nursery Pump Unit — 45 cubic metres per hour serving the nursery.
Drain-water pit: one 5,000-litre concrete drain pit per zone.
`,
    product_description: 'fertigation and ebb/flow irrigation water plant',
  }
  const c = buildContract('water_treatment', briefWithNursery)
  if (!c) throw new Error('nursery-reservoir: buildContract returned null for water_treatment')
  const main = qty(c, 'drain_water_tank_volume_each_m3')
  const nursery = qty(c, 'nursery_drain_water_tank_volume_each_m3')
  const fresh = qty(c, 'fresh_water_tank_volume_each_m3')
  if (!(main >= 80 && main <= 100)) {
    throw new Error(`nursery-reservoir proveCatch: main drain reservoir must be ~91 m³ (got ${main})`)
  }
  if (!(fresh >= 80 && fresh <= 100)) {
    throw new Error(`nursery-reservoir proveCatch: cleanwater/fresh must be ~91 m³ (got ${fresh})`)
  }
  if (!(nursery >= 35 && nursery <= 45)) {
    throw new Error(`nursery-reservoir proveCatch: nursery drain reservoir must be ~40 m³ distinct from main (got ${nursery})`)
  }
  if (nursery === main) {
    throw new Error(`nursery-reservoir proveCatch: nursery volume must DIFFER from main (both ${main})`)
  }

  // proveNoFalsePositive: brief with NO nursery pump unit fabricates no nursery reservoir keys.
  const briefNoNursery = {
    original_text: `
Reverse-osmosis permeate 8 cubic metres per hour.
One cleanwater reservoir approximately 91 cubic metres.
Two drain-water reservoirs approximately 91 cubic metres each.
Pump Unit 1 — 90 cubic metres per hour. Pump Unit 2 — 90 cubic metres per hour.
`,
    product_description: 'irrigation water plant',
  }
  const c2 = buildContract('water_treatment', briefNoNursery)
  if (!c2) throw new Error('nursery-reservoir: buildContract null (no-nursery brief)')
  if (c2.quantities?.nursery_drain_water_tank_volume_each_m3 != null) {
    throw new Error('nursery-reservoir proveNoFalsePositive: must NOT mint nursery reservoir without a nursery pump unit')
  }

  // eslint-disable-next-line no-console
  console.log(`nursery-reservoir-volume --selftest OK (main ${main} m³ ≠ nursery ${nursery} m³; no-nursery brief silent)`)
}

run()
