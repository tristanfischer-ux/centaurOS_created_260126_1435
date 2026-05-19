import { runReportCompiler } from './pipeline/run-report-compiler'
import type { SourcingEvidenceRecord } from './schema/types'
import { buildComponentIdentityWorklist, renderComponentIdentityWorklistCsv } from './sourcing/component-identity'
import { buildSourcingLineLedger, renderSourcingLineLedgerCsv } from './sourcing/ledger'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'
const evChargerBrief = 'Design a 150 kW DC fast EV charger with CCS2 liquid-cooled cable, OCPP backend, ISO 15118 PLC communication, MID metering and insulation monitoring.'

async function main(): Promise<void> {
  const unsourced = await runReportCompiler({ id: 'audit-sourcing-ledger-unsourced', briefText: brief })
  const unsourcedLedger = buildSourcingLineLedger(unsourced.dossier)
  const sourced = await runReportCompiler({
    id: 'audit-sourcing-ledger-protocol',
    briefText: brief,
    sourcingEvidence: [invalidRecord(), validProtocolRecord()],
  })
  const sourcedLedger = buildSourcingLineLedger(sourced.dossier)
  const evCharger = await runReportCompiler({ id: 'audit-sourcing-ledger-ev-charger', briefText: evChargerBrief })
  const evChargerLedger = buildSourcingLineLedger(evCharger.dossier)
  const evChargerIdentity = buildComponentIdentityWorklist(evCharger.dossier.bom)
  const evChargerIdentityCsv = renderComponentIdentityWorklistCsv(evChargerIdentity)
  const ambiguousEvSource = await runReportCompiler({
    id: 'audit-sourcing-ledger-ev-ambiguous-source',
    briefText: evChargerBrief,
    sourcingEvidence: [ambiguousEvChargerRecord()],
  })
  const admittedRow = sourcedLedger.rows.find(row => row.componentWordId === 'lfp_prismatic_cells')
  const duplicateIsoRows = evChargerLedger.rows.filter(row => row.componentWordId === 'iso_15118_plc_modem')
  const csv = renderSourcingLineLedgerCsv(sourcedLedger)

  assert(unsourcedLedger.summary.bomLines === unsourced.dossier.bom.lines.length, 'Ledger should include every BoM candidate line.')
  assert(unsourcedLedger.summary.admittedPricedLines === 0, 'Unsourced ledger must not admit any priced lines.')
  assert(unsourcedLedger.summary.criticalUnpricedLines === unsourced.dossier.sourcing.admission.unpricedCriticalLines, 'Unsourced ledger should mirror critical unpriced count.')
  assert(sourcedLedger.summary.admittedPricedLines === 1, 'Protocol ledger should show one admitted priced line.')
  assert(sourcedLedger.summary.criticalCoverageRatio > unsourcedLedger.summary.criticalCoverageRatio, 'Protocol evidence should improve critical coverage.')
  assert(sourcedLedger.summary.rejectedEvidenceRecords === 1, 'Protocol ledger should preserve rejected evidence count.')
  assert(sourcedLedger.summary.duplicateComponentGroups === 0, 'BESS protocol fixture should not contain duplicate component IDs.')
  assert(evChargerLedger.summary.duplicateComponentGroups === 3, 'EV charger should surface its duplicated canonical component IDs.')
  assert(evChargerLedger.summary.duplicateAllocatedLines === 6, 'EV charger duplicate groups should account for six allocated rows.')
  assert(evChargerIdentity.summary.canonicalReviewRequired, 'EV charger component identity worklist should require canonical review.')
  assert(evChargerIdentity.groups.some(group => group.componentWordId === 'mid_energy_meter'), 'EV charger identity worklist should include the duplicated MID meter.')
  assert(evChargerIdentityCsv.trim().split('\n').length === evChargerIdentity.groups.length + 1, 'Component identity CSV should contain one header plus one row per duplicate group.')
  assert(duplicateIsoRows.length === 2, 'EV charger should show both ISO 15118 PLC modem allocations.')
  assert(duplicateIsoRows.every(row => row.duplicateResolution === 'canonical_review_required'), 'Duplicate ISO 15118 allocations should require canonical review.')
  assert(
    ambiguousEvSource.dossier.sourcing.admission.rejectedRecords.some(record => record.reason.includes('multiple BoM allocation lines')),
    'Sourcing evidence for a duplicated componentWordId should be rejected as ambiguous.',
  )
  assert(admittedRow?.supplier === 'Protocol Test Supplier', 'Admitted ledger row should carry supplier from source evidence.')
  assert(admittedRow?.manufacturer === 'Protocol Test Manufacturer', 'Admitted ledger row should carry manufacturer from source evidence.')
  assert(admittedRow?.mpn === 'PROTOCOL-ONLY-NOT-A-REAL-PART', 'Admitted ledger row should carry MPN from source evidence.')
  assert(admittedRow?.evidenceRef === 'test-fixture://sourcing-ledger/lfp-prismatic-cells', 'Admitted ledger row should carry evidence reference.')
  assert(csv.trim().split('\n').length === sourced.dossier.bom.lines.length + 1, 'Sourcing ledger CSV should contain one header plus one row per BoM line.')

  console.log('Sourcing line ledger audit passed')
  console.log({
    unsourced: unsourcedLedger.summary,
    protocol: sourcedLedger.summary,
    admittedRow: {
      componentWordId: admittedRow?.componentWordId,
      status: admittedRow?.ledgerStatus,
      supplier: admittedRow?.supplier,
      manufacturer: admittedRow?.manufacturer,
      mpn: admittedRow?.mpn,
      evidenceRef: admittedRow?.evidenceRef,
    },
    csvRows: csv.trim().split('\n').length,
    evChargerDuplicates: {
      summary: evChargerLedger.summary,
      isoRows: duplicateIsoRows.map(row => ({ lineId: row.lineId, duplicateGroupSize: row.duplicateGroupSize, nextAction: row.nextAction })),
      ambiguousSourceRejected: ambiguousEvSource.dossier.sourcing.admission.rejectedRecords,
      identityCsvRows: evChargerIdentityCsv.trim().split('\n').length,
    },
  })
}

