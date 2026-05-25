/**
 * Jurisdictional-standards audit — gate 19 (codified 2026-05-25, Tristan-asked).
 *
 * Universal across every product class that cites a regulatory standard, in
 * any country. Catches: a US National Electrical Code (NEC 706.10) citation
 * appearing in a UK BESS document, a UK G99 citation appearing in a US doc,
 * a CSA citation appearing in a non-Canadian doc, etc.
 *
 * Root cause it addresses: deterministic-emitter + module narrative prose +
 * topology_clause strings emit standards citations as plain text without
 * gating them against the brief's market/jurisdiction. The radical pipeline
 * upstream (Chase research extraction) does NOT enforce a country filter on
 * the references it carries forward, so a research synthesis that learned
 * the canonical "external pad-mount" pattern from a US (NEC) source bleeds
 * the US citation into the prose of every BESS regardless of brief.country
 * or target_customers. The result: a UK-grid BESS document cites NEC 706.10
 * alongside G99 — superficially authoritative, but mixing jurisdictions
 * destroys cover credibility with any reviewer who actually knows what NEC
 * stands for.
 *
 *   gate 13 → "did the chain LIE about this part's spec?"
 *   gate 14 → "is the chosen part big enough at this design load?"
 *   gate 15 → "is the chosen part of the right TYPE for the slot?"
 *   gate 16 → "does the chosen chiller deliver enough kW at this ambient?"
 *   gate 19 → "are the cited standards from the right country for the brief's market?"
 *
 * Distinct from gates 13-16: those audit COMPONENT-LEVEL correctness. Gate 19
 * audits DOCUMENT-LEVEL standards hygiene — a part can be correctly spec'd,
 * correctly sized, correctly typed, correctly thermal-rated, AND still be
 * cited under a standard from the wrong jurisdiction. The fix is upstream
 * (filter the standards citation list against an accepted-families set
 * derived from the brief's market) but the audit gate catches the symptom
 * universally regardless of which upstream stage emitted the citation.
 *
 * Scan surface:
 *   1. Every word's modifier_characters where kind === 'regulatory'.
 *   2. Each module's module_brief, overview_paragraph_en.
 *   3. Each sub-module's english_sentence, topology_clause, paragraph_en,
 *      sentence_en.
 *   4. naturalLanguageLayer.by_module[<id>].paragraph_en + sub_module_sentences[].
 *   5. briefOverviewProse.* (overview_and_context, mission_statement, etc.).
 *
 * Extraction regex matches standards-body acronyms followed by a code, e.g.
 *   "IEC 62619", "NEC 706.10", "UL 9540A", "BS EN 61439-1", "G99 Issue 6".
 * Each match is mapped to a standards FAMILY (IEC, NEC, UL, BS, EN, NFPA, ...).
 *
 * Jurisdictional acceptance:
 *
 *   UK accepts:  BS, BS EN, EN, IEC, ISO, IEEE (partial), G99, ENA, NFPA
 *                (NFPA 855 is accepted in UK BESS practice as the BESS
 *                installation guide, even though it's a US fire code).
 *                CE/UKCA marking.
 *   UK rejects:  NEC (US-only National Electrical Code), UL (US-only Under-
 *                writers Laboratories type cert — but UL 9540A test method
 *                is industry-accepted in UK BESS practice), CSA (CA-only),
 *                FCC, ANSI (US bias), GB/T (CN-only).
 *
 *   US accepts:  NEC, UL, NFPA, ANSI, IEEE, ISO, FCC, ASTM, ASME, IEC
 *                (selectively — IEC standards adopted by ANSI are accepted).
 *   US rejects:  BS / BS EN (UK-only), G99, ENA (UK-only), CSA (CA-only),
 *                GB/T (CN-only), JIS (JP-only).
 *
 *   EU accepts:  EN, IEC, ISO, CENELEC, ETSI, CE marking.
 *   EU rejects:  NEC, UL (selective), G99, BS-only (without EN suffix),
 *                CSA, GB/T, FCC.
 *
 * UL 9540A and NFPA 855 are explicitly ACCEPTED in UK BESS practice (per
 * MCS / Energy Networks Association guidance) even though they're US-origin
 * because the UK BESS regulatory regime has no equivalent fire-test method.
 * The audit treats those two specific codes as universally accepted; other
 * NEC / UL citations remain HIGH for UK/EU briefs.
 *
 * Exit 19 on HIGH-severity finding (citation in a family that the brief's
 * jurisdiction does NOT accept). MED / LOW findings are informational and
 * do not block the chain.
 *
 * Pre-change mempalace search: jurisdictional standards filter audit NEC UK
 * BS EN regulatory → 1 drawer loaded (BESS L22 council 2026-05-25 identified
 * this as universal-fix #4 from the 6-seat council).
 */

