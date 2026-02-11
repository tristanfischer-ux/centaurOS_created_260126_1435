/**
 * @file cad-generator.ts — AI-powered 3D CAD model generation for X-Ray
 *
 * @description Two-tier CAD generation pipeline:
 *
 * **System model (HERO):** Opus 4.6 with 32K tokens produces a highly detailed,
 * manufacturing-quality CadQuery model of the complete assembled product. This is
 * THE 3D visualization — it gets the royal treatment (300-800 lines, shell bodies,
 * internal structure, surface detail).
 *
 * **Module models (SCHEMATICS):** Gemini 2.5 Pro produces clean, reliable
 * schematic-quality CadQuery models of individual sub-assemblies. These are
 * supporting visuals — recognizable and well-proportioned, but focused on
 * clarity over manufacturing detail (100-250 lines, key features only).
 *
 * This split is intentional: one amazing hero model is far more impactful than
 * 8 mediocre ones. Gemini handles modules because it's faster, cheaper, and
 * less prone to safety refusals on industrial/drone/agricultural components.
 *
 * @security
 * - ANTHROPIC_API_KEY for Opus (system model)
 * - GOOGLE_AI_API_KEY for Gemini (module models + Opus fallback)
 * - MODAL_CAD_ENDPOINT_URL for CadQuery execution
 * - Modal containers are sandboxed (no ForgeOS infra access)
 * - Generated code is validated for blocked patterns before execution
 *
 * @related
 * - Structural brief: ./structural-brief.ts (Opus orchestrator for consistency)
 * - Image generator: ./image-generator.ts (parallel 2D pipeline)
 * - Schema: ./xray-schema.ts (cadModel field on ModuleSpec)
 * - Modal worker: /modal_cad_worker.py (Python execution environment)
 * - Server actions: src/actions/xray.ts (orchestrates generation)
 */

import { createAdminClient } from "@/lib/supabase/admin"

import type { ModuleSpec, ModuleAnalysis, XRaySpec } from "./xray-schema"
import type { StructuralBrief, SystemStructuralBrief } from "./structural-brief"

// ─── Constants ───────────────────────────────────────────────────────

const STORAGE_BUCKET = "xray-images"
const MODAL_TIMEOUT_MS = 180_000
/** Number of retry attempts when CadQuery execution fails on Modal */
const MAX_RETRY_ATTEMPTS = 3

// ─── Common Material Densities (kg/m³) ───────────────────────────────

/**
 * Material density lookup for analysis computations.
 * Matched against module material descriptions via keyword matching.
 */
const MATERIAL_DENSITIES: Record<string, number> = {
  pla: 1240,
  petg: 1270,
  abs: 1040,
  nylon: 1140,
  tpu: 1210,
  pc: 1200,
  asa: 1070,
  resin: 1100,
  aluminum: 2700,
  steel: 7850,
  titanium: 4500,
  carbon_fiber: 1600,
  default: 1240,
}

/**
 * Infers material density from module spec by keyword matching.
 *
 * @param module - The module spec to extract material info from
 * @returns Density in kg/m³, defaults to PLA (1240)
 */
function inferMaterialDensity(module: ModuleSpec): { density: number; name: string } {
  const text = [
    module.detail.materialJustification ?? "",
    module.detail.whatItIs,
    ...module.keyParts,
  ].join(" ").toLowerCase()

  for (const [material, density] of Object.entries(MATERIAL_DENSITIES)) {
    if (material === "default") continue
    if (text.includes(material.replace("_", " ")) || text.includes(material)) {
      return { density, name: material }
    }
  }
  return { density: MATERIAL_DENSITIES.default, name: "PLA (default)" }
}

// ─── Types ───────────────────────────────────────────────────────────

/**
 * Custom error class that preserves the last-attempted CadQuery code.
 *
 * @description When CAD generation fails after all retries, this error
 * carries the code that was last sent to Modal so it can be persisted
 * for debugging purposes.
 */
export class CadGenerationError extends Error {
  public readonly cadQueryCode: string

  constructor(message: string, cadQueryCode: string) {
    super(message)
    this.name = "CadGenerationError"
    this.cadQueryCode = cadQueryCode
  }
}

/** Result of a successful CAD model generation (now includes analysis) */
export interface CadModelResult {
  stepUrl: string | undefined
  stlUrl: string | undefined
  svgIsoUrl: string | undefined
  svgTopUrl: string | undefined
  svgFrontUrl: string | undefined
  svgRightUrl: string | undefined
  cadQueryCode: string
  analysis: ModuleAnalysis | undefined
}