function invalidRecord(): SourcingEvidenceRecord {
  return {
    componentWordId: 'lfp_prismatic_cells',
    supplierName: '',
    manufacturer: 'Protocol Test Manufacturer',
    mpn: 'PROTOCOL-ONLY-NOT-A-REAL-PART',
    unitCostGbp: 75,
    sourceGrade: 'priced',
    evidence: {
      kind: 'source',
      ref: 'test-fixture://sourcing-ledger/invalid',
      quote: 'Protocol-only invalid fixture. Not a real supplier quote.',
    },
    retrievedAt: '2026-05-16T04:40:00.000+01:00',
  }
}

function validProtocolRecord(): SourcingEvidenceRecord {
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
      ref: 'test-fixture://sourcing-ledger/lfp-prismatic-cells',
      quote: 'Protocol-only fixture proving ledger provenance. Not a real supplier quote.',
    },
    retrievedAt: '2026-05-16T04:40:00.000+01:00',
  }
}

function ambiguousEvChargerRecord(): SourcingEvidenceRecord {
  return {
    componentWordId: 'iso_15118_plc_modem',
    supplierName: 'Protocol Test Supplier',
    manufacturer: 'Protocol Test Manufacturer',
    mpn: 'PROTOCOL-ONLY-NOT-A-REAL-PART',
    unitCostGbp: 42,
    leadTimeWeeks: 8,
    sourceGrade: 'priced',
    evidence: {
      kind: 'source',
      ref: 'test-fixture://sourcing-ledger/ambiguous-iso-15118-plc-modem',
      quote: 'Protocol-only fixture proving duplicate component IDs require canonical allocation review. Not a real supplier quote.',
    },
    retrievedAt: '2026-05-16T09:40:00.000+01:00',
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
