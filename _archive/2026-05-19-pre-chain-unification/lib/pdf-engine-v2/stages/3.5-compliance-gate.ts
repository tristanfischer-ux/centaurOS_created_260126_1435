/**
 * @file 3.5-compliance-gate.ts — P5b: Compliance feasibility gate.
 *
 * Background (Tristan directive 2026-05-17 + engine-flow diagram §2):
 * regulatory extraction currently fires AFTER the full BoM is emitted, so we
 * spend the LLM budget on a regulatorily-impossible design before we discover
 * the conflict. This gate moves the compliance feasibility check to fire
 * BETWEEN the Feasibility Gate (Stage 4) and Stage 1.7 module decomposition,
 * so we never decompose, BoM, or cost-roll a brief whose deployment region /
 * operating environment / safety class is incompatible with its
 * class-mandatory standards.
 *
 * Pure-deterministic by design — no LLM call. Reads:
 *   - `parsedBrief` (StructuredBriefJSON) — operating envelope, safety
 *     standards declared by the founder, additional constraints, jurisdiction
 *     hints inside free-form text fields.
 *   - `class-standards.ts` — the per-class MANDATORY standards registry.
 *
 * Output verdict:
 *   - PASS  — no detectable conflicts; pipeline continues
 *   - WARN  — soft conflict (a class-mandatory standard wasn't named, but the
 *             brief is plausibly serviceable once compliance work is scoped).
 *             Pipeline continues; the warning is annotated onto state so the
 *             PDF surfaces it.
 *   - HALT  — hard conflict between brief and class-mandatory standards
 *             (e.g. "BESS for indoor residential use" cites UL 9540 which is
 *             a commercial system standard). Pipeline halts before Stage 1.7;
 *             a brief-revision suggestion is emitted onto state so the next
 *             revision cycle can be triggered upstream.
 *
 * Cost: zero LLM tokens, sub-millisecond runtime.
 */

import type { StructuredBriefJSON } from '../types'
import type { StageResult } from '../types'
import { getClassStandards, type RegulatoryStandard } from '../class-standards'
import { getActionLogger } from '../lib/action-logger'

export type ComplianceVerdict = 'PASS' | 'WARN' | 'HALT'

export interface ComplianceConflict {
  /** The class-mandatory standard that the brief conflicts with (or fails to
   *  acknowledge). Standard code is the canonical short form (e.g. "UL 9540"). */
  standard_code: string
  /** Human-readable title of the standard. */
  standard_title: string
  /** How the brief conflicts: "missing" (silent on a mandatory standard),
   *  "incompatible" (brief constraint actively excludes the standard's scope),
   *  "jurisdiction-gap" (brief targets a market the brief doesn't address). */
  conflict_type: 'missing' | 'incompatible' | 'jurisdiction-gap'
  /** Why this is a conflict, in plain English. */
  reason: string
  /** Severity — drives PASS/WARN/HALT. */
  severity: 'soft' | 'hard'
}

export interface BriefRevisionSuggestion {
  /** What in the brief needs to change for this design to be compliant. */
  field: 'deployment_region' | 'operating_environment' | 'safety_class' | 'use_case' | 'standards_list'
  /** Original value as the founder wrote it (verbatim where possible). */
  original: string
  /** Suggested revised value. */
  suggested: string
  /** Why this revision unlocks compliance. */
  rationale: string
}

export interface ComplianceGateResult {
  verdict: ComplianceVerdict
  /** Short explanation of the verdict for log + PDF rendering. */
  reason: string
  /** All conflicts detected; may be empty on PASS. */
  conflicts: ComplianceConflict[]
  /** Class-mandatory standards that ARE plausibly addressable as the brief stands. */
  applicable_standards: Array<Pick<RegulatoryStandard, 'code' | 'title' | 'jurisdiction'>>
  /** Brief-revision suggestions to surface to the founder; emitted ONLY on HALT. */
  revision_suggestion: BriefRevisionSuggestion | null
  /** Compliance posture summary in one sentence — for PDF compliance section. */
  posture_summary: string
}

// ─── Deterministic conflict-detection rules ─────────────────────────────────

