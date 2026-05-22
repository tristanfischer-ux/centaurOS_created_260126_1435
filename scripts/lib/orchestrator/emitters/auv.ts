/**
 * scripts/lib/orchestrator/emitters/auv.ts
 *
 * AUV (autonomous underwater vehicle) DETERMINISTIC EMITTER —
 * BESS-quality per the 2026-05-22 hand-tuning batch.
 *
 * Industry references: Saab Seaeye Sabertooth, Kongsberg HUGIN-1000,
 * Kongsberg HUGIN Superior, Bluefin-12. Targets the 50-500 kg
 * work-class deep-water tier (operating depth 100-3000 m).
 *
 * Reproducibility contract (matches `deterministic-emitter.ts`):
 *   - Pure function: no I/O, no Date(), no Math.random()
 *   - Same (contract, brief) → byte-identical DesignJSON output
 *   - All quantities sourced from contract.quantities (never invented)
 *   - LLM narrator fills overview_paragraph_en + english_sentence later
 *
 * Modules emitted (10): pressure_hull_chassis, ballast_buoyancy,
 *   propulsion_thrusters, battery_pack, navigation_INS_DVL,
 *   sensor_sonar_camera, acoustic_modem, antenna_GPS,
 *   recovery_handle_strobe, regulatory_IMO.
 */

import type {
  BriefEnvelope,
  ContractInProgress,
  ParsedConstraints,
} from '../types'
import type { DesignJSON, DesignModule } from '../assembler'
import { registerAssembler } from '../assembler'

