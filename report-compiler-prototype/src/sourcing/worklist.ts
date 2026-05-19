import type { ProductDossier } from '../schema/types'

export interface SourcingWorklistItem {
  componentWordId: string
  description: string
  quantity: number
  unit: string
  priority: 'critical' | 'candidate'
  reason: string
}

export interface SourcingWorklist {
  status: 'not_started' | 'partial' | 'complete'
  criticalUnpriced: SourcingWorklistItem[]
  candidateUnpriced: SourcingWorklistItem[]
}

export function buildSourcingWorklist(dossier: ProductDossier): SourcingWorklist {
  const unpriced = dossier.bom.lines.filter(line => line.unitCostGbp === null)
  const criticalUnpriced = unpriced
    .filter(line => line.critical)
    .map(line => ({
      componentWordId: line.componentWordId,
      description: line.description,
      quantity: line.quantity.value,
      unit: line.quantity.unit,
      priority: 'critical' as const,
      reason: 'Required class-critical line must be sourced before BoM can pass.',
    }))
  const candidateUnpriced = unpriced
    .filter(line => !line.critical)
    .map(line => ({
      componentWordId: line.componentWordId,
      description: line.description,
      quantity: line.quantity.value,
      unit: line.quantity.unit,
      priority: 'candidate' as const,
      reason: 'Architecture candidate line can be sourced after critical lines.',
    }))
  return {
    status: dossier.sourcing.admission.status,
    criticalUnpriced,
    candidateUnpriced,
  }
}
