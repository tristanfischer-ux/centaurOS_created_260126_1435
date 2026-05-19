import type { ArchitectureReadiness, Module, ProductDossier, SubModule } from '../schema/types'

export type InterfaceContractStatus = 'present' | 'missing'
export type SharedInterfaceStatus = 'shared' | 'local_only'

export interface InterfaceEndpoint {
  moduleId: string
  moduleName: string
  moduleDeclaresInterface: boolean
  carrierSubModules: Array<{
    subModuleId: string
    subModuleName: string
    componentWordIds: string[]
  }>
}

export interface InterfaceContractRow {
  id: string
  interfaceId: string
  status: InterfaceContractStatus
  from: InterfaceEndpoint
  to: InterfaceEndpoint
  engineeringReason: string
  notes: string[]
}

export interface SharedInterfaceRow {
  interfaceId: string
  status: SharedInterfaceStatus
  moduleIds: string[]
  moduleNames: string[]
  carrierSubModuleCount: number
}

export interface InterfaceContractMatrix {
  summary: {
    requiredContracts: number
    presentContracts: number
    missingContracts: number
    sharedInterfaces: number
    localOnlyInterfaces: number
  }
  requiredContracts: InterfaceContractRow[]
  sharedInterfaces: SharedInterfaceRow[]
}

export function buildInterfaceContractMatrix(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
): InterfaceContractMatrix {
  const modulesById = new Map(dossier.architecture.modules.map(module => [module.id, module]))
  const requiredContracts = readiness.requiredInterfaceLinks.map(link => {
    const fromModule = modulesById.get(link.fromModuleId)
    const toModule = modulesById.get(link.toModuleId)
    const from = endpointFor(fromModule, link.fromModuleId, link.via)
    const to = endpointFor(toModule, link.toModuleId, link.via)
    const status: InterfaceContractStatus = link.present ? 'present' : 'missing'
    return {
      id: `required:${link.fromModuleId}:${link.toModuleId}:${link.via}`,
      interfaceId: link.via,
      status,
      from,
      to,
      engineeringReason: link.reason,
      notes: notesForContract(status, from, to),
    }
  })

  const sharedInterfaces = dossier.architecture.crossModuleInterfaces.map(interfaceId => {
    const carriers = dossier.architecture.modules
      .filter(module => moduleHasInterface(module, interfaceId))
    const carrierSubModuleCount = carriers.reduce(
      (sum, module) => sum + module.subModules.filter(subModule => subModule.interfaces.includes(interfaceId)).length,
      0,
    )
    const status: SharedInterfaceStatus = carriers.length > 1 ? 'shared' : 'local_only'
    return {
      interfaceId,
      status,
      moduleIds: carriers.map(module => module.id),
      moduleNames: carriers.map(module => module.displayName),
      carrierSubModuleCount,
    }
  }).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'local_only' ? -1 : 1
    return a.interfaceId.localeCompare(b.interfaceId)
  })

  return {
    summary: {
      requiredContracts: requiredContracts.length,
      presentContracts: requiredContracts.filter(contract => contract.status === 'present').length,
      missingContracts: requiredContracts.filter(contract => contract.status === 'missing').length,
      sharedInterfaces: sharedInterfaces.filter(row => row.status === 'shared').length,
      localOnlyInterfaces: sharedInterfaces.filter(row => row.status === 'local_only').length,
    },
    requiredContracts,
    sharedInterfaces,
  }
}

function endpointFor(module: Module | undefined, fallbackModuleId: string, interfaceId: string): InterfaceEndpoint {
  return {
    moduleId: module?.id ?? fallbackModuleId,
    moduleName: module?.displayName ?? fallbackModuleId,
    moduleDeclaresInterface: Boolean(module?.interfaces.includes(interfaceId)),
    carrierSubModules: carrierSubModules(module, interfaceId),
  }
}

function carrierSubModules(module: Module | undefined, interfaceId: string): InterfaceEndpoint['carrierSubModules'] {
  if (!module) return []
  return module.subModules
    .filter(subModule => subModule.interfaces.includes(interfaceId))
    .map(subModule => ({
      subModuleId: subModule.id,
      subModuleName: subModule.name,
      componentWordIds: componentIds(subModule),
    }))
}

function componentIds(subModule: SubModule): string[] {
  return subModule.words.map(word => word.id)
}

function moduleHasInterface(module: Module, interfaceId: string): boolean {
  if (module.interfaces.includes(interfaceId)) return true
  return module.subModules.some(subModule => subModule.interfaces.includes(interfaceId))
}

function notesForContract(
  status: InterfaceContractStatus,
  from: InterfaceEndpoint,
  to: InterfaceEndpoint,
): string[] {
  if (status === 'missing') {
    const missing = [
      from.moduleDeclaresInterface || from.carrierSubModules.length > 0 ? undefined : from.moduleName,
      to.moduleDeclaresInterface || to.carrierSubModules.length > 0 ? undefined : to.moduleName,
    ].filter(Boolean)
    return missing.length === 0
      ? ['Contract is marked missing by readiness gate; inspect module-level and submodule declarations.']
      : [`Missing interface declaration on ${missing.join(' and ')}.`]
  }
  if (from.carrierSubModules.length === 0 || to.carrierSubModules.length === 0) {
    return ['Interface exists at module level; add submodule carrier detail before design freeze.']
  }
  return ['Both endpoints expose the required interface through at least one submodule carrier.']
}
