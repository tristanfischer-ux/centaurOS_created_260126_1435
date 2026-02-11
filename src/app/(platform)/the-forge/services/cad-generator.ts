/**
 * @file cad-generator.ts — AI-powered 3D CAD model generation for X-Ray modules
 *
 * @description Two-stage pipeline:
 * 1. AI generates CadQuery Python code from module spec (OpenAI)
 * 2. Code executes on Modal.com to produce STEP, STL, and SVG files
 *
 * Follows the same pattern as image-generator.ts but produces
 * parametric 3D CAD models instead of 2D raster blueprints.
 *
 * @security
 * - OPENAI_API_KEY for code generation
 * - MODAL_CAD_ENDPOINT_URL for CadQuery execution
 * - Modal containers are sandboxed (no ForgeOS infra access)
 * - Generated code is validated for blocked patterns before execution
 *
 * @related
 * - Image generator: ./image-generator.ts (parallel 2D pipeline)
 * - Schema: ./xray-schema.ts (cadModel field on ModuleSpec)
 * - Modal worker: /modal_cad_worker.py (Python execution environment)
 * - Server actions: src/actions/xray.ts (orchestrates generation)
 */

import OpenAI from "openai"

import { createAdminClient } from "@/lib/supabase/admin"

import type { ModuleSpec, ModuleAnalysis, MassProperties, DfmAnalysis, XRaySpec } from "./xray-schema"

// ─── Constants ───────────────────────────────────────────────────────

const STORAGE_BUCKET = "xray-images"
const MODAL_TIMEOUT_MS = 90_000
/** Number of retry attempts when CadQuery execution fails on Modal */
const MAX_RETRY_ATTEMPTS = 2

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

const CAD_SYSTEM_PROMPT = `You are an expert CAD engineer who writes CadQuery Python code to create 3D parametric models of mechanical/industrial components.

## Rules
1. Output ONLY valid Python code using CadQuery. No markdown fences, no explanation text.
2. Import only \`cadquery as cq\` and \`math\`. No other imports.
3. All dimensions in millimeters.
4. The final model MUST be stored in a variable called \`result\` (a cq.Workplane object).
5. Use realistic proportions and dimensions. A motor mount is ~25-40mm diameter, a pump housing is ~100-200mm, etc.
6. Apply appropriate fillets (2-8mm) on edges for a realistic manufactured look.
7. Include bolt holes, mounting features, and internal cavities where appropriate.
8. Keep the model conceptual but recognizable — show the key features without excessive detail.
9. Target 50-150 lines of code. More complex modules can go to 200 lines max.
10. Do NOT use \`open()\`, \`exec()\`, \`eval()\`, or any file I/O. The export is handled externally.
11. Do NOT include any print statements or comments that reference file paths.

## CRITICAL: Parametric Design Parameters

Your code MUST start with a clearly marked PARAMETERS block immediately after the imports.
This block defines all key dimensions as named variables that can be modified by the
optimization loop. Use this exact format:

\`\`\`python
import cadquery as cq
import math

# ── PARAMETERS ──────────────────────────────────────────────────────
# All key dimensions that control the model geometry.
# These values can be adjusted by the convergence loop.

BODY_LENGTH = 120.0        # mm — overall length of the housing
BODY_WIDTH = 80.0          # mm — overall width
BODY_HEIGHT = 45.0         # mm — overall height
WALL_THICKNESS = 3.0       # mm — shell wall thickness
FILLET_RADIUS = 4.0        # mm — edge fillet radius
BOLT_HOLE_DIAMETER = 5.0   # mm — mounting bolt diameter
BOLT_HOLE_SPACING = 60.0   # mm — distance between bolt holes
# ── END PARAMETERS ──────────────────────────────────────────────────
\`\`\`

Rules for the PARAMETERS block:
- Place it immediately after \`import\` statements
- Start with \`# ── PARAMETERS\` and end with \`# ── END PARAMETERS\`
- Use SCREAMING_SNAKE_CASE for variable names
- Include units in the comment (mm, deg, etc.)
- Include a brief description in the comment
- Every dimension used in the model that could reasonably be adjusted must be a parameter
- The rest of the code must reference these parameter variables (never hardcode dimensions below the block)

## CadQuery Patterns to Use
- \`cq.Workplane("XY").box(l, w, h)\` for rectangular bodies
- \`.circle(r).extrude(h)\` for cylindrical features
- \`.edges("|Z").fillet(r)\` for edge rounding
- \`.faces(">Z").workplane().hole(d)\` for through holes
- \`.cut(other)\` for boolean subtraction
- \`.union(other)\` for boolean addition
- \`.transformed(offset=(x,y,z))\` for positioning features

## CRITICAL: Common Pitfalls — AVOID These
1. **NEVER use \`.shell()\`** unless the geometry is a simple box or cylinder. It crashes on complex or boolean-combined shapes. Build hollow bodies manually with \`.cut()\` instead.
2. **Keep \`.fillet()\` radius small** — under 30% of the smallest adjacent edge length. Prefer \`.chamfer()\` for reliability. If fillet radius might be too large, wrap it in try/except:
   \`\`\`python
   try:
       result = result.edges("|Z").fillet(FILLET_RADIUS)
   except:
       result = result.edges("|Z").chamfer(FILLET_RADIUS * 0.5)
   \`\`\`
3. **Avoid deeply nested boolean operations.** Build geometry incrementally, assigning to intermediate variables:
   \`\`\`python
   base = cq.Workplane("XY").box(100, 80, 40)
   cutout = cq.Workplane("XY").circle(20).extrude(40)
   result = base.cut(cutout)
   \`\`\`
4. **Verify shapes overlap** before \`.cut()\` or \`.union()\` — misaligned shapes cause silent failures.
5. **Use tuples, not lists** for \`.transformed(offset=(x,y,z))\`.
6. **Workplane selectors** like \`">Z"\` or \`"|Z"\` must match existing geometry — don't reference faces that don't exist yet.

**Golden rule: If in doubt, prefer simpler geometry. A recognizable basic shape is far better than a complex model that crashes.**

## Output Format
Just the Python code. The variable \`result\` must be the final assembled CadQuery Workplane object.`

