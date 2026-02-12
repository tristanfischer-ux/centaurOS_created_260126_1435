"use server"

/**
 * @file cad-lab.ts — Stripped-down CAD generation for the hidden lab page.
 *
 * @description Minimal pipeline: Gemini 2.5 Pro → Modal → results.
 * Bakes in the three critical discoveries from experiments:
 * 1. Web research context (real product specs)
 * 2. CadQuery positioning patterns (only reliable pattern)
 * 3. Fillet rules (fillet pieces, never assembly)
 *
 * @security Server-side only, uses admin API keys.
 */

// ─── Types ───────────────────────────────────────────────────────────

/** Available Gemini models for A/B testing */
export const GEMINI_MODELS = [
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (stable)" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (fast)" },
  { id: "gemini-3-pro-preview", label: "Gemini 3 Pro (preview)" },
] as const

export type GeminiModelId = typeof GEMINI_MODELS[number]["id"]

export interface CadLabResult {
  success: boolean
  error?: string
  code?: string
  codeLines?: number
  generationTime?: number
  modalTime?: number
  svgIso?: string
  svgTop?: string
  svgFront?: string
  stepSize?: number
  stlSize?: number
  bbox?: { xLen: number; yLen: number; zLen: number }
  fillRatio?: number
  massGrams?: number
  volumeMm3?: number
  tokensIn?: number
  tokensOut?: number
  modelUsed?: string
}

// ─── Prompts ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert CadQuery programmer. You write ONLY code that follows the strict rules below. Any violation will crash the sandbox.

=== IMPORTS (only these two) ===
import cadquery as cq
import math

=== ABSOLUTE RULES — VIOLATIONS CRASH THE SANDBOX ===

1. EVERY shape starts from cq.Workplane("XY"). NEVER use "YZ", "XZ", or any other plane string.
2. Position with .workplane(offset=Z) then .transformed(offset=(X, Y, 0), rotate=(0, 0, ANGLE)).
3. NEVER call .translate(), .rotate(), .mirror(), or .moved() on any shape.
4. NEVER use cq.Workplane("XY", origin=(...)).
5. NEVER use cq.Compound, cq.Solid.makeLoft, cq.Solid.makeSolid, or cq.Assembly.
6. NEVER use .fillet() or .chamfer() — they crash on complex assemblies. Skip all rounding.
7. NEVER use .sphere() — use .circle().revolve() if you need a dome shape, or approximate with .circle().extrude().
8. ALL .box() calls MUST have centered=True.
9. NEVER use .loft() — it frequently crashes. Use .extrude() only.
10. NEVER use .sweep() — it frequently crashes. Use .extrude() only.
11. body_shell must be a cq.Workplane object, not a Compound or Solid.
12. End with: result = body_shell
13. FORBIDDEN: import os, open(), print(), cq.exporters, any file I/O.

=== CORRECT PATTERNS ===

Initialize body_shell as a real Workplane (NEVER as Compound):
  body_shell = cq.Workplane("XY").box(180, 85, 48, centered=True)

Hollow body (cut inner from outer):
  outer = cq.Workplane("XY").box(180, 85, 48, centered=True)
  inner = cq.Workplane("XY").workplane(offset=-1).box(176, 81, 46, centered=True)
  body_shell = outer.cut(inner)

Position a feature at (X, Y, Z):
  feature = (
      cq.Workplane("XY")
      .workplane(offset=Z)
      .transformed(offset=(X, Y, 0))
      .box(length, width, height, centered=True)
  )
  body_shell = body_shell.union(feature)

Rotated arm from pivot to motor:
  arm_center_x = (pivot_x + motor_x) / 2
  arm_center_y = (pivot_y + motor_y) / 2
  arm_length = math.sqrt((motor_x - pivot_x)**2 + (motor_y - pivot_y)**2)
  angle = math.degrees(math.atan2(motor_y - pivot_y, motor_x - pivot_x))
  arm = (
      cq.Workplane("XY")
      .workplane(offset=arm_z)
      .transformed(offset=(arm_center_x, arm_center_y, 0), rotate=(0, 0, angle))
      .box(arm_length, arm_width, arm_height, centered=True)
  )
  body_shell = body_shell.union(arm)

Cylinder (motor, sensor, GPS dome):
  motor = (
      cq.Workplane("XY")
      .workplane(offset=z_pos)
      .transformed(offset=(x_pos, y_pos, 0))
      .circle(radius)
      .extrude(height)
  )
  body_shell = body_shell.union(motor)