/**
 * Class-specific incompatibility rules. Each rule answers a single question:
 *  "given the brief's stated text + structured constraints, does this
 *   class-mandatory standard's scope cover this brief's use case?"
 *
 * Rules are evaluated in declaration order. The first MATCHING incompatibility
 * rule per (class, standard_code) wins and emits a hard conflict.
 *
 * Soft (missing-jurisdiction) checks are emitted separately by
 * detectJurisdictionGap().
 */
type ConflictRule = {
  class_keys: string[]
  standard_code: string
  /** Match function — returns null if no conflict, otherwise a populated conflict. */
  match: (brief: string, parsed: StructuredBriefJSON | null) => ComplianceConflict | null
}

const CONFLICT_RULES: ConflictRule[] = [
  // ── BESS: UL 9540 is a commercial / industrial system standard; an indoor
  //    residential BESS using the UL 9540 cert as its compliance claim is a
  //    hard conflict (residential BESS routes via UL 9540A propagation +
  //    UL 1973 cell + IEC 62619, with NFPA 855 for installation — UL 9540
  //    listing is for commercial system-level packaging).
  {
    class_keys: ['energy_storage', 'bess'],
    standard_code: 'UL 9540',
    match: (brief, _parsed) => {
      const t = brief.toLowerCase()
      const indoorResidential =
        /\b(indoor|in-home|inside the home|domestic|residential|home)\b/.test(t) &&
        // Negation list: words that genuinely flip the use case to commercial/
        // industrial. "utility room" is residential, so we anchor "utility-scale"
        // or "utility company" rather than the bare word "utility".
        !/\b(commercial|industrial|grid[- ]scale|utility[- ]scale|utility company|warehouse|factory|outdoor)\b/.test(t)
      if (!indoorResidential) return null
      return {
        standard_code: 'UL 9540',
        standard_title: 'Standard for Energy Storage Systems and Equipment',
        conflict_type: 'incompatible',
        severity: 'hard',
        reason:
          'Brief describes an indoor residential BESS. UL 9540 is a commercial/industrial system-level standard — residential indoor installations route compliance via UL 9540A (propagation test) + UL 1973 (cell) + IEC 62619, with NFPA 855 governing installation clearances. The UL 9540 system listing does not cover a residential indoor envelope.',
      }
    },
  },
  // ── BESS: outdoor enclosure with no IP rating / no thermal envelope is a
  //    HALT candidate when the brief explicitly says "outdoor" but no
  //    temperature range is given — NFPA 855 + UL 9540A both expect a
  //    qualified environmental envelope.
  {
    class_keys: ['energy_storage', 'bess'],
    standard_code: 'NFPA 855',
    match: (brief, parsed) => {
      const t = brief.toLowerCase()
      const outdoor = /\b(outdoor|outside|external|kerbside|forecourt|grid-scale|utility[- ]scale)\b/.test(t)
      const env = parsed?.constraints?.operating_environment
      const noEnvelope = !env || (env.temp_min_c == null && env.temp_max_c == null)
      if (!outdoor || !noEnvelope) return null
      return {
        standard_code: 'NFPA 855',
        standard_title: 'Standard for the Installation of Stationary Energy Storage Systems',
        conflict_type: 'missing',
        severity: 'soft',
        reason:
          'Brief targets outdoor deployment but no operating temperature envelope (min/max) is declared. NFPA 855 and UL 9540A both expect a qualified thermal range; without it, the installation clearance + fire-suppression assumptions cannot be derived.',
      }
    },
  },
  // ── Drone: any commercial UK operation without a CAA / CAP 722 reference is
  //    a hard conflict (CAA operational authorisation drives airframe class
  //    decisions; you can't design a commercial UK drone in the dark on this).
  {
    class_keys: ['drone'],
    standard_code: 'CAP 722',
    match: (brief, parsed) => {
      const t = brief.toLowerCase()
      const commercialUK =
        /\b(commercial|enterprise|business|paid|professional)\b/.test(t) &&
        /\b(uk|united kingdom|britain|england|scotland|wales|northern ireland)\b/.test(t)
      const safety = parsed?.constraints?.safety_standards ?? []
      const codesMentioned = safety.map(s => (s.code ?? s.standard ?? '').toLowerCase())
      const hasCaa = codesMentioned.some(c => /(caa|cap[\s_-]?722)/.test(c))
      // Also accept CAP 722 cited in free-form brief text
      const briefCitesCaa = /\b(caa|cap[\s_-]?722)\b/i.test(brief)
      if (!commercialUK || hasCaa || briefCitesCaa) return null
      return {
        standard_code: 'CAP 722',
        standard_title: 'Unmanned Aircraft System Operations in UK Airspace — UK CAA',
        conflict_type: 'jurisdiction-gap',
        severity: 'hard',
        reason:
          'Brief targets commercial UK drone operations but does not cite CAA / CAP 722. UK commercial UAS operations require either an Operational Authorisation (Specific category) or Open category compliance — the airframe class (C0-C6 under EU 2019/945) and Remote ID architecture cannot be decided without confirming the regulatory route.',
      }
    },
  },
  // ── Heat pump: residential UK without MCS is WARN (MCS is "de-facto
  //    mandatory" for grant eligibility — surface as soft).
  {
    class_keys: ['thermal_system', 'heatpump', 'heat_pump'],
    standard_code: 'MCS',
    match: (brief, parsed) => {
      const t = brief.toLowerCase()
      const residentialUK =
        /\b(residential|domestic|home|household)\b/.test(t) &&
        /\b(uk|united kingdom|britain|england|scotland|wales)\b/.test(t)
      const safety = parsed?.constraints?.safety_standards ?? []
      const codesMentioned = safety.map(s => (s.code ?? s.standard ?? '').toLowerCase())
      const hasMcs = codesMentioned.some(c => /\bmcs\b/.test(c)) || /\bmcs\b/i.test(brief)
      if (!residentialUK || hasMcs) return null
      return {
        standard_code: 'MCS',
        standard_title: 'Microgeneration Certification Scheme (UK)',
        conflict_type: 'missing',
        severity: 'soft',
        reason:
          'Brief targets the UK residential heat-pump market but does not cite MCS. MCS certification is required for Boiler Upgrade Scheme grant eligibility (de-facto mandatory for residential UK heat pumps) — without it the addressable customer base shrinks dramatically.',
      }
    },
  },
  // ── Heat pump: R290 indoor without F-gas / EN 378 acknowledgement = HALT
  //    (A3 refrigerant charge limits dictate refrigerant volume, sealing, and
  //    leak-detection architecture; you can't design without this).
  {
    class_keys: ['thermal_system', 'heatpump', 'heat_pump'],
    standard_code: 'BS EN 378',
    match: (brief, _parsed) => {
      const t = brief.toLowerCase()
      const r290Indoor = /\b(r290|propane|hydrocarbon)\b/.test(t) && /\b(indoor|residential|domestic)\b/.test(t)
      const acknowledges = /\b(en\s*378|f[- ]?gas|charge limit|leak detect)/i.test(t)
      if (!r290Indoor || acknowledges) return null
      return {
        standard_code: 'BS EN 378',
        standard_title: 'Refrigerating systems and heat pumps — Safety and environmental requirements',
        conflict_type: 'incompatible',
        severity: 'hard',
        reason:
          'Brief specifies R290 (propane, A3 flammable) for an indoor / residential install but does not acknowledge BS EN 378 charge limits or leak-detection requirements. A3 charge per room volume is hard-capped under EN 378 — design cannot proceed until the brief commits to a refrigerant charge that fits the smallest target room, OR switches to a non-flammable refrigerant.',
      }
    },
  },
  // ── CGM (wearable medical): US market with no IVDR / FDA route = HALT.
  {
    class_keys: ['wearable_medical', 'cgm'],
    standard_code: 'FDA 510(k) / PMA',
    match: (brief, parsed) => {
      const t = brief.toLowerCase()
      const usTarget = /\b(us|usa|united states|america|fda)\b/.test(t)
      const safety = parsed?.constraints?.safety_standards ?? []
      const codesMentioned = safety.map(s => (s.code ?? s.standard ?? '').toLowerCase())
      const acknowledges =
        codesMentioned.some(c => /(510|pma|ivdr|fda)/.test(c)) ||
        /\b(510\(?k\)?|pma|ivdr|fda clearance)\b/i.test(brief)
      if (!usTarget || acknowledges) return null
      return {
        standard_code: 'FDA 510(k) / PMA',
        standard_title: 'US FDA premarket clearance / approval for CGM (Class III in vitro diagnostic)',
        conflict_type: 'jurisdiction-gap',
        severity: 'hard',
        reason:
          'Brief targets US market for a CGM but does not cite the FDA 510(k) or PMA route. CGMs are Class III in-vitro diagnostic devices in the US — without committing to a predicate device + 510(k) submission OR a full PMA, the clinical-trial cost, software-validation depth, and time-to-market cannot be scoped.',
      }
    },
  },
  // ── CGM: any market without ISO 13485 + ISO 14971 = WARN (mandatory QMS,
  //    softly flagged because the brief author may have implied it).
  {
    class_keys: ['wearable_medical', 'cgm'],
    standard_code: 'ISO 13485',
    match: (brief, parsed) => {
      const safety = parsed?.constraints?.safety_standards ?? []
      const codes = safety.map(s => (s.code ?? s.standard ?? '').toLowerCase())
      const acknowledges =
        codes.some(c => /13485|14971/.test(c)) || /\b(iso\s*13485|iso\s*14971|qms)\b/i.test(brief)
      if (acknowledges) return null
      return {
        standard_code: 'ISO 13485',
        standard_title: 'Medical devices — Quality management systems',
        conflict_type: 'missing',
        severity: 'soft',
        reason:
          'CGM brief silent on ISO 13485 QMS and ISO 14971 risk-management. Both are mandatory for any medical-device manufacturer entering EU/UK/Canada and are sized at ~£57k combined first-year compliance cost — should be acknowledged in the brief.',
      }
    },
  },
  // ── EV charger: public-pay UK without UK SMM / MID reference = HALT (the
  //    metering accuracy class drives shunt + ADC architecture).
  {
    class_keys: ['ev_charger'],
    standard_code: 'UK SMM Reg 2007',
    match: (brief, parsed) => {
      const t = brief.toLowerCase()
      const publicPayUK =
        /\b(public[- ]pay|paid|public|kerbside|forecourt|commercial|workplace)\b/.test(t) &&
        /\b(uk|united kingdom|britain|england|scotland|wales)\b/.test(t)
      const safety = parsed?.constraints?.safety_standards ?? []
      const codes = safety.map(s => (s.code ?? s.standard ?? '').toLowerCase())
      const acknowledges =
        codes.some(c => /smm|mid|class b|measuring instruments/.test(c)) ||
        /\b(smm|mid[- ]class|measuring instruments|meter accuracy)\b/i.test(brief)
      if (!publicPayUK || acknowledges) return null
      return {
        standard_code: 'UK SMM Reg 2007',
        standard_title: 'UK Measuring Instruments (Active electrical energy meters) Regulations',
        conflict_type: 'jurisdiction-gap',
        severity: 'hard',
        reason:
          'Brief targets public-pay UK EV charging but does not acknowledge UK SMM / MID Class B metering. Without the metering accuracy commitment, the shunt + ADC architecture cannot be specified and the design cannot enter UK public-pay revenue service.',
      }
    },
  },
  // ── HAPS: stratospheric ops without DO-178C / DO-160 acknowledgement.
  {
    class_keys: ['haps'],
    standard_code: 'DO-178C',
    match: (brief, parsed) => {
      const t = brief.toLowerCase()
      const haps = /\b(stratospher|haps|high[- ]altitude|18\s*km|20\s*km|25\s*km)/.test(t)
      const safety = parsed?.constraints?.safety_standards ?? []
      const codes = safety.map(s => (s.code ?? s.standard ?? '').toLowerCase())
      const acknowledges =
        codes.some(c => /do[- ]?178|do[- ]?160|easa|faa|airworth/.test(c)) ||
        /\b(do[- ]?178|do[- ]?160|easa|faa|airworth)/i.test(brief)
      if (!haps || acknowledges) return null
      return {
        standard_code: 'DO-178C',
        standard_title: 'Software Considerations in Airborne Systems and Equipment Certification',
        conflict_type: 'missing',
        severity: 'hard',
        reason:
          'HAPS brief is silent on DO-178C software / DO-160 environmental / airworthiness route (EASA SC-HAPS or FAA Experimental). These three drive 50-70 % of programme cost and 12-18 months of lead time — the brief must commit to a route before module decomposition can scope autopilot + redundancy management.',
      }
    },
  },
]

