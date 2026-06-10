/**
 * scripts/lib/orchestrator/design-features.ts
 *
 * PHASE 2 — feature-derived tool applicability. For an UNSEEN class the auto-planner
 * (auto-plan-fallback.ts) selects tools by I/O-key matching with NO domain check, so
 * it can pull DOMAIN-WRONG tools — the compute_heat run pulled a PEM-electrolyser
 * (domain `process`) + a BVLOS drone certification (domain `aero`). This layer infers
 * the design's RELEVANT tool domains from the envelope and lets the planner exclude
 * tools whose domain the design does not have.
 *
 * ADDITIVE + SAFE: registered classes bypass the auto-planner entirely (they match a
 * hand-written ClassToolPlan first), so this can only ever affect a novel class — it
 * cannot alter any existing class. The 12 live domains: process, thermal, mechanical,
 * aero, power_electronics, battery, standards, biochemistry, control_systems,
 * photonics, grid, parts_catalog.
 */

/** Domains relevant to almost any engineered product (structure, electronics,
 *  control, thermal rejection, standards, sourcing) — ALWAYS kept, so a feature-map
 *  miss can never drop the universal basics. */
const ALWAYS_DOMAINS: readonly string[] = [
  'standards', 'parts_catalog', 'control_systems', 'thermal', 'mechanical', 'power_electronics',
]

/** keyword → CONDITIONAL domain. Matched against the envelope's class + application +
 *  scale_tier. Deliberately BROAD: a false-INCLUDE (a slightly-irrelevant domain kept)
 *  is far cheaper than a false-EXCLUDE (a needed tool dropped), so triggers err toward
 *  keeping. */
const CONDITIONAL_TRIGGERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/chemical|process|reactor|distil|absorb|strip|crystallis|electrolys|capture|synthesis|refin|scrub|\bfuel\b|\bgas\b|fluid|solvent|catalys|carbonation|mineralis|sequestrat/i, 'process'],
  [/\bbio|protein|cell.?cultur|pharma|enzyme|microorganism|tissue|ferment|vaccine|insulin|biochem/i, 'biochemistry'],
  [/aero|wing|rotor|propeller|drone|\buav\b|aircraft|flight|airframe|\bblade\b|turbine|haps|aerodynam|hypersonic|spaceplane|launch|rocket|nozzle|thrust|orbit|satellite|spacecraft|cubesat|propuls/i, 'aero'],
  [/battery|\blfp\b|\bnmc\b|energy.?storage|\bbess\b|accumulator|supercap|\bess\b/i, 'battery'],
  [/optic|laser|photon|telescope|\bfso\b|lidar|spectrom|hyperspectral|sar_|_sar|\bsar\b|synthetic.?aperture|radar|imag|camera/i, 'photonics'],
  [/\bgrid\b|\bg99\b|utility|substation|feeder|distribution.?network|transmission|microgrid/i, 'grid'],
]

export interface DesignFeatures {
  domains: Set<string>
}

/** Infer the design's relevant tool domains from the envelope. Pure. */
export function designFeatures(
  envelope: { class?: string; application?: string; scale_tier?: string } | null | undefined,
): DesignFeatures {
  const hay = `${envelope?.class ?? ''} ${envelope?.application ?? ''} ${envelope?.scale_tier ?? ''}`.toLowerCase()
  const domains = new Set<string>(ALWAYS_DOMAINS)
  for (const [rx, dom] of CONDITIONAL_TRIGGERS) if (rx.test(hay)) domains.add(dom)
  return { domains }
}

/** Is a tool of this domain relevant to the design? A domain-agnostic tool
 *  (no declared domain) is always allowed; otherwise its domain must be relevant. */
export function toolDomainRelevant(toolDomain: string | undefined, features: DesignFeatures): boolean {
  if (!toolDomain) return true
  return features.domains.has(toolDomain)
}
