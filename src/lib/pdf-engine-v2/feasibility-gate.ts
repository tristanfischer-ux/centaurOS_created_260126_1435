export interface FeasibilityResult {
  status: 'GREEN' | 'AMBER' | 'RED' | 'UNREVIEWED'
  reason: string
  blockers: string[]
  warnings: string[]
  canGenerateFullReport: boolean
  allowedSections: string[]
  forbiddenSections: string[]
  decisionPageData: {
    verdict: string
    biggestBlocker: string
    missingInputs: string[]
    commercialWarning: string
    engineeringWarning: string
    nextActions: string[]
  }
  // CX-001 (2026-05-06): compact one-line banner for the cover + running
  // header. Derived from status + the most material blocker / warning.
  // Renderer shows it as a colour-coded pill.
  compactBanner: string
}

export interface BriefValidationState {
  isValid: boolean
  missingRequired: string[]
  blockedReasons: string[]
  warnings: string[]
}

export interface SizingResultState {
  feasible: boolean | null
}

export interface CostResultState {
  unitTotalGbp: number
  ceilingGbp: number | null
}

/**
 * Determines whether a report is feasible based on the brief validation, sizing module, and cost checks.
 */
export function determineFeasibility(
  briefValidation: BriefValidationState,
  sizingResult: SizingResultState,
  costResult: CostResultState | null,
  productClass: string
): FeasibilityResult {
  const blockers: string[] = []
  const warnings: string[] = []
  
  // Brief validation
  if (!briefValidation.isValid) {
    blockers.push(...briefValidation.blockedReasons)
    blockers.push(...briefValidation.missingRequired.map((field) => `Required field missing: ${field}`))
  }
  warnings.push(...briefValidation.warnings)
  
  // Sizing feasibility
  if (sizingResult.feasible === false) {
    // HP-003 (2026-05-06): upgrade the blocker wording so the founder sees
    // what the solver actually tried, not just a generic 'INFEASIBLE'. For
    // heat-pump/thermal_system paths A12 attempts monobloc before split;
    // when both fail, the stale wording 'modules do not fit in envelope'
    // understates the problem.
    const pc = (productClass || '').toLowerCase()
    if (pc.includes('heat_pump') || pc.includes('thermal')) {
      blockers.push('Sizing returned INFEASIBLE on all heat-pump paths (monobloc + split + generic) — envelope cannot accommodate a 30 kW R290 circuit at the stated constraints')
    } else if (pc.includes('battery') || pc.includes('energy_storage')) {
      blockers.push('Sizing returned INFEASIBLE — rack/PCS/thermal modules do not fit in the stated container envelope')
    } else if (pc.includes('farm') || pc.includes('vertical')) {
      blockers.push('Sizing returned INFEASIBLE — growing rack + fertigation + climate modules exceed the stated footprint')
    } else {
      blockers.push('Sizing solver returned INFEASIBLE — modules do not fit in envelope')
    }
  }
  
  // Cost reality check
  if (costResult) {
    if (costResult.ceilingGbp && costResult.unitTotalGbp > costResult.ceilingGbp * 2) {
      warnings.push(`Cost estimate (£${costResult.unitTotalGbp}) is more than twice the ceiling (£${costResult.ceilingGbp})`)
    }
  }
  
  // Determine status
  let status: FeasibilityResult['status'] = 'GREEN'
  if (blockers.length > 0) {
    status = 'RED'
  } else if (warnings.length > 2) {
    status = 'AMBER'
  }
  
  const canGenerateFullReport = status === 'GREEN' || status === 'AMBER'
  
  // Allowed and forbidden sections
  const allSections = [
    'cover', 'decision_page', 'brief', 'classification', 'feasibility', 
    'architecture', 'regulatory', 'performance', 'sizing', 'modules', 
    'interfaces', 'bom', 'cost', 'manufacturing', 'test_plan', 'risks', 
    'suppliers', 'open_questions', 'redesign_routes', 'audit'
  ]
  
  let allowedSections: string[]
  let forbiddenSections: string[]
  
  if (status === 'RED') {
    allowedSections = ['cover', 'decision_page', 'brief', 'classification', 'feasibility', 'audit']
    forbiddenSections = allSections.filter((section) => !allowedSections.includes(section))
  } else if (status === 'AMBER') {
    allowedSections = [
      'cover', 'decision_page', 'brief', 'classification', 'feasibility', 
      'architecture', 'regulatory', 'sizing', 'modules', 'audit'
    ]
    forbiddenSections = allSections.filter((section) => !allowedSections.includes(section))
  } else {
    allowedSections = allSections
    forbiddenSections = []
  }
  
  // Decision page data
  const missingInputs = briefValidation.missingRequired
  const biggestBlocker = blockers[0] || (warnings.length > 0 ? warnings[0] : 'No issues identified')
  
  let commercialWarning = ''
  if (costResult && costResult.ceilingGbp && costResult.unitTotalGbp > costResult.ceilingGbp * 1.5) {
    commercialWarning = `Estimated cost (£${costResult.unitTotalGbp}) significantly exceeds target (£${costResult.ceilingGbp})`
  }
  
  const engineeringWarning = sizingResult.feasible === false
    ? 'Physical dimensions do not fit within envelope — design concept needs revision'
    : ''
    
  let nextActions: string[]
  if (status === 'RED') {
    nextActions = ['Complete missing brief fields', 'Lock architecture type', 'Re-run pipeline']
  } else if (status === 'AMBER') {
    nextActions = ['Address warnings before full report', 'Verify cost estimates against market data']
  } else {
    nextActions = ['Proceed with full report generation']
  }
  
  let verdict = 'PROCEED TO FULL REPORT'
  if (status === 'RED') {
    verdict = 'REBRIEF REQUIRED'
  } else if (status === 'AMBER') {
    verdict = 'PROCEED WITH CAUTION'
  }
  
  let reason = 'All checks passed'
  if (blockers.length > 0) {
    reason = blockers.join('; ')
  } else if (warnings.length > 0) {
    reason = warnings.join('; ')
  }

  // CX-001 (2026-05-06): build a concise status banner — one line, fits
  // in a narrow header / cover pill. Most material issue wins the label.
  const compactBanner = (() => {
    if (status === 'RED') {
      const first = blockers[0] || 'Brief incomplete'
      return `INFEASIBLE — ${first.length > 80 ? first.slice(0, 77) + '...' : first}`
    }
    if (status === 'AMBER') {
      const issue = warnings[0] || 'multiple warnings'
      return `FEASIBLE WITH WARNINGS — ${issue.length > 60 ? issue.slice(0, 57) + '...' : issue}`
    }
    return 'FEASIBLE — all gates pass'
  })()
  
  return {
    status,
    reason,
    blockers,
    warnings,
    canGenerateFullReport,
    allowedSections,
    forbiddenSections,
    decisionPageData: {
      verdict,
      biggestBlocker,
      missingInputs,
      commercialWarning,
      engineeringWarning,
      nextActions,
    },
    compactBanner,
  }
}
