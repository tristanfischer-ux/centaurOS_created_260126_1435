import type { SectionContract } from './contracts'
import type { ArchitectureModel } from '../schema/types'
import { issue } from '../schema/issues'
import { productClassCoverageIssues } from '../gates/product-class-coverage'
import { detectCrossDomainContamination } from '../validators/cross-domain'
import { validateEngineeringArchitecture } from '../validators/engineering-architecture'

export const architectureContract: SectionContract<ArchitectureModel> = {
  id: 'design_modules',
  title: 'Design Modules',
  select: dossier => dossier.architecture,
  minScoreInputs: {
    requiredFields: ['modules', 'subModules', 'interfaces'],
    requiredEvidenceCount: 12,
    fatalIfMissing: ['modules'],
  },
  validate(architecture, dossier) {
    const issues = [
      ...productClassCoverageIssues(dossier.productClass),
      ...detectCrossDomainContamination(dossier),
      ...validateEngineeringArchitecture(dossier),
    ]
    if (architecture.modules.length < 5) {
      issues.push(issue(
        'major',
        'too_few_modules',
        `Architecture has only ${architecture.modules.length} modules.`,
        'design_modules',
        'Generate the universal module set and explicitly exclude non-applicable modules.',
      ))
    }
    for (const module of architecture.modules) {
      if (module.subModules.length === 0) {
        issues.push(issue(
          'blocker',
          'empty_module',
          `${module.displayName} has no sub-modules.`,
          'design_modules',
          'Every included module needs at least one sub-module or should be excluded.',
          `architecture.modules.${module.id}`,
        ))
      }
    }
    return issues
  },
}
