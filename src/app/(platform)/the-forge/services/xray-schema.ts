/**
 * @file xray-schema.ts — Zod schemas for X-Ray structured AI output
 *
 * @description Defines Zod schemas for XRaySpec, ModuleSpec, and the
 * generalized TransformationDiagnostic. These schemas serve dual purpose:
 * 1. Passed to `zodResponseFormat` for OpenAI structured output
 * 2. Used for runtime validation of AI responses from any provider
 *
 * The diagnostic is domain-agnostic: the AI generates domain-specific
 * questions during the scan, and derives the process class from answers.
 *
 * @related
 * - Mock scan: ./scan.ts (mockScanIdea function for development)
 * - Scan service: ./scan.ts (uses these schemas for AI calls)
 * - Server actions: src/actions/xray.ts (validates AI responses)
 */

import { z } from "zod"

import type { Json } from "@/types/database.types"

// ─── Engineering Analysis Schemas ────────────────────────────────────

/** DFM issue severity levels */
export const DfmIssueSeveritySchema = z.enum(["critical", "warning", "info"])
export type DfmIssueSeverity = z.infer<typeof DfmIssueSeveritySchema>

/** A single DFM (Design for Manufacturability) issue */
export const DfmIssueSchema = z.object({
  severity: DfmIssueSeveritySchema,
  category: z.string().describe("Issue category (build_volume, feature_size, material_usage, etc.)"),
  message: z.string().describe("Human-readable description of the issue"),
})
export type DfmIssue = z.infer<typeof DfmIssueSchema>

/** Bounding box dimensions */
export const BoundingBoxSchema = z.object({
  xLen: z.number(), yLen: z.number(), zLen: z.number(),
  xMin: z.number(), yMin: z.number(), zMin: z.number(),
  xMax: z.number(), yMax: z.number(), zMax: z.number(),
})
export type BoundingBox = z.infer<typeof BoundingBoxSchema>

/** Moment of inertia tensor */
export const MomentOfInertiaSchema = z.object({
  Ixx: z.number(), Iyy: z.number(), Izz: z.number(),
  Ixy: z.number(), Ixz: z.number(), Iyz: z.number(),
})
export type MomentOfInertia = z.infer<typeof MomentOfInertiaSchema>

/** Mass properties computed from CAD geometry */
export const MassPropertiesSchema = z.object({
  mass_kg: z.number().describe("Mass in kilograms"),
  volume_mm3: z.number().describe("Volume in cubic millimeters"),
  surface_area_mm2: z.number().optional().describe("Surface area in square millimeters"),
  centerOfGravity: z.tuple([z.number(), z.number(), z.number()])
    .describe("Center of gravity [x, y, z] in mm"),
  momentOfInertia: MomentOfInertiaSchema.describe("Moment of inertia tensor (kg*mm²)"),
  boundingBox: BoundingBoxSchema.describe("Axis-aligned bounding box dimensions"),
  materialDensity_kg_m3: z.number().describe("Material density used for calculation"),
  materialName: z.string().optional().describe("Name of the material used"),
  computedAt: z.string().optional().describe("ISO timestamp of computation"),
})
export type MassProperties = z.infer<typeof MassPropertiesSchema>

/** DFM analysis results */
export const DfmAnalysisSchema = z.object({
  printable: z.boolean().describe("Whether the part can be 3D printed as-is"),
  issues: z.array(DfmIssueSchema).describe("List of manufacturability issues"),
  recommendedOrientation: z.tuple([z.number(), z.number(), z.number()]).optional()
    .describe("Recommended print orientation as Euler angles"),
  estimatedPrintTime_min: z.number().optional().describe("Estimated FDM print time in minutes"),
  estimatedMaterial_g: z.number().optional().describe("Estimated material usage in grams"),
  supportVolume_pct: z.number().optional().describe("Estimated support volume as percentage"),
  compatiblePrinters: z.array(z.string()).optional().describe("List of compatible printer models"),
  computedAt: z.string().optional().describe("ISO timestamp of computation"),
})
export type DfmAnalysis = z.infer<typeof DfmAnalysisSchema>

