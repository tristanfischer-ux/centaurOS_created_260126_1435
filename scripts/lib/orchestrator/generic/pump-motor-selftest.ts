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

import { explodeEquipmentSubAssemblies, reconcileDriveTrainRatings, briefPinnedQuantityKeys } from './universal-contract-sizing'

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
  // Hand-watering has no contract motor_kw → heuristic fallback. It must (a) NOT bind the
  // fertigation decoy (7.5) and (b) be a REALISTIC flow-only estimate (25 m³/h @ ~2.5 bar default
  // ≈ 2.8 kW), NOT the old absurd m3h/120 → 1.5 floor (the physics-critic "2 kW undersized" HIGH).
  if (hand > 4) throw new Error(`pump-motor: hand-watering pump motor ${hand} kW wrongly bound a foreign contract value (decoy leak)`)
  if (hand < 2.5) throw new Error(`pump-motor: hand-watering pump motor ${hand} kW is the old absurd flow heuristic (m3h/120) — a 25 m³/h pump needs ~2.8 kW, not the 1.5 floor`)

  // ── DRIVE-TRAIN RATING RULE (Tristan 2026-07-03 — the v56c/v56d corroborated rating-pair
  // defects): a brief-PINNED machine rating is honoured EXACTLY by the drive (7.5 kW Lowara
  // → 7.5 kW motor, never 8.6 → 11 via a stacked ×1.15); a computed requirement gets a
  // SINGLE IEC-frame rounding (1.923 → 2.2, not 2.21 → 3). Every repaired pair must sit
  // within the audit's 1.25× motor-service tolerance; a genuine machine↔pin conflict
  // (20 kW machine on a 7.5 kW pinned drive) still exceeds it — the sweep still fires.
  const mkRatedPump = (name: string, kw: string, motorKw: string) => {
    const slug = name.toLowerCase().replace(/\W+/g, '_')
    return [
      {
        id: `${slug}_synth_word`, name_human: name,
        content_character: { character_id: `${slug}_synth`, name_human: name },
        modifier_characters: [{ kind: 'quantity', value: '×1' }, { kind: 'rating_primary', value: kw, unit: 'kW' }],
      },
      {
        id: `${slug}_synth_word__drive_motor`, name_human: 'Drive Motor',
        content_character: { character_id: `${slug}_synth_word__drive_motor`, name_human: 'Drive Motor' },
        modifier_characters: [{ kind: 'quantity', value: '×1' }, { kind: 'rating_primary', value: motorKw, unit: 'kW' }],
      },
    ]
  }
  const modules2: any = [{
    module: 'm', sub_modules: [{
      sub_module: 's', words: [
        // the three v56d corroborated defects, as shipped (old stacked-margin mints):
        ...mkRatedPump('Fertigation Dosing Pump', '8', '11'),   // brief pin 7.5 → motor 7.5
        ...mkRatedPump('Ro High Pressure Pump', '4.2', '5.5'),  // brief pin 4.2 → motor 4.2
        ...mkRatedPump('Drain Transfer Pump', '2', '3'),        // tool 1.923 → frame 2.2
        // a genuine machine↔pin conflict the repair must NOT mask:
        ...mkRatedPump('Oversize Conflict Pump', '20', '7.5'),
      ],
    }],
  }]
  const q2: Record<string, number> = {
    fertigation_dosing_pump_power_kw: 7.5,
    ro_high_pressure_pump_power_kw: 4.2,
    drain_transfer_pump_power_kw: 1.923,
    oversize_conflict_pump_power_kw: 7.5,
  }
  const contract2: any = { quantities: {
    fertigation_dosing_pump_power_kw: { value: 7.5, source: 'brief' },
    ro_high_pressure_pump_power_kw: { value: 4.2, source: 'brief' },
    drain_transfer_pump_power_kw: { value: 1.923, source: 'tool:process:pump-sizing' },
    oversize_conflict_pump_power_kw: { value: 7.5, source: 'brief' },
  } }
  const pinned = briefPinnedQuantityKeys(contract2)
  if (!pinned.has('fertigation_dosing_pump_power_kw') || pinned.has('drain_transfer_pump_power_kw')) {
    throw new Error('pump-motor: briefPinnedQuantityKeys must key on source === brief only')
  }
  const repaired = reconcileDriveTrainRatings(modules2, q2, pinned)
  if (repaired < 3) throw new Error(`pump-motor: drive-train reconcile repaired ${repaired} pairs, want ≥3 (fertigation/RO/drain)`)
  const motor2 = (parentSlug: string): number => {
    for (const m of modules2) for (const sm of m.sub_modules) for (const w of sm.words) {
      if (String(w.id) === `${parentSlug}_synth_word__drive_motor`) {
        return parseFloat(String((w.modifier_characters || []).find((x: any) => x.kind === 'rating_primary')?.value)) || 0
      }
    }
    return 0
  }
  const fert = motor2('fertigation_dosing_pump')
  const ro = motor2('ro_high_pressure_pump')
  const drn2 = motor2('drain_transfer_pump')
  if (fert !== 7.5) throw new Error(`pump-motor: fertigation motor ${fert} kW must honour the brief-pinned 7.5 kW Lowara exactly (never 11)`)
  if (ro !== 4.2) throw new Error(`pump-motor: RO motor ${ro} kW must honour the brief-pinned 4.2 kW exactly (never 5.5)`)
  if (drn2 !== 2.2) throw new Error(`pump-motor: drain motor ${drn2} kW must be the single IEC rounding of 1.923 (2.2, never ×1.15 → 3)`)
  // corroboration tolerance (mirror of dossier_audit._RATING_PAIR_SERVICE_TOL = 1.25):
  const tol = (a: number, b: number): number => Math.max(a, b) / Math.min(a, b)
  if (tol(8, fert) > 1.25 || tol(4.2, ro) > 1.25 || tol(2, drn2) > 1.25) {
    throw new Error(`pump-motor: a repaired v56d pair still exceeds the 1.25× corroboration tolerance (fert ${tol(8, fert).toFixed(2)}, ro ${tol(4.2, ro).toFixed(2)}, drain ${tol(2, drn2).toFixed(2)})`)
  }
  // the genuine conflict is repaired TO THE PIN (7.5) but the machine says 20 kW — the
  // corroboration sweep must STILL fire on it (an honest data conflict is never masked):
  const conflict = motor2('oversize_conflict_pump')
  if (!(tol(20, conflict) > 1.25)) {
    throw new Error(`pump-motor: the 20 kW machine ↔ 7.5 kW pinned drive conflict was masked (motor ${conflict} kW) — a genuinely divergent pair must still fire the sweep`)
  }
  // idempotent: a second pass changes nothing
  if (reconcileDriveTrainRatings(modules2, q2, pinned) !== 0) {
    throw new Error('pump-motor: drive-train reconcile must be idempotent (second pass = 0 repairs)')
  }

  // eslint-disable-next-line no-console
  console.log(`pump-motor --selftest OK (irrigation=${irr}kW binds contract; drain=${drn}kW per-pump; hand=${hand}kW heuristic fallback, no decoy leak; drive-train reconcile: pinned 7.5/4.2 honoured exactly, tool 1.923→2.2 single-rounded, all v56d pairs within 1.25×, genuine 20-vs-7.5 conflict still fires, idempotent)`)
}

run()
