/**
 * @file class-reference-graphs/fertigation-water-recycling.ts — K10 typed
 * graph for a greenhouse-scale IRRIGATION / FERTIGATION WATER TREATMENT &
 * RECYCLING plant (RO makeup + pump-unit distribution + drainwater
 * recovery loop). Registers under `product_class: 'water_treatment'` —
 * the SAME slug `product-classifier.ts`'s `DECLARED_CLASS_SIGNATURES`
 * table already routes a Codema-like water/fertigation brief to (added
 * 2026-06-25, beats the `vertical_farm` keyword rule on purpose) and the
 * SAME slug `scripts/lib/engineering-contract.ts::registerArchetype
 * ('water_treatment', …)` already quantity-drives. This file adds the
 * missing K10 CONNECTIVITY layer for that existing archetype — it does
 * NOT introduce a new product class or touch the classifier/contract.
 *
 * @rationale 2026-07-07 (Sam Green SME review of the real Codema Fischer
 * Farms "Farm 2" system + the universal recirculation design-basis memo).
 * `vertical-farm.ts` is the WRONG calibration target for this scope — it
 * is a SEALED-CONTAINER farm with DX HVAC `required:true` + CO2
 * enrichment, which is exactly the "orphan HVAC" Sam flagged ("What is
 * the HVAC required for? … The real WTR P&ID has no HVAC"). This graph
 * models the REAL Codema system instead: a recirculating fertigation
 * network with NO HVAC, NO CO2 enrichment, NO grow-lighting — those are
 * out of scope (supplied by others; see `water_treatment` engineering
 * contract `shared_quantities.scope_exclusions_desc`).
 *
 * @the-recovery-loop (the load-bearing content of this file — design-basis
 * §5 "three structural nodes": purge, conditioning, makeup). Modelled at
 * K10's MODULE granularity (12-node UniversalModule vocabulary), the loop
 * is a genuine CYCLE across three nodes, not a line:
 *
 *   energy_storage_source (RO-makeup cleanwater reservoir, 91 m³)
 *     → mass_fluid_transport_process (3 pump units + hand-watering unit,
 *       each with A/B fertilizer + acid + H2O2 dosing)
 *     → structure_containment (6L roller racking pressure+drain per tier
 *       → underground concrete drainpits, 5,000 L ×3 — the physical
 *       loop-closure point)
 *     → mass_fluid_transport_process (cloth/paperbelt filter + oxygen
 *       dosing — the CONDITIONING node, design-basis §5 node 2)
 *     → energy_storage_source (drainwater reservoirs, 91 m³ + 40 m³)
 *     → mass_fluid_transport_process (SAME pump units) — closes the loop.
 *
 * RO makeup (edge 1) is sized to LOSSES only (~11 m³/h city water into a
 * 225 m³/h pump-unit system — a ~20:1 makeup:circulation ratio) — the
 * design-basis §5 sizing invariant this graph exists to calibrate ("Q_makeup
 * = Q_loss + Q_purge … makeup flow ≠ circulation flow when a loop exists").
 * The PURGE (accumulation guard, design-basis §2/§7) is the RO concentrate/
 * reject stream — it is explicitly NOT returned to the loop (see edge 1
 * notes + `safety_protection` edge notes); this is what stops the loop
 * accumulating salts/pathogens to infinity.
 *
 * @scope-fidelity-to-sam-greens-critique
 *   - NO `environmental_interface` node (no HVAC) — critique #5 (HVAC
 *     scope hallucination).
 *   - `structure_containment` is `required:true` and explicitly carries
 *     the underground drainpits + racking drain interface — critique #3
 *     (civils cost must follow physical scope: drainpits imply civils).
 *   - The recovery train sits AFTER the drainpits, never before RO —
 *     critique #2 (Sam H5: "RO water feeds into cloth filter which
 *     doesn't make sense as it's clean already… filters/disinfection
 *     should be after drain pits").
 *   - `actuation_kinematics` carries the N+1 backup-pump changeover as an
 *     explicit, labelled redundancy decision — critique #8 ("double
 *     capacity — why?").
 *
 * @source_references Real Fischer Farms "Farm 2" drawings (via Sam Green,
 * the SME who designed the system and commissioned Codema): P&ID
 * SO21101551-100d, WTR layout SO21101551-200/201, 6L racking detail
 * SO21101551-204. Price anchor: Sam Green — "The original Codema quote
 * was 2×90 m³/h + 1×45 m³/h pump units with RO for ~€1.1m." SME review
 * captured 2026-07-07 in `~/Downloads/handovers/2026-07-07-SAM-GREEN-
 * SME-review-Codema-analysis.md`; universal recirculation design basis
 * in the sibling handover `2026-07-07-UNIVERSAL-recirculation-resource-
 * recovery-design-basis.md`.
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const FERTIGATION_WATER_RECYCLING: ProductClassGraph = {
  // Deliberately the SAME slug as the existing `water_treatment` archetype
  // (product-classifier.ts DECLARED_CLASS_SIGNATURES + engineering-contract.ts
  // registerArchetype) — this graph is the K10 connectivity layer for that
  // archetype, not a competing/second class.
  product_class: 'water_treatment',
  display_name: 'Irrigation / Fertigation Water Treatment & Recycling Plant (greenhouse-scale, recirculating)',
  scope_notes:
    'Greenhouse-scale water-handling, purification, fertigation and ebb/flow irrigation RECIRCULATING ' +
    'network — the Codema Fischer Farms "Farm 2" reference: RO makeup (~11 m³/h city water, sized to ' +
    'LOSSES only) → cleanwater reservoir (91 m³) → 3 pump units (2×90 m³/h + 1×45 m³/h nursery, each ' +
    'with an N+1 backup pump) + a hand-watering unit (25 m³/h) → per-pump-unit fertilizer A/B + acid + ' +
    'H2O2 dosing → pressurised delivery to 6L roller racking (7-tier, pressure supply + drain return per ' +
    'tier) → underground concrete drainpits (5,000 L ×3) → cloth/paperbelt filter + oxygen dosing (the ' +
    'recovery conditioning stage) → drainwater reservoirs (91 m³ + 40 m³) → back into the SAME pump ' +
    'units. Excludes HVAC, CO2 enrichment, grow-lighting and the building/racking framework/civils cost ' +
    '(all supplied by others / out of scope per the `water_treatment` engineering contract) — this graph ' +
    'models drainpits + racking drain interface as REQUIRED nodes anyway because the recovery loop ' +
    'cannot physically close without them (Sam Green civils-cost-vs-drainpits inconsistency, critique #3).',

  nodes: [
    {
      class: 'energy_storage_source',
      role: 'principal',
      required: true,
      display: 'Water buffer reservoirs: RO-makeup cleanwater reservoir (Ø5.46×3.88m, 91 m³) + drainwater recovery reservoirs (91 m³ + 40 m³) — the recirculating loop\'s source/sink buffer',
    },
    {
      class: 'mass_fluid_transport_process',
      role: 'principal',
      required: true,
      display: 'RO makeup train (HORTI PURE RO7-3LP2P, ~8 m³/h permeate @ 75% recovery) + 3 pump units (2×90 m³/h + 1×45 m³/h nursery, each N+1 backup) + hand-watering unit (25 m³/h) + per-pump-unit fertilizer A/B + acid + H2O2 dosing + drainwater recovery train (cloth/paperbelt filter + oxygen dosing)',
    },
    {
      class: 'structure_containment',
      role: 'principal',
      required: true,
      display: '6L roller racking (7-tier, 5100mm frame, 750mm level pitch — pressure supply + drain return pipe per tier) + underground concrete drainpits (5,000 L ×3) — the loop\'s physical closure point; civils scope tracks the drainpits (not a £0/£4k placeholder)',
    },
    {
      class: 'sensing_instrumentation',
      role: 'subsystem',
      required: true,
      display: 'EC / pH / DO / level / flow instrumentation on reservoirs, pump units and the dosing loop',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'Fertigation / irrigation process controller (Hoogendoorn-class) — pump-unit sequencing, dosing setpoints, ebb/flow valve scheduling',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: true,
      display: '400V 3-phase feeds to the 3 pump units (23 kW / 38.3 kW / 8.5 kW), RO skid, dosing pumps and recovery train',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'WRAS/backflow prevention on RO makeup + COSHH containment for acid/H2O2 dosing + RO-concentrate purge (never returned to the loop — the accumulation guard) + pump-unit N+1 failover interlock',
    },
    {
      class: 'actuation_kinematics',
      role: 'subsystem',
      required: true,
      display: 'Electrically-actuated ebb/flow distribution valves (200 off, ~30 containers per valve zone) + dosing-pump actuation + N+1 backup-pump changeover',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: 'Cloth/paperbelt filter media change, drainpit access covers, pump-unit service clearances (Codema density benchmark: 3 systems fit in ~¼ the area a sparse layout uses)',
    },
    {
      class: 'hmi_ergonomics',
      role: 'subsystem',
      required: false,
      display: 'Operator touchscreen HMI for pump-unit status, dosing setpoints and alarm acknowledgement',
    },
  ],

  edges: [
    // ── EDGE 1 — RO makeup (sized to LOSSES, not full circulation) ──
    // The calibration edge for the design-basis §5 sizing invariant: Q_makeup
    // = Q_loss + Q_purge, NOT Q_sys. ~11 m³/h city-water makeup into a
    // 225 m³/h (90+90+45) pump-unit system is a ~20:1 makeup:circulation
    // ratio. The RO CONCENTRATE/REJECT stream is the plant's purge — it is
    // NOT returned to the loop (see safety_protection edge below) — without
    // it the loop would accumulate salts/pathogens to infinity (design-basis
    // §2 naive-recirculating trap).
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'energy_storage_source',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: { flow_max_lpm: 183, medium: 'process-fluid', pipe_dn_mm: 63 },
      required: true,
      direction: 'directional',
      notes: 'RO makeup train (~11 m³/h city water feed, ~8 m³/h permeate @ 75% recovery) fills the cleanwater reservoir. Sized to LOSSES ONLY, not the ~225 m³/h full pump-unit circulation rate — the universal recirculation makeup-sizing invariant. RO concentrate/reject (the purge) is disposed, never recycled.',
      source_references: [
        'industry:Codema/Fischer Farms P&ID SO21101551-100d — RO makeup train',
        'industry:Sam Green SME review 2026-07-07 — Exec J30 "RO capacity for 6,000 containers sounds low" (resolved: RO is makeup-only, not irrigation-rate)',
      ],
    },
    // ── EDGE 2 — cleanwater reservoir feeds the pump units ──
    {
      from_class: 'energy_storage_source',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: { flow_max_lpm: 3750, medium: 'process-fluid', pipe_dn_mm: 150 },
      required: true,
      direction: 'directional',
      notes: 'Cleanwater reservoir (91 m³) feeds pump unit 1 (90 m³/h → tunnels 4-10), pump unit 2 (90 m³/h → tunnels 11-17), pump unit nursery (45 m³/h), and the hand-watering unit (25 m³/h). Each pump unit has its own fertilizer A/B (100L + 600L) + acid (100L) + H2O2 (100L) dosing injected into the pressurised loop.',
      source_references: ['industry:Codema/Fischer Farms P&ID SO21101551-100d — pump units 1/2/Nursery + hand-watering unit'],
    },
    // ── EDGE 3 — pressurised delivery to the racking (where the loop physically closes) ──
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      mechanical: { connector: '6L roller racking pressure (supply) pipe per tier' },
      required: true,
      direction: 'directional',
      notes: 'Pressurised, fertigated supply main to the 6L roller racking (7-tier, 5100mm frame, containers ctc 1295mm) — each level has its OWN pressure (supply) pipe connecting to the corridor main. This is the delivery half of the tier-level supply+drain pair Sam Green identified as missing from the engine\'s output.',
      source_references: ['industry:Codema/Fischer Farms 6L racking detail SO21101551-204'],
    },
    // ── EDGE 4 — racking drain / drainpits → recovery conditioning (the CONDITIONING node) ──
    // Design-basis §5 node 2 (conditioning): filter + oxygen dosing restores
    // the recovered stream to a state fit to re-enter the loop. Deliberately
    // placed AFTER the drainpits, never before RO (Sam Green H5 critique).
    {
      from_class: 'structure_containment',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: { medium: 'process-fluid', pipe_dn_mm: 150 },
      required: true,
      direction: 'directional',
      notes: 'Each racking tier\'s drain (return) pipe carries tunnel drainwater by gravity to underground concrete drainpits (5,000 L ×3, one per cultivation room). Submersible pumps lift the drainwater through cloth/paperbelt filtration + oxygen dosing — the RECOVERY CONDITIONING stage. Filters/disinfection sit AFTER the drainpits (Sam Green H5: "filters and disinfection should be after drain pits", NOT before RO, which is already clean).',
      source_references: [
        'industry:Codema/Fischer Farms P&ID SO21101551-100d — drainpits + cloth/paperbelt filter + O2 dosing',
        'industry:Sam Green SME review 2026-07-07 — P&ID H5',
      ],
    },
    // ── EDGE 5 — conditioned recovered water fills the drainwater reservoirs ──
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'energy_storage_source',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: { medium: 'process-fluid', pipe_dn_mm: 150 },
      required: true,
      direction: 'directional',
      notes: 'Filtered + oxygen-dosed recovered drainwater fills the drainwater reservoirs (91 m³ + 40 m³), ready for re-use — the conditioning-node output feeding the loop\'s recovery-side buffer.',
      source_references: ['industry:Codema/Fischer Farms P&ID SO21101551-100d — drainwater reservoirs'],
    },
    // ── EDGE 6 — drainwater reservoirs re-enter the SAME pump units — CLOSES THE LOOP ──
    // Together with edges 2-5 this makes energy_storage_source ↔
    // mass_fluid_transport_process ↔ structure_containment a genuine CYCLE,
    // not a line — the calibration target for the universal recirculation
    // pass (design-basis §1: "an engineered system should internally match
    // its sinks to its sources").
    {
      from_class: 'energy_storage_source',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: { flow_max_lpm: 3750, medium: 'process-fluid', pipe_dn_mm: 150 },
      required: true,
      direction: 'directional',
      notes: 'Recovered drainwater re-enters the SAME pump units alongside RO makeup — this edge CLOSES the recirculation loop. Combined with edges 2, 3, 4 and 5, the graph traces a genuine cycle (reservoirs → pump units → racking → drainpits → recovery train → reservoirs → pump units …), matching the real Codema P&ID (Sam Green: "a recirculating network, not a line").',
      source_references: [
        'industry:Codema/Fischer Farms P&ID SO21101551-100d — full recirculating network',
        'industry:Sam Green SME review 2026-07-07 — BFD H3 "Process is not usually this straight a line. With flow only going one way at all times?"',
      ],
    },
    // ── Electrical, control, instrumentation, safety (module-level, standard K10 pattern) ──
    {
      from_class: 'power_distribution',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'ac_busbar',
      electrical: { voltage_nominal_v: 400, ac_or_dc: 'AC', ac_phases: 3, power_max_w: 38300 },
      required: true,
      direction: 'directional',
      notes: '400V 3-phase feeds to the 3 pump units (23 kW / 38.3 kW / 8.5 kW per Codema WTR layout SO21101551-200/201), RO skid, dosing pumps and the recovery train.',
      source_references: ['industry:Codema/Fischer Farms WTR layout SO21101551-200/201 — per-unit electrical ratings'],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'mass_fluid_transport_process',
      protocol: 'digital',
      mechanism: 'contactor_command',
      required: true,
      direction: 'directional',
      notes: 'Fertigation controller drives pump-unit start/stop sequencing, A/B fertilizer + acid + H2O2 dosing setpoints (EC/pH closed-loop), and RO permeate/reject valving.',
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'actuation_kinematics',
      protocol: 'digital',
      mechanism: 'contactor_command',
      required: true,
      direction: 'directional',
      notes: 'Ebb/flow distribution valve scheduling (200 electrically-actuated valves, ~30 containers per zone) + N+1 backup-pump changeover command on pump-unit failure/duty rotation.',
    },
    {
      from_class: 'sensing_instrumentation',
      to_class: 'control_compute_communication',
      protocol: 'Modbus-TCP',
      mechanism: 'modbus_tcp',
      required: true,
      direction: 'directional',
      notes: 'EC / pH / DO / level / flow instrumentation on reservoirs, pump units and the dosing loop reports to the fertigation controller.',
    },
    {
      from_class: 'safety_protection',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'safety_isolation',
      required: true,
      direction: 'directional',
      notes: 'WRAS-approved backflow/dual-check prevention protects the RO makeup from the recirculating loop; COSHH containment (bunding, anti-siphon, eyewash) for acid + H2O2 dosing; RO concentrate/reject is disposed, not recycled (the purge — prevents salt/pathogen accumulation in the closed loop, design-basis §2/§7 accumulation-trap counter-rule).',
    },
    {
      from_class: 'safety_protection',
      to_class: 'power_distribution',
      protocol: 'physical',
      mechanism: 'safety_isolation',
      required: true,
      direction: 'directional',
      notes: 'Pump-unit isolation/E-stop chain; N+1 backup pump provides failover WITHOUT a safety trip on single-pump failure (the redundancy is throughput/availability, not a safety interlock) — an explicit, labelled design choice (Sam Green critique #8: "double capacity — why?").',
    },
    {
      from_class: 'actuation_kinematics',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      mechanical: { connector: 'electrically-actuated 2.5-inch ebb/flow zone valve (DN65)' },
      required: true,
      direction: 'directional',
      notes: 'Actuated ebb/flow distribution valves gate pressurised delivery to each racking zone (~30 containers per valve, two rows of 15 via a DN75 distribution line per the Codema section-D layout).',
    },
    {
      from_class: 'hmi_ergonomics',
      to_class: 'control_compute_communication',
      protocol: 'Modbus-TCP',
      mechanism: 'modbus_tcp',
      required: false,
      direction: 'mutual',
      notes: 'Operator touchscreen for pump-unit status, dosing setpoint adjustment and alarm acknowledgement without an external laptop.',
    },
    {
      from_class: 'maintenance_serviceability',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      required: false,
      direction: 'directional',
      notes: 'Service access to cloth/paperbelt filter media, drainpit access covers, and pump-unit clearances — functional zoning + clearance benchmark from Codema (3 systems fit in ~¼ the area a sparse layout uses).',
    },
  ],

  sources_cited: [
    'industry:Codema/Fischer Farms "Farm 2" P&ID SO21101551-100d',
    'industry:Codema/Fischer Farms WTR layout SO21101551-200/201',
    'industry:Codema/Fischer Farms 6L racking detail SO21101551-204',
    'industry:Sam Green SME review 2026-07-07 (~/Downloads/handovers/2026-07-07-SAM-GREEN-SME-review-Codema-analysis.md)',
    'industry:Sam Green — original Codema quote 2×90 m³/h + 1×45 m³/h pump units with RO ≈ €1.1m (price anchor)',
  ],
}

registerClassReferenceGraph(FERTIGATION_WATER_RECYCLING)
