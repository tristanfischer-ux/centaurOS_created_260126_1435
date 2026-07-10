// independent-cost-sanity-audit.ts
//
// THE INDEPENDENT COST-SANITY GATE (check B4 of the autonomous-archetype
// self-interrogation loop — `docs/autonomous-archetype-self-interrogation.md`).
// The single highest-value universal addition from the CO₂-mineralisation
// post-mortem (2026-06-03).
//
// WHAT IT DOES (universal, class-agnostic):
//   1. Reads the dossier's HEADLINE cost from state (ex-works / CAPEX total).
//   2. Reads the brief's PRIMARY output metric + unit and derives the natural
//      £/output-unit denominator by FAMILY (power → £/kW, energy → £/kWh,
//      area → £/m², throughput/capacity → £/(unit·yr), mass → £/kg, else £/unit).
//   3. Compares the computed £/output-unit against INDUSTRY_COST_BANDS keyed by
//      output FAMILY (not by product-class slug) and flags deviation > ~2× in
//      EITHER direction.
//
// WHY A NEW CHECK RATHER THAN STRENGTHENING B-7 (scripts/audit-pdf-bom.ts):
//   B-7 (CLASS_COST_PER_OUTPUT_BAND) is keyed by the product-CLASS slug
//   (bess / wind_turbine / solar_inverter). An UNKNOWN archetype with no class
//   entry — exactly the CO₂-mineralisation case (`co2_mineralisation`) — falls
//   straight through B-7's `if (classId && CLASS_COST_PER_OUTPUT_BAND[classId])`
//   guard and is never checked. B-7 also reads `cover_raw_materials_bom_gbp`
//   out of the RENDERED PDF via pdftotext, post-render, inside audit-pdf-bom.
//   This gate instead keys the band by the OUTPUT FAMILY derived from the brief
//   metric's unit, so it covers any/unknown class from world knowledge — the
//   class need not be enumerated anywhere. It reads the headline straight from
//   STATE, so it can run as an in-chain SHADOW before the PDF is rendered.
//   The two are complementary: B-7 = per-class scar-tissue on the PDF; this =
//   universal output-family sanity on state, catching the classes B-7 skips.
//   It would have caught BOTH real misses this gate exists for:
//     • CO₂ dossier originally £55k ≈ £150/(t·yr) — ~15-60× too LOW (BoM undercounted).
//     • wind turbine shipped at £3,233/kW — ~3-5× too HIGH.
//
// UNIT-FAMILY HANDLING is delegated to `targetPerformanceValueAs` from
// class-price-bands.ts (the canonical, battle-tested helper — see mistake #12
// in the repo CLAUDE.md). We do NOT reinvent it.
//
// SHADOW by default. The chain records `state.costSanity` + logs the verdict and
// NEVER exits unless `COST_SANITY_ENFORCING` is set (see the chain wiring +
// `evaluateCostSanityEnforcement` below). Exit code 32 when enforcing.

import { targetPerformanceValueAs } from '../class-price-bands'

// ---------------------------------------------------------------------------
// Output families + industry £/output-unit bands (2026, ex-works / CAPEX basis)
// ---------------------------------------------------------------------------

/** The natural cost denominator family for a design's PRIMARY output metric.
 *  Keyed off the brief metric's UNIT, not the product class — this is what
 *  makes the gate universal across unseen archetypes. */
export type OutputFamily =
  | 'power'              // £/kW           (rated electrical / thermal power)
  | 'energy_storage'    // £/kWh          (battery / storage nameplate energy)
  | 'area'              // £/m²           (canopy / collector / footprint area)
  | 'throughput'        // £/(unit·yr)    (capture / production capacity per time)
  | 'mass'              // £/kg           (airframe / vehicle take-off mass)
  | 'unit'              // £/unit         (no scalable output metric — whole-system price)

export interface OutputDenominator {
  family: OutputFamily
  /** The size figure in the family's canonical unit (kW, kWh, m², units/yr, kg, or 1). */
  value: number
  /** Human label for the denominator, e.g. "t/yr CO₂", "kW", "kWh", "m²". */
  unit_label: string
  /** Short note on how the value was derived (which brief metric, what conversion). */
  derivation: string
}

export interface IndustryCostBand {
  family: OutputFamily
  /** Low / high edge of the typical 2026 £/output-unit band. */
  low: number
  high: number
  /** Human label for the £/unit, e.g. "£/(t·yr CO₂)". */
  per_unit_label: string
  /** What real-world products / sources anchor the band. */
  notes: string
}

/** Midpoint of a band — geometric mean keeps it sensible across the wide
 *  order-of-magnitude generic-fallback bands. */
export function bandMidpoint(b: { low: number; high: number }): number {
  return Math.sqrt(b.low * b.high)
}

/**
 * INDUSTRY_COST_BANDS — keyed by OUTPUT FAMILY. These are deliberately WIDE,
 * realistic 2026 ex-works / CAPEX ranges covering commodity-to-premium so the
 * gate only fires on genuinely-off magnitudes (the £150 vs £1,500 floor and the
 * £3,233 vs £1,500 ceiling). They are NOT per-class precision bands — that is
 * B-7's job (class-price-bands.ts) on the rendered PDF. This table answers the
 * universal question "is the £/output-unit even in the right order of magnitude
 * for this KIND of output?" for any archetype, seen or unseen.
 */
