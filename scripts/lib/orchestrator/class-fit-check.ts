/**
 * scripts/lib/orchestrator/class-fit-check.ts
 *
 * W0 — DETERMINISTIC CLASS-FIT CONTRADICTION CHECK (tracker #21, E1/W0).
 *
 * THE WALL THIS KILLS: the product-classifier (src/lib/pdf-engine-v2/
 * product-classifier.ts) is a keyword cascade that assigns a registered
 * product_class with HIGH confidence even for a NOVEL archetype it has never
 * seen. On the tidal-kite holdout (out/holdout-tidal-kite/) a tethered SUBSEA
 * tidal-stream kite — fully seawater-immersed — was classified
 * product_class=wind_turbine because "rotor / pitch / turbine / generator"
 * keywords matched the wind cascade. Every downstream stage then ran the wind
 * class plan / template / cost bands, and the universal registry-miss path
 * (envelope-vector tier-b/c, generic emitter + sizing families, authored
 * Blender scenes) — the path built precisely for unseen archetypes — NEVER
 * FIRED. The gates correctly blocked the result (F-1 fidelity 1/10, gate-32
 * cost-sanity 30.4× below band, exit 10), but the failure is UPSTREAM:
 * classifier overconfidence.
 *
 * GOVERNANCE (ANVIL-UNIVERSAL-LOOP-PLAN.md):
 *   G2 — LLM judges are advisory; DETERMINISTIC checks decide. The classifier
 *        LLM/keyword cascade stays ADVISORY; this deterministic check decides
 *        whether to trust its class assignment or downgrade to registry-miss.
 *   G3 — Convergence/degrade fallback is explicit + honestly labelled. On a
 *        contradiction we route to the universal registry-miss path (a
 *        degraded-but-honest dossier) rather than ship a wrong-class one.
 *   G4 — Provenance surfaced. The contradiction findings are recorded
 *        (class_fit: contradiction) on the object that flows downstream.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CONSERVATIVE-BIAS CONTRACT (read before tuning any table below):
 *
 *   A false "novel" routing (we say contradiction when the class was actually
 *   right) costs a DEGRADED-BUT-HONEST dossier — the universal path runs, the
 *   output is labelled, the gates still apply. Recoverable.
 *
 *   A false "fit" (we say ok when the class was wrong) SHIPS A WRONG-CLASS
 *   DOSSIER — wind cost bands on a subsea kite, marine corrosion physics on a
 *   server. This is the WORSE failure: it is exactly the W0 wall.
 *
 *   Therefore: only emit a CONTRADICTION verdict on STRONG evidence. Every
 *   signal is cited in findings; a HIGH-severity finding flips the verdict to
 *   'contradiction', a MEDIUM finding is informational only (it never flips
 *   the verdict alone). When in doubt, the signal must mark UNKNOWN / no-check
 *   rather than guess — an honest "can't tell" is better than a false flag in
 *   either direction.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * THREE DETERMINISTIC SIGNALS (no LLM):
 *   (a) MOBILITY/MEDIUM contradiction — derive the brief's OPERATING DOMAIN
 *       (submerged / orbital / airborne / terrestrial) from explicit keyword
 *       evidence CORROBORATED by the envelope-vector mobility_class + medium,
 *       then compare against the class's expected domain (CLASS_DOMAIN table).
 *       Cross-domain mismatch on strong evidence = HIGH.
 *   (b) PRIMARY-OUTPUT-FAMILY contradiction — the brief's primary capacity
 *       family vs the class's expected output family, where unambiguous.
 *       MEDIUM (informational) — output families overlap too much across
 *       classes to flip a verdict safely.
 *   (c) HARD NEGATIVE-TOKEN contradiction — a direct token that cannot
 *       co-exist with the class's domain (e.g. "underwater" on a wind_turbine).
 *       HIGH.
 *
 * This is a NEW LEAF MODULE. It imports TYPES ONLY from envelope-vector.ts
 * (erased at compile — no runtime import cycle; envelope-vector imports
 * unit-families + envelope, never this file). Nothing imports class-fit-check
 * except orchestrate.ts. Pure + deterministic + unit-testable.
 */

import type { EnvelopeVector, MobilityClass, QtyFamilyId } from './envelope-vector'

// ---------------------------------------------------------------------------
// OPERATING DOMAINS — the mutually-exclusive environment a product lives in.
// A product belongs to exactly one. Two distinct concrete domains are HARD
// INCOMPATIBLE (a submerged device is not a satellite; a satellite is not a
// fixed ground plant). 'any' = no-check (the class genuinely spans domains).
// ---------------------------------------------------------------------------

