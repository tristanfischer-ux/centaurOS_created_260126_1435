/**
 * bom-process-route.ts — the PROCESS-ROUTE layer of the dossier's Part 2 ("how you manufacture it").
 *
 * THE GAP THIS CLOSES: a sibling module decides make-vs-buy (bought / fabricated / custom-made);
 * a BoM line tells you WHAT a part is and (after cost-grounding) what it COSTS. Neither says HOW a
 * MADE item is actually manufactured — the ordered shop-floor operations. Part 2 of the dossier
 * promises "how you manufacture it"; for every made line that promise needs a concrete process
 * route. This module answers, per line: what is the PRIMARY manufacturing process, and what are the
 * ordered operations (cut + roll plate → weld → NDT → PWHT → hydrotest → paint, etc.)?
 *
 * RELATIONSHIP TO THE SIBLING (bom-make-vs-buy.ts — a DIFFERENT agent owns it, NOT touched here):
 *   make-vs-buy answers "do we make or buy this?"; this module answers "IF we make it, HOW?". The
 *   integrator combines them: a line the sibling marks bought → procurement (route = 'bought' here
 *   too, surfaced as "procure, no in-house process"); a line the sibling marks made → this module's
 *   process route IS the Part-2 manufacturing note for that line. We do NOT import the sibling; we
 *   re-derive the bought/made signal from the line itself (a real catalogue MPN ⇒ bought) so this
 *   module stands alone and is independently testable. Where the integrator already knows the
 *   make/buy verdict it can pass it in via ctx.assumeMade to override the catalogue-MPN default.
 *
 * REUSES (does NOT duplicate cost logic): the SHAPE vocabulary of process-equipment-cost.ts
 * (pressure_vessel / column / tank / shell-&-tube HX) and the SAME family-detection idiom as
 * bom-cost-grounding.ts (regex on form + material + name/identity, an auxiliary guard so a
 * "reactor with shaped iron catalyst" is not mistaken for a catalyst charge). No £ is computed here.
 *
 * THE PRIMARY-PROCESS SET (a small UNIVERSAL vocabulary, signal-keyed not per-class):
 *   plate-fabrication — rolled/formed plate + weld + NDT (+ vessels: PWHT + hydrotest): pressure
 *     vessels, columns, tanks, drums, separators, heat exchangers, ductwork, skids, structural steel.
 *   machining        — cut from bar / forging + turn/mill + bore: flanges, shafts, precision
 *     housings, valve bodies (machined-from-bar).
 *   casting          — sand/investment cast + fettle + machine: pump casings, cast valve bodies.
 *   PCB-assembly     — bare-board + SMT placement + reflow + test: control boards, instruments,
 *     drives, I/O cards, controllers.
 *   winding          — core stack + coil winding + impregnate + test: transformers, motors, inductors.
 *   moulding         — mould/lay-up + cure + trim: plastic / composite / GRP parts.
 *   assembly-only    — kit + mechanical/electrical assembly + FAT: packaged skids/units assembled
 *     from bought sub-parts (cooling-water skid, N2 package, instrument-air package, engineered
 *     compressor package, loading gantry, metering skid).
 *   bought           — a real catalogue part: no in-house process; route = procurement (goods-in +
 *     inspection). The honest default when a genuine MPN is present (it is procured, not made).
 *
 * HONESTY: when the form is ambiguous (no clear shape, no material, no MPN) the route is the
 * best-supported guess at LOW confidence with a note saying why. A consumable charge
 * (catalyst / adsorbent / additive) is flagged as material-supply, not a manufacturing route.
 *
 * Pure + deterministic. No clock / DB / network / cost dependency. British spelling throughout.
 * Unit-tested in bom-process-route.test.tsx (verified on the real e-fuel BoM, out/oxccu-saf-v21).
 */

import type { FabricationShape } from './process-equipment-cost'

// ───────────────────────────── Public types ─────────────────────────────

export type PrimaryProcess =
  | 'plate-fabrication' // rolled/formed plate + weld + NDT (+ PWHT + hydrotest for vessels)
  | 'machining'         // cut from bar/forging + turn/mill/bore (flanges, shafts, valve bodies)
  | 'casting'           // cast + fettle + machine (pump casings, cast valve bodies)
  | 'PCB-assembly'      // SMT + reflow + test (control boards, instruments, drives, I/O)
  | 'winding'           // core + coil winding + impregnate + test (transformers, motors, inductors)
  | 'moulding'          // mould/lay-up + cure + trim (plastic / composite / GRP)
  | 'assembly-only'     // kit + assemble + FAT (packaged skids/units from bought sub-parts)
  | 'bought'            // real catalogue part — no in-house process; route = procurement

export type RouteConfidence = 'high' | 'medium' | 'low'

