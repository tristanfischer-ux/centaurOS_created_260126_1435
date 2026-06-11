/**
 * bom-make-vs-buy.ts — the per-LINE make-vs-buy classification for the dossier's Part 2
 * ("how you manufacture it" — Tristan's Option-A evolve of the bill of materials).
 *
 * THE GAP THIS CLOSES: Part 2 shows WHAT the plant is made of (the BoM) and the dossier already
 * has a SOURCING STRATEGY for WHO builds it (sourcing-strategy.ts — contractor scopes, lead-time
 * bands, dual-source guidance). What sat between them was unstated: for EACH line, is it a
 * catalogue purchase, a drawing handed to a fab shop, or an engineered-to-order package from a
 * specialist? That make-vs-buy split is what a manufacturing reader actually plans around — it
 * decides which lines you buy on a PO, which you put on a fabrication schedule, and which you
 * RFQ as a bespoke package. This module produces it per line, deterministically, from signals
 * already in the BoM (no network, no LLM, no per-class table).
 *
 * THREE CATEGORIES (universal across product classes; keyed on SIGNALS, not a class list):
 *
 *   • 'bought'      — off-the-shelf catalogue purchase. A real structured manufacturer AND a real
 *                     compact catalogue part number (MPN). You raise a purchase order against a
 *                     datasheet. e.g. Grundfos "CRNE 10-4", Emerson "Rosemount 3051CD",
 *                     Siemens "6ES7131-6BH01-0BA0", LESER "Type 441", Pepperl+Fuchs "KFD2-STC4-Ex1".
 *
 *   • 'fabricated'  — made in-house or by a fabrication shop to YOUR drawing. Pressure vessels,
 *                     columns, reactors, tanks, separators, skids, structural steel, ductwork,
 *                     pipe spools — a `form` that reads fabricated/welded/rolled/machined AND NO
 *                     real catalogue MPN (a generic/bespoke descriptor, typically a "made-to-order
 *                     fabrication" maker). These go on the FABRICATION SCHEDULE. e.g. the
 *                     Fischer-Tropsch reactor, the fractionation column, the API 650 storage tanks,
 *                     the 3-phase separators, the knock-out drums.
 *
 *   • 'custom-made' — an engineered-to-order PACKAGE from a named specialist sub-supplier. A real
 *                     OEM, but a BESPOKE (non-catalogue) configuration — an engineered package /
 *                     packaged skid / configured assembly the vendor designs to your duty rather
 *                     than picking from a catalogue. You RFQ it and the supplier engineers it.
 *                     e.g. Burckhardt "API 618 … engineered package" compressor, Parker Hiross
 *                     "twin-tower … packaged skid" dryer, Zeeco "enclosed thermal oxidiser —
 *                     engineered package", a bespoke Alfa Laval heat exchanger, a configured
 *                     control panel.
 *
 * THE SIGNAL CASCADE (how each line is decided — see classifyMakeVsBuy):
 *   1. CONSUMABLE / MEDIA charges (catalyst, adsorbent, packing media) are a buy of MATERIAL, not a
 *      machine. They are a catalogue-style purchase from a specialist (often proprietary), so they
 *      classify 'bought' with low/medium confidence and an honest rationale — never put on a
 *      fabrication schedule.
 *   2. A real catalogue MPN (real manufacturer + a compact, structured part number that is NOT a
 *      bespoke descriptor) → 'bought'.
 *   3. A fabricated/bespoke descriptor with NO real catalogue MPN:
 *        – maker is a real OEM (Burckhardt / Alfa Laval / Zeeco …) → 'custom-made' (engineered
 *          package by that specialist).
 *        – maker is a generic procurement route ("made-to-order fabrication") OR the item is an
 *          inherently shop-fabricated structural item (vessel / column / tank / skid / ductwork /
 *          pipe spool / structural steel) → 'fabricated' (to your drawing).
 *   4. Ambiguous / no clear signal → default to the SAFEST category and mark confidence low.
 *      "Safest" = the one that does not over-promise an off-the-shelf buy: a structural/equipment
 *      item with no real MPN defaults to 'fabricated' (you will need a drawing); a non-structural
 *      item with a real maker but unclear configuration defaults to 'custom-made'; only a real
 *      maker + real MPN earns 'bought'.
 *
 * REUSED DETECTION IDEAS (from bom-cost-grounding.ts — its house style, not its cost maths):
 *   – looksLikeMpn / NON_MPN: a real catalogue part number is compact + alphanumeric, NOT a prose
 *     "engineered package"/"API 618 …"/"fabricated …" descriptor. (Same idea; this module keeps its
 *     own copy so it imports nothing from the cost engine — pure + standalone.)
 *   – the fabricated-equipment FAMILY keywords (vessel / column / reactor / tank / separator /
 *     heat exchanger / compressor / pump / dryer / filter / skid …) and the AUXILIARY recognition.
 *   – isRealManufacturer is RE-IMPLEMENTED here (not imported) so the module has zero runtime deps:
 *     a real OEM carries a proper-noun token and is not a "made-to-order"/"proprietary"/"bespoke"
 *     procurement-route phrase. This is the single most load-bearing signal for fabricated-vs-custom.
 *
 * COMPLEMENTARY, NOT OVERLAPPING with sourcing-strategy.ts: that maps ROLES → WHO builds the plant
 * (main contractor + subcontractor scopes + lead-time bands). This is the per-LINE upstream
 * classification that feeds it — make-vs-buy is the column on the BoM; sourcing-strategy is the
 * narrative of who delivers each scope. One says "this line is fabricated"; the other says "your
 * fabrication scope goes to a code-stamp pressure-vessel shop, 16–28 week lead".
 *
 * Pure + deterministic. No network, no LLM, no clock. British spelling throughout.
 * Unit-tested in bom-make-vs-buy.test.tsx; verified on the real 73-line e-fuel BoM
 * (out/oxccu-saf-v21/state.json).
 */

