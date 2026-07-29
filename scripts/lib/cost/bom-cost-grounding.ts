/**
 * bom-cost-grounding.ts — ground a single BoM line's PRICE in reality, per line.
 *
 * THE GAP THIS CLOSES (Tristan 2026-06-11, "is the BoM based in reality?"; MemPalace
 * W8.2 + the e-fuel-price-grounding drawer): a registered engineering contract gives a
 * dossier real QUANTITIES (sizes/masses/duties from first-principles process tools) but
 * NOT real PRICES. On the real e-fuel dossier (out/oxccu-saf-v21) 70 of 73 BoM lines carry
 * an LLM-authored `list_price_gbp` (modifier provenance "unknown" = the emitter's guess);
 * only 3 carry a live distributor price. The structural gates (20 part-exists, 21 ±5×
 * per-line, 32 aggregate £/output band) check a price is PLAUSIBLE — none makes the rendered
 * £ a sourced number. A plausible guess passes all of them.
 *
 * This module replaces the guess with a number that TRACES to one of three real sources,
 * or honestly returns no-ground (better than a fabricated figure):
 *
 *   1. FABRICATED PROCESS EQUIPMENT (vessel / column / reactor / separator / heat exchanger /
 *      pump / compressor / tank / dryer / filter) → a DOE/NETL-2002/1169 AACE Class-4 INSTALLED
 *      cost built on scripts/lib/cost/process-equipment-cost.ts. Sized from the line's own
 *      capacity/dimensions, else from the engineering-contract quantities (the per-vessel
 *      shell mass / heat-transfer area / sized geometry the process tools registered).
 *      provenance = 'doe-netl-class4'.
 *   2. CATALOGUE PART with a real MPN → the DB-only distributor cache
 *      (db-only-cascade::lookupCached). provenance = 'distributor-cache'.
 *      CHAIN-AS-DB-CONSUMER (project CLAUDE.md): chain-side code MUST NOT call live distributor
 *      APIs — only the cache. The live lookup is injectable so the module stays pure + testable,
 *      but the real path is lookupCached.
 *   3. A macro_assembly_prices entry from the engineering contract → provenance = 'macro-assembly'.
 *   4. None of the above → { price_gbp: null, provenance: 'no-ground' }.
 *
 * DECISIONS RESPECTED (MemPalace drawers):
 *   - The install factor is the SINGLE BIGGEST sensitivity and was got-wrong-then-corrected:
 *     Lang 4.74 is STICK-BUILT; a SKID/modular plant runs ~2.5/3.0/3.5. The caller chooses via
 *     ctx.installMode — this module never silently assumes one. (Do NOT Lang-factor a subset.)
 *   - The 316-solid (×2.90) vs clad/rubber-lined (×1.5) alloy factor is the other big lever;
 *     it comes from the line's material context, defaulting to 316L for wet/HP process service.
 *   - Substring matching OVER-CATCHES auxiliaries (a static mixer / circulation heater / reflux
 *     pump is NOT the main reactor/column). An AUXILIARY_GUARD forces those off the fabricated
 *     path so a heater is never costed as a reactor.
 *   - "Correct up by N×" is a hallucination signal, and a magnitude-aware re-pricer is infeasible
 *     (council). So a catalogue line with no real cached price returns no-ground, NOT a guess.
 *
 * Pure + deterministic (no clock; the only side-channel is the injectable cache lookup, which
 * defaults to the real db-only-cascade read — itself network-free, a local SQLite read).
 * Unit-tested in bom-cost-grounding.test.tsx. British spelling throughout.
 */

import {
  costMaterialTakeoff,
  costProcessEquipment,
  COST_INDICES,
  toFt2,
  m3hToGpm,
  m3hToCfm,
  type CostBasis,
  type TakeoffMaterialKey,
  type FabricationShape,
} from './process-equipment-cost'

// ───────────────────────────── Public types ─────────────────────────────

export type GroundProvenance =
  | 'doe-netl-class4'    // DOE/NETL-2002/1169 Class-4 installed cost (this module's engine)
  | 'distributor-cache'  // a live price from the DB-only distributor cache
  | 'macro-assembly'     // a macro_assembly_prices entry on the engineering contract
  | 'no-ground'          // honestly ungrounded — no defensible source (price_gbp = null)

