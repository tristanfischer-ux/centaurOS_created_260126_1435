// tool-archetype-coherence-audit.ts
//
// THE TOOL-ARCHETYPE COHERENCE GATE (chain exit 34) — the AIM self-correction
// net that would have CAUGHT the CO₂-mineralisation "wrong physics" bug.
//
// WHY THIS EXISTS (the CO₂-mineralisation post-mortem, 2026-06-04). A universal
// engine that wires tools onto an UNKNOWN archetype reached for MARINE / wrong-
// domain process tools as stand-ins when no in-class process tool existed, and
// then rendered their worked-calcs straight into the dossier:
//   • `pressure-vessel:design` computed "External hydrostatic pressure" at
//     "29.8 m seawater depth, rho_water = 1025 kg/m3" — a SUBMERSIBLE HULL
//     collapse check — for an above-ground CO₂ chemical plant's absorber column.
//   • `corrosion:anode-sizing` computed "DNV-RP-B401 … 316 stainless in tropical
//     environment", "A_hull", "sacrificial anodes", "anode mass" — a SHIP-HULL
//     cathodic-protection calc — and seeded the contract quantities
//     cp_anode_mass_kg / cp_protection_current_a / cp_anode_replacement_interval_years.
//   • `irrigation:pump-sizing` computed Hazen-Williams "sprinkler" maths with
//     "n_emitters" / "emitter_head" for the MEA circulation pump.
// None of this is wrong PHYSICS in the abstract — it is exactly right on an AUV
// (the `auv` class plan legitimately wires pressure-vessel hull-collapse,
// corrosion anode-sizing, seawater density 1025, depth_m) — it is wrong CLASS.
// A human glances at a CO₂ plant page that talks about seawater depth and
// sacrificial hull anodes and knows instantly the engine grabbed the wrong tool.
//
// THIS GATE makes that judgement DETERMINISTIC + CLASS-CONDITIONAL: for a class
// that is NOT marine/submersible, the presence of a MARINE marker (seawater,
// hull, external hydrostatic, cathodic, sacrificial anode, anode mass, m seawater
// depth, DNV-RP-B401) or an IRRIGATION marker (sprinkler, drip emitter, Hazen-
// Williams, n_emitters) inside a rendered worked-calc OR a contract quantity is a
// HIGH finding — "this tool is a mis-applied / marine stand-in for a missing
// process tool". On a marine class the SAME markers are legitimate and never fire.
//
// SHADOW by default (mirrors the K10 / self-audit / cost-sanity / physics-critic
// ladder, gates 31-33): the chain records `state.toolArchetypeCoherence`, logs the
// would-block verdict, and NEVER exits unless `TOOL_ARCHETYPE_ENFORCING` is set.
// Only a HIGH finding hard-exits 34 when enforcing (gate-severity philosophy:
// WRONGNESS hard-exits, a soft deviation flags + renders). Pure + deterministic
// (no LLM) so `computeToolArchetypeCoherence` / `evaluateToolArchetypeEnforcement`
// / `toolArchetypeEnforceModeFromEnv` / `isMarineClass` / `scanTextForMarkers` are
// unit-testable directly.
//
// DISTINCT from gate 33 (physics-critic): gate 33 turns the LLM Critic's first-
// principles "this named part will FAIL" judgement into a hard refusal — it
// reasons about a part's RATING vs a DEMAND. Gate 34 is orthogonal + cheaper: it
// catches a tool whose entire DOMAIN is wrong for the class, regardless of whether
// its numbers happen to close — a structurally-mis-applied tool the Critic may
// score as internally-consistent (the hull-collapse maths is self-consistent; it
// is just answering a question this plant never asks).

// ---------------------------------------------------------------------------
// Marker vocabularies (curated — the domains a non-marine, non-irrigation plant
// must never present as a worked-calc / quantity)
// ---------------------------------------------------------------------------

export interface DomainMarker {
  /** The id reported in the finding, e.g. 'external hydrostatic'. */
  id: string
  /** Matched against lower-cased worked-calc / quantity text. Kept as RegExp so a
   *  marker can require a word boundary (e.g. \bhull\b) and avoid matching a
   *  substring of an innocent word (e.g. "anode" inside "canode" would not occur,
   *  but "emitter" needs care — see IRRIGATION_MARKERS). */
  re: RegExp
}

