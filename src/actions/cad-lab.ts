"use server"

/**
 * @file cad-lab.ts — Component-decomposed CAD generation pipeline.
 *
 * @description Implements Claude Code's corrected architecture:
 *   Pass 0: Reference dimensions (hardcoded library)
 *   Pass 1: Gemini generates interface definition (text only, no code)
 *   Pass 2-N: Gemini generates one component function each (parallelized)
 *   Pass N+1: Gemini generates assembly script (union calls only)
 *   Pass N+2: Modal executes complete assembly (single call)
 *
 * Key insight: "Banning operations is treating symptoms. The disease is:
 * no interface definition." Each component function is short enough (30-80
 * lines) that the LLM stays within safe CadQuery patterns naturally.
 *
 * @security Server-side only, uses admin API keys.
 */

// ─── Types ───────────────────────────────────────────────────────────
// Shared types/constants live in @/lib/cad-lab-types.ts (not "use server")
// so client components can import them as plain values.

import type { GeminiModelId, CadLabResult } from "@/lib/cad-lab-types"

/** Structured component definition from interface definition */
interface ComponentDef {
  name: string
  description: string
  w_mm: number
  d_mm: number
  h_mm: number
  qty: number
}

/** Parsed interface definition with structured data */
interface InterfaceDef {
  target_bbox: { x: number; y: number; z: number }
  motor_diagonal_mm: number
  components: ComponentDef[]
  raw_text: string
}

/** Result of a single component generation + local validation */
interface ComponentResult {
  name: string
  code: string
  valid: boolean
  error?: string
  stripped: boolean
  retries: number
}

// CadLabResult and GeminiModelId types imported from @/lib/cad-lab-types

// ─── Pass 0: Reference Library ───────────────────────────────────────

/**
 * Hardcoded reference dimensions for known product types.
 *
 * @description Claude Code: "When Gemini invents component dimensions,
 * they're wrong. Every model that worked used real-world reference specs."
 */
const DRONE_REFERENCE = `=== DRONE REFERENCE DIMENSIONS (validated) ===

Motor: Ø28×13mm brushless outrunner (e.g. EMAX RS2205)
Prop: 5" (127mm) diameter, 2-blade folding
ESC: 36×36mm stack-mount, 4mm thick
Flight controller: 36×36mm, 30.5×30.5mm mounting holes
Battery: 70×35×25mm (4S 1500mAh)
Arm tube: Ø12mm carbon fibre
Camera: 19×19mm micro (e.g. Caddx Ratel)
Hardware: M3 throughout
Motor-to-motor diagonal: ~302mm (for 5" props with clearance)

Key constraint: motor-to-motor diagonal MUST be approximately 302mm.
Arm length from body pivot to motor centre: ~140mm.`

/** Target constraints for post-execution validation */
const DRONE_TARGET = {
  motorDiagonalMm: 302,
  minBBoxX: 300,
  maxBBoxX: 600,
  minBBoxY: 250,
  maxBBoxY: 500,
  minBBoxZ: 80,
  maxBBoxZ: 200,
}

// ─── Pass 1: Interface Definition Prompt ─────────────────────────────

/**
 * System prompt for the interface definition step.
 * NO CadQuery rules — this is pure engineering planning.
 */
const INTERFACE_SYSTEM_PROMPT = `You are an engineering planner for parametric CAD models. You are NOT writing code.

Your job is to produce a text-only interface definition that will be used to generate CadQuery component functions. Every dimension must be a specific number in millimetres. The numbers must sum correctly — show the arithmetic.

Output EXACTLY this format:

=== SPACE BUDGET ===
[Vertical/horizontal stack showing how components fit within the target envelope. Show dimensions and how they add up.]

=== COMPONENT PLACEMENT TABLE ===
| Component | Qty | Size (mm) | Position (x,y,z) | Notes |
|-----------|-----|-----------|-------------------|-------|
[One row per unique component type. Position is the centre point.]

=== DERIVED CONSTRAINTS ===
- Target BBox: W×D×H mm
- Motor-to-motor diagonal: N mm (calculated from positions)
- Arm length: N mm
- Total unique component types: N

=== VALIDATION ARITHMETIC ===
- BBox X: [calculation showing max_x - min_x]
- BBox Y: [calculation showing max_y - min_y]
- BBox Z: [calculation showing max_z - min_z]
- Motor diagonal: sqrt((x2-x1)² + (y2-y1)²) = N mm
- Conflicts: [list any overlapping components, or "None"]

=== STRUCTURED DATA (JSON) ===
\`\`\`json
{
  "target_bbox": {"x": NUMBER, "y": NUMBER, "z": NUMBER},
  "motor_diagonal_mm": NUMBER,
  "components": [
    {"name": "snake_case_name", "description": "Brief description", "w_mm": NUMBER, "d_mm": NUMBER, "h_mm": NUMBER, "qty": NUMBER},
    ...
  ]
}
\`\`\`

CRITICAL RULES:
- Every position must be calculated from named quantities, not eyeballed
- The motor-to-motor diagonal MUST match the reference target (within 5mm)
- Components must not overlap spatially
- The JSON component list must match the placement table exactly
- DO NOT WRITE ANY CODE`