// ─── Class-key resolver ─────────────────────────────────────────────────────

/**
 * Normalise the product_class string from the classifier or parsed brief into
 * one of the canonical keys used by class-standards / CONFLICT_RULES. Mirrors
 * the resolver in class-standards.ts but exported for the gate's own use.
 */
function resolveClassKey(raw: string | null | undefined): string {
  if (!raw) return 'unknown'
  const lower = raw.toLowerCase().replace(/[_-]/g, ' ')
  if (/\b(bess|battery energy storage|energy storage)\b/.test(lower)) return 'energy_storage'
  if (/\b(heat ?pump|thermal system|hvac)\b/.test(lower)) return 'thermal_system'
  if (/\b(vertical farm|indoor farm|hydroponic)\b/.test(lower)) return 'vertical_farm'
  if (/\b(ev ?charger|charging station|charge point)\b/.test(lower)) return 'ev_charger'
  if (/\b(cgm|continuous glucose|wearable medical|patch monitor)\b/.test(lower)) return 'wearable_medical'
  if (/\b(drone|uav|quadcopter)\b/.test(lower)) return 'drone'
  if (/\b(edge ai|edge compute|inference)\b/.test(lower)) return 'edge_ai_server'
  if (/\b(bioreactor|fermenter|cell culture)\b/.test(lower)) return 'bioreactor'
  if (/\b(auv|underwater vehicle|subsea)\b/.test(lower)) return 'auv'
  if (/\b(haps|stratospheric|high altitude platform|pseudo satellite)\b/.test(lower)) return 'haps'
  return raw.toLowerCase().replace(/\s+/g, '_')
}