/** Response from Modal's generate_cad endpoint */
interface ModalCadResponse {
  error: string | null
  step: string | null
  stl: string | null
  svg_iso: string | null
  svg_top: string | null
  svg_front: string | null
  svg_right: string | null
  analysis: ModalAnalysisPayload | null
}

/** Analysis payload from Modal worker */
interface ModalAnalysisPayload {
  mass_properties: {
    mass_kg: number
    volume_mm3: number
    surface_area_mm2?: number
    center_of_gravity: [number, number, number]
    moment_of_inertia: {
      Ixx: number; Iyy: number; Izz: number
      Ixy: number; Ixz: number; Iyz: number
    }
    bounding_box: {
      xLen: number; yLen: number; zLen: number
      xMin: number; yMin: number; zMin: number
      xMax: number; yMax: number; zMax: number
    }
    material_density_kg_m3: number
    error?: string
  } | null
  dfm: {
    printable: boolean
    issues: Array<{ severity: string; category: string; message: string }>
    estimated_print_time_min?: number
    estimated_material_g?: number
    support_volume_pct?: number
    compatible_printers?: string[]
    error?: string
  } | null
}

// ─── Module Schematic Prompt (Gemini) ────────────────────────────────

/**
 * System prompt for Gemini-generated module schematics.
 *
 * @description Optimized for clean, reliable, recognizable models — not
 * manufacturing detail. These are supporting visuals for individual modules
 * while the system-level model (Opus) is the hero.
 */
const MODULE_SCHEMATIC_PROMPT = `You are an expert CadQuery engineer creating clean, recognizable 3D schematic models of engineering sub-assemblies.

## Goal
Create a model that clearly shows WHAT this component is and HOW it works. Focus on recognizability and spatial relationships, not manufacturing detail. Think "engineering textbook cutaway" — clean geometry that teaches, not a production CAD file.

## Rules
1. Output ONLY valid Python code using CadQuery. No markdown fences, no explanation.
2. Import only \`cadquery as cq\` and \`math\`. No other imports.
3. All dimensions in millimeters.
4. The final model MUST be stored in a variable called \`result\`.
5. Target 100-250 lines. Enough for a recognizable multi-component assembly.
6. NEVER produce fewer than 80 lines.
7. Do NOT use \`open()\`, \`exec()\`, \`eval()\`, or file I/O.
8. Do NOT include print statements.

## What Makes a Good Schematic Model
1. **Recognizable overall shape** — the silhouette tells you what it is.
2. **Key functional components visible** — the 3-5 most important parts as distinct shapes.
3. **Clear spatial arrangement** — where things sit relative to each other.
4. **Connection points visible** — pipe stubs, mounting flanges, ports show how it connects.
5. **Proportionally accurate** — realistic dimensions from the brief.

## What to SKIP (save detail for the hero model)
- Internal ribs and structural reinforcement
- Screw bosses and bolt patterns
- Wire channels and cable routing
- Ventilation grilles and decorative features
- Manufacturing tolerances

## Build Strategy
1. Start with a PARAMETERS block.
2. Build the main body (use .cut() for hollow bodies where the cavity matters functionally).
3. Add 3-5 key components via .union().
4. Add input/output stubs (pipes, flanges, connectors).
5. Apply fillets for clean appearance — wrap in try/except.

## Reliability
- Do NOT use \`.shell()\` — build hollow bodies with \`.cut()\`.
- Wrap \`.fillet()\` in try/except, fall back to \`.chamfer()\` at half radius.
- Use tuples for \`.transformed(offset=(x,y,z))\`.
- Build incrementally with intermediate variables.

Output just the Python code.`

// ─── AI Provider Helpers ─────────────────────────────────────────────

/**
 * Calls Claude Opus 4.6 for CadQuery code generation (non-streaming).
 *
 * @param systemPrompt - The system prompt
 * @param userPrompt - The user prompt
 * @param temperature - Sampling temperature (default 0.3)
 * @returns The generated text
 *
 * @throws Error if ANTHROPIC_API_KEY is missing or API call fails
 */
