export interface ResearchThresholdResult {
  passed: boolean
  issues: string[]
  sourceCount: number
  competitorCount: number
  standardCount: number
}

export function checkResearchThresholds(research: {
  sources?: Array<{ title: string }>
  competitors?: Array<{ name: string }>
  standardCodes?: string[]
  report?: string
}): ResearchThresholdResult {
  const issues: string[] = []
  
  const sourceCount = research.sources?.length || 0
  const competitorCount = research.competitors?.length || 0
  const standardCount = research.standardCodes?.length || 0
  const reportLength = research.report?.length || 0

  if (sourceCount < 5) {
    issues.push(`Research has ${sourceCount} sources, expected ≥5`)
  }

  if (competitorCount < 3) {
    issues.push(`Research has ${competitorCount} competitors, expected ≥3`)
  }

  if (standardCount < 1) {
    issues.push('No regulatory standards identified')
  }

  if (reportLength < 500) {
    issues.push(`Research report suspiciously short (${reportLength} chars)`)
  }

  return {
    passed: issues.length === 0,
    issues,
    sourceCount,
    competitorCount,
    standardCount
  }
}
