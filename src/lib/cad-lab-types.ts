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
  { id: "claude-opus-4-6", label: "Claude Opus 4.6 (recommended)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (fast)" },
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5 (fast)" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fallback)" },
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

// ─── Pre-Execution Validation Types ──────────────────────────────────

/** Severity of a pre-execution validation finding */
export type PreExecSeverity = "critical" | "warning" | "info"

/** Result from a single pre-execution validation rule */
export interface PreExecValidationResult {
  /** Unique rule identifier (e.g., "arith-sum-mismatch") */
  ruleId: string
  /** Severity level — critical blocks Modal execution */
  severity: PreExecSeverity
  /** Human-readable description of the issue */
  message: string
  /** Suggested fix for the repair loop prompt */
  repairHint?: string
  /** Whether an automated fix is possible */
  autoFixable?: boolean
}

/** Estimated bounding box from static code analysis */
export interface DimensionEstimate {
  /** Resolved symbol table (variable name → numeric value) */
  symbols: Record<string, number>
  /** Predicted bounding box in mm (null if estimation failed) */
  predictedBbox: { x: number; y: number; z: number } | null
  /** Variables that could not be resolved */
  unresolvedVars: string[]
}

// ─── Interface Contract Types (P1) ───────────────────────────────────

/** Port type classification for module interface connections */
export type InterfacePortType = "power" | "data" | "mechanical" | "thermal" | "fluid" | "optical" | "other"

/** A single validated connection between two module ports */
export interface InterfaceContract {
  sourceModuleId: string
  sourcePort: string
  targetModuleId: string
  targetPort: string
  portType: InterfacePortType
  sourceSpec?: string
  targetSpec?: string
  compatible: boolean | null
  incompatibilityReason?: string
}

/** Result from interface contract extraction and validation */
export interface InterfaceContractResult {
  contracts: InterfaceContract[]
  unmatchedOutputs: Array<{ moduleId: string; portName: string }>
  unmatchedInputs: Array<{ moduleId: string; portName: string }>
  warnings: string[]
  extractionTimeMs: number
  tokensIn: number
  tokensOut: number
}

// ─── Early Cost Estimation Types (P9) ────────────────────────────────

/** Parsed component from an interface definition's Component Placement Table */
export interface ParsedComponent {
  name: string
  quantity: number
  /** Dimensions in mm [x, y, z] */
  dimensions: [number, number, number] | null
  material: string | null
}

/** Early cost estimate computed from interface definition before CAD generation */
export interface EarlyCostEstimate {
  moduleId: string
  moduleName: string
  material: string
  estimatedMassKg: number
  estimatedVolumeMm3: number
  materialCostLow: number
  materialCostHigh: number
  totalLow: number
  totalHigh: number
  currency: "USD"
  confidence: "rough" | "refined"
  componentCount: number
}

// ─── Generation Streaming Types (P5) ─────────────────────────────────

/** SSE event types for streaming module generation progress */
export type GenerationEvent =
  | { type: "status"; step: "interface" | "codegen" | "modal" | "zoo" | "upload"; attempt?: number }
  | { type: "validation"; findings: PreExecValidationResult[] }
  | { type: "cost_estimate"; estimate: EarlyCostEstimate }
  | { type: "progress"; message: string }
  | { type: "complete"; module: CadLabModule }
  | { type: "unified_complete"; result: Omit<CadLabResult, "stepData">; code: string }
  | { type: "error"; message: string }

// ─── Result Types ────────────────────────────────────────────────────

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
  /** Persistent GLB file URL (from image-to-3D providers) */
  glbUrl?: string
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
  /** Assumptions inferred or resolved during generation */
  assumptions?: string[]
  /** Number of repair loop iterations (0 = first attempt succeeded) */
  repairAttempts?: number
  /** Whether the model was generated successfully on the first attempt (no repairs) */
  firstAttemptSuccess?: boolean
  /** Pre-execution validation results from deterministic validators */
  preExecValidation?: PreExecValidationResult[]
  /** P2: Vision-based render quality score (1-10) */
  visionScore?: number
  /** P2: Issues identified by vision scoring */
  visionIssues?: string[]
  /** Slug of the step_template used as seed geometry (if any) */
  seedTemplateSlug?: string
  /** Normalised match score of the seed template (0–1) */
  seedTemplateScore?: number
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
  /** Pre-execution validation warnings from deterministic interface validators */
  interfaceWarnings?: PreExecValidationResult[]
}

// ─── Visual Style Spec ──────────────────────────────────────────────

