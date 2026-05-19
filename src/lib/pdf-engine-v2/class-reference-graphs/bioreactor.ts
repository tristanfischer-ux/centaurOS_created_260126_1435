/**
 * @file class-reference-graphs/bioreactor.ts — K10 typed graph for
 * stirred-tank / rocking-bag bioreactors (5-2000 L working volume class).
 *
 * @description Models a single-use or stainless stirred-tank bioreactor at
 * the 5-2000 L working volume class — Sartorius BIOSTAT STR / Cytiva Xuri /
 * Cytiva HyPerforma / Eppendorf BioBLU / Thermo HyPerforma DynaDrive / Merck
 * Mobius CellReady class. Tests three K10 paths simultaneously:
 *   - `mass_fluid_transport_process` (media + buffer + harvest peristaltic
 *     pumps + sparger gas mass flow control).
 *   - `environmental_interface` cleanroom integration (ISO 14644-1 Class
 *     5/7/8 grade-D HVAC + jacketed thermal loop + room CO2 / O2 dosing).
 *   - GMP `safety_protection` (over-pressure relief on the head plate,
 *     sterility-breach detection, foam-out interlock, BSC + spill containment).
 * Pairs with existing pharma adjacency (insulin pump) — the GMP /
 * cleanroom-grade taxonomic layer crosses both classes.
 *
 * @sources Corpus values from `pretraining_extracted_specs` joined to
 * `pretraining_spec_documents WHERE product_class='bioreactor'` at
 * ~/.forge-truth/forge-truth.db (9 datasheets — primarily Sartorius STR
 * series + Cytiva Xuri rocking bag + Mobius CellReady single-use).
 * Bioreactor-specific prose priors from class-connections.ts BIOREACTOR
 * entry. GMP standards from class-standards.ts BIOREACTOR entry (EU GMP
 * Vol 4 Annex 1, ISO 14644, PED 2014/68, BPSA/BPOG SUS, ISO 13485).
 *
 * @corpus-coverage-2026-05-18
 *   - Working volume: 5 / 10 / 15 / 20 / 30 L (Xuri rocking-bag), 50 / 200 /
 *     500 / 1000 L (STR series), 1200 L max — corpus direct.
 *   - Total volume STR: 68 / 280 / 680 / 1280 L for the 50/200/500/1000 L
 *     working — corpus direct.
 *   - Stirring speed: 10-600 rpm (stirred-tank); 4-25 rocks/min Xuri —
 *     corpus direct.
 *   - pH range: 4.5-8.5 measurement; 6.0-8.0 control; accuracy ±0.05 pH —
 *     corpus direct.
 *   - DO range: 0-250% air saturation measurement; ±5% accuracy — corpus.
 *   - Process temp: 5-40 °C; jacketed; ±0.2 °C control typical — corpus.
 *   - Sparger gas: O2, N2, CO2, air at 2-5 bar inlet; MFC 1% accuracy;
 *     500:1 turndown — corpus direct.
 *   - Pump flow: 0.005-5200 mL/h peristaltic; 1.2 mL/min - 3.3 L/min — corpus.
 *   - Mains: 100-240 VAC single phase OR 400 VAC 3-phase 16 A; 50/60 Hz —
 *     corpus direct.
 *   - Power: 1-12 kVA range — corpus direct.
 *   - IP: IP21 (process control) / IP45 to NEMA 4 (IP65) for bag-handling —
 *     corpus.
 *   - Wetted-parts surface roughness: 0.8 μm Ra (AISI 316L); MoC 1.4435 /
 *     1.4404 — corpus direct.
 *   - Standards: EU GMP Annex 1 (sterile), ISO 14644 (cleanroom), 21 CFR
 *     Part 11 (e-records), USP <88> Class VI / ISO 10993 (biocompatibility),
 *     ASME + PED 2014/68 (pressure vessel), GAMP (computerised systems),
 *     EN 61010 (lab equip safety), MODBUS + 10Base-T Ethernet (comms) —
 *     corpus direct.
 *
 * @scope-2026-05-18
 *   - Single-use bag (Sartorius BIOSTAT STR / Cytiva Xuri / Mobius CellReady)
 *     AND stainless stirred-tank (BIOSTAT D-DCU / HyPerforma DynaDrive) —
 *     both share the K10 module set; envelopes carry both.
 *   - Mammalian / microbial cell culture (CHO, T-cell, HEK, E. coli) at the
 *     5 L (R&D) to 2000 L (clinical / commercial) scale.
 *   - Photobioreactors (microalgae), wave-mixed perfusion, hollow-fibre
 *     bioreactors are OUT of scope (different mass-transfer topology).
 *   - Cleanroom integration assumed (ISO 14644 grade-D minimum, grade-C/B
 *     for sterile cell-therapy work). Stand-alone benchtop R&D variant
 *     supported via `environmental_interface` being required:true regardless.
 *   - GMP-cleanroom adjacency tested via the structure_containment + EI
 *     edges — autoclavable / gamma-sterilised / single-use disposable head-
 *     plate variants all converge to the same K10 edge set.
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const BIOREACTOR: ProductClassGraph = {
  product_class: 'bioreactor',
  display_name: 'Bioreactor (Stirred-Tank or Rocking-Bag, 5-2000 L)',
  scope_notes:
    'Single-use bag or stainless stirred-tank bioreactor at the 5-2000 L working-volume class. ' +
    'Sartorius BIOSTAT STR / Cytiva Xuri / Mobius CellReady / HyPerforma DynaDrive class. ' +
    'Mammalian / microbial cell culture. ISO 14644 grade-D cleanroom integration assumed; ' +
    '21 CFR Part 11 + EU GMP Annex 1 + ASME / PED pressure-vessel scope. ' +
    'Photobioreactors, hollow-fibre, and wave-mixed perfusion are OUT of scope.',

  nodes: [
    {
      class: 'structure_containment',
      role: 'principal',
      required: true,
      display: 'Vessel + head plate + jacketed shell (AISI 316L 0.8 μm Ra) or gamma-sterilised single-use bag',
    },
    {
      class: 'mass_fluid_transport_process',
      role: 'subsystem',
      required: true,
      display: 'Media + buffer + nutrient feed pumps (peristaltic) + sparger + harvest line + sample port',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: true,
      display: 'Jacketed water-glycol thermal loop + cleanroom HVAC tie-in + CO2 / O2 / N2 dosing manifold',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'PLC controller (GAMP-5 / 21 CFR Part 11 audit-trail) + MFC + Modbus / Ethernet uplink to DCS',
    },
    {
      class: 'sensing_instrumentation',
      role: 'sensor',
      required: true,
      display: 'pH + DO + temperature + foam + level + mass-balance + optional Raman / capacitance probes',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'Head-plate over-pressure PSV + sterility-breach detect + foam-out interlock + jacket high-temp',
    },
    {
      class: 'actuation_kinematics',
      role: 'actuator',
      required: true,
      display: 'Top- or bottom-driven agitator (Rushton / pitched-blade impeller) + rocking platform + drive motor',
    },
    {
      class: 'energy_conversion_transduction',
      role: 'subsystem',
      required: false,
      display: 'Agitator drive (inverter VFD board) + heat-exchanger circulator pump (Wilo / Watson-Marlow)',
    },
    {
      class: 'hmi_ergonomics',
      role: 'subsystem',
      required: true,
      display: 'Touchscreen HMI + recipe management + e-record sign-off + alarm log + remote viewer',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: 'CIP / SIP service ports + autoclave-rated removable sub-assemblies + bag-load / harvest hatch',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: false,
      display: 'Single-phase 100-240 V AC OR 3-phase 400 V AC mains + 24 V DC instrument bus',
    },
  ],

  edges: [
    // ── Feed path: media + buffer reservoirs → pumps → vessel ──
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: {
        medium: 'process-fluid',
        pressure_max_bar: 0.5,        // corpus: max 0.1 bar (10 kPa) headspace, 0.5 bar burst margin
        flow_max_lpm: 5,              // corpus: 1.2 mL/min - 3.3 L/min peristaltic upper bound
        temperature_max_c: 50,        // process media kept ambient; corpus 5-40 °C process
        temperature_min_c: 5,
        pipe_dn_mm: 25,
      },
      mechanical: {
        connector: 'tri-clamp (TC) or aseptic genderless connector (Pall Kleenpak / CPC AseptiQuik)',
        cable_type: 'platinum-cured silicone tubing 6-12 mm OD',
      },
      required: true,
      direction: 'mutual',
      notes: 'Media + buffer + nutrient + base / acid pH-control reservoirs feed the vessel via metered peristaltic pumps (typ. Watson-Marlow 530S / Masterflex L/S). Aseptic genderless connectors (Kleenpak, CPC AseptiQuik, ReadyMate) preserve sterility across bag-pump and pump-vessel transitions. Harvest line + sample port pass through the vessel head plate. PED 2014/68 applies to stainless vessels above PS×V threshold; single-use bag-on-skid below.',
      source_references: [
        'corpus:peristaltic_pump_flow_rate@bioreactor (1.2 mL/min - 3.3 L/min)',
        'corpus:pump_flow_rate_high@bioreactor (5200 mL/h)',
        'corpus:Maximum operating pressure@bioreactor (0.1 bar)',
        'corpus:Surface roughness (product wetted parts)@bioreactor (0.8 μm)',
        'corpus:Material@bioreactor (1.4301 AISI 304 / 1.4435 / 1.4404 AISI 316L)',
        'industry:Watson-Marlow 530S peristaltic pump',
        'industry:Pall Kleenpak / CPC AseptiQuik aseptic connector',
        'standard:PED 2014/68/EU',
        'standard:USP <88> Class VI biocompatibility',
      ],
    },

    // ── Sparger gas inlet path: mass-flow controllers → vessel ──
    {
      from_class: 'environmental_interface',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: {
        medium: 'gas',
        pressure_max_bar: 5,          // corpus: Gas Pressure (O2, N2, CO2) 2-4 bar inlet
        flow_max_lpm: 35,             // corpus: 0-2000 mL/min sparge L + 0-250 mL/min headspace combined
        pipe_dn_mm: 12,
      },
      mechanical: {
        connector: 'Swagelok 1/4" or Festo push-fit + sterile gas filter (0.2 μm PTFE)',
        cable_type: '316L SS tubing or platinum-cured silicone',
      },
      required: true,
      direction: 'directional',
      notes: 'O2 / N2 / CO2 / compressed-air supply via thermal mass-flow controllers (MFC, typ. Bronkhorst EL-FLOW / Sensirion SFC) to sparger inlets — micro-sparger (0.1 vvm aeration) for fragile cells, ring sparger (0.2 vvm) for bacterial culture. Inlet pressure 2-4 bar per corpus; MFC accuracy ±1% with 500:1 turndown ratio. 0.2 μm sterile gas filter per ISO 8573-1 inline before vessel entry. Compressed-air supply: 2-5 bar per corpus.',
      source_references: [
        'corpus:Gas Pressure (O2, N2, CO2)@bioreactor (2-4 bar)',
        'corpus:Compressed Air Pressure@bioreactor (2-5 bar)',
        'corpus:O2 delivery (L sparge)@bioreactor (0-2000 mL/min)',
        'corpus:O2 delivery (headspace)@bioreactor (0-250 mL/min)',
        'corpus:Micro sparger aeration rate@bioreactor (0.1 vvm)',
        'corpus:Thermal mass flow controller accuracy@bioreactor (1%)',
        'corpus:mass_flow_controller_turn_down@bioreactor (500:1)',
        'industry:Bronkhorst EL-FLOW MFC',
        'standard:ISO 8573-1 compressed air purity',
      ],
    },

    // ── Thermal jacket path: heater / chiller → vessel jacket → ambient ──
    {
      from_class: 'environmental_interface',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'cooling_loop',
      fluid: {
        medium: 'water-glycol',
        pressure_max_bar: 6,
        flow_max_lpm: 30,             // corpus: 12-24 L/min cooling water single/twin tower
        temperature_max_c: 60,
        temperature_min_c: -5,
        pipe_dn_mm: 25,
      },
      mechanical: {
        connector: 'tri-clamp jacket inlet / outlet',
        cable_type: '316L SS jacketed double-wall',
      },
      required: true,
      direction: 'mutual',
      notes: 'Jacketed water-glycol thermal loop maintains process temperature (corpus: 5-40 °C operating, 37 °C mammalian setpoint; ±0.2 °C control accuracy). External Unichiller (corpus: 6 °C setpoint reference) or recirculating heater/chiller. For stainless vessels the loop circulates through the integrated jacket; for single-use bags the loop runs through the cradle / drum heat-transfer plate. Electric heating element backup: 3 kW (5 L) / 6 kW (10-30 L) per corpus.',
      source_references: [
        'corpus:Process Liquid temperature@bioreactor (28-37.5 °C)',
        'corpus:Operating temperature@bioreactor (5-40 °C)',
        'corpus:Cooling Water Flow (Single Tower)@bioreactor (12 L/min)',
        'corpus:Cooling Water Flow (Twin Tower)@bioreactor (24 L/min)',
        'corpus:Cooling Water Pressure@bioreactor (2 bar)',
        'corpus:Unichiller 006 set temperature@bioreactor (6 °C)',
        'corpus:Electric heating (10-30L)@bioreactor (6 kW)',
        'industry:Huber Unichiller bioreactor TCU',
      ],
    },

    // ── Cleanroom HVAC tie-in (GMP grade-D / C / B) ──
    {
      from_class: 'environmental_interface',
      to_class: 'maintenance_serviceability',
      protocol: 'physical',
      mechanism: 'air_duct',
      fluid: {
        medium: 'air',
        pressure_max_bar: 0.01,       // cleanroom pressurisation ~15 Pa
        flow_max_lpm: 5000,
        temperature_max_c: 25,
        temperature_min_c: 18,
      },
      mechanical: {
        connector: 'HEPA H13/H14 ceiling terminal + low-wall extract grille',
        cable_type: 'galvanised duct + HEPA frame',
      },
      required: false,
      direction: 'mutual',
      notes: 'Cleanroom HVAC tie-in: ISO 14644-1 Class 8 (grade-D, ≤3,520,000 particles/m³ at 0.5 μm at-rest) is the minimum for GMP biopharma surround; grade-C (Class 7) and grade-B (Class 5 at-operation) for sterile cell-therapy work. HEPA H14 ceiling supply, low-wall extract per Annex 1. Bioreactor skid sits in a downflow LAF or biosafety cabinet in higher-grade areas. Pressurisation 15 Pa positive vs adjacent area.',
      source_references: [
        'corpus:Ambient temperature@bioreactor (16-30 °C)',
        'corpus:Humidity@bioreactor (50-80%)',
        'standard:ISO 14644-1 cleanroom classification',
        'standard:EU GMP Vol 4 Annex 1 sterile medicinal products',
      ],
    },

    // ── Vessel pressure / safety chain ──
    {
      from_class: 'safety_protection',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'safety_isolation',
      mechanical: {
        connector: 'tri-clamp PSV (typ. 0.3 bar set-pressure) + rupture disc',
        cable_type: '316L SS to atmospheric vent',
      },
      required: true,
      direction: 'directional',
      notes: 'Pressure safety valve (PSV) on the vessel head plate (corpus: maximum operating pressure 0.1 bar — set-pressure ~0.3 bar with 25% margin) plus rupture disc on single-use bags (PED Annex I §2.11.2). Over-pressure relief vents to atmospheric exhaust through a sterile filter to maintain containment. Foam-out trigger closes sparger MFC + activates antifoam dose pump. Sterility-breach detection (pH drift + DO drift + bag-integrity sensor) trips into the same chain.',
      source_references: [
        'corpus:Maximum operating pressure@bioreactor (0.1 bar)',
        'standard:PED 2014/68/EU Annex I §2.11 pressure safety',
        'standard:ASME Boiler and Pressure Vessel Code',
        'standard:EU GMP Vol 4 Annex 1 (sterility assurance)',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'sensing_instrumentation',
      protocol: 'Analog-thermistor',
      mechanism: 'alarm_interlock',
      required: true,
      direction: 'mutual',
      notes: 'Over-pressure relief + sterility-breach detection + foam-out detection feed shutdown logic. pH drift > ±0.2 from setpoint for >10 min triggers contamination alarm; DO collapse with no agitation change suggests microbial breach; mass balance step-change signals bag leak. Foam sensor (capacitive / conductive in head space) closes sparger before foam-out into exhaust filter.',
      source_references: [
        'corpus:pH control accuracy@bioreactor (±0.05 pH)',
        'corpus:DO measurement accuracy@bioreactor (±5% air saturation)',
        'industry:Mettler InPro foam sensor',
        'standard:EU GMP Annex 1 contamination control strategy',
      ],
    },

    // ── Control / sensor path ──
    {
      from_class: 'control_compute_communication',
      to_class: 'sensing_instrumentation',
      protocol: 'Modbus-RTU',
      mechanism: 'sensor_feedback',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      mechanical: { connector: 'M12 4-pin A-coded or VP6 / VP8 (Mettler)', cable_type: 'shielded twisted pair' },
      required: true,
      direction: 'mutual',
      notes: 'PLC reads pH (corpus: ±0.05 pH accuracy, range 4.5-8.5), DO (corpus: ±5% accuracy, range 0-250% air saturation), temperature (PT100 4-wire, ±0.1 °C), foam (capacitive), level (capacitive or load-cell mass balance), and optionally Raman / capacitance probes for biomass + metabolite. RS-485 Modbus-RTU typical for the deep sensor stack; Mettler ISM digital protocol on premium installations.',
      source_references: [
        'corpus:pH measurement range@bioreactor (4.5-8.5)',
        'corpus:DO measurement range@bioreactor (0-250% air saturation)',
        'corpus:pH measurement accuracy@bioreactor (±0.05 pH)',
        'corpus:DO measurement accuracy@bioreactor (±5%)',
        'industry:Mettler Toledo InPro 3253 pH probe',
        'industry:Hamilton VisiFerm DO probe',
        'standard:21 CFR Part 11 e-records (alarm + audit-trail capture)',
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
      notes: 'PLC commands agitator drive speed (corpus: 10-600 rpm stirred-tank, 4-25 rocks/min Xuri rocking) via VFD setpoint. EXV-style stepper not used — direct VFD speed reference (0-10 V or PROFIdrive). Antifoam dose pump pulse command. Sparger MFC setpoint via 4-20 mA or PROFIBUS-DP.',
      source_references: [
        'corpus:Stirred-tank agitation setting@bioreactor (120-600 rpm)',
        'corpus:Rocking rate@bioreactor (4-25 rocks/min)',
        'corpus:Stirrer switch-off speed@bioreactor (10 rpm)',
        'industry:Sartorius DCU agitator drive',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'mass_fluid_transport_process',
      protocol: 'PWM',
      mechanism: 'contactor_command',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'directional',
      notes: 'PLC commands feed pumps (base / acid / antifoam / media) and harvest pump via 4-20 mA setpoint or PWM step-rate. MFC setpoint (sparger gas) on the same control bus.',
      source_references: [
        'industry:Watson-Marlow IP66 pump control interface',
        'standard:GAMP 5 software validation',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'hmi_ergonomics',
      protocol: 'Modbus-TCP',
      mechanism: 'modbus_tcp',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 5 },
      mechanical: { connector: 'RJ45', cable_type: 'Cat 5e / 6 industrial' },
      required: true,
      direction: 'mutual',
      notes: 'Local touchscreen HMI for recipe management + alarm review + e-record sign-off (21 CFR Part 11 + EU Annex 11). Modbus TCP / 10Base-T Ethernet (corpus) uplink to plant DCS / historian (OSIsoft PI, AVEVA System Platform). MES integration via OPC-UA typical at clinical / commercial scale.',
      source_references: [
        'corpus:MODBUS@bioreactor',
        'corpus:10Base-T Ethernet@bioreactor',
        'standard:21 CFR Part 11 electronic records',
        'standard:EU GMP Annex 11 computerised systems',
      ],
    },

    // ── Mechanical / mount ──
    {
      from_class: 'actuation_kinematics',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: {
        mount: 'bolted',
        connector: 'magnetic-coupled drive shaft (sterile, no shaft seal) OR top-mount mechanical seal',
      },
      required: true,
      direction: 'mutual',
      notes: 'Top- or bottom-driven agitator. Stainless vessels typ. use magnetic-coupled drive (sterile, no shaft seal — eliminates breach risk). Single-use bags use externally-mounted drive coupling through a flexible bag-side seal. Rocking-bag class uses platform-rocker with no internal moving parts. Drive motor 1-12 kVA range per corpus (power).',
      source_references: [
        'corpus:Power@bioreactor (12 kVA)',
        'corpus:Max. power consumption@bioreactor (1 kVA)',
        'industry:Sartorius BIOSTAT STR magnetic-coupled drive',
      ],
    },

    // ── Service / maintenance ──
    {
      from_class: 'maintenance_serviceability',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'panel', connector: 'CIP spray-ball + SIP steam port + sterile sample port' },
      required: false,
      direction: 'mutual',
      notes: 'Stainless: CIP (clean-in-place) spray-ball assembly through head plate + SIP (sterilise-in-place) steam port — 121 °C @ 15 psig for 30 min. Single-use: gamma-irradiated 25-40 kGy bag (corpus) installs through bag-load hatch; no CIP/SIP required. Autoclave-rated removable sub-assemblies for benchtop variants (Mobius CellReady, Eppendorf BioFlo). Sterile sample port (Bioquate, ASEPTIQUIK) for batch / EM monitoring.',
      source_references: [
        'corpus:Gamma irradiation dose@bioreactor (25-40 kGy)',
        'corpus:Gamma irradiation dose (500/1000L)@bioreactor (27.5-40 kGy)',
        'industry:Pall Allegro Sterile Sampling',
        'standard:EU GMP Annex 1 single-use vs CIP/SIP',
      ],
    },

    // ── Power feed (corpus: dual mains options) ──
    {
      from_class: 'power_distribution',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'ac_busbar',
      electrical: {
        voltage_nominal_v: 230,
        voltage_range_v: [100, 400],
        ac_or_dc: 'AC',
        ac_phases: 1,                  // 1ph 230 V typical; 3ph 400 V for larger STR
        ac_frequency_hz: 50,
        current_max_a: 23,
      },
      mechanical: { connector: 'Schuko / IEC C19 (1ph) or 16 A 5-pin (3ph)', cable_type: 'H07RN-F 2.5-6 mm²' },
      required: false,
      direction: 'directional',
      notes: 'Single-phase 100-240 V AC OR 3-phase 400 V AC 16 A per corpus mains options. EN 61010-1 compliance for lab equipment + UL61010 US. Auxiliary 24 V DC instrument bus for PLC + valves + low-power sensors. Required:false because <30 L benchtop variants often run from a single power module bundled into the structure_containment skid rather than a dedicated power_distribution panel.',
      source_references: [
        'corpus:Mains voltage@bioreactor (208 VAC | 60 Hz | 15 A, 400 VAC | 50 Hz | 16 A)',
        'corpus:Voltage@bioreactor (100-120/220-240 VAC)',
        'corpus:Power Supply@bioreactor (208 V 60 Hz/23 A or 400 V 50 Hz/18 A)',
        'corpus:Frequency@bioreactor (50/60 Hz)',
        'standard:EN 61010 lab equipment safety',
        'standard:UL508A industrial control panel',
      ],
    },
  ],

  sources_cited: [
    'corpus:bioreactor (9 datasheets, 2026-05-18 — Sartorius STR, Cytiva Xuri, Mobius CellReady, BIOSTAT D-DCU)',
    'standard:EU GMP Vol 4 Annex 1 (sterile medicinal products)',
    'standard:ISO 14644-1 (cleanroom classification)',
    'standard:21 CFR Part 11 (electronic records)',
    'standard:EU GMP Annex 11 (computerised systems)',
    'standard:USP <88> Class VI (biocompatibility)',
    'standard:ISO 10993 (biological evaluation of medical devices)',
    'standard:ASME Boiler and Pressure Vessel Code',
    'standard:PED 2014/68/EU (pressure equipment)',
    'standard:EN 61010 / UL61010 (lab equipment safety)',
    'standard:ISO 8573-1 (compressed air purity)',
    'standard:GAMP 5 (good automated manufacturing practice)',
    'standard:NEMA-4 (IP65)',
    'industry:Sartorius BIOSTAT STR series',
    'industry:Cytiva Xuri / HyPerforma DynaDrive',
    'industry:Merck Mobius CellReady',
    'industry:Eppendorf BioBLU / BioFlo',
    'industry:Watson-Marlow 530S / Bronkhorst EL-FLOW MFC',
    'industry:Mettler Toledo InPro pH / Hamilton VisiFerm DO',
  ],
}

registerClassReferenceGraph(BIOREACTOR)

export { BIOREACTOR }
