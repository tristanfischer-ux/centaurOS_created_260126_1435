import { getClassPack } from '../class-packs'
import type { ProductDossier } from '../schema/types'
import { buildComponentIdentityWorklist, duplicateComponentIdSet, type DuplicateComponentAllocation } from '../sourcing/component-identity'

export type ComponentAllocationVerdict =
  | 'allocation_ready'
  | 'allocation_review_required'
  | 'allocation_blocked'
  | 'no_components'

export type ComponentAllocationRowStatus = 'ready' | 'review' | 'blocked'
export type CriticalPartAllocationStatus = 'allocated' | 'missing'

export interface ComponentAllocationSubModuleRow {
  id: string
  moduleId: string
  moduleName: string
  subModuleId: string
  subModuleName: string
  purpose: string
  interfaces: string[]
  componentWordIds: string[]
  componentNames: string[]
  componentCount: number
  criticalComponentWordIds: string[]
  duplicateComponentWordIds: string[]
  status: ComponentAllocationRowStatus
  blockers: string[]
  requiredAction: string
}

export interface CriticalPartAllocationRow {
  componentWordId: string
  label: string
  allocated: boolean
  moduleIds: string[]
  subModuleIds: string[]
  status: CriticalPartAllocationStatus
  requiredAction: string
}

export interface ComponentAllocationGate {
  verdict: ComponentAllocationVerdict
  summary: {
    modules: number
    subModules: number
    componentWords: number
    readySubModules: number
    reviewSubModules: number
    blockedSubModules: number
    interfaceCarrierSubModules: number
    interfaceCarrierWithoutComponents: number
    requiredCriticalParts: number
    allocatedCriticalParts: number
    missingCriticalParts: number
    bomLines: number
    criticalBomLines: number
    duplicateComponentGroups: number
    duplicateCriticalComponentGroups: number
    allocationRatio: number
    criticalAllocationRatio: number
  }
  subModules: ComponentAllocationSubModuleRow[]
  criticalParts: CriticalPartAllocationRow[]
  duplicateGroups: DuplicateComponentAllocation[]
  blockers: string[]
  nextActions: string[]
}

export function buildComponentAllocationGate(dossier: ProductDossier): ComponentAllocationGate {
  const pack = getClassPack(dossier.productClass)
  const duplicateIds = duplicateComponentIdSet(dossier.bom)
  const identity = buildComponentIdentityWorklist(dossier.bom)
  const criticalComponentIds = new Set(dossier.bom.lines.filter(line => line.critical).map(line => line.componentWordId))
  const allocations = allocationIndex(dossier)

  const subModules = dossier.architecture.modules.flatMap(module => module.subModules.map(subModule => {
    const componentWordIds = subModule.words.map(word => word.id)
    const duplicateComponentWordIds = componentWordIds.filter(id => duplicateIds.has(id))
    const criticalComponentWordIds = componentWordIds.filter(id => criticalComponentIds.has(id))
    const blockers = [
      componentWordIds.length === 0 ? 'Submodule has no component candidates.' : undefined,
      subModule.interfaces.length > 0 && componentWordIds.length === 0 ? 'Interface carrier has no component candidates.' : undefined,
    ].filter(isString)
    const status: ComponentAllocationRowStatus = blockers.length > 0
      ? 'blocked'
      : duplicateComponentWordIds.length > 0 ? 'review' : 'ready'

    return {
      id: `${module.id}:${subModule.id}`,
      moduleId: module.id,
      moduleName: module.displayName,
      subModuleId: subModule.id,
      subModuleName: subModule.name,
      purpose: subModule.purpose,
      interfaces: subModule.interfaces,
      componentWordIds,
      componentNames: subModule.words.map(word => word.name),
      componentCount: componentWordIds.length,
      criticalComponentWordIds,
      duplicateComponentWordIds,
      status,
      blockers,
      requiredAction: actionForSubModule(status, duplicateComponentWordIds),
    } satisfies ComponentAllocationSubModuleRow
  }))

  const criticalParts = pack.requiredParts
    .filter(part => part.critical)
    .map(part => {
      const componentWordId = normaliseId(part.label)
      const allocation = allocations.get(componentWordId)
      const allocated = Boolean(allocation)
      return {
        componentWordId,
        label: part.label,
        allocated,
        moduleIds: allocation?.moduleIds ?? [],
        subModuleIds: allocation?.subModuleIds ?? [],
        status: allocated ? 'allocated' : 'missing',
        requiredAction: allocated
          ? 'Critical part is allocated to at least one architecture submodule.'
          : 'Allocate this critical part to a concrete submodule before BoM review.',
      } satisfies CriticalPartAllocationRow
    })

  const blockedSubModules = subModules.filter(row => row.status === 'blocked').length
  const reviewSubModules = subModules.filter(row => row.status === 'review').length
  const missingCriticalParts = criticalParts.filter(row => row.status === 'missing').length
  const verdict: ComponentAllocationVerdict = subModules.length === 0 || subModules.every(row => row.componentCount === 0)
    ? 'no_components'
    : blockedSubModules > 0 || missingCriticalParts > 0
      ? 'allocation_blocked'
      : reviewSubModules > 0 || identity.summary.duplicateComponentGroups > 0
        ? 'allocation_review_required'
        : 'allocation_ready'

  return {
    verdict,
    summary: {
      modules: dossier.architecture.modules.length,
      subModules: subModules.length,
      componentWords: subModules.reduce((sum, row) => sum + row.componentCount, 0),
      readySubModules: subModules.filter(row => row.status === 'ready').length,
      reviewSubModules,
      blockedSubModules,
      interfaceCarrierSubModules: subModules.filter(row => row.interfaces.length > 0).length,
      interfaceCarrierWithoutComponents: subModules.filter(row => row.interfaces.length > 0 && row.componentCount === 0).length,
      requiredCriticalParts: criticalParts.length,
      allocatedCriticalParts: criticalParts.filter(row => row.status === 'allocated').length,
      missingCriticalParts,
      bomLines: dossier.bom.lines.length,
      criticalBomLines: dossier.bom.lines.filter(line => line.critical).length,
      duplicateComponentGroups: identity.summary.duplicateComponentGroups,
      duplicateCriticalComponentGroups: identity.summary.duplicateCriticalComponentGroups,
      allocationRatio: ratio(subModules.filter(row => row.componentCount > 0).length, subModules.length),
      criticalAllocationRatio: ratio(criticalParts.filter(row => row.status === 'allocated').length, criticalParts.length),
    },
    subModules,
    criticalParts,
    duplicateGroups: identity.groups,
    blockers: [
      ...subModules
        .filter(row => row.status === 'blocked')
        .flatMap(row => row.blockers.map(blocker => `${row.id}: ${blocker}`)),
      ...criticalParts
        .filter(row => row.status === 'missing')
        .map(row => `${row.componentWordId}: ${row.requiredAction}`),
    ],
    nextActions: Array.from(new Set([
      ...subModules.filter(row => row.status !== 'ready').map(row => row.requiredAction),
      ...criticalParts.filter(row => row.status === 'missing').map(row => row.requiredAction),
      ...identity.groups.map(group => group.recommendation),
    ])),
  }
}

