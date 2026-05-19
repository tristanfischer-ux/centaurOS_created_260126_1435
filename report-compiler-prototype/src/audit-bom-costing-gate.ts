import { runReportCompiler } from './pipeline/run-report-compiler'
import { buildBomCostingGate, renderBomCostingGateCsv } from './scoring/bom-costing-gate'
import type { ReportRunResult, SourcingEvidenceRecord } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const unsourced = await runReportCompiler({ id: 'audit-bom-costing-unsourced', briefText: brief })
  const unsourcedGate = buildBomCostingGate(unsourced.dossier)

  assert(unsourcedGate.verdict === 'costing_not_started', 'Unsourced run should not start BoM costing.')
  assert(unsourcedGate.summary.sourcingEvidenceRows === 0, 'Unsourced run should have zero sourcing evidence rows.')
  assert(unsourcedGate.summary.unpricedCriticalLines > 0, 'Unsourced run should retain critical unpriced BoM lines.')
  assert(unsourcedGate.rows.some(row => row.area === 'sourcing_evidence_authenticity' && row.verdict === 'blocked'), 'Missing source evidence should block authenticity row.')
  assert(unsourcedGate.rows.some(row => row.area === 'source_reference_quality' && row.verdict === 'blocked'), 'Missing source evidence should block source quality row.')

  const protocol = await runReportCompiler({
    id: 'audit-bom-costing-protocol',
    briefText: brief,
    sourcingEvidence: sourcingEvidenceForAllLines(unsourced, 'protocol'),
  })
  const protocolGate = buildBomCostingGate(protocol.dossier)

  assert(protocolGate.verdict === 'costing_protocol_only', 'Protocol source fixtures should not become production-ready costing.')
  assert(protocolGate.summary.unpricedCriticalLines === 0, 'Protocol source fixtures should mechanically price critical lines.')
  assert(protocolGate.summary.sourceBackedClaims > 0, 'Protocol source fixtures should create source-backed BoM claims.')
  assert(protocolGate.summary.protocolSourcingEvidenceRows === protocolGate.summary.sourcingEvidenceRows, 'All protocol source rows should be flagged as protocol.')

  const placeholder = await runReportCompiler({
    id: 'audit-bom-costing-placeholder',
    briefText: brief,
    sourcingEvidence: sourcingEvidenceForAllLines(unsourced, 'placeholder'),
  })
  const placeholderGate = buildBomCostingGate(placeholder.dossier)

  assert(placeholderGate.verdict === 'costing_blocked', 'Placeholder URLs should block BoM costing even when line prices are admitted.')
  assert(placeholderGate.summary.placeholderSourceRows === placeholderGate.summary.sourcingEvidenceRows, 'All placeholder URL rows should be counted.')
  assert(placeholderGate.rows.some(row => row.area === 'source_reference_quality' && row.verdict === 'blocked'), 'Placeholder URL evidence should block source reference quality.')

  const production = await runReportCompiler({
    id: 'audit-bom-costing-production',
    briefText: brief,
    sourcingEvidence: sourcingEvidenceForAllLines(unsourced, 'production'),
  })
  const productionGate = buildBomCostingGate(production.dossier)
  const csv = renderBomCostingGateCsv(productionGate)

  assert(productionGate.verdict === 'costing_ready', 'External source-backed costing should pass BoM costing gate.')
  assert(productionGate.summary.unpricedCriticalLines === 0, 'Production source-backed costing should price every critical line.')
  assert(productionGate.summary.productionReadySourcingEvidenceRows === productionGate.summary.sourcingEvidenceRows, 'All production source rows should be production-ready.')
  assert(productionGate.summary.sourceQualityPassRows === productionGate.summary.sourceQualityRows, 'All production source rows should pass source quality.')
  assert(productionGate.summary.capexGbp > 0, 'Production source-backed costing should populate CAPEX.')
  assert(csv.trim().split('\n').length === productionGate.summary.rows + 1, 'BoM costing CSV should contain one header plus one row per gate row.')

  console.log('BoM costing gate audit passed')
  console.log({
    unsourced: unsourcedGate.summary,
    protocol: protocolGate.summary,
    placeholder: placeholderGate.summary,
    production: productionGate.summary,
  })
}

function sourcingEvidenceForAllLines(
  result: ReportRunResult,
  mode: 'protocol' | 'placeholder' | 'production',
): SourcingEvidenceRecord[] {
  const seen = new Set<string>()
  const records: SourcingEvidenceRecord[] = []
  for (const [index, line] of result.dossier.bom.lines.entries()) {
    if (seen.has(line.componentWordId)) continue
    seen.add(line.componentWordId)
    const mpn = `${mode === 'production' ? 'PROD' : 'PROTOCOL'}-${index + 1}-${line.componentWordId.toUpperCase().replaceAll(/[^A-Z0-9]+/g, '-')}`
    const manufacturer = mode === 'production' ? 'Production Example Manufacturer' : 'Protocol Test Manufacturer'
    records.push({
      componentWordId: line.componentWordId,
      supplierName: mode === 'production' ? 'Production Example Supplier' : 'Protocol Test Supplier',
      manufacturer,
      mpn,
      unitCostGbp: 25 + index,
      leadTimeWeeks: 6 + (index % 4),
      sourceGrade: 'priced',
      evidence: {
        kind: 'source',
        ref: mode === 'production'
          ? `https://catalogue.acme-industrial.co.uk/${line.componentWordId}`
          : mode === 'placeholder'
            ? `https://example.com/catalogue/${line.componentWordId}`
            : `test-fixture://bom-costing/${line.componentWordId}`,
        quote: mode === 'production'
          ? `${manufacturer} catalogue row ${mpn} prices ${line.description}.`
          : `Protocol-only source evidence fixture for ${line.description}.`,
      },
      retrievedAt: '2026-05-17T20:40:00.000+01:00',
    })
  }
  return records
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
