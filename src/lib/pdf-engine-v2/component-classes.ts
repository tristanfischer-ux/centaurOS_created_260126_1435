// component-classes.ts
//
// Engine B (post-council, 2026-05-18) — per-component-class cost curves used
// by the BoM cost engine instead of the Flash-Lite estimator's blanket
// "scale-of-one trade pricing" anchor. Diagnostic
// (forgeos-illustration-experiments/pretraining/cost-engine-heatpump-
// attribution.html) showed Layer 2 (the estimator's wrong anchor) accounted
// for ~85% of the +789% heatpump deviation. This file replaces that anchor.
//
// HOW THE CURVES WORK
// -------------------
// Every BoM line is classified into ONE component class (see
// ComponentClass union). Each class has:
//   - reference_unit_cost_gbp — the typical 1-off trade price for a
//     "representative" part in that class (anchor at volume = 1).
//   - curve — a small set of (annual_volume, unit_cost_multiplier) points.
//     1.0 at volume = 1 by definition. Multipliers fall as volume rises;
//     for tooling-amortised classes (moulded plastics, fasteners) the drop
//     is huge (1000× cheaper at 100k/yr). For bespoke or vendor-bound
//     classes (battery cells, OEM subsystems) the drop is modest (~3-4×).
//
// The estimator picks the class, reads the brief's annual_production_volume
// (default per class type if undeclared: consumer 100k, mid-volume 1k,
// industrial 100), interpolates the curve in log-volume space, and returns:
//   unit_cost_gbp = reference_unit_cost_gbp × curve_interpolated(volume)
//
// CALIBRATION
// -----------
// Curve shapes derive from:
//   1. Industry standard cost-vs-volume relationships for the class
//      (electronics: well-known ~10x per decade for ICs/discretes, ~30-100x
//      for passives; plastics: tooling-amortised so 100-1000x at scale).
//   2. Spot-checks against the Phase 4 corpus (`pretraining_extracted_parts`)
//      via cross-comparison of distributor-quoted prices for parts that
//      have both a 1-off and a documented at-volume quote.
//   3. Grok 4.3 calibration for the less-elastic classes (batteries, OEM
//      subsystems, magnetics, fluid-path) where industry curves are sparse.
//
// W3 RELATIONSHIP
// ---------------
// `class-price-bands.ts` carries a class-level `bom_scale_factor` (W3 stop-
// gap, 0.085 for heatpump). Engine B replaces that uniform per-class scalar
// with a per-line, per-class, per-volume curve. W3 STAYS in place as a
// fallback until Engine A (write-time band gate) also ships — see council
// plan PLAN-2026-05-18-cost-correctness-engine-v2.md.
//
// USAGE
// -----
//   import { COMPONENT_CURVES, interpolateCurve, defaultVolumeFor } from
//     '@/lib/pdf-engine-v2/component-classes'
//   const cls: ComponentClass = ... // assigned by classifier
//   const m = interpolateCurve(COMPONENT_CURVES[cls].curve, brief.annual_volume)
//   const unit_cost = COMPONENT_CURVES[cls].reference_unit_cost_gbp * m
//
// Tristan 2026-05-18 — Engine B build, replaces W3's blanket multiplier.

export type ComponentClass =
  | 'electronic_ic'           // SoCs, MCUs, ASICs, dedicated chips
  | 'electronic_passive'      // resistors, capacitors, inductors (small), ferrites
  | 'electronic_discrete'     // diodes, MOSFETs (discrete), BJTs, small TVS
  | 'electronic_pcb'          // bare PCB + assembly
  | 'electronic_connector'    // headers, RJ45, USB-C, M12, Molex, etc.
  | 'electronic_cable'        // cable assemblies, harnesses, ribbon, coax
  | 'electronic_power_module' // SiC/IGBT modules, integrated power stages
  | 'sensor'                  // thermistors, hall, pressure, accelerometer, LiDAR
  | 'motor_actuator'          // BLDC, stepper, servo, solenoid, linear actuator
  | 'magnetic'                // transformers, inductors >>100uH, motor magnets
  | 'optical'                 // LEDs, photodiodes, displays, lenses
  | 'structural_metal'        // chassis, brackets, sheet metal, weldments
  | 'structural_polymer'      // moulded plastics, gaskets, housings (tooled)
  | 'mechanical_fastener'     // bolts, nuts, washers, pins, springs
  | 'mechanical_assembly'     // hinges, bearings, gears, pumps, fans
  | 'battery_cell'            // li-ion cells, lead-acid, supercaps
  | 'thermal'                 // heatsinks, cold plates, fans, TIM, heat exchangers
  | 'fluid_path'              // pipes, valves, manifolds, fittings, hoses
  | 'safety_consumable'       // fuses, breakers, fire-suppression cartridges
  | 'oem_subsystem'           // pre-built modules: inverter, PSU, GPU board, compressor
  // ── C4 (2026-05-28): oem_subsystem sub-classes split out so distinct reference
  //    costs replace the single £10k BESS override that conflated chillers, AC
  //    units, and aspirating smoke detectors into the same price band.
  | 'oem_hvac_chiller'        // liquid chiller / air-handling unit (Pfannenberg EB XT, Stulz, Emerson): £2k-£25k
  | 'oem_fire_safety'         // fire panel, aspirating smoke detection controller, gas suppression cabinet: £800-£8k
  | 'oem_smoke_detection'     // aspirating smoke detector head / point detector panel — Hochiki, Apollo, Vesda VLF: £150-£2,500
  // ── U2 (2026-05-29): per-cycle inputs excluded from capital BoM
  | 'consumable'              // growing media (rockwool, perlite, coir), filters, desiccant, reagents, nutrients

export type CostCurvePoint = {
  // Annual production volume of the FINAL PRODUCT (the brief value), not the
  // raw component. A "1.6 kW R290 heat pump @ 100k/yr" buys its compressor at
  // that 100k/yr derivative volume — the curve handles the part-vs-product
  // multiplier already, baked into the multiplier.
  annual_volume: number
  // 1.0 at volume = 1 by definition. Below 1.0 represents the price decay
  // typical of that class as volume rises.
  unit_cost_multiplier: number
}

export type ComponentCostCurve = {
  class: ComponentClass
  // Typical 1-off trade price for a representative part in this class.
  // Calibrated to be a sensible anchor for the estimator when the part is
  // unbranded / generic.
  reference_unit_cost_gbp: number
  // Annotation: did the curve come from corpus calibration, industry rule-
  // of-thumb, or a Grok 4.3 spot-check? Useful for renderer attribution.
  source: 'industry_curve' | 'corpus_calibration' | 'grok_4_3_spot_check'
  curve: CostCurvePoint[]
  notes: string
}

// ---------------------------------------------------------------------------
// COMPONENT_CURVES — 20 classes with calibrated cost curves.
//
// Reference unit costs are the typical 1-off trade price for a "generic"
// part in that class (e.g. a generic 32-bit MCU at Mouser-quantity-1 is
// ~£4-£6; pick £5). These anchor the curve; the multiplier scales them.
//
// Curves are 4-point: 1, 100, 10k, 1M annual volume. The renderer
// interpolates in log-volume space.
// ---------------------------------------------------------------------------

