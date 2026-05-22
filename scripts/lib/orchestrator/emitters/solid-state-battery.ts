/**
 * scripts/lib/orchestrator/emitters/solid-state-battery.ts
 *
 * SOLID-STATE BATTERY (Li-metal anode + ceramic electrolyte) deterministic
 * emitter — 2026-05-22.
 *
 * 10 modules: cathode_layer, anode_lithium_metal,
 * ceramic_electrolyte_membrane, stack_assembly_compression,
 * current_collectors, packaging_pouch_or_prismatic, BMS_voltage_monitor,
 * thermal_pad_or_loop, current_terminals, regulatory_certification.
 *
 * Industry refs: QuantumScape (LLZO oxide separator, Li-metal anode,
 * ~440 Wh/kg projected, multilayer architecture), Solid Power
 * (sulphide electrolyte + Li-metal anode, ~390 Wh/kg, BMW partnership),
 * Factorial Energy (FEST polymer-gel hybrid, ~390 Wh/kg, Stellantis +
 * Hyundai), Toyota (sulphide, EV launch slated 2027).
 */

import { registerAssembler } from '../assembler'
import type { ClassEmitter, DesignJSON, DesignModule } from '../assembler'
import type { ContractInProgress } from '../types'

interface Mod { kind: string; value: string; unit?: string }
interface CC { character_id: string; name_human: string;
  function_radical_primary: string | null; function_radical_secondary: string | null;
  material_radical_primary: string | null; material_radical_secondary: string | null }
interface W { id: string; name_human: string; content_character: CC; modifier_characters: Mod[] }
interface SM { id: string; name_human: string; english_sentence: string; rad_syntax: string;
  role_verb: string; topology_clause: string; words: W[] }

