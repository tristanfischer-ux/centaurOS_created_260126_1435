/**
 * build-cost-basis.ts — the bridge from chain state → a per-line Cost Basis trail (state.costBasis).
 *
 * Wires the tested cost engine (process-equipment-cost.ts) into the core chain. For every priced
 * BoM line it attaches a CostBasis record so the dossier answers "where did this number come from?":
 *   - recognised major process equipment → DEFENSIBLE re-cost from published curves (capacity_factored)
 *   - a real distributor/catalogue price → catalogue basis
 *   - anything else (engine reference curve / model list price) → an honest DISCLOSURE basis
 *     (method + estimate-class + confidence), so an indicative figure is never presented as fact.
 *
 * The per-class equipment map (sizing → cost spec) is the start of a process-plant "family sizing
 * plug-in": a class with a map gets defensible numbers; a class without one still gets the universal
 * disclosure trail. Pure + deterministic (no clock/network); unit-tested in build-cost-basis.test.tsx.
 */
import {
  costProcessEquipment, costMaterialTakeoff, catalogueBasis, COST_INDICES,
  toFt2, m3hToCfm,
  type CostBasis, type EquipmentSpec, type TakeoffSpec, type CostMethod,
} from './process-equipment-cost'
// Reconcile (2026-06-11): the UNIVERSAL grounding engine. build-cost-basis used to be
// co2-only (CLASS_EQUIPMENT_MAPS) and disclose every other class; now it delegates
// unmapped lines to bom-cost-grounding's universal form/name detection over the SAME
// DOE/NETL curves — one cost engine, all classes. (No cycle: bom-cost-grounding imports
// only process-equipment-cost, never this file.)
import { groundBomLineCost } from './bom-cost-grounding'

/**
 * A class-equipment map entry produces EITHER a curve spec (DOE/NETL `costProcessEquipment`)
 * for a non-mass-derivable line, OR a material take-off (`costMaterialTakeoff`) for a fabricated
 * vessel/column/reactor whose shell mass the engineering contract registers. The take-off builder
 * receives the per-vessel masses (kg) threaded from the contract so the BoM number IS the right
 * number: raw material (mass × £/kg) + fabrication, with the working shown in the BoM notes.
 */
type ContractMasses = {
  absorber_shell_mass_kg?: number
  stripper_shell_mass_kg?: number
  reactor_shell_mass_kg?: number
  // Secondary hydrated-lime carbonation reactor (2nd sink, 2026-06-05).
  lime_reactor_shell_mass_kg?: number
}
type EquipBuild =
  | { kind: 'curve'; build: () => EquipmentSpec }
  | { kind: 'takeoff'; build: (m: ContractMasses) => TakeoffSpec }

export interface CostBasisLine {
  word_id: string
  label: string
  module?: string
  engine_price_gbp: number | null   // what the chain currently prices it at
  cost_gbp: number                  // the figure this trail stands behind
  defensible: boolean               // true = re-costed from a curve; false = disclosure of the engine price
  basis: CostBasis
  /** convenience copy of basis.working — the human-readable cost build-up for the BoM notes */
  working?: string
}

export interface CostBasisReport {
  class: string
  lines: CostBasisLine[]
  methodology: {
    takeoff_lines: number      // fabricated vessels/columns re-costed from shell mass + fabrication
    curve_lines: number
    catalogue_lines: number
    disclosure_lines: number
    rfq_lines: number
    statement: string
  }
  rollup: {
    purchased_gbp: number
    installed_central_gbp: number
    installed_low_gbp: number
    installed_high_gbp: number
    install_factor_central: number
    note: string
  }
}

