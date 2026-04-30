/**
 * @file cad-generator.ts — AI-powered 3D CAD model generation for X-Ray
 *
 * @description Two-tier CAD generation pipeline:
 *
 * **System model (HERO):** GPT-5.5 generates CadQuery DIRECTLY from the full
 * XRay spec (32K tokens). No structural brief intermediary — the model uses its
 * visual/domain knowledge of what the product looks like to produce realistic
 * geometry.
 *
 * **Module models (SCHEMATICS):** Gemini 2.5 Pro produces clean, reliable
 * schematic-quality CadQuery models via structural brief. These are supporting
 * visuals — recognizable but focused on clarity over manufacturing detail.
 *
 * @security
 * - OPENAI_API_KEY for GPT-5.5 (system model)
 * - GOOGLE_AI_API_KEY for Gemini (module models + GPT fallback)
 * - MODAL_CAD_ENDPOINT_URL for CadQuery execution
 * - Modal containers are sandboxed (no ForgeOS infra access)
 *
 * @related
 * - Structural brief: ./structural-brief.ts (used for module schematics + images)
 * - Image generator: ./image-generator.ts (parallel 2D pipeline)
 * - Schema: ./xray-schema.ts (cadModel field on ModuleSpec)
 * - Modal worker: /modal_cad_worker.py (Python execution environment)
 * - Server actions: src/actions/xray.ts (orchestrates generation)
 */

import { createAdminClient } from "@/lib/supabase/admin"

import type { ModuleSpec, ModuleAnalysis, XRaySpec } from "./xray-schema"
import type { StructuralBrief } from "./structural-brief"

// ─── Constants ───────────────────────────────────────────────────────

const STORAGE_BUCKET = "xray-images"
const MODAL_TIMEOUT_MS = 180_000
/** Number of retry attempts when CadQuery execution fails on Modal */
const MAX_RETRY_ATTEMPTS = 3

// ─── CAD Code Validation ─────────────────────────────────────────────