export function renderComponentAllocationGateCsv(gate: ComponentAllocationGate): string {
  const header = [
    'rowType',
    'id',
    'moduleId',
    'moduleName',
    'subModuleId',
    'subModuleName',
    'componentWordId',
    'label',
    'status',
    'interfaces',
    'componentWordIds',
    'criticalComponentWordIds',
    'duplicateComponentWordIds',
    'blockers',
    'requiredAction',
  ]
  const subModuleRows = gate.subModules.map(row => [
    'submodule',
    row.id,
    row.moduleId,
    row.moduleName,
    row.subModuleId,
    row.subModuleName,
    '',
    '',
    row.status,
    row.interfaces.join('; '),
    row.componentWordIds.join('; '),
    row.criticalComponentWordIds.join('; '),
    row.duplicateComponentWordIds.join('; '),
    row.blockers.join(' '),
    row.requiredAction,
  ])
  const criticalRows = gate.criticalParts.map(row => [
    'critical_part',
    row.componentWordId,
    row.moduleIds.join('; '),
    '',
    row.subModuleIds.join('; '),
    '',
    row.componentWordId,
    row.label,
    row.status,
    '',
    '',
    row.allocated ? row.componentWordId : '',
    '',
    row.status === 'missing' ? row.requiredAction : '',
    row.requiredAction,
  ])
  return [header, ...subModuleRows, ...criticalRows]
    .map(row => row.map(csvEscape).join(','))
    .join('\n') + '\n'
}

function allocationIndex(dossier: ProductDossier): Map<string, { moduleIds: string[]; subModuleIds: string[] }> {
  const map = new Map<string, { moduleIds: Set<string>; subModuleIds: Set<string> }>()
  for (const module of dossier.architecture.modules) {
    for (const subModule of module.subModules) {
      for (const word of subModule.words) {
        const existing = map.get(word.id) ?? { moduleIds: new Set<string>(), subModuleIds: new Set<string>() }
        existing.moduleIds.add(module.id)
        existing.subModuleIds.add(subModule.id)
        map.set(word.id, existing)
      }
    }
  }
  return new Map(Array.from(map.entries()).map(([id, allocation]) => [id, {
    moduleIds: Array.from(allocation.moduleIds).sort((a, b) => a.localeCompare(b)),
    subModuleIds: Array.from(allocation.subModuleIds).sort((a, b) => a.localeCompare(b)),
  }]))
}

function actionForSubModule(status: ComponentAllocationRowStatus, duplicateComponentWordIds: string[]): string {
  if (status === 'ready') return 'Submodule has component candidates and no allocation blocker.'
  if (status === 'review') return `Resolve duplicate component identity before sourcing: ${duplicateComponentWordIds.join(', ')}.`
  return 'Allocate at least one component candidate or remove the submodule from the architecture.'
}

function normaliseId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 1
  return Math.round((numerator / denominator) * 100) / 100
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string'
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
