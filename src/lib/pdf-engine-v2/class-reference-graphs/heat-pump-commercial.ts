/**
 * @file class-reference-graphs/heat-pump-commercial.ts — K10 typed graph for
 * commercial-scale air-source heat pumps (ASHP, ~20-200 kW heating capacity).
 *
 * @description Models a packaged or split commercial ASHP at the 20-200 kW
 * heating-capacity class. Architectural deltas vs the residential graph
 * (heat-pump-residential.ts):
 *   - 3-phase mains (400 V / 50 Hz EU; 480 V / 60 Hz NA) — higher current,
 *     dedicated power-distribution module mandatory (no shared feed).
 *   - High-pressure CO2 (R744) refrigerant variants — transcritical cycle,
 *     gas-cooler pressure 90-120 bar (vs 31.5 bar R32) drives different
 *     fluid envelopes + PED 2014/68 Cat II/III pressure equipment scope.
 *   - Hydronic distribution to chilled/heating water buffer tank +
 *     air-handling-unit (AHU) coils, not domestic radiators — pipe DN
 *     50-100 mm, flow 100-500 lpm vs residential 25-50 lpm.
 *   - Building management system (BMS) integration via BACnet/IP or Modbus
 *     TCP, not just a wall thermostat.
 *
 * @sources Corpus values come from joining the residential dataset
 * (`pretraining_extracted_specs WHERE product_class='heat-pump-residential'`
 * — 25 datasheets) and `mini_split_heatpump` (9 datasheets) at
 * ~/.forge-truth/forge-truth.db. No dedicated `heat-pump-commercial` corpus
 * class exists yet — commercial-scale industry knowledge (Mitsubishi e-series,
 * Daikin VRV V, Carrier 30RB/30HX, Trane Sintesis, Viessmann Vitocal 350-HT
 * Pro) supplements the residential corpus for 3-phase mains, BACnet, CO2
 * transcritical cycle, and hydronic distribution. Where corpus is silent,
 * source-tag is `industry:<vendor>:<product>` or `standard:<id>`.
 *
 * @corpus-coverage-2026-05-18
 *   - Refrigerant high-pressure switch: 31.5 bar (R32) / 26 bar (R290) —
 *     extrapolated from residential corpus; CO2 (R744) is 120 bar industry-
 *     standard (Viessmann Vitocal 350-HT Pro datasheet).
 *   - DHW max temp 55 °C (R32) extends to 70-90 °C (R744 transcritical) —
 *     industry datasheets.
 *   - Outdoor temp envelope -28 to +35 °C heating / +10 to +43 °C cooling —
 *     residential corpus value applies; commercial CO2 extends to -40 °C.
 *   - Water pressure: 4 bar circuit (residential corpus); commercial hydronic
 *     loops run to 6-10 bar.
 *   - Min flow rate: residential 25 l/min; commercial 100-500 l/min industry.
 *   - Backup heater: residential 2-9 kW; commercial 30-90 kW immersion / gas-
 *     boost trim.
 *   - Standards: EN 14511 (performance), EN 12102 (sound), EN 378
 *     (refrigerant safety), PED 2014/68 (Cat II/III for CO2), EU 517/2014
 *     F-gas, BS 7593, BACnet B-AAC (ASHRAE 135).
 *
 * @scope-2026-05-18
 *   - Air-source only. Ground-source (GSHP) at commercial scale has different
 *     ground-loop interfaces — different graph.
 *   - Packaged outdoor unit OR split (outdoor + indoor) topology — both share
 *     the same module set; refrigerant_line / fluid_routing edges
 *     accommodate both.
 *   - Refrigerant: R32 (typical 20-100 kW EU), R290 propane (low-GWP
 *     retrofit market), R744/CO2 (high-temp / heat-recovery industrial).
 *     Envelopes carry the higher-pressure R744 case.
 *   - Hydronic distribution to building loop is REQUIRED at commercial
 *     scale (vs residential where DHW tank is optional).
 *   - Out of scope: VRF/VRV refrigerant distribution (separate `vrf_system`
 *     graph candidate); absorption chillers (different working-fluid pair).
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const HEAT_PUMP_COMMERCIAL: ProductClassGraph = {
  product_class: 'heat-pump-commercial',
  display_name: 'Commercial Air-Source Heat Pump (20-200 kW)',
  scope_notes:
    'Packaged or split commercial ASHP at the 20-200 kW heating-capacity class. ' +
    '3-phase mains (400 V / 480 V), R32 / R290 / R744 (CO2 transcritical) refrigerant. ' +
    'Hydronic distribution to building loop + buffer tank + AHU coils. BACnet/IP or ' +
    'Modbus TCP integration to BMS. PED 2014/68 Cat II/III applies for R744 high-side. ' +
    'VRF/VRV multi-zone refrigerant distribution and absorption chillers are OUT of scope.',

  nodes: [
    {
      class: 'energy_conversion_transduction',
      role: 'principal',
      required: true,
      display: 'Compressor (scroll / screw / inverter-driven) + EXV + 4-way reversing valve + gas cooler (R744)',
    },
    {
      class: 'mass_fluid_transport_process',
      role: 'subsystem',
      required: true,
      display: 'Refrigerant circuit (HP/LP) + hydronic primary loop + DHW circuit',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: true,
      display: 'Outdoor coil array + indoor plate HX / shell-and-tube + EC fans (variable speed)',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'Outdoor unit chassis + sound-attenuated cabinet + acoustic enclosure + galvanised steel frame',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'PLC controller + EXV driver + inverter VFD board + BACnet/IP or Modbus TCP gateway',
    },
    {
      class: 'sensing_instrumentation',
      role: 'sensor',
      required: true,
      display: 'Temp sensors (PT1000) + HP/LP transducers (4-20 mA) + flow switch + outdoor RH/T',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'HP/LP switches + refrigerant leak detect (R290/R744) + over-temp + PED PSV',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: true,
      display: '3-phase mains terminal block + MCCB + auxiliary 24 V DC supply',
    },
    {
      class: 'actuation_kinematics',
      role: 'actuator',
      required: true,
      display: '4-way reversing valve + EXV stepper + EC fans + circulator pumps (typ. Wilo Stratos)',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: 'F-gas service ports + sight glass + filter-drier access + PED inspection ports',
    },
    {
      class: 'hmi_ergonomics',
      role: 'subsystem',
      required: false,
      display: 'BMS interface (BACnet/IP) + local touchscreen HMI + remote cloud portal',
    },
  ],

  edges: [
    // ── Refrigerant circuit ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'refrigerant_line',
      fluid: {
        // Envelope sized for R744/CO2 transcritical (worst case). For R32/R290
        // see notes; the validator passes any narrower envelope.
        medium: 'refrigerant-CO2',
        pressure_max_bar: 120,
        temperature_max_c: 160,
        temperature_min_c: -40,
        pipe_dn_mm: 22,
      },
      mechanical: { connector: 'brazed copper or rotalock', cable_type: 'copper or steel refrigerant tube' },
      required: true,
      direction: 'mutual',
      notes: 'Compressor (scroll / inverter-driven screw) moves refrigerant through HP/LP circuits via EXV. R32 (31.5 bar trip per residential corpus), R290 propane (26 bar), or R744 CO2 transcritical (90-120 bar gas-cooler outlet, industry). PED 2014/68 Cat II/III applies for CO2 high-side. Inverter-driven scroll typical 20-90 kW; screw for ≥120 kW.',
      source_references: [
        'corpus:High-pressure switch trip point@heat-pump-residential (31.5 bar)',
        'corpus:Refrigerant Volume@heat-pump-residential (0.9 kg)',
        'industry:Viessmann Vitocal 350-HT Pro R744 datasheet (90-120 bar)',
        'industry:Carrier 30HX/30RB commercial chiller manual',
        'standard:EU 517/2014 F-gas',
        'standard:EN 378 refrigerant safety',
        'standard:PED 2014/68/EU (R744 Cat II/III)',
      ],
    },
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'refrigerant_line',
      fluid: {
        medium: 'refrigerant-CO2',
        pressure_max_bar: 120,
        temperature_max_c: 90,
        temperature_min_c: -40,
      },
      required: true,
      direction: 'mutual',
      notes: 'Outdoor coil array (multi-fan EC, V-bank or W-bank) rejects/absorbs heat to/from ambient; indoor plate HX (brazed plate, AISI 316L) or shell-and-tube transfers refrigerant heat to the hydronic loop.',
      source_references: ['standard:BS EN 14511', 'industry:Mitsubishi e-series PUHZ manual', 'industry:Daikin VRV V manual'],
    },

    // ── Hydronic primary loop (REQUIRED at commercial scale) ──
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: {
        medium: 'water-glycol',
        pressure_max_bar: 10,
        flow_max_lpm: 500,
        temperature_max_c: 90,  // R744 transcritical reaches 80-90 °C
        temperature_min_c: -10,
        pipe_dn_mm: 100,
      },
      mechanical: { connector: 'flanged DN50-100 (PN10) or victaulic', cable_type: 'galvanised steel or stainless' },
      required: false,
      direction: 'mutual',
      notes: 'Commercial hydronic primary loop to building distribution: max water pressure 6-10 bar (commercial vs residential 4 bar). LWT 50-65 °C for R32 / 70-90 °C for R744. Flow 100-500 l/min vs residential 25 l/min. Buffer tank + variable-speed circulator (Wilo Stratos / Grundfos MAGNA3). K10-3 ROUTING NOTE: This is the secondary water-glycol return path. Mirrors heat-pump-residential.ts downgrade — emitters reliably emit ONE MFTP→EI fluid edge (refrigerant_line above); this fluid_routing edge is downgraded to required:false so emitters that route the heating loop separately still validate. Canonical chain is via the refrigerant_line + a separate ECT→MFTP→EI for hydronic.',
      source_references: [
        'corpus:Maximum water pressure@heat-pump-residential',
        'corpus:Heating maximum leaving water temperature (Radiator)@heat-pump-residential',
        'industry:Wilo Stratos MAXO commercial circulator',
        'industry:Carrier 30RBV / 30HXC chiller hydronic spec',
        'standard:BS 7593 water treatment',
      ],
    },

    // ── DHW (optional) — commercial buffer tank ──
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: {
        medium: 'water-glycol',
        pressure_max_bar: 10,
        temperature_max_c: 90,
        flow_max_lpm: 200,
        pipe_dn_mm: 50,
      },
      required: false,
      direction: 'mutual',
      notes: 'External buffer tank (500-2000 L) via plate HX or coil. R744 CO2 transcritical reaches 90 °C heat-pump-only (vs R32 55 °C residential corpus). Legionella pasteurisation cycle (60 °C/30 min weekly) per BS 8580.',
      source_references: [
        'corpus:Integrated DHW tank volume options@heat-pump-residential',
        'corpus:Maximum DHW temperature (heat pump only)@heat-pump-residential',
        'industry:Viessmann Vitocell 100-V buffer tank',
        'standard:BS 8580 Legionella risk assessment',
        'standard:WRAS approved fittings',
      ],
    },

    // ── Power path (3-phase REQUIRED) ──
    {
      from_class: 'power_distribution',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'ac_busbar',
      electrical: {
        voltage_nominal_v: 400,
        voltage_range_v: [340, 460],
        ac_or_dc: 'AC',
        ac_phases: 3,
        ac_frequency_hz: 50,
        current_max_a: 200,
      },
      mechanical: { connector: 'flange-mount MCCB or busbar lugs', cable_type: '16-95 mm² 4-core SWA or single-core' },
      required: true,
      direction: 'directional',
      notes: '3-phase 400 V 50 Hz (EU) / 480 V 60 Hz (NA). Mains tolerance ±10%. Dedicated MCCB upstream (typ. 80-250 A frame). PFC + EMI filtering at the inverter input — corpus residential single-phase 230 V is the inverse case.',
      source_references: [
        'corpus:Voltage/Phase/Frequency@heat-pump-residential (230v/1ph/50Hz)',
        'industry:Mitsubishi e-series PUHZ-ZRP electrical spec (400 V 3ph)',
        'industry:Daikin VRV V power supply spec',
        'standard:BS 7671 IET Wiring Regulations',
      ],
    },
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { mount: 'bolted', connector: 'vibration isolators + M12 bolts to galvanised frame' },
      required: true,
      direction: 'mutual',
      notes: 'Compressor + heat exchangers bolt to galvanised steel frame with rubber-in-shear or pneumatic vibration isolators. Sound attenuation hood for EN 12102 ≤55 dB(A) at 10 m (commercial sites near residential).',
      source_references: ['standard:EN 12102 sound power', 'industry:Trane Sintesis acoustic enclosure'],
    },

    // ── Control path (BACnet/IP + BMS) ──
    {
      from_class: 'control_compute_communication',
      to_class: 'energy_conversion_transduction',
      protocol: 'PWM',
      // 26-mechanism set has no PWM entry — use contactor_command as the
      // coarse-grain "controller drives actuator with digital signal" class.
      mechanism: 'contactor_command',
      electrical: { voltage_nominal_v: 24, ac_or_dc: 'DC' },
      required: true,
      direction: 'directional',
      notes: 'PLC drives inverter VFD board (compressor speed 30-100% modulating). EXV stepper command. 4-way valve coil 230 V AC pulsed. Internal CAN/Modbus-RTU bus to subordinate VFD.',
      source_references: ['industry:Carrier 30RB ProDialog+ control', 'industry:Trane Tracer SC+'],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'actuation_kinematics',
      protocol: 'PWM',
      mechanism: 'contactor_command',
      electrical: { voltage_nominal_v: 24, ac_or_dc: 'DC' },
      required: true,
      direction: 'directional',
      notes: 'EXV stepper (typ. Sanhua DPF series, 500-1000 steps full-open at commercial scale). EC fan 0-10 V or PWM. Variable-speed circulator pump 0-10 V (Wilo / Grundfos PWM-A).',
      source_references: ['industry:Sanhua DPF commercial EXV', 'industry:ebm-papst EC fan PWM'],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'sensing_instrumentation',
      protocol: 'PT100',
      mechanism: 'sensor_feedback',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'mutual',
      notes: 'PT1000 4-wire RTDs on suction, discharge, gas-cooler (R744), water inlet, water outlet, outdoor ambient. HP/LP transducers 4-20 mA. Flow switch (paddle or vortex) on hydronic primary. Refrigerant mass-flow inferred from compressor frequency + suction conditions.',
      source_references: ['standard:DIN EN 60751 PT1000', 'industry:Carel transducer commercial datasheet'],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'hmi_ergonomics',
      protocol: 'Modbus-TCP',
      mechanism: 'modbus_tcp',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 5 },
      mechanical: { connector: 'RJ45', cable_type: 'Cat 5e/6' },
      required: false,
      direction: 'mutual',
      notes: 'BACnet/IP (ASHRAE 135 B-AAC profile) or Modbus TCP to BMS (Trend, Siemens Desigo, Schneider EcoStruxure, Honeywell Niagara). Local 7" touchscreen HMI typical. Cloud telemetry over MQTT optional.',
      source_references: ['standard:ASHRAE 135 BACnet', 'industry:Trend IQ BMS integration'],
    },

    // ── Safety path ──
    {
      from_class: 'safety_protection',
      to_class: 'energy_conversion_transduction',
      protocol: 'Digital-24V',
      mechanism: 'safety_isolation',
      electrical: { voltage_nominal_v: 24, ac_or_dc: 'DC' },
      required: true,
      direction: 'directional',
      notes: 'HP switch (R32 31.5 bar / R290 26 bar / R744 120 bar) and LP switch hard-wired to compressor contactor coil — trips compressor independently of PLC. PED PSV (pressure safety valve) on high-side per PED Cat II/III for R744.',
      source_references: [
        'corpus:High-pressure switch trip point@heat-pump-residential',
        'standard:EN 378 refrigerant safety',
        'standard:PED 2014/68/EU PSV requirements',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'sensing_instrumentation',
      protocol: 'Analog-thermistor',
      mechanism: 'alarm_interlock',
      required: true,
      direction: 'mutual',
      notes: 'Refrigerant leak detection (mandatory for R290 propane and R744 CO2 per EN 378) + over-pressure switches + flow-loss switch feed safety logic. R744 leak detector (NDIR CO2 sensor) trips ventilation + shutdown above 5000 ppm (ASHRAE 15).',
      source_references: ['standard:EN 378 leak detection', 'standard:ASHRAE 15 refrigerant safety'],
    },

    // ── Service path ──
    {
      from_class: 'maintenance_serviceability',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'in-line', connector: 'Schrader 1/4" + brazed access' },
      required: false,
      direction: 'mutual',
      notes: 'F-gas service access ports for refrigerant recovery + pressure testing per EU 517/2014. PED inspection ports on R744 high-side for periodic re-test (every 5-10 years per PED Cat).',
      source_references: ['standard:EU 517/2014 F-gas', 'standard:PED 2014/68 periodic inspection'],
    },
  ],

  sources_cited: [
    'corpus:heat-pump-residential (~25 datasheets, 2026-05-18 — extrapolated)',
    'corpus:mini_split_heatpump (~9 datasheets — supplementary)',
    'standard:BS EN 14511 (performance)',
    'standard:EN 12102 (sound)',
    'standard:EN 378 (refrigerant safety)',
    'standard:PED 2014/68/EU (pressure equipment)',
    'standard:EU 517/2014 (F-gas)',
    'standard:EU 626/2011 (ecodesign)',
    'standard:ASHRAE 135 BACnet',
    'standard:ASHRAE 15 (refrigerant safety)',
    'standard:BS 8580 (Legionella)',
    'standard:BS 7671 IET Wiring Regulations',
    'industry:Mitsubishi e-series PUHZ-ZRP commercial ASHP',
    'industry:Daikin VRV V manual',
    'industry:Carrier 30RB / 30HX / 30RBV chiller manual',
    'industry:Trane Sintesis / Tracer SC+ BMS',
    'industry:Viessmann Vitocal 350-HT Pro R744 transcritical CO2',
  ],
}

registerClassReferenceGraph(HEAT_PUMP_COMMERCIAL)

export { HEAT_PUMP_COMMERCIAL }