export const COMPONENT_CURVES: Record<ComponentClass, ComponentCostCurve> = {
  electronic_ic: {
    class: 'electronic_ic',
    reference_unit_cost_gbp: 5.0,
    source: 'industry_curve',
    notes:
      'MCUs / SoCs / ASICs / dedicated chips. Steep curve: silicon scale economics ' +
      '(wafer-level pricing kicks in past 10k/yr; volume parts sit at £0.20-£0.50). ' +
      'Calibration: STM32 family list price £4-6 at qty 1 → £0.25-0.50 at 1M ' +
      '(Mouser/DigiKey curve + Grok 4.3).',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.60 },
      { annual_volume: 10000, unit_cost_multiplier: 0.20 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.05 },
    ],
  },

  electronic_passive: {
    class: 'electronic_passive',
    reference_unit_cost_gbp: 0.35,
    source: 'industry_curve',
    notes:
      'Resistors, MLCCs, small inductors, ferrites. Extreme curve — Mouser ' +
      'qty-1 is £0.10-£0.50; reels-of-10k unit price is £0.005-£0.05. The ' +
      'ratio is ~50-200×. Class-typical fab pricing at 1M+/yr is sub-1p.',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 1000, unit_cost_multiplier: 0.40 },
      { annual_volume: 100000, unit_cost_multiplier: 0.05 },
      { annual_volume: 10000000, unit_cost_multiplier: 0.01 },
    ],
  },

  electronic_discrete: {
    class: 'electronic_discrete',
    reference_unit_cost_gbp: 1.20,
    source: 'industry_curve',
    notes:
      'Discrete diodes, MOSFETs, BJTs, TVS. Less elastic than ICs because ' +
      'die size is bigger and packaging dominates. Distributor £1-3 at qty 1 ' +
      'falls to £0.10-£0.25 at 1M+.',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.65 },
      { annual_volume: 10000, unit_cost_multiplier: 0.25 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.08 },
    ],
  },

  electronic_pcb: {
    class: 'electronic_pcb',
    reference_unit_cost_gbp: 35.0,
    source: 'industry_curve',
    notes:
      'Bare PCB + SMT assembly for a small-medium board. Steep at low ' +
      'volume (one-off prototype runs cost 5-10× volume); flattens past ' +
      '1k/yr where panelisation + automated SMT kick in.',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 10, unit_cost_multiplier: 0.70 },
      { annual_volume: 1000, unit_cost_multiplier: 0.35 },
      { annual_volume: 100000, unit_cost_multiplier: 0.10 },
    ],
  },

  electronic_connector: {
    class: 'electronic_connector',
    reference_unit_cost_gbp: 2.50,
    source: 'industry_curve',
    notes:
      'Headers, USB-C, RJ45, M12, Molex/JST. Distributor qty-1 £1-£8 ' +
      'depending on standard; reel pricing 10-30× cheaper.',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.55 },
      { annual_volume: 10000, unit_cost_multiplier: 0.18 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.06 },
    ],
  },

  electronic_cable: {
    class: 'electronic_cable',
    reference_unit_cost_gbp: 8.0,
    source: 'industry_curve',
    notes:
      'Cable assemblies, harnesses, ribbon, coax. Labour-heavy — curve is ' +
      'gentler than for stamped/moulded parts because manual assembly time ' +
      'is partly volume-insensitive. Big China-sourced harness contracts at ' +
      'volume hit £0.50-£2.',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.50 },
      { annual_volume: 10000, unit_cost_multiplier: 0.20 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.10 },
    ],
  },

  electronic_power_module: {
    class: 'electronic_power_module',
    reference_unit_cost_gbp: 180.0,
    source: 'industry_curve',
    notes:
      'SiC/IGBT modules (e.g. Infineon FF, Wolfspeed CAB, ON FAM65). ' +
      'Distributor £150-£500 at qty 1, £40-£120 at 10k/yr for automotive ' +
      'and ESS OEMs. Inelastic — semiconductor capacity-bound, not tooling-' +
      'bound.',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.75 },
      { annual_volume: 10000, unit_cost_multiplier: 0.40 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.20 },
    ],
  },

  sensor: {
    class: 'sensor',
    reference_unit_cost_gbp: 12.0,
    source: 'industry_curve',
    notes:
      'Wide class — thermistors (£0.50), Hall ICs (£2), MEMS IMU (£10), ' +
      'pressure sensors (£20), LiDAR modules (£800). Use £12 as the median ' +
      'anchor and the modifier characters refine if a specific part is named.',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.65 },
      { annual_volume: 10000, unit_cost_multiplier: 0.25 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.08 },
    ],
  },

  motor_actuator: {
    class: 'motor_actuator',
    reference_unit_cost_gbp: 25.0,
    source: 'industry_curve',
    notes:
      'BLDC, stepper, servo, solenoid, linear actuator. Distributor £20-£100; ' +
      'OEM at-volume £5-£25. Tooling for stamped laminations + magnets is ' +
      'high — strong curve in the 100-10k range, flatter beyond.',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.55 },
      { annual_volume: 10000, unit_cost_multiplier: 0.20 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.10 },
    ],
  },

  magnetic: {
    class: 'magnetic',
    reference_unit_cost_gbp: 18.0,
    source: 'grok_4_3_spot_check',
    notes:
      'Transformers, large inductors (>100uH), motor magnets. Inelastic at ' +
      'low volume (copper + ferrite cost dominates). Grok 4.3 confirmed ' +
      '2026-05-18: v100=0.75, v10k=0.45, v1M=0.30. Material (core + wire) ' +
      'fraction limits reduction; labour/setup/overhead amortise.',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.75 },
      { annual_volume: 10000, unit_cost_multiplier: 0.45 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.30 },
    ],
  },

  optical: {
    class: 'optical',
    reference_unit_cost_gbp: 3.5,
    source: 'industry_curve',
    notes:
      'LEDs, photodiodes, OLED/LCD displays, lenses. LEDs follow IC-like ' +
      'curve. Displays are bigger absolute items but follow similar elasticity ' +
      '(panel-glass scale economics).',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.55 },
      { annual_volume: 10000, unit_cost_multiplier: 0.18 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.06 },
    ],
  },

  structural_metal: {
    class: 'structural_metal',
    reference_unit_cost_gbp: 45.0,
    source: 'industry_curve',
    notes:
      'Sheet-metal chassis, brackets, weldments, machined parts. One-off ' +
      'CNC/laser quotes 5-10× volume stamped equivalent. Once tooling is ' +
      'amortised the metal-mass cost floor dominates.',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 10, unit_cost_multiplier: 0.65 },
      { annual_volume: 1000, unit_cost_multiplier: 0.25 },
      { annual_volume: 100000, unit_cost_multiplier: 0.08 },
    ],
  },

  structural_polymer: {
    class: 'structural_polymer',
    reference_unit_cost_gbp: 22.0,
    source: 'industry_curve',
    notes:
      'Injection-moulded plastics, gaskets, housings. Single-tool amortised ' +
      'across 100k+ shots — fab unit cost is £0.05-£0.50 vs prototype £15-£40. ' +
      'EXTREMELY elastic class (1000× ratio across the curve).',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 10, unit_cost_multiplier: 0.85 },
      { annual_volume: 1000, unit_cost_multiplier: 0.05 },
      { annual_volume: 100000, unit_cost_multiplier: 0.005 },
    ],
  },

  mechanical_fastener: {
    class: 'mechanical_fastener',
    reference_unit_cost_gbp: 0.45,
    source: 'industry_curve',
    notes:
      'Bolts, nuts, washers, pins, springs. Commodity at volume (DIN-spec ' +
      'fasteners are sub-1p in bulk). Distributor qty-1 £0.20-£1, ' +
      'production reel £0.01-£0.03.',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.40 },
      { annual_volume: 10000, unit_cost_multiplier: 0.10 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.03 },
    ],
  },

  mechanical_assembly: {
    class: 'mechanical_assembly',
    reference_unit_cost_gbp: 35.0,
    source: 'industry_curve',
    notes:
      'Hinges, bearings, gears, fans, pumps. More inelastic than simple ' +
      'stamped parts because assembly + sub-component cost dominates. ' +
      'Industrial ball bearings: £4 qty-1 → £0.80 at 100k/yr.',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.60 },
      { annual_volume: 10000, unit_cost_multiplier: 0.25 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.12 },
    ],
  },

  battery_cell: {
    class: 'battery_cell',
    reference_unit_cost_gbp: 8.0,
    source: 'industry_curve',
    notes:
      'Li-ion 18650/21700/prismatic, lead-acid, supercaps. INELASTIC — cell ' +
      'manufacturers (CATL, BYD, LG) sell to OEMs at scale already, so ' +
      'qty-1 distributor markup is only 2-3×. Floor is commodity material ' +
      '(Li, Co, Ni) + 70% gross margin.',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.60 },
      { annual_volume: 10000, unit_cost_multiplier: 0.45 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.30 },
    ],
  },

  thermal: {
    class: 'thermal',
    reference_unit_cost_gbp: 28.0,
    source: 'industry_curve',
    notes:
      'Heatsinks (extruded/forged aluminium), cold plates, fans, TIM, ' +
      'plate heat exchangers. Tooling amortisation curve like polymer but ' +
      'less extreme — aluminium feedstock cost floor is non-trivial.',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.55 },
      { annual_volume: 10000, unit_cost_multiplier: 0.20 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.08 },
    ],
  },

  fluid_path: {
    class: 'fluid_path',
    reference_unit_cost_gbp: 18.0,
    source: 'grok_4_3_spot_check',
    notes:
      'Pipes, valves, manifolds, fittings, hoses. Mix of commodity (PEX/' +
      'copper pipe) and specialist (manifold blocks). Grok 4.3 confirmed ' +
      '2026-05-18: v100=0.65, v10k=0.35, v1M=0.18. Distributor margin + ' +
      'setup amortisation + material discounts.',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.65 },
      { annual_volume: 10000, unit_cost_multiplier: 0.35 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.18 },
    ],
  },

  safety_consumable: {
    class: 'safety_consumable',
    reference_unit_cost_gbp: 6.5,
    source: 'industry_curve',
    notes:
      'Fuses, MCBs, fire-suppression cartridges, rupture discs. Approval-' +
      'bound (UL, BS, IEC) so curve is gentler — certified parts have less ' +
      'price elasticity. Distributor qty-1 £3-£15; volume £1-£3.',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.65 },
      { annual_volume: 10000, unit_cost_multiplier: 0.30 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.15 },
    ],
  },

  oem_subsystem: {
    class: 'oem_subsystem',
    reference_unit_cost_gbp: 280.0,
    source: 'grok_4_3_spot_check',
    notes:
      'Pre-built modules: inverter, PSU, GPU board, compressor, BMS ' +
      'mainboard. THE LEAST ELASTIC CLASS — vendor has fixed margin baked ' +
      'in regardless of OEM volume; BoM + labour dominate cost. Grok 4.3 ' +
      'confirmed 2026-05-18: v100=0.88, v10k=0.68, v1M=0.48.',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.88 },
      { annual_volume: 10000, unit_cost_multiplier: 0.68 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.48 },
    ],
  },

  // ── C4 sub-classes (2026-05-28) ────────────────────────────────────────────
  // These decompose the £10k BESS `oem_subsystem` override that was conflating
  // three completely different product categories (liquid-cooling chiller, AC
  // unit, aspirating smoke detector) into a single price point. Each sub-class
  // now has its own calibrated reference cost and inelastic curve (they are all
  // vendor-supplied, low-volume bespoke industrial purchases).

  oem_hvac_chiller: {
    class: 'oem_hvac_chiller',
    reference_unit_cost_gbp: 8000.0,
    source: 'grok_4_3_spot_check',
    notes:
      'Liquid chillers and air-handling units for industrial / BESS thermal ' +
      'management — Pfannenberg EB XT / CC series, Stulz CyberCool, Emerson ' +
      'Liebert. Typical range £2,000-£25,000 depending on rated cooling kW. ' +
      'Extremely inelastic (vendor-bound, low-rate industrial purchase). ' +
      'Anchor £8,000 (covers 20-50 kW utility-BESS class — EB XT 500 WT). ' +
      'Replaces the £10k oem_subsystem override that mis-priced chillers at ' +
      'the same value as full BMS masters.',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.92 },
      { annual_volume: 10000, unit_cost_multiplier: 0.75 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.55 },
    ],
  },

  oem_fire_safety: {
    class: 'oem_fire_safety',
    reference_unit_cost_gbp: 3500.0,
    source: 'grok_4_3_spot_check',
    notes:
      'Fire panels, aspirating smoke detection (ASD) controllers, gas ' +
      'suppression cabinets — Hochiki, Notifier, Gent, Fike, Minimax. ' +
      'Fire panel + ASD controller for a BESS container is typically ' +
      '£1,500-£8,000 depending on zone count. Replaces £10k oem_subsystem ' +
      'override. Inelastic (approval-bound, certification costs dominate).',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.90 },
      { annual_volume: 10000, unit_cost_multiplier: 0.72 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.55 },
    ],
  },

  oem_smoke_detection: {
    class: 'oem_smoke_detection',
    reference_unit_cost_gbp: 400.0,
    source: 'grok_4_3_spot_check',
    notes:
      'Individual aspirating smoke detector heads / point detector panels — ' +
      'Apollo Intelligent Series, Hochiki CHQ-ASD, VESDA VLF-500. A single ' +
      'addressable point detector is £40-£120; an ASD sampling head (the ' +
      'device that draws air over a laser chamber) is £300-£600; a full VESDA ' +
      'VLP is £1,500-£2,200. Anchor £400 (weighted toward ASD heads, the most ' +
      'common BESS BoM entry after the fire panel). The keyword floor table ' +
      '(CATEGORY_KEYWORD_FLOORS_GBP) provides further fine-grained floors ' +
      'within this class (VESDA/aspirating → £1,500; point detector → £45).',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 100, unit_cost_multiplier: 0.88 },
      { annual_volume: 10000, unit_cost_multiplier: 0.70 },
      { annual_volume: 1000000, unit_cost_multiplier: 0.50 },
    ],
  },

  // ── U2 (2026-05-29): per-cycle consumables ─────────────────────────────────
  // Growing media (rockwool slabs/cubes, perlite, coir, clay pebbles), filters
  // (air, water, nutrient-line), desiccant packs, reagents, nutrient solutions.
  // These are PER-CYCLE operating inputs, NOT capital items. They are classified
  // separately so the BoM aggregation step can exclude them from the capital/
  // build cost total and place them in a separate consumables segment.
  //
  // Reference anchor: rockwool propagation cube Grodan / Cultilene (common VF
  // entry) is ~£0.15-£0.50 each; a standard rockwool slab (1 m × 0.15 m × 0.075 m)
  // is ~£1.50-£4.00. Anchor £1.50 — weighted toward the slab format used in
  // hydroponic container farms. Curve is mildly elastic (bulk pallet discounts
  // exist) but material cost dominates at scale, so the drop is modest.
  consumable: {
    class: 'consumable',
    reference_unit_cost_gbp: 1.50,
    source: 'industry_curve',
    notes:
      'Per-cycle growing media, filters, desiccant, reagents. NOT a capital ' +
      'item — must be excluded from capital BoM via isConsumable(). Reference ' +
      '£1.50 (rockwool slab / perlite bag / filter cartridge typical unit). ' +
      'Curve modest: bulk pallet discounts ~30-40% at 10k/yr but material cost ' +
      'floors dominate. PRICE_CEILING_BY_COMPONENT_CLASS caps this class at ' +
      '£50/unit — individual consumable items rarely exceed £50 (a large HEPA ' +
      'filter housing or a 5 kg nutrient bag is the practical ceiling).',
    curve: [
      { annual_volume: 1, unit_cost_multiplier: 1.0 },
      { annual_volume: 1000, unit_cost_multiplier: 0.75 },
      { annual_volume: 100000, unit_cost_multiplier: 0.55 },
      { annual_volume: 10000000, unit_cost_multiplier: 0.40 },
    ],
  },
}

// ---------------------------------------------------------------------------
// Curve interpolation. Uses log10(volume) so the 1 → 100 → 10k → 1M points
// space evenly. Below the first point clamps to 1.0; above the last point
// clamps to that point's multiplier.
// ---------------------------------------------------------------------------

export function interpolateCurve(
  curve: CostCurvePoint[],
  annual_volume: number,
): number {
  if (!Array.isArray(curve) || curve.length === 0) return 1.0
  if (!Number.isFinite(annual_volume) || annual_volume <= 0) return 1.0

  // Pre-sort defensively in case a future entry is out-of-order.
  const sorted = [...curve].sort((a, b) => a.annual_volume - b.annual_volume)
  if (annual_volume <= sorted[0].annual_volume) return sorted[0].unit_cost_multiplier
  const last = sorted[sorted.length - 1]
  if (annual_volume >= last.annual_volume) return last.unit_cost_multiplier

  // Linear interpolation in log-volume space.
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const lo = sorted[i]
    const hi = sorted[i + 1]
    if (annual_volume >= lo.annual_volume && annual_volume <= hi.annual_volume) {
      const lv = Math.log10(lo.annual_volume)
      const hv = Math.log10(hi.annual_volume)
      const v = Math.log10(annual_volume)
      const t = (v - lv) / (hv - lv)
      return lo.unit_cost_multiplier + t * (hi.unit_cost_multiplier - lo.unit_cost_multiplier)
    }
  }
  return 1.0
}

// ---------------------------------------------------------------------------
// Defaults per the council plan (PLAN-2026-05-18 §3): when the brief does
// not declare an annual_production_volume, fall back per class type. These
// are PRODUCT-level defaults, not component-level — a "consumer" class
// product like CGM or drone gets the 100k/yr anchor; an "industrial-heavy"
// class like BESS or HAPS gets the 100/yr anchor.
// ---------------------------------------------------------------------------

export type VolumeBucket = 'consumer' | 'mid_volume' | 'industrial_heavy'

export const DEFAULT_VOLUME_BY_BUCKET: Record<VolumeBucket, number> = {
  consumer: 100_000,
  mid_volume: 1_000,
  industrial_heavy: 100,
}

