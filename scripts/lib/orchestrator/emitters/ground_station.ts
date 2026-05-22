/**
 * scripts/lib/orchestrator/emitters/ground_station.ts
 *
 * Deterministic emitter for ground_station (Earth-segment satellite station).
 *
 * 10 modules (mapped to 14-module canonical taxonomy):
 *   1. structure_containment        (antenna_dish_pedestal)
 *   2. mass_fluid_transport_process (az_el_drive_mechanism)
 *   3. energy_conversion_transduction (RF_chain_LNA_HPA)
 *   4. control_compute_communication (baseband_modem)
 *   5. operator_interface            (network_storage + control_room_HMI)
 *   6. environmental_interface       (weather_radome)
 *   7. energy_storage_source         (grid_power_UPS)
 *   8. safety_protection             (building_HVAC + lightning protection)
 *   9. maintenance_serviceability    (regulatory_site)
 *  10. power_distribution            (cable harness + grounding)
 *
 * Industry references:
 *   - Mynaric Condor inter-sat link
 *   - SES O3b mPOWER ground gateway
 *   - General Dynamics SATCOM
 *   - Kongsberg Tampnet polar antennae
 *   - Vertex / Cobham 3-12m C/Ku/Ka dishes
 */

import { registerAssembler } from '../assembler'
import type { ClassEmitter, DesignJSON, DesignModule } from '../assembler'
import type { BriefEnvelope, ContractInProgress, ParsedConstraints } from '../types'
import { qs, mod, cc, word, makeSubModule, fmtQty, buildDesignJSON } from './_shared-satellite'

interface GroundStationParams {
  antennaDiamM: number
  frequencyGhz: number
  eirpDbw: number
  gtDbk: number
  uplinkDataRateMbps: number
  uplinkLinkMarginDb: number
  hpaDissipationKw: number
  hpaEfficiencyPct: number
  cabinetCoolingKw: number
  controlRoomHvacKw: number
  enclosureEmcMarginDb: number
  groundingResistanceOhms: number
  siteTransformerKva: number
  totalSystemMassKg: number
}

function deriveParams(c: ContractInProgress): GroundStationParams {
  return {
    antennaDiamM: qs(c, 'antenna_diameter_m', 3.7),
    frequencyGhz: qs(c, 'frequency_band_ghz', 10.7),
    eirpDbw: qs(c, 'eirp_dbw', 60),
    gtDbk: qs(c, 'gt_db_per_k', 30),
    uplinkDataRateMbps: qs(c, 'uplink_data_rate_mbps', 110),
    uplinkLinkMarginDb: qs(c, 'uplink_link_margin_db', 5),
    hpaDissipationKw: qs(c, 'hpa_dissipation_kw', 4),
    hpaEfficiencyPct: qs(c, 'hpa_efficiency_pct', 92),
    cabinetCoolingKw: qs(c, 'cabinet_cooling_capacity_kw', 5),
    controlRoomHvacKw: qs(c, 'control_room_hvac_kw', 25),
    enclosureEmcMarginDb: qs(c, 'enclosure_emc_margin_db', 60),
    groundingResistanceOhms: qs(c, 'grounding_resistance_ohms', 1.2),
    siteTransformerKva: qs(c, 'site_transformer_kva', 100),
    totalSystemMassKg: qs(c, 'total_system_mass_kg', 8500),
  }
}

function bandName(freqGhz: number): string {
  if (freqGhz < 2) return 'L-band'
  if (freqGhz < 4) return 'S-band'
  if (freqGhz < 8) return 'C-band'
  if (freqGhz < 12) return 'X-band'
  if (freqGhz < 18) return 'Ku-band'
  return 'Ka-band'
}

