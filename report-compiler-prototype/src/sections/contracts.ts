import type { ProductDossier, PdfSectionId, SectionIssue } from '../schema/types'
import { briefRequirementsContract } from './brief-requirements'
import { bomContract } from './bom'
import { executiveSummaryContract } from './executive-summary'
import { feasibilityContract } from './feasibility'
import { architectureContract } from './architecture'
import { sourcesContract } from './sources'

export interface SectionContract<TSlice> {
  id: PdfSectionId
  title: string
  select(dossier: ProductDossier): TSlice
  validate(slice: TSlice, dossier: ProductDossier): SectionIssue[]
  minScoreInputs: {
    requiredFields: string[]
    requiredEvidenceCount: number
    fatalIfMissing: string[]
  }
}

export const SECTION_CONTRACTS: SectionContract<unknown>[] = [
  executiveSummaryContract,
  briefRequirementsContract,
  architectureContract,
  bomContract,
  feasibilityContract,
  sourcesContract,
]

export function validateDossier(dossier: ProductDossier): SectionIssue[] {
  return SECTION_CONTRACTS.flatMap(contract => {
    const slice = contract.select(dossier)
    return contract.validate(slice, dossier)
  })
}
