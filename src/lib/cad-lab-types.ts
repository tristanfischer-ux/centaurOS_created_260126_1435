/**
 * @file cad-lab-types.ts — Shared types and constants for the CAD Lab.
 *
 * @description Separated from src/actions/cad-lab.ts because "use server"
 * files turn ALL exports into server action proxies on the client.
 * Constants like CLAUDE_MODELS need to be importable as plain values
 * in client components.
 */

/** Available Claude models for CAD generation */
export const CLAUDE_MODELS = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6 (best quality)" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (fast)" },
] as const

export type ClaudeModelId = (typeof CLAUDE_MODELS)[number]["id"]

/** Result from the main CAD generation pipeline */
export interface CadLabResult {
  success: boolean
  error?: string
  /** Generated CadQuery Python code */
  code?: string
  /** Line count of generated code */
  codeLines?: number
  /** Total pipeline time in ms */
  generationTime?: number
  /** Modal execution time in ms */
  modalTime?: number
  /** Base64-encoded SVG isometric view */
  svgIso?: string
  /** Base64-encoded SVG top view */
  svgTop?: string
  /** Base64-encoded SVG front view */
  svgFront?: string
  /** STEP file size in KB */
  stepSize?: number
  /** Base64-encoded STL data for 3D viewer */
  stlData?: string
  /** STL file size in KB */
  stlSize?: number
  /** Bounding box dimensions in mm */
  bbox?: { xLen: number; yLen: number; zLen: number }
  /** Volume fill ratio (%) */
  fillRatio?: number
  /** Estimated mass in grams */
  massGrams?: number
  /** Volume in mm³ */
  volumeMm3?: number
  /** Total input tokens used */
  tokensIn?: number
  /** Total output tokens used */
  tokensOut?: number
  /** Which Claude model was used */
  modelUsed?: string
  /** Text-only interface definition from Step 2 */
  interfaceDefinition?: string
  /** Post-execution validation warnings */
  validationWarnings?: string[]
}

/** Result from Step 2: Interface Definition generation */
export interface CadLabInterfaceResult {
  success: boolean
  error?: string
  /** The full interface definition text */
  interfaceDefinition: string
  /** Time taken in ms */
  generationTime: number
  /** Tokens used */
  tokensIn: number
  tokensOut: number
}

/** Result from the standalone research step (Step 1) */
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