import { readFileSync } from 'node:fs'

// ── STANDARDS-FAMILY DETECTION ──────────────────────────────────────────────
// Order matters: longer / more specific patterns first to avoid e.g. "BS EN"
// being misclassified as plain "BS".

interface StandardsFamilyMatch {
  family: string
  code: string
  raw: string
}

const FAMILY_PATTERNS: Array<{ family: string; pattern: RegExp }> = [
  // UK National Electrical (G99 + ENA EREC G-numbered codes)
  { family: 'G99', pattern: /\bG\s*9(?:9|8)(?:\s*Issue\s*\d+)?(?:\s*\/\s*\d+(?:-\d+)?)?\b/gi },
  { family: 'ENA', pattern: /\bENA(?:\s+(?:EREC|TS)?\s*[A-Z]?\d+(?:\/\d+)?)?\b/gi },
  // UK British Standards — must precede plain BS / EN
  { family: 'BS EN', pattern: /\bBS\s*EN\s+\d{2,5}(?:[-:]\d+(?:[-:]\d+)?)?\b/gi },
  { family: 'BS', pattern: /\bBS\s+\d{3,5}(?:[-:]\d+(?:[-:]\d+)?)?(?!\s*EN)\b/gi },
  // European norms
  { family: 'EN', pattern: /\bEN\s+\d{4,5}(?:[-:]\d+(?:[-:]\d+)?)?\b/gi },
  { family: 'CENELEC', pattern: /\bCENELEC\b/gi },
  { family: 'ETSI', pattern: /\bETSI\s+EN\s+\d{4,5}\b/gi },
  // US National Electrical Code — the canonical "wrong jurisdiction" hit
  // for a UK doc. Must allow NEC 706.10 / NEC 706 / NEC Article 706.
  { family: 'NEC', pattern: /\bNEC\s+(?:Article\s+)?\d{2,4}(?:\.\d+)?\b/gi },
  // National Fire Protection Association (US fire codes, but UL 9540A test
  // method + NFPA 855 are accepted in UK BESS practice)
  { family: 'NFPA', pattern: /\bNFPA\s+\d{1,4}[A-Z]?(?:[-:]\d+)?\b/gi },
  // Underwriters Laboratories (US type cert — NOT UK accepted in general)
  { family: 'UL', pattern: /\bUL\s+\d{2,5}[A-Z]?(?:[-:]\d+)?\b/gi },
  // Canadian Standards Association
  { family: 'CSA', pattern: /\bCSA\s+(?:[A-Z]+\d{2,4}|\d{2,4})\b/gi },
  // American National Standards Institute
  { family: 'ANSI', pattern: /\bANSI\s+(?:[A-Z]+[\d.]{1,8}|[A-Z]\d{2,5}(?:\.\d+)?)\b/gi },
  // American Society of Mechanical Engineers
  { family: 'ASME', pattern: /\bASME\s+[A-Z]+(?:\.[A-Z0-9]+)*(?:\s+\d{2,5})?\b/gi },
  // American Society for Testing and Materials
  { family: 'ASTM', pattern: /\bASTM\s+[A-Z]\d{2,5}(?:\/[A-Z]\d{2,5}[A-Z]?)?(?:[-:]\d+)?\b/gi },
  // Federal Communications Commission (US)
  { family: 'FCC', pattern: /\bFCC\s+(?:Part\s+\d+(?:\.\d+)?|\d+\s+CFR\s+\d+)\b/gi },
  // Institute of Electrical and Electronics Engineers (US-origin, partial UK accept)
  { family: 'IEEE', pattern: /\bIEEE\s+(?:Std\.?\s*)?\d{1,4}(?:\.\d+)?(?:-\d{4})?\b/gi },
  // International Electrotechnical Commission (universal in UK / EU)
  { family: 'IEC', pattern: /\bIEC\s+\d{4,5}(?:[-:]\d+(?:[-:]\d+)?)?\b/gi },
  // International Organization for Standardization (universal)
  { family: 'ISO', pattern: /\bISO\s+\d{2,5}(?:[-:]\d+(?:[-:]\d+)?)?\b/gi },
  // Chinese national standard
  { family: 'GB', pattern: /\bGB(?:\/T)?\s+\d{3,6}(?:[-:.]\d+)?\b/gi },
  // Japanese Industrial Standards
  { family: 'JIS', pattern: /\bJIS\s+[A-Z]\s*\d{3,5}\b/gi },
  // International Article Number (informational, accepted everywhere)
  { family: 'DIN', pattern: /\bDIN\s+\d{3,5}(?:[-:]\d+)?\b/gi },
  // VDE — German electrical / consistent with EN
  { family: 'VDE', pattern: /\bVDE\s+\d{3,5}(?:[-:]\d+)?\b/gi },
  // IPC — global PCB / electronics assembly (universal)
  { family: 'IPC', pattern: /\bIPC[-\s]?[A-Z]?\d{1,4}[A-Z]?\b/gi },
  // DNV — Norwegian classification society (offshore / marine)
  { family: 'DNV', pattern: /\bDNV(?:-[A-Z]{2,3}-[0-9]{3,4})?\b/gi },
]

