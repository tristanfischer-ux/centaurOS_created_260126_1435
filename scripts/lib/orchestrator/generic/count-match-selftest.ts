// proveCatch guard for the qualified-count smear fix in derive-skeleton.ts::contractCountFor
// (Tristan 2026-06-27, physics-critic "massive duplication of valve counts" HIGH).
//
// THE BUG: a QUALIFIED count quantity (`actuated_distribution_valve_count = 200`) matched every
// component sharing only its HEAD noun ("valve") — so all ~17 distinct valve words got ×200
// (~3,400 valves vs the real 200). Now a count binds only to a component that carries the head
// noun AND ≥ half the count's QUALIFIER tokens. Same fix stops biofilter_tank grabbing
// rearing_tank_count. This guard fails the build if the smear returns OR a legitimate count
// stops binding.

import { contractCountFor } from './derive-skeleton'

const C = (q: Record<string, number>) => ({
  quantities: Object.fromEntries(Object.entries(q).map(([k, v]) => [k, { value: v }])),
}) as never

function run() {
  // CASE 1 (proveCatch): the 200 actuated-distribution-valve count must NOT smear onto every valve.
  const valves = C({ actuated_distribution_valve_count: 200 })
  const bound = contractCountFor('Pneumatic Actuated Valve', valves)   // shares "actuated" + "valve"
  if (bound !== 200) throw new Error(`count-match: an actuated distribution valve word should bind 200 (got ${bound})`)
  for (const noMatch of ['Solenoid Valve', 'Manual Ball Valve', 'Check Valve', 'Sample Valve', 'Pressure Relief Valve']) {
    const n = contractCountFor(noMatch, valves)
    if (n !== 1) throw new Error(`count-match: "${noMatch}" wrongly grabbed the qualified actuated-valve count (got ${n}, want 1 — the ×200 smear regressed)`)
  }

  // CASE 2: a simple unqualified count still binds on the head noun (no regression).
  if (contractCountFor('Battery Cell', C({ cell_count: 4896 })) !== 4896) throw new Error('count-match: cell_count must bind to a Cell component')

  // CASE 3: a qualified vessel count binds to its own family, NOT a sibling sharing the head noun.
  const tanks = C({ rearing_tank_count: 10 })
  if (contractCountFor('Rearing Tank', tanks) !== 10) throw new Error('count-match: rearing_tank_count must bind to the Rearing Tank')
  if (contractCountFor('Biofilter Tank', tanks) !== 1) throw new Error('count-match: rearing_tank_count must NOT bind to a Biofilter Tank (head-noun smear)')

  // CASE 4 (cold-v5 / Block 1 closure): `per_<scope>_*` binds `<scope>_count`.
  // THE BUG: head-noun match saw "Afe"/"Stage" and left Per Channel hardware at ×1
  // while channel_count=8 sat on the ledger (or was missing entirely).
  const channels = C({ channel_count: 8 })
  for (const per of [
    'Per Channel Precision Afe',
    'per_channel_linear_source_sink_stage',
    'Per Channel Hardware Cutout',
    'per_channel_linear_discharge_pass_bank',
    'per_channel_power_heatsink',
  ]) {
    const n = contractCountFor(per, channels)
    if (n !== 8) throw new Error(`count-match: "${per}" must bind channel_count=8 via per_channel_ prefix (got ${n})`)
  }
  // P1 (Sol+Fable): bare-named CHANNEL ROLES bind channel_count — not just per_channel_*.
  // THE BUG: cold-v5 "Charge Current Source" / "Overtemp Trip" rendered ×1 while ledger=8.
  for (const bare of [
    'Charge Current Source',
    'Discharge Load Mosfet',
    'Current Shunt Measurement',
    'Cell Thermistor Input',
    'Over Under Voltage Comparator Latch',
    'Overcurrent Comparator',
    'Overtemp Trip',
    'Reverse Polarity Detector',
    'Current Control Loop',
    'Cell Holder Fixture',
  ]) {
    const n = contractCountFor(bare, channels)
    if (n !== 8) {
      throw new Error(
        `count-match: bare role "${bare}" must bind channel_count=8 via role→scope (got ${n})`,
      )
    }
  }
  // Shared / non-per roles MUST stay ×1 — ordinary "channel" qualifier is not the axis marker.
  for (const shared of [
    'Channel Power Bus',
    'Isolated AC DC Power Module',
    'Main Controller Mcu',
    'IEC C14 Fused Inlet',
    // cold-v14: airflow is a shared plenum — never ×8 axial fans
    'power_stage_cooling_fan',
    'per_channel_power_cooling_fan',
    'Shared Power-Stage Cooling Fan',
  ]) {
    const n = contractCountFor(shared, channels)
    if (n !== 1) throw new Error(`count-match: "${shared}" wrongly grabbed channel_count (got ${n}, want 1)`)
  }
  // Sizing-path smear: bare channel_count must not upgrade Channel Power Bus via stem match
  // (applyUniversalContractSizing count-only skip — see instrument-sizing heatsink block).
  // Generic axis: per_module_* binds module_count (proves the rule is not channel-special).
  if (contractCountFor('per_module_sensor', C({ module_count: 12 })) !== 12) {
    throw new Error('count-match: per_module_sensor must bind module_count=12')
  }
  // NEGATIVE (Powerwall): unqualified cell_count must NOT smear onto a sensor via containment.
  if (contractCountFor('Cell Temperature Sensor', C({ cell_count: 175 })) !== 1) {
    throw new Error('count-match: Cell Temperature Sensor must NOT bind unqualified cell_count (Powerwall smear regressed)')
  }

  // eslint-disable-next-line no-console
  console.log('count-match --selftest OK (qualified count; per_<scope>_; bare channel roles; Powerwall negative)')
}

run()
