/**
 * scripts/lib/orchestrator/emitters/propulsion_thruster_product.ts
 *
 * Deterministic emitter for propulsion_thruster_product (standalone product).
 *
 * 8 modules (mapped to 14-module canonical taxonomy):
 *   1. mass_fluid_transport_process (thruster_assembly)
 *   2. energy_storage_source (propellant_tank_feed_system)
 *   3. energy_conversion_transduction (power_processing_unit)
 *   4. environmental_interface (thermal_management)
 *   5. control_compute_communication (controller_software)
 *   6. safety_protection (qualification_environment)
 *   7. structure_containment (integration_interface)
 *   8. maintenance_serviceability (regulatory_basis)
 *
 * Industry references:
 *   - Busek BHT-200, BHT-1500
 *   - Apollo Constellation iodine Hall
 *   - ThrustMe NPT30-I2 iodine ion
 *   - Aerojet MR-103 / MR-401
 *   - Bradford ECAPS HPGP
 *   - Sitael HT-5k
 */

import { registerAssembler } from '../assembler'
import type { ClassEmitter, DesignJSON, DesignModule } from '../assembler'
import type { BriefEnvelope, ContractInProgress, ParsedConstraints } from '../types'
import { qs, mod, cc, word, makeSubModule, fmtQty, buildDesignJSON } from './_shared-satellite'

interface ThrusterParams {
  thrustN: number
  ispS: number
  propellantClass: number  // 1=cold_gas, 2=monoprop, 3=biprop, 4=electric
  thrusterInputPowerW: number
  propellantTankVolumeL: number
  propellantTankMassKg: number
  chamberFlameTempK: number
  qualRandomVibRmsG: number
  qualRandomVibPeakG: number
  mountStressMpa: number
  mountSafetyFactor: number
  totalSystemMassKg: number
  achievableDeltaVMs: number
}

function deriveParams(c: ContractInProgress): ThrusterParams {
  return {
    thrustN: qs(c, 'thruster_thrust_n', qs(c, 'thrust_n', 22)),
    ispS: qs(c, 'thruster_isp_s', qs(c, 'isp_s', 220)),
    propellantClass: qs(c, 'propellant_class', 2),
    thrusterInputPowerW: qs(c, 'thruster_input_power_w', 0),
    propellantTankVolumeL: qs(c, 'propellant_tank_volume_l', 5),
    propellantTankMassKg: qs(c, 'propellant_tank_mass_kg', 1.5),
    chamberFlameTempK: qs(c, 'chamber_flame_temp_k', 1100),
    qualRandomVibRmsG: qs(c, 'qual_random_vib_rms_g', 14),
    qualRandomVibPeakG: qs(c, 'qual_random_vib_peak_g', 42),
    mountStressMpa: qs(c, 'mount_stress_mpa', 320),
    mountSafetyFactor: qs(c, 'mount_safety_factor', 2.65),
    totalSystemMassKg: qs(c, 'total_system_mass_kg', 6.4),
    achievableDeltaVMs: qs(c, 'achievable_delta_v_ms', 100),
  }
}

function propellantName(c: number): string {
  return c === 1 ? 'butane (cold gas)' : c === 2 ? 'hydrazine (monoprop)' : c === 3 ? 'MMH/MON3 (bipropellant)' : 'xenon (electric)'
}
function propellantTypeShort(c: number): string {
  return c === 1 ? 'cold_gas' : c === 2 ? 'monopropellant' : c === 3 ? 'bipropellant' : 'electric_hall'
}

