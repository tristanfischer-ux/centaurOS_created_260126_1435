import { runReportCompiler } from './pipeline/run-report-compiler'
import { buildBriefIntakeGate, renderBriefIntakeGateCsv } from './scoring/brief-intake-gate'

const bessBrief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const rich = await runReportCompiler({ id: 'audit-brief-intake-rich', briefText: bessBrief })
  const richGate = buildBriefIntakeGate(rich.dossier, rich.stageTrace)
  const csv = renderBriefIntakeGateCsv(richGate)

  assert(richGate.verdict === 'brief_ready_for_architecture', 'Quantified supported BESS brief should be ready for architecture.')
  assert(richGate.summary.extractedRequirements >= 2, 'Rich BESS brief should extract multiple quantified requirements.')
  assert(richGate.summary.productClass === 'energy_storage', 'Rich BESS brief should classify as energy_storage.')
  assert(richGate.summary.classificationConfidence === 'high', 'Rich BESS brief should classify with high confidence.')
  assert(richGate.summary.scratchArchitectureSupported, 'Rich BESS brief should have scratch architecture support.')
  assert(csv.trim().split('\n').length === richGate.summary.rows + 1, 'Brief intake CSV should contain one header plus one row per gate row.')

  const sparseClassified = await runReportCompiler({ id: 'audit-brief-intake-sparse-drone', briefText: 'Design a drone.' })
  const sparseClassifiedGate = buildBriefIntakeGate(sparseClassified.dossier, sparseClassified.stageTrace)

  assert(sparseClassifiedGate.verdict === 'brief_intake_review_required', 'Sparse but classifiable brief should require review rather than block outright.')
  assert(sparseClassifiedGate.summary.productClass === 'drone', 'Sparse drone brief should still classify as drone.')
  assert(sparseClassifiedGate.rows.find(row => row.area === 'requirement_quantification')?.verdict === 'review', 'Sparse classified brief should review requirement quantification.')
  assert(sparseClassifiedGate.rows.find(row => row.area === 'assumption_boundary')?.verdict === 'review', 'Sparse classified brief should make assumption boundary visible.')

  const unknown = await runReportCompiler({ id: 'audit-brief-intake-unknown', briefText: 'Design a nice thing.' })
  const unknownGate = buildBriefIntakeGate(unknown.dossier, unknown.stageTrace)

  assert(unknownGate.verdict === 'brief_intake_blocked', 'Unknown sparse brief should block architecture trust.')
  assert(unknownGate.summary.productClass === 'unknown', 'Unknown sparse brief should remain unknown.')
  assert(unknownGate.rows.find(row => row.area === 'product_class_selection')?.verdict === 'blocked', 'Unknown sparse brief should block product-class selection.')
  assert(unknownGate.rows.find(row => row.area === 'scratch_design_support')?.verdict === 'blocked', 'Unknown sparse brief should block scratch design support.')
  assert(unknownGate.blockers.length > 0, 'Unknown sparse brief should expose blockers.')

  console.log('Brief intake gate audit passed')
  console.log({
    rich: richGate.summary,
    sparseClassified: sparseClassifiedGate.summary,
    unknown: unknownGate.summary,
  })
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
