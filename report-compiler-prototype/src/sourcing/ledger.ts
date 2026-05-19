import type { BomLine, ProductDossier, SourcingEvidenceRecord } from '../schema/types'
import { type DuplicateComponentAllocation, findDuplicateComponentAllocations } from './component-identity'

export type SourcingLineLedgerStatus =
  | 'admitted_priced'
  | 'critical_unpriced'
  | 'candidate_unpriced'
  | 'rejected_evidence'

export interface SourcingLineLedgerRow {
  lineId: string
  componentWordId: string
  description: string
  duplicateGroupSize: number
  duplicatePeerLineIds: string[]
  duplicateResolution: 'unique_allocation' | 'canonical_review_required'
  priority: 'critical' | 'candidate'
  ledgerStatus: SourcingLineLedgerStatus
  quantity: number
  unit: string
  unitCostGbp: number | null
  totalCostGbp: number | null
  supplier?: string
  manufacturer?: string
  mpn?: string
  leadTimeWeeks?: number
  sourceGrade: BomLine['sourceGrade']
  evidenceRef?: string
  evidenceQuote?: string
  retrievedAt?: string
  rejectionReasons: string[]
  nextAction: string
}

export interface SourcingLineLedger {
  summary: {
    bomLines: number
    criticalLines: number
    admittedPricedLines: number
    criticalPricedLines: number
    unpricedLines: number
    criticalUnpricedLines: number
    candidateUnpricedLines: number
    rejectedEvidenceRecords: number
    distinctComponentWordIds: number
    duplicateComponentGroups: number
    duplicateAllocatedLines: number
    duplicateCriticalComponentGroups: number
    pricedLineRatio: number
    criticalCoverageRatio: number
  }
  rows: SourcingLineLedgerRow[]
}

export function buildSourcingLineLedger(dossier: ProductDossier): SourcingLineLedger {
  const evidenceByComponent = latestEvidenceByComponent(dossier.sources.sourcingEvidence)
  const duplicateGroups = findDuplicateComponentAllocations(dossier.bom)
  const duplicateByComponent = new Map(duplicateGroups.map(group => [group.componentWordId, group]))
  const rejectionReasons = new Map<string, string[]>()
  for (const rejection of dossier.sourcing.admission.rejectedRecords) {
    const existing = rejectionReasons.get(rejection.componentWordId) ?? []
    existing.push(rejection.reason)
    rejectionReasons.set(rejection.componentWordId, existing)
  }

  const rows = dossier.bom.lines.map(line => {
    const evidence = evidenceByComponent.get(line.componentWordId)
    const reasons = rejectionReasons.get(line.componentWordId) ?? []
    return rowFromLine(line, evidence, reasons, duplicateByComponent.get(line.componentWordId))
  })
  const criticalLines = rows.filter(row => row.priority === 'critical').length
  const admittedPricedLines = rows.filter(row => row.ledgerStatus === 'admitted_priced').length
  const criticalPricedLines = rows.filter(row => row.priority === 'critical' && row.ledgerStatus === 'admitted_priced').length
  const unpricedLines = rows.filter(row => row.unitCostGbp === null).length
  const criticalUnpricedLines = rows.filter(row => row.priority === 'critical' && row.unitCostGbp === null).length
  const candidateUnpricedLines = rows.filter(row => row.priority === 'candidate' && row.unitCostGbp === null).length

  return {
    summary: {
      bomLines: rows.length,
      criticalLines,
      admittedPricedLines,
      criticalPricedLines,
      unpricedLines,
      criticalUnpricedLines,
      candidateUnpricedLines,
      rejectedEvidenceRecords: dossier.sourcing.admission.rejectedRecords.length,
      distinctComponentWordIds: new Set(rows.map(row => row.componentWordId)).size,
      duplicateComponentGroups: duplicateGroups.length,
      duplicateAllocatedLines: duplicateGroups.reduce((sum, group) => sum + group.lineCount, 0),
      duplicateCriticalComponentGroups: duplicateGroups.filter(group => group.criticalLineIds.length > 0).length,
      pricedLineRatio: ratio(admittedPricedLines, rows.length),
      criticalCoverageRatio: ratio(criticalPricedLines, criticalLines),
    },
    rows,
  }
}

