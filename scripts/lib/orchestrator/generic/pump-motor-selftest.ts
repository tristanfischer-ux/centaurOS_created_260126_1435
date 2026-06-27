// proveCatch guard for the pump motor/VSD "consume-the-contract" fix in
// universal-contract-sizing.ts (Tristan 2026-06-27, physics-critic Risk-tab work).
//
// A flow-rated pump (rating_primary in m³/h, so p.kw=0) used to collapse its Drive Motor +
// VSD to the 1.5 kW floor because the motorKw() heuristic ignores head. The hydraulic sizing
// tool already computes the real motor power into the contract (e.g. irrigation_pump_motor_kw
// = 9.653); explodeEquipmentSubAssemblies now binds it by stem. This guard fails the build if
// that binding regresses (e.g. a stemming change re-breaks the key↔word match).
//
// Standalone (not a --selftest block inside the big module) so importing universal-contract-
// sizing never accidentally trips a CLI path. Wired into verify-engine-guards.sh.

import { explodeEquipmentSubAssemblies } from './universal-contract-sizing'

function motorOf(modules: any, parentId: string): number {
  for (const m of modules) for (const sm of m.sub_modules) for (const w of sm.words) {
    if (/drive motor/i.test(w.name_human || '') && String(w.id).startsWith(parentId)) {
      const r = (w.modifier_characters || []).find((x: any) => x.kind === 'rating_primary')
      return parseFloat(String(r?.value)) || 0
    }
  }
  return 0
}

function mkPump(name: string, flowM3h: string) {
  const slug = name.toLowerCase().replace(/\W+/g, '_')
  return {
    id: `${slug}_synth_word`, name_human: name,
    content_character: { character_id: `${slug}_synth`, name_human: name },
    modifier_characters: [
      { kind: 'quantity', value: '×1' },
      { kind: 'rating_primary', value: flowM3h, unit: 'm³/h' },
    ],
  }
}

function run() {
  const modules: any = [{
    module: 'm', sub_modules: [{
      sub_module: 's', words: [
        mkPump('Irrigation Pump', '90'),      // has contract motor_kw → must bind ~9.65
        mkPump('Drain Transfer Pump', '20'),  // has contract power_kw → must bind ~1.92
        mkPump('Hand Watering Pump', '25'),   // NO contract value → heuristic fallback
      ],
    }],
  }]
  const quantities = {
    irrigation_pump_motor_kw: 9.653,
    drain_transfer_pump_power_kw: 1.923,
    fertigation_dosing_pump_power_kw: 7.5, // a decoy that must NOT bind to any pump above
  }
  explodeEquipmentSubAssemblies(modules, quantities)

  const irr = motorOf(modules, 'irrigation_pump')
  const drn = motorOf(modules, 'drain_transfer_pump')
  const hand = motorOf(modules, 'hand_watering_pump')

  // Irrigation pump MUST reflect the contract hydraulic motor (~9.65, R2→10), NOT the 1.5–2
  // kW flow-heuristic floor. This is the exact bug: 90 m³/h @ 3.5 bar needs ~10 kW.
  if (irr < 8) throw new Error(`pump-motor: irrigation pump motor ${irr} kW did not bind the contract 9.653 kW (regressed to the flow floor)`)
  // Drain pump binds its own (smaller) contract value — proves per-pump stem binding, not a global.
  if (drn < 1.5 || drn > 3) throw new Error(`pump-motor: drain pump motor ${drn} kW did not bind its contract 1.923 kW`)
  // Hand-watering has no contract value → heuristic fallback (small), proving we don't mis-bind
  // the fertigation decoy (7.5) to it.
  if (hand > 4) throw new Error(`pump-motor: hand-watering pump motor ${hand} kW wrongly bound a foreign contract value (decoy leak)`)

  // eslint-disable-next-line no-console
  console.log(`pump-motor --selftest OK (irrigation=${irr}kW binds contract; drain=${drn}kW per-pump; hand=${hand}kW heuristic fallback, no decoy leak)`)
}

run()
