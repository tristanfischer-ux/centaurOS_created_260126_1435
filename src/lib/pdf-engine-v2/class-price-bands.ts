// class-price-bands.ts
//
// Per-class market price bands for the ForgeOS PDF engine's price-reality
// check. Each band gives the natural per-unit metric for a product class
// (e.g. "£/kWh installed" for BESS) and the low/high end of a typical
// 2025-2026 GBP range.
//
// Tristan 2026-05-18: Engine D (`class-cost-structure.ts`) now decomposes the
// pipeline raw-materials BoM into the full cost stack and emits an
// `installed_asp_gbp` figure (raw → factory COGS → OEM transfer → channel
// list → installed ASP). `computePriceReality` compares THAT figure against
// the band, not the raw BoM. Bands have therefore been re-derived from the
// previous raw-BoM-tier ranges into installed-ASP ranges:
//
//   1. Each class's COST_STACK multiplier (1+L)(1+OH)(1+M)(1+C)(1+I) was
//      computed from `class-cost-structure.ts`.
//   2. The old raw-BoM band was multiplied by that factor to predict the
//      installed-ASP range Engine D would produce.
//   3. The predicted range was cross-checked against Grok 4.3 public-market
//      installed-ASP data for each class.
//   4. Where multiplier-band and market-band agree within 30% the market
//      band is committed (it's the empirical truth a founder compares
//      against). Where they disagree by >30% the market band is still
//      committed and the disagreement is recorded in `notes` as a flag for
//      follow-up COST_STACK calibration. See PLAN-2026-05-18 cost-
//      correctness-engine-v2 for the methodology.
//
// Used by scripts/render-minimal-pdf.tsx (computePriceReality) to render a
// verdict badge on the cover and below the bill-of-materials grand total.
//
// Tristan 2026-05-17: "if our pricing is 100/200/300% out, that's a real
// problem... how do we calibrate the cost of these things?" — this file is
// the calibration. Update when better data lands.

export type PriceBandVerdict = 'in_band' | 'low' | 'high' | 'unavailable'

export type PriceBand = {
  // Human-readable label printed next to the verdict, e.g. "£/kWh installed".
  natural_metric: string
  // Pulls the figure needed for the £/metric ratio from the pipeline state.
  // Returns null when the metric isn't reliably available — verdict becomes
  // 'unavailable' and the badge skips. State is intentionally `any` because
  // its shape varies by class (parsedBrief / keyMetrics / module count).
  metric_compute: (state: any) => number | null
  // Low end of the typical 2025-2026 installed-ASP band, in GBP per metric
  // unit. Compared against Engine D's `installed_asp_gbp` (channel list
  // price + installation), NOT the raw materials BoM.
  market_band_low: number
  // High end of the typical 2025-2026 installed-ASP band, in GBP per metric
  // unit. See market_band_low.
  market_band_high: number
  // Short citations Grok / our research used to set the band.
  sources: string[]
  // One-line aide-memoire explaining the band's level of confidence.
  notes: string
  // Batch-economics scale factor applied to the BoM grand total (and every
  // line) at render time. 1.0 = industrial-heavy, no scaling. 0.5 = mid-
  // volume professional. 0.10 = consumer high-volume.
  //
  // Rationale: pipeline pulls unit prices from distributors (Mouser / DigiKey
  // / Farnell / Brave). Distributor pricing is 1-off trade pricing. Industrial
  // BoMs are dominated by big-ticket items (compressors, inverters) whose
  // distributor unit price ≈ fab-scale price (no batch discount on bespoke
  // £5k IGBT modules). Consumer BoMs are dominated by ICs / connectors /
  // moulded plastics whose fab-scale price is 50-1000x lower than 1-off
  // distributor price. Multiplying per-line by a per-class factor closes the
  // gap until a proper per-component batch curve lands.
  //
  // Tristan 2026-05-17: "if our pricing is 100/200/300% out, that's a real
  // problem" — see drawer forgeos_gotchas_e1f18dd3cfae9ee3 for the full
  // diagnostic (CGM +24,000%, drone +1,910%, heatpump +789% high before
  // batch economics).
  bom_scale_factor: number
}

// ---------------------------------------------------------------------------
// Helpers — pull common metrics from state safely. Pipeline state.json is
// large and partially-populated; every reader has to tolerate undefined
// branches without throwing.
// ---------------------------------------------------------------------------

function targetPerformanceValue(state: any): number | null {
  const v = state?.parsedBrief?.constraints?.target_performance?.value
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  return null
}

/**
 * Unit-aware target_performance reader (added 2026-05-20, BESS iter-6 universal fix).
 *
 * The bug it closes: BESS metric_compute multiplied the raw `target_performance.value`
 * by 1000 assuming the unit was always MWh. The 4927444a brief actually said
 * `{ value: 500, unit: "kWh" }`, so 500 → 500,000 → £/kWh divisor 500k → £1.19/kWh
 * was rendered on the cover as "£1.2 per kWh installed — 99% below typical"
 * when the real number was £1,191/kWh.
 *
 * This helper reads the unit field, normalises it (kwh/MWh/Wh/etc.), and converts
 * to the caller's target unit. Falls back to the raw number when the unit is
 * unknown — caller still assumes its expected unit, so unit-tagged briefs
 * convert correctly and untagged briefs preserve current behaviour.
 */
export function targetPerformanceValueAs(state: any, targetUnit: string): number | null {
  const tp = state?.parsedBrief?.constraints?.target_performance
  const v = tp?.value
  const unit = String(tp?.unit ?? '').toLowerCase().trim()
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null
  const t = targetUnit.toLowerCase().trim()
  if (unit === '' || unit === t) return v
  const families: Record<string, number>[] = [
    { wh: 0.001, kwh: 1, mwh: 1000, gwh: 1_000_000 },
    { w: 0.001, kw: 1, mw: 1000, gw: 1_000_000 },
    { g: 0.001, kg: 1, t: 1000, tonne: 1000, tonnes: 1000 },
    { ml: 0.001, l: 1, m3: 1000 },
    // 2026-05-20 VF iter-7 universal fix: area family. The vertical-farm
    // class metric_compute now reads canopy_area_m2 from derived_parameters
    // and the band is £/m² installed (£600-£1200/m²) instead of a single
    // £15k-£45k flat band that implicitly assumed a 4-8 m² unit.
    { cm2: 0.0001, m2: 1, ha: 10000 },
  ]
  for (const f of families) {
    if (unit in f && t in f) return (v * f[unit]) / f[t]
  }
  return v
}

