"use server"

/**
 * @file cad-grammar.ts — Grammar-based parametric CAD generation pipeline.
 *
 * @description Instead of generating raw CadQuery code from scratch, this
 * approach uses domain grammars that encode engineering knowledge. The AI
 * selects the best grammar and extracts parameters — deterministic geometry
 * generation is handled by tested grammar code.
 *
 * Pipeline:
 *   1. selectGrammar() — AI picks best grammar from registry
 *   2. extractGrammarParams() — AI extracts parameter values from description
 *   3. generateFromGrammar() — Grammar code runs on Modal (deterministic)
 *
 * Fallback: If no grammar matches, falls back to raw CadQuery generation.
 *
 * @security Server-side only, uses admin API keys and Supabase service role.
 */

import type { CadLabResult } from "@/lib/cad-lab-types"
import { createClient } from "@/lib/supabase/server"
import { researchAndCreateGrammar } from "@/actions/cad-grammar-research"

// ─── Types ──────────────────────────────────────────────────────────

/** A grammar record from the cad_grammars table */
export interface CadGrammar {
  id: string
  name: string
  displayName: string
  description: string
  domainKeywords: string[]
  examplePrompts: string[]
  pythonCode: string
  coreLibraryCode: string
  paramSpecs: GrammarParamSpec[]
  defaults: Record<string, unknown>
  constraintsSummary: string | null
  source: "built_in" | "researched" | "user_created"
  isActive: boolean
  version: number
}

/** A parameter specification from a grammar */
export interface GrammarParamSpec {
  name: string
  type: "float" | "int" | "bool" | "enum" | "list" | "dict_list"
  unit: string | null
  description: string
  default: unknown
  min_val: number | null
  max_val: number | null
  enum_options?: string[]
}

/** Result from grammar selection */
export interface GrammarSelectionResult {
  /** Whether a suitable grammar was found */
  found: boolean
  /** The selected grammar (null if none matched) */
  grammar: CadGrammar | null
  /** AI's confidence in the match (0-1) */
  confidence: number
  /** AI's reasoning for the selection */
  reasoning: string
  /** Whether to fall back to raw CadQuery generation */
  shouldFallback: boolean
}

/** Result from parameter extraction */
export interface GrammarParamsResult {
  success: boolean
  error?: string
  /** Extracted parameter values */
  params: Record<string, unknown>
  /** AI's reasoning for parameter choices */
  reasoning: string
  /** Parameters that were left as defaults (not in user description) */
  defaultedParams: string[]
  /** Tokens used */
  tokensIn: number
  tokensOut: number
}

/** Response from the Modal grammar endpoint */
interface ModalGrammarResponse {
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

// ─── Claude API Call (shared utility) ────────────────────────────────

/**
 * Calls Claude API directly for grammar-related AI operations.
 *
 * @param systemPrompt - System instruction
 * @param userPrompt - User message
 * @param maxTokens - Max output tokens
 * @returns Response text and token counts
 */
async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 4096,
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
      model: "claude-sonnet-4-5-20250929",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
    signal: AbortSignal.timeout(120_000), // 2 min — grammar selection/extraction is fast
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

// ─── Supabase Queries ───────────────────────────────────────────────

/**
 * Fetches all active grammars from the cad_grammars table.
 *
 * @description Returns grammar metadata (not full code) for the selector AI.
 * Full code is fetched only after a grammar is selected.
 *
 * @returns Array of grammar summaries with keywords and param specs
 */
async function fetchGrammarRegistry(): Promise<Array<{
  id: string
  name: string
  display_name: string
  description: string
  domain_keywords: string[]
  example_prompts: string[]
  param_specs: GrammarParamSpec[]
  defaults: Record<string, unknown>
  constraints_summary: string | null
  source: string
}>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("cad_grammars")
    .select("id, name, display_name, description, domain_keywords, example_prompts, param_specs, defaults, constraints_summary, source")
    .eq("is_active", true)
    .order("name")

