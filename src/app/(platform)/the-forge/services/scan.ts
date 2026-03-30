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
 * - Mock data: mockScanIdea() function at bottom of this file
 */

import { zodResponseFormat } from "openai/helpers/zod"
import OpenAI from "openai"

import { AIScanOutputSchema, ModuleSpecSchema } from "./xray-schema"

import type { XRaySpec, ModuleSpec } from "./xray-schema"
import type { AIScanOutput } from "./xray-schema"

// ─── Config ──────────────────────────────────────────────────────────

const USE_MOCK = process.env.XRAY_USE_MOCK === "true"

// ─── System Prompt ───────────────────────────────────────────────────

const SCAN_SYSTEM_PROMPT = `You are a senior industrial systems engineer with 25 years of experience designing, building, and commissioning machines across chemical processing, electronics manufacturing, pharmaceutical production, food processing, robotics, and clean energy.

Your task: reverse engineer a vague product idea into a physically buildable machine composed of parallel subsystems (modules).

## Requirements

1. **Generate 4-10 modules** that represent distinct physical sub-assemblies of the machine.

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

4. **For each module**, provide comprehensive detail:
   - Clear input/output streams
   - **whatItIs**: 2-3 paragraph detailed technical description structured as follows:
     * Paragraph 1: What the module physically is and how it works — name the assembly, its operating principle, and the primary mechanism (e.g., centrifugal separation, resistive heating, LoRa RF transmission).
     * Paragraph 2: Material choices with standards references (ASTM, ISO, DIN), key dimensional or performance specs, and the engineering rationale for material selection (e.g., "316L stainless selected for chloride resistance per NACE MR0175").
     * Paragraph 3: Integration context — how this module interfaces with adjacent modules (mechanical, electrical, signal, thermal), critical performance parameters that upstream/downstream modules depend on, and design constraints affecting procurement or fabrication.
   - **keyParts**: 5-8 specific components with specifications (e.g., "chemical-resistant centrifugal pump, 316L wetted parts, 20 GPM" not just "pump")
   - Acceptance tests
   - Lead time estimates
   - Expert questions spanning at least 2 different disciplines, with specific questions about materials and manufacturing choices
   - Common failure modes and open unknowns

5. **Top-level metadata with expanded detail**:
   - **materials**: 8-12 items with specifications (e.g., "316L stainless steel (ASTM A240)" not just "stainless steel")
   - **processes**: 6-10 items with process detail (e.g., "TIG welding of stainless pressure vessels per ASME Section VIII" not just "welding")
   - assumptions and validation steps that apply to the whole system

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
 * @param researchReport - Optional product research report (from Gemini + Claude)
 *   to provide grounded real-world data for better module generation
 * @returns The AI-generated XRaySpec (without runtime fields)
 *
 * @throws Error if AI call fails or response doesn't match schema
 */
async function callScanAI(idea: string, researchReport?: string): Promise<AIScanOutput> {
  // DECISION: Use Claude Opus 4.6 instead of GPT-5.3 for module decomposition.
  // Opus is already used for research synthesis — using it for decomposition too
  // ensures consistent reasoning quality and allows the model to build on its own
  // research output when the report is passed as context.
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("[XRayScan] ANTHROPIC_API_KEY is not configured")
  }

  console.info("[XRayScan] Starting AI scan with Claude Opus for idea:", {
    ideaLength: idea.length,
    hasResearch: !!researchReport,
  })

  // Build user message — include research report when available so Opus
  // can ground its module decomposition in real-world specs and standards
  let userMessage = `Product idea to reverse engineer:\n\n${idea}`
  if (researchReport?.trim()) {
    userMessage += `\n\n--- PRODUCT RESEARCH (from web search + internal engineering database) ---\n\n${researchReport.trim()}`
  }

  // FLOW: Claude returns JSON matching our schema. We validate with Zod after.
  // Wrapped in withRetry for transient API errors (429, 502, 503, network, timeout).
  const systemPrompt = SCAN_SYSTEM_PROMPT + "\n\nReturn ONLY valid JSON matching the schema. No markdown fences, no commentary outside the JSON object."

  const { withRetry } = await import("@/lib/retry")

  const parsed = await withRetry<AIScanOutput>(async () => {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 32768,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: AbortSignal.timeout(240_000), // 4 min — Opus with 32K output for thorough decomposition
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`Claude API error (${resp.status}): ${errText.slice(0, 300)}`)
    }

    const data = await resp.json()
    const rawText: string = data.content?.[0]?.text ?? ""

    // Extract JSON from response (may have markdown fences)
    let jsonStr = rawText.trim()
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")
    }

    try {
      const raw = JSON.parse(jsonStr)
      return AIScanOutputSchema.parse(raw)
    } catch (parseErr) {
      console.error("[XRayScan] Failed to parse Claude output:", {
        error: parseErr instanceof Error ? parseErr.message : parseErr,
        responseLength: rawText.length,
        firstChars: rawText.slice(0, 200),
      })
      throw new Error(`AI output failed schema validation: ${parseErr instanceof Error ? parseErr.message : "Unknown"}`)
    }
  }, {
    maxRetries: 2,
    baseDelay: 3000,
    shouldRetry: (error) => {
      const msg = error.message.toLowerCase()
      return msg.includes("429") || msg.includes("502") || msg.includes("503") ||
        msg.includes("network") || msg.includes("timeout") || msg.includes("529")
    },
  })

  console.info("[XRayScan] AI scan complete:", {
    moduleCount: parsed.modules.length,
    gatingModule: parsed.modules.find((m: { isGatingModule?: boolean; name: string }) => m.isGatingModule)?.name,
    model: "claude-opus-4-6",
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
export async function scanIdea(idea: string, researchReport?: string): Promise<XRaySpec> {
  // Mock mode for development
  if (USE_MOCK) {
    console.info("[XRayScan] Using mock mode")
    return mockScanIdea(idea)
  }

  const aiOutput = await callScanAI(idea, researchReport)

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
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("[XRayScan] OPENAI_API_KEY is not configured")
  }

  const openai = new OpenAI({ apiKey })

  const { ProcessClassDerivationSchema } = await import("./xray-schema")

  const answersText = answeredQuestions
    .map((q) => `Q: ${q.question}\nA: ${q.answer}`)
    .join("\n\n")

  const completion = await openai.chat.completions.parse({
    model: "gpt-5.4",
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

// ─── Refine Scan (update existing spec with edited idea) ─────────────

const REFINE_SCAN_SYSTEM_PROMPT = `You are a senior industrial systems engineer reviewing an existing machine decomposition.

