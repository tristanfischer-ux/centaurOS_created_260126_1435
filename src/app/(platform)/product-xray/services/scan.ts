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
   - **whatItIs**: 2-3 sentence technical description including operating principles and material considerations
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
): Promise<XRaySpec> {
  if (USE_MOCK) {
    console.info("[XRayScan] Mock mode — returning fresh mock scan for refine")
    return mockScanIdea(updatedIdea)
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("[XRayScan] OPENAI_API_KEY is not configured")
  }

  const openai = new OpenAI({ apiKey })

  // Build a summary of the current spec for the AI
  const currentSpecSummary = buildSpecSummary(currentSpec)

  console.info("[XRayScan] Starting AI refine scan:", {
    ideaLength: updatedIdea.length,
    existingModuleCount: currentSpec.modules.length,
  })

  const completion = await openai.chat.completions.parse({
    model: "gpt-4o-2024-08-06",
    messages: [
      { role: "system", content: REFINE_SCAN_SYSTEM_PROMPT },
      {
        role: "user",
        content: `UPDATED IDEA:\n${updatedIdea}\n\nCURRENT SPECIFICATION:\n${currentSpecSummary}\n\nPlease produce an improved specification that incorporates the updated idea. Keep module IDs stable where the concept hasn't changed.`,
      },
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

  const apiKey = process.env.OPENAI_API_KEY
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
    model: "gpt-4o-2024-08-06",
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
    whatItIs: "Sub-assembly with clear IO and tests.",
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
    { id: "intake", name: "Intake & Pumping", purpose: "Stabilise flow/pressure into process modules", io: { in: ["Brine feed"], out: ["Pressurised feed"] }, keyParts: ["Pump", "Flowmeter", "Valves", "Pressure sensor"], tests: ["Flow calibration", "Cavitation check", "Leak check"], requirements: { leadWeeks: 3, notes: "Chemistry-resistant pump selection" }, detail: baseDetail({ whatItIs: "Front-end that receives brine and delivers stable flow/pressure.", whyItMatters: "Everything downstream depends on stable feed; poor intake kills uptime.", expertQuestions: [{ discipline: "Process", q: "How variable is the feed?" }, { discipline: "Mechanical", q: "Which pump type is appropriate?" }, { discipline: "Operations", q: "Top 3 maintenance pain points?" }] }) },
    { id: "pretreat", name: "Pre-treatment", purpose: "Remove foulants / protect core process", io: { in: ["Pressurised feed"], out: ["Conditioned brine"] }, keyParts: ["Strainer", "Filter housing", "Backwash/CIP"], tests: ["Pressure drop test", "Fouling stress test"], requirements: { leadWeeks: 6, notes: "Fouling resilience" }, detail: baseDetail({ whatItIs: "Screens/filters/CIP to protect the extraction steps.", whyItMatters: "Prevents performance collapse." }) },
    { id: "react", name: "Reaction / Transformation", purpose: "Change chemistry/physics to enable extraction", io: { in: ["Conditioned brine"], out: ["Converted stream"] }, keyParts: ["Reactor/vessel", "Dosing", "Agitation", "Temperature control"], tests: ["Kinetics sanity", "Yield verification"], requirements: { leadWeeks: 8, notes: "Kinetics + dosing control" }, isGatingModule: true, diagnostic: { questions: [{ id: "where_product_exists", question: "Where does the product exist right now?", options: ["Dissolved in a liquid", "Suspended particles in liquid", "Mixed solids", "Gas", "Created by combining ingredients", "Grown/produced by organisms"] }, { id: "trigger_mechanism", question: "What triggers the transformation?", options: ["Add chemical", "Change temperature", "Change pressure", "Electricity", "Biological activity", "Mechanical action"] }, { id: "timescale", question: "What is the timescale?", options: ["Seconds", "Minutes", "Hours", "Days"] }, { id: "control_sensitivity", question: "How sensitive is the process to control?", options: ["Naturally stable", "Temperature sensitive", "Concentration sensitive", "Mixing sensitive", "All of the above"] }, { id: "post_reaction_form", question: "After reaction, what does it look like?", options: ["Crystals in liquid", "Powder", "Sticky mass", "New liquid", "Gas bubbles", "Living biomass"] }] }, detail: baseDetail({ whatItIs: "The heart of the system where the transformation occurs.", whyItMatters: "This drives economics; ambiguity here makes all supplier quotes meaningless.", expertQuestions: [{ discipline: "Process", q: "What mechanism is most plausible?" }, { discipline: "Mechanical", q: "Is this batch or continuous?" }, { discipline: "Regulatory", q: "Any hazardous reagents/byproducts?" }] }) },
    { id: "solids", name: "Separation / Solids Handling", purpose: "Separate phases, dewater, package", io: { in: ["Slurry / mixed stream"], out: ["Solid product + filtrate"] }, keyParts: ["Filter press", "Centrifuge", "Dryer (optional)"], tests: ["Moisture spec test", "Throughput test"], requirements: { leadWeeks: 10, notes: "Downstream product spec" }, detail: baseDetail({ whatItIs: "Downstream unit ops.", whyItMatters: "Determines product quality + handling cost." }) },
    { id: "controls", name: "Controls & Instrumentation", purpose: "Stability, observability, alarms, data capture", io: { in: ["Sensor signals"], out: ["Actuation + logs"] }, keyParts: ["PLC", "HMI", "I/O", "Network", "Data logging"], tests: ["Interlock test", "Alarm simulation", "Data integrity check"], requirements: { leadWeeks: 6, notes: "Logging & traceability" }, detail: baseDetail({ whatItIs: "Automation layer: PLC logic, safety interlocks, HMI screens, and logging.", whyItMatters: "Without good controls you can't hold stable operating points.", expertQuestions: [{ discipline: "Controls", q: "Minimum viable sensor set?" }, { discipline: "Controls", q: "Which alarms/interlocks are non-negotiable?" }, { discipline: "Commercial", q: "What evidence/logs will buyers demand?" }] }) },
  ]
  s.lastScannedAt = new Date().toISOString()
  return s
}