// 1. ANTENNA DISH + PEDESTAL (structure_containment)
function emitAntennaDishPedestal(p: GroundStationParams): DesignModule {
  const dish = makeSubModule('antenna_dish_pedestal', 'antenna dish + pedestal', 'directs',
    `${p.antennaDiamM.toFixed(1)} m parabolic reflector on AZ-EL pedestal, G/T ${p.gtDbk.toFixed(0)} dB/K`,
    [
      word('antenna_reflector_word', 'antenna reflector',
        cc('antenna_reflector', 'parabolic reflector dish', 'radio_frequency_function', 'aluminium_alloy'),
        [mod('quantity', '×1'), mod('dimension', p.antennaDiamM.toFixed(1), 'm aperture'),
         mod('form', `Vertex / Cobham ${bandName(p.frequencyGhz)} dish`),
         mod('regulatory', 'ITU-R S.580 sidelobe pattern')]),
      word('feed_horn_word', 'feed horn',
        cc('feed_horn', `${bandName(p.frequencyGhz)} feed horn`, 'radio_frequency_function', 'aluminium_alloy'),
        [mod('quantity', '×1'), mod('form', 'corrugated dual-polarised feed'),
         mod('capacity', p.frequencyGhz.toFixed(1), 'GHz')]),
      word('sub_reflector_word', 'sub-reflector',
        cc('sub_reflector', 'Cassegrain sub-reflector', 'radio_frequency_function', 'aluminium_alloy'),
        [mod('quantity', '×1'), mod('form', 'CFRP-backed Al hyperboloid')]),
      word('reflector_back_structure_word', 'reflector back structure',
        cc('reflector_back_structure', 'reflector back structure', 'mechanical_load_bearing_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'space-frame truss')]),
      word('pedestal_kingpost_word', 'pedestal kingpost',
        cc('pedestal_kingpost', 'kingpost pedestal', 'mechanical_load_bearing_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'fabricated steel kingpost'),
         mod('regulatory', 'AS/NZS 1170 wind loading')]),
      word('foundation_pad_word', 'foundation pad',
        cc('foundation_pad', 'concrete foundation pad', 'mechanical_load_bearing_function', 'concrete'),
        [mod('quantity', '×1'), mod('dimension', '3', 'm Ø × 1.2 m'),
         mod('form', 'reinforced concrete with anchor bolts')]),
    ])
  return {
    module: 'structure_containment',
    module_brief: `${p.antennaDiamM.toFixed(1)} m parabolic reflector with corrugated dual-polarised ${bandName(p.frequencyGhz)} feed horn and Cassegrain sub-reflector on space-frame back structure; fabricated steel kingpost pedestal on reinforced-concrete foundation pad sized for AS/NZS 1170 wind loading.`,
    overview_paragraph_en: '',
    derived_parameters: { antenna_diameter_m: p.antennaDiamM, frequency_ghz: p.frequencyGhz, gt_db_k: p.gtDbk },
    allowed_radicals: ['radio_frequency_function', 'mechanical_load_bearing_function', 'aluminium_alloy', 'steel', 'concrete'],
    applicability_confidence: 'high',
    sub_modules: [dish],
  }
}

// 2. AZ-EL DRIVE MECHANISM (mass_fluid_transport_process — actuation)
function emitAzElDriveMechanism(_p: GroundStationParams): DesignModule {
  const drive = makeSubModule('az_el_drive', 'azimuth-elevation drive mechanism', 'tracks',
    'AZ-EL motors + slip rings + worm gearbox track satellites at ±0.005° pointing accuracy',
    [
      word('az_drive_motor_word', 'azimuth drive motor',
        cc('az_drive_motor', 'AC servo azimuth motor', 'mechanical_rotation_function', 'steel'),
        [mod('quantity', '×1'), mod('capacity', '2.2', 'kW'),
         mod('form', 'Bosch Rexroth IndraDyn S')]),
      word('el_drive_motor_word', 'elevation drive motor',
        cc('el_drive_motor', 'AC servo elevation motor', 'mechanical_rotation_function', 'steel'),
        [mod('quantity', '×1'), mod('capacity', '1.8', 'kW'),
         mod('form', 'Bosch Rexroth IndraDyn S')]),
      word('az_worm_gearbox_word', 'AZ worm gearbox',
        cc('az_worm_gearbox', 'AZ worm gearbox', 'mechanical_rotation_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'Sumitomo Cyclo gearbox'),
         mod('regulatory', 'AGMA 2001 class')]),
      word('el_worm_gearbox_word', 'EL worm gearbox',
        cc('el_worm_gearbox', 'EL worm gearbox', 'mechanical_rotation_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'Sumitomo Cyclo gearbox')]),
      word('absolute_encoder_word', 'absolute encoder',
        cc('absolute_encoder', 'absolute encoder', 'mechanical_sensing_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×2'),
         mod('tolerance', '±0.005', '°'),
         mod('form', 'Heidenhain ROC 7000')]),
      word('slip_ring_word', 'RF slip ring',
        cc('slip_ring', 'RF slip ring assembly', 'electrical_conducting_function', 'gold'),
        [mod('quantity', '×1'), mod('form', 'Schleifring Ka-band rotary joint')]),
      word('cable_wrap_word', 'cable wrap',
        cc('cable_wrap', 'cable wrap drum', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×1'), mod('form', 'wrap-around cable management')]),
    ])
  return {
    module: 'mass_fluid_transport_process',
    module_brief: '2.2 kW AC servo azimuth + 1.8 kW elevation motors drive Sumitomo Cyclo worm gearboxes; Heidenhain ROC 7000 absolute encoders give ±0.005° pointing; Schleifring Ka-band rotary slip ring + cable wrap drum manage the rotating RF + data + power feeds.',
    overview_paragraph_en: '',
    derived_parameters: { az_motor_kw: 2.2, el_motor_kw: 1.8, encoder_resolution_deg: 0.005 },
    allowed_radicals: ['mechanical_rotation_function', 'mechanical_sensing_function', 'electrical_conducting_function', 'steel', 'gold', 'copper', 'silicon_semiconductor_function'],
    applicability_confidence: 'high',
    sub_modules: [drive],
  }
}

// 3. RF CHAIN — LNA + HPA (energy_conversion_transduction)
function emitRfChainLnaHpa(p: GroundStationParams): DesignModule {
  const rfChain = makeSubModule('rf_chain', 'RF chain (LNA + HPA + filters)', 'amplifies',
    `${bandName(p.frequencyGhz)} ${p.frequencyGhz.toFixed(1)} GHz uplink HPA + LNA chain ${p.eirpDbw.toFixed(0)} dBW EIRP`,
    [
      word('low_noise_amplifier_word', 'low-noise amplifier',
        cc('low_noise_amplifier', `${bandName(p.frequencyGhz)} LNA`, 'radio_frequency_function', 'gallium_arsenide_semiconductor'),
        [mod('quantity', '×2'),
         mod('form', 'cryocooled (or peltier-cooled) GaAs HEMT LNA'),
         mod('tolerance', '1.0', 'dB NF')]),
      word('high_power_amplifier_word', 'high-power amplifier',
        cc('high_power_amplifier', `${bandName(p.frequencyGhz)} HPA`, 'radio_frequency_function', 'gallium_nitride_semiconductor'),
        [mod('quantity', '×2'),
         mod('capacity', '500', 'W'),
         mod('form', `Cobham SSPA or Thales TWTA, redundant 1:1`)]),
      word('block_upconverter_word', 'block upconverter',
        cc('block_upconverter', 'block upconverter (BUC)', 'radio_frequency_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×1'),
         mod('form', 'L-band IF → Ku-band RF')]),
      word('block_downconverter_word', 'block downconverter',
        cc('block_downconverter', 'block downconverter (LNB)', 'radio_frequency_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×1'),
         mod('form', 'Ku-band → L-band IF')]),
      word('waveguide_filter_word', 'waveguide filter',
        cc('waveguide_filter', 'waveguide bandpass filter', 'radio_frequency_function', 'waveguide_metal'),
        [mod('quantity', '×4'), mod('form', 'WR-75 / WR-42 bandpass')]),
      word('coaxial_cable_word', 'coaxial cable',
        cc('coaxial_cable', 'flexible coaxial cable', 'radio_frequency_function', 'copper'),
        [mod('quantity', '×1 run'), mod('form', 'low-loss Andrew LDF4-50A')]),
    ])
  return {
    module: 'energy_conversion_transduction',
    module_brief: `Redundant ${bandName(p.frequencyGhz)} RF chain: 2× cryocooled GaAs HEMT LNAs (1.0 dB NF) + 2× 500 W GaN SSPAs (or Thales TWTAs) on 1:1 redundancy switch + L-band BUC/LNB up/down converters + WR-75/WR-42 waveguide filters + Andrew LDF4-50A low-loss coaxial run. EIRP ${p.eirpDbw.toFixed(0)} dBW, G/T ${p.gtDbk.toFixed(0)} dB/K, HPA efficiency ${p.hpaEfficiencyPct.toFixed(0)} %.`,
    overview_paragraph_en: '',
    derived_parameters: { eirp_dbw: p.eirpDbw, gt_db_k: p.gtDbk, hpa_efficiency_pct: p.hpaEfficiencyPct },
    allowed_radicals: ['radio_frequency_function', 'gallium_arsenide_semiconductor', 'gallium_nitride_semiconductor', 'silicon_semiconductor_function', 'waveguide_metal', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [rfChain],
  }
}

// 4. BASEBAND MODEM (control_compute_communication)
function emitBasebandModem(p: GroundStationParams): DesignModule {
  const modem = makeSubModule('baseband_modem', 'baseband modem', 'encodes',
    `${p.uplinkDataRateMbps.toFixed(0)} Mbps DVB-S2X uplink with adaptive coding + modulation`,
    [
      word('dvb_s2x_modulator_word', 'DVB-S2X modulator',
        cc('dvb_s2x_modulator', 'DVB-S2X modulator', 'software_protocol_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×1'),
         mod('form', 'Newtec MDM6100 / Comtech CDM-840'),
         mod('regulatory', 'ETSI EN 302 307-2')]),
      word('forward_error_correction_word', 'FEC encoder',
        cc('forward_error_correction', 'LDPC + BCH FEC encoder', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'),
         mod('form', 'LDPC R=3/4 + BCH outer code')]),
      word('test_loop_translator_word', 'test loop translator',
        cc('test_loop_translator', 'test loop translator', 'radio_frequency_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×1'),
         mod('form', 'L-band loopback IFL test')]),
      word('mediation_router_word', 'mediation router',
        cc('mediation_router', 'IP mediation router', 'software_protocol_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×2'),
         mod('form', 'Cisco ASR-9000 + redundant')]),
    ])
  return {
    module: 'control_compute_communication',
    module_brief: `Newtec MDM6100 / Comtech CDM-840 DVB-S2X modulator with LDPC R=3/4 + BCH FEC delivers ${p.uplinkDataRateMbps.toFixed(0)} Mbps uplink; L-band test loop translator for closed-loop IFL test; redundant Cisco ASR-9000 mediation routers.`,
    overview_paragraph_en: '',
    derived_parameters: { uplink_data_rate_mbps: p.uplinkDataRateMbps },
    allowed_radicals: ['software_protocol_function', 'radio_frequency_function', 'silicon_semiconductor_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [modem],
  }
}

// 5. NETWORK + STORAGE + CONTROL ROOM HMI (operator_interface)
function emitNetworkStorageHmi(_p: GroundStationParams): DesignModule {
  const ctrl = makeSubModule('control_room_hmi', 'control room HMI + network + storage', 'monitors',
    'redundant operator consoles + 10 GbE backbone + LTO-9 archive',
    [
      word('operator_console_word', 'operator console',
        cc('operator_console', 'operator console', 'optical_display_function', 'polymer_thermoplastic'),
        [mod('quantity', '×4'),
         mod('form', '4K monitor + KVM + UPS')]),
      word('ten_gbe_switch_word', '10 GbE switch',
        cc('ten_gbe_switch', '10 GbE backbone switch', 'electrical_switching_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×2'),
         mod('form', 'Cisco Catalyst 9500 redundant')]),
      word('nas_storage_word', 'NAS storage',
        cc('nas_storage', 'NAS storage array', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'),
         mod('capacity', '480', 'TB raw'),
         mod('form', 'Synology / NetApp 24-bay')]),
      word('lto9_tape_archive_word', 'LTO-9 tape archive',
        cc('lto9_tape_archive', 'LTO-9 tape archive', 'magnetic_storage_function', 'magnetic_tape'),
        [mod('quantity', '×1'),
         mod('capacity', '288', 'TB raw'),
         mod('form', 'IBM TS3200 6-cartridge library')]),
      word('mission_monitoring_software_word', 'mission monitoring software',
        cc('mission_monitoring_software', 'mission monitoring software', 'software_protocol_function', 'software'),
        [mod('quantity', '×1'),
         mod('form', 'Kratos quantumSAT or in-house dashboards')]),
    ])
  return {
    module: 'operator_interface',
    module_brief: '4× operator consoles + redundant Cisco Catalyst 9500 10 GbE backbone + 480 TB Synology NAS for working store + 288 TB IBM TS3200 LTO-9 cold archive; Kratos quantumSAT mission monitoring software dashboards each carrier and link health.',
    overview_paragraph_en: '',
    derived_parameters: { console_count: 4, working_store_tb: 480, archive_tb: 288 },
    allowed_radicals: ['optical_display_function', 'electrical_switching_function', 'magnetic_storage_function', 'software_protocol_function', 'silicon_semiconductor_function', 'polymer_thermoplastic', 'magnetic_tape'],
    applicability_confidence: 'high',
    sub_modules: [ctrl],
  }
}

// 6. WEATHER RADOME (environmental_interface)
function emitWeatherRadome(p: GroundStationParams): DesignModule {
  const radome = makeSubModule('weather_radome', 'weather radome', 'shields',
    `${(p.antennaDiamM * 1.2).toFixed(1)} m sandwich radome protects dish from rain, ice, wind`,
    [
      word('radome_shell_word', 'radome shell',
        cc('radome_shell', 'sandwich-construction radome shell', 'radio_frequency_function', 'fibreglass_composite'),
        [mod('quantity', '×1'),
         mod('dimension', (p.antennaDiamM * 1.2).toFixed(1), 'm Ø'),
         mod('form', 'foam-core fibreglass sandwich'),
         mod('regulatory', 'wind loading per AS/NZS 1170')]),
      word('hydrophobic_coating_word', 'hydrophobic coating',
        cc('hydrophobic_coating', 'hydrophobic coating', 'chemical_repellent_function', 'fluoropolymer'),
        [mod('quantity', '×1'),
         mod('form', 'PTFE-based')]),
      word('de_icing_heater_word', 'de-icing heater',
        cc('de_icing_heater', 'de-icing heater elements', 'thermal_emission_function', 'nichrome'),
        [mod('quantity', '×8'),
         mod('capacity', '500', 'W each')]),
      word('lightning_air_terminal_word', 'lightning air terminal',
        cc('lightning_air_terminal', 'lightning air terminal', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×1'),
         mod('regulatory', 'IEEE 998 / NFPA 780')]),
    ])
  return {
    module: 'environmental_interface',
    module_brief: `${(p.antennaDiamM * 1.2).toFixed(1)} m foam-core fibreglass sandwich radome with PTFE-based hydrophobic coating + 8× 500W de-icing heater elements; lightning air terminal per IEEE 998 + NFPA 780. Sized for AS/NZS 1170 wind loading.`,
    overview_paragraph_en: '',
    derived_parameters: { radome_diameter_m: p.antennaDiamM * 1.2, de_icing_power_kw: 4 },
    allowed_radicals: ['radio_frequency_function', 'chemical_repellent_function', 'thermal_emission_function', 'electrical_conducting_function', 'fibreglass_composite', 'fluoropolymer', 'nichrome', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [radome],
  }
}

// 7. GRID POWER + UPS (energy_storage_source)
function emitGridPowerUps(p: GroundStationParams): DesignModule {
  const power = makeSubModule('grid_power_ups', 'grid power + UPS', 'powers',
    `${p.siteTransformerKva.toFixed(0)} kVA grid feed + 60-min UPS + diesel backup`,
    [
      word('site_transformer_word', 'site transformer',
        cc('site_transformer', 'site MV transformer 11kV/400V', 'magnetic_coupling_function', 'copper'),
        [mod('quantity', '×1'),
         mod('capacity', p.siteTransformerKva.toFixed(0), 'kVA'),
         mod('form', 'dry-type Dyn11'),
         mod('regulatory', 'IEC 60076')]),
      word('main_switchboard_word', 'main switchboard',
        cc('main_switchboard', 'main 400V switchboard', 'electrical_switching_function', 'copper'),
        [mod('quantity', '×1'),
         mod('form', 'ABB Tmax + Emax breakers + RCD'),
         mod('regulatory', 'IEC 61439-2')]),
      word('ups_unit_word', 'UPS unit',
        cc('ups_unit', 'on-line double-conversion UPS', 'electrical_conducting_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×2'),
         mod('capacity', '80', 'kVA each'),
         mod('form', 'Schneider Galaxy VS redundant pair'),
         mod('regulatory', 'IEC 62040')]),
      word('battery_string_word', 'UPS battery string',
        cc('battery_string', 'UPS battery string', 'electrochemical_energy_function', 'lithium_iron_phosphate_chemistry'),
        [mod('quantity', '×2'),
         mod('capacity', '60', 'min runtime each'),
         mod('form', 'LFP rack battery')]),
      word('diesel_generator_word', 'diesel generator',
        cc('diesel_generator', 'diesel backup generator', 'chemical_combustion_function', 'steel'),
        [mod('quantity', '×1'),
         mod('capacity', '150', 'kVA prime'),
         mod('form', 'Cummins QSB / FG Wilson')]),
      word('automatic_transfer_switch_word', 'ATS',
        cc('automatic_transfer_switch', 'automatic transfer switch', 'electrical_switching_function', 'copper'),
        [mod('quantity', '×1'),
         mod('form', 'ASCO 7000-series ATS')]),
    ])
  return {
    module: 'energy_storage_source',
    module_brief: `${p.siteTransformerKva.toFixed(0)} kVA dry-type Dyn11 transformer feeds ABB Tmax/Emax main switchboard; redundant Schneider Galaxy VS UPS (2× 80 kVA) with 60-min LFP battery string + 150 kVA Cummins diesel backup on ASCO 7000 ATS.`,
    overview_paragraph_en: '',
    derived_parameters: { transformer_kva: p.siteTransformerKva, ups_kva: 80, diesel_kva: 150, ups_runtime_min: 60 },
    allowed_radicals: ['magnetic_coupling_function', 'electrical_switching_function', 'electrical_conducting_function', 'electrochemical_energy_function', 'chemical_combustion_function', 'copper', 'lithium_iron_phosphate_chemistry', 'silicon_semiconductor_function', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [power],
  }
}

// 8. BUILDING HVAC + LIGHTNING PROTECTION (safety_protection)
function emitBuildingHvacLightning(p: GroundStationParams): DesignModule {
  const safety = makeSubModule('building_hvac_lightning', 'building HVAC + lightning protection', 'protects',
    `${p.controlRoomHvacKw.toFixed(0)} kW HVAC + IEEE 998 lightning grid ${p.groundingResistanceOhms.toFixed(1)} Ω`,
    [
      word('chiller_word', 'chiller',
        cc('chiller', 'air-cooled chiller', 'thermal_transfer_function', 'aluminium_alloy'),
        [mod('quantity', '×2'),
         mod('capacity', (p.controlRoomHvacKw / 2).toFixed(0), 'kW each'),
         mod('form', 'Daikin / York redundant pair'),
         mod('regulatory', 'EN 14511 + F-gas')]),
      word('air_handling_unit_word', 'AHU',
        cc('air_handling_unit', 'air handling unit', 'mass_fluid_function', 'aluminium_alloy'),
        [mod('quantity', '×2'),
         mod('form', 'Trane CSAA with EC fans')]),
      word('fire_suppression_word', 'fire suppression',
        cc('fire_suppression', 'gaseous fire suppression', 'chemical_inhibition_function', 'fluoroketone'),
        [mod('quantity', '×1'),
         mod('form', '3M Novec 1230 clean agent'),
         mod('regulatory', 'NFPA 2001')]),
      word('lightning_protection_grid_word', 'lightning protection grid',
        cc('lightning_protection_grid', 'IEEE 998 lightning protection grid', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×1'),
         mod('form', `${p.groundingResistanceOhms.toFixed(1)} Ω earth resistance, copper-clad rods + bonded grid`),
         mod('regulatory', 'IEEE 998 + NFPA 780')]),
      word('surge_protection_device_word', 'SPD',
        cc('surge_protection_device', 'surge protection device', 'electrical_switching_function', 'metal_oxide_varistor'),
        [mod('quantity', '×8'),
         mod('form', 'Type 1+2 SPD per panel'),
         mod('regulatory', 'IEC 61643-11')]),
    ])
  return {
    module: 'safety_protection',
    module_brief: `Redundant Daikin air-cooled chillers (2× ${(p.controlRoomHvacKw / 2).toFixed(0)} kW) with Trane CSAA AHUs cool control room; 3M Novec 1230 clean-agent fire suppression per NFPA 2001; IEEE 998 lightning protection grid achieves ${p.groundingResistanceOhms.toFixed(1)} Ω earth resistance; 8 Type 1+2 SPDs per IEC 61643-11.`,
    overview_paragraph_en: '',
    derived_parameters: { chiller_count: 2, hvac_kw: p.controlRoomHvacKw, grounding_ohms: p.groundingResistanceOhms },
    allowed_radicals: ['thermal_transfer_function', 'mass_fluid_function', 'chemical_inhibition_function', 'electrical_conducting_function', 'electrical_switching_function', 'aluminium_alloy', 'fluoroketone', 'copper', 'metal_oxide_varistor'],
    applicability_confidence: 'high',
    sub_modules: [safety],
  }
}

// 9. POWER DISTRIBUTION (cable harness + grounding) — explicit
function emitPowerDistribution(_p: GroundStationParams): DesignModule {
  const pdu = makeSubModule('site_power_distribution', 'site power distribution', 'distributes',
    'shielded cable runs + grounding mat + EMC bonding',
    [
      word('shielded_cable_run_word', 'shielded cable run',
        cc('shielded_cable_run', 'shielded MV/LV cable run', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×1 bundle'),
         mod('form', 'XLPE / EPR insulated, shielded'),
         mod('regulatory', 'BS 5467 / IEC 60502-1')]),
      word('grounding_mat_word', 'grounding mat',
        cc('grounding_mat', 'grounding mat under panel', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×1'),
         mod('form', 'IEEE 837 stamped mat')]),
      word('emc_bonding_strap_word', 'EMC bonding strap',
        cc('emc_bonding_strap', 'EMC bonding strap', 'electromagnetic_shielding_function', 'copper'),
        [mod('quantity', '×16'),
         mod('form', 'tinned-copper braid'),
         mod('regulatory', 'MIL-STD-464 bonding')]),
    ])
  return {
    module: 'power_distribution',
    module_brief: 'BS 5467 XLPE/EPR shielded MV/LV cable runs distribute power; IEEE 837 grounding mat under switchboard + 16 tinned-copper EMC bonding straps per MIL-STD-464.',
    overview_paragraph_en: '',
    derived_parameters: { bonding_strap_count: 16 },
    allowed_radicals: ['electrical_conducting_function', 'electromagnetic_shielding_function', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [pdu],
  }
}

// 10. REGULATORY SITE (maintenance_serviceability)
function emitRegulatorySite(_p: GroundStationParams): DesignModule {
  const reg = makeSubModule('regulatory_site', 'regulatory site licensing', 'documents',
    'FCC + ITU + national telecom regulator site licence + EMC certification',
    [
      word('fcc_part25_licence_word', 'FCC Part 25 licence',
        cc('fcc_part25_licence', 'FCC Part 25 satellite earth station licence', 'software_protocol_function', 'documentation'),
        [mod('quantity', '×1'),
         mod('regulatory', '47 CFR Part 25')]),
      word('itu_coordination_word', 'ITU coordination',
        cc('itu_coordination', 'ITU-R coordination filing', 'software_protocol_function', 'documentation'),
        [mod('quantity', '×1'),
         mod('regulatory', 'ITU-R Radio Regulations Article 9')]),
      word('national_telecom_licence_word', 'national telecom regulator licence',
        cc('national_telecom_licence', 'national telecom licence (e.g. Ofcom / FCC)', 'software_protocol_function', 'documentation'),
        [mod('quantity', '×1'),
         mod('regulatory', 'Ofcom / FCC / BNetzA / etc.')]),
      word('emc_emi_certification_word', 'EMC/EMI certification',
        cc('emc_emi_certification', 'EMC/EMI site certification', 'software_protocol_function', 'documentation'),
        [mod('quantity', '×1'),
         mod('regulatory', 'EN 301 489 + FCC Part 15')]),
      word('site_access_security_word', 'site access security',
        cc('site_access_security', 'site access security + perimeter', 'software_security_function', 'software'),
        [mod('quantity', '×1'),
         mod('form', '24/7 security + access control + CCTV'),
         mod('regulatory', 'ISO 27001 site security')]),
    ])
  return {
    module: 'maintenance_serviceability',
    module_brief: 'FCC Part 25 satellite earth station licence + ITU-R Article 9 coordination filing + national telecom regulator (Ofcom / FCC / BNetzA) operator licence; EN 301 489 + FCC Part 15 EMC/EMI site certification; ISO 27001 site security with 24/7 monitoring + access control + CCTV.',
    overview_paragraph_en: '',
    derived_parameters: { fcc_part25: 1, itu_filed: 1, iso27001: 1 },
    allowed_radicals: ['software_protocol_function', 'software_security_function'],
    applicability_confidence: 'high',
    sub_modules: [reg],
  }
}

function emitCrossModuleGrammarLinks(p: GroundStationParams): unknown[] {
  return [
    { from_module: 'structure_containment', to_module: 'mass_fluid_transport_process', mechanism: 'mechanical_mount', type: 'mutual', detail: 'dish mounts to AZ-EL pedestal' },
    { from_module: 'mass_fluid_transport_process', to_module: 'energy_conversion_transduction', mechanism: 'rf_feed', type: 'directional', detail: 'slip ring → RF chain' },
    { from_module: 'energy_conversion_transduction', to_module: 'control_compute_communication', mechanism: 'rf_to_if', type: 'mutual', detail: 'BUC/LNB up/down convert' },
    { from_module: 'control_compute_communication', to_module: 'operator_interface', mechanism: 'data_network', type: 'mutual', detail: '10 GbE backbone' },
    { from_module: 'environmental_interface', to_module: 'structure_containment', mechanism: 'mechanical_mount', type: 'directional', detail: `${(p.antennaDiamM * 1.2).toFixed(1)} m radome mounts to dish back structure` },
    { from_module: 'energy_storage_source', to_module: 'power_distribution', mechanism: 'ac_bus', type: 'mutual', detail: '400V LV bus' },
    { from_module: 'power_distribution', to_module: 'energy_conversion_transduction', mechanism: 'power_to_hpa', type: 'directional', detail: 'HPA primary power' },
    { from_module: 'safety_protection', to_module: 'energy_storage_source', mechanism: 'interlock', type: 'directional', detail: 'fire suppression cuts UPS + diesel' },
    { from_module: 'maintenance_serviceability', to_module: 'structure_containment', mechanism: 'regulatory', type: 'directional', detail: 'site licence + access control' },
    { from_module: 'operator_interface', to_module: 'safety_protection', mechanism: 'alarm', type: 'directional', detail: 'monitoring → fire / HVAC alarms' },
  ]
}

const emit: ClassEmitter = (contract: ContractInProgress, _brief: ParsedConstraints, _envelope: BriefEnvelope): DesignJSON => {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitAntennaDishPedestal(p),
    emitAzElDriveMechanism(p),
    emitRfChainLnaHpa(p),
    emitBasebandModem(p),
    emitNetworkStorageHmi(p),
    emitWeatherRadome(p),
    emitGridPowerUps(p),
    emitBuildingHvacLightning(p),
    emitPowerDistribution(p),
    emitRegulatorySite(p),
  ]
  return buildDesignJSON(
    modules,
    emitCrossModuleGrammarLinks(p),
    `Deliver a ${p.antennaDiamM.toFixed(1)} m ${bandName(p.frequencyGhz)} satellite ground station (${(p.totalSystemMassKg / 1000).toFixed(1)} t all-up site mass) with G/T ${p.gtDbk.toFixed(0)} dB/K, EIRP ${p.eirpDbw.toFixed(0)} dBW, ${p.uplinkDataRateMbps.toFixed(0)} Mbps DVB-S2X uplink, FCC Part 25 / ITU-coordinated site, 24/7 control room with redundant Schneider Galaxy VS UPS + Cummins diesel backup, and IEEE 998 lightning protection.`,
  )
}

registerAssembler('ground_station', emit)