// ─── Pass 2-N: Component Function Prompt ─────────────────────────────

/**
 * System prompt for generating individual component functions.
 * Template-based approach — tells the LLM what TO do, not just what not to do.
 */
const COMPONENT_SYSTEM_PROMPT = `You are generating a single CadQuery component function. Follow the template exactly.

TEMPLATE:
\`\`\`python
import cadquery as cq
import math

def make_{component_name}(x=0, y=0, z=0):
    """
    {component_name}: {W}×{D}×{H} mm
    """
    result = (
        cq.Workplane("XY")
        .workplane(offset=z)
        .transformed(offset=(x, y, 0))
        # Build geometry here
    )
    return result

# Test
result = make_{component_name}()
\`\`\`

RULES:
- Start with cq.Workplane("XY") — no other starting plane
- Return a cq.Workplane object
- Use .transformed(offset=..., rotate=...) for positioning and orientation
  — NEVER use .rotate() or .translate() on an existing body
- Fillets: allowed, but only on THIS component (before it gets unioned
  with anything else), maximum 3mm radius, use simple edge selectors
  like .edges(">Z") or .edges("|Z")
- Use .box(centered=True), .circle().extrude(), .rect().extrude(), .cut(), .union()
- For angled features, use .transformed(rotate=(rx, ry, rz)) to set up
  the workplane before creating geometry
- ALL derived dimensions must be calculated from named parameters at the top
- Keep it under 80 lines
- The function may accept extra parameters beyond (x, y, z) if the component
  needs them (e.g. angle for arms). Declare defaults for all extra params.

DO NOT USE:
- .loft(), .sweep(), .mirror()
- cq.Compound, cq.Solid, cq.Assembly
- cq.Workplane("YZ"), cq.Workplane("XZ")
- .rotate(), .translate(), .moved() on an existing body
- import os, open(), print(), cq.exporters

Output ONLY the Python code. No explanations.`

// ─── Pass N+1: Assembly Prompt ───────────────────────────────────────

const ASSEMBLY_SYSTEM_PROMPT = `You are assembling pre-validated CadQuery component functions into a complete model.

RULES:
- Do NOT modify any component function — paste them exactly as given
- Assembly is ONLY .union() and .cut() calls — no new geometry creation
- Positions come from the interface definition placement table
- For components with qty > 1, call the function multiple times at each position
- The final variable MUST be called "result"
- Import cadquery and math at the top
- ALL parameters must be named variables (no magic numbers in union calls)
- If a component needs position-specific parameters (like arm angle), pass them

TEMPLATE:
\`\`\`python
import cadquery as cq
import math

# === Component functions (pasted exactly as validated) ===
{functions}

# === Dimensions (from interface definition) ===
{dimension_variables}

# === Assembly ===
result = make_body_shell()
# Union each component at its interface-defined position
result = result.union(make_arm(x=..., y=..., z=...))
# ... one call per component instance
\`\`\`

Output ONLY the complete Python code. No explanations.`

// ─── Gemini API Call ─────────────────────────────────────────────────

/**
 * Calls a Gemini model and returns the raw response text.
 *
 * @param systemPrompt - System instruction for the model
 * @param userPrompt - User message content
 * @param modelId - Which Gemini model to use
 * @returns Raw response text and token counts
 */