export type OperatingDomain = 'submerged' | 'orbital' | 'airborne' | 'terrestrial'
type ClassDomain = OperatingDomain | 'any'

/**
 * Per-class expected operating domain for the ~37 registered classes (the
 * canonical slugs DETECTORS{} keys in envelope.ts / ARCHETYPE_ALIASES in
 * engineering-contract.ts). One line per class. UNKNOWN/dual-use classes are
 * marked 'any' so they are never checked (ground_station, fso, phased_array
 * legitimately reference space; propulsion is space but ground-tested).
 *
 * Derivation: the envelope.ts class detectors + product-classifier slugs.
 *   submerged   — full water immersion (only auv among registered classes)
 *   orbital     — space / vacuum
 *   airborne    — free-flying in the atmosphere
 *   terrestrial — ground / fixed installation (incl. indoor CEA + ground vehicles)
 */
const CLASS_DOMAIN: Record<string, ClassDomain> = {
  // ── submerged ──
  auv: 'submerged',
  // ── orbital ──
  satellite_cubesat: 'orbital',
  satellite_smallsat: 'orbital',
  satellite_geo_comsat: 'orbital',
  satellite_interplanetary: 'orbital',
  propulsion_thruster_product: 'orbital',
  // ── airborne ──
  haps: 'airborne',
  drone: 'airborne',
  evtol: 'airborne',
  // ── terrestrial (fixed plant / ground vehicle / portable) ──
  bess: 'terrestrial',
  heat_pump_residential: 'terrestrial',
  vertical_farm: 'terrestrial',
  bioreactor: 'terrestrial',
  cgm: 'terrestrial',
  edge_ai: 'terrestrial',
  ev_charger: 'terrestrial',
  solar_inverter: 'terrestrial',
  wind_turbine: 'terrestrial', // nacelle is in AIR even offshore — NOT submerged
  h2_electrolyser: 'terrestrial',
  ups_inverter: 'terrestrial',
  cnc_machine: 'terrestrial',
  e_bike: 'terrestrial',
  ventilator: 'terrestrial',
  dialysis_machine: 'terrestrial',
  quantum_computer: 'terrestrial',
  cryostat: 'terrestrial',
  solid_state_battery: 'terrestrial',
  pemfc: 'terrestrial',
  smr: 'terrestrial',
  humanoid: 'terrestrial',
  dac: 'terrestrial',
  co2_mineralisation: 'terrestrial',
  e_fuel_synthesis: 'terrestrial',
  '3d_printer_fdm': 'terrestrial',
  // ── dual-use / ambiguous → no-check ──
  ground_station: 'any',     // talks to satellites but is itself on the ground
  fso: 'any',                // free-space optical: ground terminal OR satellite payload
  phased_array: 'any',       // RF antenna: ground, airborne or spaceborne
}

/**
 * Per-class expected primary OUTPUT FAMILY (signal b), only where the family
 * is unambiguous. Missing entry = no output-family check. Values are
 * envelope-vector QtyFamilyId family GROUPS; a brief whose only capacities
 * fall entirely OUTSIDE the class's group earns a MEDIUM (informational)
 * finding. Deliberately sparse — output families overlap across classes, so
 * this signal is advisory.
 */
const CLASS_OUTPUT_FAMILY: Record<string, QtyFamilyId[]> = {
  bess: ['energy_kwh', 'power_kw'],
  wind_turbine: ['power_kw'],
  solar_inverter: ['power_kw'],
  ups_inverter: ['power_kw'],
  ev_charger: ['power_kw'],
  pemfc: ['power_kw'],
  smr: ['power_kw'],
  heat_pump_residential: ['power_kw'],
  h2_electrolyser: ['power_kw', 'gas_nm3hr'],
  bioreactor: ['volume_l'],
  vertical_farm: ['area_m2', 'throughput_tpy'],
  dac: ['co2_tpy', 'throughput_tpy'],
  co2_mineralisation: ['co2_tpy', 'throughput_tpy'],
  e_fuel_synthesis: ['throughput_tpy', 'power_kw'],
  quantum_computer: ['qubit'],
  satellite_cubesat: ['cubesat_u', 'mass_kg'],
}

// ---------------------------------------------------------------------------
// DOMAIN DETECTION — keyword evidence CORROBORATED by mobility_class + medium.
// Dual requirement (token AND corroborating vector signal) keeps precision
// high: an OFFSHORE WIND brief mentions "marine" / "seawater" (corrosion) but
// has NO product-immersion token, so it never reads as 'submerged'.
// ---------------------------------------------------------------------------

