/**
 * scripts/test-sizing-families.tsx
 *
 * E2 sizing-family plug-in registry — self-verifying unit tests (no chain, no
 * LLM, no network). Run:  npx tsx scripts/test-sizing-families.tsx
 *
 * Sections:
 *   A. BATTERY port is BYTE-IDENTICAL to the legacy applyFamilySizing oracle
 *      on a captured BESS modules+contract fixture.
 *   B. biogas-CHP COMPOSITION: process-plant (real) + thermal + power-electronics
 *      (test doubles standing in for the not-yet-built families) all fire over a
 *      shared quantity namespace with NO conflict; every delta carries
 *      `family-plugin:<id>@v` provenance. Plus the explicit conflict rule fires
 *      when an undeclared overwrite is attempted.
 *   C. aero-platforms on a HAPS-like contract derives wing area / cruise power /
 *      battery mass in plausible ranges (ranges asserted with engineering basis).
 *   D. missing required quantity → LOUD structured error (not a silent default).
 */

import {
  applyFamilySizing,
  type ModuleLike,
} from './lib/orchestrator/generic/sizing'
import type { ContractInProgress, TypedQuantity } from './lib/orchestrator/types'
import {
  runSizingFamilies,
  applySizingDeltas,
  registerSizingFamily,
  _clearSizingFamiliesForTests,
  SizingFamilyError,
  type SizingFamilyPlugin,
  type SizableModule,
} from './lib/orchestrator/sizing-families'
// Importing the barrel registers battery / process-plant / aero-platforms.
import { BATTERY_FAMILY, PROCESS_PLANT_FAMILY, AERO_PLATFORMS_FAMILY } from './lib/orchestrator/sizing-families'

const fails: string[] = []
function check(cond: boolean, msg: string): void {
  if (!cond) fails.push(msg)
}

// ── tiny quantity helper for fixtures ──
function Q(value: number, unit = '', family: TypedQuantity['family'] = 'dimensionless'): TypedQuantity {
  return { value, unit, family, basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: { source: 'class_anchor' } }
}
function makeContract(quantities: Record<string, TypedQuantity>, product_class: string): ContractInProgress {
  return { product_class, brief_summary: '', envelope: { class: product_class } as never, quantities, topology: [], closures: [], macro_assembly_prices: [], _tools_run: [] }
}
function word(id: string, character_id: string, name_human: string) {
  return { id, name_human, content_character: { character_id, name_human }, modifier_characters: [] as Array<{ kind: string; value: string; unit?: string }> }
}
function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)) }

// ===========================================================================
// A. BATTERY byte-identity
// ===========================================================================
function sectionA(): void {
  const modules: ModuleLike[] = [
    {
      sub_modules: [
        { words: [
          word('w_cells', 'lfp_prismatic_cell', 'LFP prismatic cell'),
          word('w_mod', 'battery_module', 'battery module'),
          word('w_cmu', 'cell_monitoring_unit', 'cell monitoring unit'),
          word('w_rack', 'battery_rack', 'battery rack'),
        ] },
        { words: [
          word('w_pcs', 'pcs_inverter', 'PCS inverter'),
          word('w_bus', 'dc_busbar', 'DC busbar'),
          word('w_tx', 'step_up_transformer', 'step-up transformer'),
          word('w_chiller', 'liquid_chiller', 'liquid chiller'),
          word('w_tsens', 'temperature_sensor', 'temperature sensor'),
        ] },
      ],
    },
  ]
  const contract = makeContract({
    cell_count: Q(4536), module_count: Q(189), cells_per_module: Q(24),
    bms_slave_count: Q(210), rack_count: Q(15),
    cell_capacity_ah: Q(280, 'Ah'), cell_voltage_v: Q(3.2, 'V'),
    continuous_power_kw: Q(1000, 'kW', 'power'), inverter_efficiency_pct: Q(98.5, '%'),
    bus_continuous_current_a: Q(1250, 'A', 'current'),
    transformer_rating_kva: Q(1100, 'kVA', 'power'),
    thermal_rejection_capacity_kw: Q(40, 'kW', 'power'),
  }, 'bess')

  // Legacy oracle
  const legacyMods = clone(modules)
  const legacyContract = clone(contract)
  const legacyResult = applyFamilySizing(legacyMods, legacyContract, 'bess')

  // Registry path (battery only fires for class 'bess')
  const newMods = clone(modules) as unknown as SizableModule[]
  const newContract = clone(contract)
  const run = runSizingFamilies(newMods, newContract, {}, 'bess', null)
  const applied = applySizingDeltas(newMods, newContract, run.deltas)

  check(run.applied.length === 1 && run.applied[0] === 'battery', `A: expected only battery to fire, got [${run.applied.join(', ')}]`)
  check(legacyResult.sized === applied.sized, `A: sized count differs legacy=${legacyResult.sized} new=${applied.sized}`)
  check(legacyResult.sized > 0, `A: legacy sized 0 words — fixture/rule mismatch`)

  const a = JSON.stringify(legacyMods)
  const b = JSON.stringify(newMods)
  check(a === b, `A: BATTERY port NOT byte-identical.\n  legacy=${a}\n  new   =${b}`)
  if (a === b) console.log(`  [A] BATTERY byte-identical: ${applied.sized} words sized, modules JSON matches legacy exactly`)
}

