/**
 * src/lib/pdf-engine-v2/lib/material-prices.ts
 *
 * RAW-COMMODITY PRICE ANCHOR — grounds every macro-assembly £/kg rate in the
 * real cost of the material it is mostly made of, so a mispriced rate (e.g. the
 * wind blade shipped at £180/kg when GFRP is ~£3.5/kg raw) is caught
 * DETERMINISTICALLY by gate-10 B-8, not by anyone remembering to sanity-check.
 *
 * Model: a finished engineering assembly costs raw_commodity_price × a
 * manufacturing multiplier (cutting / casting / layup / machining / coating /
 * assembly labour + overhead + margin). So the plausible finished £/kg band for
 * a material-dominated assembly is [raw × mfg_mult_low, raw × mfg_mult_high].
 * A macro whose £/kg rate sits well outside that band is either a magnitude typo
 * or a wrong material assumption.
 *
 * Prices are curated reference figures (2024-2025, LME spot + UK trade
 * disclosures), SOURCED and DATED — the standard for cost engineering, which
 * does not hit live commodity feeds per-run. The growing-DB follow-up is to back
 * this with a forge-truth.db `material_prices` table that a scheduled job
 * web-refreshes (DB-first → web-fetch-on-stale → write-back), exactly like the
 * parts/supplier growing-DB. This file is the deterministic v1 anchor.
 */

import Database from 'better-sqlite3'
import { homedir } from 'os'
import { resolve } from 'path'
import { existsSync } from 'fs'

export interface MaterialPrice {
  /** Raw commodity / feedstock price, £/kg. */
  raw_gbp_per_kg: number
  /** Finished-assembly £/kg = raw × [mfg_mult_low, mfg_mult_high]. The multiplier
   *  captures fabrication labour + overhead + margin for that material class. */
  mfg_mult_low: number
  mfg_mult_high: number
  source: string
  /** ISO date the figure was last reviewed. */
  updated: string
}

/** Curated raw-commodity reference, £/kg. Keep figures sourced + dated. */
export const MATERIAL_PRICES: Record<string, MaterialPrice> = {
  structural_steel:        { raw_gbp_per_kg: 0.65, mfg_mult_low: 2,   mfg_mult_high: 6,  source: 'UK hot-rolled coil ~£540-620/t (Tata Q2 2026, post-Port-Talbot import-dependent); structural sections ~£1.1-1.2/kg; fab = cut/weld/coat', updated: '2026-05-30' },
  stainless_steel:         { raw_gbp_per_kg: 2.6,  mfg_mult_low: 2,   mfg_mult_high: 6,  source: '304/316 ~£2.6/kg 2024-25', updated: '2026-05-30' },
  cast_iron:               { raw_gbp_per_kg: 1.2,  mfg_mult_low: 3,   mfg_mult_high: 9,  source: 'Ductile/nodular iron casting + machining (hubs, bedplates)', updated: '2026-05-30' },
  copper:                  { raw_gbp_per_kg: 10.5, mfg_mult_low: 1.3, mfg_mult_high: 3.5,source: 'LME copper ~$13,512/t May 2026 (+36% YoY) ÷ ~1.27 USD/GBP ≈ £10.6/kg; wire/busbar drawing', updated: '2026-05-30' },
  aluminium:               { raw_gbp_per_kg: 2.9,  mfg_mult_low: 2,   mfg_mult_high: 6,  source: 'LME aluminium ~$3,681/t May 2026 (+45% YoY) ÷ ~1.27 USD/GBP ≈ £2.9/kg; extrusion/casting', updated: '2026-05-30' },
  concrete:                { raw_gbp_per_kg: 0.05, mfg_mult_low: 1.5, mfg_mult_high: 5,  source: 'Ready-mix ~£120/m³ ÷ 2400 kg/m³; + rebar/formwork/pour', updated: '2026-05-30' },
  gfrp:                    { raw_gbp_per_kg: 3.5,  mfg_mult_low: 3,   mfg_mult_high: 11, source: 'E-glass + epoxy/polyester ~£3-4/kg raw; layup/infusion is labour-heavy (blades, enclosures)', updated: '2026-05-30' },
  cfrp:                    { raw_gbp_per_kg: 22,   mfg_mult_low: 2.5, mfg_mult_high: 8,  source: 'Carbon fibre + epoxy prepreg ~£18-25/kg raw', updated: '2026-05-30' },
  ndfeb_magnet:            { raw_gbp_per_kg: 55,   mfg_mult_low: 1.4, mfg_mult_high: 3,  source: 'Sintered NdFeB ~£40-80/kg (rare-earth, volatile); magnetise + assemble', updated: '2026-05-30' },
  polymer_thermoplastic:   { raw_gbp_per_kg: 2.5,  mfg_mult_low: 2,   mfg_mult_high: 6,  source: 'ABS/PC/PP ~£2-4/kg; injection moulding', updated: '2026-05-30' },
  glass:                   { raw_gbp_per_kg: 1.5,  mfg_mult_low: 2,   mfg_mult_high: 6,  source: 'Flat/tempered glass', updated: '2026-05-30' },
  timber:                  { raw_gbp_per_kg: 0.4,  mfg_mult_low: 1.5, mfg_mult_high: 4,  source: 'Structural softwood ~£350-500/m³ ÷ ~500 kg/m³', updated: '2026-05-30' },
  mineral_wool_insulation: { raw_gbp_per_kg: 2.0,  mfg_mult_low: 1.5, mfg_mult_high: 4,  source: 'Rockwool/PIR acoustic + thermal', updated: '2026-05-30' },
  rubber_elastomer:        { raw_gbp_per_kg: 3.0,  mfg_mult_low: 2,   mfg_mult_high: 6,  source: 'EPDM/NBR seals, mounts', updated: '2026-05-30' },
  // Wind blades are a GFRP-dominant hybrid (glass shell + carbon spar caps);
  // priced as a known manufactured component, not pure GFRP or pure CFRP.
  wind_blade:              { raw_gbp_per_kg: 4.0,  mfg_mult_low: 3,   mfg_mult_high: 7,  source: '~£12-28/kg manufactured (Vestas EnVentus/GE Cypress ~£450-500k for a ~25t 80m blade)', updated: '2026-05-30' },
}

