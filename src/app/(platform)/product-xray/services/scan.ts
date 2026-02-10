/**
 * @file scan.ts — X-Ray AI scan service
 *
 * @description Reverse engineers a product idea into a structured machine spec (XRaySpec)
 * using AI-powered analysis. Supports multiple AI providers via env configuration.
 *
 * Uses OpenAI's structured output (zodResponseFormat) as the primary provider,
 * with mock mode available for development/testing.
 *
 * @security Requires OPENAI_API_KEY for AI calls
 *
 * @related
 * - Schema: ./xray-schema.ts (Zod schemas for structured output)
 * - Server actions: src/actions/xray.ts (orchestrates scan + persistence)
 * - Demo mock: ../demo/ForgeOS_CompanyScan_Demo.tsx (fallback mock)
 */

import { zodResponseFormat } from "openai/helpers/zod"
import OpenAI from "openai"

import { AIScanOutputSchema } from "./xray-schema"
import { mockScanIdea } from "../demo/ForgeOS_CompanyScan_Demo"

import type { XRaySpec } from "./xray-schema"
import type { AIScanOutput } from "./xray-schema"

// ─── Config ──────────────────────────────────────────────────────────

const USE_MOCK = process.env.XRAY_USE_MOCK === "true"

// ─── System Prompt ───────────────────────────────────────────────────

const SCAN_SYSTEM_PROMPT = `You are a senior industrial systems engineer with 25 years of experience designing, building, and commissioning machines across chemical processing, electronics manufacturing, pharmaceutical production, food processing, robotics, and clean energy.

Your task: reverse engineer a vague product idea into a physically buildable machine composed of parallel subsystems (modules).

## Requirements

1. **Generate 4-7 modules** that represent distinct physical sub-assemblies of the machine.

2. **Identify exactly ONE gating module** — the module whose transformation step, until defined, makes all downstream supplier quotes meaningless. Set \`isGatingModule: true\` on this module only.
   - For a chemical plant, this is the reaction/transformation step
   - For a PCB assembly line, this is the assembly method
   - For a pharmaceutical line, this is the formulation process
   - For a food processing line, this is the cooking/treatment step

3. **For the gating module, generate 4-6 diagnostic questions** that would collapse the design space. Each question must:
   - Have a stable \`id\` (lowercase, underscored, e.g., "assembly_method")
   - Ask a specific, decisive question
   - Provide 4-6 mutually exclusive answer options
   - Be domain-appropriate (don't ask chemistry questions for electronics)

4. **For each module**, provide:
   - Clear input/output streams
   - Key physical components (parts you'd buy or fabricate)
   - Acceptance tests
   - Lead time estimates
   - Expert questions spanning at least 2 different disciplines
   - Common failure modes and open unknowns

5. **Top-level metadata**: assumptions, materials, manufacturing processes, and validation steps that apply to the whole system.

## Style Guidelines
- Be specific and technical, not generic
- Use industry-standard terminology
- Key parts should be things you'd find in a supplier catalog
- Expert questions should be the kind that would actually be asked in a design review
- Failure modes should be real, experienced-engineer-level insights
- Module IDs should be short, lowercase, descriptive (e.g., "intake", "react", "controls")

## Output
Return a JSON object matching the provided schema exactly. Every module's IO should chain logically (outputs of one become inputs of the next where appropriate).`

// ─── AI Scan Implementation ─────────────────────────────────────────

/**
 * Calls the AI to reverse engineer a product idea into a structured machine spec.
 *
 * @param idea - The raw product/machine idea text
 * @returns The AI-generated XRaySpec (without runtime fields)
 *
 * @throws Error if AI call fails or response doesn't match schema
 */
