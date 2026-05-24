/**
 * scripts/lib/orchestrator/emitters/ups-inverter.ts
 *
 * UPS INVERTER DETERMINISTIC EMITTER — online double-conversion 1-20 kW UPS.
 * Targets APC Smart-UPS RT / Eaton 9PX class.
 *
 * Modules (8):
 *   1. battery_pack       — LFP cylindrical cells in 48 V series string
 *   2. charger            — input AC rectifier + battery charger
 *   3. transfer_switch    — bypass static switch
 *   4. inverter           — IGBT inverter
 *   5. monitoring_LCD     — LCD + LED status + SNMP
 *   6. cooling_fan        — forced-air axial fans
 *   7. enclosure          — 19" rack-mount steel chassis
 *   8. regulatory         — IEC 62040-1/-2/-3 labels
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
  ratedKva: number
  batteryKwh: number
  cellCount: number
  runtimeMinFull: number
  efficiencyPct: number
  totalMassKg: number
}

function q(contract: ContractInProgress, key: string, fallback: number): number {
  const v = (contract as any).quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function deriveParams(contract: ContractInProgress): Params {
  const ratedPowerKw = Math.max(0.5, q(contract, 'rated_power_kw', 5))
  const ratedKva = ratedPowerKw / 0.9
  const batteryKwh = q(contract, 'nameplate_capacity_kwh', q(contract, 'battery_kwh', 5))
  const cellCount = Math.max(15, Math.round(q(contract, 'cell_count', batteryKwh * 1000 / (20 * 3.2))))
  const runtimeMinFull = q(contract, 'runtime_min_full_load', q(contract, 'runtime_min_at_full_load', 15))
  const efficiencyPct = q(contract, 'inverter_efficiency_pct', q(contract, 'efficiency_pct', 96))
  const totalMassKg = q(contract, 'total_system_mass_kg', ratedPowerKw * 6 + cellCount * 0.55)
  return { ratedPowerKw, ratedKva, batteryKwh, cellCount, runtimeMinFull, efficiencyPct, totalMassKg }
}

function emitBatteryPack(p: Params): DesignModule {
  const pack = makeSubModule('battery_string', 'battery string', 'stores',
    `${p.batteryKwh.toFixed(2)} kWh in ${p.cellCount}-cell 48 V LFP string`,
    [
      word('lfp_cylindrical_cell_word', 'LFP cylindrical cell',
        cc('lfp_cylindrical_cell', 'LFP cylindrical cell', 'electrochemical_energy_function', 'lithium_iron_phosphate_chemistry'),
        [mod('quantity', fmtQty(p.cellCount)), mod('capacity', '20', 'Ah'), mod('dimension', '3.2', 'V'), mod('form', '26650'), mod('regulatory', 'UN38.3 + IEC 62619')]),
      word('cell_busbar_word', 'cell busbar',
        cc('cell_busbar', 'cell busbar', 'electrical_conducting_function', 'copper'),
        [mod('quantity', fmtQty(p.cellCount - 1)), mod('form', 'nickel-plated copper')]),
      word('bms_slave_word', 'BMS slave',
        cc('bms_slave', 'BMS slave', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Texas Instruments BQ76952 16-cell'), mod('regulatory', 'IEC 62619')]),
      word('battery_fuse_word', 'battery fuse',
        cc('battery_fuse', 'battery fuse', 'electromechanical_switching_function', 'ceramic'),
        [mod('quantity', '×1'), mod('capacity', String(Math.max(50, Math.round(p.ratedPowerKw * 1000 / 48 * 1.3))), 'A'), mod('form', 'Bussmann FNQ-R')]),
      // 2026-05-24 orphan-fix: new word so engineering-contract macro
      // `battery_cabinet_bms` (tokens: battery+cabinet+bms) propagates here.
      word('battery_cabinet_bms_word', 'battery cabinet BMS',
        cc('battery_cabinet_bms', 'battery cabinet BMS', 'silicon_semiconductor_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'cabinet + master BMS + cell balancing + DC disconnect + Class T fuse'), mod('capacity', p.batteryKwh.toFixed(1), 'kWh')]),
      // 2026-05-24 orphan-fix: word for VRLA-AGM fallback when isLithium=false
      // in the engineering-contract; macro `vrla_block_battery` propagates here.
      word('vrla_block_battery_word', 'VRLA AGM block battery',
        cc('vrla_block_battery', 'VRLA AGM block battery', 'electrochemical_energy_function', 'lead'),
        [mod('quantity', '×1'), mod('capacity', p.batteryKwh.toFixed(1), 'kWh'), mod('form', '12 V VRLA-AGM block (CSB/Yuasa) — placeholder when Li-ion not selected'), mod('regulatory', 'BS EN 50272-2')]),
    ])
  return {
    module: 'battery_pack',
    module_brief: `${p.cellCount}-cell 48 V LFP string (${p.batteryKwh.toFixed(2)} kWh nameplate) with TI BQ76952 BMS slave and ${Math.max(50, Math.round(p.ratedPowerKw * 1000 / 48 * 1.3))} A Bussmann fuse.`,
    overview_paragraph_en: '',
    derived_parameters: { cell_count: p.cellCount, nameplate_kwh: p.batteryKwh },
    allowed_radicals: ['electrochemical_energy_function', 'lithium_iron_phosphate_chemistry', 'electrical_conducting_function', 'silicon_semiconductor_function', 'electromechanical_switching_function', 'copper', 'ceramic', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [pack],
  }
}

function emitCharger(p: Params): DesignModule {
  const charger = makeSubModule('input_rectifier_charger', 'input rectifier + charger', 'converts',
    `230 V AC mains to 48 V DC via PFC rectifier + buck charger sized for ${(p.ratedPowerKw * 1.1).toFixed(1)} kW`,
    [
      word('pfc_rectifier_word', 'PFC rectifier',
        cc('pfc_rectifier', 'PFC rectifier', 'silicon_semiconductor_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×1'), mod('capacity', (p.ratedPowerKw * 1.1).toFixed(1), 'kW'), mod('form', 'totem-pole PFC'), mod('regulatory', 'IEC 61000-3-2')]),
      word('battery_charger_word', 'battery charger',
        cc('battery_charger', 'battery charger', 'silicon_semiconductor_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×1'), mod('form', 'isolated DC-DC'), mod('capacity', '1.5', 'kW')]),
      word('input_emi_filter_word', 'input EMI filter',
        cc('input_emi_filter', 'input EMI filter', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×1'), mod('form', 'Schaffner FN9244'), mod('regulatory', 'CISPR 22 Class B')]),
    ])
  return {
    module: 'charger',
    module_brief: 'Totem-pole PFC rectifier (CISPR 22 Class B) with isolated 1.5 kW DC-DC battery charger for LFP CC-CV cycle.',
    overview_paragraph_en: '',
    derived_parameters: { rectifier_efficiency_pct: 97 },
    allowed_radicals: ['silicon_semiconductor_function', 'electrical_conducting_function', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [charger],
  }
}

function emitTransferSwitch(p: Params): DesignModule {
  const ts = makeSubModule('static_bypass_switch', 'static bypass switch', 'transfers',
    `load between inverter and grid in < 4 ms via paralleled thyristor pair (${(p.ratedPowerKw * 1000 / 230).toFixed(0)} A AC)`,
    [
      word('static_switch_thyristor_word', 'static switch thyristor',
        cc('static_switch_thyristor', 'static switch thyristor', 'silicon_semiconductor_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×2'), mod('capacity', String(Math.max(50, Math.round(p.ratedPowerKw * 1000 / 230 * 1.5))), 'A'), mod('form', 'anti-parallel pair'), mod('regulatory', 'IEC 62040-1')]),
      word('bypass_contactor_word', 'bypass contactor',
        cc('bypass_contactor', 'bypass contactor', 'electromechanical_switching_function', 'copper'),
        [mod('quantity', '×1'), mod('capacity', String(Math.max(50, Math.round(p.ratedPowerKw * 1000 / 230 * 1.5))), 'A'), mod('form', 'mechanical maintenance bypass')]),
      // 2026-05-24 orphan-fix: new word so engineering-contract macro
      // `static_bypass_switch` (tokens: static+bypass+switch) propagates here.
      word('static_bypass_switch_word', 'static bypass switch',
        cc('static_bypass_switch', 'static bypass switch', 'silicon_semiconductor_function', 'copper'),
        [mod('quantity', '×1'), mod('form', 'thyristor back-to-back static switch + paralleled isolation'), mod('regulatory', 'IEC 62040-3 5-cycle ride-through')]),
    ])
  return {
    module: 'transfer_switch',
    module_brief: `Anti-parallel thyristor pair static switch transfers between inverter and grid in < 4 ms with mechanical maintenance-bypass contactor.`,
    overview_paragraph_en: '',
    derived_parameters: { transfer_time_ms: 4 },
    allowed_radicals: ['silicon_semiconductor_function', 'electromechanical_switching_function', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [ts],
  }
}

function emitInverter(p: Params): DesignModule {
  const inv = makeSubModule('igbt_inverter', 'IGBT inverter', 'converts',
    `48 V DC bus to 230 V AC at ${p.ratedKva.toFixed(1)} kVA (${p.ratedPowerKw.toFixed(1)} kW) via 4-IGBT H-bridge`,
    [
      word('igbt_half_bridge_word', 'IGBT half-bridge',
        cc('igbt_half_bridge', 'IGBT half-bridge', 'silicon_semiconductor_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×2'), mod('dimension', '600', 'V'), mod('capacity', '200', 'A'), mod('form', 'Infineon FF200R06KE3')]),
      word('inverter_output_filter_word', 'inverter output filter',
        cc('inverter_output_filter', 'inverter output filter', 'magnetic_coupling_function', 'copper'),
        [mod('quantity', '×1'), mod('capacity', '0.5', 'mH')]),
      word('inverter_dsp_word', 'inverter DSP',
        cc('inverter_dsp', 'inverter DSP', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'TI TMS320F28069')]),
      word('inverter_heatsink_word', 'inverter heatsink',
        cc('inverter_heatsink', 'inverter heatsink', 'thermal_transfer_function', 'aluminium'),
        [mod('quantity', '×1'), mod('form', 'extruded aluminium')]),
      // 2026-05-24 orphan-fix: new word so engineering-contract macro
      // `power_module_inverter_block` (tokens: power+inverter+block)
      // propagates here.
      word('inverter_power_block_word', 'inverter power block',
        cc('inverter_power_block', 'inverter power block', 'silicon_semiconductor_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×1'), mod('form', 'IGBT/SiC bridge block + gate drivers + isolated PSUs'), mod('capacity', p.ratedPowerKw.toFixed(1), 'kW')]),
    ])
  return {
    module: 'inverter',
    module_brief: `IGBT H-bridge (Infineon FF200R06KE3) drives 230 V AC sine-wave output at ${p.ratedKva.toFixed(1)} kVA, η=${p.efficiencyPct.toFixed(1)}% online double-conversion.`,
    overview_paragraph_en: '',
    derived_parameters: { rated_kw: p.ratedPowerKw, efficiency_pct: p.efficiencyPct },
    allowed_radicals: ['silicon_semiconductor_function', 'magnetic_coupling_function', 'thermal_transfer_function', 'copper', 'aluminium', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [inv],
  }
}

function emitMonitoringLcd(_p: Params): DesignModule {
  const monitoring = makeSubModule('lcd_status_panel', 'LCD status panel', 'displays',
    'load %, battery SoC, runtime estimate, fault codes via 4-line LCD',
    [
      word('hd44780_lcd_word', 'HD44780 LCD',
        cc('hd44780_lcd', 'HD44780 LCD', 'optical_sensing_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', '4-line 20-char')]),
      word('status_led_word', 'status LED',
        cc('status_led', 'status LED', 'optical_sensing_function', 'polymer_thermoplastic'),
        [mod('quantity', '×4'), mod('form', 'red+green+yellow+blue')]),
      word('snmp_card_word', 'SNMP card',
        cc('snmp_card', 'SNMP card', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'AP9641 class'), mod('regulatory', 'IEC 62351-7 SNMPv3')]),
      word('audible_alarm_word', 'audible alarm',
        cc('audible_alarm', 'audible alarm', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('capacity', '85', 'dBA @ 1m')]),
      // 2026-05-24 orphan-fix: new word so engineering-contract macro
      // `control_logic_display_comms` (tokens: control+logic+display+comms)
      // propagates here.
      word('control_logic_display_comms_word', 'control logic + display + comms',
        cc('control_logic_display_comms', 'control logic + display + comms', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'ARM Cortex-M7 control card + colour touch LCD + SNMP/Modbus TCP/BACnet'), mod('regulatory', 'IEC 62040-3 monitoring class')]),
    ])
  return {
    module: 'monitoring_LCD',
    module_brief: '4×20 HD44780 LCD + 4 status LEDs + SNMPv3 Ethernet card (AP9641 class) + 85 dBA piezo alarm.',
    overview_paragraph_en: '',
    derived_parameters: { led_count: 4 },
    allowed_radicals: ['optical_sensing_function', 'silicon_semiconductor_function', 'electromechanical_switching_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [monitoring],
  }
}

function emitCoolingFan(p: Params): DesignModule {
  const cooling = makeSubModule('forced_air_cooling', 'forced air cooling', 'rejects',
    `${(p.ratedPowerKw * 1000 * (1 - p.efficiencyPct / 100)).toFixed(0)} W heat via temperature-controlled axial fans`,
    [
      word('axial_fan_word', 'axial fan',
        cc('axial_fan', 'axial fan', 'thermal_transfer_function', 'polymer_thermoplastic'),
        [mod('quantity', fmtQty(Math.max(1, Math.round(p.ratedPowerKw / 3)))), mod('form', 'Sunon GM1209PHV2-A'), mod('capacity', '120', 'mm')]),
      word('thermal_sensor_word', 'thermal sensor',
        cc('thermal_sensor', 'thermal sensor', 'thermal_transfer_function', 'ceramic'),
        [mod('quantity', '×3'), mod('form', 'NTC 10kΩ')]),
    ])
  return {
    module: 'cooling_fan',
    module_brief: `${Math.max(1, Math.round(p.ratedPowerKw / 3))}× 120 mm Sunon axial fans with 3× NTC thermal sensors for temperature-controlled cooling.`,
    overview_paragraph_en: '',
    derived_parameters: { fan_count: Math.max(1, Math.round(p.ratedPowerKw / 3)) },
    allowed_radicals: ['thermal_transfer_function', 'polymer_thermoplastic', 'ceramic'],
    applicability_confidence: 'high',
    sub_modules: [cooling],
  }
}

function emitEnclosure(p: Params): DesignModule {
  const enclosure = makeSubModule('rack_chassis', 'rack chassis', 'houses',
    `all sub-modules in ${Math.ceil(p.ratedPowerKw / 2)}U 19-inch rack-mount sheet-steel chassis`,
    [
      word('rack_chassis_word', 'rack chassis',
        cc('rack_chassis', 'rack chassis', null, 'steel'),
        [mod('quantity', '×1'), mod('form', `${Math.ceil(p.ratedPowerKw / 2)}U 19-inch`), mod('regulatory', 'EIA-310')]),
      word('rack_rail_word', 'rack rail',
        cc('rack_rail', 'rack rail', null, 'steel'),
        [mod('quantity', '×2'), mod('form', 'sliding tool-less')]),
      word('iec_c14_inlet_word', 'IEC C14 inlet',
        cc('iec_c14_inlet', 'IEC C14 inlet', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'IEC 60320')]),
      word('iec_c13_outlet_word', 'IEC C13 outlet',
        cc('iec_c13_outlet', 'IEC C13 outlet', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [mod('quantity', '×8'), mod('regulatory', 'IEC 60320')]),
    ])
  return {
    module: 'enclosure',
    module_brief: `${Math.ceil(p.ratedPowerKw / 2)}U EIA-310 19" sheet-steel rack chassis with tool-less rails, IEC C14 inlet and 8× C13 outlets.`,
    overview_paragraph_en: '',
    derived_parameters: { rack_units: Math.ceil(p.ratedPowerKw / 2), outlet_count: 8 },
    allowed_radicals: ['steel', 'electromechanical_switching_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [enclosure],
  }
}

function emitRegulatory(_p: Params): DesignModule {
  const cert = makeSubModule('regulatory_signage', 'regulatory signage', 'documents',
    'IEC 62040 series + safety + EMC marking',
    [
      word('iec_62040_label_word', 'IEC 62040 label',
        cc('iec_62040_label', 'IEC 62040 label', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'IEC 62040-1/-2/-3')]),
      word('ce_mark_word', 'CE mark',
        cc('ce_mark', 'CE mark', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'EU LVD + EMC')]),
      word('battery_warning_label_word', 'battery warning label',
        cc('battery_warning_label', 'battery warning label', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'IEC 62619 + UN38.3')]),
      word('rohs_reach_label_word', 'RoHS / REACH label',
        cc('rohs_reach_label', 'RoHS / REACH label', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'RoHS 3 + REACH')]),
    ])
  return {
    module: 'regulatory',
    module_brief: 'Rear-panel labels: IEC 62040-1/-2/-3 + CE + IEC 62619 / UN38.3 battery warning + RoHS / REACH conformity.',
    overview_paragraph_en: '',
    derived_parameters: { mandatory_count: 4 },
    allowed_radicals: ['polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [cert],
  }
}

function emitCrossModuleGrammarLinks(p: Params) {
  return [
    { from_module: 'charger', to_module: 'battery_pack', mechanism: 'dc_bus', type: 'directional' as const, detail: 'CC-CV charge to 48 V LFP' },
    { from_module: 'battery_pack', to_module: 'inverter', mechanism: 'dc_bus', type: 'directional' as const, detail: `48 V DC at ${(p.ratedPowerKw * 1000 / 48).toFixed(0)} A peak` },
    { from_module: 'inverter', to_module: 'transfer_switch', mechanism: 'ac_bus', type: 'mutual' as const, detail: '230 V AC' },
    { from_module: 'transfer_switch', to_module: 'enclosure', mechanism: 'ac_bus', type: 'directional' as const, detail: 'output to C13 outlets' },
    { from_module: 'monitoring_LCD', to_module: 'inverter', mechanism: 'data', type: 'mutual' as const, detail: 'DSP telemetry' },
    { from_module: 'monitoring_LCD', to_module: 'battery_pack', mechanism: 'data', type: 'mutual' as const, detail: 'BMS SoC + alarms' },
    { from_module: 'cooling_fan', to_module: 'inverter', mechanism: 'thermal', type: 'directional' as const, detail: 'forced air over IGBT heatsink' },
    { from_module: 'enclosure', to_module: 'battery_pack', mechanism: 'mechanical', type: 'directional' as const, detail: 'battery tray slide-in' },
    { from_module: 'regulatory', to_module: 'enclosure', mechanism: 'documentation', type: 'directional' as const, detail: 'rear panel label set' },
  ]
}

export const upsInverterEmitter: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveParams(contract as ContractInProgress)
  return {
    modules: [
      emitBatteryPack(p),
      emitCharger(p),
      emitTransferSwitch(p),
      emitInverter(p),
      emitMonitoringLcd(p),
      emitCoolingFan(p),
      emitEnclosure(p),
      emitRegulatory(p),
    ],
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: '8-module taxonomy for online double-conversion UPS — battery, charger, transfer switch, inverter, monitoring, cooling, enclosure, regulatory.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Provide ${p.ratedPowerKw.toFixed(1)} kW (${p.ratedKva.toFixed(1)} kVA) of clean 230 V AC power with ${p.runtimeMinFull.toFixed(0)} min battery runtime at η≥${p.efficiencyPct.toFixed(0)}% per IEC 62040-1/-2/-3 online double-conversion.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('ups_inverter', upsInverterEmitter)