// ─── Soft-conflict detection: jurisdiction gaps ─────────────────────────────

/**
 * Detect when the brief targets a jurisdiction (US / EU / UK) for which a
 * class-mandatory standard exists, but the brief omits any reference. These
 * are SOFT conflicts — the design can proceed but the founder should be
 * warned that this standard will need to be added later.
 */
function detectJurisdictionGap(
  brief: string,
  parsed: StructuredBriefJSON | null,
  classKey: string,
  alreadyHandled: Set<string>,
): ComplianceConflict[] {
  const out: ComplianceConflict[] = []
  const t = brief.toLowerCase()
  const standards = getClassStandards(classKey).standards
  const safety = parsed?.constraints?.safety_standards ?? []
  const briefCodes = new Set<string>(
    safety.map(s => (s.code ?? s.standard ?? '').toLowerCase().trim()).filter(Boolean),
  )

  const jurisdictions: Array<{ label: 'UK' | 'EU' | 'US'; re: RegExp }> = [
    { label: 'UK', re: /\b(uk|united kingdom|britain|england|scotland|wales)\b/ },
    { label: 'EU', re: /\b(eu|european union|europe|ce[- ]mark)\b/ },
    { label: 'US', re: /\b(us|usa|united states|america|fda)\b/ },
  ]
  const briefJurisdictions = new Set(jurisdictions.filter(j => j.re.test(t)).map(j => j.label))
  if (briefJurisdictions.size === 0) return []

  for (const std of standards) {
    if (alreadyHandled.has(std.code)) continue
    if (!std.mandatory) continue
    // Only count standards in jurisdictions the brief targets
    if (!briefJurisdictions.has(std.jurisdiction as 'UK' | 'EU' | 'US')) continue
    const codeLower = std.code.toLowerCase()
    if (briefCodes.has(codeLower)) continue
    if (briefCodes.size > 0) {
      // Allow fuzzy match: brief says "UL 9540" → matches "UL 9540A" if either is the prefix
      const fuzzy = Array.from(briefCodes).some(bc => bc.includes(codeLower) || codeLower.includes(bc))
      if (fuzzy) continue
    }
    // Also tolerate brief mentioning standard in free text
    const escaped = std.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(brief)) continue
    out.push({
      standard_code: std.code,
      standard_title: std.title,
      conflict_type: 'missing',
      severity: 'soft',
      reason: `Brief targets ${std.jurisdiction} market but does not cite ${std.code} (${std.title.slice(0, 80)}…). ${std.applies_because}`,
    })
  }
  return out
}

