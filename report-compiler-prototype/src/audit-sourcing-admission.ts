import { runReportCompiler } from './pipeline/run-report-compiler'
import type { SourcingEvidenceRecord } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, LFP cells, BMS, thermal management and fire protection.'

main().catch(error => {
  console.error(error)
  throw error
})

async function main(): Promise<void> {
  const unsourced = await runReportCompiler({ id: 'sourcing-unsourced', briefText: brief })
  const invalidRecord: SourcingEvidenceRecord = {
    componentWordId: 'lfp_prismatic_cells',
    supplierName: '',
    unitCostGbp: 75,
    sourceGrade: 'priced',
    evidence: { kind: 'source', ref: '' },
    retrievedAt: '',
  }
  const validProtocolRecord: SourcingEvidenceRecord = {
    componentWordId: 'lfp_prismatic_cells',
    supplierName: 'Protocol Test Supplier',
    manufacturer: 'Protocol Test Manufacturer',
    mpn: 'PROTOCOL-ONLY-NOT-A-REAL-PART',
    unitCostGbp: 75,
    leadTimeWeeks: 12,
    sourceGrade: 'priced',
    evidence: {
      kind: 'source',
      ref: 'test-fixture://sourcing-admission/lfp-prismatic-cells',
      quote: 'Protocol-only fixture proving that source-backed records can be admitted. Not a real supplier quote.',
    },
    retrievedAt: '2026-05-15T00:00:00.000Z',
  }
  const sourced = await runReportCompiler({
    id: 'sourcing-protocol',
    briefText: brief,
    sourcingEvidence: [invalidRecord, validProtocolRecord],
  })

  console.log('UNSOURCED SCRATCH REPORT')
  console.log(unsourced.dossier.sourcing.admission)
  console.log('\nSOURCING ADMISSION PROTOCOL TEST')
  console.log(sourced.dossier.sourcing.admission)
  console.log('\nAdmitted evidence refs:')
  console.log(sourced.dossier.sources.sourcingEvidence.map(record => record.evidence.ref))
  console.log('\nNote: the admitted record is a protocol fixture, not a real supplier source.')
}
