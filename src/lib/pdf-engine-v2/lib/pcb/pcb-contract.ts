/**
 * @file PCB capability contracts — ENGINE-SIDE, Phase A + B (2026-07-12).
 * @description The evidence + disposition types `disposition.ts` needs, ported from
 * `prototypes/pcb-capability/pcb-contract.ts`. Phase B additionally ports the
 * board-geometry types (PcbPoint/PcbContour/PcbBoardGeometry/…) verbatim, now that
 * `pcb-outline.ts` has been ported engine-side alongside `atopile-generator.ts`
 * (which uses them to compute a component-area-derived board outline).
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

// ── Board geometry (Phase B, ported verbatim from prototypes/pcb-capability/pcb-contract.ts) ──

export interface PcbPoint {
  xMm: number
  yMm: number
}

export interface PcbLineSegment {
  kind: 'line'
  start: PcbPoint
  end: PcbPoint
}

export interface PcbArcSegment {
  kind: 'arc'
  start: PcbPoint
  mid: PcbPoint
  end: PcbPoint
}

export type PcbOutlineSegment = PcbLineSegment | PcbArcSegment

export interface PcbContour {
  id: string
  segments: PcbOutlineSegment[]
}

export interface PcbMountingHole {
  id: string
  center: PcbPoint
  diameterMm: number
  plated: boolean
}

export interface PcbBoardGeometry {
  /** The external closed board perimeter, expressed as ordered lines/arcs. */
  outline: PcbContour
  /** Internal routed openings expressed as additional closed Edge.Cuts contours. */
  cutouts: PcbContour[]
  /** Mechanical holes emitted as NPTH/PTH footprints rather than Edge.Cuts. */
  mountingHoles: PcbMountingHole[]
  source:
    | 'brief_dimensions'
    | 'enclosure_interface'
    | 'mechanical_cad'
    | 'derived'
  sourceDetail: string
}