// ─── Brief-revision suggestion builder ──────────────────────────────────────

/**
 * On HALT, produce a single concrete revision suggestion for the founder.
 * Picks the first hard conflict and converts it into a brief-field change.
 */
function buildRevisionSuggestion(
  hardConflict: ComplianceConflict,
  brief: string,
): BriefRevisionSuggestion | null {
  switch (hardConflict.standard_code) {
    case 'UL 9540':
      return {
        field: 'use_case',
        original: 'indoor residential BESS',
        suggested:
          'either (a) reposition as a commercial/industrial system to keep the UL 9540 route, OR (b) drop UL 9540 from the standards list and target UL 9540A + UL 1973 + IEC 62619 + NFPA 855 for the residential indoor envelope',
        rationale:
          'UL 9540 is a commercial system-level standard. Indoor residential installations route via the cell + propagation + installation triad above.',
      }
    case 'CAP 722':
      return {
        field: 'standards_list',
        original: 'commercial UK drone operations, no CAA reference',
        suggested:
          'cite CAP 722 + the intended operational category (Open A1/A2/A3, Specific with Operational Authorisation, or Certified) and the airframe class (C0–C6 under EU 2019/945, retained in UK law)',
        rationale:
          'UK CAA operational authorisation drives airframe class + Remote ID architecture; without it the design cannot be sized.',
      }
    case 'BS EN 378':
      return {
        field: 'operating_environment',
        original: 'R290 indoor heat pump with no charge / room-volume statement',
        suggested:
          'either (a) commit to the smallest target room volume and the corresponding maximum R290 charge per EN 378 (typically ≤ 152 g for living spaces without leak detection), OR (b) switch to a non-flammable refrigerant (R32, R454B) and accept the higher GWP',
        rationale:
          'A3 refrigerant charge per room volume is hard-capped — design cannot proceed without committing to one of these two routes.',
      }
    case 'FDA 510(k) / PMA':
      return {
        field: 'standards_list',
        original: 'US-targeted CGM, no FDA pathway named',
        suggested:
          'cite either a predicate device for a 510(k) submission (e.g. Dexcom G6 K183535, Abbott Libre K200022) OR commit to a full PMA route (~£220k, ~78 weeks)',
        rationale:
          'CGM is Class III in-vitro diagnostic in the US; predicate choice or PMA commitment drives clinical-trial cost and time-to-market.',
      }
    case 'UK SMM Reg 2007':
      return {
        field: 'standards_list',
        original: 'UK public-pay EV charger with no metering-accuracy commitment',
        suggested:
          'commit to UK SMM / MID Class B (≥1 % accuracy) metering with an embedded MID-certified meter (e.g. EM4 / EM340 / KMP-EM33A class B) — drives shunt selection and ADC chain decisions',
        rationale:
          'Without MID Class B metering, the charger cannot enter UK public-pay revenue service; the metering choice cascades into the entire power-electronics stack.',
      }
    case 'DO-178C':
      return {
        field: 'standards_list',
        original: 'HAPS brief silent on airworthiness route',
        suggested:
          'commit to an airworthiness route — either EASA SC-HAPS Special Conditions (~£180k, ~72 weeks) or FAA Experimental Special Airworthiness Certificate — and the matching software DAL (typically DAL-B for autopilot)',
        rationale:
          'DO-178C software + DO-160 environmental + airworthiness route drive 50-70 % of programme cost; route must be picked before module decomposition.',
      }
    default:
      return {
        field: 'standards_list',
        original: `Conflict with ${hardConflict.standard_code}`,
        suggested: `Revise the brief to either acknowledge ${hardConflict.standard_code} (${hardConflict.standard_title}) or restate the use case to fall outside its scope`,
        rationale: hardConflict.reason,
      }
  }
}

