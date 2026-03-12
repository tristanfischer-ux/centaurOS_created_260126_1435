/**
 * @file part-classification.ts — Single source of truth for make/buy part classification.
 *
 * @description Deterministic two-pass classification for keyParts and AI estimate parts.
 * Make indicators take PRIORITY over buy keywords to prevent false positives
 * on compound names like "motor mount bracket" or "sensor housing".
 *
 * DECISION: Make/buy classification runs on the NAME SEGMENT only (before first
 * delimiter like — : ;) to prevent spec-portion words like "housing", "body",
 * "structure" from triggering make on long keyPart descriptions. Process/material
 * detection runs on the FULL text since specs contain useful material info.
 *
 * Zero dependencies — safe to import from server actions and client utils.
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface ClassifyResult {
  type: "buy" | "make"
  process: string
  material: string
  /** true when a keyword explicitly matched (not just fallback) */
  explicit: boolean
  /** true when process value came from a text pattern match (not fallback) */
  processDetected: boolean
  /** true when material value came from a text pattern match (not fallback) */
  materialDetected: boolean
  /** Classification confidence: high = explicit keyword, medium = process/material detected, low = all fallback */
  confidence: "high" | "medium" | "low"
  /** Human-readable reasons explaining why this classification was chosen */
  reasons: string[]
}

// ─── Patterns ────────────────────────────────────────────────────────

// INTENT: Process verbs (past participles) + structural nouns that indicate custom manufacturing.
// Bug 1 fix: cast(?:ing)? covers "cast", "casting", "castings" (with outer s?).
// Bug 4 fix: bod(?:y|ies), cavit(?:y|ies) handle irregular plurals.
// Bug 5 fix: Removed standalone "printed" — it false-matched "printed circuit board".
// Bug 8 fix: All dots → [\s._-] character class to prevent "any character" matches.
export const MAKE_INDICATORS = /\b(machined|cnc[\s._-]machined|milled|turned|welded|fabricated|cast(?:ing)?|moulded|molded|forged|bent|formed|stamped|extruded|laser[\s._-]cut|anodized|anodised|powder[\s._-]coated|bracket|housing|frame|plate|enclosure|chassis|baseplate|panel|structure|duct|manifold|fixture|shell|bod(?:y|ies)|cavit(?:y|ies)|guard|tray|channel|spar|strut|rib|bulkhead|tank|rudder|blade|nozzle|impeller|exhaust|piping|keel|hull|mast|boom|foil|fin|canopy|fairing|cowl|shroud|baffle|pedestal|mount|flange|collar|sleeve|weldment|tube|pipe|honed|lapped|broached|ground|plated|brazed|riveted|bonded|laminated|thermoformed|routed|drilled|tapped|bored|reamed|jig|die|mould|mold|pattern|tooling|spool|drum|roller|spindle|arbor|mandrel)s?\b/i

// INTENT: Standard off-the-shelf components that should be classified as "buy".
// Bug 4 fix: switch(?:es)?, compass(?:es)? handle irregular plurals.
// Bug 5 fix: Added circuit[\s._-]?board to catch "printed circuit board" as buy.
// Bug 8 fix: All dots → [\s._-] character class.
export const BUY_KEYWORDS = /\b(motor|servo|stepper|sensor|switch(?:es)?|batter(?:y|ies)|power[\s._-]suppl(?:y|ies)|microcontroller|pcb|arduino|raspberry|cable|connector|bearing|linear[\s._-]rail|lead[\s._-]screw|belt|pulley|gear|fastener|bolt|screw|nut|washer|seal|o-ring|spring|fan|pump|valve|display|led|camera|encoder|driver|esc|fuse|relay|capacitor|resistor|transistor|diode|regulator|thermostat|gauge|meter|indicator|antenna|transponder|gps|transducer|solenoid|actuator|contactor|breaker|terminal|epirb|vhf|radar|anemometer|compass(?:es)?|standoff|isolator|bushing|grommet|hose|fitting|rivet|pin|dowel|circlip|shim|gasket|filter|engine|thruster|propeller|compressor|generator|alternator|charger|inverter|converter|transformer|plc|hmi|circuit[\s._-]?board|inductor|amplifier|oscillator|opamp|ic|chip|module|injector|spark[\s._-]plug|piston|rotor|stator|probe|electrode|catheter|cushion|caster|hinge|latch|handle|knob|zipper|buckle|elastic|snap|hook|clasp|gearbox|coupling|shaft[\s._-]collar|sprocket|chain|o[\s._-]ring|clamp|clip|anchor|plug|socket|damper)s?\b/i

