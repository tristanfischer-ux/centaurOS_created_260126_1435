/**
 * Cross-page numeric consistency audit — gate 18 (codified 2026-05-25,
 * task #123, council L22 universal-fix item #2).
 *
 * Universal across every product class. Catches the reader-fatal bug where
 * cover headline + Mission paragraph + module bodies print DIFFERENT scalars
 * for the SAME underlying engineering quantity within a few pages of one
 * another.
 *
 * Witnessed failure mode (BESS L22, 2026-05-25):
 *   - Cover headline (page 1): "USABLE ENERGY CAPACITY (BRIEF TARGET) 3.5 MWh"
 *   - Mission paragraph (page 2): "Deliver 2.69 MWh of usable energy"
 *   - Module 4 body (page 14):   "3.36 MWh nameplate at 800 V nominal"
 *
 * Three different MWh numbers within 14 pages all labelled "energy" — the
 * reader has no honest way to reconcile them. Some divergence is legitimate
 * (nameplate gross vs usable vs deliverable after degradation) BUT only when
 * the qualifier is explicit. When two near-identical noun phrases ("usable
 * energy" and "deliver ... usable energy") carry different values, that is
 * a contradiction the chain must catch BEFORE shipping the PDF.
 *
 * Algorithm:
 *
 *   1. pdftotext the PDF page-by-page (use -layout to preserve column
 *      structure for context window extraction).
 *
 *   2. Regex-extract every `<N> <unit>` occurrence. Recognised unit families:
 *        ENERGY     kWh, MWh, GWh, Wh
 *        POWER      kW, MW, GW
 *        VOLTAGE    V, kV, mV
 *        CURRENT    A, mA, kA
 *        MASS       kg, t, tonne, tonnes
 *        LENGTH     mm, m, km, cm
 *        TEMP       degC
 *        DATARATE   kbit/s, Mbit/s, Gbit/s, kbps, Mbps, Gbps
 *        FREQ       Hz, kHz, MHz, GHz
 *        PRESSURE   bar, Pa, kPa, MPa, psi
 *        MONEY      pound-N, pound-N,NNN.NN, pound-N.NNk, pound-N.NNM
 *
 *   3. For each occurrence, capture a CONTEXT WINDOW: 2-5 preceding words +
 *      0-2 following words. Strip page headers/footers, page numbers,
 *      "Forge Engineering Report", etc.
 *
 *   4. Normalise the noun phrase: lowercase, drop stopwords + filler
 *      ("the", "a", "an", "of", "is", "to", "at", "for", "with", "from",
 *      "and", "this", "that", "per", "design", "designed", "rated"), drop
 *      number-position artefacts ("1,", "2.", "3"), apply light stemming
 *      (drop trailing -s/-ed/-ing).
 *
 *   5. Classify each occurrence by UNIT FAMILY (power vs energy vs voltage —
 *      never cluster across families) AND ROLE QUALIFIER. Role qualifiers
 *      include "nameplate" / "rated" / "brief target" / "minimum" /
 *      "maximum" / "peak" / "continuous" / "nominal" / "actual" / "bol" /
 *      "eol" / "degraded" / "design". These are LEGITIMATE distinguishers —
 *      "nameplate 3.36 MWh" vs "usable 2.69 MWh" should not cluster.
 *
 *   6. Cluster occurrences sharing the same (head_noun, unit_family,
 *      role_qualifier). Within a cluster, normalise to the canonical unit
 *      (kWh for energy, V for voltage, kW for power, kg for mass, mm for
 *      length, GBP for money). Compute intra-cluster variance.
 *
 *      - variance > 1%  AND ≥2 distinct values  AND ≥2 occurrences in
 *        distinct context windows → HIGH (true contradiction)
 *      - variance 0.1-1% (rounding drift)                       → MED
 *      - variance ≤ 0.1% (identical values, just spread)        → ignored
 *
 *   7. Special case for MONEY: same value printed in different formats
 *      (pound-180,000 vs pound-180k vs pound-180.00k) is MED (formatting
 *      drift, not contradiction) — same UNDERLYING value, different
 *      RENDERING.
 *
 * Distinct from gate 12 (numeric-claim-drift-detector): gate 12 compares
 * orchestratorContract.quantities[N] vs BoM word.quantity (CODE-vs-CODE
 * drift). Gate 18 compares NARRATIVE-vs-NARRATIVE: the same noun phrase
 * appearing in TWO different prose locations in the rendered PDF with
 * conflicting scalars. The chain can pass gate 12 (contract matches BoM)
 * but still ship a PDF where the cover headline disagrees with the mission
 * paragraph because both are LLM-generated prose pulling from different
 * upstream sources.
 *
 * Distinct from gate 17 (brief-constraint completeness): gate 17 catches
 * MISSING ROWS in the Brief Compliance table; gate 18 catches CONFLICTING
 * VALUES in the prose body of the rendered PDF.
 *
 * False-positive guards:
 *   - Different unit families never cluster (cell 3.2 V vs string 800 V).
 *   - Different role qualifiers split clusters (nameplate vs usable).
 *   - At least TWO distinct context windows required (the same boilerplate
 *     line repeated identically on N pages should not flag).
 *   - PDF table rows where the same row is repeated by chunking are
 *     deduplicated by the (file-position, value, unit) tuple before
 *     clustering.
 *
 * Exit 18 on any HIGH finding. MED findings are informational, surfaced in
 * AUDIT-CONSISTENCY.md but do not block the chain.
 *
 * IMPLEMENTATION NOTE: this audit shells out to `pdftotext` and `pdfinfo`
 * via Node's `execFileSync` (NOT `exec`) with a fixed argv array. The input
 * `pdfPath` is supplied by the chain orchestrator (never by an LLM or
 * external user) and is treated as a trusted absolute path. The same
 * pattern is used by sibling audits `scripts/audit-pdf-bom.ts` (line 34)
 * and `scripts/audit-pdf-run.ts` (line 41); they are the canonical safe
 * subprocess invocation in this codebase.
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

// ── UNIT FAMILY DEFINITIONS ─────────────────────────────────────────────────
// Each family has a canonical unit + a multiplier table mapping each alias to
// its conversion factor TO the canonical unit. The canonical is chosen for
// stable comparison across natural rendering (e.g. MWh and kWh both stored as
// kWh internally; mm and m both stored as mm).

type UnitFamily =
  | 'ENERGY'
  | 'POWER'
  | 'VOLTAGE'
  | 'CURRENT'
  | 'MASS'
  | 'LENGTH'
  | 'TEMP'
  | 'DATARATE'
  | 'FREQ'
  | 'PRESSURE'

interface UnitDef {
  family: UnitFamily
  /** Multiplier to canonical unit of the family. */
  toCanonical: number
  /** Display name of the canonical unit for the family (used in reports). */
  canonical: string
}

// Order matters for regex matching: longer/more-specific units must match
// BEFORE shorter ones (kWh before Wh, kV before V, mAh before Ah).
// Each entry tests the EXACT unit token captured by the numeric regex.
const UNIT_TABLE: Array<{ test: (token: string) => boolean; def: UnitDef }> = [
  // ENERGY (canonical kWh)
  { test: (t) => t === 'GWh', def: { family: 'ENERGY', toCanonical: 1_000_000, canonical: 'kWh' } },
  { test: (t) => t === 'MWh', def: { family: 'ENERGY', toCanonical: 1_000, canonical: 'kWh' } },
  { test: (t) => t === 'kWh', def: { family: 'ENERGY', toCanonical: 1, canonical: 'kWh' } },
  { test: (t) => t === 'Wh', def: { family: 'ENERGY', toCanonical: 0.001, canonical: 'kWh' } },
  // POWER (canonical kW) — must come after the Wh entries above so that the
  // unit-extraction regex first matches the longer suffix.
  { test: (t) => t === 'GW', def: { family: 'POWER', toCanonical: 1_000_000, canonical: 'kW' } },
  { test: (t) => t === 'MW', def: { family: 'POWER', toCanonical: 1_000, canonical: 'kW' } },
  { test: (t) => t === 'kW', def: { family: 'POWER', toCanonical: 1, canonical: 'kW' } },
  // VOLTAGE (canonical V)
  { test: (t) => t === 'kV', def: { family: 'VOLTAGE', toCanonical: 1_000, canonical: 'V' } },
  { test: (t) => t === 'mV', def: { family: 'VOLTAGE', toCanonical: 0.001, canonical: 'V' } },
  { test: (t) => t === 'V', def: { family: 'VOLTAGE', toCanonical: 1, canonical: 'V' } },
  // CURRENT (canonical A)
  { test: (t) => t === 'kA', def: { family: 'CURRENT', toCanonical: 1_000, canonical: 'A' } },
  { test: (t) => t === 'mA', def: { family: 'CURRENT', toCanonical: 0.001, canonical: 'A' } },
  { test: (t) => t === 'A', def: { family: 'CURRENT', toCanonical: 1, canonical: 'A' } },
  // MASS (canonical kg)
  { test: (t) => t === 'tonnes' || t === 'tonne', def: { family: 'MASS', toCanonical: 1_000, canonical: 'kg' } },
  { test: (t) => t === 't', def: { family: 'MASS', toCanonical: 1_000, canonical: 'kg' } },
  { test: (t) => t === 'kg', def: { family: 'MASS', toCanonical: 1, canonical: 'kg' } },
  // LENGTH (canonical mm)
  { test: (t) => t === 'km', def: { family: 'LENGTH', toCanonical: 1_000_000, canonical: 'mm' } },
  { test: (t) => t === 'cm', def: { family: 'LENGTH', toCanonical: 10, canonical: 'mm' } },
  { test: (t) => t === 'mm', def: { family: 'LENGTH', toCanonical: 1, canonical: 'mm' } },
  { test: (t) => t === 'm', def: { family: 'LENGTH', toCanonical: 1_000, canonical: 'mm' } },
  // TEMP (canonical degC)
  { test: (t) => t === '°C', def: { family: 'TEMP', toCanonical: 1, canonical: '°C' } },
  // DATARATE (canonical kbit/s)
  { test: (t) => t === 'Gbit/s' || t === 'Gbps', def: { family: 'DATARATE', toCanonical: 1_000_000, canonical: 'kbit/s' } },
  { test: (t) => t === 'Mbit/s' || t === 'Mbps', def: { family: 'DATARATE', toCanonical: 1_000, canonical: 'kbit/s' } },
  { test: (t) => t === 'kbit/s' || t === 'kbps', def: { family: 'DATARATE', toCanonical: 1, canonical: 'kbit/s' } },
  // FREQ (canonical Hz)
  { test: (t) => t === 'GHz', def: { family: 'FREQ', toCanonical: 1_000_000_000, canonical: 'Hz' } },
  { test: (t) => t === 'MHz', def: { family: 'FREQ', toCanonical: 1_000_000, canonical: 'Hz' } },
  { test: (t) => t === 'kHz', def: { family: 'FREQ', toCanonical: 1_000, canonical: 'Hz' } },
  { test: (t) => t === 'Hz', def: { family: 'FREQ', toCanonical: 1, canonical: 'Hz' } },
  // PRESSURE (canonical bar)
  { test: (t) => t === 'MPa', def: { family: 'PRESSURE', toCanonical: 10, canonical: 'bar' } },
  { test: (t) => t === 'kPa', def: { family: 'PRESSURE', toCanonical: 0.01, canonical: 'bar' } },
  { test: (t) => t === 'bar', def: { family: 'PRESSURE', toCanonical: 1, canonical: 'bar' } },
  { test: (t) => t === 'psi', def: { family: 'PRESSURE', toCanonical: 0.0689476, canonical: 'bar' } },
]