/** Stress hotspot location from FEA */
export const StressHotspotSchema = z.object({
  location: z.tuple([z.number(), z.number(), z.number()]).describe("Position [x,y,z] in mm"),
  vonMisesStress_MPa: z.number().describe("Von Mises stress at this location"),
  description: z.string().optional().describe("Human-readable description of the hotspot"),
})
export type StressHotspot = z.infer<typeof StressHotspotSchema>

/** Structural FEA results */
export const StructuralAnalysisSchema = z.object({
  status: z.enum(["pending", "running", "complete", "failed"]),
  maxVonMisesStress_MPa: z.number().optional().describe("Peak Von Mises stress"),
  yieldStrength_MPa: z.number().optional().describe("Material yield strength"),
  safetyFactor: z.number().optional().describe("Minimum safety factor (yield / max stress)"),
  maxDeformation_mm: z.number().optional().describe("Maximum deformation under load"),
  criticalLocations: z.array(StressHotspotSchema).optional().describe("Stress concentration points"),
  meshElementCount: z.number().optional().describe("Number of mesh elements used"),
  loadCaseDescription: z.string().optional().describe("Description of applied loads"),
  resultsUrl: z.string().optional().describe("URL to full results file"),
  contourImageUrl: z.string().optional().describe("URL to stress contour visualization"),
  computedAt: z.string().optional().describe("ISO timestamp of computation"),
})
export type StructuralAnalysis = z.infer<typeof StructuralAnalysisSchema>

/** Modal / vibration analysis results */
export const ModalAnalysisSchema = z.object({
  naturalFrequencies_Hz: z.array(z.number()).describe("Natural frequencies in Hz"),
  resonanceRisks: z.array(z.object({
    frequency_Hz: z.number(),
    operatingFrequency_Hz: z.number(),
    separation_pct: z.number(),
    riskLevel: z.enum(["high", "medium", "low"]),
    description: z.string(),
  })).optional().describe("Resonance risk assessments"),
  computedAt: z.string().optional(),
})
export type ModalAnalysis = z.infer<typeof ModalAnalysisSchema>

/** Thermal analysis results */
export const ThermalAnalysisSchema = z.object({
  status: z.enum(["pending", "running", "complete", "failed"]),
  maxTemp_C: z.number().optional().describe("Maximum temperature in Celsius"),
  minTemp_C: z.number().optional().describe("Minimum temperature in Celsius"),
  avgTemp_C: z.number().optional().describe("Average temperature in Celsius"),
  materialLimit_C: z.number().optional().describe("Material thermal limit in Celsius"),
  thermalMargin_pct: z.number().optional().describe("Margin below material limit (%)"),
  withinLimits: z.boolean().optional().describe("Whether all temps are within material limits"),
  ambientTemp_C: z.number().optional().describe("Ambient temperature used for analysis"),
  hotspots: z.array(z.object({
    location: z.tuple([z.number(), z.number(), z.number()]),
    temp_C: z.number(),
    description: z.string().optional(),
  })).optional(),
  visualizationUrl: z.string().optional().describe("URL to thermal visualization image"),
  contourImageUrl: z.string().optional(),
  computedAt: z.string().optional(),
})
export type ThermalAnalysis = z.infer<typeof ThermalAnalysisSchema>

/** CFD aerodynamic analysis results */
export const CfdAnalysisSchema = z.object({
  status: z.enum(["pending", "running", "complete", "failed"]),
  dragCoefficient: z.number().optional().describe("Drag coefficient (Cd)"),
  liftCoefficient: z.number().optional().describe("Lift coefficient (Cl)"),
  dragForce_N: z.number().optional().describe("Drag force in Newtons"),
  liftForce_N: z.number().optional().describe("Lift force in Newtons"),
  reynoldsNumber: z.number().optional().describe("Reynolds number of the flow"),
  flowVelocity_m_s: z.number().optional().describe("Freestream velocity in m/s"),
  flowDescription: z.string().optional().describe("Description of flow conditions"),
  convergencePlotUrl: z.string().optional().describe("URL to residual convergence plot"),
  flowVisualizationUrl: z.string().optional().describe("URL to flow visualization image"),
  computedAt: z.string().optional().describe("ISO timestamp of computation"),
})
export type CfdAnalysis = z.infer<typeof CfdAnalysisSchema>

