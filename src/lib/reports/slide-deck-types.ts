/**
 * @file slide-deck-types.ts
 *
 * @description Type definitions for the strategic briefing slide deck system.
 * A StrategicBriefing is composed of ordered slides, each with a specific
 * visual layout type and content shape. Gemini generates the full structure
 * from source context; the slide components render each type.
 *
 * @related
 * - src/lib/reports/ai-slide-generator.ts — Gemini-powered slide generation
 * - src/components/reports/slides/ — Individual slide renderers
 * - src/components/reports/SlideDeckRenderer.tsx — Paginated deck viewer
 */

// ========================
// Slide Types
// ========================

export type SlideType =
  | 'title'
  | 'hero-insight'
  | 'argument'
  | 'comparison'
  | 'data-callout'
  | 'evidence'
  | 'summary'
  | 'section-divider'

// ========================
// Slide Content Shapes
// ========================

export interface TitleSlideContent {
  slideType: 'title'
  headline: string
  subtitle: string
  companyName: string
  date: string
  imageUrl?: string
}

export interface HeroInsightSlideContent {
  slideType: 'hero-insight'
  headline: string
  body: string
  accent?: string
  imageUrl?: string
}

export interface ArgumentSlideContent {
  slideType: 'argument'
  headline: string
  body?: string
  supportingPoints: string[]
}

export interface ComparisonSlideContent {
  slideType: 'comparison'
  headline: string
  leftLabel: string
  rightLabel: string
  comparisonPairs: { left: string; right: string }[]
}

export interface DataCalloutSlideContent {
  slideType: 'data-callout'
  headline: string
  value: string
  label: string
  context: string
}

export interface EvidenceSlideContent {
  slideType: 'evidence'
  headline: string
  quote: string
  attribution?: string
  analysis: string
}

export interface SummarySlideContent {
  slideType: 'summary'
  headline: string
  takeaways: string[]
  closingLine?: string
}

export interface SectionDividerSlideContent {
  slideType: 'section-divider'
  headline: string
  subtitle?: string
  imageUrl?: string
}

export type SlideContent =
  | TitleSlideContent
  | HeroInsightSlideContent
  | ArgumentSlideContent
  | ComparisonSlideContent
  | DataCalloutSlideContent
  | EvidenceSlideContent
  | SummarySlideContent
  | SectionDividerSlideContent

// ========================
// Strategic Briefing Document
// ========================

export interface StrategicBriefing {
  id: string
  title: string
  subtitle: string
  companyName: string
  generatedAt: string
  foundryId: string
  tone: 'internal' | 'board' | 'investor'
  slides: SlideContent[]
  sourceContext?: string
}

// ========================
// Generation Request/Response
// ========================

export interface GenerateBriefingRequest {
  sourceContext: string
  tone: 'internal' | 'board' | 'investor'
  companyName: string
  includeCompanyData?: boolean
}

export interface GenerateBriefingResponse {
  success: boolean
  briefing?: StrategicBriefing
  error?: string
}
