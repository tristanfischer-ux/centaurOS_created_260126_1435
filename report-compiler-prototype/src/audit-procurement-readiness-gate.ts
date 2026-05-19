import { runReportCompiler } from './pipeline/run-report-compiler'
import { buildProcurementReadinessGate, renderProcurementReadinessGateCsv } from './scoring/procurement-readiness-gate'
import type { BomLine, SourcingEvidenceRecord } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const unsourced = await runReportCompiler({ id: 'audit-procurement-unsourced', briefText: brief })
  const unsourcedGate = buildProcurementReadinessGate(unsourced.dossier, unsourced.architectureReadiness, unsourced.stageTrace, unsourced.issues)

  assert(unsourcedGate.verdict === 'procurement_not_started', 'Unsourced run should be procurement_not_started.')
  assert(!unsourcedGate.summary.canUseForProcurement, 'Unsourced run must not be procurement-ready.')
  assert(unsourcedGate.summary.procurementBlockingRows === unsourced.dossier.sourcing.admission.unpricedCriticalLines, 'Procurement blockers should match critical unsourced rows.')
  assert(unsourcedGate.rows.some(row => row.area === 'source_reference_quality' && row.verdict === 'blocked'), 'No source evidence should block source-reference quality.')

  const protocol = await runReportCompiler({
    id: 'audit-procurement-protocol',
    briefText: brief,
    sourcingEvidence: [sourceRecord(criticalLines(unsourced)[0], 0, 'test-fixture://procurement-readiness/critical-0')],
  })
  const protocolGate = buildProcurementReadinessGate(protocol.dossier, protocol.architectureReadiness, protocol.stageTrace, protocol.issues)

  assert(protocolGate.verdict === 'procurement_blocked', 'Protocol evidence should still block procurement.')
  assert(protocolGate.summary.productionEligibleCriticalRows === 0, 'Protocol evidence should not make critical rows production-eligible.')
  assert(protocolGate.summary.procurementBlockingRows === unsourcedGate.summary.procurementBlockingRows, 'Protocol evidence should not reduce procurement blockers.')

  const allCriticalSourced = await runReportCompiler({
    id: 'audit-procurement-all-critical-sourced',
    briefText: brief,
    sourcingEvidence: criticalLines(unsourced).map((line, index) => sourceRecord(line, index, `https://catalogue.acme-industrial.co.uk/${line.componentWordId}`)),
  })
  const allCriticalGate = buildProcurementReadinessGate(allCriticalSourced.dossier, allCriticalSourced.architectureReadiness, allCriticalSourced.stageTrace, allCriticalSourced.issues)
  const csv = renderProcurementReadinessGateCsv(allCriticalGate)

  assert(allCriticalGate.summary.productionEligibleCriticalRows === allCriticalGate.summary.criticalRows, 'All critical source rows should become production-eligible.')
  assert(allCriticalGate.summary.procurementBlockingRows === 0, 'All critical production sources should clear BoM procurement blockers.')
  assert(allCriticalGate.verdict === 'procurement_review_required', 'All critical sources should still require architecture/prototype procurement review.')
  assert(!allCriticalGate.summary.canUseForProcurement, 'Prototype policy should keep procurement use disabled.')
  assert(allCriticalGate.rows.some(row => row.area === 'prototype_procurement_policy' && row.verdict === 'review'), 'Prototype procurement policy should require explicit review.')
  assert(csv.trim().split('\n').length === allCriticalGate.summary.rows + 1, 'Procurement readiness CSV should contain one header plus one row per gate row.')

  console.log('Procurement readiness gate audit passed')
  console.log({
    unsourced: unsourcedGate.summary,
    protocol: protocolGate.summary,
    allCritical: allCriticalGate.summary,
  })
}

function criticalLines(result: Awaited<ReturnType<typeof runReportCompiler>>): BomLine[] {
  return result.dossier.bom.lines.filter(line => line.critical)
}

function sourceRecord(line: BomLine, index: number, ref: string): SourcingEvidenceRecord {
  const manufacturer = `Production Example Manufacturer ${index + 1}`
  const mpn = `PROD-${index + 1}-${line.componentWordId.toUpperCase().replaceAll(/[^A-Z0-9]+/g, '-')}`.slice(0, 80)
  return {
    componentWordId: line.componentWordId,
    supplierName: `Production Example Supplier ${index + 1}`,
    manufacturer,
    mpn,
    unitCostGbp: 75 + index,
    leadTimeWeeks: 8 + index,
    sourceGrade: 'priced',
    evidence: {
      kind: 'source',
      ref,
      quote: `${manufacturer} catalogue row ${mpn} prices ${line.description}.`,
    },
    retrievedAt: '2026-05-17T21:40:00.000+01:00',
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
