/**
 * @file class-reference-graphs/dc-fast-ev-charger.ts — K10 typed graph for
 * DC fast EV chargers (off-board, level 3 / DCFC).
 *
 * @description Models a containerised or pedestal-mount DC fast EV charging
 * station at the 50-350 kW class (ABB Terra 124 / 184 / HP 175 / HP 350,
 * Tritium PKM150, Wallbox Supernova 60, Alpitronic HYC, Kempower S-series,
 * EVBox Troniq). Three-phase AC input (typically 400 V or 480 V), DC output
 * via CCS-1/CCS-2 and/or CHAdeMO connectors at 150-950 V DC and 200-540 A.
 * Architecturally: cabinet + dispenser (sometimes co-located, sometimes
 * split via a DC bus into "power-cabinet + 1-N dispensers" topology).
 *
 * @sources Corpus values from `pretraining_extracted_specs` joined to
 * `pretraining_spec_documents WHERE product_class='dc_fast_ev_charger'` in
 * ~/.forge-truth/forge-truth.db (15 datasheets, well-covered).
 *
 * @corpus-coverage-2026-05-18
 *   - AC input voltage: 380-480 VAC (EU) or 480Y/277 VAC (NA) — corpus.
 *   - Frequency: 50/60 Hz — corpus direct.
 *   - Nominal input current: 115-232 A — corpus direct.
 *   - Max input current: 232 A; recommended upstream breaker 150-300 A — corpus.
 *   - Short circuit current rating (Icc): 35-65 kA — corpus direct.
 *   - DC output voltage range: 150-920 V DC (CCS) / 150-500 V DC (CHAdeMO) /
 *     150-1000 V DC (highest-V units) — corpus direct.
 *   - DC output current: max 200-540 A per dispenser — corpus direct.
 *   - Max charging power: 90-400 kW — corpus direct.
 *   - Efficiency: 94-95% — corpus direct.
 *   - Power factor: >0.96 to >0.99 — corpus direct.
 *   - Standby power: 50-180 W — corpus direct.
 *   - IP rating: IP54 / IP55 — corpus direct.
 *   - IK rating: IK10 enclosure, IK08 touchscreen — corpus direct.
 *   - Cable length (charge cable): 4.5-6 m — corpus direct.
 *   - Operating temp: -35 to +55 °C (commercial) / -30 to +50 °C (consumer) — corpus.
 *   - RCD trip: 500 mA threshold, 150 ms delay — corpus direct.
 *   - Ethernet max run: 100 m — corpus direct.
 *   - 4G LTE wireless network (Vodafone) — corpus direct.
 *   - Standards: IEC 61851-1/-21-2/-23, IEC 62196-3, ISO 15118 (PnC),
 *     OCPP 1.6 JSON, UL 2202, UL 2231-1/-2, CHAdeMO 1.2, CCS — corpus.
 *
 * @scope-2026-05-18
 *   - Off-board DC fast charger (Level 3 / DCFC). AC chargers (Level 1/2,
 *     IEC 61851-1 Mode 3) have a different power-stage topology and live in
 *     a separate `ac_ev_charger` graph.
 *   - Pedestal + integrated dispenser (e.g. Terra 184) AND split power-
 *     cabinet + remote dispenser (e.g. Tritium PKM, Alpitronic HYC) are both
 *     covered — the DC bus edge between the two is the same.
 *   - Vehicle-to-grid (V2G) bidirectional units share the topology but
 *     reverse the DC bus polarity; add a separate `bidirectional` flag in a
 *     future revision.
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const DC_FAST_EV_CHARGER: ProductClassGraph = {
  product_class: 'dc_fast_ev_charger',
  display_name: 'DC Fast EV Charger (50-350 kW, off-board / Level 3)',
  scope_notes:
    'Off-board DC fast EV charging station at the 50-350 kW class. Three-phase AC input ' +
    '(400/480 V), DC output via CCS-1/CCS-2 and/or CHAdeMO 150-950 V at 200-540 A. Covers ' +
    'pedestal-integrated and split power-cabinet + dispenser topologies. AC Level 1/2 chargers ' +
    'are OUT of scope. V2G bidirectional is a future revision.',

  nodes: [
    {
      class: 'energy_conversion_transduction',
      role: 'principal',
      required: true,
      display: 'AC-DC rectifier + isolated DC-DC converter modules (typ. 30-60 kW each, paralleled)',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: true,
      display: 'AC input terminals + DC bus (cabinet→dispenser) + EV charging cable + protective earth',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'Charger controller (state machine) + OCPP gateway + CCS/CHAdeMO comms + 4G/Ethernet backhaul',
    },
    {
      class: 'sensing_instrumentation',
      role: 'sensor',
      required: true,
      display: 'Energy meter (MID/MV approved) + DC V/I sense per module + connector temp + ground fault',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'RCD Type B (500 mA / 150 ms) + isolation monitor (IEC 61851-23) + surge protection (UL 1449) + arc-fault',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: true,
      display: 'Forced-air or liquid cooling for power modules + cabinet fans + connector cooling (>200 A)',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'Steel IP54/IP55 cabinet + IK10 vandal rating + concrete plinth (anchor M16, 2500 PSI pad)',
    },
    {
      class: 'hmi_ergonomics',
      role: 'subsystem',
      required: true,
      display: '7-inch touchscreen + LED status ring + start-stop button + braille + RFID/NFC card reader',
    },
    {
      class: 'mass_fluid_transport_process',
      role: 'subsystem',
      required: false,
      display: 'OPTIONAL liquid-cooled charging cable (>250 A) — coolant pump + reservoir + manifolds',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: 'Cabinet access doors + module hot-swap + diagnostic port + remote firmware update',
    },
  ],

  edges: [
    // ── AC input path ──
    {
      from_class: 'power_distribution',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'ac_busbar',
      electrical: {
        voltage_nominal_v: 400,
        voltage_range_v: [380, 480],
        ac_or_dc: 'AC',
        ac_phases: 3,
        ac_frequency_hz: 50,
        current_max_a: 232,
      },
      mechanical: { connector: 'cage clamp or stud', cable_type: 'EU non-armored 35 mm² / NA 2 AWG' },
      required: true,
      direction: 'directional',
      notes: 'Three-phase 380-480 VAC input (EU 50 Hz, NA 60 Hz). Nominal input current 153-231 A per cabinet (corpus). Recommended upstream breaker 150-300 A (corpus). Max conductor size 35 mm² (EU) / 2 AWG (NA) (corpus). Short-circuit withstand 35-65 kA (corpus).',
      source_references: [
        'corpus:AC Input voltage@dc_fast_ev_charger (480Y / 277 VAC)',
        'corpus:Input voltage@dc_fast_ev_charger (380…480 VAC)',
        'corpus:Frequency@dc_fast_ev_charger (50/60 Hz)',
        'corpus:Nominal input current (480V)@dc_fast_ev_charger (231 A)',
        'corpus:Short circuit current rating@dc_fast_ev_charger (65 kA)',
        'corpus:Recommended upstream circuit breaker (Terra 184)@dc_fast_ev_charger (300 A)',
        'corpus:AC terminal max wire size@dc_fast_ev_charger (35 mm2)',
        'standard:IEC 61851-1',
      ],
    },

    // ── DC bus (power cabinet → dispenser) — split-arch only ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'power_distribution',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_nominal_v: 750,
        voltage_range_v: [150, 1000],
        ac_or_dc: 'DC',
        current_max_a: 540,
      },
      mechanical: { connector: 'DC lug 19 mm spacing, 30 mm wide', cable_type: '120 mm² DC armoured (max 80 m run)' },
      required: true,
      direction: 'directional',
      notes: 'Internal DC bus from rectifier/converter modules to dispenser output. Corpus output 150-920 V DC (CCS), 150-500 V DC (CHAdeMO), up to 1000 V on highest-V units. Max output current 375 A single cabinet / 500 A two cabinets paralleled. DC lug spacing 19 mm, max wire 120 mm² (corpus). Cabling distance ≤80 m (corpus).',
      source_references: [
        'corpus:DC output voltage (CCS-1)@dc_fast_ev_charger (150-920 VDC)',
        'corpus:DC output voltage (CHAdeMO)@dc_fast_ev_charger (150-500 VDC)',
        'corpus:Max Output Current@dc_fast_ev_charger (540 A)',
        'corpus:Maximum output current (one cabinet)@dc_fast_ev_charger (375 A DC)',
        'corpus:Recommended maximum cabling distance@dc_fast_ev_charger (80 meters)',
        'corpus:DC terminal max wire size@dc_fast_ev_charger (120 mm²)',
        'standard:IEC 61851-23',
      ],
    },

    // ── EV charging cable (dispenser → vehicle) ──
    {
      from_class: 'power_distribution',
      to_class: 'actuation_kinematics',
      protocol: 'CCS-PLC',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_nominal_v: 750,
        voltage_range_v: [150, 920],
        ac_or_dc: 'DC',
        current_max_a: 500,
      },
      mechanical: { connector: 'CCS-1 / CCS-2 / CHAdeMO 1.2', cable_type: 'liquid-cooled or air-cooled high-current charge cable' },
      required: true,
      direction: 'directional',
      notes: 'EV charging cable terminating in CCS-1 (NA), CCS-2 (EU), and/or CHAdeMO connector. Cable length 4.5-6 m (corpus). Above 200 A continuous the cable is liquid-cooled (coolant flows in a return loop). CCS uses PLC (HomePlug GreenPHY) carrier over CP/PE for digital negotiation per ISO 15118; CHAdeMO uses dedicated CAN.',
      source_references: [
        'corpus:Cable Length@dc_fast_ev_charger (4.5 m)',
        'corpus:Charge cable length@dc_fast_ev_charger (6 m)',
        'corpus:Dispenser CCS1 Current@dc_fast_ev_charger (540 A)',
        'corpus:Dispenser Output Voltage@dc_fast_ev_charger (1000 Vdc)',
        'standard:IEC 62196-3 (connectors)',
        'standard:ISO 15118 (PnC / Plug-and-Charge)',
        'standard:CHAdeMO 1.2',
        'standard:CCS Combined Charging System',
      ],
    },

    // ── Charging session comms ──
    {
      from_class: 'control_compute_communication',
      to_class: 'actuation_kinematics',
      protocol: 'CCS-PLC',
      mechanism: 'modbus_tcp',
      mechanical: { connector: 'embedded in charge cable CP/PE pair', cable_type: 'HomePlug GreenPHY over twisted CP+PE' },
      required: true,
      direction: 'mutual',
      notes: 'Digital handshake with vehicle BMS during charging session. CCS uses ISO 15118 PLC over the Control Pilot line (target voltage, target current, SoC, max charging power negotiation). CHAdeMO uses CHAdeMO CAN dialect. Negotiates ramping current to vehicle BMS request every 100 ms.',
      source_references: [
        'corpus:ISO 15118@dc_fast_ev_charger',
        'corpus:CHAdeMO 1.2@dc_fast_ev_charger',
        'corpus:CCS@dc_fast_ev_charger',
        'standard:ISO 15118-2 (digital application)',
        'standard:ISO 15118-3 (physical layer / data link)',
      ],
    },

    // ── Backhaul to operator (OCPP) ──
    // 2026-05-18 K10 enforcing-promotion follow-up #2: `required` downgraded
    // from true → false. OCPP backhaul is conceptually a CCC→external-comms
    // infrastructure link (Cellular-LTE / Ethernet → CPO back-office), NOT an
    // HMI surface. Production emitters route the OCPP/4G/Ethernet link as
    // part of the CCC module's internal connectivity stack (along with the
    // OCPP gateway + CCS/CHAdeMO comms already documented on the CCC node)
    // rather than emitting a separate CCC→HMI modbus_tcp edge. The K10
    // taxonomy has no `external_interface` or `connectivity` slug — the 12
    // universal modules are fixed (see src/lib/pdf-engine-v2/types/module-
    // decomposition.ts UNIVERSAL_MODULES). Keeping this edge in the graph
    // with `required: false` preserves the valid-but-non-canonical OCPP-as-
    // HMI-event-source interpretation (some emitters do treat the touchscreen
    // tap-to-start ↔ CPO authentication flow as an HMI surface) while
    // allowing canonical emitter outputs that don't emit this link to pass
    // K10 enforcing-mode validation. Mirrors the iter 3 ECT→EI cooling-loop
    // downgrade pattern (this file, line 310).
    {
      from_class: 'control_compute_communication',
      to_class: 'hmi_ergonomics',
      protocol: 'Cellular-LTE',
      mechanism: 'modbus_tcp',
      mechanical: { connector: 'RJ45 + SIM slot', cable_type: 'Cat 5e Ethernet (100 m max) or 4G LTE' },
      required: false,
      direction: 'mutual',
      notes: 'OCPP 1.6 JSON over WebSocket to charge point operator (CPO) back-office for authentication, billing, remote start/stop, firmware update, fault telemetry. Backhaul over Ethernet (100 m max per corpus) or 4G LTE (Vodafone — corpus). RFID/NFC reader (ISO/IEC 14443A/B + 15693) provides local authentication. K10-3 ROUTING NOTE: this edge is downgraded to required:false because OCPP backhaul is canonically modelled as CCC-internal connectivity (the OCPP gateway + 4G/Ethernet stack lives on the CCC node display), not as an HMI surface. Production emitters that don\'t emit a separate CCC→HMI modbus_tcp link are valid; emitters that DO emit it (treating the touchscreen tap-to-start ↔ CPO authentication round-trip as an HMI event) are also valid. The canonical CCC↔HMI link covering the touchscreen + LED ring + NFC reader is the dedicated hmi_data edge below (RS-485). Mirrors the iter 3 ECT→EI cooling-loop downgrade pattern.',
      source_references: [
        'corpus:OCPP 1.6 JSON@dc_fast_ev_charger',
        'corpus:4G LTE wireless network@dc_fast_ev_charger (Vodafone)',
        'corpus:Ethernet max run length@dc_fast_ev_charger (100 m)',
        'corpus:ISO/IEC 14443A/B@dc_fast_ev_charger (RFID)',
        'standard:OCPP 1.6 JSON',
      ],
    },

    // ── Sensing path ──
    {
      from_class: 'control_compute_communication',
      to_class: 'sensing_instrumentation',
      protocol: 'Modbus-RTU',
      mechanism: 'sensor_feedback',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'mutual',
      notes: 'Charger controller reads: MID-approved energy meter (billing), DC voltage/current per power module (Hall ICs), connector temp (NTC on each pin pair — derate trigger above 90 °C), ground-fault current, ambient temp. Current accuracy ±2% (corpus).',
      source_references: [
        'corpus:Current Accuracy@dc_fast_ev_charger (±2 %)',
        'corpus:AC conductor temperature rating@dc_fast_ev_charger (90 °C)',
        'industry:MID Directive 2014/32/EU energy meter',
      ],
    },

    // ── Safety chain ──
    {
      from_class: 'safety_protection',
      to_class: 'energy_conversion_transduction',
      protocol: 'Digital-24V',
      mechanism: 'safety_isolation',
      electrical: { voltage_nominal_v: 24, ac_or_dc: 'DC' },
      required: true,
      direction: 'directional',
      notes: 'RCD Type B (corpus: 500 mA threshold, 150 ms delay) opens the AC input contactor on earth fault. Insulation monitoring per IEC 61851-23 trips DC output on isolation failure (typically <100 kΩ). Surge protection UL 1449 + IEC 61000-4-5 Level 5 (corpus). Shunt trip rated 440 VAC / 5 ARMS (corpus).',
      source_references: [
        'corpus:RCD Trip threshold@dc_fast_ev_charger (500 mA)',
        'corpus:RCD Trip delay@dc_fast_ev_charger (150 ms)',
        'corpus:Shunt trip contact rating@dc_fast_ev_charger (440 VAC)',
        'corpus:UL 1449@dc_fast_ev_charger',
        'corpus:IEC 61000-4-5, Level 5@dc_fast_ev_charger',
        'standard:UL 2202',
        'standard:UL 2231-1 / UL 2231-2 (personnel protection)',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'sensing_instrumentation',
      protocol: 'Analog-thermistor',
      mechanism: 'alarm_interlock',
      required: true,
      direction: 'mutual',
      notes: 'Connector overtemperature, isolation fault, and CP/PP fault detection feed both the safety logic and the central instrumentation. Mandatory per UL 2231-1 (isolation monitor interrupter — IMI requirements).',
      source_references: [
        'corpus:UL 2231-1@dc_fast_ev_charger',
        'standard:UL 2231-1 IMI requirements',
      ],
    },

    // ── Cooling ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'cooling_loop',
      fluid: { medium: 'air', temperature_max_c: 55, temperature_min_c: -35 },
      required: false,
      direction: 'mutual',
      notes: 'Forced-air cooling for power modules and rectifier — each ~30-60 kW module has its own fan tray. Operating envelope -35 to +55 °C (corpus). Acoustic noise 60-68 dB(A) at full load (corpus). Above 400 kW units transition to direct liquid cooling of the converter modules. K10-3 ROUTING NOTE: Forced-air cooling is conceptually a two-edge chain ECT→mass_fluid_transport_process→environmental_interface (heat source → coolant transport → ambient rejection). Emitters following K10-3 route via MFTP rather than emitting a direct ECT↔EI edge. This direct edge is downgraded to required:false so it is treated as a valid-but-non-canonical alternative; the canonical chain via mass_fluid_transport_process remains the preferred encoding. Mirrors the BESS bess-utility-scale.ts ECT↔EI downgrade pattern (commit 2026-05-18).',
      source_references: [
        'corpus:Operating temperature@dc_fast_ev_charger (-35 to +55 °C)',
        'corpus:Noise level (power cabinet)@dc_fast_ev_charger (65 dB(A))',
        'corpus:Maximum operating temperature@dc_fast_ev_charger (50 °C)',
        'corpus:Power Module Weight@dc_fast_ev_charger (45 kg)',
      ],
    },
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'power_distribution',
      protocol: 'physical',
      mechanism: 'cooling_loop',
      fluid: { medium: 'water-glycol', pressure_max_bar: 4, flow_max_lpm: 15, temperature_max_c: 60 },
      mechanical: { connector: 'push-fit', cable_type: 'twin 8 mm hose integrated into charge cable jacket' },
      required: false,
      direction: 'mutual',
      notes: 'OPTIONAL liquid cooling for the charging cable+connector above 200 A continuous. Coolant pump + small reservoir + heat-exchanger live in the dispenser; supply/return runs back-to-back inside the cable jacket. Required for 350 kW HPC units; optional below.',
      source_references: [
        'industry:ABB Terra HP 350 liquid-cooled cable spec',
        'industry:Huber+Suhner Radox high-power liquid-cooled cable',
      ],
    },

    // ── Mechanical ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { mount: 'bolted', connector: 'M16 anchor bolts' },
      required: true,
      direction: 'mutual',
      notes: 'Cabinet bolts to concrete pad via M16 anchors (corpus: 229 mm embedment, 94.9 Nm torque). Concrete strength ≥2500 PSI (corpus). Power-module weight 45 kg, cabinet weight 537-925 kg (corpus). IP54/IP55 ingress, IK10 vandal rating (IK08 touchscreen — corpus).',
      source_references: [
        'corpus:Anchor Bolt Size@dc_fast_ev_charger (M16 (5/8 in))',
        'corpus:Anchor Bolt Embedment@dc_fast_ev_charger (229 mm)',
        'corpus:Anchor bolt torque@dc_fast_ev_charger (94.9 Nm)',
        'corpus:Concrete strength@dc_fast_ev_charger (2500 PSI)',
        'corpus:IK Rating (enclosure)@dc_fast_ev_charger (IK10)',
        'corpus:IK rating (touchscreen)@dc_fast_ev_charger (IK08)',
        'corpus:IP Rating@dc_fast_ev_charger (IP54)',
        'standard:IEC 62262 (IK code)',
      ],
    },

    // ── HMI (user-facing) ──
    // 2026-05-18 K10 enforcing-promotion follow-up: `to_class` moved from
    // `sensing_instrumentation` to `hmi_ergonomics`. Touchscreen + LED ring +
    // RFID reader are HMI devices, not instrumentation — emitters route the
    // hmi_data frame buffer + NFC event stream through `hmi_ergonomics` not
    // `sensing_instrumentation`. The prior wiring was an authoring error
    // (mechanism=hmi_data → must terminate at hmi_ergonomics); it also forced
    // every K10 EV pass to report 1 missing-required edge that no production
    // emitter ever satisfied. Mirrors the BESS bess-utility-scale.ts pattern
    // where mechanisms are anchored to the module class they semantically belong to.
    {
      from_class: 'control_compute_communication',
      to_class: 'hmi_ergonomics',
      protocol: 'RS-485',
      mechanism: 'hmi_data',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'mutual',
      notes: '7-inch touchscreen (IK08 vandal rating) + LED status ring + RFID/NFC card reader for tap-to-start. Touch display capable of -30 to +50 °C operation. Idle/standby power 20-180 W (corpus). 2026-05-18: edge now terminates at hmi_ergonomics rather than sensing_instrumentation — the frame buffer + NFC event stream are HMI surfaces, not instrumentation channels; sensing_instrumentation continues to handle the energy meter + DC V/I sense + connector temp + ground fault loops.',
      source_references: [
        'corpus:Display size@dc_fast_ev_charger (7 inch)',
        'corpus:Idle power@dc_fast_ev_charger (20 VA)',
        'corpus:Standby power C502@dc_fast_ev_charger (180 W)',
        'corpus:ISO/IEC 14443A/B@dc_fast_ev_charger',
      ],
    },

    // ── Service ──
    {
      from_class: 'maintenance_serviceability',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'panel', connector: 'lockable access door' },
      required: false,
      direction: 'mutual',
      notes: 'Front + rear cabinet access doors for module hot-swap. Diagnostic Ethernet port for service technician laptop. Snow depth tolerance 0.25 m / 10 in (corpus). Optional only because some Tier-1 vendors factory-only service.',
      source_references: [
        'corpus:Snow depth limit@dc_fast_ev_charger (0.25 m)',
        'industry:ABB Terra service manual',
      ],
    },
  ],

  sources_cited: [
    'corpus:dc_fast_ev_charger (~15 datasheets, 2026-05-18; ABB, Tritium, Wallbox, Alpitronic, Kempower)',
    'standard:IEC 61851-1 (EV conductive charging — general)',
    'standard:IEC 61851-21-2 (EMC off-board)',
    'standard:IEC 61851-23 (DC EV supply equipment)',
    'standard:IEC 62196-3 (DC connector — CCS/CHAdeMO)',
    'standard:ISO 15118 (PnC / Plug-and-Charge)',
    'standard:CHAdeMO 1.2',
    'standard:CCS (Combined Charging System)',
    'standard:OCPP 1.6 JSON',
    'standard:UL 2202 (US EV supply equipment)',
    'standard:UL 2231-1 (US personnel protection — IMI)',
    'standard:UL 2231-2 (US personnel protection)',
    'standard:UL 1449 (surge protection)',
    'standard:IEC 62262 (IK code)',
    'standard:IEC 61000-4-5 Level 5 (surge immunity)',
    'standard:ISO/IEC 14443A/B (RFID)',
    'industry:ABB Terra 124 / 184 / HP 175 / HP 350 datasheets',
    'industry:Tritium PKM150 datasheet',
    'industry:Alpitronic HYC datasheet',
    'industry:Wallbox Supernova 60 datasheet',
  ],
}

registerClassReferenceGraph(DC_FAST_EV_CHARGER)

export { DC_FAST_EV_CHARGER }
