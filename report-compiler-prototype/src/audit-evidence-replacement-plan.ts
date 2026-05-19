import { runReportCompiler } from './pipeline/run-report-compiler'
import {
  buildEvidenceReplacementPlan,
  renderEvidenceReplacementPlanCsv,
} from './scoring/evidence-replacement-plan'
import type { SourcingEvidenceRecord, VerificationEvidenceRecord } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const unsourced = await runReportCompiler({ id: 'audit-evidence-replacement-unsourced', briefText: brief })
  const unsourcedPlan = buildEvidenceReplacementPlan(unsourced.dossier)

  assert(unsourcedPlan.summary.authenticityVerdict === 'no_evidence', 'Unsourced run should preserve no_evidence authenticity verdict.')
  assert(unsourcedPlan.summary.rows === 0, 'Unsourced run should not invent replacement rows without evidence records.')

  const protocol = await runReportCompiler({
    id: 'audit-evidence-replacement-protocol',
    briefText: brief,
    sourcingEvidence: [protocolSource()],
    verificationEvidence: [protocolReview()],
  })
  const protocolPlan = buildEvidenceReplacementPlan(protocol.dossier)
  const protocolCsv = renderEvidenceReplacementPlanCsv(protocolPlan)

  assert(protocolPlan.summary.authenticityVerdict === 'protocol_only', 'Protocol fixture evidence should produce a protocol_only replacement plan.')
  assert(protocolPlan.summary.rows === 2, 'Protocol fixture source and review rows should both require replacement.')
  assert(protocolPlan.summary.sourcingRows === 1, 'Protocol replacement plan should include one sourcing row.')
  assert(protocolPlan.summary.verificationRows === 1, 'Protocol replacement plan should include one verification row.')
  assert(protocolPlan.summary.blocksBomRows === 1, 'Only the sourcing replacement row should block BoM trust.')
  assert(protocolPlan.summary.blocksPublishRows === 2, 'Both replacement rows should block publishable trust.')
  assert(protocolPlan.summary.nextRowId === protocolPlan.rows[0].id, 'Next row should point at the first replacement row.')
  assert(protocolPlan.rows.some(row => row.replacementTarget === 'external_supplier_or_catalogue_url'), 'Sourcing row should require external supplier/catalogue evidence.')
  assert(protocolPlan.rows.some(row => row.replacementTarget === 'governed_reviewer_reference'), 'Verification row should require governed reviewer evidence.')
  assert(protocolCsv.trim().split('\n').length === protocolPlan.summary.rows + 1, 'Replacement CSV should contain one header plus one row per replacement row.')

  const production = await runReportCompiler({
    id: 'audit-evidence-replacement-production',
    briefText: brief,
    sourcingEvidence: [productionSource()],
    verificationEvidence: [productionReview()],
  })
  const productionPlan = buildEvidenceReplacementPlan(production.dossier)

  assert(productionPlan.summary.authenticityVerdict === 'production_ready', 'Production evidence should preserve production_ready verdict.')
  assert(productionPlan.summary.rows === 0, 'Production-ready evidence should have no replacement worklist rows.')

  console.log('Evidence replacement plan audit passed')
  console.log({
    unsourced: unsourcedPlan.summary,
    protocol: protocolPlan.summary,
    production: productionPlan.summary,
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
      ref: 'test-fixture://evidence-replacement/source',
      quote: 'Protocol-only fixture. Not a real supplier quote.',
    },
    retrievedAt: '2026-05-17T14:40:00.000+01:00',
  }
}

function protocolReview(): VerificationEvidenceRecord {
  return {
    activityId: 'design_review:energy_storage_source',
    evidenceKind: 'design_review',
    reviewerName: 'Protocol Test Reviewer',
    verdict: 'accepted',
    evidenceRef: 'test-fixture://evidence-replacement/review',
    evidenceNote: 'Protocol-only fixture. Not a real engineering signoff.',
    reviewedAt: '2026-05-17T14:40:00.000+01:00',
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
      quote: 'Example external catalogue reference used only to prove replacement-plan closure.',
    },
  }
}

function productionReview(): VerificationEvidenceRecord {
  return {
    ...protocolReview(),
    reviewerName: 'Named Engineering Reviewer',
    evidenceRef: 'review://engineering/design_review/energy_storage_source',
    evidenceNote: 'Named reviewer acceptance record used to prove replacement-plan closure.',
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
