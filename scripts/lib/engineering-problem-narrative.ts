/**
 * scripts/lib/engineering-problem-narrative.ts
 *
 * Increment "engineering-problem" (2026-06-10): a PURE, DETERMINISTIC helper
 * that states, in founder-readable language, the PHYSICS / ENGINEERING PROBLEM
 * the design must solve, then presents the auto-selected tools as the ANSWER to
 * each sub-problem -- carrying the SAME §-numbers used everywhere else in the
 * dossier. The new Part-1 section it feeds sits AFTER System Overview and BEFORE
 * the consolidated tool-by-tool engineering section.
 *
 * HARD CONSTRAINT (the whole point): the section is GATED BY THE TOOLS THAT
 * ACTUALLY RAN. It may ONLY name a sub-problem that has >=1 real tool, and may
 * ONLY cite §-numbers that genuinely fired. There is NO LLM -- re-running the
 * chain reproduces it byte-for-byte. The prose quality comes from an AUTHORED
 * per-domain library (DOMAIN_LIBRARY), assembled by the real run; the engine
 * fills a couple of {slots} from the brief / contract where present, and drops
 * the slot text entirely when the number is absent (never invents one).
 *
 * §-NUMBERS ARE NOT RECOMPUTED. The ordered tool list + its §-numbers come from
 * `buildEngineeringLedger(state)` (the single source of truth, shared with
 * tool-selection-narrative.ts + the consolidated render site). This helper walks
 * `ledger.order` (index 0 == §1), maps each tool_id to a DOMAIN KEY, groups the
 * real tools by domain, and emits one problem block per domain that has >=1 tool.
 *
 * Pure + jest-safe: imports ONLY the (pure, jest-safe) engineering-ledger
 * module; nothing from react-pdf or the orchestrator registry. Always returns a
 * well-formed object (never throws); an empty `problems` list when no
 * orchestrator tools ran.
 */

import { buildEngineeringLedger } from './engineering-ledger'

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

/** A §-numbered tool that answers a sub-problem (the reader-facing reference). */
export interface ProblemToolRef {
  /** Stable §-number (from the ledger; index 0 of ledger.order == §1). */
  num: number
  /** Human-readable tool name (from the ledger). */
  name: string
}

/** One sub-problem block: the domain title, the authored problem paragraph
 *  (with any {slots} filled from state), and the §-tools that solve it. */
export interface EngineeringProblem {
  /** Stable domain key (e.g. 'capture'). */
  domain: string
  /** Reader-facing title (e.g. "Capturing the target species"). */
  domainTitle: string
  /** Authored paragraph, slots filled (or dropped where the value is absent). */
  problemParagraph: string
  /** The §-tools that answer this sub-problem, in §-order. Always >=1. */
  tools: ProblemToolRef[]
}

export interface EngineeringProblemNarrative {
  /** Opening line naming ONLY the sub-problems actually present. */
  opening: string
  /** One block per domain that has >=1 real tool, in DOMAIN_ORDER. */
  problems: EngineeringProblem[]
}

// ---------------------------------------------------------------------------
// Tool -> domain mapping.
// ---------------------------------------------------------------------------
//
// An ORDERED list of (matcher, domain) rules; the FIRST rule whose matcher
// matches a tool_id wins. Order matters where a single id could match two
// substrings (e.g. `reaction:stoichiometry` + `reaction:feasibility-gibbs` must
// be tested BEFORE the broad `reaction:cstr` / `reactor:` reaction-sizing rule
// so they are never swallowed by it). Any tool_id matching NO rule falls through
// to the generic 'other' domain, which renders a plain named one-liner -- NEVER
// an invented story.

type DomainMatcher = (id: string) => boolean
const sub = (needle: string): DomainMatcher => (id) => id.includes(needle)
const rx = (re: RegExp): DomainMatcher => (id) => re.test(id)

interface DomainRule {
  match: DomainMatcher
  domain: string
}

/** The tool_id -> DOMAIN KEY rules (first match wins). Covers the CO2/process
 *  tool families called out in the spec; extend here for new tool families. */