/**
 * MARINE_MARKERS — the submersible / naval / subsea physics vocabulary. Every
 * one of these is a LEGITIMATE term on an AUV/ROV/submarine (the `auv` class plan
 * uses pressure-vessel hull-collapse + corrosion:anode-sizing + seawater density
 * 1025 + operating_depth_m) and a CLASS ERROR on anything that does not live in
 * the sea. Word-boundaried where a bare substring would over-match.
 */
export const MARINE_MARKERS: DomainMarker[] = [
  { id: 'seawater', re: /\bsea\s?water\b/ },
  // seawater density 1025 — the canonical pressure-vessel hydrostatic tell. The
  // density value alone (1025 kg/m3) co-occurring with "water" is marine.
  { id: 'seawater density 1025', re: /\brho_water\b|\bwater\s+density\s+1025\b|\bseawater\s+density\b/ },
  { id: 'hull', re: /\bhull\b|\ba_hull\b|\bhull_area\b/ },
  { id: 'external hydrostatic', re: /\bexternal\s+hydrostatic\b|\bhydrostatic\s+(?:pressure|collapse)\b|\bexternal[-\s]?pressure\s+(?:buckling|collapse)\b/ },
  { id: 'm seawater depth', re: /\b(?:depth_m|operating_depth_m|dive\s+depth)\b|\bm\s+(?:sea\s?water\s+)?depth\b|\bseawater\s+depth\b/ },
  { id: 'cathodic protection', re: /\bcathodic\b|\bcathodic[-\s]?protection\b/ },
  { id: 'sacrificial anode', re: /\bsacrificial\s+anode\b|\bsacrificial\s+anodes?\b/ },
  // a bare "anode" plus mass/current is the anode-sizing tool. Galvanic-anode
  // material names are marine corrosion-protection tells.
  { id: 'anode mass', re: /\banode\s+mass\b|\banode_mass\b|\bm_anode\b|\banode\s+(?:count|capacity|current)\b/ },
  { id: 'galvanic anode material', re: /\baluminium[-_\s]?zinc[-_\s]?indium\b|\bzinc[-\s]?anode\b|\bgalvanic\s+anode\b/ },
  { id: 'DNV-RP-B401', re: /\bdnv[-\s]?rp[-\s]?b401\b|\bdnv[-\s]?rp\b/ },
]

/**
 * IRRIGATION_MARKERS — the agricultural-irrigation / fire-sprinkler hydraulics
 * vocabulary. The `irrigation:pump-sizing` tool is a legitimate pick for a
 * vertical-farm / agri class but a domain error when it stands in for a generic
 * process-fluid circulation pump. NOTE "emitter" is overloaded: in an irrigation
 * sense it is a drip/sprinkler emitter (matched here); the electronics sense
 * (light-emitter, RF emitter) is a different word and must NOT match — so we
 * require the irrigation collocations (n_emitters, emitter_head, flow_per_emitter,
 * drip/sprinkler emitter) rather than a bare "emitter".
 */
export const IRRIGATION_MARKERS: DomainMarker[] = [
  { id: 'sprinkler', re: /\bsprinkler\b/ },
  { id: 'Hazen-Williams', re: /\bhazen[-\s]?williams\b/ },
  { id: 'n_emitters', re: /\bn_emitters\b/ },
  { id: 'drip/sprinkler emitter', re: /\b(?:drip|sprinkler|irrigation)\s+emitters?\b|\bflow_per_emitter\b|\bemitter_head\b|\bemitter_pressure\b/ },
]

/**
 * HYDROPONIC_MARKERS — the soilless-crop NUTRIENT-SOLUTION chemistry vocabulary.
 * The `nutrient-solution:chemistry` tool is a legitimate pick for a vertical-farm /
 * hydroponic class but a DOMAIN ERROR when it stands in for a fish-farm or process-
 * water dosing duty (the marine yellowtail-kingfish RAS leak, 2026-06-16: a
 * hydroponic Ca/P formula produced a wrong salt inventory for what is seawater). A
 * crop-feed solution is dosed for the PLANT'S calcium-nitrate / monopotassium-
 * phosphate / N-P-K make-up at a target EC; a fish-rearing or potable/process-water
 * plant doses for ALKALINITY / pH / salinity / disinfection — a different calculation.
 * These markers fire on a class that is NOT a hydroponic / soilless-crop grower.
 * NOTE: "EC" / "conductivity" alone is overloaded (every electrolyte has a
 * conductivity), so we require the HYDROPONIC collocation (nutrient-solution EC /
 * target EC of a feed solution) rather than a bare "conductivity".
 */