// ─────────── per-class process-equipment sizing map (the "family plug-in" seed) ───────────
// Keyed by a word_id substring. Each entry builds an EquipmentSpec for the defensible estimator.
// Sizes are the independent first-principles concept sizing (Towler/Perry), NOT the engine's
// wrong-domain orchestrator quantities — so a class wired here gets DEFENSIBLE numbers.
const CLASS_EQUIPMENT_MAPS: Record<string, Array<{ match: RegExp } & EquipBuild>> = {
  co2_mineralisation: [
    // ── Fabricated vessels/columns/reactors → MATERIAL TAKE-OFF (mass × £/kg + fabrication) ──
    // The BoM number IS the right number; the working appears in the BoM notes (Section 8).
    // Masses come from the registered engineering contract (orchestratorContract.quantities):
    // absorber ~1292 kg, stripper ~956 kg, primary gypsum reactor ~772 kg, secondary lime reactor ~420 kg.
    // precise: the MAIN unit only — auxiliaries (mixers, coolers, heaters, pumps, pots) are guarded out below.
    { match: /packed_absorber_column|absorber_column/, kind: 'takeoff', build: (m) => ({
      label: 'Packed absorber column',
      massKg: m.absorber_shell_mass_kg ?? 1292, material: 'ss316l', shape: 'column' }) },
    { match: /(distillation|stripping|regenerator|mea_distillation)_column/, kind: 'takeoff', build: (m) => ({
      label: 'Stripper / regenerator column',
      massKg: m.stripper_shell_mass_kg ?? 956, material: 'ss316l', shape: 'column' }) },
    // 2nd carbonation sink (lime route, ~0.2 t/d CO₂) — MUST precede the primary reactor entry
    // so "lime/secondary/supplementary_carbonation_reactor" matches here, not the primary.
    // Shell mass now threaded from the engineering contract (lime_reactor_shell_mass_kg, ~420 kg,
    // first-principles from reactor:cstr-pfr-sizing) so the BoM mass IS the design mass — fallback
    // 420 kg if the sizing tool didn't run. 304 stainless atmospheric (NOT 316L/3 barg), with a
    // small 2 kW bought-in agitator (~£5k): the lime reactor's agitator is a separate BoM line
    // (lime_reactor_agitator_word) but a thin ~£0.9k motor line, so the take-off folds in the full
    // agitator+drive cost here to give a complete vessel-package number (420 kg × £5/kg × 4.5 fab
    // + £5k agitator = ~£14,450).
    { match: /(lime|supplementary|secondary)_carbonation_reactor|lime_carbonation|lime_slurry_reactor/, kind: 'takeoff', build: (m) => ({
      label: 'Secondary lime carbonation reactor (2nd sink)',
      massKg: m.lime_reactor_shell_mass_kg ?? 420, material: 'ss304', shape: 'pressure_vessel', agitatorGbp: 5000, agitatorKw: 2 }) },
    // Primary gypsum reactor: bare fabricated shell only. The 4 kW agitator + drive/gearbox/seal
    // are SEPARATE BoM lines (reactor_agitator_word etc.) — folding it in here would double-count.
    { match: /(stirred|gypsum|primary)?_?carbonation_reactor/, kind: 'takeoff', build: (m) => ({
      label: 'Gypsum carbonation reactor',
      massKg: m.reactor_shell_mass_kg ?? 772, material: 'ss316l', shape: 'pressure_vessel' }) },
    // ── Non-mass-derivable lines KEEP their existing method (curve / RFQ / catalogue) ──
    { match: /recrystalliser|crystallis(er|ation)_(body|vessel|unit)/, kind: 'curve', build: () => ({
      label: 'K₂SO₄ forced-circulation crystalliser', curve: 'none', material: 'ss316_vessel',
      rfqRange: { lowGbp: 50000, highGbp: 150000, reason: 'forced-circulation packaged unit — no curve fits' } }) },
    { match: /rich_lean_mea_exchanger|(lean_rich|rich_lean|cross)_(mea_)?exchanger|cross_exchanger/, kind: 'curve', build: () => ({
      label: 'Lean/rich cross-exchanger', curve: 'spiral_plate_hx',
      size: { value: toFt2(8), unit: 'ft2' }, material: 'none' }) },
    { match: /(distillation_|mea_)?reboiler/, kind: 'curve', build: () => ({
      label: 'Reboiler', curve: 'shell_tube_hx', size: { value: toFt2(3), unit: 'ft2' }, material: 'ss304_hx',
      rfqRange: { lowGbp: 15000, highGbp: 25000, reason: 'below the shell-&-tube curve floor (3 m²) — quote a small kettle' } }) },
    { match: /overhead_condenser/, kind: 'curve', build: () => ({
      label: 'Overhead condenser', curve: 'shell_tube_hx', size: { value: toFt2(3.2), unit: 'ft2' }, material: 'ss304_hx',
      rfqRange: { lowGbp: 15000, highGbp: 25000, reason: 'below the shell-&-tube curve floor (3.2 m²) — quote a small exchanger' } }) },
    { match: /flue_gas(_inlet)?_blower|process_fan/, kind: 'curve', build: () => ({
      label: 'Flue-gas blower', curve: 'rotary_blower',
      size: { value: m3hToCfm(225), unit: 'cfm' }, material: 'none' }) },
  ],
}

