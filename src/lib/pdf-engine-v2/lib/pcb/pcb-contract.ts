/**
 * @file PCB capability contracts — ENGINE-SIDE, Phase A subset (2026-07-12).
 * @description The evidence + disposition types `disposition.ts` needs, ported from
 * `prototypes/pcb-capability/pcb-contract.ts`. Phase A only ports the disposition-policy
 * slice; the board-geometry types (PcbPoint/PcbContour/PcbBoardGeometry/…) stay in the
 * prototype contract alongside `pcb-outline.ts` — both are Phase B's concern once the
 * atopile project generator needs to emit Edge.Cuts. Do not duplicate geometry types
 * here until Phase B actually ports `pcb-outline.ts`.
 */

export type PcbDisposition =
  | 'not_applicable'
  | 'catalogue_component'
  | 'catalogue_module'
  | 'bespoke_candidate'
  | 'bespoke_required'
  | 'unresolved'

export type CatalogueResolution =
  | 'confirmed_finished_module'
  | 'confirmed_component_only'
  | 'confirmed_no_finished_module'
  | 'not_checked'

export interface PcbCandidateEvidence {
  moduleId: string
  subModuleId: string
  wordId: string
  name: string
  characterId?: string
  characterType?: string
  form?: string
  manufacturer?: string
  partNumber?: string
  quantity: number
  parentIsPurchasedAssembly: boolean
  catalogueResolution: CatalogueResolution
  explicitCustomIntent: boolean
  explicitCotsIntent: boolean
  compactProductEnvelope: boolean
  customFormFactor: boolean
  multiFunctionIntegration: boolean
  safetySpecificIntegration: boolean
  rfOrHighSpeedLayout: boolean
  repeatedApplicationSpecificBoard: boolean
}

export interface PcbDispositionDecision {
  disposition: PcbDisposition
  reasons: string[]
  requiresKiCadDeliverable: boolean
  confidence: 'high' | 'medium' | 'low'
}
