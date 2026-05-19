import { buildClaimLedger } from './scoring/claim-ledger'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { SourcingEvidenceRecord, VerificationEvidenceRecord } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const unsourced = await runReportCompiler({ id: 'audit-claim-ledger-unsourced', briefText: brief })
  const unsourcedLedger = buildClaimLedger(unsourced.dossier, unsourced.architectureReadiness, unsourced.issues)

  assert(unsourcedLedger.summary.rows > unsourced.architectureReadiness.componentWordCount, 'Claim ledger should include more than component candidates.')
  assert(unsourcedLedger.summary.briefSupplied === unsourced.dossier.brief.requirements.length, 'Every parsed requirement should become a brief-supplied claim.')
  assert(unsourcedLedger.summary.sourceRequired > 0, 'Unsourced BESS should have source-required claims.')
  assert(unsourcedLedger.summary.sourceBacked === 0, 'Unsourced BESS should not have source-backed claims.')
  assert(unsourcedLedger.rows.some(row => row.id === 'headline_metric:capex_gbp' && row.status === 'source_required'), 'Unsourced CAPEX metric should be source-required.')
  assert(unsourcedLedger.rows.some(row => row.kind === 'module_allocation' && row.status === 'generated_needs_review'), 'Generated module allocations should require review.')

  const sourceEvidence: SourcingEvidenceRecord = {
    componentWordId: 'lfp_prismatic_cells',
    supplierName: 'Protocol Test Supplier',
    manufacturer: 'Protocol Test Manufacturer',
    mpn: 'PROTOCOL-ONLY-NOT-A-REAL-PART',
    unitCostGbp: 75,
    leadTimeWeeks: 12,
    sourceGrade: 'priced',
    evidence: {
      kind: 'source',
      ref: 'test-fixture://claim-ledger/lfp-prismatic-cells',
      quote: 'Protocol-only fixture proving claim ledger source-backed accounting. Not a real supplier quote.',
    },
    retrievedAt: '2026-05-17T06:40:00.000+01:00',
  }
  const verificationEvidence: VerificationEvidenceRecord = {
    activityId: 'design_review:energy_storage_source',
    evidenceKind: 'design_review',
    reviewerName: 'Protocol Test Reviewer',
    verdict: 'accepted',
    evidenceRef: 'test-fixture://claim-ledger/design-review/energy-storage-source',
    evidenceNote: 'Protocol-only fixture proving reviewer-accepted claim accounting.',
    reviewedAt: '2026-05-17T06:40:00.000+01:00',
  }
  const evidenced = await runReportCompiler({
    id: 'audit-claim-ledger-evidenced',
    briefText: brief,
    sourcingEvidence: [sourceEvidence],
    verificationEvidence: [verificationEvidence],
  })
  const evidencedLedger = buildClaimLedger(evidenced.dossier, evidenced.architectureReadiness, evidenced.issues)
  const sourceBackedRows = evidencedLedger.rows.filter(row => row.status === 'source_backed')
  const acceptedModule = evidencedLedger.rows.find(row => row.id === 'module_allocation:energy_storage_source')

  assert(sourceBackedRows.length >= 4, 'Admitted source evidence should create source-backed supplier/manufacturer/MPN/cost claims.')
  assert(sourceBackedRows.every(row => row.sourceRefs.includes(sourceEvidence.evidence.ref)), 'Source-backed rows should carry the admitted source ref.')
  assert(acceptedModule?.status === 'accepted', 'Accepted design-review evidence should mark the module allocation claim accepted.')
  assert(acceptedModule?.reviewerEvidenceRefs.includes(verificationEvidence.evidenceRef), 'Accepted module claim should carry reviewer evidence ref.')
  assert(evidencedLedger.summary.accepted > unsourcedLedger.summary.accepted, 'Reviewer evidence should increase accepted claim count.')
  assert(evidencedLedger.summary.sourceBacked > unsourcedLedger.summary.sourceBacked, 'Sourcing evidence should increase source-backed claim count.')

  console.log('Claim ledger audit passed')
  console.log({
    unsourced: unsourcedLedger.summary,
    evidenced: evidencedLedger.summary,
    sourceBackedRows: sourceBackedRows.map(row => ({ id: row.id, sourceRefs: row.sourceRefs })),
    acceptedModule,
  })
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