/** Topology optimization results */
export const TopologyOptimizationSchema = z.object({
  status: z.enum(["pending", "running", "complete", "failed"]),
  originalMass_kg: z.number().optional(),
  optimizedMass_kg: z.number().optional(),
  massReduction_pct: z.number().optional().describe("Weight savings as percentage"),
  volumeFraction: z.number().optional().describe("Achieved volume fraction (0–1)"),
  targetVolumeFraction: z.number().optional().describe("Requested volume fraction"),
  removableRegions: z.array(z.object({
    name: z.string(),
    centroid: z.tuple([z.number(), z.number(), z.number()]).optional(),
    volumePercent: z.number().describe("Percentage of removable volume in this region"),
  })).optional(),
  visualizationUrl: z.string().optional().describe("URL to topology visualization image"),
  optimizedStepUrl: z.string().optional(),
  optimizedStlUrl: z.string().optional(),
  computedAt: z.string().optional(),
})
export type TopologyOptimization = z.infer<typeof TopologyOptimizationSchema>

/** EMI/EMC shielding effectiveness results */
export const EmiShieldingSchema = z.object({
  status: z.enum(["complete", "failed"]),
  isConductive: z.boolean().optional(),
  seAt1GHz_dB: z.number().optional().describe("Shielding effectiveness at 1 GHz in dB"),
  overallRating: z.string().optional().describe("none | poor | moderate | good | excellent"),
  recommendation: z.string().optional(),
  wallThickness_mm: z.number().optional(),
  visualizationUrl: z.string().optional(),
  computedAt: z.string().optional(),
})
export type EmiShielding = z.infer<typeof EmiShieldingSchema>

/** Fatigue life estimation results */
export const FatigueSchema = z.object({
  status: z.enum(["complete", "failed"]),
  cyclesToFailure: z.number().optional(),
  cyclesToFailureLabel: z.string().optional(),
  lifeCategory: z.string().optional().describe("low_cycle | medium_cycle | high_cycle | very_high_cycle | infinite"),
  description: z.string().optional(),
  safetyFactor: z.number().optional(),
  enduranceLimit_MPa: z.number().optional(),
  stressAmplitude_MPa: z.number().optional(),
  meanStress_MPa: z.number().optional(),
  computedAt: z.string().optional(),
})
export type Fatigue = z.infer<typeof FatigueSchema>

/** Impact/crash resistance estimation results */
export const ImpactSchema = z.object({
  status: z.enum(["complete", "failed"]),
  impactVelocity_m_s: z.number().optional(),
  kineticEnergy_J: z.number().optional(),
  energyAbsorptionCapacity_J: z.number().optional(),
  safetyFactor: z.number().optional(),
  rating: z.string().optional().describe("excellent | adequate | marginal | insufficient"),
  description: z.string().optional(),
  computedAt: z.string().optional(),
})
export type Impact = z.infer<typeof ImpactSchema>

/** Per-module analysis container — all analysis results for one module */
export const ModuleAnalysisSchema = z.object({
  massProperties: MassPropertiesSchema.optional(),
  dfm: DfmAnalysisSchema.optional(),
  structural: StructuralAnalysisSchema.optional(),
  modal: ModalAnalysisSchema.optional(),
  thermal: ThermalAnalysisSchema.optional(),
  cfd: CfdAnalysisSchema.optional(),
  topology: TopologyOptimizationSchema.optional(),
  emiShielding: EmiShieldingSchema.optional(),
  fatigue: FatigueSchema.optional(),
  impact: ImpactSchema.optional(),
})
export type ModuleAnalysis = z.infer<typeof ModuleAnalysisSchema>