// ── PHRASE NORMALISATION ────────────────────────────────────────────────────

const STOPWORDS = new Set<string>([
  'the', 'a', 'an', 'of', 'is', 'to', 'at', 'for', 'with', 'from', 'and',
  'this', 'that', 'per', 'design', 'designed', 'over', 'between',
  'on', 'in', 'by', 'or', 'be', 'has', 'have',
  'we', 'are', 'designing',
])

/** STRONG qualifiers split clusters — they describe a genuinely different
 * engineering quantity (3.36 MWh NAMEPLATE vs 2.69 MWh USABLE are different
 * scalars by design, not contradictions). Also splits subsystem boundaries
 * (DC vs AC, cell vs string, pack vs rack) which legitimately carry
 * different scalars in the same unit family. */
const STRONG_QUALIFIERS = new Set<string>([
  'nameplate', 'rated', 'peak', 'continuous', 'nominal',
  'bol', 'eol', 'degraded', 'usable', 'gross', 'net',
  'derated', 'aggregate', 'installed',
  // Subsystem / scope discriminators
  'dc', 'ac', 'cell', 'string', 'pack', 'rack', 'module',
  'bus', 'busbar', 'output', 'input', 'primary', 'secondary',
  'inverter', 'pcs', 'transformer', 'chiller', 'pump',
  'inlet', 'outlet', 'supply', 'return',
  // Circuit-level sense/monitoring qualifiers — LEM / Hall-effect current
  // transducers come in MULTIPLE ratings for different circuits in a BESS
  // (cell-string: ~100 A, rack-level: ~300 A, main bus: ~2000 A). These are
  // legitimately different parts for different sense circuits. Without these
  // tokens the audit clusters all current transducer ratings together and
  // fires a false-positive HIGH. Added 2026-05-25 after BESS L30 false-pos.
  'main', 'sense', 'monitoring', 'metering',
  // "rating" as a strong qualifier splits "your specific current rating 2000A"
  // (a sourcing-note parenthetical) from "100 A nominal" design claims.
  // Both "rated" (already above) and "rating" appear near component specs;
  // treating them as STRONG splits sourcing-note citations from system claims.
  'rating',
  // Measuring-instrument range/span discriminators — a transducer's MEASURING
  // RANGE (e.g. a Hall-effect DC-bus voltage transducer with a 1000 V range
  // that "covers the 800 V nominal") is an instrument spec, NOT the system's
  // operating value. Without these the audit clustered the 1000 V range with
  // the 800 V nominal bus voltage and fired a false-positive HIGH. Added
  // 2026-05-29 after BESS iter-68 false-positive.
  'transducer', 'transmitter', 'measuring', 'measurement', 'span',
  // Alternative-scenario discriminators — values presented under
  // "IF prioritise CAPEX/MASS (alternative scenario):" in the design
  // decisions section are legitimately different from the canonical
  // design value and the brief target. They must not cluster with
  // occurrences from the cover headline, mission paragraph, or
  // compliance table. Added 2026-05-25 after BESS L27 false-positive:
  // 450 kWh / 2340 kWh alt-brief values clustering with 2690 kWh
  // design value and 3500 kWh brief target.
  'alternative', 'scenario', 'hypothetical',
  // Power-conversion stage discriminators — a 350 kW AFE (active front-end
  // rectifier) and a 30 kW LLC-resonant DC-DC converter are DIFFERENT power
  // stages of the same charger, each with its own legitimate rating; the shared
  // "power"/"module" anchor must not cluster them. Added 2026-05-31 after the
  // ev-charger go-wide false-positive (350 kW AFE clustered with 30 kW DC-DC).
  'afe', 'dc-dc', 'dcdc', 'ac-dc', 'acdc', 'llc', 'llc-resonant',
  'rectifier', 'converter', 'pfc', 'boost', 'buck',
  // Recommendation / trade-off role — an auto-improve recommendation ("downrate
  // rated power to ~46.7 kW to meet the cost ceiling") is a suggested
  // alternative, not the as-built value ("rated power 350 kW"); they describe
  // different things and must not cluster. Added 2026-05-31 (ev-charger).
  'recommend', 'recommended', 'recommendation', 'downrate', 'downrated', 'tradeoff', 'trade-off',
  // Mass-scope discriminators — empty vs laden/takeoff vs payload vs a single
  // structural component are DIFFERENT masses; without these the audit clusters
  // all the aircraft/vehicle masses together. Added 2026-05-31 (haps go-wide:
  // 52.7 kg empty / 75 kg / 95 kg takeoff mashed into one "mass" contradiction).
  'empty', 'laden', 'unladen', 'takeoff', 'mtom', 'mtow', 'tare', 'kerb', 'payload',
])

/** WEAK qualifiers do NOT split clusters — "minimum target capacity" should
 * cluster with "target capacity" because "minimum" is a constraint on the
 * same engineering quantity, not a different quantity. We retain weak
 * qualifiers in the report for clarity but do not key on them. */
const WEAK_QUALIFIERS = new Set<string>([
  'minimum', 'maximum', 'target', 'brief', 'actual', 'theoretical',
  'measured', 'calculated', 'available', 'effective',
])

const ROLE_QUALIFIERS = new Set<string>([...STRONG_QUALIFIERS, ...WEAK_QUALIFIERS])

// L54 fix (2026-05-28): REQUIREMENT-vs-ACHIEVED role split. A brief-stated
// requirement (e.g. "2.5 MWh minimum / brief target") and the design's
// achieved value (e.g. "Mission: deliver 2.69 MWh") are DIFFERENT quantities
// — the spec vs the result. gate 11 must only flag two values of the SAME
// role. Before this fix, "2.5 MWh (BRIEF TARGET)" and "2.69 MWh (deliver)"
// clustered together (both anchor=energy, qual=usable, since minimum/target/
// brief are WEAK and don't split) and produced a 7.32% "contradiction" HIGH
// on every over-delivering BESS — the single most common false exit-18.
// Adding the role to the cluster key splits them. The L22-class REAL bug
// (a wrong "3.5 MWh BRIEF TARGET" vs the true 2.5 MWh brief) is preserved:
// two requirement-role values still cluster and still flag.
//
// Detection is per-occurrence on the local pre/post window. REQUIREMENT
// tokens live in the qualifier stream (brief/target/minimum are WEAK_QUALIFIERS)
// + extra head lexemes; ACHIEVED tokens are head lexemes (stemmed).
const REQUIREMENT_ROLE_TOKENS = new Set<string>([
  'brief', 'target', 'minimum', 'requir', 'required', 'requirement',
  'specifi', 'specified', 'floor', 'mandate', 'mandated', 'stipulat',
])
const ACHIEVED_ROLE_TOKENS = new Set<string>([
  'deliver', 'achiev', 'mission', 'asbuilt', 'as-built', 'close',
  'provid', 'yield', 'produc', 'attain', 'realis', 'realiz', 'actual',
  'design',
])

// 2026-06-01 (gate-18 FIX 2b — cnc false-positive): a COST-CEILING LEVER /
// RECOMMENDATION value is a "what-if you downrate/substitute to hit the cost
// ceiling" suggestion, NOT a claim about the design. CNC L? cover prose
// (recommendation list L1/L2/L3): "Downrate spindle power to ~17.1 kW to meet
// the £280k ceiling" appears twice (p2 + p8) and clustered with the real
// design value "Spindle power 22 kW" (8+ occurrences) → false HIGH 17.1 vs 22.
// A recommendation lever is a different quantity-ROLE than the design value —
// the same kind of split the file already makes for alternative-scenario
// values (STRONG qualifiers alternative/scenario/hypothetical). These two
// token sets identify the lever (downrate/derate/substitute/recommend) AND the
// cost-ceiling target (meet/fit a ceiling/budget); BOTH must be present so a
// bare "downrate" elsewhere doesn't over-split.
const RECOMMENDATION_LEVER_TOKENS = new Set<string>([
  'downrate', 'derate', 'substitut', 'substitute', 'recommend', 'recommended',
  'recommends', 'lever', 'trade-off', 'tradeoff', 'reduce', 'downsize',
])
const COST_CEILING_TARGET_TOKENS = new Set<string>([
  'ceil', 'ceiling', 'budget', 'meet', 'fit', 'cap', 'within',
])

