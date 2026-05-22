/**
 * scripts/lib/orchestrator/emitters/ev-charger.ts
 *
 * EV CHARGER DETERMINISTIC EMITTER — DC fast charger 50-350 kW CCS2.
 * Targets ABB Terra HP / Tritium PKM150 / Siemens VersiCharge UltraDC class.
 *
 * Modules (10):
 *   1. power_modules         — parallel 30 kW SiC LLC-resonant modules
 *   2. dc_dc_converters       — DC-DC stage with isolation transformer
 *   3. ccs_outlet_cable      — CCS2 connector + liquid-cooled cable
 *   4. controller_OCPP        — OCPP 1.6/2.0.1 backend + ISO 15118 PnC
 *   5. hmi_payment           — HMI + contactless payment + RFID
 *   6. cooling_system        — glycol-water cooling unit
 *   7. electrical_panel      — AFE + AC switchgear
 *   8. transformer_grid      — MV step-down transformer
 *   9. cabinet_enclosure     — pedestal + cabinet
 *  10. regulatory_certification — IEC 61851 + ISO 15118 + safety
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
  peakPowerKw: number
  outputVoltageMaxV: number
  outputCurrentMaxA: number
  acInputCurrentA: number
  cableLengthM: number
  cableCsaMm2: number
  hvacCapacityKw: number
  powerModuleCount: number
  totalMassKg: number
  transformerKva: number
}

function q(contract: ContractInProgress, key: string, fallback: number): number {
  const v = (contract as any).quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function deriveParams(contract: ContractInProgress): Params {
  const ratedPowerKw = Math.max(20, q(contract, 'rated_power_kw', 150))
  const peakPowerKw = q(contract, 'peak_power_kw', ratedPowerKw * 1.05)
  const outputVoltageMaxV = q(contract, 'output_voltage_max_v', 1000)
  const outputCurrentMaxA = q(contract, 'output_current_max_a', (ratedPowerKw * 1000) / Math.max(200, outputVoltageMaxV / 2))
  const acInputCurrentA = q(contract, 'ac_input_current_a', (ratedPowerKw * 1000) / (400 * Math.sqrt(3) * 0.99 * 0.955))
  const cableLengthM = q(contract, 'cable_length_m', 5)
  const cableCsaMm2 = q(contract, 'cable_csa_mm2', 95)
  const hvacCapacityKw = q(contract, 'ev_hvac_capacity_kw', q(contract, 'heat_dissipation_kw', ratedPowerKw * 0.04) * 1.25)
  const powerModuleCount = Math.max(2, Math.round(q(contract, 'power_module_count', ratedPowerKw / 30)))
  const totalMassKg = q(contract, 'ev_total_system_mass_kg', q(contract, 'total_mass_kg', 250))
  const transformerKva = q(contract, 'ev_transformer_rating_kva', ratedPowerKw * 1.2)
  return { ratedPowerKw, peakPowerKw, outputVoltageMaxV, outputCurrentMaxA, acInputCurrentA, cableLengthM, cableCsaMm2, hvacCapacityKw, powerModuleCount, totalMassKg, transformerKva }
}

function emitPowerModules(p: Params): DesignModule {
  const pm = makeSubModule('parallel_power_modules', 'parallel power modules', 'delivers',
    `${p.ratedPowerKw} kW DC output via ${p.powerModuleCount}× 30 kW SiC modules in parallel`,
    [
      word('dc_dc_power_module_word', 'DC-DC power module',
        cc('dc_dc_power_module', 'DC-DC power module', 'silicon_semiconductor_function', 'silicon_semiconductor_function'),
        [mod('quantity', fmtQty(p.powerModuleCount)), mod('capacity', '30', 'kW'), mod('form', 'SiC LLC-resonant'), mod('regulatory', 'IEC 61851-23')]),
      word('power_module_heatsink_word', 'power module heatsink',
        cc('power_module_heatsink', 'power module heatsink', 'thermal_transfer_function', 'aluminium'),
        [mod('quantity', fmtQty(p.powerModuleCount)), mod('form', 'liquid cold-plate')]),
      word('module_busbar_word', 'module busbar',
        cc('module_busbar', 'module busbar', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×2'), mod('capacity', p.outputCurrentMaxA.toFixed(0), 'A')]),
    ])
  return {
    module: 'power_modules',
    module_brief: `${p.powerModuleCount}× 30 kW SiC LLC-resonant DC-DC modules in parallel, η ≥ 96%, with liquid cold-plate heatsinks.`,
    overview_paragraph_en: '',
    derived_parameters: { module_count: p.powerModuleCount, module_kw_each: 30, total_kw: p.ratedPowerKw },
    allowed_radicals: ['silicon_semiconductor_function', 'thermal_transfer_function', 'electrical_conducting_function', 'aluminium', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [pm],
  }
}

function emitDcDcConverters(p: Params): DesignModule {
  const dcdc = makeSubModule('llc_resonant_module', 'LLC resonant module', 'isolates',
    `${p.outputCurrentMaxA.toFixed(0)} A DC output via planar HF isolation transformer at 100 kHz LLC operation`,
    [
      word('llc_resonant_module_word', 'LLC resonant module',
        cc('llc_resonant_module', 'LLC resonant module', 'silicon_semiconductor_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×1'), mod('capacity', p.ratedPowerKw.toFixed(0), 'kW'), mod('form', 'series-parallel LLC'), mod('regulatory', 'IEC 61851-23')]),
      word('hf_isolation_transformer_word', 'HF isolation transformer',
        cc('hf_isolation_transformer', 'HF isolation transformer', 'magnetic_coupling_function', 'copper'),
        [mod('quantity', fmtQty(p.powerModuleCount)), mod('form', 'planar 100 kHz Mn-Zn ferrite'), mod('regulatory', '4 kV isolation')]),
      word('output_diode_word', 'output diode',
        cc('output_diode', 'output diode', 'silicon_semiconductor_function', 'silicon_semiconductor_function'),
        [mod('quantity', fmtQty(p.powerModuleCount * 2)), mod('form', 'SiC Schottky')]),
      word('output_filter_inductor_word', 'output filter inductor',
        cc('output_filter_inductor', 'output filter inductor', 'magnetic_coupling_function', 'copper'),
        [mod('quantity', '×1'), mod('capacity', '50', 'µH')]),
    ])
  return {
    module: 'dc_dc_converters',
    module_brief: `LLC resonant 100 kHz DC-DC stage with planar HF isolation transformer (4 kV) and SiC Schottky rectifier — feeds CCS2 outlet at up to ${p.outputVoltageMaxV} V / ${p.outputCurrentMaxA.toFixed(0)} A.`,
    overview_paragraph_en: '',
    derived_parameters: { output_voltage_max_v: p.outputVoltageMaxV, output_current_max_a: p.outputCurrentMaxA },
    allowed_radicals: ['silicon_semiconductor_function', 'magnetic_coupling_function', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [dcdc],
  }
}

function emitCcsOutletCable(p: Params): DesignModule {
  const cable = makeSubModule('ccs2_outlet_assembly', 'CCS2 outlet assembly', 'connects',
    `liquid-cooled ${p.cableCsaMm2} mm² Cu cable (${p.cableLengthM} m) to vehicle via CCS2 connector`,
    [
      word('ccs2_connector_word', 'CCS2 connector',
        cc('ccs2_connector', 'CCS2 connector', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×1'), mod('form', 'IEC 62196-3 Combo 2'), mod('capacity', p.outputCurrentMaxA.toFixed(0), 'A'), mod('dimension', p.outputVoltageMaxV.toFixed(0), 'V')]),
      word('liquid_cooled_cable_word', 'liquid cooled cable',
        cc('liquid_cooled_cable', 'liquid-cooled cable', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×1'), mod('dimension', p.cableLengthM.toFixed(1), 'm'), mod('capacity', p.cableCsaMm2.toFixed(0), 'mm²'), mod('regulatory', 'EN 50620')]),
      word('cable_holster_word', 'cable holster',
        cc('cable_holster', 'cable holster', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'spring-loaded retractor')]),
      word('cable_strain_relief_word', 'cable strain relief',
        cc('cable_strain_relief', 'cable strain relief', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×1'), mod('regulatory', 'IEC 62196-1 §10.3')]),
    ])
  return {
    module: 'ccs_outlet_cable',
    module_brief: `${p.cableLengthM.toFixed(1)} m liquid-cooled CCS2 cable (${p.cableCsaMm2.toFixed(0)} mm² Cu, EN 50620) terminating in IEC 62196-3 Combo 2 connector with spring-loaded holster.`,
    overview_paragraph_en: '',
    derived_parameters: { cable_length_m: p.cableLengthM, cable_csa_mm2: p.cableCsaMm2 },
    allowed_radicals: ['electrical_conducting_function', 'electromechanical_switching_function', 'copper', 'polymer_thermoplastic', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [cable],
  }
}

function emitControllerOcpp(_p: Params): DesignModule {
  const controller = makeSubModule('charging_controller', 'charging controller', 'orchestrates',
    'session via OCPP 2.0.1 backend + ISO 15118-20 plug-and-charge + DIN 70121 fallback',
    [
      word('iso15118_controller_word', 'ISO 15118 controller',
        cc('iso15118_controller', 'ISO 15118 controller', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Vector vCharM SCC'), mod('regulatory', 'ISO 15118-2/-20 + DIN 70121')]),
      word('ocpp_backend_controller_word', 'OCPP backend controller',
        cc('ocpp_backend_controller', 'OCPP backend controller', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'i.MX 8M Plus Linux'), mod('regulatory', 'OCPP 2.0.1 + IEC 63110')]),
      word('ethernet_phy_word', 'ethernet PHY',
        cc('ethernet_phy', 'ethernet PHY', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('form', 'gigabit'), mod('regulatory', 'IEEE 802.3')]),
      word('cellular_modem_word', 'cellular modem',
        cc('cellular_modem', 'cellular modem', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', '4G CAT-12 + 5G ready')]),
      word('hsm_chip_word', 'HSM chip',
        cc('hsm_chip', 'HSM chip', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'NXP A71CH'), mod('regulatory', 'Common Criteria EAL5+')]),
    ])
  return {
    module: 'controller_OCPP',
    module_brief: 'i.MX 8M Plus Linux SCC orchestrates ISO 15118-2/-20 + OCPP 2.0.1 over gigabit Ethernet + 4G; NXP A71CH HSM secures PnC certificates.',
    overview_paragraph_en: '',
    derived_parameters: { ocpp_version: 2.01, iso15118_version: 20 },
    allowed_radicals: ['silicon_semiconductor_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [controller],
  }
}

function emitHmiPayment(_p: Params): DesignModule {
  const hmi = makeSubModule('hmi_payment_terminal', 'HMI + payment terminal', 'authorises',
    'user session via 10" sunlight-readable touchscreen + EMV contactless + RFID + barcode',
    [
      word('touchscreen_word', 'touchscreen',
        cc('touchscreen', 'touchscreen', 'optical_sensing_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('dimension', '10', '"'), mod('form', 'sunlight-readable PCAP'), mod('regulatory', 'IP65')]),
      word('contactless_payment_module_word', 'contactless payment module',
        cc('contactless_payment_module', 'contactless payment module', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Verifone P200 EMV L1+L2'), mod('regulatory', 'PCI PTS 5.0')]),
      word('rfid_reader_word', 'RFID reader',
        cc('rfid_reader', 'RFID reader', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'ISO 14443 MIFARE')]),
      word('barcode_scanner_word', 'barcode scanner',
        cc('barcode_scanner', 'barcode scanner', 'optical_sensing_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', '2D imager')]),
      word('emergency_stop_button_word', 'emergency stop button',
        cc('emergency_stop_button', 'emergency stop button', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'EN ISO 13850')]),
    ])
  return {
    module: 'hmi_payment',
    module_brief: '10" sunlight-readable IP65 touchscreen with Verifone P200 EMV terminal, ISO 14443 RFID reader, 2D barcode imager and EN ISO 13850 E-stop.',
    overview_paragraph_en: '',
    derived_parameters: { hmi_size_in: 10 },
    allowed_radicals: ['optical_sensing_function', 'silicon_semiconductor_function', 'electromechanical_switching_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [hmi],
  }
}

function emitCoolingSystem(p: Params): DesignModule {
  const cooling = makeSubModule('liquid_cooling_unit', 'liquid cooling unit', 'rejects',
    `${p.hvacCapacityKw.toFixed(1)} kW heat via glycol-water loop with brazed-plate HX and pumps`,
    [
      word('brazed_plate_hx_word', 'brazed plate HX',
        cc('brazed_plate_hx', 'brazed plate HX', 'thermal_transfer_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'Alfa Laval CB60'), mod('capacity', p.hvacCapacityKw.toFixed(1), 'kW')]),
      word('coolant_pump_word', 'coolant pump',
        cc('coolant_pump', 'coolant pump', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×2'), mod('form', 'centrifugal redundant'), mod('capacity', '40', 'L/min')]),
      word('air_radiator_word', 'air radiator',
        cc('air_radiator', 'air radiator', 'thermal_transfer_function', 'aluminium'),
        [mod('quantity', '×1'), mod('form', 'extruded aluminium fin'), mod('capacity', p.hvacCapacityKw.toFixed(1), 'kW')]),
      word('axial_fan_word', 'axial fan',
        cc('axial_fan', 'axial fan', 'thermal_transfer_function', 'polymer_thermoplastic'),
        [mod('quantity', fmtQty(Math.max(2, Math.round(p.hvacCapacityKw / 1.5)))), mod('form', 'EBM-Papst 400 mm')]),
      word('expansion_tank_word', 'expansion tank',
        cc('expansion_tank', 'expansion tank', 'pressure_vessel_function', 'steel'),
        [mod('quantity', '×1'), mod('capacity', '20', 'L')]),
    ])
  return {
    module: 'cooling_system',
    module_brief: `${p.hvacCapacityKw.toFixed(1)} kW glycol-water cooling — Alfa Laval CB60 plate HX, 2× redundant centrifugal pumps, air-cooled aluminium radiator and EBM-Papst axial fans.`,
    overview_paragraph_en: '',
    derived_parameters: { cooling_capacity_kw: p.hvacCapacityKw },
    allowed_radicals: ['thermal_transfer_function', 'electromechanical_switching_function', 'pressure_vessel_function', 'steel', 'aluminium', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [cooling],
  }
}

function emitElectricalPanel(p: Params): DesignModule {
  const panel = makeSubModule('afe_electrical_panel', 'AFE electrical panel', 'rectifies',
    `${p.acInputCurrentA.toFixed(0)} A AC input via 3-phase SiC active front-end PFC at η ≥ 98%`,
    [
      word('afe_power_module_word', 'AFE power module',
        cc('afe_power_module', 'AFE power module', 'silicon_semiconductor_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×1'), mod('capacity', p.ratedPowerKw.toFixed(0), 'kW'), mod('form', 'SiC 3-phase 3-level'), mod('regulatory', 'IEC 61000-3-12')]),
      word('ac_input_breaker_word', 'AC input breaker',
        cc('ac_input_breaker', 'AC input breaker', 'electromechanical_switching_function', 'copper'),
        [mod('quantity', '×1'), mod('capacity', String(Math.round(p.acInputCurrentA * 1.25)), 'A'), mod('form', 'ABB Tmax XT4'), mod('regulatory', 'IEC 60947-2')]),
      word('ac_input_contactor_word', 'AC input contactor',
        cc('ac_input_contactor', 'AC input contactor', 'electromechanical_switching_function', 'copper'),
        [mod('quantity', '×1'), mod('capacity', String(Math.round(p.acInputCurrentA * 1.20)), 'A'), mod('form', '3-pole motor-rated')]),
      word('ac_input_emi_filter_word', 'AC input EMI filter',
        cc('ac_input_emi_filter', 'AC input EMI filter', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×1'), mod('form', 'Schaffner FN3270'), mod('regulatory', 'CISPR 11 Class A')]),
      word('residual_current_device_word', 'RCD',
        cc('residual_current_device', 'residual current device', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Type B AC + DC sensitive'), mod('regulatory', 'IEC 62423')]),
    ])
  return {
    module: 'electrical_panel',
    module_brief: `SiC active front-end PFC (η ≥ 98%, CISPR 11 Class A), ABB Tmax XT4 input breaker, motor-rated contactor and IEC 62423 Type-B residual current device.`,
    overview_paragraph_en: '',
    derived_parameters: { ac_input_current_a: p.acInputCurrentA, afe_efficiency_pct: 98 },
    allowed_radicals: ['silicon_semiconductor_function', 'electromechanical_switching_function', 'electrical_conducting_function', 'copper', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [panel],
  }
}

function emitTransformerGrid(p: Params): DesignModule {
  const tx = makeSubModule('mv_transformer', 'MV transformer', 'steps down',
    `${p.transformerKva.toFixed(0)} kVA 11 kV/400 V grid via oil-immersed Dyn11 transformer`,
    [
      word('mv_transformer_word', 'MV transformer',
        cc('mv_transformer', 'MV transformer', 'magnetic_coupling_function', 'copper'),
        [mod('quantity', '×1'), mod('capacity', p.transformerKva.toFixed(0), 'kVA'), mod('form', 'oil-immersed Dyn11'), mod('regulatory', 'IEC 60076')]),
      word('mv_switchgear_word', 'MV switchgear',
        cc('mv_switchgear', 'MV switchgear', 'electromechanical_switching_function', 'copper'),
        [mod('quantity', '×1'), mod('capacity', '630', 'A'), mod('dimension', '11', 'kV'), mod('regulatory', 'IEC 62271-200')]),
      word('hv_fuse_set_word', 'HV fuse set',
        cc('hv_fuse_set', 'HV fuse set', 'electromechanical_switching_function', 'ceramic'),
        [mod('quantity', '×3'), mod('capacity', '63', 'A'), mod('form', 'HRC')]),
      word('grounding_lug_set_word', 'grounding lug set',
        cc('grounding_lug_set', 'grounding lug set', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×4'), mod('form', 'M10 copper'), mod('regulatory', 'IEC 62305')]),
    ])
  return {
    module: 'transformer_grid',
    module_brief: `${p.transformerKva.toFixed(0)} kVA oil-immersed Dyn11 transformer (IEC 60076) with IEC 62271-200 ring-main switchgear and HRC fuses.`,
    overview_paragraph_en: '',
    derived_parameters: { transformer_kva: p.transformerKva },
    allowed_radicals: ['magnetic_coupling_function', 'electromechanical_switching_function', 'electrical_conducting_function', 'copper', 'ceramic'],
    applicability_confidence: 'high',
    sub_modules: [tx],
  }
}

function emitCabinetEnclosure(p: Params): DesignModule {
  const cabinet = makeSubModule('outdoor_cabinet', 'outdoor cabinet', 'houses',
    `all power + control sub-modules in IP54 galvanised-steel pedestal + cabinet`,
    [
      word('pedestal_chassis_word', 'pedestal chassis',
        cc('pedestal_chassis', 'pedestal chassis', null, 'steel'),
        [mod('quantity', '×1'), mod('form', 'galvanised steel'), mod('regulatory', 'IP54 + IK10')]),
      word('cabinet_door_word', 'cabinet door',
        cc('cabinet_door', 'cabinet door', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×2'), mod('form', '3-point lock'), mod('regulatory', 'IP54')]),
      word('rear_panel_filter_word', 'rear panel filter',
        cc('rear_panel_filter', 'rear panel filter', null, 'polymer_thermoplastic'),
        [mod('quantity', '×4'), mod('regulatory', 'MERV 7')]),
      word('cabinet_lighting_led_word', 'cabinet lighting LED',
        cc('cabinet_lighting_led', 'cabinet lighting LED', 'optical_sensing_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('form', 'service light + status RGB')]),
      word('door_intrusion_sensor_word', 'door intrusion sensor',
        cc('door_intrusion_sensor', 'door intrusion sensor', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('form', 'tamper switch')]),
    ])
  return {
    module: 'cabinet_enclosure',
    module_brief: `IP54 + IK10 galvanised steel pedestal cabinet with 3-point lock doors, MERV-7 intake filters, RGB status light and tamper switches.`,
    overview_paragraph_en: '',
    derived_parameters: { total_mass_kg: p.totalMassKg },
    allowed_radicals: ['steel', 'electromechanical_switching_function', 'optical_sensing_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [cabinet],
  }
}

function emitRegulatoryCertification(_p: Params): DesignModule {
  const cert = makeSubModule('regulatory_signage', 'regulatory signage', 'documents',
    'IEC 61851-1/-23, IEC 62196-3, ISO 15118-2/-20, EN 50549, CE per EU DC fast charger ruleset',
    [
      word('iec_61851_label_word', 'IEC 61851 label',
        cc('iec_61851_label', 'IEC 61851 label', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'IEC 61851-1 + -23')]),
      word('iec_62196_3_label_word', 'IEC 62196-3 label',
        cc('iec_62196_3_label', 'IEC 62196-3 label', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'IEC 62196-3')]),
      word('iso_15118_certificate_word', 'ISO 15118 certificate',
        cc('iso_15118_certificate', 'ISO 15118 certificate', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'ISO 15118-2 + -20')]),
      word('en_50549_certificate_word', 'EN 50549 certificate',
        cc('en_50549_certificate', 'EN 50549 certificate', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'EN 50549-1')]),
      word('ce_mark_word', 'CE mark',
        cc('ce_mark', 'CE mark', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'EU MD 2006/42/EC')]),
      word('high_voltage_warning_label_word', 'high voltage warning label',
        cc('high_voltage_warning_label', 'high voltage warning label', null, 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('regulatory', 'EN ISO 7010')]),
    ])
  return {
    module: 'regulatory_certification',
    module_brief: 'IEC 61851-1/-23 + IEC 62196-3 + ISO 15118-2/-20 + EN 50549-1 + CE + EN ISO 7010 HV warning signage.',
    overview_paragraph_en: '',
    derived_parameters: { mandatory_count: 6 },
    allowed_radicals: ['polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [cert],
  }
}

function emitCrossModuleGrammarLinks(p: Params) {
  return [
    { from_module: 'transformer_grid', to_module: 'electrical_panel', mechanism: 'ac_bus', type: 'mutual' as const, detail: `${p.transformerKva.toFixed(0)} kVA at 400 V` },
    { from_module: 'electrical_panel', to_module: 'power_modules', mechanism: 'dc_bus', type: 'directional' as const, detail: '800 V DC link' },
    { from_module: 'power_modules', to_module: 'dc_dc_converters', mechanism: 'dc_bus', type: 'mutual' as const, detail: 'parallel module output' },
    { from_module: 'dc_dc_converters', to_module: 'ccs_outlet_cable', mechanism: 'dc_bus', type: 'directional' as const, detail: `${p.outputVoltageMaxV} V / ${p.outputCurrentMaxA.toFixed(0)} A` },
    { from_module: 'controller_OCPP', to_module: 'ccs_outlet_cable', mechanism: 'control', type: 'mutual' as const, detail: 'ISO 15118 PLC + CP control pilot' },
    { from_module: 'controller_OCPP', to_module: 'power_modules', mechanism: 'control', type: 'directional' as const, detail: 'charging-curve setpoint' },
    { from_module: 'hmi_payment', to_module: 'controller_OCPP', mechanism: 'data', type: 'mutual' as const, detail: 'session authorisation' },
    { from_module: 'cooling_system', to_module: 'power_modules', mechanism: 'fluid_loop', type: 'mutual' as const, detail: 'glycol-water cold-plate loop' },
    { from_module: 'cooling_system', to_module: 'ccs_outlet_cable', mechanism: 'fluid_loop', type: 'mutual' as const, detail: 'liquid-cooled cable loop' },
    { from_module: 'cabinet_enclosure', to_module: 'electrical_panel', mechanism: 'mechanical', type: 'directional' as const, detail: 'panel-mount inside cabinet' },
    { from_module: 'regulatory_certification', to_module: 'cabinet_enclosure', mechanism: 'documentation', type: 'directional' as const, detail: 'external label set' },
  ]
}

export const evChargerEmitter: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveParams(contract as ContractInProgress)
  return {
    modules: [
      emitPowerModules(p),
      emitDcDcConverters(p),
      emitCcsOutletCable(p),
      emitControllerOcpp(p),
      emitHmiPayment(p),
      emitCoolingSystem(p),
      emitElectricalPanel(p),
      emitTransformerGrid(p),
      emitCabinetEnclosure(p),
      emitRegulatoryCertification(p),
    ],
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: '10-module taxonomy covers DC fast EV charger from MV grid through CCS2 outlet + payment + cooling + cabinet.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Deliver ${p.ratedPowerKw} kW DC fast charging via liquid-cooled CCS2 (up to ${p.outputVoltageMaxV} V / ${p.outputCurrentMaxA.toFixed(0)} A) at η ≥ 95% per IEC 61851-23 with ISO 15118-2/-20 plug-and-charge + OCPP 2.0.1 backend.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('ev_charger', evChargerEmitter)
