/**
 * @file class-reference-graphs/chiller.ts — K10 typed graph for
 * industrial water-glycol chillers (80-2500 ton, ~280-8800 kW capacity).
 *
 * @description Models a large-scale industrial process chiller at the
 * 80-2500 ton (~280-8800 kW) class — Carrier 19DV / 30HXC / 30RB,
 * Trane CenTraVac / Sintesis RTAF / RTHE, York YK / YZ, Daikin McQuay
 * Magnitude, Smardt centrifugal magnetic-bearing. Provides the thermal-
 * side complement to `heat-pump-commercial`: where HPC supports both
 * heating and cooling via 4-way reversing valve, this chiller is
 * single-direction cooling-only, with the focus on:
 *   - Centrifugal / screw compressor + flooded shell-and-tube evaporator /
 *     condenser (vs HPC's plate HX + scroll / inverter screw).
 *   - Refrigerant: R-134a (corpus dominant), R-1233zd(E) (HFO low-GWP),
 *     R-513A blend, R-410A (smaller air-cooled units) — all higher-
 *     pressure HFC / HFO than HPC's R32 / R290.
 *   - Hydronic-only output (no DHW; condenser-side water-glycol or
 *     air-cooled).
 *   - BACnet / LonTalk / Modbus to BMS — corpus carries LonTalk for chiller-
 *     specific control (LONMARK Functional Chiller Profile 8040).
 * Most modules reuse the HPC structure — refrigerant_line, fluid_routing,
 * 3-phase mains, BACnet integration. Differences are in the envelopes
 * (higher pressure for R-134a, larger DN piping for ≥1000 lpm chilled
 * water flow) and removal of the reversing-valve / DHW edges.
 *
 * @sources Corpus values from `pretraining_extracted_specs` joined to
 * `pretraining_spec_documents WHERE product_class='chiller'` at
 * ~/.forge-truth/forge-truth.db (12 datasheets — Carrier 19DV / 30HXC,
 * Trane CenTraVac, McQuay AGS, York YK). Industrial-chiller standards
 * from corpus: AHRI 550/590 (performance), ASHRAE 15 (refrigerant safety),
 * UL 1995 (US chiller listing), EUROVENT (EU certification), PED 2014/68
 * (EU pressure equipment), ASME Section VIII (US pressure vessel),
 * EN 14511 (EU performance), BACnet (ASHRAE 135), LONMARK Chiller
 * Profile 8040.
 *
 * @corpus-coverage-2026-05-18
 *   - Capacity: 65-240 / 80-2500 / 400-1000 ton (corpus); 1400-3510 kW —
 *     corpus direct.
 *   - Refrigerant: R-134a (dominant, 7/12 docs); HFC-410A; HFC-134a;
 *     R134a; minimum refrigerant pressure differential 25 psid — corpus direct.
 *   - Evaporator refrigerant side working pressure: 200-430 psig (~14-30
 *     bar) — corpus direct.
 *   - Condenser design pressure: 300 psig; MAWP 650 psig (~45 bar);
 *     proof test 715 psig — corpus direct.
 *   - Evaporator water side working pressure: 10 bar / 150 psig — corpus.
 *   - Discharge temp shutdown: 110 °C (compressor) — corpus.
 *   - Evaporator freeze protection: -28 °C — corpus.
 *   - Leaving water temp range: 20-60 °C (condenser); -8 to +18 °C
 *     (evaporator) — corpus direct.
 *   - Voltage: 380 / 460 / 575 V 3ph 50/60 Hz; control 115 V; 24 V flow
 *     switch — corpus direct.
 *   - Efficiency: 0.55 kW/ton (IPLV typical) — corpus direct.
 *   - COP: 4.8 — corpus.
 *   - Standards: AHRI 550/590, AHRI 575-87 sound, ASHRAE 15 / 90.1,
 *     UL 1995, IBC 2018, ASME Section VIII, PED 2014/68, EUROVENT,
 *     EN 14511, BACnet, LONMARK Profile 8040, NEC, IEEE 519 (harmonics),
 *     EN 60439-1, EN 954-1 / ISO 13849-1, AWWA C-606 (pipe), EU 813/2013
 *     (Ecodesign) — corpus direct.
 *
 * @scope-2026-05-18
 *   - Water-cooled centrifugal / screw chiller (Carrier 19DV / 30HXC,
 *     Trane CenTraVac, York YK / YZ) at the 200-2500 ton class.
 *   - Air-cooled scroll / screw chiller (Carrier 30RBV / 30RAP, Trane
 *     RTAF, York YLAA) at the 80-500 ton class — also covered; the
 *     condenser-side `mass_fluid_transport_process` ↔ `environmental_interface`
 *     edge envelope handles both water and air rejection.
 *   - Magnetic-bearing oil-free centrifugal (Smardt / Daikin Magnitude)
 *     — shares K10 module set; tribology differences are envelope-level.
 *   - Absorption chillers (LiBr / NH3-H2O) are OUT of scope (different
 *     working-fluid pair, no compressor).
 *   - VRF / VRV multi-zone refrigerant distribution is OUT of scope.
 *   - Process chillers below 65 tons (laboratory recirculating chillers,
 *     spot cooling) are OUT of scope — see lab benchtop chiller category.
 *   - Refrigerant focus: R-134a (incumbent), R-1233zd(E) HFO, R-513A blend;
 *     legacy R-22 phase-out is OUT of scope.
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const CHILLER: ProductClassGraph = {
  product_class: 'chiller',
  display_name: 'Industrial Water-Glycol Chiller (80-2500 ton, ~280-8800 kW)',
  scope_notes:
    'Centrifugal / screw / scroll industrial chiller at the 80-2500 ton class. ' +
    'Water-cooled or air-cooled rejection. R-134a / R-1233zd(E) / R-513A / R-410A ' +
    'refrigerants. 3-phase 380-575 V mains. BACnet / LonTalk / Modbus to BMS. ' +
    'PED Cat II/III + ASME Section VIII pressure-vessel scope. ' +
    'Absorption chillers, VRF/VRV, and <65 ton lab chillers are OUT of scope.',

  nodes: [
    {
      class: 'energy_conversion_transduction',
      role: 'principal',
      required: true,
      display: 'Compressor (centrifugal / screw / scroll, magnetic-bearing oil-free variant) + EXV + economiser',
    },
    {
      class: 'mass_fluid_transport_process',
      role: 'subsystem',
      required: true,
      display: 'Refrigerant HP/LP circuits + evaporator chilled-water loop + condenser water-glycol loop',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: true,
      display: 'Flooded shell-and-tube evaporator + condenser (water-cooled) OR microchannel coil + EC fan bank (air-cooled)',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'Skid base frame + sound-attenuated cabinet + galvanised steel + (IBC 2018) seismic anchors',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'Microprocessor controller (Trane Tracer / Carrier ProDialog+ / York OptiView) + BACnet/LonTalk gateway',
    },
    {
      class: 'sensing_instrumentation',
      role: 'sensor',
      required: true,
      display: 'PT100 temp + HP/LP transducers (4-20 mA) + chilled / condenser water flow switch + EXV position',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'HP/LP switch + discharge over-temp + freeze-stat + ASHRAE 15 refrigerant leak detect + relief valve',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: true,
      display: '3-phase 380-575 V mains terminal + AFD (Adaptive Frequency Drive) starter + 115 V control TX',
    },
    {
      class: 'actuation_kinematics',
      role: 'actuator',
      required: true,
      display: 'EXV stepper + AFD-driven compressor motor + condenser fan EC drives + 3-way condenser valve',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: 'F-gas service ports + sight glass + oil drain (oil-bearing variants) + condenser tube cleaning ports',
    },
    {
      class: 'hmi_ergonomics',
      role: 'subsystem',
      required: false,
      display: 'OptiView / Tracer touchscreen 12.1" + BMS uplink (BACnet/IP, LonTalk, Modbus TCP)',
    },
  ],

  edges: [
    // ── Refrigerant HP/LP circuit ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'refrigerant_line',
      fluid: {
        medium: 'refrigerant-R134a',    // corpus 7/12 docs primary; envelope also covers R-1233zd (HFO) + R-410A (smaller commercial)
        pressure_max_bar: 45,           // corpus: condenser MAWP 650 psig ≈ 45 bar
        temperature_max_c: 110,         // corpus: discharge temp shutdown 110 °C
        temperature_min_c: -28,         // corpus: freeze protection -28 °C
        pipe_dn_mm: 65,
      },
      mechanical: { connector: 'flanged copper / steel piping + brazed', cable_type: 'copper or stainless refrigerant tube' },
      required: true,
      direction: 'mutual',
      notes: 'Compressor moves refrigerant through HP / LP circuits via EXV. R-134a dominant (corpus 7/12 docs) at 200-430 psig evaporator side; condenser MAWP 650 psig per corpus. Centrifugal (200+ ton — Carrier 19DV, Trane CenTraVac, York YK) or twin-screw (65-450 ton — McQuay, Trane RTHE) typical; oil-free magnetic-bearing centrifugal (Smardt, Daikin Magnitude) for high-efficiency. Compressor restart anti-recycle 3-5 min (corpus). Discharge superheat 25 °F (corpus).',
      source_references: [
        'corpus:Refrigerant@chiller (R-134a)',
        'corpus:Refrigerant@chiller (HFC-410A)',
        'corpus:Evaporator Refrigerant Side Working Pressure@chiller (430 psig)',
        'corpus:Condenser Maximum Allowable Working Pressure@chiller (650 psig)',
        'corpus:Compressor discharge temperature shutdown@chiller (110 °C)',
        'corpus:Compressor anti-recycle time@chiller (5 minutes)',
        'corpus:Compressor restart time@chiller (3 minutes)',
        'corpus:Discharge Superheat@chiller (25 °F)',
        'corpus:Minimum refrigerant pressure differential@chiller (25 psid)',
        'industry:Carrier 19DV centrifugal R-1233zd HFO',
        'industry:Trane CenTraVac R-1233zd',
        'standard:ASME Section VIII Div 1 pressure vessel',
        'standard:PED 2014/68/EU Cat II/III',
        'standard:ASHRAE 15 refrigerant safety',
      ],
    },
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'refrigerant_line',
      fluid: {
        medium: 'refrigerant-R134a',    // corpus dominant; envelope also covers R-1233zd / R-410A
        pressure_max_bar: 30,           // evaporator side typ. 50-200 psia; condenser side 200-300 psig
        temperature_max_c: 60,
        temperature_min_c: -28,
        pipe_dn_mm: 100,
      },
      required: true,
      direction: 'mutual',
      notes: 'Flooded shell-and-tube evaporator (typ. enhanced inner-fin copper or stainless tube, 0.75-1.25" OD) transfers refrigerant heat to chilled-water loop. Water-cooled condenser shell-and-tube (or microchannel coil + EC fan bank for air-cooled variants — Carrier 30RBV / Trane RTAF). Tube fouling factor 0.0001 °F·ft²h/Btu (corpus). Subcooling 3-5 °C (corpus). Evaporator approach 3 °F (corpus).',
      source_references: [
        'corpus:Evaporator Approach@chiller (3 °F)',
        'corpus:Subcooling value@chiller (3-5 °C)',
        'corpus:Evaporator Insulation Thickness@chiller (0.75 inch)',
        'corpus:Evaporator fouling factor (I-P)@chiller (0.00010 °F·ft²h/Btu)',
        'corpus:Evaporator freeze protection temperature@chiller (-28 °C)',
        'industry:Carrier 30HXC water-cooled chiller',
        'industry:Trane RTAF air-cooled microchannel chiller',
        'standard:AHRI 550/590 chiller performance',
      ],
    },

    // ── Chilled-water hydronic loop (REQUIRED for process cooling) ──
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: {
        medium: 'water-glycol',
        pressure_max_bar: 10,            // corpus: evaporator water side 150 psig ≈ 10 bar
        flow_max_lpm: 5000,
        temperature_max_c: 65,           // corpus: low-temp process leaving water range 10-65 °F upper bound for warm-water apps
        temperature_min_c: -8,           // corpus: evaporator LWT min -8 °C
        pipe_dn_mm: 200,
      },
      mechanical: { connector: 'flanged DN150-200 (PN10) or victaulic groove', cable_type: 'galvanised steel or stainless 304' },
      required: true,
      direction: 'mutual',
      notes: 'Primary chilled-water loop to building / process load. Evaporator LWT setpoint -8 to +18 °C (corpus); condenser LWT 26.7-60 °C (corpus). Water-side working pressure 10 bar / 150 psig (corpus). Flow change tolerance 10% per minute (corpus); min/max 80-120% (corpus). Variable-flow pumping (VPF) with bypass on min flow. K10-3 ROUTING NOTE: Mirrors heat-pump-commercial downgrade pattern is NOT used here — chiller emitters reliably split refrigerant_line (above) and fluid_routing (this edge) into two distinct MFTP↔EI emissions; both REQUIRED.',
      source_references: [
        'corpus:Evaporator Waterside Working Pressure@chiller (150 psig)',
        'corpus:Evaporator water side design pressure@chiller (10.0 bar)',
        'corpus:Evaporator leaving water temperature (min/max)@chiller (-8 / + 18 °C)',
        'corpus:Condenser Leaving Water Temperature Setpoint Range@chiller (26.7 to 60 °C)',
        'corpus:Evaporator water flow rate limit (max)@chiller (120%)',
        'corpus:Flow change tolerance@chiller (10% per minute)',
        'industry:Carrier 19DV / Trane CenTraVac evaporator',
        'standard:AWWA C-606 grooved-end piping',
        'standard:BS 7593 water treatment',
      ],
    },

    // ── Condenser water loop (REQUIRED for water-cooled variants) ──
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: {
        medium: 'water-glycol',
        pressure_max_bar: 10,
        flow_max_lpm: 8000,
        temperature_max_c: 60,
        temperature_min_c: 5,
        pipe_dn_mm: 250,
      },
      mechanical: { connector: 'flanged DN200-250 (PN10)', cable_type: 'galvanised steel or HDPE' },
      required: false,
      direction: 'mutual',
      notes: 'Condenser water loop to cooling tower (typ. open evaporative) or geothermal loop or seawater intake. ECWT (entering) 35 °C minimum (corpus 95 °F). Required:false because air-cooled variants (30RBV / RTAF / YLAA) reject directly to ambient via microchannel coil + EC fan; only water-cooled variants need this edge.',
      source_references: [
        'corpus:Entering Condenser Water Temperature (Min)@chiller (35 °C)',
        'corpus:Condenser leaving water temperature (min/max)@chiller (20 / 60 °C)',
        'industry:BAC / EVAPCO cooling tower',
        'industry:Carrier 30HXC condenser water-side',
      ],
    },

    // ── Power: 3-phase mains → AFD → compressor ──
    {
      from_class: 'power_distribution',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'ac_busbar',
      electrical: {
        voltage_nominal_v: 460,
        voltage_range_v: [380, 575],     // corpus: 380/460/575 V; 400 V EU
        ac_or_dc: 'AC',
        ac_phases: 3,
        ac_frequency_hz: 60,             // 50 Hz EU; corpus shows both 50/60
        current_max_a: 600,              // 1000+ A on large centrifugal at 460 V
      },
      mechanical: { connector: 'busbar lugs M16 + flanged disconnect switch', cable_type: '50-300 mm² 4-core SWA or single-core' },
      required: true,
      direction: 'directional',
      notes: '3-phase 380-575 V mains per corpus. Mains tolerance ±10% (corpus); unbalance ±3% (corpus). Adaptive Frequency Drive (AFD) starter — soft-start of compressor motor to limit inrush; overload trip 132% (corpus), hold 125% (corpus). Control power TX 820 VA per corpus rating; 115 V AC control circuit (corpus); 24 V DC flow-switch circuit. NEC 310-16 conductor sizing.',
      source_references: [
        'corpus:Voltage@chiller (380/460/575 V)',
        'corpus:Power supply@chiller (400/3/50 V/Ph/Hz)',
        'corpus:Voltage tolerance@chiller (± 10%)',
        'corpus:Voltage unbalance limit@chiller (± 3%)',
        'corpus:AFD Motor Current Overload Trip@chiller (132%)',
        'corpus:Control Power Transformer Rating@chiller (820 VA)',
        'corpus:Control circuit voltage@chiller (115 volts)',
        'corpus:Flow switch circuit voltage@chiller (24 V)',
        'standard:NEC 310-16 conductor ampacity',
        'standard:IEEE 519 harmonic distortion',
        'standard:UL 1995 / CSA C22.2 No. 236 listing',
      ],
    },

    // ── Control: PLC → AFD compressor + EXV + fans + valves ──
    {
      from_class: 'control_compute_communication',
      to_class: 'energy_conversion_transduction',
      protocol: 'Modbus-TCP',
      mechanism: 'modbus_tcp',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      mechanical: { connector: 'RJ45 or screw terminal', cable_type: 'Cat 5e or RS-485' },
      required: true,
      direction: 'mutual',
      notes: 'Microprocessor controller (Carrier ProDialog+, Trane Tracer SC+, York OptiView, McQuay MicroTech III) commands AFD compressor speed (modulating 10-100%), EXV step position (typ. 480-step EXV per corpus, 10-second transit), economiser bypass valve, condenser 3-way valve. Internal CANbus / RS-485 to subordinate boards. 50 μs controller update rate (corpus).',
      source_references: [
        'corpus:Electronic expansion valve step count@chiller (480)',
        'corpus:Electronic expansion valve transit time@chiller (10 seconds)',
        'corpus:Controller update rate@chiller (50 microseconds)',
        'corpus:Condenser 3 Way Valve output@chiller (0-10 VDC)',
        'industry:Carrier ProDialog+ chiller controller',
        'industry:Trane Tracer SC+ controller',
        'industry:York OptiView Plus controller',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'actuation_kinematics',
      protocol: 'PWM',
      mechanism: 'contactor_command',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'directional',
      notes: 'EXV stepper command (480 steps full-open per corpus). Condenser fan EC drives (0-10 V or PWM-A per corpus 0-10 VDC). 3-way condenser valve actuator (115 V or 220 V AC modulating per corpus actuator voltage). Variable-speed evaporator / condenser pump command via 0-10 V to inverter.',
      source_references: [
        'corpus:Actuator Voltage@chiller (115 or 220 V)',
        'corpus:Actuator Frequency@chiller (50 or 60 Hz)',
        'corpus:Chiller Amps output@chiller (0-10 VDC)',
        'industry:Carel EXV stepper E2V',
        'industry:ebm-papst EC condenser fan',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'sensing_instrumentation',
      protocol: 'PT100',
      mechanism: 'sensor_feedback',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'mutual',
      notes: 'PT1000 / PT100 4-wire RTDs on suction, discharge, condenser leaving water, condenser entering water, evaporator leaving water, evaporator entering water, oil temp (oil-bearing variants). HP/LP transducers 4-20 mA. Flow switch (paddle or vortex) on chilled and condenser water sides (corpus: 35-45 cm/s setpoint). Communication-loss diagnostic 15-30 sec (corpus).',
      source_references: [
        'corpus:Communication loss diagnostic time@chiller (15-30 seconds)',
        'corpus:Flow Switch (Water)@chiller (35 cm/s)',
        'corpus:Chilled water temperature control accuracy@chiller (±1.1 °C)',
        'corpus:Analog signal@chiller (4-20 mA)',
        'industry:Carel transducer chiller datasheet',
        'standard:DIN EN 60751 PT100',
      ],
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
      notes: 'BACnet/IP (ASHRAE 135 B-AAC profile) or LonTalk (LONMARK Functional Chiller Profile 8040 per corpus) or Modbus TCP to BMS. Local 12.1" touchscreen (corpus: Display Size 12.1") with diagnostic checks (corpus: 100 diagnostics). USB 2.0 + Ethernet 10/100 LAN per corpus. Cloud telemetry typical via MQTT or vendor portal (Carrier OptionLink, Trane Tracker).',
      source_references: [
        'corpus:Display Size@chiller (12.1 inch)',
        'corpus:Diagnostic Checks@chiller (100)',
        'corpus:LONMARK Functional Chiller Profile 8040@chiller',
        'corpus:USB 2.0@chiller',
        'corpus:Ethernet 10/100 LAN@chiller',
        'standard:ASHRAE 135 BACnet',
        'standard:LONMARK Functional Chiller Profile 8040',
      ],
    },

    // ── Safety ──
    {
      from_class: 'safety_protection',
      to_class: 'energy_conversion_transduction',
      protocol: 'Digital-24V',
      mechanism: 'safety_isolation',
      electrical: { voltage_nominal_v: 24, ac_or_dc: 'DC' },
      required: true,
      direction: 'directional',
      notes: 'HP switch (typ. 250 psig R-134a / 600 psig R-410A) and LP switch hard-wired to compressor contactor coil. Discharge over-temp 110 °C (corpus) trips. Freeze-stat on evaporator LWT < 2 °C trips before -28 °C corpus freeze-protection bound. Bearing system 500 W power consumption check (corpus, magnetic-bearing variants). PED PSV on refrigerant high-side per PED Cat II/III for R-134a / R-410A.',
      source_references: [
        'corpus:Compressor discharge temperature shutdown@chiller (110 °C)',
        'corpus:Bearing system power consumption@chiller (500 watts)',
        'corpus:Compressor motor insulation resistance threshold@chiller (50 megohms)',
        'corpus:High evaporator refrigerant pressure trip@chiller (190 psig)',
        'corpus:Emergency Stop trip time@chiller (0.1 to 1.0 seconds)',
        'standard:PED 2014/68/EU PSV requirements',
        'standard:ASHRAE 15 refrigerant safety',
        'standard:UL 1995 chiller listing',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'sensing_instrumentation',
      protocol: 'Analog-thermistor',
      mechanism: 'alarm_interlock',
      required: true,
      direction: 'mutual',
      notes: 'Refrigerant leak detection (ASHRAE 15 — mandatory in occupied spaces with R-134a / R-1233zd / R-410A above thresholds) + flow-loss switch + bearing over-temp + oil-level low. Alarm log capacity 10 events (corpus). Adjustable filter time 0-600 s (corpus) for alarm latching.',
      source_references: [
        'corpus:Alarm log capacity@chiller (10)',
        'corpus:Adjustable Filter Time@chiller (0 to 600 seconds)',
        'corpus:Communication loss diagnostic time@chiller (30 seconds)',
        'standard:ASHRAE 15 refrigerant safety',
        'standard:EN 378 refrigerant safety',
      ],
    },

    // ── Mechanical: skid → seismic anchors ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { mount: 'bolted', connector: 'skid base + vibration isolators + IBC 2018 seismic anchors' },
      required: true,
      direction: 'mutual',
      notes: 'Compressor + evaporator + condenser shells bolt to skid base frame (galvanised steel) with rubber-in-shear or spring isolators. Seismic anchors per IBC 2018 / ASCE 7-10 (corpus shows IBC 2000, 2003, 2006, 2009, 2018, ASCE 7-10 lineage). OSHPD pre-approval (Hospital-Code California) typical for healthcare projects. Sound attenuated cabinet for ASHRAE 90.1 / EUROVENT noise compliance.',
      source_references: [
        'corpus:IBC@chiller (IBC 2000, 2003, 2006, 2009)',
        'corpus:OSHPD@chiller',
        'corpus:Compressor weight@chiller (300 lbs)',
        'corpus:Condenser weight@chiller (484 lbs)',
        'corpus:Evaporator weight@chiller (417 lbs)',
        'standard:IBC 2018 seismic anchorage',
        'standard:ASCE 7-10 seismic design',
        'standard:OSHPD pre-approval (California Hospital Code)',
      ],
    },

    // ── Service ──
    {
      from_class: 'maintenance_serviceability',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'in-line', connector: 'Schrader 1/4" + brazed access + condenser end-bell removal' },
      required: false,
      direction: 'mutual',
      notes: 'F-gas service access ports (corpus: evacuation pressure 200 Pa, final 66.5 Pa, vacuum level 1000 microns). Sight glass + filter-drier access. Oil drain port (oil-bearing variants — magnetic-bearing oil-free variants skip this). Condenser end-bell removable for tube cleaning (corpus: 580 psi sprayer pressure, 25° angle, 1-3" distance). PED inspection ports per 5-10 year periodic re-test.',
      source_references: [
        'corpus:Evacuation pressure@chiller (200 Pa)',
        'corpus:Final evacuation pressure@chiller (66.5 Pa)',
        'corpus:Evacuation vacuum level@chiller (1000 microns)',
        'corpus:Condenser Coil Cleaning Sprayer Pressure@chiller (580 psi)',
        'corpus:Condenser Coil Cleaning Source Angle@chiller (25 degrees)',
        'standard:EU 517/2014 F-gas regulation',
        'standard:PED 2014/68 periodic inspection',
      ],
    },
  ],

  sources_cited: [
    'corpus:chiller (12 datasheets, 2026-05-18 — Carrier 19DV / 30HXC / 30RB, Trane CenTraVac / Sintesis / RTAF, York YK / YZ, McQuay)',
    'standard:AHRI 550/590 (chiller performance)',
    'standard:AHRI 575-87 (chiller sound)',
    'standard:ASHRAE 15 (refrigerant safety)',
    'standard:ASHRAE 90.1 (energy efficiency)',
    'standard:ASHRAE 135 BACnet',
    'standard:UL 1995 / CSA C22.2 No. 236 (chiller listing)',
    'standard:ASME Section VIII Div 1 (US pressure vessel)',
    'standard:PED 2014/68/EU (EU pressure equipment)',
    'standard:EN 14511 (EU performance)',
    'standard:EN 60439-1 / EN 61439-1 (switchgear)',
    'standard:EN 954-1 / ISO 13849-1 (safety control)',
    'standard:LONMARK Functional Chiller Profile 8040',
    'standard:IEEE 519 (harmonic distortion — AFD-equipped chillers)',
    'standard:NEC 310-16 (conductor ampacity)',
    'standard:IBC 2018 / ASCE 7-10 (seismic)',
    'standard:OSHPD pre-approval (California Hospital Code)',
    'standard:Kyoto Protocol + EU F-gas 517/2014',
    'standard:EU 813/2013 + EU Ecodesign Directive 2009/125/EC',
    'industry:Carrier 19DV / 19XR / 30HXC / 30RBV',
    'industry:Trane CenTraVac / Sintesis RTAF / RTHE',
    'industry:York YK / YZ centrifugal',
    'industry:McQuay AGS / WGS / Daikin Magnitude oil-free',
    'industry:Smardt centrifugal magnetic-bearing',
  ],
}

registerClassReferenceGraph(CHILLER)

export { CHILLER }
