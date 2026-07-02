// proveCatch guard for the field-instrument "never size as a machine" fix in
// universal-contract-sizing.ts (Tristan 2026-06-27, physics-critic Risk-tab PHYSICS-FIRST work).
//
// THE BUG it catches: a skeleton / padding instrument word (e.g. a generic 'Pressure
// Transducer' the skeleton padded into sensing_instrumentation) carries no `_instrument`
// flag, so it was eligible for the contract-quantity fuzzy match in applyUniversalContractSizing.
// It then matched a small power group and got stamped boxFromRatingKw(~2)=600×510×660 mm + a
// "2 kW" rating — the physics-critic HIGH "pressure transducer rated 2 kW, off by four orders
// of magnitude" AND the shared default box that littered the GA. The fix makes instrument
// detection NAME-based (FIELD_INSTRUMENT_RE, mirroring ga_massing.py) and skips such words in
// the sizing loop. This guard fails the build if an instrument word ever re-acquires a kW
// rating / machine box, OR if the skip over-reaches and a real machine stops being sized.
//
// Standalone (not a --selftest block inside the big module). Wired into verify-engine-guards.sh.

import { applyUniversalContractSizing, reconcilePrincipalEquipment, synthesizeInstrumentation } from './universal-contract-sizing'

function modsOf(modules: any, name: string): any[] {
  for (const m of modules) for (const sm of m.sub_modules) for (const w of sm.words) {
    if ((w.name_human || '') === name) return w.modifier_characters || []
  }
  return []
}
function hasKwRating(mods: any[]): boolean {
  return mods.some((x) => x.kind === 'rating_primary' && /kw/i.test(String(x.unit ?? '')))
}
function hasBoxDim(mods: any[]): boolean {
  return mods.some((x) => (x.kind === 'dimension' || x.kind === 'dimensions') && /\d+x\d+x\d+\s*mm/i.test(String(x.value ?? '')))
}

function word(name: string) {
  const slug = name.toLowerCase().replace(/\W+/g, '_')
  return {
    id: `${slug}_word`, name_human: name,
    content_character: { character_id: slug, name_human: name },
    modifier_characters: [{ kind: 'quantity', value: '×2' }],
  }
}