  if (error) {
    console.error("[CAD-GRAMMAR] Failed to fetch grammar registry:", error.message)
    return []
  }

  // Safe cast: Supabase returns Json for JSONB columns
  return (data ?? []).map((row) => ({
    ...row,
    param_specs: row.param_specs as unknown as GrammarParamSpec[],
    defaults: row.defaults as unknown as Record<string, unknown>,
  }))
}

/**
 * Fetches a complete grammar by name, including Python code.
 *
 * @param name - Grammar name (e.g. "building", "drone")
 * @returns Full grammar record or null
 */
async function fetchGrammarByName(name: string): Promise<CadGrammar | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("cad_grammars")
    .select("*")
    .eq("name", name)
    .eq("is_active", true)
    .single()

  if (error || !data) {
    console.error("[CAD-GRAMMAR] Grammar not found:", name, error?.message)
    return null
  }

  return {
    id: data.id,
    name: data.name,
    displayName: data.display_name,
    description: data.description,
    domainKeywords: data.domain_keywords,
    examplePrompts: data.example_prompts,
    pythonCode: data.python_code,
    coreLibraryCode: data.core_library_code,
    paramSpecs: data.param_specs as unknown as GrammarParamSpec[],
    defaults: data.defaults as unknown as Record<string, unknown>,
    constraintsSummary: data.constraints_summary,
    source: data.source as CadGrammar["source"],
    isActive: data.is_active,
    version: data.version,
  }
}

// ─── Grammar Selection ──────────────────────────────────────────────

/**
 * Selects the best grammar for a user's product description.
 *
 * @description Uses Claude to analyze the user's request against the
 * grammar registry. Returns the best match with confidence score, or
 * indicates fallback to raw CadQuery generation.
 *
 * @param productDescription - What the user wants to design
 * @returns Selection result with grammar, confidence, and reasoning
 *
 * @security Server-side only. Rate limited per user.
 */
export async function selectGrammar(
  productDescription: string,
): Promise<GrammarSelectionResult> {
  // AUTH: Verify authenticated user
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      found: false,
      grammar: null,
      confidence: 0,
      reasoning: "Authentication required",
      shouldFallback: false,
    }
  }

  // Fetch all available grammars (metadata only)
  const registry = await fetchGrammarRegistry()

  if (registry.length === 0) {
    return {
      found: false,
      grammar: null,
      confidence: 0,
      reasoning: "No grammars available in registry",
      shouldFallback: true,
    }
  }

  // Build grammar catalog for the AI
  const catalogText = registry.map((g) => {
    const keywords = g.domain_keywords.join(", ")
    const examples = g.example_prompts.slice(0, 3).join("; ")
    const params = g.param_specs
      .filter((p: GrammarParamSpec) => p.type !== "dict_list" && p.type !== "list")
      .map((p: GrammarParamSpec) => `${p.name} (${p.type}${p.unit ? `, ${p.unit}` : ""})`)
      .join(", ")
    return `- **${g.name}** (${g.display_name}): ${g.description}\n  Keywords: ${keywords}\n  Examples: ${examples}\n  Parameters: ${params}`
  }).join("\n\n")

  const systemPrompt = `You are a CAD grammar selector for ForgeOS. Your job is to match a user's product description to the most suitable parametric design grammar.

Each grammar encodes domain-specific engineering knowledge (e.g., building codes, drone frame sizing rules, gear mesh formulas). Using a grammar produces MORE RELIABLE results than generating CadQuery code from scratch.

GRAMMAR CATALOG:
${catalogText}

RULES:
1. If the product clearly matches a grammar domain, select it with high confidence (0.7-1.0).
2. If the product partially matches (e.g., "shed" → building grammar), select with medium confidence (0.4-0.7).
3. If no grammar fits at all, set found=false and shouldFallback=true.
4. Consider domain_keywords and example_prompts for matching.
5. Even approximate matches are better than raw code generation — the grammar's engineering rules ensure structural validity.

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "found": boolean,
  "grammar_name": string | null,
  "confidence": number,
  "reasoning": string,
  "shouldFallback": boolean
}`

  const userPrompt = `Product to design: "${productDescription}"`

  try {
    const { text } = await callClaude(systemPrompt, userPrompt, 1024)

    // Parse JSON response
    const jsonStr = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim()
    const parsed = JSON.parse(jsonStr) as {
      found: boolean
      grammar_name: string | null
      confidence: number
      reasoning: string
      shouldFallback: boolean
    }

    if (!parsed.found || !parsed.grammar_name) {
      return {
        found: false,
        grammar: null,
        confidence: parsed.confidence ?? 0,
        reasoning: parsed.reasoning ?? "No suitable grammar found",
        shouldFallback: parsed.shouldFallback ?? true,
      }
    }

    // Fetch the full grammar with code
    const grammar = await fetchGrammarByName(parsed.grammar_name)

    if (!grammar) {
      return {
        found: false,
        grammar: null,
        confidence: 0,
        reasoning: `Grammar "${parsed.grammar_name}" selected but not found in database`,
        shouldFallback: true,
      }
    }

    return {
      found: true,
      grammar,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      shouldFallback: false,
    }
  } catch (err) {
    console.error("[CAD-GRAMMAR] Grammar selection failed:", err)
    return {
      found: false,
      grammar: null,
      confidence: 0,
      reasoning: `Grammar selection error: ${err instanceof Error ? err.message : "Unknown error"}`,
      shouldFallback: true,
    }
  }
}