async function callScanAI(idea: string): Promise<AIScanOutput> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("[XRayScan] OPENAI_API_KEY is not configured")
  }

  const openai = new OpenAI({ apiKey })

  console.info("[XRayScan] Starting AI scan for idea:", { ideaLength: idea.length })

  const completion = await openai.chat.completions.parse({
    model: "gpt-4o-2024-08-06",
    messages: [
      { role: "system", content: SCAN_SYSTEM_PROMPT },
      { role: "user", content: `Product idea to reverse engineer:\n\n${idea}` },
    ],
    response_format: zodResponseFormat(AIScanOutputSchema, "xray_scan"),
    max_tokens: 8192,
  })

  const parsed = completion.choices[0]?.message?.parsed
  if (!parsed) {
    const refusal = completion.choices[0]?.message?.refusal
    throw new Error(`[XRayScan] AI refused or returned no parsed output: ${refusal || "unknown"}`)
  }

  console.info("[XRayScan] AI scan complete:", {
    moduleCount: parsed.modules.length,
    gatingModule: parsed.modules.find((m: { isGatingModule?: boolean; name: string }) => m.isGatingModule)?.name,
  })

  return parsed
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Scans an idea and reverse engineers it into a structured machine spec.
 *
 * @param idea - The raw product/machine idea text
 * @returns A structured XRaySpec with modules, materials, processes, and validation
 *
 * @description Uses AI for reverse engineering, or mock data if XRAY_USE_MOCK=true.
 * The AI generates domain-specific diagnostic questions for the gating module.
 */
export async function scanIdea(idea: string): Promise<XRaySpec> {
  // Mock mode for development
  if (USE_MOCK) {
    console.info("[XRayScan] Using mock mode")
    return mockScanIdea(idea)
  }

  const aiOutput = await callScanAI(idea)

  // Convert AI output to full XRaySpec
  const spec: XRaySpec = {
    idea,
    function: aiOutput.function,
    assumptions: aiOutput.assumptions,
    materials: aiOutput.materials,
    processes: aiOutput.processes,
    validation: aiOutput.validation,
    modules: aiOutput.modules.map((m) => ({
      ...m,
      // Convert nullable AI output back to optional runtime types
      diagnostic: m.diagnostic ? {
        ...m.diagnostic,
        freeform: m.diagnostic.freeform ?? undefined,
        derivedProcessClass: m.diagnostic.derivedProcessClass ?? undefined,
        derivedRisks: m.diagnostic.derivedRisks ?? undefined,
        questions: m.diagnostic.questions.map((q) => ({
          ...q,
          answer: q.answer ?? undefined,
        })),
      } : undefined,
      // Initialize image generation fields
      imageStatus: "pending" as const,
    })),
    lastScannedAt: new Date().toISOString(),
    systemImageStatus: "pending" as const,
  }

  return spec
}

/**
 * Derives the process class from diagnostic answers using AI.
 *
 * @param idea - The original product idea for context
 * @param moduleName - The gating module name
 * @param modulePurpose - The gating module purpose
 * @param answeredQuestions - The diagnostic questions with user answers
 * @returns The derived process class and risks
 *
 * @throws Error if AI call fails
 */
export async function deriveProcessClassAI(
  idea: string,
  moduleName: string,
  modulePurpose: string,
  answeredQuestions: Array<{ question: string; answer: string }>,
): Promise<{ derivedProcessClass: string; derivedRisks: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("[XRayScan] OPENAI_API_KEY is not configured")
  }

  const openai = new OpenAI({ apiKey })

  const { ProcessClassDerivationSchema } = await import("./xray-schema")

  const answersText = answeredQuestions
    .map((q) => `Q: ${q.question}\nA: ${q.answer}`)
    .join("\n\n")

  const completion = await openai.chat.completions.parse({
    model: "gpt-4o-2024-08-06",
    messages: [
      {
        role: "system",
        content: `You are a senior industrial systems engineer. Based on diagnostic answers about a machine's gating transformation step, derive the specific process class and identify key risks.

The process class should be a specific, industry-standard term (e.g., "Precipitation / crystallisation reactor", "SMT pick-and-place assembly line", "Tablet compression line", "Continuous flow synthesis reactor").

Risks should be specific to the derived process class and informed by the diagnostic answers.`,
      },
      {
        role: "user",
        content: `Product idea: ${idea}

Gating module: ${moduleName}
Purpose: ${modulePurpose}

Diagnostic answers:
${answersText}

Derive the process class and identify risks.`,
      },
    ],
    response_format: zodResponseFormat(ProcessClassDerivationSchema, "process_class"),
    max_tokens: 2048,
  })

  const parsed = completion.choices[0]?.message?.parsed
  if (!parsed) {
    throw new Error("[XRayScan] Failed to derive process class from diagnostic answers")
  }

  return {
    derivedProcessClass: parsed.derivedProcessClass,
    derivedRisks: parsed.derivedRisks,
  }
}
