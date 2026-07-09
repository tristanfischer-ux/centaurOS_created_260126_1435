/**
 * process-equipment-cost.ts — defensible, traceable cost basis for fabricated process equipment.
 *
 * Level 2 of the cost audit trail (see CO2-COST-AUDIT-TRAIL-PLAN.md + CO2-COST-FINDINGS.md).
 * Replaces the engine's class-anchor / LLM-guess price for fabricated PROCESS equipment with a
 * cost computed from PUBLISHED equipment cost curves, and returns a `CostBasis` trail record so a
 * dossier can answer "where did this number come from?" per line.
 *
 * SOURCE (public domain, citable):
 *   H.P. Loh, J. Lyons, C.W. White III, "Process Equipment Cost Estimation, Final Report",
 *   DOE/NETL-2002/1169, January 2002. Purchased-equipment cost curves, 1st-quarter 1998 US$,
 *   carbon-steel (A515) basis. Anchor points below are read off the named charts (page cited).
 *
 * CONVERSION CHAIN (applied uniformly):
 *   £_2024 = chart$_1998 × (CEPCI_2024 / CEPCI_1998) × material_factor × USD→GBP
 *   installed = purchased × Lang factor (4.74, fluids-processing plant)
 *
 * ACCURACY: AACE Class 4 (±30%) concept estimate — NOT a vendor quote. Sizes outside a curve's
 * range, or equipment with no applicable curve (e.g. packaged forced-circulation crystallisers),
 * return rfq_recommended=true so the trail never dresses a guess as a quote.
 *
 * Pure module: no chain / DB / network / clock dependency. Deterministic. Unit-tested in
 * process-equipment-cost.test.tsx (reproduces the signed-off CO₂ mockup flagship numbers ±15%).
 */

// ───────────────────────── Cost-basis trail record ─────────────────────────

export type CostMethod =
  | 'vendor_quote'      // a real supplier quotation (highest confidence)
  | 'catalogue'         // live distributor / catalogue price
  | 'capacity_factored' // published cost curve evaluated on a sized capacity (this module)
  | 'material_takeoff'  // mass × £/kg + fabrication
  | 'factored'          // base equipment × installation / Lang factor
  | 'class_reference'   // engine component-class reference curve (indicative)
  | 'llm_estimate'      // model-authored list price (lowest confidence)

export type EstimateClass = 1 | 2 | 3 | 4 | 5 // AACE International estimate classes

export interface CostSourceRef { ref: string; locator?: string; url?: string; basis_year?: number }
export interface CostInput { name: string; value: number; unit: string; source?: string }
export interface CostFactor { name: string; value: number; source?: string }

/** The per-line audit-trail record. Attached to a partVerification; rendered in the Cost Basis section. */
export interface CostBasis {
  method: CostMethod
  inputs: CostInput[]
  factors: CostFactor[]
  correlation?: CostSourceRef
  result_gbp: number
  estimate_class: EstimateClass
  confidence: 'low' | 'moderate' | 'high'
  rfq_recommended: boolean
  notes?: string
  how_to_verify?: string
  /**
   * Human-readable one-line derivation, shown under the BoM table (Section 8 notes) so the
   * BoM price IS the right number with its working visible — e.g.
   * "1,292 kg 316L × £6/kg = £7,752 material + £34,884 fabrication (×5.5) = £42,636, ±30%".
   * Set for the material-take-off path; the curve/catalogue paths leave it undefined.
   */
  working?: string
}

// ───────────────────────── Sourced indices & factors ─────────────────────────

export const COST_INDICES = {
  cepci: { y1998: 389.5, y2024: 800 }, // 1998 from DOE/NETL Table 11; 2024 ≈ 800 (CEPCI went paywalled late-2024, secondary source)
  usd_to_gbp: 0.79,
  lang_factor_fluids: 4.74, // installed = purchased × Lang (fluids-processing plant), DOE/NETL p2 / Lang
  source: { ref: 'DOE/NETL-2002/1169', locator: 'Table 11 (CEPCI) + Lang factor', basis_year: 1998 } as CostSourceRef,
}

/** Escalation 1998→2024 ≈ 2.054. */
export const ESCALATION = COST_INDICES.cepci.y2024 / COST_INDICES.cepci.y1998

