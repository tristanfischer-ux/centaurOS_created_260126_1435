/**
 * @file design-report-types.ts
 *
 * @description Intermediate data shape for the downloadable design report.
 * Assembled from useCadLab() context before being passed to format-specific
 * exporters (DOCX, PPTX, PDF).
 *
 * @related
 * - src/lib/cad-lab-types.ts — CadLabModule, AiCostEstimate, VisualStyleSpec
 * - src/app/(platform)/the-forge/cad-lab/cad-lab-context.tsx — data source
 */

import type { CadLabModule, AiCostEstimate, CadLabDesignBrief, SpecialistReview, CadLabResult } from '@/lib/cad-lab-types'
import type { SupplierMatch } from '@/lib/rfq/matching'
import type { TechniqueRecommendation } from '@/lib/cad-lab/technique-recommender'

export type DesignReportFormat = 'docx' | 'pptx' | 'pdf'

export type ReportStage = 'concept' | 'specify' | 'source' | 'assemble' | 'cad'

export interface DesignReportSource {
  title: string
  url: string
}

/** Classified part for report export */
export interface ReportClassifiedPart {
  partName: string
  moduleName: string
  type: 'buy' | 'make'
  confidence: string
  reasons: string[]
}

export interface DesignReportData {
  projectName: string
  generatedAt: string
  heroImageUrl: string | null
  stage: ReportStage

  productOverview: string
  researchReport: string
  sources: DesignReportSource[]
  designBrief: CadLabDesignBrief | null

  modules: CadLabModule[]
  diagnosticAnswers: Record<string, Record<string, string>>
  aiCostEstimates: Record<string, AiCostEstimate>

  researchModelUsed: string | null
  decompositionModelUsed: string | null

  // Specify-stage extras
  moduleReviews?: Record<string, SpecialistReview[]>
  reviewSkipped?: boolean

  // Source-stage extras
  classifiedParts?: ReportClassifiedPart[]
  supplierMatches?: Record<string, SupplierMatch[]>
  techniqueRecommendations?: Record<string, TechniqueRecommendation[]>

  // Assemble-stage extras
  assemblyPartners?: { name: string; score: number; reasons: string[] }[]
  brandingNotes?: string
  shippingNotes?: string

  // CAD-stage extras
  unifiedCadResult?: CadLabResult | null
}
