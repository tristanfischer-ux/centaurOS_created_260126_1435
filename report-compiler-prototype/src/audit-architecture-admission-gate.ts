import { runReportCompiler } from './pipeline/run-report-compiler'
import { buildArchitectureAdmissionGate, renderArchitectureAdmissionGateCsv } from './scoring/architecture-admission-gate'

const bessBrief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const rich = await runReportCompiler({ id: 'audit-architecture-admission-rich', briefText: bessBrief })
  const richGate = buildArchitectureAdmissionGate(rich.dossier, rich.architectureReadiness, rich.stageTrace)
  const richCsv = renderArchitectureAdmissionGateCsv(richGate)

  assert(richGate.verdict === 'architecture_generation_admitted', 'Rich BESS brief should admit scratch architecture generation.')
  assert(richGate.summary.intakeVerdict === 'brief_ready_for_architecture', 'Rich BESS brief should pass intake.')
  assert(richGate.summary.clarificationVerdict === 'no_clarification_needed', 'Rich BESS brief should need no clarification.')
  assert(richGate.summary.architectureCanBeUsedForReview, 'Admitted architecture should be usable for engineering review.')
  assert(richGate.summary.architectureCanProceedToBom, 'Admitted and ready architecture should be able to proceed to evidence-gated BoM sourcing.')
  assert(richCsv.split('\n')[0]?.includes('area,verdict,signal'), 'Architecture admission CSV should include the expected header.')

  const sparseDrone = await runReportCompiler({ id: 'audit-architecture-admission-sparse-drone', briefText: 'Design a drone.' })
  const sparseGate = buildArchitectureAdmissionGate(sparseDrone.dossier, sparseDrone.architectureReadiness, sparseDrone.stageTrace)

  assert(sparseGate.verdict === 'architecture_generation_review_required', 'Sparse but classifiable brief should remain review-only.')
  assert(sparseGate.summary.architectureCanBeUsedForReview, 'Review-required architecture should be visible for review.')
  assert(!sparseGate.summary.architectureCanProceedToBom, 'Review-required architecture should not proceed to BoM as admitted.')
  assert(sparseGate.summary.nextClarificationQuestion !== null, 'Sparse brief should point to a clarification question.')

  const unknown = await runReportCompiler({ id: 'audit-architecture-admission-unknown', briefText: 'Design a nice thing.' })
  const unknownGate = buildArchitectureAdmissionGate(unknown.dossier, unknown.architectureReadiness, unknown.stageTrace)

  assert(unknownGate.verdict === 'architecture_generation_blocked', 'Unknown sparse brief should block architecture admission.')
  assert(!unknownGate.summary.architectureCanBeUsedForReview, 'Blocked architecture should not be treated as review-ready.')
  assert(!unknownGate.summary.architectureCanProceedToBom, 'Blocked architecture must not proceed to BoM.')
  assert(unknownGate.blockers.some(blocker => blocker.toLowerCase().includes('unknown product class')), 'Unknown brief should carry an unknown-class blocker.')

  console.log('Architecture admission gate audit passed')
  console.log({
    rich: richGate.summary,
    sparseDrone: sparseGate.summary,
    unknown: unknownGate.summary,
  })
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
