/**
 * @file class-reference-graphs/residential-battery-storage.ts — K10 typed graph
 * for RESIDENTIAL wall-mounted all-in-one battery energy storage (Powerwall-class).
 *
 * @description Models a single outdoor-rated wall/floor-mount cabinet integrating
 * the LFP pack + BMS, a hybrid bidirectional inverter with solar MPPT inputs, and
 * the home/grid interface — the Tesla Powerwall 3 / Sungrow SBH / BYD Battery-Box
 * HVS + hybrid class at ~10-20 kWh / ~5-12 kW, 230 V single-phase.
 *
 * WHY THIS GRAPH EXISTS (2026-07-10, Powerwall overnight loop): the
 * bess-utility-scale graph's own scope notes say "Container-scale system, NOT
 * residential ESS (different module set — residential would use `residential_ess`
 * graph when seeded)". Without it, a 14 kWh wall-unit brief inherited the
 * containerised part-set (ISO container, grid step-up transformer, 25 kW HVAC,
 * glycol chiller loop, gas-suppression plant) — every one a wrong-product-class
 * physical impossibility the audits then correctly flagged. This graph is the
 * DATA fix at the source of that part vocabulary.
 *
 * @scope
 *   - ONE master wall cabinet. Expansion packs / multi-unit stacks are a design
 *     OPTION narrated, never a baseline BoM multiplier.
 *   - Forced-air + cold-plate conduction thermal path — NO liquid chiller, NO
 *     glycol loop, NO expansion tank (a sealed wall unit rejects <1 kW).
 *   - Grid-tied at 230 V 1φ 50 Hz DIRECTLY (G98/G99) — NO step-up transformer,
 *     NO MV switchgear, NO ISO container.
 *   - Backup/islanding via a COMPANION gateway (separate product on the SLD);
 *     its interface is in scope, its internals are not.
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const RESIDENTIAL_BATTERY_STORAGE: ProductClassGraph = {
  product_class: 'residential-battery-storage',
  display_name: 'Residential Wall-Mounted Battery Energy Storage (~10-20 kWh all-in-one)',
  scope_notes:
    'Single outdoor-rated wall/floor-mount cabinet: LFP pack + BMS + hybrid inverter ' +
    '(230 V 1φ, integrated solar MPPTs) + forced-air/cold-plate thermal + home/grid ' +
    'interface. NO container, NO MV/step-up transformer, NO glycol chiller loop, NO ' +
    'gas-suppression plant. Backup gateway is a companion product — interface only.',

  nodes: [
    {
      class: 'energy_storage_source',
      role: 'principal',
      required: true,
      display: 'LFP prismatic cell pack + module frames + integrated BMS',
    },
    {
      class: 'energy_conversion_transduction',
      role: 'subsystem',
      required: true,
      display: 'Hybrid bidirectional inverter (DC ↔ 230 V 1φ AC) + integrated solar MPPT inputs',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: true,
      display: 'Pack DC fusing + contactor, PV string input terminals, AC connection unit (single-phase)',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: true,
      display: 'Forced-air ventilation fans + cold-plate/chassis conduction (sealed cabinet, no liquid loop)',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'Energy management controller + Wi-Fi/Ethernet + CAN to BMS + gateway/meter interface',
    },
    {
      class: 'sensing_instrumentation',
      role: 'subsystem',
      required: true,
      display: 'Cell voltage/temperature sensing chain, pack current shunt, ambient sensor',
    },
    {
      class: 'safety_protection',
      role: 'subsystem',
      required: true,
      display: 'DC isolation + pack fuse, AC RCD/SPD provision, over-temperature cutoff, pack vent path',
    },
    {
      class: 'structure_containment',
      role: 'subsystem',
      required: true,
      display: 'Sealed IP55 outdoor enclosure (powder-coated steel/aluminium) + wall bracket / floor plinth',
    },
    {
      class: 'hmi_ergonomics',
      role: 'subsystem',
      required: false,
      display: 'Status LED + app-based HMI (no local touchscreen on the cabinet)',
    },
    {
      class: 'maintenance_serviceability',
      role: 'subsystem',
      required: false,
      display: 'Front service cover + isolator access (installer-serviceable, no walk-in access)',
    },
  ],

  edges: [
    // ── Power path ──
    {
      from_class: 'energy_storage_source',
      to_class: 'power_distribution',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: { voltage_range_v: [280, 600], ac_or_dc: 'DC', current_max_a: 63 },
      mechanical: { connector: 'bolted pack terminals M8', cable_type: 'single-conductor flexible DC cable' },
      required: true,
      direction: 'mutual',
      notes: 'Pack terminals to DC fusing + main contactor. Residential HV DC class (several hundred volts), pack current a few tens of amps — never a 1,500 V utility bus.',
      source_references: ['industry:Tesla Powerwall 3 UK datasheet (13.5 kWh, 11.04 kW)', 'standard:IEC 62619'],
    },
    {
      from_class: 'power_distribution',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: { voltage_range_v: [280, 600], ac_or_dc: 'DC', current_max_a: 63 },
      required: true,
      direction: 'mutual',
      notes: 'Fused/switched pack DC to the hybrid inverter DC link.',
      source_references: ['industry:hybrid residential ESS convention (BYD HVS + hybrid inverter class)'],
    },
    {
      from_class: 'power_distribution',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: { voltage_range_v: [60, 550], ac_or_dc: 'DC', current_max_a: 13 },
      mechanical: { connector: 'MC4 PV connectors', cable_type: 'PV string cable 6 mm²' },
      required: false,
      direction: 'directional',
      notes: 'Solar PV string inputs to the integrated MPPTs (up to ~20 kW STC across 3+ MPPTs on the Powerwall-3 class). Optional: AC-coupled retrofits omit PV strings.',
      source_references: ['industry:Tesla Powerwall 3 UK datasheet (20 kW PV, 3× MPPT class)'],
    },
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'power_distribution',
      protocol: 'physical',
      mechanism: 'ac_busbar',
      electrical: { voltage_range_v: [230, 230], ac_or_dc: 'AC', current_max_a: 48 },
      mechanical: { connector: 'screw terminals', cable_type: '3-core 10 mm² tails' },
      required: true,
      direction: 'mutual',
      notes: 'Inverter AC output to the AC connection unit → consumer unit / generation meter / backup gateway. 230 V 1φ 50 Hz, ≤48 A continuous (11.04 kW) — grid-tied DIRECTLY, no transformer.',
      source_references: ['standard:G99 (full power) / G98 (≤3.68 kW step)', 'standard:BS 7671'],
    },
    // ── Thermal path (air, conduction — the whole point) ──
    {
      from_class: 'energy_storage_source',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'cooling_loop',
      fluid: { medium: 'air', temperature_max_c: 50 },
      required: true,
      direction: 'directional',
      notes: 'Pack heat by conduction to the cold plate/chassis, rejected by forced-air ventilation. Total system rejection <1 kW at residential duty — no liquid loop exists.',
      source_references: ['industry:sealed residential wall-ESS convention (Powerwall/BYD class)'],
    },
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'cooling_loop',
      fluid: { medium: 'air', temperature_max_c: 50 },
      required: true,
      direction: 'directional',
      notes: 'Inverter losses (~2-3% of throughput) to the same forced-air path via heatsink fins.',
      source_references: ['industry:hybrid inverter forced-air convention'],
    },
    // ── Control + sensing ──
    {
      from_class: 'energy_storage_source',
      to_class: 'control_compute_communication',
      protocol: 'CAN',
      mechanism: 'contactor_command',
      electrical: { voltage_range_v: [5, 5], ac_or_dc: 'DC' },
      required: true,
      direction: 'mutual',
      notes: 'BMS to EMS controller: SoC/SoH, cell limits, contactor commands.',
      source_references: ['industry:residential ESS CAN convention', 'standard:IEC 62619'],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'energy_conversion_transduction',
      protocol: 'CAN',
      mechanism: 'contactor_command',
      required: true,
      direction: 'mutual',
      notes: 'EMS to inverter: charge/discharge setpoints, grid-code profile (G98/G99 export steps).',
      source_references: ['standard:G99 Type A settings'],
    },
    {
      from_class: 'sensing_instrumentation',
      to_class: 'control_compute_communication',
      protocol: 'physical',
      mechanism: 'sensor_feedback',
      required: true,
      direction: 'directional',
      notes: 'Cell voltage/temperature chain + pack current shunt + ambient sensor into the BMS/EMS.',
      source_references: ['industry:pack sensing convention'],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'power_distribution',
      protocol: 'RS-485',
      mechanism: 'hmi_data',
      required: false,
      direction: 'mutual',
      notes: 'External interfaces: backup gateway (companion product), generation meter, home Wi-Fi/Ethernet. Modelled at the connection unit boundary.',
      source_references: ['industry:Backup Gateway 2 install manual (companion device)'],
    },
    // ── Safety + structure ──
    {
      from_class: 'safety_protection',
      to_class: 'power_distribution',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      required: true,
      direction: 'mutual',
      notes: 'DC isolator + pack fuse in the DC path; SPD/RCD provision at the AC connection unit per BS 7671.',
      source_references: ['standard:BS 7671', 'standard:UL 9540 (or EN equivalent)'],
    },
    {
      from_class: 'safety_protection',
      to_class: 'energy_storage_source',
      protocol: 'physical',
      mechanism: 'cooling_loop',
      required: true,
      direction: 'directional',
      notes: 'Over-temperature cutoff + pack vent path (thermal-runaway gas route per UL 9540A residential testing) — a vent path, never a gas-suppression plant.',
      source_references: ['standard:UL 9540A', 'standard:NFPA 855 (residential siting)'],
    },
    {
      from_class: 'structure_containment',
      to_class: 'energy_storage_source',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { connector: 'M8 module bolts' },
      required: true,
      direction: 'directional',
      notes: 'Pack modules bolted into the sealed IP55 enclosure; enclosure onto wall bracket / floor plinth (~130 kg unit, 100 mm side / 50 mm top / 300 mm front clearances).',
      source_references: ['industry:Tesla Powerwall 3 install clearances (UK manual)'],
    },
    {
      from_class: 'hmi_ergonomics',
      to_class: 'control_compute_communication',
      protocol: 'physical',
      mechanism: 'hmi_data',
      required: false,
      direction: 'mutual',
      notes: 'Status LED + app-based HMI via the EMS network interface.',
      source_references: ['industry:residential ESS app-HMI convention'],
    },
  ],

  sources_cited: [
    'industry:Tesla Powerwall 3 UK datasheet (13.5 kWh usable, 11.04 kW, 3× MPPT, IP55, ~130 kg)',
    'industry:Tesla Backup Gateway 2 install manual',
    'industry:BYD Battery-Box Premium HVS datasheet',
    'industry:Sungrow SBH / SH-RS hybrid class datasheets',
    'standard:UL 9540',
    'standard:UL 9540A',
    'standard:IEC 62619',
    'standard:G98',
    'standard:G99',
    'standard:BS 7671',
    'standard:NFPA 855',
  ],
}

registerClassReferenceGraph(RESIDENTIAL_BATTERY_STORAGE)

export { RESIDENTIAL_BATTERY_STORAGE }