/**
 * Auxiliaries whose word_id contains an equipment keyword but which are NOT the main unit — a
 * crystalliser's circulation heater is not the crystalliser. These are forced to the disclosure
 * path so the precise maps above don't over-count. (Tightened after the first real-state run
 * costed a static mixer + reflux pump + maturation vessel as the main reactor/column/crystalliser.)
 */
const AUXILIARY_GUARD = /mixer|recirculation|circulation_heater|product_cooler|vacuum_condenser|insulation|maturation|reflux|reboil_pot|drain|_valve|spare|plate_pack|amine_cooler|inlet_cooler|_agitator|jacket|reclaim|sump/

// MEA pump is better as a live catalogue price than the off-scale pump curve.
const CATALOGUE_OVERRIDES: Record<string, Array<{ match: RegExp; gbp: number; vendor: string; mpn: string; url: string }>> = {
  co2_mineralisation: [
    { match: /mea_circulation_pump/, gbp: 4000, vendor: 'Grundfos', mpn: 'CRNE 5-series',
      url: 'https://product-selection.grundfos.com' },
  ],
}

// ─────────── disclosure basis for any line not re-costed from a curve ───────────
function disclosureBasis(pv: any): CostBasis {
  const enginePrice = Number(pv?.cost_repair_corrected_price_gbp ?? pv?.distributor_price_gbp ?? pv?.price_estimate_gbp ?? 0)
  const hasDistributor = pv?.distributor_price_gbp != null && Number(pv.distributor_price_gbp) > 0
  const src = String(pv?.price_estimate_source ?? pv?.engine_b_estimate_source ?? '').toLowerCase()
  const corpus = /corpus|engine_c|rag|library/.test(src) || pv?.engine_c_ref_median_gbp != null

  let method: CostMethod, estimate_class: CostBasis['estimate_class'], confidence: CostBasis['confidence'], note: string, how_to_verify: string
  if (hasDistributor) {
    method = 'catalogue'; estimate_class = 2; confidence = 'high'
    note = `Live distributor price${pv?.source_url ? '' : ''}.`
    how_to_verify = "Check MPN on manufacturer datasheet / distributor listing"
  } else if (corpus) {
    method = 'class_reference'; estimate_class = 4; confidence = 'moderate'
    const band = pv?.engine_c_ref_median_gbp != null
      ? ` Engine reference median £${Math.round(Number(pv.engine_c_ref_median_gbp)).toLocaleString('en-GB')} (n=${pv?.engine_c_ref_count ?? '?'}).`
      : ''
    note = `Indicative estimate from the engine's component-class reference curve.${band} Confirm by quote.`
    how_to_verify = "Recompute: qty × rate from basis formula"
  } else {
    method = 'llm_estimate'; estimate_class = 5; confidence = 'low'
    note = 'Indicative list-price estimate with no sized basis — treat as order-of-magnitude; confirm by quote.'
    how_to_verify = "Obtain written supplier quote — this line is not catalogue-grounded"
  }
  // the engine's own reference curve flagged this price as an outlier → lower confidence, never "high"
  const ecFlag = String(pv?.engine_c_flag ?? '').toLowerCase()
  if (/over|under/.test(ecFlag)) {
    confidence = confidence === 'high' ? 'moderate' : 'low'
    const ratio = pv?.engine_c_ratio != null ? ` (${Number(pv.engine_c_ratio).toFixed(1)}× the class median)` : ''
    note += ` Engine reference flags this price ${ecFlag}${ratio} — verify.`
    if (estimate_class < 4) estimate_class = 4
  }
  
  if (!enginePrice || Math.round(enginePrice) === 0) {
    how_to_verify = "Obtain quote / pin a real MPN"
  }
  
  const inputs: never[] = []
  const correlation = hasDistributor && pv?.source_url ? { ref: pv?.manufacturer ?? 'distributor', url: pv.source_url, locator: pv?.part_number } : undefined
  return {
    method, inputs, factors: [], correlation,
    result_gbp: Math.round(enginePrice || 0), estimate_class, confidence,
    rfq_recommended: !hasDistributor, notes: note, how_to_verify
  }
}

