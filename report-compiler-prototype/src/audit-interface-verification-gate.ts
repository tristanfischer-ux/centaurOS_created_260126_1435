import { buildEngineeringVerificationPlan } from './architecture/verification-plan'
import { evaluateArchitectureReadiness } from './gates/architecture-ready'
import { runReportCompiler } from './pipeline/run-report-compiler'
import {
  buildInterfaceVerificationGate,
  renderInterfaceVerificationGateCsv,
} from './scoring/interface-verification-gate'
import type { ProductDossier, ReportRunResult, SourcingEvidenceRecord, VerificationEvidenceRecord } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const initial = await runReportCompiler({ id: 'audit-interface-verification-initial', briefText: brief })
  const initialGate = buildInterfaceVerificationGate(initial.dossier, initial.architectureReadiness, initial.issues)
  const csv = renderInterfaceVerificationGateCsv(initialGate)

  assert(initialGate.verdict === 'interface_review_ready', 'Initial BESS interfaces should be structurally ready for interface review.')
  assert(initialGate.summary.rows === initial.architectureReadiness.requiredInterfaceLinks.length, 'Gate should emit one row per required interface link.')
  assert(initialGate.summary.missingContracts === 0, 'Initial BESS should have no missing required interface contracts.')
  assert(initialGate.summary.carrierCompleteRows === initialGate.summary.rows, 'Initial BESS should have both endpoint carriers for each required interface.')
  assert(initialGate.summary.verificationActivityRows === initialGate.summary.rows, 'Initial BESS should have interface-review verification activities for every required interface.')
  assert(initialGate.summary.acceptedRows === 0, 'Initial BESS should not pretend interface evidence is accepted.')
  assert(csv.trim().split('\n').length === initialGate.summary.rows + 1, 'Interface verification CSV should contain one header plus one row per interface.')

  const evidenced = await runReportCompiler({
    id: 'audit-interface-verification-evidenced',
    briefText: brief,
    sourcingEvidence: protocolSourcingEvidence(initial),
    verificationEvidence: protocolVerificationEvidence(buildEngineeringVerificationPlan(initial.dossier, initial.architectureReadiness, initial.issues)),
  })
  const evidencedGate = buildInterfaceVerificationGate(evidenced.dossier, evidenced.architectureReadiness, evidenced.issues)

  assert(evidencedGate.verdict === 'accepted_interfaces', 'Full protocol reviewer evidence should mechanically accept every required interface.')
  assert(evidencedGate.summary.acceptedRows === evidencedGate.summary.rows, 'Every interface row should be accepted under full protocol evidence.')

  const brokenDossier = removeInterface(initial.dossier, 'energy_storage_source', 'dc_bus')
  const brokenReadiness = evaluateArchitectureReadiness(brokenDossier)
  const brokenGate = buildInterfaceVerificationGate(brokenDossier, brokenReadiness, initial.issues)

  assert(brokenGate.verdict === 'interface_blocked', 'Removing a required interface carrier should block interface verification.')
  assert(brokenGate.rows.some(row => row.interfaceId === 'dc_bus' && row.status === 'blocked'), 'Broken dc_bus interface should be blocked.')

  console.log('Interface verification gate audit passed')
  console.log({
    initial: initialGate.summary,
    evidenced: evidencedGate.summary,
    broken: brokenGate.summary,
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
      supplierName: 'Protocol Evidence Supplier',
      manufacturer: 'Protocol Evidence Manufacturer',
      mpn: `PROTOCOL-${index + 1}-${line.componentWordId}`.slice(0, 80),
      unitCostGbp: 100 + index,
      leadTimeWeeks: 8,
      sourceGrade: 'priced',
      evidence: {
        kind: 'source',
        ref: `test-fixture://interface-verification/source/${line.componentWordId}`,
        quote: 'Protocol-only fixture proving source-backed closure. Not a real supplier quote.',
      },
      retrievedAt: '2026-05-17T17:40:00.000+01:00',
    }))
}

function protocolVerificationEvidence(plan: ReturnType<typeof buildEngineeringVerificationPlan>): VerificationEvidenceRecord[] {
  return plan.activities
    .filter((activity): activity is typeof activity & { evidenceKind: VerificationEvidenceRecord['evidenceKind'] } => activity.evidenceKind !== 'source_evidence')
    .map(activity => ({
      activityId: activity.id,
      evidenceKind: activity.evidenceKind,
      reviewerName: 'Protocol Evidence Reviewer',
      verdict: 'accepted',
      evidenceRef: `test-fixture://interface-verification/review/${activity.id}`,
      evidenceNote: 'Protocol-only fixture proving reviewer evidence closure. Not a real engineering signoff.',
      reviewedAt: '2026-05-17T17:40:00.000+01:00',
    }))
}

function removeInterface(dossier: ProductDossier, moduleId: string, interfaceId: string): ProductDossier {
  const copy = JSON.parse(JSON.stringify(dossier)) as ProductDossier
  const module = copy.architecture.modules.find(item => item.id === moduleId)
  if (!module) return copy
  module.interfaces = module.interfaces.filter(item => item !== interfaceId)
  for (const subModule of module.subModules) {
    subModule.interfaces = subModule.interfaces.filter(item => item !== interfaceId)
  }
  return copy
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