/** Specific codes that override the family rule — typically because they're
 * de-facto industry-accepted in jurisdictions that don't normally accept
 * their parent family.
 *
 * UL 9540A is a TEST METHOD (not a type cert) accepted in UK BESS practice
 * as the canonical thermal-runaway fire propagation test — UK has no
 * equivalent. NFPA 855 is similarly accepted as the BESS installation
 * standard in the absence of a UK equivalent. */
const ALWAYS_ACCEPTED_CODES = new Set<string>([
  'UL 9540A',
  'UL 9540',
  'NFPA 855',
  'NFPA 68',  // deflagration vents — universally cited
  'NFPA 70E', // electrical worker safety — universally cited
])

/** Standards FAMILIES accepted per jurisdiction. A standard from a family NOT
 * in this set, AND whose specific code is not in ALWAYS_ACCEPTED_CODES,
 * raises a HIGH finding. */
export const STANDARDS_FAMILY_BY_JURISDICTION: Record<string, Set<string>> = {
  UK: new Set([
    'BS', 'BS EN', 'EN', 'IEC', 'ISO', 'IEEE', 'G99', 'ENA',
    'CENELEC', 'ETSI', 'DIN', 'VDE', 'IPC', 'DNV', 'NFPA', // NFPA accepted in BESS practice
  ]),
  US: new Set([
    'NEC', 'UL', 'NFPA', 'ANSI', 'IEEE', 'ISO', 'FCC', 'ASTM', 'ASME',
    'IEC',  // selective — many ANSI-adopted IEC standards
    'IPC', 'DNV',
  ]),
  EU: new Set([
    'EN', 'IEC', 'ISO', 'CENELEC', 'ETSI', 'DIN', 'VDE', 'IPC', 'DNV', 'NFPA',
    'IEEE',
  ]),
  CA: new Set([
    'CSA', 'NEC', 'UL', 'NFPA', 'ANSI', 'IEEE', 'ISO', 'IEC', 'IPC', 'DNV',
  ]),
  CN: new Set([
    'GB', 'IEC', 'ISO', 'IEEE', 'IPC', 'DNV',
  ]),
  JP: new Set([
    'JIS', 'IEC', 'ISO', 'IEEE', 'IPC', 'DNV',
  ]),
}

