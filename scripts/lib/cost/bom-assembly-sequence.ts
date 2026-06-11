/**
 * bom-assembly-sequence.ts — the ASSEMBLY / ERECTION-SEQUENCE layer of the dossier's Part 2
 * ("how you manufacture it"). The last piece of Tristan's Option-A evolve of the bill of materials,
 * after make-vs-buy (bom-make-vs-buy.ts) and process-route (bom-process-route.ts).
 *
 * THE GAP THIS CLOSES: the two sibling modules answer, per LINE, "do we make or buy this?" and
 * "IF we make it, HOW (the shop-floor operations)?". Neither says how the WHOLE PLANT goes together
 * on SITE — the ordered build. A real plant is not assembled line-by-line in BoM order; it is erected
 * in PHASES: you pour the foundations before you set a column on them, you set the heavy equipment
 * before you run the pipework between it, you run power before you energise the instruments, and you
 * commission last. Part 2 promises "how you manufacture it"; for the plant as a whole that promise
 * needs an erection sequence. This module produces it: the ordered build phases, what happens in each,
 * and which BoM items land in each phase — deterministically, from signals already in the BoM (the
 * same make-vs-buy / process-route role signals) plus the plant TOPOLOGY (process order) and the
 * routed CONNECTION SCHEDULE (the pipe / cable runs). No network, no LLM, no per-class table.
 *
 * THE PHASE SET (a small UNIVERSAL erection sequence — civil first, services + commissioning last;
 * keyed on ROLE SIGNALS, not a product-class list, so it works on any archetype):
 *
 *   1. civil-foundations       — groundworks, plinths, bunds, foundations. The base everything sits on.
 *   2. structural-erection     — the frame / skid steel / structural steel / gantries + platforms.
 *   3. set-major-equipment     — the heavy fabricated / custom items (columns, reactors, vessels,
 *                                compressors, heat exchangers, tanks, packaged skids) LIFTED + set in
 *                                PROCESS ORDER (feed → reaction → separation → upgrading → product),
 *                                derived from the topology where available.
 *   4. pipework-ducting        — the interconnecting piping / ducting runs (the fluid + thermal runs
 *                                from the connection schedule) + any pipe-spool BoM lines.
 *   5. electrical-cabling      — power distribution + cable runs (the transformers, switchgear, VSDs,
 *                                MCC, UPS + the electrical runs from the connection schedule).
 *   6. instruments-controls    — transmitters, valves, detectors, analysers, junction boxes + the
 *                                DCS / SIS / control system. The plant's nervous system.
 *   7. pre-commissioning       — pressure / leak test, flushing + cleaning, loop checks, continuity.
 *                                (Synthetic — a test-and-prove scope, not a BoM line.)
 *   8. commissioning-startup   — energise, functional test, first feed-in, performance run + handover.
 *                                (Synthetic — a prove-it-works scope, not a BoM line.)
 *
 * SIGNAL CASCADE (how each BoM line is placed — see phaseForLine):
 *   - a CIVIL item (foundation / plinth / bund / groundworks)                    → civil-foundations
 *   - a STRUCTURAL item (skid frame / structural steel / gantry / platform that is NOT a packaged
 *     process skid)                                                              → structural-erection
 *   - an INSTRUMENT / VALVE / CONTROL item (transmitter / detector / analyser / control valve / DCS /
 *     SIS / junction box / barrier)                                             → instruments-controls
 *   - an ELECTRICAL item (transformer / switchgear / VSD / drive / MCC / UPS / cable / cabling)
 *                                                                               → electrical-cabling
 *   - a PIPE-SPOOL / DUCT item (interconnecting spool / ductwork / manifold)     → pipework-ducting
 *   - a CONSUMABLE charge (catalyst / adsorbent) rides with the vessel it fills  → set-major-equipment
 *     (loaded into its vessel during equipment setting, flagged in a note)
 *   - everything else heavy + fabricated / custom (vessels / columns / reactors / HX / compressors /
 *     tanks / packaged skids)                                                    → set-major-equipment
 *
 * The order WITHIN set-major-equipment follows the plant TOPOLOGY (the from→to process edges): items
 * are sorted by how early they appear in the feed→product chain, so the sequence reads "set the feed
 * compressors, then the reactor, then the separators, then the column, then the storage tanks" —
 * which is how an erection contractor actually phases the heavy lifts. Where a line cannot be matched
 * to the topology it keeps BoM order (stable) and sits after the matched items.
 *
 * REUSED DETECTION IDEAS (the HOUSE STYLE of bom-make-vs-buy.ts / bom-process-route.ts, re-implemented
 * here so this module imports NOTHING and is independently testable):
 *   - modifier helpers (form / manufacturer / part_number), an IDENTITY haystack (name + ids, NOT the
 *     form sentence) used for the auxiliary guards, and the same over-match defence: a structural
 *     token in a line whose HEAD noun is an instrument / valve (e.g. "storage-tank N2 blanketing
 *     valves", "reactor pressure-relief valve") is a LOCATION qualifier, not the structure — so the
 *     line goes to instruments-controls, not set-major-equipment.
 *   - the consumable guard (catalyst / adsorbent charge) keyed on identity.
 *
 * Pure + deterministic. No network, no LLM, no clock. British spelling throughout.
 * Unit-tested in bom-assembly-sequence.test.tsx; verified on the real e-fuel state + connection
 * schedule (out/oxccu-saf-v21) — the FT reactor + columns land in set-major-equipment in process
 * order; the 8 routed runs split across pipework (7 fluid/thermal) + electrical (1 bus); the
 * instruments land in instruments-controls; every phase is non-empty + correctly ordered.
 */