export const HYDROPONIC_MARKERS: DomainMarker[] = [
  { id: 'nutrient solution', re: /\bnutrient[-\s]?solution\b|\bnutrient[-\s]?dosing\b|\bnutrient[-\s]?recipe\b|\bfertigation\b|\bstock\s+solution\s+[ab]\b/ },
  { id: 'calcium nitrate dosing', re: /\bcalcium\s+nitrate\b|\bca\(no3\)2\b|\bcalcinit\b/ },
  { id: 'monopotassium phosphate dosing', re: /\bmonopotassium\s+phosphate\b|\bmono-?potassium\s+phosphate\b|\bmkp\b|\bkh2po4\b/ },
  // N-P-K crop-feed make-up (the macronutrient recipe a plant feed is built from).
  { id: 'N-P-K nutrient make-up', re: /\bn-?p-?k\b|\bmacronutrient\s+(?:dose|recipe|solution)\b|\bnpk\s+ratio\b/ },
  // hydroponic target EC / Ca / P set-points (collocated — never a bare "EC").
  { id: 'hydroponic EC / Ca-P target', re: /\bnutrient[-\s]?solution\s+ec\b|\btarget\s+ec\b|\bec_target\b|\bca_target\b|\bp_target\b|\bppm\s+(?:n|p|k|ca)\b/ },
]

/**
 * REFRIGERATION_MARKERS — the active-COOLING / refrigeration-cycle vocabulary. The
 * `refrigeration-cycle:cop` + `hvac:load-sizing` tools are legitimate on a product
 * whose thermal duty is to REJECT heat (a cold store, a process chiller, a battery /
 * data-centre cooling loop) but a DOMAIN ERROR on a class whose thermal duty is to
 * ADD heat / HOLD a warm setpoint (a heating water-source heat-pump, a process
 * heater, a boiler). The marine RAS leak (2026-06-16) rendered "800 kW chiller /
 * Total cooling load / condenser duty" prose for what is a HEATING heat-pump that
 * must lift make-up water to 26.4 °C in a cold Scottish climate. These markers fire
 * on a class that is NOT a cooling / refrigeration product (so a chiller-cooling
 * marker on a fish-farm-that-needs-heating is wrong, but the same marker on a cold
 * store is legitimate). NOTE the chiller/cooling words must be the REFRIGERATION
 * sense — a "cooling water" pipe loop that REJECTS process heat is not flagged on a
 * cooling-product, only the cooling-CYCLE / chiller-capacity / condenser-duty calcs.
 */
export const REFRIGERATION_MARKERS: DomainMarker[] = [
  { id: 'chiller capacity', re: /\bchiller\s+(?:capacity|duty|sizing|load|selection)\b|\bchiller\s*=\b|\bpackaged\s+chiller\b/ },
  { id: 'total cooling load', re: /\btotal\s+cooling\s+load\b|\bcooling\s+load\s+(?:q_total|qtotal|=)\b|\bsensible\s+\+?\s*latent\s+cooling\b/ },
  { id: 'condenser duty', re: /\bcondenser\s+(?:duty|heat\s+rejection|load)\b|\bq_condenser\b|\bcondensing\s+temperature\b/ },
  { id: 'evaporator / refrigeration cycle', re: /\bevaporator\s+(?:duty|load|temperature)\b|\brefrigerat(?:ion|ing)\s+cycle\b|\bcooling\s+cop\b|\bcop_cool(?:ing)?\b|\beer\b\s+rating/ },
]

/** All marker families the gate scans, tagged by family for the finding text. */
export type MarkerFamily = 'marine' | 'irrigation' | 'hydroponic' | 'refrigeration'
export const MARKER_FAMILIES: Array<{ family: MarkerFamily; markers: DomainMarker[] }> = [
  { family: 'marine', markers: MARINE_MARKERS },
  { family: 'irrigation', markers: IRRIGATION_MARKERS },
  { family: 'hydroponic', markers: HYDROPONIC_MARKERS },
  { family: 'refrigeration', markers: REFRIGERATION_MARKERS },
]