// ─── AI Code Generation ──────────────────────────────────────────────

/**
 * Generates CadQuery Python code for a module using AI.
 *
 * @param module - The module spec to generate CAD code for
 * @returns The CadQuery Python code as a string
 *
 * @throws Error if AI call fails
 */
async function generateCadQueryCode(module: ModuleSpec): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("[XRayCadGen] OPENAI_API_KEY is not configured")
  }

  const openai = new OpenAI({ apiKey })

  const userPrompt = buildModulePrompt(module)

  console.info("[XRayCadGen] Generating CadQuery code for module:", {
    moduleId: module.id,
    moduleName: module.name,
  })

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: CAD_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 4000,
  })

  const rawCode = completion.choices[0]?.message?.content
  if (!rawCode) {
    throw new Error("[XRayCadGen] AI returned empty response")
  }

  // Strip markdown fences if the AI included them despite instructions
  const code = rawCode
    .replace(/^```(?:python)?\n?/gm, "")
    .replace(/\n?```$/gm, "")
    .trim()

  return code
}

/**
 * Regenerates CadQuery code after a failed execution attempt.
 *
 * Feeds the original code and Modal error message back to GPT-4o
 * so it can produce a corrected version. This is the retry path
 * in the generate-execute-retry loop.
 *
 * @param module - The module spec for context
 * @param failedCode - The CadQuery code that failed execution
 * @param errorMessage - The error returned by Modal (traceback excerpt)
 * @returns Corrected CadQuery Python code
 *
 * @throws Error if AI call fails
 */