// 2026-06-01 (gate-18 FIX 2a — cnc false-positive): MASS-SCOPE split. A
// SYSTEM-TOTAL mass (the whole machine / shipment — "Mass: ≤ 8,500 kg
// single-truck road transport") and a single-COMPONENT mass (one part —
// "machine base ... ≥ 4,500 kg base mass") are PHYSICALLY DISTINCT quantities,
// never a contradiction. Without a discriminator they share anchor=mass and
// cluster → false HIGH (cnc: 8,500 system cap vs 4,500 cast-iron base, variance
// 61.5%). This is the same kind of strong-qualifier split the file already
// makes for nameplate≠usable and continuous≠peak. These token sets classify a
// mass occurrence's SCOPE from its raw window. Matched against lowercased raw
// pre/post tokens (NOT stemmed head) to avoid stemmer mangling (e.g. "shipping"
// → "shipp"). gross/net/aggregate are also STRONG qualifiers already, so they
// independently split too; scope adds the system-vs-component axis those miss.
const MASS_SYSTEM_SCOPE_TOKENS = new Set<string>([
  'gross', 'total', 'system', 'system-mass', 'overall', 'complete', 'entire',
  'whole', 'assembled', 'payload', 'shipping', 'shipped', 'shipment',
  'transport', 'transported', 'single-truck', 'truck', 'road', 'haul',
  'gvw', 'gvm', 'curb', 'kerb', 'laden', 'in-container',
])
const MASS_COMPONENT_SCOPE_TOKENS = new Set<string>([
  'base', 'casting', 'cast-iron', 'castiron', 'meehanite', 'column', 'bridge',
  'frame', 'bracket', 'component', 'subassembly', 'sub-assembly', 'bedplate',
  'saddle', 'ram', 'trunnion', 'cradle', 'plate', 'block', 'flange', 'rib',
  'ribbing', 'casing', 'housing', 'rotor', 'stator', 'blade', 'hub', 'tower',
  'foundation', 'enclosure', 'cabinet', 'module', 'rack', 'pack', 'cell',
])

/** Classify an occurrence's role from its local window tokens.
 *   achieved   = the design's delivered value ("Mission: deliver 2.69 MWh")
 *   req-floor  = a brief minimum / floor ("2.5 MWh minimum")
 *   req-target = a brief over-deliver target ("over-delivers to ≥2.65 MWh")
 *   requirement= a brief spec with no floor/target discriminator
 *   neutral    = none of the above (clusters as before).
 *
 * ACHIEVED wins over requirement when both signals are in one window (the
 * annotated NUMBER is the delivered one). Within requirement, floor vs target
 * split so a brief's own "2.5 minimum / 2.65 over-deliver target" pair — both
 * requirement-role — does not itself become a false contradiction.
 *
 * Why this preserves the L22-class REAL bug: L22 had a WRONG "3.5 MWh BRIEF
 * TARGET" on the cover vs the true 2.5 MWh brief reproduction. Both are
 * requirement-role (req-target / req-floor) — a 3.5 mislabelled as the target
 * still clusters with other req-target values and still flags. Only the
 * legitimate requirement-vs-achieved pair (2.5 spec / 2.69 delivered) stops
 * being a false positive. */
function roleOf(feat: { head: string[]; qualifiers: string[] }): string {
  const toks = [...feat.head, ...feat.qualifiers]
  // RECOMMENDATION dominates: a "downrate/substitute X to meet the cost ceiling"
  // lever value is not a claim about the design. Requires BOTH a lever token AND
  // a cost-ceiling target token so a bare "reduce" / "meet" elsewhere does not
  // over-split. NOT-MASKING-REAL-FAILURES: two recommendation values that
  // disagree still share role=recommendation → still cluster → still flag (the
  // doc should not quote two different downrate targets for one lever); only a
  // recommendation-vs-design pair stops being a false contradiction.
  if (
    toks.some((t) => RECOMMENDATION_LEVER_TOKENS.has(t)) &&
    toks.some((t) => COST_CEILING_TARGET_TOKENS.has(t))
  ) {
    return 'recommendation'
  }
  if (toks.some((t) => ACHIEVED_ROLE_TOKENS.has(t))) return 'achieved'
  if (toks.some((t) => REQUIREMENT_ROLE_TOKENS.has(t))) {
    const hasFloor = toks.some((t) => t === 'minimum' || t === 'floor')
    const hasTarget = toks.some((t) => t === 'target' || t === 'overdeliver' || t === 'over-deliver')
    if (hasFloor && !hasTarget) return 'req-floor'
    if (hasTarget && !hasFloor) return 'req-target'
    return 'requirement'
  }
  return 'neutral'
}

/** Light stemming — drop common verb/noun suffixes. */
function stem(token: string): string {
  let t = token
  if (t.length > 4 && t.endsWith('ies')) t = t.slice(0, -3) + 'y'
  if (t.length > 4 && t.endsWith('ing')) t = t.slice(0, -3)
  if (t.length > 3 && t.endsWith('ed')) t = t.slice(0, -2)
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1)
  return t
}

/** Tokenise context window and split into (role qualifiers, head tokens). */
function classifyTokens(tokens: string[]): { qualifiers: string[]; head: string[] } {
  const qualifiers: string[] = []
  const head: string[] = []
  for (const raw of tokens) {
    const t = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '')
    if (!t) continue
    if (STOPWORDS.has(t)) continue
    if (/^\d+([.,]\d+)?$/.test(t)) continue // numeric scrap
    if (t.length < 2) continue
    // Check BOTH the raw token and its stem against the qualifier set, so a
    // PLURAL discriminator ("power modules", "SiC rectifiers", "DC-DC
    // converters") splits a cluster the same way its singular does. Without the
    // stem check, "modules" fell through to head (stem→"module") and never
    // split the 30 kW module from the 350 kW charger. Additive — raw matches
    // still win, so existing splits are unchanged. Added 2026-05-31 (ev-charger).
    if (ROLE_QUALIFIERS.has(t)) {
      qualifiers.push(t)
      continue
    }
    if (ROLE_QUALIFIERS.has(stem(t))) {
      qualifiers.push(stem(t))
      continue
    }
    head.push(stem(t))
  }
  return { qualifiers, head }
}

/** Head tokens that are SO ubiquitous in engineering prose that an exact
 * match on them constitutes meaningful coupling (e.g. "energy", "capacity",
 * "power"). These are anchors for cross-context clustering. Two occurrences
 * sharing any one of these head tokens AND the same family cluster
 * together, even if their other tokens differ. */
const ANCHOR_HEAD_TOKENS = new Set<string>([
  'energy', 'capacity', 'power', 'throughput', 'voltage', 'current',
  'mass', 'weight', 'length', 'width', 'height', 'depth', 'thicknes',
  'temperatur', 'pressur', 'frequency', 'cost', 'price', 'rate',
  'efficiency', 'lifetim', 'durabili', 'durability',
])

/** Family-specific anchor mapping — when the unit family is X, only these
 * anchors count as authentic head nouns. Prevents an "energy" anchor from
 * grouping with a kW measurement (legitimate but ambiguous prose).
 *
 * IMPORTANT: anchors must be SPECIFIC enough to identify a particular
 * engineering quantity, not GENERIC catch-alls. "dimension" was originally
 * a LENGTH anchor but produced false positives because every part has
 * dimensions and the anchor collapsed 10 distinct parts into one cluster.
 * Anchors describe WHICH quantity, not THAT it has a value. */
const FAMILY_ANCHORS: Record<UnitFamily, Set<string>> = {
  ENERGY: new Set(['energy', 'capacity', 'throughput']),
  POWER: new Set(['power', 'discharge', 'output']),
  VOLTAGE: new Set(['voltage', 'volt']),
  CURRENT: new Set(['current', 'amp']),
  MASS: new Set(['mass', 'weight']),
  // LENGTH has no anchor tokens by default — dimensional measurements are
  // inherently per-part and "envelope"/"footprint" lexemes overlap with
  // pressure-envelopes, mounting-footprints, etc. LENGTH still surfaces
  // strict identical-phrase fallback clusters via the non-anchor path
  // (but PART_SPECIFIC_FAMILIES excludes LENGTH from fallback too — see
  // the cluster() function).
  LENGTH: new Set([]),
  TEMP: new Set(['temperatur', 'ambient']),
  DATARATE: new Set(['bandwidth']),
  FREQ: new Set(['frequency']),
  PRESSURE: new Set(['pressur']),
}

// ── MONEY DETECTION (separate code path) ────────────────────────────────────
// Money is GBP-only in this codebase. Renderings that must reconcile:
//   pound-180,000     (full digits with thousands separators)
//   pound-180.00      (plain decimal)
//   pound-180k        (k-suffix)
//   pound-180.5k      (k-suffix with decimal)
//   pound-1.2M        (M-suffix, capital M)
//   pound-0.45        (sub-pound)

interface MoneyOccurrence {
  page: number
  rawText: string
  valueGbp: number
  rendering: 'commas' | 'k_suffix' | 'M_suffix' | 'plain'
  context: string
}