// ── JURISDICTION INFERENCE ──────────────────────────────────────────────────
// The brief's country/jurisdiction can live in several places. Prefer the
// most-explicit field and fall back through aliases.

export function inferJurisdiction(state: any): { jurisdiction: string; source: string } {
  const pb = state?.parsedBrief ?? {}
  const bb = state?.briefBlock ?? {}
  const bop = state?.briefOverviewProse ?? {}
  // 1. Explicit country field (e.g. "UK", "United Kingdom", "GB").
  const country = (pb.country ?? bb.country ?? '').toString().trim()
  if (country) {
    const norm = normaliseJurisdiction(country)
    if (norm) return { jurisdiction: norm, source: `parsedBrief.country=${country}` }
  }
  // 2. Constraints.target_market_region (e.g. "EU", "North America").
  const region = (
    pb?.constraints?.target_market_region
      ?? pb?.target_market_region
      ?? bb?.constraints?.target_market_region
      ?? ''
  ).toString().trim()
  if (region) {
    const norm = normaliseJurisdiction(region)
    if (norm) return { jurisdiction: norm, source: `parsedBrief.constraints.target_market_region=${region}` }
  }
  // 3. target_customers narrative ("UK grid-scale..." / "US utility..." etc.).
  const customers = (
    pb?.target_customers
      ?? bb?.target_customers
      ?? bop?.target_customers
      ?? ''
  ).toString()
  if (customers) {
    const norm = inferFromNarrative(customers)
    if (norm) return { jurisdiction: norm, source: `parsedBrief.target_customers narrative` }
  }
  // 4. Mission statement / overview_and_context narrative.
  const overview = (
    bop?.overview_and_context
      ?? bop?.mission_statement
      ?? pb?.mission_statement
      ?? ''
  ).toString()
  if (overview) {
    const norm = inferFromNarrative(overview)
    if (norm) return { jurisdiction: norm, source: `briefOverviewProse narrative` }
  }
  // 5. Safety standards majority signal — if the user-provided safety_standards
  // are dominated by one jurisdiction's families, infer that jurisdiction.
  const safetyStds = pb?.constraints?.safety_standards ?? []
  if (Array.isArray(safetyStds) && safetyStds.length > 0) {
    const codes = safetyStds.map((s: any) => String(s?.code ?? '')).join(' ')
    const matches = extractStandardsCitations(codes)
    const ukish = matches.filter((m) => m.family === 'BS' || m.family === 'BS EN' || m.family === 'G99' || m.family === 'ENA').length
    const usish = matches.filter((m) => m.family === 'NEC' || m.family === 'UL' || m.family === 'ANSI' || m.family === 'NFPA').length
    if (ukish > usish && ukish > 0) {
      return { jurisdiction: 'UK', source: `parsedBrief.constraints.safety_standards majority-UK signal (${ukish} UK vs ${usish} US)` }
    }
    if (usish > ukish && usish > 0) {
      return { jurisdiction: 'US', source: `parsedBrief.constraints.safety_standards majority-US signal (${usish} US vs ${ukish} UK)` }
    }
  }
  return { jurisdiction: 'UNKNOWN', source: 'no jurisdiction field present in brief' }
}

function normaliseJurisdiction(raw: string): string | null {
  const s = raw.toUpperCase().trim()
  if (/\b(UK|GB|UNITED\s*KINGDOM|GREAT\s*BRITAIN|BRITAIN|ENGLAND|SCOTLAND|WALES)\b/.test(s)) return 'UK'
  if (/\b(US|USA|UNITED\s*STATES|AMERICA)\b/.test(s)) return 'US'
  if (/\b(EU|EUROPE|EUROPEAN\s*UNION|EEA)\b/.test(s)) return 'EU'
  if (/\b(CA|CANADA|CANADIAN)\b/.test(s)) return 'CA'
  if (/\b(CN|CHINA|CHINESE|PRC)\b/.test(s)) return 'CN'
  if (/\b(JP|JAPAN|JAPANESE)\b/.test(s)) return 'JP'
  return null
}

