import type { SectionContract } from './contracts'
import type { BomModel } from '../schema/types'
import { validateBomCoverage } from '../validators/bom-coverage'
import { validateBomProvenance } from '../validators/provenance'

export const bomContract: SectionContract<BomModel> = {
  id: 'bom',
  title: 'Bill of Materials',
  select: dossier => dossier.bom,
  minScoreInputs: {
    requiredFields: ['lines', 'totalCostGbp', 'coverage'],
    requiredEvidenceCount: 30,
    fatalIfMissing: ['criticalParts', 'costs', 'quantities'],
  },
  validate(bom, dossier) {
    return [
      ...validateBomCoverage(bom, dossier.productClass),
      ...validateBomProvenance(bom),
    ]
  },
}

