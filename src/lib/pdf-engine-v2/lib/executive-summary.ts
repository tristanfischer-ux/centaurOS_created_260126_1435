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
  product += mission ? `, to ${mission.replace(/\.$/, '')}.` : '.'
  if (customers) product += ` It is aimed at ${customers.replace(/\.$/, '')}.`
  if (whyNow) product += ` ${whyNow.replace(/\.$/, '')}.`

  // ── Paragraph 2 — design outcome (achieved vs brief, honest breaches, cost) ─
  let outcome = ''
  if (input.complianceTotal > 0) {
    outcome += `The design honours ${input.compliancePass} of ${input.complianceTotal} brief constraints`
    outcome += input.complianceFail > 0 ? ` and breaches ${input.complianceFail}.` : ' with no breaches.'
  }
  if (input.headline && input.headline.value !== '' && input.headline.value != null) {
    // value + unit are self-describing (e.g. "981 MWh / year"); the label is
    // redundant and lowercasing it mangles the embedded acronym ("MWh" → "mwh").
    outcome += ` It delivers ${input.headline.value} ${input.headline.unit}.`
  }
  if (input.failSummaries.length > 0) {
    outcome += ` The breaches the reader must accept or design out: ${input.failSummaries.slice(0, 3).join('; ')}.`
  }
  if (typeof input.exWorksCostGbp === 'number' && input.exWorksCostGbp > 0) {
    outcome += ` The bill of materials rolls up to ${fmtGbpCompact(input.exWorksCostGbp)} ex-works`
    outcome += input.costPerUnit ? ` (${input.costPerUnit}).` : '.'
  }
  outcome = outcome.trim() || 'The design closes against the brief; see the Brief Compliance section for the per-constraint pass/fail.'

  // ── Paragraph 3 — recommendation + next steps ──────────────────────────────
  let next = ''
  if (input.improvementActions.length > 0) {
    next += `To meet the breached constraints the engine recommends: ${input.improvementActions.slice(0, 2).join('; ')}. `
  }
  next +=
    'This is a study-grade concept design for early decision-making, not a for-construction release. ' +
    'Recommended next steps before procurement: detailed design of the breached subsystems, request-for-quote against the named suppliers to firm the bill-of-materials pricing, and a prototype build to validate the physics and thermal assumptions.'

  return { product, outcome, next_steps: next }
}
