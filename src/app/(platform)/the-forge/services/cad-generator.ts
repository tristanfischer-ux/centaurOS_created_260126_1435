/**
 * @file cad-generator.ts — AI-powered 3D CAD model generation for X-Ray modules
 *
 * @description Two-stage pipeline with Opus orchestration:
 * 1. Opus generates a structural brief (shared with image generator)
 * 2. Opus generates CadQuery Python code from that brief
 * 3. Code executes on Modal.com to produce STEP, STL, and SVG files
 *
 * AI model strategy:
 * - Primary: Claude Opus 4.6 (Anthropic) — disciplined code generation
 * - Retry fallback: Gemini 2.5 Pro (Google) — fresh perspective on final attempt
 *
 * @security
 * - ANTHROPIC_API_KEY for Opus code generation
 * - GOOGLE_AI_API_KEY for Gemini fallback
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
const MODAL_TIMEOUT_MS = 90_000
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

// ─── System Prompt ───────────────────────────────────────────────────

const CAD_SYSTEM_PROMPT = `You are an expert CAD engineer who writes CadQuery Python code to create detailed, recognizable 3D parametric models of mechanical and industrial components.

## Rules
1. Output ONLY valid Python code using CadQuery. No markdown fences, no explanation text.
2. Import only \`cadquery as cq\` and \`math\`. No other imports.
3. All dimensions in millimeters.
4. The final model MUST be stored in a variable called \`result\` (a cq.Workplane object).
5. Use realistic proportions and dimensions based on the structural brief provided.
6. Build multi-component assemblies using \`.union()\` — the model should show distinct parts, not just a box.
7. Include pipe stubs, mounting features, flanges, and internal cavities where appropriate.
8. Target 80-250 lines of code. Complex modules with many components should use more lines.
9. Do NOT use \`open()\`, \`exec()\`, \`eval()\`, or any file I/O. The export is handled externally.
10. Do NOT include any print statements or comments that reference file paths.

## CRITICAL: Parametric Design Parameters

Your code MUST start with a clearly marked PARAMETERS block immediately after the imports:

\`\`\`python
import cadquery as cq
import math

# ── PARAMETERS ──────────────────────────────────────────────────────
BODY_LENGTH = 120.0        # mm — overall length of the housing
BODY_WIDTH = 80.0          # mm — overall width
BODY_HEIGHT = 45.0         # mm — overall height
WALL_THICKNESS = 3.0       # mm — shell wall thickness
FILLET_RADIUS = 4.0        # mm — edge fillet radius
# ── END PARAMETERS ──────────────────────────────────────────────────
\`\`\`

## Assembly Strategy — Build Incrementally

Build the model using intermediate variables. This is the most reliable approach:

\`\`\`python
# 1. Create the main body/housing
base_frame = cq.Workplane("XY").box(FRAME_LENGTH, FRAME_WIDTH, FRAME_HEIGHT)

# 2. Create and position major components
tank = cq.Workplane("XY").transformed(offset=(tank_x, tank_y, tank_z)).circle(TANK_RADIUS).extrude(TANK_HEIGHT)

# 3. Combine with union
result = base_frame.union(tank)

# 4. Add smaller features
pipe_stub = cq.Workplane("XY").transformed(offset=(pipe_x, pipe_y, pipe_z)).circle(PIPE_RADIUS).extrude(PIPE_LENGTH)
result = result.union(pipe_stub)

# 5. Apply detail features with safe fallbacks
try:
    result = result.edges("|Z").fillet(FILLET_RADIUS)
except Exception:
    result = result.edges("|Z").chamfer(FILLET_RADIUS * 0.4)
\`\`\`

## Industrial Component Recipes

Use these CadQuery patterns for common industrial components:

**Cylindrical tanks/vessels:**
\`\`\`python
tank = cq.Workplane("XY").transformed(offset=(x, y, z)).circle(radius).extrude(height)
\`\`\`

**Pipe stubs (horizontal):**
\`\`\`python
pipe = cq.Workplane("YZ").transformed(offset=(x, y, z)).circle(pipe_r).extrude(pipe_len)
\`\`\`

**Rectangular chambers with cavity:**
\`\`\`python
outer = cq.Workplane("XY").transformed(offset=(x, y, z)).box(l, w, h)
inner = cq.Workplane("XY").transformed(offset=(x, y, z + wall)).box(l - 2*wall, w - 2*wall, h - wall)
chamber = outer.cut(inner)
\`\`\`

**Mounting base plate with bolt holes:**
\`\`\`python
plate = cq.Workplane("XY").box(l, w, thickness)
plate = plate.faces(">Z").workplane().rect(l - margin, w - margin, forConstruction=True).vertices().hole(bolt_d)
\`\`\`

**Flanges on pipe ends:**
\`\`\`python
flange = cq.Workplane("XY").transformed(offset=(x, y, z)).circle(flange_r).extrude(flange_t)
\`\`\`

**Array of tubes (heat exchanger):**
\`\`\`python
tubes = cq.Workplane("XY").transformed(offset=(x, y, z))
for i in range(n_tubes):
    tube = cq.Workplane("XY").transformed(offset=(x + i * spacing, y, z)).circle(tube_r).extrude(tube_len)
    tubes = tubes.union(tube) if i > 0 else tube
\`\`\`

## Reliability Techniques

1. **Always wrap \`.fillet()\` in try/except** — fall back to \`.chamfer()\` at half the radius.
2. **Keep fillet radius under 30%** of the smallest adjacent edge length.
3. **Do NOT use \`.shell()\`** on complex or boolean-combined shapes — build hollow bodies with \`.cut()\` instead.
4. **Use tuples for \`.transformed(offset=(x,y,z))\`** — not lists.
5. **Verify boolean overlap** — shapes must physically intersect for \`.cut()\` or \`.union()\` to work.
6. **Build incrementally** — assign to intermediate variables, don't chain 10+ operations.

## Goal
Create a model that an engineer would immediately recognize as the described component. Show the key external and structural features. A detailed multi-component assembly is far more valuable than a simple box.

## Output Format
Just the Python code. The variable \`result\` must be the final assembled CadQuery Workplane object.`

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
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error("[XRayCadGen] ANTHROPIC_API_KEY is not configured")
  }

  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  })

  const texts: string[] = []
  for (const block of response.content) {
    if (block.type === "text") {
      texts.push(block.text)
    }
  }

  if (texts.length === 0) {
    throw new Error("[XRayCadGen] Opus returned no text content")
  }

  return texts.join("\n")
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
      maxOutputTokens: 4096,
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

// ─── AI Code Generation ──────────────────────────────────────────────

/**
 * Generates CadQuery Python code for a module using Claude Opus 4.6.
 *
 * @param module - The module spec for context
 * @param brief - The structural brief from Opus orchestrator
 * @returns The CadQuery Python code as a string
 *
 * @throws Error if AI call fails
 */
