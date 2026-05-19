import { buildClaimEvidenceGate } from './scoring/claim-evidence-gate'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { SourcingEvidenceRecord, VerificationEvidenceRecord } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const unsourced = await runReportCompiler({ id: 'audit-claim-evidence-gate-unsourced', briefText: brief })
  const unsourcedGate = buildClaimEvidenceGate(unsourced.dossier, unsourced.architectureReadiness, unsourced.issues)
  const unsourcedBom = unsourcedGate.rows.find(row => row.area === 'bom_sourcing')
  const unsourcedArchitecture = unsourcedGate.rows.find(row => row.area === 'architecture_design')
  const unsourcedBrief = unsourcedGate.rows.find(row => row.area === 'brief_requirements')

  assert(unsourcedGate.verdict === 'evidence_blocked', 'Unsourced BESS claim gate should be evidence-blocked.')
  assert(unsourcedBom?.verdict === 'evidence_blocked', 'Unsourced BESS BoM-sourcing area should be evidence-blocked.')
  assert((unsourcedBom?.sourceRequiredClaims ?? 0) > 0, 'Unsourced BESS BoM-sourcing area should include source-required claims.')
  assert(unsourcedArchitecture?.verdict === 'review_required', 'Generated architecture claims should require engineering review, not source intake.')
  assert(unsourcedBrief?.verdict === 'claim_evidence_complete', 'Brief-supplied requirement claims should pass the claim evidence gate.')
  assert(unsourcedGate.summary.passRatio < 0.5, 'Unsourced BESS claim pass ratio should stay low.')

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
      ref: 'test-fixture://claim-evidence-gate/lfp-prismatic-cells',
      quote: 'Protocol-only fixture proving claim evidence gate accounting. Not a real supplier quote.',
    },
    retrievedAt: '2026-05-17T07:40:00.000+01:00',
  }
  const verificationEvidence: VerificationEvidenceRecord = {
    activityId: 'design_review:energy_storage_source',
    evidenceKind: 'design_review',
    reviewerName: 'Protocol Test Reviewer',
    verdict: 'accepted',
    evidenceRef: 'test-fixture://claim-evidence-gate/design-review/energy-storage-source',
    evidenceNote: 'Protocol-only fixture proving accepted reviewer evidence moves through claim evidence gate accounting.',
    reviewedAt: '2026-05-17T07:40:00.000+01:00',
  }
  const evidenced = await runReportCompiler({
    id: 'audit-claim-evidence-gate-evidenced',
    briefText: brief,
    sourcingEvidence: [sourceEvidence],
    verificationEvidence: [verificationEvidence],
  })
  const evidencedGate = buildClaimEvidenceGate(evidenced.dossier, evidenced.architectureReadiness, evidenced.issues)
  const evidencedBom = evidencedGate.rows.find(row => row.area === 'bom_sourcing')
  const evidencedArchitecture = evidencedGate.rows.find(row => row.area === 'architecture_design')

  assert(evidencedGate.summary.sourceBackedClaims > unsourcedGate.summary.sourceBackedClaims, 'Sourcing evidence should increase source-backed claim count.')
  assert(evidencedGate.summary.acceptedClaims > unsourcedGate.summary.acceptedClaims, 'Reviewer evidence should increase accepted claim count.')
  assert((evidencedBom?.sourceRequiredClaims ?? 0) < (unsourcedBom?.sourceRequiredClaims ?? 0), 'Admitted source evidence should reduce BoM source-required claim count.')
  assert((evidencedArchitecture?.passedClaims ?? 0) > (unsourcedArchitecture?.passedClaims ?? 0), 'Accepted review evidence should increase architecture passed claims.')
  assert(evidencedGate.verdict === 'evidence_blocked', 'Partial protocol evidence should not make the whole report claim-complete.')

  console.log('Claim evidence gate audit passed')
  console.log({
    unsourced: unsourcedGate.summary,
    unsourcedRows: unsourcedGate.rows,
    evidenced: evidencedGate.summary,
    evidencedRows: evidencedGate.rows,
  })
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