// ===========================================================================
// B. biogas-CHP composition (+ conflict rule)
// ===========================================================================
function sectionB(): void {
  // envelopeVector + contract distilled from briefs-holdout/biogas-digester-chp.md
  const modules = [
    { module: 'process_conversion', sub_modules: [{ words: [
      word('w_dig', 'primary_mesophilic_digester', 'primary mesophilic digester'),
      word('w_sec', 'secondary_digestate_store', 'secondary digestate store'),
      word('w_feedpump', 'feed_pump', 'feed pump'),
      word('w_agit', 'digester_agitator', 'digester agitator'),
      word('w_desulf', 'h2s_desulphurisation_skid', 'H2S desulphurisation skid'),
      word('w_holder', 'double_membrane_gas_holder', 'double-membrane gas holder'),
    ] }] },
    { module: 'thermal_recovery', sub_modules: [{ words: [
      word('w_hx', 'jacket_exhaust_heat_exchanger', 'jacket + exhaust heat exchanger'),
      word('w_loop', 'on_farm_heat_loop_manifold', 'on-farm heat loop manifold'),
    ] }] },
    { module: 'power_export', sub_modules: [{ words: [
      word('w_engine', 'spark_ignition_gas_engine', 'spark-ignition gas engine'),
      word('w_gen', 'synchronous_generator', 'synchronous generator'),
      word('w_swgr', 'grid_export_switchgear', 'grid-export switchgear'),
    ] }] },
  ] as unknown as SizableModule[]

  const contract = makeContract({
    continuous_power_kw: Q(250, 'kW', 'power'),         // 250 kWe (process-plant required input)
    electrical_output_kw: Q(250, 'kW', 'power'),
    reactor_volume_m3: Q(2500, 'm3', 'volume'),
    biogas_flow_nm3_h: Q(105, 'Nm3/h', 'flow_rate'),
    heat_recovery_kw: Q(270, 'kW', 'power'),
    feed_throughput_t_day: Q(60, 't/day', 'mass'),
    power_factor: Q(0.95),
  }, 'biogas_digester_chp')
  const envelopeVector = { class: 'biogas_digester_chp', domains: ['process', 'thermal', 'power_electronics'] }

  // Test-double families standing in for the not-yet-built thermal + power
  // families. They prove COMPOSITION (shared namespace, dependency order, no
  // conflict, provenance). runs_after: process-plant.
  const thermalDouble: SizingFamilyPlugin = {
    family: 'thermal', version: '0.0.1-double', runs_after: ['process-plant'], overrides: [],
    appliesTo: (ev) => (ev?.domains ?? []).includes('thermal') ? 0.75 : 0,
    requiredQuantities: [],
    size: (mods) => ({
      family: 'thermal', version: '0.0.1-double', provenance: 'family-plugin:thermal@0.0.1-double',
      modifier_writes: [{ path: { module: 1, sub_module: 0, word: 1 }, rule_id: 'heat_loop', basis: 'manifold flow = duty/(cp·ΔT)', modifiers: [{ kind: 'rating_primary', value: '190', unit: 'kWth' }], provenance: 'family-plugin:thermal@0.0.1-double' }],
      quantity_writes: [{ key: 'hx_area_m2', rule_id: 'hx', basis: 'A = Q/(U·LMTD)', provenance: 'family-plugin:thermal@0.0.1-double', quantity: Q(38, 'm2', 'area') }],
      derived_parameter_writes: [], notes: ['thermal double fired'],
    }),
  }
  const powerDouble: SizingFamilyPlugin = {
    family: 'power-electronics', version: '0.0.1-double', runs_after: ['process-plant'], overrides: [],
    appliesTo: (ev) => (ev?.domains ?? []).includes('power_electronics') ? 0.75 : 0,
    requiredQuantities: [],
    size: () => ({
      family: 'power-electronics', version: '0.0.1-double', provenance: 'family-plugin:power-electronics@0.0.1-double',
      modifier_writes: [{ path: { module: 2, sub_module: 0, word: 2 }, rule_id: 'switchgear', basis: 'I = P/(√3·V·pf)', modifiers: [{ kind: 'rating_primary', value: '380', unit: 'A' }], provenance: 'family-plugin:power-electronics@0.0.1-double' }],
      quantity_writes: [{ key: 'switchgear_rating_a', rule_id: 'swgr', basis: 'I = S/(√3·V)', provenance: 'family-plugin:power-electronics@0.0.1-double', quantity: Q(380, 'A', 'current') }],
      derived_parameter_writes: [], notes: ['power double fired'],
    }),
  }

  registerSizingFamily(thermalDouble)
  registerSizingFamily(powerDouble)

  let run
  try {
    run = runSizingFamilies(modules, contract, {}, 'biogas_digester_chp', envelopeVector)
  } catch (e) {
    fails.push(`B: composition threw unexpectedly: ${String(e)}`)
    return
  }
  applySizingDeltas(modules, contract, run.deltas)

  check(run.applied.includes('process-plant'), `B: process-plant did not fire (applied=[${run.applied.join(', ')}])`)
  check(run.applied.includes('thermal'), `B: thermal did not fire`)
  check(run.applied.includes('power-electronics'), `B: power-electronics did not fire`)
  // dependency order: process-plant before the two that declare runs_after it
  const pi = run.applied.indexOf('process-plant')
  check(pi >= 0 && pi < run.applied.indexOf('thermal') && pi < run.applied.indexOf('power-electronics'),
    `B: dependency order wrong: ${run.applied.join(' → ')}`)
  // every delta carries family-plugin@v provenance
  for (const d of run.deltas) {
    check(/^family-plugin:[\w-]+@/.test(d.provenance), `B: delta '${d.family}' bad provenance '${d.provenance}'`)
    for (const w of d.modifier_writes) check(/^family-plugin:[\w-]+@/.test(w.provenance), `B: modifier write provenance bad on ${d.family}`)
  }
  // process-plant actually sized the digester/pump/generator words
  const pp = run.deltas.find((d) => d.family === 'process-plant')
  check(!!pp && pp.modifier_writes.length >= 6, `B: process-plant sized only ${pp?.modifier_writes.length ?? 0} words (expected ≥6)`)
  // no namespace key collision among the three deltas (clean compose)
  console.log(`  [B] composition: applied [${run.applied.join(', ')}], process-plant sized ${pp?.modifier_writes.length} words, no conflict, provenance OK`)

  // ── conflict rule: a double that overwrites process-plant's modifier kind
  //    on the SAME word WITHOUT declaring the override must throw WRITE_CONFLICT.
  const conflictDouble: SizingFamilyPlugin = {
    family: 'conflict-probe', version: '0.0.1', runs_after: ['process-plant'], overrides: [], // <- no override declared
    appliesTo: (ev) => (ev?.domains ?? []).includes('process') ? 0.9 : 0,
    requiredQuantities: [],
    size: () => ({
      family: 'conflict-probe', version: '0.0.1', provenance: 'family-plugin:conflict-probe@0.0.1',
      // module 0, sub 0, word 0 (the digester) capacity kind — process-plant's
      // primary_reactor rule writes 'quantity' + 'capacity' there.
      modifier_writes: [{ path: { module: 0, sub_module: 0, word: 0 }, rule_id: 'x', basis: 'collide', modifiers: [{ kind: 'capacity', value: '9999', unit: 'm³' }], provenance: 'family-plugin:conflict-probe@0.0.1' }],
      quantity_writes: [], derived_parameter_writes: [], notes: [],
    }),
  }
  registerSizingFamily(conflictDouble)
  let threw = false
  try {
    runSizingFamilies(modules, contract, {}, 'biogas_digester_chp', envelopeVector)
  } catch (e) {
    threw = e instanceof SizingFamilyError && (e as SizingFamilyError).code === 'WRITE_CONFLICT'
    if (!threw) fails.push(`B: conflict probe threw wrong error: ${String(e)}`)
  }
  check(threw, `B: undeclared overwrite did NOT raise WRITE_CONFLICT`)
  if (threw) console.log(`  [B] conflict rule: undeclared overwrite → WRITE_CONFLICT (as required)`)
}

