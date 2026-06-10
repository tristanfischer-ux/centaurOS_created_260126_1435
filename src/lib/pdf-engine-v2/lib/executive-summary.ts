/**
 * src/lib/pdf-engine-v2/lib/executive-summary.ts
 *
 * Deterministic EXECUTIVE SUMMARY generator (2026-05-30). The council scores the
 * executive_summary section against the rubric "a 3-paragraph narrative (product
 * description / design outcome / next steps), not just a table" — and the BESS
 * dossier scored 5.50 (the binding axis) because it had NO such section: the
 * cover carried only class-agnostic boilerplate and briefOverviewProse.
 * overview_and_context was empty.
 *
 * This synthesises three design-specific paragraphs from data the chain already
 * computed (brief framing, the design's achieved headline, the compliance pass/
 * fail tally + named breaches, the cost stack, and the auto-improve levers). It
 * is HONEST: paragraph 2 states the breaches plainly rather than hiding them.
 * Universal across product classes; pure + deterministic.
 */

export interface ExecSummaryInput {
  /** Brief product title, e.g. "Utility-Scale Battery Energy Storage System". */
  productName: string
  /** Mission line (briefOverviewProse.mission_statement). */
  mission: string
  targetCustomers: string
  whyNow: string
  /** The design's headline achieved metric, e.g. { label: 'Usable energy', value: 2.69, unit: 'MWh' }. */
  headline: { label: string; value: number | string; unit: string } | null
  compliancePass: number
  complianceFail: number
  complianceTotal: number
  /** Short human breach descriptions, e.g. "unit cost 670% over the £180k ceiling". */
  failSummaries: string[]
  /** Ex-works cost + its per-output-unit rendering, e.g. 1_385_966 + "£516/kWh". */
  exWorksCostGbp: number | null
  costPerUnit: string | null
  /** Levelised capital cost per output unit, pre-formatted with its unit label,
   *  e.g. "£4,269/(t·yr CO2)" — distinct from costPerUnit (which is the raw
   *  ex-works/output ratio). Sourced from the independent cost-sanity gate so the
   *  exec summary headline cost AND the levelised cost both appear (item 8). null
   *  when no levelised figure was computed (omitted gracefully). */
  levelisedCost?: string | null
  /** The single highest-severity OPEN engineering defect the design still carries
   *  (e.g. "a reactor-envelope violation flagged high severity"), so the summary
   *  is honest about feasibility rather than implying a clean pass. null when the
   *  design has no open high-severity defect (item 8). */
  openDefect?: string | null
  /** Auto-improve lever actions (the "to close the gaps" recommendations). */
  improvementActions: string[]
}

export interface ExecSummary {
  product: string
  outcome: string
  next_steps: string
}