/**
 * AI-generated visual style specification for cohesive module illustrations.
 *
 * @description Generated once per decomposition by a fast Claude call, then
 * injected into every module image prompt so all illustrations share a
 * consistent color palette, material rendering, and contextual framing.
 */
export interface VisualStyleSpec {
  /** Dominant colors to use across all module illustrations (e.g. "steel blue, warm gray, copper accent") */
  colorPalette: string
  /** How materials and surfaces should be rendered (e.g. "brushed metal with soft specular highlights") */
  materialRendering: string
  /** Shared context that ties modules together (e.g. "sub-assemblies of a compact quadrotor drone frame") */
  unifyingContext: string
  /** Purely geometric description of the complete product's physical shape/silhouette (60-120 words). Used to render a faint ghost outline behind each subassembly so every module image shows spatial context within the whole product. */
  productFormDescription?: string
  /** Per-module geometry descriptions mapping module name to a 30-50 word description of visible geometry within the product (shape, position, proportions, distinctive features). Used to constrain module image generation. */
  moduleGeometryMap?: Record<string, string>
  /** Opus-crafted hero image prompt (300-500 words). When present, used directly as the Gemini prompt for the system illustration instead of the programmatic prompt. */
  heroImagePrompt?: string
  /** Overall product dimensions as freeform text extracted by Opus from research/module data (e.g. "350W × 320D × 95H mm"). */
  overallDimensionsMm?: string
  /** Per-module approximate dimensions and proportional notes, keyed by module name (e.g. "Ø40mm × 60mm, roughly 12% of chassis width"). */
  moduleDimensionNotes?: Record<string, string>

  // ── Convergent refinement pipeline fields ──

  /** Product design language established before module expansion (e.g. "industrial, modular, compact") */
  designLanguage?: string
  /** Rules all modules must follow for consistency (e.g. "all housings use brushed aluminum, connectors face rear") */
  consistencyBrief?: string
  /** Spatial arrangement principles (e.g. "stacked vertically", "radial from central hub") */
  spatialPrinciples?: string[]
  /** AI-crafted per-module image prompts keyed by module ID — all crafted together for cross-module consistency */
  perModuleImagePrompts?: Record<string, string>

  /** Opus-crafted CAD geometry prompt (300-500 words). Describes parametric shape,
   * dimensional constraints, assembly hierarchy, and interface geometry for text-to-CAD
   * APIs (Zoo.dev). Unlike heroImagePrompt (optimized for image generation), this focuses
   * on engineering geometry: envelope dimensions, feature relationships, tolerances,
   * and spatial constraints. */
  cadGeometryPrompt?: string
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
  /** AI-estimated mass in kg from decomposition (product-scale-aware) */
  estimatedMassKg?: number
  /** ID of the primary module this mirrors (e.g. right_leg mirrors left_leg) */
  mirrorOf?: string
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
  status: "pending" | "researched" | "interface_ready" | "specified" | "generated" | "failed"
  /** Persisted SVG view URLs from Supabase storage (P3) */
  svgUrls?: Record<string, string>

  // ── Image generation (Gemini blueprint illustrations) ──

  /** URL of Gemini-generated engineering blueprint image */
  imageUrl?: string
  /** Image generation status */
  imageStatus?: "pending" | "generating" | "complete" | "failed"
  /** Error message if image generation failed */
  imageError?: string
  /** Which model generated this module's blueprint image (e.g. "gemini-3.1-flash-image-preview", "gpt-image-1") */
  imageModelUsed?: string
  /** AI-crafted image prompt (set during decomposition or generated on-the-fly) */
  moduleImagePrompt?: string
  /** Slug of the step_template matched as seed geometry for this module */
  seedTemplateSlug?: string
  /** Cached template match result — avoids re-running expensive DB + semantic scoring on regeneration */
  templateMatchResult?: {
    topMatches: Array<{ slug: string; name: string; category: string; subcategory: string | null; description: string | null; stepUrl: string; score: number; tags?: string[] | null }>
    seedTemplate: { slug: string; name: string; category: string; subcategory: string | null; description: string | null; stepUrl: string; score: number; tags?: string[] | null } | null
    referenceTemplates: Array<{ slug: string; name: string; category: string; subcategory: string | null; description: string | null; stepUrl: string; score: number; tags?: string[] | null }>
  }

  /** User overrides for cost estimation assumptions (persisted in JSONB) */
  costOverrides?: {
    materialCostPerKg?: number
    hoursPerKg?: number
    hourlyRate?: number
    massKg?: number
    /** V2: simple total override per module */
    totalPerUnit?: number
  }