/** Convergence criterion for the design optimization loop */
export const ConvergenceCriterionSchema = z.object({
  metric: z.string().describe("Name of the metric being checked"),
  threshold: z.string().describe("Human-readable threshold description"),
  currentValue: z.number().optional(),
  targetValue: z.number().optional(),
  met: z.boolean().describe("Whether this criterion is currently satisfied"),
  source: z.string().describe("Which analysis produced this metric"),
})
export type ConvergenceCriterion = z.infer<typeof ConvergenceCriterionSchema>

/** Record of a single iteration in the convergence loop */
export const IterationRecordSchema = z.object({
  iteration: z.number(),
  timestamp: z.string(),
  changesApplied: z.array(z.string()).describe("Description of changes made"),
  criteriaMetCount: z.number(),
  criteriaTotalCount: z.number(),
})
export type IterationRecord = z.infer<typeof IterationRecordSchema>

/** System-level analysis (aggregated across all modules) */
export const SystemAnalysisSchema = z.object({
  totalMass_kg: z.number().optional(),
  systemCenterOfGravity: z.tuple([z.number(), z.number(), z.number()]).optional(),
  systemMomentOfInertia: MomentOfInertiaSchema.optional(),

  // Convergence loop state
  iterationCount: z.number().optional(),
  maxIterations: z.number().optional(),
  convergenceStatus: z.enum([
    "not_started", "running", "converged", "max_iterations", "needs_review",
  ]).optional(),
  convergenceCriteria: z.array(ConvergenceCriterionSchema).optional(),
  iterationHistory: z.array(IterationRecordSchema).optional(),

  // Overall engineering grades
  structuralGrade: z.enum(["pass", "marginal", "fail", "not_analyzed"]).optional(),
  thermalGrade: z.enum(["pass", "marginal", "fail", "not_analyzed"]).optional(),
  manufacturabilityGrade: z.enum(["pass", "marginal", "fail", "not_analyzed"]).optional(),

  computedAt: z.string().optional(),
})
export type SystemAnalysis = z.infer<typeof SystemAnalysisSchema>

// ─── Discipline enum ─────────────────────────────────────────────────

export const DisciplineSchema = z.enum([
  "Process",
  "Mechanical",
  "Controls",
  "Operations",
  "Regulatory",
  "Commercial",
])

export type Discipline = z.infer<typeof DisciplineSchema>

// ─── Expert Question ─────────────────────────────────────────────────

export const ExpertQuestionSchema = z.object({
  discipline: DisciplineSchema,
  q: z.string().describe("A specific question an expert in this discipline would need to answer"),
})

export type ExpertQuestion = z.infer<typeof ExpertQuestionSchema>

// ─── Diagnostic Question (AI-generated, domain-specific) ─────────────

export const DiagnosticQuestionSchema = z.object({
  id: z.string().describe("Stable key like 'where_product_exists' or 'assembly_method'"),
  question: z.string().describe("The question to ask the user"),
  options: z.array(z.string()).min(3).max(8).describe("Mutually exclusive answer choices"),
  answer: z.string().optional().describe("User's selected answer"),
})

export type DiagnosticQuestion = z.infer<typeof DiagnosticQuestionSchema>

// ─── Transformation Diagnostic (generalized gating diagnostic) ───────

export const TransformationDiagnosticSchema = z.object({
  questions: z.array(DiagnosticQuestionSchema).min(3).max(8)
    .describe("AI-generated domain-specific diagnostic questions"),
  freeform: z.string().optional().describe("Optional user-provided context or notes"),
  derivedProcessClass: z.string().optional()
    .describe("AI-derived process class after user answers (e.g. 'Precipitation reactor', 'SMT pick-and-place')"),
  derivedRisks: z.array(z.string()).optional()
    .describe("AI-derived domain-specific risks based on diagnostic answers"),
})

export type TransformationDiagnostic = z.infer<typeof TransformationDiagnosticSchema>

// ─── Interview State ─────────────────────────────────────────────────

export const InterviewStateSchema = z.object({
  answers: z.record(z.string(), z.string()),
  risks: z.array(z.string()),
  notes: z.string(),
  completedAt: z.string().optional(),
})

export type InterviewState = z.infer<typeof InterviewStateSchema>

