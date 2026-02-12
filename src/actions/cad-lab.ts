"use server"

/**
 * @file cad-lab.ts — Claude-powered CAD generation pipeline.
 *
 * @description Follows the CLAUDE_CAD_INSTRUCTIONS methodology exactly:
 *   Step 1: Research real dimensions (Gemini Search + Claude synthesis)
 *   Step 2: Write interface definition (Claude, text only — no code)
 *   Step 3: Write complete CadQuery code (Claude, single pass)
 *   Step 4: Execute on Modal (CadQuery → STEP + STL + SVG)
 *
 * The CadQuery methodology (patterns, rules, operations to avoid) is read
 * from CLAUDE_CAD_INSTRUCTIONS_1214.md at runtime so it can be updated
 * without redeploying.
 *
 * @security Server-side only, uses admin API keys.
 */

import type {
  ClaudeModelId,
  CadLabResult,
  CadLabResearchResult,
  CadLabInterfaceResult,
} from "@/lib/cad-lab-types"
import { checkRateLimit } from "@/lib/security/rate-limit"
import { createClient } from "@/lib/supabase/server"
import { CAD_INSTRUCTIONS } from "@/lib/cad-instructions"
import { fetchLibrarySummary, formatLibraryForPrompt, prepareCodeWithLibrary } from "@/actions/component-library"
import type { Sector } from "@/types/foundry"

// ─── Sector Lookup ───────────────────────────────────────────────────

/**
 * Looks up the authenticated user's foundry sector for component filtering.
 *
 * @param supabase - Authenticated Supabase client
 * @param userId - Authenticated user ID
 * @returns The sector string or null if not set
 */
async function lookupUserSector(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Sector | null> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', userId)
      .single()

    if (!profile?.foundry_id) return null

    const { data: foundry } = await supabase
      .from('foundries')
      .select('sector')
      .eq('id', profile.foundry_id)
      .single()

    return (foundry?.sector as Sector) ?? null
  } catch {
    console.warn('[CAD-LAB] Failed to look up user sector, continuing without filter')
    return null
  }
}

// ─── Claude API Call ─────────────────────────────────────────────────

/**
 * Calls a Claude model and returns the response text.
 *
 * @param systemPrompt - System instruction for Claude
 * @param userPrompt - User message content
 * @param modelId - Which Claude model to use
 * @param maxTokens - Maximum output tokens (default 16384)
 * @returns Response text and token counts
 */
async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  modelId: ClaudeModelId = "claude-opus-4-6",
  maxTokens: number = 16384,
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
      model: modelId,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
    signal: AbortSignal.timeout(300_000), // 5 min for large generations
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

// ─── Gemini API Call with Google Search Grounding ────────────────────

/**
 * Calls Gemini with Google Search grounding enabled.
 *
 * @description Used ONLY for Step 1 research — finding real-world product
 * dimensions via Google Search. Claude handles everything else.
 *
 * @param prompt - User prompt
 * @param modelId - Gemini model to use (Flash for cost)
 * @returns Response text, source URLs, and token counts
 */
