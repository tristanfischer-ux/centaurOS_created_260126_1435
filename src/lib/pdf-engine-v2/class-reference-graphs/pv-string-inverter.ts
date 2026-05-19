/**
 * @file class-reference-graphs/pv-string-inverter.ts — K10 typed graph for
 * PV string inverters (3-phase grid-tied solar inverters at the
 * residential/commercial-rooftop scale).
 *
 * @description Models a transformerless 3-phase PV string inverter at the
 * ~3-30 kW (residential) and ~30-150 kW (commercial C&I) scale: SMA Sunny
 * Tripower / Sunny Boy, Huawei SUN2000, Sungrow SG, Fronius Symo / Tauro,
 * Enphase IQ (microinverter family — same module taxonomy at smaller scale),
 * SolarEdge HD-Wave. DC input from a roof-mounted PV string (with optional
 * battery DC-coupled in hybrid units); AC output 230 V / 400 V 50 Hz EU or
 * 240 V / 480 V 60 Hz NA. Two-stage topology: DC-DC boost + MPPT per string,
 * then DC-AC inverter stage.
 *
 * @sources Corpus values from `pretraining_extracted_specs` joined to
 * `pretraining_spec_documents WHERE product_class='pv_string_inverter'` in
 * ~/.forge-truth/forge-truth.db (27 datasheets, well-covered).
 *
 * @corpus-coverage-2026-05-18
 *   - DC input voltage range: 80-1000 V, 150-1000 V, 200-900 V, 580-1000 V
 *     (string-class), 1100-1500 V (commercial high-V) — corpus direct.
 *   - MPPT range: 224-550 V, 230-550 V, 125-750 V, 600-1500 V — corpus direct.
 *   - Max DC input current per MPPT: 12-44 A — corpus direct.
 *   - Max DC short circuit current: 15-150 A — corpus direct.
 *   - AC output power: 3-150 kW — corpus direct (3.0/4.0/5.0/10/20/25/27/105 kW).
 *   - AC nominal voltage: 230 / 400 / 380 / 220 / 480 V (grid connection) — corpus.
 *   - AC frequency: 50 / 60 Hz — corpus direct.
 *   - Max AC current: 8-87 A — corpus direct.
 *   - Efficiency: 95-98.8% Euro/CEC — corpus direct.
 *   - Ambient temp: -25 to +60 °C, -40 to +65 °C — corpus direct.
 *   - IP rating: IP65 / IP66 / IP67 — corpus direct.
 *   - Ethernet 10/100 Mbit/s + Modbus TCP + Sunspec — corpus direct.
 *   - DC connector cross-section: 2.5-6 mm² (MC4 / Stäubli) — corpus direct.
 *   - Standards: UL 1741, UL 1741-SA/SB, IEEE 1547:2018, IEC 62109-1/-2,
 *     IEC 62116 (anti-islanding), IEC 61727 (grid), AS/NZS 4777.2, CEI 0-21,
 *     UL 1699B (arc fault), IEC 63027:2023 (DC arc), VDE-AR-N 4105 — corpus.
 *
 * @scope-2026-05-18
 *   - 3-phase grid-tied transformerless inverter — common case for new EU C&I.
 *     Single-phase residential is the same module set with fewer AC terminals.
 *   - DC-coupled hybrid (with battery input) is a superset — the optional
 *     `energy_storage_source ↔ energy_conversion_transduction` edge covers it.
 *   - Microinverter (Enphase IQ-class) shares the same module taxonomy at
 *     module-attached scale; mass-balance and form-factor differ but the K10
 *     edges hold.
 *   - Rapid-shutdown / module-level power electronics (Tigo, SolarEdge
 *     optimizers) live OUTSIDE this graph — they belong to a separate
 *     `pv_optimizer` class graph.
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const PV_STRING_INVERTER: ProductClassGraph = {
  product_class: 'pv_string_inverter',
  display_name: 'PV String Inverter (3-150 kW, 3-phase grid-tied)',
  scope_notes:
    'Transformerless 3-phase grid-tied PV string inverter at the residential/commercial scale ' +
    '(3-30 kW residential, 30-150 kW C&I). DC-DC boost (MPPT per string) + DC-AC inverter stage. ' +
    'Single-phase residential is a subset. Hybrid (DC-coupled battery) edge is OPTIONAL. Power ' +
    'optimizers / module-level power electronics are OUT of scope.',

  nodes: [
    {
      class: 'energy_conversion_transduction',
      role: 'principal',
      required: true,
      display: 'DC-DC boost (MPPT) + IGBT/SiC inverter bridge + AC output filter',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: true,
      display: 'DC input terminals (MC4 / Stäubli) + AC output terminal block + grounding bar',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'DSP / MCU control board + Modbus-TCP gateway + Ethernet + WiFi + SunSpec',
    },
    {
      class: 'sensing_instrumentation',
      role: 'sensor',
      required: true,
      display: 'PV string V/I sense + DC-link V sense + AC phase V/I sense + heatsink temp',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'DC arc fault detector (UL 1699B / IEC 63027) + RCMU + isolation monitor + anti-islanding',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: true,
      display: 'Heatsink + fan (forced air) + IP65/66 enclosure ventilation',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'Die-cast or sheet-metal IP65/66 enclosure + wall-mount bracket',
    },
    {
      class: 'energy_storage_source',
      role: 'subsystem',
      required: false,
      display: 'OPTIONAL: DC-coupled battery (hybrid units only) — Pylontech, BYD HVS/HVM, LG Chem',
    },
    {
      class: 'hmi_ergonomics',
      role: 'subsystem',
      required: false,
      display: 'Front-panel LCD / LED status + smartphone app (cloud + BLE/WiFi)',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: 'DC isolator switch + commissioning port + firmware update path + LED indicators',
    },
  ],

  edges: [
    // ── DC input path ──
    {
      from_class: 'power_distribution',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_range_v: [80, 1000],
        ac_or_dc: 'DC',
        current_max_a: 44,
      },
      mechanical: { connector: 'MC4 / Stäubli', cable_type: '2.5-6 mm² PV-rated DC cable' },
      required: true,
      direction: 'directional',
      notes: 'PV string DC input to MPPT boost stage. Corpus DC input range 80-1000 V (residential), up to 1500 V (commercial). Max input current per MPPT 12-44 A (corpus). Short-circuit current up to 150 A (corpus). Multi-MPPT designs route 2-4 strings; each MPPT is electrically independent.',
      source_references: [
        'corpus:DC input voltage range@pv_string_inverter (80-1000 V)',
        'corpus:DC input voltage range@pv_string_inverter (200-900 V)',
        'corpus:Max. input current (Idc max)@pv_string_inverter',
        'corpus:Max DC short circuit current@pv_string_inverter (15 A)',
        'corpus:Max. input current / max. short-circuit current@pv_string_inverter (110 / 150 A)',
        'corpus:DC connector conductor cross-section@pv_string_inverter (2.5 to 6 mm²)',
        'standard:IEC 62548',
      ],
    },

    // ── AC output path ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'power_distribution',
      protocol: 'physical',
      mechanism: 'ac_busbar',
      electrical: {
        voltage_nominal_v: 400,
        voltage_range_v: [180, 480],
        ac_or_dc: 'AC',
        ac_phases: 3,
        ac_frequency_hz: 50,
        current_max_a: 87,
      },
      mechanical: { connector: 'AC terminal block (cage clamp or screw)', cable_type: '3-phase + N + PE 6-16 mm²' },
      required: true,
      direction: 'directional',
      notes: 'Inverter bridge AC output to grid-tie terminals. Corpus 3-phase 400 V / 230 V neutral (EU) or 480 V (NA). Frequency 50/60 Hz (corpus). Max AC current 3×87 A on 105 kW unit (corpus). Conductor cross-section 6-16 mm² (corpus). PE bond is mandatory per IEC 62109.',
      source_references: [
        'corpus:Grid connection voltage@pv_string_inverter (400 / 230 or 380 / 220 V)',
        'corpus:Frequency@pv_string_inverter (50 / 60 Hz)',
        'corpus:Max. AC current@pv_string_inverter (3 x 87 A)',
        'corpus:AC conductor cross-section@pv_string_inverter (6 to 16 mm²)',
        'corpus:Grounding conductor cross-section@pv_string_inverter (10 mm²)',
        'standard:IEC 62109-1/-2',
        'standard:IEC 61727',
      ],
    },

    // ── Optional: hybrid battery DC-coupling ──
    {
      from_class: 'energy_storage_source',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_range_v: [80, 600],
        ac_or_dc: 'DC',
        current_max_a: 30,
      },
      mechanical: { connector: 'Amphenol/Anderson DC plug or screw terminal', cable_type: '6-16 mm² DC' },
      required: false,
      direction: 'mutual',
      notes: 'OPTIONAL DC-coupled battery for hybrid units. Bidirectional — battery charges from PV during day, discharges via inverter at night. Corpus max charge/discharge current 30 A. Battery comms typically over CAN to the inverter MPPT controller.',
      source_references: [
        'corpus:Max. charging current / max. discharging current@pv_string_inverter (30 A)',
        'industry:BYD HVM / Pylontech US3000 hybrid spec',
      ],
    },

    // ── Control path ──
    {
      from_class: 'control_compute_communication',
      to_class: 'energy_conversion_transduction',
      protocol: 'PWM',
      mechanism: 'contactor_command',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 5 },
      required: true,
      direction: 'directional',
      notes: 'DSP / MCU drives the MPPT boost IGBT/SiC gates and the H-bridge inverter gates via isolated PWM (typically 8-20 kHz switching). MPPT algorithm (perturb-and-observe or incremental conductance) runs every line cycle. Static MPPT efficiency 99.9% (corpus).',
      source_references: [
        'corpus:MPPT efficiency, static@pv_string_inverter (99.9 %)',
        'corpus:Dynamic MPPT efficiency@pv_string_inverter (99.3 %)',
        'industry:Texas Instruments TMS320F28x DSP MPPT app note',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'sensing_instrumentation',
      protocol: 'Analog-thermistor',
      mechanism: 'sensor_feedback',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 5 },
      required: true,
      direction: 'mutual',
      notes: 'DSP reads PV string V/I (Hall ICs + isolated voltage dividers), DC-link voltage, AC phase V/I (for grid sync), and heatsink temperature (NTC / PT1000) every PWM cycle. Heatsink limit 70 °C (corpus).',
      source_references: [
        'corpus:Heat sink temperature limit@pv_string_inverter (70 °C)',
        'corpus:Internal operating temperature range@pv_string_inverter (-40 to +85 °C)',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'environmental_interface',
      protocol: 'PWM',
      mechanism: 'contactor_command',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 12 },
      required: true,
      direction: 'directional',
      notes: 'Cooling fan speed PWM driven by heatsink temp sensor — keeps junction temp within IGBT/SiC limits. Internal consumption <10 W in operation (corpus).',
      source_references: [
        'corpus:Internal consumption in operation@pv_string_inverter (< 10 W)',
        'corpus:Heat sink temperature limit@pv_string_inverter',
      ],
    },

    // ── Comms gateway ──
    {
      from_class: 'control_compute_communication',
      to_class: 'hmi_ergonomics',
      protocol: 'Modbus-TCP',
      mechanism: 'modbus_tcp',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 5 },
      mechanical: { connector: 'RJ45', cable_type: 'Cat 5e' },
      required: false,
      direction: 'mutual',
      notes: 'Ethernet 10/100 Mbit/s Modbus TCP + SunSpec to the manufacturer cloud (SMA Sunny Portal, Huawei FusionSolar, Fronius Solar.web) and to local energy management systems. WiFi for installer app. Ethernet overvoltage protection 1.5 kV (corpus).',
      source_references: [
        'corpus:Data transmission rate@pv_string_inverter (10/100 Mbit/s)',
        'corpus:Ethernet interface overvoltage protection@pv_string_inverter (1.5 kV)',
        'industry:SunSpec Modbus profile',
      ],
    },

    // ── Safety: anti-islanding + arc fault ──
    {
      from_class: 'safety_protection',
      to_class: 'energy_conversion_transduction',
      protocol: 'Digital-24V',
      mechanism: 'safety_isolation',
      electrical: { voltage_nominal_v: 24, ac_or_dc: 'DC' },
      required: true,
      direction: 'directional',
      notes: 'Anti-islanding detection (active frequency drift or impedance method) opens the grid-tie contactor on grid loss per IEC 62116. AFCI (arc fault circuit interrupter) per UL 1699B / IEC 63027:2023 trips the DC input on PV arc detection. RCMU (residual current monitoring unit) trips on >30 mA earth fault. Isolation failure threshold 1 MΩ (corpus).',
      source_references: [
        'corpus:Isolation failure resistance threshold@pv_string_inverter (1 MOhm)',
        'standard:IEC 62116 (anti-islanding)',
        'standard:UL 1699B (PV arc fault)',
        'standard:IEC 63027:2023 (DC arc detection)',
        'standard:UL 1741-SB (Rule 21 grid support)',
        'standard:IEEE 1547:2018',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'sensing_instrumentation',
      protocol: 'Analog-thermistor',
      mechanism: 'alarm_interlock',
      required: true,
      direction: 'mutual',
      notes: 'Insulation monitoring continuously reads PV+ to PE and PV- to PE impedance; trips at <1 MΩ (corpus). DC arc detection uses high-frequency current sense; AC overcurrent feeds the same logic.',
      source_references: [
        'corpus:Isolation failure resistance threshold@pv_string_inverter',
        'standard:UL 1699B issue 2 -2013',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'power_distribution',
      protocol: 'Digital-24V',
      mechanism: 'contactor_command',
      electrical: { voltage_nominal_v: 24, ac_or_dc: 'DC' },
      required: true,
      direction: 'directional',
      notes: 'Rapid shutdown command (NEC 690.12 / C22.1 Rule 64-218) opens the DC input contactor when the AC grid-tie contactor opens, dropping module-level voltage to <30 V within 30 s. AC tie-breaker (15 A grid fuse rating per corpus) is also commanded by the safety chain.',
      source_references: [
        'corpus:Grid fuse rating@pv_string_inverter (15 A)',
        'standard:NEC 690.12 (rapid shutdown)',
        'standard:C22.1-2018 Rule 64-218',
      ],
    },

    // ── Thermal / cooling ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'cooling_loop',
      fluid: { medium: 'air', temperature_max_c: 65, temperature_min_c: -40 },
      mechanical: { mount: 'in-line', connector: 'heatsink fins + fan shroud' },
      required: true,
      direction: 'mutual',
      notes: 'IGBT/SiC bridge dissipates ~2-3% of throughput as heat into a finned aluminium heatsink, forced-air cooled by a brushless DC fan. Ambient operating envelope -25 to +60 °C / -40 to +65 °C (corpus). Acoustic noise 58 dB(A) at full load (corpus).',
      source_references: [
        'corpus:Ambient temperature range@pv_string_inverter (-40 to +65 °C)',
        'corpus:Acoustic noise level@pv_string_inverter (58 dB(A))',
        'corpus:Internal operating temperature range@pv_string_inverter',
      ],
    },

    // ── Mechanical ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { mount: 'bolted', connector: 'M6 mounting studs + wall bracket' },
      required: true,
      direction: 'mutual',
      notes: 'Inverter assembly bolts to die-cast aluminium or sheet-metal enclosure rated IP65/66 (corpus). Wall-mount via dedicated bracket; crane eye M10 on commercial units (corpus). Designed for outdoor pole or wall installation in the C5 corrosion category.',
      source_references: [
        'corpus:Degree of protection@pv_string_inverter (IP65)',
        'corpus:Degree of protection@pv_string_inverter (IP 66)',
        'corpus:Corrosion rating@pv_string_inverter (C5)',
        'corpus:Crane eye bolt size@pv_string_inverter (M10)',
        'corpus:Inverter weight@pv_string_inverter (61 kg)',
      ],
    },
    {
      from_class: 'power_distribution',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'panel', connector: 'M25/M32 cable gland' },
      required: true,
      direction: 'mutual',
      notes: 'AC and DC cable glands maintain IP65/66 ingress rating at the enclosure boundary. Lower enclosure lid torque 2.0 ± 0.3 Nm (corpus); DC protective cover 3.5 Nm (corpus).',
      source_references: [
        'corpus:Lower enclosure lid screw torque@pv_string_inverter (2.0 ± 0.3 Nm)',
        'corpus:DC protective cover torque@pv_string_inverter (3.5 Nm)',
      ],
    },

    // ── Service ──
    {
      from_class: 'maintenance_serviceability',
      to_class: 'power_distribution',
      protocol: 'physical',
      mechanism: 'safety_isolation',
      mechanical: { mount: 'panel', connector: 'lockable DC isolator' },
      required: false,
      direction: 'directional',
      notes: 'Integrated DC load-break isolator (corpus: screw torque 2 ± 0.2 Nm) allows safe servicing without retrieving a separate string-combiner isolator. Optional — older units use external isolators.',
      source_references: [
        'corpus:DC load-break switch screw torque@pv_string_inverter (2 ± 0.2 Nm)',
        'standard:IEC 60947-3 (DC isolators)',
      ],
    },
  ],

  sources_cited: [
    'corpus:pv_string_inverter (~27 datasheets, 2026-05-18; SMA, Huawei, Sungrow, Fronius, Enphase)',
    'standard:IEC 62109-1 (PV inverter safety)',
    'standard:IEC 62109-2 (PV inverter specific safety)',
    'standard:IEC 62116 (anti-islanding)',
    'standard:IEC 61727 (utility interface)',
    'standard:IEC 62548 (DC input safety)',
    'standard:IEC 63027:2023 (DC arc detection)',
    'standard:UL 1741-SA (CA Rule 21)',
    'standard:UL 1741-SB (IEEE 1547:2018 grid support)',
    'standard:UL 1699B (PV arc fault)',
    'standard:IEEE 1547:2018',
    'standard:AS/NZS 4777.2:2020',
    'standard:CEI 0-21 (Italy LV)',
    'standard:CEI 0-16 (Italy MV)',
    'standard:VDE-AR-N 4105 (Germany LV)',
    'standard:Regulation (EU) 2016/631 (RfG)',
    'standard:NEC 690.12 (rapid shutdown)',
    'industry:SunSpec Alliance Modbus profile',
    'industry:SMA Sunny Tripower / Sunny Boy datasheets',
    'industry:Huawei SUN2000 datasheet',
    'industry:Sungrow SG / SH datasheet',
    'industry:Fronius Symo / Tauro datasheet',
    'industry:Enphase IQ8 datasheet',
  ],
}

registerClassReferenceGraph(PV_STRING_INVERTER)

export { PV_STRING_INVERTER }
