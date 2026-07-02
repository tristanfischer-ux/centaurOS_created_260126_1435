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

  // ── TYPE-DERIVED SYNTH DIMS — default-size LITTER proveCatch (codema v53, 2026-07-02) ──
  // boxFromThroughputM3h clamps at a 0.7 m side, so EVERY small flow-rated synthesised
  // principal (25 / 45 / 90 m³/h pumps + a 14.5 m³/h GAC softener) collapsed to ONE
  // identical 700x595x770 mm box, and the shared 'trans' stem let the drain_TRANSfer_pump
  // group stamp the same box + a bogus "45 m³/h" onto "Distribution TRANSformer" — 5
  // distinct parts, one dims signature = manifest-sight LITTER that capped the render/GA
  // tabs. The fix derives per-TYPE dims from the group's own physics; this guard fails the
  // build if any two of those five ever share a dims signature again.
  const litterModules: any = [
    { module: 'mass_fluid_transport_process', sub_modules: [{ id: 'sm', words: [] }] },
    { module: 'structure_containment', sub_modules: [{ id: 'sc', words: [] }] },
    { module: 'energy_storage_source', sub_modules: [{ id: 'es', words: [
      { id: 'distribution_transformer_word', name_human: 'Distribution Transformer', content_character: { character_id: 'distribution_transformer', name_human: 'Distribution Transformer' }, modifier_characters: [{ kind: 'form', value: 'representative energy storage source component' }] },
    ] }] },
  ]
  const litterContract: any = { quantities: {
    hand_watering_pump_throughput_m3_h: { value: 25 }, hand_watering_pump_count: { value: 1 },
    drain_transfer_pump_throughput_m3_h: { value: 45 }, drain_transfer_pump_count: { value: 2 },
    irrigation_pump_flow_m3_h: { value: 90 },
    gac_softener_throughput_m3_h: { value: 14.5 },
    reverse_osmosis_skid_volume_m3: { value: 10 }, reverse_osmosis_skid_count: { value: 1 },
  } }
  applyUniversalContractSizing(litterModules as never[], litterContract, { dedupeAndStrip: false, explode: false, instrument: false })
  const dimOf = (name: string): string => String(modsOf(litterModules, name).find((x) => x.kind === 'dimension' || x.kind === 'dimensions')?.value ?? '')
  const litterNames = ['Hand Watering Pump', 'Drain Transfer Pump', 'Irrigation Pump', 'Gac Softener']
  const dimSigs = new Set<string>()
  for (const nm of litterNames) {
    const d = dimOf(nm)
    if (!d) throw new Error(`synth-dims: "${nm}" was synthesised with NO dimension — a flow-rated principal must carry type-derived dims`)
    dimSigs.add(d)
  }
  if (dimSigs.size !== litterNames.length) throw new Error(`synth-dims: ${litterNames.length} flow-rated synthesised principals share only ${dimSigs.size} dims signature(s) [${[...dimSigs].join(' | ')}] — the 700x595x770 default-size LITTER cluster regressed`)
  for (const nm of ['Hand Watering Pump', 'Drain Transfer Pump', 'Irrigation Pump']) {
    if (!/^\d+x\d+x\d+ mm$/.test(dimOf(nm))) throw new Error(`synth-dims: pump "${nm}" dims "${dimOf(nm)}" must be a WxDxH pump-set box scaled from its flow`)
  }
  const wOf = (nm: string): number => parseInt(dimOf(nm).split('x')[0], 10)
  if (!(wOf('Hand Watering Pump') < wOf('Drain Transfer Pump') && wOf('Drain Transfer Pump') < wOf('Irrigation Pump')))
    throw new Error(`synth-dims: pump-set envelopes must GROW with flow (25→${wOf('Hand Watering Pump')}, 45→${wOf('Drain Transfer Pump')}, 90→${wOf('Irrigation Pump')} mm) — the flow-derived scaling broke`)
  if (!/m dia x .* m$/.test(dimOf('Gac Softener'))) throw new Error(`synth-dims: "Gac Softener" dims "${dimOf('Gac Softener')}" must be a media-bed CYLINDER (⌀ from superficial velocity), not a box`)
  // the ELECTRICAL word must have adopted NOTHING from the fluid pump group.
  const txMods = modsOf(litterModules, 'Distribution Transformer')
  if (txMods.some((x) => (x.kind === 'dimension' || x.kind === 'dimensions'))) throw new Error('synth-dims: "Distribution Transformer" was stamped a dimension from a FLUID group — the electrical-role coherence guard regressed (it must stay un-dimensioned → scene TYPE_DEFAULT transformer_box)')
  if (txMods.some((x) => /^rating/.test(String(x.kind)) && /m³\/h|m3\/h/.test(String(x.unit ?? '')))) throw new Error('synth-dims: "Distribution Transformer" carries an m³/h rating — an electrical-distribution device must never adopt a fluid group (the 45 m³/h transformer regressed)')
  if (txMods.some((x) => x.kind === 'quantity' && String(x.value) === '×2')) throw new Error('synth-dims: "Distribution Transformer" was stamped the pump group\'s ×2 count — the electrical-role coherence guard regressed')

  // ── SYNTH MODULE HOME (codema v53 "floating disconnected objects") ──────────────────
  // A water-treatment synth principal (softener / reverse-osmosis skid) must land in the
  // TREATMENT/PROCESS module — not the structure/containment FALLBACK that strands it in
  // the far structure region of the 3-D scene, metres from the fluid train it pipes into.
  const homeModules: any = [
    { module: 'structure_containment', sub_modules: [{ id: 'sc', words: [] }] },
    { module: 'mass_fluid_transport_process', sub_modules: [{ id: 'sm', words: [] }] },
  ]
  reconcilePrincipalEquipment(homeModules as never[], litterContract)
  const moduleOf = (name: string): string => {
    for (const m of homeModules) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
      if (String(w.name_human ?? '') === name) return String(m.module)
    }
    return '(not synthesised)'
  }
  for (const nm of ['Gac Softener', 'Reverse Osmosis Skid']) {
    if (moduleOf(nm) !== 'mass_fluid_transport_process') throw new Error(`synth-module-home: "${nm}" landed in "${moduleOf(nm)}" — a treatment-family synth principal must home with the process module, not the structure fallback (the v53 floating far-corner regressed)`)
  }

  // ── LEGACY FALLBACK PRESERVED (byte-identity mechanism for unaffected families) ─────
  // A throughput group naming NO pump/media noun must keep the legacy throughput box
  // exactly — proving the type-derived dims dispatch cannot touch any other family.
  const legacyModules: any = [{ module: 'mass_fluid_transport_process', sub_modules: [{ id: 'sm', words: [] }] }]
  applyUniversalContractSizing(legacyModules as never[], { quantities: { degasser_unit_throughput_m3_h: { value: 40 } } } as any, { dedupeAndStrip: false, explode: false, instrument: false })
  const legacyDim = String((() => { for (const m of legacyModules) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) { const d = (w.modifier_characters ?? []).find((x: any) => x.kind === 'dimension'); if (d) return d.value } return '' })())
  if (legacyDim !== '700x595x770 mm') throw new Error(`synth-dims: a non-pump/media throughput device must keep the LEGACY throughput box (700x595x770 mm at 40 m³/h), got "${legacyDim}" — the dispatch over-reached beyond pump/media families`)

  // ── DEMAND-COVERAGE rules 3+4: loop flows + brief-metric delivery (codema v52, 2026-07-02) ──
  // rule 4a: a COUNT-family brief metric with a count-noun unit the matcher can't promote
  // ('trays') must yield a delivered served-count in the metric's unit, derived from the
  // design's structural count — in BOTH paths; a metric with NO structural basis stays
  // un-minted (honest UNVERIFIED); an already-verifiable metric mints nothing.
  const v52Metrics: any[] = [
    { key_metric: 'total_cultivation_containers', value: 6000, unit: 'trays', category: 'scale' },
    { key_metric: 'max_irrigation_demand_per_department', value: 45, unit: 'm3/hr', category: 'scale' },
    { key_metric: 'ro_permeate_capacity', value: 8, unit: 'm3/hr', category: 'scale' },   // already verifiable
    { key_metric: 'orphan_widget_total', value: 12, unit: 'widgets', category: 'scale' }, // NO structural basis
  ]
  const mkV52Contract = (): any => ({ quantities: {
    cultivation_container_count: { value: 6000, unit: '', source: 'brief', source_detail: '2 dept × 10 tunnels × 5 layers × 4 rows × 15' },
    irrigation_demand_m3_h: { value: 90, unit: 'm³/h', source: 'calculator' },
    ro_permeate_capacity_m3_h: { value: 8, unit: 'm³/h', source: 'brief' },
    drain_transfer_pump_throughput_m3_h: { value: 45, unit: 'm³/h', source: 'brief' },
    gac_softener_throughput_m3_h: { value: 14.5, unit: 'm³/h', source: 'brief' },
    acid_dosing_pump_throughput_m3_h: { value: 0.04, unit: 'm³/h', source: 'brief' },
    chemical_dosing_pump_throughput_m3_h: { value: 0.04, unit: 'm³/h', source: 'brief' },
  } })
  const mkLoopMods = (): any => ([
    { module: 'mass_fluid_transport_process', sub_modules: [{ id: 'sm', words: [
      { id: 'drain_collection_sump_word', name_human: 'Drain Collection Sump', content_character: { character_id: 'drain_collection_sump', name_human: 'Drain Collection Sump' }, modifier_characters: [{ kind: 'quantity', value: '×2' }] },
      { id: 'softener_vessel_word', name_human: 'Softener Vessel', content_character: { character_id: 'softener_vessel', name_human: 'Softener Vessel' }, modifier_characters: [{ kind: 'quantity', value: '×2' }] },
      { id: 'permeate_outlet_word', name_human: 'Permeate Outlet', content_character: { character_id: 'permeate_outlet', name_human: 'Permeate Outlet' }, modifier_characters: [] },
      // AMBIGUITY counter-case: 'Nutrient Dosing Tank' shares 'dosing' with TWO dosing-pump
      // flow families → must NOT be given a line duty (never a guess).
      { id: 'nutrient_dosing_tank_word', name_human: 'Nutrient Dosing Tank', content_character: { character_id: 'nutrient_dosing_tank', name_human: 'Nutrient Dosing Tank' }, modifier_characters: [] },
      // NO-BASIS counter-case: no flow family shares a distinctive token → honest null.
      { id: 'fresh_water_tank_word', name_human: 'Fresh Water Tank', content_character: { character_id: 'fresh_water_tank', name_human: 'Fresh Water Tank' }, modifier_characters: [] },
      // INLINE-DEVICE counter-case: a valve sits ON a line — never a stream endpoint.
      { id: 'inlet_flow_control_valve_word', name_human: 'Inlet Flow Control Valve', content_character: { character_id: 'inlet_flow_control_valve', name_human: 'Inlet Flow Control Valve' }, modifier_characters: [] },
    ] }] },
    { module: 'maintenance_serviceability', sub_modules: [{ id: 'maint', words: [
      { id: 'cip_tank_word2', name_human: 'Cip Tank', content_character: { character_id: 'cip_tank', name_human: 'Cip Tank' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
    ] }] },
  ])
  const dcv1: any = mkV52Contract()
  const dcvMods1 = mkLoopMods()
  applyUniversalContractSizing(dcvMods1 as never[], dcv1, { dedupeAndStrip: false, explode: false, instrument: false, briefMetrics: v52Metrics })
  const dcv2: any = mkV52Contract()
  const dcvMods2 = mkLoopMods()
  reconcilePrincipalEquipment(dcvMods2 as never[], dcv2, { briefMetrics: v52Metrics })
  for (const [label, c] of [['PATH-1', dcv1], ['PATH-2', dcv2]] as const) {
    const served = c.quantities.cultivation_container_served_trays
    if (served?.value !== 6000 || String(served?.unit) !== 'trays' || String(served?.source) !== 'demand-coverage')
      throw new Error(`${label} brief-metric coverage: cultivation_container_served_trays must be minted (6000, unit 'trays', source demand-coverage) from the design's cultivation_container_count so the 'trays'-unit metric verifies — got ${JSON.stringify(served)}`)
    const perDept = c.quantities.irrigation_per_department_delivered_m3_h
    if (perDept?.value !== 45)
      throw new Error(`${label} brief-metric coverage: irrigation_per_department_delivered_m3_h must be minted = delivered 90 ÷ 2 departments = 45 (shares from the system demand echo), got ${JSON.stringify(perDept)}`)
    for (const k of Object.keys(c.quantities)) {
      if (/widget/.test(k)) throw new Error(`${label} brief-metric coverage: a metric with NO structural basis must stay UNVERIFIED (honest red) — found fabricated ${k}`)
      if (/ro_permeate.*(delivered|served)/.test(k)) throw new Error(`${label} brief-metric coverage: an already-verifiable metric must mint NOTHING — found redundant ${k}`)
    }
    // rule 3a: CIP recirc duty = one charge (0.15×90 clamped to 2 m³) turned over in 30 min → 4 m³/h
    if (c.quantities.cip_tank_line_flow_m3_h?.value !== 4)
      throw new Error(`${label} loop-flow: cip_tank_line_flow_m3_h must be one cleaning charge (2 m³) × 2/h = 4 m³/h, got ${JSON.stringify(c.quantities.cip_tank_line_flow_m3_h)}`)
    // rule 3b: unique distinctive-token family → service duty; ambiguity/no-basis/valve → nothing
    if (c.quantities.drain_collection_sump_line_flow_m3_h?.value !== 45)
      throw new Error(`${label} loop-flow: the drain sump must take its drain-TRANSFER pump duty (45 m³/h) as its service-line flow`)
    if (c.quantities.softener_vessel_line_flow_m3_h?.value !== 14.5)
      throw new Error(`${label} loop-flow: the softener vessel must take the softener-train throughput (14.5 m³/h)`)
    if (c.quantities.permeate_outlet_line_flow_m3_h?.value !== 8)
      throw new Error(`${label} loop-flow: the permeate outlet must take the RO permeate capacity (8 m³/h)`)
    if (c.quantities.nutrient_dosing_tank_line_flow_m3_h !== undefined)
      throw new Error(`${label} loop-flow: TWO dosing families share 'dosing' — an ambiguous endpoint must get NO line duty (never a guess)`)
    if (c.quantities.fresh_water_tank_line_flow_m3_h !== undefined)
      throw new Error(`${label} loop-flow: an endpoint with NO distinctive-token flow family must stay null (honest UNVERIFIED), not be fabricated`)
    if (c.quantities.inlet_flow_control_valve_line_flow_m3_h !== undefined)
      throw new Error(`${label} loop-flow: a VALVE is an inline device, never a stream endpoint — it must get no line duty`)
  }
  // a `_line_flow_m3_h` key must NEVER mint an equipment group / phantom word (buildGroups skip)
  const wordNames = (ms: any[]): string[] => {
    const out: string[] = []
    for (const m of ms) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) out.push(String(w.name_human ?? ''))
    return out
  }
  const phantomMods: any = [{ module: 'mass_fluid_transport_process', sub_modules: [{ id: 'sm', words: [] }] }]
  applyUniversalContractSizing(phantomMods as never[], { quantities: { cip_tank_line_flow_m3_h: { value: 40 } } } as any, { dedupeAndStrip: false, explode: false, instrument: false })
  if (wordNames(phantomMods).length !== 0)
    throw new Error(`loop-flow: a <endpoint>_line_flow_m3_h quantity is a CONNECTION duty and must NOT synthesise equipment — got phantom word(s) ${JSON.stringify(wordNames(phantomMods))}`)
  // IDEMPOTENCY: a SECOND pass over the already-minted contract must change NOTHING — in
  // particular pass 2 must not chain new endpoints off pass 1's _line_flow mints (the
  // 'Piping Manifold' ← permeate_manifold_line_flow 'manifold'-token chaining bug).
  const dcv1Before = JSON.stringify(dcv1.quantities)
  applyUniversalContractSizing(mkLoopMods() as never[], dcv1, { dedupeAndStrip: false, explode: false, instrument: false, briefMetrics: v52Metrics })
  if (JSON.stringify(dcv1.quantities) !== dcv1Before)
    throw new Error('demand-coverage rules 3+4 are NOT idempotent — a second synthesis pass changed the contract (rule-3 mints must never be flow SOURCES for later passes)')
  // no-overwrite: an endpoint that already carries a join-visible flow key gets NO line duty
  const dcv3: any = mkV52Contract()
  dcv3.quantities.cip_tank_flow_m3_h = { value: 6.5, unit: 'm³/h', source: 'tool:process:cip-sizing' }
  applyUniversalContractSizing(mkLoopMods() as never[], dcv3, { dedupeAndStrip: false, explode: false, instrument: false, briefMetrics: v52Metrics })
  if (dcv3.quantities.cip_tank_line_flow_m3_h !== undefined || dcv3.quantities.cip_tank_flow_m3_h?.value !== 6.5)
    throw new Error('loop-flow: a tool-emitted endpoint flow always wins — a second (line) key would also make the ledger-join prefix AMBIGUOUS')
  // BESS-like byte-identity holds WITH briefMetrics + modules supplied (all metrics either
  // verify already or have no count/flow basis → zero mints)
  const bessMetrics: any[] = [
    { key_metric: 'nameplate_capacity_kwh', value: 3500, unit: 'kWh', category: 'scale' },
    { key_metric: 'round_trip_efficiency_percent', value: 88, unit: '%', category: 'efficiency' },
  ]
  const bessC2: any = { quantities: {
    nameplate_capacity_kwh: { value: 3500, unit: 'kWh' },
    battery_night_demand_kw: { value: 120, unit: 'kW' },
    rack_count: { value: 15, unit: '' },
  } }
  const bessBefore2 = JSON.stringify(bessC2)
  applyUniversalContractSizing([{ module: 'energy_storage_source', sub_modules: [{ id: 'sm', words: [
    { id: 'expansion_tank_word', name_human: 'Expansion Tank', content_character: { character_id: 'expansion_tank', name_human: 'Expansion Tank' }, modifier_characters: [] },
  ] }] }] as any, bessC2, { synthesizeMissing: false, dedupeAndStrip: false, explode: false, instrument: false, briefMetrics: bessMetrics })
  if (JSON.stringify(bessC2) !== bessBefore2)
    throw new Error('demand-coverage rules 3+4: a BESS-like contract (no m³/h flows, metrics already-verifiable or basis-less) must stay BYTE-IDENTICAL with briefMetrics + modules supplied')

  // eslint-disable-next-line no-console
  console.log('instrument-sizing --selftest OK (3 instruments un-sized as machines; real pump still sized from contract; consolidated level range = next standard range ≥ tallest served vessel; 3.7 m vessel LT = 0–4 m; CIP/cleaning tank ≤2 m³ one-charge rule with plain storage NOT clamped; reconcile-minted vessel gets its LT; demand-coverage: uncovered fluid demand → delivered pump pair + principal in BOTH paths, existing word suppresses the synth twin, tool values never overwritten, no-demand contract byte-identical; synth type-derived dims: 4 flow-rated principals all DISTINCT (pump-set boxes grow with flow, softener = media-bed cylinder), transformer adopts NOTHING from a fluid group, treatment synths home with the process module, non-pump/media families keep the legacy box byte-identically; demand-coverage rules 3+4: brief count-metric → served-count in the metric\'s unit + per-share flow metric → delivered ÷ shares in BOTH paths, no-basis/already-verified metrics mint nothing, CIP one-charge recirc + unique-token vessel duties published as _line_flow keys that never synthesise equipment, ambiguity/valve/tool-key counter-cases hold, BESS-like byte-identical with metrics+modules supplied)')
}

run()