const TOOL_DOMAIN: DomainRule[] = [
  { match: sub('absorption:column-htu-ntu'), domain: 'capture' },
  { match: sub('ht:ntu-heat-exchanger'), domain: 'regeneration' },
  { match: sub('dac:regeneration'), domain: 'regeneration' },
  { match: sub('reaction:stoichiometry'), domain: 'stoichiometry' },
  { match: sub('reaction:feasibility-gibbs'), domain: 'feasibility' },
  // reactor:* and reaction:cstr* -> the reaction-sizing domain. Ordered AFTER the
  // specific reaction:stoichiometry / reaction:feasibility-gibbs rules so those
  // two never get swallowed by the broad reaction:cstr* / reactor:* match.
  { match: rx(/(^|[:/])reactor:/), domain: 'reaction' },
  { match: sub('reaction:cstr'), domain: 'reaction' },
  { match: rx(/crystallis/), domain: 'crystallisation' },
  // dryer:* / dry* -> drying+separation. The leading-boundary dry* guard avoids
  // matching an unrelated id that merely contains "dry" mid-token.
  { match: sub('dryer'), domain: 'separation_drying' },
  { match: rx(/(^|[:/])dry/), domain: 'separation_drying' },
  { match: sub('fluids:pipe'), domain: 'fluid_transport' },
  { match: sub('process:pump'), domain: 'fluid_transport' },
  { match: sub('transformer'), domain: 'electrical' },
  { match: sub('cable'), domain: 'electrical' },
  { match: rx(/(^|[:/])electrical:/), domain: 'electrical' },
  { match: rx(/(^|[:/])control-systems:/), domain: 'control' },
  { match: rx(/(^|[:/])noise/), domain: 'safety' },
  { match: rx(/(^|[:/])lifecycle-co2:/), domain: 'lifecycle' },
  { match: rx(/(^|[:/])pressure-vessel:/), domain: 'pressure_containment' },
  { match: rx(/(^|[:/])coolprop:/), domain: 'fluid_properties' },
  { match: rx(/(^|[:/])agitation:/), domain: 'mixing' },
  { match: rx(/(^|[:/])mass-aggregator:/), domain: 'envelope' },
]

/** Resolve a tool_id to its DOMAIN KEY (first matching rule, else 'other'). */
export function domainForTool(toolId: string): string {
  const id = String(toolId || '')
  for (const rule of TOOL_DOMAIN) {
    if (rule.match(id)) return rule.domain
  }
  return 'other'
}

// ---------------------------------------------------------------------------
// Authored domain library (verbatim, per the spec). {slots} are filled
// deterministically from the brief / contract and DROPPED if the value is
// absent. 'other' carries NO paragraph (it renders a plain named one-liner).
// ---------------------------------------------------------------------------

interface DomainEntry {
  /** Reader-facing block title. */
  title: string
  /** Authored paragraph with optional {slot} placeholders. Empty for 'other'. */
  paragraph: string
}

