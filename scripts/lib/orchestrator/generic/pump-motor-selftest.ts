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

import {
  explodeEquipmentSubAssemblies, reconcileDriveTrainRatings, briefPinnedQuantityKeys,
  reconcilePumpMotorAgainstStatedPressure,
} from './universal-contract-sizing'

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

  // ── NAMEPLATE MATCH (Codema ship / Sam fertigation 2026-07-09): a 4.5 kW nursery
  // pump must NOT carry a 5.5 kW drive (next IEC frame) — that is a full-frame jump
  // above the machine stamp. Small bumps (1.923→2.2 on a 2 kW drain) stay allowed.
  const modulesNursery: any = [{
    module: 'm', sub_modules: [{
      sub_module: 's', words: [
        ...mkRatedPump('Nursery Fertigation Dosing Pump', '4.5', '5.5'),
      ],
    }],
  }]
  const qN: Record<string, number> = { nursery_fertigation_dosing_pump_power_kw: 4.5 }
  const repairedN = reconcileDriveTrainRatings(modulesNursery, qN, new Set())
  if (repairedN < 1) throw new Error('pump-motor: nursery fertigation 5.5→4.5 nameplate match must repair')
  let nurseryM = 0
  for (const m of modulesNursery) for (const sm of m.sub_modules) for (const w of sm.words) {
    if (String(w.id) === 'nursery_fertigation_dosing_pump_synth_word__drive_motor') {
      nurseryM = parseFloat(String((w.modifier_characters || []).find((x: any) => x.kind === 'rating_primary')?.value)) || 0
    }
  }
  if (nurseryM !== 4.5) {
    throw new Error(`pump-motor: nursery fertigation motor must match 4.5 kW nameplate (got ${nurseryM} — was the 5.5 IEC jump)`)
  }

  // Valve fittings must NEVER re-explode as pumps (nested drive under isolation valve).
  const modulesValve: any = [{
    module: 'm', sub_modules: [{
      sub_module: 's', words: [
        {
          id: 'nursery_fertigation_dosing_pump_synth_word', name_human: 'Nursery Fertigation Dosing Pump',
          content_character: { character_id: 'nursery_fertigation_dosing_pump_synth', name_human: 'Nursery Fertigation Dosing Pump' },
          modifier_characters: [{ kind: 'quantity', value: '×1' }, { kind: 'rating_primary', value: '4.5', unit: 'kW' }],
        },
        {
          id: 'nursery_fertigation_dosing_pump_synth_word__suction_isolation_valve',
          name_human: 'Suction Isolation Valve (on Nursery Fertigation Dosing Pump)',
          content_character: {
            character_id: 'nursery_fertigation_dosing_pump_synth_word__suction_isolation_valve',
            name_human: 'Suction Isolation Valve (on Nursery Fertigation Dosing Pump)',
          },
          modifier_characters: [{ kind: 'quantity', value: '×1' }, { kind: 'rating_primary', value: '4.5', unit: 'kW' }],
        },
      ],
    }],
  }]
  explodeEquipmentSubAssemblies(modulesValve, qN)
  const nestedDrive = (modulesValve[0].sub_modules[0].words as any[]).some((w) =>
    /suction_isolation_valve__drive_motor/i.test(String(w.id || '')))
  if (nestedDrive) {
    throw new Error('pump-motor: isolation valve must not re-explode a nested Drive Motor')
  }

  // ── PUMP MOTOR vs BRIEF-STATED PRESSURE (Tristan 2026-07-08 — the Codema 90 m³/h @ 2.9
  // bar physics-critic "undersized 11 kW" HIGH). proveCatch: a family's hydraulic-tool
  // motor_kw (9.653 → single-rounds to 11 kW) undershoots the brief's OWN stated 2.9 bar
  // discharge pressure for that same family (11.16 kW required → next frame 15 kW) — the
  // cross-check must LIFT it to 15. proveNoFalsePositive: a brief-pinned nameplate is
  // never re-margined; a dosing pump with no m³/h flow sibling never binds despite a stem
  // overlap; a family whose own requirement is already adequate is left untouched; an
  // archetype with no brief-stated pump pressure at all (RAS/CO2/BESS) is a strict no-op.
  const q3: Record<string, number> = {
    irrigation_pump_flow_m3_h: 90,
    irrigation_pump_motor_kw: 9.653, // hydraulic tool's own (too-low-head) figure
    fertigation_dosing_pump_power_kw: 7.5, // dosing pump — NO m3/h flow sibling → must not bind
    hand_watering_pump_flow_m3_h: 25,
    hand_watering_pump_motor_kw: 4.0, // already brief-pinned nameplate
  }
  const contract3: any = { quantities: {
    irrigation_pump_motor_kw: { value: 9.653, source: 'tool:irrigation:pump-sizing' },
    hand_watering_pump_motor_kw: { value: 4.0, source: 'brief' },
  } }
  const briefMetrics3 = [
    { key_metric: 'fertigation_pump_pressure_bar', value: 2.9, unit: 'bar', category: 'performance' },
    { key_metric: 'hand_watering_pressure_bar', value: 3.3, unit: 'bar', category: 'performance' },
  ]
  const corrected3 = reconcilePumpMotorAgainstStatedPressure(q3, contract3, briefMetrics3)
  if (q3.irrigation_pump_motor_kw !== 15) {
    throw new Error(`pump-motor: irrigation (fertigation-synonym) motor did not lift to 15 kW against the brief's 2.9 bar duty (got ${q3.irrigation_pump_motor_kw})`)
  }
  if (corrected3.length !== 1 || corrected3[0].key !== 'irrigation_pump_motor_kw') {
    throw new Error(`pump-motor: expected exactly one correction (irrigation_pump_motor_kw), got ${JSON.stringify(corrected3)}`)
  }
  if (q3.fertigation_dosing_pump_power_kw !== 7.5) {
    throw new Error(`pump-motor: dosing pump (no m3/h flow sibling) must never bind despite the 'fertigation' stem overlap (got ${q3.fertigation_dosing_pump_power_kw})`)
  }
  if (q3.hand_watering_pump_motor_kw !== 4.0) {
    throw new Error(`pump-motor: brief-pinned hand-watering nameplate must never be re-margined (got ${q3.hand_watering_pump_motor_kw})`)
  }
  // idempotent: a second pass changes nothing (already at the correct frame)
  const corrected3b = reconcilePumpMotorAgainstStatedPressure(q3, contract3, briefMetrics3)
  if (corrected3b.length !== 0) throw new Error(`pump-motor: pressure reconcile must be idempotent (second pass = 0 corrections, got ${corrected3b.length})`)
  // an ALREADY-adequate family (no brief pressure lower than its current sizing) is untouched
  const q4: Record<string, number> = { recirc_pump_flow_m3_h: 50, recirc_pump_motor_kw: 30 }
  reconcilePumpMotorAgainstStatedPressure(q4, undefined, [{ key_metric: 'recirc_pump_pressure_bar', value: 1.0, unit: 'bar' }])
  if (q4.recirc_pump_motor_kw !== 30) throw new Error(`pump-motor: an adequately-sized pump must never be lowered (got ${q4.recirc_pump_motor_kw})`)
  // strict no-op when the brief states no pump discharge pressure at all (RAS/CO2/BESS)
  const q5: Record<string, number> = { recirc_pump_flow_m3_h: 1704, recirc_pump_motor_kw: 99 }
  const corrected5 = reconcilePumpMotorAgainstStatedPressure(q5, undefined, [])
  if (corrected5.length !== 0 || q5.recirc_pump_motor_kw !== 99) throw new Error('pump-motor: no brief pump pressure metric → must be a strict no-op')

  // PLANT-WIDE / GENERIC pump pressure (the LIVE codema-pump run defect: the brief-parser
  // named the metric generically 'pump_pressure_bar' = 2.9, which reduces to NO family
  // token — a family-specific matcher would skip it. It is the brief's global "each at
  // ~2.9 bar" and MUST apply as a floor to every bulk-flow delivery pump family).
  const q6: Record<string, number> = {
    irrigation_pump_flow_m3_h: 90,
    irrigation_pump_motor_kw: 9.653, // tool's low-head figure → single-rounds to 11
    fertigation_dosing_pump_power_kw: 7.5, // dosing pump: no m3/h sibling → must not bind
  }
  const corrected6 = reconcilePumpMotorAgainstStatedPressure(q6, undefined, [
    { key_metric: 'pump_pressure_bar', value: 2.9, unit: 'bar', category: 'performance' },
  ])
  if (q6.irrigation_pump_motor_kw !== 15) throw new Error(`pump-motor: a plant-wide 'pump_pressure_bar' = 2.9 must lift the 90 m³/h delivery pump 9.653→15 kW (got ${q6.irrigation_pump_motor_kw})`)
  if (q6.fertigation_dosing_pump_power_kw !== 7.5) throw new Error(`pump-motor: a plant-wide pressure must NOT over-motor a dosing pump with no m³/h flow sibling (got ${q6.fertigation_dosing_pump_power_kw})`)
  if (corrected6.length !== 1) throw new Error(`pump-motor: plant-wide pressure expected exactly one correction (got ${JSON.stringify(corrected6)})`)
  // a family-specific metric still wins where present, and a distinctive non-pump pressure
  // (reactor_pressure_bar) is NOT global — it never touches a pump family.
  const q7: Record<string, number> = { recirc_pump_flow_m3_h: 50, recirc_pump_motor_kw: 4 }
  reconcilePumpMotorAgainstStatedPressure(q7, undefined, [{ key_metric: 'reactor_pressure_bar', value: 25, unit: 'bar' }])
  if (q7.recirc_pump_motor_kw !== 4) throw new Error(`pump-motor: a distinctive 'reactor_pressure_bar' must never act as a global pump pressure (got ${q7.recirc_pump_motor_kw})`)

  // proveCatch: metering/trim acid dosing (0.04 kW) must NEVER IEC-frame to 0.75/1 kW
  // (Codema ship Acid Dosing Pump · 0 kW / Drive Motor 1 kW, 2026-07-09).
  const acidMods: any = [{
    module: 'm', sub_modules: [{
      sub_module: 's', words: [mkPump('Acid Dosing Pump', '0.04')],
    }],
  }]
  explodeEquipmentSubAssemblies(acidMods, {
    acid_dosing_pump_power_kw: 0.04,
    acid_dosing_pump_throughput_m3_h: 0.04,
  })
  const acidMotor = motorOf(acidMods, 'acid_dosing_pump')
  if (Math.abs(acidMotor - 0.04) > 1e-9) {
    throw new Error(`pump-motor: acid metering motor must stay 0.04 kW (never IEC-frame to 0.75/1); got ${acidMotor}`)
  }

  // proveCatch (Codema 1820): UV / disinfection `_power_kw` must NEVER bind the hydraulic
  // duty cross-check — `_throughput_m3_h` is treated flow, not pumped head. A UV reactor
  // at the dose rule (~10 kW) must stay put when a plant-wide pump_pressure_bar exists.
  const qUv: Record<string, number> = {
    uv_disinfection_throughput_m3_h: 225,
    uv_disinfection_power_kw: 10.1,
    irrigation_pump_flow_m3_h: 90,
    irrigation_pump_motor_kw: 9.653,
  }
  const correctedUv = reconcilePumpMotorAgainstStatedPressure(qUv, undefined, [
    { key_metric: 'pump_pressure_bar', value: 2.9, unit: 'bar', category: 'performance' },
  ])
  if (qUv.uv_disinfection_power_kw !== 10.1) {
    throw new Error(`pump-motor: UV disinfection power must NEVER lift via hydraulic duty cross-check (got ${qUv.uv_disinfection_power_kw})`)
  }
  if (correctedUv.some((c) => c.key === 'uv_disinfection_power_kw')) {
    throw new Error(`pump-motor: UV key must not appear in pressure corrections (got ${JSON.stringify(correctedUv)})`)
  }
  if (qUv.irrigation_pump_motor_kw !== 15) {
    throw new Error(`pump-motor: irrigation pump must still lift 9.653→15 against plant-wide 2.9 bar (got ${qUv.irrigation_pump_motor_kw})`)
  }

  // eslint-disable-next-line no-console
  console.log(`pump-motor --selftest OK (irrigation=${irr}kW binds contract; drain=${drn}kW per-pump; hand=${hand}kW heuristic fallback, no decoy leak; drive-train reconcile: pinned 7.5/4.2 honoured exactly, tool 1.923→2.2 single-rounded, all v56d pairs within 1.25×, genuine 20-vs-7.5 conflict still fires, idempotent; brief-pressure cross-check: 90m³/h@2.9bar lifts 9.653→15kW, dosing pump + pinned nameplate + already-adequate family + no-pressure-metric archetype all untouched, idempotent; acid metering 0.04 kW preserved; UV power never hydraulic-lifted)`)
}

run()
