/**
 * @file class-reference-graphs/vertical-farm.ts — K10 typed graph for
 * containerised vertical farms (leafy greens, 50-200 m² growing area).
 *
 * @description Models a containerised vertical farm — 40ft Hi-Cube ISO
 * container OR purpose-built insulated room — for indoor leafy greens
 * production. 8-12 mobile growing trolleys with onboard horticultural
 * LEDs. Separate fertigation skid (often in adjacent 20ft container).
 * DX HVAC + dehumidification for psychrometric control. CO2 enrichment.
 * Iter-9 Step 5 addition (Tristan 2026-05-20) — chain previously logged
 * "K10 shadow: NO_GRAPH for vertical_farm" because this graph didn't exist.
 *
 * @suppliers Reference architectures from GrowUp Urban Farms / Babylon
 * Micro-Farms (containerised retrofits), Plenty / AeroFarms (warehouse-
 * scale), Vertical Future / Infarm / LettUs Grow (modular UK + EU).
 *
 * @scope-2026-05-20
 *   - Containerised leafy greens (lettuce, basil, microgreens). Not
 *     vine crops (tomato, cucumber) which have different rack /
 *     irrigation requirements.
 *   - DC LED lighting (full-spectrum red+blue+far-red). Pulse-width-
 *     modulated drivers.
 *   - Hydroponic NFT or DWC trays — soilless. Aeroponics is a sibling
 *     graph variant.
 *   - DX cooling (refrigerant: R454B A2L) with electric reheat for
 *     psychrometric humidity control. Chilled-water variant exists for
 *     warehouse-scale.
 *   - CO2 enrichment from compressed gas cylinders. Some larger
 *     installations use boiler-flue scrubbed CO2 — different feed module.
 *
 * @architectural-purpose The principal energy-conversion module is the
 * LED array (photons to plant biomass). HVAC + fertigation are coupled
 * via the psychrometric and water-balance loops. Safety is dominated by
 * CO2 asphyxiation risk + electrical isolation in high-humidity environment.
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const VERTICAL_FARM: ProductClassGraph = {
  product_class: 'vertical_farm',
  display_name: 'Containerised Vertical Farm (leafy greens, 50-200 m² growing area)',
  scope_notes:
    '40ft / 20ft / room-scale containerised hydroponic vertical farm for leafy greens (lettuce, basil, ' +
    'microgreens). Mobile growing trolleys with onboard horticultural LEDs (R+B+FR full-spectrum). ' +
    'Separate fertigation skid (RO + nutrient A/B + pH control). DX HVAC + electric reheat for ' +
    'psychrometric humidity control (R454B A2L refrigerant). CO2 enrichment from cylinders. ' +
    'Excludes vine crops, aeroponics, warehouse-scale chilled-water HVAC.',

  nodes: [
    {
      class: 'energy_conversion_transduction',
      role: 'principal',
      required: true,
      display: 'Horticultural LED array (full-spectrum R+B+FR), drivers, reflectors',
    },
    {
      class: 'environmental_interface',
      role: 'principal',
      required: true,
      display: 'DX HVAC: cooling coil + electric reheat coil + condenser + dehumidification (R454B)',
    },
    {
      class: 'mass_fluid_transport_process',
      role: 'principal',
      required: true,
      display: 'Fertigation: RO + nutrient A/B dosing + pH up/down + recirculation pump + manifolds + condensate recovery + CO2 enrichment',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'Insulated container shell (ISO 40ft Hi-Cube or 20ft + PIR sandwich panels) + mobile trolley frames with rails + threshold ramps',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: true,
      display: '400V 3-phase TN-S supply + MCBs + RCDs + SPDs + trolley flexible harness (Conductix-Wampfler cable reels) + EMC grounding',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'Industrial PLC (Siemens / Allen-Bradley) + I/O modules + Modbus TCP + 24VDC UPS + SD logging for HACCP / BRCGS',
    },
    {
      class: 'sensing_instrumentation',
      role: 'subsystem',
      required: true,
      display: 'Climate: temperature, RH, PAR, CO2 NDIR, leaf-wetness. Water: pH, EC, DO, flow, temperature.',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'E-stops + SIL3/PLe safety relay + CO2 occupancy alarm (1500 ppm) + smoke/heat detectors + floor leak sensors + CO2 fire extinguishers',
    },
    {
      class: 'actuation_kinematics',
      role: 'subsystem',
      required: true,
      display: 'AHU EC plug fan + circulation pumps + nutrient dosing peristaltic pumps + door interlocks + trolley castors',
    },
    {
      class: 'hmi_ergonomics',
      role: 'subsystem',
      required: false,
      display: 'Operator touchscreen HMI (Siemens / Pro-face) flush-mounted in fertigation electrical panel',
    },
    {
      class: 'maintenance_serviceability',
      role: 'subsystem',
      required: false,
      display: 'Filter consumables (sediment, carbon, big-blue housings) + service access doors + lifting points',
    },
  ],

  edges: [
    // ── LED lighting power feed ──
    {
      from_class: 'power_distribution',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_nominal_v: 48,
        voltage_range_v: [24, 60],
        ac_or_dc: 'DC',
        current_max_a: 6.7,
        power_max_w: 320,
      },
      required: true,
      direction: 'directional',
      notes: '400V 3-phase grid → trolley flexible harness (16A 230V via spring-retractable reels) → constant-voltage LED drivers (Mean Well HLG/CSP class) → DC bus 24-60V to LED panels. Total LED installed power for 100m² ≈ 20-30 kW (200-300 W/m² for leafy greens).',
      source_references: [
        'industry:Osram PHYTOVYNE / Samsung LM301H horticultural LED specs',
        'industry:Mean Well HLG-320H / CSP-3000 driver datasheets',
        'industry:Conductix-Wampfler 050000 series spring cable reels',
      ],
    },
    // ── LED mounted on trolley structure ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: {
        connector: 'aluminium mounting brackets + adjustable hanging gear (Gripple HF Express)',
      },
      required: true,
      direction: 'directional',
      notes: 'LED panels mount onto trolley overhead rails at 200-400 mm above canopy. 5 tiers per trolley × 8 trolleys = 40 LED panel positions for a 100 m² VF.',
    },
    // ── HVAC envelope + structure ──
    {
      from_class: 'environmental_interface',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      required: true,
      direction: 'directional',
      notes: 'AHU + condenser unit + ductwork mount on container roof or service vestibule. PIR sandwich panels (Kingspan KS1000RW 80mm) form the thermal envelope. Door frames thermally broken to avoid cold-spot condensation.',
    },
    // ── HVAC power feed ──
    {
      from_class: 'power_distribution',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'ac_busbar',
      electrical: {
        voltage_nominal_v: 400,
        ac_or_dc: 'AC',
        current_max_a: 32,
        power_max_w: 22000,
      },
      required: true,
      direction: 'directional',
      notes: '3-phase 400V feed to DX compressor (e.g. Copeland ZR72KC for 18 kW cooling), condenser fans, AHU EC plug fan via VFD, electric reheat coil. Type C MCBs for motor loads; Type B for resistive heaters.',
      source_references: [
        'industry:Copeland ZR/ZP scroll compressor datasheets (BTU/hr × 1000 model suffix)',
        'industry:ebm-papst RadiPac centrifugal plug fan datasheets',
        'standard:BS EN 60898-1 MCB curves',
      ],
    },
    // ── HVAC condensate recovery loop ──
    {
      from_class: 'environmental_interface',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      mechanical: {
        connector: 'condensate drain pan + P-trap (McAlpine V33M) + condensate recovery pump (Grundfos CR 1-2)',
      },
      required: true,
      direction: 'directional',
      notes: 'AHU condensate (transpired moisture, 8-12 kg/h at 100m² leafy greens at 75% RH) flows by gravity to a drain pan; UV mini-steriliser sanitises; condensate recovery pump returns 100-150 L/day to the fertigation tank. Closed-loop water efficiency.',
    },
    // ── Fertigation power feed ──
    {
      from_class: 'power_distribution',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'ac_busbar',
      electrical: {
        voltage_nominal_v: 230,
        ac_or_dc: 'AC',
        current_max_a: 10,
        power_max_w: 2000,
      },
      required: true,
      direction: 'directional',
      notes: 'Single-phase 230V feeds for recirculation pump (1.5 kW Grundfos CR-class — NOT MAGNA3 circulator), nutrient dosing peristaltic pumps, tank agitator, UV steriliser, condensate recovery pump.',
    },
    // ── Fertigation manifolds along trolley rails ──
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      mechanical: {
        connector: 'NFT channels (HydroGarden NFT-1200) + irrigation manifolds + WRAS-approved dual-check valves',
      },
      required: true,
      direction: 'directional',
      notes: 'Class C uPVC fertigation pipework runs along trolley overhead rails to NFT grow trays. WRAS-approved dual-check valves protect potable supply. 50L expansion vessel absorbs pump start-stop hydraulic shock.',
    },
    // ── Climate + water-quality sensing to PLC ──
    {
      from_class: 'sensing_instrumentation',
      to_class: 'control_compute_communication',
      protocol: 'digital',
      mechanism: 'modbus_tcp',
      required: true,
      direction: 'directional',
      notes: 'Sensirion SCD41 NDIR CO2 + SHT45 temp/RH + Apogee SQ-520 PAR + Bluelab EC/pH probes feed PLC via Modbus TCP. PLC polls < 50 ms for deterministic control.',
    },
    // ── PLC drives LED dimming + HVAC + dosing ──
    {
      from_class: 'control_compute_communication',
      to_class: 'energy_conversion_transduction',
      protocol: 'digital',
      mechanism: 'contactor_command',
      required: true,
      direction: 'directional',
      notes: 'PLC drives LED PWM dimming (0-10V analog OR DALI), AHU EC fan VFD frequency setpoint, EC supply fan, electric reheat SSR. Modulation protocol named in detail.',
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'mass_fluid_transport_process',
      protocol: 'digital',
      mechanism: 'contactor_command',
      required: true,
      direction: 'directional',
      notes: 'PLC drives peristaltic dosing pumps (Tekna EVO step/dir), Burkert CO2 solenoid valve (24VDC on/off), recirculation pump VFD, UV steriliser on/off.',
    },
    // ── Safety chain ──
    {
      from_class: 'safety_protection',
      to_class: 'sensing_instrumentation',
      protocol: 'digital',
      mechanism: 'alarm_interlock',
      required: true,
      direction: 'directional',
      notes: 'CO2 over-concentration sensor (NDIR @ 1500 ppm alarm, 3000 ppm cutoff) + door interlock switches + floor leak sensors feed the safety relay. SIL3/PLe Pilz PNOZ S4 hard-wired chain.',
    },
    {
      from_class: 'safety_protection',
      to_class: 'power_distribution',
      protocol: 'physical',
      mechanism: 'safety_isolation',
      required: true,
      direction: 'directional',
      notes: 'E-stop chain drives main contactor (Eaton DILM25-10 25A 3-pole). On trip: isolates LED drivers, HVAC, fertigation pumps. PLC sees the trip via signal interlock. Compliance: MD 2006/42/EC + BS EN ISO 13849-1 PLe.',
    },
    {
      from_class: 'safety_protection',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'safety_isolation',
      required: true,
      direction: 'directional',
      notes: 'Door interlock pauses CO2 solenoid injection when door opens (operator safety — CO2 asphyxiation risk at >1.5% concentration).',
    },
    // ── HMI ──
    {
      from_class: 'hmi_ergonomics',
      to_class: 'control_compute_communication',
      protocol: 'digital',
      mechanism: 'modbus_tcp',
      required: false,
      direction: 'mutual',
      notes: 'Touchscreen HMI (Siemens 6AV2128 / Pro-face) flush-mounted on fertigation electrical panel. Allows photoperiod tweak, CO2 setpoint adjustment, alarm acknowledgement, food-safety log review without external laptop.',
    },
  ],
}

registerClassReferenceGraph(VERTICAL_FARM)
