/**
 * scripts/lib/orchestrator/envelope-vector.ts
 *
 * E1 — UNIVERSAL ENVELOPE VECTOR (tier b) + LLM-ASSISTED SCALE-METRIC
 * INFERENCE (tier c). Kills wall W1: envelope detection previously failed
 * hard (chain exit 7) for any brief that lacked the per-class regex's
 * expected scale metric (e.g. a payload-led HAPS brief with no wingspan).
 *
 * THE 3-TIER CASCADE (ANVIL-UNIVERSAL-LOOP-PLAN.md §E1, council-revised):
 *   (a) REGISTERED-CLASS EXACT DETECTORS — envelope.ts, UNTOUCHED. Runs
 *       first; zero behaviour change when it succeeds (the no-regression
 *       contract, proven on all 8 briefs-rerun/*.md — see
 *       envelope-vector.test.ts + envelope-vector.baseline.json).
 *   (b) UNIVERSAL ENVELOPE VECTOR — this module. Deterministic sweep of
 *       the parsed brief for EVERY recognised unit-family quantity into a
 *       typed vector (physical_dims / capacities / mass / environment /
 *       mobility_class / contradictions / confidence / provenance spans),
 *       with NEGATIVE-EXTRACTION rules (below). Feeds either (i) an
 *       injection trial that re-runs the registered class detector with a
 *       brief-extracted quantity the class regexes missed, or (ii) a
 *       class-generic envelope (scale_tier 'generic') so the orchestrator
 *       proceeds instead of exiting 7.
 *   (c) LLM-ASSISTED INFERENCE — one cheap OpenRouter call
 *       (google/gemini-3.5-flash) proposing the MISSING scale metric with
 *       provenance=inferred(confidence). Per governance G4 this is a
 *       PROPOSAL: it is recorded in the vector with provenance +
 *       confidence; below INFERENCE_CONSUME_THRESHOLD it is flagged in
 *       contradictions and NOT consumed.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PRIMARY-METRIC DECISION RULE (deterministic — a real algorithm, council
 * demanded this be written down):
 *
 *   step 1 — extract every unit-family quantity from (in source-precedence
 *            order) target_performance.metrics[] > target_performance >
 *            structured fields (max_mass_kg, max_dimensions_mm) >
 *            additional_constraints[].description > product_description.
 *            Apply the NEGATIVE-EXTRACTION rules; only survivors compete.
 *   step 2 — compute mobility_class from a keyword table (first match wins,
 *            fixed order: orbital > marine > airborne > ground_vehicle >
 *            portable > fixed_plant > unknown; marine outranks airborne
 *            because submerged devices "fly" too) and rated_output_present
 *            (TRUE iff a surviving POWER/ENERGY/THROUGHPUT quantity has a
 *            scale qualifier matching RATED_OUTPUT_RE in its window —
 *            "rated electrical output", "at the generator terminals",
 *            "nameplate", "primary output target", …).
 *   step 3 — choose the preferred category:
 *            CAPACITY-PRIMARY  iff rated_output_present === true
 *                              OR mobility_class ∈ {fixed_plant, unknown}
 *                              (plant/process classes size by what they
 *                              produce; a tidal kite that states a rated
 *                              500 kW output is capacity-primary even
 *                              though it is a marine platform — PURPOSE
 *                              TRUMPS PACKAGING);
 *            GEOMETRY-PRIMARY  otherwise (vehicles/platforms whose function
 *                              is to carry/host a payload size by geometry).
 *   step 4 — rank surviving SCALE-ELIGIBLE quantities within the category:
 *            capacity order:  power_kw > energy_kwh > throughput_tpy >
 *                             gas_nm3hr > flow_lpd > co2_tpy > volume_l >
 *                             area_m2 > count families;
 *            geometry order:  wingspan/span > diameter/rotor > length >
 *                             width > height > other length keys.
 *            (Mission-envelope lengths — altitude, ceiling, coverage
 *            radius, tether, range, endurance — are recorded in the vector
 *            but marked scale_eligible=false: they NEVER rank and are
 *            NEVER injected. This is the guard that stops "18-20 km
 *            altitude" masquerading as a 20,000 m wingspan.)
 *   step 5 — tie-break within the same family (total order, no ambiguity):
 *            (a) higher source precedence (step-1 order);
 *            (b) scale-qualified (rated/nameplate/nominal/primary/output/
 *                capacity/usable/installed/continuous) beats unqualified;
 *            (c) earliest mention in its source text;
 *            (d) lexicographically smaller key.
 *   step 6 — if the preferred category is empty → try the other category →
 *            then device mass → else primary=null (vector still non-null;
 *            tier (c) may propose the missing metric).
 *
 * NEGATIVE-EXTRACTION RULES (rejected, recorded in vector.rejected):
 *   R1 analogue_reference — number preceded (≤60 chars) by "similar to /
 *      comparable to / like a / equivalent to / versus / vs. / compared
 *      to|with / competitor / benchmark / reference design / analogous /
 *      rivalling". "similar to a 60 m turbine" never yields 60 m.
 *   R2 context_binding — number preceded (≤30 chars) by "for a|an|the /
 *      serving / supporting / powering / backup for / part of / within a /
 *      inside a / feeding". "50 kW backup generator for a 10 MW server
 *      farm" keeps 50 kW and rejects 10 MW. DETERMINISTIC — the semantic-
 *      binding case is handled by negative-extraction, not the LLM tier.
 *   R3 packaging_shipping — mass/length/area whose window (±45 chars)
 *      mentions packaging/crate/pallet/shipping/ships as/ships in/transit/
 *      freight. Shipping dims are not product scale.
 *   R4 range_second_value — in "X–Y unit" / "X to Y unit" the SECOND bound
 *      is rejected; the FIRST bound is recorded (flagged is_range_bound).
 *   R5 derate_second_value — a quantity immediately followed by "@ <temp>"
 *      (derate-table notation) is rejected.
 *   R6 composite_unit — unit followed by "/" or " per " (kWh/kg, m/s,
 *      £/kW…) never matches a bare family; recognised rate families
 *      (t/yr, kg/week, L/day, Nm³/hr) are extracted FIRST as throughput.
 *   R7 currency — number preceded by £/$/€ is never a quantity.
 *
 * INFERENCE_CONSUME_THRESHOLD = 0.5: an LLM proposal with confidence below
 * this is recorded + flagged in vector.contradictions and NOT consumed
 * (G4 anti-error-laundering: inferred values are proposals).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CHAIN-ADOPTION TRACKER NOTE (E1 follow-up — do NOT wire here):
 *   serial-design-chain-v2.tsx carries foreign uncommitted edits, so tier
 *   (c) is NOT called from the chain yet. The single integration function
 *   is `resolveEnvelopeUniversal(constraints)` (async). Adoption = replace
 *   the chain's pre-orchestrator envelope probe (or let orchestrate.ts
 *   call it ahead of detectEnvelope) with:
 *       const { envelope, vector, tier, inference } =
 *         await resolveEnvelopeUniversal(orchParsedConstraints)
 *   and persist `vector` + `inference` into state for G4 provenance
 *   badges. Until then the SYNC tiers (a)+(b) already run inside
 *   envelope.ts detectEnvelope, so the chain no longer exits 7 on a
 *   metric-MISS; tier (c) upgrades scale_tier 'generic' to a real tier.
 *   Harness wiring: invariants live in envelope-vector.test.ts (standalone,
 *   `npx tsx scripts/lib/orchestrator/envelope-vector.test.ts`) because
 *   regression-harness.tsx is dirty in the E0 agent's workstream — port
 *   them into the harness when it stabilises.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { BriefEnvelope, ParsedConstraints } from './types'
import {
  POWER_KW,
  ENERGY_KWH,
  VOLUME_L,
  MASS_KG,
  LENGTH_M,
  AREA_M2,
  HYDROGEN_RATE,
  CO2_CAPTURE_TPY,
  QUBIT_COUNT,
  CUBESAT_U,
  ELEMENT_COUNT,
  convertToCanonical,
  asArray,
  type UnitFamily,
} from './constraint-normaliser'
import {
  detectEnvelopeStrict,
  registeredClassOf,
  detectRegisteredWithInjectedMetric,
  classGenericEnvelope,
} from './envelope'

// ---------------------------------------------------------------------------
// TYPES — G6: every quantity is (value, unit) typed; never a bare number.
// ---------------------------------------------------------------------------

export type QtyFamilyId =
  | 'power_kw'
  | 'energy_kwh'
  | 'mass_kg'
  | 'length_m'
  | 'area_m2'
  | 'volume_l'
  | 'throughput_tpy' // mass throughput, canonical tonnes/year
  | 'flow_lpd'       // volume throughput, canonical litres/day
  | 'gas_nm3hr'      // gas production/consumption rate (H2, biogas)
  | 'co2_tpy'
  | 'qubit'
  | 'cubesat_u'
  | 'element_count'

export type QtySource =
  | 'metrics'                 // target_performance.metrics[] (structured)
  | 'target_performance'      // target_performance {value, unit}
  | 'structured_field'        // max_mass_kg / max_dimensions_mm
  | 'additional_constraints'
  | 'product_description'
  | 'llm_inference'

/** Source precedence for tie-break step 5(a). Lower = stronger. */
const SOURCE_RANK: Record<QtySource, number> = {
  metrics: 0,
  target_performance: 1,
  structured_field: 2,
  additional_constraints: 3,
  product_description: 4,
  llm_inference: 5,
}