/** Keyword → material inference for macros that do not declare `material`. Order
 *  matters: most-specific first (carbon before steel, magnet before generic). */
const MATERIAL_KEYWORDS: Array<[RegExp, string]> = [
  [/\bblade\b|rotor[_\s-]?blade/i, 'wind_blade'],
  [/carbon[_\s-]?fib|cfrp|carbon[_\s-]?spar/i, 'cfrp'],
  [/blade|gfrp|fibreglass|fiberglass|composite[_\s-]?(spar|skin|shell)|spar[_\s-]?cap/i, 'gfrp'],
  [/magnet|ndfeb|rare[_\s-]?earth/i, 'ndfeb_magnet'],
  [/concrete|foundation|gravity[_\s-]?(pad|base)|ballast|grout/i, 'concrete'],
  [/hub|cast[_\s-]?iron|nodular|ductile[_\s-]?iron|casting/i, 'cast_iron'],
  [/stainless/i, 'stainless_steel'],
  [/copper|busbar|winding|cu[_\s-]?conductor/i, 'copper'],
  [/alumin/i, 'aluminium'],
  [/timber|lumber|plywood|wood/i, 'timber'],
  [/insulation|acoustic[_\s-]?liner|rockwool|mineral[_\s-]?wool/i, 'mineral_wool_insulation'],
  [/gasket|seal|elastomer|rubber|mount[_\s-]?pad/i, 'rubber_elastomer'],
  [/polymer|plastic|abs|polycarb|polyethyl|grp[_\s-]?cover/i, 'polymer_thermoplastic'],
  [/glass(?![_\s-]?fib)/i, 'glass'],
  // Broad structural fallback LAST (frames, towers, enclosures, skids, bedplates)
  [/tower|bedplate|main[_\s-]?frame|nacelle|steel|frame|chassis|skid|rack|enclosure|cabinet|monopile|structure|housing|shell/i, 'structural_steel'],
]

export function inferMacroMaterial(wordName: string, sourceDetail?: string): string | null {
  const hay = `${wordName} ${sourceDetail ?? ''}`
  for (const [re, mat] of MATERIAL_KEYWORDS) if (re.test(hay)) return mat
  return null
}

