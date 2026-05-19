import { issue } from '../schema/issues'
import type { ProductClass, SectionIssue } from '../schema/types'
import { isScratchArchitectureSupported } from '../scratch/universal-modules'

export function productClassCoverageIssues(productClass: ProductClass): SectionIssue[] {
  if (isScratchArchitectureSupported(productClass)) return []
  if (productClass === 'unknown') {
    return [issue(
      'blocker',
      'unknown_product_class',
      'The brief did not resolve to a supported product class, so the generic fallback cannot be treated as an engineering design.',
      'design_modules',
      'Classify the project into a supported product class or create a class-specific scratch grammar before using the report for design review.',
      'productClass',
    )]
  }
  return [issue(
    'blocker',
    'unsupported_product_class_deep_grammar',
    `${productClass} is classified, but the prototype has not yet implemented a deep scratch architecture grammar for this class.`,
    'design_modules',
    'Add a class-specific scratch grammar with modules, submodules, interfaces and component candidates before treating this report as design-ready.',
    'productClass',
  )]
}