/** Product-IMMERSION tokens (the device itself is in the water). NOT mere
 *  "offshore" / "marine" / "seawater" — those describe deployment near the
 *  sea, not immersion of the product. */
const SUBMERGED_TOKENS =
  /\bunderwater\b|\bsubsea\b|submers(?:ed|ible)|fully\s+immersed|full\s+(?:seawater\s+)?immersion|seawater\s+immersion|below\s+(?:the\s+)?(?:mean\s+)?sea\s+level|tidal\s+kite|tidal[\s-]?stream|hydrofoil\b/i

const ORBITAL_TOKENS =
  /\bin\s+orbit\b|on-?orbit\b|in-?orbit\b|low\s+earth\s+orbit|\bleo\b|geostationary|\bgeo\s+orbit|deep\s+space|cislunar|interplanetary|\bspacecraft\b|vacuum\s+of\s+space|on-?station\s+in\s+orbit/i

const AIRBORNE_TOKENS =
  /\bin\s+flight\b|\bairborne\b|free-?flying|fixed-?wing|stratospher|high-?altitude\s+(?:platform|pseudo)|cruise\s+altitude|flies?\s+at\s+[\d,]+\s*(?:m|km|ft)|aerial\s+vehicle|\bvtol\b/i

const TERRESTRIAL_TOKENS =
  /skid-?mounted|containeris|concrete\s+(?:pad|plinth|base)|field-?erected|on-?farm|grid-?connected|grid-?tied|installed\s+on\s+site|building\s+shell|warehouse|factory\s+floor|wall-?mounted|rack-?mount|behind-?the-?meter|front-?of-?meter/i

const WATER_MEDIA: ReadonlySet<EnvelopeVector['environment']['medium']> = new Set(['seawater', 'freshwater'])

const TERRESTRIAL_MOBILITY: ReadonlySet<MobilityClass> = new Set([
  'fixed_plant', 'ground_vehicle', 'portable_device', 'unknown',
])

export interface DomainEvidence {
  domain: OperatingDomain | 'unknown'
  /** The matched token (signal-a citation), or null when domain is unknown. */
  token: string | null
  /** Corroborating envelope-vector signal cited in the finding. */
  corroboration: string | null
}

/** Derive the brief's operating domain from text tokens corroborated by the
 *  envelope vector. Returns 'unknown' (→ no-check) unless BOTH a token and a
 *  corroborating mobility/medium signal agree — the conservative bias. */
export function detectBriefDomain(corpus: string, vector: EnvelopeVector): DomainEvidence {
  const m = vector.mobility_class
  const medium = vector.environment.medium

  // submerged — immersion token + (water medium OR marine mobility)
  const sub = corpus.match(SUBMERGED_TOKENS)
  if (sub && (WATER_MEDIA.has(medium) || m === 'marine_platform')) {
    return { domain: 'submerged', token: sub[0], corroboration: `mobility_class=${m}, medium=${medium}` }
  }
  // orbital — orbital token + (vacuum medium OR orbital mobility)
  const orb = corpus.match(ORBITAL_TOKENS)
  if (orb && (medium === 'vacuum' || m === 'orbital_platform')) {
    return { domain: 'orbital', token: orb[0], corroboration: `mobility_class=${m}, medium=${medium}` }
  }
  // airborne — flight token + airborne mobility
  const air = corpus.match(AIRBORNE_TOKENS)
  if (air && m === 'airborne_platform') {
    return { domain: 'airborne', token: air[0], corroboration: `mobility_class=${m}` }
  }
  // terrestrial — fixed/ground token + terrestrial mobility
  const ter = corpus.match(TERRESTRIAL_TOKENS)
  if (ter && TERRESTRIAL_MOBILITY.has(m)) {
    return { domain: 'terrestrial', token: ter[0], corroboration: `mobility_class=${m}` }
  }
  return { domain: 'unknown', token: null, corroboration: null }
}

// ---------------------------------------------------------------------------
// PUBLIC RESULT TYPES
// ---------------------------------------------------------------------------

export interface ClassFitFinding {
  signal: 'mobility_medium' | 'output_family' | 'negative_token'
  severity: 'high' | 'medium'
  detail: string
  /** The brief evidence + class expectation this finding is built from. */
  evidence: string
}

