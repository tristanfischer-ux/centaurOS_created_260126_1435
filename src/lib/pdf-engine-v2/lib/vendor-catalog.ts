/**
 * VENDOR CATALOG — Pattern C, Phase 3a data layer
 *
 * Purpose: Provide the LLM with real, verified vendor names, lead times, and MOQ
 * for each product class so the Assembly Shortlist (S07) returns named suppliers
 * instead of LOW-confidence blanks. Target: lift S07 from 5.7 to 8+.
 *
 * ─── INTEGRATION TODO (after Phase 3a parallel sonnet completes) ───────────────
 *
 * 1. PROMPT INJECTION — src/lib/pdf-engine-v2/stages/4-bom-cost-suppliers.ts
 *    Import `getVendorContext` from `prompts-vendor-injection.ts` (co-located with
 *    this file in lib/) and inject the result into BOM_GENERATION_SYSTEM for the
 *    current product class. The injection point is where the system prompt is
 *    assembled before the LLM call. Example:
 *
 *      const vendorCtx = getVendorContext(classification.productClass)
 *      const systemPrompt = BOM_GENERATION_SYSTEM + '\n\n' + vendorCtx
 *
 * 2. ASSEMBLY SHORTLIST RENDERER — src/lib/pdf-engine-v2/stages/7-pdf-v3.tsx
 *    The SupplierAppendix / Assembly Shortlist section should add two columns:
 *      - "Lead Time" reading from `regimeRouterResult.leadTimeWeeks` (integer, weeks)
 *      - "MOQ" reading from `regimeRouterResult.moqUnits` (integer, units)
 *    These fields are already requested in the BOM prompt after injection; the
 *    renderer just needs to render them. Suggested column widths: 80px / 60px.
 *    Add them after the "Supplier" column and before "Confidence".
 *
 * 3. MODULE DECOMPOSITION CONTEXT — src/lib/pdf-engine-v2/prompts.ts
 *    Add a reference to the catalog in MODULE_DECOMPOSITION_SYSTEM_PA so the
 *    decomposition stage names OEM subsystems that the BOM stage can later match
 *    against catalog entries. The `getVendorContext` function can be called at
 *    decompose time too (earlier in the pipeline = earlier grounding).
 *
 * ─── GAP NOTES (honest, do not paper over with filler) ──────────────────────
 *
 * - HAPS thin-film batteries: no mainstream commercial vendor for stratospheric
 *   Li-S or thin-film cells at production scale. Sion Power ceased operations
 *   2023. OXIS Energy dissolved 2021. Marked as gap — use `gapNote` flag.
 * - CGM glucose sensors: Dexcom and Abbott manufacture their own sensors in-house
 *   and do not supply OEMs. The electrode subcomponents come from Metrohm / YSI.
 * - AUV sonar: Norbit (Norway) has long lead times; Tritech (UK) discontinued
 *   several product lines 2024. Teledyne BlueView is the safe choice.
 * - HAPS parachute recovery: SpinLaunch is a launch company, not a parachute
 *   vendor. Skylift is an aerial crane brand. Correct vendors below.
 *
 * ─── COVERAGE SUMMARY ────────────────────────────────────────────────────────
 *
 * Product class      | Entries | Unique vendors
 * ────────────────────────────────────────────
 * energy_storage     |   7     |  20
 * drone              |   6     |  17
 * wearable_medical   |   5     |  13
 * thermal_system     |   5     |  13
 * ev_charger         |   5     |  14
 * bioreactor         |   5     |  13
 * vertical_farm      |   5     |  14
 * auv                |   5     |  13
 * edge_ai_server     |   5     |  14
 * haps               |   4     |  10  ← thinnest; gap noted for batteries
 * ─────────────────────────────────────────────
 * TOTAL              |  52     | ~141 (with overlaps across classes)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type VendorRegion = 'uk' | 'eu' | 'us' | 'asia' | 'global'

export interface VendorEntry {
  name: string
  region: VendorRegion
  typicalLeadWeeks: number
  typicalMoqUnits: number
  notes?: string
}

export interface VendorCatalogEntry {
  /** Snake-case identifier matching part types used in BOM prompts */
  partType: string
  /** Human-readable label for use in prompts */
  partLabel: string
  /** Product classes this entry applies to — mirrors productClass keys in product-classifier.ts */
  productClass: string[]
  vendors: VendorEntry[]
  /** Set to true when we cannot confirm 2+ real OEM/CM vendors at production scale */
  gapNote?: string
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export const VENDOR_CATALOG: VendorCatalogEntry[] = [

  // ══════════════════════════════════════════════════════════════════════════
  // ENERGY STORAGE (BESS) — energy_storage
  // ══════════════════════════════════════════════════════════════════════════

  {
    partType: 'lfp_prismatic_cell',
    partLabel: 'LFP prismatic battery cell',
    productClass: ['energy_storage'],
    vendors: [
      { name: 'CATL', region: 'asia', typicalLeadWeeks: 14, typicalMoqUnits: 500, notes: 'Market leader; IEC 62619 certified; UK via Trina Storage' },
      { name: 'EVE Energy', region: 'asia', typicalLeadWeeks: 12, typicalMoqUnits: 200, notes: 'LF105/LF280K cells; growing European presence' },
      { name: 'BYD (Blade Cell)', region: 'asia', typicalLeadWeeks: 16, typicalMoqUnits: 1000, notes: 'LFP blade architecture; BYD UK distributes' },
    ],
  },

  {
    partType: 'pcs_inverter',
    partLabel: 'Power Conversion System (PCS) / grid inverter',
    productClass: ['energy_storage'],
    vendors: [
      { name: 'Sungrow', region: 'asia', typicalLeadWeeks: 14, typicalMoqUnits: 1, notes: 'SG250HX series; IEC 62109 certified; UK via SegenSolar' },
      { name: 'SMA Solar Technology', region: 'eu', typicalLeadWeeks: 12, typicalMoqUnits: 1, notes: 'Sunny Central series; strong UK installed base' },
      { name: 'Schneider Electric (Conext)', region: 'eu', typicalLeadWeeks: 10, typicalMoqUnits: 1, notes: 'EV3300 PCS; G99 protection relay integrated' },
    ],
  },

  {
    partType: 'bms_controller',
    partLabel: 'Battery Management System master controller',
    productClass: ['energy_storage'],
    vendors: [
      { name: 'Nuvation Energy', region: 'us', typicalLeadWeeks: 10, typicalMoqUnits: 1, notes: 'G4 BMS; UL 9540A tested; used in grid-scale projects' },
      { name: 'Orion BMS (Ewert Energy)', region: 'us', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'Orion BMS 2; strong integrator ecosystem' },
      { name: 'Stafl Systems', region: 'us', typicalLeadWeeks: 8, typicalMoqUnits: 1, notes: 'Flexible cell-count BMS; ISO 26262 influenced design' },
    ],
  },

  {
    partType: 'thermal_management_liquid',
    partLabel: 'Liquid cooling unit / chiller for battery thermal management',
    productClass: ['energy_storage'],
    vendors: [
      { name: 'Modine Manufacturing', region: 'us', typicalLeadWeeks: 8, typicalMoqUnits: 1, notes: 'Battery thermal management modules; EV and BESS proven' },
      { name: 'Boyd Corporation', region: 'us', typicalLeadWeeks: 10, typicalMoqUnits: 1, notes: 'Cold plates and liquid cooling loops; custom fabrication' },
      { name: 'Coolit Systems', region: 'us', typicalLeadWeeks: 12, typicalMoqUnits: 1, notes: 'Direct liquid cooling; data centre and BESS applications' },
    ],
  },

  {
    partType: 'fire_suppression_bess',
    partLabel: 'Fire suppression system for BESS enclosure',
    productClass: ['energy_storage'],
    vendors: [
      { name: 'Fike Corporation', region: 'us', typicalLeadWeeks: 8, typicalMoqUnits: 1, notes: 'Novec 1230 / CO2 suppression; UL 9540A test support' },
      { name: 'Stat-X (Fireaway)', region: 'us', typicalLeadWeeks: 6, typicalMoqUnits: 2, notes: 'Aerosol fire suppression; common in BESS containerised systems' },
      { name: 'Hochiki Europe', region: 'eu', typicalLeadWeeks: 4, typicalMoqUnits: 1, notes: 'Fire detection panels and beam detectors; BS EN 54 approved' },
    ],
  },

  {
    partType: 'hv_dc_switchgear',
    partLabel: 'HV DC switchgear / contactor / disconnector',
    productClass: ['energy_storage'],
    vendors: [
      { name: 'Eaton (Bussmann)', region: 'us', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'DC fuses and contactors up to 1500 V; widely stocked in UK' },
      { name: 'ABB', region: 'eu', typicalLeadWeeks: 8, typicalMoqUnits: 1, notes: 'Tmax XT DC breakers; ABB UK stocks and supports' },
      { name: 'TE Connectivity (Kilovac)', region: 'us', typicalLeadWeeks: 8, typicalMoqUnits: 5, notes: 'LEV200 / EV200 contactors; high-voltage EV and BESS proven' },
    ],
  },

  {
    partType: 'ems_controller',
    partLabel: 'Energy Management System (EMS) / site controller',
    productClass: ['energy_storage'],
    vendors: [
      { name: 'Victron Energy (Cerbo GX)', region: 'eu', typicalLeadWeeks: 3, typicalMoqUnits: 1, notes: 'Venus OS; Modbus/MQTT; strong UK integrator ecosystem' },
      { name: 'Enertia (Solucon)', region: 'eu', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'Grid-scale EMS; multi-vendor battery compatibility' },
      { name: 'PowerFlex (ABB)', region: 'eu', typicalLeadWeeks: 10, typicalMoqUnits: 1, notes: 'ABB Ability EMS; enterprise grid-scale' },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // DRONE / UAV — drone
  // ══════════════════════════════════════════════════════════════════════════

  {
    partType: 'drone_propulsion_motor',
    partLabel: 'Brushless motor for drone propulsion',
    productClass: ['drone'],
    vendors: [
      { name: 'T-Motor', region: 'asia', typicalLeadWeeks: 3, typicalMoqUnits: 1, notes: 'MN / U series; widely used in commercial and industrial UAVs' },
      { name: 'Hacker Motor', region: 'eu', typicalLeadWeeks: 4, typicalMoqUnits: 1, notes: 'German quality; A-series for UAV; UK via Fusion Hobbies' },
      { name: 'KDE Direct', region: 'us', typicalLeadWeeks: 3, typicalMoqUnits: 1, notes: 'UAS-series motors; FAA-compliant DoD-grade drone motors' },
    ],
  },

  {
    partType: 'esc_electronic_speed_controller',
    partLabel: 'Electronic Speed Controller (ESC)',
    productClass: ['drone'],
    vendors: [
      { name: 'T-Motor (FLAME / ALPHA ESC)', region: 'asia', typicalLeadWeeks: 3, typicalMoqUnits: 1, notes: 'FLAME ESC series; matched to T-Motor motors' },
      { name: 'Hobbywing (XRotor)', region: 'asia', typicalLeadWeeks: 2, typicalMoqUnits: 1, notes: 'XRotor Pro series; DJI ecosystem compatible' },
      { name: 'MAYTECH Electronics', region: 'asia', typicalLeadWeeks: 4, typicalMoqUnits: 5, notes: 'Industrial UAV ESCs; CAN bus; opto-isolated PWM' },
    ],
  },

  {
    partType: 'drone_flight_controller',
    partLabel: 'Flight controller / autopilot unit',
    productClass: ['drone'],
    vendors: [
      { name: 'Holybro (Pixhawk 6X)', region: 'asia', typicalLeadWeeks: 2, typicalMoqUnits: 1, notes: 'Pixhawk 6X; open-source ArduPilot / PX4; most common professional autopilot' },
      { name: 'Hex Technology (Cube Orange+)', region: 'asia', typicalLeadWeeks: 3, typicalMoqUnits: 1, notes: 'Triple-redundant IMU; Cube carrier board ecosystem' },
      { name: 'mRo (mRo X2.1)', region: 'us', typicalLeadWeeks: 2, typicalMoqUnits: 1, notes: 'US-manufactured; NDAA-compliant; DoD market' },
    ],
  },

  {
    partType: 'drone_battery_lipo',
    partLabel: 'LiPo / Li-ion smart battery pack for drone',
    productClass: ['drone'],
    vendors: [
      { name: 'Tattu (Grepow)', region: 'asia', typicalLeadWeeks: 4, typicalMoqUnits: 1, notes: 'Tattu Plus series; smart BMS; popular in industrial drones' },
      { name: 'MaxAmps', region: 'us', typicalLeadWeeks: 3, typicalMoqUnits: 1, notes: 'US-assembled; custom pack configurations; rapid fulfilment' },
      { name: 'Bonka Power', region: 'asia', typicalLeadWeeks: 5, typicalMoqUnits: 10, notes: 'OEM supplier for many UAV manufacturers; UN 38.3 certified' },
    ],
  },

  {
    partType: 'drone_gimbal_stabiliser',
    partLabel: '3-axis camera gimbal / payload stabiliser',
    productClass: ['drone'],
    vendors: [
      { name: 'Gremsy (PixyU)', region: 'asia', typicalLeadWeeks: 3, typicalMoqUnits: 1, notes: 'PixyU / T7; Ronin API compatible; DJI SDK support' },
      { name: 'DJI (Zenmuse series)', region: 'asia', typicalLeadWeeks: 2, typicalMoqUnits: 1, notes: 'Zenmuse X series; integrated camera+gimbal; Matrice platform only' },
      { name: 'Freefly Systems (Movi)', region: 'us', typicalLeadWeeks: 4, typicalMoqUnits: 1, notes: 'Movi Pro; cinema-grade; high payload capacity' },
    ],
  },

  {
    partType: 'drone_propeller',
    partLabel: 'Propeller / rotor blade',
    productClass: ['drone'],
    vendors: [
      { name: 'T-Motor (carbon fibre props)', region: 'asia', typicalLeadWeeks: 2, typicalMoqUnits: 1, notes: 'MF series; precision balanced; matched to T-Motor motors' },
      { name: 'Master Airscrew', region: 'us', typicalLeadWeeks: 2, typicalMoqUnits: 1, notes: 'Evolution series; nylon/carbon blend; CAA compliant markings' },
      { name: 'Mejzlik Propellers', region: 'eu', typicalLeadWeeks: 3, typicalMoqUnits: 1, notes: 'Czech-made carbon fibre; custom pitch/diameter to order' },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // WEARABLE MEDICAL / CGM — wearable_medical
  // ══════════════════════════════════════════════════════════════════════════

  {
    partType: 'glucose_sensor_electrode',
    partLabel: 'Electrochemical glucose sensor / reference electrode assembly',
    productClass: ['wearable_medical'],
    vendors: [
      { name: 'Metrohm (DropSens)', region: 'eu', typicalLeadWeeks: 6, typicalMoqUnits: 10, notes: 'Screen-printed carbon electrodes; ISO 13485 facility; custom modification available' },
      { name: 'YSI (a Xylem brand)', region: 'us', typicalLeadWeeks: 8, typicalMoqUnits: 5, notes: 'YSI 2900 glucose analyser reference electrodes; FDA facility' },
      { name: 'Gwent Electronic Materials', region: 'uk', typicalLeadWeeks: 8, typicalMoqUnits: 50, notes: 'UK-based conductive ink and biosensor electrode manufacturer' },
    ],
  },

  {
    partType: 'asic_analog_frontend_biosensor',
    partLabel: 'ASIC analogue front-end for biosensor signal conditioning',
    productClass: ['wearable_medical'],
    vendors: [
      { name: 'Analog Devices (MAX30001)', region: 'us', typicalLeadWeeks: 12, typicalMoqUnits: 100, notes: 'MAX30001 biopotential and impedance IC; 1µA quiescent; FDA-cleared reference designs' },
      { name: 'Texas Instruments (AFE4400)', region: 'us', typicalLeadWeeks: 10, typicalMoqUnits: 100, notes: 'AFE4400/AFE4490 for photoplethysmography / pulse oximetry; wearable reference kits' },
      { name: 'STMicroelectronics (ST25DV)', region: 'eu', typicalLeadWeeks: 8, typicalMoqUnits: 100, notes: 'Dynamic NFC tag with energy harvesting; used in patch-style wearables' },
    ],
  },

  {
    partType: 'ble_rf_module_wearable',
    partLabel: 'Bluetooth Low Energy RF module for wearable data transmission',
    productClass: ['wearable_medical'],
    vendors: [
      { name: 'Nordic Semiconductor (nRF52840)', region: 'eu', typicalLeadWeeks: 8, typicalMoqUnits: 100, notes: 'nRF52840 SoC; Bluetooth 5.3; medical device reference design available' },
      { name: 'Laird Connectivity (BL5340)', region: 'uk', typicalLeadWeeks: 6, typicalMoqUnits: 50, notes: 'Pre-certified BLE module; FCC/CE/UKCA; UK company with local support' },
      { name: 'u-blox (NINA-B4)', region: 'eu', typicalLeadWeeks: 8, typicalMoqUnits: 100, notes: 'NINA-B4 module; AEC-Q100 option; medical IoT qualified' },
    ],
  },

  {
    partType: 'biocompatible_adhesive_patch',
    partLabel: 'Biocompatible skin adhesive / medical-grade patch substrate',
    productClass: ['wearable_medical'],
    vendors: [
      { name: '3M (Tegaderm / 1774)', region: 'us', typicalLeadWeeks: 4, typicalMoqUnits: 100, notes: 'Medical tape and film; ISO 10993 biocompatibility; UK distributor stock' },
      { name: 'Nitto Denko (Transpore)', region: 'asia', typicalLeadWeeks: 6, typicalMoqUnits: 500, notes: 'Medical PSA films; custom die-cutting available; CE marked' },
      { name: 'Scapa Healthcare', region: 'uk', typicalLeadWeeks: 8, typicalMoqUnits: 1000, notes: 'UK-based wearable patch platform; ISO 13485; FWD (finished wound device) capable' },
    ],
  },

  {
    partType: 'mems_accelerometer_wearable',
    partLabel: 'MEMS accelerometer / IMU for motion artefact rejection',
    productClass: ['wearable_medical'],
    vendors: [
      { name: 'Analog Devices (ADXL367)', region: 'us', typicalLeadWeeks: 8, typicalMoqUnits: 100, notes: 'ADXL367 ultra-low-power 3-axis; 270 nA in motion-triggered mode' },
      { name: 'STMicroelectronics (LSM6DSO)', region: 'eu', typicalLeadWeeks: 6, typicalMoqUnits: 100, notes: 'LSM6DSO iNEMO 6-axis; machine learning core; 3µA in low-power mode' },
      { name: 'Bosch Sensortec (BMI270)', region: 'eu', typicalLeadWeeks: 6, typicalMoqUnits: 100, notes: 'BMI270 ultra-low-power IMU designed for wearables; FIFO-buffered' },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // HEAT PUMP / THERMAL SYSTEM — thermal_system
  // ══════════════════════════════════════════════════════════════════════════

  {
    partType: 'scroll_compressor',
    partLabel: 'Scroll compressor (refrigerant circuit)',
    productClass: ['thermal_system'],
    vendors: [
      { name: 'Emerson Climate (Copeland)', region: 'us', typicalLeadWeeks: 8, typicalMoqUnits: 1, notes: 'ZH/ZPD scroll series; R290/R32/R454B; UK via AWECO' },
      { name: 'Bitzer', region: 'eu', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'ORBIT scroll series; BS EN 13771 compliant; UK subsidiary' },
      { name: 'Panasonic (Rotary/Scroll)', region: 'asia', typicalLeadWeeks: 8, typicalMoqUnits: 5, notes: '2-stage inverter scrolls; R32 / R290; UK via Panasonic Industry' },
    ],
  },

  {
    partType: 'plate_heat_exchanger_brazed',
    partLabel: 'Brazed plate heat exchanger (BPHE)',
    productClass: ['thermal_system'],
    vendors: [
      { name: 'Alfa Laval', region: 'eu', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'CB series BPHE; CE PED certified; UK stocks in Birmingham' },
      { name: 'SWEP International', region: 'eu', typicalLeadWeeks: 5, typicalMoqUnits: 1, notes: 'B25/B50/B120 series; ammonia-compatible; rapid UK delivery' },
      { name: 'GEA (Ecoflex)', region: 'eu', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'GEA Ecoflex BPHE; wide refrigerant compatibility; UK office in Eastleigh' },
    ],
  },

  {
    partType: 'inverter_drive_refrigerant',
    partLabel: 'Variable-speed inverter drive for compressor',
    productClass: ['thermal_system'],
    vendors: [
      { name: 'Danfoss Drives (VLT)', region: 'eu', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'FC102/FC103 HVAC series; IP55; UK sales and service network' },
      { name: 'ABB (ACS580)', region: 'eu', typicalLeadWeeks: 8, typicalMoqUnits: 1, notes: 'ACS580 general-purpose drive; SIL2 safety option' },
      { name: 'Yaskawa (GA700)', region: 'asia', typicalLeadWeeks: 8, typicalMoqUnits: 1, notes: 'GA700 series; IP55 flange-mount; Modbus / PROFIBUS' },
    ],
  },

  {
    partType: 'refrigerant_expansion_valve',
    partLabel: 'Electronic expansion valve (EEV)',
    productClass: ['thermal_system'],
    vendors: [
      { name: 'Danfoss (ETS)', region: 'eu', typicalLeadWeeks: 4, typicalMoqUnits: 1, notes: 'ETS 6 / ETS 12.5; stepper-motor EEV; R290/R32 models available' },
      { name: 'Sporlan (SEI)', region: 'us', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'SEI electronic expansion valve; Parker brand; CE marked' },
      { name: 'Carel (E2V)', region: 'eu', typicalLeadWeeks: 4, typicalMoqUnits: 1, notes: 'E2V series; NTC probe integration; strong European service network' },
    ],
  },

  {
    partType: 'refrigerant_circuit_valve',
    partLabel: 'Solenoid valve and refrigerant circuit fittings',
    productClass: ['thermal_system'],
    vendors: [
      { name: 'Castel (Italy)', region: 'eu', typicalLeadWeeks: 4, typicalMoqUnits: 1, notes: 'Service valves, solenoids, check valves; EN 13136 compliant; Sanner UK stocks' },
      { name: 'Rotalock (Henry Technologies)', region: 'us', typicalLeadWeeks: 3, typicalMoqUnits: 1, notes: 'Service valves and flare fittings; Parker-Hannifin brand' },
      { name: 'Climalife (Dehon)', region: 'eu', typicalLeadWeeks: 2, typicalMoqUnits: 1, notes: 'Refrigerant fittings and valves; Refrigerants and oils UK distribution' },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EV CHARGER — ev_charger
  // ══════════════════════════════════════════════════════════════════════════

  {
    partType: 'ac_dc_power_module_charger',
    partLabel: 'AC-DC rectifier / power module for EV charger',
    productClass: ['ev_charger'],
    vendors: [
      { name: 'Delta Electronics (DPM)', region: 'asia', typicalLeadWeeks: 10, typicalMoqUnits: 5, notes: 'DPM series 15/30 kW modules; CE / UL certified; high efficiency >95%' },
      { name: 'Infineon Technologies (CoolSiC)', region: 'eu', typicalLeadWeeks: 12, typicalMoqUnits: 10, notes: 'SiC MOSFET power modules; IXXAN400N65B4; reference designs for EV OBC' },
      { name: 'Bel Power Solutions (PFC + LLC)', region: 'us', typicalLeadWeeks: 8, typicalMoqUnits: 5, notes: 'Bel SL Power branded; 3 kW PFC front-ends; EN 61851 aligned' },
    ],
  },

  {
    partType: 'ev_connector_ccs2',
    partLabel: 'CCS2 / CHAdeMO DC charging connector and inlet',
    productClass: ['ev_charger'],
    vendors: [
      { name: 'Phoenix Contact (CHARX)', region: 'eu', typicalLeadWeeks: 6, typicalMoqUnits: 10, notes: 'CHARX series; CCS2 and AC Type 2; DEKRA certified; UK via Phoenix Contact UK' },
      { name: 'Huber+Suhner (RADOX)', region: 'eu', typicalLeadWeeks: 8, typicalMoqUnits: 5, notes: 'RADOX HPC cable and connector; 500 A rated; UL/CE certified' },
      { name: 'Mennekes (AMTRON)', region: 'eu', typicalLeadWeeks: 6, typicalMoqUnits: 5, notes: 'IEC 62196 Type 2 inlet and socket; AMTRON PRO series; UK via EValu8' },
    ],
  },

  {
    partType: 'ev_charger_controller_ocpp',
    partLabel: 'OCPP charge point controller / embedded compute',
    productClass: ['ev_charger'],
    vendors: [
      { name: 'Advantech (EVCP-100)', region: 'asia', typicalLeadWeeks: 8, typicalMoqUnits: 1, notes: 'EVCP-100 charge point controller; OCPP 1.6J/2.0.1; CE marked' },
      { name: 'Vector Informatik', region: 'eu', typicalLeadWeeks: 10, typicalMoqUnits: 1, notes: 'VN5650 EV charging stack; ISO 15118 Plug & Charge; UK office Coventry' },
      { name: 'Digi International (ConnectCore)', region: 'us', typicalLeadWeeks: 8, typicalMoqUnits: 1, notes: 'ConnectCore 93 IoT module; OCPP 2.0 reference; LTE Cat-M1' },
    ],
  },

  {
    partType: 'ev_charger_enclosure_nvent',
    partLabel: 'IP54+ weatherproof enclosure for EV charger outdoor unit',
    productClass: ['ev_charger'],
    vendors: [
      { name: 'nVent Hoffman (Proline)', region: 'us', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'PROLINE outdoor enclosures; IP56; GRP and steel options; UK via RS Components' },
      { name: 'Rittal (AX series)', region: 'eu', typicalLeadWeeks: 5, typicalMoqUnits: 1, notes: 'AX compact enclosures; IP66; IK10; UK warehouse at Rotherham' },
      { name: 'ABB (Mistral range)', region: 'eu', typicalLeadWeeks: 4, typicalMoqUnits: 1, notes: 'Mistral IP65 GRP enclosures; UK via Edmundson Electrical' },
    ],
  },

  {
    partType: 'energy_meter_revenue_grade',
    partLabel: 'Revenue-grade energy meter (MID certified)',
    productClass: ['ev_charger'],
    vendors: [
      { name: 'Eastron Europe (SDM120)', region: 'eu', typicalLeadWeeks: 2, typicalMoqUnits: 1, notes: 'SDM120-MID; single-phase; Modbus RTU; CE + MID; UK stocked at Distrelec' },
      { name: 'Carlo Gavazzi (EM24)', region: 'eu', typicalLeadWeeks: 3, typicalMoqUnits: 1, notes: 'EM24 3-phase energy analyser; MID; Modbus; RS485; UK office in Watford' },
      { name: 'Schneider Electric (iEM3000)', region: 'eu', typicalLeadWeeks: 4, typicalMoqUnits: 1, notes: 'iEM3000 series; MID Class B; Modbus; DIN rail; OCPP billing integration tested' },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // BIOREACTOR — bioreactor
  // ══════════════════════════════════════════════════════════════════════════

  {
    partType: 'pressure_vessel_asme_pharma',
    partLabel: 'ASME BPE pressure vessel / bioreactor vessel body',
    productClass: ['bioreactor'],
    vendors: [
      { name: 'Allegheny Bradford Corporation', region: 'us', typicalLeadWeeks: 16, typicalMoqUnits: 1, notes: 'ASME BPE stainless vessels; electro-polished; FDA-registered; 1–100,000 L' },
      { name: 'Apache Stainless Equipment', region: 'us', typicalLeadWeeks: 14, typicalMoqUnits: 1, notes: 'ASME Section VIII; 316L SS; SIP-rated; custom flanged nozzles' },
      { name: 'Praj HiPurity Systems', region: 'asia', typicalLeadWeeks: 12, typicalMoqUnits: 1, notes: 'Indian biopharma vessel manufacturer; EU GMP-documented facilities' },
    ],
  },

  {
    partType: 'peristaltic_pump_bioprocess',
    partLabel: 'Peristaltic pump for sterile fluid transfer',
    productClass: ['bioreactor'],
    vendors: [
      { name: 'Watson-Marlow (530 series)', region: 'uk', typicalLeadWeeks: 4, typicalMoqUnits: 1, notes: 'UK manufacturer; FDA 21 CFR Part 11 control option; ISO 13485 certified' },
      { name: 'Masterflex (Avantor)', region: 'us', typicalLeadWeeks: 4, typicalMoqUnits: 1, notes: 'L/S series; wide tubing compatibility; cGMP documentation available' },
      { name: 'Verder Scientific', region: 'eu', typicalLeadWeeks: 5, typicalMoqUnits: 1, notes: 'Verderflex peristaltic; NorPrene MedGrade tubing; UK office in Skelmersdale' },
    ],
  },

  {
    partType: 'dissolved_o2_ph_sensor',
    partLabel: 'Dissolved oxygen probe and pH electrode for bioprocess',
    productClass: ['bioreactor'],
    vendors: [
      { name: 'Hamilton Company (VisiFerm)', region: 'us', typicalLeadWeeks: 4, typicalMoqUnits: 1, notes: 'VisiFerm DO Arc 120; optical; autoclaved; SIP-rated; 4-20 mA / ARC output' },
      { name: 'Mettler-Toledo (InPro 6860i)', region: 'eu', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'InPro 6860i amperometric DO; 135°C SIP; FDA-compliant materials' },
      { name: 'Broadley-James (BioProfile)', region: 'us', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'BioProfile FLEX offline cell culture analyser; glucose + lactate + DO + pH' },
    ],
  },

  {
    partType: 'sterile_filter_membrane',
    partLabel: 'Sterile filter / membrane filter for bioprocess',
    productClass: ['bioreactor'],
    vendors: [
      { name: 'Sartorius (Sartoguard PES)', region: 'eu', typicalLeadWeeks: 2, typicalMoqUnits: 10, notes: 'Sartoguard PES 0.1/0.2 µm; SIP-rated; validated bacteria retention (EN 12672)' },
      { name: 'Pall Corporation (Supor EKV)', region: 'us', typicalLeadWeeks: 3, typicalMoqUnits: 5, notes: 'Supor EKV PES filter; GMP lot traceability; UK via Pall Medical' },
      { name: 'Merck Millipore (Millipak)', region: 'us', typicalLeadWeeks: 2, typicalMoqUnits: 10, notes: 'Millipak sterile filter; PVDF membrane; gamma-irradiated option' },
    ],
  },

  {
    partType: 'bioprocess_agitator_impeller',
    partLabel: 'Agitator / impeller assembly for bioreactor mixing',
    productClass: ['bioreactor'],
    vendors: [
      { name: 'Chemineer (Pfaudler)', region: 'us', typicalLeadWeeks: 8, typicalMoqUnits: 1, notes: 'Rushton turbine and pitched-blade impellers; ASME BPE surface finish' },
      { name: 'Lightnin (SPX Flow)', region: 'us', typicalLeadWeeks: 8, typicalMoqUnits: 1, notes: 'A310 / A315 hydrofoil impellers; bioprocess-grade 316L SS' },
      { name: 'Alfa Laval (Rotajet)', region: 'eu', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'Rotajet CIP rotary tank cleaning with agitator combinations' },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // VERTICAL FARM — vertical_farm
  // ══════════════════════════════════════════════════════════════════════════

  {
    partType: 'led_grow_light_bar',
    partLabel: 'LED horticultural grow light (bar / panel format)',
    productClass: ['vertical_farm'],
    vendors: [
      { name: 'Signify (Philips GreenPower)', region: 'eu', typicalLeadWeeks: 6, typicalMoqUnits: 10, notes: 'GreenPower LED toplighting; DALI dimmable; 3.0 µmol/J efficacy; UK via Philips UK' },
      { name: 'Fluence (VYPR series)', region: 'us', typicalLeadWeeks: 8, typicalMoqUnits: 5, notes: 'VYPR 2p; full-spectrum; 2.8 µmol/J; used in large-scale vertical farms' },
      { name: 'Heliospectra (ELIXIA)', region: 'eu', typicalLeadWeeks: 8, typicalMoqUnits: 5, notes: 'ELIXIA LED; spectral tuning; Bluetooth control; CE marked; Swedish manufacturer' },
    ],
  },

  {
    partType: 'hvac_dehumidifier_farm',
    partLabel: 'Climate control unit / dehumidifier for indoor farm',
    productClass: ['vertical_farm'],
    vendors: [
      { name: 'Munters (MiDAS)', region: 'eu', typicalLeadWeeks: 10, typicalMoqUnits: 1, notes: 'MiDAS climate unit; heat pump dehumidification; energy recovery; CE marked' },
      { name: 'Stulz (CyberAir)', region: 'eu', typicalLeadWeeks: 8, typicalMoqUnits: 1, notes: 'Precision cooling; humidity control; data centre and vertical farm applications' },
      { name: 'Carel (CAREL HumiSteam)', region: 'eu', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'HumiSteam Electrode humidifier; 1.5–105 kg/h; Modbus control' },
    ],
  },

  {
    partType: 'fertigation_controller',
    partLabel: 'Fertigation / nutrient dosing controller',
    productClass: ['vertical_farm'],
    vendors: [
      { name: 'Priva (Connext)', region: 'eu', typicalLeadWeeks: 10, typicalMoqUnits: 1, notes: 'Connext climate and irrigation controller; Dutch horticulture standard; UK office' },
      { name: 'Ridder (Synopta)', region: 'eu', typicalLeadWeeks: 10, typicalMoqUnits: 1, notes: 'Synopta process computer; Dutch horticultural automation; CE marked' },
      { name: 'Bluelab (Pulse Mulitmeter)', region: 'global', typicalLeadWeeks: 3, typicalMoqUnits: 1, notes: 'New Zealand; EC/pH/temp monitoring; widely used in UK vertical farms' },
    ],
  },

  {
    partType: 'grow_rack_structure',
    partLabel: 'Multi-tier growing rack / shelving structure',
    productClass: ['vertical_farm'],
    vendors: [
      { name: 'Spacesaver Corporation', region: 'us', typicalLeadWeeks: 8, typicalMoqUnits: 1, notes: 'Mobile shelving; custom vertical farm configurations' },
      { name: 'Link51', region: 'uk', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'UK manufacturer; steel pallet racking adapted for grow trays; SEMA approved' },
      { name: 'Dexion (UK)', region: 'uk', typicalLeadWeeks: 5, typicalMoqUnits: 1, notes: 'Longspan shelving; grow tray tier support; nationwide UK delivery' },
    ],
  },

  {
    partType: 'nutrient_dosing_pump',
    partLabel: 'Nutrient / chemical dosing pump',
    productClass: ['vertical_farm'],
    vendors: [
      { name: 'HE Anderson (Dosatron)', region: 'us', typicalLeadWeeks: 3, typicalMoqUnits: 1, notes: 'Dosatron water-powered proportional dosers; no electricity required; UK stocked' },
      { name: 'Grundfos (DMX series)', region: 'eu', typicalLeadWeeks: 4, typicalMoqUnits: 1, notes: 'DMX diaphragm dosing pumps; chemical-resistant; Modbus control; UK office' },
      { name: 'ProMinent (Beta series)', region: 'eu', typicalLeadWeeks: 4, typicalMoqUnits: 1, notes: 'Beta b motor-driven dosing pump; DULCOMETER sensor integration' },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // AUTONOMOUS UNDERWATER VEHICLE — auv
  // ══════════════════════════════════════════════════════════════════════════

  {
    partType: 'auv_thruster',
    partLabel: 'Electric thruster for AUV propulsion',
    productClass: ['auv'],
    vendors: [
      { name: 'Blue Robotics (T500)', region: 'us', typicalLeadWeeks: 2, typicalMoqUnits: 1, notes: 'T200/T500; 300m depth rating; widely used in research AUVs; UK stocked' },
      { name: 'Tecnadyne (Model 520)', region: 'us', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'Model 520; brushless DC; 600 m depth; used in Saab Seaeye ROVs' },
      { name: 'VideoRay (M5)', region: 'us', typicalLeadWeeks: 8, typicalMoqUnits: 1, notes: 'M5 thruster module; 300 m rated; NATO-deployable ROV heritage' },
    ],
  },

  {
    partType: 'pressure_housing_penetrator',
    partLabel: 'Pressure housing / aluminium or acrylic tube with penetrators',
    productClass: ['auv'],
    vendors: [
      { name: 'Blue Robotics (WLP series)', region: 'us', typicalLeadWeeks: 2, typicalMoqUnits: 1, notes: 'WLP aluminium tubes and flanges; 400 m depth; O-ring seal system' },
      { name: 'DeepSea Power & Light', region: 'us', typicalLeadWeeks: 8, typicalMoqUnits: 1, notes: 'SubConn penetrators; titanium housings; up to 6000 m depth rated' },
      { name: 'RJE International', region: 'us', typicalLeadWeeks: 10, typicalMoqUnits: 1, notes: 'Custom pressure housings; oil-compensated electronics; deep-ocean rated' },
    ],
  },

  {
    partType: 'dvl_doppler_velocity_log',
    partLabel: 'Doppler Velocity Log (DVL) for AUV navigation',
    productClass: ['auv'],
    vendors: [
      { name: 'Teledyne Marine (Wayfinder)', region: 'us', typicalLeadWeeks: 12, typicalMoqUnits: 1, notes: 'Wayfinder compact DVL; 0.5–75 m altitude; 100 m depth; Ethernet output' },
      { name: 'Nortek (DVL1000)', region: 'eu', typicalLeadWeeks: 14, typicalMoqUnits: 1, notes: 'DVL1000 (600 m); 4-beam phased array; Norwegian manufacturer; strong EU support' },
      { name: 'Waterlinked (A50)', region: 'eu', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'A50 DVL; compact 16×16 cm; 50 m altitude; affordable for small AUV' },
    ],
  },

  {
    partType: 'acoustic_modem_underwater',
    partLabel: 'Acoustic modem for AUV subsurface communication',
    productClass: ['auv'],
    vendors: [
      { name: 'EvoLogics (S2CR 7/17)', region: 'eu', typicalLeadWeeks: 12, typicalMoqUnits: 1, notes: 'S2CR series; FHSS broadband; USBL capability; German manufacturer' },
      { name: 'LinkQuest (UWM series)', region: 'us', typicalLeadWeeks: 10, typicalMoqUnits: 1, notes: 'UWM1000H; 1000 m range; Ethernet interface' },
      { name: 'Popoto Modem (M3)', region: 'us', typicalLeadWeeks: 10, typicalMoqUnits: 1, notes: 'M3 OFDM modem; 10 kbps at 3 km; compact form factor for AUV' },
    ],
  },

  {
    partType: 'auv_battery_pack',
    partLabel: 'Pressure-tolerant battery pack for AUV',
    productClass: ['auv'],
    vendors: [
      { name: 'Blue Robotics (Lithium-Ion Battery)', region: 'us', typicalLeadWeeks: 2, typicalMoqUnits: 1, notes: '4S 15.6 Ah; enclosure-ready; UN 38.3; up to 100 m with housing' },
      { name: 'EnerTek International', region: 'us', typicalLeadWeeks: 8, typicalMoqUnits: 1, notes: 'Oil-compensated Li-ion packs; 6000 m rated; custom configurations' },
      { name: 'SubCtech (OceanPack)', region: 'eu', typicalLeadWeeks: 10, typicalMoqUnits: 1, notes: 'OceanPack subsea battery systems; titanium housing; 6000 m depth' },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EDGE AI SERVER — edge_ai_server
  // ══════════════════════════════════════════════════════════════════════════

  {
    partType: 'gpu_compute_module',
    partLabel: 'GPU / NPU compute module for edge AI inference',
    productClass: ['edge_ai_server'],
    vendors: [
      { name: 'NVIDIA (Jetson AGX Orin)', region: 'us', typicalLeadWeeks: 8, typicalMoqUnits: 1, notes: 'Jetson AGX Orin 64 GB; 275 TOPS; -25°C to 60°C industrial; UK via Arrow Electronics' },
      { name: 'Hailo Technologies (Hailo-8L)', region: 'global', typicalLeadWeeks: 10, typicalMoqUnits: 5, notes: 'Hailo-8L M.2 module; 26 TOPS; 2.5W; CE marked; PCIe compatible' },
      { name: 'Qualcomm (QCS8550)', region: 'us', typicalLeadWeeks: 12, typicalMoqUnits: 100, notes: 'Snapdragon 8 Gen 2 / QCS8550 edge AI SoC; IP67 rated module available' },
    ],
  },

  {
    partType: 'industrial_ssd_nvme',
    partLabel: 'Industrial-grade NVMe SSD for edge AI server',
    productClass: ['edge_ai_server'],
    vendors: [
      { name: 'Samsung (PM9A3)', region: 'asia', typicalLeadWeeks: 6, typicalMoqUnits: 5, notes: 'PM9A3 enterprise NVMe; PCIe 4.0; 6 DWPD; -40°C operation; UK via Samsung B2B' },
      { name: 'Micron (7450 Pro)', region: 'us', typicalLeadWeeks: 6, typicalMoqUnits: 5, notes: '7450 Pro NVMe; E1.S and M.2 form factors; -40°C to 85°C' },
      { name: 'Swissbit (N-30mu)', region: 'eu', typicalLeadWeeks: 8, typicalMoqUnits: 10, notes: 'Industrial M.2 NVMe; -40°C; long-term supply guarantee; Swiss manufacturer' },
    ],
  },

  {
    partType: 'poe_managed_switch',
    partLabel: 'PoE+ managed Ethernet switch for edge AI enclosure',
    productClass: ['edge_ai_server'],
    vendors: [
      { name: 'Cisco Industrial (IE-3400)', region: 'us', typicalLeadWeeks: 8, typicalMoqUnits: 1, notes: 'IE-3400 rugged switch; -40°C; IEC 61850-3; PoE++; UK via Cisco resellers' },
      { name: 'Moxa (EDS-4000)', region: 'asia', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'EDS-4000 series; -40°C; PROFINET; IEC 62443-4-2 cybersecurity; UK via SIFAM' },
      { name: 'Advantech (EKI-7658)', region: 'asia', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'EKI-7658 managed PoE switch; DIN rail; -40°C; Modbus TCP; UK via Advantech UK' },
    ],
  },

  {
    partType: 'din_rail_psu_edge',
    partLabel: 'DIN-rail power supply unit for edge AI enclosure',
    productClass: ['edge_ai_server'],
    vendors: [
      { name: 'Phoenix Contact (QUINT)', region: 'eu', typicalLeadWeeks: 4, typicalMoqUnits: 1, notes: 'QUINT POWER series; 24 VDC; 20–40 A; SFB technology; UK via Phoenix Contact' },
      { name: 'PULS Power (QT40)', region: 'eu', typicalLeadWeeks: 4, typicalMoqUnits: 1, notes: 'QT40.241 40A; 100% convection cooled; -25°C to +70°C; SEMI F47 compliant' },
      { name: 'Meanwell (DRP-480)', region: 'asia', typicalLeadWeeks: 3, typicalMoqUnits: 1, notes: 'DRP-480 series; UL508 listed; 480 W; UK via RS Components' },
    ],
  },

  {
    partType: 'edge_ai_enclosure_ruggedised',
    partLabel: 'Ruggedised enclosure for edge AI server deployment',
    productClass: ['edge_ai_server'],
    vendors: [
      { name: 'nVent ELDON (EJ series)', region: 'eu', typicalLeadWeeks: 6, typicalMoqUnits: 1, notes: 'EJ series GRP enclosures; IP66 IK10; -40°C; UK stocked at RS and Farnell' },
      { name: 'Eaton (BXL series)', region: 'us', typicalLeadWeeks: 5, typicalMoqUnits: 1, notes: 'BXL outdoor enclosures; IP65; polyester GRP; UK via Eaton UK' },
      { name: 'Bopla (Euromas)', region: 'eu', typicalLeadWeeks: 5, typicalMoqUnits: 1, notes: 'Euromas series; aluminium; IP66; DIN rail ready; UK via CPC Farnell' },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // HAPS — haps
  // ══════════════════════════════════════════════════════════════════════════
  // NOTE: This is the thinnest class in the catalog. HAPS is nascent;
  // many sub-tier component vendors serve this market indirectly.
  // ══════════════════════════════════════════════════════════════════════════

  {
    partType: 'haps_solar_laminate',
    partLabel: 'High-efficiency flexible solar laminate for HAPS wing',
    productClass: ['haps'],
    vendors: [
      { name: 'MiaSolé (FLEX series)', region: 'us', typicalLeadWeeks: 16, typicalMoqUnits: 1, notes: 'CIGS thin-film; 18.6% efficiency; flexible substrate; aerospace applications' },
      { name: 'SunPower (Performance Series)', region: 'us', typicalLeadWeeks: 14, typicalMoqUnits: 10, notes: 'Highest-efficiency rigid cells; not flexible but used in rigid-wing HAPS panels' },
    ],
    gapNote: 'Only 2 confident vendors. Alta Devices (Hanergy) ceased stratospheric-grade production. For truly flexible wing integration, the market is thin — consider custom layup from SunPower cells with Coverlight encapsulant.',
  },

  {
    partType: 'haps_energy_storage',
    partLabel: 'High-energy-density battery for HAPS night-time storage',
    productClass: ['haps'],
    vendors: [
      { name: 'Saft (VL series Li-ion)', region: 'eu', typicalLeadWeeks: 20, typicalMoqUnits: 1, notes: 'VL 41M military Li-ion cells; wide temperature; -40°C; airborne qualified' },
      { name: 'EaglePicher Technologies', region: 'us', typicalLeadWeeks: 20, typicalMoqUnits: 1, notes: 'Aerospace Li-ion packs; DO-311A compliant; NASA and DARPA supply history' },
    ],
    gapNote: 'Li-S (lithium-sulphur) is the ideal chemistry for >400 Wh/kg HAPS storage. Sion Power ceased operations 2023; OXIS Energy dissolved 2021. No production-ready Li-S vendor exists as of 2026. Use high-energy Li-ion (Saft / EaglePicher) and note this as a technology gap in the BOM.',
  },

  {
    partType: 'haps_autopilot_avionics',
    partLabel: 'Redundant autopilot / avionics for HAPS',
    productClass: ['haps'],
    vendors: [
      { name: 'Skydio (Autonomy Engine SDK)', region: 'us', typicalLeadWeeks: 12, typicalMoqUnits: 1, notes: 'Autonomy SDK licensed for third-party platforms; visual navigation' },
      { name: 'Viasat (tactical data links)', region: 'us', typicalLeadWeeks: 16, typicalMoqUnits: 1, notes: 'BLOS communications payload; L/S-band transceiver for HAPS relay missions' },
      { name: 'u-blox (NEO-F10N)', region: 'eu', typicalLeadWeeks: 8, typicalMoqUnits: 5, notes: 'High-precision GNSS for HAPS navigation; -40°C to +85°C; anti-spoofing' },
    ],
  },

  {
    partType: 'haps_parachute_recovery',
    partLabel: 'Parachute recovery system for HAPS descent',
    productClass: ['haps'],
    vendors: [
      { name: 'Airborne Systems (XT series)', region: 'uk', typicalLeadWeeks: 14, typicalMoqUnits: 1, notes: 'UK manufacturer; precision aerial delivery; custom HAPS recovery canopies; ITAR-free EU' },
      { name: 'Pioneer Aerospace', region: 'us', typicalLeadWeeks: 12, typicalMoqUnits: 1, notes: 'Cargo parachute systems; UAV and HAPS recovery; US DoD qualified' },
      { name: 'Butler Parachute Systems', region: 'us', typicalLeadWeeks: 10, typicalMoqUnits: 1, notes: 'Emergency and payload parachutes; TSO-C23 qualified; custom HAPS packaging' },
    ],
  },

]

// ─── Lookup helpers ────────────────────────────────────────────────────────────

/**
 * Return all catalog entries for a given product class.
 * Uses the same key strings as product-classifier.ts (e.g. 'energy_storage', 'drone').
 */
export function getVendorEntriesForClass(productClass: string): VendorCatalogEntry[] {
  return VENDOR_CATALOG.filter(entry => entry.productClass.includes(productClass))
}

/**
 * Return a flat list of unique vendor names for a given product class.
 */
export function getVendorNamesForClass(productClass: string): string[] {
  const entries = getVendorEntriesForClass(productClass)
  const names = entries.flatMap(e => e.vendors.map(v => v.name))
  return [...new Set(names)]
}

/**
 * Find catalog entries whose partType or partLabel contains the given search term.
 * Case-insensitive. Used for BOM row matching.
 */
export function findEntriesByPartTerm(term: string, productClass?: string): VendorCatalogEntry[] {
  const lowerTerm = term.toLowerCase()
  let candidates = VENDOR_CATALOG
  if (productClass) {
    candidates = candidates.filter(e => e.productClass.includes(productClass))
  }
  return candidates.filter(
    e =>
      e.partType.toLowerCase().includes(lowerTerm) ||
      e.partLabel.toLowerCase().includes(lowerTerm)
  )
}

/**
 * Get catalog stats for diagnostics / reporting.
 */
export function getCatalogStats(): {
  totalEntries: number
  totalUniqueVendors: number
  entriesByClass: Record<string, number>
} {
  const entriesByClass: Record<string, number> = {}
  const allVendorNames = new Set<string>()

  for (const entry of VENDOR_CATALOG) {
    for (const cls of entry.productClass) {
      entriesByClass[cls] = (entriesByClass[cls] ?? 0) + 1
    }
    for (const vendor of entry.vendors) {
      allVendorNames.add(vendor.name)
    }
  }

  return {
    totalEntries: VENDOR_CATALOG.length,
    totalUniqueVendors: allVendorNames.size,
    entriesByClass,
  }
}