// Bug 1 fix: cast(?:ing)?s? covers "cast", "casting", "castings".
// Bug 8 fix: All dots → [\s._-].
export const PROCESS_PATTERNS: [RegExp, string][] = [
  [/\b(cnc[\s._-]machin\w*|machin(?:ed|ing)|milled|turned|lathe)\b/i, "CNC Machining"],
  [/\b(weld\w*|tig[\s._-]weld\w*|mig[\s._-]weld\w*)\b/i, "Welding"],
  [/\b(sheet[\s._-]metal|laser[\s._-]cut\w*|bent|fold\w*|punch\w*|stamp\w*)\b/i, "Sheet Metal"],
  [/\b(injection[\s._-]mould\w*|injection[\s._-]mold\w*)\b/i, "Injection Moulding"],
  [/\b(3d[\s._-]print\w*|fdm|sla|sls)\b/i, "3D Printing"],
  [/\b(cast(?:ing)?s?|die[\s._-]cast\w*)\b/i, "Casting"],
  [/\b(composite|carbon[\s._-]fib\w*|fibre[\s._-]glass|fiber[\s._-]glass|layup)\b/i, "Composites"],
  [/\b(extrud\w*|extrusion)\b/i, "Extrusion"],
  [/\b(edm|wire[\s._-]edm|sinker[\s._-]edm|spark[\s._-]erosion)\b/i, "EDM"],
  [/\b(water[\s._-]?jet|abrasive[\s._-]jet)\b/i, "Waterjet"],
  [/\b(thermoform\w*)\b/i, "Thermoforming"],
  [/\b(blow[\s._-]mold\w*|blow[\s._-]mould\w*)\b/i, "Blow Moulding"],
  [/\b(roto[\s._-]?mold\w*|rotational[\s._-]mold\w*|roto[\s._-]?mould\w*)\b/i, "Rotational Moulding"],
  [/\b(grind\w*|ground|honed|honing|lapped|lapping|polish\w*)\b/i, "Grinding/Finishing"],
  [/\b(heat[\s._-]treat\w*|quench\w*|temper\w*|case[\s._-]harden\w*|age[\s._-]hard\w*|anneal\w*)\b/i, "Heat Treatment"],
  [/\b(electro[\s._-]?plat\w*|galvani[sz]\w*|nickel[\s._-]plat\w*|chrome[\s._-]plat\w*|zinc[\s._-]plat\w*|gold[\s._-]plat\w*)\b/i, "Plating"],
  [/\b(braz\w*|solder\w*|wave[\s._-]solder|reflow)\b/i, "Brazing/Soldering"],
  [/\b(rivet\w*)\b/i, "Riveting"],
]