// 1. THRUSTER ASSEMBLY (maps to mass_fluid_transport_process)
function emitThrusterAssembly(p: ThrusterParams): DesignModule {
  const electric = p.propellantClass === 4
  const thrusterAsm = makeSubModule('thruster_core', `thruster core (${propellantTypeShort(p.propellantClass)})`, 'imparts',
    `${p.thrustN.toFixed(electric ? 3 : 1)} N thrust at Isp ${p.ispS.toFixed(0)} s using ${propellantName(p.propellantClass)}`,
    [
      word('thruster_assembly_word', 'thruster assembly',
        cc('thruster_assembly', electric ? 'Hall-effect / ion thruster' : 'chemical thruster',
           electric ? 'electric_acceleration_function' : 'mass_ejection_function',
           electric ? 'boron_nitride' : 'inconel_625'),
        [mod('quantity', '×1'), mod('capacity', p.thrustN.toFixed(electric ? 3 : 1), 'N'),
         mod('form', electric ? 'Hall-effect thruster' : (p.propellantClass === 2 ? 'monopropellant thruster' : 'bipropellant thruster')),
         mod('regulatory', 'AIAA S-080 / ECSS-E-ST-35-06')]),
      word('thrust_chamber_word', 'thrust chamber',
        cc('thrust_chamber', 'thrust chamber + nozzle',
           electric ? 'electric_acceleration_function' : 'mass_ejection_function',
           electric ? 'graphite' : 'inconel_625'),
        [mod('quantity', '×1'),
         mod('dimension', electric ? '100' : '50', 'mm Ø'),
         mod('form', electric ? 'BN ceramic discharge channel' : 'columbium niobium chamber')]),
      word('nozzle_word', 'nozzle',
        cc('nozzle', 'expansion nozzle',
           electric ? 'electric_acceleration_function' : 'mass_ejection_function',
           electric ? 'graphite' : 'columbium_niobium_alloy'),
        [mod('quantity', '×1'),
         mod('dimension', electric ? '60' : '100', ': 1 expansion ratio'),
         mod('form', electric ? 'extended graphite' : 'radiatively-cooled niobium')]),
      ...(electric ? [
        word('hollow_cathode_word', 'hollow cathode',
          cc('hollow_cathode', 'BaO-W hollow cathode', 'electric_acceleration_function', 'tungsten'),
          [mod('quantity', '×2'), mod('form', 'redundant cathode'), mod('capacity', '5', 'A discharge')]),
        word('magnetic_circuit_word', 'magnetic circuit',
          cc('magnetic_circuit', 'electromagnet pole + return ring', 'magnetic_coupling_function', 'iron'),
          [mod('quantity', '×1'), mod('form', 'inner + outer coil')]),
      ] : [
        word('catalyst_bed_word', 'catalyst bed',
          cc('catalyst_bed', p.propellantClass === 2 ? 'iridium catalyst bed' : 'spark ignition chamber',
             'mass_ejection_function', p.propellantClass === 2 ? 'iridium' : 'tungsten'),
          [mod('quantity', '×1'), mod('form', p.propellantClass === 2 ? 'Shell 405 Ir/Al2O3' : 'spark plug + ignition train')]),
      ]),
    ])

  return {
    module: 'mass_fluid_transport_process',
    module_brief: `${propellantTypeShort(p.propellantClass)} thruster delivers ${p.thrustN.toFixed(electric ? 3 : 1)} N at Isp ${p.ispS.toFixed(0)} s; ${electric ? 'BN ceramic discharge channel + redundant hollow cathodes + electromagnetic circuit' : 'columbium chamber + radiatively-cooled niobium nozzle' + (p.propellantClass === 2 ? ' + iridium catalyst bed' : ' + spark ignition train')}.`,
    overview_paragraph_en: '',
    derived_parameters: { thrust_n: p.thrustN, isp_s: p.ispS, propellant_class: p.propellantClass },
    allowed_radicals: electric
      ? ['electric_acceleration_function', 'magnetic_coupling_function', 'boron_nitride', 'graphite', 'tungsten', 'iron']
      : ['mass_ejection_function', 'inconel_625', 'columbium_niobium_alloy', 'iridium'],
    applicability_confidence: 'high',
    sub_modules: [thrusterAsm],
  }
}

