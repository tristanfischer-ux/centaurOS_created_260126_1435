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

/** All marker families the gate scans, tagged by family for the finding text. */
export const MARKER_FAMILIES: Array<{ family: 'marine' | 'irrigation'; markers: DomainMarker[] }> = [
  { family: 'marine', markers: MARINE_MARKERS },
  { family: 'irrigation', markers: IRRIGATION_MARKERS },
]

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
  const slug = String(productClass ?? '').trim().toLowerCase()
  if (!slug) return false
  // normalise separators to spaces so a token can word-boundary-match a slug part
  const normalised = ` ${slug.replace(/[_\-/:]+/g, ' ')} `
  return MARINE_CLASS_TOKENS.some((tok) => new RegExp(`\\b${tok}\\b`).test(normalised))
}

// ---------------------------------------------------------------------------
// Marker scanning over arbitrary text
// ---------------------------------------------------------------------------

export interface MarkerHit {
  family: 'marine' | 'irrigation'
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
  family: 'marine' | 'irrigation'
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
  /** Whether the class was treated as marine (markers suppressed). */
  is_marine_class: boolean
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
 * tool's worked-calcs + every contract quantity for marine / irrigation markers.
 * On a NON-marine class, each offending (tool|quantity) yields a HIGH finding. On
 * a marine class the marine markers are suppressed (legitimate) — irrigation
 * markers still fire (a submarine has no sprinklers either, but that is a rarer
 * case; we keep the irrigation net active universally and only special-case the
 * marine suppression, which is the documented CO₂ failure mode).
 *
 * NEVER throws — a malformed/absent toolsUsedPage / orchestratorContract yields a
 * clean 'unavailable' / 'pass' result so the gate can never wedge the chain.
 */
export function computeToolArchetypeCoherence(state: any): ToolArchetypeCoherenceResult {
  const productClass = inferProductClass(state)
  const marine = isMarineClass(productClass)
  const base: ToolArchetypeCoherenceResult = {
    verdict: 'pass',
    product_class: productClass,
    is_marine_class: marine,
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

  /** Should a hit of this family fire for this class? Marine hits are suppressed
   *  on a marine class; irrigation hits fire universally (kept simple + the
   *  documented failure mode is marine-on-chemical-plant). */
  const familyFires = (family: 'marine' | 'irrigation'): boolean => {
    if (family === 'marine') return !marine
    return true
  }

  // ── Worked-calcs ──────────────────────────────────────────────────────────
  for (const tool of tools) {
    const toolId = String(tool?.tool_id ?? tool?.tool_name ?? 'unknown-tool')
    const worked: any[] = Array.isArray(tool?.worked) ? tool.worked : []
    for (const w of worked) {
      const text = workedCalcText(w)
      const hits = scanTextForMarkers(text)
      for (const hit of hits) {
        if (!familyFires(hit.family)) continue
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
            `${toolId} presents ${hit.family} "${hit.marker}" physics in a non-marine ` +
            `${productClass || 'unknown'} class — a mis-applied/marine tool, likely a stand-in for a ` +
            `missing process tool. Offending worked-calc: "${trunc(text, 160)}"`,
        })
      }
    }
  }

  // ── Contract quantities ───────────────────────────────────────────────────
  for (const key of quantityKeys) {
    const value = quantities[key]
    const text = quantityText(key, value)
    const hits = scanTextForMarkers(text)
    for (const hit of hits) {
      if (!familyFires(hit.family)) continue
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
          `${source} emits a ${hit.family} "${hit.marker}" quantity (${key}) in a non-marine ` +
          `${productClass || 'unknown'} class — a mis-applied/marine tool, likely a stand-in for a ` +
          `missing process tool. Offending quantity: "${trunc(text, 160)}"`,
      })
    }
  }

  const verdict: ToolArchetypeVerdict = findings.length > 0 ? 'high' : 'pass'
  const message =
    verdict === 'high'
      ? `${findings.length} domain-mismatched tool(s)/quantity(ies) in non-marine "${productClass || 'unknown'}": ` +
        findings.map((f) => `${f.tool_id}[${f.family}:${f.marker}]`).join(', ')
      : marine
        ? `coherent — marine class "${productClass}", marine markers legitimate (${tools.length} tools, ${quantityKeys.length} quantities scanned)`
        : `coherent — no domain-mismatched tool markers in "${productClass || 'unknown'}" (${tools.length} tools, ${quantityKeys.length} quantities scanned)`

  return {
    verdict,
    product_class: productClass,
    is_marine_class: marine,
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
