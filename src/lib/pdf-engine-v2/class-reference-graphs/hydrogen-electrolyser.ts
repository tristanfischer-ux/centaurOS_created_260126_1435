/**
 * @file class-reference-graphs/hydrogen-electrolyser.ts — K10 typed graph for
 * hydrogen electrolysers (PEM, Alkaline, SOEC).
 *
 * @description Models a containerised / skid-mounted hydrogen electrolyser at
 * the ~1-10 MW scale (Cummins / Hydrogenics HyLYZER, Siemens Silyzer 200/300,
 * ITM Power HGen, Nel A/M-series, Plug Power EX-series, McPhy Augmented McLyzer,
 * Topsoe SOEC, Sunfire-Synlink, Bloom Energy Hydrogen). Composed of an
 * electrolyser stack (PEM, alkaline, or solid-oxide), high-current DC
 * rectifier ("PCS for electrolysers"), water treatment + feed, gas-liquid
 * separation + drying / purification, balance-of-plant pumps, control PLC,
 * safety + leak / ATEX protection, and outdoor enclosure. Water IN at 1-2
 * L/Nm³ H2, AC IN at 11-33 kV MV; H2 OUT at 30-40 bar / 99.99-99.9995% purity.
 *
 * Inverse function of the PEM fuel cell power module: same membrane physics
 * (and indeed the Silyzer / HyLYZER share stack technology with the Ballard /
 * Cummins fuel cell line), driven in the opposite direction.
 *
 * @sources Corpus values from `pretraining_extracted_specs` joined to
 * `pretraining_spec_documents WHERE product_class='hydrogen_electrolyser'`
 * in ~/.forge-truth/forge-truth.db (15 datasheets, very well covered).
 *
 * @corpus-coverage-2026-05-18
 *   - H2 production: 30-2000 kg/h (200-1000+ Nm³/h) — corpus direct.
 *   - DC power consumption at stack: 40-50 kWh/kg — corpus direct.
 *   - System specific consumption: 51-55 kWh/kg (AC including BoP) — corpus.
 *   - Stack power: 1-5 MW per stack; AC power 10.9 MW (system) — corpus.
 *   - Rectifier input voltage: 4.1-30 kV (3-phase), 380/400/480 V LV — corpus.
 *   - Rectifier efficiency: 97% — corpus direct.
 *   - Output (delivery) pressure: 30-40 bar(g) — corpus direct.
 *   - H2 purity: 99.99 - 99.9995% (after drying) — corpus direct.
 *   - Operating temperature (stack): 60-70 °C PEM; 60-90 °C Alkaline; 700-900 °C
 *     SOEC — corpus direct.
 *   - Atmospheric dew point: -65 to -75 °C (dried product) — corpus direct.
 *   - Demin water consumption: 0.8-1.5 L/Nm³ H2; 13 L/kg H2 — corpus direct.
 *   - Cooling water flow: 2500 LPM — corpus direct.
 *   - Ramp rate: 10-37%/min; operating range 5-125% — corpus direct.
 *   - Cold start: <5 min; warm start: <30 s — corpus direct.
 *   - Frequency: 50/60 Hz — corpus direct.
 *   - Footprint: 24-87.9 m² per MW — corpus direct.
 *   - Standards: ISO 22734 (electrolyser compliance), ISO 14687 grade B
 *     (H2 purity), CSA B51 / ASME BPVC (pressure vessels), ASME B31.3
 *     (piping), NFPA 2 / NFPA 497, ATEX 2014/34/EU, IEC 60079-10-1,
 *     IEC 61508 / 61511 (functional safety SIL), Machinery Directive
 *     2006/42/EC, LVD 2014/35/EU, EMC 2014/30/EU, CSA C22.1/C22.2,
 *     ANSI/NFPA 70, CAN/BNQ 1784-000, IEC 60870-5-104 (SCADA), CE — corpus direct.
 *
 * @scope-2026-05-18
 *   - Three chemistries covered: PEM (proton-exchange), Alkaline (KOH),
 *     SOEC (solid-oxide). Same module set; chemistry-specific traits (KOH
 *     handling for alkaline, high-T steam for SOEC) noted as edge variants.
 *   - Containerised / skid-mounted system at 1-10 MW scale.
 *   - Downstream H2 compression to 350/700 bar trailer / refuelling is OUT
 *     of scope (separate compression-train graph).
 *   - Upstream water source (RO / borehole) is OUT of scope — the system
 *     sees demin water at the inlet flange.
 *   - Heat-integration / steam supply for SOEC (140 °C feed gas, corpus)
 *     is modelled as an optional input edge.
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const HYDROGEN_ELECTROLYSER: ProductClassGraph = {
  product_class: 'hydrogen_electrolyser',
  display_name: 'Hydrogen Electrolyser (PEM / Alkaline / SOEC, 1-10 MW skid)',
  scope_notes:
    'Containerised / skid-mounted hydrogen electrolyser at the 1-10 MW scale (Cummins HyLYZER, Siemens ' +
    'Silyzer 200/300, ITM Power HGen, Nel A/M-series, McPhy McLyzer, Topsoe SOEC). PEM + Alkaline + SOEC ' +
    'chemistries share the module set; chemistry-specific traits (KOH for alkaline, 140 °C steam feed for ' +
    'SOEC) are noted in edge variants. Downstream H2 compression to 350/700 bar and upstream water source ' +
    '(RO / borehole) are OUT of scope.',

  nodes: [
    {
      class: 'energy_conversion_transduction',
      role: 'principal',
      required: true,
      display: 'Electrolyser stack — PEM (Nafion + Pt/Ir) OR Alkaline (Ni-mesh + 26% KOH) OR SOEC (YSZ at 700-900 °C)',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: true,
      display: 'MV rectifier (11-33 kV → high-current DC) + LV auxiliary 400/480 VAC distribution + grounding',
    },
    {
      class: 'mass_fluid_transport_process',
      role: 'subsystem',
      required: true,
      display: 'Demin water feed pump + circulation pumps + gas-liquid separator + dryer (PSA / TSA) + KOH circulation (alkaline)',
    },
    {
      class: 'energy_storage_source',
      role: 'subsystem',
      required: true,
      display: 'External demin water inlet + product H2 delivery flange + product O2 vent flange',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: true,
      display: 'Cooling-water loop (2500 LPM) + container HVAC + dry-air purge for hazardous-area ventilation',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'SIL-2 PLC (Siemens S7 / ABB AC500) + IEC 60870-5-104 SCADA gateway + remote monitoring + diagnostics',
    },
    {
      class: 'sensing_instrumentation',
      role: 'sensor',
      required: true,
      display: 'Stack V/I per cell + electrolyte conductivity + H2/O2 cross-contamination + dew point + flow + dP',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'H2 leak (LEL) + ATEX-rated trip valves + SIL-2 PSV/PRV chain + N2 purge + fire / gas / earth fault',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'Skid frame + ATEX zone-classified container shell + bunded electrolyte sump (alkaline)',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: 'Stack lift-out access + manhole inspection + sample-take port + 80,000 h stack-refurbishment access',
    },
  ],

  edges: [
    // ── AC mains in ──
    {
      from_class: 'power_distribution',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_range_v: [4100, 36000],
        ac_or_dc: 'AC',
        ac_phases: 3,
        ac_frequency_hz: 50,
        current_max_a: 8000,
        power_max_w: 10_900_000,
      },
      mechanical: { connector: 'MV switchgear copper busbar', cable_type: 'XLPE MV cable 11-33 kV' },
      required: true,
      direction: 'directional',
      notes:
        'MV transformer-rectifier converts grid MV (11-33 kV in EU, 4.1-34.5 kV NA — corpus) to high-current ' +
        'low-voltage DC for the stack. Rectifier efficiency 97% (corpus). Auxiliary 400 VAC EU / 480 VAC NA at ' +
        '50/60 Hz (corpus) feeds BoP motors, control panel, HVAC. System AC power up to 10.9 MW (corpus).',
      source_references: [
        'corpus:Rectifier input voltage@hydrogen_electrolyser (4.1 to 30 kV, 6 to 36 kV)',
        'corpus:Voltage & Frequency (EU)@hydrogen_electrolyser (11 to 33 kVAC, 400 VAC)',
        'corpus:Voltage & Frequency (USA)@hydrogen_electrolyser (4.1 to 34.5 kVAC, 480 VAC)',
        'corpus:Rectifier efficiency@hydrogen_electrolyser (97 %)',
        'corpus:Rectifier frequency@hydrogen_electrolyser (50/60 Hz)',
        'corpus:AC power consumption@hydrogen_electrolyser (10.9 MW)',
        'corpus:Rectifier power rating@hydrogen_electrolyser (3.2 / 7 MVA)',
        'corpus:Auxiliary installed power@hydrogen_electrolyser (45 / 125 kVA)',
        'standard:ANSI/NFPA 70',
        'standard:CSA C22.1',
      ],
    },

    // ── Water in / hydrogen + oxygen out ──
    {
      from_class: 'energy_storage_source',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: {
        medium: 'process-fluid',
        pressure_max_bar: 5,
        flow_max_lpm: 30,
        temperature_max_c: 40,
        temperature_min_c: 5,
        pipe_dn_mm: 25,
      },
      mechanical: { mount: 'in-line', connector: 'sanitary tri-clamp or SS flange' },
      required: true,
      direction: 'directional',
      notes:
        'Demin water (ASTM D1193 Type II) enters at low pressure for circulation through the stack. Consumption ' +
        '0.8-1.5 L/Nm³ H2 = ~13 L/kg H2 (corpus). Demi-water consumption 1.85 m³/h on a 200 Nm³/h system ' +
        '(corpus). Inlet conductivity must remain <0.1 µS/cm to avoid stack contamination.',
      source_references: [
        'corpus:Demineralized water consumption@hydrogen_electrolyser (0.8 L/Nm3)',
        'corpus:Demi-water consumption@hydrogen_electrolyser (1.85 m³/h)',
        'corpus:Water Consumption@hydrogen_electrolyser (13 L/kg H2)',
        'corpus:Water consumption@hydrogen_electrolyser (1.2 to 1.5 L/Nm3)',
        'standard:ASTM D1193 (water quality)',
      ],
    },
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: {
        medium: 'gas',
        pressure_max_bar: 40,
        flow_max_lpm: 2000,
        temperature_max_c: 90,
        temperature_min_c: 5,
      },
      required: true,
      direction: 'mutual',
      notes:
        'Stack outlet two-phase flow (H2 + entrained water on cathode, O2 + water on anode) routes to gas-liquid ' +
        'separators, then through demister and dryer (PSA / TSA). Operating pressure 30-40 bar(g) on PEM (corpus); ' +
        'alkaline runs lower-pressure (1-30 bar). N2 impurity 12 ppm; O2 impurity 2-100 ppm (corpus). Ramp rate ' +
        '10-37%/min (corpus); operating range 5-125% of nameplate (corpus).',
      source_references: [
        'corpus:Operating pressure@hydrogen_electrolyser (30 bar(g))',
        'corpus:H2 delivery pressure@hydrogen_electrolyser (30 / 40 barg)',
        'corpus:Output pressure@hydrogen_electrolyser (35 bar)',
        'corpus:PEM Electrolysis output pressure@hydrogen_electrolyser (up to 35 bar(g))',
        'corpus:N2 impurity@hydrogen_electrolyser (12 ppm)',
        'corpus:O2 impurity@hydrogen_electrolyser (2 / 100 ppm)',
        'corpus:Ramp rate@hydrogen_electrolyser (10 / 37 %/min)',
        'corpus:Operating range@hydrogen_electrolyser (5-125 %)',
      ],
    },
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'energy_storage_source',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: {
        medium: 'gas',
        pressure_max_bar: 40,
        temperature_max_c: 50,
        pipe_dn_mm: 50,
      },
      mechanical: { mount: 'in-line', connector: 'SS 316 flange + SIL-2 isolation valve' },
      required: true,
      direction: 'directional',
      notes:
        'Dried product H2 delivered at 30-40 barg with dew point -65 to -75 °C (corpus). H2 purity 99.99-99.9995% ' +
        '(corpus) per ISO 14687 grade B (industrial) or grade D (fuel-cell, after PSA). Output piping per ASME ' +
        'B31.3-2016 with SIL-2 isolation valve at module boundary.',
      source_references: [
        'corpus:Hydrogen Output Pressure@hydrogen_electrolyser (40 barg / 580 psig)',
        'corpus:Delivery pressure@hydrogen_electrolyser (30 bar(g))',
        'corpus:H2 purity@hydrogen_electrolyser (99.99 / 99.998 %)',
        'corpus:Hydrogen Purity@hydrogen_electrolyser (99.999 / 99.9995 %)',
        'corpus:Atmospheric Dew point@hydrogen_electrolyser (-75 °C)',
        'corpus:Dew Point@hydrogen_electrolyser (-65 °C)',
        'standard:ISO 14687 Grade B',
        'standard:ASME B31.3-2016 (process piping)',
      ],
    },

    // ── Thermal ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'cooling_loop',
      fluid: {
        medium: 'water-glycol',
        pressure_max_bar: 6,
        flow_max_lpm: 2500,
        temperature_max_c: 90,
        temperature_min_c: 5,
        pipe_dn_mm: 100,
      },
      required: true,
      direction: 'mutual',
      notes:
        'Stack waste heat (15-25% of electrical input for PEM/alkaline at typical efficiency) is removed via a ' +
        'cooling-water loop. Electrolyser cooling water flow 2500 LPM (corpus). PEM stack operating temperature ' +
        '60-70 °C; alkaline 60-90 °C; SOEC 700-900 °C (corpus). Note SOEC HEAT INPUT — high-temperature feed gas ' +
        '>140 °C required (corpus) for SOEC steam electrolysis.',
      source_references: [
        'corpus:Electrolyzer cooling water flow@hydrogen_electrolyser (2500 LPM)',
        'corpus:Operating temperature@hydrogen_electrolyser (60 - 70 °C)',
        'corpus:Operational temperature (Alkaline)@hydrogen_electrolyser (60 - 90 °C)',
        'corpus:Operational temperature (High temperature)@hydrogen_electrolyser (700 - 900 °C)',
        'corpus:Feed gas temperature@hydrogen_electrolyser (> 140 °C)',
        'corpus:Feed gas pressure@hydrogen_electrolyser (> 2.5 bar(g))',
      ],
    },

    // ── Control path ──
    {
      from_class: 'control_compute_communication',
      to_class: 'energy_conversion_transduction',
      protocol: 'Modbus-TCP',
      mechanism: 'modbus_tcp',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      mechanical: { connector: 'RJ45', cable_type: 'Cat 6 shielded' },
      required: true,
      direction: 'mutual',
      notes:
        'SIL-2 PLC sets rectifier DC current setpoint (and thereby stack load) per the SCADA dispatch. ' +
        'IEC 60870-5-104 telemetry to the utility / hydrogen offtaker (corpus). Cold start <5 min, warm start ' +
        '<30 s (corpus). Stack DC power consumption 40-50 kWh/kg H2 (corpus); system specific consumption ' +
        '51-55 kWh/kg AC including BoP (corpus).',
      source_references: [
        'corpus:Start Up Time (Cold)@hydrogen_electrolyser (5 min)',
        'corpus:Start Up Time (Warm)@hydrogen_electrolyser (30 sec)',
        'corpus:DC power consumption at stack@hydrogen_electrolyser (40 - 50 kWh/kg)',
        'corpus:System specific consumption@hydrogen_electrolyser (51 - 55 kWh/kg)',
        'corpus:Ramp speed@hydrogen_electrolyser (10 % PN/s)',
        'standard:IEC 60870-5-104',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'mass_fluid_transport_process',
      protocol: 'PROFINET',
      mechanism: 'modbus_tcp',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'mutual',
      notes:
        'PLC commands feed-water pump speed, electrolyte circulation (alkaline), dryer regeneration cycle (PSA), ' +
        'and N2-purge sequence over PROFINET / Modbus-TCP. Stage 1.7 emissions may report `modbus_tcp` for either ' +
        '— accept both.',
      source_references: [
        'standard:IEC 60870-5-104',
        'industry:Siemens Silyzer SCADA architecture',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'sensing_instrumentation',
      protocol: 'Analog-4-20mA',
      mechanism: 'sensor_feedback',
      electrical: { ac_or_dc: 'DC' },
      required: true,
      direction: 'mutual',
      notes:
        'PLC reads stack V/I per cell, electrolyte conductivity (alkaline), H2-in-O2 / O2-in-H2 cross-contamination ' +
        '(critical safety — H2/O2 mix at >4% LEL is explosive), product dew-point, flow, differential pressures, ' +
        'temperatures. Cross-contamination + dew-point trip the safety chain. Mechanical stack lifetime 10 years ' +
        '(corpus); refurbishment interval 80,000 h (corpus).',
      source_references: [
        'corpus:Mechanical stack lifetime@hydrogen_electrolyser (10 years)',
        'corpus:Stack membrane refurbishment interval@hydrogen_electrolyser (80000 hours)',
        'corpus:Silyzer 200 Design Life Time@hydrogen_electrolyser (> 80,000 h)',
        'industry:H2 cross-contamination monitoring SOP',
      ],
    },

    // ── Safety ──
    {
      from_class: 'safety_protection',
      to_class: 'mass_fluid_transport_process',
      protocol: 'Digital-24V',
      mechanism: 'safety_isolation',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'directional',
      notes:
        'SIL-2 emergency isolation valves close on H2 leak (LEL detect at 20% LEL = 0.8 vol%), O2 cross-contamination ' +
        '(>2-4% H2 in O2 stream), or fire-trip. N2 purge sequence inerts the gas spaces. Per IEC 61508/61511 ' +
        'functional safety; ATEX 2014/34/EU + NFPA 2 (Hydrogen Technologies Code). Hazardous area zoning per ' +
        'IEC 60079-10-1.',
      source_references: [
        'standard:IEC 61508 (functional safety)',
        'standard:IEC 61511 (process functional safety)',
        'standard:ATEX Directive 2014/34/EU',
        'standard:IEC 60079-10-1 (hazardous areas)',
        'standard:NFPA 2 (Hydrogen Technologies Code)',
        'standard:NFPA 497 (flammable liquids/gases)',
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
        'H2 catalytic-bead + electrochemical sensors at container head-space (LEL alarm at 10%, trip at 20%), O2 ' +
        'cell at vent point, gas detectors at electrolyte sump, smoke + heat at electrical cabinets. ATEX-rated ' +
        'sensors for Zone 1/Zone 2 placement.',
      source_references: [
        'standard:CAN/BNQ 1784-000/2007 (hydrogen production)',
        'standard:Machinery Directive 2006/42/EC',
        'industry:Honeywell Sensepoint hydrogen LEL detector',
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
        'Rectifier earth-fault trip + cell-voltage anomaly trip drops stack current to zero within milliseconds. ' +
        'Pressure-relief valves (PSV/PRV) on each gas-liquid separator vent overpressure to a safe area. ' +
        'CSA B51 / ASME BPVC pressure-vessel certification applies.',
      source_references: [
        'standard:CSA B51 2019 (pressure vessels)',
        'standard:ASME Boiler and Pressure Vessel Code 2017',
        'standard:Pressure Equipment Directive 2014/68/EU',
      ],
    },

    // ── Mechanical ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { mount: 'bolted', connector: 'stack skid + tie-rod end plates' },
      required: true,
      direction: 'mutual',
      notes:
        'Stack mounts via skid frame to container floor with seismic bracing. Silyzer 200 weight per skid 17 t ' +
        '(corpus); footprint 24-87.9 m² (corpus). Electrolyzer dimensions 8.4 × 2.3 m (corpus). Net module ' +
        'footprint 24 m²/MW (corpus); installed footprint 41.5-87.9 m²/MW.',
      source_references: [
        'corpus:Silyzer 200 Weight per Skid@hydrogen_electrolyser (17 t)',
        'corpus:Electrolyzer dimensions@hydrogen_electrolyser (8.4 x 2.3 m)',
        'corpus:Installed Footprint@hydrogen_electrolyser (29.3 / 87.9 m²)',
        'corpus:Net module footprint@hydrogen_electrolyser (24 m²/MW)',
        'corpus:Footprint@hydrogen_electrolyser (41.5 m²/MW)',
        'corpus:Total footprint@hydrogen_electrolyser (198 m²)',
        'corpus:Dimension Skid@hydrogen_electrolyser (6,30 x 3,10 x 3,00 m)',
      ],
    },
    {
      from_class: 'power_distribution',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'panel', connector: 'IP54 MV cable gland' },
      required: true,
      direction: 'mutual',
      notes:
        'MV cable transit into the rectifier room is gland-sealed per IEC 60529 IP54. Rectifier dimensions ' +
        '4.5 × 2.5 m (corpus); typically in a separate non-classified compartment from the gas-handling skid ' +
        'to keep electrical equipment outside ATEX zone.',
      source_references: [
        'corpus:Rectifier dimensions@hydrogen_electrolyser (4.5 x 2.5 m)',
        'standard:Low Voltage Directive 2014/35/EU',
        'standard:Electro-Magnetic Compatibility 2014/30/EU',
      ],
    },

    // ── Optional: SOEC steam input ──
    {
      from_class: 'environmental_interface',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: {
        medium: 'process-fluid',
        pressure_max_bar: 3,
        temperature_max_c: 900,
        temperature_min_c: 140,
        pipe_dn_mm: 80,
      },
      mechanical: { mount: 'in-line', connector: 'high-T flange + thermal expansion bellows' },
      required: false,
      direction: 'directional',
      notes:
        'OPTIONAL — SOEC steam supply. SOEC (solid-oxide) systems require steam at 140 °C+ (corpus) and 2.5+ ' +
        'bar(g) (corpus) at the cathode; stack operates at 700-900 °C (corpus). Heat integration with an external ' +
        'process heat source (industrial waste heat, biomass, nuclear) is the canonical SOEC value proposition. ' +
        'PEM and alkaline electrolysers do not have this edge.',
      source_references: [
        'corpus:Feed gas temperature@hydrogen_electrolyser (> 140 °C)',
        'corpus:Feed gas pressure@hydrogen_electrolyser (> 2.5 bar(g))',
        'corpus:Operational temperature (High temperature)@hydrogen_electrolyser (700 - 900 °C)',
        'industry:Topsoe SOEC + Sunfire-Synlink integration',
      ],
    },

    // ── Service ──
    {
      from_class: 'maintenance_serviceability',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'panel', connector: 'stack lift-out access hatch + sample port' },
      required: false,
      direction: 'mutual',
      notes:
        'Stack-refurbishment interval 80,000 h (corpus) — at that point the stack is lifted out via overhead crane ' +
        'access for membrane / electrode reconditioning. Routine inspection: water-quality sample, electrolyte ' +
        'sample (alkaline), and bolt-torque check on tie-rod end plates.',
      source_references: [
        'corpus:Stack membrane refurbishment interval@hydrogen_electrolyser (80000 hours)',
        'corpus:Silyzer 200 Design Life Time@hydrogen_electrolyser (> 80,000 h)',
        'industry:Cummins HyLYZER stack refurbishment SOP',
      ],
    },
  ],

  sources_cited: [
    'corpus:hydrogen_electrolyser (15 datasheets, 2026-05-18; Siemens, Cummins, ITM Power, Nel, McPhy, Topsoe)',
    'standard:ISO 22734 (hydrogen generators by water electrolysis)',
    'standard:ISO 14687 Grade B (hydrogen purity)',
    'standard:CSA B51 2019 (pressure vessels)',
    'standard:ASME Boiler and Pressure Vessel Code 2017',
    'standard:ASME B31.3-2016 (process piping)',
    'standard:ASTM D1193 (water quality)',
    'standard:NFPA 2 (Hydrogen Technologies Code)',
    'standard:NFPA 497 (flammable liquids/gases)',
    'standard:ATEX Directive 2014/34/EU',
    'standard:IEC 60079-10-1 (hazardous areas)',
    'standard:IEC 61508 (functional safety)',
    'standard:IEC 61511 (process functional safety)',
    'standard:IEC 60870-5-104 (SCADA telemetry)',
    'standard:Machinery Directive 2006/42/EC',
    'standard:Low Voltage Directive 2014/35/EU',
    'standard:EMC Directive 2014/30/EU',
    'standard:Pressure Equipment Directive 2014/68/EU',
    'standard:CSA C22.1 / C22.2 (electrical)',
    'standard:ANSI/NFPA 70 (NEC)',
    'standard:CAN/BNQ 1784-000/2007',
    'standard:CE',
    'industry:Siemens Silyzer 200 / 300 datasheet',
    'industry:Cummins HyLYZER-200 / 250 / 400 / 500 / 1000 datasheet',
    'industry:ITM Power HGen / Trident datasheet',
    'industry:Nel A-series / M-series datasheet',
    'industry:McPhy Augmented McLyzer datasheet',
    'industry:Topsoe SOEC + Sunfire-Synlink datasheet',
  ],
}

registerClassReferenceGraph(HYDROGEN_ELECTROLYSER)

export { HYDROGEN_ELECTROLYSER }