const POUND_REGEX = /£\s*([0-9]+(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?(?:[kM])?|[0-9]+(?:\.[0-9]+)?)/g

function parseMoney(raw: string): { valueGbp: number; rendering: MoneyOccurrence['rendering'] } | null {
  const m = raw.match(/£\s*([0-9.,]+)([kM])?/)
  if (!m) return null
  const numPart = m[1]
  const suffix = m[2] as 'k' | 'M' | undefined
  let value: number
  let rendering: MoneyOccurrence['rendering']
  if (numPart.includes(',')) {
    value = parseFloat(numPart.replace(/,/g, ''))
    rendering = 'commas'
  } else {
    value = parseFloat(numPart)
    rendering = suffix ? (suffix === 'k' ? 'k_suffix' : 'M_suffix') : 'plain'
  }
  if (!Number.isFinite(value)) return null
  if (suffix === 'k') value *= 1_000
  if (suffix === 'M') value *= 1_000_000
  return { valueGbp: value, rendering }
}

// ── EXTRACTION ──────────────────────────────────────────────────────────────

interface NumericOccurrence {
  page: number
  rawValue: string // as it appeared in the PDF (e.g. "3.5")
  numericValue: number // parsed as float
  unitToken: string // matched unit (e.g. "MWh")
  family: UnitFamily
  canonicalValue: number // normalised to family canonical (e.g. 3500 kWh)
  canonicalUnit: string
  contextWindow: string // ~30 chars before + 10 after
  preTokens: string[] // 6 tokens before
  postTokens: string[] // 4 tokens after
  /** When the number is the RHS of a tool-output assignment
   * "<field_name> = <value>" (e.g. "absorber shell mass = 1,274 kg"), this is
   * the normalised field name immediately preceding the "=" (e.g.
   * "absorbershellmass"). null when the occurrence is free prose, not an
   * assignment. Used to anchor distinct tool-output fields into distinct
   * clusters so a run-on "name = a, name = b, name = c" sentence does not
   * collapse every value into one false contradiction. Added 2026-06-03. */
  fieldKey: string | null
}

/** Extract the FIELD NAME from a tool-output assignment "<field> = <number>".
 *
 * Tool-computation prose packs many DISTINCT engineering quantities into one
 * run-on sentence: "computed absorber shell mass = 1,274 kg, stripper shell
 * mass = 940 kg, reactor shell mass = 905 kg". Every value shares the generic
 * family anchor "mass", so without a per-field discriminator they collapse
 * into a single cluster and fire a false contradiction (the co2-mineralisation
 * gate-18 case, 2026-06-03). The SPECIFIC field name sits immediately before
 * the "=". We take the run of name words between the preceding delimiter
 * (comma / semicolon / period / bullet / open-paren / colon) and the "=",
 * then normalise: lowercase, strip a trailing unit-suffix token from snake_case
 * identifiers (cp_anode_mass_KG → cp_anode_mass), drop non-alphanumerics. The
 * result keys the cluster, so each distinct field is its own cluster.
 *
 * Returns null when `preText` does not end in an assignment (`... = ` directly
 * before the number) — i.e. ordinary prose ("deliver 2.69 MWh of usable
 * energy") is untouched, preserving the L22 BESS cover-vs-mission detection.
 *
 * UNIVERSAL: every tool-rich class (BESS, wind, ev-charger, co2, …) emits this
 * "<field> = <value>" pattern from its orchestrator tool outputs; the fix needs
 * no per-class table. */
const ASSIGNMENT_FIELD_STOPWORDS = new Set<string>([
  'computed', 'compute', 'computes', 'confirms', 'confirm', 'confirmed',
  'this', 'the', 'a', 'an', 'of', 'for', 'is', 'are', 'design', 'check',
  'assumes', 'assume', 'where', 'with', 'and', 'gives', 'yields', 'at',
])
// A trailing snake_case unit suffix (…_kg, …_kw, …_a, …_t, …_mm, …_v, …_mpa,
// …_m, …_kwh, …_mwh, …_pct, …_y, …_yr, …_c) is a UNIT annotation on the field
// name, not part of the field IDENTITY. "cp_anode_mass_kg" and the prose form
// "cp anode mass" must map to the SAME field key so a snake_case spec-dump line
// and a sentence form of the same quantity still cluster (and a genuine
// contradiction between them still fires).
const FIELD_UNIT_SUFFIX = /_(?:kg|t|kw|mw|gw|w|kwh|mwh|gwh|wh|a|ma|ka|v|kv|mv|mm|cm|km|m|mpa|kpa|pa|bar|psi|hz|khz|mhz|ghz|c|pct|percent|y|yr|yrs|years|m2|m3|lpm|nm)$/
function extractAssignmentFieldKey(preText: string): string | null {
  // Require the text to end with "= " (optionally with whitespace/newlines)
  // directly before where the number begins.
  if (!/=\s*$/.test(preText)) return null
  // Drop the trailing "= " then take everything after the last hard delimiter.
  const beforeEq = preText.replace(/=\s*$/, '')
  // Split on delimiters that separate one "field = value" clause from the next:
  // comma, semicolon, bullet/middot, pipe, colon, open/close paren, and a
  // sentence period. Take the LAST segment — the field name for THIS value.
  const seg = beforeEq.split(/[,;:•·|()•·]|\.\s/).pop() ?? ''
  const allTokens = seg
    .replace(PRE_CONTEXT_NOISE, ' ')
    .split(/[\s]+/)
    .map((t) => t.toLowerCase().replace(/[^a-z0-9_]/g, ''))
    .filter(Boolean)
    .filter((t) => !ASSIGNMENT_FIELD_STOPWORDS.has(t))
  // A field name is the SHORT noun phrase immediately before "=" (1-4 words:
  // "absorber shell mass", "cp protection current", "mea pump motor"). When the
  // assignment is the FIRST clause in a sentence there is no preceding
  // delimiter, so `seg` also captures the sentence/section prefix ("Mass
  // Aggregator Envelope Check computed total plant mass"). Keep only the LAST 4
  // tokens so the prefix (page title, restated/continued markers) cannot
  // pollute the key and split two occurrences of the SAME field across pages —
  // that pollution is what hid a genuine same-field contradiction before. Snake
  // identifiers are a single token and unaffected by the cap.
  const tokens = allTokens.slice(-4)
  if (tokens.length === 0) return null
  // Normalise each token: strip a trailing snake_case unit suffix so
  // "cp_anode_mass_kg" === "cp anode mass". Then concatenate the alphanumerics.
  const norm = tokens
    .map((t) => t.replace(FIELD_UNIT_SUFFIX, ''))
    .join('')
    .replace(/[^a-z0-9]/g, '')
  // Guard: a 1-char remnant (e.g. a lone "t" from "CO2 t =") is not a usable
  // field identity — fall back to null so the occurrence clusters normally.
  if (norm.length < 3) return null
  return norm
}

/** Run pdftotext page-by-page; returns Map<pageNumber, text>. */
function extractPagesText(pdfPath: string): Map<number, string> {
  // First check page count.
  let totalPages = 0
  try {
    const out = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf-8' })
    const m = out.match(/^Pages:\s+(\d+)/m)
    if (m) totalPages = parseInt(m[1], 10)
  } catch {
    // pdfinfo may not be installed; fall back to single-pass extraction.
  }
  const pages = new Map<number, string>()
  // We use pdftotext WITHOUT -layout. Layout-mode flattens KPI cards and
  // multi-column tables onto single lines, which puts adjacent KPI values
  // (e.g. "1,022 MWh / year" + "3.5 MWh" + "0.92 ratio") side-by-side and
  // ruins the noun-phrase locality the audit needs. Plain mode keeps the
  // label-on-one-line-then-value-on-the-next vertical flow that the cover
  // page and headline cards use.
  if (totalPages > 0) {
    for (let p = 1; p <= totalPages; p++) {
      try {
        const txt = execFileSync(
          'pdftotext',
          ['-f', String(p), '-l', String(p), pdfPath, '-'],
          { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 },
        )
        pages.set(p, txt)
      } catch (err) {
        // Skip individual page failures rather than aborting the whole audit.
        console.error(`[consistency-audit] pdftotext failed on page ${p}: ${(err as Error).message.slice(0, 100)}`)
      }
    }
  } else {
    // Single-pass fallback: pretend the whole doc is page 1.
    try {
      const txt = execFileSync('pdftotext', [pdfPath, '-'], {
        encoding: 'utf-8',
        maxBuffer: 64 * 1024 * 1024,
      })
      pages.set(1, txt)
    } catch (err) {
      console.error(`[consistency-audit] pdftotext failed: ${(err as Error).message}`)
    }
  }
  return pages
}

/** Strip page header/footer noise. Headers contain "FORGE ENGINEERING REPORT",
 * project IDs like "chain-v2-NNNNNNNNNN", "SECTION N · ...", "Generated YYYY-MM-DD",
 * pagination "N / M". Footers contain the date and page numbers. */
function stripBoilerplate(pageText: string): string {
  return pageText
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      if (!t) return false
      if (/^FORGE ENGINEERING REPORT$/i.test(t)) return false
      if (/^Forge Engineering Report\s*\d+\s*\/\s*\d+/.test(t)) return false
      if (/^SECTION \d+ · /i.test(t)) return false
      if (/^chain-v2-\d{10,}\s*$/.test(t)) return false
      if (/^Project:\s+chain-v2-\d{10,}/.test(t)) return false
      if (/^Generated 20\d\d-\d\d-\d\d/.test(t)) return false
      if (/^Page \d+\s*$/i.test(t)) return false
      return true
    })
    .join('\n')
}

const PRE_CONTEXT_NOISE = /[•·│┃║◦◆●▶◀<>→←—–]/g

/** Detect whether the match at `matchStart` is part of a numeric range
 * (e.g. "-20 to +50 °C" or "10 - 20 mm" or "-20 °C to +50 °C"). Ranges
 * have two values bound by "to" / "-" / "and" / "..", with EITHER value
 * carrying the unit. We don't want the second value of a range (which is
 * just "the other end" of the same scalar) to cluster against unrelated
 * occurrences as if it were an independent scalar claim. */
function isPartOfRange(cleaned: string, matchStart: number): boolean {
  const pre = cleaned.slice(Math.max(0, matchStart - 40), matchStart).trim()
  // Pattern A: "<num> to <THIS>" — possibly with intermediate unit
  if (/-?\d+(?:\.\d+)?\s*(?:°C|°F|K|mm|cm|m|kg|MWh|kWh|MW|kW|V|kV|A|kA|bar|Hz)?\s*(?:to|and|\.\.|–|—|through)\s*[+-]?\s*$/.test(pre)) return true
  // Pattern B: "<num> - <THIS>" hyphen range. Risky because dashes also
  // appear in part numbers (M22-DL); require WHITESPACE on both sides.
  if (/-?\d+(?:\.\d+)?\s+(?:to|and|\.\.|–|—|-)\s+[+-]?\s*$/.test(pre)) return true
  return false
}