// Map product-class slugs (matching class-price-bands.ts keys) to a default
// volume bucket. The brief overrides if it declares a volume; otherwise
// this is the anchor.
export const PRODUCT_CLASS_VOLUME_BUCKET: Record<string, VolumeBucket> = {
  // Industrial-heavy (bespoke, low volume).
  bess: 'industrial_heavy',
  auv: 'industrial_heavy',
  bioreactor: 'industrial_heavy',
  haps: 'industrial_heavy',
  'ev-charger': 'industrial_heavy',
  ev_charger: 'industrial_heavy',
  motor_drive_vfd: 'industrial_heavy',
  chiller: 'industrial_heavy',
  energy_storage: 'industrial_heavy',
  co2_mineralisation: 'industrial_heavy',
  e_fuel_synthesis: 'industrial_heavy',

  // Mid-volume professional.
  'edge-ai': 'mid_volume',
  edge_ai_server: 'mid_volume',
  pv_string_inverter: 'mid_volume',
  residential_ess: 'mid_volume',
  industrial_inspection_drone: 'mid_volume',
  'vertical-farm': 'mid_volume',
  vertical_farm: 'mid_volume',
  // heatpump + thermal_system: small R290 monoblocs ship 20-100k units/yr
  // (Vaillant aroTHERM, Daikin Altherma M HW, Dimplex LA). Treat as
  // consumer-class for volume defaulting.
  heatpump: 'consumer',
  thermal_system: 'consumer',

  // Consumer high-volume.
  cgm: 'consumer',
  drone: 'consumer',
  wearable_medical: 'consumer',
}

export function defaultVolumeFor(productClassSlug: string | undefined | null): number {
  if (!productClassSlug) return DEFAULT_VOLUME_BY_BUCKET.mid_volume
  const bucket = PRODUCT_CLASS_VOLUME_BUCKET[productClassSlug]
  if (!bucket) return DEFAULT_VOLUME_BY_BUCKET.mid_volume
  return DEFAULT_VOLUME_BY_BUCKET[bucket]
}

// ---------------------------------------------------------------------------
// PRODUCT_CLASS_REFERENCE_OVERRIDES — Engine B's single per-component-class
// reference_unit_cost_gbp anchors a "median generic part" in that class. That
// breaks down when a class has high intra-class magnitude variance and the
// host product systematically uses one tail of the distribution.
//
// Concrete example (2026-05-18 BESS investigation):
//   * battery_cell ref £8 anchors a small 18650 (~3-5 Wh) at qty-1 distributor
//     pricing. A utility BESS uses 280 Ah LFP prismatic cells (~£72-£100 each
//     at 100/yr programme scale) — Engine B under-priced cells by 10-15×.
//   * oem_subsystem ref £280 anchors a small driver / smoke detector / smart
//     thermostat. A utility BESS contains BMS master + EMS PC + LV switch-
//     panel + revenue meter etc., averaging £2k-£20k each — under-priced
//     ~30-40×.
//   * electronic_power_module ref £180 anchors a generic SiC half-bridge for
//     a domestic inverter. A utility BESS PCS uses 1700 V Fuji/Hitachi/
//     Infineon modules at £600-£1500 each — under-priced ~5-10×.
//   * Conversely, structural_polymer ref £22 anchors a small housing/gasket.
//     A BESS BoM has 3920 "cell insulation pad" lines worth ~£0.10 each —
//     OVER-priced ~50×. Same for electronic_connector ("cell-to-cell busbar
//     strip" at qty 3808 should be ~£0.30, Engine B gives £1.38) and sensor
//     ("NTC thermistor" at qty 896 should be ~£0.30, Engine B gives £7.80).
//
// Net effect on BESS: -£250k missing from cells/PCS lines + £50k extra on
// over-priced small parts → raw BoM £87k vs realistic £350k. The fix is to
// keep one reference per class but allow a per-product-class override when
// the host product systematically uses the non-median tail of the class.
//
// Schema: `PRODUCT_CLASS_REFERENCE_OVERRIDES[product_class_slug][component_class]`
// returns the GBP reference unit cost to substitute. Falls through to the
// canonical COMPONENT_CURVES[cls].reference_unit_cost_gbp when no override
// is present. Multipliers (and therefore curve shape vs volume) are
// unchanged — only the magnitude anchor shifts.
//
// Where to add an entry: when an empirical state lands a class's raw BoM
// contribution >30% off its realistic share, and the cause is intra-class
// part-magnitude variance (NOT a missing class or wrong classification),
// add the override here. When the cause IS a missing class or wrong
// classification, fix the classifier prompt or split the ComponentClass
// taxonomy instead.
// ---------------------------------------------------------------------------

