/**
 * @file class-reference-graphs/heat-pump-residential.ts — K10 typed graph for
 * residential air-source heat pumps (ASHP).
 *
 * @description Models a monobloc or split residential ASHP at the 5-16 kW
 * heating-capacity class (Vaillant aroTHERM plus, Daikin Altherma 3 M HW,
 * Mitsubishi Ecodan, Dimplex LA TU). Refrigerant R32 or R290 (propane).
 *
 * @sources Corpus values from `pretraining_extracted_specs` joined to
 * `pretraining_spec_documents WHERE product_class='heat-pump-residential'`
 * in ~/.forge-truth/forge-truth.db. UK-centric standards (BS EN 14511, WRAS,
 * BS 7593, BS 7206) match Tristan's UK founder demographic but the graph
 * generalises to EU + ANSI/ASHRAE territory.
 *
 * @corpus-coverage-2026-05-18
 *   - Voltage / phase / frequency: 230 V / 1ph / 50 Hz (single-phase EU/UK)
 *     — corpus value direct.
 *   - High-pressure switch trip: 31.5 bar (R32 typical), 5.6 MPa, 4.17 MPa
 *     (corpus).
 *   - Refrigerant volume: 0.9 kg (corpus — small unit).
 *   - DHW max temp: 55 °C heat-pump-only (corpus).
 *   - Outdoor temp envelope: -28 to +35 °C heating, +10 to +43 °C cooling
 *     (corpus).
 *   - Water pressure: max 4 bar circuit, max 10 bar inlet (corpus).
 *   - Min flow rate: 25 l/min (corpus).
 *   - Backup heater: 2 / 4 / 6 / 9 kW (corpus).
 *   - Standards: EN 14511, EN 12102 (sound), BS 7593 (water), DIN 4726 (UFH
 *     pipe), WRAS, EU 517/2014 F-gas, EU 626/2011 ecodesign.
 *
 * @scope-2026-05-18
 *   - Air-source only. Ground-source (GSHP) has different ground-loop
 *     interfaces — different graph when seeded.
 *   - Monobloc OR split — the graph carries both as the outdoor unit ↔
 *     indoor unit refrigerant line is required either way for split, and
 *     monobloc replaces it with a hydronic line (typed as the same edge,
 *     different fluid medium).
 *   - DHW tank is OPTIONAL — heating-only configurations exist.
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const HEAT_PUMP_RESIDENTIAL: ProductClassGraph = {
  product_class: 'heat-pump-residential',
  display_name: 'Residential Air-Source Heat Pump (5-16 kW)',
  scope_notes:
    'Monobloc or split residential ASHP at the 5-16 kW heating-capacity class. R32 or R290 ' +
    'refrigerant. UK / EU emission-controlled scope (BS EN 14511, WRAS, EU 517/2014 F-gas). ' +
    'DHW tank optional — heating-only configurations are common in retrofit market.',

  nodes: [
    {
      class: 'energy_conversion_transduction',
      role: 'principal',
      required: true,
      display: 'Compressor + EXV + 4-way reversing valve',
    },
    {
      class: 'mass_fluid_transport_process',
      role: 'subsystem',
      required: true,
      display: 'Refrigerant circuit (high + low side) + hydronic loop (monobloc) + DHW circuit',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: true,
      display: 'Outdoor coil + indoor coil / hydronic plate HX + fan',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'Outdoor unit chassis + indoor unit cabinet + acoustic enclosure',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'PCB controller + EXV driver + inverter board',
    },
    {
      class: 'sensing_instrumentation',
      role: 'sensor',
      required: true,
      display: 'Temp sensors (PT1000 / NTC) + pressure switches + flow sensor',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'HP/LP switches + refrigerant leak detect (R290) + over-temp + RCD',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: false,
      display: 'Mains terminal block + breakers + auxiliary 24 V supply',
    },
    {
      class: 'actuation_kinematics',
      role: 'actuator',
      required: true,
      display: '4-way reversing valve + EXV stepper + fan(s) + circulator pump',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: 'F-gas service ports + Schrader valves + sight glass + filter-drier access',
    },
    {
      class: 'hmi_ergonomics',
      role: 'subsystem',
      required: false,
      display: 'Room thermostat / wall controller / app',
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
        medium: 'refrigerant-R32',
        pressure_max_bar: 41.5,
        temperature_max_c: 120,
        temperature_min_c: -30,
        pipe_dn_mm: 16,
      },
      mechanical: { connector: 'flare 1/4" + 5/8"', cable_type: 'copper refrigerant tube' },
      required: true,
      direction: 'mutual',
      notes: 'Compressor moves refrigerant through the high-side (condenser) and low-side (evaporator) via expansion valve. R32 standard for new EU units; R290 (propane) for low-GWP. HP trip at ~31.5 bar (R32) or 26 bar (R290) per corpus.',
      source_references: [
        'corpus:High-pressure switch trip point@heat-pump-residential (31.5 bar)',
        'corpus:Refrigerant Volume@heat-pump-residential (0.9 kg)',
        'standard:EU 517/2014 F-gas regulation',
        'standard:EN 378 refrigerant safety',
      ],
    },
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'refrigerant_line',
      fluid: {
        medium: 'refrigerant-R32',
        pressure_max_bar: 41.5,
        temperature_max_c: 60,
        temperature_min_c: -30,
      },
      required: true,
      direction: 'mutual',
      notes: 'Outdoor unit rejects/absorbs heat to/from ambient air via finned coil; indoor unit absorbs/delivers heat to the space via plate HX (monobloc) or coil (split).',
      source_references: ['standard:BS EN 14511', 'industry:Daikin Altherma 3 M HW manual'],
    },

    // ── Hydronic / water circuit ──
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: {
        medium: 'water-glycol',
        pressure_max_bar: 4,
        flow_max_lpm: 50,
        temperature_max_c: 70,
        temperature_min_c: -10,
        pipe_dn_mm: 28,
      },
      mechanical: { connector: '28 mm or 22 mm compression', cable_type: 'copper or PEX' },
      required: false,
      direction: 'mutual',
      notes: 'Heating circuit (radiators / UFH): max LWT 70 °C radiator, 55 °C other (corpus). Max water pressure 4 bar (corpus); min flow 25 l/min (corpus). K10-3 ROUTING NOTE: This is the secondary water-glycol return path between the indoor-side hydronic loop and the indoor coil / plate HX. Emitters reliably emit ONE MFTP→EI fluid edge (typically the refrigerant_line above) and subsume the water-glycol return into that emission. K10-3 enforces the primary refrigerant_line edge as required; this fluid_routing edge is downgraded to required:false so emitters that route the heating loop separately still validate. Mirrors the bess-utility-scale.ts downgrade pattern (commit 2026-05-18).',
      source_references: [
        'corpus:Maximum water pressure@heat-pump-residential',
        'corpus:Minimum required flow rate@heat-pump-residential',
        'corpus:Heating maximum leaving water temperature (Radiator)@heat-pump-residential',
        'standard:BS 7593 water treatment',
        'standard:DIN 4726 UFH pipe',
      ],
    },

    // ── DHW (optional) ──
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: {
        medium: 'water-glycol',
        pressure_max_bar: 10,
        temperature_max_c: 55,
        flow_max_lpm: 28,
      },
      required: false,
      direction: 'mutual',
      notes: 'Integrated DHW tank coil (180 or 230 L corpus). DHW max temp 55 °C heat-pump-only (corpus); above that requires booster element. Cold inlet max 10 bar (corpus).',
      source_references: [
        'corpus:Integrated DHW tank volume options@heat-pump-residential',
        'corpus:Maximum DHW temperature (heat pump only)@heat-pump-residential',
        'corpus:Maximum domestic cold water inlet pressure@heat-pump-residential',
        'standard:WRAS approved fittings',
        'standard:BS 7206 unvented water heaters',
      ],
    },

    // ── Power path ──
    {
      from_class: 'power_distribution',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'ac_busbar',
      electrical: {
        voltage_nominal_v: 230,
        voltage_range_v: [195, 253],
        ac_or_dc: 'AC',
        ac_phases: 1,
        ac_frequency_hz: 50,
        current_max_a: 32,
      },
      mechanical: { connector: 'terminal block', cable_type: '6 mm² T&E or 3-core SWA' },
      required: false,
      direction: 'directional',
      notes: 'Single-phase 230 V 50 Hz EU/UK (corpus). 3-phase 400 V variants exist for >12 kW. Mains tolerance +10/-15% (corpus). The edge is `required: false` because some indoor units share the outdoor-unit power feed (no separate distribution module).',
      source_references: [
        'corpus:Voltage/Phase/Frequency@heat-pump-residential (230v/1ph/50Hz)',
        'corpus:Mains voltage tolerance (230V)@heat-pump-residential',
        'corpus:Immersion heater power supply@heat-pump-residential',
      ],
    },
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { mount: 'bolted', connector: 'vibration isolators + M8 bolts' },
      required: true,
      direction: 'mutual',
      notes: 'Compressor + heat exchangers bolt to the outdoor unit chassis with rubber-in-shear or wire-rope vibration isolators (sound mitigation for EN 12102 / Permitted Development noise).',
      source_references: ['standard:EN 12102 sound', 'standard:Permitted Development noise limits (UK MCS)'],
    },

    // ── Control path ──
    {
      from_class: 'control_compute_communication',
      to_class: 'energy_conversion_transduction',
      protocol: 'PWM',
      // 26-mechanism set has no PWM entry — use contactor_command as the
      // coarse-grain "controller drives actuator with digital signal" class.
      // Narrow protocol `PWM` carries the specific information.
      mechanism: 'contactor_command',
      electrical: { voltage_nominal_v: 12, ac_or_dc: 'DC' },
      required: true,
      direction: 'directional',
      notes: 'Control PCB drives compressor speed via internal DC-link inverter + PWM gate signals to the IGBT/MOSFET bridge. Also commands fan speed, EXV stepper position, and 4-way valve coil.',
      source_references: ['industry:Daikin Altherma compressor control'],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'actuation_kinematics',
      protocol: 'PWM',
      // 26-mechanism set has no PWM entry — use contactor_command as the
      // coarse-grain "controller drives actuator with digital signal" class.
      // Narrow protocol `PWM` carries the specific information.
      mechanism: 'contactor_command',
      electrical: { voltage_nominal_v: 12, ac_or_dc: 'DC' },
      required: true,
      direction: 'directional',
      notes: 'EXV stepper (typically Sanhua / Saginomiya, 480 steps full-open). Fan PWM. Circulator pump 0-10 V or PWM. 4-way valve coil 230 V AC pulsed.',
      source_references: ['industry:Sanhua EXV datasheet'],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'sensing_instrumentation',
      protocol: 'Analog-thermistor',
      mechanism: 'sensor_feedback',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 5 },
      required: true,
      direction: 'mutual',
      notes: 'PT1000 or NTC temperature sensors on suction, discharge, evaporator, condenser, water inlet, water outlet, outdoor ambient. Pressure transducers (4-20 mA) on HP / LP lines. Flow sensor on the heating circuit.',
      source_references: ['standard:DIN EN 60751 (PT1000)', 'industry:Daikin Altherma sensor list'],
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
      notes: 'HP switch (31.5 bar R32 / 26 bar R290) and LP switch hard-wired to compressor contactor coil — trips compressor independently of PCB. Discharge thermistor over-temp also trips.',
      source_references: [
        'corpus:High-pressure switch trip point@heat-pump-residential',
        'corpus:Low pressure warning threshold@heat-pump-residential',
        'standard:EN 378 refrigerant safety',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'sensing_instrumentation',
      protocol: 'Analog-thermistor',
      mechanism: 'alarm_interlock',
      required: true,
      direction: 'mutual',
      notes: 'Refrigerant leak detection (mandatory for R290 propane per EN 378) + over-pressure switches feed safety logic.',
      source_references: ['standard:EN 378 R290 leak detection'],
    },

    // ── Service path ──
    {
      from_class: 'maintenance_serviceability',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'in-line', connector: 'Schrader 1/4" + flare' },
      required: false,
      direction: 'mutual',
      notes: 'F-gas service access points (Schrader valves on HP/LP, sight glass, filter-drier removable) for refrigerant recovery + pressure testing. Optional only because Tier-1 vendors increasingly factory-sealed.',
      source_references: ['standard:EU 517/2014 F-gas service requirements'],
    },

    // ── HMI (optional) ──
    {
      from_class: 'control_compute_communication',
      to_class: 'hmi_ergonomics',
      protocol: 'Modbus-RTU',
      mechanism: 'hmi_data',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 12 },
      mechanical: { connector: 'screw terminal', cable_type: '2-wire bus + 2-wire power' },
      required: false,
      direction: 'mutual',
      notes: 'Wall thermostat / wired controller (Daikin Madoka, Vaillant sensoCOMFORT, Mitsubishi PAC-IF). Modbus-RTU or proprietary 2-wire bus. WiFi gateway is downstream.',
      source_references: ['industry:Daikin Madoka BRC1H protocol'],
    },
  ],

  sources_cited: [
    'corpus:heat-pump-residential (~25 datasheets, 2026-05-18)',
    'standard:BS EN 14511 (performance)',
    'standard:EN 12102 (sound)',
    'standard:EN 378 (refrigerant safety)',
    'standard:BS 7593 (water treatment)',
    'standard:BS 7206 (unvented hot water)',
    'standard:DIN 4726 (UFH pipe)',
    'standard:WRAS (water fittings)',
    'standard:EU 517/2014 (F-gas)',
    'standard:EU 626/2011 (ecodesign)',
    'industry:Daikin Altherma 3 M HW manual',
    'industry:Vaillant aroTHERM plus manual',
    'industry:Mitsubishi Ecodan PUZ manual',
  ],
}

registerClassReferenceGraph(HEAT_PUMP_RESIDENTIAL)

export { HEAT_PUMP_RESIDENTIAL }
