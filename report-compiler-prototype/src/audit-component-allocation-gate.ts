import { runReportCompiler } from './pipeline/run-report-compiler'
import {
  buildComponentAllocationGate,
  renderComponentAllocationGateCsv,
} from './scoring/component-allocation-gate'
import type { ProductDossier } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const initial = await runReportCompiler({ id: 'audit-component-allocation-initial', briefText: brief })
  const initialGate = buildComponentAllocationGate(initial.dossier)
  const initialCsv = renderComponentAllocationGateCsv(initialGate)

  assert(initialGate.verdict === 'allocation_ready', 'Initial BESS component allocation should be ready.')
  assert(initialGate.summary.subModules === initial.architectureReadiness.subModuleCount, 'Gate should emit one row per submodule.')
  assert(initialGate.summary.componentWords === initial.architectureReadiness.componentWordCount, 'Gate should count every component word.')
  assert(initialGate.summary.blockedSubModules === 0, 'Initial BESS should have no empty submodule allocation blockers.')
  assert(initialGate.summary.missingCriticalParts === 0, 'Initial BESS should allocate every class-critical part.')
  assert(initialGate.summary.criticalAllocationRatio === 1, 'Initial BESS critical allocation ratio should be 1.')
  assert(initialCsv.trim().split('\n').length === initialGate.summary.subModules + initialGate.summary.requiredCriticalParts + 1, 'Component allocation CSV should include submodule and critical-part rows.')

  const emptySubModule = removeFirstSubModuleComponents(initial.dossier)
  const emptyGate = buildComponentAllocationGate(emptySubModule)

  assert(emptyGate.verdict === 'allocation_blocked', 'Emptying a submodule should block component allocation.')
  assert(emptyGate.summary.blockedSubModules === 1, 'Exactly one submodule should be blocked after emptying it.')
  assert(emptyGate.blockers.some(blocker => blocker.includes('Submodule has no component candidates')), 'Blocked gate should name the empty-submodule problem.')

  const missingCritical = removeCriticalComponent(initial.dossier, 'lfp_prismatic_cells')
  const missingGate = buildComponentAllocationGate(missingCritical)

  assert(missingGate.verdict === 'allocation_blocked', 'Removing a critical component should block allocation.')
  assert(missingGate.criticalParts.some(row => row.componentWordId === 'lfp_prismatic_cells' && row.status === 'missing'), 'Missing critical LFP cell should be named.')

  const duplicate = duplicateBomComponentId(initial.dossier)
  const duplicateGate = buildComponentAllocationGate(duplicate)

  assert(duplicateGate.verdict === 'allocation_review_required', 'Duplicate component identities should require allocation review.')
  assert(duplicateGate.summary.duplicateComponentGroups === 1, 'Duplicate fixture should produce one duplicate group.')
  assert(duplicateGate.nextActions.some(action => action.includes('shared physical item')), 'Duplicate fixture should carry the canonical identity recommendation.')

  console.log('Component allocation gate audit passed')
  console.log({
    initial: initialGate.summary,
    emptySubModule: emptyGate.summary,
    missingCritical: missingGate.summary,
    duplicate: duplicateGate.summary,
  })
}

function removeFirstSubModuleComponents(dossier: ProductDossier): ProductDossier {
  const copy = clone(dossier)
  const firstModule = copy.architecture.modules[0]
  const firstSubModule = firstModule?.subModules[0]
  if (firstSubModule) firstSubModule.words = []
  return copy
}

function removeCriticalComponent(dossier: ProductDossier, componentWordId: string): ProductDossier {
  const copy = clone(dossier)
  for (const module of copy.architecture.modules) {
    for (const subModule of module.subModules) {
      subModule.words = subModule.words.filter(word => word.id !== componentWordId)
    }
  }
  return copy
}

function duplicateBomComponentId(dossier: ProductDossier): ProductDossier {
  const copy = clone(dossier)
  if (copy.bom.lines.length > 1) copy.bom.lines[1].componentWordId = copy.bom.lines[0].componentWordId
  return copy
}

function clone(dossier: ProductDossier): ProductDossier {
  return JSON.parse(JSON.stringify(dossier)) as ProductDossier
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