/** The PRODUCT family for which a marker family is legitimate — used in the finding
 *  message ("…in a class that is not a <home>"). PURE. */
function familyHome(family: MarkerFamily): string {
  switch (family) {
    case 'marine': return 'marine/submersible product'
    case 'hydroponic': return 'hydroponic/soilless-crop grower'
    case 'refrigeration': return 'cooling/refrigeration product'
    case 'irrigation': return 'agricultural-irrigation/sprinkler system'
  }
}

// ---------------------------------------------------------------------------
// Class inference — is the product class MARINE / submersible?
// ---------------------------------------------------------------------------

/** Submersible / naval / subsea class tokens. A class matching any of these
 *  LEGITIMATELY uses the marine markers, so the gate suppresses marine findings
 *  for it. Mirrors the product-classifier (`auv` slug) + deployment-envelopes
 *  (auv / autonomous-underwater-vehicle variants). Token match is word-boundaried
 *  so "auv" does not match "gauvire" etc. */
const MARINE_CLASS_TOKENS = [
  'auv', 'uuv', 'rov', 'submarine', 'submersible', 'naval', 'underwater', 'subsea',
  'marine', 'auvehicle', 'glider', // 'glider' = underwater glider (a marine sub-type)
]

/** Pull the product class from state, preferring parsedBrief then moduleDecomposition
 *  then the orchestrator contract / keyMetrics (the same cascade the chain uses).
 *  Returns a lower-cased slug, or '' if none is present. PURE. */
export function inferProductClass(state: any): string {
  const candidates = [
    state?.parsedBrief?.product_class,
    state?.parsedBrief?.constraints?.product_class,
    state?.moduleDecomposition?.product_class,
    state?.orchestratorContract?.product_class,
    state?.keyMetrics?.product_class,
    state?.complianceGate?.product_class,
  ]
  for (const c of candidates) {
    const s = String(c ?? '').trim().toLowerCase()
    if (s && s !== 'null' && s !== 'undefined' && s !== 'unknown') return s
  }
  return ''
}

/** Is this product class MARINE / submersible (so marine markers are legitimate)?
 *  Word-boundaried token match over the class slug (handles auv / auv_inspection /
 *  autonomous_underwater_vehicle / rov-pipeline). PURE. */
export function isMarineClass(productClass: string): boolean {
  return classMatchesTokens(productClass, MARINE_CLASS_TOKENS)
}

/** HYDROPONIC / soilless-crop grower class tokens. A class matching any of these
 *  LEGITIMATELY uses the hydroponic nutrient-solution markers (a vertical farm
 *  genuinely doses calcium nitrate + monopotassium phosphate to a target EC), so
 *  the gate suppresses hydroponic findings for it. PURE. */
const HYDROPONIC_CLASS_TOKENS = [
  'vertical_farm', 'verticalfarm', 'hydroponic', 'hydroponics', 'aeroponic', 'aeroponics',
  'greenhouse', 'glasshouse', 'plant_factory', 'cea', 'indoor_farm', 'grow_room', 'nft_farm',
]

/** Active-COOLING / refrigeration PRODUCT class tokens — the FALLBACK suppression
 *  for refrigeration markers when the per-tool author-scope STAMP is absent (the
 *  primary discriminator is `tool.applicable_to_class`, see familyFires). A class
 *  matching any of these LEGITIMATELY uses the refrigeration-cycle / chiller markers
 *  (its thermal duty is to REJECT heat). Includes cold-chain + process-chiller +
 *  EVERY class the catalogue cooling tools (refrigeration-cycle:cop +
 *  hvac:load-sizing) declare themselves applicable_to (bess / edge_ai / data-centre /
 *  h2_electrolyser / ups_inverter / cnc_machine / ventilator / bioreactor), so even
 *  the stamp-less fallback never false-flags a legitimate heat-rejecting plant. PURE. */