async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  modelId: GeminiModelId = "gemini-2.5-pro",
): Promise<{
  text: string
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
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        maxOutputTokens: 65536,
        temperature: 0.3,
      },
    }),
    signal: AbortSignal.timeout(600_000),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 300)}`)
  }

  const data = await response.json()
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
  const usage = data.usageMetadata ?? {}

  return {
    text,
    tokensIn: usage.promptTokenCount ?? 0,
    tokensOut: usage.candidatesTokenCount ?? 0,
  }
}

// ─── Code Extraction ─────────────────────────────────────────────────

/**
 * Extracts Python code from a Gemini response that may contain markdown fences.
 *
 * @param text - Raw Gemini response text
 * @returns Extracted Python code
 */
function extractCode(text: string): string {
  if (text.includes("```python")) {
    return text.split("```python")[1]?.split("```")[0]?.trim() ?? text.trim()
  }
  if (text.includes("```")) {
    return text.split("```")[1]?.split("```")[0]?.trim() ?? text.trim()
  }
  return text.trim()
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
 * @param code - Complete CadQuery Python code
 * @returns Modal execution result with exports and analysis
 */
async function executeOnModal(code: string): Promise<ModalResponse> {
  const endpointUrl = process.env.MODAL_CAD_ENDPOINT_URL
  if (!endpointUrl) throw new Error("MODAL_CAD_ENDPOINT_URL not configured")

  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      module_id: "cad-lab-v2",
      material_density: 1240,
    }),
    signal: AbortSignal.timeout(300_000),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Modal error (${response.status}): ${errText.slice(0, 300)}`)
  }

  return (await response.json()) as ModalResponse
}

// ─── Pass 1: Generate Interface Definition ───────────────────────────

/**
 * Generates a text-only interface definition from product specs.
 *
 * @description Pass 1 of the pipeline. No code generation — pure
 * engineering planning with space budgets, placement tables, and
 * dimensional validation arithmetic.
 *
 * @param description - Product description (e.g., "DJI Mavic Air 2 drone")
 * @param researchContext - Real-world specs and dimensions
 * @param referenceData - Hardcoded reference dimensions for product type
 * @param modelId - Gemini model to use
 * @returns Interface definition text and parsed structured data
 */
async function generateInterfaceDefinition(
  description: string,
  researchContext: string,
  referenceData: string,
  modelId: GeminiModelId,
): Promise<{
  text: string
  parsed: InterfaceDef | null
  tokensIn: number
  tokensOut: number
}> {
  const userPrompt = `Product brief: ${description}

Reference dimensions:
${referenceData}

User-provided research context:
${researchContext}

