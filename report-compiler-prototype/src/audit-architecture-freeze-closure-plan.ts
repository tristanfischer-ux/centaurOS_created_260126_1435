import { buildEngineeringVerificationPlan } from './architecture/verification-plan'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { ProductDossier, ReportRunResult, SourcingEvidenceRecord, VerificationEvidenceRecord } from './schema/types'
import { buildArchitectureFreezeGate } from './scoring/architecture-freeze-gate'
import {
  architectureFreezeClosurePlanFromGate,
  buildArchitectureFreezeClosurePlan,
  renderArchitectureFreezeClosurePlanCsv,
} from './scoring/architecture-freeze-closure-plan'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const initial = await runReportCompiler({ id: 'audit-architecture-freeze-closure-initial', briefText: brief })
  const initialGate = buildArchitectureFreezeGate(initial.dossier, initial.architectureReadiness, initial.stageTrace, initial.issues)
  const initialPlan = architectureFreezeClosurePlanFromGate(initialGate)
  const csv = renderArchitectureFreezeClosurePlanCsv(initialPlan)

  assert(initialGate.verdict === 'architecture_freeze_review_required', 'Initial BESS should be freeze-review-required.')
  assert(initialPlan.summary.rows === initialGate.summary.reviewRows + initialGate.summary.blockedRows, 'Closure plan should emit one row per non-passing freeze area.')
  assert(initialPlan.summary.blockedRows === 0, 'Initial BESS closure rows should be ready, not blocked.')
  assert(initialPlan.summary.sourcingIntakeRows === 1, 'Initial BESS should have one sourcing-intake freeze closure row.')
  assert(initialPlan.summary.engineeringReviewRows === 1, 'Initial BESS should have one engineering-review freeze closure row.')
  assert(initialPlan.summary.verificationIntakeRows === 2, 'Initial BESS should have two verification-intake freeze closure rows.')
  assert(initialPlan.summary.nextRowId !== null, 'Initial BESS closure plan should nominate the next row.')
  assert(csv.trim().split('\n').length === initialPlan.summary.rows + 1, 'Architecture freeze closure CSV should contain one header plus one row per closure row.')

  const evidenced = await runReportCompiler({
    id: 'audit-architecture-freeze-closure-evidenced',
    briefText: brief,
    sourcingEvidence: protocolSourcingEvidence(initial),
    verificationEvidence: protocolVerificationEvidence(initial),
  })
  const evidencedPlan = buildArchitectureFreezeClosurePlan(evidenced.dossier, evidenced.architectureReadiness, evidenced.stageTrace, evidenced.issues)

  assert(evidencedPlan.summary.rows < initialPlan.summary.rows, 'Protocol evidence should reduce open freeze closure rows.')
  assert(evidencedPlan.summary.verificationIntakeRows === 0, 'Accepted protocol verification should close verification-intake freeze rows mechanically.')

  const impossible = await runReportCompiler({
    id: 'audit-architecture-freeze-closure-impossible',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 5 tonne gross mass limit, and LFP prismatic cells.',
  })
  const impossiblePlan = buildArchitectureFreezeClosurePlan(impossible.dossier, impossible.architectureReadiness, impossible.stageTrace, impossible.issues)

  assert(impossiblePlan.summary.blockedRows > 0, 'Impossible architecture should produce blocked freeze closure rows.')
  assert(impossiblePlan.summary.architectureRevisionRows > 0, 'Impossible architecture should point at architecture revision.')

  const taintedDossier: ProductDossier = structuredClone(initial.dossier)
  taintedDossier.architecture.modules[0].subModules[0].words[0].provenance.push({
    kind: 'model',
    ref: 'chain-v2-adapted.state.json.words[0]',
  })
  const taintedPlan = buildArchitectureFreezeClosurePlan(taintedDossier, initial.architectureReadiness, initial.stageTrace, initial.issues)

  assert(taintedPlan.summary.architectureRevisionRows > 0, 'Tainted lineage should route to architecture revision.')
  assert(taintedPlan.rows.some(row => row.area === 'admission_and_lineage' && row.status === 'blocked'), 'Tainted lineage closure row should block admission and lineage.')

  console.log('Architecture freeze closure plan audit passed')
  console.log({
    initial: initialPlan.summary,
    evidenced: evidencedPlan.summary,
    impossible: impossiblePlan.summary,
    tainted: taintedPlan.summary,
  })
}

function protocolSourcingEvidence(result: ReportRunResult): SourcingEvidenceRecord[] {
  const seen = new Set<string>()
  return result.dossier.bom.lines
    .filter(line => {
      if (seen.has(line.componentWordId)) return false
      seen.add(line.componentWordId)
      return true
    })
    .map((line, index) => ({
      componentWordId: line.componentWordId,
      supplierName: 'Protocol Freeze Closure Supplier',
      manufacturer: 'Protocol Freeze Closure Manufacturer',
      mpn: `FREEZE-CLOSURE-${index + 1}-${line.componentWordId}`.slice(0, 80),
      unitCostGbp: 100 + index,
      leadTimeWeeks: 8,
      sourceGrade: 'priced',
      evidence: {
        kind: 'source',
        ref: `test-fixture://architecture-freeze-closure/source/${line.componentWordId}`,
        quote: 'Protocol Freeze Closure Manufacturer fixture quote. Not a real supplier quote.',
      },
      retrievedAt: '2026-05-18T09:40:00.000+01:00',
    }))
}

function protocolVerificationEvidence(result: ReportRunResult): VerificationEvidenceRecord[] {
  const plan = buildEngineeringVerificationPlan(result.dossier, result.architectureReadiness, result.issues)
  return plan.activities
    .filter((activity): activity is typeof activity & { evidenceKind: VerificationEvidenceRecord['evidenceKind'] } => activity.evidenceKind !== 'source_evidence')
    .map(activity => ({
      activityId: activity.id,
      evidenceKind: activity.evidenceKind,
      reviewerName: 'Protocol Freeze Closure Reviewer',
      verdict: 'accepted',
      evidenceRef: `test-fixture://architecture-freeze-closure/review/${activity.id}`,
      evidenceNote: 'Protocol-only fixture proving architecture-freeze closure mechanics. Not a real engineering signoff.',
      reviewedAt: '2026-05-18T09:40:00.000+01:00',
    }))
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