// ───────────────────────────── Public types ─────────────────────────────

/** The fixed universal phase keys, in erection order. */
export type AssemblyPhaseKey =
  | 'civil-foundations'
  | 'structural-erection'
  | 'set-major-equipment'
  | 'pipework-ducting'
  | 'electrical-cabling'
  | 'instruments-controls'
  | 'pre-commissioning'
  | 'commissioning-startup'

export interface AssemblyPhase {
  /** The phase key (stable identifier, e.g. 'set-major-equipment'). */
  phase: AssemblyPhaseKey
  /** Human title for the dossier ("Set major equipment"). */
  title: string
  /** 1-based erection order (1 = first on site). */
  order: number
  /** One-line what-happens in this phase. */
  scope: string
  /** The BoM item names (and routed-run descriptors) that belong to this phase, in build order. */
  items: string[]
  /** Optional clarifier — only when something needs saying (e.g. process-order note, empty-phase note). */
  note?: string
}

export interface AssemblySequenceResult {
  phases: AssemblyPhase[]
  /** A short paragraph describing the build order for Part 2. */
  narrative: string
}

/** A BoM line ("word"): name_human + modifier_characters[{kind,value,unit?}] + content_character. */
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
 * A routed connection run from the connection schedule (out/oxccu-saf-v21/connection-schedule.json
 * `rows[]`). The from/to + mechanism decide whether the run is PIPEWORK (fluid / thermal / duct) or
 * ELECTRICAL (electrical bus / cable). `qty` is the human descriptor ("DN32 pipe, 12.4 m, …").
 */
export interface ConnectionRun {
  mechanism?: string
  from?: string
  to?: string
  size?: string
  qty?: string
  /** Some schedules also stamp a kind on the run/spec (pipe / cable / duct). */
  kind?: string
}

/**
 * A topology edge from the engineering contract (out/oxccu-saf-v21/0.5-engineering-contract.json
 * `topology[]`). Two field-name shapes are accepted (the contract uses from_part/to_part; a routed
 * schedule uses from/to) so the caller can pass either without reshaping.
 */
export interface TopologyEdge {
  from_part?: string
  to_part?: string
  from?: string
  to?: string
}

export interface AssemblySequenceContext {
  /** The routed connection runs (connection-schedule rows). Split into pipework + electrical phases. */
  connections?: ConnectionRun[]
  /** The plant topology edges (engineering-contract topology). Drives the set-major-equipment order. */
  topology?: TopologyEdge[]
}

// ───────────────────────────── Modifier / identity helpers ─────────────────────────────

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
/**
 * The line's IDENTITY — name + character_id + word_id only, NOT the form sentence. The auxiliary /
 * structural guards key off this so a content word inside a vessel's form prose (a reactor "with
 * shaped iron catalyst", a tank "with N2 blanketing") is not mistaken for the catalyst / the valve.
 * (Same rationale as bom-make-vs-buy.ts / bom-process-route.ts identity().)
 */
