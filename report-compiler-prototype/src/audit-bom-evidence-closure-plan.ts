import { buildBomEvidenceClosurePlan, renderBomEvidenceClosurePlanCsv } from './scoring/bom-evidence-closure-plan'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { SourcingEvidenceRecord } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const unsourced = await runReportCompiler({ id: 'audit-bom-closure-unsourced', briefText: brief })
  const unsourcedPlan = buildBomEvidenceClosurePlan(unsourced.dossier)

  assert(unsourcedPlan.summary.traceRows === unsourced.dossier.bom.lines.length, 'Closure plan should see every BoM trace row.')
  assert(unsourcedPlan.summary.collectSourceRows === unsourced.dossier.sourcing.admission.unpricedCriticalLines, 'Unsourced critical rows should become source collection rows.')
  assert(unsourcedPlan.summary.deferCandidateRows > unsourcedPlan.summary.collectSourceRows, 'Candidate-only rows should be explicitly deferred.')
  assert(unsourcedPlan.summary.procurementBlockingRows === unsourced.dossier.sourcing.admission.unpricedCriticalLines, 'Unsourced critical rows should block procurement.')
  assert(unsourcedPlan.summary.nextRowId === unsourcedPlan.rows[0]?.id, 'Next row should point at the first sorted closure row.')
  assert(unsourcedPlan.rows[0]?.action === 'collect_source_evidence', 'Critical source collection should sort before candidate deferrals.')
  assert(unsourcedPlan.rows[0]?.priority === 'blocker' && unsourcedPlan.rows[0]?.status === 'ready', 'First row should be a ready blocker.')

  const protocol = await runReportCompiler({
    id: 'audit-bom-closure-protocol',
    briefText: brief,
    sourcingEvidence: [sourceRecord('test-fixture://bom-closure/lfp-prismatic-cells', 'Protocol fixture for BoM closure audit.')],
  })
  const protocolPlan = buildBomEvidenceClosurePlan(protocol.dossier)

  assert(protocolPlan.summary.replaceProtocolRows === 1, 'Protocol source should create one protocol replacement row.')
  assert(protocolPlan.summary.collectSourceRows === unsourcedPlan.summary.collectSourceRows - 1, 'Protocol source should close one source collection row.')
  assert(protocolPlan.summary.procurementBlockingRows === unsourcedPlan.summary.procurementBlockingRows, 'Protocol pricing still blocks procurement for its critical line.')

  const blockedSource = await runReportCompiler({
    id: 'audit-bom-closure-blocked-source',
    briefText: brief,
    sourcingEvidence: [sourceRecord('https://example.com/catalogue/lfp-prismatic-cells', 'Production Example Manufacturer catalogue row PROD-LFP-1 prices LFP prismatic cells.')],
  })
  const blockedPlan = buildBomEvidenceClosurePlan(blockedSource.dossier)

  assert(blockedPlan.summary.repairReferenceRows === 1, 'Placeholder URL source should create one reference repair row.')
  assert(blockedPlan.rows.some(row => row.action === 'repair_source_reference' && row.requiredEvidence.some(field => field.includes('non-placeholder'))), 'Reference repair row should require non-placeholder URL evidence.')

  const production = await runReportCompiler({
    id: 'audit-bom-closure-production',
    briefText: brief,
    sourcingEvidence: [sourceRecord('https://catalogue.acme-industrial.co.uk/lfp-prismatic-cells', 'Production Example Manufacturer catalogue row PROD-LFP-1 prices LFP prismatic cells.')],
  })
  const productionPlan = buildBomEvidenceClosurePlan(production.dossier)
  const csv = renderBomEvidenceClosurePlanCsv(productionPlan)

  assert(productionPlan.summary.collectSourceRows === unsourcedPlan.summary.collectSourceRows - 1, 'Production source should remove one critical source collection row.')
  assert(productionPlan.summary.replaceProtocolRows === 0, 'Production source should not need protocol replacement.')
  assert(productionPlan.summary.repairReferenceRows === 0, 'Production source should not need reference repair.')
  assert(productionPlan.summary.procurementBlockingRows === unsourcedPlan.summary.procurementBlockingRows - 1, 'Production source should reduce procurement blockers by one.')
  assert(csv.trim().split('\n').length === productionPlan.summary.closureRows + 1, 'Closure CSV should contain one header plus one row per closure row.')

  console.log('BoM evidence closure plan audit passed')
  console.log({
    unsourced: unsourcedPlan.summary,
    protocol: protocolPlan.summary,
    blockedSource: blockedPlan.summary,
    production: productionPlan.summary,
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