  /** Snapshot of text fields before revision, for redline diff display */
  conceptSnapshot?: {
    purpose: string
    description: string
    keyParts: string[]
    whyItMatters: string
    failureModes: string[]
    unknowns: string[]
  }

  /** Revision number — 1 = original decomposition, 2+ = revised */
  revisionNumber?: number
  /** What triggered the most recent revision */
  lastRevisionSource?: "checkpoint" | "review"
}

// ─── Decomposition Connection Types ──────────────────────────────────

/** An explicit inter-module connection declared by the AI during decomposition. */
export interface ModuleConnection {
  /** Source module ID */
  from: string
  /** Output port name on the source module (must match an entry in module.outputs) */
  output: string
  /** Target module ID */
  to: string
  /** Input port name on the target module (must match an entry in module.inputs) */
  input: string
}

/** Result from module decomposition */
export interface CadLabDecompositionResult {
  success: boolean
  error?: string
  /** Array of decomposed modules */
  modules: CadLabModule[]
  /** Explicit inter-module connections declared during decomposition */
  connections?: ModuleConnection[]
  /** Time taken in ms */
  decompositionTime: number
  /** Tokens used */
  tokensIn: number
  tokensOut: number
  /** Which model won the decomposition race (e.g. "Opus", "Gemini", "GPT-4o") */
  modelUsed?: string
}

// ─── Progressive Decomposition Types ─────────────────────────────────

/** Lightweight module skeleton returned by the fast first pass (~10-15s). */
export interface SkeletonModule {
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
  /** ID of the primary module this mirrors (e.g. right_leg mirrors left_leg) */
  mirrorOf?: string
}

/** Result from the fast skeleton decomposition (Phase 1). */
export interface SkeletonDecompositionResult {
  success: boolean
  error?: string
  /** Lightweight module skeletons (id, name, purpose, inputs, outputs only) */
  modules: SkeletonModule[]
  /** Explicit inter-module connections */
  connections?: ModuleConnection[]
  /** Time taken in ms */
  decompositionTime: number
  /** Tokens used */
  tokensIn: number
  tokensOut: number
  /** Which model produced the skeleton */
  modelUsed?: string
}

/** Result from expanding a single skeleton module with full details (Phase 2). */
export interface ModuleExpansionResult {
  success: boolean
  error?: string
  /** Which module was expanded */
  moduleId: string
  /** Expanded detail fields (merged into the skeleton to form a full CadLabModule) */
  expansion?: {
    keyParts: string[]
    leadWeeks: number
    estimatedMassKg?: number
    description: string
    whyItMatters: string
    failureModes: string[]
    unknowns: string[]
  }
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
  /** Which model synthesized the research report */
  modelUsed?: string
}

// ─── Mashup Types ─────────────────────────────────────────────────────

/** One source STEP for a mashup (name + optional metadata for planning) */
export interface MashupSourceInput {
  name: string
  step_url?: string
  step_b64?: string
  /** Optional: bounding box in mm for AI planning */
  bounding_box?: { xLen: number; yLen: number; zLen: number }
  /** Optional: human-readable description (e.g. from step_templates) */
  description?: string
  /** Optional: thumbnail image URL for display in the UI */
  thumbnail_url?: string
}

/**
 * One AI-suggested STEP template combination for a mashup concept.
 * Returned by suggestMashupCombinations — shown as a recipe card.
 */
export interface MashupSuggestion {
  /** Display name, e.g. "Quadrotor Humanoid Scout" */
  name: string
  /** Short description of how the parts combine */
  description: string
  /** Pre-filled concept text for the mashup generation step */
  concept: string
  /** Template slugs from step_templates, in combination order */
  templateSlugs: string[]
  /** Resolved source inputs (populated server-side from templateSlugs) */
  sources: MashupSourceInput[]
}

/** Structured plan returned by Claude for mashup code generation */
export interface MashupPlan {
  strategy: "embed" | "attach" | "morph" | "stack" | "integrate" | "hybrid_shell"
  steps: Array<{
    source: string
    action: "keep" | "cut" | "position" | "orient" | "union" | "subtract" | "add_adapter"
    detail?: string
    position_mm?: [number, number, number]
    rotation_deg?: [number, number, number]
  }>
  adapter_geometry?: string
  notes?: string
}

/** Result of generateMashup server action */
export interface MashupResult {
  success: boolean
  error?: string
  mashup_plan?: MashupPlan
  mashup_code?: string
  step_url?: string
  stl_url?: string
  step_b64?: string
  stl_b64?: string
  svg_iso?: string
  analysis?: unknown
  elapsedMs?: number
  tokensIn?: number
  tokensOut?: number
  /** J3: Error category from categorizeModalError when mashup fails */
  error_category?: string
}