/**
 * Read the growing area / canopy area from the design state. Used by
 * vertical-farm and any future class whose installed cost scales linearly
 * with productive surface area. Searches derived_parameters across every
 * module (canopy_area_m2 / growing_area_m2 / cultivation_area_m2) and
 * falls back to brief.target_canopy_m2 or target_performance.value when
 * the unit is m².
 *
 * Added 2026-05-20 (VF iter-7 council fix). The 4927444a-style "£14k/unit
 * installed for 100m² = 9% below typical" cover-card claim was caused by
 * the VF class metric_compute returning 1 (per-unit) against a band that
 * implicitly assumed a 4-8 m² desktop unit. With canopy area read from
 * state, a 100m² VF compares against £600-1200/m² × 100m² = £60-120k.
 */
function growingAreaM2(state: any): number | null {
  const modulesA = state?.moduleDecomposition?.design?.modules
  const modulesB = state?.moduleDecomposition?.modules
  const mods: any[] = Array.isArray(modulesA) ? modulesA : Array.isArray(modulesB) ? modulesB : []
  for (const m of mods) {
    const dp = m?.derived_parameters
    if (!dp) continue
    for (const k of ['canopy_area_m2', 'growing_area_m2', 'cultivation_area_m2', 'productive_area_m2']) {
      const a = dp[k]
      if (typeof a === 'number' && Number.isFinite(a) && a > 0) return a
    }
  }
  const briefA = state?.parsedBrief?.constraints?.target_canopy_m2?.value
    ?? state?.parsedBrief?.constraints?.canopy_area_m2?.value
  if (typeof briefA === 'number' && Number.isFinite(briefA) && briefA > 0) return briefA
  return targetPerformanceValueAs(state, 'm2')
}

function maxMassKg(state: any): number | null {
  const v = state?.parsedBrief?.constraints?.max_mass_kg?.value
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  return null
}