/**
 * Escalate a purchased-equipment cost from `basisYear` to `targetYear` via CEPCI.
 *
 * @description Uses COST_INDICES.cepci (1998→2024 known). Same year returns `cost`
 * unchanged. For 1998→2024 returns `cost * (800 / 389.5)`. Only those two index years
 * are tabulated; any other year pair that is not both known returns `cost` unchanged
 * (no fabricated interpolation beyond the two known points — linear blend is only used
 * when both endpoints are the known 1998/2024 pair, which is the identity of ESCALATION).
 *
 * @param cost - Cost in the basis-year currency units (typically USD).
 * @param basisYear - Year the cost is quoted in (e.g. 1998 for DOE/NETL curves).
 * @param targetYear - Year to escalate to (default 2024).
 * @returns Escalated cost; unchanged when years match or an index year is unknown.
 */
export function escalateToBaseYear(
  cost: number,
  basisYear: number,
  targetYear = 2024,
): number {
  if (!Number.isFinite(cost) || cost === 0) return cost
  if (basisYear === targetYear) return cost
  const idx: Record<number, number> = {
    1998: COST_INDICES.cepci.y1998,
    2024: COST_INDICES.cepci.y2024,
  }
  const from = idx[basisYear]
  const to = idx[targetYear]
  // Only escalate when BOTH years are tabulated. Unknown years: return cost unchanged
  // (no fabricated index) — documented behaviour for T-16.
  if (from == null || to == null || from === 0) return cost
  return cost * (to / from)
}

/**
 * Alloy-conversion factors on a carbon-steel base — DOE/NETL Table 7 (p45).
 * NOTE: 2.90 is SOLID 316 stainless ("Other Equipment"). Clad / rubber-lined construction is much
 * cheaper (~1.5×) — the single biggest sensitivity in any 316 process estimate. Pick deliberately.
 */
export const MATERIAL_FACTORS = {
  carbon_steel: 1.0,
  ss316_vessel: 2.90, // Type 316 / Other Equipment
  ss304_vessel: 2.80, // Type 304 / Other Equipment
  ss316_pump: 1.80,   // Type 316 / Pumps
  ss304_hx: 2.86,     // 304 Shell & Tubes (316 not tabulated for HX in Table 7; closest, mildly low)
  clad_lined: 1.5,    // clad / rubber-lined approximation — NOT solid alloy; confirm metallurgy
  none: 1.0,          // curve already alloy (e.g. spiral-plate HX is SS304) or carbon-steel service
} as const
export type MaterialKey = keyof typeof MATERIAL_FACTORS

// ──────────────────── Material take-off rates & fabrication factors ────────────────────
// The honest, transparent path for a FABRICATED vessel/column/reactor: the purchased price is
//   purchased = mass_kg × material_£/kg × fabrication_factor
// where the MATERIAL portion = mass × rate (the metal) and the FABRICATION portion is the rest
// (rolling/forming, longitudinal + circumferential welding, NDT, nozzles/manways, internals,
// supports, surface finish, assembly, vendor margin). One sourced rate + one factor per shape,
// so a reviewer can re-derive the figure by hand from the registered shell mass. AACE Class 4 (±30%).

/** Fabrication-grade plate/wrought metal rates, £/kg (UK delivered, 2024). The metal only. */
export const MATERIAL_RATE_GBP_PER_KG = {
  ss316l: 6,           // 316L austenitic stainless (the CO₂ wet-process default)
  ss304: 5,            // 304 austenitic stainless
  carbon_steel: 1.2,   // carbon steel plate (A516 / S275)
  rubber_lined_cs: 2.5, // carbon steel + bonded rubber lining (corrosion service)
} as const
export type TakeoffMaterialKey = keyof typeof MATERIAL_RATE_GBP_PER_KG

/**
 * Fabrication factor = purchased ÷ raw-material cost. Covers forming/rolling, welding, NDT,
 * nozzles, internals, assembly and vendor margin. Heavier for code columns (tall, many nozzles,
 * trays/packing supports), lighter for an atmospheric tank (simple shell, few penetrations).
 */