export const INDUSTRY_COST_BANDS: Record<OutputFamily, IndustryCostBand> = {
  power: {
    family: 'power',
    low: 80,
    high: 4_000,
    per_unit_label: '£/kW',
    notes:
      'Power-output systems span solar/PV inverters (£80-250/kW) · onshore wind (£900-1,500/kW) · ' +
      'EV chargers/heat pumps (£550-950/kW) · electrolysers + fuel cells (£1,500-4,000/kW). The wide ' +
      'band catches order-of-magnitude errors; a per-class band (B-7) tightens it. Onshore wind sub-band ' +
      '£900-1,500/kW — a £3,233/kW turbine is ~2.2× the ceiling (the real wind miss).',
  },
  energy_storage: {
    family: 'energy_storage',
    low: 150,
    high: 800,
    per_unit_label: '£/kWh',
    notes:
      'Utility BESS LFP, ex-works raw-to-premium: commodity Chinese second-tier ~£150-300/kWh, ' +
      'UK-certified premium (G99 + UL 9540A + NFPA 855) up to ~£800/kWh (BNEF 2H-2024, Aurora, WoodMac). ' +
      'Residential/solid-state run higher but the floor is what catches an undercounted pack.',
  },
  area: {
    family: 'area',
    low: 300,
    high: 2_500,
    per_unit_label: '£/m²',
    notes:
      'Productive-area systems: containerised leafy-greens vertical farms £1,400-2,400/m² turnkey ' +
      '(Freight Farms / Square Roots / CropOne); EPC-bare modular kit can reach down toward £300-600/m². ' +
      'Solar collector field area sits lower; the wide band catches a per-m² magnitude slip.',
  },
  throughput: {
    family: 'throughput',
    low: 1_500,
    high: 10_000,
    per_unit_label: '£/(unit·yr)',
    notes:
      'Capacity-per-time plant (CAPEX per annual output unit). Amine CO₂ capture + mineralisation PILOT ' +
      '~£1,500-10,000/(t·yr CO₂) — commercial-scale DAC targets sub-£1,500 but a pilot/first-of-a-kind ' +
      'plant sits in this band (IEA DAC 2024; Climeworks/Heirloom/Carbon Engineering disclosures). A ' +
      '£55k plant capturing 365 t/yr = £150/(t·yr) is ~15× below this floor (the real CO₂ undercount).',
  },
  mass: {
    family: 'mass',
    low: 50,
    high: 12_000,
    per_unit_label: '£/kg',
    notes:
      'Mass-defined products span commodity steel fabrication (~£50-500/kg) to aerospace/eVTOL airframes ' +
      '(£3,000-12,000/kg MTOW) and inspection drones (£4,500-22,000/kg — premium tier escapes the high edge ' +
      'and reads MED). Very wide; primarily catches a £/kg that is orders of magnitude wrong.',
  },
  unit: {
    family: 'unit',
    low: 100,
    high: 5_000_000,
    per_unit_label: '£/unit',
    notes:
      'Fallback for designs with no scalable output metric — the whole-system ex-works price is the figure. ' +
      'The band is intentionally an order-of-magnitude net (consumer device £100s to bespoke industrial ' +
      'system £millions); it only catches a headline that is implausible as ANY single deliverable.',
  },
}

/**
 * CLASS_OUTPUT_BANDS — TIGHTER, per-class £/output-unit bands (ex-works / CAPEX
 * basis) used WHEN the product class is recognised. The family band is too wide
 * for some families on purpose: "power" must span PV inverters (£80/kW) and SMRs
 * (£8,000/kW), so a £3,233/kW wind turbine sits INSIDE the generic power band and
 * escapes. When the class resolves, we compare against its specific sub-band
 * instead — this is what catches the real wind miss (£3,233/kW vs the £900-1,500
 * /kW onshore band = ~2.2× over → HIGH).
 *
 * Keyed by the same slugs the rest of the engine uses (keyMetrics.product_class /
 * projectId prefix). The `family` MUST match the band the brief metric resolves
 * to, or the class band is ignored (a safety check — we never compare a £/kW band
 * against a £/kWh figure). Seeded from the task spec's realistic 2026 values +
 * the existing CLASS_COST_PER_OUTPUT_BAND (audit-pdf-bom.ts) raw-materials bands.
 * Unknown classes fall straight back to INDUSTRY_COST_BANDS[family] — that is the
 * universal path that covers unseen archetypes.
 */
