import type { BatchSectionScore, PdfSectionId, SectionIssue } from '../schema/types'

export const SCORED_SECTIONS: PdfSectionId[] = [
  'executive_summary',
  'brief_requirements',
  'design_modules',
  'bom',
  'feasibility_notes',
  'sources_references',
]

export interface SectionScoreLedgerIssue {
  severity: SectionIssue['severity']
  code: string
  deduction: number
  message: string
}

export interface SectionScoreLedgerRow {
  section: PdfSectionId
  baseScore: number
  blockerCount: number
  majorCount: number
  minorCount: number
  totalDeduction: number
  rawScore: number
  finalScore: number
  floorApplied: boolean
  targetScore: number
  passesTarget: boolean
  scoreKind: 'deterministic_gate'
  issueDeductions: SectionScoreLedgerIssue[]
  rationale: string
  limitation: string
}

export interface SectionScoreLedger {
  rule: {
    baseScore: number
    blockerDeduction: number
    majorDeduction: number
    minorDeduction: number
    floorScore: number
    targetScore: number
    scoreKind: 'deterministic_gate'
    limitation: string
  }
  summary: {
    sections: number
    sectionsAtOrAboveTarget: number
    sectionsBelowTarget: number
    meanScore: number
    totalIssues: number
    totalDeduction: number
  }
  rows: SectionScoreLedgerRow[]
}

const BASE_SCORE = 9
const BLOCKER_DEDUCTION = 3
const MAJOR_DEDUCTION = 1.5
const MINOR_DEDUCTION = 0.5
const FLOOR_SCORE = 1
const DEFAULT_TARGET = 8
const SCORE_KIND = 'deterministic_gate'
const SCORE_LIMITATION = 'This is a deterministic gate score from current validators, not an external reviewer score or proof of real-world engineering quality. Reviewer acceptance is tracked separately in the verification ledger.'

export function scoreFromIssues(issues: SectionIssue[]): BatchSectionScore {
  const sectionScores: Partial<Record<PdfSectionId, number>> = {}
  for (const section of SCORED_SECTIONS) {
    const sectionIssues = issues.filter(issue => issue.section === section)
    sectionScores[section] = scoreSection(sectionIssues).finalScore
  }
  const mean = SCORED_SECTIONS.reduce((sum, section) => sum + (sectionScores[section] ?? 0), 0) / SCORED_SECTIONS.length
  return { sectionScores, mean: Math.round(mean * 100) / 100 }
}

export function buildSectionScoreLedger(
  issues: SectionIssue[],
  targetScore = DEFAULT_TARGET,
): SectionScoreLedger {
  const rows = SCORED_SECTIONS.map(section => {
    const sectionIssues = issues.filter(issue => issue.section === section)
    const score = scoreSection(sectionIssues)
    return {
      section,
      baseScore: BASE_SCORE,
      blockerCount: sectionIssues.filter(issue => issue.severity === 'blocker').length,
      majorCount: sectionIssues.filter(issue => issue.severity === 'major').length,
      minorCount: sectionIssues.filter(issue => issue.severity === 'minor').length,
      totalDeduction: score.totalDeduction,
      rawScore: score.rawScore,
      finalScore: score.finalScore,
      floorApplied: score.floorApplied,
      targetScore,
      passesTarget: score.finalScore >= targetScore,
      scoreKind: SCORE_KIND,
      issueDeductions: sectionIssues.map(issue => ({
        severity: issue.severity,
        code: issue.code,
        deduction: deductionForSeverity(issue.severity),
        message: issue.message,
      })),
      rationale: sectionIssues.length === 0
        ? 'No current deterministic validator issue is attached to this scored section.'
        : 'Score is base minus deterministic deductions for attached section issues.',
      limitation: SCORE_LIMITATION,
    } satisfies SectionScoreLedgerRow
  })
  const meanScore = Math.round((rows.reduce((sum, row) => sum + row.finalScore, 0) / rows.length) * 100) / 100
  return {
    rule: {
      baseScore: BASE_SCORE,
      blockerDeduction: BLOCKER_DEDUCTION,
      majorDeduction: MAJOR_DEDUCTION,
      minorDeduction: MINOR_DEDUCTION,
      floorScore: FLOOR_SCORE,
      targetScore,
      scoreKind: SCORE_KIND,
      limitation: SCORE_LIMITATION,
    },
    summary: {
      sections: rows.length,
      sectionsAtOrAboveTarget: rows.filter(row => row.passesTarget).length,
      sectionsBelowTarget: rows.filter(row => !row.passesTarget).length,
      meanScore,
      totalIssues: issues.filter(issue => SCORED_SECTIONS.includes(issue.section)).length,
      totalDeduction: Math.round(rows.reduce((sum, row) => sum + row.totalDeduction, 0) * 10) / 10,
    },
    rows,
  }
}

export function renderSectionScoreLedgerCsv(ledger: SectionScoreLedger): string {
  const header = [
    'section',
    'baseScore',
    'blockerCount',
    'majorCount',
    'minorCount',
    'totalDeduction',
    'rawScore',
    'finalScore',
    'floorApplied',
    'targetScore',
    'passesTarget',
    'scoreKind',
    'issueDeductions',
    'rationale',
    'limitation',
  ]
  const rows = ledger.rows.map(row => [
    row.section,
    String(row.baseScore),
    String(row.blockerCount),
    String(row.majorCount),
    String(row.minorCount),
    String(row.totalDeduction),
    String(row.rawScore),
    String(row.finalScore),
    String(row.floorApplied),
    String(row.targetScore),
    String(row.passesTarget),
    row.scoreKind,
    row.issueDeductions.map(issue => `${issue.severity}/${issue.code}:-${issue.deduction}`).join('; '),
    row.rationale,
    row.limitation,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function scoreSection(sectionIssues: SectionIssue[]): Pick<SectionScoreLedgerRow, 'totalDeduction' | 'rawScore' | 'finalScore' | 'floorApplied'> {
  const totalDeduction = sectionIssues.reduce((sum, issue) => sum + deductionForSeverity(issue.severity), 0)
  const rawScore = Math.round((BASE_SCORE - totalDeduction) * 10) / 10
  const finalScore = Math.max(FLOOR_SCORE, rawScore)
  return {
    totalDeduction: Math.round(totalDeduction * 10) / 10,
    rawScore,
    finalScore,
    floorApplied: finalScore !== rawScore,
  }
}

function deductionForSeverity(severity: SectionIssue['severity']): number {
  if (severity === 'blocker') return BLOCKER_DEDUCTION
  if (severity === 'major') return MAJOR_DEDUCTION
  return MINOR_DEDUCTION
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
