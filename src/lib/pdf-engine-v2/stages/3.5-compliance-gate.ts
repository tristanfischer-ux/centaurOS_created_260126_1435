/**
 * @file stages/3.5-compliance-gate.ts — G1b Compliance Gate (chain-wired).
 *
 * Tristan directive 2026-05-19: G1b was a PA-orchestrator-only stage that
 * never got ported to the chain. The renderer's collectManualReviewBadges()
 * reads `state.complianceGate` and was always empty → G1b badge never fired
 * → compliance issues invisible to founder.
 *
 * Behaviour:
 *   1. Look up CLASS_STANDARDS[productClass] for the brief's class.
 *   2. Inspect parsedBrief.constraints / parsedBrief.regulatory_requirements
 *      for jurisdiction and declared standards.
 *   3. Flag two conflict types:
 *        - MISSING_MANDATORY: brief's target market requires a mandatory
 *          standard not mentioned in the brief.
 *        - JURISDICTION_CONFLICT: brief cites two incompatible jurisdictions
 *          (e.g. US + EU primary market without unified compliance plan).
 *   4. Verdict:
 *        PASS  — all class-mandatory standards covered or brief explicitly
 *                opted out (single-jurisdiction install with no export plan).
 *        WARN  — non-blocking gaps; render an inline note in §Compliance.
 *        HALT  — blocking conflicts that the founder must resolve before
 *                manufacture (e.g. brief asks for cells without IEC 62619
 *                compliance plan AND asks for global sales).
 *
 * Cost: ZERO LLM tokens. Pure deterministic check against class-standards.ts.
 * The revision_suggestion field is populated by a heuristic (suggests the
 * cheapest mandatory standard the brief is missing). Future enhancement
 * could call Flash-Lite for a richer revision but the cheap path is enough
 * to surface the gap.
 *
 * Output shape — matches render-minimal-pdf.tsx:931 expectation:
 *   {
 *     verdict: 'PASS' | 'WARN' | 'HALT',
 *     reason: string,
 *     conflicts: Array<{
 *       severity: 'soft' | 'hard',
 *       standard_code: string,
 *       conflict_type: 'missing_mandatory' | 'jurisdiction_conflict',
 *       reason: string,
 *     }>,
 *     revision_suggestion?: {
 *       field: string,
 *       original: string,
 *       suggested: string,
 *       rationale: string,
 *     },
 *     product_class: string,
 *     ts: string,
 *   }
 */

import { getClassStandards, type RegulatoryStandard, type Jurisdiction } from '../class-standards'

export type ComplianceVerdict = 'PASS' | 'WARN' | 'HALT'

export interface ComplianceConflict {
  severity: 'soft' | 'hard'
  standard_code: string
  conflict_type: 'missing_mandatory' | 'jurisdiction_conflict'
  reason: string
}

export interface ComplianceRevisionSuggestion {
  field: string
  original: string
  suggested: string
  rationale: string
}

export interface ComplianceGateResult {
  verdict: ComplianceVerdict
  reason: string
  conflicts: ComplianceConflict[]
  revision_suggestion?: ComplianceRevisionSuggestion
  product_class: string
  jurisdictions_detected: Jurisdiction[]
  mandatory_total: number
  mandatory_covered: number
  ts: string
}

/**
 * Extract jurisdiction signals from the brief's parsed constraints.
 * Looks for explicit jurisdiction field, target market region, geography
 * field from the wizard, and prose mentions of US/EU/UK/global.
 */
function detectJurisdictions(parsedBrief: any, briefText: string): Jurisdiction[] {
  const out = new Set<Jurisdiction>()
  const c = parsedBrief?.constraints ?? parsedBrief ?? {}
  const jurisField = c.jurisdiction || c.target_market || c.market || ''
  const geoField = parsedBrief?.geography ?? c.geography ?? []
  const geo = Array.isArray(geoField) ? geoField.join(' ') : String(geoField ?? '')
  const haystack = `${jurisField} ${geo} ${briefText}`.toLowerCase()
  if (/\b(uk|united kingdom|britain|british|england|scotland|wales|northern ireland)\b/.test(haystack)) out.add('UK')
  if (/\b(eu|european union|europe|european|germany|france|spain|italy|netherlands|sweden|denmark|poland|czech|austria|belgium|finland|portugal|greece|ireland)\b/.test(haystack)) out.add('EU')
  if (/\b(us|usa|united states|america|american|california|texas|new york|florida|washington|oregon|nevada|arizona|illinois|massachusetts)\b/.test(haystack)) out.add('US')
  if (/\b(global|worldwide|international|export|multi[- ]region)\b/.test(haystack)) out.add('global')
  return Array.from(out)
}