Generate the complete interface definition following the exact format specified. Make sure the motor-to-motor diagonal matches the reference target (~302mm for this drone). Calculate ALL positions from named quantities.`

  const { text, tokensIn, tokensOut } = await callGemini(
    INTERFACE_SYSTEM_PROMPT,
    userPrompt,
    modelId,
  )

  const parsed = parseInterfaceDefinition(text)

  return { text, parsed, tokensIn, tokensOut }
}

// ─── Parse Interface Definition ──────────────────────────────────────

/**
 * Extracts structured JSON data from the interface definition text.
 *
 * @param text - Raw interface definition text from Gemini
 * @returns Parsed interface definition or null if parsing fails
 */
function parseInterfaceDefinition(text: string): InterfaceDef | null {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (!jsonMatch?.[1]) return null

  try {
    const data = JSON.parse(jsonMatch[1]) as {
      target_bbox?: { x?: number; y?: number; z?: number }
      motor_diagonal_mm?: number
      components?: Array<{
        name?: string
        description?: string
        w_mm?: number
        d_mm?: number
        h_mm?: number
        qty?: number
      }>
    }

    if (!data.target_bbox || !data.components?.length) return null

    return {
      target_bbox: {
        x: data.target_bbox.x ?? 0,
        y: data.target_bbox.y ?? 0,
        z: data.target_bbox.z ?? 0,
      },
      motor_diagonal_mm: data.motor_diagonal_mm ?? 0,
      components: data.components.map((c) => ({
        name: c.name ?? "unknown",
        description: c.description ?? "",
        w_mm: c.w_mm ?? 0,
        d_mm: c.d_mm ?? 0,
        h_mm: c.h_mm ?? 0,
        qty: c.qty ?? 1,
      })),
      raw_text: text,
    }
  } catch {
    console.error("[CAD-LAB] Failed to parse interface definition JSON")
    return null
  }
}

// ─── Validate Interface Definition ───────────────────────────────────

/**
 * Validates that the interface definition meets dimensional constraints.
 *
 * @description Checks BBox within 10% of target, motor diagonal within
 * 5mm, all components have dimensions, and no parsing failures.
 *
 * @param iface - Parsed interface definition
 * @returns Validation result with specific error messages
 */
function validateInterfaceDefinition(
  iface: InterfaceDef | null,
): { valid: boolean; errors: string[] } {
  if (!iface) {
    return { valid: false, errors: ["Failed to parse interface definition JSON"] }
  }

  const errors: string[] = []

  // Check motor diagonal within 5mm of target
  if (iface.motor_diagonal_mm > 0) {
    const diff = Math.abs(iface.motor_diagonal_mm - DRONE_TARGET.motorDiagonalMm)
    if (diff > 5) {
      errors.push(
        `Motor diagonal is ${iface.motor_diagonal_mm}mm but target is ${DRONE_TARGET.motorDiagonalMm}mm (${diff.toFixed(0)}mm off, max 5mm)`,
      )
    }
  }

  // Check BBox is reasonable
  const bb = iface.target_bbox
  if (bb.x < DRONE_TARGET.minBBoxX || bb.x > DRONE_TARGET.maxBBoxX) {
    errors.push(`BBox X=${bb.x}mm is outside expected range ${DRONE_TARGET.minBBoxX}-${DRONE_TARGET.maxBBoxX}mm`)
  }
  if (bb.y < DRONE_TARGET.minBBoxY || bb.y > DRONE_TARGET.maxBBoxY) {
    errors.push(`BBox Y=${bb.y}mm is outside expected range ${DRONE_TARGET.minBBoxY}-${DRONE_TARGET.maxBBoxY}mm`)
  }
  if (bb.z < DRONE_TARGET.minBBoxZ || bb.z > DRONE_TARGET.maxBBoxZ) {
    errors.push(`BBox Z=${bb.z}mm is outside expected range ${DRONE_TARGET.minBBoxZ}-${DRONE_TARGET.maxBBoxZ}mm`)
  }

  // Check all components have dimensions
  for (const comp of iface.components) {
    if (!comp.name || comp.w_mm <= 0 || comp.d_mm <= 0 || comp.h_mm <= 0) {
      errors.push(`Component "${comp.name}" has missing or zero dimensions`)
    }
  }

  // Must have at least 3 components
  if (iface.components.length < 3) {
    errors.push(`Only ${iface.components.length} components — expected at least 3`)
  }

  return { valid: errors.length === 0, errors }
}

// ─── Pass 2-N: Generate Component Function ───────────────────────────

/**
 * Generates a single CadQuery component function.
 *
 * @description Each component gets the full interface definition as context
 * (not just its own row) because the LLM needs to know adjacent components
 * for correct interfaces.
 *
 * @param component - Component definition from the interface
 * @param interfaceText - Full interface definition text
 * @param modelId - Gemini model to use (Flash recommended for components)
 * @returns Generated code and validation result
 */
async function generateSingleComponent(
  component: ComponentDef,
  interfaceText: string,
  modelId: GeminiModelId,
): Promise<{
  result: ComponentResult
  tokensIn: number
  tokensOut: number
}> {
  const MAX_RETRIES = 2
  let lastError = ""
  let totalTokensIn = 0
  let totalTokensOut = 0

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const retryContext =
      attempt > 0
        ? `\n\nPREVIOUS ATTEMPT FAILED: ${lastError}\nFix the issue and try again.`
        : ""

    const userPrompt = `INTERFACE DEFINITION (full context):
${interfaceText}

GENERATE THIS COMPONENT:
Name: ${component.name}
Description: ${component.description}
Dimensions: ${component.w_mm}×${component.d_mm}×${component.h_mm} mm
Quantity in assembly: ${component.qty}
${retryContext}

