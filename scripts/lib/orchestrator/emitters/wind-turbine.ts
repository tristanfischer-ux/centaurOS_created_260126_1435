/**
 * scripts/lib/orchestrator/emitters/wind-turbine.ts
 *
 * WIND TURBINE DETERMINISTIC EMITTER — horizontal-axis 5 kW to 15 MW.
 *
 * 2026-05-23: expanded from "small/medium 5-100 kW" to full utility-scale
 * range (15 MW class offshore — GE Haliade-X, Vestas V236, SG 14-222 DD).
 * All physics modifiers now SCALE with rated_power_kw, rotor_diameter_m,
 * hub_height_m, total_system_mass_kg rather than being hardcoded for 100 kW
 * small wind. Previously a 6 MW brief shipped with 15000 kg hub load
 * (correct for 100 kW, undersized 4× for 6 MW) and 6 kW yaw drive (correct
 * for 100 kW, undersized 5× for 6 MW).
 *
 * Modules (11):
 *   1. rotor_blades              — 3 epoxy-glass blades + pitch hub
 *   2. hub_pitch                 — hub + pitch actuator + bearing
 *   3. gearbox_drivetrain        — 2-stage planetary + low-speed shaft
 *   4. generator                 — PMSG with permanent magnets
 *   5. converter_grid_tie        — back-to-back IGBT converter + grid filter
 *   6. tower_yaw                 — tubular steel tower + yaw bearing + drive
 *   7. control_avionics          — PLC + sensors + pitch/yaw control
 *   8. foundation                — reinforced concrete + anchor bolts
 *   9. regulatory_certification  — IEC 61400-2/-22, MCS012, G99 signage
 *  10. transport_logistics       — crane + oversize permit + load harness
 *  11. monitoring_SCADA           — SCADA + remote telemetry + condition monitoring
 */

import { registerAssembler } from '../assembler'
import type { ClassEmitter, DesignJSON, DesignModule } from '../assembler'
import type { ContractInProgress } from '../types'

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

interface WindTurbineParams {
  ratedPowerKw: number
  rotorDiameterM: number
  hubHeightM: number
  bladeCount: number
  cutInMs: number
  ratedMs: number
  cutOutMs: number
  rotorRpm: number
  generatorRpm: number
  gearboxRatio: number
  cpMax: number
  tsr: number
  acContinuousA: number
  totalMassKg: number
  isOffshore: boolean
  // 2026-05-23 scale-aware physics (P2-7 follow-on)
  isDirectDrive: boolean
  bladeMassEachKg: number
  totalRotorMassKg: number
  nacelleMassKg: number
  hubStaticLoadKg: number
  yawBearingAxialKg: number
  yawTotalKw: number
  yawMotorCount: number
  yawMotorEachKw: number
  generatorAcV: number
  dcLinkV: number
  foundationVolumeM3: number
  foundationDimText: string
  foundationRebarKg: number
  anchorBoltCount: number
}