export const FABRICATION_FACTOR = {
  column: 5.5,           // packed / tray distillation or absorption column (15 psig+)
  pressure_vessel: 4.5,  // stirred reactor / jacketed pressure vessel
  tank: 3.0,             // atmospheric storage / buffer tank
} as const
export type FabricationShape = keyof typeof FABRICATION_FACTOR

const MATERIAL_LABEL: Record<TakeoffMaterialKey, string> = {
  ss316l: '316L', ss304: '304 stainless', carbon_steel: 'carbon steel', rubber_lined_cs: 'rubber-lined CS',
}

// ───────────────────── DOE/NETL purchased-cost curves (1998 US$, CS) ─────────────────────
// Anchor points read off the named chart; interpolated log-log within `range`. A size outside
// `range` clamps to the nearest anchor and flags extrapolation (lower confidence / RFQ).

interface Curve { equipment: string; page: number; sizeUnit: string; anchors: [number, number][]; range: [number, number] }

const CURVES: Record<string, Curve> = {
  vertical_vessel_15psig: { equipment: 'Vertical Vessel 15 psig', page: 5, sizeUnit: 'US_gal',
    anchors: [[100, 6550], [264, 8500], [1000, 13000], [5000, 28000]], range: [100, 5000] },
  agitator: { equipment: 'Agitator', page: 27, sizeUnit: 'hp',
    anchors: [[1, 3900], [5.4, 9000], [25, 19000]], range: [1, 50] },
  shell_tube_hx: { equipment: 'Shell & Tube HX', page: 15, sizeUnit: 'ft2',
    anchors: [[100, 11000], [500, 24000], [2000, 60000]], range: [100, 5000] }, // curve floor ~100 ft²
  spiral_plate_hx: { equipment: 'Spiral Plate HX (SS304)', page: 17, sizeUnit: 'ft2',
    anchors: [[20, 5500], [86, 9500], [300, 20000]], range: [10, 500] }, // already SS304 → material 'none'
  centrifugal_pump: { equipment: 'Centrifugal Pump', page: 30, sizeUnit: 'gpm',
    anchors: [[100, 3800], [500, 6500], [2000, 14000]], range: [100, 5000] }, // floor ~100 gpm
  rotary_blower: { equipment: 'Rotary Blower 8 psig', page: 36, sizeUnit: 'cfm',
    anchors: [[50, 7000], [132, 13000], [500, 28000]], range: [20, 1000] },
}

/** Packed column 15 psig (p12): cost($1998) = a + b·packedHeight_ft, per internal-diameter line. */
const PACKED_COLUMN_15PSIG: Record<number, { a: number; b: number }> = {
  1.0: { a: 7031, b: 151.5 }, // calibrated to DOE p12 ID=1 ft line (drawn to ~18 ft; beyond = extrapolated)
  2.0: { a: 9800, b: 400 },
  3.0: { a: 13000, b: 500 },
  3.5: { a: 17400, b: 450 },
}
const PACKED_COLUMN_DRAWN_FT = 18 // beyond this the ID=1 line is extrapolated

// ───────────────────────────── Curve evaluation ─────────────────────────────

/** Log-log interpolation between bracketing anchors; clamp + flag outside range. */
function evalCurve(c: Curve, size: number): { usd1998: number; extrapolated: boolean } {
  const [lo, hi] = c.range
  const extrapolated = size < lo || size > hi
  const s = Math.max(c.anchors[0][0], Math.min(size, c.anchors[c.anchors.length - 1][0]))
  for (let i = 0; i < c.anchors.length - 1; i++) {
    const [s0, c0] = c.anchors[i], [s1, c1] = c.anchors[i + 1]
    if (s >= s0 && s <= s1) {
      const k = Math.log(c1 / c0) / Math.log(s1 / s0)
      return { usd1998: c0 * Math.pow(s / s0, k), extrapolated }
    }
  }
  // size below first / above last anchor → nearest anchor
  const nearest = size <= c.anchors[0][0] ? c.anchors[0][1] : c.anchors[c.anchors.length - 1][1]
  return { usd1998: nearest, extrapolated: true }
}