Generate ONLY the Python function following the template exactly. The function must be named make_${component.name}. End with: result = make_${component.name}()`

    const { text, tokensIn, tokensOut } = await callGemini(
      COMPONENT_SYSTEM_PROMPT,
      userPrompt,
      modelId,
    )
    totalTokensIn += tokensIn
    totalTokensOut += tokensOut

    const code = extractCode(text)
    const validation = validateComponentLocally(code, component.name)

    if (validation.valid) {
      return {
        result: {
          name: component.name,
          code: validation.code,
          valid: true,
          stripped: validation.stripped,
          retries: attempt,
        },
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
      }
    }

    lastError = validation.error ?? "Unknown validation error"
    console.warn(
      `[CAD-LAB] Component "${component.name}" attempt ${attempt + 1} failed: ${lastError}`,
    )
  }

  // All retries exhausted — skip this component
  console.error(
    `[CAD-LAB] Component "${component.name}" failed after ${MAX_RETRIES + 1} attempts. Skipping.`,
  )
  return {
    result: {
      name: component.name,
      code: "",
      valid: false,
      error: lastError,
      stripped: false,
      retries: MAX_RETRIES,
    },
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
  }
}

// ─── Local Validation (AST/Regex) ────────────────────────────────────

/**
 * Validates component code locally without a Modal call.
 *
 * @description Checks structural correctness: has make_ function, uses
 * XY workplane, assigns result, no banned patterns. The safety-net regex
 * strips violations but LOGS them — frequent activations mean the prompt
 * needs fixing.
 *
 * @param code - Generated Python code
 * @param componentName - Expected component name for the make_ function
 * @returns Validation result with potentially cleaned code
 */
function validateComponentLocally(
  code: string,
  componentName: string,
): { valid: boolean; code: string; error?: string; stripped: boolean } {
  // 1. Must contain a make_ function
  if (!code.includes("def make_")) {
    return { valid: false, code, error: "No make_ function found", stripped: false }
  }

  // 2. Must use cq.Workplane("XY")
  if (!code.includes('cq.Workplane("XY")')) {
    return { valid: false, code, error: 'Must use cq.Workplane("XY")', stripped: false }
  }

  // 3. Must end with result = make_...()
  if (!code.match(/result\s*=\s*make_/)) {
    return { valid: false, code, error: "Must assign result = make_...()", stripped: false }
  }

  // 4. Check for banned patterns (hard failures)
  const hardBanned = [
    { pattern: "cq.Compound", label: "cq.Compound" },
    { pattern: "cq.Solid.make", label: "cq.Solid.make*" },
    { pattern: "cq.Assembly", label: "cq.Assembly" },
    { pattern: '.loft(', label: ".loft()" },
    { pattern: '.sweep(', label: ".sweep()" },
    { pattern: 'Workplane("YZ")', label: 'Workplane("YZ")' },
    { pattern: 'Workplane("XZ")', label: 'Workplane("XZ")' },
    { pattern: "import os", label: "import os" },
    { pattern: "open(", label: "open()" },
    { pattern: "cq.exporters", label: "cq.exporters" },
  ]

  for (const { pattern, label } of hardBanned) {
    if (code.includes(pattern)) {
      return { valid: false, code, error: `Contains banned pattern: ${label}`, stripped: false }
    }
  }

  // 5. Safety net: strip soft-banned patterns (.rotate, .translate, .mirror, .moved)
  //    LOG when this fires — if it fires often, the prompt is broken
  let stripped = false
  let cleaned = code
  const softBanned = [
    /\s*\.rotate\([^)]*\)/g,
    /\s*\.translate\([^)]*\)/g,
    /\s*\.mirror\([^)]*\)/g,
    /\s*\.moved\([^)]*\)/g,
  ]

  for (const regex of softBanned) {
    if (regex.test(cleaned)) {
      console.warn(`[CAD-LAB] Safety net stripped banned operation from "${componentName}": ${regex.source}`)
      stripped = true
      cleaned = cleaned.replace(regex, "")
    }
  }

  // 6. Strip print() statements
  cleaned = cleaned
    .split("\n")
    .filter((line: string) => !/^\s*print\s*\(/.test(line))
    .join("\n")

  return { valid: true, code: cleaned, stripped }
}

// ─── Pass N+1: Generate Assembly Script ──────────────────────────────

/**
 * Generates the assembly script from validated component functions.
 *
 * @description The assembly call gets COMPLETE function code (not just
 * signatures) because Gemini needs to see how functions center/offset
 * geometry, what the return shape looks like, and parameter units.
 *
 * @param validatedComponents - Array of validated component functions
 * @param interfaceText - Full interface definition text
 * @param modelId - Gemini model to use
 * @returns Complete assembly Python code
 */
async function generateAssemblyScript(
  validatedComponents: ComponentResult[],
  interfaceText: string,
  modelId: GeminiModelId,
): Promise<{
  code: string
  tokensIn: number
  tokensOut: number
}> {
  // Concatenate all validated function code (without the test lines)
  const functionCode = validatedComponents
    .map((c) => {
      // Remove the "result = make_...()" test line from each component
      // since the assembly script will call them at the right positions
      const lines = c.code.split("\n")
      const filtered = lines.filter(
        (line: string) => !line.trim().startsWith("result = make_") && !line.trim().startsWith("result=make_"),
      )
      return filtered.join("\n")
    })
    .join("\n\n")

  const componentNames = validatedComponents.map((c) => c.name).join(", ")

  const userPrompt = `INTERFACE DEFINITION:
${interfaceText}

VALIDATED COMPONENT FUNCTIONS (${validatedComponents.length} components: ${componentNames}):
\`\`\`python
${functionCode}
\`\`\`

Generate the complete assembly script. Include ALL the component functions above (paste them exactly — do not modify). Then add the assembly section that calls each function at its interface-defined position and unions everything into \`result\`.

For components with qty > 1 in the interface (like arms, motors, propellers), call the function at each position listed in the placement table. Use named variables for all positions.`

  const { text, tokensIn, tokensOut } = await callGemini(
    ASSEMBLY_SYSTEM_PROMPT,
    userPrompt,
    modelId,
  )

  let code = extractCode(text)

  // Safety net on assembly code too
  const softBanned = [
    /\s*\.rotate\([^)]*\)/g,
    /\s*\.translate\([^)]*\)/g,
    /\s*\.mirror\([^)]*\)/g,
    /\s*\.moved\([^)]*\)/g,
  ]
  for (const regex of softBanned) {
    if (regex.test(code)) {
      console.warn(`[CAD-LAB] Safety net stripped banned operation from assembly: ${regex.source}`)
      code = code.replace(regex, "")
    }
  }

  // Strip print() and file I/O
  code = code
    .split("\n")
    .filter((line: string) => {
      const s = line.trim()
      if (/^print\s*\(/.test(s)) return false
      if (s.startsWith("import os") || s.startsWith("from os")) return false
      if (s.includes("cq.exporters")) return false
      return true
    })
    .join("\n")

  return { code, tokensIn, tokensOut }
}

// ─── Post-Execution Validation ───────────────────────────────────────

/**
 * Validates Modal execution results against dimensional targets.
 *
 * @description Checks BBox within 10% of target, fill ratio < 15%,
 * STEP size > 500KB. Logs warnings but does NOT block the result —
 * a slightly wrong model is more useful than no model.
 */
function postExecutionValidation(
  bbox: { xLen: number; yLen: number; zLen: number } | undefined,
  fillRatio: number | undefined,
  stepSizeKb: number | undefined,
): { warnings: string[] } {
  const warnings: string[] = []

  if (bbox) {
    if (bbox.xLen < DRONE_TARGET.minBBoxX || bbox.xLen > DRONE_TARGET.maxBBoxX) {
      warnings.push(`BBox X=${bbox.xLen}mm outside expected ${DRONE_TARGET.minBBoxX}-${DRONE_TARGET.maxBBoxX}mm`)
    }
    if (bbox.yLen < DRONE_TARGET.minBBoxY || bbox.yLen > DRONE_TARGET.maxBBoxY) {
      warnings.push(`BBox Y=${bbox.yLen}mm outside expected ${DRONE_TARGET.minBBoxY}-${DRONE_TARGET.maxBBoxY}mm`)
    }
    if (bbox.zLen < DRONE_TARGET.minBBoxZ || bbox.zLen > DRONE_TARGET.maxBBoxZ) {
      warnings.push(`BBox Z=${bbox.zLen}mm outside expected ${DRONE_TARGET.minBBoxZ}-${DRONE_TARGET.maxBBoxZ}mm`)
    }
  } else {
    warnings.push("No bounding box returned from Modal")
  }

  if (fillRatio != null && fillRatio > 15) {
    warnings.push(`Fill ratio ${fillRatio}% is too high (expected <15% for hollow shell)`)
  }

  if (stepSizeKb != null && stepSizeKb < 500) {
    warnings.push(`STEP size ${stepSizeKb}KB is small (expected >500KB for detailed model)`)
  }

  if (warnings.length > 0) {
    console.warn("[CAD-LAB] Post-execution validation warnings:", warnings)
  }

  return { warnings }
}

// ─── Main Pipeline Orchestrator ──────────────────────────────────────