async function regenerateCadQueryCode(
  module: ModuleSpec,
  failedCode: string,
  errorMessage: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("[XRayCadGen] OPENAI_API_KEY is not configured")
  }

  const openai = new OpenAI({ apiKey })

  const retryPrompt = `The following CadQuery code for the "${module.name}" module failed during execution.

**Error:**
\`\`\`
${errorMessage.slice(0, 800)}
\`\`\`

**Failed code:**
\`\`\`python
${failedCode}
\`\`\`

Fix the code so it executes without errors. Common CadQuery pitfalls to check:
- \`.shell()\` can fail on complex shapes — simplify geometry or remove shell if needed
- \`.fillet()\` fails if the radius is too large for the edge — reduce fillet radii
- Boolean operations (\`.cut()\`, \`.union()\`) fail if shapes don't overlap — verify positioning
- \`.transformed(offset=(x,y,z))\` uses tuples, not lists
- Workplane selectors like \`">Z"\` or \`"|Z"\` must match existing geometry
- Avoid deeply nested boolean operations — build incrementally

Output ONLY the corrected Python code. No markdown fences, no explanation.
Store the final model in a variable called \`result\`.`

  console.info("[XRayCadGen] Retrying with error feedback for module:", {
    moduleId: module.id,
    errorSnippet: errorMessage.slice(0, 120),
  })

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: CAD_SYSTEM_PROMPT },
      { role: "user", content: retryPrompt },
    ],
    temperature: 0.2,
    max_tokens: 4000,
  })

  const rawCode = completion.choices[0]?.message?.content
  if (!rawCode) {
    throw new Error("[XRayCadGen] AI returned empty response on retry")
  }

  const code = rawCode
    .replace(/^```(?:python)?\n?/gm, "")
    .replace(/\n?```$/gm, "")
    .trim()

  return code
}

/**
 * Generates a simplified CadQuery model as a last-resort fallback.
 *
 * @description When both the initial generation and standard retry fail,
 * this function asks the AI to produce the simplest possible representation
 * (basic box/cylinder with mounting holes, no .shell() or .fillet()).
 * This ensures the user always gets _something_ rather than a persistent error.
 *
 * @param module - The module spec for context
 * @returns Simplified CadQuery Python code that is unlikely to crash
 *
 * @throws Error if AI call fails
 */
async function generateSimplifiedFallbackCode(
  module: ModuleSpec,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("[XRayCadGen] OPENAI_API_KEY is not configured")
  }

  const openai = new OpenAI({ apiKey })

  const fallbackPrompt = `Generate the SIMPLEST possible CadQuery model for: "${module.name}" (${module.purpose}).

STRICT CONSTRAINTS:
- Maximum 30 lines of code
- Do NOT use .shell() — it crashes on non-trivial shapes
- Do NOT use .fillet() or .chamfer()
- Do NOT use nested boolean operations
- Use ONLY: .box(), .circle(), .extrude(), .hole(), .cut() with simple shapes
- Create a basic recognizable shape: a box or cylinder with a few holes/cutouts
- Store the final model in a variable called \`result\`

Example of acceptable complexity:
\`\`\`python
import cadquery as cq
import math

BODY_LENGTH = 120.0
BODY_WIDTH = 80.0
BODY_HEIGHT = 40.0
HOLE_DIAMETER = 6.0

result = (
    cq.Workplane("XY")
    .box(BODY_LENGTH, BODY_WIDTH, BODY_HEIGHT)
    .faces(">Z").workplane()
    .rect(BODY_LENGTH - 20, BODY_WIDTH - 20, forConstruction=True)
    .vertices()
    .hole(HOLE_DIAMETER)
)
\`\`\`

Output ONLY the Python code. No markdown fences, no explanation.`

  console.info("[XRayCadGen] Generating simplified fallback for module:", {
    moduleId: module.id,
    moduleName: module.name,
  })

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You write simple, crash-proof CadQuery Python code. Keep it minimal." },
      { role: "user", content: fallbackPrompt },
    ],
    temperature: 0.1,
    max_tokens: 1500,
  })

  const rawCode = completion.choices[0]?.message?.content
  if (!rawCode) {
    throw new Error("[XRayCadGen] AI returned empty response for simplified fallback")
  }

  return rawCode
    .replace(/^```(?:python)?\n?/gm, "")
    .replace(/\n?```$/gm, "")
    .trim()
}

/**
 * Builds the user prompt for CadQuery code generation from a module spec.
 *
 * @param module - The module spec
 * @returns Formatted prompt string
 */