async function callOpus(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.3,
  maxTokens: number = 16384,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error("[XRayCadGen] ANTHROPIC_API_KEY is not configured")
  }

  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey })

  const ANTHROPIC_MODELS = ["claude-opus-4-6", "claude-sonnet-4-5"] as const

  for (const model of ANTHROPIC_MODELS) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      })

      const blockTypes = response.content.map((b) => b.type)
      console.info(`[XRayCadGen] ${model} response:`, {
        stopReason: response.stop_reason,
        blockTypes,
        blockCount: response.content.length,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
      })

      // Handle refusal — try next model
      if (response.stop_reason === "refusal" || response.content.length === 0) {
        console.warn(`[XRayCadGen] ${model} refused — trying fallback`)
        continue
      }

      const texts: string[] = []
      for (const block of response.content) {
        if (block.type === "text") {
          texts.push(block.text)
        }
      }

      if (texts.length > 0) {
        return texts.join("\n")
      }

      console.warn(`[XRayCadGen] ${model} returned no text blocks — trying fallback`)
    } catch (error) {
      console.warn(`[XRayCadGen] ${model} error:`, error instanceof Error ? error.message : error)
      continue
    }
  }

  // ── Gemini fallback (different safety characteristics) ──
  const geminiKey = process.env.GOOGLE_AI_API_KEY
  if (!geminiKey) {
    throw new Error("[XRayCadGen] All Anthropic models refused and GOOGLE_AI_API_KEY is missing")
  }

  console.info("[XRayCadGen] All Anthropic models refused — falling back to Gemini")

  const geminiModel = "gemini-2.5-pro"
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`

  const geminiResponse = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature },
    }),
  })

  if (!geminiResponse.ok) {
    const errText = await geminiResponse.text()
    throw new Error(`[XRayCadGen] Gemini error (${geminiResponse.status}): ${errText.slice(0, 300)}`)
  }

  const data = await geminiResponse.json()
  const text = data.candidates?.[0]?.content?.parts
    ?.filter((p: { text?: string }) => p.text)
    ?.map((p: { text: string }) => p.text)
    ?.join("\n")

  if (!text) {
    throw new Error("[XRayCadGen] All models failed to generate content")
  }

  console.info("[XRayCadGen] Gemini fallback succeeded:", { textLength: text.length })
  return text
}

/**
 * Calls Gemini 2.5 Pro for CadQuery code generation (non-streaming).
 * Used as fallback when Opus retries are exhausted.
 *
 * @param systemPrompt - The system prompt
 * @param userPrompt - The user prompt
 * @returns The generated text
 *
 * @throws Error if GOOGLE_AI_API_KEY is missing or API call fails
 */
async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 16384,
): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    throw new Error("[XRayCadGen] GOOGLE_AI_API_KEY is not configured")
  }

  const { GoogleGenerativeAI } = await import("@google/generative-ai")
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" })

  const result = await model.generateContent({
    contents: [
      { role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.3,
    },
  })

  const text = result.response.text()
  if (!text) {
    throw new Error("[XRayCadGen] Gemini returned empty response")
  }

  return text
}

/**
 * Strips markdown code fences from AI-generated code.
 *
 * @param raw - Raw AI response that may contain ```python fences
 * @returns Clean Python code
 */
function stripCodeFences(raw: string): string {
  return raw
    .replace(/^```(?:python)?\n?/gm, "")
    .replace(/\n?```$/gm, "")
    .trim()
}

// ─── Module Code Generation (Gemini — schematic quality) ─────────────

/**
 * Generates CadQuery Python code for a module schematic using Gemini 2.5 Pro.
 *
 * @description Uses Gemini for module schematics because it's faster, cheaper,
 * and less prone to safety refusals. The system-level model (Opus) is the hero;
 * modules are clean supporting visuals.
 *
 * @param module - The module spec for context
 * @param brief - The structural brief from Opus orchestrator
 * @returns The CadQuery Python code as a string
 *
 * @throws Error if AI call fails
 */
async function generateModuleSchematicCode(
  module: ModuleSpec,
  brief: StructuralBrief,
): Promise<string> {
  const userPrompt = buildModuleSchematicPrompt(module, brief)

  console.info("[XRayCadGen] Generating schematic CadQuery with Gemini for module:", {
    moduleId: module.id,
    moduleName: module.name,
  })

  const raw = await callGemini(MODULE_SCHEMATIC_PROMPT, userPrompt, 8192)
  return stripCodeFences(raw)
}