export interface TypedQty {
  /** Semantic key, e.g. 'wingspan_m', 'rated_power_kw', 'yield_tpy'. */
  key: string
  family: QtyFamilyId
  /** Value in the family's canonical unit. */
  value: number
  /** Canonical unit string (G6: value+unit travel together). */
  unit: string
  /** The raw (value, unit) as written in the brief. */
  raw: { value: number; unit: string }
  /** Scale qualifier token found in the window, if any. */
  qualifier: string | null
  provenance: 'brief' | 'inferred'
  confidence: number
  source: QtySource
  /** Provenance span — the text excerpt this quantity was read from. */
  excerpt: string
  /** False for mission-envelope quantities (altitude, coverage radius,
   *  tether, endurance, payload) that must never become the scale metric. */
  scale_eligible: boolean
  /** Position of the match in its source text (tie-break 5c). */
  char_index: number
  /** True when the value is the FIRST bound of a stated range. */
  is_range_bound?: boolean
}

export type RejectReason =
  | 'analogue_reference'
  | 'context_binding'
  | 'packaging_shipping'
  | 'range_second_value'
  | 'derate_second_value'
  | 'composite_unit'
  | 'currency'
  | 'below_confidence_threshold'

export interface RejectedQty {
  excerpt: string
  reason: RejectReason
  value: number
  unit: string
}

export type MobilityClass =
  | 'orbital_platform'
  | 'airborne_platform'
  | 'marine_platform'
  | 'ground_vehicle'
  | 'portable_device'
  | 'fixed_plant'
  | 'unknown'

export interface EnvelopeVector {
  physical_dims: TypedQty[]
  capacities: TypedQty[]
  /** Best DEVICE-mass candidate (mtow / device / system / dry mass /
   *  structured max_mass_kg). Payload mass goes to other_quantities. */
  mass: TypedQty | null
  other_quantities: TypedQty[]
  environment: {
    temp_min_c?: number
    temp_max_c?: number
    medium: 'air' | 'seawater' | 'freshwater' | 'vacuum' | 'stratosphere' | 'indoor' | 'unknown'
  }
  mobility_class: MobilityClass
  product_function: 'produces_output' | 'carries_payload' | 'unknown'
  /** The selected primary scale metric per the documented decision rule. */
  primary: TypedQty | null
  contradictions: string[]
  rejected: RejectedQty[]
  /** Overall confidence = primary's confidence, or 0.2 when primary null. */
  confidence: number
  provenance_spans: Array<{ key: string; source: QtySource; excerpt: string }>
}

export interface InferredScaleMetric {
  metric_key: string
  value: number
  unit: string
  confidence: number
  rationale: string
  /** True when confidence ≥ INFERENCE_CONSUME_THRESHOLD and the injected
   *  metric produced a valid registered-class envelope. */
  consumed: boolean
  /** OpenRouter usage for spend reporting (USD credits when available). */
  llm_cost_usd: number | null
  model: string
}

export interface UniversalEnvelopeResolution {
  envelope: BriefEnvelope | null
  vector: EnvelopeVector
  /** Which cascade tier produced the envelope:
   *  'a' registered exact detector; 'b' deterministic vector (injection
   *  trial or class-generic/generic envelope); 'c' LLM-assisted. */
  tier: 'a' | 'b' | 'c'
  inference: InferredScaleMetric | null
}

/** G4: an inferred proposal below this confidence is flagged, not consumed. */
export const INFERENCE_CONSUME_THRESHOLD = 0.5

