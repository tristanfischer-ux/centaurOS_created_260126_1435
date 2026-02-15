/**
 * @file cad-lab-types.ts — Shared types and constants for The Forge.
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

/** Structured intake fields captured before research/generation */
export interface CadLabDesignBrief {
  /** What the user is building this for */
  useCase: string
  /** Preferred manufacturing process */
  targetProcess: string
  /** Preferred material family */
  targetMaterial: string
  /** Critical tolerance requirement */
  toleranceTarget: string
  /** Expected production scale */
  quantityTarget: string
  /** Compliance / certification notes */
  complianceNotes: string
}

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
  /** Persistent STEP file URL for procurement attachments */
  stepUrl?: string
  /** STEP file size in KB */
  stepSize?: number
  /** Base64-encoded STL data for 3D viewer */
  stlData?: string
  /** Persistent STL file URL for procurement attachments */
  stlUrl?: string
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
  /** Optional drawing/package metadata for procurement handoff */
  drawingPackage?: {
    revision: string
    generatedAt: string
    title: string
    manifestUrl?: string
    files: Array<{
      name: string
      url: string
      mimeType: string
      sizeKb?: number
    }>
  }
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

// ─── Module Types ────────────────────────────────────────────────────

/**
 * A single module within a The Forge project.
 *
 * @description After research, a product can be decomposed into modules.
 * Each module represents a physical sub-assembly that can independently
 * go through the 3-step CAD pipeline (research → interface → generate).
 */
export interface CadLabModule {
  /** Unique identifier (lowercase, no spaces) */
  id: string
  /** Human-readable module name */
  name: string
  /** One-sentence purpose */
  purpose: string
  /** Input streams/signals */
  inputs: string[]
  /** Output streams/signals */
  outputs: string[]
  /** Major physical components */
  keyParts: string[]
  /** Estimated procurement lead time in weeks */
  leadWeeks: number
  /** Technical description (1-2 paragraphs) */
  description: string
  /** Why this module is critical to the system */
  whyItMatters: string
  /** Common failure modes */
  failureModes: string[]
  /** Open questions to resolve */
  unknowns: string[]

  // ── Per-module pipeline state ──

  /** Edited research for this module (derived from parent) */
  moduleResearch?: string
  /** Interface definition for this module */
  interfaceDefinition?: string
  /** Generation result (without binary data) */
  result?: Omit<CadLabResult, "stlData" | "stepData">
  /** Generated CadQuery code */
  code?: string
  /** Pipeline status */
  status: "pending" | "researched" | "interface_ready" | "generated"
}

/** Result from module decomposition */
export interface CadLabDecompositionResult {
  success: boolean
  error?: string
  /** Array of decomposed modules */
  modules: CadLabModule[]
  /** Time taken in ms */
  decompositionTime: number
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
  /** Structured design brief used to guide research */
  designBrief?: CadLabDesignBrief
  /** Explicit assumptions provided by the user */
  assumptionNotes?: string
}
