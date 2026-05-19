/**
 * @file class-reference-graphs/auv-subsea.ts — K10 typed graph for
 * autonomous underwater vehicles (AUV, deep-sea / subsea survey class).
 *
 * @description Models a torpedo-form-factor (single hull or double hull)
 * AUV at the survey / inspection class — 500-6000 m depth-rated, 1-200 kg
 * (micro-AUV) to 1-2 t (work-class) range. Suppliers: Kongsberg HUGIN,
 * Saab Sabertooth, Teledyne Gavia, Bluefin / General Dynamics Bluefin-21,
 * SAAM Mariner SeaScout, Riptide micro-UUV. Architecturally rich — tests
 * the simultaneous combination of `mass_fluid_transport_process` (ballast),
 * `environmental_interface` (pressure hull), `actuation_kinematics`
 * (thrusters + control surfaces), and `energy_storage_source` (pressure-
 * compensated subsea Li-ion).
 *
 * @sources Corpus values from `pretraining_extracted_specs` joined to
 * `pretraining_spec_documents WHERE product_class='autonomous_underwater_vehicle'`
 * at ~/.forge-truth/forge-truth.db (9 datasheets — Kongsberg HUGIN class +
 * Saab Sabertooth + smaller systems).
 *
 * @corpus-coverage-2026-05-18
 *   - Depth rating: 500 / 1000 / 1200 / 2000 / 3000 / 6000 m — corpus direct.
 *   - Diameter: 200-750 mm — corpus direct.
 *   - Length: 2.2-8 m — corpus direct.
 *   - Weight in air: 59 kg (Riptide micro) - 2000 kg (work-class) — corpus.
 *   - Battery capacity: 1.65 - 92 kWh — corpus direct.
 *   - Endurance: 7-216 hours — corpus direct.
 *   - Speed: 2-6 knots forward — corpus direct.
 *   - Range: 130 km (typical mission) — corpus direct.
 *   - Navigation: INS accuracy 0.01-0.1% TD (typ. Kearfott / iXBlue) —
 *     corpus direct.
 *   - Comms: acoustic modem 10 km range (corpus); WiFi 802.11g/n surface
 *     handshake (corpus); Iridium SBD when surfaced (industry).
 *   - Standards: UN 38.3 (Li transport), DNV 2.7-1/-3 (container), IEEE
 *     802.11 (WiFi), IHO (survey quality), ITAR/EAR (export) — corpus.
 *
 * @scope-2026-05-18
 *   - Torpedo / streamlined-body survey AUV (HUGIN-class). Hover-capable
 *     work-class ROVs and crawler ROVs are OUT of scope (different
 *     thruster topology, tether-supplied power).
 *   - Battery-powered (Li-ion, pressure-compensated or atmospheric-pressure
 *     pod). Fuel-cell AUVs (e.g. Bluefin-9 SOFC variants) share most modules
 *     but the energy_storage_source edge differs.
 *   - Single hull (atmospheric pressure inside) vs double hull (pressure-
 *     compensated oil-filled external + atmospheric internal) — both share
 *     the same K10 module set; envelopes carry both.
 *   - Tethered ROVs (with power + comms via umbilical) are OUT of scope.
 *   - Acoustic communications + INS-based dead-reckoning navigation. GPS
 *     only available when surfaced.
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const AUV_SUBSEA: ProductClassGraph = {
  product_class: 'auv-subsea',
  display_name: 'Autonomous Underwater Vehicle (Subsea Survey, 500-6000 m)',
  scope_notes:
    'Torpedo / streamlined-body survey AUV at the 500-6000 m depth-rated class. ' +
    'Battery-powered (Li-ion, pressure-compensated or atmospheric-pod). Single hull or ' +
    'double hull. Acoustic + INS navigation; WiFi/Iridium when surfaced. Tethered ROVs, ' +
    'crawler ROVs, and fuel-cell variants are OUT of scope.',

  nodes: [
    {
      class: 'energy_storage_source',
      role: 'principal',
      required: true,
      display: 'Pressure-compensated subsea Li-ion battery pack (1.65-92 kWh, NMC or LFP)',
    },
    {
      class: 'energy_conversion_transduction',
      role: 'subsystem',
      required: true,
      display: 'Brushless DC thruster motor drives + DC-DC converters to hotel-power buses',
    },
    {
      class: 'actuation_kinematics',
      role: 'actuator',
      required: true,
      display: 'Main thruster (1× ducted prop or 1× rim-driven) + control fins (4× cruciform or X-tail)',
    },
    {
      class: 'mass_fluid_transport_process',
      role: 'subsystem',
      required: true,
      display: 'Variable ballast (oil-bladder VBS or pressure-compensated pump) + trim tank + drop weight',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'Pressure hull (Al / Ti / syntactic foam) + fairing + lift points + drop-weight cradle',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: true,
      display: 'Hull penetrators (subsea connectors, SubConn / Burton) + transducers + acoustic windows + pressure-compensation oil reservoir',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'Mission computer + autopilot + acoustic modem + Iridium / WiFi surface link + slip-ring',
    },
    {
      class: 'sensing_instrumentation',
      role: 'sensor',
      required: true,
      display: 'INS + DVL + depth + altimeter + sonar (SSS / MBES / SAS) + CTD + USBL transponder',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'Drop weight (jettisonable ballast) + hull-strain monitor + Iridium beacon + emergency surface',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: 'Battery charge port (wet-mate or via opened hull) + nose-cone payload-access bay',
    },
  ],

  edges: [
    // ── Power: battery → thruster drives ──
    {
      from_class: 'energy_storage_source',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_nominal_v: 48,
        voltage_range_v: [24, 300],   // hotel bus 24 V; thruster bus up to 300 V on large AUVs
        ac_or_dc: 'DC',
        current_max_a: 200,
        power_max_w: 50_000,
      },
      mechanical: { connector: 'subsea hardwire or wet-mate Burton 5506', cable_type: 'oil-filled silicone-jacketed' },
      required: true,
      direction: 'directional',
      notes: 'Pressure-compensated subsea Li-ion (typ. SubCtech or Bluefin proprietary, NMC chemistry, 96/144 series cells). Battery capacity 1.65-92 kWh (corpus). DC bus nominally 48 V hotel / 300 V thruster on work-class. Endurance 7-216 hr (corpus).',
      source_references: [
        'corpus:Battery capacity@autonomous_underwater_vehicle (1.65-92 kWh)',
        'corpus:Endurance@autonomous_underwater_vehicle (7-216 hours)',
        'corpus:Battery Energy@autonomous_underwater_vehicle (10-30 kWh single/double hull)',
        'industry:SubCtech pressure-compensated Li-ion subsea battery',
        'industry:Bluefin SeaBOT-class power architecture',
      ],
    },
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'actuation_kinematics',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_nominal_v: 48,
        voltage_range_v: [24, 300],
        ac_or_dc: 'DC',
        current_max_a: 150,
        power_max_w: 30_000,
      },
      mechanical: { connector: 'subsea connector to thruster motor', cable_type: 'jacketed motor cable' },
      required: true,
      direction: 'directional',
      notes: 'BLDC thruster motor drive feeds the main propulsion thruster (ducted prop or rim-driven) and control-fin servos. Forward speed 2-6 knots (corpus). Rim-driven thrusters (Copenhagen Subsea, Tecnadyne) increasingly common at micro-AUV scale.',
      source_references: [
        'corpus:Vehicle speed@autonomous_underwater_vehicle (2-6 knots)',
        'corpus:Forward speed@autonomous_underwater_vehicle (4-5 knots)',
        'industry:Tecnadyne Model 540 thruster',
        'industry:Copenhagen Subsea rim-driven thruster',
      ],
    },

    // ── Pressure hull / containment ──
    {
      from_class: 'control_compute_communication',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: {
        mount: 'bolted',
        connector: 'electronics chassis bolted to pressure-hull internal frame',
        cable_type: 'aluminium / titanium pressure hull',
      },
      required: true,
      direction: 'mutual',
      notes: 'Mission computer + autopilot + comms electronics live inside the pressure hull (single-hull AUV) at atmospheric pressure, OR in atmospheric pod inside the oil-filled outer fairing (double-hull). Depth rating 500-6000 m (corpus); hull material Al-6082 / Al-7075 / Ti-6Al-4V; PED 2014/68 Cat I/II applies.',
      source_references: [
        'corpus:Depth rating@autonomous_underwater_vehicle (500-6000 m)',
        'corpus:Depth Rating@autonomous_underwater_vehicle (3000 or 6000 m)',
        'industry:Kongsberg HUGIN 6000 Ti pressure hull',
        'standard:DNV-RU-NAUT classification',
        'standard:PED 2014/68/EU',
      ],
    },
    {
      from_class: 'energy_storage_source',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { mount: 'bolted', connector: 'pressure-compensated battery pod mount' },
      required: true,
      direction: 'mutual',
      notes: 'Battery pack mounted in pressure-compensated pod (oil-filled, bladder-equalised) external to the main pressure hull, OR inside the hull at atmospheric pressure. Drop-weight cradle on the keel for jettisonable ballast (safety).',
      source_references: [
        'industry:HUGIN pressure-compensated battery section',
        'corpus:Launch weight@autonomous_underwater_vehicle (650-2000 kg)',
      ],
    },

    // ── Ballast / trim (mass fluid) ──
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: {
        medium: 'oil',  // hydraulic oil in VBS bladders
        pressure_max_bar: 600,  // 6000 m depth = 600 bar ambient — VBS must equalise
        temperature_max_c: 35,
        temperature_min_c: -2,   // arctic sea floor
        pipe_dn_mm: 10,
      },
      mechanical: { connector: 'subsea bladder + bulkhead penetrator', cable_type: 'reinforced PU hose' },
      required: true,
      direction: 'mutual',
      notes: 'Variable Ballast System (VBS): oil-bladder pumped to/from external sea or internal reservoir to trim buoyancy ±2-5% of vehicle weight. Trim tank fore-aft for pitch control. Drop-weight (typ. 10-30 kg cast iron) released on emergency-surface command.',
      source_references: [
        'industry:Seaeye / Saab VBS oil-bladder system',
        'industry:HUGIN drop-weight emergency surfacing',
      ],
    },

    // ── Control: autopilot → thrusters + fins ──
    {
      from_class: 'control_compute_communication',
      to_class: 'actuation_kinematics',
      protocol: 'CAN',
      mechanism: 'can_bus',
      electrical: { voltage_nominal_v: 24, ac_or_dc: 'DC' },
      mechanical: { connector: 'M12 5-pin or wet-mate subsea', cable_type: 'CAN twisted pair' },
      required: true,
      direction: 'mutual',
      notes: 'Autopilot commands main thruster RPM + control-fin servo positions via CANopen (typ. 250 kbit/s subsea). 6-DoF control: surge (thruster), pitch (elevator), yaw (rudder), depth (combined ballast + dive plane).',
      source_references: [
        'industry:Kongsberg cNODE autopilot bus',
        'industry:Tecnadyne thruster CAN interface',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'mass_fluid_transport_process',
      protocol: 'CAN',
      mechanism: 'contactor_command',
      electrical: { voltage_nominal_v: 24, ac_or_dc: 'DC' },
      required: true,
      direction: 'directional',
      notes: 'Autopilot commands VBS pump direction + drop-weight release solenoid. Buoyancy trim setpoint maintained against measured depth (PT100 + strain-gauge pressure transducer).',
      source_references: ['industry:Saab Sabertooth VBS control', 'industry:HUGIN drop-weight emergency interlock'],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'sensing_instrumentation',
      protocol: 'RS-485',
      mechanism: 'sensor_feedback',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      mechanical: { connector: 'subsea D-sub or Burton', cable_type: 'oil-filled shielded' },
      required: true,
      direction: 'mutual',
      notes: 'Autopilot reads INS (iXBlue PHINS / Kearfott T16 / Honeywell HG9900), DVL (Teledyne RDI Workhorse Navigator), depth (Paroscientific 8B-series), altimeter, CTD (Sea-Bird SBE 19plus), and survey sonars (Kongsberg EM2040 MBES, KraKen MINSAS SAS). Nav accuracy 0.01-0.1% TD (corpus).',
      source_references: [
        'corpus:Inertial navigation accuracy@autonomous_underwater_vehicle (0.1%)',
        'corpus:Inertial Navigation System Accuracy@autonomous_underwater_vehicle (0.01% TD)',
        'corpus:Navigation accuracy@autonomous_underwater_vehicle (0.08%)',
        'industry:iXBlue PHINS INS',
        'industry:Teledyne RDI Workhorse Navigator DVL',
      ],
    },

    // ── Comms: acoustic + surface link ──
    {
      from_class: 'control_compute_communication',
      to_class: 'environmental_interface',
      protocol: 'WiFi',
      mechanism: 'sensor_feedback',  // closest 26-set match — physical RF / acoustic link
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 12 },
      mechanical: { connector: 'transducer head + acoustic window', cable_type: 'subsea coax for transducer' },
      required: true,
      direction: 'mutual',
      notes: 'Underwater: acoustic modem (Kongsberg cNODE / EvoLogics S2C) for command + telemetry at ≤10 km range (corpus). Surfaced: WiFi 802.11g/n for mission-end handshake (corpus); Iridium Short Burst Data for over-horizon status. USBL transponder for ship-side tracking.',
      source_references: [
        'corpus:Acoustic Modem Range@autonomous_underwater_vehicle (10 km)',
        'corpus:Wireless LAN@autonomous_underwater_vehicle (IEEE 802.11g)',
        'corpus:Radio Frequency@autonomous_underwater_vehicle (400kHz - 2.4 GHz)',
        'industry:Kongsberg cNODE acoustic modem',
        'industry:EvoLogics S2C M HS acoustic modem',
        'industry:Iridium 9603 SBD',
      ],
    },

    // ── Safety chain ──
    {
      from_class: 'safety_protection',
      to_class: 'mass_fluid_transport_process',
      protocol: 'Digital-24V',
      mechanism: 'safety_isolation',
      electrical: { voltage_nominal_v: 24, ac_or_dc: 'DC', current_max_a: 5 },
      required: true,
      direction: 'directional',
      notes: 'Emergency-surface command: pyrotechnic or solenoid releases drop-weight (jettisonable lead/iron ballast, typ. 10-30 kg), forcing vehicle to positive buoyancy. Triggered on watchdog timeout / depth-excursion / hull-strain alarm / low-battery.',
      source_references: [
        'industry:HUGIN drop-weight emergency surfacing',
        'industry:Saab Sabertooth pyrotechnic release',
        'standard:IEC 61508 SIL-2 emergency-surface logic',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'sensing_instrumentation',
      protocol: 'Analog-thermistor',
      mechanism: 'alarm_interlock',
      required: true,
      direction: 'mutual',
      notes: 'Hull-strain monitor (resistive strain gauge on aft hemisphere), depth-rate alarm (>1 m/s descent), bilge water-ingress detector, battery over-temp / cell-imbalance. Any trip fires the emergency-surface chain.',
      source_references: [
        'industry:HUGIN hull-strain sensors',
        'standard:UN 38.3 lithium battery transport',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'environmental_interface',
      protocol: 'Cellular-LTE',
      mechanism: 'sensor_feedback',
      required: false,
      direction: 'directional',
      notes: 'Iridium SBD beacon (independent of main comms) transmits last GPS fix + emergency code on surfacing. Strobe light + radio recovery beacon for visual recovery. AIS for traffic visibility per IMO MEPC.',
      source_references: [
        'industry:Iridium 9603 SBD emergency beacon',
        'industry:Novatech radio beacon',
        'standard:IMO MEPC marine environment',
      ],
    },

    // ── Service ──
    {
      from_class: 'maintenance_serviceability',
      to_class: 'energy_storage_source',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'panel', connector: 'wet-mate Burton 5506 charge port' },
      required: false,
      direction: 'directional',
      notes: 'Wet-mate charge port (Burton 5506 or SubConn) accepts shore-side charger when AUV is alongside / on dock. Alternative: open the hull for swap-out of removable battery section.',
      source_references: [
        'industry:Burton 5506 wet-mate connector',
        'corpus:Charge time@autonomous_underwater_vehicle (4.5-7 hours)',
      ],
    },
  ],

  sources_cited: [
    'corpus:autonomous_underwater_vehicle (~9 datasheets, 2026-05-18; Kongsberg HUGIN, Saab Sabertooth, Riptide)',
    'standard:DNV-RU-NAUT (naval / AUV classification)',
    'standard:PED 2014/68/EU (pressure hull)',
    'standard:IMO MEPC (marine environment)',
    'standard:UN 38.3 (Li battery transport)',
    'standard:IP68 / IP69K (ingress, IEC 60529)',
    'standard:IEC 61508 SIL-2 (functional safety)',
    'standard:ITAR Part 120.33 (export control, defence)',
    'standard:EAR Part 772 (export control, dual-use)',
    'standard:IHO S-44 (survey quality)',
    'industry:Kongsberg HUGIN 1000 / 6000 datasheets',
    'industry:Saab Sabertooth datasheet',
    'industry:Teledyne Gavia / RDI Workhorse Navigator',
    'industry:iXBlue PHINS / Kearfott T16 INS',
    'industry:Sea-Bird SBE 19plus CTD',
    'industry:EvoLogics S2C / Kongsberg cNODE acoustic modem',
    'industry:SubConn / Burton 5506 wet-mate connectors',
    'industry:SubCtech pressure-compensated Li-ion battery',
  ],
}

registerClassReferenceGraph(AUV_SUBSEA)

export { AUV_SUBSEA }