function packedColumnUsd1998(idFt: number, heightFt: number): { usd1998: number; extrapolated: boolean } {
  // nearest tabulated ID line (our process columns are ID≈1 ft); linear in packed height
  const ids = Object.keys(PACKED_COLUMN_15PSIG).map(Number).sort((a, b) => a - b)
  const id = ids.reduce((best, x) => (Math.abs(x - idFt) < Math.abs(best - idFt) ? x : best), ids[0])
  const { a, b } = PACKED_COLUMN_15PSIG[id]
  return { usd1998: a + b * heightFt, extrapolated: heightFt > PACKED_COLUMN_DRAWN_FT }
}

// ───────────────────────────── Unit helpers ─────────────────────────────
export const toGallonsUS = (m3: number) => m3 * 264.172
export const toFt2 = (m2: number) => m2 * 10.7639
export const toFt = (m: number) => m * 3.28084
export const kwToHp = (kw: number) => kw * 1.34102
export const m3hToGpm = (m3h: number) => m3h * 4.40287
export const m3hToCfm = (m3h: number) => m3h * 0.588578

// ───────────────────────────── Public API ─────────────────────────────

export interface EquipmentSpec {
  label: string
  /** curve key, 'packed_column', or 'none' (no applicable curve → must be quoted) */
  curve: keyof typeof CURVES | 'packed_column' | 'none'
  /** sizing input in the curve's native unit (already converted) */
  size?: { value: number; unit: string }
  /** packed-column geometry (when curve === 'packed_column') */
  packedColumn?: { idFt: number; heightFt: number }
  /** alloy / material key (Table 7); use 'none' when the curve is already alloy or CS service */
  material: MaterialKey
  /** add an agitator cost on top of the vessel (e.g. stirred reactor); hp in the agitator curve */
  agitatorHp?: number
  /** equipment with no curve: supply a quote range; method becomes vendor_quote, rfq flagged */
  rfqRange?: { lowGbp: number; highGbp: number; reason: string }
}

/** Cost a single piece of fabricated process equipment, returning the GBP figure + its trail. */
export function costProcessEquipment(spec: EquipmentSpec): { gbp: number; basis: CostBasis } {
  const escal = round(ESCALATION, 3)
  const fx = COST_INDICES.usd_to_gbp

  // No applicable curve → honest RFQ range, do not invent a number.
  if (spec.curve === 'none' || spec.rfqRange) {
    const r = spec.rfqRange ?? { lowGbp: 0, highGbp: 0, reason: 'no applicable cost curve' }
    const mid = (r.lowGbp + r.highGbp) / 2
    return {
      gbp: mid,
      basis: {
        method: 'vendor_quote',
        inputs: spec.size ? [{ name: 'size', value: spec.size.value, unit: spec.size.unit }] : [],
        factors: [],
        result_gbp: mid,
        estimate_class: 5,
        confidence: 'low',
        rfq_recommended: true,
        notes: `No DOE/NETL curve fits this item — ${r.reason}. Range £${fmt(r.lowGbp)}–£${fmt(r.highGbp)}; must be quoted.`,
      },
    }
  }

  const matFactor = MATERIAL_FACTORS[spec.material]
  const inputs: CostInput[] = []
  const factors: CostFactor[] = [
    { name: 'CEPCI escalation 1998→2024', value: escal, source: 'CEPCI 389.5→800' },
    { name: 'material factor', value: matFactor, source: `DOE/NETL Table 7 (${spec.material})` },
    { name: 'USD→GBP', value: fx },
  ]

  let usd1998 = 0
  let page = 0
  let equipmentName = ''
  let extrapolated = false

  if (spec.curve === 'packed_column') {
    const pc = spec.packedColumn!
    const r = packedColumnUsd1998(pc.idFt, pc.heightFt)
    usd1998 = r.usd1998; extrapolated = r.extrapolated; page = 12; equipmentName = 'Packed Column 15 psig'
    inputs.push({ name: 'internal diameter', value: round(pc.idFt, 2), unit: 'ft' })
    inputs.push({ name: 'packed height', value: round(pc.heightFt, 1), unit: 'ft' })
  } else {
    const c = CURVES[spec.curve]
    const r = evalCurve(c, spec.size!.value)
    usd1998 = r.usd1998; extrapolated = r.extrapolated; page = c.page; equipmentName = c.equipment
    inputs.push({ name: c.equipment, value: round(spec.size!.value, 1), unit: c.sizeUnit })
  }

  // optional agitator on top of a vessel (stirred reactor)
  let agitatorUsd = 0
  if (spec.agitatorHp != null) {
    const r = evalCurve(CURVES.agitator, spec.agitatorHp)
    agitatorUsd = r.usd1998
    inputs.push({ name: 'agitator', value: round(spec.agitatorHp, 1), unit: 'hp' })
  }

  const purchasedUsd = usd1998 + agitatorUsd
  const gbp = purchasedUsd * escal * matFactor * fx

  // estimate class / confidence degrade on extrapolation or curve-floor clamps
  const onFloor = (spec.curve === 'shell_tube_hx' && (spec.size?.value ?? 0) <= 110) ||
    (spec.curve === 'centrifugal_pump' && (spec.size?.value ?? 0) <= 110)
  const confidence: CostBasis['confidence'] = extrapolated || onFloor ? 'low' : 'moderate'
  const estimate_class: EstimateClass = extrapolated || onFloor ? 5 : 4
  const rfq = extrapolated || onFloor

  const notes: string[] = []
  if (extrapolated) notes.push('size beyond the drawn curve range — extrapolated, recommend a vendor quote')
  if (onFloor) notes.push('size below the curve resolution floor — figure is the chart minimum, not a true read; quote advised')

  return {
    gbp: round(gbp, 0),
    basis: {
      method: 'capacity_factored',
      inputs,
      factors,
      correlation: { ref: 'DOE/NETL-2002/1169', locator: `${equipmentName}, p${page}`, basis_year: 1998 },
      result_gbp: round(gbp, 0),
      estimate_class,
      confidence,
      rfq_recommended: rfq,
      notes: notes.length ? notes.join('; ') : undefined,
      how_to_verify: "Recompute: qty × rate from basis formula",
    },
  }
}