/** Result of the planMashup phase (plan only, no execution) */
export interface MashupPlanResult {
  success: boolean
  error?: string
  plan?: MashupPlan
  /** Resolved source STEPs (base64) for passing to executeMashupPlan */
  resolvedSources?: Array<{ name: string; step_b64: string }>
  /** Source info used in planning (for display) */
  sourceInfos?: Array<{ name: string; description?: string }>
  tokensIn?: number
  tokensOut?: number
  elapsedMs?: number
}

/** Result of the executeMashupPlan phase (code gen + Modal + upload) */
export type MashupExecuteResult = MashupResult

// ─── Specialist Review Types ─────────────────────────────────────────

/** Verdict from a specialist review */
export type ReviewVerdict = "pass" | "warn" | "fail"

/** A single issue found during specialist review */
export interface ReviewIssue {
  /** Severity of the issue */
  severity: "critical" | "warning" | "info"
  /** Short category label (e.g., "Wall Thickness", "Tolerance", "Material") */
  category: string
  /** Human-readable description of the issue */
  message: string
  /** Suggested fix, if any */
  suggestion?: string
}

/** A calculation performed during the review (for transparency) */
export interface ReviewCalculation {
  /** Tool that was called (e.g., "calculate_stress", "lookup_material") */
  tool: string
  /** Brief description of what was computed */
  description: string
  /** Key result value (e.g., "Safety factor: 2.3") */
  result: string
}

/**
 * Structured result from a specialist reviewing a CAD Lab module.
 *
 * @description Specialists review modules for manufacturability (Fang),
 * engineering soundness (Jian), system integration (Max), and supply chain
 * viability (Chase). Reviews are stored per-module in the DB.
 */
export interface SpecialistReview {
  /** Which specialist performed the review */
  specialistId: string
  /** Specialist's display name */
  specialistName: string
  /** Overall verdict */
  verdict: ReviewVerdict
  /** One-sentence summary of the review */
  summary: string
  /** Detailed issues found */
  issues: ReviewIssue[]
  /** Actionable recommendations */
  recommendations: string[]
  /** Calculations performed (for auditability) */
  calculations: ReviewCalculation[]
  /** Full markdown review text from the specialist */
  reviewMarkdown: string
  /** When the review was performed */
  reviewedAt: string
  /** Time taken in ms */
  reviewTimeMs: number
}

// ─── Decomposition Checkpoint Types ──────────────────────────────────

/** Specialist's gut-level sentiment on the decomposition */
export type CheckpointSentiment = "positive" | "cautious" | "concerned"

/**
 * A lightweight specialist assessment of the module decomposition,
 * run before expensive CAD generation to catch architectural or
 * manufacturability issues early.
 */
export interface DecompositionCheckpoint {
  /** Which specialist performed the checkpoint */
  specialistId: string
  /** Specialist's display name */
  specialistName: string
  /** Overall sentiment (green/amber/red) */
  sentiment: CheckpointSentiment
  /** 1-2 sentence summary of the assessment */
  summary: string
  /** 0-5 specific suggestions */
  suggestions: string[]
  /** Module IDs that need attention */
  flaggedModules: string[]
  /** When the checkpoint was performed */
  checkpointedAt: string
  /** Time taken in ms */
  checkpointTimeMs: number
}

// ─── Assembly & Fulfillment Types ────────────────────────────────────

/** Manufacturing process types matching the manufacturing_process_type enum */
export type ManufacturingProcessType =
  | "cnc"
  | "injection_molding"
  | "sheet_metal"
  | "3d_print_fdm"
  | "3d_print_sla"
  | "3d_print_sls"
  | "casting"
  | "forging"
  | "machining"
  | "purchased_cots"
  | "other"