// ---------------------------------------------------------------------------
// UNIT TABLES — single-unit alternation, longest token first so 'kwh' is
// never eaten by 'kw' nor 'kw' by 'w'. Classified by probing the 12 shared
// unit families from constraint-normaliser.ts.
// ---------------------------------------------------------------------------

const NUM = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)'

/** Probe order matters: area before length ('m2' vs 'm'), energy before
 *  power ('kwh' vs 'kw' — alternation already prevents mis-tokenising,
 *  this is belt-and-braces for classification). */
const FAMILY_PROBES: Array<{ id: QtyFamilyId; family: UnitFamily }> = [
  { id: 'energy_kwh', family: ENERGY_KWH },
  { id: 'power_kw', family: POWER_KW },
  { id: 'area_m2', family: AREA_M2 },
  { id: 'mass_kg', family: MASS_KG },
  { id: 'length_m', family: LENGTH_M },
  { id: 'volume_l', family: VOLUME_L },
  { id: 'gas_nm3hr', family: HYDROGEN_RATE },
  { id: 'co2_tpy', family: CO2_CAPTURE_TPY },
  { id: 'qubit', family: QUBIT_COUNT },
  { id: 'cubesat_u', family: CUBESAT_U },
  { id: 'element_count', family: ELEMENT_COUNT },
]

/** Extra power-unit spellings the shared family lacks (kWth etc.). */
const POWER_EXTRA: Record<string, number> = { kwth: 1, mwth: 1000, kva: 1, mva: 1000 }

const UNIT_ALTERNATION = [
  // energy
  'kwh', 'mwh', 'gwh', 'wh',
  // power (incl. thermal/electrical suffixes)
  'kwe', 'kwth', 'kwt', 'mwe', 'mwth', 'mwt', 'kva', 'mva', 'kilowatts?', 'megawatts?', 'gigawatts?', 'kw', 'mw', 'gw', 'watts?',
  // area before length
  'm2', 'm²', 'sqm', 'sq\\s?m', 'ft2', 'ft²', 'sqft', 'hectares?', 'ha',
  // mass
  'kilograms?', 'kg', 'tonnes?', 'tons?', 'grams?', 'lbs?',
  // length
  'millimetres?', 'centimetres?', 'kilometres?', 'kilometers?', 'metres?', 'meters?', 'mm', 'cm', 'km', 'ft', 'feet', 'inches', 'inch',
  // volume
  'litres?', 'liters?', 'ml', 'm3', 'm³',
  // counts
  'qubits?', 'elements?',
  // single letters LAST
  'm', 'l', 't', 'w', 'u',
].join('|')

const SINGLE_QTY_RE = new RegExp(`${NUM}\\s*-?\\s*(${UNIT_ALTERNATION})\\b`, 'gi')

/** Rate families, extracted FIRST (R6) so "500 kg/week" is throughput, not mass. */
const MASS_RATE_RE = new RegExp(
  `${NUM}\\s*(t|tonnes?|tons?|kg|kilograms?)\\s*(?:\\/|\\s+per\\s+)\\s*(yr|year|annum|a|wk|week|day|d|hr|hour|h)\\b`,
  'gi',
)
const VOL_RATE_RE = new RegExp(
  `${NUM}\\s*(l|litres?|liters?|m3|m³)\\s*(?:\\/|\\s+per\\s+)\\s*(yr|year|annum|day|d|hr|hour|h)\\b`,
  'gi',
)
const GAS_RATE_RE = new RegExp(`${NUM}\\s*(nm3|nm³)\\s*\\/?\\s*(?:per\\s+)?(hr?|hour)\\b`, 'gi')

/** mass-rate → tonnes/year multipliers, keyed `${massUnit}|${timeUnit}`. */
function massRateToTpy(value: number, massUnit: string, timeUnit: string): number {
  const mu = massUnit.toLowerCase()
  const tu = timeUnit.toLowerCase()
  const tonnes = mu.startsWith('t') ? value : value / 1000 // kg → t
  const perYear: Record<string, number> = { yr: 1, year: 1, annum: 1, a: 1, wk: 52, week: 52, day: 365, d: 365, hr: 8760, hour: 8760, h: 8760 }
  return tonnes * (perYear[tu] ?? 1)
}
function volRateToLpd(value: number, volUnit: string, timeUnit: string): number {
  const vu = volUnit.toLowerCase()
  const litres = vu.startsWith('m3') || vu.startsWith('m³') ? value * 1000 : vu === 'ml' ? value / 1000 : value
  const perDay: Record<string, number> = { day: 1, d: 1, hr: 1 / 24, hour: 1 / 24, h: 1 / 24, yr: 365, year: 365, annum: 365 }
  // value per X → per day: divide for slower-than-day, multiply for faster
  const tu = timeUnit.toLowerCase()
  if (tu === 'yr' || tu === 'year' || tu === 'annum') return litres / 365
  if (tu === 'hr' || tu === 'hour' || tu === 'h') return litres * 24
  return litres * (perDay[tu] === undefined ? 1 : 1)
}

// ---------------------------------------------------------------------------
// NEGATIVE-EXTRACTION WINDOWS (R1-R7)
// ---------------------------------------------------------------------------

const ANALOGUE_RE = /(?:similar\s+to|comparable\s+to|analogous\s+to|equivalent\s+to|like\s+(?:a|an|the)|versus|vs\.?|compared\s+(?:to|with)|competitor|benchmark|reference\s+(?:design|aircraft|product|turbine|plant|device)|rival(?:ling|ing)?|as\s+(?:big|large|long|heavy)\s+as)\s*[^.]{0,40}$/i
const CONTEXT_BINDING_RE = /(?:\bfor\s+(?:a|an|the)|\bserving\s+(?:a|an|the)?|\bsupporting\s+(?:a|an|the)?|\bpowering\s+(?:a|an|the)?|\bbackup\s+for|\bpart\s+of\s+(?:a|an|the)|\bwithin\s+(?:a|an|the)|\binside\s+(?:a|an|the)|\bfeeding\s+(?:a|an|the)?)\s*$/i
const PACKAGING_RE = /packag|crate|pallet|shipping|ships?\s+(?:as|in)|transit|freight|flat-?pack/i
const RANGE_PREFIX_RE = /(\d[\d,]*(?:\.\d+)?)\s*(?:-|–|—|to)\s*$/
const CURRENCY_PREFIX_RE = /[£$€]\s*$/
const QUALIFIER_RE = /\b(rated|nameplate|nominal|primary|output|capacity|usable|installed|continuous|working)\b/i
const RATED_OUTPUT_RE = /\b(rated|nameplate|electrical\s+output|net\s+output|primary\s+output|at\s+the\s+generator\s+terminals|power\s+output|output\s+target)\b/i