export const PRODUCT_CLASS_REFERENCE_OVERRIDES: Record<string, Partial<Record<ComponentClass, number>>> = {
  // Utility-scale BESS (3-10 MWh, LFP prismatic, containerised). All three
  // alias slugs (`bess`, `energy_storage`, `bess-utility-scale`) map to the
  // same overrides — see `class-price-bands.ts` for the alias map.
  // Calibrated 2026-05-18 against /tmp/test-bess-p5.json (67-part BoM, 3.5 MWh
  // / 3920 LFP prismatic cells) to land installed-ASP £224/kWh (band centre
  // £227.5/kWh) under BESS cost-stack ratios L=0.20, OH=0.15, M=0.20, C=0,
  // I=0.45 (heavy-EPC, civils + grid + commissioning).
  bess: {
    battery_cell: 100.0,            // 280 Ah LFP prismatic, ~£0.08-0.11/Wh × 0.9 kWh/cell at 100/yr OEM
    // C4 (2026-05-28): oem_subsystem ref kept at £10k for GENUINE large subsystems
    // (BMS master board, EMS/SCADA PC, LV distribution panel, revenue meter, string
    // inverter controller rack — all legitimately £2k-£20k). Smoke detectors,
    // chillers, and AC units must NOT be classified as oem_subsystem for BESS; they
    // now have their own classes (oem_smoke_detection, oem_hvac_chiller) whose
    // refs are calibrated below. The rule-based classifier (C4) prevents
    // smoke/detector/chiller keywords from routing to oem_subsystem.
    oem_subsystem: 10000.0,
    electronic_power_module: 1000.0,// 1700 V IGBT half-bridge for BESS PCS (£600-£1500 @ 100/yr)
    structural_polymer: 0.50,       // dominated by cell-insulation pads (qty 3920, real cost £0.10-£0.30)
    electronic_connector: 0.40,     // dominated by cell-to-cell busbar strips (qty 3808, real cost £0.20-£0.50)
    sensor: 1.00,                   // dominated by NTC thermistors (qty 896, real cost £0.30-£0.50)
    // C4 sub-class refs for BESS context
    oem_hvac_chiller: 8500.0,       // Pfannenberg EB XT 500 WT class (47 kW liquid chiller): £8k-£15k @ 100/yr; was £10k but emitter pins chiller (£8,500) and AC unit (£3,800) explicitly — reference lowered to match chiller mid-point so unpinned cascade-miss HVAC parts don't over-anchor (FIX B 2026-05-29)
    oem_fire_safety: 3500.0,        // Fire panel + ASD controller for BESS container: £1.5k-£8k
    oem_smoke_detection: 350.0,     // ASD sampling head (Hochiki/Hochiki-CHQ): £150-£600; point detector £40-£120
  },
  energy_storage: {
    battery_cell: 100.0,
    oem_subsystem: 10000.0,
    electronic_power_module: 1000.0,
    structural_polymer: 0.50,
    electronic_connector: 0.40,
    sensor: 1.00,
    oem_hvac_chiller: 8500.0,
    oem_fire_safety: 3500.0,
    oem_smoke_detection: 350.0,
  },
  'bess-utility-scale': {
    battery_cell: 100.0,
    oem_subsystem: 10000.0,
    electronic_power_module: 1000.0,
    structural_polymer: 0.50,
    electronic_connector: 0.40,
    sensor: 1.00,
    oem_hvac_chiller: 8500.0,
    oem_fire_safety: 3500.0,
    oem_smoke_detection: 350.0,
  },

  // -------------------------------------------------------------------------
  // 2026-05-18 (Engine-B gap fix, second wave): populate 9 more product
  // classes. Approach mirrors BESS — apply per-(product_class, component_
  // class) overrides where Engine B's median anchor systematically mis-prices
  // intra-class variance. For each class:
  //   1. Re-ran Engine B on a p5 (or enriched) state and observed top class
  //      contributors and average £/unit after volume curve.
  //   2. Cross-checked against industry magnitudes for that product type.
  //   3. Where Engine B's anchor is ≥2× off the realistic at-volume price,
  //      added an override. Otherwise relied on the canonical anchor.
  //   4. Validated by simulating the post-override raw-BoM, applying the
  //      class-cost-structure compound multiplier and class-price-bands W3,
  //      and confirming installed-ASP lands within ±25% of band centre.
  //
  // Two classes (drone, cgm) did NOT need anchor overrides — Engine B's
  // consumer-100k median was directionally correct; only the W3 fudge factor
  // in class-price-bands.ts needed a tune. Both are listed here as empty
  // entries for documentation (so future maintainers know they were assessed
  // and don't need overrides). The W3 tune lives in class-price-bands.ts.
  //
  // Aliases (per class-price-bands.ts alias map):
  //   ev_charger / 'ev-charger' / dc_fast_ev_charger → ev-charger overrides
  //   drone / consumer_cinematography_drone → drone overrides
  //   cgm / wearable_medical / wearable_medical_device → cgm overrides
  //   bioreactor → bioreactor overrides
  //   auv → auv overrides
  //   haps → haps overrides
  //   'vertical-farm' / vertical_farm → vertical-farm overrides
  //   'edge-ai' / edge_ai_server → edge-ai overrides
  //   residential_ess → residential_ess overrides (no state file; calibrated
  //                     by analogy to BESS scaled to 1000/yr mid-volume)
  // -------------------------------------------------------------------------

  // DC fast EV charger (150 kW dual-CCS2). Industrial-heavy 100/yr. Engine B
  // raw landed at £86/kW vs target £400/kW pre-W3. Big-ticket items (PCS
  // modules, isolation transformer, AC isolator, payment terminal) were
  // under-priced by the median-part anchors. Calibrated 2026-05-18 against
  // /tmp/test-ev-charger-p5-eb.json (239-part BoM, 150 kW). Post-override
  // raw BoM lands at £298/kW × cost-stack compound 2.815× = £838/kW
  // (band £550-950/kW, 12% over centre — in band).
  'ev-charger': {
    oem_subsystem: 2800.0,          // PCS modules, isolation transformer, AC isolator, payment terminal (£500-£15k mixed)
    electronic_power_module: 2000.0,// 1700V SiC half-bridges for 150 kW DCFC (£600-£4000 @ 100/yr)
    magnetic: 200.0,                // isolation transformer + chokes (£50-£500 @ 100/yr)
    sensor: 35.0,                   // CCS thermistors, RCD ground-fault monitoring (£15-£100)
    fluid_path: 40.0,               // liquid-cooled CCS cable manifold (£20-£80)
    mechanical_assembly: 80.0,      // cabinet hinges, contactors, cooling fans (£30-£200)
    thermal: 75.0,                  // cold plates for SiC stack (£40-£200)
    structural_metal: 80.0,         // cabinet steelwork at 100/yr bespoke fab (£50-£200)
  },
  ev_charger: {
    oem_subsystem: 2800.0,
    electronic_power_module: 2000.0,
    magnetic: 200.0,
    sensor: 35.0,
    fluid_path: 40.0,
    mechanical_assembly: 80.0,
    thermal: 75.0,
    structural_metal: 80.0,
  },
  dc_fast_ev_charger: {
    oem_subsystem: 2800.0,
    electronic_power_module: 2000.0,
    magnetic: 200.0,
    sensor: 35.0,
    fluid_path: 40.0,
    mechanical_assembly: 80.0,
    thermal: 75.0,
    structural_metal: 80.0,
  },

  // Modular vertical farm (15 kg/week leafy greens). Mid-volume 1000/yr.
  // Engine B raw at £14,487/unit. oem_subsystem under-priced at £218 avg —
  // LED rack modules, HVAC compressor, water-treatment skid are £500-£3k
  // each at the modular-product volume. Pump motors also under-priced.
  // Post-override raw lands at £52k × cost-stack compound 1.656× × W3 0.30 =
  // £25,869 (band £15-45k, 14% under centre — in band).
  'vertical-farm': {
    // Iter-8 calibration (commit 349751e9d) expanded VF from 4 to 12
    // component classes; verify chain (job a3e05161) showed BoM landed
    // £372/m² installed — band is £600-1200/m² so 38% below low end.
    // Iter-9 Step 4 (2026-05-20): tighten the under-priced classes.
    //
    // Per real commercial VF benchmarks (AeroFarms / GrowUp / Vertical
    // Future / Babylon procurement quotes 2023-25):
    //  - LED grow panels for 100 m² horticultural: ~£200-£400 each at
    //    1000/yr volume (Osram PHYTOVYNE, Samsung LM301H assemblies)
    //  - DX cooling coils 15-25 kW: £1,500-£4,000 each
    //  - PIR sandwich panels Kingspan KS1000RW 80mm: £200-£350/panel
    //    (60 panels × £300 = £18k for a 40ft container shell)
    //  - 40ft Hi-Cube ISO container: £4,000-£8,000 raw
    //  - Trolley steel frames custom-fab (1.2 × 2.0 × 2.4 m, 250 kg
    //    per tier): £1,200-£2,000 each
    //
    // U1(b) 2026-05-29: extended to cover all classes a container farm actually
    // uses, so Engine B stops falling through to the wrong median anchor.
    // Key VF-specific anchors added:
    //  - structural_polymer: dominated by Kingspan / Rockwool PIR insulation
    //    panels (£8-£30 per m², cut to panel size), flexible ducting
    //    (£5-£20/m), and gutter trays (£3-£15 each) — NOT injection-moulded
    //    housings. Anchor £8 (Rockwool FLEXI-slab equivalent, 1-2 m² section).
    //  - electronic_connector: standard DIN-rail terminal blocks (£0.80-£3),
    //    RJ45 patch leads (£1-£3), climate-sensor plugs (£0.50-£2). Anchor £2.
    //  - mechanical_fastener: M8 bolts for container racking (£0.10-£0.40),
    //    anchor plates (£1-£5). Anchor £0.60.
    //  - electronic_cable: power cable for LED bars (£1-£5/m), RS485 sensor
    //    cables (£0.80-£3/m), irrigation solenoid 24 VAC wiring (£1-£3/m).
    //    Anchor £4.
    //  - electronic_passive: DIN-rail 24 V power supplies (£20-£60) dominate;
    //    smaller PCB passives for climate controllers (£0.10-£1). Anchor £0.50.
    //  - electronic_ic: real-time clocks, 8-bit micros for dosing boards
    //    (£1-£4 at 1000/yr). Anchor £3.
    oem_subsystem: 2500.0,          // ↑ from 2000 — LED rack module / HVAC compressor / water-treatment skid (£500-£5k mixed)
    motor_actuator: 100.0,          // ↑ from 80 — pump motors at 1000/yr volume
    fluid_path: 30.0,               // ~ — irrigation fittings + valves
    sensor: 35.0,                   // ~ — pH/EC/temp/light sensors
    optical: 400.0,                 // ↑↑ from 200 — Osram PHYTOVYNE / Samsung LM301H horticultural LED panels (40 × £400 = £16k for 100m²)
    structural_metal: 1500.0,       // ↑↑ from 800 — 40ft ISO container shell £5k, trolley frames £1.5k, panels & rails
    thermal: 300.0,                 // ↑↑ from 100 — Kingspan PIR panels £300/panel, DX cooling coils £1-4k
    mechanical_assembly: 100.0,     // ↑ from 60 — insulated doors £400, trolley castors, ramps
    electronic_pcb: 300.0,          // ↑ from 200 — Siemens PLC + I/O modules £200-£800
    electronic_power_module: 80.0,  // ↑ from 60 — LED drivers (Mean Well CSP-class)
    magnetic: 100.0,                // ↑ from 80 — VFD chokes + transformers
    safety_consumable: 75.0,        // ↑ from 50 — Pilz SIL3 relay ~£200, E-stop buttons £30-£80
    // U1(b) 2026-05-29: added classes VF uses that were missing overrides
    structural_polymer: 8.0,        // Kingspan / Rockwool PIR insulation panel section, flexible ducting piece, gutter tray (£3-£30)
    electronic_connector: 2.0,      // DIN-rail terminal block, RJ45 patch lead, sensor plug (£0.50-£5)
    mechanical_fastener: 0.60,      // M8 anchor bolts for container racking, anchor plates (£0.10-£5)
    electronic_cable: 4.0,          // Power/signal cable per metre run: LED bar feed, RS485, solenoid 24VAC (£0.80-£8)
    electronic_passive: 0.50,       // PCB passives for dosing/climate boards (£0.10-£1); DIN PSUs hit oem_subsystem override instead
    electronic_ic: 3.0,             // 8-bit / RTC / dosing-board MCU at 1000/yr volume (£1-£6)
    electronic_discrete: 1.20,      // Small-signal MOSFETs / diodes for climate/dosing PCBs (£0.30-£3)
  },
  vertical_farm: {
    oem_subsystem: 2500.0,
    motor_actuator: 100.0,
    fluid_path: 30.0,
    sensor: 35.0,
    optical: 400.0,
    structural_metal: 1500.0,
    thermal: 300.0,
    mechanical_assembly: 100.0,
    electronic_pcb: 300.0,
    electronic_power_module: 80.0,
    magnetic: 100.0,
    safety_consumable: 75.0,
    // U1(b) — mirrors 'vertical-farm' entry above
    structural_polymer: 8.0,
    electronic_connector: 2.0,
    mechanical_fastener: 0.60,
    electronic_cable: 4.0,
    electronic_passive: 0.50,
    electronic_ic: 3.0,
    electronic_discrete: 1.20,
  },

  // 200 L single-use mammalian bioreactor (GMP). Industrial-heavy 100/yr.
  // Engine B raw landed at £48/L vs target £540/L pre-W3 — Engine B's
  // median anchors are wildly off for sterile fluid-path + sterile-rated
  // OEM subsystems. Peristaltic pumps £3-5k, mass flow controllers £2-4k,
  // glass vessel + ASME-stamped jacketed assembly £10-15k. Sterile sensors
  // (pH/DO/conductivity/foam) £100-£1k each. Sanitary tri-clamp fittings
  // £20-£250 each. Post-override raw £551/L × cost-stack compound 3.139× ×
  // W3 1.0 = £1,731/L (band £1,200-2,200/L, 2% over centre — in band).
  bioreactor: {
    oem_subsystem: 6000.0,          // peristaltic pumps, glass vessel, mass-flow controllers, weigh modules (£2k-£25k mixed)
    motor_actuator: 600.0,          // sterile sealed pump motors, impeller drive (£100-£2000)
    magnetic: 250.0,                // impeller magnetic-drive coupling (£50-£500)
    sensor: 200.0,                  // sterile pH/DO/temp/foam/conductivity probes (£100-£1k each)
    fluid_path: 80.0,               // sanitary tri-clamp fittings, single-use bag ports (£20-£250)
    structural_metal: 150.0,        // SS316L jacketed vessel, frame (£50-£500)
    electronic_pcb: 80.0,           // PLC modules, controller boards (£30-£300)
  },

  // Consumer disposable CGM (14-day patch, 100k+/yr). Engine B raw landed
  // at £482/unit, target installed ASP £28/unit. Engine B's consumer-100k
  // median anchors are directionally correct for this kind of mass-produced
  // disposable; the existing W3 0.003 compensator from the pre-Engine-B
  // legacy estimator is the wrong lever now because Engine B already
  // includes volume curves. No anchor overrides needed — W3 in
  // class-price-bands.ts lifted from 0.003 to 0.023 so Engine B raw lands
  // at installed £28 (band centre, in band). Empty entry kept for
  // documentation.
  cgm: {
    // No per-component overrides required (assessed 2026-05-18; W3 lever in
    // class-price-bands.ts handles the calibration).
  },
  wearable_medical: {},
  wearable_medical_device: {},

  // Consumer cinematography drone (sub-900g 4K). Consumer 100k/yr. Engine B
  // raw landed at £1,591/unit vs target installed retail £1,275/unit.
  // Engine B's consumer-100k anchors are reasonable for the BoM magnitudes;
  // the existing W3 0.035 trim was over-compressed. Empty entry kept; W3
  // tune in class-price-bands.ts (0.035 → 0.222) does the heavy lifting.
  drone: {
    // No per-component overrides required (assessed 2026-05-18; W3 lever in
    // class-price-bands.ts handles the calibration).
  },
  consumer_cinematography_drone: {},

  // 2 m coastal-survey AUV (mid-tier MBES + SSS + INS). Bespoke marine
  // 100/yr. Engine B raw landed at £50,519/unit vs target £152,622/unit
  // pre-W3. Subsea instruments (MBES head, INS, DVL, USBL, hydroacoustic
  // transducers) and bespoke pressure-housed thrusters are systematically
  // under-priced by the median sensor/oem_subsystem anchors. Post-override
  // raw £189k × cost-stack compound 9.173× × W3 1.0 = £1.74M (band £850k-
  // £1.95M, 24% over centre — in band). The bespoke-low-volume archetype
  // legitimately commands high cost stack on hand-built marine.
  auv: {
    sensor: 1500.0,                 // MBES head, SSS, INS, DVL, USBL (£500-£15k mixed at 100/yr)
    oem_subsystem: 15000.0,         // complete payload modules — MBES/SSS heads, INS unit (£5k-£100k mixed)
    structural_metal: 250.0,        // pressure housing 6061-T6, syntactic foam frame (£100-£2k)
    motor_actuator: 1500.0,         // subsea brushless thrusters (£500-£5k each)
    electronic_pcb: 200.0,          // depth-rated control boards (£80-£800)
    electronic_power_module: 800.0, // subsea power conditioning (£300-£3k)
  },

  // 50 m solar-electric HAPS (high-altitude pseudo-satellite). Bespoke
  // aerospace 100/yr. Engine B raw landed at £316k vs target £2.65M pre-W3
  // — composite-layup parts (mechanical_assembly + structural_polymer)
  // dominate quantity and are heavily under-priced at the cert-grade
  // aerospace volume. Aerospace prepreg ply £30-100, cured composite hard-
  // ware £100-£500. Cert-grade autopilot + sat-link + payload computer
  // £5k-£100k. Post-override raw £2.55M × cost-stack compound 4.143× × W3
  // 1.0 = £10.58M (band £7M-£15M, 4% under centre — in band).
  haps: {
    // 2026-05-21 (real council Gemini 3.1 Pro + Grok 4.3 + GLM-5.1 + MiMo
    // verdict on HAPS under-pricing). Loop 4 emitted £37k raw BoM vs £7-15M
    // validated installed-ASP band — 50-100× low. Per GLM-5.1: original
    // anchors are commercial-drone calibrated, not aerospace. Raised to
    // MiMo's confidence-bounded ranges for low-rate (4/yr) aerospace
    // production. Cause C (Stage 1.7 macro-assembly emission) also fixed
    // in prompts.ts MODULE_DECOMPOSITION_TAXONOMY_PROMPT — these higher
    // anchors only land when the BoM contains aerospace-named parts.
    mechanical_assembly: 800.0,     // raised from 350 — aerospace-grade cured composite hinges, fittings, control horns (£200-£2k typical at 4/yr)
    structural_polymer: 800.0,      // raised from 100 — cured aerospace prepreg + CF wing skin parts; £400-1000/kg cured at low rate (council GLM-5.1)
    electronic_cable: 80.0,         // raised from 30 — MIL-spec aerospace harnesses (£20-£300 each at low rate, council ranges)
    electronic_ic: 300.0,           // raised from 30 — rad-hardened MCU/FPGA at low aerospace qty (council MiMo: £100-£500)
    oem_subsystem: 80000.0,         // raised from 40000 — autopilot + sat-link + payload computer (£20k-£200k mixed at programme rate)
    electronic_power_module: 3500.0,// raised from 1500 — aerospace MPPT, BLDC controllers (£1k-£10k at low rate)
    sensor: 800.0,                  // raised from 300 — cert-grade IMU, air-data probes, GNSS (£200-£3k at aerospace qty)
    motor_actuator: 3500.0,         // raised from 1500 — aerospace BLDC propulsion motors (£1.5k-£8k council GLM-5.1)
    magnetic: 400.0,                // raised from 200 — aerospace step-up transformers, BLDC stators
    electronic_pcb: 800.0,          // raised from 250 — space-qualified PCBs (£200-£2k council GLM-5.1)
    structural_metal: 1200.0,       // raised from 300 — CNC'd Ti / 7075 aluminium fittings (£500-£2k council GLM-5.1)
    // NEW classes likely to appear after Stage 1.7 macro-assembly rule lands
    optical: 5000.0,                // GaAs solar laminate per panel — £4k/m² typical, panels ~1 m²
    battery_cell: 1500.0,           // lithium-sulphur premium cell — £4k/kWh × ~0.4 kWh module = ~£1.6k
  },

  // 1U rack-mount edge-AI inference appliance (1-2× L4/T4 + 64-128 GB).
  // Mid-volume 1000/yr server build. Engine B raw landed at £3,632/unit vs
  // target £8,443/unit pre-W3. Biggest gap: oem_subsystem (GPU board, server
  // PSU, NIC card) under-priced — £218 avg vs realistic £1,200 avg for L4/T4
  // boards at 1000/yr. Post-override raw £10k × cost-stack compound 1.362× ×
  // W3 1.0 = £13,921 (band £7,500-£15,500, 21% over centre — in band).
  'edge-ai': {
    oem_subsystem: 1200.0,          // NVIDIA L4/T4 board, server PSU, NIC card (£200-£3500 mixed)
    magnetic: 30.0,                 // ATX/redundant PSU transformers (£8-£60)
  },
  edge_ai_server: {
    oem_subsystem: 1200.0,
    magnetic: 30.0,
  },

  // 5-15 kWh residential ESS (5 kWh nominal LFP, AC-coupled). Mid-volume
  // 1000/yr distributor + installer channel. No Engine-B-priced state was
  // available during the 2026-05-18 dispatch — calibrated by analogy to
  // utility BESS scaled to residential at 1000/yr (mid-volume bucket). Key
  // assumption: ~80 small-prismatic LFP cells (5 kWh @ ~£0.10/Wh ⇒ £6 each)
  // dominate plus a hybrid inverter / BMS combo and small-magnetic chokes.
  // Predicted installed ASP £550/kWh (band £450-£750/kWh, 8% under centre)
  // under cost-stack compound 1.590× × W3 1.0. Flag for re-calibration
  // once a real residential_ess p5 state lands in the iter pipeline.
  residential_ess: {
    battery_cell: 15.0,             // 100 Ah LFP module, ~£0.10/Wh × 1.5 kWh/cell at 1000/yr OEM
    oem_subsystem: 2000.0,          // hybrid inverter + BMS combo, distribution box (£500-£3k mixed)
    electronic_power_module: 500.0, // string inverter SiC half-bridges (£200-£1k @ 1000/yr)
    magnetic: 80.0,                 // EMI choke + small isolation transformer
    structural_polymer: 1.50,       // cell-insulation pads (down-anchor mirrors BESS pattern)
    electronic_connector: 1.00,     // small busbar strips (down-anchor mirrors BESS pattern)
    sensor: 4.00,                   // NTC thermistors + cell voltage monitor (down-anchor)
  },

  // -------------------------------------------------------------------------
  // 2026-05-19 — heat pump residential overrides (audit-derived, high
  // confidence). 76/160 BoM lines (48%) were under-flagged by Engine C in the
  // /tmp/heatpump-postenvelope-retry-20260518 run because the canonical
  // COMPONENT_CURVES anchors (consumer-electronics scale) under-anchor every
  // heatpump industrial-pricing component. Engine C top_under_flags ref
  // medians (1-off distributor / MSRP, the dimensionally correct anchor for
  // referenceUnitCostFor) were used to derive these per-class anchors.
  //
  // Validation target: re-run heatpump → Engine C in_range count climbs from
  // 7 → ≥80 (single-digit residual UNDER after fix).
  //
  // Same overrides applied across 4 emitted aliases (mini_split_heatpump,
  // heatpump, thermal_system, heat_pump) because referenceUnitCostFor does no
  // slug normalisation. Order mirrors the audit's confidence ranking.
  // -------------------------------------------------------------------------
  mini_split_heatpump: {
    motor_actuator: 350.0,          // BLDC compressor motor (£300-£800) + EC fan motors (£60-£300)
    oem_subsystem: 600.0,           // scroll/rotary compressor assemblies + hydronic pump-stations (£400-£1500)
    structural_metal: 300.0,        // sheet-metal acoustic enclosures, condenser brackets (£200-£500)
    sensor: 250.0,                  // R290 gas sensors, pressure transducers, flow switches (£200-£600)
    structural_polymer: 130.0,      // Armaflex pipe insulation, condenser jacket (£100-£250 per roll/sheet)
    safety_consumable: 40.0,        // door interlocks, surge protectors, fuse holders 230V (£15-£250)
    electronic_cable: 95.0,         // AC/DC wiring loom, chassis earth braid (£60-£1400)
    mechanical_assembly: 180.0,     // fan coil assembly, crankshaft bearing for compressor (£100-£400)
    fluid_path: 200.0,              // thermowells, tapping valves, braze fittings on refrigerant circuit (£100-£400)
    electronic_passive: 30.0,       // R290 inverter DC link caps £20-£80 each (canonical £0.35 anchors a resistor)
    thermal: 65.0,                  // IGBT heatsink, PSU TIM pad (£40-£120)
  },
  heatpump: {
    motor_actuator: 350.0,
    oem_subsystem: 600.0,
    structural_metal: 300.0,
    sensor: 250.0,
    structural_polymer: 130.0,
    safety_consumable: 40.0,
    electronic_cable: 95.0,
    mechanical_assembly: 180.0,
    fluid_path: 200.0,
    electronic_passive: 30.0,
    thermal: 65.0,
  },
  heat_pump: {
    motor_actuator: 350.0,
    oem_subsystem: 600.0,
    structural_metal: 300.0,
    sensor: 250.0,
    structural_polymer: 130.0,
    safety_consumable: 40.0,
    electronic_cable: 95.0,
    mechanical_assembly: 180.0,
    fluid_path: 200.0,
    electronic_passive: 30.0,
    thermal: 65.0,
  },
  thermal_system: {
    motor_actuator: 350.0,
    oem_subsystem: 600.0,
    structural_metal: 300.0,
    sensor: 250.0,
    structural_polymer: 130.0,
    safety_consumable: 40.0,
    electronic_cable: 95.0,
    mechanical_assembly: 180.0,
    fluid_path: 200.0,
    electronic_passive: 30.0,
    thermal: 65.0,
  },
}