/**
 * Generates a CAD model using the component-decomposed pipeline.
 *
 * @description Implements Claude Code's corrected architecture:
 *   Pass 0: Reference dimensions (hardcoded)
 *   Pass 1: Interface definition (text only)
 *   Pass 2-N: Component functions (parallelized, locally validated)
 *   Pass N+1: Assembly script (union calls only)
 *   Pass N+2: Modal execution (single call)
 *
 * @param description - What to model (e.g., "DJI Mavic Air 2 drone")
 * @param researchContext - Optional real-world specs
 * @param modelId - Gemini model for interface + assembly (Pro recommended)
 * @returns Generation result with SVGs, metrics, and pipeline diagnostics
 */
export async function generateCadLabModel(
  description: string,
  researchContext?: string,
  modelId: GeminiModelId = "gemini-2.5-pro",
): Promise<CadLabResult> {
  const pipelineStart = Date.now()
  let totalTokensIn = 0
  let totalTokensOut = 0

  try {
    // ── Pass 0: Reference dimensions ──
    const referenceData = DRONE_REFERENCE
    const research = researchContext ?? ""

    // ── Pass 1: Interface definition ──
    console.info("[CAD-LAB] Pass 1: Generating interface definition...")
    let interfaceText = ""
    let interfaceParsed: InterfaceDef | null = null

    const MAX_INTERFACE_RETRIES = 2
    for (let attempt = 0; attempt <= MAX_INTERFACE_RETRIES; attempt++) {
      // Build retry context from previous attempt failures
      let feedbackPrefix = ""
      if (attempt > 0 && interfaceParsed === null) {
        feedbackPrefix =
          "PREVIOUS ATTEMPT FAILED: Could not parse JSON from interface definition. Make sure to include the === STRUCTURED DATA (JSON) === section with valid JSON.\n\n"
      } else if (attempt > 0 && interfaceParsed !== null) {
        const prevErrors: string[] = validateInterfaceDefinition(interfaceParsed).errors
        if (prevErrors.length > 0) {
          feedbackPrefix = `PREVIOUS ATTEMPT HAD VALIDATION ERRORS:\n${prevErrors.map((e: string) => `- ${e}`).join("\n")}\nFix these issues.\n\n`
        }
      }

      let ifaceResult: {
        text: string
        parsed: InterfaceDef | null
        tokensIn: number
        tokensOut: number
      }

      if (feedbackPrefix) {
        const retryPrompt = `${feedbackPrefix}Product brief: ${description}\n\nReference dimensions:\n${referenceData}\n\nUser-provided research context:\n${research}`
        const geminiResult = await callGemini(INTERFACE_SYSTEM_PROMPT, retryPrompt, modelId)
        ifaceResult = {
          text: geminiResult.text,
          parsed: parseInterfaceDefinition(geminiResult.text),
          tokensIn: geminiResult.tokensIn,
          tokensOut: geminiResult.tokensOut,
        }
      } else {
        ifaceResult = await generateInterfaceDefinition(description, research, referenceData, modelId)
      }

      totalTokensIn += ifaceResult.tokensIn
      totalTokensOut += ifaceResult.tokensOut
      interfaceText = ifaceResult.text
      interfaceParsed = ifaceResult.parsed

      const validation = validateInterfaceDefinition(interfaceParsed)
      if (validation.valid) {
        console.info(`[CAD-LAB] Interface definition validated (attempt ${attempt + 1})`)
        break
      }

      console.warn(
        `[CAD-LAB] Interface validation failed (attempt ${attempt + 1}):`,
        validation.errors,
      )

      if (attempt === MAX_INTERFACE_RETRIES) {
        // Use it anyway — a slightly off interface is better than nothing
        console.warn("[CAD-LAB] Using interface definition despite validation failures")
      }
    }

    if (!interfaceParsed || interfaceParsed.components.length === 0) {
      return {
        success: false,
        error: "Failed to generate a valid interface definition after retries. No components found.",
        interfaceDefinition: interfaceText,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        generationTime: Date.now() - pipelineStart,
        modelUsed: modelId,
      }
    }

    // ── Pass 2-N: Component functions (parallelized) ──
    console.info(
      `[CAD-LAB] Pass 2-N: Generating ${interfaceParsed.components.length} component functions in parallel...`,
    )

    // Use Flash for components if available (cheaper, sufficient for short functions)
    // Use the selected model for interface + assembly (complex reasoning)
    const componentModelId: GeminiModelId =
      modelId === "gemini-2.5-pro" ? "gemini-2.5-flash" : modelId

    const componentPromises = interfaceParsed.components.map((comp) =>
      generateSingleComponent(comp, interfaceText, componentModelId),
    )

    const componentSettled = await Promise.allSettled(componentPromises)

    const validatedComponents: ComponentResult[] = []
    const skippedComponents: string[] = []

    for (const settled of componentSettled) {
      if (settled.status === "fulfilled") {
        totalTokensIn += settled.value.tokensIn
        totalTokensOut += settled.value.tokensOut

        if (settled.value.result.valid) {
          validatedComponents.push(settled.value.result)
        } else {
          skippedComponents.push(settled.value.result.name)
        }
      } else {
        // Promise rejected entirely
        console.error("[CAD-LAB] Component generation promise rejected:", settled.reason)
      }
    }

    console.info(
      `[CAD-LAB] Components: ${validatedComponents.length} validated, ${skippedComponents.length} skipped`,
    )

    if (validatedComponents.length === 0) {
      return {
        success: false,
        error: "All component functions failed validation. No valid components to assemble.",
        interfaceDefinition: interfaceText,
        componentCount: interfaceParsed.components.length,
        validatedCount: 0,
        skippedComponents,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        generationTime: Date.now() - pipelineStart,
        modelUsed: modelId,
      }
    }

    // ── Pass N+1: Assembly script ──
    console.info("[CAD-LAB] Pass N+1: Generating assembly script...")
    const assemblyResult = await generateAssemblyScript(
      validatedComponents,
      interfaceText,
      modelId,
    )
    totalTokensIn += assemblyResult.tokensIn
    totalTokensOut += assemblyResult.tokensOut

    const finalCode = assemblyResult.code
    const codeLines = finalCode.split("\n").length
    const generationTime = Date.now() - pipelineStart

    // ── Pass N+2: Modal execution ──
    console.info("[CAD-LAB] Pass N+2: Executing assembly on Modal...")
    const modalStart = Date.now()
    const modalResult = await executeOnModal(finalCode)
    const modalTime = Date.now() - modalStart

    if (modalResult.error && !modalResult.svg_iso) {
      return {
        success: false,
        error: modalResult.error,
        code: finalCode,
        codeLines,
        generationTime,
        modalTime,
        interfaceDefinition: interfaceText,
        componentCount: interfaceParsed.components.length,
        validatedCount: validatedComponents.length,
        skippedComponents,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        modelUsed: modelId,
      }
    }

    // ── Extract metrics ──
    const mp = modalResult.analysis?.mass_properties
    const bb = mp?.bounding_box
    const vol = mp?.volume_mm3 ?? 0
    const bbVol = bb ? bb.xLen * bb.yLen * bb.zLen : 0
    const stepSizeKb = modalResult.step ? Math.round(atob(modalResult.step).length / 1024) : undefined
    const fillRatio = bbVol > 0 ? Math.round((vol / bbVol) * 1000) / 10 : undefined
    const bboxResult = bb
      ? { xLen: Math.round(bb.xLen), yLen: Math.round(bb.yLen), zLen: Math.round(bb.zLen) }
      : undefined

    // ── Post-execution validation ──
    const { warnings } = postExecutionValidation(bboxResult, fillRatio, stepSizeKb)

    return {
      success: true,
      code: finalCode,
      codeLines,
      generationTime,
      modalTime,
      svgIso: modalResult.svg_iso ? `data:image/svg+xml;base64,${modalResult.svg_iso}` : undefined,
      svgTop: modalResult.svg_top ? `data:image/svg+xml;base64,${modalResult.svg_top}` : undefined,
      svgFront: modalResult.svg_front
        ? `data:image/svg+xml;base64,${modalResult.svg_front}`
        : undefined,
      stepSize: stepSizeKb,
      stlSize: modalResult.stl ? Math.round(atob(modalResult.stl).length / 1024) : undefined,
      bbox: bboxResult,
      fillRatio,
      massGrams: mp?.mass_kg ? Math.round(mp.mass_kg * 1000 * 10) / 10 : undefined,
      volumeMm3: vol ? Math.round(vol) : undefined,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      modelUsed: modelId,
      interfaceDefinition: interfaceText,
      componentCount: interfaceParsed.components.length,
      validatedCount: validatedComponents.length,
      skippedComponents: skippedComponents.length > 0 ? skippedComponents : undefined,
      validationWarnings: warnings.length > 0 ? warnings : undefined,
      error: modalResult.error ?? undefined,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
      generationTime: Date.now() - pipelineStart,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      modelUsed: modelId,
    }
  }
}
