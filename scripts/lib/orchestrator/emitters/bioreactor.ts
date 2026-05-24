/**
 * scripts/lib/orchestrator/emitters/bioreactor.ts
 *
 * BIOREACTOR (stirred-tank fermenter / cell culture) DETERMINISTIC
 * EMITTER — BESS-quality per the 2026-05-22 hand-tuning batch.
 *
 * Industry references: Sartorius BIOSTAT D-DCU 100-2000 L,
 * Eppendorf BioFlo 320 / 510 / 730, Pall Allegro STR single-use,
 * Thermo HyPerforma 5:1, Cytiva Xcellerex XDR-2000.
 *
 * Envelope: 100 L pilot up to 50 000 L production stirred-tank
 * fermenter (microbial / mammalian / Pichia / E. coli) with 316L
 * jacketed sanitary vessel, top-entry agitator, ring sparger,
 * automated CIP/SIP, on-line pH/DO/temp probes.
 *
 * Reproducibility contract: pure function, no I/O, all numerical
 * fields read from contract.quantities. LLM narrator fills prose
 * fields later.
 *
 * Modules emitted (12): stainless_vessel, jacket_cooling_heating,
 *   impeller_drive, sparger_aeration, sample_ports,
 *   pH_DO_temp_probes, dosing_pumps, gas_supply_O2_N2_CO2,
 *   control_DCS_PLC, harvest_drain_outlet, downstream_filtration,
 *   regulatory_FDA_cGMP.
 */

import type {
  BriefEnvelope,
  ContractInProgress,
  ParsedConstraints,
} from '../types'
import type { DesignJSON, DesignModule } from '../assembler'
import { registerAssembler } from '../assembler'

// ---------------------------------------------------------------------------
// LOCAL TYPES
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
interface Word { id: string; name_human: string; content_character: ContentCharacter; modifier_characters: ModifierCharacter[] }
interface SubModule { id: string; name_human: string; english_sentence: string; rad_syntax: string; role_verb: string; topology_clause: string; words: Word[] }