function inferFromNarrative(text: string): string | null {
  // Word-boundary checks — "UK grid-scale" wins over "US fallback"; mention
  // counts break ties.
  const counts: Record<string, number> = {}
  const tally = (k: string, n: number) => { counts[k] = (counts[k] ?? 0) + n }
  const t = text.toUpperCase()
  tally('UK', (t.match(/\b(UK|UNITED\s*KINGDOM|GREAT\s*BRITAIN|BRITAIN|ENGLAND|SCOTLAND|WALES|G99|ENA|OFGEM|DNO)\b/g) ?? []).length)
  tally('US', (t.match(/\b(US|USA|UNITED\s*STATES|AMERICA|FERC|NEC|NREL|UL)\b/g) ?? []).length)
  tally('EU', (t.match(/\b(EU|EUROPE|EUROPEAN\s*UNION|EEA|ENTSO[-]?E)\b/g) ?? []).length)
  tally('CA', (t.match(/\b(CANADA|CANADIAN|CSA)\b/g) ?? []).length)
  tally('CN', (t.match(/\b(CHINA|CHINESE|PRC|GB\/T)\b/g) ?? []).length)
  tally('JP', (t.match(/\b(JAPAN|JAPANESE|JIS|METI)\b/g) ?? []).length)
  const entries = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return null
  // Require a 2x margin over the runner-up to avoid false positives ("US-style"
  // mentioned once in a UK doc shouldn't flip the inference).
  if (entries.length >= 2 && entries[0][1] < entries[1][1] * 2) return null
  return entries[0][0]
}

// ── CITATION EXTRACTION ─────────────────────────────────────────────────────

export function extractStandardsCitations(text: string): StandardsFamilyMatch[] {
  if (typeof text !== 'string' || text.length === 0) return []
  const hits: StandardsFamilyMatch[] = []
  const seen = new Set<string>()
  for (const { family, pattern } of FAMILY_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const raw = String(match[0]).trim().replace(/\s+/g, ' ')
      // Dedup within the same text block — repeated mentions of the same
      // citation count once.
      const key = `${family}|${raw}`
      if (seen.has(key)) continue
      seen.add(key)
      hits.push({ family, code: raw, raw })
    }
  }
  // Filter overlapping matches: if "BS EN 61439" matched, the inner "EN 61439"
  // would also match — drop the inner. Done by checking each EN/BS match
  // against whether a BS EN match already covers it.
  return collapseOverlaps(hits)
}

function collapseOverlaps(hits: StandardsFamilyMatch[]): StandardsFamilyMatch[] {
  // Find positions of each match and drop any whose code is a substring of
  // another match's code. Cheap O(n²) — n is small.
  const ranked = [...hits].sort((a, b) => b.code.length - a.code.length)
  const kept: StandardsFamilyMatch[] = []
  for (const h of ranked) {
    let isSub = false
    for (const k of kept) {
      // If k.code contains h.code as a substring and k starts where h starts,
      // h is redundant. The BS EN 61439 vs EN 61439 case is the canonical
      // motivator. But we must allow distinct citations like "IEC 60079-0"
      // and "IEC 60079-1" to co-exist.
      if (k.code !== h.code && k.code.includes(h.code) && k.family !== h.family) {
        isSub = true
        break
      }
    }
    if (!isSub) kept.push(h)
  }
  return kept
}

// ── SCANNING THE STATE ──────────────────────────────────────────────────────

interface ScanContext {
  source_path: string
  text: string
}