/** Regex to detect dangerous Python code that could escape the Modal sandbox (F8) */
const DANGEROUS_CODE_RE = /(?:^|\s)(?:import|from)\s+(?:os|sys|subprocess|shutil|importlib|pickle|marshal|ctypes)\b|__import__\s*\(|__builtins__|(?:exec|eval|compile|open)\s*\(|getattr\s*\([^)]*__|globals\s*\(|locals\s*\(|__subclasses__/m

/**
 * Validates CadQuery Python code before sending to Modal for execution.
 *
 * @param code - The CadQuery Python source code
 * @returns null if valid, or a human-readable error string describing the problem
 */
function validateCadQueryCode(code: string): string | null {
  if (code.length < 50) {
    return "Code too short to be a valid CadQuery script"
  }
  if (!code.includes("import cadquery") && !code.includes("import cq")) {
    return "Missing CadQuery import (expected 'import cadquery' or 'import cq')"
  }
  if (!code.includes("result") && !code.includes("show_object")) {
    return "No 'result' variable or 'show_object' call — Modal has nothing to export"
  }
  const dangerousMatch = DANGEROUS_CODE_RE.exec(code)
  if (dangerousMatch) {
    return `Dangerous import detected: '${dangerousMatch[0].trim()}'`
  }
  // Check balanced parentheses and brackets
  let parenDepth = 0
  let bracketDepth = 0
  for (const ch of code) {
    if (ch === "(") parenDepth++
    else if (ch === ")") parenDepth--
    else if (ch === "[") bracketDepth++
    else if (ch === "]") bracketDepth--
    if (parenDepth < 0) return "Unbalanced parentheses (extra closing paren)"
    if (bracketDepth < 0) return "Unbalanced brackets (extra closing bracket)"
  }
  if (parenDepth !== 0) return `Unbalanced parentheses (${parenDepth} unclosed)`
  if (bracketDepth !== 0) return `Unbalanced brackets (${bracketDepth} unclosed)`
  return null
}

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
  svg_exploded: string | null
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
const MODULE_SCHEMATIC_PROMPT = `You are an expert CadQuery mechanical engineer creating recognizable, detailed 3D schematic models of engineering sub-assemblies.

## Goal
Create a model that clearly shows WHAT this component is and HOW it works. Think "engineering textbook cutaway" — clean geometry that teaches, with enough mechanical detail to be convincing. This is a schematic that should look like a real engineered part, not a toy.

## MANDATORY: Engineering Thinking Process
Before writing code, think through:
A. **What IS this component?** Identify the product archetype. A pump? A motor? A heat exchanger? A circuit board housing? You know what these look like — use that knowledge.
B. **What are the 5-8 key sub-parts?** Decompose into recognizable functional elements (e.g., for a motor: stator, rotor, shaft, bearing mounts, housing, cooling fins, terminal block).
C. **What are the real-world dimensions?** Use standard sizes from your domain knowledge. Don't guess — be specific (motor shaft Ø8mm, bearing ID 10mm, PCB thickness 1.6mm, etc.).
D. **Build each sub-part as a numbered section** with its own intermediate variable.

## Rules
1. Output ONLY valid Python code using CadQuery. No markdown fences, no explanation.
2. Import only \`cadquery as cq\` and \`math\`. No other imports.
3. All dimensions in millimeters.
4. The final model MUST be stored in a variable called \`result\`.
5. Target 200-400 lines. Enough for a detailed multi-component schematic.
6. NEVER produce fewer than 150 lines.
7. Use 30+ parameters in the PARAMETERS block — real dimensions, not made-up numbers.
8. Do NOT use \`open()\`, \`exec()\`, \`eval()\`, or file I/O.
9. Do NOT include print statements.

## What Makes a Good Schematic Model
1. **Recognizable overall shape** — the silhouette tells you what it is.
2. **Key functional components visible** — 5-8 most important parts as distinct shapes.
3. **Clear spatial arrangement** — where things sit relative to each other.
4. **Connection points visible** — pipe stubs, mounting flanges, ports show how it connects.
5. **Proportionally accurate** — realistic dimensions from domain knowledge.
6. **Hollow bodies** — housings should be shelled (outer.cut(inner)), not solid blocks.
7. **Mounting features** — screw bosses, bolt holes, or flanges where parts attach.

## CadQuery Technique Catalog (use these patterns)

### HOLLOW BODY (housing/enclosure)
\`\`\`python
outer = cq.Workplane("XY").box(w, d, h)
inner = cq.Workplane("XY").box(w - 2*wall, d - 2*wall, h - wall).translate((0, 0, wall/2))
body = outer.cut(inner)
\`\`\`

### MOUNTING FLANGE
\`\`\`python
flange = (cq.Workplane("XY")
    .circle(flange_od / 2).extrude(flange_t)
    .faces(">Z").workplane()
    .pushPoints([(r*math.cos(a), r*math.sin(a)) for a in [i*math.pi/2 for i in range(4)]])
    .circle(bolt_clear / 2).cutThrough())
\`\`\`

### PIPE / PORT STUB
\`\`\`python
stub = (cq.Workplane("XY")
    .circle(od / 2).extrude(length)
    .faces(">Z").workplane().circle(id / 2).cutThrough())
\`\`\`

### COOLING FINS / RIBS
\`\`\`python
for i in range(n_fins):
    y_pos = -total_span/2 + i * pitch
    fin = cq.Workplane("XZ").center(0, h/2).rect(w, fin_h).extrude(fin_t).translate((0, y_pos, 0))
    body = body.union(fin)
\`\`\`

### SHAFT / CYLINDRICAL FEATURE
\`\`\`python
shaft = (cq.Workplane("XY")
    .circle(shaft_d / 2).extrude(shaft_len))
# Add keyway
shaft = shaft.cut(
    cq.Workplane("XY").center(shaft_d/2 - key_depth, 0)
    .rect(key_depth, key_width).extrude(key_length))
\`\`\`

## Build Strategy
1. Start with a comprehensive PARAMETERS block (30+ values).
2. Build the main body/housing — use outer.cut(inner) for hollow enclosures.
3. Build each functional sub-component as a numbered section (# === 1. MAIN BODY ===).
4. Add connection interfaces (flanges, ports, mounting holes).
5. Union all parts into \`result\`.
6. Apply fillets for clean appearance — every fillet wrapped in try/except.

## Reliability (CRITICAL)
1. NEVER use \`.shell()\` — it crashes on complex shapes. Always build hollow bodies with outer.cut(inner).
2. Wrap EVERY \`.fillet()\` call in try/except — fall back to \`.chamfer()\` at half the radius, or skip.
3. Keep fillet radius under 30% of smallest adjacent edge.
4. Use tuples for \`.transformed(offset=(x,y,z))\` — not lists.
5. Build incrementally — assign to intermediate variables, don't chain 10+ operations.
6. Use numbered section comments (# === 1. MAIN BODY === ) for organization.
7. Verify shapes physically overlap before \`.cut()\` or \`.union()\`.

Output just the Python code.`

// ─── AI Provider Helpers ─────────────────────────────────────────────

/**
 * Calls OpenAI GPT-5.5 for CadQuery code generation, then falls back to
 * Gemini if it refuses or errors.
 *
 * @param systemPrompt - The system prompt
 * @param userPrompt - The user prompt
 * @param temperature - Sampling temperature (default 0.3)
 * @returns The generated text
 *
 * @throws Error if OPENAI_API_KEY is missing or all models fail
 */
async function callOpus(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.3,
  maxTokens: number = 16384,
): Promise<string> {
  // ── Stage 1: Try OpenAI GPT-5.5 ──
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (openaiKey) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-5.5",
          max_completion_tokens: maxTokens,
          temperature,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      })

      if (resp.ok) {
        const data = await resp.json()
        const text = data.choices?.[0]?.message?.content ?? ""

        console.info("[XRayCadGen] gpt-5.5 response:", {
          finishReason: data.choices?.[0]?.finish_reason,
          promptTokens: data.usage?.prompt_tokens,
          completionTokens: data.usage?.completion_tokens,
        })

        if (text.trim().length > 0) {
          return text
        }

        console.warn("[XRayCadGen] gpt-5.5 returned empty — trying Gemini fallback")
      } else {
        const errText = await resp.text()
        console.warn(`[XRayCadGen] gpt-5.5 error (${resp.status}): ${errText.slice(0, 200)}`)
      }
    } catch (error) {
      console.warn("[XRayCadGen] gpt-5.5 error:", error instanceof Error ? error.message : error)
    }
  }

  // ── Stage 2: Gemini fallback (different safety characteristics) ──
  const geminiKey = process.env.GOOGLE_AI_API_KEY?.trim()
  if (!geminiKey) {
    throw new Error("[XRayCadGen] GPT-5.5 failed and GOOGLE_AI_API_KEY is missing")
  }

  console.info("[XRayCadGen] GPT-5.5 unavailable or refused — falling back to Gemini")

  // SECURITY: Use x-goog-api-key header instead of URL query param (F6)
  const geminiModel = "gemini-3.1-pro-preview"
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`

  const geminiResponse = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
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
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("[XRayCadGen] GOOGLE_AI_API_KEY is not configured")
  }

  const { GoogleGenerativeAI } = await import("@google/generative-ai")
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" })

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
// SECURITY: module.name and module.purpose are interpolated into the AI prompt below.
// This is a prompt injection surface — the Modal sandbox is the primary defense against
// any malicious code the AI might generate in response to crafted module names.
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
  const baseUrl = process.env.MODAL_CAD_ENDPOINT_URL?.replace(/\/$/, "")
  if (!baseUrl) {
    throw new Error("[XRayCadGen] MODAL_CAD_ENDPOINT_URL is not configured")
  }

  console.info("[XRayCadGen] Sending code to Modal for execution:", {
    moduleId,
    codeLength: code.length,
  })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), MODAL_TIMEOUT_MS)

  try {
    const response = await fetch(`${baseUrl}/generate`, {
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

  // SECURITY: getPublicUrl on xray-images (bucket is public=true). Signed URLs expire in 1h
  // and this URL is persisted to cad_lab_projects — it must outlive that window. Access
  // control is the 122-bit UUID scanId in the path; URL guessing is infeasible. Keep aligned
  // with image-generator.ts uploadToStorage. If xray-images is ever flipped to public=false,
  // switch to on-read resigning (not on-write), because storage objects outlive any signed window.
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

  // Stage 2: Validate code before sending to Modal
  const validationError = validateCadQueryCode(cadQueryCode)
  let modalResult: ModalCadResponse
  if (validationError) {
    console.warn("[XRayCadGen] Module code failed pre-validation:", { moduleId: module.id, error: validationError })
    modalResult = { error: `Pre-validation: ${validationError}` } as ModalCadResponse
  } else {
    modalResult = await executeCadQueryOnModal(cadQueryCode, module.id, materialDensity)
  }

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

        // Validate regenerated code before executing
        const retryValidation = validateCadQueryCode(cadQueryCode)
        if (retryValidation) {
          lastError = `Pre-validation: ${retryValidation}`
          continue
        }

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
  svgExplodedUrl: string | undefined
  cadQueryCode: string
}

/**
 * System-level CadQuery prompt — generates hero model directly from spec.
 *
 * @description Forces the same engineering decomposition process that produces
 * manufacturing-quality models: identify product archetype, decompose into
 * subsystems, lock interfaces with real-world dimensions, then generate
 * parametric CadQuery for each subsystem. Includes standard hardware dimension
 * tables, CadQuery technique catalog, and a condensed reference example.
 *
 * Based on analysis of what makes hand-crafted CadQuery models dramatically
 * better than single-shot AI generation: structured decomposition before coding.
 */
const SYSTEM_CAD_PROMPT = `You are a world-class mechanical engineer writing CadQuery Python code for a detailed, manufacturing-intent 3D model of a complete product.

## MANDATORY: Engineering Decomposition (before writing ANY code)

You MUST follow this mental process before generating a single line of CadQuery:

### Step A: Identify the Product Archetype
- What is the closest real-world reference product? (e.g., "DJI Mavic 3" not just "drone")
- What is the structural paradigm?
  - Frame-based: drone, robot, CNC machine (structural frame with components bolted on)
  - Z-stack: smartphone, tablet, laptop (layers compressed into a slab)
  - Modular enclosure: industrial controller, server, lab equipment (frame + panels + modules)
  - Pressure vessel: pump, tank, valve (sealed housing with ports)
  - Articulated: robot arm, gimbal, linkage (joints + rigid links)
- What is the primary manufacturing process? (injection mold, CNC, sheet metal, 3D print)

### Step B: Decompose into 8-15 Subsystems
List every subsystem with:
- Name and function
- Approximate dimensions based on real-world knowledge
- Whether it's a bought component (motor, connector) or custom part (housing, bracket)
- Key interfaces with neighboring subsystems

### Step C: Define Interfaces FIRST, Geometry Second
For each subsystem boundary, lock the mating geometry using standard dimensions:

**Standard Hardware (use these exact values):**
- M2: clearance 2.2mm, tap 1.8mm, head 4.0mm, boss OD 6mm
- M2.5: clearance 2.7mm, tap 2.1mm, head 5.0mm, boss OD 7mm
- M3: clearance 3.2mm, tap 2.5mm, head 5.5mm, boss OD 8mm
- M4: clearance 4.3mm, tap 3.3mm, head 7.0mm, boss OD 10mm
- USB-C port: 9.0 x 3.4mm
- USB-A port: 14.0 x 6.5mm
- SD card slot: 12.0 x 1.5mm, depth 15mm
- Micro-SD slot: 11.0 x 1.0mm
- SMA antenna connector: 6.35mm mounting hole
- Standard PCB thickness: 1.6mm
- JST-XH pitch: 2.5mm

**Manufacturing Tolerances:**
- Press-fit: nominal +0.05mm
- Clearance fit: nominal +0.15mm
- Loose fit: nominal +0.30mm
- Injection mold wall: 1.5-3.0mm, draft 1-2 degrees
- Sheet metal: 0.8-2.0mm
- 3D print min wall: 0.8mm
- CNC min internal corner radius: 0.5mm

### Step D: Build Each Subsystem as a Numbered Section
Each subsystem gets its own section (# === 1. MAIN BODY SHELL ===) with intermediate variables.

## Rules
1. Output ONLY valid Python code using CadQuery. No markdown fences, no explanation.
2. Import only \`cadquery as cq\` and \`math\`. No other imports.
3. All dimensions in millimeters. Use real-world dimensions from your domain knowledge and the standard hardware table above.
4. The final model MUST be stored in a variable called \`result\`.
5. Start with a comprehensive PARAMETERS block (60+ parameters) organized by subsystem. Include wall thickness, fillet radii, bolt sizes, clearances, and tolerance constants.
6. Target 600-1000 lines of code. Aim for 800+. NEVER produce fewer than 500 lines. This is the HERO model.
7. Do NOT use \`open()\`, \`exec()\`, \`eval()\`, or file I/O. No print statements.
8. Build each subsystem incrementally with numbered sections and intermediate variables.
9. A detailed product model produces a 3-7MB STEP file with 50+ distinct geometric features. Aim for that level of detail.

## CadQuery Technique Catalog (use these patterns)

### SHELL BODY (every housing/enclosure MUST use this):
\`\`\`python
# Outer shape
body_outer = (cq.Workplane("XY")
    .box(length, width, height, centered=True)
    .edges("|Z").fillet(outer_fillet))
try:
    body_outer = body_outer.edges("#Z").fillet(top_fillet)
except: pass
# Inner cavity
body_inner = (cq.Workplane("XY")
    .workplane(offset=wall_thickness)
    .box(length - wall*2, width - wall*2, height - wall, centered=True)
    .edges("|Z").fillet(outer_fillet - 1))
body = body_outer.cut(body_inner)
\`\`\`

### SCREW BOSS (for shell assembly, PCB mounting):
\`\`\`python
for bx, by in boss_positions:
    boss = (cq.Workplane("XY")
        .workplane(offset=base_z)
        .transformed(offset=(bx, by, 0))
        .circle(boss_od / 2).extrude(boss_height))
    hole = (cq.Workplane("XY")
        .workplane(offset=base_z - 0.5)
        .transformed(offset=(bx, by, 0))
        .circle(tap_dia / 2).extrude(boss_height + 1))
    body = body.union(boss).cut(hole)
\`\`\`

### BOLT CIRCLE (for motor mounts, flanges, covers):
\`\`\`python
for i in range(bolt_count):
    angle = math.radians(i * 360 / bolt_count + offset_deg)
    bx = center_x + (bcd / 2) * math.cos(angle)
    by = center_y + (bcd / 2) * math.sin(angle)
    bolt_hole = (cq.Workplane("XY")
        .workplane(offset=mount_z - 1)
        .transformed(offset=(bx, by, 0))
        .circle(clearance_dia / 2).extrude(mount_height + 2))
    body = body.cut(bolt_hole)
\`\`\`

### INTERNAL RIBS (structural reinforcement):
\`\`\`python
# Longitudinal center rib
rib = (cq.Workplane("XY")
    .workplane(offset=floor_z)
    .box(length - wall*4, rib_thickness, height - wall*2 - 4, centered=True))
body = body.union(rib)
# Cross ribs at regular intervals
for x_pos in [-40, 0, 40]:
    cross_rib = (cq.Workplane("XY")
        .workplane(offset=floor_z)
        .transformed(offset=(x_pos, 0, 0))
        .box(rib_thickness, width - wall*4, height - wall*2 - 8, centered=True))
    body = body.union(cross_rib)
\`\`\`

### PORT CUTOUT (USB-C = 9.0x3.4mm, SD = 12.0x1.5mm):
\`\`\`python
usbc_cut = (cq.Workplane("XZ")
    .workplane(offset=-width/2 - 1)
    .transformed(offset=(port_x, port_z, 0))
    .box(9.0, 3.4, wall + 4, centered=True))
try:
    usbc_cut = usbc_cut.edges("|Y").fillet(1.5)
except: pass
body = body.cut(usbc_cut)
\`\`\`

### VENTILATION GRILLE (iterative slot cuts):
\`\`\`python
for i in range(vent_slot_count):
    x_off = vent_start_x + i * slot_spacing
    slot = (cq.Workplane("XY")
        .workplane(offset=top_z - 1)
        .transformed(offset=(x_off, 0, 0))
        .box(slot_width, slot_length, wall + 4, centered=True))
    body = body.cut(slot)
\`\`\`

### BATTERY BAY (with rails and contacts):
\`\`\`python
# Bay cavity
bay = (cq.Workplane("XY")
    .workplane(offset=bay_z)
    .transformed(offset=(bay_x, 0, 0))
    .box(bay_length, bay_width, bay_height, centered=True))
body = body.cut(bay)
# Rail guides along sides
for y_off in [-bay_width/2 + rail_w/2 + 1, bay_width/2 - rail_w/2 - 1]:
    rail = (cq.Workplane("XY")
        .workplane(offset=bay_z + wall)
        .transformed(offset=(bay_x, y_off, 0))
        .box(bay_length - 20, rail_w, rail_h, centered=True))
    body = body.union(rail)
\`\`\`

## Reference Example (condensed from a manufacturing-ready drone model)

This 150-line excerpt shows the QUALITY LEVEL and TECHNIQUE DENSITY expected:

\`\`\`python
import cadquery as cq
import math

# === PARAMETERS ===
body_length, body_width, body_height = 200, 85, 48
wall = 2.0
body_fillet = 14
arm_length, arm_width, arm_height = 140, 20, 16
arm_wall = 2.0
motor_mount_od, motor_bolt_circle = 28, 16.0
motor_bolt_dia = 3.2  # M3 clearance
motor_bolt_count = 4
boss_od, boss_id, boss_h = 8, 2.5, 12  # M2.5 screw bosses
pcb_standoff_dia, pcb_standoff_hole = 5, 2.5
vent_slot_w, vent_slot_l, vent_count = 2, 15, 6
usbc_w, usbc_h = 9.0, 3.4
batt_length, batt_width, batt_height = 110, 62, 30
batt_rail_w, batt_rail_h = 4, 3
tol_press, tol_clearance = 0.05, 0.15

# === 1. MAIN BODY (shelled with wall thickness) ===
body_outer = (cq.Workplane("XY")
    .box(body_length, body_width, body_height, centered=True)
    .edges("|Z").fillet(body_fillet))
try: body_outer = body_outer.edges(">Z").fillet(8)
except: pass
try: body_outer = body_outer.edges("<Z").fillet(4)
except: pass
body_inner = (cq.Workplane("XY").workplane(offset=-1)
    .box(body_length - wall*2, body_width - wall*2, body_height - wall, centered=True)
    .edges("|Z").fillet(body_fillet - 2))
try: body_inner = body_inner.edges(">Z").fillet(6)
except: pass
body = body_outer.cut(body_inner)

# === 2. INTERNAL RIBS (structural rigidity) ===
center_rib = (cq.Workplane("XY").workplane(offset=-body_height/2 + wall)
    .box(body_length - wall*4, 2, body_height - wall*2 - 4, centered=True))
body = body.union(center_rib)
for x_pos in [-40, 0, 40]:
    cross = (cq.Workplane("XY").workplane(offset=-body_height/2 + wall)
        .transformed(offset=(x_pos, 0, 0))
        .box(2, body_width - wall*4, body_height - wall*2 - 8, centered=True))
    body = body.union(cross)

# === 3. SCREW BOSSES (8x for shell assembly, M2.5 pilot holes) ===
boss_positions = [
    (body_length/2 - 15, body_width/2 - 12), (body_length/2 - 15, -body_width/2 + 12),
    (-body_length/2 + 15, body_width/2 - 12), (-body_length/2 + 15, -body_width/2 + 12),
    (30, body_width/2 - 10), (30, -body_width/2 + 10),
    (-30, body_width/2 - 10), (-30, -body_width/2 + 10),
]
for bx, by in boss_positions:
    boss = (cq.Workplane("XY").workplane(offset=-body_height/2 + wall)
        .transformed(offset=(bx, by, 0)).circle(boss_od/2).extrude(boss_h))
    hole = (cq.Workplane("XY").workplane(offset=-body_height/2 + wall - 0.5)
        .transformed(offset=(bx, by, 0)).circle(boss_id/2).extrude(boss_h + 1))
    body = body.union(boss).cut(hole)

# === 4. MOTOR MOUNT (M3 bolt circle, 16mm BCD, stator bore) ===
motor_z = -arm_height / 2
mount = (cq.Workplane("XY").workplane(offset=motor_z)
    .transformed(offset=(mx, my, 0)).circle(motor_mount_od/2).extrude(5))
bore = (cq.Workplane("XY").workplane(offset=motor_z - 1)
    .transformed(offset=(mx, my, 0)).circle(11).extrude(7))
mount = mount.cut(bore)
for i in range(motor_bolt_count):
    a = math.radians(i * 360/motor_bolt_count + 45)
    bx = mx + (motor_bolt_circle/2) * math.cos(a)
    by = my + (motor_bolt_circle/2) * math.sin(a)
    bolt = (cq.Workplane("XY").workplane(offset=motor_z - 1)
        .transformed(offset=(bx, by, 0)).circle(motor_bolt_dia/2).extrude(7))
    mount = mount.cut(bolt)
body = body.union(mount)

# === 5. VENTILATION (functional grille cuts) ===
for i in range(vent_count):
    x_off = -((vent_count-1)*4)/2 + i*4 - 25
    slot = (cq.Workplane("XY").workplane(offset=body_height/2 - 1)
        .transformed(offset=(x_off, 0, 0))
        .box(vent_slot_w, vent_slot_l, 10, centered=True))
    body = body.cut(slot)

# === 6. USB-C PORT CUTOUT (9.0 x 3.4mm standard) ===
usbc = (cq.Workplane("XZ").workplane(offset=-body_width/2 - 1)
    .transformed(offset=(-20, -5, 0)).box(usbc_w, usbc_h, wall+4, centered=True))
try: usbc = usbc.edges("|Y").fillet(usbc_h/2 - 0.3)
except: pass
body = body.cut(usbc)

result = body
\`\`\`

This example demonstrates: shelled body, internal ribs, screw bosses with pilot holes, M3 bolt circle on motor mount, functional ventilation grilles, standard USB-C port cutout — all in ~100 lines. Your HERO model should have this technique density across 600-1000 lines covering ALL subsystems.

## Reliability (CRITICAL)
1. NEVER use \`.shell()\` — it crashes on complex shapes. Always build hollow bodies with outer.cut(inner).
2. Wrap EVERY \`.fillet()\` call in try/except — fall back to \`.chamfer()\` at half the radius, or skip.
3. Keep fillet radius under 30% of smallest adjacent edge.
4. Use tuples for \`.transformed(offset=(x,y,z))\` — not lists.
5. Build incrementally — assign to intermediate variables, don't chain 10+ operations.
6. Use numbered section comments (# === 1. MAIN BODY === ) for organization.
7. Verify shapes physically overlap before \`.cut()\` or \`.union()\`.
8. For aerodynamic/organic bodies, consider \`loft()\` between cross-section profiles rather than box-with-fillets.

## REQUIRED: Exploded View (result_exploded)

After creating \`result\` (the assembled model), you MUST also create \`result_exploded\` — an exploded isometric view where each major subsystem is translated outward from the center so all parts are visible separately.

### How to Build the Exploded View

1. Keep each major subsystem as a SEPARATE variable before unioning into \`result\`.
2. After creating \`result\`, create \`result_exploded\` by translating each subsystem outward along its natural assembly direction.
3. Use an \`explosion_factor\` parameter (default 1.5) to control spacing.

### Pattern:
\`\`\`python
# After all subsystems are built as separate variables...

# Assembled view (all parts in correct positions)
result = body_shell
for part in [motor_assembly, gimbal, battery, landing_gear, antenna]:
    result = result.union(part)

# Exploded view (each part translated outward from center)
explosion_factor = 1.5  # Multiplier — increase for more separation

_parts_exploded = [
    (body_shell, (0, 0, 0)),           # Center body stays at origin
    (motor_assembly, (60, 60, 30)),     # Pull outward along assembly axis
    (gimbal, (0, 0, -70)),             # Pull down (it mounts underneath)
    (battery, (-20, 0, -80)),          # Pull down and back
    (landing_gear, (0, 0, -50)),       # Pull down
    (antenna, (0, 0, 50)),             # Pull up
]

result_exploded = _parts_exploded[0][0]
for _part, (_dx, _dy, _dz) in _parts_exploded[1:]:
    result_exploded = result_exploded.union(
        _part.translate((_dx * explosion_factor, _dy * explosion_factor, _dz * explosion_factor))
    )
\`\`\`

### Rules for the Exploded View:
- Use 5-10 major subsystems (not every tiny feature — group related parts)
- Translate along the natural assembly/disassembly direction
- The center body stays at origin (0,0,0)
- Parts above go UP, parts below go DOWN, parts to sides go OUTWARD
- Explosion offsets should be proportional to the model's bounding box (roughly 30-50% of each axis dimension)
- Wrap the entire exploded view section in try/except so it NEVER prevents the assembled \`result\` from being created

Output just the Python code.`

/**
 * Builds the user prompt for system-level CadQuery generation DIRECTLY from
 * the XRay spec — no structural brief intermediary.
 *
 * @description This is the key architectural change: instead of routing through
 * a lossy structural brief, we pass the full product context and let Opus use
 * its visual/domain knowledge to generate realistic geometry. The original idea
 * text (spec.idea) often contains the richest physical description and was
 * previously never passed to the CadQuery generator.
 *
 * @param spec - The full XRay spec including original idea text
 * @returns Formatted prompt string with maximum context
 */
function buildDirectSystemPrompt(spec: XRaySpec): string {
  // Build rich module descriptions with ALL available physical detail
  const moduleDetails = spec.modules
    .map((m) => {
      const parts = m.keyParts.join(", ")
      const inputs = m.io.in.join(", ")
      const outputs = m.io.out.join(", ")
      const whatItIs = m.detail?.whatItIs ?? ""
      const principles = m.detail?.operatingPrinciples ?? ""
      const materials = m.detail?.materialJustification ?? ""

      let detail = `### ${m.name}\n**Purpose:** ${m.purpose}\n**What it is:** ${whatItIs}`
      if (principles) detail += `\n**Operating principles:** ${principles}`
      if (materials) detail += `\n**Materials:** ${materials}`
      detail += `\n**Key physical components:** ${parts}`
      detail += `\n**Inputs:** ${inputs} | **Outputs:** ${outputs}`
      return detail
    })
    .join("\n\n")

  return `Generate a detailed, realistic 3D CadQuery model of this complete product. You know what this type of product looks like — use that knowledge for realistic geometry, proportions, and features.

## The Product

**Original description:** ${spec.idea}

**System function:** ${spec.function}

**Key materials:** ${spec.materials.join(", ")}

**Manufacturing processes:** ${spec.processes.join(", ")}

## Modules (each should be a distinct, recognizable sub-assembly)

${moduleDetails}

## What I Need

Build a HERO model — the main 3D visualization of this complete product. Someone looking at the 3D model should immediately say "that's a ${spec.function.toLowerCase().replace(/\.$/, "")}."

Use your knowledge of what this type of product actually looks like in the real world:
- Real-world proportions and dimensions (not arbitrary)
- Aerodynamic or organic shapes where appropriate (not everything is a box)
- Shell bodies with wall thickness for all housings/enclosures
- Each module as a recognizable, distinct sub-assembly
- Functional features: sensors, ports, vents, indicators, mounting hardware
- Internal structure visible through shells: ribs, standoffs, PCB mounts

Build in numbered sections (# === 1. MAIN BODY === etc.). Start with a comprehensive PARAMETERS block (60+ parameters organized by subsystem, including wall thicknesses, fillet radii, bolt sizes, clearances, and tolerance constants).

Target 600-1000 lines. Aim for 800+. NEVER fewer than 500 lines. This is the HERO model — every subsystem deserves its own section with full manufacturing detail.

Store the final model in a variable called \`result\`.`
}

/**
 * Generates a system-level 3D CAD model representing the overall product.
 *
 * @description Direct generation pipeline — NO structural brief intermediary.
 * Opus receives the full XRay spec (including original idea text) and uses its
 * own visual/domain knowledge to generate realistic CadQuery code. This produces
 * dramatically better models because the AI's knowledge of real-world product
 * geometry is preserved rather than compressed through an abstract brief.
 *
 * Pipeline: Full XRay spec -> Opus generates CadQuery directly (32K tokens) ->
 * Modal executes -> STL + SVG uploaded to storage.
 *
 * @param scanId - The scan ID for storage namespacing
 * @param spec - The full XRay spec (idea, function, modules, materials, etc.)
 * @returns URLs for STL and isometric SVG, plus the source code
 *
 * @throws CadGenerationError if all retry attempts fail
 */
export async function generateSystemCadModel(
  scanId: string,
  spec: XRaySpec,
): Promise<SystemCadResult> {
  // Stage 1: Opus generates CadQuery DIRECTLY from the full spec (32K tokens, no brief)
  const userPrompt = buildDirectSystemPrompt(spec)

  console.info("[XRayCadGen] Generating HERO system CadQuery directly from spec (Opus, 32K tokens)")

  // SECURITY: Temperature 0.2 for precise geometry generation (lower = more deterministic)
  let cadQueryCode = stripCodeFences(await callOpus(SYSTEM_CAD_PROMPT, userPrompt, 0.2, 32768))

  // Stage 2: Validate code before sending to Modal, then execute with retry loop
  const sysValidation = validateCadQueryCode(cadQueryCode)
  let modalResult: ModalCadResponse
  if (sysValidation) {
    console.warn("[XRayCadGen] System code failed pre-validation:", { error: sysValidation })
    modalResult = { error: `Pre-validation: ${sysValidation}` } as ModalCadResponse
  } else {
    modalResult = await executeCadQueryOnModal(cadQueryCode, "system", 1240)
  }

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
        cadQueryCode = stripCodeFences(
          await callGemini(
            SYSTEM_CAD_PROMPT,
            buildDirectSystemFallbackPrompt(spec),
          ),
        )
      } else {
        cadQueryCode = stripCodeFences(
          await callOpus(
            SYSTEM_CAD_PROMPT,
            `${userPrompt}\n\nThe previous code failed with this error:\n\n${modalResult.error.slice(0, 1000)}\n\nPrevious code:\n\`\`\`python\n${cadQueryCode}\n\`\`\`\n\nFix the geometry error. Keep the model detailed and realistic. Output ONLY the corrected Python code.`,
            0.2,
            32768,
          ),
        )
      }
      // Validate regenerated code before executing
      const retryValidation = validateCadQueryCode(cadQueryCode)
      if (retryValidation) {
        modalResult = { error: `Pre-validation: ${retryValidation}` } as ModalCadResponse
        continue
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

  // Stage 3: Conditional refinement — only refine when first pass clearly needs it.
  // The refinement pass adds ~60-90s (Opus + Modal), so only run it when the
  // first pass is deficient: very solid geometry (high fill ratio) OR short code.
  const pass1Analysis = modalResult.analysis
  if (pass1Analysis?.mass_properties && !pass1Analysis.mass_properties.error) {
    const mp = pass1Analysis.mass_properties
    const bb = mp.bounding_box
    const bbVolume = bb.xLen * bb.yLen * bb.zLen
    const fillRatio = bbVolume > 0 ? (mp.volume_mm3 / bbVolume) * 100 : 0
    const codeLines = cadQueryCode.split("\n").length

    // Quality gate: only refine if first pass is clearly deficient
    const needsRefinement = fillRatio > 70 || codeLines < 300
    const reason = fillRatio > 70
      ? `high fill ratio (${fillRatio.toFixed(0)}% — model is too solid)`
      : `short code (${codeLines} lines — insufficient detail)`

    console.info("[XRayCadGen] Pass 1 analysis:", {
      scanId,
      boundingBox: `${bb.xLen.toFixed(0)} x ${bb.yLen.toFixed(0)} x ${bb.zLen.toFixed(0)} mm`,
      volume_mm3: mp.volume_mm3.toFixed(0),
      mass_g: (mp.mass_kg * 1000).toFixed(1),
      fillRatio: `${fillRatio.toFixed(0)}%`,
      codeLines,
      needsRefinement,
      reason: needsRefinement ? reason : "pass 1 is good enough — skipping refinement",
    })

    if (needsRefinement) {
      try {
        const refinementPrompt = buildRefinementPrompt(cadQueryCode, mp, fillRatio, spec)
        const refinedCode = stripCodeFences(
          await callOpus(SYSTEM_CAD_PROMPT, refinementPrompt, 0.2, 32768),
        )

        // Only use refined code if it's longer (more detail) and executes successfully
        if (refinedCode.split("\n").length >= codeLines * 0.9) {
          const refinedResult = await executeCadQueryOnModal(refinedCode, "system-refined", 1240)

          if (!refinedResult.error) {
            console.info("[XRayCadGen] Refinement pass succeeded:", {
              scanId,
              originalLines: codeLines,
              refinedLines: refinedCode.split("\n").length,
            })
            cadQueryCode = refinedCode
            modalResult = refinedResult
          } else {
            console.warn("[XRayCadGen] Refinement pass failed — keeping original:", {
              scanId,
              error: refinedResult.error.slice(0, 200),
            })
          }
        } else {
          console.warn("[XRayCadGen] Refined code is significantly shorter — keeping original:", {
            scanId,
            originalLines: codeLines,
            refinedLines: refinedCode.split("\n").length,
          })
        }
      } catch (refineError) {
        // Refinement is best-effort — never fail the whole pipeline
        console.warn("[XRayCadGen] Refinement pass error — keeping original:", {
          scanId,
          error: refineError instanceof Error ? refineError.message : "Unknown",
        })
      }
    }
  }

  // Stage 4: Upload STL, isometric SVG, and exploded view SVG
  const [stlUrl, svgIsoUrl, svgExplodedUrl] = await Promise.all([
    modalResult.stl
      ? uploadCadFile(scanId, "system-cad/model.stl", modalResult.stl, "model/stl")
      : Promise.resolve(undefined),
    modalResult.svg_iso
      ? uploadCadFile(scanId, "system-cad/iso.svg", modalResult.svg_iso, "image/svg+xml")
      : Promise.resolve(undefined),
    modalResult.svg_exploded
      ? uploadCadFile(scanId, "system-cad/exploded_iso.svg", modalResult.svg_exploded, "image/svg+xml")
      : Promise.resolve(undefined),
  ])

  console.info("[XRayCadGen] System CAD model generated:", {
    scanId,
    hasStl: !!stlUrl,
    hasSvg: !!svgIsoUrl,
    hasExploded: !!svgExplodedUrl,
  })

  return { stlUrl, svgIsoUrl, svgExplodedUrl, cadQueryCode }
}

/**
 * Builds the second-pass refinement prompt for system-level CAD.
 *
 * @description After the first pass succeeds, this prompt sends the analysis
 * data back to Opus and asks it to add manufacturing detail that's missing.
 * This simulates the iterative refinement (v1 -> v2) that produces dramatically
 * better models when Claude can see the analysis of its own output.
 *
 * @param firstPassCode - The CadQuery code from the first pass
 * @param massProps - Mass properties from Modal analysis
 * @param fillRatio - Volume / bounding box volume as percentage
 * @param spec - The original XRay spec for context
 * @returns Formatted refinement prompt
 */
function buildRefinementPrompt(
  firstPassCode: string,
  massProps: NonNullable<ModalAnalysisPayload["mass_properties"]>,
  fillRatio: number,
  spec: XRaySpec,
): string {
  const bb = massProps.bounding_box
  const codeLines = firstPassCode.split("\n").length

  // Build a checklist of potentially missing features based on analysis
  const missingFeatures: string[] = []

  if (fillRatio > 85) {
    missingFeatures.push("- Internal structural ribs (model is " + fillRatio.toFixed(0) + "% solid — real products are hollow with ribbing)")
  }

  // Check if common manufacturing features are mentioned in the code
  const codeLower = firstPassCode.toLowerCase()
  if (!codeLower.includes("boss") && !codeLower.includes("standoff")) {
    missingFeatures.push("- Screw bosses for shell assembly (M2.5 or M3 with pilot holes)")
  }
  if (!codeLower.includes("pcb") && !codeLower.includes("standoff") && !codeLower.includes("mounting post")) {
    missingFeatures.push("- PCB mounting standoffs with M2.5 threaded holes")
  }
  if (!codeLower.includes("usb") && !codeLower.includes("port") && !codeLower.includes("cutout")) {
    missingFeatures.push("- Port cutouts (USB-C = 9.0x3.4mm, SD card = 12x1.5mm, or relevant connectors)")
  }
  if (!codeLower.includes("vent") && !codeLower.includes("grille") && !codeLower.includes("slot")) {
    missingFeatures.push("- Ventilation grilles or cooling slots for thermal management")
  }
  if (!codeLower.includes("rib") && !codeLower.includes("cross") && !codeLower.includes("reinforc")) {
    missingFeatures.push("- Internal ribs (longitudinal + cross members for structural rigidity)")
  }
  if (!codeLower.includes("wire") && !codeLower.includes("channel") && !codeLower.includes("routing")) {
    missingFeatures.push("- Wire routing channels between subsystems")
  }
  if (!codeLower.includes("bolt") && !codeLower.includes("bolt_circle") && !codeLower.includes("bcd")) {
    missingFeatures.push("- Bolt circle patterns on motor mounts or flanges")
  }
  if (!codeLower.includes("gasket") && !codeLower.includes("seal") && !codeLower.includes("o_ring")) {
    missingFeatures.push("- Gasket grooves or seal channels for weatherproofing (if applicable)")
  }
  if (!codeLower.includes("led") && !codeLower.includes("indicator") && !codeLower.includes("status")) {
    missingFeatures.push("- Status LED channels or indicator windows")
  }
  if (!codeLower.includes("sensor") && !codeLower.includes("recess")) {
    missingFeatures.push("- Sensor mounting recesses or windows")
  }

  const missingSection = missingFeatures.length > 0
    ? `\n\nThe model appears to be MISSING these manufacturing details:\n${missingFeatures.join("\n")}\n\nAdd whichever of these are appropriate for this product type.`
    : "\n\nThe model already includes good manufacturing detail. Focus on adding more internal structure, finer port cutouts, and any missing subsystem features."

  return `You previously generated CadQuery code for this product. Here is your code and the analysis results from executing it.

## Analysis of Your Model
- **Bounding box:** ${bb.xLen.toFixed(1)} x ${bb.yLen.toFixed(1)} x ${bb.zLen.toFixed(1)} mm
- **Volume:** ${massProps.volume_mm3.toFixed(0)} mm³
- **Mass:** ${(massProps.mass_kg * 1000).toFixed(1)} g (at ${massProps.material_density_kg_m3} kg/m³)
- **Fill ratio:** ${fillRatio.toFixed(0)}% (volume / bounding box volume — lower = more hollow/detailed)
- **Code length:** ${codeLines} lines

## Your Previous Code
\`\`\`python
${firstPassCode}
\`\`\`

## Product Context
**What it is:** ${spec.idea}
**Function:** ${spec.function}
${missingSection}

## Your Task
Improve the model by adding MORE manufacturing detail. Keep everything that already works, and ADD:
1. Any missing features from the list above
2. More internal structure (ribs, standoffs, mounting features)
3. Finer geometric detail on existing subsystems
4. Standard hardware dimensions where applicable (M3 = 3.2mm clearance, USB-C = 9.0x3.4mm, etc.)

Output the COMPLETE improved Python code (not a diff — the full file).
Target ${Math.max(codeLines + 100, 700)}+ lines.
Store the final model in a variable called \`result\`.`
}

/**
 * Builds a Gemini fallback prompt for system-level CAD — uses spec directly, no brief.
 *
 * @description Simpler than the Opus prompt but still uses the full spec context.
 * Gemini gets the original idea text and module details to preserve domain knowledge.
 *
 * @param spec - The full XRay spec
 * @returns Fallback prompt string
 */
function buildDirectSystemFallbackPrompt(spec: XRaySpec): string {
  const moduleSummary = spec.modules
    .map((m) => `- **${m.name}:** ${m.purpose}\n  Key parts: ${m.keyParts.join(", ")}`)
    .join("\n")

  return `Generate CadQuery Python code for a realistic, recognizable 3D model of this product.

**What it is:** ${spec.idea}

**System function:** ${spec.function}

**Materials:** ${spec.materials.slice(0, 8).join(", ")}

**Modules:**
${moduleSummary}

You know what this type of product looks like. Use realistic proportions and shapes from your domain knowledge.

MANDATORY ENGINEERING PROCESS:
A. Identify the product archetype — you know what this type of product looks like.
B. Decompose into 8-12 subsystems (each as a separate CadQuery variable).
C. Define real interfaces: mounting bolt patterns, port dimensions, wall thicknesses.
D. Build each subsystem in a numbered section (# === 1. MAIN BODY ===).

CONSTRAINTS:
- Target 500-800 lines of code. NEVER fewer than 400 lines.
- NEVER use .shell() — build hollow bodies with outer.cut(inner)
- Wrap EVERY .fillet() in try/except, falling back to .chamfer() at half radius
- Use .union() and .cut() for multi-component assemblies
- Shell ALL housings (wall thickness 1.5-3mm)
- Each module as a recognizable sub-assembly (not a box)
- Start with a comprehensive PARAMETERS block (50+ parameters)
- Include internal ribs, screw bosses, port cutouts, and ventilation grilles
- Use real-world dimensions: M3 clearance = 3.2mm, USB-C = 9.0x3.4mm, M2.5 screw boss OD = 6mm
- Build each subsystem as a SEPARATE variable before unioning

REQUIRED — EXPLODED VIEW:
After creating \`result\` (assembled model), also create \`result_exploded\`:
1. Keep each major subsystem as a separate variable.
2. After unioning into \`result\`, translate each subsystem outward from center along its assembly axis.
3. Union the translated parts into \`result_exploded\`.
4. Center body at origin, parts above go UP, below go DOWN, sides go OUTWARD.
5. Wrap in try/except so it never blocks \`result\`.

Pattern:
\`\`\`
result_exploded = body_shell  # center stays
for part, offset in [(motor, (60,0,30)), (battery, (0,0,-50)), ...]:
    result_exploded = result_exploded.union(part.translate(offset))
\`\`\`

Store assembled model in \`result\`, exploded in \`result_exploded\`.
Output ONLY the Python code. No markdown fences, no explanation.`
}