/** A structured part definition with specs, costs, and CAD URLs */
export interface StructuredPart {
  /** Database ID (set after save) */
  id?: string
  /** Part number unique within the project (e.g., FRAME-001) */
  partNumber: string
  /** Human-readable name */
  name: string
  /** Description of the part's function */
  description?: string
  /** Module ID this part was derived from */
  sourceModuleId?: string
  /** Manufacturing process */
  process?: ManufacturingProcessType
  /** Material family (e.g., "6061 Aluminium") */
  material?: string
  /** Material specification (e.g., "6061-T6") */
  materialSpec?: string
  /** Surface finish (e.g., "anodised black") */
  finish?: string
  /** Tolerance requirement (e.g., "±0.1mm") */
  tolerance?: string
  /** Mass in kilograms */
  massKg?: number
  /** Bounding box X in mm */
  envelopeXMm?: number
  /** Bounding box Y in mm */
  envelopeYMm?: number
  /** Bounding box Z in mm */
  envelopeZMm?: number
  /** Estimated unit cost in GBP */
  estimatedUnitCostGbp?: number
  /** STEP file URL */
  stepUrl?: string
  /** STL file URL */
  stlUrl?: string
  /** Drawing URL */
  drawingUrl?: string
  /** Whether this part was AI-generated */
  aiGenerated?: boolean
  /** AI confidence score (0–1) */
  aiConfidence?: number
  /** Whether this is a purchased/COTS part */
  isPurchased?: boolean
}

/** A BOM line linking a parent assembly to a child part with quantity */
export interface BomLine {
  /** Database ID (set after save) */
  id?: string
  /** Project this line belongs to */
  cadLabProjectId?: string
  /** Parent assembly part ID (null = top-level) */
  parentPartId?: string | null
  /** Child part ID */
  childPartId: string
  /** Quantity of child required per parent */
  quantity: number
  /** Reference designator (e.g., "M3x8-1") */
  referenceDesignator?: string
  /** Notes */
  notes?: string
  /** Display order */
  sortOrder?: number
}

/** Computed tree node for UI rendering with rollup costs and mass */
export interface BomTreeNode {
  /** The part at this node */
  part: StructuredPart
  /** BOM line connecting this to its parent (null for root) */
  bomLine?: BomLine
  /** Child nodes */
  children: BomTreeNode[]
  /** Depth in the tree (0 = root assembly) */
  depth: number
  /** Rolled-up total cost (this part × qty + sum of children) */
  totalCost: number
  /** Rolled-up total mass (this part × qty + sum of children) */
  totalMass: number
}

// ─── AI Cost Estimation Types ─────────────────────────────────────────

/** A single part within a module cost estimate — either bought or manufactured. */
export interface PartCostEstimate {
  /** Part name (e.g. "NEMA 23 stepper motor", "Steel frame rails (×2)") */
  name: string
  /** "buy" = purchased/COTS part, "make" = manufactured in-house or by supplier */
  type: "buy" | "make"
  /** Estimated cost in GBP */
  cost: number
  /** Plain English reasoning for this part's cost */
  reasoning: string
  /** Inferred manufacturing process for make parts (e.g. "CNC Machining", "Sheet Metal") */
  process?: string
  /** Inferred material for make parts (e.g. "Aluminum 6061", "Stainless 304") */
  material?: string
}

/** Structured per-module cost estimate produced by AI (Claude Haiku).
 *
 * V2 uses parts-level breakdown (parts, labourCost, labourReasoning).
 * V1 fields (materialCostPerUnit, processingCostPerUnit, etc.) are kept
 * optional for backward compatibility with saved DB data.
 */
export interface AiCostEstimate {
  moduleId: string
  totalPerUnit: number
  confidence: "low" | "medium" | "high"
  assumptions: string[]

  // ── V2: Parts-level breakdown ──
  /** Individual part cost estimates */
  parts?: PartCostEstimate[]
  /** Assembly/integration labour cost in GBP */
  labourCost?: number
  /** Reasoning for the labour estimate */
  labourReasoning?: string
  /** Overall reasoning / summary for the estimate */
  reasoning?: string

  // ── V1: Legacy formula fields (optional for backward compat) ──
  estimatedMassKg?: number
  massReasoning?: string
  materialCostPerUnit?: number
  materialBreakdown?: string
  processingCostPerUnit?: number
  processingBreakdown?: string
  toolingCost?: number
  toolingReasoning?: string
  toleranceMultiplier?: number
  finishMultiplier?: number
  environmentMultiplier?: number
  adjustmentReasoning?: string
}

// ─── Part Classification Override Types ───────────────────────────────

/** User override for a part's classification (type, process, material).
 *  Keyed by `${moduleId}::${partName}` in the overrides map. */
export interface PartCategoryOverride {
  type?: "buy" | "make"
  process?: string
  material?: string
}

/** Pipeline stage for the 4-stage product development flow */
export type PipelineStage = "design" | "specify" | "source" | "assemble" | "complete"

/** Return type from the AI BOM generation action */
export interface BomGenerationResult {
  success: boolean
  error?: string
  /** Structured parts created */
  parts?: StructuredPart[]
  /** BOM lines created */
  bomLines?: BomLine[]
  /** Time taken in ms */
  generationTimeMs?: number
}