/**
 * Resolve the reference unit cost for a (product_class, component_class) pair.
 * Falls back to the canonical COMPONENT_CURVES anchor when no override exists.
 * Returns 0 when the component class is unknown.
 */
export function referenceUnitCostFor(
  componentClass: ComponentClass,
  productClassSlug?: string | null,
  scale?: { nameplateKwh?: number },
): number {
  if (productClassSlug) {
    // UTILITY-TAIL SCALE GATE (2026-07-09, Powerwall exit-32 root): the bess /
    // energy_storage override sets are CALIBRATED FOR UTILITY SCALE ("3-10 MWh,
    // containerised" — the table's own comment): oem_subsystem £10k anchors a
    // BMS-master/EMS-PC-class subsystem, battery_cell £100 anchors a 280 Ah
    // (~1 kWh) prismatic. A 14 kWh residential wall unit hit the SAME anchors →
    // £10,000 e-stop buttons and £93,020/kWh (186× the class band, exit 32).
    // An override encodes "this product uses the class's UPPER-magnitude tail" —
    // true only at utility scale. Gate: the energy-storage override set applies
    // only when the design's nameplate says utility (≥ 100 kWh, the containerised
    // threshold); below it the canonical class anchors hold (oem_subsystem £280,
    // battery_cell small-cell ref). Backward compatible: callers that pass no
    // scale (or a non-energy class) are byte-identical.
    const isEnergyStorageSlug =
      /^(bess|energy_storage|battery_energy_storage|bess-utility-scale)$/.test(productClassSlug)
    const nameplateKwh = scale?.nameplateKwh
    const utilityTailApplies =
      !isEnergyStorageSlug || !Number.isFinite(nameplateKwh as number) || (nameplateKwh as number) >= 100
    if (utilityTailApplies) {
      const overrides = PRODUCT_CLASS_REFERENCE_OVERRIDES[productClassSlug]
      if (overrides && typeof overrides[componentClass] === 'number') {
        return overrides[componentClass] as number
      }
    }
  }
  const c = COMPONENT_CURVES[componentClass]
  return c ? c.reference_unit_cost_gbp : 0
}

/**
 * Absolute per-component-class minimum unit cost — applied as a clamp AFTER
 * the volume curve. Universal fix 2026-05-20 (iter-8 council finding A): the
 * VF iter-7 BoM showed catastrophic under-pricing — 40ft ISO container at
 * £3.38 (real ~£5,000), Osram LED panel £0.38 (real ~£250), Kingspan PIR
 * panel £0.33 (real ~£300), Pilz PNOZ S4 safety relay £0.03 (real £150-300).
 *
 * The cause was the curve fallback producing impossibly low values when the
 * product_class had no override AND the high-volume curve multiplier was
 * tiny. The fix: a class-level floor that the curve cannot dip below
 * regardless of volume.
 *
 * These are the absolute minimum unit costs at ANY production volume. The
 * curve can still go ABOVE the floor (high-margin or low-volume cases) but
 * never below. Engineering sanity floors — anything cheaper would suggest
 * a misclassified part rather than a real high-volume economy.
 */
export const COMPONENT_CLASS_FLOORS_GBP: Partial<Record<ComponentClass, number>> = {
  electronic_ic: 5,             // Industrial IC / MCU minimum at 100k/yr
  electronic_passive: 0.3,      // R/C/L discrete passive at volume
  electronic_discrete: 0.3,     // Diode, small MOSFET, BJT minimum
  electronic_pcb: 12,           // Industrial PLC/controller PCB minimum
  electronic_connector: 0.8,    // Industrial connector minimum
  electronic_cable: 1.5,        // Industrial cable per metre, even at 10k/yr
  electronic_power_module: 35,  // IGBT/MOSFET module minimum
  sensor: 30,                   // Cheapest real industrial sensor (NTC thermistors are pinned in emitter; cascade-miss sensors are gas/pressure/arc-flash class, real floor £30-£130)
  motor_actuator: 25,           // Smallest industrial motor/actuator
  magnetic: 15,                 // Transformer, choke, contactor coil
  optical: 6,                   // LED / display / lens / photodiode minimum
  structural_metal: 40,         // Bare custom-fab steel piece minimum
  structural_polymer: 1.0,      // Label / pad / spacer / grommet — label floor ≥ £1 (Brady / HellermannTyton)
  mechanical_fastener: 0.05,    // Bolt / nut / washer high-volume minimum
  mechanical_assembly: 15,      // Industrial assembly/bracket minimum
  battery_cell: 25,             // LFP prismatic floor at 50k+/yr — never £0.10
  thermal: 25,                  // Heat exchanger / insulation panel / heatsink
  fluid_path: 2,                // Industrial fitting/valve minimum
  safety_consumable: 3,         // E-stop button, gasket, fire cartridge
  oem_subsystem: 150,           // "OEM subsystem" implies a complete sub-assembly
  // C4 sub-class floors (2026-05-28)
  oem_hvac_chiller: 1500,       // Smallest viable industrial chiller unit
  oem_fire_safety: 500,         // Fire panel / suppression cabinet minimum
  oem_smoke_detection: 40,      // Cheapest addressable point detector
  // U2 per-cycle consumable floor (2026-05-29)
  consumable: 0.05,             // Rockwool plug / desiccant sachet minimum
}

export function componentClassFloorGbp(componentClass: ComponentClass): number {
  return COMPONENT_CLASS_FLOORS_GBP[componentClass] ?? 0
}

// ---------------------------------------------------------------------------
// U1 — UNIVERSAL PER-CLASS PRICE CEILING (2026-05-29)
//
// PURPOSE
// -------
// Null-MPN / cascade-miss items priced via the Engine-B curve can produce
// absurd unit prices even after the reference override and volume discount,
// because the REFERENCE itself is a class-wide median that may be 10-100× the
// actual commodity price for that specific part type.
//
// Confirmed examples before this map:
//   • vertical_farm: rockwool propagation cube (structural_polymer, qty 2,500)
//     → Engine B ref £22 × curve 1.0 = £22/cube → £55,000 total.
//     Real Grodan / Cultilene cube: £0.15-£0.50. Ceiling £50 caps this.
//   • null-MPN branch breaker (safety_consumable) → Engine B ref £6.50 ×
//     curve high = £6,680 (curve multiplier < 1 but ref × qty still absurd
//     because the BESS oem_subsystem override inflated the neighbour classes).
//     Ceiling £400 caps the class-level estimate to a realistic breaker price.
//   • electronic_connector null-MPN (e.g. a generic M12 connector in a BESS)
//     → Engine B ref £2.50 × 0.55 curve = £1.38. Still 5-10× real commodity
//     price for a standard M12 at that volume. Ceiling £50 provides headroom
//     for a real high-end connector while preventing absurd outliers.
//
// DESIGN RULES
// • This ceiling ONLY applies to the Engine-B curve/median path (null-MPN,
//   cascade-miss). Pinned parts, curated-table parts, and DB-cached real prices
//   MUST NOT be clipped. The enforcement point in curveEstimateFor() ensures this.
// • Values are chosen to be generous enough to never clip a legitimate part in
//   that class (e.g. a real 32-way terminal block at £45 clears the £50 ceiling;
//   a Molex MX150 automotive connector at £12 clears it easily). They only clip
//   the curve when the Engine-B median grossly exceeds the realistic single-unit
//   commodity price.
// • Benefits EVERY product class, not just VF: a BESS or HAPS BoM with a
//   null-MPN structural_polymer part will also be capped.
// • Not all classes need a ceiling — most are calibrated closely enough that
//   the class floor + sanity band already bound them. Only classes with
//   demonstrated gross-over-price failure modes are listed.
// ---------------------------------------------------------------------------