/**
 * Extract explicitly-declared standard codes from the brief.
 * Looks at parsedBrief.regulatory_requirements + parsedBrief.standards +
 * regex over the brief text for known standard prefixes.
 */
function detectDeclaredStandards(parsedBrief: any, briefText: string): Set<string> {
  const out = new Set<string>()
  const r = parsedBrief?.regulatory_requirements
  if (Array.isArray(r)) for (const s of r) if (typeof s === 'string') out.add(s.toUpperCase().trim())
  const s2 = parsedBrief?.standards
  if (Array.isArray(s2)) for (const s of s2) if (typeof s === 'string') out.add(s.toUpperCase().trim())
  // Regex catch-all: IEC NNNN, UL NNNN, ISO NNNNN, BS EN NNNN, EN NNNN, NFPA NNN,
  // DO-NNNX, FCC Part NN, RoHS, REACH, GDPR, HACCP, GMP, MCS, G99, EU NNNN/YYYY,
  // PED NNNN/NN/EU, MD NNNN/NN/EC, ErP NNNN/NNN/EC, IEEE NNN, ANSI NNNN.
  // 2026-05-19 v5 audit fix #6: previously missed EU regulation codes, PED, MD,
  // ErP, IEEE, ANSI — caused false-positive "missing" flags on standards that
  // were explicitly cited in the brief (live chain output showed EU 517/2014
  // and PED 2014/68/EU flagged as missing despite being declared verbatim).
  const codeRegex = /\b(IEC|UL|ISO|BS\s*EN|EN|NFPA|FCC|UN|G\d{2,3}|MCS|RoHS|REACH|GDPR|HACCP|GMP|HIPAA|DO-?\d{3}\w?|ASIL|CE|EU|PED|MD|ErP|IEEE|ANSI|F[- ]gas)\s*[-]?\s*(\d{2,5}\w?(?:[-/]\d{1,4})?(?:\/[A-Z]{2})?)?/gi
  const matches = briefText.matchAll(codeRegex)
  for (const m of matches) {
    const code = (m[0] || '').trim().replace(/\s+/g, ' ').toUpperCase()
    if (code) out.add(code)
  }
  return out
}

/** Naive containment: does the brief's declared set mention this standard's code? */
function declaredMentionsStandard(declared: Set<string>, std: RegulatoryStandard): boolean {
  const code = std.code.toUpperCase().trim()
  if (declared.has(code)) return true
  // Loosened match — many briefs cite "IEC 62619" loosely as "IEC62619" or "62619"
  for (const d of declared) {
    if (d === code) return true
    if (d.includes(code) || code.includes(d)) return true
    const codeStrip = code.replace(/\s+/g, '').replace(/[-/]/g, '')
    const dStrip = d.replace(/\s+/g, '').replace(/[-/]/g, '')
    if (codeStrip === dStrip) return true
  }
  return false
}

/**
 * Main entrypoint. Synchronous, deterministic, zero-LLM.
 *
 * @param parsedBrief — output of runBriefParsing (state.brief.parsed_revised or parsed_original)
 * @param productClass — output of classifyProduct (already canonicalised by chain)
 * @param briefText — raw / refined brief text (for regex fallback + jurisdiction detection)
 */