function extractOccurrences(pageText: string, page: number): NumericOccurrence[] {
  const cleaned = stripBoilerplate(pageText)
  const occurrences: NumericOccurrence[] = []
  // Generic numeric+unit regex. Matches "3.5 MWh", "3,750", "800 V", "1,022 MWh",
  // "1.25 MW", "12192 mm", "-20 °C", "+50°C", etc. Captures optional sign.
  const numberUnitRegex = /([+-]?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(°C|[a-zA-Z]+(?:\/[a-zA-Z]+)?)/g
  let m: RegExpExecArray | null
  while ((m = numberUnitRegex.exec(cleaned)) !== null) {
    const sign = m[1] // '+', '-', or ''
    const intPart = m[2]
    const decPart = m[3] ?? ''
    const unitToken = m[4]
    const rawValueStr = (sign || '') + (decPart ? `${intPart}.${decPart}` : intPart)
    const numericValue = parseFloat(rawValueStr.replace(/,/g, ''))
    if (!Number.isFinite(numericValue)) continue
    if (numericValue === 0) continue // 0 is rarely a meaningful claim
    const found = UNIT_TABLE.find((u) => u.test(unitToken))
    if (!found) continue
    const def = found.def
    // Skip negative scalars for families where negativity is physically
    // impossible (a "-40 kW" power, "-300 kg" mass, "-£5k" cost are always parse
    // artefacts — most commonly the second half of a no-space range such as
    // "30-40kW", where "-40kW" matches with the hyphen read as a minus sign and
    // isPartOfRange's whitespace-hyphen pattern doesn't fire). TEMP legitimately
    // goes negative (-40 °C), so it is exempt. Added 2026-05-31 (ev-charger).
    if (numericValue < 0 && def.family !== 'TEMP') continue
    const canonicalValue = numericValue * def.toCanonical
    // Pre-context: 6 tokens before, post-context: 4 tokens after.
    const matchStart = m.index
    // Skip range-bound second values ("-20 to +50 °C") — these are the
    // upper bound of a stated range and should not cluster as if they were
    // an independent scalar claim about ambient temperature.
    if (isPartOfRange(cleaned, matchStart)) continue
    // Skip ±-notation values ("±300 A" tolerance / measuring-range spec) —
    // a ±N <unit> is a tolerance band or symmetric range, not an independent
    // scalar claim about a system quantity. Pattern: the Unicode plus-minus
    // sign (U+00B1) immediately precedes the matched number.
    // Added 2026-05-25: LEM HASS 100-S transducer prose emits
    // "±300 A peak measuring range" and "tolerance: ±300 A" — without this
    // guard the 300 A tolerance clusters with the 100 A nominal rating and
    // fires a false-positive HIGH.
    {
      const preChar = cleaned.slice(Math.max(0, matchStart - 4), matchStart)
      if (/±\s*$/.test(preChar)) continue
    }
    // Skip ratio-notation values ("1500/5A" → 5A is the CT secondary, not
    // a separate scalar claim). Pattern: <num>/ immediately precedes.
    {
      const preChar = cleaned.slice(Math.max(0, matchStart - 12), matchStart)
      if (/\d+\/\s*$/.test(preChar)) continue
    }
    // Skip the LOW end of a no-space product/spec RANGE ("250kW-1MW" — a supplier
    // catalogue power range, not this design's value). The negative-skip above
    // already drops the HIGH end ("-1MW"); this catches the FIRST value, which
    // matches as a positive number and would otherwise cluster with a real design
    // scalar. Added 2026-05-31 after BESS Nidec inverter range (250kW-1MW) clustered
    // with 15 kW inverter dissipation. Only fires on `<unit>-<digit>` (a genuine
    // range), so a real contradiction (never a hyphen-number) is unaffected.
    {
      const postChar = cleaned.slice(matchStart + m[0].length, matchStart + m[0].length + 6)
      if (/^\s*[-–—]\s*\d/.test(postChar)) continue
    }
    // Skip derate-table second values ("36 kW @ 35°C / 21.6 kW @ 50°C") —
    // these are the second ambient in a derate table, not a contradiction.
    // The pattern: <prev_num> <unit> @ <THIS_temp> appearing inside a
    // slash- or pipe-separated derate pair.
    {
      const preWindow = cleaned.slice(Math.max(0, matchStart - 60), matchStart)
      if (/\b\d+(?:\.\d+)?\s*(?:kW|W|MW|kWh|MWh|A|V|kV)\s*@/i.test(preWindow)) {
        // The match is preceded by "<num> <unit> @" which signals a derate
        // table entry. Only skip when the unit token is a temperature so
        // we don't accidentally skip the X kW value itself.
        if (def.family === 'TEMP') continue
      }
    }
    // CHARGE-vs-CURRENT dimension guard (2026-06-03, gate-18 co2 false-positive
    // case 2). pdftotext extracts "39,420 A-hr" as the number "39,420" + unit
    // "A" (the unit regex stops at the hyphen). An ampere-HOUR is a CHARGE
    // (current × time), a different physical dimension from an ampere (CURRENT);
    // "39,420 A-hr" must NOT cluster with "0.225 A". The matched-unit token is
    // CURRENT (A / mA / kA) but the immediately-following characters spell out
    // "-hr" / "·hr" / "h" (ampere-hours) or "-hr/kg" (specific charge capacity).
    // Skip the occurrence entirely — it is not a current claim. Mirrors the
    // kWh-vs-kW family separation the UNIT_TABLE already encodes (ENERGY ≠ POWER)
    // for the case where the "h" is severed from "A" by a hyphen. Universal:
    // any tool-output that prints a charge (anode sizing, battery Ah ratings)
    // benefits. A real current contradiction (two bare-A values) is unaffected
    // because bare amperes are never followed by an "h".
    if (def.family === 'CURRENT') {
      const postChargeChar = cleaned.slice(matchStart + m[0].length, matchStart + m[0].length + 5)
      if (/^\s*[-·.]?\s*h(?:r|our|\b)/i.test(postChargeChar)) continue
    }
    const preText = cleaned.slice(Math.max(0, matchStart - 150), matchStart)
    const postText = cleaned.slice(matchStart + m[0].length, matchStart + m[0].length + 80)
    const preTokensRaw = preText
      .replace(PRE_CONTEXT_NOISE, ' ')
      .split(/[\s,.;:()\[\]/\\]+/)
      .filter(Boolean)
    const postTokensRaw = postText
      .replace(PRE_CONTEXT_NOISE, ' ')
      .split(/[\s,.;:()\[\]/\\]+/)
      .filter(Boolean)
    const preTokens = preTokensRaw.slice(-6) // last 6 tokens preceding the number
    const postTokens = postTokensRaw.slice(0, 4) // first 4 tokens after the unit
    const contextWindow = `${preText.slice(-60)}[${m[0]}]${postText.slice(0, 40)}`.replace(/\s+/g, ' ').trim()
    // Field-anchored cluster key for tool-output assignments "<field> = <N>".
    const fieldKey = extractAssignmentFieldKey(preText)
    occurrences.push({
      page,
      rawValue: rawValueStr,
      numericValue,
      unitToken,
      family: def.family,
      canonicalValue,
      canonicalUnit: def.canonical,
      contextWindow,
      preTokens,
      postTokens,
      fieldKey,
    })
  }
  return occurrences
}

function extractMoneyOccurrences(pageText: string, page: number): MoneyOccurrence[] {
  const cleaned = stripBoilerplate(pageText)
  const out: MoneyOccurrence[] = []
  let m: RegExpExecArray | null
  while ((m = POUND_REGEX.exec(cleaned)) !== null) {
    const raw = m[0]
    const parsed = parseMoney(raw)
    if (!parsed) continue
    if (parsed.valueGbp === 0) continue
    const matchStart = m.index
    const contextStart = Math.max(0, matchStart - 50)
    const contextEnd = Math.min(cleaned.length, matchStart + raw.length + 20)
    const context = cleaned.slice(contextStart, contextEnd).replace(/\s+/g, ' ').trim()
    out.push({ page, rawText: raw, valueGbp: parsed.valueGbp, rendering: parsed.rendering, context })
  }
  return out
}

// ── CLUSTERING + FINDING SYNTHESIS ──────────────────────────────────────────

interface Cluster {
  key: string
  family: UnitFamily
  qualifiers: string[]
  head: string[]
  occurrences: NumericOccurrence[]
}

export interface ConsistencyFinding {
  cluster_key: string
  family: UnitFamily
  head_phrase: string
  qualifier_phrase: string
  distinct_values: number[] // canonical-unit values
  canonical_unit: string
  occurrences: Array<{
    page: number
    raw: string
    unit: string
    context: string
  }>
  variance_pct: number
  severity: 'HIGH' | 'MED'
  reason: string
}

export interface MoneyFormatFinding {
  value_gbp: number
  renderings: Array<{ rendering: MoneyOccurrence['rendering']; sample: string; page: number; context: string }>
  severity: 'MED'
  reason: string
}

export interface ConsistencyAuditResult {
  total_pages: number
  total_numeric_occurrences: number
  total_money_occurrences: number
  total_clusters: number
  findings: ConsistencyFinding[]
  money_format_findings: MoneyFormatFinding[]
  skipped_singletons: number
}

/** Build the feature set for an occurrence: combine pre+post head tokens
 * and qualifiers, then identify the FAMILY-ANCHOR token (if any) which is
 * the primary clustering key. */
interface OccurrenceFeatures {
  family: UnitFamily
  /** Combined head tokens from pre + post window. */
  head: string[]
  /** Combined qualifiers from pre + post window. */
  qualifiers: string[]
  /** Anchor token from FAMILY_ANCHORS that appears in head. null if none. */
  anchor: string | null
  /** Original occurrence (for ergonomic access). */
  occ: NumericOccurrence
}

/** Detect whether the context window suggests this is a PART-SPECIFIC
 * measurement (part number nearby) rather than a SYSTEM-LEVEL claim. Part-
 * specific measurements legitimately differ per part and should not cluster
 * across parts. Heuristic: presence of an UPPERCASE-letter + digit token
 * (e.g. "B-427", "M22-DL", "EB-XT-500") in pre or post tokens. */
function looksLikePartSpecific(occ: NumericOccurrence): boolean {
  const combined = [...occ.preTokens, ...occ.postTokens].join(' ')
  // Part-number-style tokens: uppercase letters mixed with digits, length >= 4.
  if (/\b[A-Z]{1,4}[-_]?\d{2,}/.test(combined)) return true
  if (/\b\d+[A-Z]{2,}\b/.test(combined)) return true
  // Brand-name + part-form prefix common in BoM cards.
  if (/\bpart\b/i.test(combined)) return true
  // PACKAGED-UNIT / PER-UNIT measurement: a value that is the size of one
  // packaged/repeated unit — "249 × 25 kg bags/day", "3 × 18 kg sacks", "12 kg
  // per cartridge" — is a per-part measurement, not a system-level scalar. It
  // must not cluster with a system total (the co2 case: "25 kg bags" vs the
  // 18,779 kg plant mass). Two signals, EITHER fires:
  //   (a) a count-multiplier immediately precedes the number ("249 ×", "3 x")
  //   (b) a packaged/per-unit noun immediately follows ("bags", "sacks",
  //       "cartridges", "each", "per <noun>"). Added 2026-06-03.
  const post = occ.postTokens.map((t) => t.toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean)
  const PACKAGE_NOUNS = new Set<string>([
    'bag', 'bags', 'sack', 'sacks', 'cartridge', 'cartridges', 'drum', 'drums',
    'canister', 'canisters', 'cylinder', 'cylinders', 'bottle', 'bottles',
    'pallet', 'pallets', 'each', 'apiece', 'unit', 'units', 'piece', 'pieces',
  ])
  if (post.length > 0 && PACKAGE_NOUNS.has(post[0])) return true
  if (post.length > 0 && post[0] === 'per') return true
  const lastPre = occ.preTokens.length ? occ.preTokens[occ.preTokens.length - 1] : ''
  if (/^[×x*]$/i.test(lastPre)) return true
  // pdftotext often renders "249 × 25" with the multiplier glued or as a bare
  // "×" token swallowed by PRE_CONTEXT_NOISE — also catch a count-then-multiplier
  // in the raw pre window ("249 ×" / "249 x" within the last ~12 chars).
  if (/\d+\s*[×x*]\s*$/i.test(occ.contextWindow.replace(/\[.*$/, ''))) return true
  return false
}

/** Classify a MASS occurrence's SCOPE from its raw window tokens:
 *   'system'    = whole-machine / shipment mass ("gross mass", "single-truck
 *                 road transport", "total system mass")
 *   'component' = a single part's mass ("base mass", "cast-iron column",
 *                 "rotor", "enclosure")
 *   'neutral'   = no decisive signal, OR signals for BOTH (ambiguous → do not
 *                 force a split).
 *
 * Reads RAW pre/post tokens (lowercased, punctuation-normalised the same way
 * classifyTokens does) so the stemmer can't mangle multi-word/hyphenated tokens
 * ("single-truck", "cast-iron", "shipping"→"shipp"). A system-total mass and a
 * component mass are physically distinct quantities and must never cluster as a
 * contradiction; a genuine same-scope mass contradiction (two system totals, or
 * two values for the same component) still shares scope → still clusters → still
 * flags. Only MASS uses this; other families are unaffected. */
function massScopeOf(occ: NumericOccurrence): 'system' | 'component' | 'neutral' {
  const toks = [...occ.preTokens, ...occ.postTokens]
    .map((t) => t.toLowerCase().replace(/[^a-z0-9_-]/g, ''))
    .filter(Boolean)
  let hasSystem = false
  let hasComponent = false
  for (const t of toks) {
    if (MASS_SYSTEM_SCOPE_TOKENS.has(t)) hasSystem = true
    if (MASS_COMPONENT_SCOPE_TOKENS.has(t)) hasComponent = true
  }
  if (hasSystem && !hasComponent) return 'system'
  if (hasComponent && !hasSystem) return 'component'
  return 'neutral'
}

function featurize(occ: NumericOccurrence): OccurrenceFeatures {
  const pre = classifyTokens(occ.preTokens)
  const post = classifyTokens(occ.postTokens)
  const head = [...new Set([...pre.head, ...post.head])]
  const qualifiers = [...new Set([...pre.qualifiers, ...post.qualifiers])]
  const familyAnchors = FAMILY_ANCHORS[occ.family]
  const anchor = head.find((t) => familyAnchors.has(t)) ?? null
  return { family: occ.family, head, qualifiers, anchor, occ }
}

/** Clustering strategy:
 *
 *   1. Group all occurrences by family. Two occurrences from different unit
 *      families NEVER cluster.
 *   2. Within a family, group by (anchor_token, sorted_qualifier_set).
 *      Occurrences with the SAME family anchor (e.g. "energy") AND the SAME
 *      role qualifier set (e.g. "usable") share a cluster — this matches
 *      "deliver 2.69 MWh of usable energy" with "USABLE ENERGY 3.5 MWh"
 *      because both have anchor=energy + qualifier=usable.
 *   3. Occurrences with NO family anchor go into a fallback group keyed on
 *      the sorted union of (head + qualifiers). These rarely cluster across
 *      contexts but catch repeated identical phrases.
 *
 * Qualifiers like "nameplate" / "rated" / "minimum" / "target" split the
 * cluster — they are legitimate distinguishers across engineering domains
 * and the brief's "3.36 MWh nameplate" / "2.69 MWh usable" disagreement
 * is preserved as two separate clusters (each internally consistent). The
 * BUG that gate 18 catches is when two prose locations carry the SAME
 * qualifier set + SAME anchor but DIFFERENT scalars. */
/** Families where part-specific measurements are common (LENGTH, MASS,
 * VOLTAGE, CURRENT) — clustering should ONLY use anchor matches, never
 * fallback head-token matches. A 50 mm dimension on Brady B-427 and a
 * 50 mm dimension on Roxtec CF 16 are two different parts; they should
 * not be clustered just because both windows contain the word "footprint". */
const PART_SPECIFIC_FAMILIES = new Set<UnitFamily>(['LENGTH', 'MASS', 'VOLTAGE', 'CURRENT'])

function cluster(occurrences: NumericOccurrence[]): Cluster[] {
  const clusters = new Map<string, Cluster>()
  for (const occ of occurrences) {
    const feat = featurize(occ)
    if (feat.head.length === 0 && feat.qualifiers.length === 0) continue
    // Skip part-specific occurrences (they reference a specific part number)
    // for part-specific families — they cannot evidence a SYSTEM-level
    // contradiction, only per-part variation.
    if (PART_SPECIFIC_FAMILIES.has(feat.family) && looksLikePartSpecific(feat.occ)) continue
    // Cluster key uses STRONG qualifiers only. Weak qualifiers (minimum /
    // maximum / target / brief) describe constraints on the SAME quantity,
    // not different quantities, so they should not split clusters.
    const strongQuals = feat.qualifiers.filter((q) => STRONG_QUALIFIERS.has(q))
    // L54: role dimension (requirement-floor / requirement-target / achieved /
    // neutral) splits the brief-spec value from the design-delivered value so
    // "2.5 MWh minimum" and "deliver 2.69 MWh" are not a false contradiction.
    const role = roleOf(feat)
    // 2026-06-01 FIX 2a: MASS gets an extra SCOPE dimension (system-total vs
    // single-component) so an 8,500 kg machine-mass cap never clusters with a
    // 4,500 kg cast-iron base mass. Other families pass scope='' (no effect).
    const scope = feat.family === 'MASS' ? massScopeOf(feat.occ) : ''
    // 2026-06-03 FIELD-ANCHORED clustering (co2-mineralisation gate-18 fix). When
    // the number is the RHS of a tool-output assignment "<field_name> = <value>",
    // the SPECIFIC field preceding the "=" (absorber_shell_mass,
    // stripper_shell_mass, cp_anode_mass, …) is the true identity of the
    // quantity — NOT the generic family anchor ("mass"), which every field in a
    // run-on "name = a, name = b, name = c" sentence shares. Fold the field key
    // into the cluster key so distinct fields form DISTINCT clusters and a dense
    // tool-output sentence stops collapsing six quantities into one false
    // contradiction. Free-prose occurrences carry fieldKey=null → field='' →
    // existing behaviour is byte-for-byte unchanged (the L22 BESS prose-vs-prose
    // contradiction, which has no "=", is fully preserved). A genuine SAME-field
    // contradiction (the same field assigned two different values across pages)
    // still shares one field key → still clusters → still fires HIGH.
    const field = occ.fieldKey ? `|field=${occ.fieldKey}` : ''
    let key: string
    if (feat.anchor) {
      // Anchor-based clustering: family + anchor + strong-qualifier-set + role
      // (+ mass-scope for MASS) (+ field for tool-output assignments).
      const qualSorted = [...strongQuals].sort().join('+')
      key = `${feat.family}|anchor=${feat.anchor}|qual=${qualSorted}|role=${role}|scope=${scope}${field}`
    } else if (PART_SPECIFIC_FAMILIES.has(feat.family)) {
      // No fallback clustering for part-specific families UNLESS the occurrence
      // is a tool-output assignment with an explicit field name. A bare
      // per-part length/mass/voltage stays excluded (every BoM line has one and
      // the variation is by design), but a "<field> = <value>" assignment names
      // a SYSTEM quantity (total plant mass, cp anode mass) whose cross-page
      // agreement IS worth checking — keyed on the field so distinct fields
      // never collide. Added 2026-06-03 (co2-mineralisation): without this the
      // p12 "cp anode mass = 20 kg" / "total plant mass = 18,779 kg" assignments
      // were dropped from MASS clustering and could not be checked at all.
      if (!occ.fieldKey) continue
      const qualSorted = [...strongQuals].sort().join('+')
      key = `${feat.family}|qual=${qualSorted}|role=${role}|scope=${scope}${field}`
    } else {
      // Fallback for non-part-specific families: family + head +
      // strong-qualifier-set. Stricter — requires EXACT head-token match.
      // Fallback clusters are rare; they catch repeated identical phrases
      // (e.g. table rows that quote the same spec twice).
      const headSorted = [...feat.head].sort().join('+')
      const qualSorted = [...strongQuals].sort().join('+')
      key = `${feat.family}|head=${headSorted}|qual=${qualSorted}|role=${role}${field}`
    }
    let c = clusters.get(key)
    if (!c) {
      c = { key, family: feat.family, qualifiers: feat.qualifiers, head: feat.head, occurrences: [] }
      clusters.set(key, c)
    } else {
      // Accumulate head + qualifier tokens for the cluster report.
      c.head = [...new Set([...c.head, ...feat.head])]
      c.qualifiers = [...new Set([...c.qualifiers, ...feat.qualifiers])]
    }
    c.occurrences.push(occ)
  }
  return [...clusters.values()]
}

/**
 * A cluster is a "rounding family" when its distinct values are all consistent
 * with one underlying quantity shown at different display precisions — i.e. each
 * pair of values lies within the sum of their display half-steps. Example: a
 * compressor power printed as "4.646 kW" (±0.0005), "4.65 kW" (±0.005), and
 * "4.6 kW" (±0.05) on three pages is ONE value at three precisions, not three
 * conflicting claims — every pairwise gap (≤0.05) sits inside the summed
 * half-steps. The reader reconciles them trivially. A REAL contradiction does
 * NOT: 2.69 MWh usable (±0.005) vs 3.5 MWh target (±0.05) has |Δ|=0.81, far
 * outside the 0.055 tolerance, so it stays HIGH. Works in canonical units (the
 * display step is scaled by canonicalValue/rawValue so kW-vs-W mixes are safe).
 * Added 2026-05-31 after the heatpump go-wide false positive (4.6/4.646/4.65 kW).
 */
export function isRoundingFamily(occ: ReadonlyArray<{ rawValue: string | number; canonicalValue: number }>): boolean {
  if (occ.length < 2) return false
  const pts = occ.map((o) => {
    const raw = String(o.rawValue)
    const decMatch = raw.match(/\.(\d+)/)
    const dp = decMatch ? decMatch[1].length : 0
    const rawNum = parseFloat(raw.replace(/[^0-9.\-]/g, ''))
    const scale = rawNum !== 0 && isFinite(rawNum) ? Math.abs(o.canonicalValue / rawNum) : 1
    const step = Math.pow(10, -dp) * scale // one display ULP in canonical units
    return { v: o.canonicalValue, half: step / 2 }
  })
  // Must have ≥2 genuinely-distinct values to be a "family" worth downgrading.
  const distinctVals = new Set(pts.map((p) => Math.round(p.v * 1e6) / 1e6))
  if (distinctVals.size < 2) return false
  const EPS = 1e-9
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (Math.abs(pts[i].v - pts[j].v) > pts[i].half + pts[j].half + EPS) return false
    }
  }
  return true
}