export const CLASS_OUTPUT_BANDS: Record<string, IndustryCostBand & { aliases?: string[] }> = {
  wind_turbine: {
    family: 'power', low: 900, high: 1_500, per_unit_label: '£/kW',
    aliases: ['wind', 'onshore_wind', 'wind_turbine_onshore'],
    notes: 'Onshore 2-6 MW wind turbine, ex-works nacelle+tower+rotor+foundation (IRENA Wind Cost Trends 2024; £700-1,500/kW typical, £900 floor for utility scale). Offshore is 2-3× — split when an offshore alias lands.',
  },
  solar_pv: {
    family: 'power', low: 600, high: 1_000, per_unit_label: '£/kWp',
    aliases: ['pv', 'solar', 'solar_pv_array', 'pv_array'],
    notes: 'Utility/commercial solar PV array, £/kWp installed-DC ex-works (BNEF PV 2024; £600-1,000/kWp). NOTE: a bare PV INVERTER is the solar_inverter class (£80-250/kW), not the array.',
  },
  bess: {
    family: 'energy_storage', low: 200, high: 500, per_unit_label: '£/kWh',
    aliases: ['energy_storage', 'battery_storage'],
    notes: 'Utility BESS LFP, ex-works £/kWh (BNEF 2H-2024 / Aurora / WoodMac £200-500/kWh raw-to-premium). Tighter than the £150-800 family band, which spans residential + solid-state.',
  },
  bess_residential: {
    family: 'energy_storage', low: 300, high: 700, per_unit_label: '£/kWh',
    // No aliases — selected by the SCALE branch in resolveClassOutputBand (nameplate
    // < 100 kWh), never by slug, so utility briefs can never land here by accident.
    notes: 'Residential wall-mounted ALL-IN-ONE ESS (10-20 kWh with integrated hybrid ' +
      'inverter + MPPTs + enclosure + BMS), ex-works £/kWh of usable energy. Market ' +
      'anchors 2026: Tesla Powerwall 3 13.5 kWh product-only UK retail ~£7.5-9k ' +
      '(→ ex-works ~£5.2-6.5k ≈ £385-480/kWh); BYD Battery-Box HVS + hybrid inverter ' +
      'and GivEnergy All-in-One packages £300-600/kWh ex-works. Higher than utility ' +
      '£/kWh because the unit carries the whole PCS + outdoor enclosure + consumer ' +
      'packaging at 10-20 kWh scale. The band is calibrated to the MARKET, not to any ' +
      'run — an inflated design still fails it (honest-scoring precondition).',
  },
  solar_inverter: {
    family: 'power', low: 80, high: 250, per_unit_label: '£/kW',
    aliases: ['pv_inverter', 'central_inverter'],
    notes: 'Utility-scale central PV inverter, ex-works £/kW (WoodMac BoS 2024; hardware £40-90/kW, up to £250 with switchgear).',
  },
  wind_turbine_offshore: {
    family: 'power', low: 2_400, high: 4_500, per_unit_label: '£/kW',
    aliases: ['offshore_wind'],
    notes: 'Offshore wind, ex-works £/kW (2-3× onshore; BNEF/WindEurope 2024).',
  },
  co2_mineralisation: {
    family: 'throughput', low: 1_500, high: 10_000, per_unit_label: '£/(t·yr CO₂)',
    aliases: ['co2_capture', 'carbon_capture', 'amine_capture', 'dac', 'direct_air_capture', 'co2_mineralization'],
    notes: 'Amine CO₂ capture + mineralisation PILOT, CAPEX per annual tonne (£1,500-10,000/(t·yr CO₂); IEA DAC 2024, Climeworks/Heirloom). Commercial-scale DAC targets sub-£1,500 but a first-of-a-kind pilot sits here.',
  },
  e_fuel_synthesis: {
    family: 'throughput', low: 12_000, high: 60_000, per_unit_label: '£/(t·yr SAF)',
    aliases: ['power_to_liquid', 'fischer_tropsch', 'ptl', 'saf', 'e_kerosene'],
    notes: 'FOAK e-SAF capex per t/yr SAF capacity; design-council est Gemini £18k/Grok £38k/MiMo £40-80k',
  },
  water_treatment: {
    family: 'throughput', low: 0.3, high: 40, per_unit_label: '£/(m³·yr)',
    aliases: ['water_treatment', 'water_purification', 'fertigation', 'desalination',
              'reverse_osmosis_plant', 'process_water', 'irrigation', 'ebb_flow', 'water_handling'],
    notes: 'Water-handling / purification / fertigation plant, CAPEX per m³ of ANNUAL throughput capacity ' +
      '(VOLUME output → £/(m³·yr), NOT the mass/CO₂ £/(t·yr) scale). Municipal/industrial water-treatment ' +
      'capex is ~£0.5-15 per m³/yr of capacity depending on treatment intensity (RO + softening + ' +
      'fertigation higher than plain filtration); the wide £0.3-40 band catches an order-of-magnitude ' +
      'volume-vs-mass unit confusion. Codema Fischer Farms: ~£687k / 360,000 m³/yr ≈ £1.9/(m³·yr) sits ' +
      'comfortably IN band — the prior HIGH was the generic throughput band mis-keyed to the £1,500-10,000 ' +
      'CO₂ £/(t·yr) scale (a 786× false alarm). Moderate confidence.',
  },
  aquaculture_ras: {
    family: 'throughput', low: 10_000, high: 55_000, per_unit_label: '£/(t·yr)',
    aliases: ['ras', 'recirculating_aquaculture', 'recirculating_aquaculture_system',
              'aquaculture', 'land_based_aquaculture', 'fish_farm', 'marine_ras'],
    notes: 'Land-based marine RAS (recirculating aquaculture), EX-WORKS equipment capex per tonne ' +
      'annual harvest capacity. Spans ~5× by scale: at-scale leaders (Kingfish Zeeland yellowtail ' +
      '~€15-20k/(t·yr) installed) down to ~£10k/(t·yr) ex-works; small first-of-kind premium-species ' +
      'UK facilities (<300 t/yr) reach ~£50-90k/(t·yr) installed → ~£30-55k/(t·yr) ex-works. The wide ' +
      'band reflects the genuine scale-dependence (cf. e-SAF £12-60k); a per-(t·yr) figure ABOVE this ' +
      'is a magnitude error, WITHIN it is plausible — a total capex over the brief cost CEILING is a ' +
      'separate, honestly-disclosed brief-compliance matter (the design-to-budget variant), not a ' +
      'per-unit-cost-plausibility failure. Moderate confidence (Kingfish Co/Atlantic Sapphire/Nordic ' +
      'Aquafarms disclosures, 2023-2025; UK FOAK premium pulls the high edge up).',
  },
}

