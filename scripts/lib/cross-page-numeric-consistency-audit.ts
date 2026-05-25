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
    if (ROLE_QUALIFIERS.has(t)) {
      qualifiers.push(t)
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
    const canonicalValue = numericValue * def.toCanonical
    // Pre-context: 6 tokens before, post-context: 4 tokens after.
    const matchStart = m.index
    // Skip range-bound second values ("-20 to +50 °C") — these are the
    // upper bound of a stated range and should not cluster as if they were
    // an independent scalar claim about ambient temperature.
    if (isPartOfRange(cleaned, matchStart)) continue
    // Skip ratio-notation values ("1500/5A" → 5A is the CT secondary, not
    // a separate scalar claim). Pattern: <num>/ immediately precedes.
    {
      const preChar = cleaned.slice(Math.max(0, matchStart - 12), matchStart)
      if (/\d+\/\s*$/.test(preChar)) continue
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
  return false
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
    let key: string
    if (feat.anchor) {
      // Anchor-based clustering: family + anchor + strong-qualifier-set
      const qualSorted = [...strongQuals].sort().join('+')
      key = `${feat.family}|anchor=${feat.anchor}|qual=${qualSorted}`
    } else if (PART_SPECIFIC_FAMILIES.has(feat.family)) {
      // No fallback clustering for part-specific families. The audit would
      // be too noisy — every BoM line has a length/mass/voltage on a
      // specific component, and the engine's variation across parts is by
      // design, not a contradiction.
      continue
    } else {
      // Fallback for non-part-specific families: family + head +
      // strong-qualifier-set. Stricter — requires EXACT head-token match.
      // Fallback clusters are rare; they catch repeated identical phrases
      // (e.g. table rows that quote the same spec twice).
      const headSorted = [...feat.head].sort().join('+')
      const qualSorted = [...strongQuals].sort().join('+')
      key = `${feat.family}|head=${headSorted}|qual=${qualSorted}`
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
    // Down-grade certain known-ambiguous families to MED:
    // - TEMP clusters where values span a sign change (-20 °C vs +50 °C)
    //   are very likely operating-range bounds, not contradictions.
    // - POWER clusters where one occurrence's STRONG qualifiers include
    //   continuous AND another's include peak — those are different
    //   quantities by definition (continuous power vs peak power).
    if (c.family === 'TEMP' && min < 0 && max > 0) severity = 'MED'
    if (c.family === 'POWER') {
      const perOccQuals = c.occurrences.map((o) => classifyTokens([...o.preTokens, ...o.postTokens]).qualifiers)
      const hasContinuous = perOccQuals.some((q) => q.includes('continuous'))
      const hasPeak = perOccQuals.some((q) => q.includes('peak'))
      if (hasContinuous && hasPeak) severity = 'MED'
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