function identity(line: BomLine): string {
  return [line.name_human, line.content_character?.name_human, line.content_character?.character_id, wordId(line)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
/** Lower-cased haystack of every text field incl. the form sentence — for fabrication verbs only. */
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
function lineName(line: BomLine): string {
  return String(line.name_human ?? line.content_character?.name_human ?? wordId(line) ?? 'item').trim()
}

// ───────────────────────────── Role signals (re-implemented, dep-free) ─────────────────────────────

/**
 * CIVIL / GROUNDWORKS: the things you build BEFORE anything is set — foundations, plinths, piling,
 * bunds, containment, hardstanding, groundworks. Rare as explicit BoM lines on a packaged plant
 * (civil is usually a contractor scope, not a BoM word), but recognised when present.
 */
const CIVIL_RE =
  /\b(foundation|foundations|plinth|plinths|footing|footings|pile[\s-]?cap|piling|\bpile[s]?\b|ground[\s-]?work|groundwork|civil[\s-]?work|hardstanding|slab\b|raft\b|bund\b|bunding|containment[\s-]?(?:bund|kerb|wall)|kerb|earthwork|excavation|sub[\s-]?base)\b/i

/**
 * STRUCTURAL ERECTION: the bare frame the plant hangs on — structural steel, support frames,
 * gantries, walkways, platforms, pipe racks. EXCLUDES the packaged PROCESS skids (a "cooling-water
 * skid" / "additisation skid" is a process equipment item set in phase 3, not bare steel) — those
 * carry a process verb (cooling / dosing / metering / nitrogen / instrument-air …) and are caught by
 * the package guard below.
 */
const STRUCTURAL_RE =
  /\b(structural[\s-]?steel|steel[\s-]?frame|support[\s-]?frame|support[\s-]?structure|frame[\s-]?work|framework|pipe[\s-]?rack|pipe[\s-]?bridge|cable[\s-]?rack|access[\s-]?(?:gantry|platform|ladder|stair)|gantry|walkway|platform|stair|ladder|baseframe|base[\s-]?frame|module[\s-]?frame|skid[\s-]?frame)\b/i

/** A PROCESS package / skid verb — marks a "skid" as a process equipment item (phase 3), NOT bare steel. */
const PROCESS_PACKAGE_RE =
  /\b(cooling[\s-]?water|chilled[\s-]?water|dosing|additis|additiv|metering|injection|inerting|nitrogen|instrument[\s-]?air|air[\s-]?compress|generation|loading[\s-]?(?:gantry|arm)|custody|dryer|drier|oxidiser|oxidizer|refrigerat|compressor[\s-]?package|membrane)\b/i

/**
 * INSTRUMENT / VALVE / CONTROL: the plant's nervous system — transmitters, sensors, detectors,
 * analysers, gauges, control / ESD / relief / blanketing valves, the DCS / SIS / fire & gas
 * controllers, marshalling + control cabinets, isolation barriers, junction boxes, HMI, positioners.
 * These are set + wired LAST (after equipment + pipework + power). Mirrors the bom-make-vs-buy.ts
 * NONSTRUCTURAL_HEAD_RE auxiliary set, widened to the control-system items.
 */
const INSTRUMENT_RE =
  /\b(transmitters?|sensors?|detectors?|analy[sz]ers?|gauges?|meters?|metering[\s-]?(?:skid|system)?|instruments?|instrumentation|controllers?|control[\s-]?valves?|\bvalves?\b|valve[\s-]?set|regulators?|breathers?|positioners?|actuators?|barriers?|isolators?|\bdcs\b|distributed[\s-]?control|\bsis\b|safety[\s-]?instrumented|fire[\s-]?&?[\s-]?gas|fire[\s-]?and[\s-]?gas|f&g\b|marshalling[\s-]?(?:cabinet|panel)?|control[\s-]?(?:cabinet|panel|\+[\s-]?marshalling)|junction[\s-]?box(?:es)?|\bhmi\b|thermowells?|probes?|switchgear[\s-]?control|i\/o[\s-]?(?:cards?|modules?|stations?|interface)|\bi\/o\b|input\/output|profinet|ethernet[\s-]?switch|managed[\s-]?switch|industrial[\s-]?switch(?:es)?|scalance)\b/i

/**
 * ELECTRICAL / POWER: power distribution + cabling — transformers, switchgear, ring-main units, LV
 * boards, motor control centres, variable-frequency / variable-speed drives, UPS, cables, cabling,
 * busbars. Set + run BEFORE the instruments are energised. DELIBERATELY placed AFTER the instrument
 * check (a "motor control centre" is electrical; a "fire & gas controller" is an instrument) — the
 * cascade tries instruments first so a control item carrying "control" is not swept here.
 */
const ELECTRICAL_RE =
  /\b(transformers?|switchgear|ring[\s-]?main[\s-]?unit|\brmu\b|lv[\s-]?board|mv[\s-]?board|distribution[\s-]?board|motor[\s-]?control[\s-]?centre|motor[\s-]?control[\s-]?center|\bmcc\b|variable[\s-]?frequency[\s-]?drives?|variable[\s-]?speed[\s-]?drives?|\bvfd[s]?\b|\bvsd[s]?\b|\bdrives?\b|uninterruptible|\bups\b|power[\s-]?(?:distribution|supply|cable)|cabling|\bcables?\b|busbar|bus[\s-]?bar|earthing|cable[\s-]?tray)\b/i

/** PIPE-SPOOL / DUCT BoM line — interconnecting spools, ductwork, manifolds shipped as BoM items. */
const PIPE_DUCT_RE =
  /\b(pipe[\s-]?spool|spool[\s-]?piece|spool\b|interconnecting[\s-]?pip|ductwork|\bduct\b|manifold|pipe[\s-]?manifold|header[\s-]?pipe|tie[\s-]?in[\s-]?pip)\b/i

/** CONSUMABLE / process-media charge — loaded INTO a vessel during equipment setting (not its own lift). */
const CONSUMABLE_RE =
  /\b(catalyst|adsorbent|desiccant|molecular[\s-]?sieve|resin\b|media[\s-]?charge|charge\b|sorbent|getter|packing[\s-]?media|deoxo)\b/i

/**
 * "Internals" / structured packing / trays / distributors — fitted into a column or vessel during
 * equipment setting (they go in with the column, phase 3). Distinct from a loose consumable charge,
 * but for SEQUENCING both ride with their host vessel, so this routes to set-major-equipment too.
 */
const INTERNALS_RE = /\b(internals?|structured[\s-]?packing|random[\s-]?packing|trays?\b|distributor[s]?\b|demister|mist[\s-]?eliminator|packing\b)\b/i

/**
 * MAJOR-EQUIPMENT family — the heavy fabricated / engineered items lifted + set in phase 3: vessels,
 * columns, reactors, separators, drums, tanks, heat exchangers, compressors, pumps, blowers, dryers,
 * steam generators, oxidisers, and the PROCESS packaged skids. This is the catch-all for "heavy thing
 * that gets craned into place"; the cascade reaches it only AFTER the civil / structural / instrument
 * / electrical / pipe-spool signals have had their turn, so an instrument or a cable never lands here.
 */
const MAJOR_EQUIP_RE =
  /\b(pressure[\s-]?vessel|\bvessel\b|\bcolumn\b|fractionat\w*|distillation|absorber|stripper|scrubber|regenerator|\breactor\b|hydrocrack\w*|hydrotreat\w*|hydroprocess\w*|isomeris\w*|isomeriz\w*|fischer[\s-]?tropsch|synthesis[\s-]?reactor|guard[\s-]?bed|separator|decanter|coalesc\w*|knock[\s-]?out|\bk\.?o\.?[\s-]?drum\b|\bdrum\b|\btank\b|storage[\s-]?tank|api[\s-]?6(?:50|20)|steam[\s-]?(?:drum|generator)|waste[\s-]?heat|boiler|\bdryer\b|drier|reboiler|condenser|preheater|exchanger|\bcooler\b|chiller|economiser|economizer|\bhx\b|shell[\s-]?and[\s-]?tube|compressors?|\bblowers?\b|\bfans?\b|\bpump\b|\bpumps\b|oxidiser|oxidizer|incinerator|mixer\b|filter\b|coalescer|\bskid\b|\bpackage\b|heater\b)\b/i

/** Fabrication / engineered verbs that confirm a line is a MADE heavy item (form-safe — describe HOW). */
const FABRICATION_RE =
  /\b(fabricat\w*|welded|rolled|machined|bespoke|made[\s-]?to[\s-]?order|engineered\b|engineered[\s-]?package|packaged\b|package\b|\bskid\b|configured|built[\s-]?to)\b/i

// ───────────────────────────── Per-line phase assignment ─────────────────────────────

/**
 * The phases a BoM LINE can be assigned to (the equipment-bearing phases). The synthetic
 * pre-commissioning + commissioning phases never receive a BoM line.
 */
type LinePhaseKey = Extract<
  AssemblyPhaseKey,
  'civil-foundations' | 'structural-erection' | 'set-major-equipment' | 'pipework-ducting' | 'electrical-cabling' | 'instruments-controls'
>

/**
 * Decide which erection phase a single BoM line belongs to, by role signal. The cascade is ORDERED
 * by decisiveness, with the auxiliary guard applied so a structural / equipment token inside an
 * instrument or valve line (a LOCATION qualifier) does not pull the line into set-major-equipment.
 *
 *   1. civil (foundation / bund / groundworks) — the base.
 *   2. an INSTRUMENT / VALVE / CONTROL head noun → instruments-controls (checked EARLY so e.g.
 *      "storage-tank N2 blanketing valves" or "reactor pressure-relief valve" — which carry a
 *      structural token — are placed as instruments, not as the tank / the reactor).
 *   3. bare STRUCTURAL steel / frame / gantry (and NOT a process package) → structural-erection.
 *   4. ELECTRICAL / power / cabling → electrical-cabling.
 *   5. a PIPE-SPOOL / DUCT BoM line → pipework-ducting.
 *   6. a CONSUMABLE charge or column INTERNALS → set-major-equipment (loaded with its host vessel).
 *   7. a MAJOR-EQUIPMENT family item → set-major-equipment.
 *   8. fallback → set-major-equipment (a heavy made item is the safe default for an unplaced line;
 *      it is the phase a craned package belongs to, and the narrative flags the soft edge).
 */
function phaseForLine(line: BomLine): LinePhaseKey {
  const id = identity(line)
  const desc = describe(line)

  // 1. Civil / groundworks.
  if (CIVIL_RE.test(id)) return 'civil-foundations'

  // 2. Instrument / valve / control HEAD noun → instruments. Checked before structural / equipment so
  //    a valve or instrument that merely MENTIONS a vessel/tank/reactor is not mis-placed as that
  //    structure. Guard: a fabrication verb in the identity ("fabricated … manifold") is not an
  //    instrument — let it fall through.
  if (INSTRUMENT_RE.test(id) && !FABRICATION_RE.test(id)) return 'instruments-controls'

  // 3. Bare structural steel / frame / gantry — but NOT a process package (cooling-water skid etc.).
  if (STRUCTURAL_RE.test(id) && !PROCESS_PACKAGE_RE.test(id)) return 'structural-erection'

  // 4. Electrical / power / cabling.
  if (ELECTRICAL_RE.test(id)) return 'electrical-cabling'

  // 5. Pipe-spool / duct BoM line.
  if (PIPE_DUCT_RE.test(id)) return 'pipework-ducting'

  // 6. Consumable charge / column internals → ride with the host vessel in set-major-equipment.
  if (CONSUMABLE_RE.test(id) || INTERNALS_RE.test(id)) return 'set-major-equipment'

  // 7. Major-equipment family (vessel / column / reactor / HX / compressor / pump / packaged skid …).
  if (MAJOR_EQUIP_RE.test(id) || MAJOR_EQUIP_RE.test(desc)) return 'set-major-equipment'

  // 8. Fallback — a heavy made item is the safe default (it gets craned in during equipment setting).
  return 'set-major-equipment'
}

/** True when the line is a consumable charge / column internals (for the set-equipment note). */
function isChargeOrInternals(line: BomLine): boolean {
  const id = identity(line)
  return CONSUMABLE_RE.test(id) || INTERNALS_RE.test(id)
}

// ───────────────────────────── Topology process-order ─────────────────────────────

function edgeFrom(e: TopologyEdge): string {
  return String(e.from_part ?? e.from ?? '').trim().toLowerCase()
}
function edgeTo(e: TopologyEdge): string {
  return String(e.to_part ?? e.to ?? '').trim().toLowerCase()
}

/**
 * Per-node process-position depths derived from the topology edges:
 *   - forward  = longest path FROM a feed source TO the node (feed end ≈ 0, downstream grows).
 *   - backward = longest path FROM the node TO a product sink (product end = 0, feed end grows).
 *
 * Both are longest-path relaxations capped at |nodes| iterations, so a recycle loop (which makes the
 * graph cyclic) always terminates. Two depths are kept because a real engineering-contract topology
 * is frequently FRAGMENTED — a mid-stream train (here the upgrading column) can have NO incoming
 * edge wired, which makes it a structural "orphan source" with forward=0 even though it sits LATE in
 * the process. Distance-to-PRODUCT (backward) is the robust ordering signal in that case: the sink
 * end of a plant is almost always fully wired even when an intermediate feed edge is missing, so a
 * node that reaches storage in one hop is correctly placed near the product end regardless of whether
 * anything upstream points INTO it. orderByTopology() orders by backward-desc then forward-asc, which
 * reads feed → reaction → separation → upgrading → product on this plant and degrades gracefully on
 * any partial graph.
 *
 * Electrical-bus / utility edges (e.g. electrical_supply → process_compressors_and_pumps) are NODES
 * here too, but their tokens don't match a single fabricated equipment line, so they don't bind to a
 * phase-3 item — harmless.
 */
interface TopoDepths {
  forward: number
  backward: number
}
function topologyRank(topology: TopologyEdge[]): Map<string, TopoDepths> {
  const nodes = new Set<string>()
  for (const e of topology) {
    const a = edgeFrom(e)
    const b = edgeTo(e)
    if (a) nodes.add(a)
    if (b) nodes.add(b)
  }
  const cap = nodes.size
  // Forward: relax fwd(b) = max(fwd(b), fwd(a)+1).
  const fwd = new Map<string, number>()
  for (const n of nodes) fwd.set(n, 0)
  for (let i = 0; i < cap; i++) {
    let changed = false
    for (const e of topology) {
      const a = edgeFrom(e)
      const b = edgeTo(e)
      if (!a || !b) continue
      const cand = (fwd.get(a) ?? 0) + 1
      if (cand > (fwd.get(b) ?? 0)) {
        fwd.set(b, cand)
        changed = true
      }
    }
    if (!changed) break
  }
  // Backward: relax bwd(a) = max(bwd(a), bwd(b)+1) — longest path to a sink.
  const bwd = new Map<string, number>()
  for (const n of nodes) bwd.set(n, 0)
  for (let i = 0; i < cap; i++) {
    let changed = false
    for (const e of topology) {
      const a = edgeFrom(e)
      const b = edgeTo(e)
      if (!a || !b) continue
      const cand = (bwd.get(b) ?? 0) + 1
      if (cand > (bwd.get(a) ?? 0)) {
        bwd.set(a, cand)
        changed = true
      }
    }
    if (!changed) break
  }
  const out = new Map<string, TopoDepths>()
  for (const n of nodes) out.set(n, { forward: fwd.get(n) ?? 0, backward: bwd.get(n) ?? 0 })
  return out
}

/** Normalise a name/id to comparable tokens for topology matching (lower, non-alnum → spaces). */
function normTokens(s: string): string[] {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3) // drop noise tokens (of, to, a)
}

/**
 * Score how well a BoM line matches a topology node: count of node tokens that also appear in the
 * line's identity tokens. The best-matching node lends its process depths to the line. Returns
 * { depths, score } — score 0 means "no topology match" (the line keeps BoM order, after matched ones).
 *
 * Uses a small synonym bridge so the contract's node names (which differ slightly from the BoM line
 * names) still bind: e.g. node "three_phase_separator" ↔ line "hot/cold 3-phase separator",
 * node "ft_synthesis_reactor" ↔ line "Fischer-Tropsch synthesis reactor",
 * node "saf_and_naphtha_storage" ↔ line "SAF storage tank".
 */
function topologyMatchRank(line: BomLine, rank: Map<string, TopoDepths>): { depths: TopoDepths; score: number } {
  const lineToks = new Set(normTokens(identity(line)).map(canonToken))
  let best = { depths: { forward: 0, backward: 0 } as TopoDepths, score: 0 }
  for (const [node, d] of rank) {
    const nodeToks = normTokens(node).map(canonToken)
    if (nodeToks.length === 0) continue
    let score = 0
    for (const t of nodeToks) if (lineToks.has(t)) score++
    if (score > best.score) best = { depths: d, score }
  }
  return best
}

/** Canonicalise a token so contract-node vocabulary lines up with BoM-line vocabulary. */
function canonToken(t: string): string {
  // strip a few morphological variants + bridge known synonyms
  let x = t
  if (x === 'phase' || x === '3phase' || x === 'threephase') x = 'phase'
  if (x === 'ft') x = 'fischer'
  if (x === 'syn' || x === 'synthesis') x = 'synthesis'
  if (x === 'reactors') x = 'reactor'
  if (x === 'separators') x = 'separator'
  if (x === 'compressors') x = 'compressor'
  if (x === 'columns') x = 'column'
  if (x === 'tanks' || x === 'storage') x = 'storage'
  if (x === 'naphtha') x = 'storage' // saf_and_naphtha_storage ↔ naphtha storage tank
  if (x === 'saf') x = 'storage'
  if (x === 'oxidiser' || x === 'oxidizer') x = 'oxidiser'
  return x
}

// ───────────────────────────── Connection-run split ─────────────────────────────

/** A run is ELECTRICAL when its mechanism / kind reads electrical/power/cable; else it is pipework. */
function runIsElectrical(run: ConnectionRun): boolean {
  const hay = `${run.mechanism ?? ''} ${run.kind ?? ''} ${run.size ?? ''} ${run.qty ?? ''}`.toLowerCase()
  return /electric|electrical|power|bus\b|cable|\bcabling\b|busbar|mm²|mm2/.test(hay) && !/pipe|duct|fluid|thermal|coolant/.test(`${run.mechanism ?? ''} ${run.kind ?? ''}`.toLowerCase())
}
/** A run is PIPEWORK when its mechanism / kind reads fluid / thermal / pipe / duct / coolant. */
function runIsPipework(run: ConnectionRun): boolean {
  const m = `${run.mechanism ?? ''} ${run.kind ?? ''}`.toLowerCase()
  return /fluid|thermal|pipe|duct|coolant|process|vent|drain|gas|liquid/.test(m)
}

/** Pretty descriptor for a routed run ("co2 feed compressor → ft synthesis reactor: DN32 pipe, 12.4 m"). */
function runDescriptor(run: ConnectionRun): string {
  const a = humanNode(run.from)
  const b = humanNode(run.to)
  const qty = String(run.qty ?? run.size ?? '').trim()
  const arrow = a && b ? `${a} → ${b}` : a || b || 'run'
  return qty ? `${arrow}: ${qty}` : arrow
}
/** A snake_case node id → a human label ("ft_synthesis_reactor" → "FT synthesis reactor"). */
function humanNode(n?: string): string {
  return String(n ?? '')
    .replace(/_/g, ' ')
    .replace(/\bft\b/i, 'FT')
    .replace(/\bco2\b/i, 'CO2')
    .replace(/\bh2\b/i, 'H2')
    .replace(/\bsaf\b/i, 'SAF')
    .trim()
}

// ───────────────────────────── Phase metadata ─────────────────────────────

interface PhaseMeta {
  key: AssemblyPhaseKey
  title: string
  scope: string
}
/** The fixed phase order + titles + default scope sentences (universal across product classes). */
const PHASES: PhaseMeta[] = [
  {
    key: 'civil-foundations',
    title: 'Civil & foundations',
    scope: 'Groundworks, plinths, equipment foundations and any bunding — the base the plant is set on.',
  },
  {
    key: 'structural-erection',
    title: 'Structural / skid erection',
    scope: 'Erect the structural steel, support frames, pipe racks, gantries and access platforms.',
  },
  {
    key: 'set-major-equipment',
    title: 'Set major equipment',
    scope: 'Lift and position the heavy fabricated and engineered equipment, set in process order on its foundations.',
  },
  {
    key: 'pipework-ducting',
    title: 'Pipework & ducting',
    scope: 'Install the interconnecting process piping, thermal/coolant runs and ducting between the equipment.',
  },
  {
    key: 'electrical-cabling',
    title: 'Electrical & cabling',
    scope: 'Install power distribution, switchgear, drives and the cable runs feeding the plant.',
  },
  {
    key: 'instruments-controls',
    title: 'Instruments & controls',
    scope: 'Mount the field instruments and valves and install the control + safety system (DCS/SIS), then cable and terminate them.',
  },
  {
    key: 'pre-commissioning',
    title: 'Pre-commissioning & test',
    scope: 'Pressure- and leak-test the systems, flush and clean lines, and loop-check every instrument and control before energising.',
  },
  {
    key: 'commissioning-startup',
    title: 'Commissioning & start-up',
    scope: 'Energise, functionally test, introduce first feed and run the plant up to a performance test, then hand over.',
  },
]

// ───────────────────────────── The public builder ─────────────────────────────

/**
 * Build the ordered assembly / erection sequence for the whole plant.
 *
 * Each BoM line is placed into one of the equipment-bearing phases by role signal; the
 * set-major-equipment phase is ordered by the plant topology (process order); the pipework + electrical
 * phases are additionally populated from the routed connection schedule; the two commissioning phases
 * are synthetic test-and-prove scopes. Every phase is returned (in fixed order) even if empty.
 *
 * Pure + deterministic.
 */
export function assemblySequence(state: unknown, ctxArg?: AssemblySequenceContext): AssemblySequenceResult {
  const { lines, connections, topology } = extractInputs(state, ctxArg)

  // 1. Bucket every BoM line by phase.
  const buckets = new Map<LinePhaseKey, BomLine[]>([
    ['civil-foundations', []],
    ['structural-erection', []],
    ['set-major-equipment', []],
    ['pipework-ducting', []],
    ['electrical-cabling', []],
    ['instruments-controls', []],
  ])
  for (const line of lines) buckets.get(phaseForLine(line))!.push(line)

  // 2. Order the major-equipment bucket by topology process order (feed → product). Stable for ties.
  const rank = topologyRank(topology)
  const equip = buckets.get('set-major-equipment')!
  const ordered = orderByTopology(equip, rank)

  // 3. Split the routed runs into pipework + electrical.
  const pipeRuns = connections.filter((r) => runIsPipework(r) && !runIsElectrical(r))
  const elecRuns = connections.filter((r) => runIsElectrical(r))

  // 4. Assemble each phase's item list.
  const itemsByPhase = new Map<AssemblyPhaseKey, string[]>()
  itemsByPhase.set('civil-foundations', buckets.get('civil-foundations')!.map(lineName))
  itemsByPhase.set('structural-erection', buckets.get('structural-erection')!.map(lineName))
  itemsByPhase.set('set-major-equipment', ordered.map(lineName))
  itemsByPhase.set('pipework-ducting', [
    ...buckets.get('pipework-ducting')!.map(lineName),
    ...pipeRuns.map(runDescriptor),
  ])
  itemsByPhase.set('electrical-cabling', [
    ...buckets.get('electrical-cabling')!.map(lineName),
    ...elecRuns.map(runDescriptor),
  ])
  itemsByPhase.set('instruments-controls', buckets.get('instruments-controls')!.map(lineName))
  itemsByPhase.set('pre-commissioning', [])
  itemsByPhase.set('commissioning-startup', [])

  // 5. Build the phase objects (fixed order, 1-based) with per-phase notes.
  const phases: AssemblyPhase[] = PHASES.map((meta, i) => {
    const items = itemsByPhase.get(meta.key) ?? []
    return {
      phase: meta.key,
      title: meta.title,
      order: i + 1,
      scope: meta.scope,
      items,
      note: phaseNote(meta.key, { items, equip, ordered, rank, pipeRuns, elecRuns, buckets, hasTopology: rank.size > 0 }),
    }
  })

  const narrative = buildNarrative(phases, { ordered, pipeRuns, elecRuns, hasTopology: rank.size > 0 })
  return { phases, narrative }
}

// ───────────────────────────── Input extraction (tolerant) ─────────────────────────────

/**
 * Pull the BoM lines out of a state object (moduleDecomposition.modules[].sub_modules[].words[]) and
 * fold in the optional connection + topology context. Tolerant of being handed: the full state, just
 * `moduleDecomposition`, or a bare `BomLine[]`. Connections/topology come from ctx first, then from
 * state if the caller folded them in there.
 */
function extractInputs(
  state: unknown,
  ctxArg?: AssemblySequenceContext,
): { lines: BomLine[]; connections: ConnectionRun[]; topology: TopologyEdge[] } {
  const lines: BomLine[] = []
  const s = state as any

  if (Array.isArray(s)) {
    // Bare BomLine[] passed directly.
    for (const w of s) if (w && typeof w === 'object') lines.push(w as BomLine)
  } else if (s && typeof s === 'object') {
    const md = s.moduleDecomposition ?? (Array.isArray(s.modules) ? s : undefined)
    const modules = md?.modules ?? []
    for (const m of modules)
      for (const sm of m?.sub_modules ?? [])
        for (const w of sm?.words ?? []) if (w && typeof w === 'object') lines.push(w as BomLine)
  }

  const connections =
    ctxArg?.connections ??
    (state as any)?.connectionSchedule?.rows ??
    (state as any)?.connection_schedule?.rows ??
    []
  const topology =
    ctxArg?.topology ??
    (state as any)?.engineeringContract?.topology ??
    (state as any)?.topology ??
    (state as any)?.orchestratorContract?.topology ??
    []

  return {
    lines,
    connections: Array.isArray(connections) ? connections : [],
    topology: Array.isArray(topology) ? topology : [],
  }
}

// ───────────────────────────── Ordering + notes + narrative ─────────────────────────────

/**
 * Order the major-equipment lines by topology PROCESS POSITION (feed end first, product end last).
 * Matched lines lead; unmatched lines keep BoM order and trail (the recognisable process spine first,
 * the unplaceable kit after). The process-position key is, in priority order:
 *
 *   1. backward depth DESCENDING — distance-to-PRODUCT. The feed end is farthest from the product
 *      sink, the product end is 0. This is the primary signal because a contract topology's SINK end
 *      is reliably wired even when an intermediate feed edge is missing, so it places a fragmented
 *      mid-stream node (e.g. an upgrading column whose inlet edge the contract omitted) correctly by
 *      how close it sits to storage, instead of mis-reading its missing inlet as "a feed source".
 *   2. forward depth ASCENDING — longest path from a feed source. Breaks ties among nodes equidistant
 *      from the product (e.g. a separator and a reactor both N hops from storage) into feed→downstream
 *      order.
 *   3. original BoM index — stable for genuine ties / both-unmatched.
 *
 * On a fully-wired linear plant the two depths agree and this reduces to plain process order; on the
 * real (partial) e-fuel topology it yields feed compressors → reactor → separators → column →
 * storage, which is the order an erection contractor sets the heavy equipment.
 */
function orderByTopology(equip: BomLine[], rank: Map<string, TopoDepths>): BomLine[] {
  const decorated = equip.map((line, idx) => {
    const m = topologyMatchRank(line, rank)
    return { line, idx, matched: m.score > 0, forward: m.depths.forward, backward: m.depths.backward }
  })
  decorated.sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1 // matched first
    if (a.matched && b.matched) {
      if (a.backward !== b.backward) return b.backward - a.backward // farther from product = earlier
      if (a.forward !== b.forward) return a.forward - b.forward // nearer the feed = earlier
    }
    return a.idx - b.idx // stable: same position / both unmatched
  })
  return decorated.map((d) => d.line)
}