const DOMAIN_LIBRARY: Record<string, DomainEntry> = {
  capture: {
    title: 'Capturing the target species',
    paragraph:
      'The target species is dilute in the gas stream and chemically stable, so it cannot be filtered or compressed out economically. The standard answer is to wash the gas with a solvent that chemically binds the species, in a tall packed column whose height and diameter set how much is caught before the gas leaves. The question is the column geometry and the solvent circulation needed to reach {capture_target} capture without flooding the packing.',
  },
  regeneration: {
    title: 'Regenerating the solvent',
    paragraph:
      'A loaded solvent is only useful if it can be stripped and reused, which takes heat to drive the captured species back off, plus a heat-exchanger to recover that heat against the returning lean solvent. The questions are the reboiler duty that regenerates the solvent and the exchanger area that keeps the energy penalty down.',
  },
  reaction: {
    title: 'Making the product (the reaction)',
    paragraph:
      'Turning the captured species into a stable, saleable product is a chemical reaction, and before any vessel is sized two things must hold: the reaction has to be thermodynamically favourable rather than pushed uphill, and the reactor must be large enough to give the reaction sufficient residence time at the chosen conditions.',
  },
  feasibility: {
    title: 'Confirming the reaction can proceed',
    paragraph:
      'Before committing to a reaction route, a thermodynamic check confirms it can proceed spontaneously at the design conditions rather than demanding an impractical energy input -- if the free-energy change is unfavourable, no amount of vessel sizing will make it work.',
  },
  stoichiometry: {
    title: 'Balancing feed and product',
    paragraph:
      'Every reaction fixes the ratio of feedstock consumed to product made. The mass balance turns the {output_target} production target into the exact feed rates and by-product streams the plant must carry, so nothing is over- or under-fed.',
  },
  crystallisation: {
    title: 'Recovering the product as a solid',
    paragraph:
      'Recovering a dissolved product as a solid means crystallising it out by concentrating the solution, which sets an evaporation duty and a vessel size.',
  },
  separation_drying: {
    title: 'Separating and drying the product',
    paragraph:
      'A reaction that precipitates a solid leaves a slurry, and the product is only saleable once the solid is separated from the liquid and dried to a stable moisture. The questions are the filter area for the separation and the heat duty to dry the cake.',
  },
  fluid_transport: {
    title: 'Moving liquids and gases',
    paragraph:
      'Every plant moves liquids and gases between its units. Each line must be wide enough to carry its flow without excessive pressure drop, and each pump must deliver that flow against the system head -- undersized lines waste energy, oversized ones waste capital.',
  },
  fluid_properties: {
    title: 'Knowing the fluid properties',
    paragraph:
      'Sizing the thermal and hydraulic equipment correctly needs real fluid properties (density, heat capacity, phase behaviour) at the operating conditions, rather than rule-of-thumb constants.',
  },
  mixing: {
    title: 'Keeping the slurry mixed',
    paragraph:
      'A reacting or suspended slurry must be kept homogeneous, which sets an agitator power and tip speed sufficient to suspend the solids without damaging them.',
  },
  electrical: {
    title: 'Powering the plant',
    paragraph:
      "The plant's motors, heaters and controls draw a combined electrical load that must be supplied at the correct voltages. The transformer and cabling are sized from that load so the supply is neither starved nor wastefully oversized.",
  },
  control: {
    title: 'Measuring and controlling the process',
    paragraph:
      'A continuous process must be measured and regulated to stay on-spec and safe -- flows, levels, temperatures and compositions are sensed and fed to a controller that holds the plant at its operating point and interlocks it on a fault.',
  },
  safety: {
    title: 'Making it safe and permittable',
    paragraph:
      'Hazardous materials, pressures and emissions demand zoning, integrity-rated protective functions and limits sized to the relevant codes, so the plant is safe to operate and able to be permitted.',
  },
  pressure_containment: {
    title: 'Containing the pressure',
    paragraph:
      'Any vessel holding pressure must have a wall thick enough to contain it with a code margin; the hoop-stress calculation sets that thickness and the vessel mass.',
  },
  lifecycle: {
    title: 'Proving it is net-positive',
    paragraph:
      "For a climate product the net benefit is only real once the plant's own operational and embodied emissions are subtracted from what it captures -- the lifecycle balance confirms the product is genuinely net-positive.",
  },
  envelope: {
    title: 'Fitting and standing up the plant',
    paragraph:
      'Finally the whole plant must fit a transportable, code-compliant envelope and carry its own mass; the mass-and-envelope budget confirms the assembled design ships and stands up.',
  },
  // 'other' carries no authored paragraph -- the render emits the tool name + a
  // one-line "supporting calculation" tag instead of any invented narrative.
  other: {
    title: 'Supporting calculations',
    paragraph: '',
  },
}

/** Sensible reading order for the problem blocks. Domains not listed here (a new
 *  domain added to TOOL_DOMAIN without a reorder) are appended after these in
 *  the order they first appear in the §-ordered tool list -- deterministic. */
const DOMAIN_ORDER: string[] = [
  'capture',
  'regeneration',
  'feasibility',
  'stoichiometry',
  'reaction',
  'crystallisation',
  'separation_drying',
  'mixing',
  'fluid_properties',
  'fluid_transport',
  'pressure_containment',
  'electrical',
  'control',
  'safety',
  'lifecycle',
  'envelope',
  'other',
]

/** Short reader-facing label for a domain, used in the opening line's list of
 *  sub-problems present (e.g. "capturing the target species, regenerating the
 *  solvent"). Lower-cased title. */
function openingLabelForDomain(domain: string): string {
  const t = DOMAIN_LIBRARY[domain]?.title ?? domain
  return t.charAt(0).toLowerCase() + t.slice(1)
}

// ---------------------------------------------------------------------------
// Slot extraction (deterministic; omit if absent).
// ---------------------------------------------------------------------------

/** A contract quantity's numeric value, or null. Quantities are stored as
 *  { value, unit, ... }; a bare scalar is also tolerated. */