// 2. PROPELLANT TANK + FEED SYSTEM (energy_storage_source)
function emitPropellantTankFeedSystem(p: ThrusterParams): DesignModule {
  const electric = p.propellantClass === 4
  const propTank = makeSubModule('propellant_tank_feed', 'propellant tank + feed', 'stores',
    `${p.propellantTankVolumeL.toFixed(1)} L tank @ ${electric ? '100' : (p.propellantClass === 1 ? '6' : '22')} bar with feed valves + pressure transducer`,
    [
      word('propellant_tank_word', 'propellant tank',
        cc('propellant_tank', `${propellantName(p.propellantClass)} tank`, null, electric ? 'titanium_alloy' : 'aluminium_alloy'),
        [mod('quantity', '×1'), mod('capacity', p.propellantTankVolumeL.toFixed(1), 'L'),
         mod('form', electric ? 'Ti-6Al-4V COPV' : 'Al-6061 COPV with PMD'),
         mod('regulatory', 'AIAA S-080 / ECSS-E-ST-32-02')]),
      word('isolation_valve_word', 'isolation valve',
        cc('isolation_valve', 'isolation latch valve', 'mechanical_release_function', 'stainless_steel'),
        [mod('quantity', '×2'), mod('form', 'Moog 51-104 (redundant)')]),
      word('flow_control_valve_word', 'flow control valve',
        cc('flow_control_valve', 'flow control valve', 'fluid_metering_function', 'stainless_steel'),
        [mod('quantity', '×1'), mod('form', electric ? 'Bradford XFC xenon flow controller' : 'Moog proportional valve')]),
      word('pressure_transducer_word', 'pressure transducer',
        cc('pressure_transducer', 'tank pressure transducer', 'pressure_sensing_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×2'), mod('tolerance', '±0.5', '%')]),
      word('fill_drain_valve_word', 'fill/drain valve',
        cc('fill_drain_valve', 'fill/drain valve', 'mechanical_release_function', 'stainless_steel'),
        [mod('quantity', '×1'), mod('form', 'manual ground-only valve')]),
    ])
  return {
    module: 'energy_storage_source',
    module_brief: `${p.propellantTankVolumeL.toFixed(1)} L ${electric ? 'Ti-6Al-4V xenon COPV @ 100 bar' : (p.propellantClass === 1 ? 'Al-6061 butane COPV @ 6 bar' : 'PMD-equipped Al tank @ 22 bar')}; redundant Moog latch valves + ${electric ? 'Bradford XFC xenon flow controller' : 'Moog proportional flow valve'} + dual pressure transducers + ground fill/drain valve.`,
    overview_paragraph_en: '',
    derived_parameters: { tank_volume_l: p.propellantTankVolumeL, tank_mass_kg: p.propellantTankMassKg, propellant_class: p.propellantClass },
    allowed_radicals: ['mechanical_release_function', 'fluid_metering_function', 'pressure_sensing_function', electric ? 'titanium_alloy' : 'aluminium_alloy', 'stainless_steel'],
    applicability_confidence: 'high',
    sub_modules: [propTank],
  }
}