function buildFindings(clusters: Cluster[]): { findings: ConsistencyFinding[]; skippedSingletons: number } {
  const findings: ConsistencyFinding[] = []
  let skippedSingletons = 0
  for (const c of clusters) {
    if (c.occurrences.length < 2) {
      skippedSingletons++
      continue
    }
    // Deduplicate occurrences with identical (page, raw, unit) — chunk
    // repetition.
    const seen = new Set<string>()
    const deduped = c.occurrences.filter((occ) => {
      const sig = `${occ.page}|${occ.rawValue}|${occ.unitToken}`
      if (seen.has(sig)) return false
      seen.add(sig)
      return true
    })
    // Distinct values (round to 4 sig figs to absorb display rounding).
    const values = deduped.map((o) => o.canonicalValue)
    const rounded = values.map((v) => Math.round(v * 10000) / 10000)
    const distinct = [...new Set(rounded)]
    if (distinct.length < 2) continue
    // Variance: (max - min) / mean.
    const min = Math.min(...distinct)
    const max = Math.max(...distinct)
    const mean = distinct.reduce((s, v) => s + v, 0) / distinct.length
    if (mean === 0) continue
    const variancePct = ((max - min) / mean) * 100
    // Need at least 2 occurrences from at least 2 distinct context windows.
    const distinctContexts = new Set(deduped.map((o) => o.contextWindow.slice(0, 80))).size
    if (distinctContexts < 2) {
      skippedSingletons++
      continue
    }
    let severity: 'HIGH' | 'MED' | null = null
    if (variancePct > 1) severity = 'HIGH'
    else if (variancePct > 0.1) severity = 'MED'
    if (!severity) continue
    // gate 18 is the CROSS-PAGE consistency gate (CLAUDE.md: "two or more pages
    // quoting different scalar values for the same engineering quantity"). A
    // cluster whose occurrences all sit on ONE page is an in-passage illustrative
    // comparison (e.g. "at 0.9 PF the current is 66.2 A ... even at a perfect
    // 1.0 PF it is 59.6 A" — two scenarios in one sentence), not a cross-page
    // contradiction the reader cannot reconcile. Downgrade single-page HIGH to
    // MED. Added 2026-05-31 after the vertical-farm go-wide false-positive
    // (power-factor scenario, both values on p.39).
    const distinctPages = new Set(deduped.map((o) => o.page)).size
    if (distinctPages < 2 && severity === 'HIGH') severity = 'MED'
    // Down-grade certain known-ambiguous families to MED:
    // - TEMP clusters where values span a sign change (-20 °C vs +50 °C)
    //   are very likely operating-range bounds, not contradictions.
    // - POWER clusters where one occurrence's STRONG qualifiers include
    //   continuous AND another's include peak — those are different
    //   quantities by definition (continuous power vs peak power).
    if (c.family === 'TEMP' && min < 0 && max > 0) severity = 'MED'
    // - Any cluster whose qualifier set spans BOTH 'ac' and 'dc' is mixing two
    //   genuinely-different quantities (AC continuous current != DC continuous
    //   current; AC voltage != DC bus voltage). A single window like "AC
    //   continuous current = 1,443 A, DC continuous current = 1,250 A" gives
    //   EVERY number in it both 'ac' and 'dc' qualifiers, so the per-qualifier
    //   ac/dc cluster-split can't fire and the two values wrongly cluster. That
    //   is not a reader-irreconcilable contradiction — downgrade HIGH -> MED.
    //   Added 2026-05-31 after a BESS run flagged 1443 A (AC) vs 1250 A (DC)
    //   continuous current as a false-positive cross-page contradiction.
    // Mutually-exclusive scope pairs (generalises the ac/dc guard): a cluster whose
    // qualifier set contains BOTH sides describes two genuinely-different quantities
    // mashed by a shared window ("AC continuous 1443 A, DC continuous 1250 A"; "350
    // kW output … 650 kW input"; "52.7 kg empty … 95 kg takeoff"). Not a
    // same-quantity cross-page contradiction → downgrade HIGH to MED. Added
    // 2026-05-31 after the ev-charger (input/output power) + haps (empty/takeoff
    // mass) go-wide false positives.
    if (severity === 'HIGH') {
      const EXCLUSIVE_PAIRS: ReadonlyArray<readonly [string, string]> = [
        ['ac', 'dc'], ['input', 'output'], ['inlet', 'outlet'], ['supply', 'return'],
        ['primary', 'secondary'], ['empty', 'takeoff'], ['empty', 'laden'],
        ['empty', 'mtom'], ['empty', 'mtow'], ['empty', 'payload'], ['tare', 'laden'],
      ]
      for (const [a, b] of EXCLUSIVE_PAIRS) {
        if (c.qualifiers.includes(a) && c.qualifiers.includes(b)) { severity = 'MED'; break }
      }
    }
    // Rounding-precision family: distinct values that are all the SAME quantity
    // shown at different decimal precisions (4.646 / 4.65 / 4.6 kW) are not a
    // reader-irreconcilable contradiction. Downgrade HIGH → MED. Guarded so a
    // genuine gap (2.69 vs 3.5 MWh) stays HIGH — see isRoundingFamily. Added
    // 2026-05-31 after the heatpump go-wide false positive (compressor power).
    if (severity === 'HIGH' && isRoundingFamily(deduped.map((o) => ({ rawValue: o.rawValue, canonicalValue: o.canonicalValue })))) {
      severity = 'MED'
    }
    if (c.family === 'POWER') {
      const perOccQuals = c.occurrences.map((o) => classifyTokens([...o.preTokens, ...o.postTokens]).qualifiers)
      const hasContinuous = perOccQuals.some((q) => q.includes('continuous'))
      const hasPeak = perOccQuals.some((q) => q.includes('peak'))
      if (hasContinuous && hasPeak) severity = 'MED'
    }
    // Down-grade clusters where ALL occurrences are in an "alternative scenario"
    // context (values presented as "IF prioritise CAPEX/MASS (alternative
    // scenario):" in design-decisions prose). These are intentional trade-off
    // comparisons — different scenario VALUES that a reader selects between,
    // not contradictions on the same canonical quantity. When every occurrence
    // in the cluster carries "alternative" or "scenario" in its per-occurrence
    // token window, downgrade HIGH → MED and annotate the reason.
    // Added 2026-05-25 after BESS L27: the cluster-splitter correctly separates
    // canonical values (3.5 MWh brief target / 2.69 MWh design) from the
    // alt-brief section, but the alt-brief section itself lists multiple
    // scenario values (450 kWh / 2340 kWh / 3500 kWh for energy, 8000 kg /
    // 40000 kg for mass) — all explicitly labelled "alternative scenario" and
    // all intentional "pick one" options for the founder.
    {
      const ALT_SCENARIO_TOKENS = new Set(['alternative', 'scenario', 'hypothetical'])
      const allOccurrencesAreAltScenario = deduped.every((o) => {
        const perOccTokens = classifyTokens([...o.preTokens, ...o.postTokens])
        return (
          perOccTokens.qualifiers.some((q) => ALT_SCENARIO_TOKENS.has(q)) ||
          [...o.preTokens, ...o.postTokens].some((t) => ALT_SCENARIO_TOKENS.has(t.toLowerCase()))
        )
      })
      if (allOccurrencesAreAltScenario && severity === 'HIGH') {
        severity = 'MED'
      }
    }
    // Down-grade clusters where occurrences look like a structured JSON/key-
    // value dump: multiple same-family unit tokens appear within 30 chars
    // of each other in the SAME context window. "3500 kWh 1000 kW 1250 kW
    // 6000 cycles 800 V" is a flat spec dump where 1000 kW and 1250 kW are
    // two LEGITIMATELY distinct quantities listed side-by-side (rated +
    // peak), not a contradiction. Detect via two numbers + same-family
    // suffix within close proximity.
    const familySuffixes: Record<UnitFamily, string[]> = {
      ENERGY: ['MWh', 'kWh', 'GWh', 'Wh'],
      POWER: ['MW', 'kW', 'GW'],
      VOLTAGE: ['kV', 'mV'],
      CURRENT: ['kA', 'mA'],
      MASS: ['kg', 'tonne', 'tonnes'],
      LENGTH: ['mm', 'cm', 'km'],
      TEMP: ['°C'],
      DATARATE: ['kbit/s', 'Mbit/s', 'Gbit/s', 'kbps', 'Mbps', 'Gbps'],
      FREQ: ['Hz', 'kHz', 'MHz', 'GHz'],
      PRESSURE: ['MPa', 'kPa', 'bar', 'psi'],
    }
    const suffixes = familySuffixes[c.family] ?? []
    const flatListCount = deduped.filter((o) => {
      const ctx = o.contextWindow
      // Count how many distinct numeric+family-unit tokens appear in this
      // context window. If 2+ are present, it's likely a structured dump.
      let count = 0
      for (const sfx of suffixes) {
        const escaped = sfx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const re = new RegExp(`\\d\\s*${escaped}\\b`, 'g')
        const matches = ctx.match(re)
        if (matches) count += matches.length
      }
      return count >= 2
    }).length
    if (flatListCount >= deduped.length / 2) {
      severity = severity === 'HIGH' ? 'MED' : null
    }
    if (!severity) continue
    findings.push({
      cluster_key: c.key,
      family: c.family,
      head_phrase: c.head.join(' '),
      qualifier_phrase: c.qualifiers.join(' '),
      distinct_values: distinct.sort((a, b) => a - b),
      canonical_unit: deduped[0].canonicalUnit,
      occurrences: deduped.map((o) => ({
        page: o.page,
        raw: `${o.rawValue} ${o.unitToken}`,
        unit: o.unitToken,
        context: o.contextWindow,
      })),
      variance_pct: variancePct,
      severity,
      reason:
        `Phrase "${c.head.join(' ')}"` +
        (c.qualifiers.length ? ` (qualifier: ${c.qualifiers.join('+')})` : '') +
        ` appears with ${distinct.length} distinct ${c.family.toLowerCase()} values ` +
        `(${distinct.map((v) => v + ' ' + deduped[0].canonicalUnit).join(' / ')}) across ${deduped.length} ` +
        `occurrences on ${[...new Set(deduped.map((o) => o.page))].length} pages. ` +
        `Variance ${variancePct.toFixed(2)}% exceeds ${severity === 'HIGH' ? '1' : '0.1'}% threshold. ` +
        `The reader sees contradicting numbers and cannot reconcile them.`,
    })
  }
  // Sort: HIGH first, then by variance descending.
  findings.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'HIGH' ? -1 : 1
    return b.variance_pct - a.variance_pct
  })
  return { findings, skippedSingletons }
}

