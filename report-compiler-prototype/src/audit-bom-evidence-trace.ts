import { buildBomEvidenceTraceMatrix, renderBomEvidenceTraceMatrixCsv } from './scoring/bom-evidence-trace'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { SourcingEvidenceRecord } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const unsourced = await runReportCompiler({ id: 'audit-bom-trace-unsourced', briefText: brief })
  const unsourcedTrace = buildBomEvidenceTraceMatrix(unsourced.dossier)

  assert(unsourcedTrace.summary.lines === unsourced.dossier.bom.lines.length, 'Trace should include every BoM line.')
  assert(unsourcedTrace.summary.criticalUnsourcedRows === unsourced.dossier.sourcing.admission.unpricedCriticalLines, 'Unsourced critical rows should match unpriced critical lines.')
  assert(unsourcedTrace.summary.productionEligibleRows === 0, 'Unsourced BoM should have zero production-eligible rows.')
  assert(unsourcedTrace.summary.canRenderCandidateBom, 'Unsourced architecture should still render candidate BoM rows.')
  assert(!unsourcedTrace.summary.canRenderPricedReviewBom, 'Unsourced BoM should not render priced review rows.')
  assert(!unsourcedTrace.summary.canUseForProcurement, 'Unsourced BoM should not be procurement-eligible.')

  const protocol = await runReportCompiler({
    id: 'audit-bom-trace-protocol',
    briefText: brief,
    sourcingEvidence: [sourceRecord('test-fixture://bom-trace/lfp-prismatic-cells', 'Protocol fixture for BoM trace audit.')],
  })
  const protocolTrace = buildBomEvidenceTraceMatrix(protocol.dossier)

  assert(protocolTrace.summary.admittedPricedRows === 1, 'Protocol source should admit one priced row.')
  assert(protocolTrace.summary.protocolOnlyRows === 1, 'Protocol source should be marked protocol-only.')
  assert(protocolTrace.summary.productionEligibleRows === 0, 'Protocol source should not be production-eligible.')
  assert(protocolTrace.summary.canRenderPricedReviewBom, 'Protocol source can render priced review rows.')
  assert(!protocolTrace.summary.canUseForProcurement, 'Protocol source should not enable procurement use.')

  const blockedSource = await runReportCompiler({
    id: 'audit-bom-trace-blocked-source',
    briefText: brief,
    sourcingEvidence: [sourceRecord('https://example.com/catalogue/lfp-prismatic-cells', 'Production Example Manufacturer catalogue row PROD-LFP-1 prices LFP prismatic cells.')],
  })
  const blockedTrace = buildBomEvidenceTraceMatrix(blockedSource.dossier)

  assert(blockedTrace.summary.sourceReferenceBlockedRows === 1, 'Placeholder source URL should create one source-reference-blocked trace row.')
  assert(blockedTrace.rows.some(row => row.traceStatus === 'source_reference_blocked' && row.sourceReferenceClass === 'placeholder_url'), 'Blocked trace row should carry placeholder classification.')

  const production = await runReportCompiler({
    id: 'audit-bom-trace-production',
    briefText: brief,
    sourcingEvidence: [sourceRecord('https://catalogue.acme-industrial.co.uk/lfp-prismatic-cells', 'Production Example Manufacturer catalogue row PROD-LFP-1 prices LFP prismatic cells.')],
  })
  const productionTrace = buildBomEvidenceTraceMatrix(production.dossier)
  const csv = renderBomEvidenceTraceMatrixCsv(productionTrace)

  assert(productionTrace.summary.productionEligibleRows === 1, 'Production-like source should make one row production-eligible.')
  assert(productionTrace.summary.productionEligibleCriticalRows === 1, 'Production-like source should make one critical row production-eligible.')
  assert(productionTrace.rows.some(row => row.traceStatus === 'production_eligible' && row.canDisplayPricedReview && row.canUseForProcurement), 'Production trace row should be displayable and procurement-eligible.')
  assert(!productionTrace.summary.canUseForProcurement, 'One sourced critical row should not make the whole critical BoM procurement-eligible.')
  assert(csv.trim().split('\n').length === productionTrace.summary.lines + 1, 'Trace CSV should contain one header plus one row per BoM line.')

  console.log('BoM evidence trace matrix audit passed')
  console.log({
    unsourced: unsourcedTrace.summary,
    protocol: protocolTrace.summary,
    blockedSource: blockedTrace.summary,
    production: productionTrace.summary,
  })
}

function sourceRecord(ref: string, quote: string): SourcingEvidenceRecord {
  return {
    componentWordId: 'lfp_prismatic_cells',
    supplierName: 'Production Example Supplier',
    manufacturer: 'Production Example Manufacturer',
    mpn: 'PROD-LFP-1',
    unitCostGbp: 75,
    leadTimeWeeks: 12,
    sourceGrade: 'priced',
    evidence: {
      kind: 'source',
      ref,
      quote,
    },
    retrievedAt: '2026-05-17T21:40:00.000+01:00',
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
