import { runReportCompiler } from './pipeline/run-report-compiler'
import { buildSourcingBatchPlan, renderSourcingBatchPlanCsv } from './scoring/sourcing-batch-plan'
import type { SourcingEvidenceRecord } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const unsourced = await runReportCompiler({ id: 'audit-sourcing-batch-unsourced', briefText: brief })
  const unsourcedPlan = buildSourcingBatchPlan(unsourced.dossier)

  const criticalBatch = unsourcedPlan.batches.find(batch => batch.kind === 'critical_source_collection')
  const deferredBatch = unsourcedPlan.batches.find(batch => batch.kind === 'candidate_sourcing_deferred')

  assert(criticalBatch?.status === 'active', 'Unsourced critical source collection batch should be active.')
  assert(criticalBatch.rowCount === unsourced.dossier.sourcing.admission.unpricedCriticalLines, 'Critical batch should match unpriced critical lines.')
  assert(deferredBatch?.status === 'deferred', 'Candidate sourcing batch should be deferred.')
  assert((deferredBatch?.rowCount ?? 0) > (criticalBatch?.rowCount ?? 0), 'Candidate deferral batch should carry the long-tail candidate rows.')
  assert(unsourcedPlan.summary.nextBatchId === criticalBatch.id, 'Next batch should be critical source collection for unsourced BESS.')
  assert(criticalBatch.items[0]?.searchTerms.length >= 3, 'Critical batch items should carry search starting points.')

  const protocol = await runReportCompiler({
    id: 'audit-sourcing-batch-protocol',
    briefText: brief,
    sourcingEvidence: [sourceRecord('test-fixture://sourcing-batch/lfp-prismatic-cells', 'Protocol fixture for sourcing batch audit.')],
  })
  const protocolPlan = buildSourcingBatchPlan(protocol.dossier)

  assert(protocolPlan.summary.protocolReplacementRows === 1, 'Protocol source should create one protocol replacement batch item.')
  assert(protocolPlan.batches.some(batch => batch.kind === 'protocol_source_replacement' && batch.status === 'active'), 'Protocol replacement batch should be active.')
  assert(protocolPlan.summary.criticalSourceRows === unsourcedPlan.summary.criticalSourceRows - 1, 'Protocol source should remove one critical source collection item.')

  const blockedSource = await runReportCompiler({
    id: 'audit-sourcing-batch-blocked-source',
    briefText: brief,
    sourcingEvidence: [sourceRecord('https://example.com/catalogue/lfp-prismatic-cells', 'Production Example Manufacturer catalogue row PROD-LFP-1 prices LFP prismatic cells.')],
  })
  const blockedPlan = buildSourcingBatchPlan(blockedSource.dossier)

  assert(blockedPlan.summary.repairRows === 1, 'Placeholder source should create one repair batch item.')
  assert(blockedPlan.batches.some(batch => batch.kind === 'source_evidence_repair' && batch.status === 'active'), 'Source evidence repair batch should be active.')

  const production = await runReportCompiler({
    id: 'audit-sourcing-batch-production',
    briefText: brief,
    sourcingEvidence: [sourceRecord('https://catalogue.acme-industrial.co.uk/lfp-prismatic-cells', 'Production Example Manufacturer catalogue row PROD-LFP-1 prices LFP prismatic cells.')],
  })
  const productionPlan = buildSourcingBatchPlan(production.dossier)
  const csv = renderSourcingBatchPlanCsv(productionPlan)

  assert(productionPlan.summary.criticalSourceRows === unsourcedPlan.summary.criticalSourceRows - 1, 'Production source should reduce critical source collection rows by one.')
  assert(productionPlan.summary.repairRows === 0, 'Production source should not create repair rows.')
  assert(productionPlan.summary.protocolReplacementRows === 0, 'Production source should not create protocol replacement rows.')
  assert(csv.trim().split('\n').length === productionPlan.batches.reduce((sum, batch) => sum + batch.rowCount, 0) + 1, 'Batch CSV should contain one header plus one row per batch item.')

  console.log('Sourcing batch plan audit passed')
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