export function renderSourcingLineLedgerCsv(ledger: SourcingLineLedger): string {
  const header = [
    'lineId',
    'componentWordId',
    'description',
    'duplicateGroupSize',
    'duplicatePeerLineIds',
    'duplicateResolution',
    'priority',
    'ledgerStatus',
    'quantity',
    'unit',
    'unitCostGbp',
    'totalCostGbp',
    'supplier',
    'manufacturer',
    'mpn',
    'leadTimeWeeks',
    'sourceGrade',
    'evidenceRef',
    'evidenceQuote',
    'retrievedAt',
    'rejectionReasons',
    'nextAction',
  ]
  const rows = ledger.rows.map(row => [
    row.lineId,
    row.componentWordId,
    row.description,
    String(row.duplicateGroupSize),
    row.duplicatePeerLineIds.join('; '),
    row.duplicateResolution,
    row.priority,
    row.ledgerStatus,
    String(row.quantity),
    row.unit,
    row.unitCostGbp === null ? '' : String(row.unitCostGbp),
    row.totalCostGbp === null ? '' : String(row.totalCostGbp),
    row.supplier ?? '',
    row.manufacturer ?? '',
    row.mpn ?? '',
    row.leadTimeWeeks === undefined ? '' : String(row.leadTimeWeeks),
    row.sourceGrade,
    row.evidenceRef ?? '',
    row.evidenceQuote ?? '',
    row.retrievedAt ?? '',
    row.rejectionReasons.join('; '),
    row.nextAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function rowFromLine(
  line: BomLine,
  evidence: SourcingEvidenceRecord | undefined,
  rejectionReasons: string[],
  duplicateGroup: DuplicateComponentAllocation | undefined,
): SourcingLineLedgerRow {
  const priority = line.critical ? 'critical' : 'candidate'
  const ledgerStatus = statusForLine(line, rejectionReasons)
  return {
    lineId: line.id,
    componentWordId: line.componentWordId,
    description: line.description,
    duplicateGroupSize: duplicateGroup?.lineCount ?? 1,
    duplicatePeerLineIds: duplicateGroup?.lineIds.filter(lineId => lineId !== line.id) ?? [],
    duplicateResolution: duplicateGroup ? 'canonical_review_required' : 'unique_allocation',
    priority,
    ledgerStatus,
    quantity: line.quantity.value,
    unit: line.quantity.unit,
    unitCostGbp: line.unitCostGbp,
    totalCostGbp: line.totalCostGbp,
    supplier: line.supplier ?? evidence?.supplierName,
    manufacturer: line.manufacturer ?? evidence?.manufacturer,
    mpn: line.mpn ?? evidence?.mpn,
    leadTimeWeeks: line.leadTimeWeeks ?? evidence?.leadTimeWeeks,
    sourceGrade: line.sourceGrade,
    evidenceRef: evidence?.evidence.ref,
    evidenceQuote: evidence?.evidence.quote,
    retrievedAt: evidence?.retrievedAt,
    rejectionReasons,
    nextAction: duplicateGroup ? actionForDuplicateGroup() : actionForStatus(ledgerStatus),
  }
}

function statusForLine(line: BomLine, rejectionReasons: string[]): SourcingLineLedgerStatus {
  if (line.unitCostGbp !== null) return 'admitted_priced'
  if (rejectionReasons.length > 0) return 'rejected_evidence'
  return line.critical ? 'critical_unpriced' : 'candidate_unpriced'
}

function actionForStatus(status: SourcingLineLedgerStatus): string {
  if (status === 'admitted_priced') return 'Keep source record attached; re-check freshness before procurement use.'
  if (status === 'rejected_evidence') return 'Fix rejected evidence fields and re-run sourcing intake.'
  if (status === 'critical_unpriced') return 'Collect admissible supplier/manufacturer/MPN/unit-cost evidence before BoM can pass.'
  return 'Source after critical lines or when detailed procurement planning starts.'
}

function actionForDuplicateGroup(): string {
  return 'Resolve duplicate component identity before sourcing: decide whether this is one shared physical item or separate allocated lines.'
}

function latestEvidenceByComponent(records: SourcingEvidenceRecord[]): Map<string, SourcingEvidenceRecord> {
  const map = new Map<string, SourcingEvidenceRecord>()
  for (const record of records) {
    const existing = map.get(record.componentWordId)
    if (!existing || record.retrievedAt >= existing.retrievedAt) map.set(record.componentWordId, record)
  }
  return map
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 10000) / 10000
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
