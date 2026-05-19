import type { BomLine, BomModel } from '../schema/types'

export interface DuplicateComponentAllocation {
  componentWordId: string
  descriptions: string[]
  lineIds: string[]
  criticalLineIds: string[]
  quantityByUnit: Array<{ unit: string; quantity: number }>
  lineCount: number
  recommendation: string
}

export interface ComponentIdentityWorklist {
  summary: {
    bomLines: number
    distinctComponentWordIds: number
    duplicateComponentGroups: number
    duplicateAllocatedLines: number
    duplicateCriticalComponentGroups: number
    canonicalReviewRequired: boolean
  }
  groups: DuplicateComponentAllocation[]
}

export function buildComponentIdentityWorklist(bom: BomModel): ComponentIdentityWorklist {
  const groups = findDuplicateComponentAllocations(bom)
  return {
    summary: {
      bomLines: bom.lines.length,
      distinctComponentWordIds: new Set(bom.lines.map(line => line.componentWordId)).size,
      duplicateComponentGroups: groups.length,
      duplicateAllocatedLines: groups.reduce((sum, group) => sum + group.lineCount, 0),
      duplicateCriticalComponentGroups: groups.filter(group => group.criticalLineIds.length > 0).length,
      canonicalReviewRequired: groups.length > 0,
    },
    groups,
  }
}

export function findDuplicateComponentAllocations(bom: BomModel): DuplicateComponentAllocation[] {
  const groups = new Map<string, BomLine[]>()
  for (const line of bom.lines) {
    const existing = groups.get(line.componentWordId) ?? []
    existing.push(line)
    groups.set(line.componentWordId, existing)
  }

  return Array.from(groups.entries())
    .filter(([, lines]) => lines.length > 1)
    .map(([componentWordId, lines]) => ({
      componentWordId,
      descriptions: unique(lines.map(line => line.description)),
      lineIds: lines.map(line => line.id),
      criticalLineIds: lines.filter(line => line.critical).map(line => line.id),
      quantityByUnit: quantityByUnit(lines),
      lineCount: lines.length,
      recommendation: 'Resolve whether these allocations are one shared physical item or separate install locations before sourcing, costing or deduplicating.',
    }))
    .sort((a, b) => a.componentWordId.localeCompare(b.componentWordId))
}

export function duplicateComponentIdSet(bom: BomModel): Set<string> {
  return new Set(findDuplicateComponentAllocations(bom).map(group => group.componentWordId))
}

export function renderComponentIdentityWorklistCsv(worklist: ComponentIdentityWorklist): string {
  const header = [
    'componentWordId',
    'lineCount',
    'criticalLineCount',
    'descriptions',
    'lineIds',
    'criticalLineIds',
    'quantityByUnit',
    'recommendation',
  ]
  const rows = worklist.groups.map(group => [
    group.componentWordId,
    String(group.lineCount),
    String(group.criticalLineIds.length),
    group.descriptions.join('; '),
    group.lineIds.join('; '),
    group.criticalLineIds.join('; '),
    group.quantityByUnit.map(item => `${item.quantity} ${item.unit}`).join('; '),
    group.recommendation,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function quantityByUnit(lines: BomLine[]): Array<{ unit: string; quantity: number }> {
  const quantities = new Map<string, number>()
  for (const line of lines) {
    quantities.set(line.quantity.unit, (quantities.get(line.quantity.unit) ?? 0) + line.quantity.value)
  }
  return Array.from(quantities.entries())
    .map(([unit, quantity]) => ({ unit, quantity }))
    .sort((a, b) => a.unit.localeCompare(b.unit))
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
