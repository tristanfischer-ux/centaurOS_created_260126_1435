/**
 * @file class-reference-graphs/fuel-cell-power-module.ts — K10 typed graph for
 * PEM fuel cell power modules.
 *
 * @description Models a self-contained automotive / heavy-duty / stationary
 * PEM fuel cell power module at the ~30-300 kW scale (Ballard FCmove-HD /
 * HD+ / MD / XD, Cummins HyPM, Plug Power ProGen, PowerCell MS-100 / S3,
 * Loop Energy S300, Toyota TMFCS-XX, Hyzon HyPower). Stack + balance-of-plant
 * (air, hydrogen, coolant) + DC-DC boost + integrated controller in a single
 * IP67 / IP6K9K enclosure. Hydrogen IN at ~5-8 barg, DC OUT at 140-750 V via
 * integrated DC-DC. Marine / heavy-duty variants carry DNV / ABS / Lloyds
 * type approval; on-road variants carry SAE J2578 + UN ECE Reg 10.
 *
 * @sources Corpus values from `pretraining_extracted_specs` joined to
 * `pretraining_spec_documents WHERE product_class='fuel_cell_power_module'`
 * in ~/.forge-truth/forge-truth.db (12 datasheets, well-covered).
 *
 * @corpus-coverage-2026-05-18
 *   - Net system power: 31, 45, 70, 90, 100, 120, 200 kW — corpus direct.
 *   - Operating system voltage: 140-280 V, 250-500 V, 350-720 V, 520-750 V —
 *     corpus direct.
 *   - Operating system current: 19-330 A (with DC-DC) — corpus direct.
 *   - Fuel supply pressure: 5-8 barg, 3.5-6.5 barg — corpus direct.
 *   - Hydrogen purity required: 99.99% / 99.998% (fuel-cell grade per
 *     ISO 14687) — corpus direct.
 *   - Coolant outlet temperature: 60-90 °C (nominal 70 °C) — corpus direct.
 *   - Freeze start: -25 to -30 °C — corpus direct.
 *   - Stack lifetime: 20,000-30,000 h — corpus direct.
 *   - Peak fuel efficiency: 53.5-60% (LHV) — corpus direct.
 *   - Idle power: 4.5-10 kW — corpus direct.
 *   - Weight: 145-336 kg (module) — corpus direct.
 *   - IP rating: IP44 / IP56 / IP67 / IP6K9K — corpus direct.
 *   - Standards: ISO 14687:2019, ISO 23273:2013, ISO 6469-2/-3/-4,
 *     SAE J2578, SAE J2719, SAE J1939, UN ECE Reg 10, DOT-SP 14504,
 *     DNV CG-0339, DNV Type Approval, ABS Marine, Lloyds, UN 38.3,
 *     UL System Cert, CE, ISO/IATF 16949 — corpus direct.
 *
 * @scope-2026-05-18
 *   - Self-contained PEM module with integrated BoP + controller + DC output.
 *   - Heavy-duty / automotive / stationary (truck, bus, marine genset,
 *     telecom backup, mining) — same module set, IP rating shifts.
 *   - SOFC (solid-oxide), MCFC (molten-carbonate), AFC (alkaline) are
 *     different chemistries with high-temperature stacks (~700 °C operating
 *     temperature noted in corpus) and live in separate graphs when seeded.
 *   - On-board hydrogen storage (350 / 700 bar tank) is OUT of scope — the
 *     module sees pre-regulated H2 at the inlet flange.
 *   - Off-board DC-DC / inverter / traction motor are OUT of scope — the
 *     module's high-voltage DC output is the boundary.
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const FUEL_CELL_POWER_MODULE: ProductClassGraph = {
  product_class: 'fuel_cell_power_module',
  display_name: 'PEM Fuel Cell Power Module (30-300 kW, integrated BoP + DC output)',
  scope_notes:
    'Self-contained PEM fuel cell power module at the 30-300 kW scale (Ballard FCmove, Cummins HyPM, ' +
    'Plug Power ProGen, PowerCell MS-100). PEM stack + air supply + hydrogen recirculation + coolant ' +
    'loop + DC-DC boost + integrated controller in a single IP67 / IP6K9K enclosure. Pre-regulated ' +
    'H2 inlet at 5-8 barg; DC OUT at 140-750 V. On-board H2 storage, downstream DC-DC, traction motor, ' +
    'and SOFC/MCFC/AFC chemistries are OUT of scope.',

  nodes: [
    {
      class: 'energy_conversion_transduction',
      role: 'principal',
      required: true,
      display: 'PEM stack (MEA + bipolar plates) + integrated DC-DC boost converter',
    },
    {
      class: 'mass_fluid_transport_process',
      role: 'subsystem',
      required: true,
      display: 'Air compressor + humidifier + H2 recirculation pump + purge valve + coolant pump',
    },
    {
      class: 'energy_storage_source',
      role: 'subsystem',
      required: true,
      display: 'External hydrogen supply interface (5-8 barg inlet, pre-regulated from tank or grid)',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: true,
      display: 'High-voltage DC output bus + LV 12/24 V auxiliary + grounding bar',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'Fuel cell control unit (FCCU) + SAE J1939 CAN gateway + diagnostic port',
    },
    {
      class: 'sensing_instrumentation',
      role: 'sensor',
      required: true,
      display: 'Stack V/I + cell-voltage monitor + coolant T + air mass flow + H2 pressure + leak detect',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'H2 leak detector + emergency shutoff valve + over-temp trip + ground-fault monitor',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: true,
      display: 'Radiator / external coolant loop + cathode air intake + exhaust water vent',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'IP67 / IP6K9K aluminium / steel enclosure with vibration-isolated mounting',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: 'Diagnostic port + drain valves + lifting eyes + cell-voltage tap-off',
    },
  ],

  edges: [
    // ── Hydrogen inlet path ──
    {
      from_class: 'energy_storage_source',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: {
        medium: 'gas',
        pressure_max_bar: 8,
        temperature_max_c: 50,
        temperature_min_c: -40,
      },
      mechanical: { connector: 'AN-flange or VCR fitting', cable_type: 'stainless 6-12 mm OD H2 line' },
      required: true,
      direction: 'directional',
      notes:
        'External pre-regulated hydrogen (typically from 350 or 700 bar storage tank via primary regulator) ' +
        'enters at 5-8 barg (corpus: 3.5-6.5 barg, 5-8 barg). H2 purity per ISO 14687:2019 grade D ' +
        '(corpus: 99.998% fuel cell quality). Inlet pressure must remain stable across full load — pressure ' +
        'transducer + safety shutoff is upstream of the recirculation loop.',
      source_references: [
        'corpus:Fuel supply pressure@fuel_cell_power_module (5 - 8 barg)',
        'corpus:H2 Pressure@fuel_cell_power_module (3.5 - 6.5 barg)',
        'corpus:Hydrogen purity (fuel cell quality)@fuel_cell_power_module (99.998 %)',
        'corpus:Fuel Type@fuel_cell_power_module (Gaseous hydrogen)',
        'standard:ISO 14687:2019 grade D',
        'standard:SAE J2719',
      ],
    },

    // ── Stack ──
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: {
        medium: 'gas',
        pressure_max_bar: 3,
        temperature_max_c: 80,
        temperature_min_c: -30,
      },
      required: true,
      direction: 'mutual',
      notes:
        'Anode (H2) and cathode (humidified air) feed manifolds deliver reactants to the MEA. Recirculation ' +
        'pump returns un-reacted H2 from the anode outlet; purge valve periodically vents accumulated N2 + ' +
        'liquid water. Cathode air is humidified at the membrane operating point (~80% RH). PEM stack ' +
        'operating temperature 60-80 °C (corpus: 60 °C nominal; high-T variants up to 100 °C noted).',
      source_references: [
        'corpus:Operating Temperature@fuel_cell_power_module (100 °C)',
        'corpus:Operational temperature (PEM)@fuel_cell_power_module (RT - 80 °C)',
        'industry:PEM stack BoP topology (Ballard FCmove BoP)',
      ],
    },
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'cooling_loop',
      fluid: {
        medium: 'water-glycol',
        pressure_max_bar: 3,
        flow_max_lpm: 200,
        temperature_max_c: 90,
        temperature_min_c: -40,
        pipe_dn_mm: 25,
      },
      mechanical: { connector: 'quick-disconnect coolant fittings' },
      required: true,
      direction: 'mutual',
      notes:
        'Stack rejects ~40-45% of LHV fuel input as low-grade heat (~70 °C nominal outlet — corpus). ' +
        'Coolant loop is split: low-T circuit through the stack and air intercooler; high-T circuit through ' +
        'the radiator. Outlet temperature limit 65-90 °C (corpus). Below freezing the same loop heats the ' +
        'stack to enable cold start (freeze start -25 to -30 °C — corpus).',
      source_references: [
        'corpus:Nominal radiator coolant outlet temperature@fuel_cell_power_module (70 °C)',
        'corpus:System cooling output@fuel_cell_power_module (65 °C)',
        'corpus:System outlet temperature@fuel_cell_power_module (90 °C)',
        'corpus:Radiator coolant outlet temperature@fuel_cell_power_module (60 °C)',
        'corpus:Freeze start@fuel_cell_power_module (-25 to -30 °C)',
        'corpus:Peak fuel efficiency@fuel_cell_power_module (53.5-60 %)',
      ],
    },
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: { medium: 'gas', pressure_max_bar: 1, temperature_max_c: 90 },
      mechanical: { mount: 'in-line', connector: 'cathode exhaust port' },
      required: true,
      direction: 'directional',
      notes:
        'Cathode exhaust expels depleted air + product water + entrained nitrogen to ambient. Liquid water ' +
        'condenses in the exhaust manifold; on cold-start it may freeze (the BoP heater path through the ' +
        'cooling loop prevents stack freeze damage but exhaust ice is a known field issue).',
      source_references: [
        'industry:PEM stack water balance — Ballard / Plug Power BoP datasheets',
        'corpus:Sub-zero shutdown capability@fuel_cell_power_module (-40 °C)',
      ],
    },

    // ── DC output path ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'power_distribution',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_range_v: [140, 750],
        ac_or_dc: 'DC',
        current_max_a: 550,
      },
      mechanical: { connector: 'HV-IL DC terminal block + Amphenol RADSOK', cable_type: 'HV-shielded 50-95 mm² DC' },
      required: true,
      direction: 'directional',
      notes:
        'Stack DC output (raw) goes through integrated DC-DC boost to a regulated HV bus. Operating system ' +
        'voltage 140-280 V (without DC-DC) or 250-720 V (with DC-DC) — corpus direct. Max rated current ' +
        '2 × 300 A or 1 × 550 A on 200 kW modules (corpus). HV-IL (high-voltage interlock loop) is ' +
        'mandatory per ISO 6469-3 on automotive variants.',
      source_references: [
        'corpus:Operating system voltage@fuel_cell_power_module (250 - 500 V, 520 - 750 V)',
        'corpus:Operating System Voltage (with DCDC)@fuel_cell_power_module (450 - 700 V)',
        'corpus:Operating System Voltage (without DCDC)@fuel_cell_power_module (140 - 280 V)',
        'corpus:Operating voltage@fuel_cell_power_module (350 - 720 V DC)',
        'corpus:Rated current@fuel_cell_power_module (2 × 300 A or 1 × 550 A)',
        'standard:ISO 6469-3:2011 (HV interlock)',
      ],
    },

    // ── Control path ──
    {
      from_class: 'control_compute_communication',
      to_class: 'energy_conversion_transduction',
      protocol: 'CAN',
      mechanism: 'can_bus',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      mechanical: { connector: 'Deutsch DT04 / M12 5-pin', cable_type: 'CAN twisted pair 120 Ω' },
      required: true,
      direction: 'mutual',
      notes:
        'FCCU dispatches stack current setpoint, BoP actuator commands, and reads cell-voltage / temperature ' +
        'state at 100 Hz over SAE J1939 CAN. Higher-level vehicle / genset controller sends a single net-power ' +
        'request; FCCU manages the inner control loops (stack purge, air stoichiometry, coolant temperature).',
      source_references: [
        'standard:SAE J1939:2013 (control interface)',
        'industry:Ballard FCmove J1939 PGN list',
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
      notes:
        'Air compressor speed, H2 recirculation pump, purge valve, coolant pump, and 3-way mixing valve are ' +
        'all PWM- or CAN-commanded by the FCCU. Air compressor is the largest parasitic load (idle power ' +
        '4.5-10 kW corpus, much of which is the BoP).',
      source_references: [
        'corpus:Idle power@fuel_cell_power_module (4.5 - 10 kW)',
        'industry:PEM BoP control — Toyota Mirai FC stack control patent',
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
      notes:
        'FCCU reads stack V/I, per-cell voltage (cell-voltage monitor sees all ~400 cells), coolant inlet/outlet ' +
        'T (PT1000 / NTC), H2 inlet pressure (4-20 mA transducer), air mass flow (MAF sensor), and ambient ' +
        'pressure / temperature. Cell-voltage monitor is the primary lifetime-degradation indicator (short-term ' +
        'degradation 10 mV / 1000 h — corpus).',
      source_references: [
        'corpus:Short term degradation@fuel_cell_power_module (10 mV/1000 h)',
        'corpus:MEA Performance Voltage@fuel_cell_power_module (0.75 V)',
        'industry:Smart Testsolutions CVM for PEM stacks',
      ],
    },

    // ── Safety path ──
    {
      from_class: 'safety_protection',
      to_class: 'mass_fluid_transport_process',
      protocol: 'Digital-24V',
      mechanism: 'safety_isolation',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'directional',
      notes:
        'H2 emergency shutoff valve (ESV) at module inlet closes within 100 ms on leak detect / overtemperature / ' +
        'crash signal. Hard-wired safety chain independent of CAN. Required per ISO 23273:2013 (safety of FC ' +
        'vehicles) and SAE J2578:2014 (general FC safety).',
      source_references: [
        'standard:ISO 23273:2013 (FC vehicle safety)',
        'standard:SAE J2578:2014 (general FC safety)',
        'standard:ISO 6469-4:2015',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'sensing_instrumentation',
      protocol: 'Digital-24V',
      mechanism: 'alarm_interlock',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'mutual',
      notes:
        'H2 leak detector (catalytic or electrochemical, set point typically 1% LEL = 0.4 vol% H2 in air per ' +
        'ISO 23273) feeds the safety chain. Cell-voltage monitor flags out-of-range cell as a hard trip — a ' +
        'single reversed cell can puncture the membrane within seconds at high current.',
      source_references: [
        'standard:ISO 23273:2013',
        'industry:Hydrogen leak detector — Honeywell Sensepoint XCD-FC',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'energy_conversion_transduction',
      protocol: 'Digital-24V',
      mechanism: 'safety_isolation',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'directional',
      notes:
        'Stack contactor / HV-IL chain opens DC output on ground-fault, over-temperature, or leak trip. ' +
        'Insulation monitor checks HV+/HV- to chassis impedance per ISO 6469-3.',
      source_references: [
        'standard:ISO 6469-3:2011 (electrical safety)',
        'industry:Bender IR155-3204 HV insulation monitor',
      ],
    },

    // ── Mechanical ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { mount: 'bolted', connector: 'M10/M12 vibration-isolator brackets' },
      required: true,
      direction: 'mutual',
      notes:
        'Stack + BoP frame mounts to the IP67/IP6K9K module enclosure via vibration isolators. Enclosure ' +
        'rated for engine-bay or external roof-mount placement on heavy trucks; marine variants meet ' +
        'DNV CG-0339 engine-room environmental conditions. Module weight 145-336 kg per skid (corpus).',
      source_references: [
        'corpus:Weight (FCmove-MD/HD/HD+/XD)@fuel_cell_power_module (145 / 240 / 275 / 238 kg)',
        'corpus:HD 90 Mass@fuel_cell_power_module (336 kg)',
        'corpus:IP rating@fuel_cell_power_module (IP67 / IP6K9K)',
        'corpus:Environmental protection@fuel_cell_power_module (IP67 / IP44)',
        'standard:DNV CG-0339 (engine room environmental conditions)',
      ],
    },
    {
      from_class: 'power_distribution',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'panel', connector: 'HV/LV cable gland (IP67-rated)' },
      required: true,
      direction: 'mutual',
      notes:
        'HV DC, LV 12/24 V auxiliary, CAN, and coolant lines all transit the enclosure boundary via ' +
        'IP67-rated cable glands / quick-disconnect fittings to preserve ingress protection.',
      source_references: ['standard:IEC 60529 IP67', 'industry:Amphenol RADSOK HV cable gland'],
    },

    // ── Service ──
    {
      from_class: 'maintenance_serviceability',
      to_class: 'control_compute_communication',
      protocol: 'CAN',
      mechanism: 'can_bus',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      mechanical: { connector: 'OBD-II / Deutsch DT06 diagnostic port' },
      required: false,
      direction: 'mutual',
      notes:
        'Diagnostic CAN port exposes the FCCU J1939 stream + manufacturer-proprietary PGNs for field service. ' +
        'Stack membrane refurbishment interval ~80,000 h (corpus) — between intervals service is mostly ' +
        'BoP filter / coolant replacement.',
      source_references: [
        'corpus:Stack membrane refurbishment interval@fuel_cell_power_module (80000 hours)',
        'corpus:Operational life@fuel_cell_power_module (25000 hours)',
        'industry:Ballard FCmove service manual',
      ],
    },
  ],

  sources_cited: [
    'corpus:fuel_cell_power_module (12 datasheets, 2026-05-18; Ballard, Cummins, Plug Power, PowerCell, Toyota)',
    'standard:ISO 14687:2019 (hydrogen fuel quality grade D)',
    'standard:ISO 23273:2013 (FC vehicle safety)',
    'standard:ISO 6469-2:2009',
    'standard:ISO 6469-3:2011',
    'standard:ISO 6469-4:2015',
    'standard:SAE J2578:2014 (general FC safety)',
    'standard:SAE J2719 (hydrogen fuel quality)',
    'standard:SAE J1939:2013 (CAN control interface)',
    'standard:UN ECE Reg 10 (EMC safety)',
    'standard:DOT-SP 14504 (transport)',
    'standard:DNV CG-0339 (engine room environment)',
    'standard:DNV Type Approval (marine fuel cell)',
    'standard:ABS Marine Approval',
    'standard:Lloyds Register Approval',
    'standard:UN 38.3 (battery transport)',
    'standard:ISO/IATF 16949:2016 (automotive QMS)',
    'standard:UL System Certification',
    'standard:CE',
    'industry:Ballard FCmove-HD / HD+ / MD / XD datasheets',
    'industry:Cummins HyPM datasheet',
    'industry:Plug Power ProGen datasheet',
    'industry:PowerCell MS-100 / S3 datasheet',
    'industry:Toyota TMFCS module spec',
  ],
}

registerClassReferenceGraph(FUEL_CELL_POWER_MODULE)

export { FUEL_CELL_POWER_MODULE }