function q(contract: ContractInProgress, key: string, fallback: number): number {
  const v = (contract as any).quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function deriveParams(contract: ContractInProgress): WindTurbineParams {
  const ratedPowerKw = Math.max(1, q(contract, 'rated_power_kw', 50))
  const rotorDiameterM = q(contract, 'rotor_diameter_m', Math.max(8, Math.sqrt(ratedPowerKw) * 2.5))
  const hubHeightM = q(contract, 'hub_height_m', rotorDiameterM * 1.3)
  const cutInMs = q(contract, 'cut_in_wind_speed_m_s', 3)
  const ratedMs = q(contract, 'rated_wind_speed_m_s', 11.5)
  const cutOutMs = q(contract, 'cut_out_wind_speed_m_s', 25)
  const cpMax = q(contract, 'rotor_cp_max', 0.45)
  const tsr = q(contract, 'tip_speed_ratio_optimal', 6.5)
  const rotorRpm = Math.round((ratedMs * tsr * 60) / (Math.PI * rotorDiameterM))
  // 2026-05-23: direct-drive detection — read from contract OR brief
  // description. Direct-drive eliminates the gearbox; generator runs at
  // rotor RPM directly. Common at utility scale (Enercon, Siemens-Gamesa
  // DD, GE Cypress, MingYang) because gearboxes are #1 failure source.
  const ddFlag = q(contract, 'direct_drive', 0)
  const briefDesc = String((contract as any)?.brief?.product_description ?? '')
  const isDirectDrive = ddFlag >= 1 || /direct[\s-]?drive|gearless|no\s+gearbox|enercon|siemens[\s-]?gamesa\s+dd|ge\s+cypress|mingyang/i.test(briefDesc)
  const generatorRpm = isDirectDrive ? rotorRpm : 1500
  const gearboxRatio = isDirectDrive ? 1 : q(contract, 'gearbox_ratio', 1500 / Math.max(1, rotorRpm))
  const acContinuousA = q(contract, 'ac_continuous_current_a', (ratedPowerKw * 1000) / (400 * Math.sqrt(3) * 0.95))
  const totalMassKg = q(contract, 'total_system_mass_kg', ratedPowerKw * 25 + ratedPowerKw * 18 + hubHeightM * 150)
  const generatorType = q(contract, 'generator_type', 1)
  const isOffshore = generatorType >= 2 || /offshore|monopile|jacket|floating|sea/i.test(briefDesc)

  // ── 2026-05-23 SCALE-AWARE PHYSICS — Physics Critic-driven additions ──
  // These propagate brief-driven physics into the word modifiers rather
  // than hardcoding 100 kW values that fail at 1+ MW.

  // Blade mass: NREL Fingersh/Hand/Laxson 2006 scaling with segmented
  // discount at >180 m diameter (modular blade designs for >12 MW class).
  const isSegmentedClass = rotorDiameterM >= 180
  const bladeMassEachKg = 0.135 * Math.pow(rotorDiameterM, 2.39) * (isSegmentedClass ? 0.90 : 1.00)
  // Total rotor mass = 3 × blade + ~40% for hub + flanges
  const totalRotorMassKg = 3 * bladeMassEachKg * 1.40
  // Nacelle mass: direct-drive nacelles are heavier per kW (~30 kg/kW)
  // because of the large-diameter PM generator; gearbox nacelles ~22 kg/kW.
  const nacelleMassKgPerKw = isDirectDrive ? 30 : 22
  const nacelleMassKg = ratedPowerKw * nacelleMassKgPerKw
  // Hub static load: must carry transient rotor + dynamic + safety
  // factor (IEC 61400-1 load case DLC1.5/1.6 emergency stop)
  const hubStaticLoadKg = Math.round(totalRotorMassKg * 3.0)
  // Yaw bearing axial: carries nacelle + rotor with 1.3× safety
  const yawBearingAxialKg = Math.round((nacelleMassKg + totalRotorMassKg) * 1.3)
  // Yaw drive total: ~0.5% of rated power (industry rule of thumb)
  const yawTotalKw = Math.max(0.5, ratedPowerKw * 0.005)
  const yawMotorCount = ratedPowerKw < 200 ? 2 : ratedPowerKw < 2000 ? 4 : 6
  const yawMotorEachKw = Math.max(0.25, yawTotalKw / yawMotorCount)
  // Generator AC voltage: small wind ≤400 V; utility scale ≥690 V
  const generatorAcV = ratedPowerKw < 500 ? 400 : ratedPowerKw < 5000 ? 690 : 3300
  // DC link voltage: must clear peak AC by ~13% margin
  const dcLinkV = Math.max(800, Math.round(generatorAcV * Math.SQRT2 * 1.13))
  // Foundation: onshore gravity vs offshore monopile sizing
  const foundationVolumeM3 = isOffshore
    ? Math.max(120, rotorDiameterM * 2)  // monopile section ≥ 120 m³ for utility
    : Math.max(50, ratedPowerKw * 0.25)  // onshore gravity
  // Foundation dimensions: text representation for the modifier
  const foundationDimText = isOffshore
    ? `monopile Ø${(rotorDiameterM * 0.07).toFixed(1)} m × ${(rotorDiameterM * 0.5 + hubHeightM * 0.3).toFixed(0)} m penetration`
    : `${(Math.max(7, Math.cbrt(foundationVolumeM3) * 1.3)).toFixed(1)}×${(Math.max(7, Math.cbrt(foundationVolumeM3) * 1.3)).toFixed(1)}×${(Math.max(1.5, foundationVolumeM3 / Math.pow(Math.max(7, Math.cbrt(foundationVolumeM3) * 1.3), 2))).toFixed(1)} m`
  // Foundation rebar: ~120 kg/m³ concrete reinforcement ratio
  const foundationRebarKg = Math.round(foundationVolumeM3 * 120)
  // Anchor bolts: scale with rotor diameter / overturning moment
  const anchorBoltCount = ratedPowerKw < 200 ? 24 : ratedPowerKw < 2000 ? 72 : 144

  return {
    ratedPowerKw,
    rotorDiameterM,
    hubHeightM,
    bladeCount: 3,
    cutInMs,
    ratedMs,
    cutOutMs,
    rotorRpm,
    generatorRpm,
    gearboxRatio,
    cpMax,
    tsr,
    acContinuousA,
    totalMassKg,
    isOffshore,
    isDirectDrive,
    bladeMassEachKg,
    totalRotorMassKg,
    nacelleMassKg,
    hubStaticLoadKg,
    yawBearingAxialKg,
    yawTotalKw,
    yawMotorCount,
    yawMotorEachKw,
    generatorAcV,
    dcLinkV,
    foundationVolumeM3,
    foundationDimText,
    foundationRebarKg,
    anchorBoltCount,
  }
}

function emitRotorBlades(p: WindTurbineParams): DesignModule {
  const bladeAssembly = makeSubModule('rotor_blade_assembly', 'rotor blade assembly', 'extracts',
    `Captures kinetic wind energy with Cp=${p.cpMax.toFixed(2)} at TSR=${p.tsr.toFixed(1)} via ${p.bladeCount} blades`,
    [
      word('rotor_blade_word', 'rotor blade',
        cc('rotor_blade', 'rotor blade', 'aero_lift_function', 'composite_glass_epoxy'),
        [mod('quantity', fmtQty(p.bladeCount)), mod('dimension', (p.rotorDiameterM / 2).toFixed(1), 'm'), mod('form', 'twist-tapered'), mod('regulatory', 'IEC 61400-23')]),
      word('blade_root_bolt_word', 'blade root bolt',
        cc('blade_root_bolt', 'blade root bolt', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', fmtQty(p.bladeCount * 24)), mod('form', 'M30 10.9 grade')]),
      word('lightning_receptor_word', 'lightning receptor',
        cc('lightning_receptor', 'lightning receptor', 'electrical_conducting_function', 'copper'),
        [mod('quantity', fmtQty(p.bladeCount)), mod('regulatory', 'IEC 61400-24'), mod('form', 'tip-mounted brass')]),
      word('aerodynamic_brake_word', 'aerodynamic brake',
        cc('aerodynamic_brake', 'aerodynamic brake', 'electromechanical_switching_function', 'composite_glass_epoxy'),
        [mod('quantity', fmtQty(p.bladeCount)), mod('form', 'centrifugal tip-actuated')]),
    ])
  return {
    module: 'rotor_blades',
    module_brief: `${p.bladeCount} epoxy-glass blades, ${(p.rotorDiameterM / 2).toFixed(1)} m long, twist-tapered for Cp=${p.cpMax.toFixed(2)}, lightning-receptor + centrifugal aero-brake per IEC 61400.`,
    overview_paragraph_en: '',
    derived_parameters: { rotor_diameter_m: p.rotorDiameterM, blade_count: p.bladeCount, cp_max: p.cpMax, tsr_optimal: p.tsr },
    allowed_radicals: ['aero_lift_function', 'composite_glass_epoxy', 'electromechanical_switching_function', 'electrical_conducting_function', 'steel', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [bladeAssembly],
  }
}

function emitHubPitch(p: WindTurbineParams): DesignModule {
  const hub = makeSubModule('hub_assembly', 'hub assembly', 'mounts',
    `${p.bladeCount} blades to the low-speed shaft with synchronised pitch actuation`,
    [
      word('cast_iron_hub_word', 'cast iron hub',
        cc('cast_iron_hub', 'cast iron hub', null, 'cast_iron'),
        [mod('quantity', '×1'), mod('form', 'GJS-400-18 cast'), mod('capacity', p.hubStaticLoadKg.toFixed(0), 'kg load'), mod('dimension', (p.rotorDiameterM * 0.025).toFixed(2), 'm bore')]),
      word('pitch_bearing_word', 'pitch bearing',
        cc('pitch_bearing', 'pitch bearing', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', fmtQty(p.bladeCount)), mod('form', 'four-point contact double-row'), mod('regulatory', 'IEC 61400-4')]),
      word('pitch_motor_word', 'pitch motor',
        cc('pitch_motor', 'pitch motor', 'silicon_semiconductor_function', 'copper'),
        [mod('quantity', fmtQty(p.bladeCount)), mod('capacity', '5.5', 'kW'), mod('form', 'permanent-magnet servo')]),
      word('pitch_battery_word', 'pitch battery',
        cc('pitch_battery', 'pitch backup battery', 'electrochemical_energy_function', 'lithium_iron_phosphate_chemistry'),
        [mod('quantity', '×1'), mod('capacity', '5', 'kWh'), mod('regulatory', 'IEC 62619')]),
    ])
  return {
    module: 'hub_pitch',
    module_brief: `Cast iron hub with ${p.bladeCount}× four-point pitch bearings driven by 5.5 kW PM servos, backed by 5 kWh LFP battery for safe feathering on grid loss.`,
    overview_paragraph_en: '',
    derived_parameters: { pitch_motor_kw: 5.5, pitch_battery_kwh: 5 },
    allowed_radicals: ['cast_iron', 'electromechanical_switching_function', 'silicon_semiconductor_function', 'electrochemical_energy_function', 'lithium_iron_phosphate_chemistry', 'steel', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [hub],
  }
}

function emitGearboxDrivetrain(p: WindTurbineParams): DesignModule {
  const torqueNm = p.ratedPowerKw * 9550 / Math.max(1, p.rotorRpm)
  // Shaft diameter scales with cube root of torque (τ = T r / J, simple beam scaling)
  const lowSpeedShaftMm = Math.round(80 + Math.pow(torqueNm / 10_000, 1 / 3) * 90)
  const highSpeedShaftMm = Math.max(40, Math.round(lowSpeedShaftMm / Math.max(1, Math.pow(p.gearboxRatio, 0.5))))
  // Lubrication pump scales with gearbox heat dissipation ≈ 2% of rated power
  const lubePumpKw = Math.max(0.25, p.ratedPowerKw * 0.0005)
  // 2026-05-23 fix: when brief says direct-drive, emit a SHORT drivetrain
  // with just the low-speed shaft + main bearing — no gearbox, no
  // high-speed shaft, no mechanical brake (rotor brake separate).
  if (p.isDirectDrive) {
    const drivetrain = makeSubModule('drivetrain_assembly', 'direct-drive shaft + main bearing', 'transmits',
      `direct-drive low-speed rotor torque (${torqueNm.toFixed(0)} N·m at ${p.rotorRpm} rpm) into PM generator at same shaft RPM`,
      [
        word('low_speed_shaft_word', 'low speed shaft',
          cc('low_speed_shaft', 'low-speed shaft', 'electromechanical_switching_function', 'steel'),
          [mod('quantity', '×1'), mod('dimension', lowSpeedShaftMm.toFixed(0), 'mm'), mod('form', '42CrMo4 forged'), mod('capacity', torqueNm.toFixed(0), 'N·m')]),
        word('main_bearing_word', 'main bearing',
          cc('main_bearing', 'main rotor bearing', 'electromechanical_switching_function', 'steel'),
          [mod('quantity', '×2'), mod('form', 'double-row tapered roller'), mod('capacity', p.hubStaticLoadKg.toFixed(0), 'kg axial'), mod('regulatory', 'IEC 61400-4')]),
        word('main_shaft_seal_word', 'main shaft seal',
          cc('main_shaft_seal', 'main shaft labyrinth seal', null, 'steel'),
          [mod('quantity', '×1'), mod('form', 'labyrinth + grease purge'), mod('regulatory', 'IP67')]),
      ])
    return {
      module: 'gearbox_drivetrain',
      module_brief: `Direct-drive — no gearbox. ${lowSpeedShaftMm} mm forged 42CrMo4 shaft transmits ${torqueNm.toFixed(0)} N·m at ${p.rotorRpm} rpm directly into the PM generator. Double-row tapered roller main bearings carry rotor axial + radial loads per IEC 61400-4.`,
      overview_paragraph_en: '',
      derived_parameters: { is_direct_drive: 1, low_speed_shaft_mm: lowSpeedShaftMm, rotor_rpm: p.rotorRpm, torque_nm: torqueNm, hub_static_load_kg: p.hubStaticLoadKg },
      allowed_radicals: ['electromechanical_switching_function', 'steel'],
      applicability_confidence: 'high',
      sub_modules: [drivetrain],
    }
  }
  const drivetrain = makeSubModule('drivetrain_assembly', 'gearbox drivetrain assembly', 'transmits',
    `low-speed rotor torque (${torqueNm.toFixed(0)} N·m at ${p.rotorRpm} rpm) up to ${p.generatorRpm} rpm generator shaft via ${p.gearboxRatio.toFixed(0)}:1 planetary gearbox`,
    [
      word('low_speed_shaft_word', 'low speed shaft',
        cc('low_speed_shaft', 'low-speed shaft', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×1'), mod('dimension', lowSpeedShaftMm.toFixed(0), 'mm'), mod('form', '42CrMo4 forged'), mod('capacity', torqueNm.toFixed(0), 'N·m')]),
      word('planetary_gearbox_word', 'planetary gearbox',
        cc('planetary_gearbox', 'planetary gearbox', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×1'), mod('form', p.ratedPowerKw < 1000 ? '2-stage planetary' : '3-stage planetary + helical'), mod('capacity', String(Math.round(p.gearboxRatio)), ':1'), mod('regulatory', 'IEC 61400-4')]),
      word('high_speed_shaft_word', 'high speed shaft',
        cc('high_speed_shaft', 'high-speed shaft', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×1'), mod('dimension', highSpeedShaftMm.toFixed(0), 'mm'), mod('form', '42CrMo4'), mod('capacity', (torqueNm / p.gearboxRatio).toFixed(0), 'N·m')]),
      word('mechanical_brake_word', 'mechanical brake',
        cc('mechanical_brake', 'mechanical brake', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'disc + caliper'), mod('capacity', (torqueNm * 1.5).toFixed(0), 'N·m'), mod('regulatory', 'IEC 61400-2')]),
      word('lubrication_pump_word', 'lubrication pump',
        cc('lubrication_pump', 'lubrication pump', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×1'), mod('capacity', lubePumpKw.toFixed(2), 'kW'), mod('form', 'gear pump'), mod('dimension', '40', 'L/min')]),
    ])
  return {
    module: 'gearbox_drivetrain',
    module_brief: `${p.ratedPowerKw < 1000 ? '2-stage' : '3-stage'} planetary gearbox at ${p.gearboxRatio.toFixed(0)}:1 ratio (Bonfiglioli/Winergy class) with disc brake (${(torqueNm * 1.5).toFixed(0)} N·m), ${lubePumpKw.toFixed(2)} kW gear-pump lubrication, and forged 42CrMo4 shafts (low-speed Ø${lowSpeedShaftMm} mm carrying ${torqueNm.toFixed(0)} N·m, high-speed Ø${highSpeedShaftMm} mm).`,
    overview_paragraph_en: '',
    derived_parameters: { gearbox_ratio: p.gearboxRatio, rotor_rpm: p.rotorRpm, generator_rpm: p.generatorRpm, torque_nm: torqueNm },
    allowed_radicals: ['electromechanical_switching_function', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [drivetrain],
  }
}

function emitGenerator(p: WindTurbineParams): DesignModule {
  const generator = makeSubModule('pm_generator', 'PM generator', 'converts',
    `mechanical input (${p.generatorRpm} rpm, ${(p.ratedPowerKw * 9550 / p.generatorRpm).toFixed(0)} N·m) into 690 V AC electrical at η≥94%`,
    [
      word('pmsg_stator_word', 'PMSG stator',
        cc('pmsg_stator', 'PMSG stator', 'magnetic_coupling_function', 'copper'),
        [mod('quantity', '×1'), mod('capacity', p.ratedPowerKw.toFixed(0), 'kW'), mod('form', p.isDirectDrive ? `direct-drive multi-pole (${Math.max(48, Math.round(60 * 50 / Math.max(1, p.rotorRpm)))}-pole)` : '3-phase 4-pole'), mod('dimension', `${p.generatorAcV} V`)]),
      word('pm_rotor_word', 'PM rotor',
        cc('pm_rotor', 'permanent magnet rotor', 'magnetic_coupling_function', 'ndfeb_magnet'),
        [mod('quantity', '×1'), mod('form', 'surface-mounted NdFeB N42'), mod('regulatory', 'IEC 60404-5')]),
      word('slip_ring_assembly_word', 'slip ring assembly',
        cc('slip_ring_assembly', 'slip ring assembly', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×1'), mod('form', '3-phase + earth + signal'), mod('capacity', p.acContinuousA.toFixed(0), 'A')]),
      word('generator_encoder_word', 'generator encoder',
        cc('generator_encoder', 'generator encoder', 'optical_sensing_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('capacity', '4096', 'ppr'), mod('form', 'incremental optical')]),
    ])
  return {
    module: 'generator',
    module_brief: `Direct-drive ${p.ratedPowerKw} kW PMSG with NdFeB rotor, 690 V AC stator at η≥94%, slip rings + encoder for control feedback.`,
    overview_paragraph_en: '',
    derived_parameters: { rated_power_kw: p.ratedPowerKw, generator_rpm: p.generatorRpm },
    allowed_radicals: ['magnetic_coupling_function', 'electrical_conducting_function', 'optical_sensing_function', 'copper', 'ndfeb_magnet', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [generator],
  }
}

function emitConverterGridTie(p: WindTurbineParams): DesignModule {
  const converter = makeSubModule('grid_tie_converter', 'grid-tie converter', 'rectifies',
    `${p.ratedPowerKw} kW PMSG variable-frequency output via back-to-back IGBT to ${p.acContinuousA.toFixed(0)} A at 400 V grid`,
    [
      word('generator_side_converter_word', 'generator-side converter',
        cc('generator_side_converter', 'generator-side converter', 'silicon_semiconductor_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×1'), mod('capacity', p.ratedPowerKw.toFixed(0), 'kW'), mod('form', 'IGBT 3-level')]),
      word('grid_side_inverter_word', 'grid-side inverter',
        cc('grid_side_inverter', 'grid-side inverter', 'silicon_semiconductor_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×1'), mod('capacity', p.ratedPowerKw.toFixed(0), 'kW'), mod('form', 'IGBT 3-level')]),
      word('dc_link_capacitor_word', 'DC link capacitor',
        cc('dc_link_capacitor', 'DC link capacitor bank', 'electrical_conducting_function', 'aluminium'),
        [mod('quantity', '×1'), mod('capacity', Math.round(p.ratedPowerKw * 0.8).toFixed(0), 'µF'), mod('dimension', `${p.dcLinkV}`, 'V'), mod('form', 'film capacitor bank, water-cooled')]),
      word('grid_filter_word', 'grid filter',
        cc('grid_filter', 'grid LCL filter', 'magnetic_coupling_function', 'copper'),
        [mod('quantity', '×3'), mod('capacity', '1.0', 'mH'), mod('form', 'three-phase')]),
      word('chopper_resistor_word', 'chopper resistor',
        cc('chopper_resistor', 'chopper resistor', 'electrical_conducting_function', 'ceramic'),
        [mod('quantity', '×1'), mod('capacity', '50', 'kW'), mod('form', 'braking resistor')]),
    ])
  return {
    module: 'converter_grid_tie',
    module_brief: `Back-to-back IGBT converter — rectifier + inverter sharing 5000 µF DC link, LCL grid filter and 50 kW chopper resistor for LVRT ride-through.`,
    overview_paragraph_en: '',
    derived_parameters: { rated_power_kw: p.ratedPowerKw, ac_continuous_current_a: p.acContinuousA },
    allowed_radicals: ['silicon_semiconductor_function', 'magnetic_coupling_function', 'electrical_conducting_function', 'copper', 'aluminium', 'ceramic'],
    applicability_confidence: 'high',
    sub_modules: [converter],
  }
}

function emitTowerYaw(p: WindTurbineParams): DesignModule {
  const tower = makeSubModule('tower_structure', 'tower structure', 'supports',
    `nacelle + rotor at ${p.hubHeightM.toFixed(0)} m hub height with passive vibration damping`,
    [
      word('steel_tower_word', 'steel tower',
        cc('steel_tower', 'steel tower', null, 'steel'),
        [mod('quantity', '×1'), mod('dimension', p.hubHeightM.toFixed(0), 'm'), mod('form', 'tubular galvanised S355JR'), mod('regulatory', 'IEC 61400-2')]),
      word('yaw_bearing_word', 'yaw bearing',
        cc('yaw_bearing', 'yaw bearing', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×1'), mod('form', p.ratedPowerKw < 500 ? 'four-point contact ball' : 'three-row roller slewing'), mod('capacity', p.yawBearingAxialKg.toFixed(0), 'kg axial'), mod('regulatory', 'IEC 61400-4')]),
      word('yaw_drive_motor_word', 'yaw drive motor',
        cc('yaw_drive_motor', 'yaw drive motor', 'silicon_semiconductor_function', 'copper'),
        [mod('quantity', fmtQty(p.yawMotorCount)), mod('capacity', p.yawMotorEachKw.toFixed(2), 'kW'), mod('form', 'planetary gear motor + electromagnetic brake'), mod('dimension', (p.yawTotalKw).toFixed(1) + ' kW total')]),
      word('tower_door_word', 'tower door',
        cc('tower_door', 'tower door', null, 'steel'),
        [mod('quantity', '×1'), mod('regulatory', 'IP54'), mod('form', '600×1800 mm')]),
      word('climbing_ladder_word', 'climbing ladder',
        cc('climbing_ladder', 'climbing ladder', null, 'aluminium'),
        [mod('quantity', '×1'), mod('regulatory', 'EN 14122-4'), mod('dimension', p.hubHeightM.toFixed(0), 'm')]),
    ])
  return {
    module: 'tower_yaw',
    module_brief: `${p.hubHeightM.toFixed(0)} m tubular galvanised S355JR steel tower with ${p.ratedPowerKw < 500 ? 'four-point contact ball' : 'three-row roller slewing'} yaw bearing rated ${p.yawBearingAxialKg.toFixed(0)} kg axial, driven by ${p.yawMotorCount}× ${p.yawMotorEachKw.toFixed(2)} kW planetary gear motors (${p.yawTotalKw.toFixed(1)} kW total); access via internal aluminium climbing ladder per EN 14122-4.`,
    overview_paragraph_en: '',
    derived_parameters: { hub_height_m: p.hubHeightM, yaw_motor_count: p.yawMotorCount, yaw_motor_kw_each: p.yawMotorEachKw, yaw_bearing_axial_kg: p.yawBearingAxialKg, yaw_total_kw: p.yawTotalKw },
    allowed_radicals: ['steel', 'electromechanical_switching_function', 'silicon_semiconductor_function', 'aluminium', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [tower],
  }
}

function emitControlAvionics(_p: WindTurbineParams): DesignModule {
  const controlSys = makeSubModule('turbine_controller', 'turbine controller', 'orchestrates',
    'pitch + yaw + brake + grid-tie via real-time PLC with anemometer and grid-sync feedback',
    [
      word('turbine_plc_word', 'turbine PLC',
        cc('turbine_plc', 'turbine PLC', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Bachmann M1 series'), mod('regulatory', 'IEC 61400-25')]),
      word('anemometer_word', 'anemometer',
        cc('anemometer', 'anemometer', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('form', 'ultrasonic sonic 3D'), mod('regulatory', 'IEC 61400-12-1')]),
      word('wind_vane_word', 'wind vane',
        cc('wind_vane', 'wind vane', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('form', 'redundant')]),
      word('vibration_sensor_word', 'vibration sensor',
        cc('vibration_sensor', 'vibration sensor', 'electromechanical_switching_function', 'ceramic'),
        [mod('quantity', '×3'), mod('form', 'IEPE accelerometer'), mod('regulatory', 'IEC 60721-3-3')]),
      word('uninterruptible_psu_word', 'UPS',
        cc('uninterruptible_psu', 'uninterruptible PSU', 'electrochemical_energy_function', 'lithium_iron_phosphate_chemistry'),
        [mod('quantity', '×1'), mod('capacity', '1.5', 'kWh'), mod('form', 'rack UPS')]),
    ])
  return {
    module: 'control_avionics',
    module_brief: 'Bachmann M1 PLC orchestrates pitch/yaw/brake/converter with redundant ultrasonic anemometer, wind vane and 3-axis vibration condition-monitoring sensors.',
    overview_paragraph_en: '',
    derived_parameters: { anemometer_count: 2, wind_vane_count: 2, vibration_sensor_count: 3 },
    allowed_radicals: ['silicon_semiconductor_function', 'electromechanical_switching_function', 'electrochemical_energy_function', 'lithium_iron_phosphate_chemistry', 'polymer_thermoplastic', 'ceramic'],
    applicability_confidence: 'high',
    sub_modules: [controlSys],
  }
}

function emitFoundation(p: WindTurbineParams): DesignModule {
  const foundation = makeSubModule('reinforced_foundation', 'reinforced foundation', 'anchors',
    `${p.totalMassKg.toFixed(0)} kg turbine + overturning moment to ground via reinforced concrete pad`,
    [
      word('concrete_foundation_pad_word', p.isOffshore ? 'monopile foundation' : 'concrete foundation pad',
        cc('concrete_foundation_pad', p.isOffshore ? 'monopile foundation' : 'concrete foundation pad', null, p.isOffshore ? 'steel' : 'concrete'),
        [mod('quantity', '×1'), mod('form', p.isOffshore ? 'driven monopile (S355G10+N steel)' : 'C30/37 reinforced gravity base'), mod('dimension', p.foundationDimText), mod('capacity', p.foundationVolumeM3.toFixed(0), 'm³'), mod('regulatory', p.isOffshore ? 'DNV-ST-0126' : 'EN 1992-1-1')]),
      word('anchor_cage_word', 'anchor cage',
        cc('anchor_cage', 'anchor cage', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×1'), mod('form', `${p.anchorBoltCount}× M${p.ratedPowerKw < 200 ? '36' : p.ratedPowerKw < 2000 ? '48' : '64'} 10.9 grade bolts`), mod('regulatory', 'EN 1090-2'), mod('capacity', (p.totalRotorMassKg + p.nacelleMassKg).toFixed(0), 'kg static + overturning')]),
      word('foundation_rebar_word', 'foundation rebar',
        cc('foundation_rebar', 'foundation rebar', null, 'steel'),
        [mod('quantity', '×1'), mod('form', 'B500B 16-25 mm'), mod('capacity', p.foundationRebarKg.toFixed(0), 'kg'), mod('dimension', '120 kg/m³ ratio')]),
      word('ground_grid_word', 'ground grid',
        cc('ground_grid', 'ground grid', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×1'), mod('form', 'copper mesh 35 mm²'), mod('regulatory', 'IEC 62305')]),
    ])
  return {
    module: 'foundation',
    module_brief: '7×7×1.5 m reinforced concrete pad (C30/37) with 48× M48 anchor bolt cage and lightning earth-mesh — sized per EN 1992-1-1 and IEC 61400-2.',
    overview_paragraph_en: '',
    derived_parameters: { pad_volume_m3: 73.5 },
    allowed_radicals: ['concrete', 'steel', 'electromechanical_switching_function', 'electrical_conducting_function', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [foundation],
  }
}

function emitRegulatoryCertification(_p: WindTurbineParams): DesignModule {
  const cert = makeSubModule('regulatory_signage', 'regulatory signage', 'documents',
    'IEC 61400-2 design + MCS012 install + G99 grid + EN 50549 compliance via plates and inspection records',
    [
      word('iec_61400_2_plate_word', 'IEC 61400-2 plate',
        cc('iec_61400_2_plate', 'IEC 61400-2 design certificate plate', null, 'aluminium'),
        [mod('quantity', '×1'), mod('regulatory', 'IEC 61400-2'), mod('form', 'engraved 200×120 mm')]),
      word('mcs_certificate_word', 'MCS certificate',
        cc('mcs_certificate', 'MCS certificate', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'MCS012'), mod('form', 'laminated A4')]),
      word('g99_protection_plate_word', 'G99 protection plate',
        cc('g99_protection_plate', 'G99 protection plate', null, 'aluminium'),
        [mod('quantity', '×1'), mod('regulatory', 'ENA G99/3-3'), mod('form', 'engraved')]),
      word('safety_signage_kit_word', 'safety signage kit',
        cc('safety_signage_kit', 'safety signage kit', null, 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('regulatory', 'EN ISO 7010'), mod('form', '6-piece HV + working-at-height')]),
    ])
  return {
    module: 'regulatory_certification',
    module_brief: 'Mandatory regulatory plates + records: IEC 61400-2 design certificate, MCS012 micro-gen install, ENA G99 grid protection, EN ISO 7010 safety pictograms.',
    overview_paragraph_en: '',
    derived_parameters: { mandatory_count: 5 },
    allowed_radicals: ['aluminium', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [cert],
  }
}

function emitTransportLogistics(p: WindTurbineParams): DesignModule {
  const transport = makeSubModule('transport_package', 'transport package', 'handles',
    `${p.totalMassKg.toFixed(0)} kg turbine in modular shipment with crane-rated lift gear and oversize-load escort`,
    [
      word('blade_transport_cradle_word', 'blade transport cradle',
        cc('blade_transport_cradle', 'blade transport cradle', null, 'steel'),
        [mod('quantity', fmtQty(p.bladeCount)), mod('form', 'padded saddle'), mod('dimension', (p.rotorDiameterM / 2 + 1).toFixed(1), 'm')]),
      word('nacelle_skid_word', 'nacelle skid',
        cc('nacelle_skid', 'nacelle skid', null, 'steel'),
        [mod('quantity', '×1'), mod('capacity', (p.ratedPowerKw * 25 + p.ratedPowerKw * 18).toFixed(0), 'kg')]),
      word('tower_section_word', 'tower section',
        cc('tower_section', 'tower section', null, 'steel'),
        [mod('quantity', fmtQty(Math.max(2, Math.ceil(p.hubHeightM / 12)))), mod('dimension', '12', 'm'), mod('form', 'tubular sections')]),
      word('lifting_lug_set_word', 'lifting lug set',
        cc('lifting_lug_set', 'lifting lug set', 'electromechanical_switching_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'M48 certified eye bolts'), mod('regulatory', 'BS EN 1677')]),
    ])
  return {
    module: 'transport_logistics',
    module_brief: `Modular transport — ${p.bladeCount} blade cradles, nacelle skid, ${Math.max(2, Math.ceil(p.hubHeightM / 12))} tower sections + certified lifting eyes per BS EN 1677.`,
    overview_paragraph_en: '',
    derived_parameters: { tower_section_count: Math.max(2, Math.ceil(p.hubHeightM / 12)) },
    allowed_radicals: ['steel', 'electromechanical_switching_function'],
    applicability_confidence: 'high',
    sub_modules: [transport],
  }
}

function emitMonitoringScada(_p: WindTurbineParams): DesignModule {
  const monitoring = makeSubModule('scada_telemetry', 'SCADA telemetry', 'reports',
    'operational + meteorological + grid data to remote O&M via IEC 61400-25 SCADA protocol',
    [
      word('scada_gateway_word', 'SCADA gateway',
        cc('scada_gateway', 'SCADA gateway', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Beckhoff IPC + IEC 61400-25 OPC-UA')]),
      word('lte_modem_word', 'LTE modem',
        cc('lte_modem', 'LTE modem', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', '4G CAT-M1'), mod('regulatory', 'RED')]),
      word('met_station_word', 'met station',
        cc('met_station', 'met station', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'temperature/humidity/pressure'), mod('regulatory', 'WMO 8')]),
      word('condition_monitoring_pickup_word', 'condition monitoring pickup',
        cc('condition_monitoring_pickup', 'condition monitoring pickup', 'electromechanical_switching_function', 'ceramic'),
        [mod('quantity', fmtQty(6)), mod('form', 'gearbox + bearing accelerometers'), mod('regulatory', 'ISO 10816-21')]),
    ])
  return {
    module: 'monitoring_SCADA',
    module_brief: 'IEC 61400-25 SCADA via Beckhoff IPC and 4G CAT-M1 modem; 6× ISO 10816-21 condition-monitoring accelerometers + met station for predictive maintenance.',
    overview_paragraph_en: '',
    derived_parameters: { condition_monitoring_sensors: 6 },
    allowed_radicals: ['silicon_semiconductor_function', 'electromechanical_switching_function', 'polymer_thermoplastic', 'ceramic'],
    applicability_confidence: 'high',
    sub_modules: [monitoring],
  }
}

function emitCrossModuleGrammarLinks(p: WindTurbineParams) {
  return [
    { from_module: 'rotor_blades', to_module: 'hub_pitch', mechanism: 'mechanical', type: 'mutual' as const, detail: 'blade root bolted to hub flange' },
    { from_module: 'hub_pitch', to_module: 'gearbox_drivetrain', mechanism: 'mechanical', type: 'directional' as const, detail: `low-speed shaft at ${p.rotorRpm} rpm` },
    { from_module: 'gearbox_drivetrain', to_module: 'generator', mechanism: 'mechanical', type: 'directional' as const, detail: `high-speed shaft at ${p.generatorRpm} rpm` },
    { from_module: 'generator', to_module: 'converter_grid_tie', mechanism: 'electrical_bus', type: 'mutual' as const, detail: `${p.ratedPowerKw} kW variable-frequency` },
    { from_module: 'converter_grid_tie', to_module: 'tower_yaw', mechanism: 'electrical_bus', type: 'directional' as const, detail: `${p.acContinuousA.toFixed(0)} A AC down-tower` },
    { from_module: 'control_avionics', to_module: 'hub_pitch', mechanism: 'control', type: 'directional' as const, detail: 'pitch command via slip rings' },
    { from_module: 'control_avionics', to_module: 'tower_yaw', mechanism: 'control', type: 'directional' as const, detail: 'yaw command' },
    { from_module: 'control_avionics', to_module: 'converter_grid_tie', mechanism: 'control', type: 'mutual' as const, detail: 'torque + grid sync' },
    { from_module: 'foundation', to_module: 'tower_yaw', mechanism: 'mechanical', type: 'mutual' as const, detail: 'M48 anchor cage at base flange' },
    { from_module: 'monitoring_SCADA', to_module: 'control_avionics', mechanism: 'data', type: 'mutual' as const, detail: 'IEC 61400-25 OPC-UA' },
    { from_module: 'monitoring_SCADA', to_module: 'gearbox_drivetrain', mechanism: 'data', type: 'directional' as const, detail: 'condition-monitoring accelerometers' },
  ]
}

export const windTurbineEmitter: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveParams(contract as ContractInProgress)
  return {
    modules: [
      emitRotorBlades(p),
      emitHubPitch(p),
      emitGearboxDrivetrain(p),
      emitGenerator(p),
      emitConverterGridTie(p),
      emitTowerYaw(p),
      emitControlAvionics(p),
      emitFoundation(p),
      emitRegulatoryCertification(p),
      emitTransportLogistics(p),
      emitMonitoringScada(p),
    ],
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: '11-module taxonomy spans rotor through grid + foundation + regulatory for small/medium horizontal-axis wind turbines per IEC 61400-2.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Generate ${p.ratedPowerKw} kW rated AC from a ${p.rotorDiameterM.toFixed(0)} m rotor at ${p.hubHeightM.toFixed(0)} m hub height per IEC 61400-2, with grid-code G99 + EN 50549 compliance and capacity factor ≥${q(contract, 'capacity_factor_pct', 30).toFixed(0)}%.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('wind_turbine', windTurbineEmitter)