/** Mission-envelope concepts: recorded, never scale-eligible (step 4 guard). */
const SCALE_DENY_CONCEPTS = new Set([
  'altitude', 'ceiling', 'coverage', 'radius', 'tether', 'endurance', 'range',
  'payload', 'salinity', 'temperature', 'design_life', 'cut_in', 'survival',
])

/** Ordered concept keywords for key derivation (first match wins). */
const CONCEPTS: Array<{ re: RegExp; concept: string }> = [
  { re: /wing\s?span|wingspan/i, concept: 'wingspan' },
  { re: /\bspan\b/i, concept: 'span' },
  { re: /rotor/i, concept: 'rotor_diameter' },
  { re: /diameter/i, concept: 'diameter' },
  { re: /payload/i, concept: 'payload' },
  { re: /altitude|ceiling/i, concept: 'altitude' },
  { re: /coverage|service\s+radius/i, concept: 'coverage' },
  { re: /radius/i, concept: 'radius' },
  { re: /tether/i, concept: 'tether' },
  { re: /endurance/i, concept: 'endurance' },
  { re: /cut-?in/i, concept: 'cut_in' },
  { re: /survival/i, concept: 'survival' },
  { re: /design\s+life|service\s+life/i, concept: 'design_life' },
  { re: /depth/i, concept: 'depth' },
  { re: /mtow|take-?off\s+(?:weight|mass)|all-?up\s+weight/i, concept: 'mtow' },
  { re: /dry\s+(?:mass|weight)|device\s+mass|system\s+(?:mass|weight)|total\s+(?:mass|weight)|gross\s+mass/i, concept: 'device_mass' },
  { re: /canopy/i, concept: 'canopy_area' },
  { re: /shelf/i, concept: 'shelf_area' },
  { re: /growing\s+area|cultivation/i, concept: 'growing_area' },
  { re: /substrate/i, concept: 'substrate' },
  { re: /yield|fresh\s+mushrooms|harvest/i, concept: 'yield' },
  { re: /digester|reactor|fermenter|vessel|tank/i, concept: 'vessel_volume' },
  { re: /heat\s+recover|thermal/i, concept: 'thermal' },
  { re: /electrical|generator|export|rated/i, concept: 'rated' },
  { re: /capacity/i, concept: 'capacity' },
  { re: /mass|weight/i, concept: 'mass' },
]

// ---------------------------------------------------------------------------
// MOBILITY / FUNCTION / ENVIRONMENT — deterministic keyword tables.
// ---------------------------------------------------------------------------

const MOBILITY_TABLE: Array<{ re: RegExp; cls: MobilityClass }> = [
  { re: /satellite|orbit(al)?|spacecraft|cubesat|interplanetary|deep[\s-]?space/i, cls: 'orbital_platform' },
  // Marine BEFORE airborne: a tidal kite "flies" a figure-of-eight underwater —
  // marine immersion keywords are the stronger signal than flight verbs.
  { re: /subsea|underwater|auv|uuv|rov|marine|tidal|seawater|hydrofoil|vessel\b.*\bsea|submersible/i, cls: 'marine_platform' },
  { re: /aircraft|uav|drone|haps|stratospher|evtol|fixed[\s-]?wing|flight|aerial|airframe|pseudo[\s-]?satellite/i, cls: 'airborne_platform' },
  { re: /\be-?bike\b|humanoid|biped|rover|wheeled|vehicle\b/i, cls: 'ground_vehicle' },
  { re: /wearable|handheld|man-?portable|patch|implant/i, cls: 'portable_device' },
  { re: /plant|digester|reactor|facility|skid|farm|factory|machine|station|charger|inverter|electrolyser|electrolyzer|server|rack|storage|turbine|generator|cryostat|ventilator|dialysis|printer/i, cls: 'fixed_plant' },
]

function detectMobility(text: string): MobilityClass {
  for (const { re, cls } of MOBILITY_TABLE) if (re.test(text)) return cls
  return 'unknown'
}

function detectMedium(text: string): EnvelopeVector['environment']['medium'] {
  if (/seawater|subsea|salinity|marine|tidal/i.test(text)) return 'seawater'
  if (/freshwater|river|lake/i.test(text)) return 'freshwater'
  if (/stratospher|high[\s-]?altitude/i.test(text)) return 'stratosphere'
  if (/orbit|vacuum|deep[\s-]?space|satellite/i.test(text)) return 'vacuum'
  if (/indoor|warehouse|grow(ing)?\s+room|chamber|building\s+shell/i.test(text)) return 'indoor'
  return 'air'
}

// ---------------------------------------------------------------------------
// TEXT SWEEP
// ---------------------------------------------------------------------------

interface SweepAccumulator {
  qtys: TypedQty[]
  rejected: RejectedQty[]
}

function classifyUnit(rawUnit: string, value: number): { id: QtyFamilyId; canon: number; canonUnit: string } | null {
  const u = rawUnit.toLowerCase().replace(/\s+/g, '')
  // power extras first (kwth / mwth / kva — not in shared family)
  if (POWER_EXTRA[u] !== undefined) return { id: 'power_kw', canon: value * POWER_EXTRA[u], canonUnit: 'kw' }
  for (const probe of FAMILY_PROBES) {
    const canon = convertToCanonical(value, u, probe.family)
    if (canon !== null) return { id: probe.id, canon, canonUnit: probe.family.canonical }
  }
  return null
}

function deriveConcept(window: string): string | null {
  for (const { re, concept } of CONCEPTS) if (re.test(window)) return concept
  return null
}