// ===========================================================================
// C. aero-platforms HAPS-like budget
// ===========================================================================
function sectionC(): void {
  const modules = [
    { module: 'airframe_structure', sub_modules: [{ words: [
      word('w_spar', 'carbon_fibre_wing_spar', 'carbon-fibre wing spar'),
      word('w_skin', 'wing_skin_panel', 'wing skin panel'),
      word('w_fus', 'fuselage_pod_shell', 'fuselage pod shell'),
    ] }] },
    { module: 'propulsion', sub_modules: [{ words: [
      word('w_prop', 'low_re_propeller', 'low-Re propeller'),
      word('w_motor', 'bldc_motor', 'BLDC motor'),
      word('w_batt', 'lithium_sulphur_battery_pack', 'lithium-sulphur battery pack'),
      word('w_solar', 'gaas_solar_laminate', 'GaAs solar laminate'),
    ] }] },
  ] as unknown as SizableModule[]

  const contract = makeContract({
    max_mass_kg: Q(95, 'kg', 'mass'),
    cruise_velocity_m_s: Q(30, 'm/s', 'velocity'),
    air_density_kg_m3: Q(0.088, 'kg/m3', 'density'),
    wing_lift_coefficient_cl: Q(0.9),
    wing_l_over_d: Q(30),
    prop_power_w: Q(1200, 'W', 'power'),
    continuous_power_w: Q(1500, 'W', 'power'),   // motor ≥ prop → match ok
    solar_irradiance_et_w_m2: Q(1322, 'W/m2', 'power'),
    wingspan_m: Q(35, 'm', 'length'),
  }, 'haps')

  let run
  try {
    run = runSizingFamilies(modules, contract, {}, 'haps', { class: 'haps', domains: ['aero'] })
  } catch (e) {
    fails.push(`C: aero threw: ${String(e)}`)
    return
  }
  applySizingDeltas(modules, contract, run.deltas)
  check(run.applied.includes('aero-platforms'), `C: aero-platforms did not fire`)

  const q = (k: string): number | undefined => contract.quantities[k]?.value
  const wingArea = q('wing_area_m2')
  const cruiseP = q('cruise_power_w')
  const battMass = q('battery_pack_mass_kg')
  const match = q('motor_prop_match_ok')
  const solarA = q('solar_array_area_m2')

  // Basis-cited plausibility ranges for a ~95 kg solar HALE platform:
  //   wing area 10-80 m² (W/(q·CL) at 0.088 kg/m³, low wing loading 2-6 kg/m²)
  check(wingArea !== undefined && wingArea >= 10 && wingArea <= 80, `C: wing_area_m2=${wingArea} outside [10,80] (S=W/(q·CL))`)
  //   cruise power 0.2-5 kW (P=W·V/((L/D)·η))
  check(cruiseP !== undefined && cruiseP >= 200 && cruiseP <= 5000, `C: cruise_power_w=${cruiseP} outside [200,5000]`)
  //   battery 10-80 kg (night-energy/specific-energy; battery-heavy HALE)
  check(battMass !== undefined && battMass >= 10 && battMass <= 80, `C: battery_pack_mass_kg=${battMass} outside [10,80]`)
  check(match === 1, `C: motor_prop_match_ok=${match} (motor 1500 W ≥ prop 1200 W → expected 1)`)
  check(solarA !== undefined && solarA > 0, `C: solar_array_area_m2 not derived (${solarA})`)
  // provenance on derived quantities
  const aeroDelta = run.deltas.find((d) => d.family === 'aero-platforms')!
  check(aeroDelta.quantity_writes.every((w) => /^family-plugin:aero-platforms@/.test(w.provenance)), `C: aero quantity provenance bad`)
  check(aeroDelta.derived_parameter_writes.length > 0, `C: no derived_parameter_writes`)
  console.log(`  [C] aero budget: wing ${wingArea} m², cruise ${cruiseP} W, battery ${battMass} kg, solar ${solarA} m², motor-prop match=${match}`)
}