function collectScanSurfaces(state: any): ScanContext[] {
  const surfaces: ScanContext[] = []
  const push = (path: string, text: unknown) => {
    if (typeof text === 'string' && text.length > 0) {
      surfaces.push({ source_path: path, text })
    }
  }
  // 1. Regulatory modifiers across every word.
  const modules: any[] = state?.moduleDecomposition?.modules ?? []
  for (let mi = 0; mi < modules.length; mi++) {
    const m = modules[mi]
    const modId = String(m?.module ?? `module[${mi}]`)
    // Module-level prose
    push(`moduleDecomposition.modules[${modId}].module_brief`, m?.module_brief)
    push(`moduleDecomposition.modules[${modId}].overview_paragraph_en`, m?.overview_paragraph_en)
    push(`moduleDecomposition.modules[${modId}].brief_overview_prose`, m?.brief_overview_prose)
    const subs: any[] = Array.isArray(m?.sub_modules) ? m.sub_modules : []
    for (let si = 0; si < subs.length; si++) {
      const sm = subs[si]
      const subId = String(sm?.id ?? sm?.sub_module_id ?? `sub[${si}]`)
      // Sub-module-level prose (where NEC 706.10 lives in the L22 state).
      push(`moduleDecomposition.modules[${modId}].sub_modules[${subId}].english_sentence`, sm?.english_sentence)
      push(`moduleDecomposition.modules[${modId}].sub_modules[${subId}].topology_clause`, sm?.topology_clause)
      push(`moduleDecomposition.modules[${modId}].sub_modules[${subId}].paragraph_en`, sm?.paragraph_en)
      push(`moduleDecomposition.modules[${modId}].sub_modules[${subId}].sentence_en`, sm?.sentence_en)
      const words: any[] = Array.isArray(sm?.words) ? sm.words : []
      for (const w of words) {
        const wordId = String(w?.id ?? w?.name_human ?? 'unknown')
        const mods: Array<{ kind: string; value: string }> = Array.isArray(w?.modifier_characters)
          ? w.modifier_characters
          : []
        for (const mod of mods) {
          if (mod?.kind === 'regulatory' && typeof mod.value === 'string') {
            push(
              `moduleDecomposition.modules[${modId}].sub_modules[${subId}].words[${wordId}].modifier_characters[regulatory]`,
              mod.value,
            )
          }
        }
      }
    }
  }
  // 2. naturalLanguageLayer prose
  const nll = state?.naturalLanguageLayer?.by_module ?? {}
  if (nll && typeof nll === 'object') {
    for (const [modKey, modVal] of Object.entries(nll)) {
      const mv: any = modVal
      push(`naturalLanguageLayer.by_module.${modKey}.paragraph_en`, mv?.paragraph_en)
      push(`naturalLanguageLayer.by_module.${modKey}.paragraph_en_llm`, mv?.paragraph_en_llm)
      const sms: any[] = Array.isArray(mv?.sub_module_sentences) ? mv.sub_module_sentences : []
      for (let i = 0; i < sms.length; i++) {
        const sm = sms[i]
        const tag = sm?.sub_module_id ?? `sub[${i}]`
        push(`naturalLanguageLayer.by_module.${modKey}.sub_module_sentences[${tag}].sentence_en`, sm?.sentence_en)
        push(`naturalLanguageLayer.by_module.${modKey}.sub_module_sentences[${tag}].paragraph_en`, sm?.paragraph_en)
      }
    }
  }
  // 3. briefOverviewProse
  const bop = state?.briefOverviewProse ?? {}
  for (const [k, v] of Object.entries(bop)) {
    push(`briefOverviewProse.${k}`, v)
  }
  return surfaces
}

// ── AUDIT ───────────────────────────────────────────────────────────────────

export interface JurisdictionalFinding {
  severity: 'HIGH' | 'MED' | 'LOW'
  code: string
  family: string
  jurisdiction: string
  accepted_families: string[]
  source_path: string
  excerpt: string
  explanation: string
}

export interface JurisdictionalAuditResult {
  jurisdiction: string
  jurisdiction_source: string
  accepted_families: string[]
  findings: JurisdictionalFinding[]
  surfaces_scanned: number
  total_citations: number
  unique_citations: number
}