interface NoteCtx {
  items: string[]
  equip: BomLine[]
  ordered: BomLine[]
  rank: Map<string, TopoDepths>
  pipeRuns: ConnectionRun[]
  elecRuns: ConnectionRun[]
  buckets: Map<LinePhaseKey, BomLine[]>
  hasTopology: boolean
}

/** Per-phase clarifier — only emitted when it adds information (process-order note, charge note, empty). */
function phaseNote(key: AssemblyPhaseKey, c: NoteCtx): string | undefined {
  switch (key) {
    case 'civil-foundations':
      return c.items.length === 0
        ? 'No civil lines in the bill of materials — groundworks + foundations are a site-contractor scope here, executed before equipment delivery.'
        : undefined
    case 'structural-erection':
      return c.items.length === 0
        ? 'No bare structural-steel lines in the bill — the equipment is skid- or foundation-mounted; any support steel is part of the packaged skids set in the next phase.'
        : undefined
    case 'set-major-equipment': {
      const charges = c.equip.filter(isChargeOrInternals).map(lineName)
      const orderNote = c.hasTopology
        ? 'Set in process order (feed → reaction → separation → upgrading → product), derived from the plant topology.'
        : 'Set in bill-of-materials order (no topology supplied to derive the process sequence).'
      const chargeNote = charges.length
        ? ` The catalyst/adsorbent charges and column internals (${sample(charges, 3)}) are loaded into their host vessels during this phase, not lifted separately.`
        : ''
      return orderNote + chargeNote
    }
    case 'pipework-ducting':
      return c.pipeRuns.length
        ? `${c.pipeRuns.length} routed pipe/thermal run${c.pipeRuns.length === 1 ? '' : 's'} from the connection schedule are installed between the equipment set above.`
        : undefined
    case 'electrical-cabling':
      return c.elecRuns.length
        ? `${c.elecRuns.length} routed power run${c.elecRuns.length === 1 ? '' : 's'} from the connection schedule feed the motor + utility loads.`
        : undefined
    case 'instruments-controls':
      return undefined
    case 'pre-commissioning':
      return 'A test-and-prove scope, not a bill-of-materials line — it gates the move to live commissioning.'
    case 'commissioning-startup':
      return 'The final prove-it-works scope — first feed-in, performance run and handover.'
  }
}