/**
 * Regenerates module CadQuery code after a failed execution using Gemini.
 *
 * @param module - The module spec for context
 * @param brief - The structural brief
 * @param failedCode - The CadQuery code that failed execution
 * @param errorMessage - The error returned by Modal
 * @returns Corrected CadQuery Python code
 *
 * @throws Error if AI call fails
 */
async function regenerateModuleSchematicCode(
  module: ModuleSpec,
  brief: StructuralBrief,
  failedCode: string,
  errorMessage: string,
): Promise<string> {
  const retryPrompt = `The following CadQuery code for the "${module.name}" module failed during execution.

**Error:**
\`\`\`
${errorMessage.slice(0, 1200)}
\`\`\`

**Failed code:**
\`\`\`python
${failedCode}
\`\`\`

**Structural brief for reference:**
Overall dimensions: ${brief.overallDimensions}
${brief.cadInstructions}

Fix the code so it executes without errors. Common CadQuery pitfalls:
- NEVER use \`.shell()\` — build hollow bodies with \`.cut()\` instead
- \`.fillet()\` fails if radius is too large — reduce radii or wrap in try/except with .chamfer() fallback
- Boolean ops (\`.cut()\`, \`.union()\`) fail if shapes don't overlap — verify positioning
- \`.transformed(offset=(x,y,z))\` uses tuples, not lists

Fix the error while keeping the model recognizable. Output ONLY the corrected Python code.
Store the final model in a variable called \`result\`.`

  console.info("[XRayCadGen] Retrying module schematic with Gemini:", {
    moduleId: module.id,
    errorSnippet: errorMessage.slice(0, 120),
  })

  const raw = await callGemini(MODULE_SCHEMATIC_PROMPT, retryPrompt, 8192)
  return stripCodeFences(raw)
}

/**
 * Builds the user prompt for module schematic generation.
 *
 * @description Focused on recognizability and spatial clarity — not manufacturing
 * detail. The system-level model handles the hero visualization.
 *
 * @param module - The module spec
 * @param brief - The structural brief from Opus orchestrator
 * @returns Formatted prompt string
 */
function buildModuleSchematicPrompt(module: ModuleSpec, brief: StructuralBrief): string {
  return `Create a clean 3D schematic model of this engineering sub-assembly.

**Module:** ${module.name}
**Purpose:** ${module.purpose}

**Overall Dimensions:** ${brief.overallDimensions}

**Physical Structure:**
${brief.physicalDescription}

**CadQuery Build Instructions:**
${brief.cadInstructions}

**Key Components (show these as recognizable shapes):**
${module.keyParts.map((p) => `- ${p}`).join("\n")}

**Inputs:** ${module.io.in.join(", ")}
**Outputs:** ${module.io.out.join(", ")}

## What to Build
1. Main body/housing with correct overall proportions.
2. The 3-5 most important components as distinct geometric features.
3. Input/output connection points (pipe stubs, flanges, ports).
4. Where cavities matter functionally, use .cut() for hollow bodies.

The model should be immediately recognizable as a ${module.name} — the silhouette and key features should tell you what it is.

Store the final model in a variable called \`result\`.`
}

// ─── Modal Execution ─────────────────────────────────────────────────

/**
 * Sends CadQuery code to Modal for execution, file export, and analysis.
 *
 * @param code - The CadQuery Python code to execute
 * @param moduleId - Module identifier for logging
 * @param materialDensity - Material density in kg/m³ for mass calculations
 * @returns The Modal response with base64-encoded files and analysis results
 *
 * @throws Error if Modal endpoint is not configured or request fails
 */
async function executeCadQueryOnModal(
  code: string,
  moduleId: string,
  materialDensity: number = 1240,
): Promise<ModalCadResponse> {
  const endpointUrl = process.env.MODAL_CAD_ENDPOINT_URL
  if (!endpointUrl) {
    throw new Error("[XRayCadGen] MODAL_CAD_ENDPOINT_URL is not configured")
  }

  console.info("[XRayCadGen] Sending code to Modal for execution:", {
    moduleId,
    codeLength: code.length,
  })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), MODAL_TIMEOUT_MS)

  try {
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, module_id: moduleId, material_density: materialDensity }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(
        `[XRayCadGen] Modal API error (${response.status}): ${errText.slice(0, 300)}`,
      )
    }

    return (await response.json()) as ModalCadResponse
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`[XRayCadGen] Modal execution timed out after ${MODAL_TIMEOUT_MS / 1000}s`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