// ───────────────────────── Material take-off (fabricated equipment) ─────────────────────────

export interface TakeoffSpec {
  label: string
  /** registered shell mass of the fabricated vessel (kg) — from the engineering contract */
  massKg: number
  /** plate/wrought metal of construction */
  material: TakeoffMaterialKey
  /** shape → fabrication factor (column 5.5 / pressure_vessel 4.5 / tank 3.0) */
  shape: FabricationShape
  /**
   * Optional bought-in agitator/drive added on top of the bare fabricated shell, when the
   * agitator is NOT already a separate BoM line (e.g. a small 0.4 m³ lime reactor). Supply the
   * GBP figure (the caller maps kW → £ in its sizing map). Omit when the agitator is its own line.
   */
  agitatorGbp?: number
  agitatorKw?: number
}

/**
 * Cost a FABRICATED vessel / column / reactor from its shell mass:
 *   purchased = mass_kg × material_£/kg × fabrication_factor  (+ optional bought-in agitator)
 * The MATERIAL portion (mass × rate) and the FABRICATION portion (the rest) are reported
 * separately, and a human-readable `working` string carries the whole derivation for the BoM
 * notes. AACE Class 4, moderate confidence, ±30%. The honest answer for the four wet-process
 * vessels whose mass the engine already registers — no DOE/NETL curve, no extrapolation flag.
 */