export function auditJurisdictionalStandards(state: any): JurisdictionalAuditResult {
  const { jurisdiction, source } = inferJurisdiction(state)
  const accepted = STANDARDS_FAMILY_BY_JURISDICTION[jurisdiction] ?? new Set<string>()
  const surfaces = collectScanSurfaces(state)
  const findings: JurisdictionalFinding[] = []
  const seenFindings = new Set<string>()
  let totalCitations = 0
  const allCodes = new Set<string>()
  for (const surface of surfaces) {
    const matches = extractStandardsCitations(surface.text)
    totalCitations += matches.length
    for (const match of matches) {
      allCodes.add(match.code)
      // Skip universally-accepted overrides (UL 9540A, NFPA 855 — UK BESS).
      if (ALWAYS_ACCEPTED_CODES.has(match.code) || ALWAYS_ACCEPTED_CODES.has(match.code.replace(/\s+/g, ' '))) {
        continue
      }
      // If we have no jurisdiction inferred, every citation is informational
      // (LOW) — we can't decide acceptance without a target.
      if (jurisdiction === 'UNKNOWN') {
        const key = `LOW|${match.code}|${surface.source_path}`
        if (seenFindings.has(key)) continue
        seenFindings.add(key)
        findings.push({
          severity: 'LOW',
          code: match.code,
          family: match.family,
          jurisdiction: 'UNKNOWN',
          accepted_families: [],
          source_path: surface.source_path,
          excerpt: excerptAround(surface.text, match.raw),
          explanation:
            `Brief has no inferrable jurisdiction (parsedBrief.country / target_market_region / target_customers narrative absent or ambiguous). ` +
            `Cannot validate ${match.family} citation ${match.code} against an accepted-families set. ` +
            `Fix: add an explicit parsedBrief.country or parsedBrief.constraints.target_market_region to the brief.`,
        })
        continue
      }
      // Accepted family — informational LOW would be noise, skip.
      if (accepted.has(match.family)) continue
      // Wrong family for the inferred jurisdiction — HIGH.
      const acceptedList = Array.from(accepted).sort()
      const key = `HIGH|${match.code}|${surface.source_path}`
      if (seenFindings.has(key)) continue
      seenFindings.add(key)
      findings.push({
        severity: 'HIGH',
        code: match.code,
        family: match.family,
        jurisdiction,
        accepted_families: acceptedList,
        source_path: surface.source_path,
        excerpt: excerptAround(surface.text, match.raw),
        explanation:
          `Citation "${match.code}" belongs to standards family ${match.family}, which is NOT in the ` +
          `accepted-families set for the brief's inferred jurisdiction "${jurisdiction}" ` +
          `(accepted: ${acceptedList.join(', ')}). ` +
          `This is a foreign-jurisdiction citation in a ${jurisdiction} document, ` +
          `which destroys cover credibility with any reviewer who knows what ${match.family} stands for. ` +
          `Fix area: deterministic-emitter.ts and Chase research extraction — strip ${match.family} citations ` +
          `from prose/modifier_characters when the brief's jurisdiction is ${jurisdiction}, OR add a generic ` +
          `${jurisdiction}-equivalent reference. (For BESS: ${match.family} 706.10 -> IEC 62933-5-2 §6.4 is the ` +
          `accepted UK/EU equivalent for external pad-mount transformer requirements.)`,
      })
    }
  }
  return {
    jurisdiction,
    jurisdiction_source: source,
    accepted_families: Array.from(accepted).sort(),
    findings,
    surfaces_scanned: surfaces.length,
    total_citations: totalCitations,
    unique_citations: allCodes.size,
  }
}

function excerptAround(text: string, needle: string): string {
  const idx = text.indexOf(needle)
  if (idx < 0) return text.slice(0, 160)
  const start = Math.max(0, idx - 60)
  const end = Math.min(text.length, idx + needle.length + 60)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < text.length ? '...' : ''
  return `${prefix}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`
}

// ── CLI ENTRYPOINT ──────────────────────────────────────────────────────────
// Usage: npx tsx scripts/lib/jurisdictional-standards-audit.ts <statePath> [outMdPath]
// Exit code 19 on any HIGH-severity finding.

