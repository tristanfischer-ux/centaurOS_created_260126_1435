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

import type { CadLabModule, AiCostEstimate, CadLabDesignBrief } from '@/lib/cad-lab-types'

export type DesignReportFormat = 'docx' | 'pptx' | 'pdf'

export interface DesignReportSource {
  title: string
  url: string
}

export interface DesignReportData {
  projectName: string
  generatedAt: string
  heroImageUrl: string | null

  productOverview: string
  researchReport: string
  sources: DesignReportSource[]
  designBrief: CadLabDesignBrief | null

  modules: CadLabModule[]
  diagnosticAnswers: Record<string, Record<string, string>>
  aiCostEstimates: Record<string, AiCostEstimate>

  researchModelUsed: string | null
  decompositionModelUsed: string | null
}
