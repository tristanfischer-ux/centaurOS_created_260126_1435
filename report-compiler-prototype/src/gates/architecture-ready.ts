import { getClassPack } from '../class-packs'
import { issue } from '../schema/issues'
import type { ArchitectureReadiness, Module, ProductDossier, SectionIssue } from '../schema/types'
import { architectureContract } from '../sections/architecture'

export function evaluateArchitectureReadiness(dossier: ProductDossier): ArchitectureReadiness {
  const architectureIssues = architectureContract.validate(dossier.architecture, dossier)
  const blockingIssues = architectureIssues.filter(item => item.severity === 'blocker' || item.severity === 'major')
  const pack = getClassPack(dossier.productClass)
  const modulesById = new Map(dossier.architecture.modules.map(module => [module.id, module]))
  const requiredInterfaceLinks = pack.interfaceLinks.map(link => {
    const from = modulesById.get(link.fromModuleId)
    const to = modulesById.get(link.toModuleId)
    return {
      ...link,
      present: Boolean(from && to && moduleHasInterface(from, link.via) && moduleHasInterface(to, link.via)),
    }
  })

  return {
    readyForBom: blockingIssues.length === 0,
    moduleCount: dossier.architecture.modules.length,
    subModuleCount: dossier.architecture.modules.reduce((sum, module) => sum + module.subModules.length, 0),
    componentWordCount: dossier.architecture.modules.reduce(
      (sum, module) => sum + module.subModules.reduce((inner, subModule) => inner + subModule.words.length, 0),
      0,
    ),
    requiredInterfaceLinks,
    blockingIssues,
  }
}

export function architectureBomGateIssues(readiness: ArchitectureReadiness): SectionIssue[] {
  if (readiness.readyForBom) return []
  return [issue(
    'blocker',
    'architecture_not_ready_for_bom',
    `BoM review is blocked by ${readiness.blockingIssues.length} architecture issue(s).`,
    'bom',
    'Resolve module allocation and interface issues before scoring or reviewing the bill of materials.',
    'architecture',
  )]
}

function moduleHasInterface(module: Module, interfaceId: string): boolean {
  if (module.interfaces.includes(interfaceId)) return true
  return module.subModules.some(subModule => subModule.interfaces.includes(interfaceId))
}