function classKey(state: any): string {
  return String(state?.parsedBrief?.product_class ?? state?.moduleDecomposition?.product_class ??
    state?.orchestratorContract?.product_class ?? state?.keyMetrics?.product_class ?? 'unknown')
}

/** Read a registered quantity's numeric value (quantities are `{value,unit,...}` objects OR bare numbers). */
function qtyValue(q: any, key: string): number | undefined {
  const v = q?.[key]
  if (v == null) return undefined
  const n = typeof v === 'object' ? Number(v.value) : Number(v)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Per-vessel shell masses (kg) threaded into the take-off builders so the BoM number IS the
 * mass-derived number. The masses live on the registered engineering contract; the
 * pressure-vessel tool writes them to orchestratorContract.quantities (with engineeringContract
 * as the fallback). Reads `value` defensively from the `{value,unit,...}` quantity shape.
 */
function readContractMasses(state: any): ContractMasses {
  const oc = state?.orchestratorContract?.quantities ?? {}
  const ec = state?.engineeringContract?.quantities ?? {}
  const pick = (key: string) => qtyValue(oc, key) ?? qtyValue(ec, key)
  return {
    absorber_shell_mass_kg: pick('absorber_shell_mass_kg'),
    stripper_shell_mass_kg: pick('stripper_shell_mass_kg'),
    reactor_shell_mass_kg: pick('reactor_shell_mass_kg'),
    lime_reactor_shell_mass_kg: pick('lime_reactor_shell_mass_kg'),
  }
}

/** Build the per-line cost-basis trail for the chain state. Pure; safe on partial state. */
export function buildCostBasis(state: any): CostBasisReport {
  const klass = classKey(state)
  const pvs: any[] = Array.isArray(state?.partVerifications) ? state.partVerifications : []
  const equipMap = CLASS_EQUIPMENT_MAPS[klass] ?? []
  const catMap = CATALOGUE_OVERRIDES[klass] ?? []
  const masses = readContractMasses(state)
  // Reconcile fallback inputs: word-by-id (groundBomLineCost needs the BoM word's
  // modifier_characters, not the partVerification) + the grounding context.
  const wordById = new Map<string, any>()
  for (const m of (state?.moduleDecomposition?.modules ?? []))
    for (const sm of (m?.sub_modules ?? []))
      for (const w of (sm?.words ?? [])) if (w?.id) wordById.set(String(w.id), w)
  const ec: any = state?.engineeringContract ?? {}
  const oc: any = state?.orchestratorContract ?? {}
  const groundCtx: any = { quantities: { ...(ec.quantities ?? {}), ...(oc.quantities ?? {}) }, macroAssemblyPrices: ec.macro_assembly_prices, installMode: 'skid' }

  const lines: CostBasisLine[] = []
  let takeoff = 0, curve = 0, cat = 0, disc = 0, rfq = 0, purchased = 0

  for (const pv of pvs) {
    const wid = String(pv?.word_id ?? '')
    const label = String(pv?.word_name ?? wid)
    const enginePrice = pv?.price_estimate_gbp != null ? Number(pv.price_estimate_gbp) : null
    const isAuxiliary = AUXILIARY_GUARD.test(wid) // a heater/cooler/pump/mixer is not the main unit

    // 1) catalogue override (e.g. a real pump price beats an off-scale curve)
    const co = isAuxiliary ? undefined : catMap.find(c => c.match.test(wid))
    if (co) {
      const basis = catalogueBasis(co.gbp, { vendor: co.vendor, mpn: co.mpn, url: co.url })
      lines.push({ word_id: wid, label, module: pv?.module, engine_price_gbp: enginePrice, cost_gbp: co.gbp, defensible: true, basis })
      cat++; purchased += co.gbp; continue
    }
    // 2) defensible re-cost: material take-off (fabricated vessel) OR DOE/NETL curve
    const em = isAuxiliary ? undefined : equipMap.find(e => e.match.test(wid))
    if (em) {
      const { gbp, basis } = em.kind === 'takeoff'
        ? costMaterialTakeoff(em.build(masses))
        : costProcessEquipment(em.build())
      lines.push({ word_id: wid, label, module: pv?.module, engine_price_gbp: enginePrice, cost_gbp: gbp, defensible: true, basis, working: basis.working })
      if (basis.rfq_recommended) rfq++
      if (basis.method === 'material_takeoff') takeoff++
      else if (basis.method === 'capacity_factored') curve++
      else cat++ // vendor_quote (rfqRange) counts as a quote line
      purchased += gbp; continue
    }
    // 2.5) UNIVERSAL defensible fallback (reconcile 2026-06-11): no per-class equipMap
    // entry matched → use bom-cost-grounding's universal form/name detection over the
    // SAME DOE/NETL curves, so EVERY class gets defensible costs (not only the hand-
    // mapped co2). It returns a full CostBasis (cost_basis) we use directly. Only the
    // fabricated-equipment path (doe-netl-class4, high/medium confidence) re-costs here;
    // catalogue parts + low-confidence still fall through to disclosure below.
    const word = wordById.get(wid)
    if (word) {
      const g: any = groundBomLineCost(word, groundCtx)
      if (g && g.price_gbp != null && g.cost_basis && g.provenance === 'doe-netl-class4' &&
          (g.confidence === 'high' || g.confidence === 'medium')) {
        lines.push({ word_id: wid, label, module: pv?.module, engine_price_gbp: enginePrice, cost_gbp: g.price_gbp, defensible: true, basis: g.cost_basis, working: g.cost_basis.working })
        if (g.cost_basis.rfq_recommended) rfq++
        if (g.cost_basis.method === 'material_takeoff') takeoff++
        else if (g.cost_basis.method === 'capacity_factored') curve++
        else cat++
        purchased += g.price_gbp; continue
      }
    }
    // 3) disclosure of the engine's own price
    const basis = disclosureBasis(pv)
    lines.push({ word_id: wid, label, module: pv?.module, engine_price_gbp: enginePrice, cost_gbp: basis.result_gbp, defensible: false, basis })
    disc++; if (basis.rfq_recommended) rfq++
    purchased += basis.result_gbp
  }

  const factorLow = 2.5, factorCentral = 3.0, factorHigh = 3.5
  const installedCentral = Math.round(purchased * factorCentral) // skid-modular factor, NOT stick-built Lang
  const statement = (takeoff + curve + cat) > 0
    ? `${takeoff} fabricated vessel${takeoff === 1 ? '' : 's'}/column${takeoff === 1 ? '' : 's'} re-costed by material take-off (mass × £/kg + fabrication factor, AACE Class 4 ±30%); ${curve} lines from published equipment cost curves (DOE/NETL-2002/1169); ${cat} catalogue/quote lines; ${disc} indicative engine estimates disclosed with their confidence. ${rfq} lines flagged for vendor RFQ.`
    : `Every line is disclosed with its engine pricing method and confidence (indicative) — no fabricated process equipment was detected to re-cost for class "${klass}".`

  // T-14 / G5: every returned CostBasis MUST carry a non-empty how_to_verify so the
  // Excel Confidence column can always surface a verification path (Sam Green SME).
  for (const line of lines) {
    const how = String(line.basis?.how_to_verify ?? '').trim()
    if (!how) {
      line.basis.how_to_verify =
        line.cost_gbp > 0
          ? 'Obtain supplier quote / recompute from basis'
          : 'Obtain quote / pin a real MPN'
    }
  }

  return {
    class: klass,
    lines,
    methodology: { takeoff_lines: takeoff, curve_lines: curve, catalogue_lines: cat, disclosure_lines: disc, rfq_lines: rfq, statement },
    rollup: {
      purchased_gbp: Math.round(purchased),
      installed_central_gbp: installedCentral,
      installed_low_gbp: Math.round(purchased * factorLow),
      installed_high_gbp: Math.round(purchased * factorHigh),
      install_factor_central: factorCentral,
      note: `Installed = purchased × skid-modular factor ${factorLow}–${factorHigh} (not the stick-built ${COST_INDICES.lang_factor_fluids}). Excludes contingency + EPC + owner's cost; add ~30% for an all-in figure.`,
    },
  }
}