Hollow cylinder (ring, tube):
  outer_cyl = (
      cq.Workplane("XY")
      .workplane(offset=z_pos)
      .transformed(offset=(x_pos, y_pos, 0))
      .circle(outer_radius)
      .extrude(height)
  )
  inner_cyl = (
      cq.Workplane("XY")
      .workplane(offset=z_pos - 0.1)
      .transformed(offset=(x_pos, y_pos, 0))
      .circle(inner_radius)
      .extrude(height + 0.2)
  )
  ring = outer_cyl.cut(inner_cyl)
  body_shell = body_shell.union(ring)

Cutout (port, slot, sensor window):
  cutout = (
      cq.Workplane("XY")
      .workplane(offset=z_pos)
      .transformed(offset=(x_pos, y_pos, 0))
      .box(w, d, h, centered=True)
  )
  body_shell = body_shell.cut(cutout)

=== STRUCTURE ===

1. Declare ALL dimensions as named variables at the top (100+ variables)
2. Build the outer body box, cut inner to make hollow shell
3. Add battery bay cutout
4. Loop over 4 arm definitions to add arms, motors, propellers
5. Add camera/gimbal, GPS, sensors, vents, landing gear, ports
6. Target 500-800 lines of code
7. EVERY union/cut operates on body_shell directly — no helper functions that return shapes
8. End with: result = body_shell`

// ─── Gemini API Call ─────────────────────────────────────────────────

/**
 * Calls a Gemini model to generate CadQuery code.
 *
 * @param userPrompt - The product description + research data
 * @param modelId - Which Gemini model to use (defaults to gemini-2.5-pro)
 * @returns Generated code and token counts
 */
async function callGemini(
  userPrompt: string,
  modelId: GeminiModelId = "gemini-2.5-pro",
): Promise<{
  code: string
  tokensIn: number
  tokensOut: number
}> {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured")

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        maxOutputTokens: 65536,
        temperature: 0.3,
      },
    }),
    signal: AbortSignal.timeout(600_000), // 10 min timeout for Gemini
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 300)}`)
  }

  const data = await response.json()
  const fullText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
  const usage = data.usageMetadata ?? {}

  // Extract code from markdown fence
  let code: string
  if (fullText.includes("```python")) {
    code = fullText.split("```python")[1]?.split("```")[0]?.trim() ?? fullText
  } else if (fullText.includes("```")) {
    code = fullText.split("```")[1]?.split("```")[0]?.trim() ?? fullText
  } else {
    code = fullText.trim()
  }

  // Strip forbidden patterns (imports, print, and rule-violating method chains)
  const cleaned = code
    .split("\n")
    .filter((line: string) => {
      const s = line.trim()
      if (s.startsWith("#") && (s.includes("import os") || s.includes("open(") || s.includes("print("))) return false
      if (s.startsWith("import os") || s.startsWith("from os")) return false
      if (/^print\s*\(/.test(s)) return false
      return true
    })
    .join("\n")
    // Strip .rotate() and .translate() method calls that break CadQuery
    .replace(/\s*\.rotate\([^)]*\)/g, "")
    .replace(/\s*\.translate\([^)]*\)/g, "")
    .replace(/\s*\.mirror\([^)]*\)/g, "")
    .replace(/\s*\.moved\([^)]*\)/g, "")

  return {
    code: cleaned,
    tokensIn: usage.promptTokenCount ?? 0,
    tokensOut: usage.candidatesTokenCount ?? 0,
  }
}

// ─── Modal Execution ─────────────────────────────────────────────────

interface ModalResponse {
  error: string | null
  step: string | null
  stl: string | null
  svg_iso: string | null
  svg_top: string | null
  svg_front: string | null
  svg_right: string | null
  analysis: {
    mass_properties?: {
      mass_kg?: number
      volume_mm3?: number
      bounding_box?: { xLen: number; yLen: number; zLen: number }
      error?: string
    }
  } | null
}

/**
 * Executes CadQuery code on Modal.
 *
 * @param code - The CadQuery Python code
 * @returns Modal execution result
 */