function fmtGbpCompact(n: number): string {
  if (n >= 1e6) return `£${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `£${Math.round(n / 1e3)}k`
  return `£${Math.round(n)}`
}

function firstSentence(s: string): string {
  const t = String(s ?? '').trim()
  if (!t) return ''
  const m = t.match(/^[^.!?]*[.!?]/)
  return (m ? m[0] : t).trim()
}

// Lower-case the first WORD when it is an ordinary capitalised word, so a
// fragment can be spliced mid-sentence after a connective ("…system: " /
// "driven by ") without an upper-case mid-sentence. Leaves an all-caps token or
// embedded-digit token untouched (acronyms / proper nouns / chemistry —
// "CO2"/"UK"/"MEA"/"Skid-mounted" → only "Skid" lowers to "skid"; "CO2" stays).
function decapitaliseLeadWord(s: string): string {
  const t = String(s ?? '')
  const m = t.match(/^(\s*)(\S+)([\s\S]*)$/)
  if (!m) return t
  const [, lead, word, rest] = m
  // All-caps (ASCII letters only, ≥2 chars) or contains a digit → acronym/code.
  if (/\d/.test(word) || /^[A-Z]{2,}$/.test(word.replace(/[^A-Za-z]/g, ''))) return t
  // Only lower a leading single capital followed by lower-case (a Title-cased
  // ordinary word like "Skid-mounted" → "skid-mounted"). "A"/"I" left alone.
  if (/^[A-Z][a-z]/.test(word)) return `${lead}${word.charAt(0).toLowerCase()}${word.slice(1)}${rest}`
  return t
}

/** Build the 3-paragraph executive summary. Pure + deterministic. */
export function buildExecutiveSummary(input: ExecSummaryInput): ExecSummary {
  // ── Paragraph 1 — product description (what it is, who for, why now) ───────
  const name = String(input.productName ?? '').trim() || 'this product'
  const mission = String(input.mission ?? '').trim()
  const customers = String(input.targetCustomers ?? '').trim()
  const whyNow = firstSentence(input.whyNow)
  // Keep original case in the spliced fragments — lowercasing the first letter
  // mangles leading acronyms/proper nouns ("UK" → "uK").
  let product = `This concept-stage dossier develops ${name}`
  // The mission line is frequently a NOUN phrase ("Skid-mounted CO2 capture +
  // mineral-carbonation plant…"), not a verb phrase — the old ", to {mission}"
  // junction produced the ungrammatical "develops a system, to Skid-mounted…".
  // A colon reads cleanly for BOTH a noun phrase ("…system: a skid-mounted
  // plant…") and a verb phrase ("…system: to capture…"); lower-case only the
  // FIRST alpha char when it is a non-acronym capitalised word (so "Skid" →
  // "skid" but a leading "CO2"/"UK"/"MEA" is preserved).
  product += mission ? `: ${decapitaliseLeadWord(mission.replace(/\.$/, ''))}.` : '.'
  if (customers) product += ` It is aimed at ${customers.replace(/\.$/, '')}.`
  // why_now is almost always a NOUN phrase ("Increasing regulatory pressure …
  // and the need for …") with no verb, so appending it as a bare sentence left
  // a dangling fragment. Introduce it with a lead-in clause so it reads as
  // prose; a verb-phrase why_now still reads correctly after "is driven by".
  if (whyNow) product += ` The timing is driven by ${decapitaliseLeadWord(whyNow.replace(/\.$/, ''))}.`

  // ── Paragraph 2 — design outcome (achieved vs brief, honest breaches, cost) ─
  // The headline value + unit are self-describing (e.g. "981 MWh / year"); the
  // label is redundant and lower-casing it mangles the embedded acronym.
  const headlineClause =
    input.headline && input.headline.value !== '' && input.headline.value != null
      ? `${input.headline.value} ${input.headline.unit}`
      : ''
  let outcome = ''
  if (input.complianceTotal > 0) {
    outcome += `The design honours ${input.compliancePass} of ${input.complianceTotal} brief constraints`
    if (input.complianceFail > 0) {
      outcome += ` and breaches ${input.complianceFail}`
    } else {
      // pass + fail need not sum to total: the remaining rows are recorded but
      // not assessed (engine-inferred / not-applicable). Naming them answers the
      // "what about the other N?" the reader would otherwise ask — and avoids a
      // bare "no breaches" that reads as an over-claim against an N-of-M tally.
      const unassessed = input.complianceTotal - input.compliancePass - input.complianceFail
      outcome += unassessed > 0
        ? ` with no breaches (the remaining ${unassessed} are recorded in the Brief Compliance table but not assessed at this stage)`
        : ' with no breaches'
    }
    // Fold the headline INTO the compliance sentence so the outcome opens with
    // one flowing statement instead of three staccato sentences.
    outcome += headlineClause ? `, delivering ${headlineClause}.` : '.'
  } else if (headlineClause) {
    outcome += `The design delivers ${headlineClause}.`
  }
  if (input.failSummaries.length > 0) {
    outcome += ` The breaches the reader must accept or design out: ${input.failSummaries.slice(0, 3).join('; ')}.`
  }
  if (typeof input.exWorksCostGbp === 'number' && input.exWorksCostGbp > 0) {
    outcome += ` The fully-costed design reaches ${fmtGbpCompact(input.exWorksCostGbp)} ex-works`
    outcome += input.costPerUnit ? ` (${input.costPerUnit})` : ''
    // Levelised cost (item 8): surface it alongside the headline ex-works cost so
    // the buyer sees both the capital figure AND the cost per unit of output. The
    // figure is already formatted with its unit label by the caller.
    const lev = String(input.levelisedCost ?? '').trim()
    outcome += lev ? `, and a levelised capital cost of ${lev}.` : '.'
  } else if (String(input.levelisedCost ?? '').trim()) {
    outcome += ` The design's levelised capital cost is ${String(input.levelisedCost).trim()}.`
  }
  // Open engineering defect (item 8): be honest about an unresolved high-severity
  // issue rather than implying a clean pass. Surfaced after the cost so the
  // feasibility picture is complete (the verdict the next paragraph builds on).
  // Strip any trailing sentence terminator on the defect text so the template's
  // own full stop is not doubled ("…for shipping.." → "…for shipping."). The
  // 240-char slice that used to truncate this also hid the doubled period; with
  // the full sentence now rendered (2026-06-10), the source's own "." would show
  // alongside the template's, so normalise it here.
  const defect = String(input.openDefect ?? '').trim().replace(/[.!?]+$/, '')
  if (defect) {
    outcome += ` One engineering issue remains open and must be resolved before detailed design: ${defect}.`
  }
  outcome = outcome.trim() || 'The design closes against the brief; see the Brief Compliance section for the per-constraint pass/fail.'

  // ── Paragraph 3 — recommendation + next steps ──────────────────────────────
  // Only reference "the breached subsystems" when breaches actually exist —
  // otherwise paragraph 2 ("with no breaches") and paragraph 3 contradicted
  // each other. With no breaches the detailed-design step targets the
  // highest-cost / longest-lead subsystems instead.
  const hasBreaches = input.complianceFail > 0
  let next = ''
  if (hasBreaches && input.improvementActions.length > 0) {
    next += `To meet the breached constraints the engine recommends: ${input.improvementActions.slice(0, 2).join('; ')}. `
  }
  const detailedDesignTarget = hasBreaches
    ? 'detailed design of the breached subsystems'
    : 'detailed design of the highest-cost and longest-lead subsystems'
  next +=
    'This is a study-grade concept design for early decision-making, not a for-construction release. ' +
    `Recommended next steps before procurement: ${detailedDesignTarget}, ` +
    'request-for-quote against the named suppliers to firm the bill-of-materials pricing, ' +
    'and a prototype build to validate the physics and thermal assumptions.'

  return { product, outcome, next_steps: next }
}
