import { runReportCompiler } from './pipeline/run-report-compiler'
import { validateDossier } from './sections/contracts'
import { scoreFromIssues } from './scoring/score-from-issues'
import type { BatchSectionScore, ProductDossier, SectionIssue } from './schema/types'

const brief = [
  'Design a containerised 3.5 MWh / 1 MW LFP BESS for UK grid support.',
  'It must include usable-energy, grid-connection, thermal safety, fire protection, BoM and early CAPEX.',
].join(' ')

const scoringRule = [
  'Scoring rule used by this prototype:',
  '- Start each scored section at 9.0.',
  '- Subtract 3.0 for each blocker issue.',
  '- Subtract 1.5 for each major issue.',
  '- Subtract 0.5 for each minor issue.',
  '- This is not an external reviewer score; it is only a deterministic gate score.',
]

main().catch(error => {
  console.error(error)
  throw error
})

async function main(): Promise<void> {
  const candidate = await runReportCompiler({ id: 'audit-candidate-bess', briefText: brief })
  const broken = breakDossier(candidate.dossier)
  const brokenIssues = validateDossier(broken)
  const brokenScore = scoreFromIssues(brokenIssues)

  console.log(scoringRule.join('\n'))
  console.log('\nUNSOURCED CANDIDATE DOSSIER')
  printAudit(candidate.issues, candidate.score)
  console.log('\nBROKEN NEGATIVE CONTROL')
  printAudit(brokenIssues, brokenScore)
  console.log('\nInterpretation:')
  console.log('- The candidate score is expected to be held down by unsourced critical BoM lines.')
  console.log('- The broken score proves the checks react further to missing headline metrics, BoM gaps and missing provenance.')
  console.log('- It does not yet prove real-world engineering quality, source freshness, PDF beauty or commercial accuracy.')
}

function breakDossier(dossier: ProductDossier): ProductDossier {
  const copy = JSON.parse(JSON.stringify(dossier)) as ProductDossier
  copy.keyMetrics = copy.keyMetrics.filter(metric => metric.id !== 'headline_output')
  copy.bom.lines = copy.bom.lines.filter(line => line.id !== 'pcs_inverter')
  if (copy.bom.lines[0]) {
    copy.bom.lines[0].unitCostGbp = null
    copy.bom.lines[0].totalCostGbp = null
  }
  copy.sources.refs = []
  return copy
}

function printAudit(issues: SectionIssue[], score?: BatchSectionScore): void {
  console.log(`Issues: ${issues.length}`)
  if (issues.length === 0) {
    console.log('- none')
  } else {
    for (const issue of issues) {
      console.log(`- ${issue.section}: ${issue.severity}/${issue.code} - ${issue.message}`)
    }
  }
  console.log(`Score: ${JSON.stringify(score, null, 2)}`)
}