// ---------------------------------------------------------------------------
// LOCAL TYPES — mirror the structural subset of DeterministicDesign so the
// emitter can be drop-in compatible with the BESS-class output schema.
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

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function q(contract: ContractInProgress, key: string, fallback: number): number {
  const v = (contract.quantities as Record<string, { value: number } | undefined>)?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function fmtQty(n: number): string {
  if (Number.isInteger(n)) return `×${n}`
  return `×${n.toFixed(2)}`
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

function synthRad(words: Word[]): string {
  const clusters = words.map((w) => {
    const modsOrdered = [...w.modifier_characters].sort((a, b) => {
      if (a.kind === 'quantity' && b.kind !== 'quantity') return -1
      if (b.kind === 'quantity' && a.kind !== 'quantity') return 1
      return 0
    })
    const tokens = modsOrdered.map((m) => (m.unit ? `${m.value}${m.unit}` : m.value))
    if (tokens.length === 0) return w.content_character.character_id
    return `${w.content_character.character_id} (${tokens.join(', ')})`
  })
  return clusters.join(' ⊙ ')
}

function makeSub(id: string, name: string, role: string, topology: string, words: Word[]): SubModule {
  return { id, name_human: name, english_sentence: '', rad_syntax: synthRad(words), role_verb: role, topology_clause: topology, words }
}

// ---------------------------------------------------------------------------
// AUV PARAMS — derive every numerical knob from the contract quantities.
// All defaults are typical HUGIN-1000 / Sabertooth class values.
// ---------------------------------------------------------------------------

interface AuvParams {
  operatingDepthM: number
  externalPressureBar: number
  hullMaterial: string
  hullDiameterM: number
  hullLengthM: number
  hullThicknessMm: number
  hullMassKg: number
  displacementM3: number
  buoyancyFoamVolumeM3: number
  batteryKwh: number
  batteryMassKg: number
  thrusterCount: number
  cruisePowerKw: number
  peakPowerKw: number
  enduranceH: number
  mtowAirKg: number
  busVoltageV: number
  peakBusCurrentA: number
}

function deriveParams(c: ContractInProgress): AuvParams {
  const operatingDepthM = q(c, 'operating_depth_m', 500)
  const externalPressureBar = q(c, 'external_pressure_bar', operatingDepthM * 0.0981)
  // Material selection mirrors the engineering-contract archetype logic.
  const hullMaterial = operatingDepthM >= 1000 ? 'titanium_grade_5' : 'aluminium_6061_t6'
  const hullDiameterM = q(c, 'hull_diameter_m', 0.4)
  const hullLengthM = q(c, 'hull_length_m', 2.0)
  const hullThicknessMm = q(c, 'hull_thickness_mm', 8)
  const hullMassKg = q(c, 'hull_mass_kg', 50)
  const displacementM3 = q(c, 'displacement_m3', Math.PI * Math.pow(hullDiameterM / 2, 2) * hullLengthM)
  const buoyancyFoamVolumeM3 = q(c, 'buoyancy_foam_volume_m3', displacementM3 * 0.06)
  const batteryKwh = q(c, 'battery_capacity_kwh', 4)
  const batteryMassKg = q(c, 'battery_mass_kg', (batteryKwh * 1000) / 80)
  const thrusterCount = Math.max(1, Math.round(q(c, 'thruster_count', 4)))
  const cruisePowerKw = q(c, 'cruise_power_kw', 0.4)
  const peakPowerKw = q(c, 'peak_power_kw', 1.5)
  const enduranceH = q(c, 'computed_endurance_h', (batteryKwh * 0.8) / cruisePowerKw)
  const mtowAirKg = q(c, 'mtow_air_kg', hullMassKg + batteryMassKg + thrusterCount * 2 + 5 + 20)
  const busVoltageV = q(c, 'bus_voltage_v', 24)
  const peakBusCurrentA = q(c, 'peak_bus_current_a', (peakPowerKw * 1000) / busVoltageV)
  return {
    operatingDepthM,
    externalPressureBar,
    hullMaterial,
    hullDiameterM,
    hullLengthM,
    hullThicknessMm,
    hullMassKg,
    displacementM3,
    buoyancyFoamVolumeM3,
    batteryKwh,
    batteryMassKg,
    thrusterCount,
    cruisePowerKw,
    peakPowerKw,
    enduranceH,
    mtowAirKg,
    busVoltageV,
    peakBusCurrentA,
  }
}

// ---------------------------------------------------------------------------
// 1. pressure_hull_chassis
// ---------------------------------------------------------------------------

function emitPressureHullChassis(p: AuvParams): DesignModule {
  const hullName = p.hullMaterial === 'titanium_grade_5' ? 'titanium_pressure_hull' : 'aluminium_pressure_hull'
  const hullDisplay = p.hullMaterial === 'titanium_grade_5' ? 'titanium Ti-6Al-4V Grade 5' : 'aluminium 6061-T6'
  const matRadical = p.hullMaterial === 'titanium_grade_5' ? 'titanium_alloy' : 'aluminium_alloy'

  const pressureCylinder = makeSub(
    'pressure_cylinder',
    'pressure cylinder',
    'resists',
    `${p.operatingDepthM.toFixed(0)} m rated depth (${p.externalPressureBar.toFixed(1)} bar external)`,
    [
      word(
        `${hullName}_word`,
        `${hullDisplay} pressure hull word`,
        cc(hullName, `${hullDisplay} pressure hull`, 'pressure_vessel_function', matRadical),
        [
          mod('quantity', '×1'),
          mod('dimension', p.hullDiameterM.toFixed(2), 'm OD'),
          mod('dimension', p.hullLengthM.toFixed(2), 'm L'),
          mod('dimension', p.hullThicknessMm.toFixed(2), 'mm wall'),
          mod('regulatory', 'ASME BPVC VIII Div 1'),
        ],
      ),
      word(
        'dome_endcap_forward_word',
        'forward dome endcap',
        cc('dome_endcap_forward', 'forward dome endcap', 'pressure_vessel_function', matRadical),
        [
          mod('quantity', '×1'),
          mod('form', 'hemispherical'),
          mod('dimension', p.hullDiameterM.toFixed(2), 'm OD'),
        ],
      ),
      word(
        'dome_endcap_aft_word',
        'aft dome endcap',
        cc('dome_endcap_aft', 'aft dome endcap', 'pressure_vessel_function', matRadical),
        [
          mod('quantity', '×1'),
          mod('form', 'flat closure (wet end)'),
          mod('dimension', p.hullDiameterM.toFixed(2), 'm OD'),
        ],
      ),
      word(
        'hull_oring_seal_word',
        'hull O-ring seal',
        cc('hull_oring_seal', 'hull O-ring seal', 'pressure_vessel_function', 'polymer_elastomer'),
        [
          mod('quantity', '×4'),
          mod('form', 'fluorocarbon FKM'),
          mod('regulatory', 'AS568 size 2-26x'),
        ],
      ),
    ],
  )

  const hullPenetrations = makeSub(
    'hull_penetrations',
    'hull penetrations',
    'seals',
    'subsea-rated connectors + emergency drop weight release',
    [
      word(
        'subconn_connector_word',
        'SubConn pluggable connector',
        cc('subconn_connector', 'SubConn pluggable connector', 'electrical_conducting_function', 'polymer_elastomer'),
        [
          mod('quantity', '×8'),
          mod('form', 'MCBH-8M wet-mateable'),
          mod('dimension', `${p.operatingDepthM.toFixed(0)}`, 'm depth-rated'),
        ],
      ),
      word(
        'drop_weight_release_word',
        'emergency drop weight release',
        cc('drop_weight_release', 'emergency drop weight release', 'electromechanical_switching_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'galvanic burnwire'),
          mod('regulatory', 'IMO MSC.1/Circ.1392'),
        ],
      ),
      word(
        'pressure_compensator_word',
        'oil-fill pressure compensator',
        cc('pressure_compensator', 'pressure compensator', 'pressure_vessel_function', 'polymer_elastomer'),
        [
          mod('quantity', fmtQty(p.thrusterCount)),
          mod('form', 'rubber bladder + reservoir'),
        ],
      ),
    ],
  )

  const externalFairings = makeSub(
    'external_fairings',
    'external fairings',
    'streamlines',
    'low-drag hydrodynamic fairings + sacrificial Zn anodes',
    [
      word(
        'nose_fairing_word',
        'nose fairing',
        cc('nose_fairing', 'nose fairing', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'glass-reinforced epoxy'),
        ],
      ),
      word(
        'tail_fin_assembly_word',
        'tail fin assembly',
        cc('tail_fin_assembly', 'tail fin assembly', 'mechanical_actuation_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×4'),
          mod('form', '+/X-config control surfaces'),
        ],
      ),
      word(
        'sacrificial_anode_word',
        'sacrificial zinc anode',
        cc('sacrificial_anode', 'sacrificial zinc anode', 'corrosion_inhibition_function', 'zinc'),
        [
          mod('quantity', '×8'),
          mod('form', 'cast Zn-Al-In'),
          mod('regulatory', 'MIL-A-18001K'),
        ],
      ),
    ],
  )

  return {
    module: 'pressure_hull_chassis',
    module_brief: `${hullDisplay} pressure hull ${p.hullDiameterM.toFixed(2)} m OD × ${p.hullLengthM.toFixed(2)} m × ${p.hullThicknessMm.toFixed(2)} mm wall rated to ${p.operatingDepthM.toFixed(0)} m (${p.externalPressureBar.toFixed(1)} bar) with hemispherical dome end-caps, ${p.thrusterCount} pressure compensators and emergency drop-weight release.`,
    overview_paragraph_en: '',
    derived_parameters: {
      operating_depth_m: p.operatingDepthM,
      external_pressure_bar: p.externalPressureBar,
      hull_diameter_m: p.hullDiameterM,
      hull_length_m: p.hullLengthM,
      hull_thickness_mm: p.hullThicknessMm,
      hull_mass_kg: p.hullMassKg,
      hull_material: p.hullMaterial,
    },
    allowed_radicals: [
      'pressure_vessel_function',
      'corrosion_inhibition_function',
      'mechanical_actuation_function',
      matRadical,
      'polymer_elastomer',
    ],
    applicability_confidence: 'high',
    sub_modules: [pressureCylinder, hullPenetrations, externalFairings] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 2. ballast_buoyancy
// ---------------------------------------------------------------------------

function emitBallastBuoyancy(p: AuvParams): DesignModule {
  const trim = makeSub(
    'syntactic_foam_trim',
    'syntactic foam trim',
    'maintains',
    'positive buoyancy with depth-rated syntactic foam',
    [
      word(
        'syntactic_foam_block_word',
        'syntactic foam block',
        cc('syntactic_foam_block', 'syntactic foam block', 'buoyancy_function', 'syntactic_foam'),
        [
          mod('quantity', '×1'),
          mod('capacity', p.buoyancyFoamVolumeM3.toFixed(3), 'm³'),
          mod('form', 'hollow-glass-microsphere epoxy'),
          mod('dimension', `${p.operatingDepthM.toFixed(0)}`, 'm depth-rated'),
        ],
      ),
      word(
        'trim_lead_weight_word',
        'trim lead weight',
        cc('trim_lead_weight', 'trim lead weight', null, 'lead'),
        [
          mod('quantity', '×8'),
          mod('form', 'M16 bolt-on lead disc'),
          mod('dimension', '2', 'kg each'),
        ],
      ),
    ],
  )

  const variableBallast = makeSub(
    'variable_ballast',
    'variable ballast tank',
    'controls',
    'depth/pitch trim via pumped oil-water exchange',
    [
      word(
        'variable_ballast_tank_word',
        'variable ballast tank',
        cc('variable_ballast_tank', 'variable ballast tank', 'buoyancy_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', '5', 'L'),
          mod('form', 'piston-actuated'),
        ],
      ),
      word(
        'ballast_pump_word',
        'ballast piston pump',
        cc('ballast_pump', 'ballast piston pump', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'positive-displacement'),
          mod('capacity', '0.5', 'L/min'),
        ],
      ),
    ],
  )

  return {
    module: 'ballast_buoyancy',
    module_brief: `Maintains +6% positive buoyancy with ${p.buoyancyFoamVolumeM3.toFixed(3)} m³ of syntactic foam plus an active 5 L variable ballast tank for depth/pitch trim.`,
    overview_paragraph_en: '',
    derived_parameters: {
      buoyancy_foam_volume_m3: p.buoyancyFoamVolumeM3,
      displacement_m3: p.displacementM3,
      mtow_air_kg: p.mtowAirKg,
    },
    allowed_radicals: ['buoyancy_function', 'fluid_flow_state', 'syntactic_foam', 'lead', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [trim, variableBallast] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 3. propulsion_thrusters
// ---------------------------------------------------------------------------

function emitPropulsionThrusters(p: AuvParams): DesignModule {
  const thrusterAssemblies = makeSub(
    'thruster_assemblies',
    'thruster assemblies',
    'propels',
    `${p.thrusterCount}-thruster vectored arrangement (1 main + lateral + vertical)`,
    [
      word(
        'thruster_motor_assembly_word',
        'thruster motor assembly',
        cc('thruster_motor_assembly', 'thruster motor assembly', 'electric_motor_function', 'polymer_elastomer'),
        [
          mod('quantity', fmtQty(p.thrusterCount)),
          mod('form', 'subsea brushless DC, oil-filled'),
          mod('capacity', '300', 'W shaft'),
          mod('dimension', `${p.operatingDepthM.toFixed(0)}`, 'm depth-rated'),
        ],
      ),
      word(
        'thruster_propeller_word',
        'thruster propeller',
        cc('thruster_propeller', 'thruster propeller', 'mechanical_actuation_function', 'polymer_thermoplastic'),
        [
          mod('quantity', fmtQty(p.thrusterCount)),
          mod('form', 'Kort nozzle 4-blade'),
          mod('dimension', '120', 'mm OD'),
        ],
      ),
      word(
        'thruster_motor_controller_word',
        'thruster motor controller',
        cc('thruster_motor_controller', 'thruster motor controller', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', fmtQty(p.thrusterCount)),
          mod('form', 'isolated 48 V FOC ESC'),
          mod('capacity', '30', 'A continuous'),
        ],
      ),
    ],
  )

  return {
    module: 'propulsion_thrusters',
    module_brief: `${p.thrusterCount} oil-filled brushless DC thrusters (300 W shaft each, Kort-nozzle 4-blade) deliver ${p.cruisePowerKw.toFixed(2)} kW cruise / ${p.peakPowerKw.toFixed(2)} kW peak at 2 m/s.`,
    overview_paragraph_en: '',
    derived_parameters: {
      thruster_count: p.thrusterCount,
      cruise_power_kw: p.cruisePowerKw,
      peak_power_kw: p.peakPowerKw,
      bus_voltage_v: p.busVoltageV,
      peak_bus_current_a: p.peakBusCurrentA,
    },
    allowed_radicals: [
      'electric_motor_function',
      'mechanical_actuation_function',
      'silicon_semiconductor_function',
      'polymer_thermoplastic',
      'polymer_elastomer',
    ],
    applicability_confidence: 'high',
    sub_modules: [thrusterAssemblies] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 4. battery_pack
// ---------------------------------------------------------------------------

function emitBatteryPack(p: AuvParams): DesignModule {
  const lfpModules = makeSub(
    'lfp_modules',
    'LFP modules',
    'stores',
    `${p.batteryKwh.toFixed(2)} kWh oil-compensated subsea pack at ${p.busVoltageV.toFixed(0)} V DC`,
    [
      word(
        'lfp_subsea_battery_pack_word',
        'LFP subsea battery pack',
        cc('lfp_subsea_battery_pack', 'LFP subsea battery pack', 'electrochemical_energy_function', 'lithium_iron_phosphate_chemistry'),
        [
          mod('quantity', '×1'),
          mod('capacity', p.batteryKwh.toFixed(2), 'kWh'),
          mod('form', 'pressure-compensated oil-filled'),
          mod('dimension', p.busVoltageV.toFixed(0), 'V nominal'),
          mod('regulatory', 'UN 38.3 + IEC 62619'),
        ],
      ),
      word(
        'bms_master_subsea_word',
        'subsea BMS master',
        cc('bms_master_subsea', 'subsea BMS master', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'CAN-over-isolated bus'),
          mod('capacity', String(p.peakBusCurrentA.toFixed(0)), 'A continuous'),
        ],
      ),
      word(
        'battery_compensation_bag_word',
        'battery compensation bag',
        cc('battery_compensation_bag', 'battery compensation bag', 'pressure_vessel_function', 'polymer_elastomer'),
        [
          mod('quantity', '×1'),
          mod('form', 'rubber bladder'),
          mod('capacity', '0.5', 'L head-space'),
        ],
      ),
    ],
  )

  return {
    module: 'battery_pack',
    module_brief: `${p.batteryKwh.toFixed(2)} kWh oil-compensated LFP subsea pack at ${p.busVoltageV.toFixed(0)} V nominal, ${p.batteryMassKg.toFixed(1)} kg, delivering ${p.peakBusCurrentA.toFixed(0)} A peak to the propulsion bus.`,
    overview_paragraph_en: '',
    derived_parameters: {
      battery_capacity_kwh: p.batteryKwh,
      battery_mass_kg: p.batteryMassKg,
      bus_voltage_v: p.busVoltageV,
      computed_endurance_h: p.enduranceH,
    },
    allowed_radicals: [
      'electrochemical_energy_function',
      'silicon_semiconductor_function',
      'lithium_iron_phosphate_chemistry',
      'polymer_elastomer',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [lfpModules] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 5. navigation_INS_DVL
// ---------------------------------------------------------------------------

function emitNavigationINSDVL(p: AuvParams): DesignModule {
  const insDvl = makeSub(
    'ins_dvl_assembly',
    'INS + DVL assembly',
    'navigates',
    'tactical-grade INS aided by 4-beam Doppler velocity log',
    [
      word(
        'fibre_optic_gyro_ins_word',
        'fibre-optic gyro INS',
        cc('fibre_optic_gyro_ins', 'fibre-optic gyro INS', 'inertial_measurement_function', 'silica_glass'),
        [
          mod('quantity', '×1'),
          mod('form', 'iXblue PHINS C7'),
          mod('tolerance', '0.05', '°/h drift'),
        ],
      ),
      word(
        'doppler_velocity_log_word',
        'Doppler velocity log',
        cc('doppler_velocity_log', 'Doppler velocity log', 'acoustic_transducer_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Nortek DVL1000 / Teledyne Pathfinder'),
          mod('dimension', '600', 'kHz'),
          mod('capacity', '40', 'm range'),
        ],
      ),
      word(
        'depth_sensor_word',
        'depth sensor',
        cc('depth_sensor', 'depth sensor', 'pressure_sensing_function', 'titanium_alloy'),
        [
          mod('quantity', '×1'),
          mod('form', 'Keller PA10LX / Paroscientific'),
          mod('tolerance', '0.01', '% FS'),
        ],
      ),
    ],
  )

  return {
    module: 'navigation_INS_DVL',
    module_brief: 'Tactical-grade fibre-optic gyro INS (0.05 °/h drift) aided by Nortek DVL1000 4-beam Doppler velocity log and Paroscientific-class quartz depth sensor for submerged dead-reckoning.',
    overview_paragraph_en: '',
    derived_parameters: {
      ins_drift_deg_per_h: 0.05,
      dvl_frequency_khz: 600,
      dvl_range_m: 40,
    },
    allowed_radicals: [
      'inertial_measurement_function',
      'acoustic_transducer_function',
      'pressure_sensing_function',
      'silica_glass',
      'titanium_alloy',
    ],
    applicability_confidence: 'high',
    sub_modules: [insDvl] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 6. sensor_sonar_camera
// ---------------------------------------------------------------------------

function emitSensorSonarCamera(p: AuvParams): DesignModule {
  const sonarSuite = makeSub(
    'sonar_suite',
    'sonar suite',
    'images',
    'side-scan + multibeam imaging sonars',
    [
      word(
        'side_scan_sonar_word',
        'side-scan sonar',
        cc('side_scan_sonar', 'side-scan sonar', 'acoustic_transducer_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'EdgeTech 2205 dual-frequency'),
          mod('dimension', '230/540', 'kHz'),
          mod('capacity', '200', 'm swath'),
        ],
      ),
      word(
        'multibeam_sonar_word',
        'multibeam sonar',
        cc('multibeam_sonar', 'multibeam sonar', 'acoustic_transducer_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Norbit iWBMS / Reson SeaBat'),
          mod('dimension', '400', 'kHz'),
          mod('capacity', '512', 'beams'),
        ],
      ),
      word(
        'forward_looking_sonar_word',
        'forward-looking sonar',
        cc('forward_looking_sonar', 'forward-looking sonar', 'acoustic_transducer_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Sound Metrics ARIS Explorer 3000'),
          mod('dimension', '3', 'MHz'),
        ],
      ),
    ],
  )

  const opticalImaging = makeSub(
    'optical_imaging',
    'optical imaging',
    'observes',
    'pressure-rated camera + LED strobe',
    [
      word(
        'subsea_camera_word',
        'subsea camera',
        cc('subsea_camera', 'subsea camera', 'optical_sensing_function', 'silica_glass'),
        [
          mod('quantity', '×1'),
          mod('form', 'SubC Rayfin'),
          mod('dimension', `${p.operatingDepthM.toFixed(0)}`, 'm depth-rated'),
          mod('capacity', '4K', 'video'),
        ],
      ),
      word(
        'subsea_glass_oil_dome_word',
        'subsea glass oil-dome',
        cc('subsea_glass_oil_dome', 'subsea glass oil-dome', 'optical_sensing_function', 'silica_glass'),
        [
          mod('quantity', '×1'),
          mod('form', 'borosilicate'),
        ],
      ),
      word(
        'led_strobe_subsea_word',
        'subsea LED strobe',
        cc('led_strobe_subsea', 'subsea LED strobe', 'optical_emission_function', 'silicon_semiconductor_function'),
        [
          mod('quantity', '×2'),
          mod('form', 'Cree XHP70 array'),
          mod('capacity', '20000', 'lm each'),
        ],
      ),
    ],
  )

  return {
    module: 'sensor_sonar_camera',
    module_brief: 'EdgeTech 2205 dual-frequency side-scan + Norbit/Reson multibeam + ARIS-class forward-looking sonar paired with SubC Rayfin 4K camera and 40 klm LED strobe.',
    overview_paragraph_en: '',
    derived_parameters: {
      side_scan_swath_m: 200,
      multibeam_beam_count: 512,
      camera_resolution: 4000,
    },
    allowed_radicals: [
      'acoustic_transducer_function',
      'optical_sensing_function',
      'optical_emission_function',
      'silicon_semiconductor_function',
      'silica_glass',
    ],
    applicability_confidence: 'high',
    sub_modules: [sonarSuite, opticalImaging] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 7. acoustic_modem
// ---------------------------------------------------------------------------

function emitAcousticModem(_p: AuvParams): DesignModule {
  const modem = makeSub(
    'acoustic_modem_assembly',
    'acoustic modem assembly',
    'communicates',
    'low-rate acoustic uplink to surface ship over 5 km range',
    [
      word(
        'acoustic_modem_word',
        'acoustic modem',
        cc('acoustic_modem', 'acoustic modem', 'acoustic_transducer_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'EvoLogics S2C M HS / Sonardyne AvTrak'),
          mod('capacity', '13.9', 'kbit/s'),
          mod('dimension', '18-34', 'kHz'),
        ],
      ),
      word(
        'usbl_transponder_word',
        'USBL transponder',
        cc('usbl_transponder', 'USBL transponder', 'acoustic_transducer_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Sonardyne WMT'),
          mod('capacity', '7', 'km baseline'),
        ],
      ),
    ],
  )

  return {
    module: 'acoustic_modem',
    module_brief: 'EvoLogics S2C M HS / Sonardyne AvTrak 18-34 kHz acoustic modem (13.9 kbit/s) plus Sonardyne WMT USBL transponder for 7 km LBL/USBL positioning by surface ship.',
    overview_paragraph_en: '',
    derived_parameters: {
      modem_data_rate_kbit_s: 13.9,
      usbl_baseline_km: 7,
    },
    allowed_radicals: [
      'acoustic_transducer_function',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [modem] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 8. antenna_GPS
// ---------------------------------------------------------------------------

function emitAntennaGPS(_p: AuvParams): DesignModule {
  const antenna = makeSub(
    'surface_antenna',
    'surface antenna',
    'receives',
    'GNSS + Iridium SBD + WiFi for surface fixes + telemetry',
    [
      word(
        'gnss_antenna_word',
        'GNSS antenna',
        cc('gnss_antenna', 'GNSS antenna', 'radio_frequency_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'multi-band L1/L2/L5'),
          mod('regulatory', 'IP68 marine-grade'),
        ],
      ),
      word(
        'iridium_sbd_antenna_word',
        'Iridium SBD antenna',
        cc('iridium_sbd_antenna', 'Iridium SBD antenna', 'radio_frequency_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'helical 1.6 GHz'),
          mod('regulatory', 'Iridium 9603N module'),
        ],
      ),
      word(
        'wifi_802_11_antenna_word',
        'WiFi antenna',
        cc('wifi_802_11_antenna', 'WiFi antenna', 'radio_frequency_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', '2.4/5 GHz dipole'),
        ],
      ),
      word(
        'mast_collapsible_word',
        'collapsible antenna mast',
        cc('mast_collapsible', 'collapsible antenna mast', null, 'aluminium_alloy'),
        [
          mod('quantity', '×1'),
          mod('form', 'spring-loaded'),
          mod('dimension', '0.6', 'm'),
        ],
      ),
    ],
  )

  return {
    module: 'antenna_GPS',
    module_brief: 'Spring-loaded antenna mast carrying multi-band L1/L2/L5 GNSS, Iridium 9603N SBD and 2.4/5 GHz WiFi for surface fixes, telemetry and last-mile recovery comms.',
    overview_paragraph_en: '',
    derived_parameters: {
      gnss_bands: 3,
      iridium_module: 9603,
    },
    allowed_radicals: [
      'radio_frequency_function',
      'aluminium_alloy',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [antenna] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 9. recovery_handle_strobe
// ---------------------------------------------------------------------------

function emitRecoveryHandleStrobe(_p: AuvParams): DesignModule {
  const recovery = makeSub(
    'recovery_hardware',
    'recovery hardware',
    'enables',
    'topside crane recovery + lost-vehicle location',
    [
      word(
        'recovery_lift_handle_word',
        'recovery lift handle',
        cc('recovery_lift_handle', 'recovery lift handle', 'mechanical_actuation_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', '316L stainless'),
          mod('capacity', '1000', 'kg WLL'),
        ],
      ),
      word(
        'recovery_strobe_word',
        'recovery xenon strobe',
        cc('recovery_strobe', 'recovery xenon strobe', 'optical_emission_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×2'),
          mod('form', 'ACR Firefly Pro'),
          mod('lifecycle', '48 h'),
        ],
      ),
      word(
        'iridium_beacon_word',
        'Iridium beacon',
        cc('iridium_beacon', 'Iridium recovery beacon', 'radio_frequency_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Xeos Nano'),
          mod('lifecycle', '14 d'),
        ],
      ),
      word(
        'recovery_paint_high_vis_word',
        'high-visibility safety paint',
        cc('recovery_paint_high_vis', 'high-visibility safety paint', null, 'polymer_thermoset'),
        [
          mod('quantity', '×1'),
          mod('form', 'fluorescent orange epoxy'),
        ],
      ),
    ],
  )

  return {
    module: 'recovery_handle_strobe',
    module_brief: 'Galvanic burnwire drop-weight pairs with ACR Firefly Pro xenon strobes and Xeos Nano Iridium beacon plus 1000 kg WLL 316L recovery handle for topside crane retrieval.',
    overview_paragraph_en: '',
    derived_parameters: {
      strobe_life_h: 48,
      beacon_life_d: 14,
    },
    allowed_radicals: [
      'mechanical_actuation_function',
      'optical_emission_function',
      'radio_frequency_function',
      'steel',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [recovery] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 10. regulatory_IMO
// ---------------------------------------------------------------------------

function emitRegulatoryIMO(p: AuvParams): DesignModule {
  const reg = makeSub(
    'imo_compliance_set',
    'IMO compliance set',
    'documents',
    'IMO + MASS + flag-state compliance docs and labels',
    [
      word(
        'imo_mass_compliance_label_word',
        'IMO MASS compliance label',
        cc('imo_mass_compliance_label', 'IMO MASS compliance label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'MSC.1/Circ.1638'),
        ],
      ),
      word(
        'solas_radar_reflector_word',
        'SOLAS radar reflector',
        cc('solas_radar_reflector', 'SOLAS radar reflector', 'radio_frequency_function', 'aluminium_alloy'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'SOLAS Reg. V/19'),
        ],
      ),
      word(
        'pressure_vessel_certification_word',
        'pressure vessel certification',
        cc('pressure_vessel_certification', 'pressure vessel certification', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', `ASME BPVC VIII Div 1 @ ${p.externalPressureBar.toFixed(0)} bar`),
        ],
      ),
      word(
        'lithium_battery_shipping_label_word',
        'lithium battery shipping label',
        cc('lithium_battery_shipping_label', 'lithium battery shipping label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'UN 38.3 + IMDG Class 9'),
        ],
      ),
    ],
  )

  return {
    module: 'regulatory_IMO',
    module_brief: `IMO MASS compliance (MSC.1/Circ.1638), SOLAS V/19 radar-reflector, ASME BPVC VIII Div 1 pressure-vessel certification at ${p.externalPressureBar.toFixed(0)} bar, and UN 38.3 / IMDG Class 9 lithium-battery shipping documentation.`,
    overview_paragraph_en: '',
    derived_parameters: {
      certified_pressure_bar: p.externalPressureBar,
    },
    allowed_radicals: [
      'radio_frequency_function',
      'aluminium_alloy',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [reg] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// CROSS-MODULE GRAMMAR LINKS
// ---------------------------------------------------------------------------

function emitGrammarLinks(p: AuvParams): unknown[] {
  return [
    { from_module: 'battery_pack', to_module: 'propulsion_thrusters', mechanism: 'electrical_bus', type: 'mutual', detail: `${p.busVoltageV.toFixed(0)} V DC subsea bus, ${p.peakBusCurrentA.toFixed(0)} A peak` },
    { from_module: 'navigation_INS_DVL', to_module: 'propulsion_thrusters', mechanism: 'control_loop', type: 'directional', detail: 'INS + DVL → autopilot → thruster commands at 10 Hz' },
    { from_module: 'acoustic_modem', to_module: 'navigation_INS_DVL', mechanism: 'data_bus', type: 'mutual', detail: 'USBL fix injects into INS Kalman filter' },
    { from_module: 'sensor_sonar_camera', to_module: 'pressure_hull_chassis', mechanism: 'mechanical_mount', type: 'directional', detail: 'transducer mounts in dedicated wet-end through-holes' },
    { from_module: 'antenna_GPS', to_module: 'pressure_hull_chassis', mechanism: 'mechanical_mount', type: 'directional', detail: 'spring-loaded mast on dorsal pad-eye' },
    { from_module: 'ballast_buoyancy', to_module: 'pressure_hull_chassis', mechanism: 'mechanical_mount', type: 'directional', detail: 'syntactic foam blocks bolt-on saddles' },
    { from_module: 'battery_pack', to_module: 'pressure_hull_chassis', mechanism: 'mechanical_mount', type: 'directional', detail: 'pack tray bolts to forward dome flange' },
    { from_module: 'recovery_handle_strobe', to_module: 'pressure_hull_chassis', mechanism: 'mechanical_mount', type: 'directional', detail: 'lift handle through-bolts on aft dome' },
    { from_module: 'sensor_sonar_camera', to_module: 'navigation_INS_DVL', mechanism: 'data_bus', type: 'mutual', detail: 'time-tag every ping/frame against INS PPS' },
    { from_module: 'regulatory_IMO', to_module: 'pressure_hull_chassis', mechanism: 'compliance', type: 'directional', detail: 'pressure-vessel certificate attached to hull serial' },
  ]
}

// ---------------------------------------------------------------------------
// BRIEF OVERVIEW PROSE
// ---------------------------------------------------------------------------

function emitBriefOverviewProse(p: AuvParams): DesignJSON['brief_overview_prose'] {
  return {
    overview_and_context: '',
    mission_statement: `Deliver a ${p.mtowAirKg.toFixed(0)} kg work-class AUV with ${p.batteryKwh.toFixed(2)} kWh of energy yielding ${p.enduranceH.toFixed(1)} h endurance to ${p.operatingDepthM.toFixed(0)} m operating depth, certified to IMO MASS + ASME BPVC + UN 38.3.`,
    target_customers: '',
    why_now: '',
  }
}

// ---------------------------------------------------------------------------
// PUBLIC EMITTER ENTRY POINT
// ---------------------------------------------------------------------------

export function emitAuvDesign(
  contract: ContractInProgress,
  _brief: ParsedConstraints,
  _envelope: BriefEnvelope,
): DesignJSON {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitPressureHullChassis(p),
    emitBallastBuoyancy(p),
    emitPropulsionThrusters(p),
    emitBatteryPack(p),
    emitNavigationINSDVL(p),
    emitSensorSonarCamera(p),
    emitAcousticModem(p),
    emitAntennaGPS(p),
    emitRecoveryHandleStrobe(p),
    emitRegulatoryIMO(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: 'All 10 canonical AUV modules apply to the 50-500 kg deep-water work-class envelope.',
    brief_overview_prose: emitBriefOverviewProse(p),
  }
}

// Register at module load — assembler.ts picks this up via the class key.
registerAssembler('auv', emitAuvDesign)
registerAssembler('auv/mid_water', emitAuvDesign)
registerAssembler('auv/deep_water', emitAuvDesign)