export interface ClassFitResult {
  fit: 'ok' | 'contradiction'
  /** The class slug checked (normalised lower-case). */
  class_slug: string
  /** The operating domain the brief evidence implies, for provenance. */
  brief_domain: OperatingDomain | 'unknown'
  /** The class's expected domain (or 'any' / 'unregistered'). */
  class_domain: ClassDomain | 'unregistered'
  findings: ClassFitFinding[]
}

// ---------------------------------------------------------------------------
// CORPUS BUILDER — gather every text field the parsed brief carries. The
// classifier ran on the markdown; we run on the parsed-brief JSON the chain
// actually flows downstream, so we sweep all its free-text fields.
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export function buildClassFitCorpus(parsedBrief: unknown): string {
  const b = (parsedBrief ?? {}) as Record<string, any>
  const parts: string[] = [
    str(b.product_description),
    str(b.mission_statement),
    str(b.target_customers),
    str(b.why_now),
  ]
  // The brief may be flattened (chain orchParsedConstraints spreads
  // brief + brief.constraints) OR nested (raw parsed-brief JSON). Read both.
  const c = (b.constraints ?? {}) as Record<string, any>
  parts.push(str(c.target_process), str(c.target_material), str(b.target_process), str(b.target_material))
  const addl = [
    ...(Array.isArray(c.additional_constraints) ? c.additional_constraints : []),
    ...(Array.isArray(b.additional_constraints) ? b.additional_constraints : []),
  ]
  for (const a of addl) parts.push(str(a?.description))
  const safety = [
    ...(Array.isArray(c.safety_standards) ? c.safety_standards : []),
    ...(Array.isArray(b.safety_standards) ? b.safety_standards : []),
  ]
  for (const s of safety) parts.push(str(s?.standard), str(s?.code))
  return parts.filter(Boolean).join(' \n ').toLowerCase()
}

// ---------------------------------------------------------------------------
// PROVISIONAL-SLUG MINTING (W0 refinement, tracker #22) — on a contradiction
// the envelope must NOT keep the contradicted class label (wind_turbine →
// "wind-turbine" routed a subsea kite to the WIND class-reference graph).
// Deterministically mint a novel slug from the brief's own naming so every
// downstream keyed store (class-reference graph, corpus components, candidate
// tables, blender dispatch) keys on an HONEST novel identity instead.
// ---------------------------------------------------------------------------

export const PROVISIONAL_SLUG_RE = /^[a-z0-9_]{1,64}$/

/** Slugify free text to the candidate-store alphabet /^[a-z0-9_]{1,64}$/.
 *  Returns '' when nothing usable survives sanitisation. */
export function sanitiseProvisionalSlug(v: unknown): string {
  const slug = String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
    .replace(/_+$/g, '')
  return PROVISIONAL_SLUG_RE.test(slug) ? slug : ''
}

/**
 * Mint a deterministic provisional class slug for a novel archetype from the
 * parsed brief. Source precedence (first usable wins):
 *   1. the brief's name/title field — `project_id` (the parser's product
 *      name slug, e.g. "tidal-kite-subsea-generator"), then `product_name` /
 *      `product_title` / `title` / `name` variants;
 *   2. `fallbackStem` (the brief FILENAME stem, when the caller knows it);
 *   3. the head noun phrase of `product_description` (first clause, first 6
 *      words, leading articles stripped);
 *   4. the literal 'novel_unclassified' (never empty — the slug keys DB rows).
 * Pure + deterministic: same brief → same slug, no LLM.
 */
export function mintProvisionalSlug(parsedBrief: unknown, fallbackStem?: string): string {
  const b = (parsedBrief ?? {}) as Record<string, any>
  const named = [b.project_id, b.product_name, b.product_title, b.title, b.name, fallbackStem]
  for (const c of named) {
    const slug = sanitiseProvisionalSlug(c)
    if (slug) return slug
  }
  const firstClause = str(b.product_description).split(/[.;:\n]/)[0] ?? ''
  const nounPhrase = firstClause
    .trim()
    .replace(/^(a|an|the)\s+/i, '')
    .split(/\s+/)
    .slice(0, 6)
    .join('_')
  return sanitiseProvisionalSlug(nounPhrase) || 'novel_unclassified'
}

// ---------------------------------------------------------------------------
// NEGATIVE-TOKEN GUARDS (signal c) — direct token↔domain incompatibilities.
// Each token, when present, is incompatible with the listed class-domains.
// HIGH severity. Overlaps signal (a) but gives an explicit, auditable cite.
// ---------------------------------------------------------------------------