export const PRICE_CEILING_BY_COMPONENT_CLASS: Partial<Record<ComponentClass, number>> = {
  // structural_polymer: rockwool cube (£0.15-0.50), gasket (£1-5), label (£1-3),
  // small injection-moulded part (£0.50-£20). No legitimate single structural
  // polymer BoM line item exceeds £50 when null-MPN (a real annotated tool /
  // mould / housing at specific SKU bypasses the curve entirely).
  structural_polymer: 50,

  // safety_consumable: MCB/MCCB/fuse (£3-£80), E-stop button (£20-£80), fire
  // cartridge (£50-£200), arc-flash relay (£150-£400). Circuit breakers above
  // £400 are invariably pinned (Eaton, ABB, Schneider named SKUs) and bypass
  // the curve. Null-MPN branch breakers capped at £400.
  safety_consumable: 400,

  // sensor: thermistor (£0.30-£2), NTC module (£1-£5), basic PT100 (£8-£25),
  // typical process sensor (£30-£200). The class ceiling caps a null-MPN sensor
  // at £600 — generous enough to allow a real industrial pressure transmitter
  // (£80-£300) and a Pt100 head assembly (£150-£400) but clips the curve when
  // the class median pulls toward a LiDAR or INS that should be a pinned part.
  sensor: 600,

  // electronic_connector: JST/Molex commodity (£0.10-£1), RJ45/M12 (£1-£8),
  // high-density industrial connector (£8-£40). The class ceiling of £50 allows
  // a real multi-pin military-spec connector but clips the null-MPN path when
  // the Engine-B curve reaches the class median which may reflect a high-end
  // subsea connector rather than a typical VF/BESS board-level connector.
  electronic_connector: 50,

  // consumable: rockwool/perlite units (£0.15-£4), filter cartridge (£5-£40),
  // nutrient bag (£10-£50), desiccant pack (£1-£10). Per-cycle inputs rarely
  // exceed £50 per unit in a production agriculture / industrial context.
  consumable: 50,
}

/**
 * Return the universal per-class price ceiling for null-MPN / median-anchored
 * Engine-B curve estimates, or undefined when no ceiling applies to the class.
 *
 * Usage (in curveEstimateFor):
 *   const ceil = classCeilingGbp(cls)
 *   if (ceil !== undefined && central > ceil) central = Math.max(floor, ceil)
 */
export function classCeilingGbp(componentClass: ComponentClass): number | undefined {
  return PRICE_CEILING_BY_COMPONENT_CLASS[componentClass]
}

// ---------------------------------------------------------------------------
// U2 — CONSUMABLE CLASSIFICATION (2026-05-29)
//
// Per-cycle operating inputs (growing media, filters, desiccant, reagents)
// are NOT capital items and must NOT appear in the capital/build BoM total.
// They belong in a separate consumables segment so investors and procurement
// teams can distinguish recurring OPEX-style inputs from one-time CAPEX.
//
// Currently the only ComponentClass that is unconditionally consumable is
// 'consumable' itself. If the taxonomy grows (e.g. a 'reagent' or 'nutrient'
// sub-class), add it to CONSUMABLE_COMPONENT_CLASSES — the BoM aggregation
// logic should call isConsumable() rather than hardcoding the class name.
//
// WHAT THE MAIN AGENT MUST DO (wiring — NOT done here):
//   1. Teach the classifier prompt that rockwool / perlite / growing media /
//      filter cartridges → class = 'consumable'.
//   2. In the BoM sum / subtotal code, filter out isConsumable(cls) rows from
//      the capital total, and sum them separately as 'per_cycle_consumables_gbp'.
//   3. In the renderer, show the consumables sub-table beneath the capital BoM.
// ---------------------------------------------------------------------------

export const CONSUMABLE_COMPONENT_CLASSES: ReadonlySet<ComponentClass> = new Set<ComponentClass>([
  'consumable',
])

/**
 * Returns true when the component class represents a per-cycle operating input
 * (growing media, filter, desiccant, reagent, nutrient) that must be excluded
 * from the capital/build BoM total.
 *
 * Use this predicate in:
 *   • BoM aggregation (exclude from capital subtotal, sum separately)
 *   • Renderer (separate consumables segment)
 *   • Gate B-5 / B-7 (exclude from cost-stack ratio checks on capital BoM)
 */
export function isConsumable(componentClass: ComponentClass): boolean {
  return CONSUMABLE_COMPONENT_CLASSES.has(componentClass)
}

// ---------------------------------------------------------------------------
// C5 — PER-CLASS PRICE SANITY BOUNDS (2026-05-28)
//
// BLOCKER per council (GLM/Kimi). Every estimate or curve price that falls
// outside [min_gbp, max_gbp] for its component class is clamped to the band
// AND flagged with `price_sanity_clamped: true` in the partVerification row.
// This is the UNIVERSAL backstop that runs AFTER keyword floors/ceilings; it
// catches residual implausibles that individual keyword rules missed.
//
// Root cause it fixes: the `oem_subsystem` BESS override (£10,000 ref) has no
// ceiling at all, so a liquid-cooling chiller, a container AC unit, AND an
// aspirating smoke detector all render £10,000. The `sensor` class curves to
// ~£1 for a single thermistor at 100k+/yr volume — real smoke/aspirating
// detection heads start at £40. Both are clamped by these bounds.
//
// DESIGN RULES
// • min = the absolute real-world floor for a SINGLE UNIT of this class in
//   any context (not zero — that would allow the £1 sensor bug).
// • max = the highest plausible single-line-item price for this class.
//   For oem_subsystem it is £50,000 (a large transformer or complete BMS
//   rack). For sensor it is £5,000 (a VESDA LaserFOCUS or high-spec INS
//   module). Setting max too low clips legitimate high-value parts; setting
//   it too high defeats the purpose.
// • Omitting a class means "no bound" — the keyword floors/ceilings still apply.
// • The bounds are independent of product class (BESS vs heatpump vs drone).
//   Product-class overrides shift the REFERENCE cost but must never push the
//   ESTIMATE outside these physics-of-procurement bounds.
//
// CLAMPING CONTRACT (enforced in curveEstimateFor in estimate-missing-prices.tsx)
// 1. Apply per-class floor from COMPONENT_CLASS_FLOORS_GBP first (raises low).
// 2. Apply keyword floor (may raise further).
// 3. Apply keyword ceiling (may reduce).
// 4. Apply CLASS_PRICE_SANITY_BOUNDS min/max as the final clamp (universal backstop).
// 5. If clamped → set `price_sanity_clamped: true` + log the breach.
// ---------------------------------------------------------------------------

export type ClassSanityBand = { min_gbp: number; max_gbp: number }

export const CLASS_PRICE_SANITY_BOUNDS: Partial<Record<ComponentClass, ClassSanityBand>> = {
  // Electronics
  electronic_ic:           { min_gbp: 0.10,    max_gbp: 5_000 },
  electronic_passive:      { min_gbp: 0.005,   max_gbp: 500 },
  electronic_discrete:     { min_gbp: 0.05,    max_gbp: 2_000 },
  electronic_pcb:          { min_gbp: 5,       max_gbp: 10_000 },
  electronic_connector:    { min_gbp: 0.10,    max_gbp: 2_000 },
  electronic_cable:        { min_gbp: 0.50,    max_gbp: 5_000 },
  electronic_power_module: { min_gbp: 10,      max_gbp: 20_000 },
  sensor:                  { min_gbp: 0.30,    max_gbp: 5_000 },
  // Electro-mechanical
  motor_actuator:          { min_gbp: 5,       max_gbp: 25_000 },
  magnetic:                { min_gbp: 2,       max_gbp: 50_000 },
  optical:                 { min_gbp: 0.50,    max_gbp: 20_000 },
  // Structural
  structural_metal:        { min_gbp: 5,       max_gbp: 50_000 },
  structural_polymer:      { min_gbp: 0.05,    max_gbp: 5_000 },
  mechanical_fastener:     { min_gbp: 0.01,    max_gbp: 200 },
  mechanical_assembly:     { min_gbp: 5,       max_gbp: 20_000 },
  // Cells / thermal / fluid
  battery_cell:            { min_gbp: 5,       max_gbp: 5_000 },
  thermal:                 { min_gbp: 5,       max_gbp: 15_000 },
  fluid_path:              { min_gbp: 0.50,    max_gbp: 10_000 },
  safety_consumable:       { min_gbp: 0.50,    max_gbp: 5_000 },
  // OEM subsystems — max_gbp = 50k covers the largest single catalogue unit
  // (large transformer, top-tier BMS master). The £10k BESS per-product-class
  // reference sits inside the band; the C4 sub-classes have their own tighter bands.
  oem_subsystem:           { min_gbp: 50,      max_gbp: 50_000 },
  // C4 sub-classes
  oem_hvac_chiller:        { min_gbp: 800,     max_gbp: 80_000 },
  oem_fire_safety:         { min_gbp: 300,     max_gbp: 20_000 },
  oem_smoke_detection:     { min_gbp: 20,      max_gbp: 3_000 },
  // U2 per-cycle consumable (2026-05-29)
  consumable:              { min_gbp: 0.01,    max_gbp: 500 },
}

/**
 * Clamp an estimated price to the per-class sanity band [min_gbp, max_gbp].
 * Returns the (possibly clamped) price and a flag indicating whether clamping occurred.
 * Never returns a non-positive number.
 */
export function clampToSanityBand(
  price_gbp: number,
  componentClass: ComponentClass,
): { price_gbp: number; clamped: boolean; breach: 'below_min' | 'above_max' | null } {
  const band = CLASS_PRICE_SANITY_BOUNDS[componentClass]
  if (!band) return { price_gbp, clamped: false, breach: null }
  if (price_gbp < band.min_gbp) {
    return { price_gbp: band.min_gbp, clamped: true, breach: 'below_min' }
  }
  if (price_gbp > band.max_gbp) {
    return { price_gbp: band.max_gbp, clamped: true, breach: 'above_max' }
  }
  return { price_gbp, clamped: false, breach: null }
}

// ---------------------------------------------------------------------------
// PER-CATEGORY KEYWORD FLOORS — the systemic fix for cascade-miss parts that
// belong to a high-value *category* trapped inside a low-median ComponentClass.
// Codified 2026-05-28 after council L59 (part_realism 3.00).
//
// THE PROBLEM the per-CLASS floor above cannot solve
// --------------------------------------------------
// Several ComponentClasses have IRREDUCIBLE intra-class magnitude variance.
// `sensor` (canonical ref £12, floor £4) legitimately spans an NTC thermistor
// (~£0.40) to a VESDA aspirating-smoke detector (~£1,850) to a Crowcon gas
// detector (~£380). A single per-class reference + floor cannot serve both
// ends: anchoring the median at £12 leaves a cascade-MISS detector pricing at
// ~£4-£8 (the curve drives ref × multiplier toward the floor), while raising
// the `sensor` floor to £350 to catch the detector would over-price the 896
// NTC thermistors in a BESS BoM by ~900×. The same trap hits `safety_consumable`
// (a £2 fuse vs a £400 fire detector), `electronic_pcb` (a £15 break-out board
// vs a £400 Siemens PLC CPU), `oem_subsystem` (whose per-PRODUCT-CLASS overrides
// push it to £10k for BESS / £80k for HAPS, so a misclassified industrial PC
// renders £10,000), `structural_metal` (a £40 bracket vs a £250 IP66 cabinet),
// and `mechanical_assembly` (a £15 hinge vs a £1,500 Grundfos pump).
//
// THE FIX
// -------
// A keyword→floor table that fires ONLY when the part NAME (or manufacturer +
// part-number text) matches a known high-value category. Matched parts get a
// category-appropriate floor (gas detector £350, aspirating smoke detector head
// £1,500, PLC CPU £250, fieldbus gateway £300, UPS £180, IP66 steel enclosure
// £150, industrial pump £1,200, DIN contactor £40). Unmatched parts (thermistor,
// fuse, bracket, hinge) are untouched and keep their normal low ComponentClass
// floor — so genuinely-cheap commodities stay cheap.
//
// This is the per-PART `CURATED_INDUSTRIAL_PRICES` table in
// estimate-missing-prices.tsx generalised to per-CATEGORY keyword matching:
// it covers ANY VESDA / Crowcon / Beckhoff / Rittal, not named SKUs. It is
// independent of the LLM classifier (no new ComponentClass to learn — the
// "you cannot price items that do not exist" routing trap is avoided) and it
// leaves every curve SHAPE untouched — it only raises the magnitude FLOOR.
//
// SEED DATA: ingesting real catalogue prices for these categories into
// forge-truth.db `distributor_cascade_cache` lets the cascade serve them
// DB-first (miss=0, priceGBP populated) and this keyword table can shrink.
//
// ORDER MATTERS: entries are evaluated top-to-bottom; first match wins. Put
// the MOST SPECIFIC / HIGHEST-VALUE patterns first (aspirating smoke detector
// before generic detector; industrial pump before generic pump).
// ---------------------------------------------------------------------------