const COOLING_CLASS_TOKENS = [
  // explicit cooling / refrigeration products
  'refrigerat', 'refrigerator', 'chiller', 'cold_store', 'coldstore', 'cold_room', 'cold_chain',
  'coldchain', 'freezer', 'air_conditioner', 'air_conditioning', 'aircon', 'hvac', 'heat_pump',
  'heatpump', 'cooling', 'cryocooler', 'cryogenic_cooler',
  // heat-rejecting plants the catalogue cooling tools are scoped to (so the fallback
  // matches the tools' own applicable_to → a chiller calc on these is legitimate)
  'bess', 'edge_ai', 'data_centre', 'data_center', 'datacentre', 'datacenter', 'server',
  'h2_electrolyser', 'electrolyser', 'electrolyzer', 'ups_inverter', 'cnc_machine', 'ventilator',
  'bioreactor',
]

/** Shared word-boundaried token matcher over a class slug. Normalises separators
 *  (_-/:) to spaces so a token can word-boundary-match a slug part. PURE. */
function classMatchesTokens(productClass: string, tokens: ReadonlyArray<string>): boolean {
  const slug = String(productClass ?? '').trim().toLowerCase()
  if (!slug) return false
  const normalised = ` ${slug.replace(/[_\-/:]+/g, ' ')} `
  // token may itself contain a space-normalised separator (e.g. 'cold_store' →
  // matches 'cold store'); compare against the same normalisation.
  return tokens.some((tok) => {
    const t = tok.replace(/[_\-/:]+/g, ' ')
    return new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(normalised)
  })
}

/** Is this product class a HYDROPONIC / soilless-crop grower (hydroponic markers
 *  legitimate)? PURE. */
export function isHydroponicClass(productClass: string): boolean {
  return classMatchesTokens(productClass, HYDROPONIC_CLASS_TOKENS)
}

/** Is this product class an active-COOLING / refrigeration product (refrigeration
 *  markers legitimate)? PURE. */
export function isCoolingClass(productClass: string): boolean {
  return classMatchesTokens(productClass, COOLING_CLASS_TOKENS)
}

// ---------------------------------------------------------------------------
// Marker scanning over arbitrary text
// ---------------------------------------------------------------------------

export interface MarkerHit {
  family: MarkerFamily
  marker: string   // the marker id, e.g. 'external hydrostatic'
}

/** Scan one blob of text for every marker across every family. Returns the
 *  distinct (family, marker) hits in declaration order. PURE — case-insensitive
 *  via lower-casing once (the marker regexes are written lower-case, un-flagged). */
export function scanTextForMarkers(text: string): MarkerHit[] {
  const lower = String(text ?? '').toLowerCase()
  if (!lower) return []
  const hits: MarkerHit[] = []
  for (const { family, markers } of MARKER_FAMILIES) {
    for (const m of markers) {
      if (m.re.test(lower)) hits.push({ family, marker: m.id })
    }
  }
  return hits
}

// ---------------------------------------------------------------------------
// The finding shape + the pure compute
// ---------------------------------------------------------------------------

export interface ToolArchetypeFinding {
  /** 'high' (the only severity this gate emits — a domain-mismatched tool is a
   *  wrongness, not a soft deviation). */
  severity: 'high'
  /** The offending tool id (e.g. 'pressure-vessel:design'), or a contract-quantity
   *  pseudo-source ('contract:cp_anode_mass_kg') when the marker is in a quantity. */
  tool_id: string
  /** Where the marker was seen: 'worked-calc' or 'contract-quantity'. */
  surface: 'worked-calc' | 'contract-quantity'
  /** The marker family + id that fired. */
  family: MarkerFamily
  marker: string
  /** The offending line (worked-calc label/formula/substitution/assumption, or the
   *  quantity key + condition + provenance), truncated for the log. */
  evidence: string
  /** The full human-readable finding message. */
  message: string
}

export type ToolArchetypeVerdict = 'pass' | 'high' | 'unavailable'

export interface ToolArchetypeCoherenceResult {
  verdict: ToolArchetypeVerdict
  /** The inferred product class, lower-cased ('' if none). */
  product_class: string
  /** Whether the class was treated as marine (marine markers suppressed). */
  is_marine_class: boolean
  /** Whether the class was treated as hydroponic (hydroponic markers suppressed). */
  is_hydroponic_class: boolean
  /** Whether the class was treated as active-cooling (refrigeration markers
   *  suppressed). */
  is_cooling_class: boolean
  /** One finding per offending (tool|quantity, surface) — deduped. */
  findings: ToolArchetypeFinding[]
  /** Count of tools whose worked-calcs were scanned. */
  tools_scanned: number
  /** Count of contract quantities scanned. */
  quantities_scanned: number
  /** Short verdict line for the log. */
  message: string
}