/** Wire up class-band aliases so an alias slug resolves to its canonical band. */
const CLASS_BAND_BY_ALIAS: Record<string, IndustryCostBand> = (() => {
  const map: Record<string, IndustryCostBand> = {}
  for (const [slug, band] of Object.entries(CLASS_OUTPUT_BANDS)) {
    map[slug] = band
    for (const a of band.aliases ?? []) map[a] = band
  }
  return map
})()

/** Resolve a class-specific band for the state IF the class is known AND its
 *  family matches the derived output family. Returns null for unknown classes
 *  (→ caller uses the universal family band). Tries product_class, then the
 *  projectId / slug prefix, mirroring resolvePriceBand's resolution order. */
export function resolveClassOutputBand(state: any, family: OutputFamily): IndustryCostBand | null {
  // SCALE-AWARE energy-storage band (2026-07-10, Powerwall loop): the `bess` band is
  // UTILITY ex-works £/kWh; a residential all-in-one wall unit carries the whole PCS +
  // enclosure at 10-20 kWh scale and its honest market band is higher (see
  // bess_residential.notes). Same sub-utility threshold (nameplate < 100 kWh) as the
  // pricing-override / graph-selection / cost-stack gates. The residential band is
  // market-calibrated, NOT run-calibrated — an inflated design still fails it.
  if (family === 'energy_storage') {
    const np = Number(state?.orchestratorContract?.quantities?.nameplate_capacity_kwh?.value)
    if (Number.isFinite(np) && np > 0 && np < 100 && CLASS_OUTPUT_BANDS.bess_residential) {
      return CLASS_OUTPUT_BANDS.bess_residential
    }
  }
  const tryKey = (k: unknown): IndustryCostBand | null => {
    const s = String(k ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
    const b = s ? CLASS_BAND_BY_ALIAS[s] : undefined
    return b && b.family === family ? b : null
  }
  return (
    tryKey(state?.keyMetrics?.product_class) ??
    tryKey(state?.parsedBrief?.constraints?.product_class) ??
    tryKey(String(state?.projectId ?? '').split('-')[0]) ??
    null
  )
}

// ---------------------------------------------------------------------------
// Headline cost extraction — numerator
// ---------------------------------------------------------------------------

/**
 * Read the dossier's HEADLINE cost (GBP) from state, preferring the ex-works /
 * OEM-transfer figure (the basis the industry bands are quoted on — see the
 * mempalace gotcha "industry £/output-unit bands are quoted EX-WORKS, not
 * installed ASP"). Falls back through the cost-stack, the cost-reality BoM
 * total, and the raw bomTotals grand total so partially-wired states still
 * produce a numerator. Returns null when no cost figure is present.
 */
export function readHeadlineCostGbp(state: any): { gbp: number; source: string } | null {
  const num = (v: unknown): number | null => {
    const n = typeof v === 'string' ? Number(v.replace(/[, ]/g, '')) : Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  // 1. Ex-works / OEM-transfer from the cost stack (the band basis) — best.
  const cs = state?.costStack
  if (cs) {
    const exWorks =
      num(cs.oem_transfer_price_gbp) ??
      num(cs.ex_works_gbp) ??
      num(cs.factory_cogs_gbp)
    if (exWorks != null) return { gbp: exWorks, source: 'costStack.ex_works' }
  }

  // 2. The cost-reality BoM total (what the CO₂ build records: raw-materials
  //    BoM ≈ ex-works proxy for a pilot plant). state.cost_reality.bom_total_gbp.
  const crBom = num(state?.cost_reality?.bom_total_gbp)
  if (crBom != null) return { gbp: crBom, source: 'cost_reality.bom_total_gbp' }

  // 3. Cover "Raw materials" / grand total from bomTotals, if the chain wired it.
  const bt = state?.bomTotals
  if (bt) {
    const grand =
      num(bt.grandTotal_gbp) ??
      num(bt.grand_total_gbp) ??
      num(bt.cover_raw_materials_bom_gbp) ??
      num(bt.raw_materials_gbp)
    if (grand != null) return { gbp: grand, source: 'bomTotals.grandTotal' }
  }

  // 4. keyMetrics headline cost / capex, last resort.
  const km = state?.keyMetrics
  for (const m of [km?.headline_constraint, km?.headline_output, ...(km?.supporting_metrics ?? [])]) {
    if (m && /capex|cost|price|materials/i.test(String(m.id ?? m.label ?? '')) && /gbp|£/i.test(String(m.unit ?? '£'))) {
      const v = num(m.value)
      if (v != null) return { gbp: v, source: `keyMetrics.${m.id ?? 'cost'}` }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Output denominator — derive £/output-unit family + value from the brief
// ---------------------------------------------------------------------------

/** Pull the brief's primary target_performance metric list (handles the
 *  single-metric and metrics[] shapes the parser emits). */
function briefMetrics(state: any): Array<{ key_metric?: string; value?: number; unit?: string; category?: string }> {
  const tp = state?.parsedBrief?.constraints?.target_performance
  if (!tp) return []
  const out: Array<any> = []
  if (Array.isArray(tp.metrics)) out.push(...tp.metrics)
  // The top-level fields ARE the primary metric when metrics[] is absent.
  if (!out.length && (tp.key_metric || typeof tp.value === 'number')) {
    out.push({ key_metric: tp.key_metric, value: tp.value, unit: tp.unit, category: tp.category })
  }
  return out.filter((m) => m && (typeof m.value === 'number') && Number.isFinite(m.value))
}

/** Classify a metric's unit string into an output family + canonical conversion.
 *  Returns null if the unit doesn't map to a scalable output family. */
function familyFromUnit(unitRaw: string, keyMetric: string): { family: OutputFamily; toCanonical: (v: number) => number; unit_label: string } | null {
  const u = String(unitRaw ?? '').toLowerCase().trim()
  const key = String(keyMetric ?? '').toLowerCase()

  // ENERGY STORAGE — £/kWh. Only when the metric is an ENERGY quantity (Wh/kWh/MWh/GWh).
  if (/^(g|m|k)?wh$/.test(u) || /\b(kwh|mwh|gwh|wh)\b/.test(u)) {
    return { family: 'energy_storage', toCanonical: (v) => energyToKwh(v, u), unit_label: 'kWh' }
  }

  // POWER — £/kW. Watt family (W/kW/MW/GW). Excludes Wh handled above.
  if (/^(g|m|k)?w$/.test(u) || /\b(kw|mw|gw)\b/.test(u) || (u === 'w')) {
    return { family: 'power', toCanonical: (v) => powerToKw(v, u), unit_label: 'kW' }
  }

  // AREA — £/m². m²/m2/sqm/ha/cm².
  if (/(m2|m²|sqm|sq\.?\s?m|hectare|\bha\b|cm2|cm²)/.test(u)) {
    return { family: 'area', toCanonical: (v) => areaToM2(v, u), unit_label: 'm²' }
  }

  // THROUGHPUT / CAPACITY-PER-TIME — £/(unit·yr). Anything "per day / per hour /
  // per year / tpd / tph / kg/h / t/day / nm3/h". Normalised to per-YEAR.
  const perTime = throughputToPerYear(v1 => v1, u)
  if (perTime != null) {
    return { family: 'throughput', toCanonical: (v) => throughputToPerYear(() => v, u)!.value, unit_label: perTime.label }
  }

  // MASS — £/kg. g/kg/t/tonne. Only when the metric is plausibly a deliverable
  // MASS (MTOW / take-off mass / vehicle mass), NOT a feedstock-rate (those are
  // throughput, already handled above by the "/day" etc. suffix).
  if (/^(g|kg|t|tonne|tonnes)$/.test(u) && /(mtow|mass|weight|airframe|vehicle|payload)/.test(key)) {
    return { family: 'mass', toCanonical: (v) => massToKg(v, u), unit_label: 'kg' }
  }

  return null
}

function energyToKwh(v: number, u: string): number {
  if (u.includes('gwh')) return v * 1_000_000
  if (u.includes('mwh')) return v * 1_000
  if (u === 'wh' || (u.endsWith('wh') && u.startsWith('w'))) return v * 0.001
  return v // kwh
}
function powerToKw(v: number, u: string): number {
  if (/\bgw\b|^gw$/.test(u)) return v * 1_000_000
  if (/\bmw\b|^mw$/.test(u)) return v * 1_000
  if (u === 'w') return v * 0.001
  return v // kw
}
function areaToM2(v: number, u: string): number {
  if (/hectare|\bha\b/.test(u)) return v * 10_000
  if (/cm2|cm²/.test(u)) return v * 0.0001
  return v // m²
}
function massToKg(v: number, u: string): number {
  if (/tonne|tonnes|^t$/.test(u)) return v * 1_000
  if (u === 'g') return v * 0.001
  return v // kg
}

/**
 * Normalise a throughput/rate unit to PER-YEAR, returning the per-year value
 * and a human label for the £/(unit·yr) denominator. The `getV` indirection
 * lets `familyFromUnit` probe the unit shape without a real value first.
 * Returns null if the unit is not a recognised rate.
 *
 * UNIT-FAMILY FIX (2026-07-05, gate 32 CO₂ false-block — the recurring family
 * in CLAUDE.md mistake #12): this ALSO normalises the MASS/VOLUME sub-unit to
 * the CANONICAL unit the throughput class bands are quoted in — mass
 * throughput → TONNES (co2_mineralisation / aquaculture_ras / e_fuel_synthesis
 * are all £/(t·yr)), volume throughput → m³ (water_treatment is £/(m³·yr)).
 * Previously only the TIME axis (day/hour/year → per-year) was normalised;
 * the MASS axis was left in whatever sub-unit the brief happened to use (kg,
 * g, t) and the raw number was divided straight into a per-TONNE band. A
 * brief quoting "1000 kg/day" (→ 365,000 kg/yr, uncoverted) divided the
 * £1.44M headline cost by 365,000 instead of 365 — a 1000× denominator error
 * that read as a 381.5× false "cost sanity HIGH" (undercounted) when the
 * true £3,931/(t·yr) sits comfortably inside the £1,500-10,000/(t·yr) band.
 * (A sibling CO₂ brief that happened to quote "1 t/day" was already correct
 * by coincidence — same bug, silent when the brief's native unit matched the
 * band's.) Fix: convert the amount to the family's canonical unit HERE, once,
 * so every consumer (deriveOutputDenominator → computeCostSanity's ratio)
 * always divides by a value already in the band's unit. resolveClassOutputBand
 * still gates on the coarse OutputFamily ('throughput'); this reconciles the
 * sub-unit universally for every mass/volume-quoting archetype, seen or not.
 */
function throughputToPerYear(getV: (x: number) => number, uRaw: string): { value: number; label: string } | null {
  const u = String(uRaw ?? '').toLowerCase().replace(/\s/g, '')

  // The amount unit + its conversion factor TO THE CANONICAL unit for its
  // family. Order matters: the more specific tonne(s)/kg tokens are checked
  // before the bare "g" so "kg/day" is never mis-read as a gram rate.
  let amountUnit: string
  let toCanonicalFactor: number
  if (/(^|\W)(t|tonne|tonnes)\//.test(u) || /^tp[dhy]$/.test(u)) {
    amountUnit = 't'; toCanonicalFactor = 1        // already tonnes
  } else if (/(^|\W)kg\//.test(u) || /^kgp[dhy]$/.test(u)) {
    amountUnit = 't'; toCanonicalFactor = 0.001    // kg → t
  } else if (/(^|\W)g\//.test(u) || /^gp[dhy]$/.test(u)) {
    amountUnit = 't'; toCanonicalFactor = 0.000001 // g → t
  } else if (/nm3|m3|m³/.test(u)) {
    amountUnit = 'm³'; toCanonicalFactor = 1       // already m³
  } else if (/(^|\W)l\//.test(u)) {
    amountUnit = 'm³'; toCanonicalFactor = 0.001   // L → m³
  } else {
    amountUnit = 'unit'; toCanonicalFactor = 1     // no scalable mass/volume unit — untouched
  }

  let perYearFactor: number | null = null
  // tpd / t/day / kg/day / units/day → ×365
  if (/\/day$/.test(u) || /pd$/.test(u) || /\/d$/.test(u)) perYearFactor = 365
  // tph / t/h / kg/h / nm3/h / per-hour → ×8760 (continuous) — pilot plants quote
  // nameplate hourly; annualise at full-load hours. We use 8000 h/yr (≈91%
  // availability) as a realistic plant load factor rather than 8760.
  else if (/\/h$|\/hr$|ph$|\/hour$/.test(u)) perYearFactor = 8000
  // per-year already
  else if (/\/yr$|\/year$|\/a$|py$|pa$/.test(u)) perYearFactor = 1

  if (perYearFactor == null) return null
  return { value: getV(1) * perYearFactor * toCanonicalFactor, label: `${amountUnit}/yr` }
}

/**
 * Derive the output denominator (family + value + label) for the £/output-unit
 * ratio. Picks the brief's PRIMARY scale metric: the first metric whose unit
 * maps to a scalable family, preferring `category: 'scale'` and the top-listed
 * metric (the parser lists the headline metric first). Falls back to £/unit
 * (whole-system price) when no metric maps.
 */
export function deriveOutputDenominator(state: any): OutputDenominator {
  const metrics = briefMetrics(state)

  // Prefer scale-category metrics, preserving list order (headline first).
  const ordered = [
    ...metrics.filter((m) => String(m.category ?? '').toLowerCase() === 'scale'),
    ...metrics.filter((m) => String(m.category ?? '').toLowerCase() !== 'scale'),
  ]

  for (const m of ordered) {
    const fam = familyFromUnit(String(m.unit ?? ''), String(m.key_metric ?? ''))
    if (!fam) continue
    const rawVal = Number(m.value)
    if (!Number.isFinite(rawVal) || rawVal <= 0) continue

    if (fam.family === 'throughput') {
      const perYear = throughputToPerYear(() => rawVal, String(m.unit ?? ''))
      if (!perYear || !(perYear.value > 0)) continue
      return {
        family: 'throughput',
        value: perYear.value,
        unit_label: perYear.label,
        derivation: `brief metric ${m.key_metric}=${rawVal} ${m.unit} → ${perYear.value.toLocaleString()} ${perYear.label}`,
      }
    }

    // For non-throughput families, also try the canonical helper from
    // class-price-bands (targetPerformanceValueAs) when this metric IS the
    // top-level target_performance — it handles unit-tagged briefs correctly.
    const canonical = fam.toCanonical(rawVal)
    if (!(canonical > 0)) continue
    return {
      family: fam.family,
      value: canonical,
      unit_label: fam.unit_label,
      derivation: `brief metric ${m.key_metric}=${rawVal} ${m.unit} → ${canonical.toLocaleString()} ${fam.unit_label}`,
    }
  }

  // Last resort: if the top-level target_performance carries a known unit the
  // loop missed, try the canonical helper directly for the four simple families.
  for (const [unit, family, label] of [
    ['kwh', 'energy_storage', 'kWh'],
    ['kw', 'power', 'kW'],
    ['m2', 'area', 'm²'],
    ['kg', 'mass', 'kg'],
  ] as Array<[string, OutputFamily, string]>) {
    const v = targetPerformanceValueAs(state, unit)
    if (typeof v === 'number' && v > 0) {
      return { family, value: v, unit_label: label, derivation: `target_performance via targetPerformanceValueAs → ${v.toLocaleString()} ${label}` }
    }
  }

  return { family: 'unit', value: 1, unit_label: 'unit', derivation: 'no scalable output metric — whole-system price treated as £/unit' }
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

export type CostSanityVerdict = 'pass' | 'med' | 'high' | 'unavailable'

export interface CostSanityResult {
  verdict: CostSanityVerdict
  /** The computed £/output-unit, or null when unavailable. */
  cost_per_output_unit: number | null
  /** Numerator (headline cost) and its source. */
  headline_cost_gbp: number | null
  headline_cost_source: string | null
  /** Denominator. */
  output_family: OutputFamily | null
  output_value: number | null
  output_unit_label: string | null
  /** The band compared against. */
  band: { low: number; high: number; per_unit_label: string } | null
  /** Ratio to the NEAREST band edge: > 1 means above the high edge by that
   *  factor; < 1 means below the low edge by 1/ratio. 'in band' = null. */
  ratio_to_nearest_edge: number | null
  /** Direction: 'over' (above high), 'under' (below low), 'in_band'. */
  direction: 'over' | 'under' | 'in_band' | null
  /** Which band fired: a recognised product class ('class:<slug>') or the
   *  universal output family ('family:<family>'). */
  band_basis: string | null
  /** Human-readable, specific verdict message. */
  message: string
}

/**
 * PURE: compute the independent cost-sanity verdict from state. No I/O, no LLM.
 * Severity (per the gate spec):
 *   HIGH  ratio to nearest band edge > 2.5×  OR  < 0.4× (1/2.5)
 *   MED   ratio in [1.5×, 2.5×]              OR  in [0.5×, 0.8×]   (i.e. 1/ratio in [1.25, 2.0])
 *   PASS  within band, OR a mild deviation tighter than the MED window
 */
export function computeCostSanity(state: any): CostSanityResult {
  const base: CostSanityResult = {
    verdict: 'unavailable',
    cost_per_output_unit: null,
    headline_cost_gbp: null,
    headline_cost_source: null,
    output_family: null,
    output_value: null,
    output_unit_label: null,
    band: null,
    ratio_to_nearest_edge: null,
    direction: null,
    band_basis: null,
    message: '',
  }

  const headline = readHeadlineCostGbp(state)
  if (!headline) {
    return { ...base, message: 'Independent cost sanity: no headline cost figure found in state (costStack / cost_reality / bomTotals all absent) — skipped.' }
  }

  const denom = deriveOutputDenominator(state)
  // Prefer the TIGHTER class-specific band when the class is recognised AND its
  // family matches; otherwise fall back to the universal output-family band
  // (the path that covers unseen archetypes). This is what catches the wind
  // £3,233/kW miss — the £900-1,500/kW class band, not the wide power family.
  const classBand = resolveClassOutputBand(state, denom.family)
  const band = classBand ?? INDUSTRY_COST_BANDS[denom.family]
  const bandBasis = classBand ? `class:${String(state?.keyMetrics?.product_class ?? 'known').toLowerCase()}` : `family:${denom.family}`
  const perUnit = headline.gbp / denom.value

  const unitTail = band.per_unit_label.replace(/^£\//, '')
  const fmtGbp = (n: number) => `£${Math.round(n).toLocaleString()}`
  const fmtPer = (n: number) => `£${n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1)}/${unitTail}`
  const bandRange = `£${band.low.toLocaleString()}–£${band.high.toLocaleString()}/${unitTail}`

  const common = {
    cost_per_output_unit: perUnit,
    headline_cost_gbp: headline.gbp,
    headline_cost_source: headline.source,
    output_family: denom.family,
    output_value: denom.value,
    output_unit_label: denom.unit_label,
    band: { low: band.low, high: band.high, per_unit_label: band.per_unit_label },
    band_basis: bandBasis,
  }

  // Within band → PASS.
  if (perUnit >= band.low && perUnit <= band.high) {
    return {
      ...base,
      ...common,
      verdict: 'pass',
      ratio_to_nearest_edge: null,
      direction: 'in_band',
      message:
        `Independent cost sanity PASS: ${fmtGbp(headline.gbp)} / ${denom.value.toLocaleString()} ${denom.unit_label} = ` +
        `${fmtPer(perUnit)} — within the ${bandRange} ${bandBasis.startsWith('class:') ? 'class' : 'industry'} band for ${denom.family} output. (${denom.derivation})`,
    }
  }

  // Out of band — compute ratio to the nearest edge.
  let ratio: number
  let direction: 'over' | 'under'
  if (perUnit > band.high) {
    ratio = perUnit / band.high
    direction = 'over'
  } else {
    ratio = band.low / perUnit   // > 1; how many × below the floor
    direction = 'under'
  }

  // Severity thresholds (symmetric in magnitude): HIGH > 2.5×, MED ≥ 1.5×, else PASS.
  let verdict: CostSanityVerdict
  if (ratio > 2.5) verdict = 'high'
  else if (ratio >= 1.5) verdict = 'med'
  else verdict = 'pass' // mild excursion just outside the band — not worth a flag

  const dirWord = direction === 'over' ? 'above' : 'below'
  const edgeVal = direction === 'over' ? band.high : band.low
  const edgeName = direction === 'over' ? 'high' : 'low'
  const verdictWord = verdict === 'high' ? 'HIGH' : verdict === 'med' ? 'MED' : 'PASS (borderline)'

  // The diagnostic clause (undercounted / inflated) only attaches when the gate
  // is actually flagging (MED/HIGH); a borderline PASS just states the position.
  const diagnostic =
    verdict === 'pass'
      ? `just outside the band — within tolerance, not flagged.`
      : direction === 'under'
        ? `the bill of materials is almost certainly UNDERCOUNTED (missing line items / wrong unit price).`
        : `the cost is almost certainly INFLATED (premium-tier over-pinning, a £/kg or £/unit magnitude error, or class-rule miscalibration).`

  const message =
    `Independent cost sanity ${verdictWord}: ${fmtGbp(headline.gbp)} / ${denom.value.toLocaleString()} ${denom.unit_label} = ` +
    `${fmtPer(perUnit)} is ${ratio.toFixed(1)}× ${dirWord} the ${fmtPer(edgeVal)} ${edgeName} edge of the ` +
    `${bandRange} ${bandBasis.startsWith('class:') ? 'class' : 'industry'} band for ${denom.family} output — ${diagnostic}` +
    ` (${denom.derivation}; ${band.notes})`

  return {
    ...base,
    ...common,
    verdict,
    ratio_to_nearest_edge: ratio,
    direction,
    message,
  }
}

// ---------------------------------------------------------------------------
// Enforcement decision (mirrors semantic-self-audit's pure-decision pattern)
// ---------------------------------------------------------------------------

export type CostSanityEnforceMode = 'off' | 'on'

/** Fatal chain exit code for an enforced cost-sanity block. Next free after 31
 *  (see CLAUDE.md exit-code table). Module-local: consumers read decision.exitCode. */
export const COST_SANITY_EXIT_CODE = 32

export interface CostSanityEnforcementDecision {
  shouldExit: boolean
  exitCode: number  // COST_SANITY_EXIT_CODE when shouldExit, else 0
  mode: CostSanityEnforceMode
  reason: string
}

/**
 * PURE + deterministic given (result, mode): decide whether enforcing mode must
 * hard-exit the chain. Only a HIGH verdict blocks — a MED is a flag the operator
 * scans (matching the gate-severity philosophy: WRONGNESS hard-exits, a soft
 * deviation flags + renders). 'unavailable' / 'pass' / 'med' never block.
 */
export function evaluateCostSanityEnforcement(result: CostSanityResult, mode: CostSanityEnforceMode): CostSanityEnforcementDecision {
  if (mode === 'off') return { shouldExit: false, exitCode: 0, mode, reason: '' }
  const shouldExit = result.verdict === 'high'
  return {
    shouldExit,
    exitCode: shouldExit ? COST_SANITY_EXIT_CODE : 0,
    mode,
    reason: shouldExit ? result.message : '',
  }
}

/** Map COST_SANITY_ENFORCING to a mode. unset / 0 / false / off / no / shadow → off;
 *  anything else truthy (1 / true / on / enforce) → on. Default is OFF (shadow). */
export function costSanityEnforceModeFromEnv(v: string | undefined): CostSanityEnforceMode {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === '' || s === '0' || s === 'false' || s === 'off' || s === 'no' || s === 'shadow') return 'off'
  return 'on'
}

/** Convenience for the chain: compute + (optionally) decide in one call. */
export function runIndependentCostSanity(state: any, envValue?: string): { result: CostSanityResult; enforcement: CostSanityEnforcementDecision } {
  const result = computeCostSanity(state)
  const mode = costSanityEnforceModeFromEnv(envValue)
  const enforcement = evaluateCostSanityEnforcement(result, mode)
  return { result, enforcement }
}