const NEGATIVE_TOKEN_GUARDS: Array<{ re: RegExp; incompatibleWith: OperatingDomain[]; label: string }> = [
  { re: /\bunderwater\b|\bsubsea\b|submers(?:ed|ible)|seawater\s+immersion/i, incompatibleWith: ['orbital', 'airborne', 'terrestrial'], label: 'submersion token' },
  { re: /\bin\s+orbit\b|geostationary|interplanetary|deep\s+space/i, incompatibleWith: ['submerged', 'terrestrial'], label: 'orbital token' },
]

// ---------------------------------------------------------------------------
// MAIN CHECK
// ---------------------------------------------------------------------------

const OUTPUT_FAMILY_OF_CAPACITY: ReadonlySet<QtyFamilyId> = new Set<QtyFamilyId>([
  'power_kw', 'energy_kwh', 'throughput_tpy', 'gas_nm3hr', 'flow_lpd',
  'co2_tpy', 'volume_l', 'area_m2', 'qubit', 'cubesat_u', 'element_count',
])

/**
 * checkClassFit — the deterministic verdict.
 *
 * @param parsedBrief  the parsed-brief object (free-text fields are swept).
 * @param vector       the envelope vector (buildEnvelopeVector output).
 * @param classSlug    the classifier's assigned product_class (any alias form).
 */
export function checkClassFit(
  parsedBrief: unknown,
  vector: EnvelopeVector,
  classSlug: string,
): ClassFitResult {
  const slug = String(classSlug ?? '').toLowerCase().trim()
  const corpus = buildClassFitCorpus(parsedBrief)
  const findings: ClassFitFinding[] = []

  const classDomainRaw = CLASS_DOMAIN[slug]
  const classDomain: ClassDomain | 'unregistered' = classDomainRaw ?? 'unregistered'
  const briefEv = detectBriefDomain(corpus, vector)

  // ── Signal (a): mobility/medium domain contradiction ──────────────────
  if (
    classDomainRaw && classDomainRaw !== 'any' &&
    briefEv.domain !== 'unknown' && briefEv.domain !== classDomainRaw
  ) {
    findings.push({
      signal: 'mobility_medium',
      severity: 'high',
      detail: `brief operates in the ${briefEv.domain} domain but class "${slug}" expects the ${classDomainRaw} domain — incompatible operating environments`,
      evidence: `brief token "${briefEv.token}" (${briefEv.corroboration}); class_domain=${classDomainRaw}`,
    })
  }

  // ── Signal (c): hard negative-token guards ────────────────────────────
  if (classDomainRaw && classDomainRaw !== 'any') {
    for (const guard of NEGATIVE_TOKEN_GUARDS) {
      const hit = corpus.match(guard.re)
      if (hit && guard.incompatibleWith.includes(classDomainRaw)) {
        // De-dupe against an identical signal-a citation.
        const already = findings.some(f => f.signal === 'mobility_medium')
        findings.push({
          signal: 'negative_token',
          severity: 'high',
          detail: `${guard.label} "${hit[0]}" cannot co-exist with a ${classDomainRaw}-domain class "${slug}"`,
          evidence: `token "${hit[0]}"; class_domain=${classDomainRaw}${already ? ' (corroborates signal-a)' : ''}`,
        })
      }
    }
  }

  // ── Signal (b): primary-output-family contradiction (MEDIUM/informational) ─
  const expectedFamilies = CLASS_OUTPUT_FAMILY[slug]
  if (expectedFamilies && expectedFamilies.length > 0) {
    const briefCapFamilies = new Set(
      vector.capacities
        .filter(q => q.scale_eligible && OUTPUT_FAMILY_OF_CAPACITY.has(q.family))
        .map(q => q.family),
    )
    if (briefCapFamilies.size > 0) {
      const overlap = expectedFamilies.some(f => briefCapFamilies.has(f))
      if (!overlap) {
        findings.push({
          signal: 'output_family',
          severity: 'medium',
          detail: `class "${slug}" expects a primary output in {${expectedFamilies.join(', ')}} but the brief's capacities are {${[...briefCapFamilies].join(', ')}} — possible class mismatch`,
          evidence: `expected=${expectedFamilies.join('|')}; brief_capacities=${[...briefCapFamilies].join('|')}`,
        })
      }
    }
  }

  const fit: ClassFitResult['fit'] = findings.some(f => f.severity === 'high') ? 'contradiction' : 'ok'

  return {
    fit,
    class_slug: slug,
    brief_domain: briefEv.domain,
    class_domain: classDomain,
    findings,
  }
}
