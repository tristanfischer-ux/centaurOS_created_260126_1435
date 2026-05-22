/**
 * scripts/lib/orchestrator/emitters/solar-inverter.ts
 *
 * SOLAR INVERTER DETERMINISTIC EMITTER — String inverter (10-100 kW commercial
 * grid-tied), e.g. SMA Sunny Tripower (STP 25-100 kW range), Fronius TAURO,
 * SolarEdge SE-RWS. Emits a complete 9-module DesignJSON keyed off the
 * Contract's quantities.
 *
 * Modules (9):
 *   1. dc_input_mppt         — PV strings, DC isolator, MPPT input boards
 *   2. dc_link_cap           — DC link capacitance, pre-charge, ground-fault
 *   3. switching_inverter    — SiC three-level H-bridge legs
 *   4. lcl_filter_output     — LCL output filter
 *   5. ac_grid_interface     — AC contactor, AC measurement, anti-islanding
 *   6. control_inverter      — DSP control board + firmware
 *   7. monitoring_comms      — Modbus/SunSpec/Ethernet
 *   8. enclosure_cabinet     — IP54 wall-mount cabinet
 *   9. protection_safety     — SPD, DC fuses, arc-fault detection
 *
 * Reproducibility: pure function. Same (contract, brief) → byte-identical DesignJSON.
 */

import { registerAssembler } from '../assembler'
import type { ClassEmitter, DesignJSON, DesignModule } from '../assembler'
import type { ContractInProgress } from '../types'

// ---------------------------------------------------------------------------
// HELPERS (mirrors deterministic-emitter.ts shapes)
// ---------------------------------------------------------------------------

interface ModifierCharacter { kind: string; value: string; unit?: string }
interface ContentCharacter {
  character_id: string
  name_human: string
  function_radical_primary: string | null
  function_radical_secondary: string | null
  material_radical_primary: string | null
  material_radical_secondary: string | null
}
interface Word {
  id: string
  name_human: string
  content_character: ContentCharacter
  modifier_characters: ModifierCharacter[]
}
interface SubModule {
  id: string
  name_human: string
  english_sentence: string
  rad_syntax: string
  role_verb: string
  topology_clause: string
  words: Word[]
}

function mod(kind: string, value: string, unit?: string): ModifierCharacter {
  return unit !== undefined ? { kind, value, unit } : { kind, value }
}

function cc(
  character_id: string,
  name_human: string,
  fp: string | null,
  mp: string | null,
  fs: string | null = null,
  ms: string | null = null,
): ContentCharacter {
  return {
    character_id,
    name_human,
    function_radical_primary: fp,
    function_radical_secondary: fs,
    material_radical_primary: mp,
    material_radical_secondary: ms,
  }
}

function word(id: string, name_human: string, content: ContentCharacter, modifiers: ModifierCharacter[]): Word {
  // Universal fix #A (2026-05-22): strip literal " word" suffix from name_human.
  const cleanName = name_human.replace(/\s+word$/i, '')
  return { id, name_human: cleanName, content_character: content, modifier_characters: modifiers }
}

function fmtQty(n: number): string {
  if (Number.isInteger(n)) return `×${n}`
  return `×${n.toFixed(2)}`
}

function synthesizeRadSyntax(words: Word[]): string {
  const clusters = words.map((w) => {
    const ordered = [...w.modifier_characters].sort((a, b) => {
      if (a.kind === 'quantity' && b.kind !== 'quantity') return -1
      if (b.kind === 'quantity' && a.kind !== 'quantity') return 1
      return 0
    })
    const tokens = ordered.map((m) => (m.unit ? `${m.value}${m.unit}` : m.value))
    if (tokens.length === 0) return w.content_character.character_id
    return `${w.content_character.character_id} (${tokens.join(', ')})`
  })
  return clusters.join(' ⊙ ')
}