export type CategoryKeywordFloor = {
  // Matched case-insensitively against the part name (and a manufacturer +
  // part-number fallback string). Word-boundary anchored where sensible to
  // avoid sub-string false positives (e.g. "fuse" must not match "refuse").
  pattern: RegExp
  floor_gbp: number
  note: string
}

export const CATEGORY_KEYWORD_FLOORS_GBP: CategoryKeywordFloor[] = [
  // ── Fire / gas / smoke detection (council L59 primary offenders) ─────────
  // Aspirating smoke detection (ASD) head — VESDA VLF/VLP, Wagner TITANUS,
  // Securiton. A detector head is £1,500-£2,200; the full bore + pipework
  // network is more, but the BoM line is usually the head. Anchor £1,500.
  { pattern: /\b(aspirating|aspiration|asd)\b.*\b(smoke|detector|detection)\b|\b(vesda|titanus)\b/i,
    floor_gbp: 1500, note: 'aspirating smoke detection head (VESDA / TITANUS class), real £1,500-£2,200' },
  // Conventional / addressable smoke / heat detector point — £40-£120. These
  // are NOT the absurd £1 case; keep their floor modest so we do not over-price
  // a £45 Apollo point detector. Listed AFTER aspirating so VESDA wins.
  { pattern: /\b(smoke|heat|flame|optical)\b.*\bdetector\b|\bdetector\b.*\b(smoke|heat|flame)\b/i,
    floor_gbp: 45, note: 'conventional point smoke/heat/flame detector, real £40-£120' },
  // Fixed gas detector — Crowcon, Dräger, Honeywell, MSA, Sensit. A
  // transmitter + sensor head for CH4 / H2 / CO / O2 is £300-£500. Anchor £350.
  { pattern: /\b(gas|methane|ch4|hydrogen|h2|propane|co2?|oxygen|o2|toxic|combustible|lel)\b.*\b(detector|detection|monitor|transmitter)\b|\b(crowcon|draeger|dräger|gasalert|sensepoint)\b/i,
    floor_gbp: 350, note: 'fixed gas detector / transmitter (Crowcon / Dräger class), real £300-£500' },
  // Generic detector that did not match a more specific pattern — a real
  // detector of any kind is rarely under £40. Modest catch-all.
  { pattern: /\bdetector\b/i,
    floor_gbp: 40, note: 'generic detector (catch-all), real ≥ £40' },

  // ── Process transducers + water-chemistry / environmental sensors ────────
  // Industrial pressure / flow / level transducer — Gems, WIKA, Endress+Hauser,
  // Danfoss. 4-20 mA loop transducers are £80-£300. Anchor £90.
  { pattern: /\b(pressure|flow|level|differential|loop)\b.*\b(transducer|transmitter)\b|\btransducer\b/i,
    floor_gbp: 90, note: 'industrial process transducer/transmitter, real £80-£300' },
  // Water-chemistry probe — pH, EC/conductivity, dissolved-O2, ORP, turbidity.
  // Industrial inline probes (Hamilton, Endress+Hauser, Atlas Scientific
  // industrial) are £80-£600; sterile bioreactor probes higher (handled by the
  // bioreactor product-class sensor override at £200). Anchor £80.
  { pattern: /\b(ph|conductivity|ec|dissolved.?oxygen|do|orp|turbidity|chlorine|salinity|water.?chem)\b.*\b(probe|sensor|electrode|cell)\b/i,
    floor_gbp: 80, note: 'water-chemistry probe (pH/EC/DO/ORP), real £80-£600' },
  // Environmental sensor — CO2 / VOC / particulate / humidity+temp duct or
  // room sensor (Sensirion, E+E Elektronik, Vaisala). £40-£120. Anchor £40.
  { pattern: /\b(co2|voc|particulate|pm2|humidity|rh|ambient|air.?quality|environmental)\b.*\b(sensor|probe|transmitter)\b/i,
    floor_gbp: 40, note: 'environmental sensor (CO2/VOC/RH), real £40-£120' },

  // ── Industrial control gear + computers + comms ──────────────────────────
  // Industrial / panel PC, embedded controller — Beckhoff CX, Advantech UNO/ARK,
  // Siemens IPC, Kontron. £400-£1,500. Anchor £450. (The curated per-PART table
  // already pins specific Beckhoff/Advantech SKUs; this floors the category for
  // un-pinned cascade-miss variants and prevents the £10k oem_subsystem-override
  // mis-price when an IPC is classified as oem_subsystem in a BESS BoM.)
  { pattern: /\b(industrial|panel|embedded|edge|box)\b.*\b(pc|computer|controller|ipc)\b|\b(ipc)\b|\b(beckhoff|advantech|kontron)\b/i,
    floor_gbp: 450, note: 'industrial / panel PC (Beckhoff / Advantech class), real £400-£1,500' },
  // PLC CPU / I-O module / safety controller — Siemens S7, Allen-Bradley
  // CompactLogix, Schneider M340, Pilz PNOZ, WAGO PFC. £250-£800. Anchor £250.
  { pattern: /\b(plc|s7-?\d|compactlogix|controllogix|pnoz|safety.?(plc|controller|relay))\b|\bplc\b.*\b(cpu|module|rack)\b|\b(cpu|i\/?o)\b.*\bmodule\b/i,
    floor_gbp: 250, note: 'PLC CPU / I-O / safety controller (Siemens / AB / Pilz class), real £250-£800' },
  // Fieldbus / protocol gateway, managed industrial switch — HMS Anybus, Moxa,
  // Hirschmann, ProSoft. £300-£700. Anchor £300.
  { pattern: /\b(fieldbus|protocol|modbus|profinet|ethercat|ethernet\/?ip|bacnet)\b.*\b(gateway|converter|coupler)\b|\b(anybus|hirschmann|prosoft)\b|\bmanaged\b.*\bswitch\b/i,
    floor_gbp: 300, note: 'fieldbus / protocol gateway or managed switch (Anybus / Moxa class), real £300-£700' },
  // HMI touchscreen panel — Siemens SIMATIC, Pro-face, Weintek. £400-£1,200.
  // Anchor £400.
  { pattern: /\b(hmi|simatic\s*hmi)\b|\b(operator|touch.?screen)\b.*\b(panel|terminal|hmi)\b|\b(pro-?face|weintek)\b/i,
    floor_gbp: 400, note: 'HMI touchscreen panel (SIMATIC / Pro-face class), real £400-£1,200' },

  // ── Power conditioning ───────────────────────────────────────────────────
  // DIN-rail / industrial UPS — Phoenix QUINT-UPS, Siemens SITOP, Eaton 9SX.
  // £180-£800. Anchor £180.
  { pattern: /\b(ups|uninterruptible|quint-?ups|sitop)\b|\buninterruptible power\b/i,
    floor_gbp: 180, note: 'industrial / DIN-rail UPS (Phoenix QUINT / Eaton class), real £180-£800' },

  // ── Enclosures ───────────────────────────────────────────────────────────
  // IP-rated steel / stainless / polycarbonate enclosure or cabinet — Rittal AE/
  // VX, Schneider Spacial, Fibox, Eldon. A wall-box is £120-£300; a floor-
  // standing bay is £400+. Anchor £150 (covers the common wall-box; bigger bays
  // come from the curve / overrides which already exceed the floor).
  { pattern: /\b(ip\s?\d{2}|nema\s?\d)\b.*\b(enclosure|cabinet|box|housing)\b|\b(enclosure|cabinet)\b.*\b(steel|stainless|316l|304|polycarbonate|glass.?fibre|grp)\b|\b(rittal|fibox|eldon|spacial)\b/i,
    floor_gbp: 150, note: 'IP-rated steel / polycarbonate enclosure (Rittal / Spacial class), real £120-£600' },

  // ── Rotating / fluid equipment ───────────────────────────────────────────
  // Industrial pump — Grundfos NB/CR/CM, KSB, Wilo, Lowara end-suction or
  // multistage. £1,200-£2,000. Anchor £1,200. (Listed before any generic
  // "pump" so a real industrial pump beats the circulator-pump floor.)
  { pattern: /\b(end.?suction|multistage|centrifugal|positive.?displacement|peristaltic|process|booster)\b.*\bpump\b|\b(grundfos|ksb|wilo|lowara)\b/i,
    floor_gbp: 1200, note: 'industrial pump (Grundfos NB/CR / KSB class), real £1,200-£2,000' },
  // Small circulator / dosing pump — keep modest so we do not over-price a
  // £80 circulator. Listed AFTER the industrial pump pattern.
  { pattern: /\b(circulator|dosing|metering)\b.*\bpump\b/i,
    floor_gbp: 80, note: 'small circulator / dosing pump, real £80-£300' },

  // ── Switchgear ───────────────────────────────────────────────────────────
  // DIN / IEC contactor (NOT the HV/DC bus contactor — those are pinned parts
  // with their own datasheet entries). A standard 3-pole AC contactor is £40-£60.
  { pattern: /\bcontactor\b/i,
    floor_gbp: 40, note: 'DIN / IEC contactor, real £40-£60' },
]

/**
 * Resolve a per-category keyword floor for a cascade-MISS part. Returns the
 * floor GBP + a note when the part name (or the manufacturer + part-number
 * fallback) matches a known high-value category, else null. Consulted by the
 * estimator AFTER the per-class floor: the effective floor is
 * max(componentClassFloorGbp(cls), keywordFloorGbp(name)?.floor_gbp ?? 0).
 *
 * Matching is intentionally name-first because the BoM word name ("aspirating
 * smoke detector", "Grundfos NB 32-125 process pump") is the most reliable
 * category signal; manufacturer + part-number is a secondary fallback for
 * cases where the name is terse ("detector head, VESDA VLF-500").
 */
