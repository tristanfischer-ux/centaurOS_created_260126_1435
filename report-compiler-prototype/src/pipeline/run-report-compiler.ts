import type { ReportInput, ReportRunResult } from '../schema/types'
import { validateDossier } from '../sections/contracts'
import { renderReportOutline } from '../render/report-outline'
import { scoreFromIssues } from '../scoring/score-from-issues'
import { classifyBrief } from './classify'
import { parseBrief } from './parse-brief'
import { buildInitialDossier } from './build-dossier'
import { architectureBomGateIssues, evaluateArchitectureReadiness } from '../gates/architecture-ready'
import { buildStageTrace } from './stage-trace'

export async function runReportCompiler(input: ReportInput): Promise<ReportRunResult> {
  const classification = classifyBrief(input.briefText, input.productClass)
  const parsed = parseBrief(input.briefText)
  const dossier = buildInitialDossier(input, classification.productClass, parsed)
  const architectureReadiness = evaluateArchitectureReadiness(dossier)
  const stageTrace = buildStageTrace(input, classification, parsed, dossier, architectureReadiness)
  const issues = [
    ...validateDossier(dossier),
    ...architectureBomGateIssues(architectureReadiness),
  ]
  const outline = renderReportOutline(dossier, issues, architectureReadiness, stageTrace)
  const score = scoreFromIssues(issues)
  return {
    ok: issues.every(issue => issue.severity !== 'blocker'),
    dossier,
    architectureReadiness,
    stageTrace,
    issues,
    outline,
    score,
  }
}