// ─── Storage Upload ──────────────────────────────────────────────────

/**
 * Uploads a base64-encoded file to Supabase Storage and returns the public URL.
 *
 * @param scanId - The scan ID for path namespacing
 * @param filename - The filename (e.g., "module-intake/model.step")
 * @param base64Data - The base64-encoded file data
 * @param mimeType - The MIME type of the file
 * @returns The public URL of the uploaded file
 */
async function uploadCadFile(
  scanId: string,
  filename: string,
  base64Data: string,
  mimeType: string,
): Promise<string> {
  const supabase = createAdminClient()
  const buffer = Buffer.from(base64Data, "base64")
  const path = `${scanId}/cad/${filename}`

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: true,
    })

  if (error) {
    throw new Error(`[XRayCadGen] Storage upload failed for ${filename}: ${error.message}`)
  }

  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path)

  return urlData.publicUrl
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Generates a 3D schematic CAD model for a single module using Gemini.
 *
 * @description Pipeline: Structural brief -> Gemini generates schematic CadQuery ->
 * Modal executes it -> files uploaded to storage. Uses Gemini exclusively (no Opus)
 * because module models are supporting schematics, not hero visualizations.
 *
 * @param scanId - The scan ID for storage namespacing
 * @param module - The module to generate a CAD model for
 * @param brief - The structural brief from the Opus orchestrator
 * @returns URLs for all generated files (STEP, STL, SVGs) and the source code
 *
 * @throws CadGenerationError if all retry attempts fail
 */
export async function generateModuleCadModel(
  scanId: string,
  module: ModuleSpec,
  brief?: StructuralBrief,
): Promise<CadModelResult> {
  // Stage 0: Generate structural brief if not provided
  if (!brief) {
    const { generateModuleStructuralBrief } = await import("./structural-brief")
    brief = await generateModuleStructuralBrief(module)
  }

  // Stage 0b: Infer material density from module spec
  const { density: materialDensity, name: materialName } = inferMaterialDensity(module)

  // Stage 1: Gemini generates schematic CadQuery code
  let cadQueryCode = await generateModuleSchematicCode(module, brief)

  // Stage 2: Modal executes the code (with auto-retry on failure)
  let modalResult = await executeCadQueryOnModal(cadQueryCode, module.id, materialDensity)

  // Retry loop: Gemini retries with error feedback (all Gemini, no Opus needed)
  if (modalResult.error) {
    let lastError: string = modalResult.error
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      console.warn("[XRayCadGen] Module schematic execution failed, retrying:", {
        moduleId: module.id,
        attempt,
        maxRetries: MAX_RETRY_ATTEMPTS,
        error: lastError.slice(0, 200),
      })

      try {
        cadQueryCode = await regenerateModuleSchematicCode(
          module, brief, cadQueryCode, lastError,
        )

        modalResult = await executeCadQueryOnModal(cadQueryCode, module.id, materialDensity)

        if (!modalResult.error) {
          console.info("[XRayCadGen] Module schematic retry succeeded:", {
            moduleId: module.id,
            attempt,
          })
          break
        }
        lastError = modalResult.error
      } catch (retryError) {
        console.error("[XRayCadGen] Module schematic retry failed:", {
          moduleId: module.id,
          attempt,
          error: retryError instanceof Error ? retryError.message : "Unknown",
        })
      }
    }
  }

  if (modalResult.error) {
    throw new CadGenerationError(
      `[XRayCadGen] Module schematic execution failed: ${modalResult.error}`,
      cadQueryCode,
    )
  }

  // Stage 3: Upload files to Supabase Storage
  const prefix = `module-${module.id}`

  const [stepUrl, stlUrl, svgIsoUrl, svgTopUrl, svgFrontUrl, svgRightUrl] = await Promise.all([
    modalResult.step
      ? uploadCadFile(scanId, `${prefix}/model.step`, modalResult.step, "application/step")
      : Promise.resolve(undefined),
    modalResult.stl
      ? uploadCadFile(scanId, `${prefix}/model.stl`, modalResult.stl, "model/stl")
      : Promise.resolve(undefined),
    modalResult.svg_iso
      ? uploadCadFile(scanId, `${prefix}/iso.svg`, modalResult.svg_iso, "image/svg+xml")
      : Promise.resolve(undefined),
    modalResult.svg_top
      ? uploadCadFile(scanId, `${prefix}/top.svg`, modalResult.svg_top, "image/svg+xml")
      : Promise.resolve(undefined),
    modalResult.svg_front
      ? uploadCadFile(scanId, `${prefix}/front.svg`, modalResult.svg_front, "image/svg+xml")
      : Promise.resolve(undefined),
    modalResult.svg_right
      ? uploadCadFile(scanId, `${prefix}/right.svg`, modalResult.svg_right, "image/svg+xml")
      : Promise.resolve(undefined),
  ])

  // Stage 4: Convert analysis results from Modal format to schema format
  const analysis = convertModalAnalysis(modalResult.analysis, materialName)

  console.info("[XRayCadGen] Module schematic generated and uploaded:", {
    moduleId: module.id,
    hasStep: !!stepUrl,
    hasStl: !!stlUrl,
    hasSvgs: !!svgIsoUrl,
    hasAnalysis: !!analysis,
    mass_g: analysis?.massProperties ? analysis.massProperties.mass_kg * 1000 : undefined,
  })

  return {
    stepUrl,
    stlUrl,
    svgIsoUrl,
    svgTopUrl,
    svgFrontUrl,
    svgRightUrl,
    cadQueryCode,
    analysis,
  }
}