/** A COMPLEX ASSEMBLY (nacelle, drivetrain, generator, gearbox, converter, …)
 *  legitimately costs far more per kg than its dominant raw material because it
 *  integrates bearings, drives, windings, power electronics, etc. The £/kg
 *  material band is only reliable for MATERIAL-DOMINATED macros (a blade is ~one
 *  composite, a tower is ~one steel section, a foundation is ~concrete). The
 *  gate must SKIP assemblies or it false-positives on every nacelle. This list
 *  is the skip set; everything else is treated as material-dominated. */
const ASSEMBLY_KEYWORDS = /nacelle|drivetrain|gearbox|generator|\bpmg\b|\bpmsg\b|\bdfig\b|motor|converter|inverter|transformer|switchgear|controller|\bplc\b|pump|compressor|chiller|hvac|bearing|yaw|pitch[_\s-]?system|slip[_\s-]?ring|battery|cell|module|pcs|bms|sensor|actuator|valve|drive\b/i

/** True when a macro is dominated by one raw material (so the £/kg-vs-commodity
 *  band is a valid check), false for integrated assemblies (skip the gate). */
export function isMaterialDominated(wordName: string, sourceDetail?: string): boolean {
  const hay = `${wordName} ${sourceDetail ?? ''}`
  return !ASSEMBLY_KEYWORDS.test(hay)
}

export interface MacroRateVerdict {
  word_name: string
  material: string
  rate_gbp_per_kg: number
  band_low: number
  band_high: number
  factor: number               // how far outside the band (×); 1.0 = at the edge
  severity: 'OK' | 'MED' | 'HIGH'
  direction: 'within' | 'over' | 'under'
  detail: string
}

/**
 * Check a single kg_mass macro's £/kg rate against its material's commodity band.
 * Returns null for non-kg macros or macros whose material can't be inferred
 * (those rely on the aggregate B-7 / £-per-output-unit band instead).
 */
export function checkMacroMaterialRate(macro: {
  word_name?: string
  unit_price_gbp?: number
  dimension_basis?: string
  source_detail?: string
  material?: string
}): MacroRateVerdict | null {
  if (macro?.dimension_basis !== 'kg_mass') return null
  const rate = Number(macro?.unit_price_gbp)
  if (!Number.isFinite(rate) || rate <= 0) return null
  // Only judge MATERIAL-DOMINATED macros; an integrated assembly (nacelle,
  // drivetrain, generator) legitimately exceeds its raw-material £/kg.
  if (!isMaterialDominated(String(macro.word_name ?? ''), macro.source_detail)) return null
  const material = macro.material ?? inferMacroMaterial(String(macro.word_name ?? ''), macro.source_detail)
  if (!material) return null
  const mp = getMaterialPrice(material)
  if (!mp) return null

  const bandLow = mp.raw_gbp_per_kg * mp.mfg_mult_low
  const bandHigh = mp.raw_gbp_per_kg * mp.mfg_mult_high
  let severity: MacroRateVerdict['severity'] = 'OK'
  let direction: MacroRateVerdict['direction'] = 'within'
  let factor = 1
  if (rate > bandHigh) {
    direction = 'over'
    factor = rate / bandHigh
    // >3× over the ALREADY-generous manufactured-high band = HIGH (an egregious
    // magnitude typo like the £180/kg blade); a smaller overage stays MED to
    // avoid false-positives on hybrid or mis-banded materials.
    severity = factor > 3 ? 'HIGH' : 'MED'
  } else if (rate < bandLow) {
    direction = 'under'
    factor = bandLow / rate
    // Under-pricing capped at MED — lean designs + mis-banding make under-HIGH
    // too false-positive-prone; aggregate B-7 catches systematic under-costing.
    severity = 'MED'
  }
  const detail =
    `${macro.word_name}: £${rate.toFixed(0)}/kg vs ${material} finished-assembly band ` +
    `£${bandLow.toFixed(1)}–£${bandHigh.toFixed(0)}/kg (raw £${mp.raw_gbp_per_kg}/kg × ${mp.mfg_mult_low}–${mp.mfg_mult_high} mfg mult) — ` +
    `${direction === 'within' ? 'within band' : `${factor.toFixed(1)}× ${direction} band`}. ${mp.source}.`
  return { word_name: String(macro.word_name ?? ''), material, rate_gbp_per_kg: rate, band_low: bandLow, band_high: bandHigh, factor, severity, direction, detail }
}