function q(c: ContractInProgress, key: string, fallback: number): number {
  const v = c.quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
function fmtQty(n: number): string { return Number.isInteger(n) ? `×${n}` : `×${n.toFixed(2)}` }
function mod(k: string, v: string, u?: string): Mod { return u !== undefined ? { kind: k, value: v, unit: u } : { kind: k, value: v } }
function cc(id: string, n: string, fp: string | null, mp: string | null, fs: string | null = null, ms: string | null = null): CC {
  return { character_id: id, name_human: n, function_radical_primary: fp, function_radical_secondary: fs, material_radical_primary: mp, material_radical_secondary: ms }
}
function word(id: string, n: string, c: CC, m: Mod[]): W {
  // Universal fix #A (2026-05-22): strip literal " word" suffix from name_human.
  const cleanName = n.replace(/\s+word$/i, '')
  return { id, name_human: cleanName, content_character: c, modifier_characters: m }
}
function rad(ws: W[]): string {
  return ws.map(w => {
    const o = [...w.modifier_characters].sort((a, b) => a.kind === 'quantity' ? -1 : b.kind === 'quantity' ? 1 : 0)
    const toks = o.map(m => m.unit ? `${m.value}${m.unit}` : m.value)
    return toks.length === 0 ? w.content_character.character_id : `${w.content_character.character_id} (${toks.join(', ')})`
  }).join(' ⊙ ')
}
function makeSub(id: string, n: string, role: string, top: string, ws: W[]): SM {
  return { id, name_human: n, english_sentence: '', rad_syntax: rad(ws), role_verb: role, topology_clause: top, words: ws }
}

interface SsbParams {
  cellCount: number
  cellCapacityAh: number
  cellVoltageV: number
  packKwh: number
  energyDensityWhKg: number
  totalCellMassKg: number
  stackPressureMpa: number
  compressionPlateThicknessMm: number
  tieRodCount: number
  tieRodPreloadKn: number
  electrolyteConductivitySCm: number
  cycleLifeTo80: number
  thermalRunawayC: number
  criticalCurrentMaCm2: number
  operatingCurrentMaCm2: number
}

function deriveParams(c: ContractInProgress): SsbParams {
  return {
    cellCount: Math.max(1, Math.round(q(c, 'cell_count', 96))),
    cellCapacityAh: q(c, 'cell_capacity_ah', 5.0),
    cellVoltageV: q(c, 'cell_voltage_v', 4.0),
    packKwh: q(c, 'nameplate_capacity_kwh', 80),
    energyDensityWhKg: q(c, 'energy_density_wh_kg', 400),
    totalCellMassKg: q(c, 'total_cell_mass_kg', 200),
    stackPressureMpa: q(c, 'stack_pressure_mpa', 8),
    compressionPlateThicknessMm: q(c, 'compression_plate_thickness_mm', 25),
    tieRodCount: Math.max(1, Math.round(q(c, 'tie_rod_count', 4))),
    tieRodPreloadKn: q(c, 'tie_rod_preload_kn', 80),
    electrolyteConductivitySCm: q(c, 'electrolyte_conductivity_s_cm', 1.0e-3),
    cycleLifeTo80: q(c, 'cycle_life_to_80_pct', 800),
    thermalRunawayC: q(c, 'thermal_runaway_onset_c', 220),
    criticalCurrentMaCm2: q(c, 'critical_current_density_ma_cm2', 5.0),
    operatingCurrentMaCm2: q(c, 'operating_current_density_ma_cm2', 3.0),
  }
}

// ---------------------------------------------------------------------------
// 1. cathode_layer
// ---------------------------------------------------------------------------

function emitCathodeLayer(p: SsbParams): DesignModule {
  const cathode = makeSub('nca_cathode_layer', 'NCA cathode layer', 'oxidises',
    `NCA (Ni-Co-Al) cathode layer ${p.cellCount} times stacked, ${p.energyDensityWhKg.toFixed(0)} Wh/kg cell-level energy density`, [
    word('nca_cathode_powder_word', 'NCA cathode powder',
      cc('nca_cathode_powder', 'NCA cathode powder', 'chemical_sensing_function', 'ceramic'),
      [mod('quantity', fmtQty(p.cellCount)),
       mod('form', 'LiNi₀.₈Co₀.₁₅Al₀.₀₅O₂'),
       mod('capacity', '200', 'mAh/g')]),
    word('cathode_aluminium_foil_word', 'cathode aluminium foil',
      cc('cathode_aluminium_foil', 'cathode aluminium foil', 'electrical_conducting_function', 'aluminium'),
      [mod('quantity', fmtQty(p.cellCount)),
       mod('dimension', '15', 'µm'),
       mod('form', 'Al-1085')]),
    word('pvdf_binder_word', 'PVDF binder',
      cc('pvdf_binder', 'PVDF binder', 'chemical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', fmtQty(p.cellCount)),
       mod('form', 'Solvay Solef 5130')]),
  ])

  return {
    module: 'energy_storage_source',
    module_brief: `NCA cathode layer (${p.cellCount} cells): LiNi₀.₈Co₀.₁₅Al₀.₀₅O₂ active material at 200 mAh/g on 15 µm Al foil with PVDF binder.`,
    overview_paragraph_en: '',
    derived_parameters: {
      cell_count: p.cellCount,
      cathode_capacity_mah_g: 200,
    },
    allowed_radicals: ['chemical_sensing_function', 'electrical_conducting_function', 'ceramic', 'aluminium', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [cathode],
  }
}

// ---------------------------------------------------------------------------
// 2. anode_lithium_metal
// ---------------------------------------------------------------------------

function emitAnodeLithiumMetal(p: SsbParams): DesignModule {
  const anode = makeSub('li_metal_anode', 'Li metal anode', 'reduces',
    `${p.cellCount}× pure Li metal anode layers (15 µm) with critical current density ${p.criticalCurrentMaCm2.toFixed(1)} mA/cm²`, [
    word('li_metal_foil_word', 'Li metal foil',
      cc('li_metal_foil', 'Li metal foil', 'electrochemical_energy_function', 'lithium_iron_phosphate_chemistry'),
      [mod('quantity', fmtQty(p.cellCount)),
       mod('form', '15 µm pure Li'),
       mod('capacity', '3860', 'mAh/g'),
       mod('regulatory', 'UN 38.3')]),
    word('anode_copper_foil_word', 'anode copper foil',
      cc('anode_copper_foil', 'anode copper foil', 'electrical_conducting_function', 'copper'),
      [mod('quantity', fmtQty(p.cellCount)),
       mod('dimension', '8', 'µm'),
       mod('form', 'Cu-DHP')]),
    word('li_in_alloy_interlayer_word', 'Li-In alloy interlayer',
      cc('li_in_alloy_interlayer', 'Li-In alloy interlayer', 'chemical_sensing_function', 'ceramic'),
      [mod('quantity', fmtQty(p.cellCount)),
       mod('form', 'In-rich alloy seed'),
       mod('regulatory', 'QuantumScape patent class')]),
  ])

  return {
    module: 'energy_storage_source',
    module_brief: `Li metal anode (${p.cellCount} cells): 15 µm pure Li foil on 8 µm Cu-DHP current collector. Li-In alloy seed layer for plating uniformity. ${p.criticalCurrentMaCm2.toFixed(1)} mA/cm² critical current density.`,
    overview_paragraph_en: '',
    derived_parameters: {
      li_thickness_um: 15,
      critical_current_ma_cm2: p.criticalCurrentMaCm2,
    },
    allowed_radicals: ['electrochemical_energy_function', 'chemical_sensing_function', 'electrical_conducting_function', 'copper', 'lithium_iron_phosphate_chemistry'],
    applicability_confidence: 'high',
    sub_modules: [anode],
  }
}

// ---------------------------------------------------------------------------
// 3. ceramic_electrolyte_membrane
// ---------------------------------------------------------------------------

function emitCeramicElectrolyteMembrane(p: SsbParams): DesignModule {
  const sep = makeSub('llzo_separator', 'LLZO ceramic separator', 'conducts ions',
    `${p.cellCount}× LLZO (Li₇La₃Zr₂O₁₂) ceramic separator, ${(p.electrolyteConductivitySCm * 1000).toFixed(2)} mS/cm ionic conductivity`, [
    word('llzo_separator_sheet_word', 'LLZO separator sheet',
      cc('llzo_separator_sheet', 'LLZO separator sheet', 'chemical_sensing_function', 'ceramic'),
      [mod('quantity', fmtQty(p.cellCount)),
       mod('form', 'sintered Li₇La₃Zr₂O₁₂ + Ta dopant'),
       mod('dimension', '30', 'µm thickness'),
       mod('capacity', String((p.electrolyteConductivitySCm * 1000).toFixed(2)), 'mS/cm')]),
    word('cathode_catholyte_word', 'cathode catholyte',
      cc('cathode_catholyte', 'cathode catholyte', 'chemical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', fmtQty(p.cellCount)),
       mod('form', 'PEO + LiTFSI gel'),
       mod('regulatory', 'patent-class hybrid')]),
  ])

  return {
    module: 'mass_fluid_transport_process',
    module_brief: `LLZO ceramic separator (${p.cellCount} cells): Ta-doped Li₇La₃Zr₂O₁₂, 30 µm thickness, ${(p.electrolyteConductivitySCm * 1000).toFixed(2)} mS/cm at 30°C. PEO+LiTFSI catholyte at cathode interface.`,
    overview_paragraph_en: '',
    derived_parameters: {
      electrolyte_conductivity_ms_cm: p.electrolyteConductivitySCm * 1000,
      electrolyte_thickness_um: 30,
    },
    allowed_radicals: ['chemical_sensing_function', 'ceramic', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [sep],
  }
}

// ---------------------------------------------------------------------------
// 4. stack_assembly_compression
// ---------------------------------------------------------------------------

function emitStackAssemblyCompression(p: SsbParams): DesignModule {
  const stack = makeSub('compression_stack_assembly', 'compression stack assembly', 'compresses',
    `${p.stackPressureMpa.toFixed(1)} MPa uniaxial stack pressure via ${p.tieRodCount} M16 tie rods at ${p.tieRodPreloadKn.toFixed(0)} kN preload`, [
    word('compression_plate_word', 'compression plate',
      cc('compression_plate', 'compression plate', 'electromechanical_switching_function', 'aluminium'),
      [mod('quantity', '×2'),
       mod('form', '7075-T6 aluminium'),
       mod('dimension', String(p.compressionPlateThicknessMm.toFixed(0)), 'mm thickness')]),
    word('tie_rod_word', 'tie rod',
      cc('tie_rod_ssb', 'compression tie rod', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', fmtQty(p.tieRodCount)),
       mod('form', 'M16 grade 12.9 steel'),
       mod('capacity', String(p.tieRodPreloadKn.toFixed(0)), 'kN preload')]),
    word('belleville_washer_word', 'Belleville washer stack',
      cc('belleville_washer_stack', 'Belleville washer stack', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', fmtQty(p.tieRodCount * 6)),
       mod('form', 'spring stack — pressure compensation')]),
  ])

  return {
    module: 'structure_containment',
    module_brief: `Compression stack: 2× 7075-T6 aluminium plates (${p.compressionPlateThicknessMm.toFixed(0)} mm) compressed via ${p.tieRodCount} M16 grade 12.9 tie rods at ${p.tieRodPreloadKn.toFixed(0)} kN preload, Belleville washer stacks for pressure compensation across cycle.`,
    overview_paragraph_en: '',
    derived_parameters: {
      stack_pressure_mpa: p.stackPressureMpa,
      tie_rod_count: p.tieRodCount,
      preload_kn: p.tieRodPreloadKn,
    },
    allowed_radicals: ['electromechanical_switching_function', 'aluminium', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [stack],
  }
}

// ---------------------------------------------------------------------------
// 5. current_collectors
// ---------------------------------------------------------------------------

function emitCurrentCollectors(p: SsbParams): DesignModule {
  const collectors = makeSub('current_collector_tabs', 'current collector tabs', 'conducts',
    `cathode Al-foil and anode Cu-foil current collectors with welded tabs across ${p.cellCount} layers`, [
    word('cathode_tab_word', 'cathode tab',
      cc('cathode_tab', 'cathode aluminium tab', 'electrical_conducting_function', 'aluminium'),
      [mod('quantity', fmtQty(p.cellCount)),
       mod('form', 'ultrasonic-welded Al tab'),
       mod('dimension', '0.2', 'mm')]),
    word('anode_tab_word', 'anode tab',
      cc('anode_tab', 'anode copper tab', 'electrical_conducting_function', 'copper'),
      [mod('quantity', fmtQty(p.cellCount)),
       mod('form', 'ultrasonic-welded Cu tab'),
       mod('dimension', '0.2', 'mm')]),
    word('busbar_intercell_word', 'inter-cell busbar',
      cc('busbar_intercell_ssb', 'inter-cell busbar', 'electrical_conducting_function', 'copper'),
      [mod('quantity', fmtQty(Math.max(0, p.cellCount - 1))),
       mod('form', 'laser-welded Cu busbar')]),
  ])

  return {
    module: 'power_distribution',
    module_brief: `Current collectors: ultrasonic-welded 0.2 mm Al cathode tabs + Cu anode tabs across ${p.cellCount} cells, laser-welded inter-cell busbars connecting all cells in series.`,
    overview_paragraph_en: '',
    derived_parameters: { intercell_busbar_count: Math.max(0, p.cellCount - 1) },
    allowed_radicals: ['electrical_conducting_function', 'copper', 'aluminium'],
    applicability_confidence: 'high',
    sub_modules: [collectors],
  }
}

// ---------------------------------------------------------------------------
// 6. packaging_pouch_or_prismatic
// ---------------------------------------------------------------------------

function emitPackagingPouchOrPrismatic(p: SsbParams): DesignModule {
  const pack = makeSub('multilayer_pouch_assembly', 'multilayer pouch assembly', 'encapsulates',
    `${p.cellCount}× multilayer pouch cells in laminated aluminium-polymer pouch`, [
    word('al_polymer_laminate_pouch_word', 'Al-polymer laminate pouch',
      cc('al_polymer_laminate_pouch', 'Al-polymer laminate pouch', 'electromechanical_switching_function', 'aluminium'),
      [mod('quantity', fmtQty(p.cellCount)),
       mod('form', 'Al foil + PP + nylon laminate'),
       mod('regulatory', 'IEC 62660')]),
    word('cell_frame_polymer_word', 'cell frame polymer',
      cc('cell_frame_polymer', 'cell frame polymer', 'electromechanical_switching_function', 'polymer_thermoplastic'),
      [mod('quantity', fmtQty(p.cellCount)),
       mod('form', 'glass-filled PA66')]),
  ])

  return {
    module: 'structure_containment',
    module_brief: `Multilayer pouch packaging: ${p.cellCount} laminated Al-polymer pouch cells (Al foil + PP + nylon) in glass-filled PA66 cell frames per IEC 62660.`,
    overview_paragraph_en: '',
    derived_parameters: { cell_packaging: 'pouch_multilayer' as string },
    allowed_radicals: ['electromechanical_switching_function', 'aluminium', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [pack],
  }
}

// ---------------------------------------------------------------------------
// 7. BMS_voltage_monitor
// ---------------------------------------------------------------------------

function emitBmsVoltageMonitor(p: SsbParams): DesignModule {
  const bms = makeSub('bms_per_cell_monitor', 'per-cell BMS voltage monitor', 'monitors',
    'BMS slave + master with per-cell voltage + temperature monitoring for SoH/SoC estimation', [
    word('bms_slave_voltage_word', 'BMS slave voltage monitor',
      cc('bms_slave_voltage_ssb', 'BMS slave voltage monitor', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', fmtQty(Math.ceil(p.cellCount / 12))),
       mod('form', 'ISL94212 12-channel'),
       mod('regulatory', 'ISO 26262 ASIL-C')]),
    word('bms_master_word', 'BMS master',
      cc('bms_master_ssb', 'BMS master', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('form', 'STM32G4 + ISL94202 stack monitor')]),
  ])

  return {
    module: 'control_compute_communication',
    module_brief: `BMS: ${Math.ceil(p.cellCount / 12)}× ISL94212 12-channel slaves + STM32G4 master, ISO 26262 ASIL-C functional safety target. Per-cell voltage + temperature monitoring for SoC/SoH estimation across all ${p.cellCount} cells.`,
    overview_paragraph_en: '',
    derived_parameters: { bms_slave_count: Math.ceil(p.cellCount / 12) },
    allowed_radicals: ['silicon_semiconductor_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [bms],
  }
}

// ---------------------------------------------------------------------------
// 8. thermal_pad_or_loop
// ---------------------------------------------------------------------------

function emitThermalPadOrLoop(_p: SsbParams): DesignModule {
  const thermal = makeSub('thermal_management_layer', 'thermal management layer', 'rejects',
    'sandwich graphene-doped thermal pad + cold-plate manifold for stack thermal control', [
    word('graphene_thermal_pad_word', 'graphene thermal pad',
      cc('graphene_thermal_pad', 'graphene thermal pad', 'thermal_transfer_function', 'polymer_thermoplastic'),
      [mod('quantity', '×8'),
       mod('form', 'graphene-doped silicone'),
       mod('capacity', '15', 'W/m·K')]),
    word('cold_plate_aluminium_word', 'cold plate aluminium',
      cc('cold_plate_aluminium', 'aluminium cold plate', 'thermal_transfer_function', 'aluminium'),
      [mod('quantity', '×2'),
       mod('form', 'extruded micro-channel'),
       mod('capacity', '2', 'kW')]),
  ])

  return {
    module: 'environmental_interface',
    module_brief: 'Thermal management: 8× graphene-doped silicone thermal pads (15 W/m·K) + 2× extruded micro-channel aluminium cold plates rejecting 2 kW total.',
    overview_paragraph_en: '',
    derived_parameters: { cooling_capacity_kw: 4 },
    allowed_radicals: ['thermal_transfer_function', 'aluminium', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [thermal],
  }
}

// ---------------------------------------------------------------------------
// 9. current_terminals
// ---------------------------------------------------------------------------

function emitCurrentTerminals(_p: SsbParams): DesignModule {
  const terminals = makeSub('high_current_terminals', 'high-current terminals', 'connects',
    'pack-level high-current terminals (M10 stud) with HRC fuse and contactor', [
    word('m10_terminal_post_word', 'M10 terminal post',
      cc('m10_terminal_post', 'M10 terminal post', 'electrical_conducting_function', 'copper'),
      [mod('quantity', '×2'),
       mod('form', 'Cu-DHP M10 stud'),
       mod('capacity', '200', 'A')]),
    word('hrc_fuse_word', 'HRC fuse',
      cc('hrc_fuse_ssb', 'HRC fuse', 'electromechanical_switching_function', 'copper'),
      [mod('quantity', '×1'),
       mod('capacity', '250', 'A'),
       mod('form', 'Bussmann FWP')]),
    word('precharge_contactor_word', 'pre-charge contactor',
      cc('precharge_contactor_ssb', 'pre-charge contactor', 'electromechanical_switching_function', 'copper'),
      [mod('quantity', '×1'),
       mod('form', 'Gigavac MX24'),
       mod('capacity', '400', 'V DC')]),
  ])

  return {
    module: 'power_distribution',
    module_brief: 'Pack-level current terminals: 2× M10 Cu studs rated 200 A, 250 A HRC fuse, Gigavac MX24 pre-charge contactor at 400 V DC.',
    overview_paragraph_en: '',
    derived_parameters: { terminal_count: 2 },
    allowed_radicals: ['electrical_conducting_function', 'electromechanical_switching_function', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [terminals],
  }
}

// ---------------------------------------------------------------------------
// 10. regulatory_certification
// ---------------------------------------------------------------------------

function emitRegulatoryCertification(p: SsbParams): DesignModule {
  const reg = makeSub('battery_regulatory_certification', 'battery regulatory certification', 'certifies',
    `UN 38.3 transportation + IEC 62660 EV cell + UL 1973 stationary + IEC 62133 portable certifications. ${p.cycleLifeTo80.toFixed(0)} cycle / ${p.thermalRunawayC.toFixed(0)} °C runaway onset.`, [
    word('un383_certification_word', 'UN 38.3 certification',
      cc('un383_certification', 'UN 38.3 transportation certification', null, 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('regulatory', 'UN 38.3 rev.7')]),
    word('iec62660_certification_word', 'IEC 62660 certification',
      cc('iec62660_certification', 'IEC 62660 EV cell certification', null, 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('regulatory', 'IEC 62660-1/2/3')]),
    word('ul1973_certification_word', 'UL 1973 certification',
      cc('ul1973_certification', 'UL 1973 stationary battery certification', null, 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('regulatory', 'UL 1973:2022')]),
  ])

  return {
    module: 'maintenance_serviceability',
    module_brief: `Regulatory: UN 38.3 (transport), IEC 62660-1/2/3 (EV cell), UL 1973 (stationary), IEC 62133 (portable). ${p.cycleLifeTo80.toFixed(0)} cycle life to 80% SoH, ${p.thermalRunawayC.toFixed(0)} °C thermal runaway onset.`,
    overview_paragraph_en: '',
    derived_parameters: { regulatory_mandatory_count: 4 },
    allowed_radicals: ['polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [reg],
  }
}

// ---------------------------------------------------------------------------
// Cross-module grammar links
// ---------------------------------------------------------------------------

function emitCrossModuleGrammarLinks(p: SsbParams) {
  return [
    { from_module: 'energy_storage_source', to_module: 'mass_fluid_transport_process',
      mechanism: 'electrical_bus' as const, type: 'mutual' as const,
      detail: `Li⁺ transport across LLZO at ${(p.electrolyteConductivitySCm * 1000).toFixed(2)} mS/cm conductivity` },
    { from_module: 'structure_containment', to_module: 'energy_storage_source',
      mechanism: 'mechanical' as const, type: 'directional' as const,
      detail: `${p.stackPressureMpa.toFixed(1)} MPa uniaxial stack pressure on cell layers` },
    { from_module: 'power_distribution', to_module: 'energy_storage_source',
      mechanism: 'electrical_bus' as const, type: 'mutual' as const,
      detail: 'inter-cell busbars + terminal posts to pack pins' },
    { from_module: 'control_compute_communication', to_module: 'energy_storage_source',
      mechanism: 'data' as const, type: 'directional' as const,
      detail: 'BMS slave + master monitor per-cell V/T for SoC/SoH' },
    { from_module: 'environmental_interface', to_module: 'energy_storage_source',
      mechanism: 'thermal' as const, type: 'directional' as const,
      detail: 'cold-plate cooling stack at 4 kW peak rejection' },
  ]
}

// ---------------------------------------------------------------------------
// PUBLIC EMITTER
// ---------------------------------------------------------------------------

const emitter: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitCathodeLayer(p),
    emitAnodeLithiumMetal(p),
    emitCeramicElectrolyteMembrane(p),
    emitStackAssemblyCompression(p),
    emitCurrentCollectors(p),
    emitPackagingPouchOrPrismatic(p),
    emitBmsVoltageMonitor(p),
    emitThermalPadOrLoop(p),
    emitCurrentTerminals(p),
    emitRegulatoryCertification(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: ['safety_protection'],
    rationale_excluded: 'Cell-level pack — fire-suppression handled at module/system level by the integrator. BMS-driven over-temperature shutdown is in control_compute_communication.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Solid-state Li-metal battery pack: ${p.cellCount} cells in series × ${p.cellCapacityAh.toFixed(1)} Ah at ${p.cellVoltageV.toFixed(2)} V nominal = ${p.packKwh.toFixed(1)} kWh nameplate. ${p.energyDensityWhKg.toFixed(0)} Wh/kg cell-level energy density. LLZO ceramic separator + 15 µm Li-metal anode + NCA cathode. ${p.stackPressureMpa.toFixed(1)} MPa stack pressure via ${p.tieRodCount} tie rods. ${p.cycleLifeTo80.toFixed(0)} cycles to 80% SoH at ${p.thermalRunawayC.toFixed(0)}°C runaway onset.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('solid_state_battery', emitter)
registerAssembler('solid_state_battery/cell', emitter)
