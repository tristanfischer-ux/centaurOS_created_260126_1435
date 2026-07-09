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
//
// 2026-07-04 SECOND false join (fischer-codema v74, the same f9dfc2918 substring family, this time
// IN THE GATE ITSELF): `hand_watering_riser_count` (44, an engineered allowance priced only as a
// Python requirements_bom.py row — no moduleDecomposition word) bound to `dn125_riser_word` (×200,
// the UNRELATED zoned-distribution riser family) on the shared bare noun "riser", which was missing
// from GENERIC_HEADS. Test 5 proves the false join is gone (advisory-unmatched); test 6 proves a
// GENUINE drift inside a riser family that shares a real qualifier ("zone") still fires HIGH — the
// fix must not blind the gate to real riser-family drift, only to the bare-noun coincidence.

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

  // 5. THE fischer-codema v74 FALSE JOIN (2026-07-04, gate 12 itself, the f9dfc2918 substring
  //    family): `hand_watering_riser_count` (44, an engineered allowance with NO matching BoM
  //    word — it prices as a Python requirements_bom.py row, never a moduleDecomposition word)
  //    must NOT bind to `dn125_riser_word` (×200, the UNRELATED zoned-distribution riser family
  //    minted by rule 8) on the shared bare noun "riser" alone. Must stay advisory-unmatched.
  const s5 = state(
    { hand_watering_riser_count: 44 },
    [word('dn125_riser_word', 'DN125 PVC Riser', 200)],
  )
  const r5 = detectNumericDrift(s5)
  if (r5.findings.length !== 0) {
    throw new Error(`numeric-drift-matcher: hand_watering_riser_count=44 must NOT false-join "DN125 PVC Riser" (×200, a different riser family) on the bare noun "riser": ${JSON.stringify(r5.findings)}`)
  }
  if (!r5.unmatched_contract_quantities.includes('hand_watering_riser_count')) {
    throw new Error('numeric-drift-matcher: hand_watering_riser_count with no qualified BoM word must report as unmatched (advisory), not silently disappear')
  }

  // 6. COUNTER-CASE for fix #5 — "riser" joining GENERIC_HEADS must not blind the gate to a
  //    GENUINE drift within a riser family that shares a real DISTINGUISHING qualifier ("zone").
  //    zone_riser_count=300 vs "Zone Riser" ×200 is a real 33% drift and must still fire HIGH.
  const s6 = state({ zone_riser_count: 300 }, [word('zone_riser_word', 'Zone Riser', 200)])
  if (!detectNumericDrift(s6).findings.some((f) => f.severity === 'HIGH')) {
    throw new Error('numeric-drift-matcher: zone_riser_count=300 vs "Zone Riser" ×200 (qualifier "zone" shared) is a genuine drift and must still be flagged HIGH — "riser" joining GENERIC_HEADS must not over-suppress a qualified match')
  }

  // 7. THE codema-full-20260709-1328 FATAL (2026-07-09): parenthetical "(on Distribution Manifold)"
  //    on a ×2 suction isolation valve shared the claim token "distribution" and TIED score with
  //    "Pneumatic Actuated Valves" ×200 (actuated+valve vs distribution+valve). First-wins then
  //    bound the claim to ×2 → 100× HIGH drift exit 12. Parentheticals must not score; on a residual
  //    tie the closer quantity must win.
  const s7 = state(
    { actuated_distribution_valve_count: 200 },
    [
      word(
        'fertigation_dosing_pump_backup_synth_word__suction_isolation_valve',
        'Suction Isolation Valve (on Distribution Manifold) (on Distribution Manifold)',
        2,
      ),
      word('pneumatic_actuated_valves_word', 'Pneumatic Actuated Valves', 200),
    ],
  )
  const r7 = detectNumericDrift(s7)
  if (r7.findings.some((f) => f.severity === 'HIGH')) {
    throw new Error(
      `numeric-drift-matcher: parenthetical "(on Distribution Manifold)" must not false-join actuated_distribution_valve_count=200 onto a ×2 suction valve when Pneumatic Actuated Valves ×200 is present: ${JSON.stringify(r7.findings)}`,
    )
  }

  // eslint-disable-next-line no-console
  console.log('numeric-drift-matcher --selftest OK (200 actuated valves no false-drift onto a ×2 suction valve; generic-head-only = advisory; real 313→165 drift still HIGH; plural matched; v74 hand-watering/DN125-riser false join fixed; qualified zone-riser drift still HIGH; parenthetical distribution-manifold false join fixed)')
}

run()
