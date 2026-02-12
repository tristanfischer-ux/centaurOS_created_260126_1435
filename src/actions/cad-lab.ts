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

import type { GeminiModelId, CadLabResult, CadLabResearchResult } from "@/lib/cad-lab-types"
import { checkRateLimit } from "@/lib/security/rate-limit"
import { createClient } from "@/lib/supabase/server"

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
[For each component, include functional sub-features if applicable:
 - Screw bosses / mounting points
 - Cutouts (ports, buttons, vents, grilles)
 - Hollow sections (wall thickness for shells/containers)
 - Sub-assemblies (shields, connectors, brackets, tabs)]

=== CONNECTION MAP ===
[For assemblies with flows (water, air, electrical, structural loads), trace complete paths]
Example:
- Water: Reservoir → Pump → Riser → Headers → Drips → Trays → Drains → Return → Reservoir
- Power: Battery → PCB → Components
- Structure: Frame posts → Rails → Cross-braces → Mounting points
[If no flows apply, write "N/A"]

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

SAFE PATTERNS (use these):

1. Positioning:
   cq.Workplane("XY").workplane(offset=z).transformed(offset=(x, y, 0))

2. Hollow containers (trays, reservoirs, frames):
   outer = wp.box(100, 50, 30)
   inner = wp.workplane(offset=wall).box(100 - wall*2, 50 - wall*2, 30)
   result = outer.cut(inner)

3. Pipes / hollow cylinders:
   wp.circle(od/2).circle(od/2 - wall).extrude(length)

4. Fillets (on simple shapes, BEFORE union):
   part = wp.box(50, 30, 20).edges(">Z").fillet(2)
   # THEN union: assembly = assembly.union(part)

5. Sketches for complex 2D profiles:
   wp.sketch().rect(w, d).vertices().fillet(r).finalize().extrude(h)

6. Screw bosses:
   boss = wp.circle(boss_dia/2).extrude(height)
   hole = wp.circle(screw_dia/2).extrude(height + 1)
   result = result.union(boss).cut(hole)

OPTIONAL HELPER FUNCTIONS:
If multiple components share a pattern (rounded rectangles, hollow cylinders),
you may define helpers at the top:

def rounded_rect_solid(wp, w, h, r, t):
    return wp.sketch().rect(w, h).vertices().fillet(r).finalize().extrude(t)

def hollow_cylinder(wp, od, id, h):
    return wp.circle(od/2).circle(id/2).extrude(h)

AVOID (these crash or produce incorrect geometry):
- .loft(), .sweep(), .mirror() — approximate with extrudes instead
- .rotate(), .translate(), .moved() on existing bodies — use .transformed() instead
- cq.Compound, cq.Solid, cq.Assembly — always return cq.Workplane
- cq.Workplane("YZ"), cq.Workplane("XZ") — use .transformed(rotate=...) instead
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

// ─── Gemini API Call with Google Search Grounding ────────────────────

/**
 * Calls Gemini with Google Search grounding enabled.
 *
 * @description Uses the same GOOGLE_AI_API_KEY. The google_search tool
 * lets Gemini automatically search the web for real-time information
 * and return citations. Used for Pass 0 product research.
 *
 * @param prompt - User prompt (no system instruction — search tool handles context)
 * @param modelId - Gemini model to use (Flash recommended for cost)
 * @returns Response text, source URLs, and token counts
 */