// 3. PPU — POWER PROCESSING UNIT (energy_conversion_transduction)
function emitPowerProcessingUnit(p: ThrusterParams): DesignModule {
  const electric = p.propellantClass === 4
  const ppu = makeSubModule('ppu_assembly', electric ? 'power processing unit' : 'thruster electronics', 'regulates',
    electric
      ? `${p.thrusterInputPowerW.toFixed(0)} W PPU drives anode HV + cathode + magnetic coils`
      : 'drives latch + flow valves + catalyst heater',
    [
      word(electric ? 'ep_ppu_power_processing_unit_word' : 'thruster_drive_electronics_word',
           electric ? 'EP PPU word' : 'thruster drive electronics',
        cc(electric ? 'ep_ppu_power_processing_unit' : 'thruster_drive_electronics',
           electric ? 'EP power processing unit' : 'thruster drive electronics',
           'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'),
         mod('capacity', electric ? p.thrusterInputPowerW.toFixed(0) : '30', 'W'),
         mod('form', electric ? 'anode HV converter + cathode keeper' : 'valve drivers + heater controller'),
         mod('regulatory', 'MIL-STD-461')]),
      word('input_filter_word', 'input EMI filter',
        cc('input_filter', 'input EMI filter', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×1'), mod('form', 'common-mode + differential filter')]),
      word('emc_enclosure_word', 'EMC enclosure',
        cc('emc_enclosure', 'EMC-shielded enclosure', 'electromagnetic_shielding_function', 'aluminium_alloy'),
        [mod('quantity', '×1'), mod('form', 'milled Al-6061 with gasket seal'), mod('regulatory', 'MIL-STD-461 RE102')]),
    ])
  return {
    module: 'energy_conversion_transduction',
    module_brief: electric
      ? `${p.thrusterInputPowerW.toFixed(0)} W PPU provides anode high-voltage (300 V) + cathode keeper + magnetic coil currents to the Hall thruster; EMC-shielded Al enclosure per MIL-STD-461 RE102; input EMI filter rejects common-mode + differential noise.`
      : `Drive electronics power latch valves, proportional flow valve, and catalyst-bed pre-heater; EMC-shielded enclosure per MIL-STD-461 RE102 with common-mode + differential input filter.`,
    overview_paragraph_en: '',
    derived_parameters: { input_power_w: electric ? p.thrusterInputPowerW : 30 },
    allowed_radicals: ['silicon_semiconductor_function', 'electromagnetic_shielding_function', 'electrical_conducting_function', 'aluminium_alloy', 'copper', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [ppu],
  }
}

// 4. THERMAL MANAGEMENT (environmental_interface)
function emitThermalManagement(p: ThrusterParams): DesignModule {
  const electric = p.propellantClass === 4
  const thermal = makeSubModule('thermal_management', 'thermal management', 'manages',
    `cools chamber at ${p.chamberFlameTempK.toFixed(0)} K and PPU dissipation`,
    [
      word('radiative_heat_shield_word', 'radiative heat shield',
        cc('radiative_heat_shield', 'radiative heat shield', 'thermal_radiation_function', 'molybdenum'),
        [mod('quantity', '×1'), mod('form', 'Mo radiative shield'),
         mod('regulatory', 'survives ' + p.chamberFlameTempK.toFixed(0) + ' K chamber temperature')]),
      word('thermal_isolator_word', 'thermal isolator',
        cc('thermal_isolator', 'thermal isolator', 'thermal_insulation_function', 'ceramic'),
        [mod('quantity', '×8'), mod('form', 'Macor ceramic standoff')]),
      word('cold_plate_word', 'PPU cold plate',
        cc('cold_plate', 'PPU cold plate', 'thermal_transfer_function', 'aluminium_alloy'),
        [mod('quantity', '×1'), mod('form', 'Al-6061 cold plate'),
         mod('capacity', electric ? '30' : '10', 'W heat rejection')]),
      word('survival_heater_word', 'propellant line survival heater',
        cc('survival_heater', 'propellant line survival heater', 'thermal_emission_function', 'nichrome'),
        [mod('quantity', '×4'), mod('capacity', '3', 'W each'),
         mod('regulatory', 'prevents propellant freeze')]),
    ])
  return {
    module: 'environmental_interface',
    module_brief: `Manages chamber adiabatic temperature of ${p.chamberFlameTempK.toFixed(0)} K via molybdenum radiative heat shield + 8 Macor ceramic thermal isolators; aluminium cold plate rejects ${electric ? 30 : 10} W of PPU dissipation; 4 thin-film survival heaters guard propellant lines.`,
    overview_paragraph_en: '',
    derived_parameters: { chamber_temp_k: p.chamberFlameTempK },
    allowed_radicals: ['thermal_radiation_function', 'thermal_insulation_function', 'thermal_transfer_function', 'thermal_emission_function', 'molybdenum', 'ceramic', 'aluminium_alloy', 'nichrome'],
    applicability_confidence: 'high',
    sub_modules: [thermal],
  }
}

// 5. CONTROLLER SOFTWARE (control_compute_communication)
function emitControllerSoftware(_p: ThrusterParams): DesignModule {
  const controller = makeSubModule('controller_software', 'controller software', 'commands',
    'CAN bus + RS-422 interface to spacecraft OBC; closed-loop chamber/cathode monitoring',
    [
      word('controller_mcu_word', 'controller MCU',
        cc('controller_mcu', 'rad-tolerant MCU', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'),
         mod('form', 'cold-redundant Microsemi PolarFire'),
         mod('regulatory', 'TID >50 krad')]),
      word('can_bus_transceiver_word', 'CAN bus transceiver',
        cc('can_bus_transceiver', 'CAN bus transceiver', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('form', 'TJA1051'),
         mod('regulatory', 'CAN 2.0B / ECSS-E-ST-50-15')]),
      word('rs422_serial_word', 'RS-422 serial',
        cc('rs422_serial', 'RS-422 serial interface', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'redundant pair')]),
      word('telemetry_logger_word', 'telemetry logger',
        cc('telemetry_logger', 'telemetry logger', 'software_protocol_function', 'software'),
        [mod('quantity', '×1'),
         mod('form', '1 Hz @ 64 channels (anode current, voltage, mass flow, temperatures)')]),
    ])
  return {
    module: 'control_compute_communication',
    module_brief: 'Cold-redundant Microsemi PolarFire rad-tolerant MCUs run closed-loop thrust control; CAN 2.0B + RS-422 interfaces to spacecraft OBC; 1 Hz telemetry logger captures 64 channels (anode current, voltage, mass flow, chamber + cathode temperatures).',
    overview_paragraph_en: '',
    derived_parameters: { mcu_count: 2, telemetry_channels: 64 },
    allowed_radicals: ['silicon_semiconductor_function', 'software_protocol_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [controller],
  }
}

// 6. QUALIFICATION ENVIRONMENT (safety_protection)
function emitQualificationEnvironment(p: ThrusterParams): DesignModule {
  const qual = makeSubModule('qualification_envelope', 'qualification envelope', 'documents',
    `random vibration ${p.qualRandomVibRmsG.toFixed(0)} g RMS / ${p.qualRandomVibPeakG.toFixed(0)} g peak + thermal/vac qual`,
    [
      word('random_vibration_qualification_word', 'random vibration qualification',
        cc('random_vibration_qualification', 'random vibration qualification', 'mechanical_test_function', 'documentation'),
        [mod('quantity', '×1'),
         mod('capacity', `${p.qualRandomVibRmsG.toFixed(0)}`, 'g RMS'),
         mod('regulatory', 'NASA GEVS-SE / GSFC-STD-7000')]),
      word('thermal_vacuum_qualification_word', 'thermal vacuum qualification',
        cc('thermal_vacuum_qualification', 'thermal vacuum qualification', 'mechanical_test_function', 'documentation'),
        [mod('quantity', '×1'),
         mod('capacity', '−40 to +85', '°C, 1e-6 mbar'),
         mod('regulatory', 'ECSS-E-ST-10-03')]),
      word('shock_qualification_word', 'shock qualification',
        cc('shock_qualification', 'pyrotechnic shock qualification', 'mechanical_test_function', 'documentation'),
        [mod('quantity', '×1'), mod('capacity', '4000', 'g pyroshock')]),
      word('emi_qualification_word', 'EMI qualification',
        cc('emi_qualification', 'EMI/EMC qualification', 'mechanical_test_function', 'documentation'),
        [mod('quantity', '×1'),
         mod('regulatory', 'MIL-STD-461 + ECSS-E-ST-20-07')]),
      word('life_test_qualification_word', 'life test qualification',
        cc('life_test_qualification', 'life test (5000 hr / 50,000 cycles)', 'mechanical_test_function', 'documentation'),
        [mod('quantity', '×1'),
         mod('regulatory', '5,000 hr accumulated thrust + 50,000 cycles')]),
    ])
  return {
    module: 'safety_protection',
    module_brief: `Full qualification envelope: random vibration to NASA GEVS-SE (${p.qualRandomVibRmsG.toFixed(0)} g RMS / ${p.qualRandomVibPeakG.toFixed(0)} g peak), thermal-vacuum (−40 to +85 °C @ 1e-6 mbar), 4,000 g pyrotechnic shock, MIL-STD-461 EMI/EMC, and 5,000 hr / 50,000 cycle life test.`,
    overview_paragraph_en: '',
    derived_parameters: { qual_rms_g: p.qualRandomVibRmsG, qual_peak_g: p.qualRandomVibPeakG, life_hours: 5000 },
    allowed_radicals: ['mechanical_test_function'],
    applicability_confidence: 'high',
    sub_modules: [qual],
  }
}

// 7. INTEGRATION INTERFACE (structure_containment)
function emitIntegrationInterface(p: ThrusterParams): DesignModule {
  const mount = makeSubModule('mounting_bracket', 'mounting bracket', 'attaches',
    `Al-7075 bracket to customer bus, mount safety factor ${p.mountSafetyFactor.toFixed(2)}× at ${p.mountStressMpa.toFixed(0)} MPa stress`,
    [
      word('mounting_bracket_word', 'mounting bracket',
        cc('mounting_bracket', 'mounting bracket', 'mechanical_load_bearing_function', 'aluminium_alloy'),
        [mod('quantity', '×1'),
         mod('form', 'machined Al-7075-T7351'),
         mod('regulatory', `FEA SF=${p.mountSafetyFactor.toFixed(2)}`)]),
      word('alignment_pin_word', 'alignment pin',
        cc('alignment_pin', 'alignment pin', 'mechanical_load_bearing_function', 'stainless_steel'),
        [mod('quantity', '×4'), mod('dimension', '4', 'mm Ø')]),
      word('thermal_break_word', 'thermal break',
        cc('thermal_break', 'GFRP thermal break washer', 'thermal_insulation_function', 'gfrp'),
        [mod('quantity', '×8'), mod('form', 'GFRP washer')]),
      word('icd_documentation_word', 'ICD documentation',
        cc('icd_documentation', 'interface control document', 'software_protocol_function', 'documentation'),
        [mod('quantity', '×1'), mod('form', 'mechanical + electrical + propellant fluid ICD')]),
    ])
  return {
    module: 'structure_containment',
    module_brief: `Machined Al-7075-T7351 mounting bracket with 4 alignment pins + 8 GFRP thermal break washers; FEA shows ${p.mountStressMpa.toFixed(0)} MPa stress at qual envelope giving ${p.mountSafetyFactor.toFixed(2)}× safety factor. Mechanical + electrical + propellant fluid ICD ships with the product.`,
    overview_paragraph_en: '',
    derived_parameters: { mount_safety_factor: p.mountSafetyFactor, mount_stress_mpa: p.mountStressMpa },
    allowed_radicals: ['mechanical_load_bearing_function', 'thermal_insulation_function', 'software_protocol_function', 'aluminium_alloy', 'stainless_steel', 'gfrp'],
    applicability_confidence: 'high',
    sub_modules: [mount],
  }
}

// 8. REGULATORY BASIS (maintenance_serviceability)
function emitRegulatoryBasis(_p: ThrusterParams): DesignModule {
  const reg = makeSubModule('regulatory_basis', 'regulatory basis', 'demonstrates',
    'AS9100D quality + ITAR controls + REACH compliance',
    [
      word('as9100d_quality_system_word', 'AS9100D quality system',
        cc('as9100d_quality_system', 'AS9100D quality management system', 'software_protocol_function', 'documentation'),
        [mod('quantity', '×1'),
         mod('regulatory', 'AS9100D / SAE 9100')]),
      word('itar_export_control_word', 'ITAR export control',
        cc('itar_export_control', 'ITAR export control compliance', 'software_protocol_function', 'documentation'),
        [mod('quantity', '×1'),
         mod('regulatory', '22 CFR 121 USML Cat XV')]),
      word('reach_rohs_compliance_word', 'REACH / RoHS compliance',
        cc('reach_rohs_compliance', 'REACH + RoHS compliance', 'software_protocol_function', 'documentation'),
        [mod('quantity', '×1'),
         mod('regulatory', 'EC 1907/2006 + 2011/65/EU')]),
      word('mil_spec_traceability_word', 'MIL-spec traceability',
        cc('mil_spec_traceability', 'MIL-spec material traceability', 'software_protocol_function', 'documentation'),
        [mod('quantity', '×1'),
         mod('regulatory', 'MIL-STD-130N')]),
    ])
  return {
    module: 'maintenance_serviceability',
    module_brief: 'AS9100D-certified quality management system; ITAR export control (22 CFR 121 USML Cat XV); REACH + RoHS compliance (EC 1907/2006 + 2011/65/EU); MIL-STD-130N material traceability for all aerospace parts.',
    overview_paragraph_en: '',
    derived_parameters: { as9100d: 1, itar: 1, reach: 1 },
    allowed_radicals: ['software_protocol_function'],
    applicability_confidence: 'high',
    sub_modules: [reg],
  }
}

function emitCrossModuleGrammarLinks(p: ThrusterParams): unknown[] {
  return [
    { from_module: 'energy_storage_source', to_module: 'mass_fluid_transport_process', mechanism: 'propellant_feed', type: 'directional', detail: `${p.propellantTankVolumeL.toFixed(1)} L tank feeds thruster` },
    { from_module: 'energy_conversion_transduction', to_module: 'mass_fluid_transport_process', mechanism: 'power_to_thruster', type: 'directional', detail: 'PPU provides anode HV + cathode + coil currents' },
    { from_module: 'control_compute_communication', to_module: 'energy_conversion_transduction', mechanism: 'control_signal', type: 'directional', detail: 'controller commands PPU + flow valve' },
    { from_module: 'environmental_interface', to_module: 'mass_fluid_transport_process', mechanism: 'thermal', type: 'mutual', detail: 'heat shield + propellant heating' },
    { from_module: 'safety_protection', to_module: 'mass_fluid_transport_process', mechanism: 'qualification', type: 'directional', detail: 'qual envelope sets design margins' },
    { from_module: 'structure_containment', to_module: 'mass_fluid_transport_process', mechanism: 'mechanical_mount', type: 'directional', detail: 'mounting bracket mates thruster to host bus' },
    { from_module: 'maintenance_serviceability', to_module: 'structure_containment', mechanism: 'regulatory', type: 'directional', detail: 'AS9100D + ITAR documentation' },
  ]
}

const emit: ClassEmitter = (contract: ContractInProgress, _brief: ParsedConstraints, _envelope: BriefEnvelope): DesignJSON => {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitThrusterAssembly(p),
    emitPropellantTankFeedSystem(p),
    emitPowerProcessingUnit(p),
    emitThermalManagement(p),
    emitControllerSoftware(p),
    emitQualificationEnvironment(p),
    emitIntegrationInterface(p),
    emitRegulatoryBasis(p),
  ]
  return buildDesignJSON(
    modules,
    emitCrossModuleGrammarLinks(p),
    `Deliver an AS9100D-qualified ${propellantTypeShort(p.propellantClass)} thruster product (${p.totalSystemMassKg.toFixed(1)} kg all-up) producing ${p.thrustN.toFixed(p.propellantClass === 4 ? 3 : 1)} N at Isp ${p.ispS.toFixed(0)} s using ${propellantName(p.propellantClass)}; qualified to NASA GEVS-SE random vibration + 5,000 hr life with ITAR + REACH + MIL-STD-130N traceability.`,
  )
}

registerAssembler('propulsion_thruster_product', emit)