async function executeOnModal(code: string): Promise<ModalResponse> {
  const endpointUrl = process.env.MODAL_CAD_ENDPOINT_URL
  if (!endpointUrl) throw new Error("MODAL_CAD_ENDPOINT_URL not configured")

  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      module_id: "cad-lab",
      material_density: 1240,
    }),
    signal: AbortSignal.timeout(300_000), // 5 min timeout
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Modal error (${response.status}): ${errText.slice(0, 300)}`)
  }

  return (await response.json()) as ModalResponse
}

// ─── Main Action ─────────────────────────────────────────────────────

/**
 * Generate a CAD model from a text description.
 *
 * @description Two-pass pipeline: description → Gemini (base) → Gemini (refine) → Modal → results.
 * The strict CadQuery rules are baked into the system prompt to prevent crashes.
 *
 * @param description - What to model (e.g., "DJI Mavic Air 2 drone")
 * @param researchContext - Optional real-world specs (dimensions, components)
 * @param modelId - Which Gemini model to use (defaults to gemini-2.5-pro)
 * @returns Generation result with SVGs, metrics, and code
 */
export async function generateCadLabModel(
  description: string,
  researchContext?: string,
  modelId: GeminiModelId = "gemini-2.5-pro",
): Promise<CadLabResult> {
  try {
    // Build user prompt (no fillets — they crash complex assemblies)
    const userPrompt = researchContext
      ? `${researchContext}\n\nUsing the EXACT dimensions from the research above, create a complete CadQuery model of: ${description}\n\nDeclare ALL dimensions as named variables. Model EVERY feature. DO NOT use .fillet() or .chamfer(). End with: result = body_shell`
      : `Create a detailed CadQuery model of: ${description}\n\nUse real-world dimensions in millimeters. Research typical dimensions for this product type. Declare ALL dimensions as named variables. Model every component with maximum detail. DO NOT use .fillet() or .chamfer(). End with: result = body_shell`

    // Step 1: Generate base code with Gemini
    const genStart = Date.now()
    const { code: baseCode, tokensIn: tokensIn1, tokensOut: tokensOut1 } = await callGemini(userPrompt, modelId)

    // Step 2: Refinement pass — add sub-component detail
    const refinePrompt = `Here is working CadQuery code for ${description}. Add more sub-component detail: motor bell housings, motor shafts, propeller hubs, battery rails, battery contacts, PCB with standoffs, USB-C and microSD port cutouts, rear sensor cutout, antenna, arm hollowing. DO NOT change existing geometry. Only ADD via .union() and .cut(). Output the COMPLETE updated code. DO NOT use .fillet(), .chamfer(), .translate(), .rotate(), .sphere(), .loft(), .sweep(). End with: result = body_shell\n\n\`\`\`python\n${baseCode}\n\`\`\``
    const { code: refinedCode, tokensIn: tokensIn2, tokensOut: tokensOut2 } = await callGemini(refinePrompt, modelId)
    const generationTime = Date.now() - genStart

    const code = refinedCode
    const tokensIn = tokensIn1 + tokensIn2
    const tokensOut = tokensOut1 + tokensOut2
    const codeLines = code.split("\n").length

    // Step 3: Execute on Modal
    const modalStart = Date.now()
    const modalResult = await executeOnModal(code)
    const modalTime = Date.now() - modalStart

    if (modalResult.error && !modalResult.svg_iso) {
      return {
        success: false,
        error: modalResult.error,
        code,
        codeLines,
        generationTime,
        modalTime,
        tokensIn,
        tokensOut,
      }
    }

    // Step 3: Extract metrics
    const mp = modalResult.analysis?.mass_properties
    const bb = mp?.bounding_box
    const vol = mp?.volume_mm3 ?? 0
    const bbVol = bb ? bb.xLen * bb.yLen * bb.zLen : 0

    return {
      success: true,
      code,
      codeLines,
      generationTime,
      modalTime,
      svgIso: modalResult.svg_iso ? `data:image/svg+xml;base64,${modalResult.svg_iso}` : undefined,
      svgTop: modalResult.svg_top ? `data:image/svg+xml;base64,${modalResult.svg_top}` : undefined,
      svgFront: modalResult.svg_front ? `data:image/svg+xml;base64,${modalResult.svg_front}` : undefined,
      stepSize: modalResult.step ? Math.round(atob(modalResult.step).length / 1024) : undefined,
      stlSize: modalResult.stl ? Math.round(atob(modalResult.stl).length / 1024) : undefined,
      bbox: bb ? { xLen: Math.round(bb.xLen), yLen: Math.round(bb.yLen), zLen: Math.round(bb.zLen) } : undefined,
      fillRatio: bbVol > 0 ? Math.round((vol / bbVol) * 1000) / 10 : undefined,
      massGrams: mp?.mass_kg ? Math.round(mp.mass_kg * 1000 * 10) / 10 : undefined,
      volumeMm3: vol ? Math.round(vol) : undefined,
      tokensIn,
      tokensOut,
      modelUsed: modelId,
      error: modalResult.error ?? undefined,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}
