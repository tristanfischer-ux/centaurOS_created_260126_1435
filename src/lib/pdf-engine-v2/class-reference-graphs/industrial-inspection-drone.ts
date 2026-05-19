/**
 * @file class-reference-graphs/industrial-inspection-drone.ts — K10 typed
 * graph for industrial inspection drones (multirotor, 0.5-25 kg MTOM class).
 *
 * @description Models a multirotor industrial inspection / mapping drone at
 * the 0.5-25 kg MTOM class — DJI Matrice 30T / 350 RTK / M3D / M3T,
 * Skydio X10D, Autel EVO Max 4T, Parrot Anafi USA, Yuneec H520E. Tests
 * three K10 paths:
 *   - `actuation_kinematics` (BLDC motors + electronic speed controllers +
 *     propellers) driven from `energy_conversion_transduction` (ESC inverter).
 *   - `energy_storage_source` (intelligent LiPo / LiHV battery pack with
 *     onboard BMS + cell-balancing + self-heating).
 *   - Flight-control `safety_protection` (return-to-home, parachute,
 *     geofencing, dual-IMU + dual-barometer redundancy, ADS-B receiver).
 * Pairs with the existing `auv-subsea` graph (shared autonomy + INS pattern)
 * and tests the multirotor airframe topology that complements the small
 * wind turbine's HAWT pattern.
 *
 * For consumer + custom variants, this graph is registered under multiple
 * product_class slugs (industrial_inspection_drone / consumer_cinematography_drone /
 * custom_hybrid_drone) since the K10 module set is shared — only the
 * payload + comms link differ.
 *
 * @sources Corpus values from `pretraining_extracted_specs` joined to
 * `pretraining_spec_documents WHERE product_class='industrial_inspection_drone'`
 * at ~/.forge-truth/forge-truth.db (9 datasheets — DJI Matrice series +
 * Autel EVO Max + Parrot Anafi). Drone-specific prose priors from
 * class-connections.ts DRONE entry. Civil aviation standards from
 * class-standards.ts DRONE entry (EU 2019/945/947, CAP 722, MD 2006/42/EC,
 * IEC 60529, RTCA DO-260/282).
 *
 * @corpus-coverage-2026-05-18
 *   - MTOM: 246 g (sub-250 g class) to 1999 g (Mini-class) to 5750 g
 *     (Matrice 30T) — corpus direct.
 *   - Battery capacity: 2250 / 3400 / 8070 / 9248 mAh (corpus); voltage
 *     7.7 / 11.55 / 22.2 V — corpus direct.
 *   - Battery energy: 120 / 136.5 Wh (TB48/TB60 class) — corpus direct.
 *   - Cycle life: 200-300 charge/discharge cycles — corpus direct.
 *   - Propeller max speed: 7500-16928 RPM — corpus direct.
 *   - Max thrust: 12.92 N (static, single motor of Matrice-class) — corpus.
 *   - Thrust-to-weight ratio: 2.63 — corpus.
 *   - Flight time: 31-90 minutes (dock-charging variants) — corpus direct.
 *   - Cruise speed: 17 m/s; max 14.7-30 m/s — corpus direct.
 *   - Wind tolerance: 10.7-14 m/s hover, 27 mph (~12 m/s) cruise — corpus.
 *   - Service ceiling: 4800 m — corpus direct.
 *   - IP rating: IP55/56 (Matrice industrial) — corpus direct.
 *   - Data link: 2.4 GHz + 5 GHz Wi-Fi 802.11n/ax; OcuSync 2.0; up to 15 km
 *     transmission distance — corpus direct.
 *   - Encryption: AES-128/256 + HTTPS — corpus direct.
 *   - Standards: CE / FCC / SRRC / NDAA / Blue UAS / TAA + EU 2019/945 (tech)
 *     + 2019/947 (operational) + MD 2006/42/EC + RTCA DO-260 (ADS-B) +
 *     DO-282 (TIS-B) + 14 CFR Part 89 (Remote ID) + IEC 60529 IP rating —
 *     corpus direct.
 *
 * @scope-2026-05-18
 *   - Multirotor (typ. quadcopter or hexacopter) inspection drone — fixed-
 *     wing UAVs (Parrot Disco, senseFly eBee), VTOL transition (Wingcopter),
 *     and hybrid airframes are partial overlap (energy/control modules
 *     reused) — separate graph candidate if needed.
 *   - Industrial inspection variant — primary payload is electro-optical /
 *     thermal / lidar camera + RTK GPS for survey. Cinematography variant
 *     swaps payload to high-res EO camera + gimbal stabiliser. Both share
 *     the K10 module set; payload edge `sensing_instrumentation ↔
 *     control_compute_communication` is the variation point.
 *   - Civil airspace operations only (EU Open Category A2/A3 or Specific
 *     Category SORA; UK CAA CAP 722; FAA Part 107). Defense / weaponised
 *     variants are OUT of scope.
 *   - Battery-powered (LiPo or LiHV) — tethered drones (with continuous
 *     ground power via fibre-tether) and hydrogen-fuel-cell drones are
 *     OUT of scope.
 *   - Mass / fluid module is `forbidden` in class-module-priors (drones
 *     have no internal mass flow) — no `mass_fluid_transport_process`
 *     edges below.
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const INDUSTRIAL_INSPECTION_DRONE: ProductClassGraph = {
  product_class: 'industrial_inspection_drone',
  display_name: 'Industrial Inspection Drone (Multirotor, 0.5-25 kg MTOM)',
  scope_notes:
    'Multirotor inspection / mapping drone at the 0.5-25 kg MTOM class. ' +
    'DJI Matrice 30T / 350 RTK / Skydio X10D / Autel EVO Max 4T class. ' +
    'EO + thermal + lidar payload + RTK GPS for survey. LiPo / LiHV battery, ' +
    'OcuSync 2.0 or 802.11ax link. EU 2019/945+947 + CAP 722 + FAA Part 107 ' +
    'compliance. Fixed-wing, VTOL, tethered, fuel-cell, and weaponised ' +
    'variants are OUT of scope.',

  nodes: [
    {
      class: 'energy_storage_source',
      role: 'principal',
      required: true,
      display: 'Intelligent flight battery (LiPo / LiHV, TB48/TB60 class) + onboard BMS + self-heating + cell-balancing',
    },
    {
      class: 'energy_conversion_transduction',
      role: 'subsystem',
      required: true,
      display: 'ESC bank (4-6× BLDC inverters) + DC-DC step-down to avionics + radio TX power amplifier',
    },
    {
      class: 'actuation_kinematics',
      role: 'actuator',
      required: true,
      display: 'Brushless DC motors (4-6×) + propellers + gimbal yaw/pitch servo + (optional) cargo / parachute deploy',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'Flight controller (dual-IMU / triple-IMU + dual-barometer) + radio link (OcuSync 2.0 / 802.11ax) + RTK module',
    },
    {
      class: 'sensing_instrumentation',
      role: 'sensor',
      required: true,
      display: 'IMU + GNSS + barometer + magnetometer + vision-positioning + payload camera (EO + thermal + lidar)',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'Return-to-home + geofencing + ADS-B receiver + parachute (≥25 kg) + Remote ID + battery self-protect',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'Carbon-fibre airframe / arms + folding-arm hinges + IP55 / IP56 nacelle for electronics',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: true,
      display: 'Battery pack bay connector + main power bus + 5 V / 12 V / 24 V rails + payload power port',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: false,
      display: 'Propeller wash forced-air cooling + battery self-heater (LiPo cold-start <5 °C)',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: 'Propeller quick-release + battery hot-swap bay + dock landing pad + auto-charging station',
    },
  ],

  edges: [
    // ── Power path: battery → ESC → motor ──
    {
      from_class: 'energy_storage_source',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_nominal_v: 22.2,       // 6S LiPo / Matrice class; small-quad 11.55 V (3S)
        voltage_range_v: [7.7, 25.2],  // corpus: 7.7 V Mini, 11.55 V Mini Pro, ~22 V Matrice
        ac_or_dc: 'DC',
        current_max_a: 60,             // 60 A per ESC peak for 5 kg-class
        power_max_w: 1500,
      },
      mechanical: {
        connector: 'XT60 / XT90 (consumer); manufacturer-specific bayonet for industrial (DJI TB30 / TB60)',
        cable_type: '8-12 AWG silicone-jacket high-current battery cable',
      },
      required: true,
      direction: 'directional',
      notes: 'Battery feeds ESC bank via XT60 / XT90 (consumer) or manufacturer bayonet (industrial TB30 / TB60 class) connector. Corpus voltage: 7.7 V (TB04 sub-250g class) / 11.55 V (Mini-3 class) / 22-25 V (Matrice / EVO Max 6S LiPo class). Battery capacity 2250 mAh (Mini-3) to 9248 mAh (TB60). Power draw peaks ~1.5 kW for 5 kg hexacopter at max thrust.',
      source_references: [
        'corpus:Battery Voltage@industrial_inspection_drone (7.7 V)',
        'corpus:Battery voltage (nominal)@industrial_inspection_drone (11.55 V)',
        'corpus:Battery Capacity@industrial_inspection_drone (2250 mAh)',
        'corpus:ABX40 Rated Capacity@industrial_inspection_drone (8070 mAh)',
        'corpus:ABX40 Energy@industrial_inspection_drone (120 Wh)',
        'corpus:Battery energy density@industrial_inspection_drone (197 Wh/kg)',
        'industry:DJI TB60 intelligent flight battery',
      ],
    },
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'actuation_kinematics',
      protocol: 'PWM',
      // 26-mechanism set has 'contactor_command' as the closest "controller drives actuator" coarse class.
      mechanism: 'contactor_command',
      electrical: {
        voltage_nominal_v: 22.2,
        ac_or_dc: 'DC',
        current_max_a: 30,             // per-motor steady-state at hover
      },
      mechanical: { connector: 'bullet connector 3.5 mm or solder pads', cable_type: '14-12 AWG 3-phase motor lead' },
      required: true,
      direction: 'directional',
      notes: 'ESC drives BLDC motor via 3-phase commutated DC. Modern protocols: DShot600 / DShot1200 (digital PWM, 600/1200 kHz), or analog PWM 1-2 ms pulse. KISS / Beta-Flight / BLHeli_32 firmware typical. Motor KV range: 400-900 for cinematic 5-inch; 200-400 for industrial 17-inch props. Corpus: propeller max speed 7500-16928 RPM, max static thrust 12.92 N per motor (Matrice class), thrust-to-weight ratio 2.63.',
      source_references: [
        'corpus:Maximum Propeller Speed@industrial_inspection_drone (16928 RPM)',
        'corpus:Propeller Max Speed (1136)@industrial_inspection_drone (8000 RPM)',
        'corpus:Maximum static thrust@industrial_inspection_drone (12.92 N)',
        'corpus:Thrust to weight ratio@industrial_inspection_drone (2.63)',
        'industry:BLHeli_32 / DShot600 ESC firmware',
      ],
    },

    // ── Power distribution: battery → BMS → main bus ──
    {
      from_class: 'energy_storage_source',
      to_class: 'power_distribution',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_nominal_v: 22.2,
        ac_or_dc: 'DC',
        current_max_a: 80,
      },
      required: true,
      direction: 'directional',
      notes: 'Battery pack bay connector lands on the main power bus PCB; PDB (power distribution board) splits to ESCs + DC-DC step-down for 5 V (avionics) / 12 V (gimbal) / 24 V (payload) rails. Onboard BMS reports state-of-charge + cell voltages + cell temperatures over I2C / SMBus to the flight controller. Self-heating element (10% power per corpus, 200-300 cycle life) activates below 5 °C.',
      source_references: [
        'corpus:Self-heating minimum power requirement@industrial_inspection_drone (10%)',
        'corpus:Voltage cell difference limit@industrial_inspection_drone (0.1 V)',
        'corpus:Battery Cycle Life@industrial_inspection_drone (200 cycles)',
        'industry:DJI Smart Battery SMBus protocol',
      ],
    },

    // ── Mechanical: motors → airframe ──
    {
      from_class: 'actuation_kinematics',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: {
        mount: 'bolted',
        connector: 'M3 / M4 motor mount bolts to arm end-cap (carbon-fibre or magnesium-alloy)',
        cable_type: 'carbon-fibre tube arm + folding-arm hinge',
      },
      required: true,
      direction: 'mutual',
      notes: 'Airframe / arms hold motors at correct geometry under thrust + vibration. Carbon-fibre arms (typ. 16-25 mm OD tube) bolted to magnesium-alloy central frame. Folding-arm hinges (clamp + locking screw) for portable transport. Motor mount end-cap absorbs vibration through silicone dampers in soft-mount installations; rigid mount for cinematography precision.',
      source_references: [
        'corpus:Diagonal Wheelbase@industrial_inspection_drone (1.53 ft)',
        'corpus:Propeller Replacement Interval@industrial_inspection_drone (450 flights)',
        'industry:DJI Matrice folding-arm hinge',
        'standard:MD 2006/42/EC machinery directive (DoC for rotating propellers)',
      ],
    },

    // ── Flight control: FC → ESC, FC ↔ sensors, FC → ground station ──
    {
      from_class: 'control_compute_communication',
      to_class: 'energy_conversion_transduction',
      protocol: 'PWM',
      mechanism: 'contactor_command',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 5 },
      required: true,
      direction: 'directional',
      notes: 'Flight controller drives each motor ESC via PWM / DShot (digital pulse-width) — typ. 4 channels (quad) or 6 channels (hex). Update rate 8 kHz on Betaflight; 1 kHz on industrial flight stacks. Tarot, Pixhawk, DJI A3/N3, Ardupilot are typical FC stacks for industrial; KISS / FETtec for cinematography racing class.',
      source_references: [
        'industry:Pixhawk PX4 autopilot reference design',
        'industry:DJI A3 Pro industrial flight controller',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'sensing_instrumentation',
      protocol: 'SPI',
      mechanism: 'sensor_feedback',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 3.3 },
      mechanical: { connector: 'on-board PCB header pins or FFC ribbon', cable_type: 'PCB trace + flex' },
      required: true,
      direction: 'mutual',
      notes: 'FC reads IMU (dual or triple BMI088 / ICM-42688 / BMI270 redundant), GNSS module (multi-constellation L1+L2 RTK at industrial scale), barometer (DPS310 / BMP280), magnetometer (RM3100 / LIS3MDL), vision-positioning camera array (4-side downward + omni for obstacle), and payload (EO + thermal IR + lidar). RTK GPS via NMEA + RTCM correction stream; downward vision via dedicated VPU on flight controller.',
      source_references: [
        'corpus:Gimbal Pitch Mechanical Range@industrial_inspection_drone (-135 to +45 degrees)',
        'corpus:Camera resolution@industrial_inspection_drone (21 MP)',
        'corpus:RTK Module Weight@industrial_inspection_drone (29 g)',
        'industry:DJI Zenmuse H20T / H30T multispectral payload',
        'industry:Velodyne Puck VLP-16 lidar',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'environmental_interface',
      // Drone radio link is point-to-point wireless — closest coarse mechanism is hmi_data
      // (controller-to-operator) or sensor_feedback (telemetry). Use hmi_data.
      protocol: 'WiFi',
      mechanism: 'hmi_data',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 5 },
      mechanical: { connector: 'SMA / RP-SMA + 50 Ω coax to PCB antenna', cable_type: 'RG316 / RG402 50 Ω' },
      required: true,
      direction: 'mutual',
      notes: 'RC radio link to ground station — typ. OcuSync 2.0 (DJI), 802.11n/ax adaptive frequency, or 900 MHz long-range telemetry. Up to 15 km transmission distance per corpus (FCC; CE ~8 km). 4G LTE / Iridium backup for BVLOS. AES-128 / AES-256 encryption (corpus). 2.4 GHz + 5 GHz adaptive frequency-hopping.',
      source_references: [
        'corpus:Communication Distance@industrial_inspection_drone (15 km)',
        'corpus:Maximum Transmission Distance (FCC)@industrial_inspection_drone (15 km)',
        'corpus:Maximum Transmission Distance (CE)@industrial_inspection_drone (8 km)',
        'corpus:Data Link Frequency@industrial_inspection_drone (2.4 GHz)',
        'corpus:Encryption@industrial_inspection_drone (AES-256)',
        'corpus:OcuSync 2.0@industrial_inspection_drone',
        'standard:RTCA DO-260 ADS-B Out',
        'standard:14 CFR Part 89 Remote ID',
      ],
    },

    // ── Safety: failsafe chain ──
    {
      from_class: 'safety_protection',
      to_class: 'control_compute_communication',
      protocol: 'Digital-5V',
      // 26-mechanism set has 'safety_isolation' as the closest "safety-rated chain"
      // class. Use it for failsafe interlock to the flight controller.
      mechanism: 'safety_isolation',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 5 },
      required: true,
      direction: 'directional',
      notes: 'Return-to-home (RTH) on RC link loss > 2 s (corpus: 2-second hold time before RTH); RTH altitude 100 m default with 50 m buffer zone (corpus). Battery critical-low warning at 8-25% (corpus); auto-land at 8%. ADS-B receiver alerts on traffic; geofencing buffer 200 m horizontal / 50 m vertical (corpus). Watchdog reset on FC hang. Parachute deploy (≥25 kg per EU 2019/945 Class C6).',
      source_references: [
        'corpus:Auto-return activation hold time@industrial_inspection_drone (2 seconds)',
        'corpus:Default RTH altitude@industrial_inspection_drone (100 m)',
        'corpus:Critically Low Battery Warning Range@industrial_inspection_drone (8-25%)',
        'corpus:Geofencing buffer horizontal@industrial_inspection_drone (200 meters)',
        'corpus:Buffer Zone Width@industrial_inspection_drone (20 m)',
        'standard:EU 2019/945 Class C0-C6',
        'standard:RTCA DO-260 ADS-B receiver',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'energy_storage_source',
      protocol: 'I2C',
      mechanism: 'alarm_interlock',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 3.3 },
      required: true,
      direction: 'mutual',
      notes: 'BMS-level cell imbalance (>0.1 V per corpus), over-temp (>45 °C charge / >60 °C discharge), over-current shutdown via SMBus alarm to FC. Battery hard-reset hold time 15 s (corpus). Discharge cycle to safe state after 72 h fire-discharge duration (corpus) on commercial transport per IATA Dangerous Goods Regulation Section 970.',
      source_references: [
        'corpus:Battery hard reset hold time@industrial_inspection_drone (15 seconds)',
        'corpus:Battery fire discharge duration@industrial_inspection_drone (72 hours)',
        'corpus:Charge temperature protection (high)@industrial_inspection_drone (45 °C)',
        'corpus:Voltage cell difference limit@industrial_inspection_drone (0.1 V)',
        'standard:UN 38.3 lithium battery transport',
      ],
    },

    // ── Thermal: ambient cooling ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'cooling_loop',
      fluid: { medium: 'air', temperature_max_c: 40, temperature_min_c: -20 },
      required: false,
      direction: 'mutual',
      notes: 'ESCs + DC-DC converters thermally bonded to airframe heat-spreader; propeller wash provides forced-air cooling at hover. No dedicated fans. Battery self-heater 10% power (corpus) for cold-start operation <5 °C; charge temperature 5-40 °C (corpus). IP55/56 enclosure (corpus) restricts ingress.',
      source_references: [
        'corpus:Battery Charging Temperature Range@industrial_inspection_drone (5 to 40 C)',
        'corpus:Self-heating minimum power requirement@industrial_inspection_drone (10%)',
        'corpus:IP Rating@industrial_inspection_drone (IP55)',
        'standard:IEC 60529 IP rating',
      ],
    },

    // ── Service: hot-swap + dock + propeller QR ──
    {
      from_class: 'maintenance_serviceability',
      to_class: 'energy_storage_source',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'panel', connector: 'TB60 / TB30 keyed bayonet quick-release' },
      required: false,
      direction: 'mutual',
      notes: 'Hot-swap battery bay with mechanical lock + electrical interlock (battery insertion required before motor power-up). Dock-charging stations (DJI Dock 2, Skydio Dock) auto-land + auto-charge + auto-swap propellers. Propeller quick-release (DJI E-style fold-out + lock) — 450 flights typical replacement interval (corpus).',
      source_references: [
        'corpus:Propeller Replacement Interval@industrial_inspection_drone (450 flights)',
        'corpus:Dock Warming Temperature@industrial_inspection_drone (10 Celsius)',
        'corpus:Deployment time@industrial_inspection_drone (<40 sec)',
        'industry:DJI Dock 2',
      ],
    },
  ],

  sources_cited: [
    'corpus:industrial_inspection_drone (9 datasheets, 2026-05-18 — DJI Matrice 30T / 350 RTK / M3D / Autel EVO Max)',
    'standard:EU 2019/945 (UAS technical requirements C0-C6)',
    'standard:EU 2019/947 (UAS operational categories)',
    'standard:UK CAA CAP 722 (UAS operations)',
    'standard:14 CFR Part 89 (Remote ID — FAA)',
    'standard:FAA Part 107 (small UAS operations)',
    'standard:MD 2006/42/EC (Machinery Directive — propellers)',
    'standard:IEC 60529 (IP rating)',
    'standard:RTCA DO-260 (ADS-B Out)',
    'standard:RTCA DO-282 (TIS-B)',
    'standard:UN 38.3 (lithium battery transport)',
    'standard:EN IEC 62368-1 (radio equipment safety)',
    'standard:EN ISO 12100 (machinery risk assessment)',
    'standard:GB 42590-2023 (China civil UAS)',
    'industry:DJI Matrice 30T / 350 RTK',
    'industry:Skydio X10D',
    'industry:Autel EVO Max 4T',
    'industry:Parrot Anafi USA (Blue UAS)',
    'industry:Pixhawk / Ardupilot / PX4 open flight stack',
  ],
}

registerClassReferenceGraph(INDUSTRIAL_INSPECTION_DRONE)

// Register the same graph under consumer + custom drone slugs — the K10
// module set is identical; only payload + RTK presence + airspace
// compliance category differ. Aliases keep the engine routing classifier-
// emitted variants (DJI Mini, Air, Mavic / Autel EVO consumer / custom
// hybrid first-person-view) to the same typed graph.
registerClassReferenceGraph({
  ...INDUSTRIAL_INSPECTION_DRONE,
  product_class: 'consumer_cinematography_drone',
  display_name: 'Consumer Cinematography Drone (Multirotor, <2 kg MTOM)',
})
registerClassReferenceGraph({
  ...INDUSTRIAL_INSPECTION_DRONE,
  product_class: 'custom_hybrid_drone',
  display_name: 'Custom Hybrid Drone (Multirotor with bespoke payload)',
})

export { INDUSTRIAL_INSPECTION_DRONE }