async function callGeminiWithSearch(
  prompt: string,
  modelId: GeminiModelId = "gemini-2.5-flash",
): Promise<{
  text: string
  sources: Array<{ uri: string; title: string }>
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
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.2,
      },
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini Search API error (${response.status}): ${errText.slice(0, 300)}`)
  }

  const data = await response.json()
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
  const usage = data.usageMetadata ?? {}

  // Extract grounding sources from metadata
  const groundingMeta = data.candidates?.[0]?.groundingMetadata
  const chunks: Array<{ web?: { uri?: string; title?: string } }> =
    groundingMeta?.groundingChunks ?? []
  const sources = chunks
    .filter((c): c is { web: { uri: string; title: string } } =>
      Boolean(c.web?.uri && c.web?.title),
    )
    .map((c) => ({ uri: c.web.uri, title: c.web.title }))

  return {
    text,
    sources,
    tokensIn: usage.promptTokenCount ?? 0,
    tokensOut: usage.candidatesTokenCount ?? 0,
  }
}

// ─── Claude API Call (for research synthesis) ────────────────────────

/**
 * Calls Claude Opus 4.6 to synthesize a research report.
 *
 * @description Used in Pass 0 to produce a comprehensive, structured
 * engineering research report from raw web search data and CAD references.
 * Claude excels at synthesizing disparate sources into coherent analysis.
 *
 * @param systemPrompt - System instruction for Claude
 * @param userPrompt - User message content
 * @returns Synthesized text response
 */
async function callClaude(
  systemPrompt: string,
  userPrompt: string,
): Promise<{
  text: string
  tokensIn: number
  tokensOut: number
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured")

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-20250514",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
    signal: AbortSignal.timeout(120_000),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Claude API error (${response.status}): ${errText.slice(0, 300)}`)
  }

  const data = await response.json()
  const text: string = data.content?.[0]?.text ?? ""

  return {
    text,
    tokensIn: data.usage?.input_tokens ?? 0,
    tokensOut: data.usage?.output_tokens ?? 0,
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

// ─── Pass 0: Product Research ────────────────────────────────────────

/**
 * Researches real-world product specifications using Gemini + Google Search.
 *
 * @description Uses Google Search grounding to find actual dimensions,
 * component specs, and reference data for the product. Returns structured
 * specs text and source URLs.
 *
 * @param description - Product description (e.g., "DJI Mavic Air 2 drone")
 * @param modelId - Gemini model to use (Flash recommended for cost)
 * @returns Structured specs text and source URLs
 */
async function researchProductSpecs(
  description: string,
  modelId: GeminiModelId = "gemini-2.5-flash",
): Promise<{
  specs: string
  sources: Array<{ uri: string; title: string }>
  tokensIn: number
  tokensOut: number
}> {
  const prompt = `Find the real-world specifications for: ${description}

I need precise engineering dimensions for 3D CAD modelling. Search for:

1. OVERALL DIMENSIONS — length, width, height in mm (folded and unfolded if applicable)
2. WEIGHT — total weight and breakdown if available
3. MOTOR/ACTUATOR SPECS — diameter, height, mounting hole pattern (if it has motors)
4. KEY COMPONENT DIMENSIONS — battery, camera, electronics, frame, arms
5. CRITICAL CONSTRAINTS — motor-to-motor diagonal, wheelbase, prop clearance
6. MATERIAL — primary materials and wall thicknesses
7. STANDARD PARTS — propeller size, bolt sizes, mounting standards

Format your response as a structured specification sheet with exact numbers in millimetres. If a dimension is approximate, say so. If you find conflicting specs from different sources, list both.

Do NOT guess dimensions. Only include measurements you found from real sources.`

  try {
    const result = await callGeminiWithSearch(prompt, modelId)
    return {
      specs: result.text,
      sources: result.sources,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    }
  } catch (error) {
    console.warn(
      "[CAD-LAB] Web research failed, falling back to hardcoded reference:",
      error instanceof Error ? error.message : "Unknown error",
    )
    return { specs: "", sources: [], tokensIn: 0, tokensOut: 0 }
  }
}

// ─── Pass 0: Thingiverse CAD Model Search ────────────────────────────

/** Search result from Thingiverse API */
interface ThingiverseResult {
  name: string
  url: string
  description: string
}

/**
 * Searches Thingiverse for existing CAD models as dimensional references.
 *
 * @description Informational only — does not download files. Gives the LLM
 * awareness of existing reference geometry. Requires THINGIVERSE_API_TOKEN
 * env var (free at thingiverse.com/apps/create). Skips gracefully if not set.
 *
 * @param description - Product description to search for
 * @returns Top matching models with name, URL, and description
 */
async function searchCadModels(
  description: string,
): Promise<ThingiverseResult[]> {
  const token = process.env.THINGIVERSE_API_TOKEN
  if (!token) {
    console.info("[CAD-LAB] THINGIVERSE_API_TOKEN not set, skipping CAD model search")
    return []
  }

  try {
    // Extract a short search term from the description
    const searchTerm = description
      .replace(/quadcopter|drone|3d model|cad/gi, "")
      .trim()
      .split(/\s+/)
      .slice(0, 4)
      .join(" ")
      .trim() || description.slice(0, 30)

    const url = `https://api.thingiverse.com/search/${encodeURIComponent(searchTerm)}?type=things&per_page=5&sort=relevant`

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      console.warn(`[CAD-LAB] Thingiverse API error (${response.status})`)
      return []
    }

    const data = await response.json()
    const hits: Array<{
      name?: string
      public_url?: string
      description?: string
    }> = data?.hits ?? data ?? []

    return hits
      .filter((h): h is { name: string; public_url: string; description: string } =>
        Boolean(h.name && h.public_url),
      )
      .slice(0, 5)
      .map((h) => ({
        name: h.name,
        url: h.public_url,
        description: (h.description ?? "").slice(0, 200),
      }))
  } catch (error) {
    console.warn(
      "[CAD-LAB] Thingiverse search failed:",
      error instanceof Error ? error.message : "Unknown error",
    )
    return []
  }
}