// ─── Module Spec ─────────────────────────────────────────────────────

export const ModuleSpecSchema = z.object({
  id: z.string().describe("Unique module identifier (lowercase, no spaces)"),
  name: z.string().describe("Human-readable module name"),
  purpose: z.string().describe("One-sentence purpose of this module"),
  io: z.object({
    in: z.array(z.string()).min(1).describe("Input streams/signals"),
    out: z.array(z.string()).min(1).describe("Output streams/signals"),
  }),
  keyParts: z.array(z.string()).min(5).describe("Major physical components with specifications"),
  tests: z.array(z.string()).min(1).describe("Key acceptance tests"),
  requirements: z.object({
    leadWeeks: z.number().describe("Estimated lead time in weeks"),
    notes: z.string().describe("Key procurement/design notes"),
  }),
  detail: z.object({
    whatItIs: z.string().describe("2-3 paragraph technical description. Paragraph 1: What the module physically is and its operating principle (mechanism, physics, key process). Paragraph 2: Material choices with standards (ASTM, ISO, DIN), key specifications, and engineering rationale. Paragraph 3: Integration context — how it interfaces with adjacent modules, critical performance parameters, and design constraints affecting procurement or fabrication."),
    whyItMatters: z.string().describe("Why this module is critical to the system"),
    operatingPrinciples: z.string().optional()
      .describe("Deep explanation of the physics, chemistry, thermodynamics, or mechanics that govern this module"),
    materialJustification: z.string().optional()
      .describe("Why specific materials were chosen, citing standards (ASTM, ISO, DIN) and trade-offs"),
    tolerancesAndSpecs: z.string().optional()
      .describe("Key dimensional, thermal, pressure, or performance tolerances and specifications"),
    commonFailureModes: z.array(z.string()).min(1)
      .describe("Typical failure modes an engineer should watch for"),
    unknownsToResolve: z.array(z.string()).min(1)
      .describe("Open questions that must be answered before detailed design"),
    expertQuestions: z.array(ExpertQuestionSchema).min(2)
      .describe("Questions spanning different disciplines for expert interviews"),
  }),
  // Inter-module connections
  systemInterconnections: z.array(z.string()).optional()
    .describe("How this module connects to others — physical, electrical, signal, thermal, material flow"),
  // AI-crafted image prompt
  moduleImagePrompt: z.string().optional()
    .describe("AI-crafted detailed prompt for generating this module's engineering blueprint image via Gemini"),
  // Generalized gating diagnostic (replaces old reactionDiag)
  isGatingModule: z.boolean().optional()
    .describe("True if this is the gating transformation step"),
  diagnostic: TransformationDiagnosticSchema.optional()
    .describe("AI-generated diagnostic for the gating module"),
  // Image generation
  imageUrl: z.string().optional().describe("URL of Gemini-generated blueprint image"),
  imageStatus: z.enum(["pending", "generating", "complete", "failed"]).optional()
    .describe("Image generation status"),
  // 3D CAD model generation
  cadModel: z.object({
    status: z.enum(["pending", "generating", "complete", "failed"])
      .describe("CAD model generation status"),
    stepUrl: z.string().optional().describe("URL of STEP file for manufacturing"),
    stlUrl: z.string().optional().describe("URL of STL mesh for 3D printing"),
    svgIsoUrl: z.string().optional().describe("URL of isometric SVG engineering view"),
    svgTopUrl: z.string().optional().describe("URL of top-down SVG engineering view"),
    svgFrontUrl: z.string().optional().describe("URL of front SVG engineering view"),
    svgRightUrl: z.string().optional().describe("URL of right-side SVG engineering view"),
    cadQueryCode: z.string().optional().describe("The AI-generated CadQuery Python code"),
    generatedAt: z.string().optional().describe("ISO timestamp of generation"),
    errorMessage: z.string().optional().describe("Error message from the last failed generation attempt"),
    // Engineering analysis results (computed alongside or after CAD generation)
    analysis: ModuleAnalysisSchema.optional()
      .describe("Engineering analysis results for this module's CAD model"),
  }).optional().describe("AI-generated 3D CAD model data"),
  // Legacy fields preserved for backward compat with existing scans
  interview: InterviewStateSchema.optional(),
  supplier: z.string().optional(),
  estCost: z.number().optional(),
})

