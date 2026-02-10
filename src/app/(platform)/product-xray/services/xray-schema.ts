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
 * - Demo types: ../demo/ForgeOS_CompanyScan_Demo.tsx (original TypeScript types)
 * - Scan service: ./scan.ts (uses these schemas for AI calls)
 * - Server actions: src/actions/xray.ts (validates AI responses)
 */

import { z } from "zod"

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
  keyParts: z.array(z.string()).min(1).describe("Major physical components"),
  tests: z.array(z.string()).min(1).describe("Key acceptance tests"),
  requirements: z.object({
    leadWeeks: z.number().describe("Estimated lead time in weeks"),
    notes: z.string().describe("Key procurement/design notes"),
  }),
  detail: z.object({
    whatItIs: z.string().describe("Technical description of the module"),
    whyItMatters: z.string().describe("Why this module is critical to the system"),
    commonFailureModes: z.array(z.string()).min(1)
      .describe("Typical failure modes an engineer should watch for"),
    unknownsToResolve: z.array(z.string()).min(1)
      .describe("Open questions that must be answered before detailed design"),
    expertQuestions: z.array(ExpertQuestionSchema).min(2)
      .describe("Questions spanning different disciplines for expert interviews"),
  }),
  // Generalized gating diagnostic (replaces old reactionDiag)
  isGatingModule: z.boolean().optional()
    .describe("True if this is the gating transformation step"),
  diagnostic: TransformationDiagnosticSchema.optional()
    .describe("AI-generated diagnostic for the gating module"),
  // Image generation
  imageUrl: z.string().optional().describe("URL of Gemini-generated blueprint image"),
  imageStatus: z.enum(["pending", "generating", "complete", "failed"]).optional()
    .describe("Image generation status"),
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
  materials: z.array(z.string()).describe("Primary materials involved"),
  processes: z.array(z.string()).describe("Manufacturing/build processes required"),
  validation: z.array(z.string()).describe("Key validation/test steps"),
  modules: z.array(ModuleSpecSchema).min(3).max(8)
    .describe("Sub-assemblies that compose the machine"),
  lastScannedAt: z.string().optional(),
  // System-level image
  systemImageUrl: z.string().optional().describe("URL of Gemini-generated system diagram"),
  systemImageStatus: z.enum(["pending", "generating", "complete", "failed"]).optional()
    .describe("System image generation status"),
})

export type XRaySpec = z.infer<typeof XRaySpecSchema>

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
  materials: z.array(z.string()).min(1).describe("Primary materials involved"),
  processes: z.array(z.string()).min(1).describe("Manufacturing/build processes required"),
  validation: z.array(z.string()).min(1).describe("Key validation/test steps"),
  modules: z.array(z.object({
    id: z.string().describe("Unique module identifier (lowercase, no spaces, e.g. 'intake', 'react', 'controls')"),
    name: z.string().describe("Human-readable module name"),
    purpose: z.string().describe("One-sentence purpose of this module"),
    io: z.object({
      in: z.array(z.string()).min(1).describe("Input streams/signals"),
      out: z.array(z.string()).min(1).describe("Output streams/signals"),
    }),
    keyParts: z.array(z.string()).min(2).describe("Major physical components"),
    tests: z.array(z.string()).min(1).describe("Key acceptance tests"),
    requirements: z.object({
      leadWeeks: z.number().describe("Estimated lead time in weeks"),
      notes: z.string().describe("Key procurement/design notes"),
    }),
    detail: z.object({
      whatItIs: z.string().describe("Technical description of the module"),
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
  })).min(3).max(8)
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