export interface ProcessRoute {
  /** The primary manufacturing process for this MADE item (or 'bought' when it is a procured part). */
  primary_process: PrimaryProcess
  /** The ordered shop-floor operations for that route (e.g. cut+roll plate → weld → NDT → …). */
  steps: string[]
  /** Material of construction the route works in (316L / carbon steel / FR4-Cu / …), or null if unknown. */
  material: string | null
  confidence: RouteConfidence
  /** Why this route / why low confidence / consumable flag — only when something needs saying. */
  note?: string
}

/** A BoM line ("word"): name_human + modifier_characters[{kind,value,unit?}] + content_character. */
export interface BomLineModifier { kind: string; value: string; unit?: string }
export interface BomLine {
  name_human?: string
  word_id?: string
  id?: string
  content_character?: {
    character_id?: string
    name_human?: string
    material_radical_primary?: string
    function_radical_primary?: string
  }
  modifier_characters?: BomLineModifier[]
}

export interface ProcessRouteContext {
  /**
   * Make-vs-buy override from the integrator (the sibling module's verdict). When the integrator
   * already knows a line is MADE, set assumeMade=true so a descriptive "part number" doesn't tip it
   * to 'bought'; when it knows a line is BOUGHT, set assumeMade=false to force the procurement route.
   * Absent → this module decides from the line alone (a real catalogue MPN ⇒ bought).
   */
  assumeMade?: boolean
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
    line.id,
    modValue(line, 'form'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
/**
 * The line's IDENTITY — name + character_id + word_id only, NOT the form sentence. The consumable /
 * assembly guards key off this so a content word inside a vessel's form description (e.g. a reactor
 * "with shaped iron catalyst", a column "with structured packing") is NOT mistaken for the catalyst
 * charge / packing line. (Same rationale as bom-cost-grounding.ts identity().)
 */
function identity(line: BomLine): string {
  return [line.name_human, line.content_character?.name_human, line.content_character?.character_id, line.word_id, line.id]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
/** The material-of-construction hint (content_character.material_radical_primary + form text). */
function materialHint(line: BomLine): string {
  return [line.content_character?.material_radical_primary, modValue(line, 'form')].join(' ').toLowerCase()
}

// ───────────────────────────── Material-of-construction label ─────────────────────────────

/**
 * A human material label for the route note. Keyed first off the explicit material radical, then
 * off form/name text. null when nothing names a material (honest — don't invent one).
 */
function materialLabel(line: BomLine, process: PrimaryProcess): string | null {
  const h = materialHint(line)
  const id = identity(line)
  // Normalise underscores to spaces so a material RADICAL (e.g. "stainless_steel",
  // "carbon_steel", "polymer_thermoplastic") matches the same patterns as free-text "stainless
  // steel". The radical is the most reliable material signal on the real BoM.
  const all = `${h} ${id}`.replace(/_/g, ' ')

  // Electronics / boards / drives: FR4 copper-clad laminate is the board substrate.
  if (process === 'PCB-assembly') return 'FR4 copper-clad laminate + components'
  if (process === 'winding') {
    if (/cast[- ]?resin|trihal|epoxy/.test(all)) return 'electrical steel core + copper/aluminium windings (cast-resin)'
    return 'electrical steel core + copper windings'
  }
  if (process === 'moulding') {
    if (/grp|glass[- ]?reinforced|frp|composite|fibre|fiber/.test(all)) return 'glass-reinforced plastic (GRP)'
    if (/polycarbonate/.test(all)) return 'polycarbonate'
    return 'engineering thermoplastic'
  }

  // Metals — order specific before generic.
  if (/\b316l\b|316 ?l/.test(all)) return '316L stainless steel'
  if (/\b316\b/.test(all)) return '316 stainless steel'
  if (/\b304l\b|304 ?l/.test(all)) return '304L stainless steel'
  if (/\b304\b/.test(all)) return '304 stainless steel'
  if (/duplex|2205|2507/.test(all)) return 'duplex stainless steel'
  if (/stainless[- ]?steel|stainless\b/.test(all)) return 'stainless steel'
  if (/cast[- ]?iron|ductile[- ]?iron|\bsg ?iron\b/.test(all)) return 'cast iron'
  if (/bronze|gunmetal/.test(all)) return 'bronze'
  if (/\bcopper\b/.test(all)) return 'copper'
  if (/\bsteel\b|carbon[- ]?steel|a516|a515|s275|mild steel/.test(all)) return 'carbon steel'
  if (/aluminium|aluminum/.test(all)) return 'aluminium'

  return null
}

// ───────────────────────────── Consumable / charge guard ─────────────────────────────

/**
 * A consumable charge (catalyst / adsorbent / additive / chemical fill) is a MATERIAL SUPPLY, not a
 * manufactured item — it has no shop-floor route. It is procured (or is a vendor's proprietary
 * formulation). We surface it as 'bought' with a consumable note so Part 2 never describes "how to
 * manufacture the catalyst". Keyed on IDENTITY so a vessel that mentions its catalyst in the form
 * sentence is not caught.
 */
const CONSUMABLE_GUARD = new RegExp(
  [
    'catalyst', 'adsorbent', 'desiccant', 'molecular[- ]?sieve charge', '\\bcharge\\b',
    'chemical fill', 'additive package', 'corrosion inhibitor', 'glycol charge', 'resin charge',
    'lubricant', 'grease', 'consumable',
  ].join('|'),
  'i',
)

function isConsumableCharge(line: BomLine): boolean {
  return CONSUMABLE_GUARD.test(identity(line))
}

// ───────────────────────────── Catalogue-MPN detection (bought signal) ─────────────────────────────

/**
 * "Made-to-order" descriptors — when the part_number CARRIES one of these, the line is a
 * fabricated / engineered / assembled-to-order item, NOT a stock catalogue part, EVEN IF a brand or
 * series name appears in the string. The e-fuel engine writes prose like "shell-and-tube cooler —
 * engineered", "closed-loop cooling-water skid — packaged", "INTALOX structured packing + trays —
 * engineered". These route by MANUFACTURING FAMILY (fabricated/assembled in-house or to order), not
 * to 'bought'. (Mirrors the spirit of bom-cost-grounding.ts NON_MPN, tuned to the e-fuel descriptors.)
 */
const MADE_TO_ORDER_DESC =
  /engineered|made[- ]?to[- ]?order|made to order|fabricat|bespoke|configur|packaged|\bpackage\b|\bskid\b|\bset\b|\bcharge\b|licens|proprietary/i

/**
 * A genuine COMPACT CATALOGUE PRODUCT CODE token: a model/part number you could type into a
 * distributor (Rosemount 3051CD, S7-1500, CRNE 10-4, 6ES7155-6AU01-0CN0, ACS580-01, VX25,
 * 8284.500, 81040001, SMV, FMR62, EL3060). Shapes accepted:
 *   - alphanumeric mix with a digit + a letter, length ≥3 (e.g. 3051CD, FMR62, ACS580, S7);
 *   - a code with an internal separator -/. joining alphanumerics (e.g. S7-1500, CRNE 10-4, 8284.500);
 *   - a long structured order code (e.g. 6ES7155-6AU01-0CN0);
 *   - a pure-digit catalogue number length ≥5 (e.g. 81040001);
 *   - a short ALL-CAPS series mnemonic length 3–5 (e.g. SMV, INTALOX is 7 so excluded — series brand,
 *     not a stock code; SMV/DVC/HMI-style 3–4-letter codes only).
 * A pure descriptive word ("compressor", "transformer", "cooler") is NOT a product code.
 */
/**
 * Standards / specification / jurisdiction prefixes that look like a short ALL-CAPS code but are
 * NOT a product code — "API 650", "ISO 9906", "ASME VIII", "BS EN", "NEC", "ATEX". A line whose
 * only code-like token is one of these is a SPEC reference (a made-to-order fabricated item), never
 * a stock catalogue part. Excluded from the product-code mnemonic rule.
 */
const STANDARD_PREFIX = new Set([
  'API', 'ISO', 'ASME', 'ASTM', 'ANSI', 'IEC', 'EN', 'BS', 'NEC', 'UL', 'NFPA', 'IEEE', 'DIN',
  'VDE', 'CSA', 'ATEX', 'IECEX', 'PED', 'CE', 'SIL', 'HART', 'GRP', 'FRP', 'PSA', 'NDIR', 'IR',
])

function hasProductCodeToken(pn: string): boolean {
  const tokens = pn.replace(/[(),]/g, ' ').split(/\s+/).filter(Boolean)
  for (const raw of tokens) {
    if (STANDARD_PREFIX.has(raw.toUpperCase())) continue // a standard ref, not a product code
    const t = raw.replace(/[—–:+]/g, '')
    if (t.length < 3) continue
    // long structured order code: alnum blocks joined by - or . (≥2 blocks, has a digit)
    if (/^[a-z0-9]+([-/.][a-z0-9]+)+$/i.test(t) && /[0-9]/.test(t)) return true
    // alphanumeric model code: has BOTH a letter and a digit, no spaces (3051CD, FMR62, ACS580, S7-…)
    if (/[a-z]/i.test(t) && /[0-9]/.test(t) && /^[a-z0-9]+$/i.test(t)) return true
    // pure-digit catalogue number, length ≥5 (81040001)
    if (/^[0-9]{5,}$/.test(t)) return true
    // short ALL-CAPS series mnemonic 3–5 chars (SMV, DVC) — a stock series code, not a prose word
    if (/^[A-Z]{3,5}$/.test(raw) && raw === raw.toUpperCase()) return true
  }
  return false
}

/**
 * True when the part_number identifies a genuine STOCK CATALOGUE part (⇒ procured, bought):
 * it carries a compact product-code token AND is NOT flagged as a made-to-order / engineered /
 * packaged item. So "Siemens SIMATIC S7-1500 …" (code S7-1500, no made-to-order suffix) ⇒ bought,
 * but "shell-and-tube cooler — engineered" (no code, made-to-order) ⇒ family-routed, and
 * "INTALOX structured packing + trays — engineered" (made-to-order suffix) ⇒ family-routed even
 * though a brand appears.
 */
function looksLikeMpn(pn: string): boolean {
  if (!pn || pn.length < 3) return false
  if (MADE_TO_ORDER_DESC.test(pn)) return false
  return hasProductCodeToken(pn)
}

/** Does this line carry a genuine catalogue MPN (the bought signal)? */
function hasCatalogueMpn(line: BomLine): boolean {
  return looksLikeMpn(modValue(line, 'part_number'))
}

// ───────────────────────────── Process-family detection ─────────────────────────────

/**
 * Each family keys on a regex over the full describe() text (name + character_id + form). Order
 * matters — the list is evaluated top-to-bottom and the FIRST hit wins, so specific signals (a
 * transformer's winding, an electronics board, a packaged skid) are placed before the broad
 * fabricated-vessel signal that would otherwise swallow them.
 *
 * This produces a MANUFACTURING family; the bought/consumable decision is layered on top in
 * processRoute() (a real MPN ⇒ bought; a charge ⇒ consumable-bought) so the family here is "what
 * would the route be IF we made it".
 */
interface ProcFamily {
  /** The internal manufacturing family — maps to a primary_process + a steps template. */
  family:
    | 'electronics' | 'transformer' | 'motor_inductor' | 'moulded'
    | 'valve_machined' | 'flange_machined' | 'pump_cast' | 'compressor_package'
    | 'heat_exchanger' | 'vessel_column_tank' | 'ductwork_structural' | 'skid_package'
  re: RegExp
  /**
   * Match this family against the line IDENTITY (name + character_id) only, NOT the form sentence.
   * Set for ROTATING-EQUIPMENT + VALVE/FLANGE families whose noun (compressor / pump / valve) is
   * prone to incidental mention in a vessel's form prose — e.g. "compressor-suction knock-out drum"
   * (a vessel) or a guard bed whose form says "the compressors handle cool gas". The identity says
   * what the line IS; the form sentence is rich context. (Same over-match defence as
   * bom-cost-grounding.ts AUXILIARY_GUARD-on-identity.)
   */
  matchOn?: 'identity'
}

const PROC_FAMILIES: ProcFamily[] = [
  // ── ELECTRONICS / control / instruments / drives / I/O → PCB-assembly ──
  // Placed first: many of these ALSO mention an enclosure/cabinet (steel) which would otherwise
  // read as fabrication. The electronic content is the manufacturing essence. NB plural forms are
  // explicit (detectors?, cards?, transmitters?, analysers?) — the real BoM names instruments in the
  // plural ("pressure transmitters", "flame detectors", "I/O cards"); a singular-only \bword\b would
  // miss them and let the fabrication signal wrongly win.
  {
    family: 'electronics',
    re: /\bdcs\b|distributed control|\bsis\b|safety instrumented|\bplc\b|controllers?|i\/o (?:cards?|modules?|stations?)|\bi\/o\b|\bcards?\b|\bmodules?\b|transmitters?|\bdetectors?\b|analy[sz]ers?|\bhmi\b|\bswitch(?:es)?\b|managed (?:ethernet|industrial)|profinet|\bvfd\b|variable[- ]?frequency|variable speed drive|\bdrives?\b|\bups\b|uninterruptible|barriers?|positioners?|\bpcb\b|circuit board|instrumentation/,
  },
  // ── TRANSFORMER → winding ──
  { family: 'transformer', re: /transformer|cast[- ]?resin|\bvpi\b/ },
  // ── MOTOR / INDUCTOR / REACTOR-COIL → winding (electromagnetic coil-wound) ──
  // NB "reactor" here means an electrical line/filter reactor (an inductor), guarded below from the
  // chemical process reactor by requiring a coil/inductor/choke/filter token.
  { family: 'motor_inductor', re: /\binductor\b|\bchoke\b|line reactor|filter reactor|\bsolenoid\b|electric motor\b|\bmotor winding/ },
  // ── MOULDED plastic / composite / GRP ──
  { family: 'moulded', re: /\bgrp\b|glass[- ]?reinforced|\bfrp\b|composite enclosure|moulded|molded|polycarbonate (?:enclosure|panel|box)|junction box/ },
  // ── PACKAGED SKIDS / UNITS → assembly-only (kit of bought parts on a frame) ──
  // PLACED BEFORE pump / HX / vessel: a "circulation-pump skid" / "metering skid" / "instrument-air
  // package" is an ASSEMBLED unit (its pump/vessel/instrument sub-parts are bought), not a single
  // fabricated pump or vessel. The skid/package signal therefore wins over the equipment-noun signal.
  { family: 'skid_package', re: /\bskid\b|metering (?:package|station)|dosing (?:skid|package)|additisation|injection (?:skid|package)|generation (?:skid|package)|inerting (?:skid|package)?|cooling[- ]?water (?:skid|package)|instrument[- ]?air (?:skid|package)|loading (?:gantry|arm)|compressor package|nitrogen (?:generation|inerting)|membrane nitrogen/ },
  // ── VALVES → machined body (valves are machined from bar/forging or cast then machined) ──
  // A control / ESD / relief / blanketing valve BODY is a machined part. (If the form says "cast"
  // the route note adds the cast-then-machine flavour; default is machined-from-forging.)
  { family: 'valve_machined', matchOn: 'identity', re: /control valves?|\bvalves?\b|\bprv\b|relief valves?|esd valves?|shutdown valves?|actuated .*valves?|ball valves?|globe valves?|butterfly valves?|gate valves?|regulators?|breather valves?/ },
  // ── FLANGES / shafts / precision housings → machining ──
  { family: 'flange_machined', matchOn: 'identity', re: /\bflange\b|\bshaft\b|spool piece|precision housing|machined housing|bearing housing|coupling hub|thermowell\b/ },
  // ── PUMPS → cast casing (centrifugal pump casing is a casting + machine) ──
  { family: 'pump_cast', matchOn: 'identity', re: /\bpump\b/ },
  // ── COMPRESSORS / BLOWERS / FANS → assembly-only (engineered rotating-equipment package) ──
  // A reciprocating/centrifugal process-gas compressor is an ASSEMBLED PACKAGE (cast/forged casing +
  // driver + intercoolers + skid + controls — sub-parts mostly bought), not a single fabricated
  // vessel; engineered-to-order ones (no stock code) route here rather than to plate-fabrication.
  // Placed BEFORE heat_exchanger/vessel so a "process gas compressor" is not swept up by them.
  // IDENTITY-keyed so "compressor-suction knock-out drum" (a vessel) + a guard bed whose form says
  // "the compressors handle cool gas" are NOT mis-routed here.
  { family: 'compressor_package', matchOn: 'identity', re: /compressors?\b|\bblowers?\b|\bfans?\b/ },
  // ── HEAT EXCHANGERS → plate-fabrication (welded shell-&-tube / plate pack) ──
  {
    family: 'heat_exchanger',
    re: /heat exchanger|\bexchanger\b|\bcooler\b|condenser|reboiler|preheater|\bhx\b|shell[- ]?and[- ]?tube|shell ?& ?tube|spiral[- ]?plate|plate[- ]?and[- ]?frame|\bchiller\b|economiser|economizer/,
  },
  // ── VESSELS / COLUMNS / REACTORS / SEPARATORS / DRUMS / TANKS / STEAM GEN → plate-fabrication ──
  {
    family: 'vessel_column_tank',
    re: /\bvessel\b|\bcolumn\b|fractionation|distillation|absorber|stripper|scrubber|regenerator|\breactor\b|hydrocrack|hydrotreat|hydroprocess|isomeris|isomeriz|fischer|synthesis reactor|guard[- ]?bed|guard bed|separator|3-?phase|three-?phase|decanter|coalescer|knock-?out|\bdrum\b|receiver|\bbuffer\b|\btank\b|api[ -]?650|api[ -]?620|\bdryer\b|drier|steam[ _-]?generator|steam drum|boiler|\bfilter\b|strainer|\bsilo\b|\bhopper\b/,
  },
  // ── DUCTWORK / STACKS / STRUCTURAL STEEL → plate-fabrication (lighter, no hydrotest) ──
  // NB the loading GANTRY is caught by skid_package above (it is an assembled metered loading unit);
  // here "gantry" covers a bare structural-steel access gantry only.
  { family: 'ductwork_structural', re: /ductwork|\bduct\b|\bstack\b|\bflare\b|oxidiser|oxidizer|incinerator|chimney|structural steel|steel frame|support frame|access gantry|walkway|platform|baseframe|\bplenum\b/ },
]

function detectProcFamily(line: BomLine): ProcFamily['family'] | null {
  const d = describe(line)
  const id = identity(line)
  for (const f of PROC_FAMILIES) {
    const haystack = f.matchOn === 'identity' ? id : d
    if (f.re.test(haystack)) return f.family
  }
  return null
}

// ───────────────────────────── Step templates per route ─────────────────────────────

/** Vessel-grade plate fabrication: code vessel/column/reactor/separator/drum/tank. */
function vesselFabSteps(line: BomLine, shape: FabricationShape): string[] {
  const id = identity(line)
  const isTank = shape === 'tank' || /api[ -]?6[25]0|storage tank|atmospheric/.test(`${id} ${materialHint(line)}`)
  const isColumn = shape === 'column' || /column|fractionation|distillation|absorber|stripper|scrubber/.test(id)
  if (isTank) {
    // Atmospheric API-650-style tank: field-erected, no PWHT, no full hydrotest of a code vessel
    // (a water/settlement test instead). Lighter route than a pressure vessel.
    return [
      'cut + roll shell courses + form bottom/roof plates',
      'weld shell courses + bottom + roof (field-erected)',
      'weld nozzles + manways + fittings',
      'NDT weld seams (vacuum-box / RT spot)',
      'water/settlement test + calibrate',
      'surface prep + paint / lining',
    ]
  }
  const steps = [
    'cut + roll plate; form heads / dished ends',
    'fit + weld shell + heads (longitudinal + circumferential seams)',
    'set + weld nozzles, manways + supports',
  ]
  if (isColumn) steps.push('fit internals (trays / packing supports / distributors)')
  steps.push(
    'NDT welds (RT / UT) + PMI',
    'post-weld heat treatment (PWHT / stress relief)',
    'hydrotest to code',
    'surface prep + paint / passivate',
  )
  return steps
}

/** Welded shell-&-tube / plate heat exchanger. */
function exchangerSteps(line: BomLine): string[] {
  const d = describe(line)
  if (/plate[- ]?and[- ]?frame|gasketed plate/.test(d)) {
    return [
      'press / form plate pack',
      'stack plates + gaskets in frame',
      'assemble + torque frame bolts',
      'pressure + leak test both sides',
      'surface prep + paint frame',
    ]
  }
  return [
    'cut + roll shell; form tubesheets + baffles',
    'expand + weld tubes into tubesheets (tube bundle)',
    'weld shell + channel + nozzles',
    'NDT welds (RT / UT) + tube-to-tubesheet leak test',
    'hydrotest shell + tube sides to code',
    'surface prep + paint',
  ]
}

/** Machined valve body (machined-from-forging; cast flavour if the form says cast). */
function valveSteps(line: BomLine): string[] {
  const cast = /\bcast\b/.test(describe(line))
  const steps = cast
    ? ['cast body + bonnet (sand / investment cast)', 'fettle + heat-treat casting']
    : ['cut billet / forge body blank']
  return [
    ...steps,
    'rough + finish machine body, bonnet + seats',
    'lap seats; assemble trim, stem + actuator interface',
    'pressure + seat-leak test (e.g. API 598)',
    'surface finish + tag',
  ]
}

/** Machined flange / shaft / precision housing from bar or forging. */
function flangeMachineSteps(): string[] {
  return [
    'cut from bar / forging blank',
    'rough turn / mill',
    'finish machine to tolerance (bore, faces, drilling)',
    'dimensional + NDT inspection',
    'surface finish / protective coat',
  ]
}

/** Cast pump casing (cast then machined, then pump-assembled + tested). */
function pumpCastSteps(): string[] {
  return [
    'cast casing + impeller (sand / investment cast)',
    'fettle + heat-treat castings',
    'machine casing faces, bores + impeller',
    'balance impeller; assemble rotating element + seals',
    'hydrostatic + performance test (e.g. ISO 9906)',
    'surface prep + paint',
  ]
}

/** PCB / electronics assembly: bare-board → SMT → test. */
function pcbSteps(line: BomLine): string[] {
  const d = describe(line)
  const enclosed = /cabinet|enclosure|panel|rack|housing|board\b/.test(d)
  const steps = [
    'fabricate / procure bare PCB (FR4)',
    'solder-paste + SMT pick-and-place placement',
    'reflow solder + through-hole / hand soldering',
    'inspect (AOI / X-ray) + in-circuit test',
    'flash firmware + functional / burn-in test',
  ]
  if (enclosed) steps.push('mount in enclosure / panel + wire + final test')
  return steps
}

/** Transformer / coil winding. */
function windingSteps(line: BomLine): string[] {
  const castResin = /cast[- ]?resin|trihal|epoxy/.test(describe(line))
  const steps = [
    'stack / build laminated core',
    'wind HV + LV coils',
  ]
  steps.push(castResin ? 'vacuum-cast coils in epoxy resin (cast-resin)' : 'vacuum-pressure impregnate (VPI) + cure')
  steps.push(
    'assemble core + coils; connect terminals',
    'electrical test (ratio, insulation, impulse / routine tests)',
  )
  return steps
}

/** Moulded plastic / composite / GRP part. */
function mouldSteps(line: BomLine): string[] {
  const grp = /grp|glass[- ]?reinforced|frp|composite|fibre|fiber/.test(describe(line))
  if (grp) {
    return [
      'lay up glass-reinforced laminate in mould',
      'cure + de-mould',
      'trim + machine openings (glands / cut-outs)',
      'fit gaskets / hardware; inspect',
    ]
  }
  return [
    'injection / compression mould part',
    'de-gate + trim flash',
    'machine openings + fit hardware',
    'inspect + assemble',
  ]
}

/** Ductwork / stack / structural steel: rolled + welded plate, lighter than a code vessel. */
function ductworkSteps(line: BomLine): string[] {
  return [
    'cut + roll / fold plate + sections',
    'fit + weld seams, flanges + stiffeners',
    'NDT / leak-test critical seams',
    'surface prep + paint / refractory lining',
    'trial-fit + match-mark for site',
  ]
}

/** Packaged skid / unit: assembled from bought sub-parts on a fabricated frame. */
function skidAssemblySteps(): string[] {
  return [
    'fabricate skid frame / baseplate',
    'mount bought equipment (pumps / vessels / instruments)',
    'pipe + wire + instrument the skid',
    'pressure-test piping + loop-check instruments',
    'factory acceptance test (FAT) + paint + label',
  ]
}

/** Engineered compressor/blower package: integrate bought rotating-equipment sub-parts + string-test. */
function compressorPackageSteps(): string[] {
  return [
    'procure casing/cylinders, rotor, driver + intercoolers',
    'fabricate skid + assemble compressor frame, rotor + seals',
    'pipe intercoolers + mount driver, lube + control systems',
    'mechanical run + string test (e.g. API 618 / 617)',
    'paint + skid factory acceptance test (FAT)',
  ]
}

/** Procurement route for a bought catalogue part (no in-house manufacturing). */
function procurementSteps(): string[] {
  return [
    'raise purchase order to manufacturer / distributor',
    'goods-in receipt + documentation check (cert / datasheet)',
    'inspect to specification',
  ]
}

// ───────────────────────────── Family → process + steps ─────────────────────────────

interface RouteBuild {
  process: PrimaryProcess
  steps: string[]
  confidence: RouteConfidence
  note?: string
}

function buildFromFamily(line: BomLine, family: ProcFamily['family']): RouteBuild {
  switch (family) {
    case 'electronics':
      return { process: 'PCB-assembly', steps: pcbSteps(line), confidence: 'high' }
    case 'transformer':
      return { process: 'winding', steps: windingSteps(line), confidence: 'high' }
    case 'motor_inductor':
      return { process: 'winding', steps: windingSteps(line), confidence: 'high' }
    case 'moulded':
      return { process: 'moulding', steps: mouldSteps(line), confidence: 'high' }
    case 'valve_machined':
      return { process: 'machining', steps: valveSteps(line), confidence: 'high' }
    case 'flange_machined':
      return { process: 'machining', steps: flangeMachineSteps(), confidence: 'high' }
    case 'pump_cast':
      return {
        process: 'casting',
        steps: pumpCastSteps(),
        confidence: 'medium',
        note: 'Pump casing/impeller cast then machined; the complete pump is normally bought as a unit — casting applies if the casing is made in-house.',
      }
    case 'compressor_package':
      return {
        process: 'assembly-only',
        steps: compressorPackageSteps(),
        confidence: 'medium',
        note: 'Engineered rotating-equipment package: most sub-parts (casing, driver, intercoolers, controls) are bought and integrated, not made in-house — the integrator assembles + tests the skid.',
      }
    case 'heat_exchanger':
      return { process: 'plate-fabrication', steps: exchangerSteps(line), confidence: 'high' }
    case 'vessel_column_tank': {
      const shape = vesselShape(line)
      return { process: 'plate-fabrication', steps: vesselFabSteps(line, shape), confidence: 'high' }
    }
    case 'ductwork_structural':
      return { process: 'plate-fabrication', steps: ductworkSteps(line), confidence: 'high' }
    case 'skid_package':
      return { process: 'assembly-only', steps: skidAssemblySteps(), confidence: 'high' }
  }
}

/** Map a vessel/column/tank line to a process-equipment-cost FabricationShape (reused vocabulary). */
function vesselShape(line: BomLine): FabricationShape {
  const d = describe(line)
  if (/\bcolumn\b|fractionation|distillation|absorber|stripper|scrubber|regenerator/.test(d)) return 'column'
  if (/storage tank|product tank|\btank\b|api[ -]?6[25]0/.test(d)) return 'tank'
  return 'pressure_vessel'
}

// ───────────────────────────── Public API ─────────────────────────────

/**
 * The process route for ONE BoM line. Decision order:
 *   1. A genuine catalogue MPN (and not integrator-forced-made) → 'bought' (procurement route).
 *   2. A consumable charge (catalyst / adsorbent / additive) → 'bought' + consumable note
 *      (a material supply, not a manufactured item — Part 2 must not describe "how to make the catalyst").
 *   3. A detected manufacturing family → its primary_process + ordered steps.
 *   4. Nothing detected → best-effort low-confidence guess (assembly-only) with a note.
 *
 * ctx.assumeMade overrides step 1 (integrator already knows make-vs-buy): true → skip the
 * catalogue-MPN bought default and fall to family detection; false → force 'bought'.
 */
export function processRoute(line: BomLine, ctx: ProcessRouteContext = {}): ProcessRoute {
  const material = (p: PrimaryProcess) => materialLabel(line, p)

  // Integrator says BOUGHT → procurement route, full stop.
  if (ctx.assumeMade === false) {
    return {
      primary_process: 'bought',
      steps: procurementSteps(),
      material: material('bought'),
      confidence: 'high',
      note: 'Bought-in catalogue part — procured, not manufactured in-house.',
    }
  }

  // 2. Consumable charge → bought material supply (guard before the MPN check so a proprietary
  //    catalyst with no MPN is still flagged correctly).
  if (isConsumableCharge(line)) {
    return {
      primary_process: 'bought',
      steps: ['raise purchase order to formulation / catalyst supplier', 'goods-in receipt + certificate of analysis check', 'inspect / sample to specification'],
      material: material('bought'),
      confidence: 'high',
      note: 'Consumable charge (catalyst / adsorbent / additive) — a material supply, not a manufactured item; no in-house process route.',
    }
  }

  // 1. Real catalogue MPN (unless the integrator forced made) → bought.
  if (ctx.assumeMade !== true && hasCatalogueMpn(line)) {
    return {
      primary_process: 'bought',
      steps: procurementSteps(),
      material: material('bought'),
      confidence: 'high',
      note: `Real catalogue part (${modValue(line, 'manufacturer') || 'manufacturer'} ${modValue(line, 'part_number')}) — procured, not manufactured in-house.`,
    }
  }

  // 3. Detected manufacturing family → its route.
  const family = detectProcFamily(line)
  if (family) {
    const b = buildFromFamily(line, family)
    return {
      primary_process: b.process,
      steps: b.steps,
      material: material(b.process),
      confidence: b.confidence,
      note: b.note,
    }
  }

  // 4. Ambiguous — no MPN, no recognised family. Honest low-confidence default: most made items the
  //    classifier can't place are assembled units. Say so.
  return {
    primary_process: 'assembly-only',
    steps: skidAssemblySteps(),
    material: material('assembly-only'),
    confidence: 'low',
    note: `Process route uncertain — the line's form/material gives no clear manufacturing signal; defaulted to assembly-only. Treat as indicative.`,
  }
}

// ───────────────────────────── Summary across a BoM ─────────────────────────────

export interface ProcessRouteSummary {
  /** Count of made + bought lines by primary_process. */
  by_process: Record<string, number>
  /** Lines that are manufactured in-house (any process except 'bought'). */
  made_count: number
  /** Lines that are procured ('bought'). */
  bought_count: number
  /** The made processes that dominate this BoM (highest counts first), for the Part-2 lead sentence. */
  dominant_routes: string[]
  note: string
}

/**
 * Summarise the process mix across a whole BoM — the Part-2 "how you manufacture it" headline:
 * which manufacturing routes dominate, how much is made vs bought.
 */
export function processRouteSummary(lines: BomLine[], ctx: ProcessRouteContext = {}): ProcessRouteSummary {
  const by_process: Record<string, number> = {}
  let made_count = 0
  let bought_count = 0
  for (const line of lines) {
    const r = processRoute(line, ctx)
    by_process[r.primary_process] = (by_process[r.primary_process] ?? 0) + 1
    if (r.primary_process === 'bought') bought_count++
    else made_count++
  }
  const dominant_routes = Object.entries(by_process)
    .filter(([p]) => p !== 'bought')
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p)

  const topBits = dominant_routes
    .slice(0, 3)
    .map((p) => `${p} (${by_process[p]})`)
    .join(', ')
  const note =
    lines.length === 0
      ? 'No BoM lines supplied.'
      : `${made_count} of ${lines.length} lines are manufactured in-house, ${bought_count} are procured catalogue parts. ` +
        (dominant_routes.length ? `Dominant make routes: ${topBits}.` : 'No in-house manufacturing detected — this is an assembled-from-bought-parts bill.')

  return { by_process, made_count, bought_count, dominant_routes, note }
}
