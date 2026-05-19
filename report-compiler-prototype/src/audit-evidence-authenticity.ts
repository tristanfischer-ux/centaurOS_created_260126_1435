import { runReportCompiler } from './pipeline/run-report-compiler'
import { buildDocumentTrustGate } from './scoring/document-trust-gate'
import { buildEvidenceAuthenticityGate, renderEvidenceAuthenticityGateCsv } from './scoring/evidence-authenticity'
import type { SourcingEvidenceRecord, VerificationEvidenceRecord } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const unsourced = await runReportCompiler({ id: 'audit-evidence-authenticity-unsourced', briefText: brief })
  const unsourcedGate = buildEvidenceAuthenticityGate(unsourced.dossier)

  assert(unsourcedGate.verdict === 'no_evidence', 'Unsourced run should have no authenticity evidence rows.')
  assert(unsourcedGate.summary.rows === 0, 'Unsourced authenticity gate should have zero rows.')

  const protocol = await runReportCompiler({
    id: 'audit-evidence-authenticity-protocol',
    briefText: brief,
    sourcingEvidence: [protocolSource()],
    verificationEvidence: [protocolReview()],
  })
  const protocolGate = buildEvidenceAuthenticityGate(protocol.dossier)
  const protocolTrust = buildDocumentTrustGate(protocol.dossier, protocol.architectureReadiness, protocol.issues, protocol.score)

  assert(protocolGate.verdict === 'protocol_only', 'Protocol fixture evidence should be classified protocol_only.')
  assert(protocolGate.summary.protocolFixtureRows === 2, 'Protocol fixture source and review rows should both be flagged.')
  assert(protocolTrust.rows.find(row => row.area === 'evidence_authenticity')?.verdict === 'review', 'Document trust should not pass evidence authenticity for protocol fixtures.')

  const production = await runReportCompiler({
    id: 'audit-evidence-authenticity-production',
    briefText: brief,
    sourcingEvidence: [productionSource()],
    verificationEvidence: [productionReview()],
  })
  const productionGate = buildEvidenceAuthenticityGate(production.dossier)
  const csv = renderEvidenceAuthenticityGateCsv(productionGate)

  assert(productionGate.verdict === 'production_ready', 'External source and governed reviewer refs should be production_ready.')
  assert(productionGate.summary.productionReadyRows === 2, 'Production fixture should have two production-ready rows.')
  assert(csv.trim().split('\n').length === productionGate.summary.rows + 1, 'Authenticity CSV should contain one header plus one row per evidence row.')

  console.log('Evidence authenticity audit passed')
  console.log({
    unsourced: unsourcedGate.summary,
    protocol: protocolGate.summary,
    production: productionGate.summary,
    protocolTrustVerdict: protocolTrust.verdict,
  })
}

function protocolSource(): SourcingEvidenceRecord {
  return {
    componentWordId: 'lfp_prismatic_cells',
    supplierName: 'Protocol Test Supplier',
    manufacturer: 'Protocol Test Manufacturer',
    mpn: 'PROTOCOL-ONLY-NOT-A-REAL-PART',
    unitCostGbp: 75,
    leadTimeWeeks: 12,
    sourceGrade: 'priced',
    evidence: {
      kind: 'source',
      ref: 'test-fixture://evidence-authenticity/source',
      quote: 'Protocol-only fixture. Not a real supplier quote.',
    },
    retrievedAt: '2026-05-17T13:40:00.000+01:00',
  }
}

function protocolReview(): VerificationEvidenceRecord {
  return {
    activityId: 'design_review:energy_storage_source',
    evidenceKind: 'design_review',
    reviewerName: 'Protocol Test Reviewer',
    verdict: 'accepted',
    evidenceRef: 'test-fixture://evidence-authenticity/review',
    evidenceNote: 'Protocol-only fixture. Not a real engineering signoff.',
    reviewedAt: '2026-05-17T13:40:00.000+01:00',
  }
}

function productionSource(): SourcingEvidenceRecord {
  return {
    ...protocolSource(),
    supplierName: 'Production Example Supplier',
    manufacturer: 'Production Example Manufacturer',
    mpn: 'PRODUCTION-EXAMPLE-PART',
    evidence: {
      kind: 'source',
      ref: 'https://example.com/catalogue/production-example-part',
      quote: 'Example external catalogue reference used only to prove authenticity classification.',
    },
  }
}

function productionReview(): VerificationEvidenceRecord {
  return {
    ...protocolReview(),
    reviewerName: 'Named Engineering Reviewer',
    evidenceRef: 'review://engineering/design_review/energy_storage_source',
    evidenceNote: 'Named reviewer acceptance record used to prove governed review-reference classification.',
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
