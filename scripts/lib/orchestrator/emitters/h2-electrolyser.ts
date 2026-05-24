/**
 * scripts/lib/orchestrator/emitters/h2-electrolyser.ts
 *
 * H2 ELECTROLYSER DETERMINISTIC EMITTER — PEM 1-10 MW green hydrogen plant.
 * Targets Nel MC / Cummins-Hydrogenics HyLYZER / ITM Power class.
 *
 * Modules (11):
 *   1. stack_cells                — PEM cell stack + MEAs + bipolar plates
 *   2. power_electronics_DC       — thyristor rectifier + DC bus
 *   3. water_supply_DI            — DI water + recirculation
 *   4. gas_separation_H2_O2       — gas/liquid separators
 *   5. balance_of_plant           — pumps, valves, filters
 *   6. cooling_loop               — heat exchanger + chiller
 *   7. control_avionics           — PLC + safety logic
 *   8. h2_storage_compression     — buffer tank + optional compressor
 *   9. regulatory_certification   — PED + ATEX + ISO 22734
 *  10. electrical_substation      — MV transformer + switchgear
 *  11. monitoring                 — telemetry + OPC-UA
 */

import { registerAssembler } from '../assembler'
import type { ClassEmitter, DesignJSON, DesignModule } from '../assembler'
import type { ContractInProgress } from '../types'

interface ModifierCharacter { kind: string; value: string; unit?: string }
interface ContentCharacter { character_id: string; name_human: string; function_radical_primary: string | null; function_radical_secondary: string | null; material_radical_primary: string | null; material_radical_secondary: string | null }
interface Word { id: string; name_human: string; content_character: ContentCharacter; modifier_characters: ModifierCharacter[] }
interface SubModule { id: string; name_human: string; english_sentence: string; rad_syntax: string; role_verb: string; topology_clause: string; words: Word[] }

function mod(kind: string, value: string, unit?: string): ModifierCharacter { return unit !== undefined ? { kind, value, unit } : { kind, value } }
function cc(character_id: string, name_human: string, fp: string | null, mp: string | null, fs: string | null = null, ms: string | null = null): ContentCharacter { return { character_id, name_human, function_radical_primary: fp, function_radical_secondary: fs, material_radical_primary: mp, material_radical_secondary: ms } }
function word(id: string, name_human: string, content: ContentCharacter, modifiers: ModifierCharacter[]): Word {
  // Universal fix #A (2026-05-22): strip literal " word" suffix from name_human.
  const cleanName = name_human.replace(/\s+word$/i, '')
  return { id, name_human: cleanName, content_character: content, modifier_characters: modifiers }
}
function fmtQty(n: number): string { if (Number.isInteger(n)) return `×${n}`; return `×${n.toFixed(2)}` }
function synthesizeRadSyntax(words: Word[]): string {
  const clusters = words.map((w) => {
    const ordered = [...w.modifier_characters].sort((a, b) => { if (a.kind === 'quantity' && b.kind !== 'quantity') return -1; if (b.kind === 'quantity' && a.kind !== 'quantity') return 1; return 0 })
    const tokens = ordered.map((m) => (m.unit ? `${m.value}${m.unit}` : m.value))
    if (tokens.length === 0) return w.content_character.character_id
    return `${w.content_character.character_id} (${tokens.join(', ')})`
  })
  return clusters.join(' ⊙ ')
}
function makeSubModule(id: string, name_human: string, role_verb: string, topology_clause: string, words: Word[]): SubModule {
  return { id, name_human, english_sentence: '', rad_syntax: synthesizeRadSyntax(words), role_verb, topology_clause, words }
}

interface Params {
  ratedPowerKw: number
  ratedPowerMw: number
  h2KgPerDay: number
  h2Nm3PerHour: number
  operatingPressureBar: number
  cellTemperatureC: number
  stackEffPct: number
  cellCount: number
  activeAreaM2: number
  totalPtKg: number
  heatRejectionKw: number
  coolingKw: number
  transformerKva: number
  totalMassKg: number
}