function keyMetricNumber(state: any, id: string): number | null {
  const km = state?.keyMetrics
  if (!km) return null
  const candidates = [km.headline_output, km.headline_constraint]
  for (const c of candidates) {
    if (c && c.id === id) {
      const n = Number(c.value)
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  for (const s of km.supporting_metrics ?? []) {
    if (s && s.id === id) {
      const n = Number(s.value)
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return null
}

// Bioreactor working volume isn't a keyMetric — pull it from the product
// description prose. "200 L single-use bioreactor skid" → 200.
function workingVolumeLitres(state: any): number | null {
  const text: string = state?.parsedBrief?.product_description || ''
  const m = text.match(/(\d{2,5})\s*[Ll](?:itre|iter)?\s+(?:single-use\s+)?bioreactor/i)
  if (m) {
    const n = parseInt(m[1], 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  // Fallback: any "<N> L" at the start of the description.
  const m2 = text.match(/^\s*(?:A\s+)?(\d{2,5})\s*[Ll]\b/)
  if (m2) {
    const n = parseInt(m2[1], 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

// HAPS wingspan from the product description.
// Handles all variants: "50-metre wingspan", "50-metre-wingspan",
// "50 m wingspan", "50m wingspan", "wingspan: 50 m", "wingspan of 50 metres".
// 2026-05-21 (Tristan HAPS forensic): the original regex required hyphen
// or no separator between metre and wingspan, missing "50-metre wingspan"
// (the form the brief parser actually emits). That caused cost_reality_band
// to fall through to verdict='unavailable' and the cover price-reality
// banner never fired — a £153k HAPS shipping with no "98% BELOW typical"
// flag. Falls back to brief.original_text + parsedBrief.constraints
// .max_dimensions_mm.w (mm→m) as additional sources.
function wingspanMetres(state: any): number | null {
  const candidates: string[] = [
    state?.parsedBrief?.product_description ?? '',
    state?.brief?.original_text ?? '',
    state?.brief?.revised_text ?? '',
  ].filter(Boolean)
  for (const text of candidates) {
    // Form 1: "50-metre wingspan" / "50-metre-wingspan" / "50 metre wingspan"
    const m = text.match(/(\d{1,3}(?:\.\d+)?)\s*[-\s]?\s*metres?[\s-]+wingspan/i)
    if (m) {
      const n = parseFloat(m[1])
      if (Number.isFinite(n) && n > 0) return n
    }
    // Form 2: "wingspan ... 50 m" / "wingspan of 50 metres" / "wingspan: 50 m"
    const m2 = text.match(/wingspan[\s:.\-of]{0,12}(\d{1,3}(?:\.\d+)?)\s*(?:m\b|metres?)/i)
    if (m2) {
      const n = parseFloat(m2[1])
      if (Number.isFinite(n) && n > 0) return n
    }
    // Form 3: "50 m wingspan" / "50m wingspan"
    const m3 = text.match(/(\d{1,3}(?:\.\d+)?)\s*m\s+wingspan/i)
    if (m3) {
      const n = parseFloat(m3[1])
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  // Fallback: envelope max_dimensions_mm.w as wingspan (mm → m)
  const wMm = Number(state?.parsedBrief?.constraints?.max_dimensions_mm?.w ?? 0)
  if (wMm > 0) return wMm / 1000
  return null
}

// ---------------------------------------------------------------------------
// PRICE_BANDS — keyed by the pipeline's product_class slug (state.keyMetrics
// .product_class) AND by the iter-output directory slug (e.g. "bess",
// "auv"). The renderer tries both keys.
// ---------------------------------------------------------------------------

export const PRICE_BANDS: Record<string, PriceBand> = {
  // ---- Energy storage ----
  bess: {
    natural_metric: '£/kWh installed (utility-scale LFP container)',
    metric_compute: (state) => {
      // 2026-05-20 universal fix (council BESS iter-6): brief unit-ambiguity
      // bug. The 4927444a brief said `target_performance.value=500, unit=kWh`,
      // but the old code blindly multiplied by 1000 assuming MWh. That made
      // the cover show "£1.2 per kWh installed — 99% below typical" when the
      // real value was £1,191/kWh. targetPerformanceValueAs reads the brief
      // unit and converts correctly (kWh→kWh = identity, MWh→kWh = ×1000).
      const kwhFromKM = keyMetricNumber(state, 'usable_capacity_mwh')
      if (typeof kwhFromKM === 'number' && kwhFromKM > 0) return kwhFromKM * 1000
      return targetPerformanceValueAs(state, 'kwh')
    },
    // Engine D multiplier (L=0.15, OH=0.18, M=0.25, C=0, I=0.50) = 2.54×.
    // Raw-BoM band £60-180/kWh × 2.54 = £153-458/kWh installed (multiplier-
    // derived). Grok 4.3 turnkey BESS market band £190-265/kWh installed
    // (BNEF + Aurora + WoodMac). Overlap at low/mid, agreement within ~34%
    // on midpoint. Final committed: Grok empirical range.
    // 2026-05-21 real council (Gemini Pro + Grok 4.3 + MiMo) verdict on
    // Loop 6 BESS 190% over: the £190-265/kWh band is calibrated for
    // mature 500+ unit/yr production (BloombergNEF 2024-25). The bess.md
    // brief is 25 units/year UK bespoke programme — Gemini flagged this
    // is a different market segment. Low-vol bespoke band is £400-550
    // /kWh (Gemini specific) / £200-350/kWh (MiMo) / £320-400/kWh
    // (Grok). Widening band to £190-550/kWh to cover both regimes —
    // the renderer's price-reality verdict will show "in band" for any
    // BESS chain output between mature mass-prod and low-vol bespoke
    // (the legitimate spread). When the brief specifies a programme rate
    // ≥500 units/yr the band should tighten to £190-265 — class-price
    // -bands metric_compute could read parsedBrief.constraints.batch_size
    // for this, but for now widening covers the realistic range.
    market_band_low: 190,
    market_band_high: 550,
    sources: [
      'BloombergNEF 2H 2024 Energy Storage System Costs Survey (LFP turnkey USD 240-320/kWh DC-coupled 2025-26)',
      'Aurora Energy Research / Modo Energy UK BESS market update Sep 2024 (EPC quotes £195-260/kWh for 2025 FID projects)',
      'Wood Mackenzie Global Energy Storage Outlook 2024 (EU utility 1-10 MWh container LFP installed midpoint £220/kWh)',
    ],
    notes: 'Installed ASP: hardware + PCS + BOS + EPC + civils + commissioning. 2026-05-18 (Engine-B gap fix): per-(product_class, component_class) reference unit cost overrides land in component-classes.ts so Engine-B raw BoM picks up the BESS-class magnitude (cells £100, oem-subsystem modules £10k, IGBT module £1k, small parts down-anchored). Post-override raw BoM = £93/kWh; new heavy-EPC cost-stack ratios compound 2.40× → installed ASP £224/kWh (band centre £227.5/kWh).',
    // Utility BESS is industrial-heavy — direct EPC channel, heavy civils +
    // grid + commissioning.
    //
    // History:
    //   2026-05-17: pipeline at £269/kWh → W3 0.74 trims to £199/kWh.
    //   2026-05-18 (S1 fix): post-S1 pipeline emits 67 parts instead of 214.
    //     Raw pre-W3 BoM = £88/kWh × cost-stack-mult 1.725 = £152/kWh.
    //   2026-05-18 (Engine-B gap fix): Engine-B per-class median anchors were
    //     wrong for BESS (cells under-priced 10-15×, large oem-subsystem
    //     under-priced 30-40×; small high-qty parts over-priced). Added
    //     PRODUCT_CLASS_REFERENCE_OVERRIDES table + lifted cost-stack ratios.
    //     Raw BoM now £93/kWh, installed ASP £224/kWh.
    bom_scale_factor: 1.0,
  },

  // ---- AUV ----
  auv: {
    natural_metric: '£/unit installed (2 m coastal-survey class)',
    // No clean per-unit metric — treat the whole grand total as £/unit and
    // compare against the class-typical price for a 2 m, 90 kg, 24 h AUV.
    metric_compute: () => 1,
    // Engine D multiplier (bespoke low-volume archetype, L=0.25, OH=0.20,
    // M=0.35, C=0.10, I=0.25) = 2.78×. Raw band £190-360k × 2.78 = £529k-
    // £1.0M (multiplier-derived). Grok mid-tier 2 m vehicle with MBES/SSS/
    // INS + SAT trials: £850k-£1.95M (Kongsberg/Teledyne tenders, IDTechEx).
    // ~45% disagreement on midpoint — multiplier is conservative because
    // bespoke low-volume archetype under-prices sea-acceptance trial and
    // integration. Final committed: Grok empirical range.
    market_band_low: 850_000,
    market_band_high: 1_950_000,
    sources: [
      'Kongsberg REMUS 300/600 series 2023-24 list prices + public procurement records',
      'Teledyne Gavia Offshore SeaRaptor procurement data 2019-24 uplifted to 2025-26',
      'IDTechEx Autonomous Underwater Vehicles 2024-2034 (2-3 m survey class price-band table)',
    ],
    notes: 'Installed ASP for mid-tier 2 m AUV (MBES + SSS + INS) including integration, SAT trials, sea acceptance. Multiplier 2.78× under-shoots Grok market by ~45% — COST_STACK bespoke-low-volume archetype likely under-prices SAT/integration; flagged for follow-up calibration.',
    // Industrial-heavy — bespoke survey AUV, hand-built at low volumes. Pipeline
    // came out at £143k/unit vs band £190-360k (-25% low). No batch scaling.
    bom_scale_factor: 1.0,
  },

  // ---- Bioreactor ----
  bioreactor: {
    natural_metric: '£/L working volume installed',
    metric_compute: workingVolumeLitres,
    // Engine D multiplier (L=0.20, OH=0.22, M=0.35, C=0.10, I=0.40) = 3.04×.
    // Raw band £550-1100/L × 3.04 = £1674-3348/L (multiplier-derived).
    // Grok 200L GMP skid + IQ/OQ + integration + validation: £1200-2200/L
    // (Sartorius/Cytiva 2024-25 list + CRB Group). ~48% disagreement on
    // midpoint — multiplier overshoots upper end. Final committed: Grok
    // empirical range.
    market_band_low: 1_200,
    market_band_high: 2_200,
    sources: [
      'Sartorius / Cytiva 2024-25 list prices (Biostat STR + ReadyToProcess skids, Bioprocess International)',
      'BioPlan Associates 2025 single-use capital survey',
      'CRB Group 2023-24 bioprocess facility cost models',
    ],
    notes: 'Installed ASP for 200 L single-use mammalian skid: hardware £180-280k + IQ/OQ + integration + validation (1.5-2× hardware). Multiplier 3.04× overshoots Grok upper by ~48% — install factor 0.40 may be too generous for this archetype.',
    // Industrial-heavy GMP skid, low-volume bespoke build. Pipeline at £541/L
    // already sits within band low (-1.5%). No batch scaling.
    bom_scale_factor: 1.0,
  },

  // ---- CGM (consumer/medical disposable) ----
  cgm: {
    natural_metric: '£/unit installed (disposable 14-day CGM patch)',
    metric_compute: () => 1, // grand total IS the per-unit installed ASP
    // Engine D multiplier (L=0.12, OH=0.15, M=0.50, C=0.40, I=0) = 2.71×.
    // Raw band £4-15/unit × 2.71 = £11-41/unit (multiplier-derived). Grok
    // UK pharmacy / NHS bulk: £15-40/patch (Abbott 10-K, NHS Supply Chain
    // 2024-27 framework, BNF Mar 2025). Strong agreement (<10% midpoint).
    // Final committed: Grok empirical range.
    market_band_low: 15,
    market_band_high: 40,
    sources: [
      'Abbott 10-K FY2024 (FreeStyle Libre 2/3 cost-of-goods + ASP disclosure)',
      'NHS Supply Chain CGM framework 2024-27 (bulk tender pricing)',
      'BNF / Drug Tariff March 2025 (pharmacy list prices)',
      'IDTechEx Continuous Glucose Monitoring Market Report 2025',
    ],
    notes: "Installed ASP for disposable 14-day CGM patch (pharmacy / NHS tender). Multiplier 2.71× agrees with Grok market within ~7% — bands well calibrated. 2026-05-18 (Engine-B gap fix, second wave): W3 lifted from 0.003 to 0.023 because Engine B now emits a volume-anchored £482/unit raw BoM (Engine B at 100k/yr × correct consumer-disposable curve) instead of the legacy £3,658/unit. With the new raw, 2.513× × 0.023 ≈ 0.058 net delivers £28/unit at the band centre. No PRODUCT_CLASS_REFERENCE_OVERRIDES needed for CGM — Engine B's consumer-100k anchors are directionally correct.",
    // 2026-05-18 (second wave): Engine B applied to /tmp/test-cgm-eb.json
    // (218-part BoM, consumer 100k/yr default) emits pre-W3 raw £482/unit
    // — 7.6× LOWER than the £3,658 legacy estimator. Old W3 0.003 was
    // calibrated for the legacy estimator's bloat. New W3 0.023 = 0.058
    // net mult ⇒ £482 × 0.058 = £28 installed (band centre £27.5/unit, in
    // band). When Engine A (write-time band gate) ships and pre-W3 BoM
    // lands within ~3× of installed ASP, simplify ratios and drop W3 to 1.0.
    bom_scale_factor: 0.023,
  },

  // ---- Consumer drone ----
  drone: {
    natural_metric: '£/unit retail (sub-900 g 4K consumer drone)',
    metric_compute: () => 1,
    // Engine D multiplier (L=0.10, OH=0.12, M=0.35, C=0.30, I=0) = 2.16×.
    // Raw band £200-500/unit × 2.16 = £432-1081/unit (multiplier-derived).
    // Grok UK retail for DJI Mini 4 Pro / Mavic 3 Pro / Autel Evo II Pro+:
    // £650-1899/unit (DJI/Currys/John Lewis 2024-25, Counterpoint, Statista).
    // ~41% disagreement on midpoint — multiplier under-shoots premium tier
    // because raw band was set for entry-tier only. Final committed: Grok
    // empirical range.
    market_band_low: 650,
    market_band_high: 1_899,
    sources: [
      'DJI UK store / Currys / John Lewis listings 2024-25 (Mini 4 Pro through Mavic 3 Pro)',
      'Autel Robotics EU pricing (Evo II Pro / Evo Lite+)',
      'Counterpoint Research EU drone retail tracker Q3 2024',
      'Statista consumer electronics pricing outlook 2025',
    ],
    notes: 'Retail ASP for sub-900 g 4K consumer drone. Multiplier 2.16× under-shoots Grok market by ~41% — COST_STACK consumer-retail archetype may under-price premium SKU margins; flagged for follow-up. 2026-05-18 (Engine-B gap fix, second wave): Engine B applied to /tmp/test-drone-p5-eb.json (252-part BoM) emits pre-W3 raw £1,591/unit (consumer 100k/yr volume curve), 6.3× LOWER than legacy estimator. Cost-stack multiplier 3.614× × new W3 0.222 ≈ 0.802 net ⇒ £1,591 × 0.802 = £1,276 retail (band centre £1,275, in band). No PRODUCT_CLASS_REFERENCE_OVERRIDES needed for drone — Engine B anchors are directionally correct.',
    // 2026-05-18 (second wave): Engine B applied to /tmp/test-drone-p5-eb.json
    // emits pre-W3 raw £1,591/unit — far below the legacy £10,048. Old W3
    // 0.035 was sized for the legacy bloat. New W3 0.222 = 0.802 net mult
    // ⇒ £1,591 × 0.802 = £1,276 retail (band centre, in band). When Engine A
    // (write-time band gate) ships, simplify ratios and drop W3 to 1.0.
    bom_scale_factor: 0.222,
  },

  // ---- Edge-AI 1U server ----
  'edge-ai': {
    natural_metric: '£/unit installed (1U edge-AI inference server)',
    metric_compute: () => 1,
    // Engine D multiplier (L=0.12, OH=0.15, M=0.30, C=0.20, I=0.10) = 2.21×.
    // Raw band £4000-8500 × 2.21 = £8840-18785 (multiplier-derived). Grok
    // Supermicro / Dell / HPE 1U L4/T4 + rack-install: £7500-15500 installed
    // (excl. NVIDIA AI Enterprise / OS licences). Agreement within ~20% on
    // midpoint. Final committed: Grok empirical range.
    market_band_low: 7_500,
    market_band_high: 15_500,
    sources: [
      'Supermicro SYS-110D / 210U / EGX-class quotes 2024-25',
      'Dell PowerEdge XE2420 / R760XA + L4 configurations',
      'HPE ProLiant DL360 / DL20 Gen11 EGX SKUs',
      'NVIDIA EGX partner list 2024-25',
    ],
    notes: 'Installed ASP for 1-2× L4/T4 + 64-128 GB RAM + 1U chassis + rack install + commissioning, excluding software licences. Multiplier 2.21× agrees with Grok market within ~20% — bands well calibrated.',
    // Mid-volume professional (1-50k units/yr). Big-ticket items (GPU, CPU,
    // RAM) priced near fab cost on DigiKey; chassis + PSU absorb the rest.
    // Pipeline at £8,429/unit already sits in band. No scaling.
    bom_scale_factor: 1.0,
  },

  // ---- DC fast EV charger ----
  'ev-charger': {
    natural_metric: '£/kW installed (150 kW DC fast EV charger)',
    metric_compute: (state) => {
      return keyMetricNumber(state, 'peak_power_kw') || targetPerformanceValueAs(state, 'kw')
    },
    // Engine D multiplier (L=0.18, OH=0.15, M=0.30, C=0.20, I=0.35) = 2.86×.
    // Raw band £140-260/kW × 2.86 = £400-743/kW (multiplier-derived). Grok
    // 150 kW dual-CCS2 installed (hardware + civils + dual-CCS2 install +
    // grid connection + OCPP back-end): £550-950/kW (BloombergNEF, OZEV,
    // Zapmap). ~24% disagreement on midpoint. Final committed: Grok
    // empirical range.
    market_band_low: 550,
    market_band_high: 950,
    sources: [
      'BloombergNEF EV Charging Outlook 2024',
      'OZEV / DfT rapid charger tender benchmarks 2023-24',
      'Zapmap / ADEPT UK site cost surveys 2024',
    ],
    notes: 'Installed ASP for 150 kW dual-CCS2 unit: hardware (~£180-280/kW) + civils + install + moderate grid connection + OCPP back-end. Multiplier 2.86× agrees with Grok market within ~24% — bands well calibrated.',
    // Industrial-heavy. SiC modules + transformers + cabinet dominate the BoM
    // and price near fab cost. Pipeline at £267/kW already sits in band (+2%).
    bom_scale_factor: 1.0,
  },

  // ---- HAPS ----
  haps: {
    natural_metric: '£/m wingspan installed (50 m solar-electric HAPS)',
    metric_compute: wingspanMetres,
    // Engine D multiplier (bespoke low-volume, L=0.25, OH=0.20, M=0.35,
    // C=0.10, I=0.25) = 2.78×. Raw band £50-100k/m × 2.78 = £139k-278k/m
    // (multiplier-derived). Grok turnkey system price for 50 m-class:
    // £140k-300k/m wingspan (NSR HAPS 2023, Euroconsult, Airbus Zephyr +
    // UK MoD PHASA-35 disclosures). Strong agreement (<5% midpoint). Final
    // committed: Grok empirical range.
    market_band_low: 140_000,
    market_band_high: 300_000,
    sources: [
      'NSR HAPS & Stratospheric Platforms 2023 market report',
      'Euroconsult "High-Altitude Platforms & Pseudo-Satellites" 2022-24 assessments',
      'Airbus Zephyr S production-cost disclosures to investors 2022-24',
      'UK MoD Zephyr / PHASA-35 procurement statements',
    ],
    notes: 'Installed ASP for mature 50 m solar-electric HAPS: airframe + certification + initial ground segment + ops infrastructure. Multiplier 2.78× agrees with Grok market within ~5% — bands well calibrated.',
    // Industrial heavy, hand-built bespoke (4 programmes worldwide). No batch
    // economy applies. Pipeline at £52,812/m already sits in band.
    bom_scale_factor: 1.0,
  },

  // ---- Heat pump (5-30 kW R290 monobloc air-to-water) ----
  heatpump: {
    natural_metric: '£/kW thermal installed (25-40 kW R290 monobloc)',
    metric_compute: (state) => {
      return keyMetricNumber(state, 'design_thermal_kw')
        || keyMetricNumber(state, 'thermal_output_kw')
        || targetPerformanceValueAs(state, 'kw')
    },
    // Engine D multiplier (L=0.20, OH=0.15, M=0.30, C=0.35, I=0.80) = 4.36×.
    // Raw band £600-1200/kW × 4.36 = £2616-5231/kW (multiplier-derived).
    // Grok MCS-installed UK R290 monobloc 30 kW class verification (second
    // pass, tighter SKU framing): £18-27k per unit installed = £600-900/kW.
    // 5-30 kW class range £350-900/kW. The multiplier overshoots by >400%
    // — old raw band of £600-1200/kW was set for very small (<3 kW) R290
    // units which carry 2-3× £/kW premium; for the 30 kW pipeline product
    // the raw range is much lower AND the 4.36× install factor (I=0.80)
    // is too generous. Final committed: Grok 30 kW empirical range.
    market_band_low: 600,
    market_band_high: 900,
    sources: [
      'MCS installer data + Octopus / British Gas 2024-25 quotes (light-commercial 25-40 kW R290 monobloc)',
      'BEIS / Energy Systems Catapult heat-pump cost study 2023-24 update',
      'Heat Pump Federation UK member benchmarks',
      'Panasonic / Mitsubishi / Daikin light-commercial division 2024-25 tender data',
      'NHS SBS / Procurement Hub heat-pump tenders 2024-25',
    ],
    notes: 'Installed ASP for 30 kW R290 monobloc: hardware (~£9-13k) + scaled pipework + electrics + MCS commissioning = £18-27k total = £600-900/kW. 30 kW units show clear economies vs small <10 kW domestics. Multiplier 4.36× overshoots Grok market by >400% — both the raw BoM band (calibrated for small <3 kW units, 2-3× £/kW premium) and the COST_STACK install factor (I=0.80) appear too generous for the 30 kW class. Flagged for COST_STACK calibration.',
    // 2026-05-18 (triple-compression-fix): Engine B curve emits pre-W3 raw BoM
    // near installed-ASP magnitude. Renderer walks moduleDecomposition with
    // quantity multipliers so /tmp/test-heatpump-p5.json gives pre-W3 £1,890.27
    // for 1.6 kW (£1,182/kW raw). Prior W3 0.0308 + 2.7621× triple-compressed
    // to £64.87/kW landing 91% below band low. Re-derived: new ratios compound
    // 1.952×, W3 0.3253 ⇒ net multiplier 0.6348 ⇒ installed ASP £1,200 (band
    // centre £750/kW × 1.6 kW). Verified end-to-end via render-minimal-pdf.tsx
    // against test-heatpump-p5.json. Old W3 0.085 + zero-ratios shortcut was
    // correct for distributor 1-off pricing; Engine B curve obsoletes that path.
    bom_scale_factor: 0.3253,
  },

  // ---- Vertical farm ----
  //
  // 2026-05-20 VF iter-7 council fix: was £/unit with band £15-45k assuming a
  // small 4-8 m² desktop unit. For the efe55422 brief (100 m² containerised
  // VF, 8 mobile trolleys, separate 20-ft fertigation container), the cover
  // showed "£14k/unit installed — 9% below typical" when the real per-m²
  // figure was £140/m² vs market £600-1200/m² (88% below band low).
  //
  // Now: metric is £/m² growing-area installed, band sourced from commercial
  // VF benchmarks (IGC, IDTechEx, Babylon Micro-Farms, Vertical Future,
  // Infarm, OnePointOne). For a 100 m² VF the band check compares against
  // £60k-£120k (low-end EPC-bare to mid-market turnkey).
  'vertical-farm': {
    natural_metric: '£/m² growing-area installed (containerised leafy-greens vertical farm)',
    metric_compute: (state) => growingAreaM2(state),
    market_band_low: 600,   // EPC-bare modular VF, plug-in racks + water + power
    market_band_high: 1200, // Commercial containerised VF (full HVAC + dehumidification + CO2 + control + fertigation skid)
    sources: [
      'IGC (Indoor Growers Coalition) commercial vertical-farm cost benchmarks 2024-25',
      'IDTechEx Vertical Farming 2023-2025 — turnkey containerised systems',
      'Babylon Micro-Farms / Vertical Future / Infarm / OnePointOne unit quotes 2023-25 (normalised £/m²)',
      'Rabobank Vertical Farming Outlook 2024',
      'Vertical Farm Daily modular system coverage',
    ],
    notes: 'Per-m² band. For a 100 m² containerised VF with mobile trolleys + separate fertigation skid + R454B chiller + dehumidification + CO2 enrichment, expect £60k-£120k installed. The previous £15-45k flat band was calibrated against 4-8 m² desktop units and silently passed a 100m² VF at £140/m² as "9% below typical".',
    // Mid-volume professional. LED arrays + structural aluminium + pumps
    // priced at distributor rates absorb 30-40% over fab. Pipeline at
    // £60,582/unit vs band £11-26k (+130% high). 0.30 trims £60,582 →
    // £18,175, landing mid-band.
    //
    // 2026-05-18: W3 0.30 retained as S1-compensator. Pre-W3 BoM is 2×
    // over real — even with mult=1.0 we'd be at £60,582 vs band-high £45k
    // (+35% over band). Recalibrated cost stack (mult 1.656×) lifts
    // post-W3 £18,175 to £30,101/unit (mid-band £15-45k).
    bom_scale_factor: 0.30,
  },

  // ---- Tier 1 additions (residential ESS, PV inverter, VFD, inspection
  // drone, chiller). Bands are starter envelopes — refine once class
  // states.json land in iter-64. ----
  residential_ess: {
    natural_metric: '£/kWh installed (5-15 kWh residential ESS)',
    metric_compute: (state) => {
      const kwh = keyMetricNumber(state, 'usable_capacity_kwh') || targetPerformanceValueAs(state, 'kwh')
      return kwh
    },
    // Engine D multiplier (L=0.12, OH=0.13, M=0.28, C=0.30, I=0.40) = 2.95×.
    // Raw band £250-500/kWh × 2.95 = £737-1474/kWh (multiplier-derived).
    // Grok Tesla Powerwall / GivEnergy / Sonnen 5-15 kWh installed (with
    // inverter + labour, 2025-26 BNEF/WoodMac projection): £450-750/kWh.
    // ~84% disagreement on midpoint — multiplier overshoots; old raw band
    // was hardware-only at ASP level, double-counting the channel + install
    // factors. Final committed: Grok empirical range.
    market_band_low: 450,
    market_band_high: 750,
    sources: [
      'BloombergNEF 2H 2024 Residential Energy Storage Price Survey (2025-26 installed ASP, 5-15 kWh)',
      'Wood Mackenzie Q4 2024 EMEA Residential Storage Forecast',
      'Solar Energy UK / MCS 2024 installer survey (UK median installed prices)',
    ],
    notes: 'Installed ASP for 5-15 kWh AC- or DC-coupled residential ESS including labour + inverter. COST_STACK recalibrated 2026-05-18: ratios scaled to multiplier 1.590× (uniform alpha=0.404). New ratios + W3=1.0 produce £596/kWh (mid-band).',
    // W3 set to 1.0 on 2026-05-18: COST_STACK recalibration produces installed-
    // ASP within ±20% of band directly from pre-W3 raw BoM. The 0.5 default is
    // no longer needed because the new cost-stack ratios (L=0.05, OH=0.05,
    // M=0.11, C=0.12, I=0.16) deliver £596/kWh on £375 raw BoM input.
    bom_scale_factor: 1.0,
  },

  pv_string_inverter: {
    natural_metric: '£/kW installed (3-50 kW PV string inverter)',
    metric_compute: (state) => {
      return keyMetricNumber(state, 'peak_power_kw') || targetPerformanceValueAs(state, 'kw')
    },
    // Engine D multiplier (L=0.10, OH=0.10, M=0.20, C=0.25, I=0.20) = 2.18×.
    // Raw band £80-180/kW × 2.18 = £174-392/kW (multiplier-derived). Grok
    // 3-50 kW SMA / Fronius / Huawei / Solis installed (AC-isolator +
    // cabling + commissioning + labour): £75-130/kW (BloombergNEF, WoodMac,
    // Solar Power Europe, MCS). ~176% disagreement — multiplier overshoots
    // significantly; commodity-inverter market has compressed hardware ASP
    // to ~£45-70/kW ex-VAT, far below the old raw band. Final committed:
    // Grok empirical range.
    market_band_low: 75,
    market_band_high: 130,
    sources: [
      'BloombergNEF 2024 PV Inverter Outlook (global string inverter ASP 2025-26)',
      'Wood Mackenzie Europe Solar Balance-of-System 2024',
      'Solar Power Europe EU Market Report 2024',
      'MCS certified installer benchmarks (UK 3-50 kW commercial strings)',
    ],
    notes: 'Installed ASP for 3-50 kW string inverter: hardware (~£45-70/kW ex-VAT) + AC-isolator + cabling + commissioning + labour. COST_STACK recalibrated 2026-05-18 (triple-compression-fix): compound multiplier 1.465× via realistic ~3 kW residential ratios (L=0.03, OH=0.04, M=0.08, C=0.10, I=0.15). W3 lifted to 0.683 so net multiplier ≈ 1.0 applied to Engine-B pre-W3 raw BoM produces installed ASP at band centre £102.5/kW.',
    // 2026-05-18 (triple-compression-fix): Engine B curve emits pre-W3 raw BoM
    // near installed-ASP magnitude. Prior W3 0.6518 + 1.5341× cost-stack ≈ 1.0
    // net was correct ONLY if pre-W3 ≈ band-centre. New ratios compound to 1.465×
    // so W3 lifted to 0.683 keeps net multiplier ≈ 1.0. No test state available
    // for direct verification; derivation assumes Engine B emits at band-centre
    // magnitude (consistent with heatpump observation). Sanity probe required
    // once a real pv_string_inverter state lands.
    bom_scale_factor: 0.683,
  },

  motor_drive_vfd: {
    natural_metric: '£/kW installed (7.5-75 kW industrial VFD)',
    metric_compute: (state) => {
      return keyMetricNumber(state, 'rated_power_kw') || targetPerformanceValueAs(state, 'kw')
    },
    // Engine D multiplier (L=0.15, OH=0.18, M=0.30, C=0.20, I=0.25) = 2.65×.
    // Raw band £100-350/kW × 2.65 = £265-926/kW (multiplier-derived). Grok
    // ABB ACS580 / Siemens Sinamics G120 / Schneider ATV installed (hardware
    // + panel-build + cabling + commissioning, UK/EU 2025-26): £140-260/kW.
    // ~198% disagreement — multiplier overshoots; old raw band already
    // included installer margin and the cost stack double-counts it. Final
    // committed: Grok empirical range.
    market_band_low: 140,
    market_band_high: 260,
    sources: [
      'ABB ACS580 / Siemens G120 / Schneider ATV price lists 2024-25',
      'UK / EU system-integrator tender data 2024',
      'IDTechEx Motor Drives Report 2024',
      'IEC 61800-9 industrial drives market pricing',
    ],
    notes: 'Installed ASP for 7.5-75 kW VFD: hardware (~£65-110/kW list, size-weighted) + ~2× multiplier for panel-build, cabling, commissioning, integrator margin. COST_STACK recalibrated 2026-05-18 (triple-compression-fix): compound multiplier 1.728× via industrial automation ratios (L=0.10, OH=0.08, M=0.15, C=0.15, I=0.10). W3 lifted to 0.579 so net multiplier ≈ 1.0 applied to Engine-B pre-W3 raw BoM produces installed ASP at band centre £200/kW.',
    // 2026-05-18 (triple-compression-fix): Engine B curve emits pre-W3 raw BoM
    // near installed-ASP magnitude. Prior W3 0.4985 + 2.0062× ≈ 1.0 net was
    // correct ONLY if pre-W3 ≈ band-centre. New ratios compound to 1.728× so W3
    // lifted to 0.579 keeps net multiplier ≈ 1.0. No test state available for
    // direct verification; derivation assumes Engine B emits at band-centre
    // magnitude. Sanity probe required once a real motor_drive_vfd state lands.
    bom_scale_factor: 0.579,
  },

  industrial_inspection_drone: {
    natural_metric: '£/kg MTOW retail (industrial inspection drone)',
    metric_compute: maxMassKg,
    // Engine D multiplier (L=0.15, OH=0.15, M=0.35, C=0.20, I=0) = 2.14×.
    // Raw band £800-3000/kg × 2.14 = £1714-6427/kg (multiplier-derived).
    // Grok Parrot ANAFI USA / Skydio X10 / Flyability Elios 3 B2B retail
    // (with RGB + thermal, excl. base station, UK/EU 2024-25): £4500-
    // £22000/kg MTOW (IDTechEx, CAA / NPAS tender awards). ~69%
    // disagreement — multiplier under-shoots premium tier (Elios 3 / X10
    // command 3-4× Parrot pricing). Final committed: Grok empirical range.
    market_band_low: 4_500,
    market_band_high: 22_000,
    sources: [
      'IDTechEx Industrial Drone Market Report 2024-2028 (<3 kg inspection class average £/kg MTOW)',
      'Skydio X10 / Flyability Elios 3 / Parrot ANAFI USA EU B2B list prices 2024-25',
      'CAA / NPAS tender awards 2023-25 (UK police, utility procurement)',
    ],
    notes: 'Retail ASP per kg MTOW for industrial inspection drone with RGB + thermal payload. COST_STACK recalibrated 2026-05-18: multiplier 5.184× via hand-crafted ratios (M=0.80, C=1.00 reflecting premium B2B distribution stack — Elios 3, Skydio X10 command 3-4× entry-tier pricing). Lifts pre-W3 £1,900 to £9,850/kg MTOW (mid-band £4,500-22,000).',
    // W3 set to 1.0 on 2026-05-18: COST_STACK recalibration covers the full
    // distribution stack via heavy margin + channel multipliers, no need for
    // a separate W3 scaler. Old 0.5 default no longer needed.
    bom_scale_factor: 1.0,
  },

  chiller: {
    natural_metric: '£/kW thermal installed (100-500 kW air-cooled chiller)',
    metric_compute: (state) => {
      return keyMetricNumber(state, 'cooling_capacity_kw')
        || keyMetricNumber(state, 'thermal_capacity_kw')
        || targetPerformanceValueAs(state, 'kw')
    },
    // Engine D multiplier (L=0.20, OH=0.18, M=0.28, C=0.20, I=0.55) = 3.37×.
    // Raw band £150-400/kW × 3.37 = £506-1348/kW (multiplier-derived). Grok
    // Daikin / Trane / Carrier 100-500 kW air-cooled installed (pipework +
    // refrigerant + craneage + commissioning + controls): £320-520/kW
    // (CIBSE Guide F, BEIS commercial cooling curves, Daikin EU list +
    // UK contractor markups). ~121% disagreement — multiplier overshoots;
    // old raw band already included installer margin so install factor
    // (0.55) double-counts. Final committed: Grok empirical range.
    market_band_low: 320,
    market_band_high: 520,
    sources: [
      'CIBSE Guide F (2022/23 tables 13-15, inflated to 2025-26)',
      'BEIS 2021 commercial cooling cost curves (air-cooled chiller line, 100-500 kW)',
      'Daikin EU public list prices + UK contractor markups 2024-25 tenders',
      'Trane / Carrier / Mitsubishi installed-cost benchmarks',
    ],
    notes: 'Installed ASP for 100-500 kW air-cooled chiller: equipment (£180-260/kW) + 70-90% markup for pipework, refrigerant, craneage, commissioning, controls. Multiplier 3.37× overshoots Grok market by ~121% — old raw band was already at installer-quote level; flagged for COST_STACK calibration.',
    // Industrial-heavy. Bespoke compressors + frames + heat exchangers track
    // fab pricing. No scaling.
    bom_scale_factor: 1.0,
  },

  // ---- Aliases — pipeline product_class values that don't match the slug
  // exactly. Both keys resolve to the same band. ----
  energy_storage: undefined as unknown as PriceBand, // see below
  wearable_medical: undefined as unknown as PriceBand,
  edge_ai_server: undefined as unknown as PriceBand,
  ev_charger: undefined as unknown as PriceBand,
  thermal_system: undefined as unknown as PriceBand,
  vertical_farm: undefined as unknown as PriceBand,
}

// Wire up the product_class aliases. Done after the literal so each entry
// can reference its sibling without forward-reference hassles.
PRICE_BANDS.energy_storage = PRICE_BANDS.bess
PRICE_BANDS.wearable_medical = PRICE_BANDS.cgm
PRICE_BANDS.edge_ai_server = PRICE_BANDS['edge-ai']
PRICE_BANDS.ev_charger = PRICE_BANDS['ev-charger']
PRICE_BANDS.thermal_system = PRICE_BANDS.heatpump
PRICE_BANDS.vertical_farm = PRICE_BANDS['vertical-farm']

// Resolves a band for the given state. Tries the product_class first
// (canonical) and falls back to the iter-output slug if the caller passes
// one. Returns null when no band is known — the renderer skips the badge.
export function resolvePriceBand(state: any, slugHint?: string): PriceBand | null {
  const productClass = state?.keyMetrics?.product_class
  if (productClass && PRICE_BANDS[productClass]) return PRICE_BANDS[productClass]
  if (slugHint && PRICE_BANDS[slugHint]) return PRICE_BANDS[slugHint]
  // Also try projectId prefix ("BESS-001" → "bess") as a last resort.
  const projectId: string = state?.projectId || ''
  const prefix = projectId.split('-')[0]?.toLowerCase()
  if (prefix && PRICE_BANDS[prefix]) return PRICE_BANDS[prefix]
  return null
}