async function generateCadQueryCode(
  module: ModuleSpec,
  brief: StructuralBrief,
): Promise<string> {
  const userPrompt = buildModulePrompt(module, brief)

  console.info("[XRayCadGen] Generating CadQuery code with Opus for module:", {
    moduleId: module.id,
    moduleName: module.name,
  })

  const raw = await callOpus(CAD_SYSTEM_PROMPT, userPrompt, 0.3)
  return stripCodeFences(raw)
}

/**
 * Regenerates CadQuery code after a failed execution attempt using Opus.
 *
 * @param module - The module spec for context
 * @param brief - The structural brief
 * @param failedCode - The CadQuery code that failed execution
 * @param errorMessage - The error returned by Modal
 * @returns Corrected CadQuery Python code
 *
 * @throws Error if AI call fails
 */
async function regenerateCadQueryCode(
  module: ModuleSpec,
  brief: StructuralBrief,
  failedCode: string,
  errorMessage: string,
): Promise<string> {
  const retryPrompt = `The following CadQuery code for the "${module.name}" module failed during execution.

**Error:**
\`\`\`
${errorMessage.slice(0, 800)}
\`\`\`

**Failed code:**
\`\`\`python
${failedCode}
\`\`\`

**Original structural brief for reference:**
Overall dimensions: ${brief.overallDimensions}
${brief.cadInstructions}

Fix the code so it executes without errors. Common CadQuery pitfalls to check:
- \`.shell()\` crashes on complex shapes — simplify geometry or build hollow with \`.cut()\`
- \`.fillet()\` fails if radius is too large — reduce radii or wrap in try/except
- Boolean ops (\`.cut()\`, \`.union()\`) fail if shapes don't overlap — verify positioning
- \`.transformed(offset=(x,y,z))\` uses tuples, not lists
- Workplane selectors like \`">Z"\` must match existing geometry

Output ONLY the corrected Python code. No markdown fences, no explanation.
Store the final model in a variable called \`result\`.`

  console.info("[XRayCadGen] Retrying with Opus error feedback for module:", {
    moduleId: module.id,
    errorSnippet: errorMessage.slice(0, 120),
  })

  const raw = await callOpus(CAD_SYSTEM_PROMPT, retryPrompt, 0.2)
  return stripCodeFences(raw)
}