function sample(names: string[], n: number): string {
  const taken = names.slice(0, n)
  return taken.join(', ') + (names.length > n ? `, and ${names.length - n} more` : '')
}

interface NarrativeCtx {
  ordered: BomLine[]
  pipeRuns: ConnectionRun[]
  elecRuns: ConnectionRun[]
  hasTopology: boolean
}

/** A short paragraph describing the build order for Part 2 (signal-driven, not invented numbers). */
function buildNarrative(phases: AssemblyPhase[], c: NarrativeCtx): string {
  const count = (k: AssemblyPhaseKey) => phases.find((p) => p.phase === k)?.items.length ?? 0
  const equipNames = c.ordered.map(lineName)
  const leadEquip = sample(equipNames, 3)

  const parts: string[] = []
  parts.push(
    'The plant is erected in eight phases. Civil works and foundations go in first, followed by the structural steel and ' +
      'skid frames that carry the equipment.',
  )
  if (count('set-major-equipment') > 0) {
    parts.push(
      `The ${count('set-major-equipment')} major equipment item${count('set-major-equipment') === 1 ? '' : 's'} are then ` +
        `lifted and set ${c.hasTopology ? 'in process order' : 'in bill order'}` +
        (leadEquip ? ` — beginning with ${leadEquip}` : '') +
        ` — each positioned on its foundation before the next is craned in.`,
    )
  }
  const pipeBits: string[] = []
  if (count('pipework-ducting') > 0) pipeBits.push(`the interconnecting pipework and ducting (${count('pipework-ducting')} runs/spools)`)
  if (count('electrical-cabling') > 0) pipeBits.push(`power distribution and cabling (${count('electrical-cabling')} items/runs)`)
  if (pipeBits.length) {
    parts.push(
      `With the equipment standing, ${pipeBits.join(' and ')} are installed to tie it together` +
        (c.pipeRuns.length || c.elecRuns.length
          ? ` (${c.pipeRuns.length} fluid/thermal run${c.pipeRuns.length === 1 ? '' : 's'} and ${c.elecRuns.length} power run${c.elecRuns.length === 1 ? '' : 's'} taken straight from the routed connection schedule)`
          : '') +
        '.',
    )
  }
  if (count('instruments-controls') > 0) {
    parts.push(
      `The ${count('instruments-controls')} field instruments, valves and the control + safety system go in next and are cabled back to the marshalling cabinets.`,
    )
  }
  parts.push(
    'Finally the plant is pre-commissioned — pressure- and leak-tested, flushed, and every loop checked — then commissioned: ' +
      'energised, functionally tested, brought up on first feed to a performance run, and handed over. This phased sequence is what the General Arrangement drawing is laid out to support.',
  )
  return parts.join(' ')
}
