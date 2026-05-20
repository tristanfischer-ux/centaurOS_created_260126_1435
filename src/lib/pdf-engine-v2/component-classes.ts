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
    oem_subsystem: 10000.0,         // BMS master + EMS PC + LV panels + meter etc. (£2k-£20k mixed)
    electronic_power_module: 1000.0,// 1700 V IGBT half-bridge for BESS PCS (£600-£1500 @ 100/yr)
    structural_polymer: 0.50,       // dominated by cell-insulation pads (qty 3920, real cost £0.10-£0.30)
    electronic_connector: 0.40,     // dominated by cell-to-cell busbar strips (qty 3808, real cost £0.20-£0.50)
    sensor: 1.00,                   // dominated by NTC thermistors (qty 896, real cost £0.30-£0.50)
  },
  energy_storage: {
    battery_cell: 100.0,
    oem_subsystem: 10000.0,
    electronic_power_module: 1000.0,
    structural_polymer: 0.50,
    electronic_connector: 0.40,
    sensor: 1.00,
  },
  'bess-utility-scale': {
    battery_cell: 100.0,
    oem_subsystem: 10000.0,
    electronic_power_module: 1000.0,
    structural_polymer: 0.50,
    electronic_connector: 0.40,
    sensor: 1.00,
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
    // Calibrated 2026-05-18 for desktop 15 kg/week unit; expanded 2026-05-20
    // (iter-8 council finding A) for containerised 100m² VF (efe55422).
    // Previous overrides covered 4 classes; containerised VF additionally
    // emits structural_metal (40ft container, trolley frames), optical (LED
    // grow panels), thermal (PIR sandwich panels, cooling coils),
    // mechanical_assembly (doors, ramps), electronic_pcb (PLC, HMI), and
    // magnetic (transformers, contactors). Without overrides the curve
    // collapsed every line to £3.38/£4.05/£468 anchor tiers.
    oem_subsystem: 2000.0,          // LED rack module, HVAC compressor, water-treatment skid (£500-£3k mixed)
    motor_actuator: 80.0,           // circulation pumps + nutrient dosing pumps (£20-£200)
    fluid_path: 25.0,               // irrigation fittings + valves (£5-£60)
    sensor: 30.0,                   // pH/EC/temp/light sensors (£10-£100)
    optical: 200.0,                 // Osram PHYTOVYNE-class horticultural LED grow panels (£100-£400)
    structural_metal: 800.0,        // 40ft ISO container shell, trolley frames, custom-fab metalwork (£200-£8000)
    thermal: 100.0,                 // Kingspan PIR sandwich panels, DX cooling coils, dehumidifier coils (£30-£3000)
    mechanical_assembly: 60.0,      // container doors, trolley castors, threshold ramps (£20-£500)
    electronic_pcb: 200.0,          // Siemens PLC, I/O modules, HMI panel (£50-£500)
    electronic_power_module: 60.0,  // LED drivers, VFDs (£30-£500)
    magnetic: 80.0,                 // VFD chokes, transformers, contactor coils (£30-£300)
    safety_consumable: 50.0,        // E-stop buttons, safety relays, fire extinguishers (£15-£300)
  },
  vertical_farm: {
    oem_subsystem: 2000.0,
    motor_actuator: 80.0,
    fluid_path: 25.0,
    sensor: 30.0,
    optical: 200.0,
    structural_metal: 800.0,
    thermal: 100.0,
    mechanical_assembly: 60.0,
    electronic_pcb: 200.0,
    electronic_power_module: 60.0,
    magnetic: 80.0,
    safety_consumable: 50.0,
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
    mechanical_assembly: 350.0,     // aerospace-grade cured composite assemblies, hinges, fittings (£100-£2k)
    structural_polymer: 100.0,      // certified aerospace prepreg + composite parts (£20-£500 each ply / part)
    electronic_cable: 30.0,         // MIL-spec aerospace harnesses (£5-£200)
    electronic_ic: 30.0,            // rad-hardened MCU/FPGA at aerospace qty (£10-£500)
    oem_subsystem: 40000.0,         // autopilot + sat-link + payload computer (£5k-£100k mixed)
    electronic_power_module: 1500.0,// MPPT modules, BLDC controllers (£500-£5k)
    sensor: 300.0,                  // cert-grade IMU, air-data probes (£50-£2000)
    motor_actuator: 1500.0,         // aerospace BLDC propulsion motors (£200-£3000)
    magnetic: 200.0,                // aerospace step-up transformers, BLDC stators
    electronic_pcb: 250.0,          // space-qualified PCBs (£50-£800)
    structural_metal: 300.0,        // CNC'd aluminium fittings, Ti pins (£80-£1000)
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
): number {
  if (productClassSlug) {
    const overrides = PRODUCT_CLASS_REFERENCE_OVERRIDES[productClassSlug]
    if (overrides && typeof overrides[componentClass] === 'number') {
      return overrides[componentClass] as number
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
  sensor: 4,                    // Cheapest industrial sensor
  motor_actuator: 25,           // Smallest industrial motor/actuator
  magnetic: 15,                 // Transformer, choke, contactor coil
  optical: 6,                   // LED / display / lens / photodiode minimum
  structural_metal: 40,         // Bare custom-fab steel piece minimum
  structural_polymer: 0.8,      // Plastic enclosure / pad / spacer
  mechanical_fastener: 0.05,    // Bolt / nut / washer high-volume minimum
  mechanical_assembly: 15,      // Industrial assembly/bracket minimum
  battery_cell: 25,             // LFP prismatic floor at 50k+/yr — never £0.10
  thermal: 25,                  // Heat exchanger / insulation panel / heatsink
  fluid_path: 2,                // Industrial fitting/valve minimum
  safety_consumable: 3,         // E-stop button, gasket, fire cartridge
  oem_subsystem: 150,           // "OEM subsystem" implies a complete sub-assembly
}

export function componentClassFloorGbp(componentClass: ComponentClass): number {
  return COMPONENT_CLASS_FLOORS_GBP[componentClass] ?? 0
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
