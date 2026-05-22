/**
 * scripts/lib/orchestrator/emitters/pemfc.ts
 *
 * PEMFC DETERMINISTIC EMITTER — 50-200 kW proton-exchange membrane fuel cell.
 * Targets Ballard FCmove / Plug Power ProGen / Toyota Mirai stack class.
 *
 * Modules (10):
 *   1. stack_cells              — PEM cells in series stack
 *   2. bipolar_plates           — graphite + metal bipolar plates
 *   3. membranes_MEA            — Nafion + Pt catalyst MEA
 *   4. h2_supply                — anode hydrogen feed + tank
 *   5. o2_air_supply            — cathode air compressor + humidifier
 *   6. water_management         — product water removal + recirculation
 *   7. cooling_loop             — glycol-water cooling + radiator
 *   8. dc_dc_converter          — SiC boost converter to 400 V DC
 *   9. controller_avionics      — stack controller + safety logic
 *  10. regulatory_safety        — IEC 62282 + EC 79 + SAE J2578 signage
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
  cellCount: number
  cellVoltageV: number
  currentDensityAcm2: number
  stackEfficiencyPct: number
  stackTemperatureC: number
  operatingPressureBar: number
  heatRejectionKw: number
  coolingKw: number
  h2ConsumptionKgH: number
  ptLoadingMgCm2: number
  totalPtKg: number
  durabilityHours: number
  airCompressorKw: number
  totalMassKg: number
}

function q(contract: ContractInProgress, key: string, fallback: number): number {
  const v = (contract as any).quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function deriveParams(contract: ContractInProgress): Params {
  const ratedPowerKw = Math.max(10, q(contract, 'rated_power_kw', 100))
  const cellCount = Math.max(150, Math.round(q(contract, 'cell_count', ratedPowerKw * 4)))
  const cellVoltageV = q(contract, 'cell_voltage_v', 0.68)
  const currentDensityAcm2 = q(contract, 'current_density_a_cm2', 1.5)
  const stackEfficiencyPct = q(contract, 'stack_efficiency_pct', 55)
  const stackTemperatureC = q(contract, 'stack_temperature_c', 80)
  const operatingPressureBar = q(contract, 'operating_pressure_bar', 2.5)
  const heatRejectionKw = q(contract, 'heat_rejection_kw', ratedPowerKw * 0.45)
  const coolingKw = q(contract, 'cooling_capacity_kw', heatRejectionKw * 1.25)
  const h2ConsumptionKgH = q(contract, 'h2_consumption_kg_h', ratedPowerKw * 0.06)
  const ptLoadingMgCm2 = q(contract, 'pt_loading_mg_cm2', 0.4)
  const totalPtKg = q(contract, 'total_pt_kg', 0.15)
  const durabilityHours = q(contract, 'durability_hours', 10000)
  const airCompressorKw = q(contract, 'air_compressor_kw', ratedPowerKw * 0.08)
  const totalMassKg = q(contract, 'total_system_mass_kg', ratedPowerKw * 2.5)
  return { ratedPowerKw, cellCount, cellVoltageV, currentDensityAcm2, stackEfficiencyPct, stackTemperatureC, operatingPressureBar, heatRejectionKw, coolingKw, h2ConsumptionKgH, ptLoadingMgCm2, totalPtKg, durabilityHours, airCompressorKw, totalMassKg }
}

function emitStackCells(p: Params): DesignModule {
  const stack = makeSubModule('pemfc_stack', 'PEMFC stack', 'generates',
    `${p.ratedPowerKw} kW DC via ${p.cellCount} cells in series at ${p.cellVoltageV.toFixed(2)} V/cell, ${p.currentDensityAcm2.toFixed(2)} A/cm² at ${p.stackTemperatureC}°C`,
    [
      word('pemfc_cell_word', 'PEMFC cell',
        cc('pemfc_cell', 'PEMFC cell', 'electrochemical_energy_function', 'polymer_thermoplastic'),
        [mod('quantity', fmtQty(p.cellCount)), mod('form', 'Nafion 211/212 membrane'), mod('regulatory', 'IEC 62282-3-100')]),
      word('end_plate_pemfc_word', 'end plate',
        cc('end_plate_pemfc', 'end plate', null, 'aluminium'),
        [mod('quantity', '×2'), mod('form', 'machined Al 6061-T6'), mod('dimension', '40', 'mm')]),
      word('insulation_plate_word', 'insulation plate',
        cc('insulation_plate', 'insulation plate', null, 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('form', 'PPS')]),
      word('compression_band_word', 'compression band',
        cc('compression_band', 'compression band', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×4'), mod('form', 'stainless tie-rod')]),
    ])
  return {
    module: 'stack_cells',
    module_brief: `${p.cellCount}-cell PEMFC stack with machined Al 6061-T6 end-plates and 4× stainless tie-rod compression per Ballard FCmove convention.`,
    overview_paragraph_en: '',
    derived_parameters: { cell_count: p.cellCount, cell_voltage_v: p.cellVoltageV, current_density: p.currentDensityAcm2 },
    allowed_radicals: ['electrochemical_energy_function', 'electromechanical_switching_function', 'polymer_thermoplastic', 'aluminium', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [stack],
  }
}

function emitBipolarPlates(p: Params): DesignModule {
  const plates = makeSubModule('bipolar_plate_set', 'bipolar plate set', 'distributes',
    `H₂ + air + coolant flows across ${p.cellCount} cells via graphite-composite bipolar plates`,
    [
      word('graphite_bipolar_plate_word', 'graphite bipolar plate',
        cc('graphite_bipolar_plate', 'graphite bipolar plate', 'electrical_conducting_function', 'graphite'),
        [mod('quantity', fmtQty(p.cellCount + 1)), mod('form', 'compression-moulded graphite-polymer'), mod('dimension', '1.5', 'mm')]),
      word('flow_field_gasket_word', 'flow field gasket',
        cc('flow_field_gasket', 'flow field gasket', null, 'polymer_thermoplastic'),
        [mod('quantity', fmtQty(p.cellCount * 2)), mod('form', 'silicone moulded'), mod('regulatory', 'FDA-grade')]),
      word('plate_alignment_pin_word', 'plate alignment pin',
        cc('plate_alignment_pin', 'plate alignment pin', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×8'), mod('form', 'stainless dowel')]),
    ])
  return {
    module: 'bipolar_plates',
    module_brief: `${p.cellCount + 1} compression-moulded graphite-polymer bipolar plates with silicone flow-field gaskets and stainless alignment pins.`,
    overview_paragraph_en: '',
    derived_parameters: { plate_count: p.cellCount + 1 },
    allowed_radicals: ['electrical_conducting_function', 'electromechanical_switching_function', 'graphite', 'polymer_thermoplastic', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [plates],
  }
}

function emitMembranesMea(p: Params): DesignModule {
  const mea = makeSubModule('mea_assembly', 'MEA assembly', 'catalyses',
    `H₂ + O₂ reaction across ${p.cellCount} MEAs with ${p.ptLoadingMgCm2.toFixed(2)} mg/cm² Pt loading and ${(p.totalPtKg * 1000).toFixed(0)} g Pt total`,
    [
      word('nafion_membrane_word', 'Nafion membrane',
        cc('nafion_membrane', 'Nafion membrane', 'electrochemical_energy_function', 'polymer_thermoplastic'),
        [mod('quantity', fmtQty(p.cellCount)), mod('form', 'Nafion 211'), mod('dimension', '25', 'µm'), mod('regulatory', 'ASTM D3833')]),
      word('cathode_catalyst_layer_word', 'cathode catalyst layer',
        cc('cathode_catalyst_layer', 'cathode catalyst layer', 'electrochemical_energy_function', 'platinum'),
        [mod('quantity', fmtQty(p.cellCount)), mod('form', 'Pt/C 50 wt%'), mod('capacity', '0.30', 'mg Pt/cm²')]),
      word('anode_catalyst_layer_word', 'anode catalyst layer',
        cc('anode_catalyst_layer', 'anode catalyst layer', 'electrochemical_energy_function', 'platinum'),
        [mod('quantity', fmtQty(p.cellCount)), mod('form', 'Pt/C 40 wt%'), mod('capacity', '0.10', 'mg Pt/cm²')]),
      word('gdl_word', 'GDL',
        cc('gas_diffusion_layer', 'gas diffusion layer', 'electrochemical_energy_function', 'graphite'),
        [mod('quantity', fmtQty(p.cellCount * 2)), mod('form', 'Toray TGP-H-090 carbon paper'), mod('dimension', '280', 'µm')]),
    ])
  return {
    module: 'membranes_MEA',
    module_brief: `${p.cellCount}-MEA assembly with Nafion 211 (25 µm), Toray TGP-H-090 GDL, and ${(p.totalPtKg * 1000).toFixed(0)} g total Pt loading (0.30 mg/cm² cathode + 0.10 mg/cm² anode).`,
    overview_paragraph_en: '',
    derived_parameters: { mea_count: p.cellCount, total_pt_kg: p.totalPtKg },
    allowed_radicals: ['electrochemical_energy_function', 'platinum', 'graphite', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [mea],
  }
}

function emitH2Supply(p: Params): DesignModule {
  const h2 = makeSubModule('hydrogen_supply', 'hydrogen supply', 'feeds',
    `${p.h2ConsumptionKgH.toFixed(2)} kg/h H₂ to anode from 700-bar tank via pressure regulator and recirculation pump`,
    [
      word('h2_tank_700bar_word', 'H₂ tank 700 bar',
        cc('h2_tank_700bar', 'H₂ tank 700 bar', 'pressure_vessel_function', 'composite_carbon_epoxy'),
        [mod('quantity', '×1'), mod('capacity', '0.25', 'm³'), mod('dimension', '700', 'bar'), mod('regulatory', 'EC 79 + IEC 62282-2-100')]),
      word('h2_pressure_regulator_word', 'H₂ pressure regulator',
        cc('h2_pressure_regulator', 'H₂ pressure regulator', 'pressure_vessel_function', 'steel'),
        [mod('quantity', '×1'), mod('form', '2-stage 700 bar → 2.5 bar'), mod('regulatory', 'EC 79')]),
      word('h2_recirculation_blower_word', 'H₂ recirculation blower',
        cc('h2_recirculation_blower', 'H₂ recirculation blower', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×1'), mod('capacity', (p.h2ConsumptionKgH * 1.4).toFixed(2), 'kg/h'), mod('form', 'Roots-type ATEX zone 1')]),
      word('h2_purge_valve_word', 'H₂ purge valve',
        cc('h2_purge_valve', 'H₂ purge valve', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×1'), mod('regulatory', 'ATEX zone 1'), mod('form', 'solenoid')]),
      word('h2_leak_sensor_word', 'H₂ leak sensor',
        cc('h2_leak_sensor', 'H₂ leak sensor', 'chemical_sensing_function', 'ceramic'),
        [mod('quantity', '×4'), mod('form', 'catalytic + IR redundant'), mod('regulatory', 'IEC 60079-29-1')]),
    ])
  return {
    module: 'h2_supply',
    module_brief: `0.25 m³ 700-bar CFRP Type IV H₂ tank with 2-stage regulator, Roots-type recirculation blower and 4× redundant H₂ leak sensors per IEC 60079.`,
    overview_paragraph_en: '',
    derived_parameters: { h2_tank_pressure_bar: 700, h2_consumption_kg_h: p.h2ConsumptionKgH },
    allowed_radicals: ['pressure_vessel_function', 'electromechanical_switching_function', 'chemical_sensing_function', 'composite_carbon_epoxy', 'steel', 'ceramic'],
    applicability_confidence: 'high',
    sub_modules: [h2],
  }
}

function emitO2AirSupply(p: Params): DesignModule {
  const o2 = makeSubModule('cathode_air_supply', 'cathode air supply', 'supplies',
    `${(p.ratedPowerKw * 0.6).toFixed(2)} kg/h compressed air (stoich 1.8) to cathode at ${p.operatingPressureBar} bar, humidified to 95% RH`,
    [
      word('air_compressor_word', 'air compressor',
        cc('air_compressor', 'air compressor', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×1'), mod('capacity', p.airCompressorKw.toFixed(2), 'kW'), mod('form', 'centrifugal oil-free'), mod('regulatory', 'ISO 8573-1 Class 0')]),
      word('air_filter_word', 'air filter',
        cc('air_filter', 'air filter', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'HEPA H13'), mod('regulatory', 'EN 1822')]),
      word('cathode_humidifier_word', 'cathode humidifier',
        cc('cathode_humidifier', 'cathode humidifier', 'thermal_transfer_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'membrane WTM'), mod('capacity', (p.ratedPowerKw * 0.03).toFixed(2), 'kg/h')]),
      word('air_back_pressure_valve_word', 'air back pressure valve',
        cc('air_back_pressure_valve', 'air back pressure valve', 'electromechanical_switching_function', 'aluminium'),
        [mod('quantity', '×1'), mod('form', 'electrically actuated butterfly')]),
      word('mass_air_flow_sensor_word', 'mass air flow sensor',
        cc('mass_air_flow_sensor', 'mass air flow sensor', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Bosch HFM5 class')]),
    ])
  return {
    module: 'o2_air_supply',
    module_brief: `${p.airCompressorKw.toFixed(2)} kW oil-free centrifugal compressor with HEPA H13 filter, membrane water-transfer humidifier (95% RH) and electric back-pressure valve.`,
    overview_paragraph_en: '',
    derived_parameters: { air_compressor_kw: p.airCompressorKw, stoichiometry: 1.8 },
    allowed_radicals: ['electromechanical_switching_function', 'thermal_transfer_function', 'polymer_thermoplastic', 'steel', 'aluminium'],
    applicability_confidence: 'high',
    sub_modules: [o2],
  }
}

function emitWaterManagement(p: Params): DesignModule {
  const wm = makeSubModule('water_management', 'water management', 'collects',
    `${(p.h2ConsumptionKgH * 9).toFixed(2)} kg/h product water from cathode and recirculates to humidifier`,
    [
      word('water_separator_word', 'water separator',
        cc('water_separator', 'water separator', 'pressure_vessel_function', 'aluminium'),
        [mod('quantity', '×1'), mod('form', 'cyclone + demister')]),
      word('water_storage_tank_word', 'water storage tank',
        cc('water_storage_tank', 'water storage tank', 'pressure_vessel_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('capacity', '5', 'L')]),
      word('water_pump_word', 'water pump',
        cc('water_pump', 'water pump', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'magnetic-coupled gear'), mod('capacity', '5', 'L/min')]),
      word('water_level_sensor_word', 'water level sensor',
        cc('water_level_sensor', 'water level sensor', 'optical_sensing_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('form', 'capacitive')]),
    ])
  return {
    module: 'water_management',
    module_brief: 'Cyclone separator collects product water into 5 L PP tank, magnetic-coupled gear pump recirculates to humidifier with redundant capacitive level sensors.',
    overview_paragraph_en: '',
    derived_parameters: { water_storage_l: 5 },
    allowed_radicals: ['pressure_vessel_function', 'electromechanical_switching_function', 'optical_sensing_function', 'aluminium', 'polymer_thermoplastic', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [wm],
  }
}

function emitCoolingLoop(p: Params): DesignModule {
  const cooling = makeSubModule('pemfc_cooling_loop', 'PEMFC cooling loop', 'rejects',
    `${p.heatRejectionKw.toFixed(0)} kW heat (≈ rated power) via glycol-water loop and air-cooled radiator`,
    [
      word('pemfc_radiator_word', 'PEMFC radiator',
        cc('pemfc_radiator', 'PEMFC radiator', 'thermal_transfer_function', 'aluminium'),
        [mod('quantity', '×1'), mod('capacity', p.coolingKw.toFixed(0), 'kW'), mod('form', 'extruded aluminium fin')]),
      word('glycol_pump_word', 'glycol pump',
        cc('glycol_pump', 'glycol pump', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×1'), mod('capacity', '3', 'kW'), mod('form', 'centrifugal')]),
      word('radiator_fan_word', 'radiator fan',
        cc('radiator_fan', 'radiator fan', 'thermal_transfer_function', 'polymer_thermoplastic'),
        [mod('quantity', fmtQty(Math.max(2, Math.round(p.coolingKw / 25)))), mod('form', 'EBM-Papst K3G')]),
      word('di_water_ion_exchanger_word', 'DI water ion exchanger',
        cc('di_water_ion_exchanger', 'DI water ion exchanger', 'electrochemical_energy_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'mixed-bed resin'), mod('capacity', '1', 'µS/cm target')]),
      word('coolant_thermostat_word', 'coolant thermostat',
        cc('coolant_thermostat', 'coolant thermostat', 'thermal_transfer_function', 'aluminium'),
        [mod('quantity', '×1'), mod('form', 'wax-pellet 78°C set-point')]),
    ])
  return {
    module: 'cooling_loop',
    module_brief: `${p.coolingKw.toFixed(0)} kW glycol-water radiator with ${Math.max(2, Math.round(p.coolingKw / 25))}× EBM-Papst fans, mixed-bed DI polisher and wax-pellet thermostat.`,
    overview_paragraph_en: '',
    derived_parameters: { heat_rejection_kw: p.heatRejectionKw, cooling_capacity_kw: p.coolingKw },
    allowed_radicals: ['thermal_transfer_function', 'electromechanical_switching_function', 'electrochemical_energy_function', 'aluminium', 'steel', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [cooling],
  }
}

function emitDcDcConverter(p: Params): DesignModule {
  const dcdc = makeSubModule('boost_dc_dc', 'boost DC-DC', 'boosts',
    `${(p.cellCount * p.cellVoltageV).toFixed(0)} V stack output to 400 V DC bus via SiC boost converter at η ≥ 97%`,
    [
      word('sic_mosfet_boost_word', 'SiC MOSFET boost',
        cc('sic_mosfet_boost', 'SiC MOSFET boost', 'silicon_semiconductor_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×6'), mod('dimension', '1200', 'V'), mod('capacity', '100', 'A')]),
      word('boost_inductor_word', 'boost inductor',
        cc('boost_inductor', 'boost inductor', 'magnetic_coupling_function', 'copper'),
        [mod('quantity', '×3'), mod('capacity', '200', 'µH')]),
      word('output_capacitor_bank_word', 'output capacitor bank',
        cc('output_capacitor_bank', 'output capacitor bank', 'electrical_conducting_function', 'aluminium'),
        [mod('quantity', '×1'), mod('capacity', '2200', 'µF')]),
      word('current_sensor_dc_word', 'current sensor DC',
        cc('current_sensor_dc', 'current sensor DC', 'electromechanical_switching_function', 'copper'),
        [mod('quantity', '×2'), mod('form', 'LEM LF series'), mod('capacity', String(Math.round(p.ratedPowerKw * 1000 / (p.cellCount * p.cellVoltageV) * 1.3)), 'A')]),
    ])
  return {
    module: 'dc_dc_converter',
    module_brief: `SiC MOSFET boost converter (6× 1200 V / 100 A) lifts stack output (${(p.cellCount * p.cellVoltageV).toFixed(0)} V) to 400 V at η ≥ 97% with 2200 µF output bank and LEM current sensors.`,
    overview_paragraph_en: '',
    derived_parameters: { dc_dc_efficiency_pct: 97, output_voltage_v: 400 },
    allowed_radicals: ['silicon_semiconductor_function', 'magnetic_coupling_function', 'electrical_conducting_function', 'electromechanical_switching_function', 'copper', 'aluminium'],
    applicability_confidence: 'high',
    sub_modules: [dcdc],
  }
}

function emitControllerAvionics(_p: Params): DesignModule {
  const controller = makeSubModule('stack_controller', 'stack controller', 'orchestrates',
    'air, fuel, cooling and electrical setpoints via real-time controller with SIL2 safety logic',
    [
      word('stack_ecu_word', 'stack ECU',
        cc('stack_ecu', 'stack ECU', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Vector VN1530 + Aurix Tricore'), mod('regulatory', 'ISO 26262 ASIL-C')]),
      word('safety_plc_pemfc_word', 'safety PLC',
        cc('safety_plc_pemfc', 'safety PLC', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Pilz PNOZ multi'), mod('regulatory', 'IEC 61508 SIL2')]),
      word('canbus_transceiver_word', 'CAN bus transceiver',
        cc('canbus_transceiver', 'CAN bus transceiver', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('form', 'TJA1051'), mod('regulatory', 'ISO 11898-2')]),
      word('emergency_stop_button_pemfc_word', 'emergency stop button',
        cc('emergency_stop_button_pemfc', 'emergency stop button', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('regulatory', 'EN ISO 13850')]),
      word('cell_voltage_monitor_word', 'cell voltage monitor',
        cc('cell_voltage_monitor', 'cell voltage monitor', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'modular bank'), mod('capacity', '1000', 'cells')]),
    ])
  return {
    module: 'controller_avionics',
    module_brief: 'Aurix Tricore stack ECU + Pilz PNOZ SIL2 safety PLC orchestrate stack via CAN bus with cell-voltage monitoring and dual EN ISO 13850 E-stops.',
    overview_paragraph_en: '',
    derived_parameters: { estop_count: 2 },
    allowed_radicals: ['silicon_semiconductor_function', 'electromechanical_switching_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [controller],
  }
}

function emitRegulatorySafety(_p: Params): DesignModule {
  const cert = makeSubModule('regulatory_signage', 'regulatory signage', 'documents',
    'IEC 62282-3-100 + EC 79 + SAE J2578 + ATEX + CE per EU fuel-cell ruleset',
    [
      word('iec_62282_label_word', 'IEC 62282 label',
        cc('iec_62282_label', 'IEC 62282 label', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'IEC 62282-3-100')]),
      word('ec_79_certificate_word', 'EC 79 certificate',
        cc('ec_79_certificate', 'EC 79 certificate', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'EC 79/2009 hydrogen vehicle')]),
      word('sae_j2578_certificate_word', 'SAE J2578 certificate',
        cc('sae_j2578_certificate', 'SAE J2578 certificate', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'SAE J2578')]),
      word('atex_zone_drawing_word', 'ATEX zone drawing',
        cc('atex_zone_drawing', 'ATEX zone drawing', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'ATEX 114 zone 1+2')]),
      word('ce_mark_word', 'CE mark',
        cc('ce_mark', 'CE mark', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'EU MD 2006/42/EC')]),
      word('h2_warning_label_word', 'H₂ warning label',
        cc('h2_warning_label', 'H₂ warning label', null, 'polymer_thermoplastic'),
        [mod('quantity', '×4'), mod('regulatory', 'EN ISO 7010')]),
    ])
  return {
    module: 'regulatory_safety',
    module_brief: 'IEC 62282-3-100 + EC 79 + SAE J2578 + ATEX 114 + CE marking + EN ISO 7010 H₂ warning labels.',
    overview_paragraph_en: '',
    derived_parameters: { mandatory_count: 5 },
    allowed_radicals: ['polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [cert],
  }
}

function emitCrossModuleGrammarLinks(p: Params) {
  return [
    { from_module: 'bipolar_plates', to_module: 'stack_cells', mechanism: 'electrical_bus', type: 'mutual' as const, detail: `series-connected ${p.cellCount} cells` },
    { from_module: 'membranes_MEA', to_module: 'stack_cells', mechanism: 'mechanical', type: 'directional' as const, detail: 'MEA between bipolar plates' },
    { from_module: 'h2_supply', to_module: 'stack_cells', mechanism: 'fluid_loop', type: 'directional' as const, detail: `${p.h2ConsumptionKgH.toFixed(2)} kg/h H₂ to anode` },
    { from_module: 'o2_air_supply', to_module: 'stack_cells', mechanism: 'fluid_loop', type: 'directional' as const, detail: `${(p.ratedPowerKw * 0.6).toFixed(2)} kg/h air to cathode` },
    { from_module: 'water_management', to_module: 'o2_air_supply', mechanism: 'fluid_loop', type: 'directional' as const, detail: 'recirculated water to humidifier' },
    { from_module: 'cooling_loop', to_module: 'stack_cells', mechanism: 'thermal', type: 'mutual' as const, detail: `${p.heatRejectionKw.toFixed(0)} kW heat rejection` },
    { from_module: 'stack_cells', to_module: 'dc_dc_converter', mechanism: 'dc_bus', type: 'directional' as const, detail: `${(p.cellCount * p.cellVoltageV).toFixed(0)} V stack output` },
    { from_module: 'controller_avionics', to_module: 'h2_supply', mechanism: 'control', type: 'mutual' as const, detail: 'H₂ flow setpoint' },
    { from_module: 'controller_avionics', to_module: 'o2_air_supply', mechanism: 'control', type: 'mutual' as const, detail: 'compressor + back-pressure setpoint' },
    { from_module: 'controller_avionics', to_module: 'cooling_loop', mechanism: 'control', type: 'mutual' as const, detail: 'pump + fan setpoints' },
    { from_module: 'controller_avionics', to_module: 'dc_dc_converter', mechanism: 'control', type: 'mutual' as const, detail: 'current setpoint' },
    { from_module: 'regulatory_safety', to_module: 'h2_supply', mechanism: 'documentation', type: 'directional' as const, detail: 'ATEX zone drawing for H₂ piping' },
  ]
}

export const pemfcEmitter: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveParams(contract as ContractInProgress)
  return {
    modules: [
      emitStackCells(p),
      emitBipolarPlates(p),
      emitMembranesMea(p),
      emitH2Supply(p),
      emitO2AirSupply(p),
      emitWaterManagement(p),
      emitCoolingLoop(p),
      emitDcDcConverter(p),
      emitControllerAvionics(p),
      emitRegulatorySafety(p),
    ],
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: '10-module taxonomy covers PEMFC stack + bipolar plates + MEA through H₂/air supply + water/cooling + DC-DC + controller + regulatory.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Generate ${p.ratedPowerKw} kW DC from PEMFC stack at η = ${p.stackEfficiencyPct.toFixed(0)}% LHV with ${p.durabilityHours.toFixed(0)} h durability per IEC 62282-3-100 and EC 79, consuming ${p.h2ConsumptionKgH.toFixed(2)} kg/h H₂ at ${p.stackTemperatureC}°C / ${p.operatingPressureBar} bar.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('pemfc', pemfcEmitter)