/** Sweep one text source for quantities, applying R1-R7. */
function sweepText(text: string, source: QtySource, acc: SweepAccumulator): void {
  if (!text) return
  const consumed: Array<[number, number]> = []
  const overlaps = (i: number, j: number) => consumed.some(([a, b]) => i < b && j > a)

  const record = (
    matchIndex: number,
    matchLen: number,
    rawValue: number,
    rawUnit: string,
    familyOverride?: { id: QtyFamilyId; canon: number; canonUnit: string },
    isRangeBound?: boolean,
  ): void => {
    const before = text.slice(Math.max(0, matchIndex - 70), matchIndex)
    const after = text.slice(matchIndex + matchLen, matchIndex + matchLen + 45)
    const excerpt = (before.slice(-45) + text.slice(matchIndex, matchIndex + matchLen) + after).trim()

    // R7 currency
    if (CURRENCY_PREFIX_RE.test(before.slice(-4))) {
      acc.rejected.push({ excerpt, reason: 'currency', value: rawValue, unit: rawUnit })
      return
    }
    // R1 analogue
    if (ANALOGUE_RE.test(before.slice(-60))) {
      acc.rejected.push({ excerpt, reason: 'analogue_reference', value: rawValue, unit: rawUnit })
      return
    }
    // R2 context binding
    if (CONTEXT_BINDING_RE.test(before.slice(-30))) {
      acc.rejected.push({ excerpt, reason: 'context_binding', value: rawValue, unit: rawUnit })
      return
    }
    // R5 derate second value
    if (/^\s*@/.test(after)) {
      acc.rejected.push({ excerpt, reason: 'derate_second_value', value: rawValue, unit: rawUnit })
      return
    }

    const cls = familyOverride ?? classifyUnit(rawUnit, rawValue)
    if (!cls) return

    // R3 packaging (mass/length/area only)
    if ((cls.id === 'mass_kg' || cls.id === 'length_m' || cls.id === 'area_m2') && PACKAGING_RE.test(before.slice(-45) + ' ' + after)) {
      acc.rejected.push({ excerpt, reason: 'packaging_shipping', value: rawValue, unit: rawUnit })
      return
    }

    const windowText = before.slice(-55) + ' ' + after
    const concept = deriveConcept(windowText)
    const qualMatch = before.slice(-55).match(QUALIFIER_RE)
    const key = concept ? `${concept}_${cls.canonUnit}` : `${cls.id}`
    const scaleEligible = concept === null || !SCALE_DENY_CONCEPTS.has(concept)

    acc.qtys.push({
      key,
      family: cls.id,
      value: cls.canon,
      unit: cls.canonUnit,
      raw: { value: rawValue, unit: rawUnit },
      qualifier: qualMatch ? qualMatch[1].toLowerCase() : null,
      provenance: 'brief',
      confidence: qualMatch ? 0.85 : 0.7,
      source,
      excerpt,
      scale_eligible: scaleEligible,
      char_index: matchIndex,
      is_range_bound: isRangeBound || undefined,
    })
  }

  // Pass 1 — rate families (R6 carve-out)
  for (const m of text.matchAll(MASS_RATE_RE)) {
    const i = m.index ?? 0
    const v = parseFloat(m[1].replace(/,/g, ''))
    if (!Number.isFinite(v) || v <= 0) continue
    record(i, m[0].length, v, `${m[2]}/${m[3]}`, { id: 'throughput_tpy', canon: massRateToTpy(v, m[2], m[3]), canonUnit: 'tpy' })
    consumed.push([i, i + m[0].length])
  }
  for (const m of text.matchAll(VOL_RATE_RE)) {
    const i = m.index ?? 0
    if (overlaps(i, i + m[0].length)) continue
    const v = parseFloat(m[1].replace(/,/g, ''))
    if (!Number.isFinite(v) || v <= 0) continue
    record(i, m[0].length, v, `${m[2]}/${m[3]}`, { id: 'flow_lpd', canon: volRateToLpd(v, m[2], m[3]), canonUnit: 'l/day' })
    consumed.push([i, i + m[0].length])
  }
  for (const m of text.matchAll(GAS_RATE_RE)) {
    const i = m.index ?? 0
    if (overlaps(i, i + m[0].length)) continue
    const v = parseFloat(m[1].replace(/,/g, ''))
    if (!Number.isFinite(v) || v <= 0) continue
    record(i, m[0].length, v, 'nm3/hr', { id: 'gas_nm3hr', canon: v, canonUnit: 'nm3hr' })
    consumed.push([i, i + m[0].length])
  }

  // Pass 2 — single-unit quantities
  for (const m of text.matchAll(SINGLE_QTY_RE)) {
    const i = m.index ?? 0
    if (overlaps(i, i + m[0].length)) continue
    const v = parseFloat(m[1].replace(/,/g, ''))
    if (!Number.isFinite(v) || v <= 0) continue
    const unit = m[2]

    // R6 composite unit: unit followed by '/' or ' per ' → not a bare family.
    const after = text.slice(i + m[0].length, i + m[0].length + 6)
    if (/^\s*(\/|per\s)/i.test(after)) {
      acc.rejected.push({ excerpt: text.slice(Math.max(0, i - 20), i + m[0].length + 6).trim(), reason: 'composite_unit', value: v, unit })
      continue
    }
    // Bare 'u' only counts in a CubeSat context.
    if (/^u$/i.test(unit) && !/cubesat|platform\s+bus|\bbus\b/i.test(text.slice(Math.max(0, i - 60), i + 60))) continue
    // Bare 't' immediately followed by a letter is a word fragment guard
    // (regex \b already prevents most; this guards "5 t " vs "5 tonne").

    // R4 range second value: number directly preceded by "<num> - " / "<num> to ".
    const before30 = text.slice(Math.max(0, i - 30), i)
    const rangeM = before30.match(RANGE_PREFIX_RE)
    if (rangeM) {
      const firstVal = parseFloat(rangeM[1].replace(/,/g, ''))
      acc.rejected.push({ excerpt: text.slice(Math.max(0, i - 20), i + m[0].length).trim(), reason: 'range_second_value', value: v, unit })
      if (Number.isFinite(firstVal) && firstVal > 0) {
        const firstIdx = i - (before30.length - (rangeM.index ?? 0))
        record(firstIdx, m[0].length, firstVal, unit, undefined, true)
      }
      continue
    }

    record(i, m[0].length, v, unit)
  }
}

// ---------------------------------------------------------------------------
// STRUCTURED-FIELD EXTRACTION
// ---------------------------------------------------------------------------