/**
 * Converts the raw Modal analysis payload into the typed ModuleAnalysis schema.
 *
 * @param payload - Raw analysis from Modal worker
 * @param materialName - Name of the material used
 * @returns Typed ModuleAnalysis or undefined if no data
 */
function convertModalAnalysis(
  payload: ModalAnalysisPayload | null,
  materialName: string,
): ModuleAnalysis | undefined {
  if (!payload) return undefined

  const now = new Date().toISOString()
  const result: ModuleAnalysis = {}

  // Convert mass properties
  const mp = payload.mass_properties
  if (mp && !mp.error) {
    result.massProperties = {
      mass_kg: mp.mass_kg,
      volume_mm3: mp.volume_mm3,
      surface_area_mm2: mp.surface_area_mm2,
      centerOfGravity: mp.center_of_gravity,
      momentOfInertia: mp.moment_of_inertia,
      boundingBox: mp.bounding_box,
      materialDensity_kg_m3: mp.material_density_kg_m3,
      materialName,
      computedAt: now,
    }
  }

  // Convert DFM results
  const dfm = payload.dfm
  if (dfm && !dfm.error) {
    result.dfm = {
      printable: dfm.printable,
      issues: dfm.issues.map((i) => ({
        severity: i.severity as "critical" | "warning" | "info",
        category: i.category,
        message: i.message,
      })),
      estimatedPrintTime_min: dfm.estimated_print_time_min,
      estimatedMaterial_g: dfm.estimated_material_g,
      supportVolume_pct: dfm.support_volume_pct,
      compatiblePrinters: dfm.compatible_printers,
      computedAt: now,
    }
  }

  return (result.massProperties || result.dfm) ? result : undefined
}

// ─── System-Level CAD Generation ─────────────────────────────────────

/** Result of system-level CAD generation (subset of CadModelResult) */
export interface SystemCadResult {
  stlUrl: string | undefined
  svgIsoUrl: string | undefined
  cadQueryCode: string
}

/**
 * System-level CadQuery prompt — creates the overall product form factor.
 */
