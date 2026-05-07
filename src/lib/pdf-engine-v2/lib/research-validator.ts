// INTENT: Post-research validation — check that the research LLM returned
// the structured fields downstream stages need.  When key fields are
// missing, the pipeline can decide to re-prompt rather than silently
// producing a degraded PDF.

export interface ResearchValidationResult {
  isValid: boolean
  missingFields: string[]
  warnings: string[]
  canProceed: boolean
}

interface ResearchInput {
  designBrief?: Record<string, unknown>
  sources?: Array<{ title: string; url?: string }>
  standardCodes?: string[]
  competitors?: Array<{ name: string }>
  report?: string
}

/**
 * Validate research LLM output for required structured fields.
 *
 * Checks:
 *  - designBrief exists and contains at least `mission` or `useCase`
 *  - sources array has >= 3 entries (warning only — not blocking)
 *  - report length >= 200 characters (warning only)
 *
 * `canProceed` is false only when designBrief is completely absent.
 * Sparse designBrief (present but missing mission/useCase) is logged
 * in `missingFields` but does not block the pipeline.
 */
export function validateResearchOutput(research: ResearchInput): ResearchValidationResult {
  const missingFields: string[] = []
  const warnings: string[] = []

  // ── designBrief: the critical structured field ──
  if (!research.designBrief || typeof research.designBrief !== 'object') {
    missingFields.push('designBrief')
  } else {
    const hasMission = typeof research.designBrief.mission === 'string' && (research.designBrief.mission as string).length > 0
    const hasUseCase = typeof research.designBrief.useCase === 'string' && (research.designBrief.useCase as string).length > 0

    if (!hasMission && !hasUseCase) {
      missingFields.push('designBrief.mission or designBrief.useCase')
    }
  }

  // ── sources: advisory warning when sparse ──
  const sourceCount = Array.isArray(research.sources) ? research.sources.length : 0
  if (sourceCount < 3) {
    warnings.push(`Only ${sourceCount} source(s) provided — 3 or more recommended for report credibility.`)
  }

  // ── report: advisory warning when short ──
  const reportLength = typeof research.report === 'string' ? research.report.length : 0
  if (reportLength < 200) {
    warnings.push(`Report is ${reportLength} characters — 200 or more recommended for downstream stages.`)
  }

  const isValid = missingFields.length === 0 && warnings.length === 0

  // canProceed blocks only when designBrief is completely absent.
  // Sparse designBrief (missing mission/useCase) is logged but not blocking.
  const designBriefAbsent = missingFields.some(f => f === 'designBrief')
  const canProceed = !designBriefAbsent

  return { isValid, missingFields, warnings, canProceed }
}
