/**
 * @file design-report-types.ts
 *
 * @description Intermediate data shape for the downloadable design report.
 * Assembled from useCadLab() context before being passed to format-specific
 * exporters (DOCX, PPTX, PDF).
 *
 * Also defines the AI report pipeline types (ReportOutline, AiReportContent)
 * used by the two-phase Opus→Gemini narration flow.
 *
 * @related
 * - src/lib/cad-lab-types.ts — CadLabModule, AiCostEstimate, VisualStyleSpec
 * - src/app/(platform)/the-forge/cad-lab/cad-lab-context.tsx — data source
 * - src/actions/cad-lab-report.ts — AI report pipeline (structureReportOutline + writeReportSections)
 */

import type { CadLabModule, AiCostEstimate, CadLabDesignBrief, SpecialistReview, CadLabResult } from '@/lib/cad-lab-types'
import type { SupplierMatch } from '@/lib/rfq/matching'
import type { TechniqueRecommendation } from '@/lib/cad-lab/technique-recommender'

export type DesignReportFormat = 'docx' | 'pptx' | 'pdf'

export type ReportStage = 'concept' | 'specify' | 'source' | 'assemble' | 'cad' | 'journey'

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
  rfqQuotes?: { rfqTitle: string | null; quotes: { supplierName: string; price: number | null; timelineWeeks: number | null; proposalTitle: string | null }[] }

  // Assemble-stage extras
  assemblyPartners?: { name: string; score: number; reasons: string[] }[]
  brandingNotes?: string
  shippingNotes?: string

  // CAD-stage extras
  unifiedCadResult?: CadLabResult | null

  // Engineering Intelligence — standards, materials, processes referenced during design
  engineeringIntelligence?: {
    standards: { code: string; name: string; issuingBody: string; summary: string }[]
    materials: { code: string; name: string; density: number | null; yieldStrength: number | null; thermalConductivity: number | null; costPerKg: number | null }[]
    processes: { name: string; displayName: string; toleranceTypical: number | null; minWall: number | null }[]
    hardwareCount: number
    industryDomain: string | null
    supplierInsights?: { technique: string; supplierCount: number; tolerances: string; materials: string }[]
  }

  // AI-generated narration (optional — when populated, exporters use prose instead of raw data)
  aiContent?: AiReportContent
}

// ─── Slide Layout System ─────────────────────────────────────────────

/** Visual layout for a PPTX slide — determines which builder function renders it */
export type SlideLayout =
  | 'hero-cover'            // Full-bleed hero image + title + subtitle
  | 'value-props'           // Icon/image left, 3 stacked value-prop cards right
  | 'comparison-two-col'    // Side-by-side "Legacy vs Ours" with visual contrast
  | 'data-table'            // Styled comparison table with brand color rows
  | 'architecture-diagram'  // AI illustration center + annotation cards + key specs sidebar
  | 'process-flow'          // Chevron pipeline with phases
  | 'stat-callouts'         // Before/after with 2-3 big-number callouts
  | 'technical-dossiers'    // 3-card grid with profiles and specs
  | 'quadrant-chart'        // 2×2 matrix with positioned items
  | 'module-detail'         // Image left, specs right
  | 'prose-section'         // Standard text slide

/** Typed slide data — shape depends on slideLayout */
export type SlideData =
  | { layout: 'hero-cover'; title: string; subtitle: string }
  | { layout: 'value-props'; heading?: string; items: { label: string; description: string }[] }
  | { layout: 'comparison-two-col'; leftTitle: string; leftItems: string[]; rightTitle: string; rightDescription: string; rightItems?: string[] }
  | { layout: 'data-table'; heading: string; columns: string[]; rows: { label: string; values: string[] }[]; footnote?: string }
  | { layout: 'architecture-diagram'; heading: string; annotations: { label: string; description: string }[]; specs?: { label: string; value: string }[] }
  | { layout: 'process-flow'; heading: string; subtitle?: string; phases: { name: string; title: string; description: string }[] }
  | { layout: 'stat-callouts'; leftLabel?: string; rightLabel?: string; stats: { value: string; label: string }[] }
  | { layout: 'technical-dossiers'; heading: string; cards: { title: string; profile: string; items: { label: string; value: string }[] }[] }
  | { layout: 'quadrant-chart'; heading: string; xAxis: string; yAxis: string; items: { label: string; x: 'low' | 'mid' | 'high'; y: 'low' | 'mid' | 'high'; color?: string }[]; insight?: string }
  | { layout: 'module-detail'; moduleName: string; specs: { label: string; value: string }[] }
  | { layout: 'prose-section' }

// ─── AI Report Pipeline Types ────────────────────────────────────────

export type ReportSectionType =
  | 'executive-summary' | 'product-overview' | 'research-findings'
  | 'module-overview' | 'module-detail' | 'specifications'
  | 'cost-analysis' | 'specialist-reviews' | 'part-classification'
  | 'supplier-analysis' | 'assembly-logistics' | 'cad-output' | 'engineering-standards' | 'conclusions'

/** Phase 1 output: Opus structures the report outline */
export interface ReportOutline {
  executiveSummary: string
  narrativeThread: string
  sections: ReportSectionOutline[]
}

export interface ReportSectionOutline {
  id: string
  title: string
  sectionType: ReportSectionType
  brief: string
  keyPoints: string[]
  dataHighlights: string[]
  includeTable?: boolean
  includeImage?: boolean
  moduleId?: string
  /** Visual layout for PPTX rendering */
  slideLayout?: SlideLayout
  /** Structured data for the slide layout builder */
  slideData?: SlideData
  /** Nano Banana 2 prompt for a custom per-slide illustration */
  imagePrompt?: string
}

/** Phase 2 output: Gemini writes prose for each section */
export interface AiReportContent {
  executiveSummary: string
  sections: AiReportSection[]
  generatedAt: string
  opusTokens: { in: number; out: number }
  geminiTokens: { in: number; out: number }
}

export interface AiReportSection {
  id: string
  title: string
  sectionType: ReportSectionType
  prose: string
  keyPoints: string[]
  includeTable: boolean
  includeImage: boolean
  moduleId?: string
  /** Visual layout for PPTX rendering */
  slideLayout?: SlideLayout
  /** Structured data for the slide layout builder */
  slideData?: SlideData
  /** Base64-encoded per-slide illustration (populated in Phase 2.5) */
  slideImageBase64?: string
}
