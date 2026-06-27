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

  // eslint-disable-next-line no-console
  console.log('count-match --selftest OK (qualified count binds to its family only; no head-noun smear; simple counts intact)')
}

run()