function buildModulePrompt(module: ModuleSpec): string {
  return `Generate a 3D CadQuery model for this engineering module:

**Module:** ${module.name}
**Purpose:** ${module.purpose}
**What it is:** ${module.detail.whatItIs}

**Key Physical Components:**
${module.keyParts.map((p) => `- ${p}`).join("\n")}

**Inputs:** ${module.io.in.join(", ")}
**Outputs:** ${module.io.out.join(", ")}

${module.detail.operatingPrinciples ? `**Operating Principles:** ${module.detail.operatingPrinciples}` : ""}
${module.detail.materialJustification ? `**Materials:** ${module.detail.materialJustification}` : ""}
${module.detail.tolerancesAndSpecs ? `**Tolerances:** ${module.detail.tolerancesAndSpecs}` : ""}

Create a conceptual 3D model that shows the main body/housing with the key components represented as geometric features (cylindrical bores for pipes, rectangular slots for circuit boards, mounting bosses for bolts, etc.). The model should be immediately recognizable as a ${module.name} to an engineer.

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
 * Pipeline: AI generates CadQuery code -> Modal executes it -> files uploaded to storage.
 *
 * @param scanId - The scan ID for storage namespacing
 * @param module - The module to generate a CAD model for
 * @returns URLs for all generated files (STEP, STL, SVGs) and the source code
 *
 * @throws Error if any stage of the pipeline fails
 */
export async function generateModuleCadModel(
  scanId: string,
  module: ModuleSpec,
): Promise<CadModelResult> {
  // Stage 0: Infer material density from module spec
  const { density: materialDensity, name: materialName } = inferMaterialDensity(module)

  // Stage 1: AI generates CadQuery code
  let cadQueryCode = await generateCadQueryCode(module)

  // Stage 2: Modal executes the code (with auto-retry on failure)
  let modalResult = await executeCadQueryOnModal(cadQueryCode, module.id, materialDensity)

  // Retry loop: if Modal returns an execution error, feed it back to AI for a fix.
  // On the final attempt, switch to a simplified fallback prompt for maximum reliability.
  if (modalResult.error) {
    let lastError: string = modalResult.error
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      const isFinalAttempt = attempt === MAX_RETRY_ATTEMPTS

      console.warn("[XRayCadGen] Execution failed, retrying:", {
        moduleId: module.id,
        attempt,
        isFinalAttempt,
        error: lastError.slice(0, 200),
      })

      try {
        // Final attempt: use simplified fallback for maximum reliability
        cadQueryCode = isFinalAttempt
          ? await generateSimplifiedFallbackCode(module)
          : await regenerateCadQueryCode(module, cadQueryCode, lastError)

        modalResult = await executeCadQueryOnModal(cadQueryCode, module.id, materialDensity)

        if (!modalResult.error) {
          console.info("[XRayCadGen] Retry succeeded on attempt:", {
            moduleId: module.id,
            attempt,
            usedFallback: isFinalAttempt,
          })
          break
        }
        lastError = modalResult.error
      } catch (retryError) {
        console.error("[XRayCadGen] Retry attempt failed:", {
          moduleId: module.id,
          attempt,
          error: retryError instanceof Error ? retryError.message : "Unknown",
        })
        // Fall through to the final error check below
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
 *
 * @description Unlike module prompts which focus on individual subsystems,
 * this prompt creates a single model representing the entire product as
 * an assembled unit. The result is the "hero" 3D model shown on the
 * concept page.
 */
const SYSTEM_CAD_PROMPT = `You are an expert CAD engineer. Write CadQuery Python code to create a 3D conceptual model of an ENTIRE product/system.

## Rules
1. Output ONLY valid Python code using CadQuery. No markdown fences.
2. Import only \`cadquery as cq\` and \`math\`. No other imports.
3. All dimensions in millimeters.
4. The final model MUST be stored in a variable called \`result\`.
5. Create a SINGLE assembled model showing the overall product form factor.
6. Show the main structural body/frame and key external features.
7. Do NOT model internal details — focus on the outer envelope and recognizable shape.
8. Apply realistic overall proportions and dimensions.
9. Include a PARAMETERS block with key dimensions.
10. Target 60-150 lines of code.
11. Do NOT use \`open()\`, \`exec()\`, \`eval()\`, or file I/O.
12. Prefer simple, robust geometry over fine detail.

## CadQuery Patterns
- \`cq.Workplane("XY").box(l, w, h)\` for bodies
- \`.circle(r).extrude(h)\` for cylinders
- \`.edges("|Z").chamfer(c)\` for edge treatment (prefer chamfer over fillet)
- \`.cut(other)\` / \`.union(other)\` for boolean ops
- \`.transformed(offset=(x,y,z))\` for positioning features

## CRITICAL: Common Pitfalls — AVOID These
1. **NEVER use \`.shell()\`** unless the geometry is a simple box or cylinder. It crashes on complex or boolean-combined shapes. Build hollow bodies manually with \`.cut()\` instead.
2. **Keep \`.fillet()\` radius small** — under 30% of the smallest adjacent edge length. Prefer \`.chamfer()\` for reliability. If fillet radius might be too large, wrap it in try/except:
   \`\`\`python
   try:
       result = result.edges("|Z").fillet(FILLET_RADIUS)
   except:
       result = result.edges("|Z").chamfer(FILLET_RADIUS * 0.5)
   \`\`\`
3. **Avoid deeply nested boolean operations.** Build geometry incrementally, assigning to intermediate variables:
   \`\`\`python
   base = cq.Workplane("XY").box(100, 80, 40)
   cutout = cq.Workplane("XY").circle(20).extrude(40)
   result = base.cut(cutout)
   \`\`\`
4. **Verify shapes overlap** before \`.cut()\` or \`.union()\` — misaligned shapes cause silent failures.
5. **Use tuples, not lists** for \`.transformed(offset=(x,y,z))\`.
6. **Workplane selectors** like \`">Z"\` or \`"|Z"\` must match existing geometry — don't reference faces that don't exist yet.

**Golden rule: If in doubt, prefer simpler geometry. A recognizable basic shape is far better than a complex model that crashes.**

Output just the Python code.`

/**
 * Builds the user prompt for system-level CadQuery generation.
 *
 * @param spec - The full XRay spec with function and modules
 * @returns Formatted prompt string
 */
function buildSystemCadPrompt(spec: XRaySpec): string {
  const moduleSummaries = spec.modules
    .map((m) => `- ${m.name}: ${m.purpose} (key parts: ${m.keyParts.slice(0, 3).join(", ")})`)
    .join("\n")

  return `Generate a 3D CadQuery model for the COMPLETE assembled product:

**Product Function:** ${spec.function}

**Modules (subsystems):**
${moduleSummaries}

**Key Materials:** ${spec.materials.slice(0, 5).join(", ")}

Create a single conceptual 3D model showing the overall product. This should look like the finished assembled product from the outside — show the main body/frame/housing with key external features like intakes, outlets, mounting points, and panels. Think of this as what the product looks like on a table, not an exploded view.

Store the final model in a variable called \`result\`.`
}

/**
 * Generates AI CadQuery code for the system-level model.
 *
 * @param spec - The full XRay spec
 * @returns CadQuery Python code
 */
async function generateSystemCadQueryCode(spec: XRaySpec): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("[XRayCadGen] OPENAI_API_KEY is not configured")

  const openai = new OpenAI({ apiKey })
  const userPrompt = buildSystemCadPrompt(spec)

  console.info("[XRayCadGen] Generating system-level CadQuery code")

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_CAD_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 4000,
  })

  const rawCode = completion.choices[0]?.message?.content
  if (!rawCode) throw new Error("[XRayCadGen] AI returned empty response for system CAD")

  return rawCode
    .replace(/^```(?:python)?\n?/gm, "")
    .replace(/\n?```$/gm, "")
    .trim()
}