export function costMaterialTakeoff(spec: TakeoffSpec): { gbp: number; basis: CostBasis } {
  const rate = MATERIAL_RATE_GBP_PER_KG[spec.material]
  const fab = FABRICATION_FACTOR[spec.shape]
  const materialGbp = round(spec.massKg * rate, 0)
  const purchasedShellGbp = round(spec.massKg * rate * fab, 0)
  const fabricationGbp = purchasedShellGbp - materialGbp
  const agitatorGbp = spec.agitatorGbp != null ? round(spec.agitatorGbp, 0) : 0
  const totalGbp = purchasedShellGbp + agitatorGbp

  const matLabel = MATERIAL_LABEL[spec.material]
  let working =
    `${fmt(spec.massKg)} kg ${matLabel} × £${rate}/kg = £${fmt(materialGbp)} material ` +
    `+ £${fmt(fabricationGbp)} fabrication (×${fab}) = £${fmt(purchasedShellGbp)}`
  if (agitatorGbp > 0) {
    working += ` + £${fmt(agitatorGbp)} agitator${spec.agitatorKw != null ? ` (${spec.agitatorKw} kW)` : ''} = £${fmt(totalGbp)}`
  }
  working += ', ±30%'

  const inputs: CostInput[] = [
    { name: 'shell mass', value: round(spec.massKg, 0), unit: 'kg', source: 'engineering contract' },
  ]
  if (agitatorGbp > 0 && spec.agitatorKw != null) inputs.push({ name: 'agitator', value: spec.agitatorKw, unit: 'kW' })
  const factors: CostFactor[] = [
    { name: `material rate (${matLabel})`, value: rate, source: `£${rate}/kg fabrication-grade plate` },
    { name: `fabrication factor (${spec.shape.replace('_', ' ')})`, value: fab, source: 'purchased ÷ raw-material; forming/welding/NDT/nozzles/assembly/margin' },
  ]

  return {
    gbp: round(totalGbp, 0),
    basis: {
      method: 'material_takeoff',
      inputs,
      factors,
      correlation: { ref: 'Material take-off (mass × £/kg + fabrication factor)', basis_year: 2024 },
      result_gbp: round(totalGbp, 0),
      estimate_class: 4,
      confidence: 'moderate',
      rfq_recommended: false,
      notes: `Fabricated ${spec.shape.replace('_', ' ')} re-costed from its shell mass: material + fabrication. ±30% (AACE Class 4).`,
      working,
    },
  }
}

/** Installed plant cost from a purchased-equipment total, via the fluids-processing Lang factor. */
export function installedFromPurchased(purchasedTotalGbp: number): { gbp: number; basis: CostFactor } {
  return {
    gbp: round(purchasedTotalGbp * COST_INDICES.lang_factor_fluids, 0),
    basis: { name: 'Lang factor (fluids-processing plant)', value: COST_INDICES.lang_factor_fluids, source: 'DOE/NETL p2' },
  }
}

/** Wrap a live catalogue / distributor price as a cost-basis record (method: catalogue). */
export function catalogueBasis(gbp: number, source: { vendor?: string; url?: string; mpn?: string }): CostBasis {
  return {
    method: 'catalogue',
    inputs: [],
    factors: [],
    correlation: source.url ? { ref: source.vendor ?? 'distributor', url: source.url, locator: source.mpn } : undefined,
    result_gbp: round(gbp, 0),
    estimate_class: 2,
    confidence: 'high',
    rfq_recommended: false,
    notes: source.mpn ? `Catalogue price for ${source.vendor ?? ''} ${source.mpn}`.trim() : undefined,
  }
}

// ───────────────────────────── small utils ─────────────────────────────
function round(n: number, dp = 0): number { const p = Math.pow(10, dp); return Math.round(n * p) / p }
function fmt(n: number): string { return Math.round(n).toLocaleString('en-GB') }

// ───────────────────────────── --selftest (T-16) ─────────────────────────────
function _selftest(): void {
  const want = 100 * (800 / 389.5)
  const got = escalateToBaseYear(100, 1998, 2024)
  if (got !== want) {
    console.error(`[process-equipment-cost] SELFTEST FAIL: escalateToBaseYear(100,1998,2024)=${got}, want ${want}`)
    process.exit(1)
  }
  if (escalateToBaseYear(100, 2024, 2024) !== 100) {
    console.error('[process-equipment-cost] SELFTEST FAIL: same-year must return cost unchanged')
    process.exit(1)
  }
  // Unknown year: no fabrication — return cost unchanged.
  if (escalateToBaseYear(100, 2010, 2024) !== 100) {
    console.error('[process-equipment-cost] SELFTEST FAIL: unknown basisYear must leave cost unchanged')
    process.exit(1)
  }
  console.log(
    `[process-equipment-cost] selftest OK (CEPCI escalate 100 USD1998 → ${got} = 100*(800/389.5))`,
  )
}

if (typeof process !== 'undefined' && process.argv?.includes('--selftest')) {
  _selftest()
}