// ─── DB-first read — the materials GROWING-DB (Tristan-decided 2026-05-30) ────
// Material costs are read DB-first from forge-truth.db `material_prices` (seeded
// from the curated MATERIAL_PRICES above by scripts/ingest/seed-material-prices.ts,
// web-refreshed over time by scripts/ingest/refresh-material-prices.ts), falling
// back to the static table when the DB is absent or lacks the material. READONLY
// per the CHAIN-AS-DB-CONSUMER principle — only scripts/ingest/* writes. The map
// is loaded once and cached for the process. UNIVERSAL-ENGINE-PLAN.md Lever 5.
let _dbMaterialCache: Map<string, MaterialPrice> | null | undefined  // undefined = not yet loaded; null = unavailable

function loadDbMaterialPrices(): Map<string, MaterialPrice> | null {
  if (_dbMaterialCache !== undefined) return _dbMaterialCache
  try {
    const dbPath = resolve(homedir(), '.forge-truth', 'forge-truth.db')
    if (!existsSync(dbPath)) { _dbMaterialCache = null; return null }
    const db = new Database(dbPath, { readonly: true })
    let rows: Array<Record<string, unknown>> = []
    try {
      rows = db.prepare(
        'SELECT material, raw_gbp_per_kg, mfg_mult_low, mfg_mult_high, source, updated FROM material_prices',
      ).all() as Array<Record<string, unknown>>
    } catch {
      // table not present yet (seed not run) → static fallback
      db.close()
      _dbMaterialCache = null
      return null
    }
    db.close()
    if (!rows.length) { _dbMaterialCache = null; return null }
    const m = new Map<string, MaterialPrice>()
    for (const r of rows) {
      m.set(String(r.material), {
        raw_gbp_per_kg: Number(r.raw_gbp_per_kg),
        mfg_mult_low: Number(r.mfg_mult_low),
        mfg_mult_high: Number(r.mfg_mult_high),
        source: String(r.source),
        updated: String(r.updated),
      })
    }
    _dbMaterialCache = m
    return m
  } catch {
    _dbMaterialCache = null
    return null
  }
}

/**
 * DB-first material price: the growing forge-truth.db `material_prices` table
 * wins (it may carry web-refreshed rows), the curated static MATERIAL_PRICES is
 * the deterministic fallback. This is the single read path the engine + the B-8
 * gate use to ground material cost in reality. Returns null when the material is
 * in neither source. Universal across product classes.
 */
export function getMaterialPrice(material: string): MaterialPrice | null {
  const fromDb = loadDbMaterialPrices()?.get(material)
  if (fromDb) return fromDb
  return MATERIAL_PRICES[material] ?? null
}

/**
 * Commodity-grounded finished £/kg for a MATERIAL-DOMINATED macro — the
 * "price FROM it" primitive (Tristan-decided 2026-05-30). Infers the material,
 * reads it DB-first, and returns raw × the GEOMETRIC-MEAN manufacturing
 * multiplier (a balanced finished-rate point — avoids both the bargain-low and
 * premium-high band edges). Returns null for integrated assemblies (not
 * material-dominated) or unknown materials, so the caller keeps its explicit
 * per-class rate / cascade price.
 *
 * This is what lets a NEW or universal-emitted class self-price its structural
 * materials from commodity reality instead of a hand-coded per-class £/kg. (It
 * derives the wind blade at ~£18/kg — exactly the value hand-fixed earlier this
 * session — so the universal path reproduces the correct number for free.)
 * Universal across product classes; the per-class archetype rate, when present,
 * still wins (this is the grounding for macros that have NO explicit rate).
 */
export function deriveMacroMaterialRateGbpPerKg(
  wordName: string,
  sourceDetail?: string,
): { rate_gbp_per_kg: number; material: string; band_low: number; band_high: number } | null {
  if (!isMaterialDominated(wordName, sourceDetail)) return null
  const material = inferMacroMaterial(wordName, sourceDetail)
  if (!material) return null
  const mp = getMaterialPrice(material)
  if (!mp) return null
  const midMult = Math.sqrt(mp.mfg_mult_low * mp.mfg_mult_high)
  return {
    rate_gbp_per_kg: mp.raw_gbp_per_kg * midMult,
    material,
    band_low: mp.raw_gbp_per_kg * mp.mfg_mult_low,
    band_high: mp.raw_gbp_per_kg * mp.mfg_mult_high,
  }
}
