import { runReportCompiler } from './pipeline/run-report-compiler'
import { buildBriefClarificationPlan, renderBriefClarificationPlanCsv } from './scoring/brief-clarification-plan'

const bessBrief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const rich = await runReportCompiler({ id: 'audit-brief-clarification-rich', briefText: bessBrief })
  const richPlan = buildBriefClarificationPlan(rich.dossier, rich.stageTrace)
  const richCsv = renderBriefClarificationPlanCsv(richPlan)

  assert(richPlan.verdict === 'no_clarification_needed', 'Rich BESS brief should not need clarification.')
  assert(richPlan.summary.rows === 0, 'Rich BESS brief should produce zero clarification questions.')
  assert(richCsv.trim().split('\n').length === 1, 'Empty clarification plan CSV should contain just a header.')

  const sparseDrone = await runReportCompiler({ id: 'audit-brief-clarification-sparse-drone', briefText: 'Design a drone.' })
  const sparsePlan = buildBriefClarificationPlan(sparseDrone.dossier, sparseDrone.stageTrace)

  assert(sparsePlan.verdict === 'clarification_recommended', 'Sparse but classifiable brief should recommend clarification.')
  assert(sparsePlan.summary.requiredRows === 0, 'Sparse classifiable brief should not require blocking clarification.')
  assert(sparsePlan.summary.recommendedRows > 0, 'Sparse classifiable brief should emit recommended questions.')
  assert(sparsePlan.questions.some(row => row.kind === 'target_metrics'), 'Sparse brief should ask for target metrics.')
  assert(sparsePlan.questions.some(row => row.kind === 'interfaces_and_integration'), 'Sparse brief should ask for external interfaces.')

  const unknown = await runReportCompiler({ id: 'audit-brief-clarification-unknown', briefText: 'Design a nice thing.' })
  const unknownPlan = buildBriefClarificationPlan(unknown.dossier, unknown.stageTrace)

  assert(unknownPlan.verdict === 'clarification_required', 'Unknown sparse brief should require clarification.')
  assert(unknownPlan.summary.requiredRows > 0, 'Unknown sparse brief should include required questions.')
  assert(unknownPlan.summary.architectureBlockingRows > 0, 'Unknown sparse brief should include architecture-blocking questions.')
  assert(unknownPlan.questions[0]?.kind === 'product_class', 'Unknown sparse brief should first ask for product class.')
  assert(unknownPlan.summary.nextQuestionId === unknownPlan.questions[0]?.id, 'Next question should point to the first required question.')

  console.log('Brief clarification plan audit passed')
  console.log({
    rich: richPlan.summary,
    sparseDrone: sparsePlan.summary,
    unknown: unknownPlan.summary,
  })
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