// ─── Parameter Extraction ───────────────────────────────────────────

/**
 * Extracts grammar parameters from a natural language product description.
 *
 * @description Uses Claude to convert the user's description into specific
 * parameter values for the selected grammar. Fills in defaults for anything
 * not mentioned.
 *
 * @param grammar - The selected grammar
 * @param productDescription - What the user wants to design
 * @returns Extracted parameters and reasoning
 *
 * @security Server-side only.
 */
export async function extractGrammarParams(
  grammar: CadGrammar,
  productDescription: string,
): Promise<GrammarParamsResult> {
  // Build parameter documentation
  const paramDocs = grammar.paramSpecs.map((p) => {
    let doc = `- **${p.name}** (${p.type}${p.unit ? `, ${p.unit}` : ""}): ${p.description}`
    if (p.default !== null && p.default !== undefined) {
      doc += `\n  Default: ${JSON.stringify(p.default)}`
    }
    if (p.min_val !== null) doc += ` | Min: ${p.min_val}`
    if (p.max_val !== null) doc += ` | Max: ${p.max_val}`
    if (p.enum_options) doc += `\n  Options: ${p.enum_options.join(", ")}`
    return doc
  }).join("\n")

  const defaultsJson = JSON.stringify(grammar.defaults, null, 2)

  const systemPrompt = `You are a parametric design assistant for ForgeOS. Your job is to extract specific parameter values from a natural language product description.

GRAMMAR: ${grammar.displayName}
DESCRIPTION: ${grammar.description}
${grammar.constraintsSummary ? `CONSTRAINTS: ${grammar.constraintsSummary}` : ""}

PARAMETERS:
${paramDocs}

DEFAULTS (used when user doesn't specify):
${defaultsJson}

RULES:
1. Extract ONLY parameters that the user explicitly or implicitly specified.
2. For unmentioned parameters, let them use their defaults — DO NOT include them in "params".
3. Convert units as needed (e.g., "4 meters" → 4000 mm, "6 inches" → 152.4mm).
4. For enum parameters, pick the closest valid option.
5. For list/dict_list parameters, construct appropriate arrays from the description.
6. Be conservative — better to use a sensible default than guess wrong.
7. Respect min/max constraints on numeric parameters.

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "params": { ... },
  "reasoning": "Brief explanation of parameter choices",
  "defaulted_params": ["param1", "param2"]
}`

  const userPrompt = `Design request: "${productDescription}"`

  try {
    const { text, tokensIn, tokensOut } = await callClaude(systemPrompt, userPrompt, 2048)

    // Parse JSON response
    const jsonStr = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim()
    const parsed = JSON.parse(jsonStr) as {
      params: Record<string, unknown>
      reasoning: string
      defaulted_params: string[]
    }

    return {
      success: true,
      params: parsed.params ?? {},
      reasoning: parsed.reasoning ?? "",
      defaultedParams: parsed.defaulted_params ?? [],
      tokensIn,
      tokensOut,
    }
  } catch (err) {
    console.error("[CAD-GRAMMAR] Parameter extraction failed:", err)
    return {
      success: false,
      error: `Parameter extraction error: ${err instanceof Error ? err.message : "Unknown error"}`,
      params: {},
      reasoning: "",
      defaultedParams: [],
      tokensIn: 0,
      tokensOut: 0,
    }
  }
}