const trunc = (s: any, n: number): string => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

/** Build the scannable text for one worked-calc entry: every operator-visible
 *  field (label + formula + substitution + each assumption). The renderer's field
 *  is `formula` (+ `substitution`); older states may carry `expression`. */
function workedCalcText(w: any): string {
  const parts = [
    w?.label,
    w?.formula,
    w?.expression,
    w?.substitution,
    Array.isArray(w?.assumptions) ? w.assumptions.join(' ; ') : w?.assumptions,
  ]
  return parts.filter((p) => p != null && p !== '').join(' | ')
}

/** Build the scannable text for one contract quantity: its KEY (name), its
 *  human `condition`, and its provenance (source / tool_id / invocation_output_field)
 *  — a marine quantity like cp_anode_mass_kg ("sacrificial anodes installed",
 *  field "anode_mass_kg_actual_installed") is caught by the condition + field even
 *  when the key itself ("cp_…") is opaque. */
function quantityText(key: string, value: any): string {
  const prov = value?.provenance ?? {}
  const parts = [
    key,
    value?.condition,
    prov?.source,
    prov?.tool_id,
    prov?.invocation_output_field,
  ]
  return parts.filter((p) => p != null && p !== '').join(' | ')
}

/**
 * PURE + deterministic. Given the chain state, infer the class and scan every
 * tool's worked-calcs + every contract quantity for marine / irrigation /
 * hydroponic / refrigeration markers. On a class that does NOT legitimately use a
 * family's domain, each offending (tool|quantity) yields a HIGH finding. Each
 * family is suppressed ONLY on the class where it is legitimate, mirroring marine:
 *   - marine        suppressed on a marine/submersible class (auv/rov/…)
 *   - hydroponic    suppressed on a soilless-crop grower (vertical_farm/hydroponic/…)
 *   - refrigeration suppressed on an active-cooling product (chiller/cold store/…)
 *   - irrigation    fires universally (kept simple; the documented failure mode is a
 *                   sprinkler/Hazen-Williams pump calc standing in for a process pump)
 * This is the universal "wrong DOMAIN tool leaked in" net (e.g. the marine
 * yellowtail-kingfish RAS: a HYDROPONIC nutrient-dosing tool produced a wrong salt
 * inventory, and a chiller-COOLING tool produced "Total cooling load / chiller
 * capacity" prose for a HEATING heat-pump — both flagged here on aquaculture_ras,
 * which is neither a hydroponic grower nor a cooling product).
 *
 * NEVER throws — a malformed/absent toolsUsedPage / orchestratorContract yields a
 * clean 'unavailable' / 'pass' result so the gate can never wedge the chain.
 */
