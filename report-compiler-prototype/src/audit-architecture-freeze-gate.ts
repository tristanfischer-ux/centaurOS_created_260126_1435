import { buildEngineeringVerificationPlan } from './architecture/verification-plan'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { ProductDossier, ReportRunResult, SourcingEvidenceRecord, VerificationEvidenceRecord } from './schema/types'
import { buildArchitectureFreezeGate, renderArchitectureFreezeGateCsv } from './scoring/architecture-freeze-gate'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const initial = await runReportCompiler({ id: 'audit-architecture-freeze-initial', briefText: brief })
  const initialGate = buildArchitectureFreezeGate(initial.dossier, initial.architectureReadiness, initial.stageTrace, initial.issues)
  const csv = renderArchitectureFreezeGateCsv(initialGate)

  assert(initialGate.verdict === 'architecture_freeze_review_required', 'Initial BESS should be structurally ready but still review-required.')
  assert(initialGate.summary.blockedRows === 0, 'Initial BESS should have no freeze blockers.')
  assert(initialGate.summary.structurallyReadyForSourcing, 'Initial BESS should be structurally ready for explicit sourcing work.')
  assert(!initialGate.summary.independentReviewAccepted, 'Initial BESS should not pretend reviewer evidence has accepted the architecture.')
  assert(initialGate.rows.find(row => row.area === 'module_structure')?.verdict === 'review', 'Unpriced critical lines and open review questions should keep module structure in review.')
  assert(csv.trim().split('\n').length === initialGate.summary.rows + 1, 'Architecture freeze CSV should contain one header plus one row per gate area.')

  const evidenced = await runReportCompiler({
    id: 'audit-architecture-freeze-evidenced',
    briefText: brief,
    sourcingEvidence: protocolSourcingEvidence(initial),
    verificationEvidence: protocolVerificationEvidence(initial),
  })
  const evidencedGate = buildArchitectureFreezeGate(evidenced.dossier, evidenced.architectureReadiness, evidenced.stageTrace, evidenced.issues)

  assert(evidencedGate.summary.blockedRows === 0, 'Full protocol evidence should not create freeze blockers.')
  assert(evidencedGate.summary.structurallyReadyForSourcing, 'Full protocol evidence should remain structurally ready for sourcing.')
  assert(evidencedGate.summary.moduleEngineeringVerdict !== 'module_engineering_blocked', 'Full protocol evidence should not block module engineering.')

  const impossible = await runReportCompiler({
    id: 'audit-architecture-freeze-impossible',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 5 tonne gross mass limit, and LFP prismatic cells.',
  })
  const impossibleGate = buildArchitectureFreezeGate(impossible.dossier, impossible.architectureReadiness, impossible.stageTrace, impossible.issues)

  assert(impossibleGate.verdict === 'architecture_freeze_blocked', 'Impossible mass envelope should block architecture freeze.')
  assert(impossibleGate.summary.structurallyReadyForSourcing === false, 'Blocked architecture should not be structurally ready for sourcing.')

  const taintedDossier: ProductDossier = structuredClone(initial.dossier)
  taintedDossier.architecture.modules[0].subModules[0].words[0].provenance.push({
    kind: 'model',
    ref: 'chain-v2-adapted.state.json.words[0]',
  })
  const taintedGate = buildArchitectureFreezeGate(taintedDossier, initial.architectureReadiness, initial.stageTrace, initial.issues)

  assert(taintedGate.verdict === 'architecture_freeze_blocked', 'Tainted scratch lineage should block architecture freeze.')
  assert(taintedGate.rows.find(row => row.area === 'admission_and_lineage')?.verdict === 'blocked', 'Admission and lineage row should catch chain-v2 contamination.')

  console.log('Architecture freeze gate audit passed')
  console.log({
    initial: initialGate.summary,
    evidenced: evidencedGate.summary,
    impossible: impossibleGate.summary,
    tainted: taintedGate.summary,
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
      supplierName: 'Protocol Freeze Supplier',
      manufacturer: 'Protocol Freeze Manufacturer',
      mpn: `FREEZE-${index + 1}-${line.componentWordId}`.slice(0, 80),
      unitCostGbp: 100 + index,
      leadTimeWeeks: 8,
      sourceGrade: 'priced',
      evidence: {
        kind: 'source',
        ref: `test-fixture://architecture-freeze/source/${line.componentWordId}`,
        quote: 'Protocol Freeze Manufacturer fixture quote. Not a real supplier quote.',
      },
      retrievedAt: '2026-05-18T07:40:00.000+01:00',
    }))
}

function protocolVerificationEvidence(result: ReportRunResult): VerificationEvidenceRecord[] {
  const plan = buildEngineeringVerificationPlan(result.dossier, result.architectureReadiness, result.issues)
  return plan.activities
    .filter((activity): activity is typeof activity & { evidenceKind: VerificationEvidenceRecord['evidenceKind'] } => activity.evidenceKind !== 'source_evidence')
    .map(activity => ({
      activityId: activity.id,
      evidenceKind: activity.evidenceKind,
      reviewerName: 'Protocol Freeze Reviewer',
      verdict: 'accepted',
      evidenceRef: `test-fixture://architecture-freeze/review/${activity.id}`,
      evidenceNote: 'Protocol-only fixture proving architecture-freeze evidence mechanics. Not a real engineering signoff.',
      reviewedAt: '2026-05-18T07:40:00.000+01:00',
    }))
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