/**
 * Generates a very simple CadQuery model as a last-resort fallback for the system model.
 *
 * @description Used on the final retry attempt when complex generation has failed.
 * Produces a basic box/cylinder representation of the overall product.
 *
 * @param spec - The full XRay spec for context
 * @returns Minimal CadQuery Python code
 */
async function generateSimplifiedSystemFallbackCode(spec: XRaySpec): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("[XRayCadGen] OPENAI_API_KEY is not configured")

  const openai = new OpenAI({ apiKey })

  const moduleSummary = spec.modules
    .map((m) => `- ${m.name}`)
    .join("\n")

  const fallbackPrompt = `Generate the SIMPLEST possible CadQuery model for this product: "${spec.function}".

Modules: ${moduleSummary}

STRICT CONSTRAINTS:
- Maximum 30 lines of code
- Do NOT use .shell() — it crashes on non-trivial shapes
- Do NOT use .fillet() or .chamfer()
- Do NOT use nested boolean operations
- Use ONLY: .box(), .circle(), .extrude(), .hole(), .cut() with simple shapes
- Create a basic recognizable shape: a box or cylinder with a few holes/cutouts
- Store the final model in a variable called \`result\`

Example of acceptable complexity:
\`\`\`python
import cadquery as cq
import math

BODY_LENGTH = 500.0
BODY_WIDTH = 300.0
BODY_HEIGHT = 150.0
HOLE_DIAMETER = 10.0

result = (
    cq.Workplane("XY")
    .box(BODY_LENGTH, BODY_WIDTH, BODY_HEIGHT)
    .faces(">Z").workplane()
    .rect(BODY_LENGTH - 40, BODY_WIDTH - 40, forConstruction=True)
    .vertices()
    .hole(HOLE_DIAMETER)
)
\`\`\`

Output ONLY the Python code. No markdown fences, no explanation.`

  console.info("[XRayCadGen] Generating simplified system fallback for:", {
    function: spec.function,
  })

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a CadQuery expert. Generate only valid Python code." },
      { role: "user", content: fallbackPrompt },
    ],
    temperature: 0.2,
    max_tokens: 1000,
  })

  const rawCode = completion.choices[0]?.message?.content
  if (!rawCode) throw new Error("[XRayCadGen] AI returned empty response for system fallback")

  return rawCode
    .replace(/^```(?:python)?\n?/gm, "")
    .replace(/\n?```$/gm, "")
    .trim()
}

