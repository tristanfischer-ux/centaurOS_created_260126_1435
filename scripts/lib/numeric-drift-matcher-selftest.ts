// proveCatch for the numeric-claim-drift-detector MATCHER precision fix (Tristan 2026-06-29, the
// Codema gate-12 FATAL false-positive).
//
// THE BUG: detectNumericDrift bound `actuated_distribution_valve_count = 200` to the WRONG valve
// word — a singular "Suction Isolation Valve" (×2) — because (a) the search term "valve" did not
// match the plural "Valves" of the real ×200 "Pneumatic Actuated Valves" word, and (b) the bare
// generic head "valve" matched ANY valve. Result: a false 100× drift → gate-12 exit(12), a clean
// design failed to ship. THE FIX: singular/plural-insensitive tokens + score by the COUNT of shared
// base tokens (the more-qualified word wins) + reject a multi-token claim that shares ONLY a generic
// head noun (ambiguous → advisory unmatched, never a HIGH). This guard fails the build on regression.

import { detectNumericDrift } from './numeric-claim-drift-detector'

function word(id: string, name: string, qty: number) {
  return { id, name_human: name, content_character: { character_id: id, name_human: name }, modifier_characters: [{ kind: 'quantity', value: `×${qty}` }] }
}
function state(quantities: Record<string, number>, words: unknown[]) {
  const q: Record<string, { value: number }> = {}
  for (const [k, v] of Object.entries(quantities)) q[k] = { value: v }
  return { orchestratorContract: { quantities: q }, moduleDecomposition: { modules: [{ module: 'm', sub_modules: [{ id: 's', words }] }] } }
}

function run() {
  // 1. THE FATAL false-positive: 200 actuated valves + a ×2 suction isolation valve present.
  //    The 200 must bind to the ×200 actuated word (0 drift) or stay unmatched — NEVER the ×2 word.
  const s1 = state(
    { actuated_distribution_valve_count: 200 },
    [word('pneumatic_actuated_valves', 'Pneumatic Actuated Valves', 200),
      word('suction_isolation_valve', 'Suction Isolation Valve', 2)],
  )
  const r1 = detectNumericDrift(s1)
  if (r1.findings.some((f) => f.severity === 'HIGH')) {
    throw new Error(`numeric-drift-matcher: actuated_distribution_valve_count=200 produced a HIGH drift — it must bind to "Pneumatic Actuated Valves" (×200, plural) not "Suction Isolation Valve" (×2): ${JSON.stringify(r1.findings)}`)
  }

  // 2. AMBIGUITY GUARD: with ONLY a generic-head-only candidate (no qualified word), a multi-token
  //    claim must NOT false-drift — it is unmatched (advisory), not a HIGH.
  const s2 = state({ actuated_distribution_valve_count: 200 }, [word('suction_isolation_valve', 'Suction Isolation Valve', 2)])
  if (detectNumericDrift(s2).findings.some((f) => f.severity === 'HIGH')) {
    throw new Error('numeric-drift-matcher: a generic-head-only match (just "valve") must be advisory-unmatched, never a HIGH drift')
  }

  // 3. COUNTER-CASE — a GENUINE drift must STILL be caught (don't over-suppress): the contract says
  //    313 bms slave boards, the BoM word "BMS Slave Board" has ×165 → a real HIGH.
  const s3 = state({ bms_slave_count: 313 }, [word('bms_slave_board', 'BMS Slave Board', 165)])
  if (!detectNumericDrift(s3).findings.some((f) => f.severity === 'HIGH')) {
    throw new Error('numeric-drift-matcher: a real 313-vs-165 BMS-slave drift must STILL be flagged HIGH (the fix must not over-suppress)')
  }

  // 4. PLURAL: a claim count bound to the correct plural word with the SAME value → no drift.
  const s4 = state({ rack_count: 12 }, [word('battery_racks', 'Battery Racks', 12)])
  if (detectNumericDrift(s4).findings.length !== 0) {
    throw new Error('numeric-drift-matcher: rack_count=12 vs "Battery Racks" ×12 must be 0 drift (plural-insensitive)')
  }

  // eslint-disable-next-line no-console
  console.log('numeric-drift-matcher --selftest OK (200 actuated valves no false-drift onto a ×2 suction valve; generic-head-only = advisory; real 313→165 drift still HIGH; plural matched)')
}

run()