// Bug 2 fix: 2024 requires temper designation (2024-T3, 2024T4) to avoid matching year "2024".
// Bug 6 fix: 304/316 negative lookahead prevents matching model/series numbers.
// Bug 8 fix: All dots → [\s._-].
export const MATERIAL_PATTERNS: [RegExp, string][] = [
  [/\b(6061|7075|5083|2024[\s-]?T\d)\b/i, "Aluminum"],
  [/\balumini?ums?\b/i, "Aluminum"],
  [/\b(mild[\s._-]steel|carbon[\s._-]steel)\b/i, "Mild Steel"],
  [/\b(stainless|(?:304|316)L?(?!\s*(?:model|series|unit|rev)))\b/i, "Stainless Steel"],
  [/\b(carbon[\s._-]fib\w*|kevlar)\b/i, "Carbon Fiber"],
  [/\b(grp|fibre[\s._-]?glass|fiber[\s._-]?glass)\b/i, "Fibreglass"],
  [/\babs\b/i, "ABS"],
  [/\b(nylon|pa6|pa66|pa12)\b/i, "Nylon"],
  [/\b(tpu|rubber|neoprene|epdm|silicone)\b/i, "Elastomer"],
  [/\bbrass\b/i, "Brass"],
  [/\bbronze\b/i, "Bronze"],
  [/\b(titanium|ti[\s._-]?6al[\s._-]?4v)\b/i, "Titanium"],
  [/\bpolycarbonate\b/i, "Polycarbonate"],
  [/\bcopper\b/i, "Copper"],
  [/\b(hdpe|uhmwpe|polyethylene)\b/i, "Polyethylene"],
  [/\b(acetal|delrin|pom)\b/i, "Acetal"],
  [/\bcast[\s._-]iron\b/i, "Cast Iron"],
  [/\bmagnesium\b/i, "Magnesium"],
  [/\b(zinc|galvani[sz]ed)\b/i, "Zinc"],
  [/\b(inconel|hastelloy|waspaloy|monel)\b/i, "Nickel Alloy"],
  [/\bpeek\b/i, "PEEK"],
  [/\b(ptfe|teflon)\b/i, "PTFE"],
  [/\bpvc\b/i, "PVC"],
  [/\b(ceramic|alumina|zirconia)\b/i, "Ceramic"],
  [/\b(glass|borosilicate|soda[\s._-]lime)\b/i, "Glass"],
  [/\b(plywood|mdf|hardwood|softwood|timber|oak|maple|walnut|birch|beech)\b/i, "Wood"],
  [/\b(foam|eps|pu[\s._-]foam|polyurethane[\s._-]foam)\b/i, "Foam"],
  [/\b(leather|suede)\b/i, "Leather"],
  [/\b(cotton|polyester|nylon[\s._-]fabric|canvas|wool|linen|silk)\b/i, "Fabric"],
  [/\b(cork)\b/i, "Cork"],
]

// ─── Known values (shared between server actions and client UI) ──────

export const KNOWN_PROCESSES = [
  "CNC Machining",
  "Welding",
  "Sheet Metal",
  "Injection Moulding",
  "3D Printing",
  "Casting",
  "Composites",
  "Extrusion",
  "EDM",
  "Waterjet",
  "Thermoforming",
  "Blow Moulding",
  "Rotational Moulding",
  "Grinding/Finishing",
  "Heat Treatment",
  "Plating",
  "Brazing/Soldering",
  "Riveting",
  "Manual/Assembly",
] as const

export const KNOWN_MATERIALS = [
  "Aluminum",
  "Mild Steel",
  "Stainless Steel",
  "Carbon Fiber",
  "Fibreglass",
  "ABS",
  "Nylon",
  "Elastomer",
  "Brass",
  "Bronze",
  "Titanium",
  "Polycarbonate",
  "Copper",
  "Polyethylene",
  "Acetal",
  "Cast Iron",
  "Magnesium",
  "Zinc",
  "Nickel Alloy",
  "PEEK",
  "PTFE",
  "PVC",
  "Ceramic",
  "Glass",
  "Wood",
  "Foam",
  "Leather",
  "Fabric",
  "Cork",
] as const

// ─── Helpers ─────────────────────────────────────────────────────────

/** Extract the part-name segment before the first spec delimiter (— : ;)
 *  and strip trailing parenthetical specs like "(Ø200 mm, bronze body)".
 *  Bug 10 fix: greedy `\(.*\)` handles nested parentheses. */
export function extractPartName(full: string): string {
  const m = full.match(/^([^—–:;]+)/)
  let name = m ? m[1].trim() : full.trim()
  // Strip trailing parenthetical specs — prevents "bronze body" in
  // "(Ø200 mm butterfly type, bronze body)" from triggering make
  name = name.replace(/\s*\(.*\)\s*$/, "").trim()
  return name || full.trim()
}

// ─── Helpers (tiebreaker) ────────────────────────────────────────────

/** Find the end position of the last match of `re` in `text`. Returns -1 if no match. */
function lastMatchEndPosition(re: RegExp, text: string): number {
  const globalRe = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")
  let last = -1
  let m: RegExpExecArray | null
  while ((m = globalRe.exec(text)) !== null) {
    const end = m.index + m[0].length
    if (end > last) last = end
  }
  return last
}

// ─── Main classifier ─────────────────────────────────────────────────