/**
 * Generates a simplified but recognizable CadQuery model as a last-resort fallback.
 * Uses Gemini 2.5 Pro for a fresh perspective when Opus retries are exhausted.
 *
 * @description Asks Gemini to produce a simplified but multi-component assembly
 * (not just a box). Allows boolean operations and chamfers for reliability.
 *
 * @param module - The module spec for context
 * @param brief - The structural brief for guidance
 * @returns Simplified CadQuery Python code
 *
 * @throws Error if AI call fails
 */
async function generateSimplifiedFallbackCode(
  module: ModuleSpec,
  brief: StructuralBrief,
): Promise<string> {
  const fallbackPrompt = `Generate CadQuery Python code for a SIMPLIFIED but RECOGNIZABLE model of: "${module.name}" (${module.purpose}).

**Structural guidance:**
Overall dimensions: ${brief.overallDimensions}
${brief.cadInstructions}

CONSTRAINTS:
- Maximum 80 lines of code
- Do NOT use .shell() — it crashes on non-trivial shapes
- Wrap .fillet() in try/except, falling back to .chamfer()
- You CAN use .union() and .cut() for multi-component assemblies
- You CAN use .chamfer() for edge treatment
- Build the main body PLUS 2-3 key attached components (pipes, tanks, features)
- Each component should be a recognizable geometric form
- Store the final model in a variable called \`result\`

The model should be immediately recognizable as a ${module.name} — NOT just a plain box.
Show the main housing/body with key external features attached via .union().

Output ONLY the Python code. No markdown fences, no explanation.`

  console.info("[XRayCadGen] Generating simplified fallback with Gemini for module:", {
    moduleId: module.id,
    moduleName: module.name,
  })

  const raw = await callGemini(
    "You are a CadQuery expert. Generate valid, crash-proof Python code that creates recognizable 3D models. Build multi-component assemblies using .union() — never just a box.",
    fallbackPrompt,
  )

  return stripCodeFences(raw)
}

/**
 * Builds the user prompt for CadQuery code generation from a structural brief.
 *
 * @param module - The module spec
 * @param brief - The structural brief from Opus orchestrator
 * @returns Formatted prompt string
 */