// ───────────────────────────── Public types ─────────────────────────────

export type MakeVsBuyCategory = 'bought' | 'fabricated' | 'custom-made'
export type MakeVsBuyConfidence = 'high' | 'medium' | 'low'

export interface MakeVsBuyResult {
  category: MakeVsBuyCategory
  /** One-line WHY — the signal that drove the call (honest; names the deciding evidence). */
  rationale: string
  confidence: MakeVsBuyConfidence
}

/** A BoM line ("word"): name_human + modifier_characters[{kind,value,unit?}]. Mirrors the chain shape. */
export interface BomLineModifier { kind: string; value?: string; unit?: string }
export interface BomLine {
  name_human?: string
  word_id?: string
  id?: string
  content_character?: {
    character_id?: string
    name_human?: string
    function_radical_primary?: string
    material_radical_primary?: string
  }
  modifier_characters?: BomLineModifier[]
}

/**
 * Optional context. A partVerifications-style override map (keyed by word id) lets the caller feed
 * the verified manufacturer / part_number, which can be cleaner than the raw emitter modifiers.
 *
 * IMPORTANT — `distributor_price_gbp` is NOT a buyability confirmation here. On the real e-fuel
 * dossier (out/oxccu-saf-v21) the bom-cost-grounding header records that 70 of 73 partVerifications
 * carry an LLM-AUTHORED list price under this field (only 3 are a live distributor price), so a
 * non-null value does NOT mean the line is genuinely catalogue-purchasable. This module therefore
 * does NOT let a price reclassify a line to 'bought' — buyability is decided by a real catalogue
 * MPN + a real manufacturer ONLY. The price is accepted but ignored for the make/buy decision
 * (kept on the type so callers can pass the raw record without reshaping it).
 */
export interface MakeVsBuyVerification {
  manufacturer?: string
  part_number?: string
  /** LLM-authored list price OR (rarely) a live distributor price — NOT used as a buyability signal. */
  distributor_price_gbp?: number | null
}
export interface MakeVsBuyContext {
  /** word id → verification record (e.g. state.partVerifications keyed by word_id). */
  verifications?: Record<string, MakeVsBuyVerification>
}

// ───────────────────────────── Modifier helpers ─────────────────────────────