// ─── Modal Execution ────────────────────────────────────────────────

/**
 * Executes grammar code on Modal and returns CAD files.
 *
 * @description Sends grammar code + parameters to the Modal
 * generate_from_grammar_endpoint, which runs the 3-level pipeline
 * (validate → derive_skeleton → build) and exports STEP/STL/SVG.
 *
 * @param grammar - The grammar to execute
 * @param params - Parameter values (merged with defaults on Modal side)
 * @returns Modal response with base64-encoded files
 *
 * @security Grammar code is from Supabase (trusted). Parameters are validated
 * by the grammar's validate_params() method on Modal.
 */
async function executeGrammarOnModal(
  grammar: CadGrammar,
  params: Record<string, unknown>,
): Promise<ModalGrammarResponse> {
  // SECURITY: Use separate endpoint URL for grammar-based generation
  const endpointUrl = process.env.MODAL_CAD_GRAMMAR_ENDPOINT_URL
    ?? process.env.MODAL_CAD_ENDPOINT_URL?.replace(
      "generate-cad-endpoint",
      "generate-from-grammar-endpoint",
    )

  if (!endpointUrl) throw new Error("MODAL_CAD_GRAMMAR_ENDPOINT_URL not configured")

  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      core_code: grammar.coreLibraryCode,
      grammar_code: grammar.pythonCode,
      params,
      material_density: 1240,
    }),
    signal: AbortSignal.timeout(600_000), // 10 min — complex assemblies need time
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Modal grammar error (${response.status}): ${errText.slice(0, 300)}`)
  }

  return (await response.json()) as ModalGrammarResponse
}

// ─── Full Pipeline ──────────────────────────────────────────────────

/**
 * Generates a CAD model using the grammar-based pipeline.
 *
 * @description Full pipeline:
 *   1. Select grammar from registry
 *   2. Extract parameters from description
 *   3. Execute grammar on Modal
 *   4. Return results in CadLabResult format
 *
 * If no grammar matches, returns shouldFallback=true so the caller
 * can use the raw CadQuery pipeline instead.
 *
 * @param productDescription - What the user wants to design
 * @returns CadLabResult with grammar metadata, or fallback indicator
 *
 * @security Requires authenticated user. Rate limited.
 * @audit Logs grammar usage for analytics.
 */
export async function generateFromGrammar(
  productDescription: string,
): Promise<CadLabResult & { grammarUsed?: string; shouldFallback?: boolean }> {
  const pipelineStart = Date.now()
  let totalTokensIn = 0
  let totalTokensOut = 0

  try {
    // ── Step 1: Select grammar ──
    console.info("[CAD-GRAMMAR] Step 1: Selecting grammar...")
    const selection = await selectGrammar(productDescription)

    if (!selection.found || !selection.grammar) {
      // ── Try to research and create a new grammar ──
      console.info("[CAD-GRAMMAR] No grammar matched. Attempting to research and create one...")
      const researchResult = await researchAndCreateGrammar(productDescription)

      if (researchResult.success && researchResult.grammarName) {
        totalTokensIn += researchResult.tokensIn
        totalTokensOut += researchResult.tokensOut
        console.info(`[CAD-GRAMMAR] New grammar "${researchResult.grammarName}" created. Retrying selection...`)

        // Fetch the newly created grammar
        const newGrammar = await fetchGrammarByName(researchResult.grammarName)
        if (newGrammar) {
          // Skip re-selection, go straight to param extraction with the new grammar
          const extraction = await extractGrammarParams(newGrammar, productDescription)
          totalTokensIn += extraction.tokensIn
          totalTokensOut += extraction.tokensOut

          if (extraction.success) {
            const modalStart = Date.now()
            const modalResult = await executeGrammarOnModal(newGrammar, extraction.params)
            const modalTime = Date.now() - modalStart

            if (modalResult.error && !modalResult.svg_iso) {
              // Research grammar failed to execute — fall back to raw CadQuery
              console.warn("[CAD-GRAMMAR] Researched grammar failed on Modal, suggesting fallback")
              return { success: false, shouldFallback: true, error: `Researched grammar failed: ${modalResult.error}` }
            }

            // Success with researched grammar — build result
            const mp = modalResult.analysis?.mass_properties
            const bb = mp?.bounding_box
            const svgUri = (b64: string | null): string | undefined => b64 ? `data:image/svg+xml;base64,${b64}` : undefined

            return {
              success: true,
              grammarUsed: `researched:${newGrammar.name}`,
              code: `# Generated by researched grammar: ${newGrammar.displayName}\n# Parameters: ${JSON.stringify(extraction.params, null, 2)}`,
              codeLines: newGrammar.pythonCode.split("\n").length,
              generationTime: Date.now() - pipelineStart,
              modalTime,
              svgIso: svgUri(modalResult.svg_iso),
              svgTop: svgUri(modalResult.svg_top),
              svgFront: svgUri(modalResult.svg_front),
              svgBack: svgUri(modalResult.svg_back),
              svgRight: svgUri(modalResult.svg_right),
              svgLeft: svgUri(modalResult.svg_left),
              svgExploded: svgUri(modalResult.svg_exploded),
              stepData: modalResult.step || undefined,
              stepSize: modalResult.step ? Math.round(atob(modalResult.step).length / 1024) : undefined,
              stlData: modalResult.stl || undefined,
              stlSize: modalResult.stl ? Math.round(atob(modalResult.stl).length / 1024) : undefined,
              bbox: bb ? { xLen: Math.round(bb.xLen * 10) / 10, yLen: Math.round(bb.yLen * 10) / 10, zLen: Math.round(bb.zLen * 10) / 10 } : undefined,
              massGrams: mp?.mass_kg ? Math.round(mp.mass_kg * 1000 * 10) / 10 : undefined,
              volumeMm3: mp?.volume_mm3 ? Math.round(mp.volume_mm3 * 10) / 10 : undefined,
              tokensIn: totalTokensIn,
              tokensOut: totalTokensOut,
              modelUsed: `grammar:researched:${newGrammar.name}`,
              error: modalResult.error ?? undefined,
            }
          }
        }
      }

      // Research also failed or grammar didn't execute — fall back
      console.info("[CAD-GRAMMAR] Grammar research didn't produce usable result, suggesting fallback:", selection.reasoning)
      return {
        success: false,
        shouldFallback: true,
        error: selection.reasoning,
      }
    }

    const grammar = selection.grammar
    console.info(
      `[CAD-GRAMMAR] Selected: ${grammar.name} (confidence: ${selection.confidence})`,
    )

    // ── Step 2: Extract parameters ──
    console.info("[CAD-GRAMMAR] Step 2: Extracting parameters...")
    const extraction = await extractGrammarParams(grammar, productDescription)
    totalTokensIn += extraction.tokensIn
    totalTokensOut += extraction.tokensOut

    if (!extraction.success) {
      return {
        success: false,
        error: extraction.error,
        grammarUsed: grammar.name,
      }
    }

    console.info("[CAD-GRAMMAR] Extracted params:", JSON.stringify(extraction.params))
    console.info("[CAD-GRAMMAR] Defaulted:", extraction.defaultedParams.join(", "))

    // ── Step 3: Execute on Modal ──
    console.info("[CAD-GRAMMAR] Step 3: Executing on Modal...")
    const modalStart = Date.now()
    const modalResult = await executeGrammarOnModal(grammar, extraction.params)
    const modalTime = Date.now() - modalStart

    if (modalResult.error && !modalResult.svg_iso) {
      return {
        success: false,
        error: modalResult.error,
        grammarUsed: grammar.name,
        generationTime: Date.now() - pipelineStart,
        modalTime,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
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

    // ── Build result ──
    const svgUri = (b64: string | null): string | undefined =>
      b64 ? `data:image/svg+xml;base64,${b64}` : undefined

    // Extract DFM
    const dfmRaw = modalResult.analysis?.dfm
    const dfmResult = dfmRaw && !dfmRaw.error
      ? {
          printable: dfmRaw.printable ?? false,
          issues: (dfmRaw.issues ?? []).map((i) => ({
            severity: i.severity,
            category: i.category,
            message: i.message,
          })),
          estimatedPrintTimeMin: dfmRaw.estimated_print_time_min ?? 0,
          estimatedMaterialG: dfmRaw.estimated_material_g ?? 0,
          supportVolumePct: dfmRaw.support_volume_pct ?? 0,
          compatiblePrinters: dfmRaw.compatible_printers ?? [],
        }
      : undefined

    const bboxResult = bb
      ? { xLen: Math.round(bb.xLen * 10) / 10, yLen: Math.round(bb.yLen * 10) / 10, zLen: Math.round(bb.zLen * 10) / 10 }
      : undefined

    return {
      success: true,
      grammarUsed: grammar.name,
      code: `# Generated by ${grammar.displayName} grammar\n# Parameters: ${JSON.stringify(extraction.params, null, 2)}`,
      codeLines: grammar.pythonCode.split("\n").length,
      generationTime: Date.now() - pipelineStart,
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
      volumeMm3: vol ? Math.round(vol * 10) / 10 : undefined,
      dfm: dfmResult,
      massProperties: mp && !mp.error
        ? {
            massKg: mp.mass_kg ?? 0,
            volumeMm3: mp.volume_mm3 ?? 0,
            surfaceAreaMm2: mp.surface_area_mm2 ?? 0,
            centerOfGravity: mp.center_of_gravity ?? [0, 0, 0],
            materialDensityKgM3: mp.material_density_kg_m3 ?? 1240,
          }
        : undefined,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      modelUsed: "grammar:" + grammar.name,
      error: modalResult.error ?? undefined,
    }
  } catch (err) {
    console.error("[CAD-GRAMMAR] Pipeline failed:", err)
    return {
      success: false,
      error: `Grammar pipeline error: ${err instanceof Error ? err.message : "Unknown error"}`,
      generationTime: Date.now() - pipelineStart,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
    }
  }
}

// ─── Grammar Registry Query (for UI) ────────────────────────────────

/**
 * Returns the list of available grammars for display in the UI.
 *
 * @description Fetches grammar metadata (not code) for showing
 * available domains in the CAD Lab interface.
 *
 * @returns Array of grammar summaries
 */
export async function listAvailableGrammars(): Promise<Array<{
  name: string
  displayName: string
  description: string
  examplePrompts: string[]
  paramCount: number
  source: string
}>> {
  const registry = await fetchGrammarRegistry()

  return registry.map((g) => ({
    name: g.name,
    displayName: g.display_name,
    description: g.description,
    examplePrompts: g.example_prompts,
    paramCount: g.param_specs.length,
    source: g.source,
  }))
}