function run() {
  const modules: any = [{
    module: 'sensing_instrumentation', sub_modules: [{
      sub_module: 's', words: [
        word('Pressure Transducer'),    // INSTRUMENT — must NOT be sized as a kW machine
        word('Conductivity Sensor'),    // INSTRUMENT
        word('Silica Analyser'),        // INSTRUMENT
        word('Transfer Pump'),          // REAL machine — MUST still be sized from the contract
      ],
    }],
  }]
  // A small ~2 kW quantity is exactly what the instrument used to fuzzy-match; the pump kW is
  // the legitimate driver for the Transfer Pump.
  const contract: any = {
    quantities: {
      transfer_pump_power_kw: { value: 11 },
      // a small power that the old fuzzy match would have stamped onto an instrument:
      sample_pump_power_kw: { value: 2 },
    },
  }
  applyUniversalContractSizing(modules as never[], contract, { synthesizeMissing: false, dedupeAndStrip: false, explode: false, instrument: false })

  for (const inst of ['Pressure Transducer', 'Conductivity Sensor', 'Silica Analyser']) {
    const m = modsOf(modules, inst)
    if (hasKwRating(m)) throw new Error(`instrument-sizing: "${inst}" was stamped a kW rating — a field instrument must never be sized as a powered machine (physics-critic "2 kW transducer" regressed)`)
    if (hasBoxDim(m)) throw new Error(`instrument-sizing: "${inst}" was stamped a WxDxH machine box — a field instrument is a P&ID tag, not 3-D massing`)
  }
  // Counter-case: the real Transfer Pump MUST still be sized (the skip is instrument-only, not
  // an over-broad "skip everything in sensing_instrumentation").
  const pump = modsOf(modules, 'Transfer Pump')
  if (!hasKwRating(pump)) throw new Error('instrument-sizing: the real Transfer Pump lost its contract kW rating — the instrument skip over-reached')

  // CONSOLIDATED LEVEL RANGE must span the TALLEST served vessel (Tristan 2026-06-29 physics HIGH:
  // a 0–1.4 m guided-radar consolidated onto a 1.6 m nutrient tank = unmonitored dead zone). The
  // host is the largest by CAPACITY (the wide shallow sump, 1.4 m) but the range must cover the
  // taller nutrient tank (1.6 m).
  const lvlModules: any = [{
    module: 'mass_fluid_transport_process', sub_modules: [{
      sub_module: 's', words: [
        { id: 'sump_word', name_human: 'Drain Collection Sump', content_character: { character_id: 'sump', name_human: 'Drain Collection Sump' }, modifier_characters: [{ kind: 'dimension', value: '2.1 m dia x 1.4 m' }, { kind: 'quantity', value: '×1' }], _synthesized: true },
        { id: 'nutrient_tank_word', name_human: 'Nutrient Tank', content_character: { character_id: 'nutrient_tank', name_human: 'Nutrient Tank' }, modifier_characters: [{ kind: 'dimension', value: '1.0 m dia x 1.6 m' }, { kind: 'quantity', value: '×8' }], _synthesized: true },
      ],
    }],
  }]
  synthesizeInstrumentation(lvlModules as never[], {})
  const lvl = modsOf(lvlModules, 'Level Transmitter')
  const lvlRange = String(lvl.find((x) => x.kind === 'rating_primary')?.value ?? '')
  // With the STANDARD-range rule (codema v50) the consolidated range is the next standard
  // range ≥ the TALLEST served vessel: 1.6 m tank → 0–2 m (never the 1.4 m sump host range).
  if (!/0–2\s*m/.test(lvlRange)) throw new Error(`instrument-sizing: consolidated LEVEL range "${lvlRange}" must be the next STANDARD range ≥ the tallest served vessel (1.6 m → 0–2 m), not the largest-capacity host (1.4 m sump)`)

  // ── LT RANGE FROM HOST VESSEL HEIGHT (codema v50 physics-critic HIGH) ──────────────
  // A 3.7 m-tall vessel needs the next STANDARD range ≥ 3.7 m → 0–4 m. A 0–1.4 m or a raw
  // "0–3.7 m" custom span both regress this.
  const tallModules: any = [{
    module: 'mass_fluid_transport_process', sub_modules: [{
      sub_module: 's', words: [
        { id: 'fresh_water_tank_synth_word', name_human: 'Fresh Water Tank', content_character: { character_id: 'fresh_water_tank_synth', name_human: 'Fresh Water Tank' }, modifier_characters: [{ kind: 'dimension', value: '3.7 m dia x 3.7 m' }, { kind: 'capacity', value: '40', unit: 'm³' }, { kind: 'quantity', value: '×1' }], _synthesized: true },
      ],
    }],
  }]
  synthesizeInstrumentation(tallModules as never[], {})
  const tallLvl = modsOf(tallModules, 'Level Transmitter')
  const tallRange = String(tallLvl.find((x) => x.kind === 'rating_primary')?.value ?? '')
  if (!/0–4\s*m/.test(tallRange)) throw new Error(`instrument-sizing: a 3.7 m vessel's LT range must be the next STANDARD range ≥ its height (0–4 m), got "${tallRange}" — the 0–1.4 m-on-a-3.7 m-tank bug regressed`)

  // ── CLEANING-SERVICE (CIP) VESSEL: one-charge rule (codema v50 physics-critic HIGH) ──
  // A "Cip Tank"/"Cleaning Tank" on an 8 m³/h plant must size ≤2 m³ (one cleaning-solution
  // recirculation charge), must NOT adopt the 40 m³ fresh-water STORAGE group via the shared
  // 'tank' stem — and the REAL storage tank must still be synthesised at 40 m³ (the false
  // match used to suppress it), proving a plain storage tank is NOT clamped by the CIP rule.
  const cipModules: any = [
    { module: 'mass_fluid_transport_process', sub_modules: [{ sub_module: 'sm', words: [] }] },
    { module: 'maintenance_serviceability', sub_modules: [{ sub_module: 'maint', words: [
      { id: 'cip_tank_word', name_human: 'Cip Tank', content_character: { character_id: 'cip_tank', name_human: 'Cip Tank' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
      { id: 'cleaning_tank_word', name_human: 'Cleaning Tank', content_character: { character_id: 'cleaning_tank', name_human: 'Cleaning Tank' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
    ] }] },
  ]
  const cipContract: any = { quantities: {
    fresh_water_tank_volume_each_m3: { value: 40 },
    fresh_water_tank_count: { value: 1 },
    ro_permeate_flow_m3_h: { value: 8 }, // the plant's hourly design flow → charge = 0.15×8 = 1.2 m³
  } }
  applyUniversalContractSizing(cipModules as never[], cipContract, { synthesizeMissing: true, dedupeAndStrip: false, explode: false, instrument: false })
  const capOf = (name: string): number => {
    const c = modsOf(cipModules, name).find((x) => x.kind === 'capacity' && /m³|m3/.test(String(x.unit ?? '')))
    return c ? parseFloat(String(c.value)) || 0 : 0
  }
  for (const nm of ['Cip Tank', 'Cleaning Tank']) {
    const cap = capOf(nm)
    if (!(cap > 0)) throw new Error(`instrument-sizing: "${nm}" was left unsized — the cleaning-service vessel must size to one recirculation charge`)
    if (cap > 2) throw new Error(`instrument-sizing: "${nm}" sized ${cap} m³ — a CIP/cleaning vessel on an 8 m³/h plant must be ≤2 m³ (one cleaning charge), never the plant-storage default (the 40 m³ Cleaning/Cip Tank bug regressed)`)
  }
  const freshCap = capOf('Fresh Water Tank')
  if (Math.abs(freshCap - 40) > 0.01) throw new Error(`instrument-sizing: the REAL Fresh Water Tank must still be synthesised at its contract 40 m³ (got ${freshCap}) — either the CIP clamp over-reached onto plain storage, or the false cleaning-word match suppressed its synthesis again`)

  // ── SECOND-PATH COVERAGE (the "synthesis runs in TWO paths" trap) ───────────────────
  // A principal fluid vessel minted by reconcilePrincipalEquipment (NOT by the generator-time
  // sizing pass) must STILL get level instrumentation, ranged off its own height (3.7 m → 0–4 m).
  const recModules: any = [
    { module: 'mass_fluid_transport_process', sub_modules: [{ id: 'sm', words: [] }] },
    { module: 'sensing_instrumentation', sub_modules: [{ id: 'sensing_instrumentation__x', words: [] }] },
  ]
  const rec = reconcilePrincipalEquipment(recModules as never[], cipContract)
  if (rec.synthesizedMissing < 1) throw new Error('instrument-sizing: reconcile did not re-mint the missing Fresh Water Tank principal (test setup broken)')
  const recLvl = modsOf(recModules, 'Level Transmitter')
  if (recLvl.length === 0) throw new Error('instrument-sizing: a principal vessel minted by the RECONCILE path shipped with NO level transmitter — the two-paths instrumentation gap regressed (codema v50: 3.7 m storage tanks had no LT)')
  const recRange = String(recLvl.find((x) => x.kind === 'rating_primary')?.value ?? '')
  if (!/0–4\s*m/.test(recRange)) throw new Error(`instrument-sizing: reconcile-path LT range "${recRange}" must cover the 3.7 m host vessel (next standard range 0–4 m)`)

  // ── DEMAND-COVERAGE COMPLETENESS (codema v51, 2026-07-02) ───────────────────────────
  // A fluid-delivery DEMAND quantity (…_demand_m3_h — a requirement ECHO the compliance
  // matcher refuses to verify) must always yield DELIVERED supply-pump quantities
  // (<stem>_pump_flow_m3_h + <stem>_pump_motor_kw), and a principal pump word when none
  // exists — in BOTH synthesis paths. A sizing-tool value is never overwritten; a contract
  // with no fluid demand is a byte-identical no-op.
  const mkDemandContract = (extra: Record<string, any> = {}): any => ({ quantities: {
    irrigation_demand_m3_h: { value: 90, unit: 'm³/h' },
    ...extra,
  } })
  const findWord = (ms: any[], re: RegExp): any => {
    for (const m of ms) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
      if (String(w.id ?? '').includes('__')) continue
      if (re.test(String(w.name_human ?? ''))) return w
    }
    return undefined
  }
  const qVal = (c: any, k: string): number | undefined => c?.quantities?.[k]?.value

  // (1) demand with NO word → PATH-1 synthesises the principal + mints the delivered pair.
  const dcMods1: any = [{ module: 'mass_fluid_transport_process', sub_modules: [{ id: 'sm', words: [] }] }]
  const dcC1 = mkDemandContract()
  applyUniversalContractSizing(dcMods1 as never[], dcC1, { dedupeAndStrip: false, explode: false, instrument: false })
  if (!findWord(dcMods1, /^irrigation pump$/i)) throw new Error('demand-coverage: an uncovered irrigation_demand_m3_h must synthesise an Irrigation Pump principal in PATH-1 (the codema v51 omission regressed)')
  if (qVal(dcC1, 'irrigation_pump_flow_m3_h') !== 90) throw new Error(`demand-coverage: irrigation_pump_flow_m3_h must be minted = the demand (90), got ${qVal(dcC1, 'irrigation_pump_flow_m3_h')} — the compliance matrix cannot verify the brief metric without a DELIVERED quantity`)
  const dcMotor = qVal(dcC1, 'irrigation_pump_motor_kw')
  if (!(typeof dcMotor === 'number' && dcMotor > 5 && dcMotor < 20)) throw new Error(`demand-coverage: irrigation_pump_motor_kw must be minted from the flow-only hydraulics (90 m³/h @ 2.5 bar ≈ 10 kW), got ${dcMotor}`)
  if (String(dcC1.quantities.irrigation_pump_flow_m3_h.source) !== 'demand-coverage') throw new Error('demand-coverage: a minted quantity must carry source="demand-coverage" provenance (CORE FIX PRINCIPLE — route by provenance)')
  // PATH-2 (reconcile ALONE) must give the same coverage.
  const dcMods1b: any = [{ module: 'mass_fluid_transport_process', sub_modules: [{ id: 'sm', words: [] }] }]
  const dcC1b = mkDemandContract()
  const dcRec = reconcilePrincipalEquipment(dcMods1b as never[], dcC1b)
  if (dcRec.synthesizedMissing < 1 || !findWord(dcMods1b, /^irrigation pump$/i)) throw new Error('demand-coverage: the RECONCILE path alone must also synthesise the Irrigation Pump principal (two-paths choke point)')
  if (qVal(dcC1b, 'irrigation_pump_flow_m3_h') !== 90) throw new Error('demand-coverage: the RECONCILE path alone must also mint the delivered irrigation_pump_flow_m3_h')

  // (2) demand with an EXISTING pump word → NO synthetic twin; delivered pair still minted.
  const dcMods2: any = [{ module: 'mass_fluid_transport_process', sub_modules: [{ id: 'sm', words: [
    { id: 'irrigation_pump_word', name_human: 'Irrigation Pump', content_character: { character_id: 'irrigation_pump', name_human: 'Irrigation Pump' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
  ] }] }]
  const dcC2 = mkDemandContract()
  const dcR2 = applyUniversalContractSizing(dcMods2 as never[], dcC2, { dedupeAndStrip: false, explode: false, instrument: false })
  if (dcR2.synthesizedPhrases.includes('irrigation_pump')) throw new Error('demand-coverage: a design that already HAS the pump word must get NO synthetic principal twin (matched/suppression logic must apply to the minted group)')
  let dcCount = 0
  for (const m of dcMods2) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) { if (/^irrigation pump$/i.test(String(w.name_human ?? '')) && !String(w.id ?? '').includes('__')) dcCount += 1 }
  if (dcCount !== 1) throw new Error(`demand-coverage: exactly ONE Irrigation Pump word must survive when the word pre-exists, got ${dcCount}`)
  if (qVal(dcC2, 'irrigation_pump_flow_m3_h') !== 90) throw new Error('demand-coverage: the delivered quantities must be minted EITHER WAY (word present or not) so the compliance matrix verifies on every run')

  // (3) a contract with NO fluid-delivery demand and no motorless pump family → BYTE-IDENTICAL no-op.
  const bessLikeC: any = { quantities: {
    nameplate_capacity_kwh: { value: 3500, unit: 'kWh' },
    continuous_power_kw: { value: 1000, unit: 'kW' },
    battery_night_demand_kw: { value: 120, unit: 'kW' }, // an ELECTRICAL demand — excluded by the m3_h unit anchor
    coolant_flow_m3_h: { value: 12, unit: 'm³/h' },      // a flow with no pump token — not a pump family
  } }
  const bessBefore = JSON.stringify(bessLikeC)
  const bessMods: any = [{ module: 'energy_conversion_transduction', sub_modules: [{ id: 'sm', words: [] }] }]
  applyUniversalContractSizing(bessMods as never[], bessLikeC, { synthesizeMissing: false, dedupeAndStrip: false, explode: false, instrument: false })
  if (JSON.stringify(bessLikeC) !== bessBefore) throw new Error('demand-coverage: a class with no fluid-delivery demand must be a BYTE-IDENTICAL no-op on the contract (BESS/smallsat/edge-ai guarantee broken)')

  // (4) an existing tool-emitted motor kW is NEVER overwritten; a motorless pump-flow family
  //     gets the deterministic hydraulic floor (the v51 drain_transfer_pump_power_kw loss).
  const dcC4 = mkDemandContract({
    irrigation_pump_flow_m3_h: { value: 90, unit: 'm3/h', source: 'tool:irrigation:pump-sizing' },
    irrigation_pump_motor_kw: { value: 9.653, unit: 'kW', source: 'tool:irrigation:pump-sizing' },
    drain_transfer_pump_throughput_m3_h: { value: 45, unit: 'm³/h' },
    drain_transfer_pump_count: { value: 2, unit: '' },
  })
  const dcMods4: any = [{ module: 'mass_fluid_transport_process', sub_modules: [{ id: 'sm', words: [] }] }]
  applyUniversalContractSizing(dcMods4 as never[], dcC4, { dedupeAndStrip: false, explode: false, instrument: false })
  if (qVal(dcC4, 'irrigation_pump_motor_kw') !== 9.653) throw new Error(`demand-coverage: a tool-emitted motor kW must NEVER be overwritten (9.653 → ${qVal(dcC4, 'irrigation_pump_motor_kw')})`)
  if (String(dcC4.quantities.irrigation_pump_motor_kw.source) !== 'tool:irrigation:pump-sizing') throw new Error('demand-coverage: the tool provenance on an existing motor quantity must survive untouched')
  const dcDrain = qVal(dcC4, 'drain_transfer_pump_motor_kw')
  if (!(typeof dcDrain === 'number' && dcDrain > 1 && dcDrain < 15)) throw new Error(`demand-coverage: a pump-named flow family with no motor twin must get the deterministic hydraulic floor as <fam>_motor_kw (45 m³/h ≈ 5 kW), got ${dcDrain} — the v51 drain_transfer_pump_power_kw loss regressed`)

  // eslint-disable-next-line no-console
  console.log('instrument-sizing --selftest OK (3 instruments un-sized as machines; real pump still sized from contract; consolidated level range = next standard range ≥ tallest served vessel; 3.7 m vessel LT = 0–4 m; CIP/cleaning tank ≤2 m³ one-charge rule with plain storage NOT clamped; reconcile-minted vessel gets its LT; demand-coverage: uncovered fluid demand → delivered pump pair + principal in BOTH paths, existing word suppresses the synth twin, tool values never overwritten, no-demand contract byte-identical)')
}

run()