function mods(line: BomLine): BomLineModifier[] {
  return Array.isArray(line.modifier_characters) ? line.modifier_characters : []
}
function modValue(line: BomLine, kind: string): string {
  const m = mods(line).find((x) => String(x.kind).toLowerCase() === kind)
  return String(m?.value ?? '').trim()
}
function wordId(line: BomLine): string {
  return String(line.id ?? line.word_id ?? line.content_character?.character_id ?? '').trim()
}
/** Lower-cased haystack of every text field describing WHAT the line is (incl. the form sentence). */
function describe(line: BomLine): string {
  return [
    line.name_human,
    line.content_character?.name_human,
    line.content_character?.character_id,
    wordId(line),
    modValue(line, 'form'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
/** Identity only (name + ids), NOT the form sentence — for the auxiliary/structural guards. */
function identity(line: BomLine): string {
  return [line.name_human, line.content_character?.name_human, line.content_character?.character_id, wordId(line)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

// ───────────────────────────── Real-manufacturer signal (re-implemented, dep-free) ─────────────────────────────

// FULLY-ANCHORED single-token / exact-phrase stubs (mirrors sourcing-strategy GENERIC_MFR_RE).
const GENERIC_MFR_RE =
  /^(fabricated|bespoke|custom|customised|customized|generic|tbd|to be confirmed|n\/?a|none|various|multiple|standard|in[-\s]?house|oem|unknown|commodity|assorted|misc(?:ellaneous)?)$/i
// SUBSTRING procurement-route phrases — a value CONTAINING one is a route, not a company.
const GENERIC_MFR_PHRASE_RE =
  /\b(made.?to.?order|proprietary|in.?house|to.?be.?(sourced|confirmed|determined|advised|specified)|various(?:\s+suppliers)?|multiple\s+suppliers|specialist\s+(?:fabricator|supplier|vendor|manufacturer)|local\s+(?:fabricator|supplier|fabrication)|(?:custom|bespoke)\s+(?:fab|fabrication|fabricated|build|made|assembly)\b|\bcustom[\s-]?fab\b|by\s+others|not\s+(?:yet\s+)?(?:selected|specified|determined))\b/i
// A value that ENDS in a generic procurement noun with NO proper-noun token is a description.
const TRAILING_GENERIC_NOUN_RE =
  /\b(fabrication|fabricator|supplier|manufacturer|vendor|supply|sourcing|procurement|integrator)s?\.?$/i

function hasProperNounToken(name: string): boolean {
  const tokens = String(name ?? '').split(/[\s/&.,()-]+/).filter(Boolean)
  for (const t of tokens) {
    if (/^[A-Z][A-Za-z]+$/.test(t) && t.length >= 2) return true // Burckhardt, Compression, Laval
    if (/^[A-Z0-9]{2,}$/.test(t) && /[A-Z]/.test(t)) return true // ABB, GEA, UOP, LESER
  }
  return false
}

/** True for a real company name; false for a generic procurement-route description / stub. */
function isRealManufacturer(name: string): boolean {
  const n = String(name ?? '').trim()
  if (n.length === 0) return false
  if (GENERIC_MFR_RE.test(n)) return false
  if (GENERIC_MFR_PHRASE_RE.test(n)) return false
  if (TRAILING_GENERIC_NOUN_RE.test(n) && !hasProperNounToken(n)) return false
  return true
}

// ───────────────────────────── Catalogue-MPN signal (reused idea from bom-cost-grounding) ─────────────────────────────

/**
 * Descriptors that are NOT a real catalogue MPN — they describe a bespoke/engineered ROUTE, a code
 * (API 618), or a procurement phrase. A part_number CONTAINING one of these is not a catalogue
 * number worth treating as off-the-shelf. (Same intent as bom-cost-grounding NON_MPN, with the
 * package/skid/configured descriptors that recur in process plants.)
 */
const NON_MPN =
  /engineered package|engineered\b|made-to-order|made to order|fabricat|bespoke|proprietary|packaged|package\b|\bskid\b|configured|licensed|charge\b|assembly\b|^custom\b|tbd|to be|generic|various|n\/?a|^api ?\d|^iso ?\d|^bs ?(?:en ?)?\d|^en ?\d/i

/**
 * True when the part_number looks like a genuine compact catalogue MPN (an off-the-shelf product
 * you order against a datasheet). A real MPN is short + alphanumeric (allow - / . space), NOT a
 * prose descriptor. Mirrors bom-cost-grounding.looksLikeMpn (the house signal).
 */
function looksLikeMpn(pn: string): boolean {
  const p = String(pn ?? '').trim()
  if (p.length < 4) return false
  if (NON_MPN.test(p)) return false
  const words = p.split(/\s+/)
  if (words.length > 4) return false // a model number is compact, not a sentence
  // Must read like a model number: letters AND digits, OR a short part-style token with a separator.
  if (/[a-z]/i.test(p) && /[0-9]/.test(p)) return true
  // Pure-digit catalogue numbers (e.g. Spelsberg "81040001") are real MPNs when reasonably long.
  if (/^[0-9]{5,}$/.test(p)) return true
  return false
}

// ───────────────────────────── Bespoke / fabrication descriptor signal ─────────────────────────────

/**
 * The line's `form` / part_number / name reads as a SHOP-FABRICATED or ENGINEERED-TO-ORDER item:
 * welded / rolled / machined / fabricated / bespoke, OR an engineered package / packaged skid /
 * configured assembly. This is the "not off-the-shelf" tell that splits a bought line from a
 * fabricated / custom-made one.
 */
const FABRICATION_FORM_RE =
  /\b(fabricat\w*|welded|rolled|machined|bespoke|made[\s-]?to[\s-]?order|custom[\s-]?built|built[\s-]?to[\s-]?(?:order|print|drawing|spec)|engineered\b|engineered[\s-]?package|packaged\b|package\b|\bskid\b|configured|pipe[\s-]?spool|spool\b|ductwork|structural[\s-]?steel|site[\s-]?erected|field[\s-]?erected|code[\s-]?stamp|asme[\s-]?u|ped\b|api[\s-]?6[0-9]{2})\b/i

/**
 * An inherently SHOP-FABRICATED structural / vessel item — recognised by the kind of thing it is,
 * regardless of maker. These have no catalogue: they are rolled + welded + code-stamped to a
 * drawing. If such an item carries no real catalogue MPN, it is 'fabricated' even when a generic
 * maker is absent. (Distinct from the package/skid items, which a NAMED OEM engineers → custom-made.)
 *
 * Auxiliary content words that merely MENTION a vessel (a "reactor thermowell", a "column internals"
 * charge, a "knock-out drum level transmitter") are guarded out via identity below so they are not
 * mistaken for the vessel itself.
 */
const STRUCTURAL_FAB_RE =
  /\b(pressure[\s-]?vessel|\bvessel\b|\bcolumn\b|fractionat\w*|distillation|absorber|stripper|scrubber|regenerator|\breactor\b|hydrocrack\w*|hydrotreat\w*|hydroprocess\w*|isomeris\w*|isomeriz\w*|fischer[\s-]?tropsch|synthesis[\s-]?reactor|guard[\s-]?bed|separator|decanter|coalesc\w*[\s-]?vessel|knock[\s-]?out|\bk\.?o\.?[\s-]?drum\b|\bdrum\b|\btank\b|api[\s-]?6(?:50|20)|storage[\s-]?tank|steam[\s-]?drum|steam[\s-]?generator|waste[\s-]?heat[\s-]?(?:boiler|generator)|\bduct\w*|pipe[\s-]?spool|structural[\s-]?steel|platform|gantry|skid[\s-]?frame|\bhopper\b|silo\b)\b/i

/**
 * A clear ATTACH-TO-VESSEL auxiliary head noun: an INSTRUMENT, VALVE or FITTING that serves a
 * vessel rather than being one. When the line names one of these, a structural token elsewhere in
 * the identity is almost certainly a LOCATION/QUALIFIER — e.g. "storage-TANK N2 blanketing VALVE
 * SET" is a valve set, "REACTOR thermowell" is a thermowell, "knock-out-DRUM level TRANSMITTER" is
 * a transmitter. This demotes the structural classification so the maker/MPN path decides (mirrors
 * the bom-cost-grounding AUXILIARY_GUARD: an auxiliary that merely mentions a vessel is not the
 * vessel). DELIBERATELY EXCLUDES vessel-family nouns (separator / drum / column / reactor / tank)
 * so a genuine fabricated vessel is NEVER demoted — only instruments + valves + fittings are here.
 * Universal across product classes.
 */
const NONSTRUCTURAL_HEAD_RE =
  /\b(valves?|valve[\s-]?set|regulators?|breathers?|transmitters?|sensors?|detectors?|analy[sz]ers?|gauges?|meters?|metering|instruments?|controllers?|barriers?|isolators?|switch(?:es|gear)?|relays?|cards?|i\/o|junction[\s-]?box(?:es)?|thermowells?|probes?|positioners?|actuators?|monitors?|\bvfd\b|\bups\b|\bhmi\b|\bplc\b|gland[s]?|fittings?|flanges?|nozzles?|supports?|brackets?|baseframes?|labels?)\b/i

/**
 * Recognised PACKAGE / engineered-to-order tells: a thing a NAMED OEM engineers to order. Kept to
 * GENUINE package vocabulary (engineered / package / packaged / skid / configured / engineered-to-
 * order) — deliberately NOT the over-broad bare "system"/"unit", which match descriptive lines
 * ("analyser system") that are not engineered packages and belong on the ambiguous path instead.
 */
const PACKAGE_FORM_RE =
  /\b(engineered[\s-]?package|engineered[\s-]?to[\s-]?order|engineered\b|packaged[\s-]?skid|packaged\b|package\b|\bskid\b|configured)\b/i
/** An EXPLICIT package noun (not just the soft "engineered" adjective) — raises custom-made confidence to high. */
const EXPLICIT_PACKAGE_RE = /\b(engineered[\s-]?package|packaged[\s-]?skid|packaged\b|package\b|\bskid\b|configured)\b/i

/** Consumable / process-media charges — a buy of MATERIAL, not a machine, and never a fabrication. */
const CONSUMABLE_RE =
  /\b(catalyst|adsorbent|desiccant|molecular[\s-]?sieve|resin|media\b|charge\b|chemical\w*|reagent|solvent|amine\b|membrane[\s-]?element|sorbent|getter|packing[\s-]?media|fill\b|inventory[\s-]?charge|consumable)\b/i

/**
 * "Internals"/component CHARGES that fill a vessel (structured packing, trays, distributors) — a
 * purchased engineered component, not the vessel and not loose media. Treated as a buy (catalogue
 * or engineered) rather than a fabrication of the host vessel.
 */
const INTERNALS_RE = /\b(internals?|structured[\s-]?packing|random[\s-]?packing|trays?\b|distributor[s]?\b|demister|mist[\s-]?eliminator|packing\b)\b/i

// ───────────────────────────── Verification-context helpers ─────────────────────────────

function verificationFor(line: BomLine, ctx?: MakeVsBuyContext): MakeVsBuyVerification | undefined {
  const id = wordId(line)
  if (!id || !ctx?.verifications) return undefined
  return ctx.verifications[id]
}

/** The best manufacturer string: verification override (if real) else the modifier. */
function effectiveManufacturer(line: BomLine, ctx?: MakeVsBuyContext): string {
  const v = verificationFor(line, ctx)
  const vMfr = String(v?.manufacturer ?? '').trim()
  if (vMfr && isRealManufacturer(vMfr)) return vMfr
  return modValue(line, 'manufacturer')
}
/** The best part_number string: verification override (if it looks like a real MPN) else the modifier. */
function effectivePartNumber(line: BomLine, ctx?: MakeVsBuyContext): string {
  const v = verificationFor(line, ctx)
  const vPn = String(v?.part_number ?? '').trim()
  if (vPn && looksLikeMpn(vPn)) return vPn
  return modValue(line, 'part_number')
}

// ───────────────────────────── The classifier ─────────────────────────────

/**
 * Classify a single BoM line as bought / fabricated / custom-made.
 *
 * Deterministic signal cascade (most decisive first); defaults to the SAFEST category with low
 * confidence when the signals are weak or conflicting.
 */
export function classifyMakeVsBuy(line: BomLine, ctx?: MakeVsBuyContext): MakeVsBuyResult {
  const id = identity(line)
  const desc = describe(line)
  const manufacturer = effectiveManufacturer(line, ctx)
  const mpn = effectivePartNumber(line, ctx)
  const form = modValue(line, 'form')
  const realMaker = isRealManufacturer(manufacturer)
  const realMpn = looksLikeMpn(mpn)

  // ── 0. CONSUMABLE / PROCESS-MEDIA charge → a buy of material, not a machine ──
  // Identity-guarded (the form of a reactor mentions "catalyst"; we key on the line's own identity).
  const isInternals = INTERNALS_RE.test(id)
  if (CONSUMABLE_RE.test(id) && !isInternals) {
    // A proprietary/licensed charge is still PURCHASED (you buy the inventory), just from a
    // specialist — never fabricated. Confidence is medium when a real maker is named, else low.
    const named = realMaker
    return {
      category: 'bought',
      rationale: named
        ? `Process-media / consumable charge (catalyst/adsorbent/media) purchased from ${manufacturer} — a material buy, not a fabricated machine.`
        : `Process-media / consumable charge (catalyst/adsorbent/media) — a specialist material buy, not a fabricated machine (maker is a generic/proprietary descriptor).`,
      confidence: named ? 'medium' : 'low',
    }
  }

  // ── 1. REAL CATALOGUE MPN + REAL MAKER → bought (off-the-shelf purchase order) ──
  //     Buyability is decided here ONLY — by a compact catalogue number + a real OEM. A price (even
  //     a verification distributor_price_gbp) is NOT a buyability signal (see MakeVsBuyVerification).
  if (realMpn && realMaker) {
    return {
      category: 'bought',
      rationale: `Real catalogue part: ${manufacturer} "${mpn}" — an off-the-shelf purchase against a datasheet.`,
      confidence: 'high',
    }
  }
  // A real MPN but a generic "maker" (rare) — still buyable off a catalogue, but unattributed.
  if (realMpn && !realMaker) {
    return {
      category: 'bought',
      rationale: `Catalogue part number "${mpn}" looks like a real MPN, but the manufacturer field is a generic descriptor — buyable off-the-shelf, attribution to confirm.`,
      confidence: 'medium',
    }
  }

  // ── 2. NO real catalogue MPN → fabricated or custom-made ──
  // STRUCTURAL detection keys on IDENTITY + the part_number (which NAMES the item), NOT the form
  // sentence. The form is rich and prone to incidental matches — e.g. "breather valve set ON THE
  // SAF TANK" must not be read as a tank, "knock-out drum LEVEL TRANSMITTER" must not be read as a
  // drum. This mirrors the bom-cost-grounding over-match defence (guard on identity, not the form).
  // The part_number is included because a fabricated vessel's "part number" is its descriptor
  // ("fabricated 316L fractionation column shell — bespoke vessel"), which names the item reliably.
  // A structural token is DEMOTED when the line's head noun is an attach-to-vessel auxiliary
  // (instrument / valve / fitting): the token is then a location qualifier, not the item. Guard on
  // the part_number too (a real instrument MPN never reads "tank"); but a fabrication verb in the
  // identity/PN ("fabricated … tank") OVERRIDES the demotion — that genuinely is the fabricated item.
  const auxiliaryHead = NONSTRUCTURAL_HEAD_RE.test(id) && !FABRICATION_FORM_RE.test(id) && !FABRICATION_FORM_RE.test(mpn)
  const looksStructural = (STRUCTURAL_FAB_RE.test(id) || STRUCTURAL_FAB_RE.test(mpn)) && !auxiliaryHead
  // FABRICATION verbs (welded/rolled/fabricated/made-to-order/engineered/skid…) ARE reliable in the
  // form sentence — they describe HOW the item is built, not what sits near it — so the form feeds
  // this signal. Plus the part_number + identity.
  const looksFabricated = FABRICATION_FORM_RE.test(form) || FABRICATION_FORM_RE.test(mpn) || FABRICATION_FORM_RE.test(id)
  const looksPackage = PACKAGE_FORM_RE.test(form) || PACKAGE_FORM_RE.test(mpn)

  // 2a. Engineered/structured component CHARGE that fills a vessel (packing/trays/distributors).
  //     A purchased engineered component — from a named maker → custom-made; else bought.
  if (isInternals && !looksStructural) {
    if (realMaker) {
      return {
        category: 'custom-made',
        rationale: `Engineered column/vessel internals (packing/trays/distributors) configured by ${manufacturer} to the column duty — an engineered-to-order buy, not loose stock.`,
        confidence: 'medium',
      }
    }
    return {
      category: 'bought',
      rationale: `Column/vessel internals (packing/trays) — a configured catalogue component buy; maker not resolved to a real OEM.`,
      confidence: 'low',
    }
  }

  // 2b. A NAMED real OEM + a bespoke/engineered descriptor (package/skid/configured/engineered) →
  //     CUSTOM-MADE (the specialist engineers the package to your duty; you RFQ it).
  if (realMaker && (looksPackage || looksFabricated) && !isGenericFabricationOnly(form, mpn)) {
    // If the thing is ALSO an inherently structural vessel (a NAMED-maker fabricated reactor is
    // possible but rare), prefer fabricated when the descriptor is purely "fabricated" with no
    // package/engineered framing; otherwise it is an engineered package → custom-made.
    if (looksStructural && isPureFabrication(form, mpn) && !looksPackage) {
      return {
        category: 'fabricated',
        rationale: `Shop-fabricated ${structuralNoun(id) ?? 'vessel/structure'} built to drawing (named fabricator ${manufacturer}); rolled/welded to a datasheet, no catalogue model.`,
        confidence: 'medium',
      }
    }
    // High confidence when an EXPLICIT package noun is present (engineered package / packaged skid /
    // configured); medium when only the soft "engineered" adjective (or a fabrication verb) signals it.
    const explicitPackage = EXPLICIT_PACKAGE_RE.test(form) || EXPLICIT_PACKAGE_RE.test(mpn)
    return {
      category: 'custom-made',
      rationale: `Engineered-to-order package from ${manufacturer} (${packageWord(form, mpn)}) — a bespoke configuration RFQ'd to the specialist, not a catalogue model.`,
      confidence: explicitPackage ? 'high' : 'medium',
    }
  }

  // 2c. A generic maker ("made-to-order fabrication" / no real OEM) → FABRICATED to your drawing.
  //     This is the dominant fabricated path: a structural vessel/tank/skid with a generic maker.
  if (looksStructural || looksFabricated) {
    const noun = structuralNoun(id)
    return {
      category: 'fabricated',
      rationale: noun
        ? `Fabricated ${noun} made to drawing by a fab shop (no real catalogue MPN; maker "${manufacturer || 'unspecified'}" is a fabrication route) — goes on the fabrication schedule.`
        : `Fabricated/built-to-drawing item (no real catalogue MPN; ${looksFabricated ? 'form reads fabricated/welded' : 'structural'}) — made by a fab shop, not bought off-the-shelf.`,
      confidence: noun ? 'high' : 'medium',
    }
  }

  // ── 3. AMBIGUOUS — no MPN, no fabrication tell, no structural tell ──
  //     Default to the SAFEST category and mark confidence low.
  //       – a real maker named → likely an engineered/configured supply → custom-made (you RFQ it).
  //       – no real maker → cannot promise an off-the-shelf buy → fabricated (assume a drawing).
  if (realMaker) {
    return {
      category: 'custom-made',
      rationale: `Named supplier ${manufacturer} but no compact catalogue number and no clear off-the-shelf model — treated as an engineered/configured supply pending an RFQ. (Ambiguous; low confidence.)`,
      confidence: 'low',
    }
  }
  return {
    category: 'fabricated',
    rationale: `No real catalogue MPN and no named OEM — cannot be promised as an off-the-shelf buy, so defaulted to fabricated/built-to-drawing (safest assumption). (Ambiguous; low confidence.)`,
    confidence: 'low',
  }
}

// ───────────────────────────── Small descriptor helpers ─────────────────────────────

/** True when the descriptor is ONLY a generic fabrication phrase with no package/engineered framing. */
function isGenericFabricationOnly(form: string, mpn: string): boolean {
  const hay = `${form} ${mpn}`.toLowerCase()
  const hasFab = /\b(fabricat\w*|welded|rolled|machined|made[\s-]?to[\s-]?order)\b/.test(hay)
  const hasPackage = /\b(engineered|package|packaged|skid|configured|system|module)\b/.test(hay)
  return hasFab && !hasPackage
}
/** True when the descriptor reads as a pure fabrication (welded/rolled/fabricated) and not a package. */
function isPureFabrication(form: string, mpn: string): boolean {
  const hay = `${form} ${mpn}`.toLowerCase()
  return /\b(fabricat\w*|welded|rolled|machined)\b/.test(hay) && !/\b(engineered|package|packaged|skid|configured)\b/.test(hay)
}
/** Pick the human-readable package noun for the rationale (engineered package / packaged skid / configured assembly). */
function packageWord(form: string, mpn: string): string {
  const hay = `${form} ${mpn}`.toLowerCase()
  if (/packaged[\s-]?skid|\bskid\b/.test(hay)) return 'packaged skid'
  if (/engineered[\s-]?package/.test(hay)) return 'engineered package'
  if (/configured/.test(hay)) return 'configured assembly'
  if (/engineered/.test(hay)) return 'engineered to order'
  if (/package/.test(hay)) return 'package'
  return 'engineered configuration'
}
/** Name the structural family for a friendlier rationale (best-effort). */
function structuralNoun(idHay: string): string | null {
  const TABLE: Array<[RegExp, string]> = [
    [/fischer[\s-]?tropsch|synthesis[\s-]?reactor/, 'Fischer-Tropsch reactor'],
    [/hydrocrack\w*|hydrotreat\w*|hydroprocess\w*/, 'hydroprocessing reactor'],
    [/isomeris\w*|isomeriz\w*|dewax\w*/, 'isomerisation reactor'],
    [/guard[\s-]?bed/, 'guard-bed vessel'],
    [/\breactor\b/, 'reactor'],
    [/fractionat\w*|distillation|\bcolumn\b|absorber|stripper|scrubber/, 'column'],
    [/3[\s-]?phase|three[\s-]?phase|separator|decanter/, 'separator'],
    [/knock[\s-]?out|\bk\.?o\.?[\s-]?drum\b|\bdrum\b/, 'drum'],
    [/steam[\s-]?generator|waste[\s-]?heat/, 'steam generator'],
    [/storage[\s-]?tank|api[\s-]?6(?:50|20)|\btank\b/, 'storage tank'],
    [/buffer|receiver/, 'buffer/receiver vessel'],
    [/pressure[\s-]?vessel|\bvessel\b/, 'pressure vessel'],
    [/\bduct\w*/, 'ductwork'],
    [/pipe[\s-]?spool|spool/, 'pipe spools'],
    [/structural[\s-]?steel|platform|gantry/, 'structural steel'],
    [/\bskid\b/, 'skid'],
  ]
  for (const [re, noun] of TABLE) if (re.test(idHay)) return noun
  return null
}

// ───────────────────────────── Summary ─────────────────────────────

export interface MakeVsBuySummary {
  bought: number
  fabricated: number
  custom_made: number
  total: number
  /** Per-category line breakdown for a make/buy table or chart. Each entry = {name, rationale, confidence}. */
  by_category: {
    bought: Array<{ name: string; rationale: string; confidence: MakeVsBuyConfidence }>
    fabricated: Array<{ name: string; rationale: string; confidence: MakeVsBuyConfidence }>
    'custom-made': Array<{ name: string; rationale: string; confidence: MakeVsBuyConfidence }>
  }
  /** A short manufacturing narrative for Part 2 ("N of M are bought off-the-shelf; the X fabricated…"). */
  notes: string
  /** How many calls landed on a low-confidence default — surfaced so the reader knows the soft edges. */
  low_confidence: number
}

/**
 * Classify every line and roll up the make-vs-buy split + a short manufacturing narrative.
 * Pure + deterministic. The narrative is signal-driven (counts + the longest-lead fabricated items),
 * never a fabricated supplier number.
 */
export function makeVsBuySummary(lines: BomLine[], ctx?: MakeVsBuyContext): MakeVsBuySummary {
  const rows = (Array.isArray(lines) ? lines : []).map((line) => {
    const r = classifyMakeVsBuy(line, ctx)
    return { name: String(line.name_human ?? wordId(line) ?? 'line').trim(), ...r }
  })
  const by_category: MakeVsBuySummary['by_category'] = { bought: [], fabricated: [], 'custom-made': [] }
  let low_confidence = 0
  for (const r of rows) {
    by_category[r.category].push({ name: r.name, rationale: r.rationale, confidence: r.confidence })
    if (r.confidence === 'low') low_confidence++
  }
  const bought = by_category.bought.length
  const fabricated = by_category.fabricated.length
  const custom_made = by_category['custom-made'].length
  const total = rows.length

  const notes = buildNotes({ bought, fabricated, custom_made, total, by_category, low_confidence })
  return { bought, fabricated, custom_made, total, by_category, notes, low_confidence }
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0
}

function buildNotes(s: {
  bought: number
  fabricated: number
  custom_made: number
  total: number
  by_category: MakeVsBuySummary['by_category']
  low_confidence: number
}): string {
  const { bought, fabricated, custom_made, total } = s
  if (total === 0) return 'No BoM lines to classify.'
  const fabNames = s.by_category.fabricated.map((r) => r.name)
  const customNames = s.by_category['custom-made'].map((r) => r.name)
  const sample = (names: string[], n: number) => {
    const taken = names.slice(0, n)
    return taken.join(', ') + (names.length > n ? `, and ${names.length - n} more` : '')
  }
  const parts: string[] = []
  parts.push(
    `${bought} of ${total} lines (${pct(bought, total)}%) are bought off-the-shelf against a catalogue datasheet; ` +
      `${fabricated} (${pct(fabricated, total)}%) are fabricated to drawing by a fabrication shop; ` +
      `${custom_made} (${pct(custom_made, total)}%) are engineered-to-order packages from named specialists.`,
  )
  if (fabricated > 0) {
    parts.push(
      `The ${fabricated} fabricated item${fabricated === 1 ? '' : 's'} (${sample(fabNames, 4)}) drive${
        fabricated === 1 ? 's' : ''
      } the fabrication schedule — each needs a drawing package, a code-stamp shop slot and inspection, and these govern the long-lead procurement path.`,
    )
  }
  if (custom_made > 0) {
    parts.push(
      `The ${custom_made} engineered package${custom_made === 1 ? '' : 's'} (${sample(customNames, 4)}) are RFQ'd to specialist OEMs who design them to the duty; firm up these enquiries early as their lead times sit alongside the fabricated vessels.`,
    )
  }
  if (s.low_confidence > 0) {
    parts.push(
      `${s.low_confidence} line${s.low_confidence === 1 ? '' : 's'} carr${
        s.low_confidence === 1 ? 'ies' : 'y'
      } a low-confidence call (ambiguous supplier/part signals) and should be confirmed during procurement.`,
    )
  }
  return parts.join(' ')
}