// ===========================================================================
// D. missing required quantity → loud structured error
// ===========================================================================
function sectionD(): void {
  // aero with NO air_density → boundary must throw MISSING_REQUIRED_QUANTITY
  const modules = [{ module: 'airframe', sub_modules: [{ words: [word('w_spar', 'wing_spar', 'wing spar')] }] }] as unknown as SizableModule[]
  const contract = makeContract({
    max_mass_kg: Q(95, 'kg', 'mass'),
    cruise_velocity_m_s: Q(30, 'm/s', 'velocity'),
    // air_density_kg_m3 deliberately ABSENT
  }, 'haps')
  let code: string | null = null
  try {
    runSizingFamilies(modules, contract, {}, 'haps', { class: 'haps', domains: ['aero'] })
  } catch (e) {
    if (e instanceof SizingFamilyError) code = e.code
  }
  check(code === 'MISSING_REQUIRED_QUANTITY', `D: missing air_density did not raise MISSING_REQUIRED_QUANTITY (got ${code})`)

  // out-of-range: air_density absurd (10 kg/m³) → OUT_OF_RANGE
  const contract2 = makeContract({
    max_mass_kg: Q(95, 'kg', 'mass'),
    cruise_velocity_m_s: Q(30, 'm/s', 'velocity'),
    air_density_kg_m3: Q(10, 'kg/m3', 'density'),
  }, 'haps')
  let code2: string | null = null
  try {
    runSizingFamilies(modules, contract2, {}, 'haps', { class: 'haps', domains: ['aero'] })
  } catch (e) {
    if (e instanceof SizingFamilyError) code2 = e.code
  }
  check(code2 === 'OUT_OF_RANGE', `D: air_density=10 did not raise OUT_OF_RANGE (got ${code2})`)

  if (code === 'MISSING_REQUIRED_QUANTITY' && code2 === 'OUT_OF_RANGE') {
    console.log(`  [D] loud failure: missing→MISSING_REQUIRED_QUANTITY, absurd→OUT_OF_RANGE (no silent default)`)
  }
}

function main(): void {
  // sanity: the three real families registered via the barrel import
  check(BATTERY_FAMILY.family === 'battery', 'battery family not exported')
  check(PROCESS_PLANT_FAMILY.family === 'process-plant', 'process-plant family not exported')
  check(AERO_PLATFORMS_FAMILY.family === 'aero-platforms', 'aero-platforms family not exported')

  sectionA()
  sectionB()
  sectionC()
  sectionD()

  if (fails.length > 0) {
    console.error(`\nFAIL (${fails.length}):`)
    for (const f of fails) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log(`\nPASS — all sizing-family E2 invariants hold`)
  void _clearSizingFamiliesForTests
  process.exit(0)
}

main()
