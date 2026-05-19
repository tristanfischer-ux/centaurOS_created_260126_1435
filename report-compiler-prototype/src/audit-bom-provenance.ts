import { buildBomProvenanceManifest } from './sourcing/provenance-manifest'
import { buildSourcingLineLedger } from './sourcing/ledger'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { SourcingEvidenceRecord } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const unsourced = await runReportCompiler({ id: 'audit-bom-provenance-unsourced', briefText: brief })
  const unsourcedManifest = buildBomProvenanceManifest(unsourced.dossier)

  assert(unsourcedManifest.summary.sourceBackedClaims === 0, 'Unsourced run should have zero source-backed BoM claims.')
  assert(unsourcedManifest.summary.provenanceViolations === 0, 'Unsourced run should not contain populated unprovenanced claim fields.')
  assert(unsourcedManifest.summary.criticalMissingSourceClaims === unsourced.dossier.sourcing.admission.unpricedCriticalLines * 4, 'Unsourced critical lines should miss supplier, manufacturer, MPN and unit cost claims.')

  const validRecord: SourcingEvidenceRecord = {
    componentWordId: 'lfp_prismatic_cells',
    supplierName: 'Protocol Test Supplier',
    manufacturer: 'Protocol Test Manufacturer',
    mpn: 'PROTOCOL-ONLY-NOT-A-REAL-PART',
    unitCostGbp: 75,
    leadTimeWeeks: 12,
    sourceGrade: 'priced',
    evidence: {
      kind: 'source',
      ref: 'test-fixture://bom-provenance/lfp-prismatic-cells',
      quote: 'Protocol-only fixture proving source-backed BoM provenance. Not a real supplier quote.',
    },
    retrievedAt: '2026-05-16T00:00:00.000Z',
  }
  const sourced = await runReportCompiler({
    id: 'audit-bom-provenance-sourced',
    briefText: brief,
    sourcingEvidence: [validRecord],
  })
  const sourcedManifest = buildBomProvenanceManifest(sourced.dossier)
  const sourcedLedger = buildSourcingLineLedger(sourced.dossier)

  assert(sourced.dossier.sourcing.admission.admittedLines === 1, 'Valid protocol source record should admit one BoM line.')
  assert(sourcedManifest.summary.sourceBackedClaims === 5, 'Valid protocol source record should back supplier, manufacturer, MPN, unit cost and lead time.')
  assert(sourcedManifest.rows.some(row => row.field === 'unit_cost_gbp' && row.status === 'source_backed' && row.value === '75'), 'Unit cost claim should be source-backed with value 75.')
  assert(sourcedManifest.rows.some(row => row.field === 'mpn' && row.status === 'source_backed' && row.sourceRef === validRecord.evidence.ref), 'MPN claim should retain source ref.')
  assert(sourcedLedger.summary.admittedPricedLines === 1, 'Sourcing ledger should agree with provenance manifest on admitted priced line.')

  const missingMpn: SourcingEvidenceRecord = { ...validRecord, mpn: undefined, evidence: { ...validRecord.evidence, ref: 'test-fixture://bom-provenance/missing-mpn' } }
  const rejected = await runReportCompiler({
    id: 'audit-bom-provenance-rejected',
    briefText: brief,
    sourcingEvidence: [missingMpn],
  })
  const rejectedManifest = buildBomProvenanceManifest(rejected.dossier)

  assert(rejected.dossier.sourcing.admission.admittedLines === 0, 'Missing MPN source record should not be admitted.')
  assert(rejected.dossier.sourcing.admission.rejectedRecords.some(record => record.reason.includes('MPN')), 'Missing MPN rejection should be explicit.')
  assert(rejectedManifest.summary.sourceBackedClaims === 0, 'Rejected source record should not create source-backed claims.')

  console.log('BoM provenance manifest audit passed')
  console.log({
    unsourced: unsourcedManifest.summary,
    sourced: sourcedManifest.summary,
    rejected: rejected.dossier.sourcing.admission.rejectedRecords,
  })
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