function buildMoneyFormatFindings(occurrences: MoneyOccurrence[]): MoneyFormatFinding[] {
  // Group by value (rounded to nearest GBP). Flag when same value appears
  // with multiple distinct renderings.
  const byValue = new Map<number, MoneyOccurrence[]>()
  for (const occ of occurrences) {
    const rounded = Math.round(occ.valueGbp)
    if (rounded < 100) continue // too small to be ambiguous (sub-pound cell costs)
    const arr = byValue.get(rounded) ?? []
    arr.push(occ)
    byValue.set(rounded, arr)
  }
  const findings: MoneyFormatFinding[] = []
  for (const [value, occs] of byValue) {
    const renderings = new Set(occs.map((o) => o.rendering))
    if (renderings.size < 2) continue
    findings.push({
      value_gbp: value,
      renderings: [...renderings].map((r) => {
        const sample = occs.find((o) => o.rendering === r) as MoneyOccurrence
        return { rendering: r, sample: sample.rawText, page: sample.page, context: sample.context }
      }),
      severity: 'MED',
      reason:
        `Value £${value.toLocaleString('en-GB')} appears in ${renderings.size} different renderings ` +
        `(${[...renderings].join(', ')}). Same underlying scalar — only formatting differs.`,
    })
  }
  return findings
}

