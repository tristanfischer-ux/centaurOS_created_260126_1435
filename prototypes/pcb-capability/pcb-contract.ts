/**
 * @file PCB capability contracts (prototype only).
 * @description Defines the evidence, disposition, tool request, and manufacturability
 * result that a future engine integration can consume without depending on KiCad internals.
 *
 * This file is deliberately outside the engine. It is not imported by the chain.
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

export interface PcbNetClass {
  name: string
  traceWidthMm: number
  clearanceMm: number
  differentialImpedanceOhm?: number
  currentA?: number
}

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

export interface PcbDesignRequest {
  boardId: string
  purpose: string
  sourceSubModuleId: string
  inputRails: Array<{ name: string; voltageV: number; maximumCurrentA: number }>
  interfaces: string[]
  channelCount: number
  boardQuantity: number
  maximumWidthMm?: number
  maximumHeightMm?: number
  maximumThicknessMm?: number
  geometry: PcbBoardGeometry
  layerCount: 2 | 4 | 6 | 8
  netClasses: PcbNetClass[]
  standards: string[]
  environmentalRequirements: string[]
}

export interface PcbArtifactManifest {
  projectFile: string
  schematicFile: string
  boardFile: string
  gerberFiles: string[]
  drillFiles: string[]
  pickAndPlaceFiles: string[]
  bomFile: string
  schematicPdf?: string
  assemblyDrawing?: string
  stepModel?: string
  renders: string[]
}

export interface PcbVerificationResult {
  ercErrors: number
  drcErrors: number
  unconnectedItems: number
  shorts: number
  missingFootprints: string[]
  missingManufacturerParts: string[]
  artifactsComplete: boolean
  passed: boolean
}

export interface PcbDesignResult {
  request: PcbDesignRequest
  artifacts: PcbArtifactManifest
  verification: PcbVerificationResult
  componentCount: number
  netCount: number
  boardWidthMm: number
  boardHeightMm: number
  estimatedUnitCostGbp?: number
  toolVersions: Record<string, string>
  provenance: {
    generator: string
    inputHash: string
    generatedAt: string
  }
}