The user has updated their product idea and wants the specification improved. You will receive:
1. The updated idea text
2. The current system specification (function, assumptions, materials, processes, modules)

Your task: produce an IMPROVED specification that:
- Incorporates the updated idea text
- Preserves modules that are still correct/relevant
- Updates, adds, or removes modules as needed to match the revised idea
- Ensures all module IO chains are logically consistent
- Maintains the same quality standards as a fresh scan

IMPORTANT:
- Keep module IDs stable where the module concept hasn't changed (so downstream data like images, CAD models, and interviews can be preserved)
- If a module's purpose is fundamentally the same, keep its original ID
- If you add new modules, give them new unique IDs
- Exactly one module must be the gating module with diagnostic questions

Follow the same output format and quality requirements as a fresh scan.`

/**
 * Refines an existing spec by sending the current state + updated idea to AI.
 *
 * @description The AI reviews the existing decomposition and produces an
 * improved version that incorporates the updated idea while preserving
 * modules that are still correct. Module IDs are kept stable where possible
 * so downstream data (images, CAD, interviews) can be preserved.
 *
 * @param updatedIdea - The user's revised product idea text
 * @param currentSpec - The existing XRaySpec to refine
 * @returns A refined XRaySpec incorporating the changes
 *
 * @throws Error if AI call fails or response doesn't match schema
 */
export async function refineScanAI(
  updatedIdea: string,
  currentSpec: XRaySpec,
  researchReport?: string,
): Promise<XRaySpec> {
  if (USE_MOCK) {
    console.info("[XRayScan] Mock mode — returning fresh mock scan for refine")
    return mockScanIdea(updatedIdea)
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("[XRayScan] OPENAI_API_KEY is not configured")
  }

  const openai = new OpenAI({ apiKey })

  // Build a summary of the current spec for the AI
  const currentSpecSummary = buildSpecSummary(currentSpec)

  console.info("[XRayScan] Starting AI refine scan:", {
    ideaLength: updatedIdea.length,
    existingModuleCount: currentSpec.modules.length,
    hasResearch: !!researchReport,
  })

  // Build user message — include research report when available
  let userContent = `UPDATED IDEA:\n${updatedIdea}\n\nCURRENT SPECIFICATION:\n${currentSpecSummary}\n\nPlease produce an improved specification that incorporates the updated idea. Keep module IDs stable where the concept hasn't changed.`
  if (researchReport?.trim()) {
    userContent += `\n\n--- PRODUCT RESEARCH (from web search) ---\n\n${researchReport.trim()}`
  }

  const completion = await openai.chat.completions.parse({
    model: "gpt-5.4",
    messages: [
      { role: "system", content: REFINE_SCAN_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    response_format: zodResponseFormat(AIScanOutputSchema, "xray_scan"),
    max_tokens: 8192,
  })

  const parsed = completion.choices[0]?.message?.parsed
  if (!parsed) {
    const refusal = completion.choices[0]?.message?.refusal
    throw new Error(`[XRayScan] AI refused or returned no parsed output: ${refusal || "unknown"}`)
  }

  console.info("[XRayScan] AI refine scan complete:", {
    moduleCount: parsed.modules.length,
    gatingModule: parsed.modules.find((m: { isGatingModule?: boolean; name: string }) => m.isGatingModule)?.name,
  })

  // Merge AI output with existing spec: preserve runtime data for modules with matching IDs
  const existingModuleMap = new Map(currentSpec.modules.map((m) => [m.id, m]))

  const spec: XRaySpec = {
    idea: updatedIdea,
    function: parsed.function,
    assumptions: parsed.assumptions,
    materials: parsed.materials,
    processes: parsed.processes,
    validation: parsed.validation,
    modules: parsed.modules.map((aiModule) => {
      const existing = existingModuleMap.get(aiModule.id)

      const base: ModuleSpec = {
        ...aiModule,
        diagnostic: aiModule.diagnostic ? {
          ...aiModule.diagnostic,
          freeform: aiModule.diagnostic.freeform ?? undefined,
          derivedProcessClass: aiModule.diagnostic.derivedProcessClass ?? undefined,
          derivedRisks: aiModule.diagnostic.derivedRisks ?? undefined,
          questions: aiModule.diagnostic.questions.map((q) => ({
            ...q,
            answer: q.answer ?? undefined,
          })),
        } : undefined,
        imageStatus: "pending" as const,
      }

      // Preserve runtime data from existing module if the ID matches
      if (existing) {
        return {
          ...base,
          // Keep existing images, CAD, interviews, supplier assignments
          imageUrl: existing.imageUrl,
          imageStatus: existing.imageStatus ?? ("pending" as const),
          cadModel: existing.cadModel,
          interview: existing.interview,
          supplier: existing.supplier,
          estCost: existing.estCost,
          // Keep diagnostic answers if the module was already diagnosed
          diagnostic: base.diagnostic ?? existing.diagnostic,
        }
      }

      return base
    }),
    lastScannedAt: new Date().toISOString(),
    // Reset system image since the structure may have changed
    systemImageStatus: "pending" as const,
    // Preserve system analysis if it exists (will be recomputed as needed)
    systemAnalysis: currentSpec.systemAnalysis,
  }

  return spec
}

// ─── Refine Module (AI-assisted improvement of a single module) ──────

const REFINE_MODULE_SYSTEM_PROMPT = `You are a senior industrial systems engineer reviewing a single module of a larger machine.

The user has manually edited some fields of this module and wants AI assistance to improve and validate it. You will receive:
1. The edited module data
2. Context about the overall system (idea, function, other module names)

Your task: produce an IMPROVED version of this module that:
- Respects and preserves the user's manual edits (they are intentional)
- Ensures failure modes match the updated components
- Ensures expert questions are relevant to the updated design
- Makes descriptions technically accurate and specific
- Fills in any gaps the user may have left
- Maintains consistency with the broader system

IMPORTANT:
- Do NOT change the module ID
- Preserve the user's intent — enhance, don't override
- Be specific and technical (industry-standard terminology, real component specs)
- Expert questions should span at least 2 disciplines

Return the improved module matching the provided schema exactly.`

/**
 * Refines a single module using AI, preserving user edits and improving quality.
 *
 * @description The AI reviews user-edited module fields and improves them:
 * ensures failure modes match updated components, expert questions are
 * relevant, descriptions are technically accurate, and gaps are filled.
 *
 * @param editedModule - The module with user's manual edits
 * @param fullSpec - The full XRaySpec for system context
 * @returns An AI-refined version of the module
 *
 * @throws Error if AI call fails or response doesn't match schema
 */
export async function refineModuleAI(
  editedModule: ModuleSpec,
  fullSpec: XRaySpec,
): Promise<ModuleSpec> {
  if (USE_MOCK) {
    console.info("[XRayScan] Mock mode — returning edited module unchanged for refine")
    return editedModule
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("[XRayScan] OPENAI_API_KEY is not configured")
  }

  const openai = new OpenAI({ apiKey })

  // Build context about the system and the module being refined
  const systemContext = [
    `Product idea: ${fullSpec.idea}`,
    `System function: ${fullSpec.function}`,
    `Other modules: ${fullSpec.modules.filter((m) => m.id !== editedModule.id).map((m) => `${m.name} (${m.purpose})`).join(", ")}`,
  ].join("\n")

  const moduleJson = JSON.stringify({
    id: editedModule.id,
    name: editedModule.name,
    purpose: editedModule.purpose,
    io: editedModule.io,
    keyParts: editedModule.keyParts,
    tests: editedModule.tests,
    requirements: editedModule.requirements,
    detail: {
      whatItIs: editedModule.detail.whatItIs,
      whyItMatters: editedModule.detail.whyItMatters,
      commonFailureModes: editedModule.detail.commonFailureModes,
      unknownsToResolve: editedModule.detail.unknownsToResolve,
      expertQuestions: editedModule.detail.expertQuestions,
    },
    isGatingModule: editedModule.isGatingModule ?? false,
    diagnostic: editedModule.diagnostic ?? null,
  }, null, 2)

  console.info("[XRayScan] Starting AI module refine:", {
    moduleId: editedModule.id,
    moduleName: editedModule.name,
  })

  // Use a stripped-down schema for single-module output to avoid the full AIScanOutput
  const { z } = await import("zod")
  const { ExpertQuestionSchema, DisciplineSchema } = await import("./xray-schema")

  const SingleModuleOutputSchema = z.object({
    id: z.string(),
    name: z.string(),
    purpose: z.string(),
    io: z.object({
      in: z.array(z.string()).min(1),
      out: z.array(z.string()).min(1),
    }),
    keyParts: z.array(z.string()).min(3),
    tests: z.array(z.string()).min(1),
    requirements: z.object({
      leadWeeks: z.number(),
      notes: z.string(),
    }),
    detail: z.object({
      whatItIs: z.string(),
      whyItMatters: z.string(),
      commonFailureModes: z.array(z.string()).min(1),
      unknownsToResolve: z.array(z.string()).min(1),
      expertQuestions: z.array(ExpertQuestionSchema).min(2),
    }),
    isGatingModule: z.boolean(),
  })

  const completion = await openai.chat.completions.parse({
    model: "gpt-5.4",
    messages: [
      { role: "system", content: REFINE_MODULE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `SYSTEM CONTEXT:\n${systemContext}\n\nMODULE TO REFINE:\n${moduleJson}\n\nPlease improve this module while preserving the user's edits and intent.`,
      },
    ],
    response_format: zodResponseFormat(SingleModuleOutputSchema, "refined_module"),
    max_tokens: 4096,
  })

  const parsed = completion.choices[0]?.message?.parsed
  if (!parsed) {
    const refusal = completion.choices[0]?.message?.refusal
    throw new Error(`[XRayScan] AI refused or returned no parsed output: ${refusal || "unknown"}`)
  }

  console.info("[XRayScan] AI module refine complete:", {
    moduleId: parsed.id,
    keyPartsCount: parsed.keyParts.length,
    failureModesCount: parsed.detail.commonFailureModes.length,
  })

  // Merge AI refinement with existing runtime data
  const refined: ModuleSpec = {
    ...parsed,
    // Preserve all runtime/generated data from the original
    imageUrl: editedModule.imageUrl,
    imageStatus: editedModule.imageStatus,
    cadModel: editedModule.cadModel,
    interview: editedModule.interview,
    supplier: editedModule.supplier,
    estCost: editedModule.estCost,
    diagnostic: editedModule.diagnostic,
    moduleImagePrompt: editedModule.moduleImagePrompt,
    systemInterconnections: editedModule.systemInterconnections,
  }

  return refined
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Builds a concise text summary of a spec for AI context.
 *
 * @param spec - The XRaySpec to summarize
 * @returns A formatted string summarizing the spec
 */
function buildSpecSummary(spec: XRaySpec): string {
  const lines: string[] = [
    `Function: ${spec.function}`,
    `Assumptions: ${spec.assumptions.join("; ")}`,
    `Materials: ${spec.materials.join("; ")}`,
    `Processes: ${spec.processes.join("; ")}`,
    "",
    "Modules:",
  ]

  for (const m of spec.modules) {
    lines.push(`  - ID: ${m.id} | Name: ${m.name} | Purpose: ${m.purpose}`)
    lines.push(`    IO: [${m.io.in.join(", ")}] → [${m.io.out.join(", ")}]`)
    lines.push(`    Key parts: ${m.keyParts.join(", ")}`)
    lines.push(`    Lead time: ${m.requirements.leadWeeks} weeks`)
    if (m.isGatingModule) lines.push("    ** GATING MODULE **")
    lines.push("")
  }

  return lines.join("\n")
}

// ─── Mock data for development ─────────────────────────────────────

function newEmptySpec(idea: string): XRaySpec {
  return { idea, function: "", assumptions: [], materials: [], processes: [], validation: [], modules: [] }
}

function baseDetail(overrides: Partial<ModuleSpec["detail"]> = {}): ModuleSpec["detail"] {
  return {
    whatItIs: "A physical sub-assembly designed as a self-contained functional unit with clearly defined input and output interfaces. The module operates on a specific physical principle — whether mechanical, thermal, electrical, or chemical — to transform its input streams into the required output state.\n\nConstruction uses materials selected for compatibility with the process environment, referencing applicable standards (ASTM, ISO, or DIN) for material grade, surface finish, and weld quality. Key dimensional tolerances and performance specifications are called out to ensure interchangeability and reliable operation under the expected operating envelope.\n\nThis module interfaces with upstream and downstream modules via standardised flanged connections, electrical connectors, or signal buses. Critical performance parameters — flow rate, pressure drop, temperature stability, or signal integrity — must be maintained within specified bands to avoid cascading failures across the system.",
    whyItMatters: "Controls yield/safety/uptime/cost.",
    commonFailureModes: [
      "Ambiguous spec causes bid mismatch",
      "Wrong materials lead to corrosion/leaks",
      "No test plan → latent failures",
    ],
    unknownsToResolve: ["Operating envelope (T, pH, TDS)", "Compatibility with upstream/downstream"],
    expertQuestions: [
      { discipline: "Process", q: "What operating ranges must we tolerate (flow, TDS, temperature, pH)?" },
      { discipline: "Mechanical", q: "What wetted materials are acceptable (316L, duplex, plastics)?" },
    ],
    ...overrides,
  }
}

/**
 * Generates a mock XRaySpec for development without API keys.
 *
 * @param idea - The product idea text
 * @returns A pre-populated XRaySpec with sample modules
 */
export function mockScanIdea(idea: string): XRaySpec {
  const s = newEmptySpec(idea)
  s.function = "A modular processing machine performing staged transformations to produce a saleable output."
  s.assumptions = ["Skid-based system", "Corrosion resistant wetted path", "Designed for maintainability"]
  s.materials = ["316L stainless steel", "HDPE/PP for select plumbing", "Instrumentation", "Electronics/PLC"]
  s.processes = ["Skid fabrication", "Pipework & valves", "Controls & automation", "Commissioning"]
  s.validation = ["Leak test", "Instrument calibration", "72-hour endurance run", "Sampling protocol"]
  s.modules = [
    { id: "intake", name: "Intake & Pumping", purpose: "Stabilise flow/pressure into process modules", io: { in: ["Brine feed"], out: ["Pressurised feed"] }, keyParts: ["Pump", "Flowmeter", "Valves", "Pressure sensor"], tests: ["Flow calibration", "Cavitation check", "Leak check"], requirements: { leadWeeks: 3, notes: "Chemistry-resistant pump selection" }, detail: baseDetail({ whatItIs: "The intake and pumping module is the front-end receiving station that accepts raw brine from the feed source and conditions it to a stable flow rate and pressure suitable for downstream process modules. It operates on a centrifugal or positive-displacement pumping principle depending on feed viscosity and solids content, with a variable-frequency drive (VFD) providing turndown capability from 50% to 110% of design flow.\n\nThe pump casing and impeller are constructed from 316L stainless steel (ASTM A743 CF8M) to resist chloride-induced pitting corrosion at the expected TDS levels. All wetted seals are PTFE or Viton, selected per the chemical compatibility matrix for the target brine chemistry. The electromagnetic flowmeter (DN50, PTFE liner) provides ±0.5% accuracy and requires 5D/3D upstream/downstream straight runs.\n\nThis module delivers pressurised feed to the pre-treatment stage via a 2-inch 150# flanged connection. The discharge pressure setpoint (typically 3–6 bar) is controlled by a PID loop on the VFD and must remain within ±0.2 bar to avoid cavitation in the downstream filter train. A pressure relief valve (set at 1.1× design pressure) protects against deadhead conditions. The control system interfaces with the PLC via 4–20 mA signals for flow, pressure, and pump speed.", whyItMatters: "Everything downstream depends on stable feed; poor intake kills uptime.", expertQuestions: [{ discipline: "Process", q: "How variable is the feed?" }, { discipline: "Mechanical", q: "Which pump type is appropriate?" }, { discipline: "Operations", q: "Top 3 maintenance pain points?" }] }) },
    { id: "pretreat", name: "Pre-treatment", purpose: "Remove foulants / protect core process", io: { in: ["Pressurised feed"], out: ["Conditioned brine"] }, keyParts: ["Strainer", "Filter housing", "Backwash/CIP"], tests: ["Pressure drop test", "Fouling stress test"], requirements: { leadWeeks: 6, notes: "Fouling resilience" }, detail: baseDetail({ whatItIs: "The pre-treatment module is a multi-stage filtration and conditioning train that removes suspended solids, colloidal matter, and potential foulants from the pressurised brine before it enters the core reaction stage. It operates on a combination of mechanical straining (100 µm basket strainer) followed by crossflow microfiltration (0.2 µm ceramic membranes) to achieve a target turbidity of <1 NTU at the outlet.\n\nThe basket strainer housing is 316L stainless steel (ASTM A312 TP316L) with a 150# flanged body rated to 10 bar. Ceramic membrane elements are alpha-alumina (Al₂O₃) with a titanium dioxide active layer, selected for chemical resistance to the CIP regime (2% NaOH at 80°C, 0.5% citric acid). The CIP skid includes a 200 L HDPE chemical tank, a dosing pump (PVDF head), and an automated valve manifold for hands-free cleaning cycles.\n\nThe module receives pressurised feed from the intake module at 3–6 bar and delivers conditioned brine to the reaction stage at 2–4 bar (accounting for filter train pressure drop). A differential pressure transmitter across the membrane bank triggers automatic backwash at ΔP > 1.5 bar or CIP at ΔP > 2.5 bar. Failure to maintain clean membranes directly reduces throughput of the downstream reactor and can cause irreversible fouling.", whyItMatters: "Prevents performance collapse of the core reaction stage by ensuring feed quality stays within design limits." }) },
    { id: "react", name: "Reaction / Transformation", purpose: "Change chemistry/physics to enable extraction", io: { in: ["Conditioned brine"], out: ["Converted stream"] }, keyParts: ["Reactor/vessel", "Dosing", "Agitation", "Temperature control"], tests: ["Kinetics sanity", "Yield verification"], requirements: { leadWeeks: 8, notes: "Kinetics + dosing control" }, isGatingModule: true, diagnostic: { questions: [{ id: "where_product_exists", question: "Where does the product exist right now?", options: ["Dissolved in a liquid", "Suspended particles in liquid", "Mixed solids", "Gas", "Created by combining ingredients", "Grown/produced by organisms"] }, { id: "trigger_mechanism", question: "What triggers the transformation?", options: ["Add chemical", "Change temperature", "Change pressure", "Electricity", "Biological activity", "Mechanical action"] }, { id: "timescale", question: "What is the timescale?", options: ["Seconds", "Minutes", "Hours", "Days"] }, { id: "control_sensitivity", question: "How sensitive is the process to control?", options: ["Naturally stable", "Temperature sensitive", "Concentration sensitive", "Mixing sensitive", "All of the above"] }, { id: "post_reaction_form", question: "After reaction, what does it look like?", options: ["Crystals in liquid", "Powder", "Sticky mass", "New liquid", "Gas bubbles", "Living biomass"] }] }, detail: baseDetail({ whatItIs: "The reaction and transformation module is the gating stage of the entire system — the vessel or reactor where the primary chemical, physical, or biological transformation converts the conditioned feed stream into the target product or intermediate. Depending on the derived process class, this may operate as a continuously stirred tank reactor (CSTR), a plug-flow tubular reactor, a batch crystalliser, or a biological fermentation vessel. The operating principle is governed by the specific reaction kinetics, thermodynamics, and mass-transfer characteristics of the transformation.\n\nThe reactor vessel is fabricated from 316L stainless steel (ASTM A240 / ASME Section VIII Div. 1) with electropolished internals to Ra ≤ 0.8 µm for cleanability. The agitator is a pitched-blade turbine driven by a 5.5 kW motor with mechanical seal (SiC/SiC, Plan 11 flush). Temperature control is provided by a half-pipe jacket with glycol circulation, capable of maintaining ±1°C across the 40–90°C operating range. Reagent dosing uses peristaltic pumps with pulse-dampened PTFE tubing for volumetric accuracy of ±1%.\n\nThis module receives conditioned brine from pre-treatment and discharges the converted stream (slurry, solution, or mixed-phase) to the separation/solids-handling stage. The reaction yield and selectivity are the primary economic drivers of the entire system — if this module underperforms, all downstream equipment is oversized and all supplier quotes are invalid. Critical control parameters include temperature, pH (±0.2 units), reagent stoichiometry, and residence time. The PLC monitors these via inline sensors and adjusts dosing and jacket flow in real time.", whyItMatters: "This drives the economics of the entire system; ambiguity in the transformation step makes all downstream supplier quotes meaningless and all equipment sizing unreliable.", expertQuestions: [{ discipline: "Process", q: "What mechanism is most plausible?" }, { discipline: "Mechanical", q: "Is this batch or continuous?" }, { discipline: "Regulatory", q: "Any hazardous reagents/byproducts?" }] }) },
    { id: "solids", name: "Separation / Solids Handling", purpose: "Separate phases, dewater, package", io: { in: ["Slurry / mixed stream"], out: ["Solid product + filtrate"] }, keyParts: ["Filter press", "Centrifuge", "Dryer (optional)"], tests: ["Moisture spec test", "Throughput test"], requirements: { leadWeeks: 10, notes: "Downstream product spec" }, detail: baseDetail({ whatItIs: "The separation and solids-handling module comprises the downstream unit operations that isolate the target product from the reactor discharge, dewater it to the required moisture specification, and prepare it for packaging or further processing. Depending on the product morphology, this may include a decanter centrifuge for primary liquid–solid separation, a filter press for final dewatering, and optionally a rotary or flash dryer if the customer specification demands moisture content below 5%.\n\nThe decanter centrifuge bowl and scroll are constructed from duplex stainless steel (UNS S31803 / ASTM A890 Grade 4A) for combined corrosion resistance and wear resistance at the solids discharge zone. The filter press frames are polypropylene with EPDM diaphragms, rated for 15 bar squeeze pressure. Filter cloths are monofilament polypropylene (30 µm retention), selected for cake release characteristics specific to the product crystal habit. All wetted surfaces in the dryer are 316L with mirror finish to prevent product adhesion.\n\nThis module receives the converted slurry stream from the reactor at 5–20% solids by weight and produces a filter cake or dried product meeting the target moisture and purity specification. Filtrate is returned to the process or routed to waste treatment. The throughput of this module is often the bottleneck of the entire system — centrifuge bowl volume and filter press plate count must be sized for the peak batch discharge rate from the reactor. The control system monitors cake moisture via inline NIR and adjusts press cycle time and dryer temperature accordingly.", whyItMatters: "Determines final product quality, moisture spec compliance, and downstream handling cost — an undersized separation train becomes the system bottleneck." }) },
    { id: "controls", name: "Controls & Instrumentation", purpose: "Stability, observability, alarms, data capture", io: { in: ["Sensor signals"], out: ["Actuation + logs"] }, keyParts: ["PLC", "HMI", "I/O", "Network", "Data logging"], tests: ["Interlock test", "Alarm simulation", "Data integrity check"], requirements: { leadWeeks: 6, notes: "Logging & traceability" }, detail: baseDetail({ whatItIs: "The controls and instrumentation module is the automation layer that provides closed-loop process control, safety interlocking, operator interface, and data acquisition for all process modules. It is built around an industrial PLC (e.g., Siemens S7-1500 or Allen-Bradley CompactLogix) executing scan cycles at ≤50 ms, with redundant communication buses (PROFINET or EtherNet/IP) connecting distributed I/O racks mounted on each process skid.\n\nThe PLC rack is housed in a NEMA 4X (IP66) stainless steel enclosure with climate control (thermoelectric cooler) for ambient temperatures up to 50°C. All field instruments use 4–20 mA HART protocol for diagnostics capability, with critical safety instruments (pressure relief, level high-high, emergency stop) wired as hardwired SIL-2 interlocks independent of the PLC. The HMI is a 15-inch industrial touchscreen (IP65 front face) running SCADA software with role-based access control, alarm management per ISA-18.2, and trend logging at 1-second resolution.\n\nThis module interfaces with every other module in the system via sensor inputs and actuator outputs. It is the central nervous system: if the controls module fails or provides inaccurate readings, all process modules operate blind, and the safety interlocks cannot protect equipment or personnel. The data historian logs all process variables, alarms, and operator actions with timestamps for regulatory compliance, batch traceability, and continuous improvement. The network architecture includes an air-gapped OT/IT boundary with a unidirectional data diode for secure export to the enterprise network.", whyItMatters: "Without reliable controls and instrumentation, no process module can maintain stable operating points, safety interlocks cannot function, and regulatory traceability requirements cannot be met.", expertQuestions: [{ discipline: "Controls", q: "Minimum viable sensor set?" }, { discipline: "Controls", q: "Which alarms/interlocks are non-negotiable?" }, { discipline: "Commercial", q: "What evidence/logs will buyers demand?" }] }) },
  ]
  s.lastScannedAt = new Date().toISOString()
  return s
}