async function callGeminiWithSearch(
  prompt: string,
  modelId: string = "gemini-2.5-flash",
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

// ─── Thingiverse CAD Model Search ────────────────────────────────────

/** Search result from Thingiverse API */
interface ThingiverseResult {
  name: string
  url: string
  description: string
  thumbnail?: string
}

/**
 * Searches Thingiverse for existing CAD models as dimensional references.
 *
 * @description Informational only — does not download files. Gives the LLM
 * awareness of existing reference geometry. Requires THINGIVERSE_API_TOKEN.
 * Skips gracefully if not set.
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
      preview_image?: string
    }> = data?.hits ?? data ?? []

    return hits
      .filter((h): h is { name: string; public_url: string; description: string; preview_image?: string } =>
        Boolean(h.name && h.public_url),
      )
      .slice(0, 5)
      .map((h) => ({
        name: h.name,
        url: h.public_url,
        description: (h.description ?? "").slice(0, 200),
        thumbnail: h.preview_image,
      }))
  } catch (error) {
    console.warn(
      "[CAD-LAB] Thingiverse search failed:",
      error instanceof Error ? error.message : "Unknown error",
    )
    return []
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
  svg_back: string | null
  svg_right: string | null
  svg_left: string | null
  svg_exploded: string | null
  analysis: {
    mass_properties?: {
      mass_kg?: number
      volume_mm3?: number
      surface_area_mm2?: number
      center_of_gravity?: [number, number, number]
      material_density_kg_m3?: number
      bounding_box?: { xLen: number; yLen: number; zLen: number }
      error?: string
    }
    dfm?: {
      printable?: boolean
      issues?: Array<{ severity: string; category: string; message: string }>
      estimated_print_time_min?: number
      estimated_material_g?: number
      support_volume_pct?: number
      compatible_printers?: string[]
      error?: string
    }
  } | null
}

/**
 * Executes CadQuery code on Modal.
 *
 * @param code - Complete CadQuery Python code (must assign `result`)
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
      module_id: "cad-lab-v3",
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

// ─── Code Extraction ─────────────────────────────────────────────────

/**
 * Extracts Python code from a Claude response that may contain markdown fences.
 *
 * @param text - Raw Claude response text
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

// ─── Research Synthesis Prompt ────────────────────────────────────────

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
- Key critical dimension (motor-to-motor diagonal, tube inner diameter, etc.): X mm
- Clearance requirements: X mm
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

// ─── Step 1: Research (exported) ─────────────────────────────────────

/**
 * Runs standalone research for a product: web search + CAD model search + Claude synthesis.
 *
 * @description This is Step 1 from the CLAUDE_CAD_INSTRUCTIONS:
 * "RESEARCH real dimensions. Before anything else, search for real-world
 * reference dimensions of the product you're building. Never invent dimensions."
 *
 * Flow:
 *   1. Gemini + Google Search for real-world specs
 *   2. Thingiverse for existing CAD reference models
 *   3. Claude synthesizes everything into a structured engineering report
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
  if (!user) return { error: "Unauthorized" } as unknown as CadLabResearchResult

  // SECURITY: Rate limit AI calls to prevent cost abuse
  const rateLimitError = await checkRateLimit("aiCadLab", `ai:${user.id}`)
  if (rateLimitError) return { error: rateLimitError } as unknown as CadLabResearchResult

  const start = Date.now()

  try {
    console.info("[CAD-LAB] Step 1: Research — web search + CAD model search...")

    // 1. Run Gemini + Google Search and Thingiverse in parallel
    const [webResult, cadResult] = await Promise.allSettled([
      callGeminiWithSearch(
        `Find the real-world specifications for: ${description}

I need precise engineering dimensions for 3D CAD modelling. Search for:

1. OVERALL DIMENSIONS — length, width, height in mm (folded and unfolded if applicable)
2. WEIGHT — total weight and breakdown if available
3. MOTOR/ACTUATOR SPECS — diameter, height, mounting hole pattern (if it has motors)
4. KEY COMPONENT DIMENSIONS — battery, camera, electronics, frame, arms
5. CRITICAL CONSTRAINTS — motor-to-motor diagonal, wheelbase, prop clearance
6. MATERIAL — primary materials and wall thicknesses
7. STANDARD PARTS — propeller size, bolt sizes, mounting standards

Format your response as a structured specification sheet with exact numbers in millimetres. If a dimension is approximate, say so. If you find conflicting specs from different sources, list both.

Do NOT guess dimensions. Only include measurements you found from real sources.`,
      ),
      searchCadModels(description),
    ])

    const webSpecs = webResult.status === "fulfilled" ? webResult.value.text : ""
    const webSources = webResult.status === "fulfilled" ? webResult.value.sources : []
    const cadModels = cadResult.status === "fulfilled" ? cadResult.value : []

    // 2. Build raw data context for Claude
    const rawDataSections: string[] = []

    if (webSpecs.trim()) {
      rawDataSections.push(`=== RAW WEB SEARCH RESULTS ===\n${webSpecs}`)
    }

    if (cadModels.length > 0) {
      const modelList = cadModels
        .map((m) => `- ${m.name}: ${m.url}\n  ${m.description}`)
        .join("\n")
      rawDataSections.push(`=== THINGIVERSE CAD MODELS ===\n${modelList}`)
    }

    const rawContext = rawDataSections.join("\n\n")

    // 3. Send to Claude for synthesis
    console.info("[CAD-LAB] Step 1: Synthesizing report with Claude...")
    const claudeResult = await callClaude(
      RESEARCH_SYNTHESIS_PROMPT,
      `Product to research: ${description}\n\n${rawContext}`,
    )

    const referenceModels = cadModels.map((m) => ({ name: m.name, url: m.url }))

    console.info(
      `[CAD-LAB] Step 1 complete: ${webSources.length} web sources, ${referenceModels.length} CAD refs, ${Date.now() - start}ms`,
    )

    return {
      success: true,
      report: claudeResult.text,
      sources: webSources,
      referenceModels,
      researchTime: Date.now() - start,
    }
  } catch (error) {
    console.error("[CAD-LAB] Step 1 failed:", error instanceof Error ? error.message : error)
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

// ─── Step 2: Interface Definition (exported) ─────────────────────────

/**
 * Generates a text-only interface definition from the research report.
 *
 * @description This is Step 2 from the CLAUDE_CAD_INSTRUCTIONS:
 * "Write the INTERFACE DEFINITION (text only — no code yet).
 * This is the most important step. It is NOT optional."
 *
 * Produces exactly 4 sections:
 *   a) Space Budget — how components stack/fit within the overall envelope
 *   b) Component Placement Table — every component with qty, dimensions, position
 *   c) Connection Map — trace every flow path end-to-end (if applicable)
 *   d) Validation Checklist — boolean checks that must pass before code
 *
 * @param description - Product description
 * @param researchReport - Research report from Step 1
 * @param modelId - Claude model to use
 * @returns Interface definition text
 */
export async function generateCadLabInterface(
  description: string,
  researchReport: string,
  modelId: ClaudeModelId = "claude-opus-4-6",
): Promise<CadLabInterfaceResult> {
  // AUTH: Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" } as unknown as CadLabInterfaceResult

  // SECURITY: Rate limit
  const rateLimitError = await checkRateLimit("aiCadLab", `ai:${user.id}`)
  if (rateLimitError) return { error: rateLimitError } as unknown as CadLabInterfaceResult

  const start = Date.now()

  try {
    console.info("[CAD-LAB] Step 2: Generating interface definition...")

    // Look up user's sector and fetch filtered library
    const sector = await lookupUserSector(supabase, user.id)
    const librarySummary = await fetchLibrarySummary(sector)
    const librarySection = librarySummary.length > 0
      ? `\n\nAVAILABLE COMPONENT LIBRARY (${librarySummary.length} pre-built parts):\n` +
        librarySummary.map((c) => `  - ${c.slug} (${c.name}) [${c.category}]`).join("\n") +
        "\n\nWhen a product component matches a library slug, mark it as \"LIBRARY: slug_name\" in the Source column."
      : ""

    const systemPrompt = `You are an engineering planner for parametric CAD models. You are NOT writing code — this is pure engineering planning.

Your job is to produce a text-only interface definition that will be used to generate CadQuery Python code. Every dimension must be a specific number in millimetres. The numbers must sum correctly — show ALL arithmetic step-by-step.

Output EXACTLY these 4 sections:

=== a) SPACE BUDGET ===
How components stack/fit within the overall envelope. Must add up arithmetically.
Show dimensions and how they add up. If components stack vertically, show:
  base_z + component1_h + gap + component2_h + ... = total_h

Example:
  Tray depth:      60mm
  Growing zone:   300mm
  Clearance:       40mm
  LED bar:         34mm
  ─────────────────────
  Total per level: 434mm

Rule: if the numbers don't add up in text, they won't add up in 3D.

=== b) COMPONENT PLACEMENT TABLE ===
| Component        | Qty | Dimensions (mm)     | Position (x,y,z)  | Notes              |
|------------------|-----|---------------------|--------------------|--------------------|
One row per unique component type. Position is the centre point.
Minimum 6 unique component types for any model.

=== c) CONNECTION MAP ===
For assemblies with flows (water, air, electrical, structural loads), trace COMPLETE paths.
If no flows apply, write "N/A — Static assembly with no flow paths"

Example:
  RO Brine In → Pre-Treatment Tank → Evaporator → Crystallizer → Salt Bin

=== d) VALIDATION CHECKLIST ===
Boolean checks. All must pass before writing geometry.
Example:
  - [ ] Magazine ID (39mm) > capsule flange (37mm) — clearance
  - [ ] 10 capsules × 29mm = 290mm < tube height 315mm — fits
  - [ ] Total height < 500mm — reasonable

CRITICAL RULES:
- SHOW ALL ARITHMETIC step-by-step
- Every position must be calculated from named quantities, not eyeballed
- Components must not overlap spatially
- DO NOT WRITE ANY CODE — this is pure engineering planning
- Use the research report dimensions exactly — do not invent new numbers
- ALWAYS check the component library FIRST before planning custom geometry
- Prefer library components over custom geometry — they produce recognisable, detailed parts
- If the research report contains unanswered clarifying questions (e.g. "Key Clarifications Required"), DO NOT repeat them or ask your own. Instead, answer each one yourself using the best engineering judgment based on standard industry practice. Document each decision clearly, e.g.: "RESOLVED: Veranda is within the 12×6m footprint (standard for transportable homes in AU)"
- Your output must be complete and ready for code generation with zero follow-up needed${librarySection}`

    const userPrompt = `Product: ${description}

Research Report (use these dimensions — do not invent new ones):
${researchReport}

Generate the complete interface definition following the exact 4-section format.`

    const { text, tokensIn, tokensOut } = await callClaude(
      systemPrompt,
      userPrompt,
      modelId,
      8192,
    )

    console.info(`[CAD-LAB] Step 2 complete: ${Date.now() - start}ms`)

    return {
      success: true,
      interfaceDefinition: text,
      generationTime: Date.now() - start,
      tokensIn,
      tokensOut,
    }
  } catch (error) {
    console.error("[CAD-LAB] Step 2 failed:", error instanceof Error ? error.message : error)
      return {
        success: false,
      error: error instanceof Error ? error.message : "Interface definition generation failed",
      interfaceDefinition: "",
      generationTime: Date.now() - start,
      tokensIn: 0,
      tokensOut: 0,
    }
  }
}

// ─── Step 3: Generate CadQuery Code + Execute (exported) ─────────────

/**
 * Generates complete CadQuery code from the interface definition, then executes on Modal.
 *
 * @description This is Step 3 from the CLAUDE_CAD_INSTRUCTIONS:
 * "Now — and only now — write geometry."
 *
 * The system prompt is the full CLAUDE_CAD_INSTRUCTIONS_1214.md document
 * read from disk at runtime. This means the methodology can be updated
 * without redeploying.
 *
 * Claude generates the complete script in a single pass:
 * - All component functions
 * - Assembly (union calls)
 * - Validation checks
 * - Final `result` variable assignment
 *
 * Then the code is executed on Modal to produce STEP + STL + SVG exports.
 *
 * @param description - Product description
 * @param researchReport - Research report from Step 1
 * @param interfaceDefinition - Interface definition from Step 2
 * @param modelId - Claude model to use
 * @returns Generation result with SVGs, metrics, and code
 */
export async function generateCadLabModel(
  description: string,
  researchReport: string,
  interfaceDefinition: string,
  modelId: ClaudeModelId = "claude-opus-4-6",
): Promise<CadLabResult> {
  // AUTH: Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" } as unknown as CadLabResult

  // SECURITY: Rate limit
  const rateLimitError = await checkRateLimit("aiCadLab", `ai:${user.id}`)
  if (rateLimitError) return { error: rateLimitError } as unknown as CadLabResult

  const pipelineStart = Date.now()
  let totalTokensIn = 0
  let totalTokensOut = 0

  try {
    // ── Generate code with Claude ──
    console.info("[CAD-LAB] Step 3: Generating complete CadQuery code with Claude...")

    // Look up user's sector and fetch filtered library for prompt injection
    const sector = await lookupUserSector(supabase, user.id)
    const librarySummary = await fetchLibrarySummary(sector)
    const libraryPromptSection = await formatLibraryForPrompt(librarySummary)

    const systemPrompt = `You are generating a complete CadQuery parametric CAD model. Follow the methodology in this document EXACTLY:

${CAD_INSTRUCTIONS}

${libraryPromptSection}

ADDITIONAL RULES FOR THIS PIPELINE:
- The final variable MUST be called "result" and be a cq.Workplane object
- Do NOT include any cq.exporters calls — the execution environment handles export
- Do NOT include any print() statements
- Do NOT import os or use open()
- After assembling "result", also create "result_exploded" — a cq.Workplane that shows all major components translated apart along Z by 1.5× their height for visual separation. This produces an exploded assembly drawing. Wrap the result_exploded creation in a try/except so it never blocks the main result.
- Output ONLY the Python code inside a single \`\`\`python code fence. No explanations before or after.`

    const userPrompt = `Build a parametric CAD model of: ${description}

=== RESEARCH REPORT ===
${researchReport}

=== INTERFACE DEFINITION ===
${interfaceDefinition}

Generate the complete CadQuery Python code following the methodology. The code must:
1. Define every component as a function (make_componentname)
2. Put all primary parameters at the top, calculate all derived values
3. Include validation checks
4. Assemble everything with union calls
5. Assign the final assembly to a variable called "result"
6. Create "result_exploded" showing all components spread apart along Z for an exploded view (wrap in try/except)

If the research report or interface definition contains any unresolved questions or ambiguities, resolve them with your best engineering judgment and proceed. Do not ask for clarification — make the best decision and add a code comment noting the assumption.`

    const codeResult = await callClaude(systemPrompt, userPrompt, modelId, 64000)
    totalTokensIn += codeResult.tokensIn
    totalTokensOut += codeResult.tokensOut

    let finalCode = extractCode(codeResult.text)

    // Safety: strip any export/print/os calls that slipped through
    finalCode = finalCode
      .split("\n")
      .filter((line: string) => {
        const s = line.trim()
        if (/^print\s*\(/.test(s)) return false
        if (s.startsWith("import os") || s.startsWith("from os")) return false
        if (s.includes("cq.exporters")) return false
        return true
      })
      .join("\n")

    const codeLines = finalCode.split("\n").length
    const generationTime = Date.now() - pipelineStart

    console.info(`[CAD-LAB] Step 3: Code generated (${codeLines} lines, ${generationTime}ms)`)

    // ── Prepend library function definitions for any used slugs ──
    const { combinedCode, libraryComponents } = await prepareCodeWithLibrary(finalCode)
    if (libraryComponents.length > 0) {
      console.info("[CAD-LAB] Library components prepended for execution:", {
        count: libraryComponents.length,
        slugs: libraryComponents,
      })
    }

    // ── Execute on Modal ──
    console.info("[CAD-LAB] Step 4: Executing on Modal...")
    const modalStart = Date.now()
    const modalResult = await executeOnModal(combinedCode)
    const modalTime = Date.now() - modalStart

    if (modalResult.error && !modalResult.svg_iso) {
      return {
        success: false,
        error: modalResult.error,
        code: finalCode,
        codeLines,
        generationTime,
        modalTime,
        interfaceDefinition,
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
    const stepSizeKb = modalResult.step
      ? Math.round(atob(modalResult.step).length / 1024)
      : undefined
    const fillRatio = bbVol > 0
      ? Math.round((vol / bbVol) * 1000) / 10
      : undefined
    const bboxResult = bb
      ? { xLen: Math.round(bb.xLen), yLen: Math.round(bb.yLen), zLen: Math.round(bb.zLen) }
      : undefined

    // ── Post-execution validation ──
    const warnings: string[] = []

    if (bboxResult) {
      if (bboxResult.xLen < 1 || bboxResult.yLen < 1 || bboxResult.zLen < 1) {
        warnings.push(
          `BBox has degenerate dimension(s): ${bboxResult.xLen}×${bboxResult.yLen}×${bboxResult.zLen}mm`,
        )
      }
      const maxDim = Math.max(bboxResult.xLen, bboxResult.yLen, bboxResult.zLen)
      const minDim = Math.min(bboxResult.xLen, bboxResult.yLen, bboxResult.zLen)
      if (maxDim / minDim > 50) {
        warnings.push(
          `Extreme aspect ratio ${(maxDim / minDim).toFixed(1)}:1 — may indicate missing components`,
        )
      }
    }

    if (fillRatio != null && fillRatio > 15) {
      warnings.push(
        `Fill ratio ${fillRatio}% is high (expected <15% for hollow geometry)`,
      )
    }

    if (stepSizeKb != null && stepSizeKb < 100) {
      warnings.push(
        `STEP size ${stepSizeKb}KB is small — model may have minimal geometry`,
      )
    }

    console.info(
      `[CAD-LAB] Pipeline complete: ${codeLines} lines, ${bboxResult?.xLen ?? "?"}×${bboxResult?.yLen ?? "?"}×${bboxResult?.zLen ?? "?"}mm, ${Date.now() - pipelineStart}ms total`,
    )

    // ── Extract DFM analysis ──
    const dfmRaw = modalResult.analysis?.dfm
    const dfmResult = dfmRaw && !dfmRaw.error
      ? {
          printable: dfmRaw.printable ?? false,
          issues: dfmRaw.issues ?? [],
          estimatedPrintTimeMin: dfmRaw.estimated_print_time_min ?? 0,
          estimatedMaterialG: dfmRaw.estimated_material_g ?? 0,
          supportVolumePct: dfmRaw.support_volume_pct ?? 0,
          compatiblePrinters: dfmRaw.compatible_printers ?? [],
        }
      : undefined

    // ── Extract mass properties ──
    const massPropsResult = mp && !mp.error
      ? {
          massKg: mp.mass_kg ?? 0,
          volumeMm3: mp.volume_mm3 ?? 0,
          surfaceAreaMm2: mp.surface_area_mm2 ?? 0,
          centerOfGravity: (mp.center_of_gravity ?? [0, 0, 0]) as [number, number, number],
          materialDensityKgM3: mp.material_density_kg_m3 ?? 1240,
        }
      : undefined

    // ── Helper to make data URI from base64 SVG ──
    const svgUri = (b64: string | null): string | undefined =>
      b64 ? `data:image/svg+xml;base64,${b64}` : undefined

    return {
      success: true,
      code: finalCode,
      codeLines,
      generationTime,
      modalTime,
      svgIso: svgUri(modalResult.svg_iso),
      svgTop: svgUri(modalResult.svg_top),
      svgFront: svgUri(modalResult.svg_front),
      svgBack: svgUri(modalResult.svg_back),
      svgRight: svgUri(modalResult.svg_right),
      svgLeft: svgUri(modalResult.svg_left),
      svgExploded: svgUri(modalResult.svg_exploded),
      stepData: modalResult.step || undefined,
      stepSize: stepSizeKb,
      stlData: modalResult.stl || undefined,
      stlSize: modalResult.stl ? Math.round(atob(modalResult.stl).length / 1024) : undefined,
      bbox: bboxResult,
      fillRatio,
      massGrams: mp?.mass_kg ? Math.round(mp.mass_kg * 1000 * 10) / 10 : undefined,
      volumeMm3: vol ? Math.round(vol) : undefined,
      dfm: dfmResult,
      massProperties: massPropsResult,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      modelUsed: modelId,
      interfaceDefinition,
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