// ── PUBLIC ENTRYPOINT ───────────────────────────────────────────────────────

export function auditCrossPageNumericConsistency(pdfPath: string): ConsistencyAuditResult {
  const pages = extractPagesText(pdfPath)
  const allOccurrences: NumericOccurrence[] = []
  const allMoneyOccurrences: MoneyOccurrence[] = []
  for (const [page, text] of pages) {
    allOccurrences.push(...extractOccurrences(text, page))
    allMoneyOccurrences.push(...extractMoneyOccurrences(text, page))
  }
  const clusters = cluster(allOccurrences)
  const { findings, skippedSingletons } = buildFindings(clusters)
  const moneyFindings = buildMoneyFormatFindings(allMoneyOccurrences)
  return {
    total_pages: pages.size,
    total_numeric_occurrences: allOccurrences.length,
    total_money_occurrences: allMoneyOccurrences.length,
    total_clusters: clusters.length,
    findings,
    money_format_findings: moneyFindings,
    skipped_singletons: skippedSingletons,
  }
}

// ── REPORT RENDERER ─────────────────────────────────────────────────────────

function renderMarkdown(result: ConsistencyAuditResult, pdfPath: string): string {
  const lines: string[] = []
  lines.push(`# Cross-Page Numeric Consistency Audit — ${pdfPath}`)
  lines.push('')
  lines.push(
    `**${result.total_pages} pages scanned, ${result.total_numeric_occurrences} numeric occurrences, ` +
      `${result.total_money_occurrences} money occurrences, ${result.total_clusters} candidate clusters.**`,
  )
  lines.push('')
  const high = result.findings.filter((f) => f.severity === 'HIGH')
  const med = result.findings.filter((f) => f.severity === 'MED')
  if (high.length === 0 && med.length === 0 && result.money_format_findings.length === 0) {
    lines.push('✅ **PASS** — no cross-page numeric contradictions detected.')
    return lines.join('\n')
  }
  if (high.length > 0) {
    lines.push(
      `❌ **FAIL** — ${high.length} HIGH-severity contradiction(s), ${med.length} MED, ` +
        `${result.money_format_findings.length} money-format drift(s).`,
    )
  } else {
    lines.push(
      `⚠️ **WARN** — 0 HIGH but ${med.length} MED + ${result.money_format_findings.length} money-format drift(s).`,
    )
  }
  lines.push('')
  if (high.length > 0) {
    lines.push('## HIGH severity (true contradictions — blocking)')
    lines.push('')
    for (const f of high) {
      lines.push(`### [HIGH] ${f.head_phrase} (${f.family.toLowerCase()})`)
      if (f.qualifier_phrase) lines.push(`- **Qualifier:** ${f.qualifier_phrase}`)
      lines.push(`- **Distinct values:** ${f.distinct_values.map((v) => `${v} ${f.canonical_unit}`).join(' vs ')}`)
      lines.push(`- **Variance:** ${f.variance_pct.toFixed(2)}%`)
      lines.push(`- **Reason:** ${f.reason}`)
      lines.push('- **Occurrences:**')
      for (const o of f.occurrences) {
        lines.push(`  - p.${o.page} → \`${o.raw}\` — _${o.context}_`)
      }
      lines.push('')
    }
  }
  if (med.length > 0) {
    lines.push('## MED severity (rounding / formatting drift — advisory)')
    lines.push('')
    for (const f of med) {
      lines.push(`### [MED] ${f.head_phrase} (${f.family.toLowerCase()})`)
      if (f.qualifier_phrase) lines.push(`- **Qualifier:** ${f.qualifier_phrase}`)
      lines.push(`- **Distinct values:** ${f.distinct_values.map((v) => `${v} ${f.canonical_unit}`).join(' vs ')}`)
      lines.push(`- **Variance:** ${f.variance_pct.toFixed(2)}%`)
      lines.push(`- **Reason:** ${f.reason}`)
      lines.push('')
    }
  }
  if (result.money_format_findings.length > 0) {
    lines.push('## MED — money formatting drift (advisory)')
    lines.push('')
    for (const f of result.money_format_findings) {
      lines.push(`### [MED] £${f.value_gbp.toLocaleString('en-GB')} — ${f.renderings.length} renderings`)
      lines.push(`- **Reason:** ${f.reason}`)
      for (const r of f.renderings) {
        lines.push(`  - \`${r.sample}\` (${r.rendering}) on p.${r.page} — _${r.context}_`)
      }
      lines.push('')
    }
  }
  if (result.skipped_singletons > 0) {
    lines.push('---')
    lines.push('')
    lines.push(
      `_${result.skipped_singletons} cluster(s) skipped because they had only one occurrence or one distinct context window — singleton clusters cannot evidence a contradiction._`,
    )
  }
  return lines.join('\n')
}

// ── CLI ENTRYPOINT ──────────────────────────────────────────────────────────

const argv1 = process.argv[1] ?? ''
const isMain = /cross-page-numeric-consistency-audit\.(?:ts|js|mjs|cjs)$/.test(argv1)

if (isMain) {
  const pdfPath = process.argv[2]
  const outMdPath = process.argv[3]
  if (!pdfPath) {
    console.error('Usage: cross-page-numeric-consistency-audit <pdfPath> [outMdPath]')
    process.exit(1)
  }
  let result: ConsistencyAuditResult
  try {
    result = auditCrossPageNumericConsistency(pdfPath)
  } catch (err) {
    console.error(`[consistency-audit] failed: ${(err as Error).message}`)
    process.exit(1)
  }
  const md = renderMarkdown(result, pdfPath)
  if (outMdPath) {
    writeFileSync(outMdPath, md, 'utf-8')
    console.log(`[consistency-audit] wrote ${outMdPath}`)
  } else {
    console.log(md)
  }
  const high = result.findings.filter((f) => f.severity === 'HIGH')
  if (high.length > 0) {
    console.error(`[consistency-audit] FAIL: ${high.length} HIGH-severity cross-page contradiction(s)`)
    process.exit(18)
  }
  const med = result.findings.length - high.length
  console.log(
    `[consistency-audit] PASS: ${result.total_clusters} clusters, ${result.findings.length} findings ` +
      `(${med} MED, 0 HIGH), ${result.money_format_findings.length} money-format drift(s)`,
  )
}
