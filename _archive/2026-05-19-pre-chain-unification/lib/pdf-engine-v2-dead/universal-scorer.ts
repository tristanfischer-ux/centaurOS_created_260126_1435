export interface SectionAudit {
  sectionId: string
  sectionTitle: string
  score: number
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'BLOCKED'
  status: 'PASS' | 'WARN' | 'FAIL' | 'BLOCKED' | 'SHOULD_NOT_HAVE_RENDERED'
  subscores: {
    completeness: number
    consistency: number
    calculation: number
    sourceQuality: number
    actionability: number
    safetyOrRegulatory: number
    renderQuality: number
  }
  hardBlockers: string[]
  failedChecks: Array<{ checkId: string; severity: string; message: string; suggestedFix: string }>
  capsApplied: Array<{ cap: number; reason: string }>
  nextCodeActions: string[]
}

export function checkCompleteness(data: Record<string, any>, requiredFields: string[]): { score: number; failures: string[] } {
  const failures: string[] = []
  let present = 0
  
  for (const field of requiredFields) {
    const value = data[field]
    if (value !== null && value !== undefined && value !== '' && value !== '-' && value !== 'None' && value !== 'TBD' && value !== 0) {
      present++
    } else {
      failures.push(`COMP_001: Required field '${field}' is missing or has placeholder value`)
    }
  }
  
  return { score: Math.round((present / requiredFields.length) * 100), failures }
}

export function checkConsistency(state: any): { score: number; failures: string[] } {
  const failures: string[] = []
  let checks = 0
  let passed = 0
  
  checks++
  if (state.research?.designBrief?.constraints?.unitCostCeilingGbp && state.costBreakdown?.unitTotalGbp) {
    const ceiling = state.research.designBrief.constraints.unitCostCeilingGbp
    const unitCost = state.costBreakdown.unitTotalGbp
    if (unitCost > 0 && ceiling > 0) {
      const ratio = unitCost / ceiling
      if (ratio > 3 || ratio < 0.1) {
        failures.push('CONS_001: Cost estimate deviates significantly from brief ceiling')
      } else {
        passed++
      }
    }
  }
  
  checks++
  if (state.costBreakdown?.perModule && state.parts?.length > 0) {
    const bomTotal = state.parts.reduce((s: number, p: any) => s + (p.estimatedUnitCostGbp || 0), 0)
    const moduleTotal = state.costBreakdown.perModule.reduce((s: number, m: any) => s + (m.totalGbp || 0), 0)
    if (bomTotal > 0 && moduleTotal > 0) {
      const diff = Math.abs(bomTotal - moduleTotal) / Math.max(bomTotal, moduleTotal)
      if (diff > 0.15) {
        failures.push(`CONS_002: BOM total (${bomTotal.toFixed(0)}) differs from module total (${moduleTotal.toFixed(0)}) by ${Math.round(diff * 100)}%`)
      } else {
        passed++
      }
    }
  }
  
  checks++
  if (state.dimensionSheet?.feasible === false) {
    if (state.parts?.length > 0 || state.costBreakdown?.unitTotalGbp > 0) {
      failures.push('CONS_003: Sizing is infeasible but BOM/cost were still generated')
    } else {
      passed++
    }
  } else {
    passed++
  }
  
  return { score: checks > 0 ? Math.round((passed / checks) * 100) : 100, failures }
}

export function scoreSection(sectionId: string, sectionTitle: string, data: any, requiredFields: string[]): SectionAudit {
  const completeness = checkCompleteness(data, requiredFields)
  const consistency = checkConsistency(data)
  
  const score = Math.round(
    completeness.score * 0.20 +
    consistency.score * 0.20 +
    50 * 0.20 +
    50 * 0.15 +
    50 * 0.10 +
    50 * 0.10 +
    50 * 0.05
  )
  
  const hardBlockers = completeness.failures.filter(f => f.includes('missing'))
  const capsApplied: Array<{ cap: number; reason: string }> = []
  let finalScore = score
  
  if (hardBlockers.length > 0) {
    finalScore = Math.min(finalScore, 40)
    capsApplied.push({ cap: 40, reason: `${hardBlockers.length} hard blockers present` })
  }
  
  const confidence: SectionAudit['confidence'] = 
    hardBlockers.length > 0 ? 'BLOCKED' :
    completeness.failures.length > 3 ? 'LOW' :
    completeness.failures.length > 0 ? 'MEDIUM' : 'HIGH'
  
  const status: SectionAudit['status'] = 
    confidence === 'BLOCKED' ? 'BLOCKED' :
    finalScore >= 70 ? 'PASS' :
    finalScore >= 50 ? 'WARN' : 'FAIL'
  
  return {
    sectionId,
    sectionTitle,
    score: finalScore,
    confidence,
    status,
    subscores: {
      completeness: completeness.score,
      consistency: consistency.score,
      calculation: 50,
      sourceQuality: 50,
      actionability: 50,
      safetyOrRegulatory: 50,
      renderQuality: 50,
    },
    hardBlockers,
    failedChecks: [...completeness.failures, ...consistency.failures].map(f => ({
      checkId: f.split(':')[0],
      severity: f.includes('missing') ? 'critical' : 'warning',
      message: f,
      suggestedFix: '',
    })),
    capsApplied,
    nextCodeActions: [],
  }
}