// ─── Stage entry point ──────────────────────────────────────────────────────

/**
 * Run the compliance feasibility gate. Pure-deterministic; no LLM call.
 *
 * @param briefText  The current (possibly augmented) founder brief text.
 * @param parsedBrief The StructuredBriefJSON output of Stage 1 parsing — may
 *                    be null on the legacy non-PA path; rules degrade gracefully.
 * @param productClass The classifier's product_class string. Resolved to a
 *                    canonical key for rule + standards lookup.
 */
export async function runComplianceGate(
  briefText: string,
  parsedBrief: StructuredBriefJSON | null,
  productClass: string,
): Promise<StageResult<ComplianceGateResult>> {
  const startTime = Date.now()
  const logger = getActionLogger()
  logger.logStage({ step_name: 'compliance_gate', action_type: 'stage_start' })

  try {
    const classKey = resolveClassKey(productClass)
    const classStandards = getClassStandards(classKey)

    // 1. Run hard / soft conflict rules for this class
    const conflicts: ComplianceConflict[] = []
    const handled = new Set<string>()
    for (const rule of CONFLICT_RULES) {
      if (!rule.class_keys.includes(classKey)) continue
      const c = rule.match(briefText, parsedBrief)
      if (c) {
        conflicts.push(c)
        handled.add(c.standard_code)
      }
    }

    // 2. Detect jurisdiction gaps — softs only
    const jurisdictionGaps = detectJurisdictionGap(briefText, parsedBrief, classKey, handled)
    conflicts.push(...jurisdictionGaps)

    // 3. Apply soft-cap: at most 5 soft conflicts surfaced (avoid swamping
    //    the founder when the brief is sparse on standards)
    const hardConflicts = conflicts.filter(c => c.severity === 'hard')
    const softConflicts = conflicts.filter(c => c.severity === 'soft').slice(0, 5)
    const finalConflicts = [...hardConflicts, ...softConflicts]

    // 4. Verdict + posture summary
    let verdict: ComplianceVerdict = 'PASS'
    let reason = `No detectable compliance conflicts for ${classKey}; ${classStandards.standards.length} class-mandatory standards in scope.`
    let revision: BriefRevisionSuggestion | null = null

    if (hardConflicts.length > 0) {
      verdict = 'HALT'
      reason = `Hard conflict(s) detected: ${hardConflicts.map(c => c.standard_code).join(', ')}. Brief must be revised before module decomposition can proceed.`
      revision = buildRevisionSuggestion(hardConflicts[0], briefText)
    } else if (softConflicts.length > 0) {
      verdict = 'WARN'
      reason = `${softConflicts.length} soft conflict(s) noted: ${softConflicts.map(c => c.standard_code).join(', ')}. Pipeline continues; conflicts will be surfaced in the §Compliance section.`
    }

    const applicableStandards = classStandards.standards
      .filter(s => s.mandatory && !handled.has(s.code))
      .map(s => ({ code: s.code, title: s.title, jurisdiction: s.jurisdiction }))

    const posture =
      verdict === 'PASS'
        ? `Compliance feasibility OK — ${classStandards.standards.filter(s => s.mandatory).length} mandatory standards in scope, no brief-level conflicts.`
        : verdict === 'WARN'
        ? `Compliance feasibility OK with ${softConflicts.length} soft caveat(s). ${classStandards.standards.filter(s => s.mandatory).length} mandatory standards in scope.`
        : `Compliance HALT — ${hardConflicts.length} hard conflict(s) require brief revision before design proceeds.`

    const result: ComplianceGateResult = {
      verdict,
      reason,
      conflicts: finalConflicts,
      applicable_standards: applicableStandards,
      revision_suggestion: revision,
      posture_summary: posture,
    }

    logger.logGate({
      step_name: 'compliance_gate',
      gate_name: 'G1b_compliance',
      verdict,
      reasons: [reason, ...finalConflicts.map(c => `${c.severity.toUpperCase()} · ${c.standard_code}: ${c.reason}`)],
      hard_count: hardConflicts.length,
      soft_count: softConflicts.length,
      class_key: classKey,
    })
    logger.logStage({
      step_name: 'compliance_gate',
      action_type: 'stage_end',
      outcome: 'ok',
      duration_ms: Date.now() - startTime,
    })
    return {
      ok: true,
      data: result,
      durationMs: Date.now() - startTime,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[compliance-gate] Failed: ${message}`)
    logger.logStage({
      step_name: 'compliance_gate',
      action_type: 'stage_end',
      outcome: 'fail',
      duration_ms: Date.now() - startTime,
      error: message,
    })
    return {
      ok: false,
      error: message,
      durationMs: Date.now() - startTime,
    }
  }
}
