import { getClassPack } from '../class-packs'
import { issue } from '../schema/issues'
import type { Module, ProductDossier, SectionIssue } from '../schema/types'

export function validateEngineeringArchitecture(dossier: ProductDossier): SectionIssue[] {
  const pack = getClassPack(dossier.productClass)
  const architecture = dossier.architecture
  const issues: SectionIssue[] = []
  const modulesById = new Map(architecture.modules.map(module => [module.id, module]))
  const wordIds = new Set(architecture.modules.flatMap(module =>
    module.subModules.flatMap(subModule => subModule.words.map(word => word.id)),
  ))

  for (const template of pack.modules) {
    if (!modulesById.has(template.id)) {
      issues.push(issue(
        'blocker',
        'missing_required_module',
        `Architecture is missing required ${template.displayName} module.`,
        'design_modules',
        'Restore the class-pack functional module or explicitly change the class pack.',
        `architecture.modules.${template.id}`,
      ))
    }
  }

  for (const part of pack.requiredParts.filter(part => part.critical)) {
    if (!wordIds.has(normaliseId(part.label))) {
      issues.push(issue(
        'blocker',
        'critical_part_not_allocated_to_module',
        `${part.label} is a critical part but is not allocated to any sub-module.`,
        'design_modules',
        'Attach every critical part to a functional sub-module before reviewing the BoM.',
        `architecture.words.${normaliseId(part.label)}`,
      ))
    }
  }

  for (const module of architecture.modules) {
    if (module.interfaces.length === 0) {
      issues.push(issue(
        'major',
        'module_has_no_interfaces',
        `${module.displayName} has no declared interfaces.`,
        'design_modules',
        'Declare the electrical, mechanical, fluid, thermal, data or service interfaces for the module.',
        `architecture.modules.${module.id}.interfaces`,
      ))
    }
    for (const subModule of module.subModules) {
      if (subModule.words.length === 0) {
        issues.push(issue(
          'blocker',
          'submodule_has_no_components',
          `${module.displayName} / ${subModule.name} has no component words.`,
          'design_modules',
          'Allocate at least one component word or remove the sub-module from the design.',
          `architecture.modules.${module.id}.subModules.${subModule.id}.words`,
        ))
      }
    }
  }

  for (const link of pack.interfaceLinks) {
    const from = modulesById.get(link.fromModuleId)
    const to = modulesById.get(link.toModuleId)
    if (!from || !to) continue
    if (!moduleHasInterface(from, link.via) || !moduleHasInterface(to, link.via)) {
      issues.push(issue(
        'major',
        'missing_required_interface_link',
        `${from.displayName} and ${to.displayName} are not both connected by ${link.via}.`,
        'design_modules',
        link.reason,
        `architecture.interfaceLinks.${link.fromModuleId}.${link.toModuleId}.${link.via}`,
      ))
    }
  }

  return issues
}

function moduleHasInterface(module: Module, interfaceId: string): boolean {
  if (module.interfaces.includes(interfaceId)) return true
  return module.subModules.some(subModule => subModule.interfaces.includes(interfaceId))
}

function normaliseId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}