export interface GroundedCost {
  /** The grounded INSTALLED £ for fabricated equipment / catalogue unit £ / macro £; null when no-ground. */
  price_gbp: number | null
  provenance: GroundProvenance
  /** One-line audit trail of the build-up (the DOE/NETL working, the cache source, or why no-ground). */
  basis: string
  confidence: 'high' | 'medium' | 'low'
  /** The full CostBasis trail for the fabricated path (undefined for the other paths). */
  cost_basis?: CostBasis
  /** Distinguish purchased vs installed on the fabricated path (installed = purchased × install factor). */
  installed?: boolean
}

/** A BoM line ("word"): name_human + modifier_characters[{kind,value,unit?}]. */
export interface BomLineModifier { kind: string; value: string; unit?: string }
export interface BomLine {
  name_human?: string
  word_id?: string
  content_character?: { character_id?: string; name_human?: string; material_radical_primary?: string }
  modifier_characters?: BomLineModifier[]
}

/** A registered quantity is `{ value, unit, ... }` OR a bare number. */
type ContractQuantity = { value?: number; unit?: string } | number | undefined
type ContractQuantities = Record<string, ContractQuantity>

// INTENT (2026-07-29 SOL): contract MacroAssemblyPrice uses word_name +
// unit_price_gbp / total_gbp (engineering-contract.ts). Legacy callers still
// pass name/label + price_gbp — accept BOTH so grounding cannot silently miss
// every traction / BESS macro and fall through to £25 Engine-B floors.
export interface MacroAssemblyPrice {
  name?: string
  label?: string
  word_name?: string
  price_gbp?: number
  gbp?: number
  unit_price_gbp?: number
  total_gbp?: number
}

/** Injectable cache lookup — defaults to the real db-only-cascade read. */
export type CacheLookup = (manufacturer: string | null, mpn: string) => {
  found: boolean
  source: string
  result: { priceGBP?: Array<{ qty: number; unitPriceGbp: number }> | null } | null
}

export interface GroundingContext {
  /** Engineering-contract quantities (per-vessel shell mass / HX area / sized geometry). */
  quantities?: ContractQuantities
  /** Contract macro_assembly_prices (matched by name). */
  macroAssemblyPrices?: MacroAssemblyPrice[]
  /**
   * Install-factor mode. The SINGLE biggest sensitivity — caller MUST choose deliberately.
   *   'skid'        → purchased × 3.0 (skid-modular; shop labour, little site civil) [DEFAULT]
   *   'skid-low'    → purchased × 2.5
   *   'skid-high'   → purchased × 3.5
   *   'stick-built' → purchased × 4.74 (DOE/NETL fluids-plant Lang factor; field-erected)
   *   'purchased'   → no install factor (returns the bare purchased-equipment cost)
   */
  installMode?: 'skid' | 'skid-low' | 'skid-high' | 'stick-built' | 'purchased'
  /**
   * Alloy override for the fabricated take-off. When absent it is inferred from the line's
   * material context (316L for wet/HP process service; carbon steel for an atmospheric tank).
   */
  takeoffMaterialOverride?: TakeoffMaterialKey
  /** Injected for tests; defaults to the real db-only-cascade lookupCached. */
  cacheLookup?: CacheLookup
}

// ───────────────────────────── Install factors ─────────────────────────────

const INSTALL_FACTORS: Record<NonNullable<GroundingContext['installMode']>, number> = {
  'purchased': 1.0,
  'skid-low': 2.5,
  'skid': 3.0,
  'skid-high': 3.5,
  'stick-built': COST_INDICES.lang_factor_fluids, // 4.74
}

// ───────────────────────────── Modifier helpers ─────────────────────────────