function makeSubModule(
  id: string,
  name_human: string,
  role_verb: string,
  topology_clause: string,
  words: Word[],
): SubModule {
  return {
    id,
    name_human,
    english_sentence: '',
    rad_syntax: synthesizeRadSyntax(words),
    role_verb,
    topology_clause,
    words,
  }
}

// ---------------------------------------------------------------------------
// DERIVED PARAMETERS
// ---------------------------------------------------------------------------

interface SolarInverterParams {
  ratedPowerKw: number
  dcInputVoltageV: number
  acOutputVoltageV: number
  mpptCount: number
  efficiencyPct: number
  acContinuousA: number
  dcContinuousA: number
  inverterDissipationKw: number
  hvacCapacityKw: number
  totalMassKg: number
  acCableCsaMm2: number
  spdRatingKa: number
}

function q(contract: ContractInProgress, key: string, fallback: number): number {
  const v = (contract as any).quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function deriveParams(contract: ContractInProgress): SolarInverterParams {
  const ratedPowerKw = Math.max(1, q(contract, 'rated_power_kw', 50))
  const dcInputVoltageV = q(contract, 'dc_input_voltage_v', 600)
  const acOutputVoltageV = q(contract, 'ac_output_voltage_v', 400)
  const mpptCount = Math.max(1, Math.round(q(contract, 'mppt_count', 2)))
  const efficiencyPct = q(contract, 'inverter_efficiency_pct', q(contract, 'efficiency_pct', 98.5))
  const acContinuousA = q(contract, 'ac_continuous_current_a', (ratedPowerKw * 1000) / (acOutputVoltageV * Math.sqrt(3) * 0.99))
  const dcContinuousA = q(contract, 'dc_continuous_current_a', (ratedPowerKw * 1000) / dcInputVoltageV)
  const inverterDissipationKw = q(contract, 'inverter_dissipated_kw', ratedPowerKw * 0.015)
  const hvacCapacityKw = q(contract, 'hvac_cabinet_capacity_kw', inverterDissipationKw * 1.25)
  const totalMassKg = q(contract, 'total_system_mass_kg', ratedPowerKw * 1.5)
  const acCableCsaMm2 = Math.max(10, Math.round(q(contract, 'ac_cable_csa_mm2', acContinuousA / 4)))
  const spdRatingKa = q(contract, 'spd_rating_ka', 40)
  return {
    ratedPowerKw,
    dcInputVoltageV,
    acOutputVoltageV,
    mpptCount,
    efficiencyPct,
    acContinuousA,
    dcContinuousA,
    inverterDissipationKw,
    hvacCapacityKw,
    totalMassKg,
    acCableCsaMm2,
    spdRatingKa,
  }
}

// ---------------------------------------------------------------------------
// MODULE EMITTERS (9)
// ---------------------------------------------------------------------------

function emitDcInputMppt(p: SolarInverterParams): DesignModule {
  const mpptInput = makeSubModule(
    'mppt_input_strings',
    'MPPT input strings',
    'tracks',
    `${p.mpptCount} MPPT channels — each isolating + tracking one PV sub-array`,
    [
      word('pv_string_word', 'PV string',
        cc('pv_string', 'PV string', 'photovoltaic_function', 'silicon_semiconductor_function'),
        [mod('quantity', fmtQty(p.mpptCount)), mod('dimension', String(p.dcInputVoltageV), 'V'), mod('capacity', (p.dcContinuousA / p.mpptCount).toFixed(1), 'A')]),
      word('dc_string_isolator_word', 'DC string isolator',
        cc('dc_string_isolator', 'DC string isolator', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [mod('quantity', fmtQty(p.mpptCount * 2)), mod('dimension', String(p.dcInputVoltageV), 'V'), mod('regulatory', 'IEC 60947-3')]),
      word('mppt_input_board_word', 'MPPT input board',
        cc('mppt_input_board', 'MPPT input board', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', fmtQty(p.mpptCount)), mod('form', 'Sandia P&O'), mod('regulatory', 'UL 1741')]),
      word('dc_input_fuse_word', 'DC input fuse',
        cc('dc_input_fuse', 'DC input fuse', 'electromechanical_switching_function', 'ceramic'),
        [mod('quantity', fmtQty(p.mpptCount * 2)), mod('capacity', '15', 'A'), mod('form', 'gPV')]),
    ],
  )
  return {
    module: 'dc_input_mppt',
    module_brief: `Accepts ${p.mpptCount} MPPT-tracked PV strings at ${p.dcInputVoltageV} V DC, isolating + sizing each independently.`,
    overview_paragraph_en: '',
    derived_parameters: {
      mppt_count: p.mpptCount,
      dc_input_voltage_v: p.dcInputVoltageV,
      dc_continuous_current_a: p.dcContinuousA,
    },
    allowed_radicals: ['photovoltaic_function', 'silicon_semiconductor_function', 'electromechanical_switching_function', 'polymer_thermoplastic', 'ceramic'],
    applicability_confidence: 'high',
    sub_modules: [mpptInput],
  }
}

function emitDcLinkCap(p: SolarInverterParams): DesignModule {
  const dcLink = makeSubModule(
    'dc_link_capacitance',
    'DC link capacitance',
    'stabilises',
    'DC bus ripple via film + electrolytic capacitor bank',
    [
      word('dc_link_film_cap_word', 'DC link film capacitor',
        cc('dc_link_film_cap', 'DC link film capacitor', 'electrical_conducting_function', 'polymer_thermoplastic'),
        [mod('quantity', fmtQty(Math.max(3, Math.round(p.ratedPowerKw / 15)))), mod('capacity', '60', 'µF'), mod('dimension', String(Math.round(p.dcInputVoltageV * 1.5)), 'V'), mod('form', 'TDK B32778G')]),
      word('dc_link_electrolytic_word', 'DC link electrolytic cap',
        cc('dc_link_electrolytic', 'DC link electrolytic capacitor', 'electrical_conducting_function', 'aluminium'),
        [mod('quantity', fmtQty(Math.max(2, Math.round(p.ratedPowerKw / 25)))), mod('capacity', '470', 'µF'), mod('dimension', '450', 'V')]),
      word('precharge_resistor_word', 'pre-charge resistor',
        cc('precharge_resistor', 'pre-charge resistor', 'electrical_conducting_function', 'ceramic'),
        [mod('quantity', '×1'), mod('capacity', '100', 'W'), mod('dimension', '47', 'Ω')]),
      word('insulation_monitor_word', 'insulation monitor',
        cc('insulation_monitor', 'insulation monitor', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Bender ISOMETER iso-PV1685P'), mod('regulatory', 'IEC 62109-2')]),
    ],
  )
  return {
    module: 'dc_link_cap',
    module_brief: `DC link bank — ${Math.max(3, Math.round(p.ratedPowerKw / 15))} film + ${Math.max(2, Math.round(p.ratedPowerKw / 25))} electrolytic capacitors at ${p.dcInputVoltageV} V DC nominal with pre-charge + insulation monitoring.`,
    overview_paragraph_en: '',
    derived_parameters: { dc_link_voltage_v: p.dcInputVoltageV },
    allowed_radicals: ['electrical_conducting_function', 'silicon_semiconductor_function', 'polymer_thermoplastic', 'aluminium', 'ceramic'],
    applicability_confidence: 'high',
    sub_modules: [dcLink],
  }
}

function emitSwitchingInverter(p: SolarInverterParams): DesignModule {
  const inverterBridge = makeSubModule(
    'inverter_bridge',
    'inverter bridge',
    'converts',
    'DC bus to three-phase AC via 6-pack SiC MOSFET three-level bridge',
    [
      word('sic_mosfet_word', 'SiC MOSFET',
        cc('sic_mosfet', 'SiC MOSFET', 'silicon_semiconductor_function', 'silicon_semiconductor_function'),
        [mod('quantity', fmtQty(12)), mod('dimension', '1200', 'V'), mod('capacity', '80', 'A'), mod('form', 'Wolfspeed C3M0021120K')]),
      word('gate_driver_word', 'gate driver',
        cc('gate_driver', 'gate driver', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', fmtQty(12)), mod('form', 'Infineon EiceDriver 1ED020I12-F2'), mod('regulatory', 'isolated 4 kV')]),
      word('inverter_heatsink_word', 'inverter heatsink',
        cc('inverter_heatsink', 'inverter heatsink', 'thermal_transfer_function', 'aluminium'),
        [mod('quantity', '×1'), mod('form', 'extruded aluminium fin'), mod('capacity', p.inverterDissipationKw.toFixed(2), 'kW')]),
      word('dc_link_busbar_word', 'DC link busbar',
        cc('dc_link_busbar', 'DC link busbar', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×3'), mod('capacity', p.dcContinuousA.toFixed(0), 'A')]),
    ],
  )
  return {
    module: 'switching_inverter',
    module_brief: `SiC three-level H-bridge — 12× 1200 V / 80 A MOSFETs deliver ${p.ratedPowerKw} kW at η=${p.efficiencyPct.toFixed(1)}%, dissipating ${p.inverterDissipationKw.toFixed(2)} kW to an extruded aluminium heatsink.`,
    overview_paragraph_en: '',
    derived_parameters: {
      rated_power_kw: p.ratedPowerKw,
      efficiency_pct: p.efficiencyPct,
      inverter_dissipation_kw: p.inverterDissipationKw,
    },
    allowed_radicals: ['silicon_semiconductor_function', 'thermal_transfer_function', 'electrical_conducting_function', 'aluminium', 'copper', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [inverterBridge],
  }
}

function emitLclFilterOutput(p: SolarInverterParams): DesignModule {
  const lclFilter = makeSubModule(
    'lcl_filter',
    'LCL filter',
    'filters',
    'switching harmonics from inverter output via LCL three-phase filter',
    [
      word('lcl_inverter_inductor_word', 'LCL inverter inductor',
        cc('lcl_inverter_inductor', 'LCL inverter-side inductor', 'magnetic_coupling_function', 'copper'),
        [mod('quantity', '×3'), mod('capacity', '1.5', 'mH'), mod('dimension', p.acContinuousA.toFixed(0), 'A'), mod('form', 'Magnetics powdered iron core')]),
      word('lcl_grid_inductor_word', 'LCL grid inductor',
        cc('lcl_grid_inductor', 'LCL grid-side inductor', 'magnetic_coupling_function', 'copper'),
        [mod('quantity', '×3'), mod('capacity', '0.3', 'mH'), mod('dimension', p.acContinuousA.toFixed(0), 'A')]),
      word('lcl_filter_cap_word', 'LCL filter capacitor',
        cc('lcl_filter_cap', 'LCL filter capacitor', 'electrical_conducting_function', 'polymer_thermoplastic'),
        [mod('quantity', '×3'), mod('capacity', '15', 'µF'), mod('dimension', '500', 'V')]),
      word('lcl_damping_resistor_word', 'LCL damping resistor',
        cc('lcl_damping_resistor', 'LCL damping resistor', 'electrical_conducting_function', 'ceramic'),
        [mod('quantity', '×3'), mod('capacity', '5', 'W'), mod('dimension', '4.7', 'Ω')]),
    ],
  )
  return {
    module: 'lcl_filter_output',
    module_brief: `LCL output filter — 1.5 mH inverter-side + 0.3 mH grid-side inductors with 15 µF damping capacitors per phase, rated for ${p.acContinuousA.toFixed(0)} A.`,
    overview_paragraph_en: '',
    derived_parameters: { ac_continuous_current_a: p.acContinuousA },
    allowed_radicals: ['magnetic_coupling_function', 'electrical_conducting_function', 'copper', 'polymer_thermoplastic', 'ceramic'],
    applicability_confidence: 'high',
    sub_modules: [lclFilter],
  }
}

function emitAcGridInterface(p: SolarInverterParams): DesignModule {
  const acInterface = makeSubModule(
    'ac_grid_interface',
    'AC grid interface',
    'connects',
    'inverter AC output to grid via contactor + measurement + anti-islanding',
    [
      word('ac_main_contactor_word', 'AC main contactor',
        cc('ac_main_contactor', 'AC main contactor', 'electromechanical_switching_function', 'copper'),
        [mod('quantity', '×1'), mod('capacity', Math.round(p.acContinuousA * 1.3).toString(), 'A'), mod('dimension', String(p.acOutputVoltageV), 'V'), mod('form', 'ABB AF series 3-pole')]),
      word('ac_voltage_measurement_word', 'AC voltage measurement',
        cc('ac_voltage_measurement', 'AC voltage measurement', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×3'), mod('form', 'resistor divider + isolation amp'), mod('regulatory', 'Class 0.5')]),
      word('ac_current_sensor_word', 'AC current sensor',
        cc('ac_current_sensor', 'AC current sensor', 'electromechanical_switching_function', 'copper'),
        [mod('quantity', '×3'), mod('form', 'LEM LF series'), mod('capacity', Math.round(p.acContinuousA * 1.5).toString(), 'A')]),
      word('anti_islanding_relay_word', 'anti-islanding relay',
        cc('anti_islanding_relay', 'anti-islanding relay', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Active Frequency Shift'), mod('regulatory', 'IEEE 1547 / EN 50549')]),
    ],
  )
  return {
    module: 'ac_grid_interface',
    module_brief: `AC contactor (${Math.round(p.acContinuousA * 1.3)} A rated) + three-phase metering + active anti-islanding to ENA G99 + IEEE 1547 standards.`,
    overview_paragraph_en: '',
    derived_parameters: {
      ac_output_voltage_v: p.acOutputVoltageV,
      ac_continuous_current_a: p.acContinuousA,
    },
    allowed_radicals: ['electromechanical_switching_function', 'electrical_conducting_function', 'silicon_semiconductor_function', 'copper', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [acInterface],
  }
}

function emitControlInverter(_p: SolarInverterParams): DesignModule {
  const controlBoard = makeSubModule(
    'inverter_control_board',
    'inverter control board',
    'controls',
    'all switching + protection logic via industrial DSP',
    [
      word('dsp_controller_word', 'DSP controller',
        cc('dsp_controller', 'DSP controller', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'TI TMS320F28379D dual-core'), mod('capacity', '200', 'MHz')]),
      word('control_psu_word', 'control PSU',
        cc('control_psu', 'control PSU', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('capacity', '40', 'W'), mod('form', 'Mean Well DR-60-24')]),
      word('control_pcb_word', 'control PCB',
        cc('control_pcb', 'control PCB', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', '6-layer FR4'), mod('regulatory', 'UL 94V-0')]),
      word('iso_amplifier_word', 'iso amplifier',
        cc('iso_amplifier', 'isolation amplifier', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', fmtQty(6)), mod('form', 'TI AMC1311')]),
    ],
  )
  return {
    module: 'control_inverter',
    module_brief: 'TI C2000-class dual-core DSP runs SVPWM modulation, MPPT, grid-sync, and protection logic on a 6-layer industrial PCB.',
    overview_paragraph_en: '',
    derived_parameters: { dsp_clock_mhz: 200 },
    allowed_radicals: ['silicon_semiconductor_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [controlBoard],
  }
}

function emitMonitoringComms(_p: SolarInverterParams): DesignModule {
  const monitoring = makeSubModule(
    'monitoring_comms_module',
    'monitoring comms module',
    'reports',
    'inverter telemetry via SunSpec Modbus over Ethernet + optional 4G',
    [
      word('ethernet_phy_word', 'ethernet PHY',
        cc('ethernet_phy', 'ethernet PHY', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'TI DP83825I'), mod('capacity', '100', 'Mbps')]),
      word('rs485_transceiver_word', 'RS485 transceiver',
        cc('rs485_transceiver', 'RS485 transceiver', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'TI SN65HVD75'), mod('regulatory', 'Modbus RTU')]),
      word('sunspec_modbus_stack_word', 'SunSpec Modbus stack',
        cc('sunspec_modbus_stack', 'SunSpec Modbus stack', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'SunSpec Alliance certified'), mod('regulatory', 'IEEE 1547-2018')]),
      word('display_lcd_word', 'display LCD',
        cc('display_lcd', 'display LCD', 'optical_sensing_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('dimension', '2.8', '"'), mod('form', 'monochrome OLED')]),
    ],
  )
  return {
    module: 'monitoring_comms',
    module_brief: 'SunSpec Modbus stack over RJ45 Ethernet + RS485 + local 2.8" OLED for installer + O&M visibility.',
    overview_paragraph_en: '',
    derived_parameters: {},
    allowed_radicals: ['silicon_semiconductor_function', 'optical_sensing_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [monitoring],
  }
}

function emitEnclosureCabinet(p: SolarInverterParams): DesignModule {
  const cabinet = makeSubModule(
    'wall_mount_cabinet',
    'wall-mount cabinet',
    'houses',
    'all sub-modules in IP54 die-cast aluminium enclosure with forced-air cooling',
    [
      word('aluminium_cabinet_shell_word', 'aluminium cabinet shell',
        cc('aluminium_cabinet_shell', 'aluminium cabinet shell', 'thermal_transfer_function', 'aluminium'),
        [mod('quantity', '×1'), mod('form', 'die-cast'), mod('regulatory', 'IP54')]),
      word('cabinet_cooling_fan_word', 'cabinet cooling fan',
        cc('cabinet_cooling_fan', 'cabinet cooling fan', 'thermal_transfer_function', 'polymer_thermoplastic'),
        [mod('quantity', fmtQty(Math.max(1, Math.round(p.hvacCapacityKw / 0.04)))), mod('form', 'EBM-Papst K3G axial'), mod('capacity', p.hvacCapacityKw.toFixed(2), 'kW')]),
      word('wall_mount_bracket_word', 'wall-mount bracket',
        cc('wall_mount_bracket', 'wall-mount bracket', null, 'steel'),
        [mod('quantity', '×1'), mod('capacity', p.totalMassKg.toFixed(0), 'kg'), mod('regulatory', 'IEC 62109-1 §6')]),
    ],
  )
  return {
    module: 'enclosure_cabinet',
    module_brief: `Die-cast aluminium wall-mount cabinet (IP54) with ${Math.max(1, Math.round(p.hvacCapacityKw / 0.04))} forced-air fans dissipating ${p.hvacCapacityKw.toFixed(2)} kW; total mass ${p.totalMassKg.toFixed(0)} kg.`,
    overview_paragraph_en: '',
    derived_parameters: {
      hvac_capacity_kw: p.hvacCapacityKw,
      total_mass_kg: p.totalMassKg,
    },
    allowed_radicals: ['thermal_transfer_function', 'aluminium', 'steel', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [cabinet],
  }
}

function emitProtectionSafety(p: SolarInverterParams): DesignModule {
  const protection = makeSubModule(
    'protection_devices',
    'protection devices',
    'protects',
    'SPDs, AC/DC isolators, AFCI and earth-fault detection',
    [
      word('dc_spd_word', 'DC SPD',
        cc('dc_spd', 'DC SPD', 'electromechanical_switching_function', 'ceramic'),
        [mod('quantity', '×1'), mod('capacity', p.spdRatingKa.toFixed(0), 'kA'), mod('form', 'Type II 8/20 µs'), mod('regulatory', 'IEC 61643-31')]),
      word('ac_spd_word', 'AC SPD',
        cc('ac_spd', 'AC SPD', 'electromechanical_switching_function', 'ceramic'),
        [mod('quantity', '×1'), mod('capacity', p.spdRatingKa.toFixed(0), 'kA'), mod('form', 'Type II 8/20 µs'), mod('regulatory', 'IEC 61643-11')]),
      word('afci_module_word', 'AFCI module',
        cc('afci_module', 'AFCI module', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Texas Instruments AMC130M02-based'), mod('regulatory', 'UL 1699B')]),
      word('rcmu_word', 'RCMU',
        cc('rcmu', 'residual current monitoring unit', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'AC + DC sensitive Type B'), mod('regulatory', 'VDE 0126-1-1')]),
    ],
  )
  return {
    module: 'protection_safety',
    module_brief: `DC + AC SPDs rated ${p.spdRatingKa.toFixed(0)} kA per IEC 61643, plus UL 1699B AFCI and VDE 0126 Type-B RCMU for residual current.`,
    overview_paragraph_en: '',
    derived_parameters: { spd_rating_ka: p.spdRatingKa },
    allowed_radicals: ['electromechanical_switching_function', 'silicon_semiconductor_function', 'ceramic', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [protection],
  }
}

// ---------------------------------------------------------------------------
// CROSS-MODULE GRAMMAR LINKS
// ---------------------------------------------------------------------------

function emitCrossModuleGrammarLinks(p: SolarInverterParams) {
  return [
    { from_module: 'dc_input_mppt', to_module: 'dc_link_cap', mechanism: 'dc_bus', type: 'mutual' as const, detail: `${p.dcInputVoltageV} V DC pre-charged through link bank` },
    { from_module: 'dc_link_cap', to_module: 'switching_inverter', mechanism: 'dc_bus', type: 'mutual' as const, detail: `${p.dcInputVoltageV} V DC bus to inverter bridge` },
    { from_module: 'switching_inverter', to_module: 'lcl_filter_output', mechanism: 'ac_bus', type: 'directional' as const, detail: 'PWM output to filter' },
    { from_module: 'lcl_filter_output', to_module: 'ac_grid_interface', mechanism: 'ac_bus', type: 'mutual' as const, detail: `${p.acOutputVoltageV} V AC to contactor` },
    { from_module: 'control_inverter', to_module: 'switching_inverter', mechanism: 'control', type: 'directional' as const, detail: 'gate-driver PWM at 20 kHz' },
    { from_module: 'control_inverter', to_module: 'ac_grid_interface', mechanism: 'control', type: 'mutual' as const, detail: 'anti-islanding decision logic' },
    { from_module: 'monitoring_comms', to_module: 'control_inverter', mechanism: 'data', type: 'mutual' as const, detail: 'SunSpec register map' },
    { from_module: 'enclosure_cabinet', to_module: 'switching_inverter', mechanism: 'thermal', type: 'mutual' as const, detail: `${p.inverterDissipationKw.toFixed(2)} kW heatsink airflow` },
    { from_module: 'protection_safety', to_module: 'dc_input_mppt', mechanism: 'protection', type: 'directional' as const, detail: 'DC SPD upstream of MPPT' },
    { from_module: 'protection_safety', to_module: 'ac_grid_interface', mechanism: 'protection', type: 'directional' as const, detail: 'AC SPD + RCMU' },
  ]
}

// ---------------------------------------------------------------------------
// PUBLIC EMITTER
// ---------------------------------------------------------------------------

export const solarInverterEmitter: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveParams(contract as ContractInProgress)
  return {
    modules: [
      emitDcInputMppt(p),
      emitDcLinkCap(p),
      emitSwitchingInverter(p),
      emitLclFilterOutput(p),
      emitAcGridInterface(p),
      emitControlInverter(p),
      emitMonitoringComms(p),
      emitEnclosureCabinet(p),
      emitProtectionSafety(p),
    ],
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: '9-module commercial string-inverter taxonomy covers DC input through AC grid + control + protection.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Convert ${p.ratedPowerKw} kW PV DC at ${p.dcInputVoltageV} V into ${p.acOutputVoltageV} V three-phase AC at euro-eta ≥ ${p.efficiencyPct.toFixed(1)}% per IEC 62109 and IEEE 1547 / EN 50549 grid codes.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('solar_inverter', solarInverterEmitter)