function renderMarkdown(result: JurisdictionalAuditResult, statePath: string): string {
  const lines: string[] = []
  lines.push(`# Jurisdictional-Standards Audit (gate 19) — ${statePath}`)
  lines.push('')
  lines.push(
    `**Jurisdiction inferred:** \`${result.jurisdiction}\` (source: ${result.jurisdiction_source})`,
  )
  lines.push('')
  lines.push(`**Accepted standards families:** ${result.accepted_families.length > 0 ? result.accepted_families.join(', ') : '(none — UNKNOWN jurisdiction)'}`)
  lines.push('')
  lines.push(
    `**${result.surfaces_scanned} text surface(s) scanned** ` +
      `(${result.total_citations} citations, ${result.unique_citations} unique).`,
  )
  lines.push('')
  if (result.findings.length === 0) {
    lines.push(`PASS — every standards citation belongs to a family accepted by the brief's jurisdiction.`)
    return lines.join('\n')
  }
  const high = result.findings.filter((f) => f.severity === 'HIGH')
  const med = result.findings.filter((f) => f.severity === 'MED')
  const low = result.findings.filter((f) => f.severity === 'LOW')
  lines.push(`FAIL — ${result.findings.length} finding(s): ${high.length} HIGH, ${med.length} MED, ${low.length} LOW.`)
  lines.push('')
  const sorted = [...result.findings].sort((a, b) => {
    const order = { HIGH: 0, MED: 1, LOW: 2 }
    return order[a.severity] - order[b.severity]
  })
  for (const f of sorted) {
    lines.push(`## [${f.severity}] ${f.code} (${f.family}) — wrong jurisdiction for ${f.jurisdiction} brief`)
    lines.push(`- **Source:** \`${f.source_path}\``)
    lines.push(`- **Excerpt:** ${f.excerpt}`)
    lines.push(`- **Family:** ${f.family}`)
    lines.push(`- **Inferred jurisdiction:** ${f.jurisdiction}`)
    if (f.accepted_families.length > 0) {
      lines.push(`- **Accepted families:** ${f.accepted_families.join(', ')}`)
    }
    lines.push(`- **Reason:** ${f.explanation}`)
    lines.push('')
  }
  return lines.join('\n')
}

const argv1 = process.argv[1] ?? ''
const isMain = /jurisdictional-standards-audit\.(?:ts|js|mjs|cjs)$/.test(argv1)

if (isMain) {
  const statePath = process.argv[2]
  const outMdPath = process.argv[3]
  if (!statePath) {
    console.error('Usage: jurisdictional-standards-audit <statePath> [outMdPath]')
    process.exit(1)
  }
  let state: any
  try {
    state = JSON.parse(readFileSync(statePath, 'utf-8'))
  } catch (err) {
    console.error(`[jurisdictional-standards-audit] failed to read ${statePath}: ${(err as Error).message}`)
    process.exit(1)
  }
  const result = auditJurisdictionalStandards(state)
  const md = renderMarkdown(result, statePath)
  if (outMdPath) {
    const fs = require('node:fs') as typeof import('node:fs')
    fs.writeFileSync(outMdPath, md, 'utf-8')
    console.log(`[jurisdictional-standards-audit] wrote ${outMdPath}`)
  } else {
    console.log(md)
  }
  const high = result.findings.filter((f) => f.severity === 'HIGH')
  if (high.length > 0) {
    console.error(
      `[jurisdictional-standards-audit] FAIL: ${high.length} HIGH-severity finding(s) ` +
        `(jurisdiction=${result.jurisdiction}, source=${result.jurisdiction_source})`,
    )
    process.exit(19)
  }
  console.log(
    `[jurisdictional-standards-audit] PASS: jurisdiction=${result.jurisdiction}, ` +
      `${result.surfaces_scanned} surfaces scanned, ${result.unique_citations} unique citations, ` +
      `${result.findings.length} findings (${result.findings.filter((f) => f.severity === 'MED').length} MED, ${result.findings.filter((f) => f.severity === 'LOW').length} LOW)`,
  )
}