const SYSTEM_CAD_PROMPT = `You are a world-class CAD engineer. Write CadQuery Python code to create a HIGHLY DETAILED 3D model of an ENTIRE assembled product/system.

## Quality Bar
This is the HERO model — the main 3D visualization of the complete product. It must be impressive and immediately recognizable. Think DJI Mavic drone level of detail: shell bodies with wall thickness, realistic proportions, surface features, mounting hardware, sensor recesses, ventilation, ports. NOT simplified blocks.

## Rules
1. Output ONLY valid Python code using CadQuery. No markdown fences.
2. Import only \`cadquery as cq\` and \`math\`. No other imports.
3. All dimensions in millimeters.
4. The final model MUST be stored in a variable called \`result\`.
5. Create a FULLY DETAILED assembled model — shell bodies, internal structure, surface features.
6. Each module/subsystem should be recognizable as a distinct component with realistic geometry.
7. Use .union() to combine components and .cut() for hollow bodies, cavities, and cutouts.
8. Apply realistic proportions from the structural brief. Include wall thicknesses.
9. Start with a comprehensive PARAMETERS block covering ALL key dimensions.
10. Target 300-800 lines of code. This is the main product model — it deserves detail.
11. Do NOT use \`open()\`, \`exec()\`, \`eval()\`, or file I/O.
12. Build incrementally with numbered sections and intermediate variables.

## What Makes the System Model Great
1. **Shell bodies** — Main housing has wall thickness, not a solid block.
2. **Distinct sub-assemblies** — Each module is recognizable, not just a labeled box.
3. **Connection features** — Pipes, cables, mounting brackets between modules.
4. **Surface detail** — Ventilation grilles, sensor recesses, port cutouts, LED channels.
5. **Structural frame** — Ribs, cross-members, mounting points.
6. **External features** — Handles, panels, connectors, indicators visible from outside.

## Reliability Techniques
1. Wrap \`.fillet()\` in try/except — fall back to \`.chamfer()\` at half radius.
2. Do NOT use \`.shell()\` on complex shapes — build hollow bodies with \`.cut()\`.
3. Use tuples for \`.transformed(offset=(x,y,z))\`.
4. Build incrementally — assign to intermediate variables.
5. Use numbered section comments (# === 1. MAIN FRAME ===) for organization.

Output just the Python code.`

/**
 * Builds the user prompt for system-level CadQuery generation.
 *
 * @param spec - The full XRay spec
 * @param brief - The system structural brief from Opus orchestrator
 * @returns Formatted prompt string
 */
function buildSystemCadPrompt(spec: XRaySpec, brief: SystemStructuralBrief): string {
  const moduleSummaries = spec.modules
    .map((m) => `- **${m.name}:** ${m.purpose}\n  Key parts: ${m.keyParts.slice(0, 5).join(", ")}`)
    .join("\n")

  return `Generate a HIGHLY DETAILED 3D CadQuery model for the COMPLETE assembled product. This is the HERO model — the main visualization that represents the entire product. It must be impressive.

**Product Function:** ${spec.function}

**Overall Dimensions:** ${brief.overallDimensions}

**Physical Structure:**
${brief.physicalDescription}

**CadQuery Build Instructions:**
${brief.cadInstructions}

**Modules (each should be a recognizable sub-assembly in the model):**
${moduleSummaries}

**Key Materials:** ${spec.materials.slice(0, 5).join(", ")}

## Requirements
- Build the main body/frame as a shell with wall thickness (not a solid block).
- Each module should be a recognizable, detailed sub-assembly — NOT a simplified box or cylinder placeholder.
- Include structural connections between modules (mounting brackets, pipe runs, cable trays).
- Add surface features: ventilation, sensor recesses, ports, indicators, access panels.
- Include mounting hardware: screw bosses, bolt patterns, standoffs.
- Target 300-800 lines of detailed CadQuery code.
- Build in numbered sections (# === 1. MAIN FRAME ===, # === 2. MODULE A ===, etc.)
- Start with a comprehensive PARAMETERS block.

The assembled model should be immediately recognizable as the described product and impressive enough to serve as a hero visualization.

Store the final model in a variable called \`result\`.`
}

/**
 * Generates a system-level 3D CAD model representing the overall product.
 *
 * @description Pipeline: Structural brief -> Opus writes CadQuery for the full
 * product -> Modal executes -> STL + SVG uploaded to storage.
 *
 * @param scanId - The scan ID for storage namespacing
 * @param spec - The full XRay spec
 * @param brief - Optional system structural brief (generated if not provided)
 * @returns URLs for STL and isometric SVG, plus the source code
 *
 * @throws CadGenerationError if all retry attempts fail
 */