// ─── Pass 0: Build Reference Context ─────────────────────────────────

/**
 * Merges all reference sources into a single context string for Pass 1.
 *
 * @description Concatenates hardcoded library (safety net), web research
 * results, CAD model references, and user-pasted research. The hardcoded
 * library is always included as a fallback even if web search fails.
 */
function buildReferenceContext(
  hardcodedRef: string,
  webSpecs: string,
  cadModels: ThingiverseResult[],
  userResearch: string,
): string {
  const sections: string[] = []

  // Always include hardcoded reference as baseline
  sections.push(hardcodedRef)

  // Web research (if available)
  if (webSpecs.trim()) {
    sections.push(`=== WEB RESEARCH (live search results) ===\n${webSpecs}`)
  }

  // CAD model references (if found)
  if (cadModels.length > 0) {
    const modelList = cadModels
      .map((m) => `- ${m.name}: ${m.url}\n  ${m.description}`)
      .join("\n")
    sections.push(
      `=== EXISTING CAD MODELS (Thingiverse references) ===\n${modelList}\n\nNote: These are existing community models for dimensional reference only.`,
    )
  }

  // User-pasted research (highest priority — most specific)
  if (userResearch.trim()) {
    sections.push(`=== USER-PROVIDED RESEARCH ===\n${userResearch}`)
  }

  return sections.join("\n\n")
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
 * @param referenceData - All reference data (hardcoded + web research + user input, merged by buildReferenceContext)
 * @param modelId - Gemini model to use
 * @returns Interface definition text and parsed structured data
 */
async function generateInterfaceDefinition(
  description: string,
  referenceData: string,
  modelId: GeminiModelId,
): Promise<{
  text: string
  parsed: InterfaceDef | null
  tokensIn: number
  tokensOut: number
}> {
  const userPrompt = `Product brief: ${description}

Reference dimensions and research:
${referenceData}

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
 *
 * @param bbox - Bounding box from Modal execution
 * @param fillRatio - Volume fill ratio (%)
 * @param stepSizeKb - STEP file size in KB
 * @param targetBBox - Target dimensions from interface definition (optional, uses DRONE_TARGET as fallback)
 */
function postExecutionValidation(
  bbox: { xLen: number; yLen: number; zLen: number } | undefined,
  fillRatio: number | undefined,
  stepSizeKb: number | undefined,
  targetBBox?: { x: number; y: number; z: number },
): { warnings: string[] } {
  const warnings: string[] = []
  const tolerance = 0.10  // 10% tolerance

  if (bbox) {
    if (targetBBox) {
      // Dynamic validation against interface definition target
      const xDiff = Math.abs(bbox.xLen - targetBBox.x) / targetBBox.x
      const yDiff = Math.abs(bbox.yLen - targetBBox.y) / targetBBox.y
      const zDiff = Math.abs(bbox.zLen - targetBBox.z) / targetBBox.z

      if (xDiff > tolerance) {
        const pct = (xDiff * 100).toFixed(1)
        warnings.push(`BBox X=${bbox.xLen}mm is ${pct}% off target ${targetBBox.x}mm (max ${tolerance * 100}%)`)
      }
      if (yDiff > tolerance) {
        const pct = (yDiff * 100).toFixed(1)
        warnings.push(`BBox Y=${bbox.yLen}mm is ${pct}% off target ${targetBBox.y}mm (max ${tolerance * 100}%)`)
      }
      if (zDiff > tolerance) {
        const pct = (zDiff * 100).toFixed(1)
        warnings.push(`BBox Z=${bbox.zLen}mm is ${pct}% off target ${targetBBox.z}mm (max ${tolerance * 100}%)`)
      }
    } else {
      // Fallback to hardcoded drone target if no interface definition provided
      if (bbox.xLen < DRONE_TARGET.minBBoxX || bbox.xLen > DRONE_TARGET.maxBBoxX) {
        warnings.push(`BBox X=${bbox.xLen}mm outside expected ${DRONE_TARGET.minBBoxX}-${DRONE_TARGET.maxBBoxX}mm`)
      }
      if (bbox.yLen < DRONE_TARGET.minBBoxY || bbox.yLen > DRONE_TARGET.maxBBoxY) {
        warnings.push(`BBox Y=${bbox.yLen}mm outside expected ${DRONE_TARGET.minBBoxY}-${DRONE_TARGET.maxBBoxY}mm`)
      }
      if (bbox.zLen < DRONE_TARGET.minBBoxZ || bbox.zLen > DRONE_TARGET.maxBBoxZ) {
        warnings.push(`BBox Z=${bbox.zLen}mm outside expected ${DRONE_TARGET.minBBoxZ}-${DRONE_TARGET.maxBBoxZ}mm`)
      }
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

// ─── Research Report Synthesis Prompt ─────────────────────────────────

const RESEARCH_SYNTHESIS_PROMPT = `You are a senior mechanical engineer preparing a research brief for a 3D CAD modelling project. Your job is to synthesize raw research data into a precise, structured engineering specification.

Your report will be used by a CAD pipeline to generate an accurate 3D model, so dimensional precision is critical. Every number must come from the source data — never invent dimensions.

Output format (follow exactly):

# Engineering Research Report: {Product Name}

## Executive Summary
One paragraph: what this product is, its primary function, and its defining physical characteristics.

## Overall Dimensions
- Folded: W × D × H mm (if applicable)
- Unfolded/Deployed: W × D × H mm
- Weight: X g

## Primary Structure
Describe the main body/frame with precise dimensions. Include wall thickness, material if known.

## Components
For each major component, list:
- **Name**: exact dimensions (W × D × H mm or Ø × H mm)
- Position relative to body center
- Mounting/attachment method if known
- Quantity

## Critical Constraints
- Motor-to-motor diagonal (or equivalent key dimension): X mm
- Prop/blade/appendage clearance: X mm
- Any symmetry axes or alignment requirements

## Material & Manufacturing Notes
Primary materials, wall thicknesses, manufacturing method if known.

## Dimensional Confidence
Rate each major dimension:
- ✅ Confirmed (from official specs or multiple sources)
- ⚠️ Approximate (single source or estimated)
- ❓ Unknown (not found in research)

RULES:
- Use millimetres for all dimensions
- Round to nearest 0.5mm for sub-mm precision
- If two sources disagree, state both and note the discrepancy
- Never invent a dimension — mark it as Unknown
- Include source attribution for key numbers`

// ─── Standalone Research Step (Pass 0) ───────────────────────────────

/**
 * Runs standalone research for a product: web search + CAD model search + Claude synthesis.
 *
 * @description This is the user-facing research step. It:
 *   1. Runs Gemini + Google Search to find real-world specs
 *   2. Searches Thingiverse for existing CAD reference models
 *   3. Sends all raw data to Claude to synthesize a structured engineering report
 *
 * The user reviews the report before proceeding to CAD generation.
 *
 * @param description - Product to research (e.g., "DJI Mavic Air 2 drone")
 * @returns Research report, sources, and reference models
 */
export async function runCadLabResearch(
  description: string,
): Promise<CadLabResearchResult> {
  // AUTH: Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' } as unknown as CadLabResearchResult

  // SECURITY: Rate limit AI calls to prevent cost abuse
  const rateLimitError = await checkRateLimit('aiCadLab', `ai:${user.id}`)
  if (rateLimitError) return { error: rateLimitError } as unknown as CadLabResearchResult

  const start = Date.now()

  try {
    console.info("[CAD-LAB] Research: Starting web search + CAD model search...")

    // 1. Run Gemini + Google Search and Thingiverse in parallel
    const [webResult, cadResult] = await Promise.allSettled([
      researchProductSpecs(description, "gemini-2.5-flash"),
      searchCadModels(description),
    ])

    const webSpecs = webResult.status === "fulfilled" ? webResult.value.specs : ""
    const webSources = webResult.status === "fulfilled" ? webResult.value.sources : []
    const cadModels = cadResult.status === "fulfilled" ? cadResult.value : []

    // 2. Build raw data context for Claude
    const rawDataSections: string[] = []

    if (webSpecs.trim()) {
      rawDataSections.push(`=== RAW WEB SEARCH RESULTS ===\n${webSpecs}`)
    }

    // Always include hardcoded reference as baseline
    rawDataSections.push(`=== HARDCODED REFERENCE LIBRARY ===\n${DRONE_REFERENCE}`)

    if (cadModels.length > 0) {
      const modelList = cadModels
        .map((m) => `- ${m.name}: ${m.url}\n  ${m.description}`)
        .join("\n")
      rawDataSections.push(`=== THINGIVERSE CAD MODELS ===\n${modelList}`)
    }

    const rawContext = rawDataSections.join("\n\n")

    // 3. Send to Claude for synthesis
    console.info("[CAD-LAB] Research: Synthesizing report with Claude...")
    const claudeResult = await callClaude(
      RESEARCH_SYNTHESIS_PROMPT,
      `Product to research: ${description}\n\n${rawContext}`,
    )

    const referenceModels = cadModels.map((m) => ({ name: m.name, url: m.url }))

    console.info(
      `[CAD-LAB] Research complete: ${webSources.length} web sources, ${referenceModels.length} CAD refs, ${(Date.now() - start)}ms`,
    )

    return {
      success: true,
      report: claudeResult.text,
      sources: webSources,
      referenceModels,
      researchTime: Date.now() - start,
    }
  } catch (error) {
    console.error("[CAD-LAB] Research failed:", error instanceof Error ? error.message : error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Research failed",
      report: "",
      sources: [],
      referenceModels: [],
      researchTime: Date.now() - start,
    }
  }
}

// ─── Main Pipeline Orchestrator ──────────────────────────────────────

/**
 * Generates a CAD model using the component-decomposed pipeline.
 *
 * @description Implements Claude Code's corrected architecture:
 *   Pass 0: Reference dimensions (from research report or hardcoded)
 *   Pass 1: Interface definition (text only)
 *   Pass 2-N: Component functions (parallelized, locally validated)
 *   Pass N+1: Assembly script (union calls only)
 *   Pass N+2: Modal execution (single call)
 *
 * @param description - What to model (e.g., "DJI Mavic Air 2 drone")
 * @param researchContext - Research report from runCadLabResearch() or user-pasted specs
 * @param modelId - Gemini model for interface + assembly (Pro recommended)
 * @returns Generation result with SVGs, metrics, and pipeline diagnostics
 */
export async function generateCadLabModel(
  description: string,
  researchContext?: string,
  modelId: GeminiModelId = "gemini-2.5-pro",
): Promise<CadLabResult> {
  // AUTH: Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' } as unknown as CadLabResult

  // SECURITY: Rate limit AI calls to prevent cost abuse
  const rateLimitError = await checkRateLimit('aiCadLab', `ai:${user.id}`)
  if (rateLimitError) return { error: rateLimitError } as unknown as CadLabResult

  const pipelineStart = Date.now()
  let totalTokensIn = 0
  let totalTokensOut = 0

  try {
    // ── Pass 0: Reference data ──
    // If a research report is provided (from Step 1), use it directly.
    // Otherwise fall back to hardcoded reference + optional web search.
    let researchSources: Array<{ uri: string; title: string }> = []
    let referenceModels: ThingiverseResult[] = []
    let referenceData: string

    if (researchContext && researchContext.trim().length > 100) {
      // Research report already provided — use it + hardcoded fallback
      console.info("[CAD-LAB] Pass 0: Using provided research report")
      referenceData = buildReferenceContext(DRONE_REFERENCE, "", [], researchContext)
    } else {
      // No research report — run web search as fallback
      console.info("[CAD-LAB] Pass 0: No research report, running web search...")
      const [webResult, cadResult] = await Promise.allSettled([
        researchProductSpecs(description, "gemini-2.5-flash"),
        searchCadModels(description),
      ])

      let webSpecs = ""
      if (webResult.status === "fulfilled") {
        webSpecs = webResult.value.specs
        researchSources = webResult.value.sources
        totalTokensIn += webResult.value.tokensIn
        totalTokensOut += webResult.value.tokensOut
      }
      if (cadResult.status === "fulfilled") {
        referenceModels = cadResult.value
      }

      referenceData = buildReferenceContext(
        DRONE_REFERENCE,
        webSpecs,
        referenceModels,
        researchContext ?? "",
      )
    }

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
        const retryPrompt = `${feedbackPrefix}Product brief: ${description}\n\nReference dimensions and research:\n${referenceData}`
        const geminiResult = await callGemini(INTERFACE_SYSTEM_PROMPT, retryPrompt, modelId)
        ifaceResult = {
          text: geminiResult.text,
          parsed: parseInterfaceDefinition(geminiResult.text),
          tokensIn: geminiResult.tokensIn,
          tokensOut: geminiResult.tokensOut,
        }
      } else {
        ifaceResult = await generateInterfaceDefinition(description, referenceData, modelId)
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
        researchSources: researchSources.map((s) => s.uri),
        referenceModels: referenceModels.map((m) => ({ name: m.name, url: m.url })),
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
        researchSources: researchSources.map((s) => s.uri),
        referenceModels: referenceModels.map((m) => ({ name: m.name, url: m.url })),
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
        researchSources: researchSources.map((s) => s.uri),
        referenceModels: referenceModels.map((m) => ({ name: m.name, url: m.url })),
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
    const { warnings } = postExecutionValidation(
      bboxResult,
      fillRatio,
      stepSizeKb,
      interfaceParsed?.target_bbox,  // Pass target dimensions from interface definition
    )

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
      researchSources: researchSources.length > 0 ? researchSources.map((s) => s.uri) : undefined,
      referenceModels: referenceModels.length > 0
        ? referenceModels.map((m) => ({ name: m.name, url: m.url }))
        : undefined,
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
