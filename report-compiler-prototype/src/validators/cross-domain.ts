import type { ProductDossier, SectionIssue } from '../schema/types'
import { issue } from '../schema/issues'
import { getClassPack } from '../class-packs'

export function detectCrossDomainContamination(dossier: ProductDossier): SectionIssue[] {
  const pack = getClassPack(dossier.productClass)
  const combined = [
    dossier.brief.productName,
    ...dossier.architecture.modules.map(m => `${m.displayName} ${m.purpose}`),
    ...dossier.architecture.modules.flatMap(m => m.subModules.map(s => `${s.name} ${s.purpose}`)),
  ].join('\n').toLowerCase()

  return pack.prohibitedTerms
    .filter(term => combined.includes(term.toLowerCase()))
    .map(term => issue(
      'blocker',
      'cross_domain_contamination',
      `Found prohibited ${dossier.productClass} term: "${term}".`,
      'design_modules',
      'Regenerate or patch the contaminated module text using the correct class pack.',
    ))
}