function q(contract: ContractInProgress, key: string, fallback: number): number {
  const v = (contract.quantities as Record<string, { value: number } | undefined>)?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function fmtQty(n: number): string { return Number.isInteger(n) ? `×${n}` : `×${n.toFixed(2)}` }
function mod(kind: string, value: string, unit?: string): ModifierCharacter { return unit !== undefined ? { kind, value, unit } : { kind, value } }

function cc(character_id: string, name_human: string, fp: string | null, mp: string | null, fs: string | null = null, ms: string | null = null): ContentCharacter {
  return { character_id, name_human, function_radical_primary: fp, function_radical_secondary: fs, material_radical_primary: mp, material_radical_secondary: ms }
}

function word(id: string, name_human: string, content: ContentCharacter, modifiers: ModifierCharacter[]): Word {
  // Universal fix #A (2026-05-22): strip literal " word" suffix from name_human.
  const cleanName = name_human.replace(/\s+word$/i, '')
  return { id, name_human: cleanName, content_character: content, modifier_characters: modifiers }
}

function synthRad(words: Word[]): string {
  return words
    .map((w) => {
      const m = [...w.modifier_characters].sort((a, b) => (a.kind === 'quantity' ? -1 : b.kind === 'quantity' ? 1 : 0))
      const tokens = m.map((x) => (x.unit ? `${x.value}${x.unit}` : x.value))
      return tokens.length === 0 ? w.content_character.character_id : `${w.content_character.character_id} (${tokens.join(', ')})`
    })
    .join(' ⊙ ')
}

function makeSub(id: string, name: string, role: string, topology: string, words: Word[]): SubModule {
  return { id, name_human: name, english_sentence: '', rad_syntax: synthRad(words), role_verb: role, topology_clause: topology, words }
}

// ---------------------------------------------------------------------------
// PARAMS
// ---------------------------------------------------------------------------

interface BioreactorParams {
  workingVolumeL: number
  totalVolumeL: number
  fillRatio: number
  vesselDiameterM: number
  vesselHeightM: number
  vesselMassKg: number
  agitationPowerPerLW: number
  agitatorPowerKw: number
  klaPerH: number
  otrMmolLH: number
  vvm: number
  spargerFlowLMin: number
  heatRemovalKw: number
  microbialHeatKw: number
  agitatorHeatKw: number
  phChannels: number
  tempMinC: number
  tempMaxC: number
  isProduction: boolean  // ≥1000 L
  impellerCount: number
}

function deriveParams(c: ContractInProgress): BioreactorParams {
  const workingVolumeL = q(c, 'working_volume_l', 1000)
  const fillRatio = q(c, 'fill_ratio', 0.80)
  const totalVolumeL = q(c, 'total_volume_l', workingVolumeL / fillRatio)
  const vesselDiameterM = q(c, 'vessel_diameter_m', Math.cbrt((2 * (totalVolumeL / 1000)) / Math.PI))
  const vesselHeightM = q(c, 'vessel_height_m', vesselDiameterM * 2)
  const vesselMassKg = q(c, 'vessel_mass_kg', 4 * totalVolumeL)
  const agitationPowerPerLW = q(c, 'agitation_power_per_l_w', 5)
  const agitatorPowerKw = q(c, 'agitator_power_kw', (workingVolumeL * agitationPowerPerLW) / 1000)
  const klaPerH = q(c, 'kla_per_h', 270)
  const otrMmolLH = q(c, 'otr_mmol_l_h', 40)
  const vvm = q(c, 'vvm', 0.75)
  const spargerFlowLMin = q(c, 'sparger_flow_l_min', vvm * workingVolumeL)
  const heatRemovalKw = q(c, 'heat_removal_kw', agitatorPowerKw * 0.40 + workingVolumeL * 0.005)
  const microbialHeatKw = q(c, 'microbial_heat_kw', workingVolumeL * 0.005)
  const agitatorHeatKw = q(c, 'agitator_heat_kw', agitatorPowerKw * 0.40)
  const phChannels = Math.max(2, Math.round(q(c, 'ph_channels', 2)))
  const tempMinC = q(c, 'temp_control_min_c', 20)
  const tempMaxC = q(c, 'temp_control_max_c', 45)
  const isProduction = workingVolumeL >= 1000
  const impellerCount = vesselHeightM / vesselDiameterM >= 2.5 ? 3 : 2
  return { workingVolumeL, totalVolumeL, fillRatio, vesselDiameterM, vesselHeightM, vesselMassKg, agitationPowerPerLW, agitatorPowerKw, klaPerH, otrMmolLH, vvm, spargerFlowLMin, heatRemovalKw, microbialHeatKw, agitatorHeatKw, phChannels, tempMinC, tempMaxC, isProduction, impellerCount }
}

// ---------------------------------------------------------------------------
// 1. stainless_vessel
// ---------------------------------------------------------------------------

function emitStainlessVessel(p: BioreactorParams): DesignModule {
  const vessel = makeSub(
    'sanitary_vessel_body',
    'sanitary vessel body',
    'contains',
    `${p.totalVolumeL.toFixed(0)} L 316L electropolished jacketed vessel (${p.vesselDiameterM.toFixed(2)} m OD × ${p.vesselHeightM.toFixed(2)} m TT)`,
    [
      word(
        'stainless_316l_vessel_word',
        '316L stainless vessel',
        cc('stainless_316l_vessel', '316L stainless vessel', 'pressure_vessel_function', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(p.totalVolumeL.toFixed(0)), 'L total'),
          mod('form', 'electropolished Ra <0.5 µm'),
          mod('regulatory', 'ASME BPE-2022 SF1'),
          mod('dimension', `${p.vesselDiameterM.toFixed(2)}×${p.vesselHeightM.toFixed(2)}`, 'm OD×TT'),
        ],
      ),
      word(
        'top_dished_head_word',
        'top dished head',
        cc('top_dished_head', 'top dished head', 'pressure_vessel_function', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('form', '2:1 semi-elliptical'),
          mod('regulatory', 'ASME BPVC VIII Div 1'),
        ],
      ),
      word(
        'bottom_dished_head_word',
        'bottom dished head',
        cc('bottom_dished_head', 'bottom dished head', 'pressure_vessel_function', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('form', '2:1 semi-elliptical with bottom drain'),
        ],
      ),
      word(
        'nozzle_sanitary_tri_clamp_word',
        'sanitary tri-clamp nozzle',
        cc('nozzle_sanitary_tri_clamp', 'sanitary tri-clamp nozzle', 'fluid_flow_state', 'stainless_steel_316l'),
        [
          mod('quantity', '×16'),
          mod('form', 'ASME BPE ferrule'),
          mod('regulatory', 'ASME BPE-SF1'),
        ],
      ),
      word(
        'sight_glass_sanitary_word',
        'sanitary sight glass',
        cc('sight_glass_sanitary', 'sanitary sight glass', 'optical_sensing_function', 'borosilicate_glass'),
        [
          mod('quantity', '×2'),
          mod('form', 'tri-clamp borosilicate'),
          mod('regulatory', 'EHEDG'),
        ],
      ),
    ],
  )

  return {
    module: 'stainless_vessel',
    module_brief: `${p.totalVolumeL.toFixed(0)} L 316L electropolished (Ra <0.5 µm) jacketed sanitary vessel (${p.vesselDiameterM.toFixed(2)} m OD × ${p.vesselHeightM.toFixed(2)} m TT) with 2:1 semi-elliptical dished heads, 16× ASME BPE tri-clamp nozzles and EHEDG sight glasses.`,
    overview_paragraph_en: '',
    derived_parameters: {
      working_volume_l: p.workingVolumeL,
      total_volume_l: p.totalVolumeL,
      vessel_diameter_m: p.vesselDiameterM,
      vessel_height_m: p.vesselHeightM,
      vessel_mass_kg: p.vesselMassKg,
    },
    allowed_radicals: [
      'pressure_vessel_function',
      'fluid_flow_state',
      'optical_sensing_function',
      'stainless_steel_316l',
      'borosilicate_glass',
    ],
    applicability_confidence: 'high',
    sub_modules: [vessel] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 2. jacket_cooling_heating
// ---------------------------------------------------------------------------

function emitJacketCoolingHeating(p: BioreactorParams): DesignModule {
  const jacket = makeSub(
    'dimple_jacket_loop',
    'dimple jacket loop',
    'controls',
    `${p.heatRemovalKw.toFixed(2)} kW dimple-jacket cooling/heating loop on chilled glycol`,
    [
      word(
        'jacket_heat_exchanger_word',
        'jacket heat exchanger',
        cc('jacket_heat_exchanger', 'jacket heat exchanger', 'thermal_transfer_function', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(p.heatRemovalKw.toFixed(2)), 'kW'),
          mod('form', 'welded dimple jacket'),
          mod('regulatory', 'ASME BPVC VIII Div 1'),
        ],
      ),
      word(
        'chilled_glycol_loop_word',
        'chilled glycol loop',
        cc('chilled_glycol_loop', 'chilled glycol loop', 'fluid_flow_state', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('form', '30% propylene glycol/water'),
          mod('dimension', '-10 to +90', '°C'),
        ],
      ),
      word(
        'temperature_control_unit_word',
        'temperature control unit',
        cc('temperature_control_unit', 'temperature control unit', 'thermal_transfer_function', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('form', 'Lauda Integral T XT / Huber Unistat'),
          mod('capacity', String(Math.max(20, Math.ceil(p.heatRemovalKw * 1.2))), 'kW'),
        ],
      ),
      word(
        'circulation_pump_jacket_word',
        'jacket circulation pump',
        cc('circulation_pump_jacket', 'jacket circulation pump', 'fluid_flow_state', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('form', 'Grundfos TPE'),
          mod('capacity', String(Math.round(p.workingVolumeL * 0.10)), 'L/min'),
        ],
      ),
      word(
        'electric_heating_element_word',
        'electric heating element',
        cc('electric_heating_element', 'electric heating element', 'thermal_transfer_function', 'incoloy'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(Math.max(5, Math.ceil(p.heatRemovalKw * 0.5))), 'kW'),
          mod('form', 'Incoloy 800 immersion'),
        ],
      ),
    ],
  )

  return {
    module: 'jacket_cooling_heating',
    module_brief: `Welded dimple-jacket loop on a Lauda Integral T XT / Huber Unistat ${Math.max(20, Math.ceil(p.heatRemovalKw * 1.2))} kW TCU, 30% propylene-glycol coolant (-10 to +90 °C) circulated by Grundfos TPE pump (${Math.round(p.workingVolumeL * 0.10)} L/min), Incoloy 800 immersion heater for SIP at 121 °C.`,
    overview_paragraph_en: '',
    derived_parameters: {
      heat_removal_kw: p.heatRemovalKw,
      glycol_loop_min_c: -10,
      glycol_loop_max_c: 90,
    },
    allowed_radicals: [
      'thermal_transfer_function',
      'fluid_flow_state',
      'stainless_steel_316l',
      'incoloy',
    ],
    applicability_confidence: 'high',
    sub_modules: [jacket] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 3. impeller_drive
// ---------------------------------------------------------------------------

function emitImpellerDrive(p: BioreactorParams): DesignModule {
  const drive = makeSub(
    'agitator_drive_assembly',
    'agitator drive assembly',
    'mixes',
    `${p.agitatorPowerKw.toFixed(2)} kW top-entry agitator with ${p.impellerCount} Rushton/Maxblend impellers (${p.agitationPowerPerLW.toFixed(1)} W/L)`,
    [
      word(
        'agitator_motor_assembly_word',
        'agitator motor assembly',
        cc('agitator_motor_assembly', 'agitator motor assembly', 'electric_motor_function', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(p.agitatorPowerKw.toFixed(2)), 'kW'),
          mod('form', 'top-entry direct-drive VFD'),
          mod('regulatory', 'EN 60204-1'),
        ],
      ),
      word(
        'mechanical_seal_double_word',
        'double mechanical seal',
        cc('mechanical_seal_double', 'double mechanical seal', 'pressure_vessel_function', 'silicon_carbide'),
        [
          mod('quantity', '×1'),
          mod('form', 'John Crane 5840 SiC/SiC'),
          mod('regulatory', 'API 682 Plan 53A'),
        ],
      ),
      word(
        'rushton_impeller_word',
        'Rushton impeller',
        cc('rushton_impeller', 'Rushton impeller', 'mechanical_actuation_function', 'stainless_steel_316l'),
        [
          mod('quantity', fmtQty(p.impellerCount)),
          mod('form', '6-blade D/3 disc turbine'),
          mod('dimension', (p.vesselDiameterM * 1000 / 3).toFixed(0), 'mm OD'),
        ],
      ),
      word(
        'baffle_set_word',
        'wall baffle set',
        cc('baffle_set', 'wall baffle set', 'fluid_flow_state', 'stainless_steel_316l'),
        [
          mod('quantity', '×4'),
          mod('form', 'T/10 standard 4-baffle'),
        ],
      ),
      word(
        'agitator_shaft_word',
        'agitator shaft',
        cc('agitator_shaft', 'agitator shaft', 'mechanical_actuation_function', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('form', 'solid 316L'),
          mod('dimension', (p.vesselDiameterM * 1000 / 12).toFixed(0), 'mm OD'),
        ],
      ),
    ],
  )

  return {
    module: 'impeller_drive',
    module_brief: `${p.agitatorPowerKw.toFixed(2)} kW top-entry direct-drive VFD agitator (${p.agitationPowerPerLW.toFixed(1)} W/L), John Crane 5840 SiC/SiC double mechanical seal on API 682 Plan 53A, ${p.impellerCount}× Rushton D/3 disc turbines with 4-baffle wall arrangement.`,
    overview_paragraph_en: '',
    derived_parameters: {
      agitator_power_kw: p.agitatorPowerKw,
      agitation_power_per_l_w: p.agitationPowerPerLW,
      impeller_count: p.impellerCount,
    },
    allowed_radicals: [
      'electric_motor_function',
      'pressure_vessel_function',
      'mechanical_actuation_function',
      'fluid_flow_state',
      'stainless_steel_316l',
      'silicon_carbide',
    ],
    applicability_confidence: 'high',
    sub_modules: [drive] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 4. sparger_aeration
// ---------------------------------------------------------------------------

function emitSpargerAeration(p: BioreactorParams): DesignModule {
  const sparger = makeSub(
    'ring_sparger',
    'ring sparger',
    'aerates',
    `${p.spargerFlowLMin.toFixed(1)} L/min @ ${p.vvm.toFixed(2)} vvm delivering kLa ${p.klaPerH.toFixed(0)} 1/h`,
    [
      word(
        'aeration_sparger_system_word',
        'aeration sparger system',
        cc('aeration_sparger_system', 'aeration sparger system', 'fluid_flow_state', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('form', 'ring sparger 1 mm holes'),
          mod('regulatory', 'ASME BPE-SF1'),
        ],
      ),
      word(
        'mass_flow_controller_air_word',
        'air mass flow controller',
        cc('mass_flow_controller_air', 'air mass flow controller', 'fluid_flow_state', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('form', 'Bronkhorst EL-FLOW Select'),
          mod('capacity', String(p.spargerFlowLMin.toFixed(0)), 'SLM'),
        ],
      ),
      word(
        'sparger_inlet_filter_word',
        'sparger inlet 0.2 µm filter',
        cc('sparger_inlet_filter', 'sparger inlet 0.2 µm filter', 'filtration_separation_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Pall Emflon PFR'),
          mod('regulatory', 'HIMA / ASTM F838'),
        ],
      ),
      word(
        'rotameter_air_word',
        'air rotameter',
        cc('rotameter_air', 'air rotameter', 'fluid_flow_state', 'glass'),
        [
          mod('quantity', '×1'),
          mod('form', 'glass tube variable area'),
        ],
      ),
    ],
  )

  return {
    module: 'sparger_aeration',
    module_brief: `Ring sparger (1 mm holes) fed by Bronkhorst EL-FLOW Select MFC delivers ${p.spargerFlowLMin.toFixed(1)} L/min air at ${p.vvm.toFixed(2)} vvm through a Pall Emflon PFR 0.2 µm sterile filter; achieves kLa ${p.klaPerH.toFixed(0)} 1/h and OTR ${p.otrMmolLH.toFixed(0)} mmol/L/h.`,
    overview_paragraph_en: '',
    derived_parameters: {
      sparger_flow_l_min: p.spargerFlowLMin,
      vvm: p.vvm,
      kla_per_h: p.klaPerH,
      otr_mmol_l_h: p.otrMmolLH,
    },
    allowed_radicals: [
      'fluid_flow_state',
      'filtration_separation_function',
      'stainless_steel_316l',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [sparger] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 5. sample_ports
// ---------------------------------------------------------------------------

function emitSamplePorts(_p: BioreactorParams): DesignModule {
  const ports = makeSub(
    'aseptic_sample_ports',
    'aseptic sample ports',
    'samples',
    'sterile septa + automated sampling skid for at-line process control',
    [
      word(
        'aseptic_septum_port_word',
        'aseptic septum port',
        cc('aseptic_septum_port', 'aseptic septum port', 'fluid_flow_state', 'silicone_polymer'),
        [
          mod('quantity', '×3'),
          mod('form', 'Bioquate / Mettler steam-thru'),
          mod('regulatory', 'ASME BPE-SF1'),
        ],
      ),
      word(
        'sample_valve_diaphragm_word',
        'sample diaphragm valve',
        cc('sample_valve_diaphragm', 'sample diaphragm valve', 'fluid_flow_state', 'stainless_steel_316l'),
        [
          mod('quantity', '×3'),
          mod('form', 'GEMÜ 650 / ITT Pure-Flo'),
          mod('regulatory', 'ASME BPE-SD'),
        ],
      ),
      word(
        'auto_sampler_skid_word',
        'auto-sampler skid',
        cc('auto_sampler_skid', 'auto-sampler skid', 'fluid_flow_state', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('form', 'Trace Analytics / Bioengineering BioPAT'),
        ],
      ),
    ],
  )

  return {
    module: 'sample_ports',
    module_brief: 'Three Bioquate / Mettler steam-thru aseptic septum ports paired with GEMÜ 650 ASME BPE diaphragm valves and a Trace Analytics / BioPAT auto-sampler skid for at-line glucose/lactate/cell-density tracking.',
    overview_paragraph_en: '',
    derived_parameters: {
      sample_port_count: 3,
    },
    allowed_radicals: [
      'fluid_flow_state',
      'stainless_steel_316l',
      'silicone_polymer',
    ],
    applicability_confidence: 'high',
    sub_modules: [ports] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 6. pH_DO_temp_probes
// ---------------------------------------------------------------------------

function emitPHDOTempProbes(_p: BioreactorParams): DesignModule {
  const probes = makeSub(
    'inline_process_probes',
    'inline process probes',
    'monitors',
    'pH + DO + temperature on Mettler ISM + retractable housings',
    [
      word(
        'ph_probe_inline_word',
        'inline pH probe',
        cc('ph_probe_inline', 'inline pH probe', 'chemical_sensing_function', 'glass'),
        [
          mod('quantity', '×2'),
          mod('form', 'Mettler InPro 3253 / Hamilton EasyFerm'),
          mod('regulatory', 'PMC1-2'),
        ],
      ),
      word(
        'do_probe_optical_word',
        'optical DO probe',
        cc('do_probe_optical', 'optical DO probe', 'optical_sensing_function', 'glass'),
        [
          mod('quantity', '×1'),
          mod('form', 'Hamilton VisiFerm DO Arc'),
          mod('regulatory', 'GMP-compliant'),
        ],
      ),
      word(
        'temperature_pt100_probe_word',
        'PT100 temperature probe',
        cc('temperature_pt100_probe', 'PT100 temperature probe', 'thermal_sensing_function', 'platinum'),
        [
          mod('quantity', '×2'),
          mod('form', '4-wire Class A in thermowell'),
          mod('regulatory', 'DIN EN 60751 Class A'),
        ],
      ),
      word(
        'retractable_housing_word',
        'retractable probe housing',
        cc('retractable_housing', 'retractable probe housing', 'pressure_vessel_function', 'stainless_steel_316l'),
        [
          mod('quantity', '×3'),
          mod('form', 'Knick Ceramat WA 153'),
          mod('regulatory', 'ASME BPE-SF1'),
        ],
      ),
      word(
        'co2_probe_inline_word',
        'inline CO₂ probe',
        cc('co2_probe_inline', 'inline CO₂ probe', 'chemical_sensing_function', 'silicon'),
        [
          mod('quantity', '×1'),
          mod('form', 'Mettler InPro 5000i'),
        ],
      ),
    ],
  )

  return {
    module: 'pH_DO_temp_probes',
    module_brief: 'Mettler InPro 3253 / Hamilton EasyFerm pH probes (×2), Hamilton VisiFerm DO Arc optical probe, two PT100 Class A temperature probes in thermowells, Mettler InPro 5000i CO₂ probe, all in Knick Ceramat WA 153 retractable housings.',
    overview_paragraph_en: '',
    derived_parameters: {
      ph_probe_count: 2,
      do_probe_count: 1,
      temp_probe_count: 2,
      co2_probe_count: 1,
    },
    allowed_radicals: [
      'chemical_sensing_function',
      'optical_sensing_function',
      'thermal_sensing_function',
      'pressure_vessel_function',
      'glass',
      'platinum',
    ],
    applicability_confidence: 'high',
    sub_modules: [probes] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 7. dosing_pumps
// ---------------------------------------------------------------------------

function emitDosingPumps(p: BioreactorParams): DesignModule {
  const dosing = makeSub(
    'dosing_pump_skid',
    'dosing pump skid',
    'doses',
    `${p.phChannels}-channel peristaltic acid/base + antifoam + feed + glucose dosing`,
    [
      word(
        'peristaltic_pump_acid_base_word',
        'peristaltic acid/base pump',
        cc('peristaltic_pump_acid_base', 'peristaltic acid/base pump', 'fluid_flow_state', 'polymer_elastomer'),
        [
          mod('quantity', fmtQty(p.phChannels)),
          mod('form', 'Watson-Marlow 530S'),
          mod('regulatory', 'cGMP / FDA 21 CFR 211'),
        ],
      ),
      word(
        'antifoam_dose_pump_word',
        'antifoam dose pump',
        cc('antifoam_dose_pump', 'antifoam dose pump', 'fluid_flow_state', 'polymer_elastomer'),
        [
          mod('quantity', '×1'),
          mod('form', 'Watson-Marlow 120S'),
          mod('capacity', '20', 'mL/min'),
        ],
      ),
      word(
        'glucose_feed_pump_word',
        'glucose feed pump',
        cc('glucose_feed_pump', 'glucose feed pump', 'fluid_flow_state', 'polymer_elastomer'),
        [
          mod('quantity', '×1'),
          mod('form', 'Watson-Marlow 730En'),
          mod('capacity', '200', 'mL/min'),
        ],
      ),
      word(
        'media_bag_dispenser_word',
        'media bag dispenser',
        cc('media_bag_dispenser', 'media bag dispenser', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×4'),
          mod('form', 'gamma-sterilised single-use bag'),
          mod('regulatory', 'USP <87>/<88> Class VI'),
        ],
      ),
    ],
  )

  return {
    module: 'dosing_pumps',
    module_brief: `${p.phChannels}-channel Watson-Marlow 530S peristaltic pH pumps + Watson-Marlow 120S antifoam pump + 730En glucose feed pump dispensing from gamma-sterilised single-use bags (USP <87>/<88> Class VI).`,
    overview_paragraph_en: '',
    derived_parameters: {
      ph_channels: p.phChannels,
      pump_count: p.phChannels + 2,
    },
    allowed_radicals: [
      'fluid_flow_state',
      'polymer_elastomer',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [dosing] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 8. gas_supply_O2_N2_CO2
// ---------------------------------------------------------------------------

function emitGasSupply(_p: BioreactorParams): DesignModule {
  const gas = makeSub(
    'gas_mixing_skid',
    'gas mixing skid',
    'supplies',
    '4-gas mass-flow-controlled mix (air/O₂/N₂/CO₂) to headspace + sparger',
    [
      word(
        'mfc_oxygen_word',
        'oxygen MFC',
        cc('mfc_oxygen', 'oxygen MFC', 'fluid_flow_state', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('form', 'Bronkhorst EL-FLOW Prestige'),
          mod('regulatory', 'cGMP-traceable'),
        ],
      ),
      word(
        'mfc_nitrogen_word',
        'nitrogen MFC',
        cc('mfc_nitrogen', 'nitrogen MFC', 'fluid_flow_state', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('form', 'Bronkhorst EL-FLOW Prestige'),
        ],
      ),
      word(
        'mfc_co2_word',
        'CO₂ MFC',
        cc('mfc_co2', 'CO₂ MFC', 'fluid_flow_state', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('form', 'Bronkhorst EL-FLOW Select'),
        ],
      ),
      word(
        'gas_premix_block_word',
        'gas premix block',
        cc('gas_premix_block', 'gas premix block', 'fluid_flow_state', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('form', 'orbital-welded'),
          mod('regulatory', 'ASME BPE-SF1'),
        ],
      ),
      word(
        'gas_outlet_condenser_word',
        'gas outlet condenser',
        cc('gas_outlet_condenser', 'gas outlet condenser', 'thermal_transfer_function', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('form', 'shell-and-tube'),
          mod('capacity', '4', '°C cooling'),
        ],
      ),
    ],
  )

  return {
    module: 'gas_supply_O2_N2_CO2',
    module_brief: '4-gas mass-flow-controlled mix (air/O₂/N₂/CO₂) on Bronkhorst EL-FLOW Prestige and Select MFCs through an orbital-welded premix block, with shell-and-tube gas-outlet condenser cooling exhaust to 4 °C.',
    overview_paragraph_en: '',
    derived_parameters: {
      gas_channel_count: 4,
    },
    allowed_radicals: [
      'fluid_flow_state',
      'thermal_transfer_function',
      'stainless_steel_316l',
    ],
    applicability_confidence: 'high',
    sub_modules: [gas] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 9. control_DCS_PLC
// ---------------------------------------------------------------------------

function emitControlDcsPlc(p: BioreactorParams): DesignModule {
  const ctrl = makeSub(
    'process_control_system',
    'process control system',
    'orchestrates',
    `${p.isProduction ? 'DCS-class' : 'PLC-class'} control platform with 21 CFR Part 11 audit trail`,
    [
      word(
        'pcs_controller_word',
        'process control system controller',
        cc('pcs_controller', 'process control system controller', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', p.isProduction ? 'Siemens SIMATIC PCS 7' : 'AB ControlLogix L7 / Sartorius BioPAT MFCS'),
          mod('regulatory', '21 CFR Part 11 + GAMP 5'),
        ],
      ),
      word(
        'mettler_ism_module_word',
        'Mettler ISM transmitter',
        cc('mettler_ism_module', 'Mettler ISM transmitter', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×4'),
          mod('form', 'M400 ISM 2-wire'),
        ],
      ),
      word(
        'historian_database_word',
        'historian database',
        cc('historian_database', 'historian database', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'OSIsoft PI System / AVEVA Historian'),
          mod('regulatory', '21 CFR Part 11'),
        ],
      ),
      word(
        'cip_sip_recipe_module_word',
        'CIP/SIP recipe module',
        cc('cip_sip_recipe_module', 'CIP/SIP recipe module', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'ISA-88 batch + S88 recipes'),
        ],
      ),
      word(
        'profibus_io_word',
        'Profibus I/O bus',
        cc('profibus_io', 'Profibus I/O bus', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'IEC 61158'),
        ],
      ),
    ],
  )

  return {
    module: 'control_DCS_PLC',
    module_brief: `${p.isProduction ? 'Siemens SIMATIC PCS 7 DCS' : 'AB ControlLogix L7 / Sartorius BioPAT MFCS'} hosts batch recipes (ISA-88), Mettler M400 ISM transmitters and OSIsoft PI System historian — all GAMP 5 / 21 CFR Part 11 compliant.`,
    overview_paragraph_en: '',
    derived_parameters: {
      is_dcs: p.isProduction ? 1 : 0,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'electrical_conducting_function',
      'copper',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [ctrl] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 10. harvest_drain_outlet
// ---------------------------------------------------------------------------

function emitHarvestDrainOutlet(p: BioreactorParams): DesignModule {
  const harvest = makeSub(
    'harvest_drain_assembly',
    'harvest drain assembly',
    'discharges',
    'bottom drain + harvest pump + biohazard waste line',
    [
      word(
        'bottom_drain_valve_word',
        'bottom drain valve',
        cc('bottom_drain_valve', 'bottom drain valve', 'fluid_flow_state', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('form', 'GEMÜ 660 zero-deadleg diaphragm'),
          mod('regulatory', 'ASME BPE-SD'),
        ],
      ),
      word(
        'harvest_pump_lobe_word',
        'lobe harvest pump',
        cc('harvest_pump_lobe', 'lobe harvest pump', 'fluid_flow_state', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('form', 'Alfa Laval SRU sanitary lobe'),
          mod('capacity', String(Math.round(p.workingVolumeL * 0.5)), 'L/h'),
        ],
      ),
      word(
        'cip_spray_ball_word',
        'CIP spray ball',
        cc('cip_spray_ball', 'CIP spray ball', 'fluid_flow_state', 'stainless_steel_316l'),
        [
          mod('quantity', '×2'),
          mod('form', 'Spraying Systems TankJet 28500'),
          mod('regulatory', 'ASME BPE-SF1'),
        ],
      ),
      word(
        'biohazard_kill_loop_word',
        'biohazard kill-loop',
        cc('biohazard_kill_loop', 'biohazard kill-loop', 'thermal_transfer_function', 'stainless_steel_316l'),
        [
          mod('quantity', '×1'),
          mod('form', 'continuous flow steam @ 138 °C, 12 s'),
          mod('regulatory', 'WHO BL2 / EU 2009/41/EC'),
        ],
      ),
    ],
  )

  return {
    module: 'harvest_drain_outlet',
    module_brief: `GEMÜ 660 zero-deadleg diaphragm bottom-drain valve, Alfa Laval SRU sanitary lobe harvest pump (${Math.round(p.workingVolumeL * 0.5)} L/h), dual TankJet 28500 CIP spray balls and a 138 °C / 12 s continuous-flow biohazard kill-loop (WHO BL2 / EU 2009/41/EC).`,
    overview_paragraph_en: '',
    derived_parameters: {
      harvest_rate_l_h: p.workingVolumeL * 0.5,
    },
    allowed_radicals: [
      'fluid_flow_state',
      'thermal_transfer_function',
      'stainless_steel_316l',
    ],
    applicability_confidence: 'high',
    sub_modules: [harvest] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 11. downstream_filtration
// ---------------------------------------------------------------------------

function emitDownstreamFiltration(_p: BioreactorParams): DesignModule {
  const dsp = makeSub(
    'downstream_filtration_train',
    'downstream filtration train',
    'separates',
    'cell-removal + virus-clearance + sterile-final filter train',
    [
      word(
        'depth_filter_zeta_word',
        'depth filter (Zeta+)',
        cc('depth_filter_zeta', 'depth filter Zeta Plus', 'filtration_separation_function', 'cellulose'),
        [
          mod('quantity', '×1'),
          mod('form', '3M Zeta Plus 90SP'),
          mod('regulatory', 'USP <87>'),
        ],
      ),
      word(
        'tff_membrane_cassette_word',
        'TFF membrane cassette',
        cc('tff_membrane_cassette', 'tangential flow filtration cassette', 'filtration_separation_function', 'cellulose'),
        [
          mod('quantity', '×4'),
          mod('form', 'Pall T-Series PES 50 kDa'),
          mod('regulatory', 'cGMP'),
        ],
      ),
      word(
        'virus_filter_planova_word',
        'Planova 20N virus filter',
        cc('virus_filter_planova', 'Planova 20N virus filter', 'filtration_separation_function', 'cellulose'),
        [
          mod('quantity', '×1'),
          mod('form', 'Asahi Planova 20N hollow-fibre'),
          mod('regulatory', 'ICH Q5A'),
        ],
      ),
      word(
        'final_sterile_filter_word',
        'final sterile filter',
        cc('final_sterile_filter', 'final sterile filter', 'filtration_separation_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Sartopore 2 0.1 µm PES'),
          mod('regulatory', 'HIMA / ASTM F838'),
        ],
      ),
      // Macro-aligned aggregate (BoM macro: biosafety_filter_assembly — biosafety containment vent + sparger filter assembly).
      word(
        'biosafety_filter_word',
        'biosafety filter assembly',
        cc('biosafety_filter', 'biosafety containment filter assembly', 'filtration_separation_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', '0.2 µm hydrophobic vent + sparger biosafety filters'),
          mod('regulatory', 'WHO BL2 / EU 2009/41/EC containment'),
        ],
      ),
      word(
        'chromatography_column_word',
        'chromatography column',
        cc('chromatography_column', 'chromatography column', 'filtration_separation_function', 'borosilicate_glass'),
        [
          mod('quantity', '×1'),
          mod('form', 'Cytiva AxiChrom 100/500'),
        ],
      ),
    ],
  )

  return {
    module: 'downstream_filtration',
    module_brief: '3M Zeta Plus 90SP depth filter, Pall T-Series PES 50 kDa TFF cassettes (×4), Asahi Planova 20N virus filter (ICH Q5A), Sartopore 2 0.1 µm final sterile filter, Cytiva AxiChrom 100/500 chromatography column.',
    overview_paragraph_en: '',
    derived_parameters: {
      filter_stages: 4,
    },
    allowed_radicals: [
      'filtration_separation_function',
      'cellulose',
      'polymer_thermoplastic',
      'borosilicate_glass',
    ],
    applicability_confidence: 'high',
    sub_modules: [dsp] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 12. regulatory_FDA_cGMP
// ---------------------------------------------------------------------------

function emitRegulatoryFdaCgmp(p: BioreactorParams): DesignModule {
  const reg = makeSub(
    'cgmp_compliance_documentation',
    'cGMP compliance documentation',
    'documents',
    'FDA 21 CFR 211/600 + EMA Annex 1 + ASME BPE',
    [
      word(
        'cgmp_qa_label_word',
        'cGMP QA label',
        cc('cgmp_qa_label', 'cGMP QA label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'FDA 21 CFR 211 cGMP'),
        ],
      ),
      word(
        'eu_gmp_annex1_label_word',
        'EU GMP Annex 1 label',
        cc('eu_gmp_annex1_label', 'EU GMP Annex 1 label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'EU GMP Annex 1 (2022)'),
        ],
      ),
      word(
        'asme_bpe_certificate_word',
        'ASME BPE certificate',
        cc('asme_bpe_certificate', 'ASME BPE certificate', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'ASME BPE-2022'),
        ],
      ),
      word(
        'usp_class_vi_certificate_word',
        'USP Class VI certificate',
        cc('usp_class_vi_certificate', 'USP Class VI certificate', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'USP <87>/<88> Class VI'),
        ],
      ),
      word(
        'gamp5_validation_pack_word',
        'GAMP 5 validation pack',
        cc('gamp5_validation_pack', 'GAMP 5 validation pack', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', `ISPE GAMP 5 Cat ${p.isProduction ? '4-5' : '3'}`),
        ],
      ),
    ],
  )

  return {
    module: 'regulatory_FDA_cGMP',
    module_brief: `FDA 21 CFR 211 cGMP, EU GMP Annex 1 (2022 revision), ASME BPE-2022 vessel certificate, USP <87>/<88> Class VI biocompatibility, and ISPE GAMP 5 Cat ${p.isProduction ? '4-5' : '3'} computerised-system validation package.`,
    overview_paragraph_en: '',
    derived_parameters: {
      gamp_category: p.isProduction ? 5 : 3,
    },
    allowed_radicals: [
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [reg] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// CROSS-MODULE GRAMMAR LINKS
// ---------------------------------------------------------------------------

function emitGrammarLinks(p: BioreactorParams): unknown[] {
  return [
    { from_module: 'jacket_cooling_heating', to_module: 'stainless_vessel', mechanism: 'thermal_jacket', type: 'mutual', detail: `${p.heatRemovalKw.toFixed(2)} kW dimple jacket` },
    { from_module: 'impeller_drive', to_module: 'stainless_vessel', mechanism: 'mechanical_mount', type: 'directional', detail: 'top-entry shaft through dished head' },
    { from_module: 'sparger_aeration', to_module: 'stainless_vessel', mechanism: 'fluid_path', type: 'directional', detail: 'ring sparger at vessel bottom' },
    { from_module: 'gas_supply_O2_N2_CO2', to_module: 'sparger_aeration', mechanism: 'gas_path', type: 'directional', detail: 'MFC premix → sparger sterile filter' },
    { from_module: 'pH_DO_temp_probes', to_module: 'control_DCS_PLC', mechanism: 'ism_signal', type: 'directional', detail: 'Mettler ISM digital protocol' },
    { from_module: 'control_DCS_PLC', to_module: 'dosing_pumps', mechanism: 'plc_io', type: 'directional', detail: 'PID pH + glucose feed-forward control' },
    { from_module: 'control_DCS_PLC', to_module: 'impeller_drive', mechanism: 'vfd_bus', type: 'directional', detail: 'rpm setpoint via Profibus' },
    { from_module: 'control_DCS_PLC', to_module: 'jacket_cooling_heating', mechanism: 'plc_io', type: 'mutual', detail: 'temp setpoint + jacket loop feedback' },
    { from_module: 'control_DCS_PLC', to_module: 'gas_supply_O2_N2_CO2', mechanism: 'plc_io', type: 'mutual', detail: 'cascade DO loop sets O₂ %, CO₂ % for pH' },
    { from_module: 'sample_ports', to_module: 'stainless_vessel', mechanism: 'mechanical_mount', type: 'directional', detail: 'tri-clamp nozzle ports' },
    { from_module: 'harvest_drain_outlet', to_module: 'downstream_filtration', mechanism: 'fluid_path', type: 'directional', detail: 'lobe pump → depth → TFF → sterile filter' },
    { from_module: 'regulatory_FDA_cGMP', to_module: 'control_DCS_PLC', mechanism: 'compliance', type: 'directional', detail: '21 CFR Part 11 audit trail + e-sig' },
    { from_module: 'regulatory_FDA_cGMP', to_module: 'stainless_vessel', mechanism: 'compliance', type: 'directional', detail: 'ASME BPE + USP Class VI certificates attached to vessel serial' },
  ]
}

// ---------------------------------------------------------------------------
// BRIEF OVERVIEW PROSE
// ---------------------------------------------------------------------------

function emitBriefOverviewProse(p: BioreactorParams): DesignJSON['brief_overview_prose'] {
  return {
    overview_and_context: '',
    mission_statement: `Deliver a ${p.workingVolumeL.toFixed(0)} L working / ${p.totalVolumeL.toFixed(0)} L total 316L jacketed stirred-tank bioreactor (${p.vesselDiameterM.toFixed(2)} m × ${p.vesselHeightM.toFixed(2)} m) with ${p.agitatorPowerKw.toFixed(2)} kW agitator delivering kLa ${p.klaPerH.toFixed(0)} 1/h, certified to FDA 21 CFR 211 cGMP + EU GMP Annex 1 + ASME BPE-2022.`,
    target_customers: '',
    why_now: '',
  }
}

// ---------------------------------------------------------------------------
// PUBLIC EMITTER ENTRY POINT
// ---------------------------------------------------------------------------

export function emitBioreactorDesign(
  contract: ContractInProgress,
  _brief: ParsedConstraints,
  _envelope: BriefEnvelope,
): DesignJSON {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitStainlessVessel(p),
    emitJacketCoolingHeating(p),
    emitImpellerDrive(p),
    emitSpargerAeration(p),
    emitSamplePorts(p),
    emitPHDOTempProbes(p),
    emitDosingPumps(p),
    emitGasSupply(p),
    emitControlDcsPlc(p),
    emitHarvestDrainOutlet(p),
    emitDownstreamFiltration(p),
    emitRegulatoryFdaCgmp(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: 'All 12 canonical bioreactor modules apply to the 100 L pilot to 50 000 L production envelope.',
    brief_overview_prose: emitBriefOverviewProse(p),
  }
}

registerAssembler('bioreactor', emitBioreactorDesign)
registerAssembler('bioreactor/pilot', emitBioreactorDesign)
registerAssembler('bioreactor/production', emitBioreactorDesign)
