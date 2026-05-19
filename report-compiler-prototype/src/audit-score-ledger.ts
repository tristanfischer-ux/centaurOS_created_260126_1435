import { runReportCompiler } from './pipeline/run-report-compiler'
import { buildSectionScoreLedger, renderSectionScoreLedgerCsv } from './scoring/score-from-issues'
import { validateDossier } from './sections/contracts'
import type { ProductDossier } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const candidate = await runReportCompiler({ id: 'audit-score-ledger', briefText: brief })
  const ledger = buildSectionScoreLedger(candidate.issues)
  const bom = ledger.rows.find(row => row.section === 'bom')
  const executive = ledger.rows.find(row => row.section === 'executive_summary')
  const broken = breakDossier(candidate.dossier)
  const brokenLedger = buildSectionScoreLedger(validateDossier(broken))
  const brokenExecutive = brokenLedger.rows.find(row => row.section === 'executive_summary')
  const csv = renderSectionScoreLedgerCsv(ledger)

  assert(ledger.summary.sections === 6, 'Score ledger should cover the six scored report sections.')
  assert(ledger.summary.meanScore === candidate.score?.mean, 'Score ledger mean should match compiler score.')
  assert(executive?.finalScore === 9, 'Clean executive summary should remain at base score.')
  assert(executive?.rationale.includes('No current deterministic validator issue'), 'Clean section should explain score basis.')
  assert(bom?.finalScore === 1, 'Unsourced BoM should be floored at score 1.')
  assert(bom?.floorApplied === true, 'Unsourced BoM should record that the score floor was applied.')
  assert((bom?.issueDeductions.length ?? 0) > 0, 'BoM ledger should include issue deductions.')
  assert(brokenExecutive?.finalScore === 6, 'Broken executive summary should lose 3 points for a blocker.')
  assert(ledger.rule.limitation.includes('not an external reviewer score'), 'Score ledger should state the score limitation.')
  assert(ledger.rule.limitation.includes('verification ledger'), 'Score ledger should point readers to the separate verification evidence ledger.')
  assert(csv.trim().split('\n').length === ledger.summary.sections + 1, 'Score ledger CSV should contain one header plus one row per scored section.')

  console.log('Section score ledger audit passed')
  console.log({
    rule: ledger.rule,
    summary: ledger.summary,
    executive: {
      score: executive?.finalScore,
      rationale: executive?.rationale,
    },
    bom: {
      score: bom?.finalScore,
      totalDeduction: bom?.totalDeduction,
      floorApplied: bom?.floorApplied,
      issueDeductions: bom?.issueDeductions.map(issue => `${issue.severity}/${issue.code}:-${issue.deduction}`),
    },
    brokenExecutive: {
      score: brokenExecutive?.finalScore,
      issueDeductions: brokenExecutive?.issueDeductions.map(issue => `${issue.severity}/${issue.code}:-${issue.deduction}`),
    },
    csvRows: csv.trim().split('\n').length,
  })
}

function breakDossier(dossier: ProductDossier): ProductDossier {
  const copy = JSON.parse(JSON.stringify(dossier)) as ProductDossier
  copy.keyMetrics = copy.keyMetrics.filter(metric => metric.id !== 'headline_output')
  return copy
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