function qtyNumber(entry: any): number | null {
  if (entry == null) return null
  const v = typeof entry === 'object' ? entry.value : entry
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function readContractQuantities(state: any): Record<string, any> {
  const q =
    state?.orchestratorContract?.quantities ??
    state?.engineeringContract?.quantities ??
    state?.orchestrator?.contract?.quantities
  return q && typeof q === 'object' ? q : {}
}

/** Format a number for prose: trim trailing zeros, group thousands. */
function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return ''
  const abs = Math.abs(n)
  let s: string
  if (abs !== 0 && abs < 1) s = n.toLocaleString('en-GB', { maximumFractionDigits: 3 })
  else if (abs < 100) s = n.toLocaleString('en-GB', { maximumFractionDigits: 2 })
  else s = n.toLocaleString('en-GB', { maximumFractionDigits: 0 })
  return s
}

/**
 * The capture-efficiency slot, as a reader-facing percentage string ("90%").
 * Sources, in order: the contract quantity `co2_capture_efficiency_pct` (already
 * a percent), then `capture_efficiency_at_design` (a 0-1 fraction -> x100), then
 * the brief's capture-efficiency metric. Returns '' when none is present (the
 * slot text is then dropped from the paragraph). The spec's "/ 90" note refers
 * to the brief's nominal capture-efficiency field -- we read its actual value.
 */
function captureTargetSlot(state: any): string {
  const q = readContractQuantities(state)
  const pct = qtyNumber(q['co2_capture_efficiency_pct'])
  if (pct != null && pct > 0) return `${fmtNum(pct)}%`
  const frac = qtyNumber(q['capture_efficiency_at_design'])
  if (frac != null && frac > 0) {
    const asPct = frac <= 1 ? frac * 100 : frac
    return `${fmtNum(asPct)}%`
  }
  // Brief fallback: scan target_performance metrics for a capture-efficiency key.
  const metrics: any[] = Array.isArray(state?.parsedBrief?.constraints?.target_performance?.metrics)
    ? state.parsedBrief.constraints.target_performance.metrics
    : []
  for (const m of metrics) {
    const key = String(m?.key_metric ?? '').toLowerCase()
    if (key.includes('capture') && (key.includes('effic') || key.includes('_pct'))) {
      const n = Number(m?.value)
      if (Number.isFinite(n) && n > 0) {
        const asPct = n <= 1 ? n * 100 : n
        return `${fmtNum(asPct)}%`
      }
    }
  }
  return ''
}

/**
 * The output-target slot: the brief's PRIMARY product rate + unit
 * ("1 t/day"). Source: the brief's target_performance.key_metric value+unit
 * (the headline scale metric), falling back to the first `category: 'scale'`
 * metric. Returns '' when none is present.
 */
function outputTargetSlot(state: any): string {
  const tp = state?.parsedBrief?.constraints?.target_performance
  if (tp && typeof tp === 'object') {
    const v = Number(tp.value)
    const unit = String(tp.unit ?? '').trim()
    if (Number.isFinite(v) && v > 0 && unit) return `${fmtNum(v)} ${unit}`
    const metrics: any[] = Array.isArray(tp.metrics) ? tp.metrics : []
    const scale = metrics.find((m) => String(m?.category ?? '') === 'scale') ?? metrics[0]
    if (scale) {
      const sv = Number(scale.value)
      const su = String(scale.unit ?? '').trim()
      if (Number.isFinite(sv) && sv > 0 && su) return `${fmtNum(sv)} ${su}`
    }
  }
  return ''
}

/** Fill the {slots} in a paragraph from the resolved slot map, DROPPING any
 *  sentence fragment cleanly when a slot is empty. The library was authored so
 *  each {slot} sits inside " to reach {capture_target} capture" / "turns the
 *  {output_target} production target" -- a simple, readable substitution.
 *  When the value is empty we substitute a neutral phrase so the sentence still
 *  reads grammatically (never a dangling "{slot}" or double space). */