export function runComplianceGate(
  parsedBrief: any,
  productClass: string,
  briefText: string,
): ComplianceGateResult {
  const cls = getClassStandards(productClass)
  let jurisdictions = detectJurisdictions(parsedBrief, briefText)
  const declared = detectDeclaredStandards(parsedBrief, briefText)
  const ts = new Date().toISOString()
  // 2026-05-19 v5 audit fix #17 (GPT-5.5): if no jurisdiction detected, default
  // to UK + EU + US so mandatory standards from those major markets still gate
  // the brief. Previously an empty-jurisdiction brief would only check
  // global/IEC/ISO/industry — undercounting regional mandatories.
  if (jurisdictions.length === 0) {
    jurisdictions = ['UK', 'EU', 'US']
  }

  // If no class-standards data, fail open with a soft WARN.
  if (!cls || !Array.isArray(cls.standards) || cls.standards.length === 0) {
    return {
      verdict: 'WARN',
      reason: `No class-standards registered for "${productClass}". Compliance check skipped — engineer must verify manually before sale.`,
      conflicts: [],
      product_class: productClass,
      jurisdictions_detected: jurisdictions,
      mandatory_total: 0,
      mandatory_covered: 0,
      ts,
    }
  }

  // Mandatory standards: filter to those whose jurisdiction matches a detected
  // jurisdiction, OR global/IEC/ISO/industry which apply everywhere.
  const globallyApplicable: Jurisdiction[] = ['global', 'IEC', 'ISO', 'industry']
  const isApplicable = (j: Jurisdiction): boolean => globallyApplicable.includes(j) || jurisdictions.includes(j)

  const applicableMandatory = cls.standards.filter(s => s.mandatory && isApplicable(s.jurisdiction))
  const missingMandatory = applicableMandatory.filter(s => !declaredMentionsStandard(declared, s))
  const coveredCount = applicableMandatory.length - missingMandatory.length

  const conflicts: ComplianceConflict[] = []
  for (const s of missingMandatory) {
    conflicts.push({
      severity: 'soft',
      standard_code: s.code,
      conflict_type: 'missing_mandatory',
      reason: `${s.title} (${s.jurisdiction}). ${s.applies_because}`,
    })
  }

  // Jurisdiction conflict: brief cites both US and EU as primary AND missing
  // both UL 9540A-class and CE-class on a class that needs both. Heuristic
  // for now: if more than one of {US, EU, UK} declared AND no global plan
  // mentioned (the keyword "harmonised" or "multi-market" or "global" not in
  // the brief), warn that double-jurisdiction adds substantial scope.
  if (jurisdictions.filter(j => j === 'US' || j === 'EU' || j === 'UK').length >= 2 &&
      !/(harmoni[sz]ed|multi[- ]market|global compliance|world[- ]ready)/i.test(briefText)) {
    conflicts.push({
      severity: 'soft',
      standard_code: 'JURISDICTION_SCOPE',
      conflict_type: 'jurisdiction_conflict',
      reason: `Brief targets multiple regions (${jurisdictions.join(', ')}) without an explicit harmonisation plan. Each region adds £25-60k in certification cost.`,
    })
  }

  // Verdict:
  // - PASS if no conflicts at all
  // - WARN if any soft conflicts (missing mandatories, jurisdiction-scope)
  // - HALT reserved for future hard conflicts (e.g. brief asks for chemistry
  //   explicitly banned in the target market). For now we never emit HALT.
  let verdict: ComplianceVerdict = 'PASS'
  let reason = `${coveredCount}/${applicableMandatory.length} mandatory standards covered in the brief.`
  if (conflicts.length > 0) {
    verdict = 'WARN'
    const missingCount = missingMandatory.length
    if (missingCount > 0) {
      reason = `${missingCount} mandatory standard${missingCount === 1 ? '' : 's'} not declared in the brief for the detected jurisdiction${jurisdictions.length === 1 ? '' : 's'} (${jurisdictions.join(', ') || 'none — defaulting to global mandatory floor'}).`
    } else {
      reason = `Multi-jurisdiction scope without harmonisation plan.`
    }
  }

  // Revision suggestion: pick the cheapest missing mandatory and propose
  // adding it to the brief's regulatory list. Founder reads this in the PDF.
  let revision_suggestion: ComplianceRevisionSuggestion | undefined
  if (missingMandatory.length > 0) {
    const cheapest = [...missingMandatory].sort((a, b) => a.typical_compliance_cost_gbp - b.typical_compliance_cost_gbp)[0]
    revision_suggestion = {
      field: 'regulatory_requirements',
      original: Array.isArray(parsedBrief?.regulatory_requirements) && parsedBrief.regulatory_requirements.length > 0
        ? parsedBrief.regulatory_requirements.join(', ')
        : '(none declared)',
      suggested: `Add ${cheapest.code} (${cheapest.title}). Typical compliance cost £${cheapest.typical_compliance_cost_gbp.toLocaleString()}, lead time ${cheapest.typical_lead_time_weeks} weeks.`,
      rationale: `Cheapest missing mandatory standard for this class + your declared jurisdiction. ${cheapest.applies_because}`,
    }
  }

  return {
    verdict,
    reason,
    conflicts,
    revision_suggestion,
    product_class: productClass,
    jurisdictions_detected: jurisdictions,
    mandatory_total: applicableMandatory.length,
    mandatory_covered: coveredCount,
    ts,
  }
}