export async function generateSystemCadModel(
  scanId: string,
  spec: XRaySpec,
  brief?: SystemStructuralBrief,
): Promise<SystemCadResult> {
  // Generate structural brief if not provided
  if (!brief) {
    const { generateSystemStructuralBrief } = await import("./structural-brief")
    brief = await generateSystemStructuralBrief(spec)
  }

  // Stage 1: Opus generates CadQuery code for the full product (32K tokens — hero model)
  const userPrompt = buildSystemCadPrompt(spec, brief)

  console.info("[XRayCadGen] Generating HERO system CadQuery code with Opus (32K tokens)")

  let cadQueryCode = stripCodeFences(await callOpus(SYSTEM_CAD_PROMPT, userPrompt, 0.3, 32768))

  // Stage 2: Execute on Modal with retry loop
  let modalResult = await executeCadQueryOnModal(cadQueryCode, "system", 1240)

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS && modalResult.error; attempt++) {
    const isFinalAttempt = attempt === MAX_RETRY_ATTEMPTS

    console.warn("[XRayCadGen] System CAD attempt failed, retrying:", {
      attempt,
      maxRetries: MAX_RETRY_ATTEMPTS,
      provider: isFinalAttempt ? "gemini" : "opus",
      error: modalResult.error.slice(0, 300),
    })

    try {
      if (isFinalAttempt) {
        // Final attempt: Gemini with simplified fallback
        cadQueryCode = stripCodeFences(
          await callGemini(
            "You are an expert CadQuery engineer. Generate valid, crash-proof Python code that creates detailed, recognizable 3D models. Use shell bodies (outer.cut(inner) for wall thickness), multi-component assemblies with .union(), and include surface detail. Never output just boxes.",
            generateSimplifiedSystemPrompt(spec, brief),
          ),
        )
      } else {
        // Opus retry with error feedback
        cadQueryCode = stripCodeFences(
          await callOpus(
            SYSTEM_CAD_PROMPT,
            `${userPrompt}\n\nThe previous code failed with this error:\n\n${modalResult.error.slice(0, 1000)}\n\nPrevious code:\n\`\`\`python\n${cadQueryCode}\n\`\`\`\n\nFix the code. Output ONLY the corrected Python code.`,
            0.2,
          ),
        )
      }
      modalResult = await executeCadQueryOnModal(cadQueryCode, "system", 1240)
    } catch (retryError) {
      console.error("[XRayCadGen] System CAD retry generation failed:", {
        attempt,
        provider: isFinalAttempt ? "gemini" : "opus",
        error: retryError instanceof Error ? retryError.message : "Unknown",
      })
    }
  }

  if (modalResult.error) {
    throw new CadGenerationError(
      `[XRayCadGen] System CAD execution failed after ${MAX_RETRY_ATTEMPTS + 1} attempts: ${modalResult.error}`,
      cadQueryCode,
    )
  }

  // Stage 3: Upload STL and isometric SVG
  const [stlUrl, svgIsoUrl] = await Promise.all([
    modalResult.stl
      ? uploadCadFile(scanId, "system-cad/model.stl", modalResult.stl, "model/stl")
      : Promise.resolve(undefined),
    modalResult.svg_iso
      ? uploadCadFile(scanId, "system-cad/iso.svg", modalResult.svg_iso, "image/svg+xml")
      : Promise.resolve(undefined),
  ])

  console.info("[XRayCadGen] System CAD model generated:", {
    scanId,
    hasStl: !!stlUrl,
    hasSvg: !!svgIsoUrl,
  })

  return { stlUrl, svgIsoUrl, cadQueryCode }
}

/**
 * Builds a simplified system fallback prompt for Gemini.
 *
 * @param spec - The full XRay spec
 * @param brief - The system structural brief
 * @returns Fallback prompt string
 */
function generateSimplifiedSystemPrompt(spec: XRaySpec, brief: SystemStructuralBrief): string {
  const moduleSummary = spec.modules
    .map((m) => `- **${m.name}:** ${m.purpose} (parts: ${m.keyParts.slice(0, 3).join(", ")})`)
    .join("\n")

  return `Generate CadQuery Python code for a RECOGNIZABLE model of this complete product: "${spec.function}".

**Structural guidance:**
Overall dimensions: ${brief.overallDimensions}
Physical description: ${brief.physicalDescription}
${brief.cadInstructions}

**Modules (subsystems):**
${moduleSummary}

CONSTRAINTS:
- Target 200-350 lines of code
- Do NOT use .shell() — build hollow bodies with .cut() instead
- Wrap .fillet() in try/except, falling back to .chamfer()
- Use .union() and .cut() for multi-component assemblies
- Build the main body as a shell (outer minus inner for wall thickness)
- Each module should be a recognizable shape (not a plain box)
- Include structural connections between modules
- Add surface features: vents, ports, sensors, panels
- Start with a PARAMETERS block
- Store the final model in a variable called \`result\`

The model must be immediately recognizable as the described product with realistic proportions. Use shell bodies, not solid blocks.

Output ONLY the Python code. No markdown fences, no explanation.`
}