function fillSlots(paragraph: string, slots: Record<string, string>): string {
  let out = paragraph
  // capture_target: "...needed to reach {capture_target} capture without..."
  if (out.includes('{capture_target}')) {
    out = slots.capture_target
      ? out.replace('{capture_target}', slots.capture_target)
      : out.replace(' to reach {capture_target} capture', ' to reach the target capture')
  }
  // output_target: "...turns the {output_target} production target into..."
  if (out.includes('{output_target}')) {
    out = slots.output_target
      ? out.replace('{output_target}', slots.output_target)
      : out.replace('the {output_target} production target', 'the production target')
  }
  // Belt-and-braces: strip any UNHANDLED {placeholder} so a stray token never
  // reaches the reader, and collapse any double space the drop may have left.
  out = out.replace(/\{[a-z_]+\}/gi, '').replace(/\s{2,}/g, ' ').trim()
  return out
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

/**
 * Build the deterministic engineering-problem narrative from a chain `state`.
 * Walks the REAL §-ordered tool list (from the shared ledger -- §-numbers are
 * NOT recomputed), groups the tools by domain, and emits one problem block per
 * domain that has >=1 tool, in DOMAIN_ORDER. The opening line lists ONLY the
 * sub-problems present. Always returns a well-formed object (never throws);
 * `{ opening: '', problems: [] }` when no orchestrator tools ran.
 */
export function buildEngineeringProblemNarrative(state: any): EngineeringProblemNarrative {
  const empty: EngineeringProblemNarrative = { opening: '', problems: [] }
  try {
    const ledger = buildEngineeringLedger(state)
    if (!ledger || !Array.isArray(ledger.order) || ledger.order.length === 0) return empty

    // Resolve the two optional slots ONCE (shared across blocks).
    const slots: Record<string, string> = {
      capture_target: captureTargetSlot(state),
      output_target: outputTargetSlot(state),
    }

    // Group the REAL §-tools by domain, preserving §-order within each group.
    // `firstSeen` records the index a domain first appears at, so domains not in
    // DOMAIN_ORDER still sort deterministically (by first appearance).
    const byDomain = new Map<string, ProblemToolRef[]>()
    const firstSeen = new Map<string, number>()
    ledger.order.forEach((id, i) => {
      const entry = ledger.byToolId.get(id)
      // §-number from the ledger (authoritative); fall back to position+1 only if
      // the entry is somehow missing (defensive -- order + byToolId are built
      // together, so this never diverges on a real run).
      const num = entry?.num ?? i + 1
      const name = String(entry?.name ?? id)
      const domain = domainForTool(id)
      if (!byDomain.has(domain)) byDomain.set(domain, [])
      byDomain.get(domain)!.push({ num, name })
      if (!firstSeen.has(domain)) firstSeen.set(domain, i)
    })

    // Order the domains: DOMAIN_ORDER first (only those present), then any
    // leftover present-but-unlisted domain by first appearance.
    const orderedDomains: string[] = []
    for (const d of DOMAIN_ORDER) {
      if (byDomain.has(d)) orderedDomains.push(d)
    }
    const leftover = Array.from(byDomain.keys())
      .filter((d) => !orderedDomains.includes(d))
      .sort((a, b) => (firstSeen.get(a)! - firstSeen.get(b)!))
    for (const d of leftover) orderedDomains.push(d)

    const problems: EngineeringProblem[] = []
    for (const domain of orderedDomains) {
      const tools = (byDomain.get(domain) ?? []).slice().sort((a, b) => a.num - b.num)
      if (tools.length === 0) continue // gate: a domain with no real tool never appears
      const lib = DOMAIN_LIBRARY[domain]
      const domainTitle = lib?.title ?? domain
      const problemParagraph = lib?.paragraph ? fillSlots(lib.paragraph, slots) : ''
      problems.push({ domain, domainTitle, problemParagraph, tools })
    }

    if (problems.length === 0) return empty

    // Opening line: name ONLY the sub-problems present, in the same order.
    // 'other' is excluded from the opening enumeration (it has no real
    // sub-problem narrative -- it is a catch-all for supporting calculations).
    const namedDomains = problems.filter((p) => p.domain !== 'other').map((p) => openingLabelForDomain(p.domain))
    const opening = buildOpeningLine(namedDomains)

    return { opening, problems }
  } catch {
    return empty
  }
}

/** Assemble the opening line from the present sub-problem labels. Deterministic;
 *  degrades gracefully for 0/1/2 problems. */
function buildOpeningLine(labels: string[]): string {
  if (labels.length === 0) {
    return 'The engine selected the supporting calculations below; each is matched to the §-numbered tool that produced it.'
  }
  const list =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join('; ')}; and ${labels[labels.length - 1]}`
  const count = labels.length === 1 ? 'one core engineering problem' : `${labels.length} core engineering problems`
  return `To build this plant the design has to solve ${count} -- ${list}. Each problem below is matched to the §-numbered tool the engine selected to answer it; the §-numbers are the same ones used throughout the rest of this report.`
}