function buildModulePrompt(module: ModuleSpec, brief: StructuralBrief): string {
  return `Generate a 3D CadQuery model for this engineering module using the structural brief below.

**Module:** ${module.name}
**Purpose:** ${module.purpose}

**Overall Dimensions:** ${brief.overallDimensions}

**Physical Structure:**
${brief.physicalDescription}

**CadQuery Build Instructions:**
${brief.cadInstructions}

**Key Physical Components:**
${module.keyParts.map((p) => `- ${p}`).join("\n")}

**Inputs:** ${module.io.in.join(", ")}
**Outputs:** ${module.io.out.join(", ")}

Create a multi-component 3D model following the structural brief. Build the main body first, then union the key components. The model should be immediately recognizable as a ${module.name} to an engineer.

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
 * Generates a 3D CAD model for a single module.
 *
 * Pipeline: Structural brief (from Opus) -> Opus generates CadQuery code ->
 * Modal executes it -> files uploaded to storage.
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

  // Stage 1: Opus generates CadQuery code using the structural brief
  let cadQueryCode = await generateCadQueryCode(module, brief)

  // Stage 2: Modal executes the code (with auto-retry on failure)
  let modalResult = await executeCadQueryOnModal(cadQueryCode, module.id, materialDensity)

  // Retry loop: Opus retries with error feedback, Gemini as final fallback
  if (modalResult.error) {
    let lastError: string = modalResult.error
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      const isFinalAttempt = attempt === MAX_RETRY_ATTEMPTS

      console.warn("[XRayCadGen] Execution failed, retrying:", {
        moduleId: module.id,
        attempt,
        maxRetries: MAX_RETRY_ATTEMPTS,
        isFinalAttempt,
        provider: isFinalAttempt ? "gemini" : "opus",
        error: lastError.slice(0, 200),
      })

      try {
        // Final attempt: switch to Gemini for fresh perspective
        cadQueryCode = isFinalAttempt
          ? await generateSimplifiedFallbackCode(module, brief)
          : await regenerateCadQueryCode(module, brief, cadQueryCode, lastError)

        modalResult = await executeCadQueryOnModal(cadQueryCode, module.id, materialDensity)

        if (!modalResult.error) {
          console.info("[XRayCadGen] Retry succeeded on attempt:", {
            moduleId: module.id,
            attempt,
            provider: isFinalAttempt ? "gemini" : "opus",
          })
          break
        }
        lastError = modalResult.error
      } catch (retryError) {
        console.error("[XRayCadGen] Retry attempt failed:", {
          moduleId: module.id,
          attempt,
          provider: isFinalAttempt ? "gemini" : "opus",
          error: retryError instanceof Error ? retryError.message : "Unknown",
        })
      }
    }
  }

  if (modalResult.error) {
    throw new CadGenerationError(
      `[XRayCadGen] Modal execution failed: ${modalResult.error}`,
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

  console.info("[XRayCadGen] CAD model generated and uploaded:", {
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
const SYSTEM_CAD_PROMPT = `You are an expert CAD engineer. Write CadQuery Python code to create a 3D conceptual model of an ENTIRE product/system.

## Rules
1. Output ONLY valid Python code using CadQuery. No markdown fences.
2. Import only \`cadquery as cq\` and \`math\`. No other imports.
3. All dimensions in millimeters.
4. The final model MUST be stored in a variable called \`result\`.
5. Create a SINGLE assembled model showing the overall product form factor.
6. Show the main structural frame and key module blocks as distinct components.
7. Use .union() to combine the frame, module blocks, and external features.
8. Apply realistic overall proportions and dimensions from the structural brief.
9. Include a PARAMETERS block with key dimensions.
10. Target 80-200 lines of code.
11. Do NOT use \`open()\`, \`exec()\`, \`eval()\`, or file I/O.
12. Build incrementally with intermediate variables.

## Reliability Techniques
1. Wrap \`.fillet()\` in try/except — fall back to \`.chamfer()\` at half radius.
2. Do NOT use \`.shell()\` on complex shapes — build hollow bodies with \`.cut()\`.
3. Use tuples for \`.transformed(offset=(x,y,z))\`.
4. Build incrementally — assign to intermediate variables.

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
    .map((m) => `- ${m.name}: ${m.purpose} (key parts: ${m.keyParts.slice(0, 3).join(", ")})`)
    .join("\n")

  return `Generate a 3D CadQuery model for the COMPLETE assembled product using the structural brief:

**Product Function:** ${spec.function}

**Overall Dimensions:** ${brief.overallDimensions}

**Physical Structure:**
${brief.physicalDescription}

**CadQuery Build Instructions:**
${brief.cadInstructions}

**Modules (subsystems):**
${moduleSummaries}

**Key Materials:** ${spec.materials.slice(0, 5).join(", ")}

Create a single 3D model showing the assembled product. Build the main frame first, then union module blocks and external features.

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

  // Stage 1: Opus generates CadQuery code for the full product
  const userPrompt = buildSystemCadPrompt(spec, brief)

  console.info("[XRayCadGen] Generating system-level CadQuery code with Opus")

  let cadQueryCode = stripCodeFences(await callOpus(SYSTEM_CAD_PROMPT, userPrompt, 0.3))

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
            "You are a CadQuery expert. Generate valid, crash-proof Python code that creates recognizable 3D models.",
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
    .map((m) => `- ${m.name}`)
    .join("\n")

  return `Generate CadQuery Python code for a SIMPLIFIED but RECOGNIZABLE model of this product: "${spec.function}".

**Structural guidance:**
Overall dimensions: ${brief.overallDimensions}
${brief.cadInstructions}

Modules: ${moduleSummary}

CONSTRAINTS:
- Maximum 80 lines of code
- Do NOT use .shell()
- Wrap .fillet() in try/except, falling back to .chamfer()
- You CAN use .union() and .cut() for multi-component assemblies
- Build a main frame/body, then union simplified module blocks on top
- Store the final model in a variable called \`result\`

The model should be recognizable as the assembled product — NOT just a box.

Output ONLY the Python code. No markdown fences, no explanation.`
}