export type ModuleSpec = z.infer<typeof ModuleSpecSchema>

// ─── XRaySpec (top-level scan result) ────────────────────────────────

export const XRaySpecSchema = z.object({
  idea: z.string().describe("The original product/machine idea text"),
  function: z.string().describe("One-sentence system function description"),
  assumptions: z.array(z.string()).describe("Key engineering assumptions"),
  materials: z.array(z.string()).min(8).describe("Primary materials involved with specifications"),
  processes: z.array(z.string()).min(6).describe("Manufacturing/build processes required with detail"),
  validation: z.array(z.string()).describe("Key validation/test steps"),
  modules: z.array(ModuleSpecSchema).min(4).max(10)
    .describe("Sub-assemblies that compose the machine"),
  lastScannedAt: z.string().optional(),
  // System-level image
  systemImageUrl: z.string().optional().describe("URL of Gemini-generated system diagram"),
  systemImageStatus: z.enum(["pending", "generating", "complete", "failed"]).optional()
    .describe("System image generation status"),
  // System-level 3D CAD model
  systemCadUrl: z.string().optional().describe("URL of system-level STL file for 3D viewer"),
  systemCadStatus: z.enum(["pending", "generating", "complete", "failed"]).optional()
    .describe("System CAD model generation status"),
  systemCadSvgUrl: z.string().optional().describe("URL of isometric SVG view of system CAD model"),
  systemCadExplodedSvgUrl: z.string().optional().describe("URL of exploded isometric SVG view showing all subsystems separated"),
  systemCadQueryCode: z.string().optional().describe("CadQuery source code (persisted on failure for debugging)"),
  // System-level engineering analysis (aggregated across all modules)
  systemAnalysis: SystemAnalysisSchema.optional()
    .describe("Aggregated engineering analysis across all modules"),
})

export type XRaySpec = z.infer<typeof XRaySpecSchema>

// ─── DB CHECK constraint enums (match xray_scans columns) ──────────────

/** Matches xray_scans.scan_status CHECK */
export const XRayScanStatusSchema = z.enum(["idle", "scanning", "complete"])
export type XRayScanStatus = z.infer<typeof XRayScanStatusSchema>

/** Matches xray_scans.status CHECK */
export const XRayStatusSchema = z.enum(["draft", "scanned", "diagnostic_complete"])
export type XRayStatus = z.infer<typeof XRayStatusSchema>

/**
 * Converts XRaySpec to JSON for DB storage.
 * Use when persisting spec to xray_scans.spec column.
 *
 * @param spec - Validated XRaySpec
 * @returns JSON-serializable value for JSONB column
 */
export function specToJson(spec: XRaySpec): Json {
  return spec as unknown as Json
}

/**
 * Parses JSONB spec from DB with validation.
 * On success returns validated XRaySpec. On failure, logs warning and returns
 * raw data cast as XRaySpec (graceful degradation for partial/demo data).
 *
 * @param raw - JSON from xray_scans.spec column
 * @returns Validated or fallback XRaySpec
 */
export function safeParseSpec(raw: unknown): XRaySpec {
  const result = XRaySpecSchema.safeParse(raw)
  if (result.success) return result.data
  console.warn("[XRay] Spec validation failed, using raw data:", result.error.issues)
  return raw as XRaySpec
}

// ─── Schema for AI scan output (subset used for structured generation) ─

/**
 * The schema passed to the AI for structured output generation.
 * Excludes runtime-only fields (imageUrl, imageStatus, interview, supplier, etc.)
 * that the AI shouldn't generate.
 */
/**
 * OpenAI structured outputs requires `.nullable()` instead of `.optional()`
 * on all non-required fields. These AI-specific schemas use `.nullable()`
 * while the shared runtime schemas above use `.optional()`.
 */