/**
 * Generates a system-level 3D CAD model representing the overall product.
 *
 * @description Pipeline: AI writes CadQuery for the full product -> Modal
 * executes it -> STL + SVG uploaded to storage. This is the "hero" model
 * displayed in the interactive 3D viewer on the concept page.
 *
 * @param scanId - The scan ID for storage namespacing
 * @param spec - The full XRay spec (used for context in the prompt)
 * @returns URLs for STL and isometric SVG, plus the source code
 *
 * @throws CadGenerationError if all retry attempts fail
 */
export async function generateSystemCadModel(
  scanId: string,
  spec: XRaySpec,
): Promise<SystemCadResult> {
  // Stage 1: AI generates CadQuery code for the full product
  let cadQueryCode = await generateSystemCadQueryCode(spec)

  // Stage 2: Execute on Modal with retry loop (matches module-level pattern)
  let modalResult = await executeCadQueryOnModal(cadQueryCode, "system", 1240)

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS && modalResult.error; attempt++) {
    console.warn("[XRayCadGen] System CAD attempt failed, retrying:", {
      attempt,
      maxRetries: MAX_RETRY_ATTEMPTS,
      error: modalResult.error.slice(0, 300),
    })

    try {
      // On final retry, use a simplified fallback prompt
      if (attempt === MAX_RETRY_ATTEMPTS) {
        cadQueryCode = await generateSimplifiedSystemFallbackCode(spec)
      } else {
        cadQueryCode = await regenerateSystemCadCode(spec, cadQueryCode, modalResult.error)
      }
      modalResult = await executeCadQueryOnModal(cadQueryCode, "system", 1240)
    } catch (retryError) {
      console.error("[XRayCadGen] System CAD retry generation failed:", {
        attempt,
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
 * Feeds execution errors back to AI for a corrected system-level CadQuery script.
 *
 * @param spec - The full XRay spec for context
 * @param failedCode - The code that produced the error
 * @param error - The error message from Modal
 * @returns Corrected CadQuery Python code
 */
async function regenerateSystemCadCode(
  spec: XRaySpec,
  failedCode: string,
  error: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("[XRayCadGen] OPENAI_API_KEY is not configured")

  const openai = new OpenAI({ apiKey })

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_CAD_PROMPT },
      { role: "user", content: buildSystemCadPrompt(spec) },
      { role: "assistant", content: failedCode },
      {
        role: "user",
        content: `The code above failed with this error:\n\n${error.slice(0, 1000)}\n\nPlease fix the code and output ONLY the corrected Python code.`,
      },
    ],
    temperature: 0.2,
    max_tokens: 4000,
  })

  const rawCode = completion.choices[0]?.message?.content
  if (!rawCode) throw new Error("[XRayCadGen] AI returned empty response for system CAD fix")

  return rawCode
    .replace(/^```(?:python)?\n?/gm, "")
    .replace(/\n?```$/gm, "")
    .trim()
}