function mod(line: BomLine, kind: string): BomLineModifier | undefined {
  return (line.modifier_characters ?? []).find((m) => m.kind === kind)
}
function modValue(line: BomLine, kind: string): string {
  return (mod(line, kind)?.value ?? '').trim()
}
/** Lower-cased haystack of every text field that describes WHAT the line is (incl. the form sentence). */
function describe(line: BomLine): string {
  return [
    line.name_human,
    line.content_character?.name_human,
    line.content_character?.character_id,
    line.word_id,
    modValue(line, 'form'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
/**
 * The line's IDENTITY — name + character_id + word_id only, NOT the form sentence. The auxiliary
 * guard keys off this so a content word inside a vessel's form description (e.g. a reactor "with
 * shaped iron catalyst", a column "with structured packing") does NOT get mistaken for a catalyst
 * charge / packing line. The identity reliably says what the line IS; the form sentence is rich and
 * prone to incidental matches. (Confirmed on the real e-fuel BoM: every genuine auxiliary —
 * static mixer, activation heater, relief valve, catalyst charge, column internals, I/O card —
 * carries its guard token in the NAME, so guarding on identity loses nothing.)
 */
function identity(line: BomLine): string {
  return [line.name_human, line.content_character?.name_human, line.content_character?.character_id, line.word_id]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
/** The material-of-construction hint (content_character.material_radical_primary + form text). */
function materialHint(line: BomLine): string {
  return [line.content_character?.material_radical_primary, modValue(line, 'form')].join(' ').toLowerCase()
}

function qtyValue(q: ContractQuantities | undefined, key: string): number | undefined {
  const v = q?.[key]
  if (v == null) return undefined
  const n = typeof v === 'object' ? Number((v as { value?: number }).value) : Number(v)
  return Number.isFinite(n) ? n : undefined
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-GB')
}

// ───────────────────────────── Fabricated-equipment detection ─────────────────────────────

/**
 * Auxiliaries / sub-components whose description contains an equipment keyword but which are NOT
 * a single fabricated vessel the DOE curves cost. A static mixer is not a column; a circulation
 * heater is not a reactor; a charge of catalyst/adsorbent is a consumable; a valve/transmitter/
 * card is an instrument; an electrical board / VFD / transformer is not a fabricated vessel; a
 * packaged utility skid (instrument-air / nitrogen / cooling-water) has no single applicable curve.
 * These route OFF the fabricated path (→ catalogue or no-ground), so we never over-bill a sub-part
 * as the main unit.
 */
const AUXILIARY_GUARD = new RegExp(
  [
    'mixer', 'recirculation', 'circulation heater', 'trim preheater', 'activation heater',
    'startup heater', 'reduction/activation', 'insulation', 'reflux', 'knock-?out', 'knock out',
    '\\bdrum\\b', '\\bvalves?\\b', 'relief valve', '\\bprv\\b', 'transmitter', 'detector',
    'analyser', 'analyzer', '\\bcard\\b', 'i/o', 'cabinet', 'marshalling', 'barrier',
    'junction box', '\\bhmi\\b', '\\bswitch\\b', '\\bswitches\\b', '\\bdrive\\b', '\\bvfd\\b',
    '\\bups\\b', '\\bmcc\\b', 'motor control', 'switchgear', 'transformer', '\\bboard\\b',
    'distribution', 'gantry', 'loading arm', 'metering skid', 'catalyst', 'adsorbent',
    '\\bcharge\\b', 'internals', 'packing', 'gasket', 'spare', 'nitrogen inerting',
    'instrument-?air', 'cooling-water skid', 'cooling water skid', 'additisation', 'blanketing',
    'controller', 'control system', 'safety instrumented', 'fire and gas', 'fire & gas',
    'thermowell', 'temperature probe',
    // GENERIC FIELD INSTRUMENTS (Tristan 2026-06-24, UNIVERSAL): a probe / sensor / meter /
    // gauge is a commodity instrument (~£0.2–5k), NEVER a fabricated vessel. Without these, a
    // line like "reactor pH probe" / "reactor temperature sensor" / "reactor slurry density
    // meter" matched the REACTOR's *_shell_mass_kg via the word "reactor" and inherited its
    // material-take-off (e.g. £62,529 for 772 kg of 316L) — a 30–250× over-bill. \\bmeter\\b is
    // word-bounded so it ignores "metering skid" (already guarded) and "diameter".
    '\\bprobe\\b', '\\bsensor\\b', '\\bmeter\\b', '\\bgauge\\b', 'sight\\s?glass', 'level switch',
  ].join('|'),
  'i',
)

/** A keyword set per fabricated-equipment FAMILY. Order matters — first hit wins. */
interface FabFamily {
  family: 'pump' | 'compressor' | 'heat_exchanger' | 'column' | 'reactor' | 'separator' | 'vessel' | 'tank' | 'dryer' | 'filter' | 'oxidiser' | 'steam_generator'
  re: RegExp
}
const FAB_FAMILIES: FabFamily[] = [
  // Specific multi-word names first so e.g. "steam generator" isn't swallowed by "vessel".
  { family: 'steam_generator', re: /steam[ _-]?generator|steam drum|boiling-water/ },
  { family: 'oxidiser', re: /thermal oxidiser|thermal oxidizer|\bflare\b|incinerator/ },
  { family: 'heat_exchanger', re: /heat exchanger|exchanger|\bcooler\b|condenser|reboiler|preheater|\bhx\b|shell-?and-?tube|spiral[- ]?plate/ },
  { family: 'column', re: /\bcolumn\b|fractionation|distillation|absorber|stripper|scrubber|regenerator|rectif/ },
  { family: 'reactor', re: /\breactor\b|hydrocrack|hydrotreat|isomeris|isomeriz|fischer-?tropsch|synthesis reactor|guard[- ]?bed|guard bed/ },
  { family: 'separator', re: /separator|3-?phase|three-?phase|decanter|coalescer/ },
  { family: 'dryer', re: /\bdryer\b|drier|molecular[- ]?sieve|desiccant/ },
  { family: 'filter', re: /\bfilter\b|coalescer|strainer/ },
  { family: 'compressor', re: /compressor|\bblower\b|\bfan\b/ },
  { family: 'pump', re: /\bpump\b/ },
  // Only PRODUCT / atmospheric STORAGE tanks (the lines whose mass the contract registers as
  // *_tank_shell_mass_kg). A "buffer storage vessel" / "receiver" is a PRESSURE vessel, not a
  // product tank — it falls to the `vessel` family below so it never borrows the product-tank mass
  // (the cost-basis over-match gotcha). Its own mass isn't registered → it returns no-ground, honest.
  { family: 'tank', re: /storage tank|product tank|\btank\b|api[ -]?650|api[ -]?620/ },
  { family: 'vessel', re: /\bvessel\b|\bdrum\b|knock-?out|receiver|buffer/ },
]

function detectFabFamily(line: BomLine): FabFamily['family'] | null {
  const d = describe(line)
  // Guard on IDENTITY (name/ids), not the form sentence — so "reactor with shaped iron catalyst"
  // is not mistaken for a catalyst charge. Family detection still uses the full describe text.
  if (AUXILIARY_GUARD.test(identity(line))) return null
  for (const f of FAB_FAMILIES) if (f.re.test(d)) return f.family
  return null
}

// ───────────────────────────── Sizing the fabricated line ─────────────────────────────

/** Parse a numeric value from a modifier's value string (strips commas / units). */
function parseNum(s: string): number | undefined {
  if (!s) return undefined
  const m = s.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : undefined
}

/** The line's own capacity, with unit. */
function lineCapacity(line: BomLine): { value: number; unit: string } | undefined {
  const cap = mod(line, 'capacity')
  if (!cap) return undefined
  const v = parseNum(cap.value)
  if (v == null) return undefined
  return { value: v, unit: (cap.unit ?? '').trim().toLowerCase() }
}

/**
 * Pick the shell mass (kg) for THIS fabricated vessel from the contract quantities.
 *
 * THE BINDING RULE (the over-match defence): a registered `<thing>_shell_mass_kg` key binds to a
 * line ONLY when the line's IDENTITY (name/ids, NOT the form sentence) actually names that thing —
 * its DISTINCTIVE descriptor must appear. So `ft_reactor_shell_mass_kg` (the Fischer-Tropsch
 * reactor, 2387 kg) does NOT leak onto a generic "hydrocracker reactor" / "isomerisation reactor" /
 * "guard bed" whose own mass the contract never registered; those return no-ground (honest). The
 * earlier hard-coded `keyHints` precedence was the bug — every line of family `reactor` grabbed the
 * FIRST hint (the FT reactor mass) regardless of which reactor it was.
 *
 * Generic words (storage/product/buffer/feed/process/main/vessel/tank/shell/mass) are NOT
 * distinctive; abbreviations carry known synonyms (ft → fischer/tropsch/synthesis) so a contract key
 * still binds to its line when the line spells the name out.
 */
// Pure structural words carry no identity — stripped from a key prefix before matching.
const STRUCTURAL_KEY_TOKENS = new Set(['shell', 'mass', 'total', 'kg'])
// Token equivalences so a contract key still binds to a line that spells the name differently:
// abbreviations (ft → fischer/tropsch/synthesis) AND the product/storage-tank naming gap
// (a "product tank" key ↔ a "SAF/naphtha storage tank" line). Both directions are expanded.
const TOKEN_SYNONYMS: Record<string, string[]> = {
  ft: ['ft', 'fischer', 'tropsch', 'synthesis'],
  fractionation: ['fractionation', 'fractionator'],
  product: ['product', 'storage', 'saf', 'naphtha', 'fuel'],
  storage: ['storage', 'product', 'saf', 'naphtha', 'fuel'],
}
function expand(token: string): string[] {
  return TOKEN_SYNONYMS[token] ?? [token]
}
/**
 * Does the line identity name the thing this `*_shell_mass_kg` key describes?
 * THE RULE: EVERY distinctive (non-structural, ≥2-char) prefix token must be present in the line
 * identity (directly or via a synonym). Subset-of-identity, not any-token — so `ft_reactor` needs
 * BOTH "ft" AND "reactor" (the steam generator's incidental "ft exotherm" lacks "reactor" → no
 * bind), and `product_tank` needs BOTH "product"(↔saf/naphtha/storage) AND "tank" (binds the two
 * product storage tanks, not the H2 buffer vessel). This is the over-match defence: a registered
 * mass binds only to the line it actually names, never leaking to a sibling vessel.
 */
function keyNamesLine(key: string, id: string): boolean {
  const tokens = key
    .replace(/_shell_mass_kg$/, '')
    .split('_')
    .filter((t) => t.length >= 2 && !STRUCTURAL_KEY_TOKENS.has(t))
  if (tokens.length === 0) return false
  return tokens.every((t) => expand(t).some((s) => new RegExp(`\\b${s}`).test(id)))
}
function contractShellMassKg(_family: FabFamily['family'], line: BomLine, q?: ContractQuantities): number | undefined {
  if (!q) return undefined
  const id = identity(line)
  for (const key of Object.keys(q)) {
    if (!/_shell_mass_kg$/.test(key)) continue
    if (!keyNamesLine(key, id)) continue
    const v = qtyValue(q, key)
    if (v != null && v > 0) return v
  }
  return undefined
}

/** Heat-transfer area (m²) for an exchanger, from the line capacity (kW duty → area via U·ΔT) or contract. */
function exchangerAreaFt2(line: BomLine, q?: ContractQuantities): number | undefined {
  // contract area first
  if (q) {
    for (const key of Object.keys(q)) {
      if (/_area_m2$/.test(key)) {
        const prefix = key.replace(/_area_m2$/, '').replace(/_/g, ' ').split(' ')[0]
        if (prefix.length >= 4 && describe(line).includes(prefix)) {
          const m2 = qtyValue(q, key)
          if (m2 != null && m2 > 0) return toFt2(m2)
        }
      }
    }
  }
  // else estimate area from the line's kW duty: A = Q / (U·ΔT). Process gas/liquid U≈250 W/m²K,
  // ΔT≈30 K → ~7500 W/m² → m² = kW·1000/7500. Conservative concept area for a Class-4 estimate.
  const cap = lineCapacity(line)
  if (cap && /kw/.test(cap.unit)) {
    const m2 = (cap.value * 1000) / 7500
    if (m2 > 0) return toFt2(m2)
  }
  return undefined
}

// ───────────────────────────── Material selection ─────────────────────────────

function takeoffMaterial(line: BomLine, family: FabFamily['family'], override?: TakeoffMaterialKey): TakeoffMaterialKey {
  if (override) return override
  const h = materialHint(line)
  if (/carbon[- ]?steel|\bcs\b|a516|s275|mild steel/.test(h)) return 'carbon_steel'
  if (/\b304\b|304l/.test(h)) return 'ss304'
  // Atmospheric storage tanks (API 650) are typically carbon steel unless the form says stainless.
  if (family === 'tank' && !/stainless|\b316|\b304/.test(h)) return 'carbon_steel'
  return 'ss316l' // wet / HP process service default (the e-fuel + CO₂ default)
}

function fabricationShape(family: FabFamily['family']): FabricationShape {
  if (family === 'column') return 'column'
  if (family === 'tank') return 'tank'
  return 'pressure_vessel' // reactor / separator / vessel / steam_generator etc.
}

// ───────────────────────────── The fabricated-equipment path ─────────────────────────────

function groundFabricated(line: BomLine, family: FabFamily['family'], ctx: GroundingContext): GroundedCost | null {
  const installMode = ctx.installMode ?? 'skid'
  const installFactor = INSTALL_FACTORS[installMode]
  const installLabel =
    installMode === 'stick-built' ? `Lang ${installFactor} (stick-built)` :
    installMode === 'purchased' ? 'purchased (no install factor)' :
    `skid-modular ×${installFactor}`

  // ── Exchangers: a DOE/NETL shell-&-tube curve sized on heat-transfer area ──
  if (family === 'heat_exchanger') {
    const areaFt2 = exchangerAreaFt2(line, ctx.quantities)
    if (areaFt2 == null) return null // no defensible size → fall through to no-ground
    const r = costProcessEquipment({
      label: line.name_human ?? 'heat exchanger',
      curve: 'shell_tube_hx',
      size: { value: areaFt2, unit: 'ft2' },
      material: 'ss304_hx',
    })
    return finishFab(r.gbp, r.basis, installFactor, installLabel,
      `DOE/NETL shell-&-tube HX @ ${Math.round(areaFt2)} ft² (${r.basis.confidence}); ×CEPCI 2.054 ×304-HX 2.86 ×0.79 GBP = £${fmt(r.gbp)} purchased; × ${installLabel} = £${fmt(r.gbp * installFactor)} installed`)
  }

  // ── Compressors / blowers / fans: a rotary-blower curve sized on volumetric flow ──
  if (family === 'compressor') {
    const cap = lineCapacity(line)
    // kg/h → m³/h (assume process gas ρ≈1.2 kg/m³ at conditions; concept-grade) → cfm
    let cfm: number | undefined
    if (cap) {
      if (/cfm/.test(cap.unit)) cfm = cap.value
      else if (/m3\/h|m³\/h|m3h/.test(cap.unit)) cfm = m3hToCfm(cap.value)
      else if (/kg\/h/.test(cap.unit)) cfm = m3hToCfm(cap.value / 1.2)
    }
    if (cfm == null) return null
    const r = costProcessEquipment({
      label: line.name_human ?? 'compressor/blower',
      curve: 'rotary_blower',
      size: { value: cfm, unit: 'cfm' },
      material: 'none',
    })
    return finishFab(r.gbp, r.basis, installFactor, installLabel,
      `DOE/NETL rotary blower/compressor @ ${Math.round(cfm)} cfm (${r.basis.confidence}); = £${fmt(r.gbp)} purchased; × ${installLabel} = £${fmt(r.gbp * installFactor)} installed. NOTE: large engineered API-618/619 compressor packages exceed this curve — RFQ the flagship machines.`)
  }

  // ── Pumps: a centrifugal-pump curve sized on volumetric flow ──
  if (family === 'pump') {
    const cap = lineCapacity(line)
    let gpm: number | undefined
    if (cap) {
      if (/gpm/.test(cap.unit)) gpm = cap.value
      else if (/m3\/h|m³\/h|m3h/.test(cap.unit)) gpm = m3hToGpm(cap.value)
      else if (/l\/min|lpm/.test(cap.unit)) gpm = m3hToGpm((cap.value * 60) / 1000)
    }
    if (gpm == null) return null
    const r = costProcessEquipment({
      label: line.name_human ?? 'pump',
      curve: 'centrifugal_pump',
      size: { value: gpm, unit: 'gpm' },
      material: 'ss316_pump',
    })
    return finishFab(r.gbp, r.basis, installFactor, installLabel,
      `DOE/NETL centrifugal pump @ ${Math.round(gpm)} gpm (${r.basis.confidence}); ×316 pump 1.80 = £${fmt(r.gbp)} purchased; × ${installLabel} = £${fmt(r.gbp * installFactor)} installed`)
  }

  // ── Vessels / columns / reactors / separators / tanks / dryers / filters / steam gen / oxidiser ──
  // MATERIAL TAKE-OFF from a registered shell mass (the honest, hand-checkable path): the line's
  // own dimensions if a mass is derivable, else the contract per-vessel shell mass.
  const material = takeoffMaterial(line, family, ctx.takeoffMaterialOverride)
  const shape = fabricationShape(family)
  let massKg = contractShellMassKg(family, line, ctx.quantities)

  // line-self mass: an explicit capacity in kg (e.g. a charge mass is guarded out already)
  if (massKg == null) {
    const cap = lineCapacity(line)
    if (cap && /^kg$/.test(cap.unit)) massKg = cap.value
  }
  if (massKg == null || massKg <= 0) return null // no registered mass → honest no-ground

  const r = costMaterialTakeoff({ label: line.name_human ?? family, massKg, material, shape })
  return finishFab(r.gbp, r.basis, installFactor, installLabel,
    `${r.basis.working ?? `${fmt(massKg)} kg take-off`} (purchased); × ${installLabel} = £${fmt(r.gbp * installFactor)} installed`)
}

/** Apply the install factor + assemble the GroundedCost for any fabricated path. */
function finishFab(purchasedGbp: number, basis: CostBasis, installFactor: number, _installLabel: string, basisLine: string): GroundedCost {
  const installedGbp = Math.round(purchasedGbp * installFactor)
  // confidence: inherit the curve/take-off confidence, but an extrapolated/RFQ curve is low.
  const confidence: GroundedCost['confidence'] =
    basis.rfq_recommended ? 'low' : basis.confidence === 'high' ? 'high' : basis.confidence === 'moderate' ? 'medium' : 'low'
  return {
    price_gbp: installedGbp,
    provenance: 'doe-netl-class4',
    basis: basisLine,
    confidence,
    cost_basis: basis,
    installed: installFactor !== 1,
  }
}

// ───────────────────────────── The catalogue (cache) path ─────────────────────────────

/** Commodity / descriptive part-number tokens that are NOT real catalogue MPNs. */
const NON_MPN =
  /engineered package|made-to-order|made to order|fabricat|bespoke|proprietary|tbd|to be|generic|various|n\/a|^api ?6\d\d|^api ?\d|^iso |packaged|skid$|assembly$|^custom\b/i

/** True when the part_number looks like a genuine catalogue MPN (worth a cache lookup). */
function looksLikeMpn(pn: string): boolean {
  if (!pn || pn.length < 5) return false
  if (NON_MPN.test(pn)) return false
  // a real MPN is compact and alphanumeric (allow - / . space), not a prose phrase.
  const words = pn.trim().split(/\s+/)
  if (words.length > 4) return false
  return /[a-z]/i.test(pn) && /[0-9]/.test(pn)
}

/** Lazy real cache lookup — imported only when no injected lookup is supplied, to keep tests pure. */
function realCacheLookup(): CacheLookup {
  // require() (not import) so a test that injects a stub never loads better-sqlite3.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { lookupCached } = require('../../../src/lib/pdf-engine-v2/lib/distributors/db-only-cascade') as {
    lookupCached: (m: string | null, mpn: string) => { found: boolean; source: string; result: { priceGBP?: Array<{ qty: number; unitPriceGbp: number }> | null } | null }
  }
  return lookupCached
}

function cheapestCachedGbp(result: ReturnType<CacheLookup>['result']): number | undefined {
  const breaks = result?.priceGBP
  if (!Array.isArray(breaks) || breaks.length === 0) return undefined
  const vals = breaks.map((b) => Number(b.unitPriceGbp)).filter((n) => Number.isFinite(n) && n > 0)
  if (vals.length === 0) return undefined
  return Math.min(...vals)
}

function groundCatalogue(line: BomLine, ctx: GroundingContext): GroundedCost | null {
  const mpn = modValue(line, 'part_number') || modValue(line, 'form')
  const manufacturer = modValue(line, 'manufacturer') || null
  if (!looksLikeMpn(mpn)) return null // descriptive "part number" → not a catalogue line
  const lookup = ctx.cacheLookup ?? realCacheLookup()
  let res: ReturnType<CacheLookup>
  try {
    res = lookup(manufacturer, mpn)
  } catch {
    return null
  }
  if (!res || !res.found) return null // unknown / cache_miss_confirmed → no defensible cached price
  const unit = cheapestCachedGbp(res.result)
  if (unit == null) {
    // The part is real (library_only) but the cache holds no price — honest: no grounded price.
    return null
  }
  return {
    price_gbp: Math.round(unit),
    provenance: 'distributor-cache',
    basis: `Distributor cache (${res.source}) cheapest unit price for ${manufacturer ? manufacturer + ' ' : ''}${mpn} = £${fmt(unit)}`,
    confidence: res.source === 'cache_hit' ? 'high' : 'medium',
  }
}

// ───────────────────────────── The macro-assembly path ─────────────────────────────

function groundMacroAssembly(line: BomLine, ctx: GroundingContext): GroundedCost | null {
  const macros = ctx.macroAssemblyPrices ?? []
  if (macros.length === 0) return null
  const d = describe(line)
  // GOTCHA: emitted words use id=`${character_id}_word` and often omit word_id —
  // strip the suffix so contract macro word_name matches.
  const idBlob = (
    line.word_id
    ?? (line as { id?: string }).id
    ?? line.content_character?.character_id
    ?? ''
  ).toLowerCase().replace(/_word$/, '')
  const nameTokens = (line.name_human ?? line.content_character?.character_id ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4)
  for (const m of macros) {
    const macroName = (m.word_name ?? m.name ?? m.label ?? '').toLowerCase()
    if (!macroName) continue
    const price = Number(m.total_gbp ?? m.unit_price_gbp ?? m.price_gbp ?? m.gbp)
    if (!Number.isFinite(price) || price <= 0) continue
    // Exact word_id / character_id ↔ word_name identity (underscore-normalised).
    const macroId = macroName.replace(/[^a-z0-9]+/g, '_').replace(/_word$/, '')
    if (idBlob && (idBlob === macroId || idBlob.includes(macroId) || macroId.includes(idBlob))) {
      return {
        price_gbp: Math.round(price),
        provenance: 'macro-assembly',
        basis: `Engineering-contract macro_assembly_prices entry "${m.word_name ?? m.name ?? m.label}" = £${fmt(price)}`,
        confidence: 'high',
      }
    }
    const macroTokens = macroName.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length >= 4)
    // a confident match needs the macro's key noun(s) present in the line description.
    const overlap = macroTokens.filter((t) => d.includes(t) || nameTokens.includes(t))
    if (macroTokens.length > 0 && overlap.length >= Math.max(1, Math.ceil(macroTokens.length / 2))) {
      return {
        price_gbp: Math.round(price),
        provenance: 'macro-assembly',
        basis: `Engineering-contract macro_assembly_prices entry "${m.word_name ?? m.name ?? m.label}" = £${fmt(price)}`,
        confidence: 'medium',
      }
    }
  }
  return null
}

// ───────────────────────────── Public API ─────────────────────────────

/**
 * Ground a single BoM line's price. Tries, in order of decreasing trust where applicable:
 *   1. macro_assembly_prices match (an explicit contract-priced assembly),
 *   2. DOE/NETL Class-4 for fabricated process equipment (sized from the line / contract),
 *   3. the distributor cache for a real-MPN catalogue part,
 * and otherwise returns no-ground (price_gbp = null) — honest, never a fabricated number.
 *
 * Pure + deterministic given ctx; the only side-channel is the cache lookup (injectable; the real
 * default is a local SQLite read, never a live distributor API — CHAIN-AS-DB-CONSUMER).
 */
export function groundBomLineCost(line: BomLine, ctx: GroundingContext = {}): GroundedCost {
  // 1. macro assembly (explicit contract price for a named assembly)
  const macro = groundMacroAssembly(line, ctx)
  if (macro) return macro

  // 2. fabricated process equipment → DOE/NETL Class-4 installed
  const family = detectFabFamily(line)
  if (family) {
    const fab = groundFabricated(line, family, ctx)
    if (fab) return fab
    // detected as fabricated but no defensible size → try catalogue, else no-ground (see below)
  }

  // 3. catalogue part with a real MPN → distributor cache
  const cat = groundCatalogue(line, ctx)
  if (cat) return cat

  // 4. honest no-ground — better than a fabricated number
  const why = family
    ? `Fabricated ${family} with no registered shell mass / size and no catalogue price — no defensible basis (would need a contract quantity or a vendor quote).`
    : looksLikeMpn(modValue(line, 'part_number'))
      ? `Catalogue part not found in the distributor cache (needs an ingest pass) — no defensible basis.`
      : `No DOE/NETL curve and no real catalogue MPN for "${line.name_human ?? line.word_id ?? 'this line'}" — no defensible basis; the engine's LLM price is a guess.`
  return { price_gbp: null, provenance: 'no-ground', basis: why, confidence: 'low' }
}