/**
 * Classify a part as make or buy using deterministic keyword matching.
 *
 * @description When both make and buy keywords match, a position-based
 * tiebreaker picks the rightmost match (head noun heuristic):
 * "tank level sensors" → buy ("sensors" is rightmost) → correct.
 * "motor mount bracket" → make ("bracket" is rightmost) → correct.
 *
 * Process/material detection tries the name segment first, then falls back
 * to the full text. This prevents spec-portion material ("316 SS flanges")
 * from overriding the actual part's material.
 *
 * @param fullName - Full part name (may include spec delimiters)
 * @param fallbackProcess - Process to use if no pattern matches
 * @param fallbackMaterial - Material to use if no pattern matches
 * @returns Classification result with type, process, material, detection flags
 */
export function classifyPart(
  fullName: string,
  fallbackProcess: string,
  fallbackMaterial: string,
): ClassifyResult {
  // INTENT: Classify make/buy on the name segment only to prevent spec-portion
  // words ("housing", "body") from triggering make on long descriptions.
  const nameSegment = extractPartName(fullName)

  const isMake = MAKE_INDICATORS.test(nameSegment)
  const isBuy = BUY_KEYWORDS.test(nameSegment)
  const reasons: string[] = []

  // INTENT: Extract the matched keyword for reason strings
  const makeMatch = nameSegment.match(MAKE_INDICATORS)
  const buyMatch = nameSegment.match(BUY_KEYWORDS)

  // DECISION: Position-based tiebreaker — when both match, the rightmost
  // keyword wins (head noun heuristic for English compound nouns).
  if (isMake && isBuy) {
    const makePos = lastMatchEndPosition(MAKE_INDICATORS, nameSegment)
    const buyPos = lastMatchEndPosition(BUY_KEYWORDS, nameSegment)
    if (buyPos > makePos) {
      reasons.push(`Contains buy indicator: '${buyMatch?.[0] ?? "unknown"}'`)
      if (makeMatch) reasons.push(`Also matched make indicator '${makeMatch[0]}', but buy keyword appeared later in name`)
      return { type: "buy", process: "Buy", material: "Off-the-shelf", explicit: true, processDetected: false, materialDetected: false, confidence: "high", reasons }
    }
    reasons.push(`Contains make indicator: '${makeMatch?.[0] ?? "unknown"}'`)
    reasons.push(`Also matched buy indicator '${buyMatch?.[0] ?? "unknown"}', but make keyword appeared later in name`)
    // fall through to make
  } else if (!isMake && isBuy) {
    reasons.push(`Contains buy indicator: '${buyMatch?.[0] ?? "unknown"}'`)
    return { type: "buy", process: "Buy", material: "Off-the-shelf", explicit: true, processDetected: false, materialDetected: false, confidence: "high", reasons }
  } else if (isMake) {
    reasons.push(`Contains make indicator: '${makeMatch?.[0] ?? "unknown"}'`)
  }

  // DECISION: Name-first detection — try name segment first for process/material,
  // fall back to full text. Prevents spec-portion values overriding the part's actual attributes.
  let process = fallbackProcess
  let processDetected = false
  for (const [re, label] of PROCESS_PATTERNS) {
    if (re.test(nameSegment)) { process = label; processDetected = true; reasons.push(`Manufacturing process detected: ${label}`); break }
  }
  if (!processDetected) {
    for (const [re, label] of PROCESS_PATTERNS) {
      if (re.test(fullName)) { process = label; processDetected = true; reasons.push(`Manufacturing process detected: ${label}`); break }
    }
  }

  let material = fallbackMaterial
  let materialDetected = false
  for (const [re, label] of MATERIAL_PATTERNS) {
    if (re.test(nameSegment)) { material = label; materialDetected = true; reasons.push(`Material detected: ${label}`); break }
  }
  if (!materialDetected) {
    for (const [re, label] of MATERIAL_PATTERNS) {
      if (re.test(fullName)) { material = label; materialDetected = true; reasons.push(`Material detected: ${label}`); break }
    }
  }

  // INTENT: Confidence scoring — high when explicit keyword matched, medium when
  // process/material detected from text, low when all values are fallback.
  const confidence: "high" | "medium" | "low" = isMake
    ? "high"
    : (processDetected || materialDetected) ? "medium" : "low"

  if (reasons.length === 0) {
    reasons.push("Default classification — no strong indicators found")
  }

  return { type: "make", process, material, explicit: isMake, processDetected, materialDetected, confidence, reasons }
}
