export type SourceGrade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export interface GradedClaim {
  claim: string
  grade: SourceGrade
  source: string
  gradeValue: number
}

export const GRADE_VALUES: Record<SourceGrade, number> = {
  A: 100,
  B: 85,
  C: 70,
  D: 55,
  E: 30,
  F: 0,
}

export function gradeClaim(claim: string, source: string, sourceType: string): GradedClaim {
  let grade: SourceGrade = 'F'
  
  if (sourceType === 'supplier_quote' || sourceType === 'test_report' || sourceType === 'standard') grade = 'A'
  else if (sourceType === 'datasheet' || sourceType === 'manufacturer') grade = 'B'
  else if (sourceType === 'handbook' || sourceType === 'database') grade = 'C'
  else if (sourceType === 'market_report' || sourceType === 'web_source') grade = 'D'
  else if (sourceType === 'llm_estimate') grade = 'E'
  else grade = 'F'
  
  return { claim, grade, source, gradeValue: GRADE_VALUES[grade] }
}

export function averageSourceGrade(claims: GradedClaim[]): { average: number; worst: SourceGrade; percentageLowConfidence: number } {
  if (claims.length === 0) return { average: 0, worst: 'F', percentageLowConfidence: 100 }
  const avg = claims.reduce((s, c) => s + c.gradeValue, 0) / claims.length
  const worst = claims.reduce((w, c) => c.gradeValue < GRADE_VALUES[w] ? c.grade : w, 'A' as SourceGrade)
  const lowConf = claims.filter(c => c.gradeValue <= 30).length / claims.length * 100
  return { average: Math.round(avg), worst, percentageLowConfidence: Math.round(lowConf) }
}

export function applySourceCaps(score: number, claims: GradedClaim[]): { score: number; capsApplied: string[] } {
  const caps: string[] = []
  let cappedScore = score
  
  const lowConfCount = claims.filter(c => c.gradeValue <= 30).length
  const lowConfPct = claims.length > 0 ? lowConfCount / claims.length : 0
  
  if (lowConfPct > 0.5) {
    cappedScore = Math.min(cappedScore, 45)
    caps.push(`${Math.round(lowConfPct * 100)}% of claims are LLM-estimated or placeholder — capped at 45`)
  }
  
  const safetyClaims = claims.filter(c => c.claim.toLowerCase().includes('safety') || c.claim.toLowerCase().includes('regulatory') || c.claim.toLowerCase().includes('compliance'))
  const unsafeSafety = safetyClaims.filter(c => c.gradeValue <= 30)
  if (unsafeSafety.length > 0 && safetyClaims.length > 0) {
    cappedScore = Math.min(cappedScore, 50)
    caps.push(`Safety/regulatory claims without source evidence — capped at 50`)
  }
  
  return { score: Math.round(cappedScore), capsApplied: caps }
}