function q(contract: ContractInProgress, key: string, fallback: number): number {
  const v = (contract as any).quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function deriveParams(contract: ContractInProgress): Params {
  const ratedPowerKw = Math.max(100, q(contract, 'rated_power_kw', 1000))
  const ratedPowerMw = ratedPowerKw / 1000
  const h2KgPerDay = q(contract, 'h2_production_kg_per_day', ratedPowerKw / 53 * 24)
  const h2Nm3PerHour = q(contract, 'h2_production_nm3_h', ratedPowerKw / 4.8)
  const operatingPressureBar = q(contract, 'operating_pressure_bar', 30)
  const cellTemperatureC = q(contract, 'cell_temperature_c', 70)
  const stackEffPct = q(contract, 'stack_efficiency_lhv_pct', 62)
  const cellCount = Math.max(20, Math.round(q(contract, 'cell_count', ratedPowerKw / 10)))
  const activeAreaM2 = q(contract, 'membrane_active_area_m2', 10)
  const totalPtKg = q(contract, 'total_pt_loading_kg', 1.2)
  const heatRejectionKw = q(contract, 'heat_rejection_kw', ratedPowerKw * 0.20)
  const coolingKw = q(contract, 'cooling_capacity_kw', heatRejectionKw * 1.25)
  const transformerKva = q(contract, 'transformer_rating_kva', ratedPowerKw * 1.15)
  const totalMassKg = q(contract, 'total_system_mass_kg', ratedPowerKw * 8)
  return { ratedPowerKw, ratedPowerMw, h2KgPerDay, h2Nm3PerHour, operatingPressureBar, cellTemperatureC, stackEffPct, cellCount, activeAreaM2, totalPtKg, heatRejectionKw, coolingKw, transformerKva, totalMassKg }
}

function emitStackCells(p: Params): DesignModule {
  const stack = makeSubModule('pem_stack', 'PEM stack', 'electrolyses',
    `DI water into H₂ + O₂ via ${p.cellCount} Nafion 117 cells at ${p.cellTemperatureC}°C and ${p.operatingPressureBar} bar`,
    [
      word('pem_cell_word', 'PEM cell',
        cc('pem_cell', 'PEM cell', 'electrochemical_energy_function', 'titanium'),
        [mod('quantity', fmtQty(p.cellCount)), mod('form', 'Nafion 117 membrane'), mod('regulatory', 'ISO 22734')]),
      word('membrane_electrode_assembly_word', 'MEA',
        cc('membrane_electrode_assembly', 'membrane electrode assembly', 'electrochemical_energy_function', 'polymer_thermoplastic'),
        [mod('quantity', fmtQty(p.cellCount)), mod('form', `Pt/Ir loaded ${(p.totalPtKg * 1000 / p.cellCount).toFixed(0)} mg/cell`), mod('dimension', '178', 'µm')]),
      word('bipolar_plate_titanium_word', 'titanium bipolar plate',
        cc('bipolar_plate_titanium', 'titanium bipolar plate', 'electrical_conducting_function', 'titanium'),
        [mod('quantity', fmtQty(p.cellCount + 1)), mod('form', 'platinised Ti grade 1'), mod('dimension', '2.5', 'mm')]),
      word('end_plate_word', 'end plate',
        cc('end_plate', 'end plate', null, 'steel'),
        [mod('quantity', '×2'), mod('form', 'SS316L 40 mm')]),
      word('tie_rod_set_word', 'tie rod set',
        cc('tie_rod_set', 'tie rod set', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×16'), mod('form', 'M24 high-tensile')]),
    ])
  return {
    module: 'stack_cells',
    module_brief: `Stack of ${p.cellCount} PEM cells (Nafion 117) clamped between SS316L end-plates with 16× M24 tie-rods, delivering ${p.h2Nm3PerHour.toFixed(0)} Nm³/h H₂ at ${p.stackEffPct.toFixed(0)}% LHV.`,
    overview_paragraph_en: '',
    derived_parameters: { cell_count: p.cellCount, active_area_m2: p.activeAreaM2, total_pt_kg: p.totalPtKg },
    allowed_radicals: ['electrochemical_energy_function', 'electrical_conducting_function', 'titanium', 'steel', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [stack],
  }
}

function emitPowerElectronicsDc(p: Params): DesignModule {
  const dcPower = makeSubModule('rectifier_dc_supply', 'rectifier DC supply', 'rectifies',
    `MV AC to DC current sized for ${(p.cellCount * 2.0).toFixed(0)} V × ${(p.ratedPowerKw * 1000 / (p.cellCount * 2.0)).toFixed(0)} A operating point`,
    [
      word('thyristor_rectifier_word', 'thyristor rectifier',
        cc('thyristor_rectifier', 'thyristor rectifier', 'silicon_semiconductor_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×1'), mod('capacity', p.ratedPowerKw.toFixed(0), 'kW'), mod('form', '12-pulse SCR'), mod('regulatory', 'IEC 60146-1-1')]),
      word('dc_smoothing_inductor_word', 'DC smoothing inductor',
        cc('dc_smoothing_inductor', 'DC smoothing inductor', 'magnetic_coupling_function', 'copper'),
        [mod('quantity', '×1'), mod('capacity', '5', 'mH'), mod('dimension', String(Math.round(p.ratedPowerKw * 1000 / (p.cellCount * 2.0))), 'A')]),
      word('current_shunt_word', 'current shunt',
        cc('current_shunt', 'current shunt', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×1'), mod('form', 'manganin water-cooled'), mod('capacity', '0.5', 'mV/A')]),
      word('dc_busbar_word', 'DC busbar',
        cc('dc_busbar', 'DC busbar', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×2'), mod('form', 'Cu tin-plated'), mod('capacity', String(Math.round(p.ratedPowerKw * 1000 / (p.cellCount * 2.0))), 'A')]),
      // 2026-05-24 orphan-fix: new word so engineering-contract macro
      // `transformer_rectifier_unit` (tokens: transformer+rectifier)
      // propagates here.
      word('transformer_rectifier_word', 'transformer-rectifier',
        cc('transformer_rectifier', 'transformer-rectifier', 'magnetic_coupling_function', 'copper'),
        [mod('quantity', '×1'), mod('capacity', p.ratedPowerKw.toFixed(0), 'kW'), mod('form', 'isolation step-down transformer + 12-pulse SCR/IGBT rectifier'), mod('regulatory', 'IEC 60076 + IEC 60146-1-1')]),
    ])
  return {
    module: 'power_electronics_DC',
    module_brief: `12-pulse thyristor rectifier (£65/kW class) delivers low-ripple DC to the stack via 5 mH smoothing inductor and water-cooled manganin shunt.`,
    overview_paragraph_en: '',
    // 2026-05-23 P0-4 fix: was `q({ quantities: {} } as any, 'rectifier_efficiency_pct', 97)`
    // — a paste error that wrapped 97 in a q() call against an EMPTY
    // quantities object, so 97 was always returned. The wrapper pretended
    // to be dynamic but couldn't be. emitPowerElectronicsDc only receives
    // `Params`, not the orchestrator contract. Honest fix: literal 97 with
    // a comment that this is a class anchor (12-pulse SCR rectifier typical
    // efficiency, IEC 60146-1-1). To make this truly contract-driven later,
    // pass the contract through Params or change the emitter signature.
    derived_parameters: { rectifier_efficiency_pct: 97 },
    allowed_radicals: ['silicon_semiconductor_function', 'magnetic_coupling_function', 'electrical_conducting_function', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [dcPower],
  }
}

function emitWaterSupplyDi(p: Params): DesignModule {
  const water = makeSubModule('di_water_supply', 'DI water supply', 'feeds',
    `${(p.h2KgPerDay * 9 / 24).toFixed(0)} kg/h DI water (resistivity > 1 MΩ·cm) to the stack via recirculation pump`,
    [
      word('di_water_polisher_word', 'DI water polisher',
        cc('di_water_polisher', 'DI water polisher', 'electrochemical_energy_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'mixed-bed ion exchange'), mod('regulatory', 'ASTM Type I')]),
      word('feed_water_pump_word', 'feed water pump',
        cc('feed_water_pump', 'feed water pump', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×2'), mod('form', 'magnetic-coupled centrifugal'), mod('capacity', (p.h2KgPerDay * 9 / 24 / 60).toFixed(2), 'L/min')]),
      word('water_filter_word', 'water filter',
        cc('water_filter', 'water filter', null, 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('form', '0.2 µm PTFE')]),
      word('di_water_storage_tank_word', 'DI water storage tank',
        cc('di_water_storage_tank', 'DI water storage tank', 'pressure_vessel_function', 'steel'),
        [mod('quantity', '×1'), mod('capacity', '500', 'L'), mod('form', 'SS316L electropolished')]),
      word('water_conductivity_sensor_word', 'water conductivity sensor',
        cc('water_conductivity_sensor', 'water conductivity sensor', 'electrical_conducting_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('regulatory', 'ASTM D1125'), mod('capacity', '0.05', 'µS/cm')]),
      // 2026-05-24 orphan-fix: new word so engineering-contract macro
      // `water_purification_skid` (tokens: water+purification+skid)
      // propagates here.
      word('water_purification_skid_word', 'water purification skid',
        cc('water_purification_skid', 'water purification skid', 'electrochemical_energy_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'RO + EDI + polish skid to ASTM Type I/II'), mod('capacity', (p.h2KgPerDay * 9 / 24).toFixed(0), 'kg/h')]),
    ])
  return {
    module: 'water_supply_DI',
    module_brief: 'Mixed-bed ion-exchange polisher feeds DI water at ASTM Type I purity into a 500 L SS316L buffer tank with redundant magnetic-coupled pumps and 0.2 µm filtration.',
    overview_paragraph_en: '',
    derived_parameters: { feed_water_kg_h: (p.h2KgPerDay * 9 / 24) },
    allowed_radicals: ['electromechanical_switching_function', 'pressure_vessel_function', 'electrochemical_energy_function', 'electrical_conducting_function', 'steel', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [water],
  }
}

function emitGasSeparationH2O2(p: Params): DesignModule {
  const sep = makeSubModule('gas_liquid_separation', 'gas/liquid separation', 'separates',
    'two-phase H₂ + O₂ + recirculating water streams via gravity separators and demisters',
    [
      word('h2_separator_vessel_word', 'H₂ separator vessel',
        cc('h2_separator_vessel', 'H₂ separator vessel', 'pressure_vessel_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'vertical knock-out drum'), mod('regulatory', 'PED 2014/68/EU'), mod('capacity', '150', 'L')]),
      word('o2_separator_vessel_word', 'O₂ separator vessel',
        cc('o2_separator_vessel', 'O₂ separator vessel', 'pressure_vessel_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'vertical knock-out drum'), mod('regulatory', 'PED 2014/68/EU'), mod('capacity', '150', 'L')]),
      word('demister_pad_word', 'demister pad',
        cc('demister_pad', 'demister pad', null, 'steel'),
        [mod('quantity', '×2'), mod('form', 'SS316L wire mesh'), mod('regulatory', 'NACE MR0175')]),
      word('h2_dryer_word', 'H₂ dryer',
        cc('h2_dryer', 'H₂ dryer', 'chemical_sensing_function', 'ceramic'),
        [mod('quantity', '×1'), mod('form', 'twin-tower PSA'), mod('regulatory', 'ISO 14687-2'), mod('capacity', '99.97', '%')]),
      word('h2_purity_sensor_word', 'H₂ purity sensor',
        cc('h2_purity_sensor', 'H₂ purity sensor', 'optical_sensing_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'TCD analyser'), mod('regulatory', 'ISO 14687-2')]),
      // 2026-05-24 orphan-fix: new word so engineering-contract macro
      // `gas_separator_drying_skid` (tokens: gas+separator+drying+skid)
      // propagates here.
      word('gas_separator_drying_skid_word', 'gas separator + drying skid',
        cc('gas_separator_drying_skid', 'gas separator + drying skid', 'pressure_vessel_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'H₂/O₂ knock-out separators + TSA molecular-sieve drying to <5 ppm H₂O'), mod('capacity', p.h2KgPerDay.toFixed(0), 'kg/day')]),
    ])
  return {
    module: 'gas_separation_H2_O2',
    module_brief: 'PED-certified knock-out drums separate H₂ + O₂ from recirculating water; SS316L demisters + twin-tower PSA dryer deliver ISO 14687-2 grade 99.97% H₂.',
    overview_paragraph_en: '',
    derived_parameters: { h2_purity_pct: 99.97 },
    allowed_radicals: ['pressure_vessel_function', 'chemical_sensing_function', 'optical_sensing_function', 'steel', 'polymer_thermoplastic', 'ceramic'],
    applicability_confidence: 'high',
    sub_modules: [sep],
  }
}

function emitBalanceOfPlant(_p: Params): DesignModule {
  const bop = makeSubModule('balance_of_plant', 'balance of plant', 'circulates',
    'process fluids through valves, sensors, filters and instrumentation',
    [
      word('process_valve_word', 'process valve',
        cc('process_valve', 'process valve', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', fmtQty(28)), mod('form', 'pneumatic ball valves Ti-trimmed'), mod('regulatory', 'API 6D')]),
      word('safety_relief_valve_word', 'safety relief valve',
        cc('safety_relief_valve', 'safety relief valve', 'pressure_vessel_function', 'steel'),
        [mod('quantity', fmtQty(6)), mod('regulatory', 'ASME VIII / API 526'), mod('form', 'spring-loaded')]),
      word('pressure_transducer_word', 'pressure transducer',
        cc('pressure_transducer', 'pressure transducer', 'pressure_vessel_function', 'steel'),
        [mod('quantity', fmtQty(12)), mod('form', '4-20 mA'), mod('regulatory', 'ATEX zone 1')]),
      word('temperature_transducer_word', 'temperature transducer',
        cc('temperature_transducer', 'temperature transducer', 'thermal_transfer_function', 'ceramic'),
        [mod('quantity', fmtQty(16)), mod('form', 'PT-100 4-wire'), mod('regulatory', 'ATEX zone 1')]),
      word('h2_leak_sensor_word', 'H₂ leak sensor',
        cc('h2_leak_sensor', 'H₂ leak sensor', 'chemical_sensing_function', 'ceramic'),
        [mod('quantity', fmtQty(8)), mod('form', 'catalytic + IR'), mod('regulatory', 'IEC 60079-29-1')]),
      // 2026-05-24 orphan-fix: new word so engineering-contract macro
      // `balance_of_plant_piping` (tokens: balance+plant+piping) propagates here.
      word('balance_of_plant_piping_word', 'balance of plant piping',
        cc('balance_of_plant_piping', 'balance of plant piping', null, 'steel'),
        [mod('quantity', '×1'), mod('form', '316L SS + Hastelloy C-276 wetted parts + manual/actuated valves + N₂ purge'), mod('regulatory', 'ASME B31.12')]),
    ])
  return {
    module: 'balance_of_plant',
    module_brief: 'API/ATEX-rated pneumatic valves, pressure relief, transducers and H₂ leak sensors instrument the process loops to IEC 60079-29 standards.',
    overview_paragraph_en: '',
    derived_parameters: { valve_count: 28, leak_sensor_count: 8 },
    allowed_radicals: ['electromechanical_switching_function', 'pressure_vessel_function', 'chemical_sensing_function', 'thermal_transfer_function', 'steel', 'ceramic'],
    applicability_confidence: 'high',
    sub_modules: [bop],
  }
}

function emitCoolingLoop(p: Params): DesignModule {
  const cooling = makeSubModule('cooling_loop', 'cooling loop', 'rejects',
    `${p.heatRejectionKw.toFixed(0)} kW stack heat via plate heat exchanger + air-cooled chiller`,
    [
      word('plate_heat_exchanger_word', 'plate heat exchanger',
        cc('plate_heat_exchanger', 'plate heat exchanger', 'thermal_transfer_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'Alfa Laval CB60'), mod('capacity', p.coolingKw.toFixed(0), 'kW'), mod('regulatory', 'PED 2014/68/EU')]),
      word('air_cooled_chiller_word', 'air cooled chiller',
        cc('air_cooled_chiller', 'air-cooled chiller', 'thermal_transfer_function', 'aluminium'),
        [mod('quantity', '×1'), mod('capacity', p.coolingKw.toFixed(0), 'kW'), mod('form', 'R513A')]),
      word('circulation_pump_word', 'circulation pump',
        cc('circulation_pump', 'circulation pump', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×2'), mod('form', 'centrifugal duty/standby'), mod('capacity', '15', 'kW')]),
      word('expansion_tank_word', 'expansion tank',
        cc('expansion_tank', 'expansion tank', 'pressure_vessel_function', 'steel'),
        [mod('quantity', '×1'), mod('capacity', '50', 'L')]),
      // 2026-05-24 orphan-fix: new word so engineering-contract macro
      // `cooling_water_skid` (tokens: cooling+water+skid) propagates here.
      word('cooling_water_skid_word', 'cooling water skid',
        cc('cooling_water_skid', 'cooling water skid', 'thermal_transfer_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'chiller + dry cooler + circulation pumps + DI water cooling loop'), mod('capacity', p.heatRejectionKw.toFixed(0), 'kW')]),
    ])
  return {
    module: 'cooling_loop',
    module_brief: `Plate HX (${p.coolingKw.toFixed(0)} kW) rejects stack heat to air-cooled R513A chiller via 2× 15 kW duty/standby circulation pumps.`,
    overview_paragraph_en: '',
    derived_parameters: { heat_rejection_kw: p.heatRejectionKw, cooling_capacity_kw: p.coolingKw },
    allowed_radicals: ['thermal_transfer_function', 'electromechanical_switching_function', 'pressure_vessel_function', 'steel', 'aluminium'],
    applicability_confidence: 'high',
    sub_modules: [cooling],
  }
}

function emitControlAvionics(_p: Params): DesignModule {
  const control = makeSubModule('plant_plc', 'plant PLC', 'orchestrates',
    'startup, shutdown, ramp + safety interlocks via redundant SIL2-rated PLC',
    [
      word('safety_plc_word', 'safety PLC',
        cc('safety_plc', 'safety PLC', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Siemens S7-1500F'), mod('regulatory', 'IEC 61508 SIL2')]),
      word('hmi_panel_word', 'HMI panel',
        cc('hmi_panel', 'HMI panel', 'optical_sensing_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Siemens TP1900 19"'), mod('regulatory', 'IP65')]),
      word('emergency_shutdown_button_word', 'emergency shutdown button',
        cc('emergency_shutdown_button', 'emergency shutdown button', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [mod('quantity', '×4'), mod('form', 'mushroom-head'), mod('regulatory', 'EN ISO 13850')]),
      word('uninterruptible_psu_word', 'UPS',
        cc('uninterruptible_psu', 'uninterruptible PSU', 'electrochemical_energy_function', 'lithium_iron_phosphate_chemistry'),
        [mod('quantity', '×1'), mod('capacity', '10', 'kWh')]),
      // 2026-05-24 orphan-fix: new word so engineering-contract macro
      // `control_safety_skid` (tokens: control+safety+skid) propagates here.
      word('control_safety_skid_word', 'control + safety skid',
        cc('control_safety_skid', 'control + safety skid', 'silicon_semiconductor_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'SIL2 safety PLC + ATEX H₂ detection + N₂ purge skid + SCADA HMI')]),
    ])
  return {
    module: 'control_avionics',
    module_brief: 'IEC 61508 SIL2 redundant safety PLC with 19" HMI, four mushroom E-stops and 10 kWh LFP UPS to drive safe shutdown on grid loss.',
    overview_paragraph_en: '',
    derived_parameters: { ups_kwh: 10, estop_count: 4 },
    allowed_radicals: ['silicon_semiconductor_function', 'optical_sensing_function', 'electromechanical_switching_function', 'electrochemical_energy_function', 'lithium_iron_phosphate_chemistry', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [control],
  }
}

function emitH2StorageCompression(p: Params): DesignModule {
  const storage = makeSubModule('h2_buffer_storage', 'H₂ buffer storage', 'stores',
    `${p.h2KgPerDay.toFixed(0)} kg/day H₂ at ${p.operatingPressureBar} bar in ASME VIII-1 SS316L buffer tank`,
    [
      word('h2_buffer_tank_word', 'H₂ buffer tank',
        cc('h2_buffer_tank', 'H₂ buffer tank', 'pressure_vessel_function', 'steel'),
        [mod('quantity', '×1'), mod('capacity', '5', 'm³'), mod('dimension', String(p.operatingPressureBar), 'bar'), mod('regulatory', 'ASME VIII-1')]),
      word('compressor_unit_word', 'compressor unit',
        cc('compressor_unit', 'compressor unit', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'diaphragm reciprocating'), mod('capacity', (p.h2Nm3PerHour / 50).toFixed(1), 'kW'), mod('regulatory', 'API 618')]),
      word('h2_outlet_isolation_valve_word', 'H₂ outlet isolation valve',
        cc('h2_outlet_isolation_valve', 'H₂ outlet isolation valve', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'pneumatic + manual'), mod('regulatory', 'API 6D + Fire-safe')]),
    ])
  return {
    module: 'h2_storage_compression',
    module_brief: `5 m³ SS316L ASME VIII-1 buffer tank at ${p.operatingPressureBar} bar with API 618 diaphragm compressor and fire-safe isolation valve.`,
    overview_paragraph_en: '',
    derived_parameters: { h2_buffer_volume_m3: 5, operating_pressure_bar: p.operatingPressureBar },
    allowed_radicals: ['pressure_vessel_function', 'electromechanical_switching_function', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [storage],
  }
}

function emitRegulatoryCertification(_p: Params): DesignModule {
  const cert = makeSubModule('regulatory_dossier', 'regulatory dossier', 'documents',
    'PED + ATEX + ISO 22734 + CE conformity per EU hydrogen-plant rule-set',
    [
      word('ped_certificate_word', 'PED certificate',
        cc('ped_certificate', 'PED certificate', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'PED 2014/68/EU module H')]),
      word('atex_zone_drawing_word', 'ATEX zone drawing',
        cc('atex_zone_drawing', 'ATEX zone drawing', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'ATEX 114 zone 1+2')]),
      word('iso_22734_certificate_word', 'ISO 22734 certificate',
        cc('iso_22734_certificate', 'ISO 22734 certificate', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'ISO 22734')]),
      word('ce_declaration_word', 'CE declaration',
        cc('ce_declaration', 'CE declaration of conformity', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'EU MD 2006/42/EC')]),
      word('safety_signage_kit_word', 'safety signage kit',
        cc('safety_signage_kit', 'safety signage kit', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'EN ISO 7010')]),
    ])
  return {
    module: 'regulatory_certification',
    module_brief: 'Plant ships with PED module H, ATEX zone drawing, ISO 22734 + CE conformity declarations + EN ISO 7010 signage.',
    overview_paragraph_en: '',
    derived_parameters: { mandatory_count: 7 },
    allowed_radicals: ['polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [cert],
  }
}

function emitElectricalSubstation(p: Params): DesignModule {
  const substation = makeSubModule('mv_substation', 'MV substation', 'connects',
    `${p.transformerKva.toFixed(0)} kVA at 11 kV grid via oil-immersed Dyn11 transformer with G99 protection`,
    [
      word('mv_transformer_word', 'MV transformer',
        cc('mv_transformer', 'MV transformer', 'magnetic_coupling_function', 'copper'),
        [mod('quantity', '×1'), mod('capacity', p.transformerKva.toFixed(0), 'kVA'), mod('form', 'oil-immersed Dyn11'), mod('regulatory', 'IEC 60076')]),
      word('mv_switchgear_word', 'MV switchgear',
        cc('mv_switchgear', 'MV switchgear', 'electromechanical_switching_function', 'copper'),
        [mod('quantity', '×1'), mod('capacity', '630', 'A'), mod('dimension', '11', 'kV'), mod('regulatory', 'IEC 62271-200')]),
      word('g99_protection_relay_word', 'G99 protection relay',
        cc('g99_protection_relay', 'G99 protection relay', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Comap InteliPro G99/3'), mod('regulatory', 'ENA G99/3-3')]),
      word('grounding_lug_set_word', 'grounding lug set',
        cc('grounding_lug_set', 'grounding lug set', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×4'), mod('form', 'M10 copper')]),
    ])
  return {
    module: 'electrical_substation',
    module_brief: `Oil-immersed ${p.transformerKva.toFixed(0)} kVA Dyn11 11 kV/690 V transformer with IEC 62271-200 MV switchgear and G99/3 protection relay.`,
    overview_paragraph_en: '',
    derived_parameters: { transformer_kva: p.transformerKva },
    allowed_radicals: ['magnetic_coupling_function', 'electromechanical_switching_function', 'silicon_semiconductor_function', 'electrical_conducting_function', 'copper', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [substation],
  }
}

function emitMonitoring(_p: Params): DesignModule {
  const monitoring = makeSubModule('opc_ua_telemetry', 'OPC-UA telemetry', 'reports',
    'process + electrical + grid data to remote O&M via OPC-UA + MQTT',
    [
      word('opc_ua_gateway_word', 'OPC-UA gateway',
        cc('opc_ua_gateway', 'OPC-UA gateway', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Siemens SCALANCE LP-77'), mod('regulatory', 'IEC 62443')]),
      word('flow_meter_h2_word', 'H₂ flow meter',
        cc('flow_meter_h2', 'H₂ flow meter', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×2'), mod('form', 'Coriolis mass flow'), mod('regulatory', 'OIML R-117')]),
      word('site_4g_modem_word', 'site 4G modem',
        cc('site_4g_modem', 'site 4G modem', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'RED')]),
    ])
  return {
    module: 'monitoring',
    module_brief: 'OPC-UA gateway over IEC 62443 + 2× OIML R-117 Coriolis H₂ flow meters + remote 4G modem.',
    overview_paragraph_en: '',
    derived_parameters: { flow_meter_count: 2 },
    allowed_radicals: ['silicon_semiconductor_function', 'electromechanical_switching_function', 'steel', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [monitoring],
  }
}

function emitCrossModuleGrammarLinks(p: Params) {
  return [
    { from_module: 'electrical_substation', to_module: 'power_electronics_DC', mechanism: 'electrical_bus', type: 'mutual' as const, detail: `${p.transformerKva.toFixed(0)} kVA AC to rectifier` },
    { from_module: 'power_electronics_DC', to_module: 'stack_cells', mechanism: 'dc_bus', type: 'directional' as const, detail: `${p.ratedPowerKw} kW DC to stack` },
    { from_module: 'water_supply_DI', to_module: 'stack_cells', mechanism: 'fluid_loop', type: 'directional' as const, detail: 'DI water feed' },
    { from_module: 'stack_cells', to_module: 'gas_separation_H2_O2', mechanism: 'fluid_loop', type: 'directional' as const, detail: 'H₂ + O₂ + water outlet' },
    { from_module: 'gas_separation_H2_O2', to_module: 'h2_storage_compression', mechanism: 'fluid_loop', type: 'directional' as const, detail: 'dried H₂ to buffer' },
    { from_module: 'cooling_loop', to_module: 'stack_cells', mechanism: 'thermal', type: 'mutual' as const, detail: `${p.heatRejectionKw.toFixed(0)} kW heat rejection` },
    { from_module: 'balance_of_plant', to_module: 'stack_cells', mechanism: 'control', type: 'directional' as const, detail: 'valve + sensor manifold' },
    { from_module: 'control_avionics', to_module: 'power_electronics_DC', mechanism: 'control', type: 'mutual' as const, detail: 'current ramp' },
    { from_module: 'control_avionics', to_module: 'balance_of_plant', mechanism: 'control', type: 'mutual' as const, detail: 'valve sequencing' },
    { from_module: 'monitoring', to_module: 'control_avionics', mechanism: 'data', type: 'mutual' as const, detail: 'OPC-UA' },
    { from_module: 'regulatory_certification', to_module: 'gas_separation_H2_O2', mechanism: 'documentation', type: 'directional' as const, detail: 'PED certification of separators' },
  ]
}

export const h2ElectrolyserEmitter: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveParams(contract as ContractInProgress)
  return {
    modules: [
      emitStackCells(p),
      emitPowerElectronicsDc(p),
      emitWaterSupplyDi(p),
      emitGasSeparationH2O2(p),
      emitBalanceOfPlant(p),
      emitCoolingLoop(p),
      emitControlAvionics(p),
      emitH2StorageCompression(p),
      emitRegulatoryCertification(p),
      emitElectricalSubstation(p),
      emitMonitoring(p),
    ],
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: '11-module taxonomy covers PEM electrolyser stack through MV grid + H₂ buffer + regulatory + monitoring.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Produce ${p.h2KgPerDay.toFixed(0)} kg/day green H₂ (${p.h2Nm3PerHour.toFixed(0)} Nm³/h) at ${p.operatingPressureBar} bar from ${p.ratedPowerMw.toFixed(1)} MW PEM electrolyser stack at ${p.stackEffPct.toFixed(0)}% LHV efficiency per ISO 22734.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('h2_electrolyser', h2ElectrolyserEmitter)