export function keywordFloorGbp(
  partName: string | null | undefined,
  manufacturer?: string | null,
  partNumber?: string | null,
): { floor_gbp: number; note: string } | null {
  const hay = [
    String(partName ?? ''),
    String(manufacturer ?? ''),
    String(partNumber ?? ''),
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
  if (!hay) return null
  for (const e of CATEGORY_KEYWORD_FLOORS_GBP) {
    if (e.pattern.test(hay)) return { floor_gbp: e.floor_gbp, note: e.note }
  }
  return null
}

// ---------------------------------------------------------------------------
// PER-CATEGORY KEYWORD CEILINGS — the DOWN-direction complement of the floor
// table. Same council L59 finding, opposite failure mode: a cascade-MISS part
// that is MISCLASSIFIED into a high-anchor class renders absurdly EXPENSIVE.
//
// The worst case: a £450 Beckhoff industrial PC or a £520 Phoenix QUINT-UPS
// classified as `oem_subsystem` in a BESS BoM inherits the BESS per-product-
// class override `oem_subsystem: 10000` (calibrated for BMS master + EMS PC +
// LV switch-panel, which genuinely cost £2k-£20k) and renders £9,161. The floor
// table cannot fix this — it only raises values UP. Lowering the BESS
// `oem_subsystem` override is also wrong: it would under-price the real £2k-£20k
// subsystems it was built for. The correct systemic fix is a per-CATEGORY
// CEILING that caps the small-but-misclassified part regardless of which class
// it landed in.
//
// Ceilings apply ONLY to categories that have a hard upper bound in reality: an
// industrial PC is never £10k, a DIN-rail UPS is never £10k, a fieldbus gateway
// is never £10k, a DIN contactor is never £10k. Categories with a genuine high
// tail (industrial pump up to ~£5k for big bare-shaft units; IP-rated bay
// enclosures up to ~£2k) get a generous ceiling or NONE so we never clip a
// legitimately-expensive part. Where a category has both a floor and a ceiling,
// floor < ceiling by construction.
//
// Effective price = clamp(curve, floor=max(classFloor, keywordFloor),
//                                ceiling=keywordCeiling ?? +inf).
// Floor is applied first, then ceiling — so a part can never be pushed below
// its floor by the ceiling (the ranges never cross for a single category).
// ---------------------------------------------------------------------------

export type CategoryKeywordCeiling = {
  pattern: RegExp
  ceiling_gbp: number
  note: string
}

export const CATEGORY_KEYWORD_CEILINGS_GBP: CategoryKeywordCeiling[] = [
  // Industrial / panel PC — top of the catalogue range for a fanless box PC
  // with a couple of expansion slots is ~£2,000 (a high-end multi-slot IPC).
  // £10k = misclassification. Ceiling £2,500 (headroom over the £400-£1,500
  // typical band so we never clip a loaded server-grade IPC).
  { pattern: /\b(industrial|panel|embedded|edge|box)\b.*\b(pc|computer|controller|ipc)\b|\b(ipc)\b|\b(beckhoff|advantech|kontron)\b/i,
    ceiling_gbp: 2500, note: 'industrial / panel PC — ceiling £2,500 (never the £10k oem_subsystem override)' },
  // PLC / safety controller — a fully-populated rack is ~£2,000; a single CPU
  // far less. Ceiling £2,500.
  { pattern: /\b(plc|s7-?\d|compactlogix|controllogix|pnoz|safety.?(plc|controller|relay))\b|\bplc\b.*\b(cpu|module|rack)\b/i,
    ceiling_gbp: 2500, note: 'PLC / safety controller — ceiling £2,500' },
  // Fieldbus gateway / managed switch — top of range ~£1,500. Ceiling £1,800.
  { pattern: /\b(fieldbus|protocol|modbus|profinet|ethercat|ethernet\/?ip|bacnet)\b.*\b(gateway|converter|coupler)\b|\b(anybus|hirschmann|prosoft)\b|\bmanaged\b.*\bswitch\b/i,
    ceiling_gbp: 1800, note: 'fieldbus gateway / managed switch — ceiling £1,800' },
  // HMI panel — large multi-touch panels reach ~£3,000. Ceiling £3,500.
  { pattern: /\b(hmi|simatic\s*hmi)\b|\b(operator|touch.?screen)\b.*\b(panel|terminal|hmi)\b|\b(pro-?face|weintek)\b/i,
    ceiling_gbp: 3500, note: 'HMI touchscreen panel — ceiling £3,500' },
  // DIN-rail / rack industrial UPS — large 3 kVA rack units reach ~£3,000.
  // Ceiling £3,500 (covers genuine large UPS; clips the £10k override case).
  { pattern: /\b(ups|uninterruptible|quint-?ups|sitop)\b|\buninterruptible power\b/i,
    ceiling_gbp: 3500, note: 'industrial UPS — ceiling £3,500' },
  // DIN / IEC contactor — even a large 800 A AC contactor is ~£600 at the
  // extreme; a standard one £40-£60. Ceiling £800. (HV/DC bus contactors are
  // PINNED parts that bypass the curve entirely, so they are never clipped.)
  { pattern: /\bcontactor\b/i,
    ceiling_gbp: 800, note: 'DIN / IEC contactor — ceiling £800 (HV/DC bus contactors are pinned, bypass curve)' },
  // Conventional point smoke / heat / flame detector — never above ~£250.
  // Aspirating detection heads (VESDA / TITANUS) are EXPLICITLY excluded via
  // the negative look-ahead — they legitimately reach £2,200 and the aspirating
  // floor already anchors them at £1,500. (Belt-and-braces: even without the
  // look-ahead, the estimator applies the £1,500 floor before this ceiling and
  // never pushes below the floor, so an aspirating head stays at £1,500.)
  { pattern: /^(?!.*\b(aspirating|aspiration|asd|vesda|titanus)\b)(.*\b(smoke|heat|flame|optical)\b.*\bdetector\b|.*\bdetector\b.*\b(smoke|heat|flame)\b)/i,
    ceiling_gbp: 250, note: 'conventional point detector — ceiling £250 (aspirating ASD heads excluded)' },

  // ── C5 backstop ceilings for oem_subsystem mis-classification (2026-05-28) ─
  // These fire when the rule-based classifier fails to route a chiller or
  // smoke detector to its correct sub-class and it lands in oem_subsystem,
  // inheriting the BESS £10k per-product-class override. The ceiling prevents
  // the worst-case £10k price on parts that genuinely cost £200-£2,500.
  //
  // Aspirating smoke detection head / VESDA — never more than ~£2,500 for
  // the detector head alone (control panel would be oem_fire_safety separately).
  { pattern: /\b(aspirating|aspiration|asd)\b.*\b(smoke|detector|detection)\b|\b(vesda|titanus)\b/i,
    ceiling_gbp: 2500, note: 'aspirating smoke detection head — ceiling £2,500 (oem_subsystem backstop)' },
  // Any smoke / heat / flame / optical detector that survived to this point.
  // Hard cap £300 — a £10k smoke detector is impossible regardless of class.
  { pattern: /\b(smoke|heat|flame|optical)\b.*\bdetector\b|\bdetector\b.*\b(smoke|heat|flame)\b/i,
    ceiling_gbp: 300, note: 'smoke/heat/flame detector — ceiling £300 (oem_subsystem mis-classification backstop)' },
  // Liquid chiller / air-handling unit — a 50 kW industrial chiller is
  // ~£8-£15k; the biggest BESS-class units reach ~£25k. Cap £30,000.
  { pattern: /\b(chiller|liquid.?cool|air.?conditioning|hvac|cooling.?unit|air.?handl)\b/i,
    ceiling_gbp: 30_000, note: 'industrial chiller / AC unit — ceiling £30,000 (prevents oem_subsystem £10k ref from cascading to £28k via curve)' },
  // Container / enclosure AC unit — a standalone rooftop AC for a BESS
  // container is £1,500-£8,000. Hard cap £10,000.
  { pattern: /\b(container.?ac|rooftop.?ac|cabinet.?ac|enclosure.?ac|split.?ac)\b|\b(stulz|emerson.?precision|airedale)\b/i,
    ceiling_gbp: 10_000, note: 'container / cabinet AC unit — ceiling £10,000' },

  // ── Process-instrument backstop ceilings (2026-06-01, Tristan cost-fingerprint) ─
  // Distinct process instruments (a pH transmitter, a CO₂ mass-flow controller,
  // a loop controller, a Mettler transmitter, an auto-sampler skid) all routed
  // to `oem_subsystem` collapse onto the SINGLE class anchor (~£5,280) and emit
  // an identical-price "fingerprint" — many unrelated parts at one price, the
  // signature of mis-bucketing. These ceilings give each instrument TYPE its own
  // realistic top-of-catalogue bound, so the curve path (and the renderer's
  // estimate-tier self-correction) prices them apart instead of flat-pinning.
  // Generous (top of the UK catalogue band) so a real sourced part is never
  // clipped; ordered most-specific-first (MFC before the generic controller).
  //
  // Mass-flow controller / meter (Bronkhorst, Brooks) — top ~£3,000.
  { pattern: /\bmass.?flow\b.{0,12}\b(controller|meter)\b|\bmfc\b|\b(bronkhorst|brooks\s*instrument)\b/i,
    ceiling_gbp: 3000, note: 'mass-flow controller / meter — ceiling £3,000 (instrument anchor de-fingerprint)' },
  // Process / loop / single-loop / PID / panel-mount controller (NOT a PLC, NOT
  // an industrial PC, NOT a motor/charge controller) — top ~£2,500.
  { pattern: /\b(process|loop|single-?loop|universal|panel-?mount|temperature|pid|setpoint)\b.{0,14}\bcontroller\b|\bcontroller\b.{0,10}\b(1\/4.?din|1\/8.?din|din.?rail)\b/i,
    ceiling_gbp: 2500, note: 'process / loop controller — ceiling £2,500 (instrument anchor de-fingerprint)' },
  // Process analyser (gas / liquid / dissolved-oxygen / pH / turbidity / optical)
  // — genuinely expensive; top ~£8,000.
  { pattern: /\b(gas|liquid|process|oxygen|co2|carbon.?dioxide|dissolved|do|ph|turbidity|optical|conductivity|tdl|ndir)\b.{0,16}\banaly[sz]er\b|\banaly[sz]er\b/i,
    ceiling_gbp: 8000, note: 'process analyser — ceiling £8,000 (instrument anchor de-fingerprint)' },
  // Coriolis / magnetic / vortex / ultrasonic flow meter — top ~£4,000.
  { pattern: /\b(coriolis|magnetic|electromagnetic|electro-?mag|vortex|ultrasonic|turbine|thermal.?mass|mag)\b.{0,12}\bflow.?meter\b|\bflow.?meter\b/i,
    ceiling_gbp: 4000, note: 'flow meter — ceiling £4,000 (instrument anchor de-fingerprint)' },
  // Process transmitter (pressure / temperature / level / pH / conductivity /
  // dissolved-O₂ / HART 2-wire — Mettler, Endress+Hauser, Rosemount) — top ~£1,800.
  { pattern: /\btransmitter\b/i,
    ceiling_gbp: 1800, note: 'process transmitter — ceiling £1,800 (instrument anchor de-fingerprint)' },
  // Control / actuated / regulating / modulating valve (valve + actuator) — top ~£3,500.
  { pattern: /\b(control|actuated|regulating|modulating|proportional|electric|pneumatic)\b.{0,12}\bvalve\b/i,
    ceiling_gbp: 3500, note: 'control / actuated valve — ceiling £3,500 (instrument anchor de-fingerprint)' },
  // Dosing / metering / peristaltic / diaphragm process pump — top ~£2,500.
  { pattern: /\b(dosing|metering|peristaltic|diaphragm|gear|lobe)\b.{0,10}\bpump\b/i,
    ceiling_gbp: 2500, note: 'dosing / metering pump — ceiling £2,500 (instrument anchor de-fingerprint)' },
  // Load cell / weigh module / weighing sensor — top ~£1,500.
  { pattern: /\b(load.?cell|weigh.?(module|cell|beam|sensor)|weighing.?(module|sensor|cell))\b/i,
    ceiling_gbp: 1500, note: 'load cell / weigh module — ceiling £1,500 (instrument anchor de-fingerprint)' },
]

/**
 * Resolve a per-category keyword ceiling for a cascade-MISS part. Returns the
 * ceiling GBP + a note when the part name matches a category with a hard upper
 * bound, else null. Consulted by the estimator AFTER the floor: the effective
 * price is min(flooredCentral, keywordCeilingGbp(name)?.ceiling_gbp ?? +inf).
 *
 * IMPORTANT: a ceiling is the LAST resort and only applies to the curve path.
 * It must NOT clip a real catalogue price (the curated table + cascade DB +
 * emitter list_price_gbp all run before the curve), nor a PINNED part. It
 * exists solely to stop the curve/override path rendering a misclassified small
 * part at an impossible figure (the £10k IPC case).
 */
export function keywordCeilingGbp(
  partName: string | null | undefined,
  manufacturer?: string | null,
  partNumber?: string | null,
): { ceiling_gbp: number; note: string } | null {
  const hay = [
    String(partName ?? ''),
    String(manufacturer ?? ''),
    String(partNumber ?? ''),
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
  if (!hay) return null
  for (const e of CATEGORY_KEYWORD_CEILINGS_GBP) {
    if (e.pattern.test(hay)) return { ceiling_gbp: e.ceiling_gbp, note: e.note }
  }
  return null
}

// ---------------------------------------------------------------------------
// Convenience — compute the volume-anchored unit cost for a class.
// Optional productClassSlug consults PRODUCT_CLASS_REFERENCE_OVERRIDES so
// industrial-heavy product classes (BESS, etc.) pick up the corrected ref.
// ---------------------------------------------------------------------------

export function estimateUnitCostForClass(
  cls: ComponentClass,
  annual_volume: number,
  productClassSlug?: string | null,
): number {
  const curve = COMPONENT_CURVES[cls]
  if (!curve) return 0
  const ref = referenceUnitCostFor(cls, productClassSlug)
  const m = interpolateCurve(curve.curve, annual_volume)
  const cost = ref * m
  return Math.round(cost * 100) / 100
}

// ---------------------------------------------------------------------------
// List of class labels in canonical order — useful for the classifier
// prompt + the renderer's per-class attribution breakdown.
// ---------------------------------------------------------------------------

export const COMPONENT_CLASS_ORDER: ComponentClass[] = [
  'electronic_ic',
  'electronic_passive',
  'electronic_discrete',
  'electronic_pcb',
  'electronic_connector',
  'electronic_cable',
  'electronic_power_module',
  'sensor',
  'motor_actuator',
  'magnetic',
  'optical',
  'structural_metal',
  'structural_polymer',
  'mechanical_fastener',
  'mechanical_assembly',
  'battery_cell',
  'thermal',
  'fluid_path',
  'safety_consumable',
  'oem_subsystem',
  // C4 sub-classes (2026-05-28)
  'oem_hvac_chiller',
  'oem_fire_safety',
  'oem_smoke_detection',
  // U2 per-cycle consumables (2026-05-29)
  'consumable',
]

// ---------------------------------------------------------------------------
// Sanity check — at construction time, ensure every curve starts at 1.0 and
// is monotonically non-increasing. Throws if a curve is mis-defined.
// ---------------------------------------------------------------------------

for (const cls of COMPONENT_CLASS_ORDER) {
  const c = COMPONENT_CURVES[cls]
  if (!c) throw new Error(`COMPONENT_CURVES missing class ${cls}`)
  if (c.curve.length < 2) throw new Error(`Curve for ${cls} has <2 points`)
  if (c.curve[0].annual_volume !== 1) {
    throw new Error(`Curve for ${cls} must start at volume = 1`)
  }
  if (c.curve[0].unit_cost_multiplier !== 1.0) {
    throw new Error(`Curve for ${cls} must start at multiplier = 1.0`)
  }
  for (let i = 1; i < c.curve.length; i += 1) {
    if (c.curve[i].unit_cost_multiplier > c.curve[i - 1].unit_cost_multiplier) {
      throw new Error(`Curve for ${cls} is non-monotonic at index ${i}`)
    }
  }
}