function sweepStructured(c: ParsedConstraints, acc: SweepAccumulator): void {
  // target_performance.metrics[] — the chain parser's structured metric list.
  const tp: any = (c as any).target_performance
  const metrics = asArray<any>(tp?.metrics)
  for (const met of metrics) {
    if (!met || typeof met.value !== 'number' || !Number.isFinite(met.value) || met.value <= 0) continue
    const unit = typeof met.unit === 'string' ? met.unit : ''
    const cls = classifyUnit(unit, met.value)
    if (!cls) continue
    const keyMetric = String(met.key_metric ?? '')
    const concept = deriveConcept(keyMetric.replace(/_/g, ' ')) ?? null
    acc.qtys.push({
      key: keyMetric || `${cls.id}`,
      family: cls.id,
      value: cls.canon,
      unit: cls.canonUnit,
      raw: { value: met.value, unit },
      qualifier: met.category === 'scale' ? 'scale' : null,
      provenance: 'brief',
      confidence: 0.95,
      source: 'metrics',
      excerpt: `metrics[]: ${keyMetric}=${met.value} ${unit}`,
      scale_eligible: concept === null || !SCALE_DENY_CONCEPTS.has(concept),
      char_index: 0,
    })
  }
  // target_performance itself
  if (tp && typeof tp.value === 'number' && Number.isFinite(tp.value) && tp.value > 0 && typeof tp.unit === 'string') {
    const cls = classifyUnit(tp.unit, tp.value)
    if (cls) {
      const keyMetric = String(tp.key_metric ?? '')
      const concept = deriveConcept(keyMetric.replace(/_/g, ' '))
      acc.qtys.push({
        key: keyMetric || `target_${cls.id}`,
        family: cls.id,
        value: cls.canon,
        unit: cls.canonUnit,
        raw: { value: tp.value, unit: tp.unit },
        qualifier: 'scale',
        provenance: 'brief',
        confidence: 0.95,
        source: 'target_performance',
        excerpt: `target_performance: ${tp.value} ${tp.unit}`,
        scale_eligible: concept === null || !SCALE_DENY_CONCEPTS.has(concept),
        char_index: 0,
      })
    }
  }
  // max_mass_kg
  const mm: any = (c as any).max_mass_kg
  const mmVal = typeof mm === 'number' ? mm : mm && typeof mm.value === 'number' ? mm.value : null
  if (mmVal && Number.isFinite(mmVal) && mmVal > 0) {
    acc.qtys.push({
      key: 'max_mass_kg', family: 'mass_kg', value: mmVal, unit: 'kg',
      raw: { value: mmVal, unit: 'kg' }, qualifier: 'capacity', provenance: 'brief',
      confidence: 0.95, source: 'structured_field', excerpt: `max_mass_kg: ${mmVal}`,
      scale_eligible: true, char_index: 0,
    })
  }
  // max_dimensions_mm → metres
  const md = c.max_dimensions_mm
  if (md) {
    for (const [axis, mmv] of Object.entries(md)) {
      if (typeof mmv !== 'number' || !Number.isFinite(mmv) || mmv <= 0) continue
      acc.qtys.push({
        key: `max_dim_${axis}_m`, family: 'length_m', value: mmv / 1000, unit: 'm',
        raw: { value: mmv, unit: 'mm' }, qualifier: null, provenance: 'brief',
        confidence: 0.9, source: 'structured_field', excerpt: `max_dimensions_mm.${axis}: ${mmv}`,
        scale_eligible: true, char_index: 0,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// PRIMARY SELECTION — implements the header's decision rule.
// ---------------------------------------------------------------------------

const CAPACITY_FAMILIES: QtyFamilyId[] = [
  'power_kw', 'energy_kwh', 'throughput_tpy', 'gas_nm3hr', 'flow_lpd',
  'co2_tpy', 'volume_l', 'area_m2', 'qubit', 'cubesat_u', 'element_count',
]
const GEOMETRY_KEY_ORDER = ['wingspan', 'span', 'rotor_diameter', 'diameter', 'length', 'width', 'height']

function familyRank(f: QtyFamilyId): number {
  const i = CAPACITY_FAMILIES.indexOf(f)
  return i === -1 ? 99 : i
}
function geometryKeyRank(key: string): number {
  for (let i = 0; i < GEOMETRY_KEY_ORDER.length; i++) if (key.startsWith(GEOMETRY_KEY_ORDER[i])) return i
  return GEOMETRY_KEY_ORDER.length
}

/** Total-order comparator for tie-break step 5. */
function tieBreak(a: TypedQty, b: TypedQty): number {
  const s = SOURCE_RANK[a.source] - SOURCE_RANK[b.source]
  if (s !== 0) return s
  const qa = a.qualifier ? 0 : 1
  const qb = b.qualifier ? 0 : 1
  if (qa !== qb) return qa - qb
  if (a.char_index !== b.char_index) return a.char_index - b.char_index
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

export function selectPrimary(
  capacities: TypedQty[],
  physicalDims: TypedQty[],
  mass: TypedQty | null,
  mobility: MobilityClass,
  ratedOutputPresent: boolean,
): TypedQty | null {
  const eligibleCaps = capacities.filter(q => q.scale_eligible)
  const eligibleGeo = physicalDims.filter(q => q.scale_eligible && q.family === 'length_m')

  const capacityPrimary = ratedOutputPresent || mobility === 'fixed_plant' || mobility === 'unknown'

  const pickCapacity = (): TypedQty | null => {
    if (eligibleCaps.length === 0) return null
    return [...eligibleCaps].sort((a, b) => {
      const f = familyRank(a.family) - familyRank(b.family)
      if (f !== 0) return f
      return tieBreak(a, b)
    })[0]
  }
  const pickGeometry = (): TypedQty | null => {
    if (eligibleGeo.length === 0) return null
    return [...eligibleGeo].sort((a, b) => {
      const g = geometryKeyRank(a.key) - geometryKeyRank(b.key)
      if (g !== 0) return g
      return tieBreak(a, b)
    })[0]
  }

  const first = capacityPrimary ? pickCapacity() : pickGeometry()
  if (first) return first
  const second = capacityPrimary ? pickGeometry() : pickCapacity()
  if (second) return second
  return mass && mass.scale_eligible ? mass : null
}

/** Injection candidates for the registered-class re-detect trial, strongest
 *  first: primary, then remaining scale-eligible quantities in the same
 *  decision-rule order. Mission-envelope quantities are excluded by
 *  scale_eligible=false — that is the deny-list. */
export function injectionCandidates(vector: EnvelopeVector): TypedQty[] {
  const pool = [...vector.capacities, ...vector.physical_dims, ...(vector.mass ? [vector.mass] : [])]
    .filter(q => q.scale_eligible && q.provenance === 'brief')
  const ordered = pool.sort((a, b) => {
    const f = familyRank(a.family) - familyRank(b.family)
    if (f !== 0) return f
    return tieBreak(a, b)
  })
  if (vector.primary) {
    const rest = ordered.filter(q => q !== vector.primary)
    return [vector.primary, ...rest]
  }
  return ordered
}

// ---------------------------------------------------------------------------
// VECTOR BUILDER (tier b core) — deterministic, pure, no LLM.
// ---------------------------------------------------------------------------

export function buildEnvelopeVector(constraints: ParsedConstraints): EnvelopeVector {
  const acc: SweepAccumulator = { qtys: [], rejected: [] }

  sweepStructured(constraints, acc)
  const addl = asArray<{ description?: string }>((constraints as any).additional_constraints)
  for (const item of addl) {
    if (typeof item?.description === 'string') sweepText(item.description, 'additional_constraints', acc)
  }
  const desc = typeof constraints.product_description === 'string' ? constraints.product_description : ''
  sweepText(desc, 'product_description', acc)

  // De-duplicate: same key + same canonical value from a weaker source.
  const seen = new Map<string, TypedQty>()
  for (const q of acc.qtys) {
    const dedupeKey = `${q.key}|${q.value.toPrecision(6)}`
    const prev = seen.get(dedupeKey)
    if (!prev || SOURCE_RANK[q.source] < SOURCE_RANK[prev.source]) seen.set(dedupeKey, q)
  }
  const qtys = [...seen.values()]

  // Partition. CAPACITY_FAMILIES excludes mass_kg + length_m by construction.
  const capacities = qtys.filter(q => CAPACITY_FAMILIES.includes(q.family))
  const physical_dims = qtys.filter(q => q.family === 'length_m')
  const masses = qtys.filter(q => q.family === 'mass_kg')

  // Device mass = best mass whose concept is NOT payload; payload masses are
  // other_quantities. Structured max_mass_kg wins, then mtow/device concepts.
  const deviceMassRank = (q: TypedQty): number => {
    if (q.key === 'max_mass_kg') return 0
    if (q.key.startsWith('mtow') || q.key.startsWith('device_mass')) return 1
    if (q.key.startsWith('mass')) return 2
    if (q.key.startsWith('payload')) return 9
    return 3
  }
  const massSorted = [...masses].sort((a, b) => {
    const r = deviceMassRank(a) - deviceMassRank(b)
    if (r !== 0) return r
    return tieBreak(a, b)
  })
  const mass = massSorted.find(q => deviceMassRank(q) < 9) ?? null
  const other_quantities = masses.filter(q => q !== mass)

  // Environment.
  const addlText = addl.map(i => i?.description ?? '').join(' \n ')
  const fullText = `${constraints.product_class ?? ''} ${desc} ${addlText}`
  const tempC: number[] = []
  for (const m of fullText.matchAll(/(-?\d+(?:\.\d+)?)\s*°\s*c\b/gi)) {
    const v = parseFloat(m[1])
    if (Number.isFinite(v)) tempC.push(v)
  }
  const environment: EnvelopeVector['environment'] = {
    medium: detectMedium(fullText),
    ...(typeof constraints.operating_temp_min_c === 'number' ? { temp_min_c: constraints.operating_temp_min_c } : tempC.length ? { temp_min_c: Math.min(...tempC) } : {}),
    ...(typeof constraints.operating_temp_max_c === 'number' ? { temp_max_c: constraints.operating_temp_max_c } : tempC.length ? { temp_max_c: Math.max(...tempC) } : {}),
  }

  const mobility_class = detectMobility(fullText)
  const ratedOutputPresent = capacities.some(
    q => (q.family === 'power_kw' || q.family === 'energy_kwh' || q.family === 'throughput_tpy') &&
      RATED_OUTPUT_RE.test(q.excerpt),
  )
  const product_function: EnvelopeVector['product_function'] = ratedOutputPresent
    ? 'produces_output'
    : /payload|passenger|cargo/i.test(fullText) && mobility_class !== 'fixed_plant' && mobility_class !== 'unknown'
      ? 'carries_payload'
      : /generat|turbine|converter|digester|electrolyser|synthesis|chp|production|yield|capture|storage/i.test(fullText)
        ? 'produces_output'
        : 'unknown'

  const primary = selectPrimary(capacities, physical_dims, mass, mobility_class, ratedOutputPresent)

  // Contradictions: two scale-qualified quantities of the same family
  // disagreeing by >25% is a real brief conflict, surfaced not hidden.
  const contradictions: string[] = []
  const byFamily = new Map<QtyFamilyId, TypedQty[]>()
  for (const q of [...capacities, ...physical_dims]) {
    if (!q.qualifier || !q.scale_eligible) continue
    const arr = byFamily.get(q.family) ?? []
    arr.push(q)
    byFamily.set(q.family, arr)
  }
  for (const [fam, arr] of byFamily) {
    if (arr.length < 2) continue
    const vals = arr.map(q => q.value)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    if (min > 0 && max / min > 1.25 && new Set(arr.map(q => q.key)).size === 1) {
      contradictions.push(`conflicting scale-qualified ${fam} values: ${arr.map(q => `${q.raw.value} ${q.raw.unit} (${q.source})`).join(' vs ')}`)
    }
  }

  return {
    physical_dims,
    capacities,
    mass,
    other_quantities,
    environment,
    mobility_class,
    product_function,
    primary,
    contradictions,
    rejected: acc.rejected,
    confidence: primary ? primary.confidence : 0.2,
    provenance_spans: qtys.map(q => ({ key: q.key, source: q.source, excerpt: q.excerpt })),
  }
}

// ---------------------------------------------------------------------------
// TIER (c) — LLM-ASSISTED INFERENCE of a MISSING scale metric.
// One cheap OpenRouter call (gemini-3.5-flash). Proposal only (G4).
// ---------------------------------------------------------------------------

const INFERENCE_MODEL = 'google/gemini-3.5-flash'

export async function proposeMissingScaleMetric(
  klass: string,
  constraints: ParsedConstraints,
  vector: EnvelopeVector,
): Promise<InferredScaleMetric | null> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''
  if (!apiKey) return null

  const known = [...vector.capacities, ...vector.physical_dims, ...(vector.mass ? [vector.mass] : []), ...vector.other_quantities]
    .map(q => `- ${q.key}: ${q.raw.value} ${q.raw.unit} (${q.source})`)
    .join('\n')
  const desc = String(constraints.product_description ?? '').slice(0, 5000)
  const addl = asArray<{ description?: string }>((constraints as any).additional_constraints)
    .map(i => i?.description ?? '')
    .filter(Boolean)
    .join('\n')
    .slice(0, 3000)

  const prompt =
    `You are an engineering envelope assistant for a deterministic design pipeline.\n` +
    `Product class: "${klass}".\n` +
    `Brief description:\n${desc}\n` +
    (addl ? `Additional constraints:\n${addl}\n` : '') +
    `Quantities already extracted from the brief:\n${known || '(none)'}\n\n` +
    `The deterministic envelope detector for this product class could not find its ` +
    `scale-determining metric (the single quantity an engineer uses to size/classify ` +
    `this kind of product — e.g. wingspan for a fixed-wing high-altitude aircraft, ` +
    `nameplate energy for a battery storage system, rated power output for a generator, ` +
    `working volume for a bioreactor, operating depth for an underwater vehicle).\n\n` +
    `Propose the SINGLE most standard scale-determining metric for this class, with a ` +
    `value derived ONLY from engineering reasoning over the stated requirements ` +
    `(payload, endurance, altitude, power budget, throughput…). NEVER copy a value ` +
    `from an analogue or competitor comparison in the text. State your confidence ` +
    `honestly: 0.8+ only when the stated requirements tightly determine the value.\n\n` +
    `Return STRICT JSON only (no markdown fence, no commentary):\n` +
    `{"metric_key": "<snake_case_with_unit_suffix e.g. wingspan_m>", "value": <number>, ` +
    `"unit": "<SI unit symbol e.g. m, kw, kwh, kg, l>", "confidence": <0..1>, ` +
    `"rationale": "<=240 chars"}`

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fractionalforge.com',
        'X-Title': 'ForgeOS E1 envelope inference',
      },
      body: JSON.stringify({
        model: INFERENCE_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 8192, // reasoning models truncate below 4096 (MEMORY.md rule)
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(90_000),
    })
    if (!res.ok) return null
    const j: any = await res.json()
    const rawContent = j?.choices?.[0]?.message?.content
    if (!rawContent || typeof rawContent !== 'string') return null
    let cleaned = rawContent.trim()
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) cleaned = fence[1].trim()
    const a = cleaned.indexOf('{')
    const b = cleaned.lastIndexOf('}')
    if (a === -1 || b === -1) return null
    const parsed = JSON.parse(cleaned.slice(a, b + 1))
    const value = Number(parsed.value)
    const confidence = Number(parsed.confidence)
    if (!Number.isFinite(value) || value <= 0) return null
    if (typeof parsed.unit !== 'string' || !parsed.unit) return null
    return {
      metric_key: String(parsed.metric_key ?? 'inferred_scale_metric'),
      value,
      unit: parsed.unit,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
      rationale: String(parsed.rationale ?? '').slice(0, 240),
      consumed: false,
      llm_cost_usd: typeof j?.usage?.cost === 'number' ? j.usage.cost : null,
      model: INFERENCE_MODEL,
    }
  } catch {
    return null
  }
}

/** Record an LLM proposal into the vector with provenance=inferred. */
function recordInference(vector: EnvelopeVector, inf: InferredScaleMetric): TypedQty | null {
  const cls = classifyUnit(inf.unit, inf.value)
  if (!cls) {
    vector.contradictions.push(`inferred metric ${inf.metric_key}=${inf.value} ${inf.unit} has unrecognised unit — not consumed`)
    return null
  }
  const concept = deriveConcept(inf.metric_key.replace(/_/g, ' '))
  const qty: TypedQty = {
    key: inf.metric_key,
    family: cls.id,
    value: cls.canon,
    unit: cls.canonUnit,
    raw: { value: inf.value, unit: inf.unit },
    qualifier: 'scale',
    provenance: 'inferred',
    confidence: inf.confidence,
    source: 'llm_inference',
    excerpt: `inferred(${inf.confidence.toFixed(2)}): ${inf.rationale}`,
    scale_eligible: concept === null || !SCALE_DENY_CONCEPTS.has(concept),
    char_index: 0,
  }
  if (cls.id === 'length_m') vector.physical_dims.push(qty)
  else if (cls.id === 'mass_kg') vector.other_quantities.push(qty)
  else vector.capacities.push(qty)
  vector.provenance_spans.push({ key: qty.key, source: 'llm_inference', excerpt: qty.excerpt })
  return qty
}

// ---------------------------------------------------------------------------
// SINGLE INTEGRATION FUNCTION — tier (a) → (b) → (c) cascade. Async because
// tier (c) may call OpenRouter. The chain adopts THIS (see header note).
// ---------------------------------------------------------------------------

export async function resolveEnvelopeUniversal(
  constraints: ParsedConstraints,
  opts: { allowLlm?: boolean } = {},
): Promise<UniversalEnvelopeResolution> {
  const allowLlm = opts.allowLlm ?? true
  const klass = registeredClassOf(constraints)

  // ── tier (a): registered exact detectors — untouched, run first ──
  const strict = detectEnvelopeStrict(constraints)
  const vector = buildEnvelopeVector(constraints)
  if (strict && klass) {
    return { envelope: strict, vector, tier: 'a', inference: null }
  }
  if (strict && !klass) {
    // Unregistered class: detectEnvelopeStrict already returns the
    // permissive genericEnvelope (pre-E1 behaviour, unchanged). The vector
    // rides along for downstream consumers.
    return { envelope: strict, vector, tier: 'b', inference: null }
  }

  // ── tier (b): registered class, metric-MISS — deterministic injection ──
  if (klass) {
    for (const cand of injectionCandidates(vector)) {
      const env = detectRegisteredWithInjectedMetric(klass, constraints, { value: cand.value, unit: cand.unit })
      if (env) return { envelope: env, vector, tier: 'b', inference: null }
    }
  }

  // ── tier (c): LLM proposes the missing scale metric (G4: a proposal) ──
  let inference: InferredScaleMetric | null = null
  if (klass && allowLlm) {
    inference = await proposeMissingScaleMetric(klass, constraints, vector)
    if (inference) {
      const qty = recordInference(vector, inference)
      if (qty && inference.confidence >= INFERENCE_CONSUME_THRESHOLD && qty.scale_eligible) {
        const env = detectRegisteredWithInjectedMetric(klass, constraints, { value: qty.value, unit: qty.unit })
        if (env) {
          inference.consumed = true
          vector.primary = vector.primary ?? qty
          return { envelope: env, vector, tier: 'c', inference }
        }
        vector.contradictions.push(
          `inferred ${inference.metric_key}=${inference.value} ${inference.unit} did not resolve a ${klass} scale tier — not consumed`,
        )
      } else if (qty) {
        vector.contradictions.push(
          `inferred ${inference.metric_key}=${inference.value} ${inference.unit} below confidence threshold ${INFERENCE_CONSUME_THRESHOLD} (got ${inference.confidence.toFixed(2)}) — flagged, not consumed`,
        )
      }
    }
  }

  // ── last resort: non-null class-generic envelope (kills exit 7) ──
  const envelope = klass ? classGenericEnvelope(klass, constraints) : detectEnvelopeStrict(constraints)
  return { envelope, vector, tier: inference ? 'c' : 'b', inference }
}