export function computeToolArchetypeCoherence(state: any): ToolArchetypeCoherenceResult {
  const productClass = inferProductClass(state)
  const marine = isMarineClass(productClass)
  const hydroponic = isHydroponicClass(productClass)
  const cooling = isCoolingClass(productClass)
  const base: ToolArchetypeCoherenceResult = {
    verdict: 'pass',
    product_class: productClass,
    is_marine_class: marine,
    is_hydroponic_class: hydroponic,
    is_cooling_class: cooling,
    findings: [],
    tools_scanned: 0,
    quantities_scanned: 0,
    message: '',
  }

  const tools: any[] = Array.isArray(state?.toolsUsedPage?.tools) ? state.toolsUsedPage.tools : []
  const quantities: Record<string, any> =
    state?.orchestratorContract?.quantities && typeof state.orchestratorContract.quantities === 'object'
      ? state.orchestratorContract.quantities
      : {}
  const quantityKeys = Object.keys(quantities)

  if (tools.length === 0 && quantityKeys.length === 0) {
    return { ...base, verdict: 'unavailable', message: 'no tools-used page or contract quantities in state' }
  }

  const findings: ToolArchetypeFinding[] = []

  // De-dupe: one finding per (tool_id|quantity-source, family) so a tool with five
  // marine worked-calcs reports ONE marine finding (the first/strongest line), not
  // five. The first hit per (source, family) wins (deterministic — declaration order).
  const seen = new Set<string>()

  // PER-TOOL AUTHOR-SCOPE STAMP (the UNIVERSAL discriminator, when present). The
  // chain may stamp each tools-used entry with `applicable_to_class` — the result of
  // the tool's OWN applicable_to(envelope) for THIS class. When a tool's own author
  // scope INCLUDES this class, ANY domain marker it renders is IN-DOMAIN by
  // definition (e.g. a chiller-cooling calc on a BESS / data-centre / electrolyser,
  // all of which the cooling tools legitimately serve) → suppress, with NO need to
  // hand-enumerate every heat-rejecting class in COOLING_CLASS_TOKENS. The class-
  // token lists (is{Marine,Hydroponic,Cooling}Class) remain the FALLBACK when the
  // stamp is absent (older states / quantity-only findings). This keeps the gate
  // universal: the leak (a tool whose applicable_to EXCLUDES the class) still fires;
  // a legitimate in-domain tool never does.
  const applicableByToolId = new Map<string, boolean>()
  for (const tool of tools) {
    const tid = String(tool?.tool_id ?? tool?.tool_name ?? '')
    if (tid && typeof tool?.applicable_to_class === 'boolean') applicableByToolId.set(tid, tool.applicable_to_class)
  }

  /** Should a hit of this family fire for this class, for THIS tool? A tool whose
   *  own author scope INCLUDES this class never fires a domain finding (its physics
   *  is in-domain). Otherwise each domain family is suppressed only on the class
   *  where it is legitimate (marine on a submersible, hydroponic on a soilless-crop
   *  grower, refrigeration on an active-cooling product); irrigation fires
   *  universally. `toolId` omitted (quantity findings with no named tool) → class-
   *  token suppression only. */
  const familyFires = (family: MarkerFamily, toolId?: string): boolean => {
    if (toolId && applicableByToolId.get(toolId) === true) return false // in-domain per the tool's own scope
    if (family === 'marine') return !marine
    if (family === 'hydroponic') return !hydroponic
    if (family === 'refrigeration') return !cooling
    return true // irrigation
  }

  // ── Worked-calcs ──────────────────────────────────────────────────────────
  for (const tool of tools) {
    const toolId = String(tool?.tool_id ?? tool?.tool_name ?? 'unknown-tool')
    const worked: any[] = Array.isArray(tool?.worked) ? tool.worked : []
    for (const w of worked) {
      const text = workedCalcText(w)
      const hits = scanTextForMarkers(text)
      for (const hit of hits) {
        if (!familyFires(hit.family, toolId)) continue
        const dedupeKey = `tool::${toolId}::${hit.family}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        findings.push({
          severity: 'high',
          tool_id: toolId,
          surface: 'worked-calc',
          family: hit.family,
          marker: hit.marker,
          evidence: trunc(text, 200),
          message:
            `${toolId} presents ${hit.family} "${hit.marker}" physics in a ` +
            `${productClass || 'unknown'} class that is not a ${familyHome(hit.family)} — a mis-applied ` +
            `${hit.family} tool, likely a stand-in for a missing process tool. Offending worked-calc: "${trunc(text, 160)}"`,
        })
      }
    }
  }

  // ── Contract quantities ───────────────────────────────────────────────────
  for (const key of quantityKeys) {
    const value = quantities[key]
    const text = quantityText(key, value)
    const provToolForStamp = String(value?.provenance?.tool_id ?? '').trim() || undefined
    const hits = scanTextForMarkers(text)
    for (const hit of hits) {
      if (!familyFires(hit.family, provToolForStamp)) continue
      // attribute to the SOURCE tool when provenance names one, else the quantity key
      const provTool = String(value?.provenance?.tool_id ?? '').trim()
      const source = provTool || `contract:${key}`
      const dedupeKey = `qty::${source}::${hit.family}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      findings.push({
        severity: 'high',
        tool_id: source,
        surface: 'contract-quantity',
        family: hit.family,
        marker: hit.marker,
        evidence: trunc(text, 200),
        message:
          `${source} emits a ${hit.family} "${hit.marker}" quantity (${key}) in a ` +
          `${productClass || 'unknown'} class that is not a ${familyHome(hit.family)} — a mis-applied ` +
          `${hit.family} tool, likely a stand-in for a missing process tool. Offending quantity: "${trunc(text, 160)}"`,
      })
    }
  }

  const suppressed = [
    marine ? 'marine' : null,
    hydroponic ? 'hydroponic' : null,
    cooling ? 'refrigeration' : null,
  ].filter(Boolean)
  const verdict: ToolArchetypeVerdict = findings.length > 0 ? 'high' : 'pass'
  const message =
    verdict === 'high'
      ? `${findings.length} domain-mismatched tool(s)/quantity(ies) in "${productClass || 'unknown'}": ` +
        findings.map((f) => `${f.tool_id}[${f.family}:${f.marker}]`).join(', ')
      : suppressed.length > 0
        ? `coherent — "${productClass}" legitimately uses ${suppressed.join(' + ')} markers (${tools.length} tools, ${quantityKeys.length} quantities scanned)`
        : `coherent — no domain-mismatched tool markers in "${productClass || 'unknown'}" (${tools.length} tools, ${quantityKeys.length} quantities scanned)`

  return {
    verdict,
    product_class: productClass,
    is_marine_class: marine,
    is_hydroponic_class: hydroponic,
    is_cooling_class: cooling,
    findings,
    tools_scanned: tools.length,
    quantities_scanned: quantityKeys.length,
    message,
  }
}

// ---------------------------------------------------------------------------
// The pure enforcement decision (mirrors gates 31-33 exactly)
// ---------------------------------------------------------------------------

export type ToolArchetypeEnforceMode = 'off' | 'on'

/** Fatal chain exit code for an enforced tool-archetype-coherence block. Next
 *  free after 33 (see CLAUDE.md exit-code table; 0-33 used, 4/8/9 reserved).
 *  Module-local: consumers read decision.exitCode. */
export const TOOL_ARCHETYPE_EXIT_CODE = 34

export interface ToolArchetypeEnforcementDecision {
  shouldExit: boolean
  exitCode: number  // TOOL_ARCHETYPE_EXIT_CODE when shouldExit, else 0
  mode: ToolArchetypeEnforceMode
  reasons: string[]
}

/**
 * PURE + deterministic given (result, mode): decide whether enforcing mode must
 * hard-exit the chain. Only a HIGH verdict blocks (matching the gate-severity
 * philosophy: a domain-mismatched tool is WRONGNESS → hard-exits; this gate emits
 * nothing softer). 'pass' / 'unavailable' never block.
 */
export function evaluateToolArchetypeEnforcement(
  result: ToolArchetypeCoherenceResult,
  mode: ToolArchetypeEnforceMode,
): ToolArchetypeEnforcementDecision {
  if (mode === 'off') return { shouldExit: false, exitCode: 0, mode, reasons: [] }
  const shouldExit = result.verdict === 'high'
  return {
    shouldExit,
    exitCode: shouldExit ? TOOL_ARCHETYPE_EXIT_CODE : 0,
    mode,
    reasons: shouldExit ? result.findings.map((f) => f.message) : [],
  }
}

/** Map TOOL_ARCHETYPE_ENFORCING to a mode. unset / 0 / false / off / no / shadow → off;
 *  anything else truthy (1 / true / on / enforce / enforcing) → on. Default is OFF
 *  (shadow) so an in-flight re-run is NEVER blocked unless the operator opts in. */
export function toolArchetypeEnforceModeFromEnv(v: string | undefined): ToolArchetypeEnforceMode {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === '' || s === '0' || s === 'false' || s === 'off' || s === 'no' || s === 'shadow') return 'off'
  return 'on'
}

/** Convenience for the chain: compute + (optionally) decide in one call. */
export function runToolArchetypeCoherence(
  state: any,
  envValue?: string,
): { result: ToolArchetypeCoherenceResult; enforcement: ToolArchetypeEnforcementDecision } {
  const result = computeToolArchetypeCoherence(state)
  const mode = toolArchetypeEnforceModeFromEnv(envValue)
  const enforcement = evaluateToolArchetypeEnforcement(result, mode)
  return { result, enforcement }
}
