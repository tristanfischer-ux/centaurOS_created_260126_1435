/**
 * @file cad-lab-types.ts — Shared types and constants for the CAD Lab.
 *
 * @description Separated from src/actions/cad-lab.ts because "use server"
 * files turn ALL exports into server action proxies on the client.
 * Constants like GEMINI_MODELS need to be importable as plain values
 * in client components.
 */

/** Available Gemini models for A/B testing */
export const GEMINI_MODELS = [
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (stable)" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (fast)" },
  { id: "gemini-3-pro-preview", label: "Gemini 3 Pro (preview)" },
] as const

export type GeminiModelId = (typeof GEMINI_MODELS)[number]["id"]

export interface CadLabResult {
  success: boolean
  error?: string
  code?: string
  codeLines?: number
  generationTime?: number
  modalTime?: number
  svgIso?: string
  svgTop?: string
  svgFront?: string
  stepSize?: number
  stlData?: string
  stlSize?: number
  bbox?: { xLen: number; yLen: number; zLen: number }
  fillRatio?: number
  massGrams?: number
  volumeMm3?: number
  tokensIn?: number
  tokensOut?: number
  modelUsed?: string
  /** Raw interface definition text from Pass 1 */
  interfaceDefinition?: string
  /** Number of unique component types generated */
  componentCount?: number
  /** Number that passed local validation */
  validatedCount?: number
  /** Names of components that failed validation and were skipped */
  skippedComponents?: string[]
  /** Post-execution validation warnings */
  validationWarnings?: string[]
  /** Web research source URLs from Pass 0 (Gemini + Google Search) */
  researchSources?: string[]
  /** Thingiverse reference models found in Pass 0 */
  referenceModels?: Array<{ name: string; url: string; thumbnail?: string }>
}

/** Result from the standalone research step (Pass 0) */
export interface CadLabResearchResult {
  success: boolean
  error?: string
  /** The full research report synthesized by Claude */
  report: string
  /** Web source URLs from Gemini + Google Search */
  sources: Array<{ uri: string; title: string }>
  /** Thingiverse reference models */
  referenceModels: Array<{ name: string; url: string; thumbnail?: string }>
  /** Time taken for the research step in ms */
  researchTime: number
}
