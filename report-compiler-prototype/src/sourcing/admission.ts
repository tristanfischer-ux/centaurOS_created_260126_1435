import type { BomLine, BomModel, SourcingEvidenceRecord } from '../schema/types'
import { duplicateComponentIdSet } from './component-identity'

export interface SourcingAdmissionResult {
  bom: BomModel
  admitted: SourcingEvidenceRecord[]
  rejected: Array<{ componentWordId: string; reason: string }>
}

export function admitSourcingEvidence(bom: BomModel, records: SourcingEvidenceRecord[]): SourcingAdmissionResult {
  const byComponent = new Map(bom.lines.map(line => [line.componentWordId, line]))
  const duplicateIds = duplicateComponentIdSet(bom)
  const admitted: SourcingEvidenceRecord[] = []
  const rejected: Array<{ componentWordId: string; reason: string }> = []
  const nextLines = bom.lines.map(line => ({ ...line, provenance: [...line.provenance] }))

  for (const record of records) {
    const reason = validateRecord(record, byComponent, duplicateIds)
    if (reason) {
      rejected.push({ componentWordId: record.componentWordId, reason })
      continue
    }
    const lineIndex = nextLines.findIndex(line => line.componentWordId === record.componentWordId)
    if (lineIndex === -1) {
      rejected.push({ componentWordId: record.componentWordId, reason: 'No matching BoM line.' })
      continue
    }
    nextLines[lineIndex] = applyRecord(nextLines[lineIndex], record)
    admitted.push(record)
  }

  const totalCostGbp = nextLines.reduce((sum, line) => sum + (line.totalCostGbp ?? 0), 0)
  return {
    bom: {
      ...bom,
      lines: nextLines,
      totalCostGbp,
      coverage: {
        ...bom.coverage,
        pricedLines: nextLines.filter(line => line.unitCostGbp !== null).length,
        totalLines: nextLines.length,
      },
    },
    admitted,
    rejected,
  }
}

function validateRecord(record: SourcingEvidenceRecord, lines: Map<string, BomLine>, duplicateIds: Set<string>): string | null {
  if (!lines.has(record.componentWordId)) return 'No matching BoM componentWordId.'
  if (duplicateIds.has(record.componentWordId)) return 'componentWordId matches multiple BoM allocation lines; resolve canonical component allocation before admitting source evidence.'
  if (!record.supplierName.trim()) return 'Missing supplier name.'
  if (!record.manufacturer?.trim()) return 'Missing manufacturer.'
  if (!record.mpn?.trim()) return 'Missing MPN.'
  if (!Number.isFinite(record.unitCostGbp) || record.unitCostGbp <= 0) return 'Unit cost must be a positive GBP number.'
  if (!record.evidence.ref.trim()) return 'Missing evidence reference.'
  if (record.evidence.kind !== 'source') return 'Sourcing evidence must use provenance kind "source".'
  if (!record.evidence.quote?.trim()) return 'Missing source quote or evidence note.'
  if (!record.retrievedAt.trim()) return 'Missing retrieval timestamp.'
  return null
}

function applyRecord(line: BomLine, record: SourcingEvidenceRecord): BomLine {
  const total = record.unitCostGbp * line.quantity.value
  return {
    ...line,
    unitCostGbp: record.unitCostGbp,
    totalCostGbp: total,
    sourceGrade: record.sourceGrade,
    supplier: record.supplierName,
    manufacturer: record.manufacturer,
    mpn: record.mpn,
    leadTimeWeeks: record.leadTimeWeeks,
    provenance: [...line.provenance, record.evidence],
  }
}