const AIDiagnosticQuestionSchema = z.object({
  id: z.string().describe("Stable key like 'where_product_exists' or 'assembly_method'"),
  question: z.string().describe("The question to ask the user"),
  options: z.array(z.string()).min(3).max(8).describe("Mutually exclusive answer choices"),
  answer: z.string().nullable().describe("User's selected answer, or null if not yet answered"),
})

const AITransformationDiagnosticSchema = z.object({
  questions: z.array(AIDiagnosticQuestionSchema).min(3).max(8)
    .describe("AI-generated domain-specific diagnostic questions"),
  freeform: z.string().nullable().describe("Optional user-provided context or notes"),
  derivedProcessClass: z.string().nullable()
    .describe("AI-derived process class after user answers (e.g. 'Precipitation reactor', 'SMT pick-and-place')"),
  derivedRisks: z.array(z.string()).nullable()
    .describe("AI-derived domain-specific risks based on diagnostic answers"),
})

export const AIScanOutputSchema = z.object({
  function: z.string().describe("One-sentence system function description"),
  assumptions: z.array(z.string()).min(1).describe("Key engineering assumptions"),
  materials: z.array(z.string()).min(8).describe("Primary materials involved with specifications"),
  processes: z.array(z.string()).min(6).describe("Manufacturing/build processes required with detail"),
  validation: z.array(z.string()).min(1).describe("Key validation/test steps"),
  modules: z.array(z.object({
    id: z.string().describe("Unique module identifier (lowercase, no spaces, e.g. 'intake', 'react', 'controls')"),
    name: z.string().describe("Human-readable module name"),
    purpose: z.string().describe("One-sentence purpose of this module"),
    io: z.object({
      in: z.array(z.string()).min(1).describe("Input streams/signals"),
      out: z.array(z.string()).min(1).describe("Output streams/signals"),
    }),
    keyParts: z.array(z.string()).min(5).describe("Major physical components with specifications"),
    tests: z.array(z.string()).min(1).describe("Key acceptance tests"),
    requirements: z.object({
      leadWeeks: z.number().describe("Estimated lead time in weeks"),
      notes: z.string().describe("Key procurement/design notes"),
    }),
    detail: z.object({
      whatItIs: z.string().describe("2-3 paragraph technical description. Paragraph 1: What the module physically is and its operating principle (mechanism, physics, key process). Paragraph 2: Material choices with standards (ASTM, ISO, DIN), key specifications, and engineering rationale. Paragraph 3: Integration context — how it interfaces with adjacent modules, critical performance parameters, and design constraints affecting procurement or fabrication."),
      whyItMatters: z.string().describe("Why this module is critical to the system"),
      commonFailureModes: z.array(z.string()).min(2)
        .describe("Typical failure modes"),
      unknownsToResolve: z.array(z.string()).min(1)
        .describe("Open questions that must be answered"),
      expertQuestions: z.array(ExpertQuestionSchema).min(2)
        .describe("Questions spanning different disciplines"),
    }),
    isGatingModule: z.boolean()
      .describe("True if this is the gating transformation step. Exactly one module must be the gating module."),
    diagnostic: AITransformationDiagnosticSchema.nullable()
      .describe("Only present on the gating module (null for non-gating modules). Contains AI-generated diagnostic questions."),
  })).min(4).max(10)
    .describe("Sub-assemblies. Exactly one must have isGatingModule=true with diagnostic questions."),
})

export type AIScanOutput = z.infer<typeof AIScanOutputSchema>

// ─── Schema for process class derivation ─────────────────────────────

export const ProcessClassDerivationSchema = z.object({
  derivedProcessClass: z.string()
    .describe("The specific process class derived from diagnostic answers (e.g. 'Precipitation / crystallisation reactor', 'SMT pick-and-place assembly line')"),
  derivedRisks: z.array(z.string()).min(1)
    .describe("Domain-specific risks identified from the diagnostic answers"),
  reasoning: z.string()
    .describe("Brief explanation of how the process class was derived from the answers"),
})

export type ProcessClassDerivation = z.infer<typeof ProcessClassDerivationSchema>
