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
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5 (fast)" },
] as const

export type ClaudeModelId = (typeof CLAUDE_MODELS)[number]["id"]

/** DFM (Design for Manufacturability) analysis result */
export interface CadLabDfmResult {
  /** Whether the part is printable on common FDM printers */
  printable: boolean
  /** DFM issues found (severity: critical/warning/info) */
  issues: Array<{ severity: string; category: string; message: string }>
  /** Estimated print time in minutes (FDM, 20% infill) */
  estimatedPrintTimeMin: number
  /** Estimated material usage in grams */
  estimatedMaterialG: number
  /** Support volume estimate as percentage of part volume */
  supportVolumePct: number
  /** List of compatible FDM printers by build volume */
  compatiblePrinters: string[]
}

/** Mass properties computed from the solid model */
export interface CadLabMassProperties {
  /** Mass in kilograms */
  massKg: number
  /** Volume in mm³ */
  volumeMm3: number
  /** Surface area in mm² */
  surfaceAreaMm2: number
  /** Center of gravity [x, y, z] in mm */
  centerOfGravity: [number, number, number]
  /** Material density used for calculation (kg/m³) */
  materialDensityKgM3: number
}

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
  /** Base64-encoded SVG back view */
  svgBack?: string
  /** Base64-encoded SVG right view */
  svgRight?: string
  /** Base64-encoded SVG left view */
  svgLeft?: string
  /** Base64-encoded SVG exploded isometric view */
  svgExploded?: string
  /** Base64-encoded STEP file for download */
  stepData?: string
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
  /** DFM analysis from Modal execution */
  dfm?: CadLabDfmResult
  /** Mass properties from Modal execution */
  massProperties?: CadLabMassProperties
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
