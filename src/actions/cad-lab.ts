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

import { createHash } from "crypto"
import { appendFileSync, writeFileSync } from "fs"
import type {
  ClaudeModelId,
  CadLabResult,
  CadLabResearchResult,
  CadLabInterfaceResult,
  CadLabDecompositionResult,
  CadLabModule,
  CadLabDesignBrief,
  MashupSourceInput,
  MashupPlan,
  MashupPlanResult,
  MashupResult,
  MashupExecuteResult,
  MashupSuggestion,
  InterfaceContractResult,
  InterfaceContract,
  SkeletonModule,
  SkeletonDecompositionResult,
  ModuleExpansionResult,
} from "@/lib/cad-lab-types"
import { generateFromGrammar } from "@/actions/cad-grammar"
import { checkRateLimit } from "@/lib/security/rate-limit"
import { fetchWithTimeout } from "@/lib/fetch-with-timeout"
import { createClient } from "@/lib/supabase/server"
import { CAD_INSTRUCTIONS } from "@/lib/cad-instructions"
import { fetchLibrarySummary, formatLibraryForPrompt, prepareCodeWithLibrary } from "@/actions/component-library"
import type { Sector } from "@/types/foundry"
import {
  type CadLabDomain,
  detectDomainFromProductDescription,
  detectDomainFromResearchReport,
  detectDomainFromText,
  getResearchSynthesisPrompt,
  getModuleDecompositionPrompt,
  getSkeletonDecompositionPrompt,
  getModuleExpansionPrompt,
  getDiagnosticsSystemPrompt,
  getDomainLabel,
  getDomainDescription,
  getCodeGenDomainHints,
} from "@/lib/cad-lab/domain-prompts"
import type { DiagnosticEnrichment, FieldEnrichment } from "@/lib/cad-lab/diagnostic-enrichment"
import { runMaterialConsensus } from "@/lib/cad-lab/multi-model-consensus"
import {
  getMashupPlanningSystemPrompt,
  getMashupPlanningUserPrompt,
  getMashupCodeGenSystemPrompt,
  getMashupCodeGenUserPrompt,
} from "@/lib/cad-lab/mashup-prompts"
import {
  getAssemblyCodeGenSystemPrompt,
  getAssemblyCodeGenUserPrompt,
  type AssemblyModuleInfo,
} from "@/lib/cad-lab/assembly-prompts"
import { createAdminClient } from "@/lib/supabase/admin"
import { withRetry } from "@/lib/retry"
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { matchTemplatesForModule, sanitiseForPrompt, isAllowedStepUrl } from "@/actions/step-template-matching"
import type { TemplateMatchResult, TemplateMatch } from "@/actions/step-template-matching"
import type { ModuleConnection, PreExecValidationResult } from "@/lib/cad-lab-types"
import { verifyInterfaceArithmetic, trackDimensionProvenance, checkComponentCoverage, validateInterfaceStructure, detectDimensionConflicts, checkInterfaceCompleteness, validateInterfaceContracts } from "@/lib/cad-lab/interface-validators"
import { checkPythonSyntax, scanParametricIntegrity, validateZStack, analyzeCadQueryCode, checkFunctionInvocations, checkLibraryUsage, categorizeModalError, stripUnsafeCode } from "@/lib/cad-lab/code-validators"
import { estimateDimensions, validateEstimatedDimensions } from "@/lib/cad-lab/dimension-estimator"
import { scoreRenderVision, type VisionScoreResult } from "@/lib/cad-lab/vision-scorer"
import { detectIndustryDomain, extractProductKeywords } from "@/lib/cad-lab/industry-domains"
import { retrieveStandardsForPrompt } from "@/lib/cad-lab/standards-retriever"
import { generateAndStoreStandards } from "@/lib/cad-lab/standards-auto-learn"
import { retrieveEngineeringDataForPrompt } from "@/lib/cad-lab/engineering-data-retriever"

/** Maximum STEP file size in bytes (50 MB) — duplicated from step-template-matching
 * because "use server" files cannot export non-function values */
const MAX_STEP_FILE_SIZE = 50 * 1024 * 1024

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
    console.warn('[THE-FORGE] Failed to look up user sector, continuing without filter')
    return null
  }
}

// ─── JSON Extraction Helpers ─────────────────────────────────────────

/** Extract a JSON array from AI text that may contain markdown fences or prose. */
function extractJsonArray(text: string): string {
  let cleaned = text.trim()
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  cleaned = cleaned.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "")
  // Remove single-line // comments (but not inside strings — good-enough heuristic)
  cleaned = cleaned.replace(/^\s*\/\/.*$/gm, "")
  // Remove trailing commas before ] or }
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1")

  const first = cleaned.indexOf("[")
  const last = cleaned.lastIndexOf("]")
  if (first !== -1 && last > first) {
    return cleaned.slice(first, last + 1)
  }
  return cleaned
}

/** Extract a JSON object from AI text that may contain markdown fences or prose. */
function extractJsonObject(text: string): string {
  const trimmed = text.trim()
  const first = trimmed.indexOf("{")
  const last = trimmed.lastIndexOf("}")
  if (first !== -1 && last > first) {
    return trimmed.slice(first, last + 1)
  }
  return trimmed
}

// ─── Claude API Call ─────────────────────────────────────────────────

// FLOW: fetchWithTimeout imported from @/lib/fetch-with-timeout (shared util).
// See that file for explanation of why AbortSignal.timeout() is unreliable in Next.js.

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
  timeoutMs: number = 600_000, // 10 min default — building models need extended generation time
  maxRetries: number = 3, // INTENT: Callers like decomposition pass 1 to fail fast → Gemini fallback
  /** Optional base64-encoded image to include as multimodal content before the text prompt */
  imageBase64?: string,
  /** Optional base64-encoded SVG of previous render — for visual comparison feedback loop */
  renderedSvgBase64?: string,
): Promise<{
  text: string
  tokensIn: number
  tokensOut: number
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured")

  const makeRequest = async (model: ClaudeModelId) => {
    // INTENT: Build multimodal content array when images are provided.
    // When both imageBase64 (hero) and renderedSvgBase64 (previous render) exist,
    // send both for side-by-side comparison so Claude can see what it produced vs target.
    type ContentBlock = { type: string; source?: { type: string; media_type: string; data: string }; text?: string }
    let userContent: string | ContentBlock[]

    if (imageBase64 && renderedSvgBase64) {
      // INTENT: Visual feedback loop — show Claude the target AND its previous output
      userContent = [
        {
          type: "image" as const,
          source: { type: "base64" as const, media_type: "image/png", data: imageBase64 },
        },
        {
          type: "image" as const,
          source: { type: "base64" as const, media_type: "image/svg+xml", data: renderedSvgBase64 },
        },
        {
          type: "text" as const,
          text: "Image 1 is the TARGET product you must model. Image 2 is what your previous code produced.\nCompare them carefully — identify SPECIFIC geometric differences (wrong shape primitives, missing features, wrong proportions).\nFix your code so the output matches Image 1.\n\n" + userPrompt,
        },
      ]
    } else if (imageBase64) {
      userContent = [
        {
          type: "image" as const,
          source: { type: "base64" as const, media_type: "image/png", data: imageBase64 },
        },
        {
          type: "text" as const,
          text: "CRITICAL: The image above is the product you must model. Your primary goal is to produce CadQuery code whose 3D shape closely matches the proportions, silhouette, and features visible in this image. Study it carefully — every major geometric feature you see must appear in your model.\n\n" + userPrompt,
        },
      ]
    } else {
      userContent = userPrompt
    }

    const response = await fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        }),
      },
      timeoutMs,
    )

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

  // INTENT: Retry on transient API errors (rate limit, overloaded), then throw.
  // DECISION: No Haiku fallback — Haiku produces unusable CadQuery code that wastes
  // Modal execution time and (before the res.success fix) got silently marked as "generated".
  // Better to throw and let client-side retry handle it after rate limits cool down.
  return await withRetry(() => makeRequest(modelId), {
    maxRetries,
    baseDelay: 4000,
    maxDelay: 30000,
    shouldRetry: (error) => {
      const msg = error.message
      // INTENT: Only retry on rate limits / overloaded — these are transient and worth waiting for.
      // TRIED: Retrying on 500/502/503 (commit d2b72fa8) — burns timeout budget retrying
      // persistent API errors instead of failing fast to fallback. Reverted.
      return msg.includes("429") || msg.includes("529") || msg.includes("overloaded")
    },
  })
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
  modelId: string = "gemini-3.1-flash-lite-preview",
): Promise<{
  text: string
  sources: Array<{ uri: string; title: string }>
  tokensIn: number
  tokensOut: number
}> {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim()
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured")

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`

  const response = await fetchWithTimeout(
    url,
    {
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
    },
    60_000,
  )

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

// ─── Gemini API Call (plain text, no search grounding) ───────────────

/**
 * Calls Gemini for plain text generation (no search grounding).
 *
 * @description Used as a fallback when Claude is unavailable (spend limit,
 * rate limit). Returns the same shape as `callClaude` for drop-in use.
 *
 * @param systemPrompt - System-level instructions
 * @param userPrompt - User message
 * @param modelId - Gemini model to use
 * @param maxTokens - Maximum output tokens
 * @param timeoutMs - Request timeout in milliseconds
 * @returns Response text and token counts
 */
async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  modelId: string = "gemini-3.1-pro-preview",
  maxTokens: number = 8192,
  timeoutMs: number = 120_000,
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim()
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured")

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.2,
        },
      }),
    },
    timeoutMs,
  )

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

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  modelId: string = "gpt-5.3-instant",
  maxTokens: number = 8192,
  timeoutMs: number = 120_000,
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured")

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: maxTokens,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    },
    timeoutMs,
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`OpenAI API error (${response.status}): ${errText.slice(0, 300)}`)
  }

  const data = await response.json()
  const text: string = data.choices?.[0]?.message?.content ?? ""

  return {
    text,
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
  }
}

async function callTogether(
  systemPrompt: string,
  userPrompt: string,
  modelId: string = "Qwen/Qwen3.5-397B-A17B",
  maxTokens: number = 8192,
  timeoutMs: number = 120_000,
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const apiKey = process.env.TOGETHER_API_KEY?.trim()
  if (!apiKey) throw new Error("TOGETHER_API_KEY not configured")

  const response = await fetchWithTimeout(
    "https://api.together.xyz/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: maxTokens,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    },
    timeoutMs,
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Together API error (${response.status}): ${errText.slice(0, 300)}`)
  }

  const data = await response.json()
  const text: string = data.choices?.[0]?.message?.content ?? ""

  return {
    text,
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
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
    console.info("[THE-FORGE] THINGIVERSE_API_TOKEN not set, skipping CAD model search")
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
      console.warn(`[THE-FORGE] Thingiverse API error (${response.status})`)
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
      "[THE-FORGE] Thingiverse search failed:",
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
/** Base URL for unified CAD API (single Modal web endpoint). */
function getModalCadBaseUrl(): string {
  const url = process.env.MODAL_CAD_ENDPOINT_URL
  if (!url) throw new Error("MODAL_CAD_ENDPOINT_URL not configured")
  return url.replace(/\/$/, "")
}

async function executeOnModal(code: string): Promise<ModalResponse> {
  const response = await fetch(`${getModalCadBaseUrl()}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      module_id: "cad-lab-v3",
      material_density: 1240,
    }),
    signal: AbortSignal.timeout(600_000), // 10 min — building models need extended execution time
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Modal error (${response.status}): ${errText.slice(0, 300)}`)
  }

  return (await response.json()) as ModalResponse
}

/** Mashup Modal response shape */
interface MashupModalResponse {
  error?: string | null
  step?: string | null
  stl?: string | null
  svg_iso?: string | null
  analysis?: unknown
}

/**
 * Calls the Modal mashup endpoint with source STEPs (base64) and mashup CadQuery code.
 *
 * @param sources - Array of { name, step_b64 }
 * @param mashupCode - CadQuery code that uses SOURCE_DIR and importStep()
 * @param materialDensity - kg/m³
 * @returns Modal response with step/stl/svg_iso/analysis
 */
async function executeMashupOnModal(
  sources: Array<{ name: string; step_b64: string }>,
  mashupCode: string,
  materialDensity: number = 1240,
): Promise<MashupModalResponse> {
  const response = await fetch(`${getModalCadBaseUrl()}/mashup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sources,
      mashup_code: mashupCode,
      module_id: "mashup",
      material_density: materialDensity,
    }),
    signal: AbortSignal.timeout(600_000),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Modal mashup error (${response.status}): ${errText.slice(0, 300)}`)
  }

  return (await response.json()) as MashupModalResponse
}

// ─── Code Extraction ─────────────────────────────────────────────────

/**
 * Extracts Python code from a Claude response that may contain markdown fences.
 *
 * @param text - Raw Claude response text
 * @returns Extracted Python code
 */
function extractCode(text: string): string {
  // INTENT: Claude sometimes outputs explanation before/after the real code block.
  // Use regex matchAll to find ALL fenced blocks, take the LAST python/cadquery one.
  const pythonBlocks = [...text.matchAll(/```(?:python|cadquery)\s*\n([\s\S]*?)```/g)]
  if (pythonBlocks.length > 0) {
    return pythonBlocks[pythonBlocks.length - 1][1].trim()
  }

  // Fallback: any fenced block (take the last one)
  const anyBlocks = [...text.matchAll(/```\s*\n([\s\S]*?)```/g)]
  if (anyBlocks.length > 0) {
    return anyBlocks[anyBlocks.length - 1][1].trim()
  }

  // Final fallback: raw text
  return text.trim()
}

/**
 * Extracts explicit assumption lines for user-facing confidence reporting.
 */
function extractAssumptions(
  interfaceDefinition: string,
  code: string,
): string[] {
  const assumptionLines = new Set<string>()

  const patterns = [/RESOLVED:\s*(.+)/gi, /ASSUMPTION:\s*(.+)/gi, /ASSUME(?:D)?\s*[:\-]\s*(.+)/gi]
  const sourceText = `${interfaceDefinition}\n${code}`
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(sourceText)) !== null) {
      const value = match[1]?.trim()
      if (value) assumptionLines.add(value)
    }
  }

  return Array.from(assumptionLines).slice(0, 12)
}

// ─── Step 1: Research (exported) ─────────────────────────────────────

function formatDesignBriefForPrompt(
  designBrief?: CadLabDesignBrief,
  assumptionNotes?: string,
): string {
  if (!designBrief && !assumptionNotes?.trim()) return ""

  const lines = [
    "DESIGN INTAKE CONSTRAINTS (prioritise these when selecting references and dimensions):",
    designBrief?.useCase ? `- Use case: ${designBrief.useCase}` : null,
    designBrief?.targetProcess ? `- Target process: ${designBrief.targetProcess}` : null,
    designBrief?.targetMaterial ? `- Target material: ${designBrief.targetMaterial}` : null,
    designBrief?.toleranceTarget ? `- Tolerance target: ${designBrief.toleranceTarget}` : null,
    designBrief?.quantityTarget ? `- Quantity target: ${designBrief.quantityTarget}` : null,
    designBrief?.complianceNotes ? `- Compliance/certification: ${designBrief.complianceNotes}` : null,
    assumptionNotes?.trim() ? `- User assumptions: ${assumptionNotes.trim()}` : null,
  ].filter(Boolean)

  return `\n\n${lines.join("\n")}`
}

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
  options?: {
    designBrief?: CadLabDesignBrief
    assumptionNotes?: string
  },
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
    console.info("[THE-FORGE] Step 1: Research — web search + CAD model search...")

    // 1. Run Gemini + Google Search and Thingiverse in parallel
    const intakeContext = formatDesignBriefForPrompt(options?.designBrief, options?.assumptionNotes)

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

Do NOT guess dimensions. Only include measurements you found from real sources.${intakeContext}`,
      ),
      searchCadModels(description),
    ])

    const webSpecs = webResult.status === "fulfilled" ? webResult.value.text : ""
    const webSources = webResult.status === "fulfilled" ? webResult.value.sources : []
    const cadModels = cadResult.status === "fulfilled" ? cadResult.value : []

    // Log Gemini/Thingiverse failures so they aren't silent
    if (webResult.status === "rejected") {
      console.error("[THE-FORGE] Step 1: Gemini web search failed:", webResult.reason)
    }
    if (cadResult.status === "rejected") {
      console.error("[THE-FORGE] Step 1: Thingiverse CAD search failed:", cadResult.reason)
    }

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
    const referenceModels = cadModels.map((m) => ({ name: m.name, url: m.url }))

    // 3. Domain-specific synthesis: detect domain from description, then use domain prompt
    // INTENT: Claude synthesis is wrapped separately so Gemini results are preserved on failure
    let report: string
    let synthesisSucceeded = true
    let matchedStandardCodes: string[] = []
    let detectedIndustryDomain: string | undefined
    let totalStandardsMatched = 0
    let engineeringDataMeta: {
      materialsApplied: string[]; materialFamilies: string[];
      hardwareItemCount: number; processesApplied: string[];
      supplierTechniques: number; totalDataPoints: number;
    } | undefined
    let synthesisModel = "claude-opus-4-6"
    try {
      const domain = await detectDomainFromProductDescription(description)

      // Retrieve relevant design standards (summaries only at research stage)
      const industryDomain = detectIndustryDomain(description)
      detectedIndustryDomain = industryDomain
      let standardsSection = ""
      try {
        const standardsResult = await retrieveStandardsForPrompt(
          industryDomain, description, [], [], 20_000, "summary",
        )
        if (standardsResult.content) {
          standardsSection = `\n\n${standardsResult.content}`
          matchedStandardCodes = standardsResult.standardCodes
          totalStandardsMatched = standardsResult.totalMatched
          console.info(`[THE-FORGE] Step 1: Injected ${standardsResult.standardCodes.length} standard summaries (${standardsResult.tokensUsed} tokens, domain: ${industryDomain})`)
        } else if (industryDomain !== "general") {
          // Auto-learn: no standards found for this domain — generate them
          console.info(`[THE-FORGE] Step 1: No standards for domain ${industryDomain} — auto-learning...`)
          const newStandards = await generateAndStoreStandards(industryDomain, description, matchedStandardCodes)
          if (newStandards.length > 0) {
            const retryResult = await retrieveStandardsForPrompt(
              industryDomain, description, [], [], 20_000, "summary",
            )
            if (retryResult.content) {
              standardsSection = `\n\n${retryResult.content}`
              matchedStandardCodes = retryResult.standardCodes
              totalStandardsMatched = retryResult.totalMatched
              console.info(`[THE-FORGE] Step 1: Auto-learned ${newStandards.length} standards, injected ${retryResult.standardCodes.length}`)
            }
          }
        }
      } catch (stdErr) {
        console.warn("[THE-FORGE] Step 1: Standards retrieval failed (non-fatal):", stdErr instanceof Error ? stdErr.message : stdErr)
      }

      // Retrieve engineering data metadata for UI transparency
      try {
        const engPreview = await retrieveEngineeringDataForPrompt(description)
        const appliedDataPoints = matchedStandardCodes.length + engPreview.materialsCount + engPreview.hardwareCount + engPreview.processesCount
        engineeringDataMeta = {
          materialsApplied: engPreview.materialCodes,
          materialFamilies: engPreview.materialFamilies,
          hardwareItemCount: engPreview.hardwareCount,
          processesApplied: engPreview.processNames,
          supplierTechniques: 27,
          totalDataPoints: appliedDataPoints,
        }
        console.info(`[THE-FORGE] Step 1: Engineering data preview — ${engPreview.materialCodes.length} materials, ${engPreview.processNames.length} processes`)
      } catch (engErr) {
        console.warn("[THE-FORGE] Step 1: Engineering data preview failed (non-fatal):", engErr instanceof Error ? engErr.message : engErr)
      }

      const synthesisPrompt = getResearchSynthesisPrompt(domain)
      const synthesisUserPrompt = `Product to research: ${description}\n\n${rawContext}${standardsSection}`

      // DECISION: Fallback chain for synthesis — Claude → OpenAI → Gemini.
      // If Anthropic credits are exhausted, fall through to alternatives.
      try {
        console.info("[THE-FORGE] Step 1: Synthesizing report with Claude (domain: %s)...", domain)
        const claudeResult = await callClaude(synthesisPrompt, synthesisUserPrompt)
        report = claudeResult.text
      } catch (claudeErr) {
        const claudeMsg = claudeErr instanceof Error ? claudeErr.message : String(claudeErr)
        console.warn("[THE-FORGE] Step 1: Claude synthesis failed, trying OpenAI fallback:", claudeMsg.slice(0, 200))
        try {
          synthesisModel = "gpt-5.3-instant"
          const openaiResult = await callOpenAI(synthesisPrompt, synthesisUserPrompt, "gpt-5.3-instant", 8192, 120_000)
          report = openaiResult.text
          console.info("[THE-FORGE] Step 1: OpenAI synthesis succeeded (fallback)")
        } catch (openaiErr) {
          const openaiMsg = openaiErr instanceof Error ? openaiErr.message : String(openaiErr)
          console.warn("[THE-FORGE] Step 1: OpenAI synthesis failed, trying Gemini fallback:", openaiMsg.slice(0, 200))
          try {
            synthesisModel = "gemini-3.1-pro-preview"
            const geminiResult = await callGemini(synthesisPrompt, synthesisUserPrompt, "gemini-3.1-pro-preview", 8192, 120_000)
            report = geminiResult.text
            console.info("[THE-FORGE] Step 1: Gemini synthesis succeeded (fallback)")
          } catch (geminiErr) {
            console.error("[THE-FORGE] Step 1: ALL synthesis models failed:", geminiErr instanceof Error ? geminiErr.message : String(geminiErr))
            report = "Research sources found but report synthesis failed — tap Retry to try again."
            synthesisSucceeded = false
          }
        }
      }
    } catch (synthesisError) {
      console.error(
        "[THE-FORGE] Step 1: Claude synthesis failed:",
        synthesisError instanceof Error ? synthesisError.message : synthesisError,
      )
      report = "Research sources found but report synthesis failed — tap Retry to try again."
      synthesisSucceeded = false
    }

    console.info(
      `[THE-FORGE] Step 1 complete: ${webSources.length} web sources, ${referenceModels.length} CAD refs, synthesis=${synthesisSucceeded ? "ok" : "failed"}, ${Date.now() - start}ms`,
    )

    return {
      success: synthesisSucceeded,
      ...(!synthesisSucceeded && { error: "Claude synthesis failed — sources were still collected" }),
      report,
      sources: webSources,
      referenceModels,
      researchTime: Date.now() - start,
      designBrief: options?.designBrief,
      assumptionNotes: options?.assumptionNotes,
      modelUsed: synthesisModel,
      standardCodes: matchedStandardCodes,
      industryDomain: detectedIndustryDomain,
      totalStandardsMatched,
      engineeringData: engineeringDataMeta,
    }
  } catch (error) {
    console.error("[THE-FORGE] Step 1 failed:", error instanceof Error ? error.message : error)
    return {
      success: false,
      error: sanitizeErrorMessage(error),
      report: "",
      sources: [],
      referenceModels: [],
      researchTime: Date.now() - start,
      designBrief: options?.designBrief,
      assumptionNotes: options?.assumptionNotes,
      standardCodes: [],
      industryDomain: undefined,
      totalStandardsMatched: 0,
      engineeringData: undefined,
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
  checkpointContext?: string,
  cachedTemplateMatch?: TemplateMatchResult,
): Promise<CadLabInterfaceResult & { templateMatchResult?: TemplateMatchResult }> {
  // AUTH: Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" } as unknown as CadLabInterfaceResult

  // SECURITY: Rate limit
  const rateLimitError = await checkRateLimit("aiCadLab", `ai:${user.id}`)
  if (rateLimitError) return { error: rateLimitError } as unknown as CadLabInterfaceResult

  const start = Date.now()

  try {
    console.info("[THE-FORGE] Step 2: Generating interface definition...")

    // Look up user's sector and fetch filtered library
    const sector = await lookupUserSector(supabase, user.id)
    const librarySummary = await fetchLibrarySummary(sector)
    const librarySection = librarySummary.length > 0
      ? `\n\nAVAILABLE COMPONENT LIBRARY (${librarySummary.length} pre-built parts):\n` +
        librarySummary.map((c) => `  - ${c.slug} (${c.name}) [${c.category}]`).join("\n") +
        "\n\nWhen a product component matches a library slug, mark it as \"LIBRARY: slug_name\" in the Source column."
      : ""

    // FLOW: Match step_templates for prompt enrichment — tells Claude what proven geometry exists
    // QW3: Use cached template match if available, avoiding expensive DB + semantic scoring
    let templateMatch: TemplateMatchResult
    if (cachedTemplateMatch) {
      templateMatch = cachedTemplateMatch
      console.info("[THE-FORGE] Step 2: Using cached template match result")
    } else {
      const descWords = description.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
      templateMatch = await matchTemplatesForModule(
        description,
        researchReport.slice(0, 200),
        descWords.slice(0, 10),
        description,
      )
    }
    // SECURITY: Sanitise template metadata before prompt injection to prevent indirect prompt injection
    const templateSection = templateMatch.topMatches.length > 0
      ? "\n\nMATCHED STEP TEMPLATES (proven reference geometry from template library):\n" +
        (await Promise.all(templateMatch.topMatches.map(async (m) =>
          `  - ${await sanitiseForPrompt(m.name)} [${await sanitiseForPrompt(m.category)}${m.subcategory ? `/${await sanitiseForPrompt(m.subcategory)}` : ""}] (score: ${m.score})`
        ))).join("\n") +
        "\n\nThese templates represent real-world parts with accurate geometry. When planning components, consider using dimensions and proportions from these references where relevant."
      : ""

    const systemPrompt = `You are an engineering planner for parametric CAD models. You are NOT writing code — this is pure engineering planning.

Your job is to produce a text-only interface definition that will be used to generate CadQuery Python code. Every dimension must be a specific number in millimetres. The numbers must sum correctly — show ALL arithmetic step-by-step.

CRITICAL SCALE PRESERVATION:
- ALWAYS use the EXACT dimensions from the research report — never scale them down
- If research mentions "6m container" or "2.4m height", use 6000mm and 2400mm in your calculations
- Large systems (containers, buildings, vehicles) should be modeled at FULL SIZE, not as small components
- Example scales: shipping container = 6000×2400×2600mm, not 200×150×100mm
- When planning a MODULE of a large system, still respect the overall system scale

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
| Component        | Qty | Dimensions (mm)     | Position (x,y,z)  | Material   | Source         | Notes              |
|------------------|-----|---------------------|--------------------|-----------:|----------------|--------------------|
One row per distinct feature or sub-part of the product. Position is the centre point.
Material: primary material (PLA, aluminium, steel, etc.) — gives DFM context to code generation.
Source: "LIBRARY: slug_name" if a library component matches, otherwise "CUSTOM".
Include enough rows to capture the product's geometry — typically 3-10 features depending on complexity.

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
- Your output must be complete and ready for code generation with zero follow-up needed${librarySection}${templateSection}`

    const userPrompt = `Product: ${description}

Research Report (use these dimensions — do not invent new ones):
${researchReport}

SCALE GUIDANCE:
Extract the real-world scale from the research report and preserve it exactly:
- If this is a shipping container, building, vehicle, or large system: use FULL SCALE dimensions in millimeters
- Convert: 6m = 6000mm, 2.4m = 2400mm, etc.
- Even if modeling a MODULE of a large system, respect the overall system proportions
- Large structural components should remain large, not be scaled to desktop size
${checkpointContext ?? ""}
Generate the complete interface definition following the exact 4-section format.`

    const { text, tokensIn, tokensOut } = await callClaude(
      systemPrompt,
      userPrompt,
      modelId,
      8192,
    )

    console.info(`[THE-FORGE] Step 2 complete: ${Date.now() - start}ms`)

    // ── Deterministic interface validation (#1, #6, B1) ──
    const interfaceWarnings: PreExecValidationResult[] = [
      ...verifyInterfaceArithmetic(text),
      ...trackDimensionProvenance(researchReport, text),
      ...validateInterfaceStructure(text),
      ...detectDimensionConflicts(researchReport),
      ...checkInterfaceCompleteness(text),
    ]
    if (interfaceWarnings.length > 0) {
      console.info(`[THE-FORGE] Step 2: ${interfaceWarnings.length} interface warning(s):`,
        interfaceWarnings.map((w) => `${w.severity}/${w.ruleId}: ${w.message}`))
    }

    return {
      success: true,
      interfaceDefinition: text,
      generationTime: Date.now() - start,
      tokensIn,
      tokensOut,
      interfaceWarnings: interfaceWarnings.length > 0 ? interfaceWarnings : undefined,
      // QW3: Return template match result for caching on the module
      templateMatchResult: templateMatch,
    }
  } catch (error) {
    console.error("[THE-FORGE] Step 2 failed:", error instanceof Error ? error.message : error)
      return {
        success: false,
      error: sanitizeErrorMessage(error),
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

// DECISION: When a hero image is provided, use a compact system prompt that keeps the vision
// signal dominant. The full 500-line CAD_INSTRUCTIONS contains methodology examples (Nespresso
// capsules, brine systems, drones) that prime Claude to think in those shapes, not the image.
function buildImageFocusedSystemPrompt(libraryPromptSection: string, domainHints?: string, standardsSection?: string): string {
  return `SHAPE FIDELITY IS YOUR #1 PRIORITY:
- The attached product image is your PRIMARY reference — study it before writing ANY code
- Your model MUST match the overall silhouette, proportions, and every major visible feature
- Break the image down: identify the main body form, then each distinct feature (dome, cylinder, panel, limb, slot, etc.)
- Build each visible feature as a separate make_*() function, then assemble to match the image layout
- If the image shows a cylindrical body with a domed top, your code MUST produce a cylinder + dome — not a box
- Geometric accuracy takes priority over manufacturing details
- When in doubt, match what you SEE in the image, not what you assume

${libraryPromptSection}

EXECUTION ENVIRONMENT RULES:
- The final variable MUST be called "result" and be a cq.Workplane or cq.Compound object
- Do NOT include any cq.exporters calls — the execution environment handles export
- Do NOT include any print() statements
- Do NOT import os, sys, or use open(). Only import cadquery and math.
- After assembling "result", optionally create "result_exploded" (try/except, best-effort).
- Output ONLY the Python code inside a single \`\`\`python code fence. No explanations before or after.

SELF-CONTAINED CODE (CRITICAL — violating this crashes execution):
- Your script MUST be executable with no unresolved names.
- You MAY call component-library functions that appear in the provided "COMPONENT LIBRARY" list.
- Any non-library helper function you call MUST be defined with \`def\` in YOUR script.
- If a needed part is not in the library, build it with your own make_*() function using cq.Workplane primitives (.box(), .cylinder(), .extrude(), .cut(), etc.).
- PRE-FLIGHT CHECK: Before outputting code, mentally trace every function call and verify it is either (a) in the provided library list or (b) defined in your script.

ASSEMBLY STRATEGY FOR COMPLEX MODELS:
- For models with 20+ components, use cq.Assembly() at the top level instead of chaining .union() calls.
- .union() chains on large models are O(n²) and WILL timeout. Use .union() only within small sub-groups (max 10 unions per sub-group).
- The final line should be: result = assy.toCompound()
- For simpler models (<15 components), .union() chain is fine.${domainHints ? `\n\n${domainHints}` : ""}${standardsSection ? `\n\n${standardsSection}` : ""}`
}

function buildFullSystemPrompt(libraryPromptSection: string, domainHints?: string, standardsSection?: string): string {
  return `SHAPE FIDELITY IS YOUR #1 PRIORITY:
- Study the provided product image carefully before writing any code
- Your model MUST match the overall silhouette, proportions, and major features visible in the image
- Break the shape down visually: identify the main body form, then each distinct feature (dome, cylinder, panel, limb, etc.)
- Build each visible feature as a separate make_*() function, then assemble to match the image layout
- If the image shows a cylindrical body with a domed top, your code must produce a cylinder + dome — not a box
- Geometric accuracy takes priority over manufacturing details

You are generating a complete CadQuery parametric CAD model. Follow the methodology in this document EXACTLY:

${CAD_INSTRUCTIONS}

${libraryPromptSection}

EXECUTION ENVIRONMENT RULES:
- The final variable MUST be called "result" and be a cq.Workplane or cq.Compound object
- Do NOT include any cq.exporters calls — the execution environment handles export
- Do NOT include any print() statements
- Do NOT import os, sys, or use open(). Only import cadquery and math.
- After assembling "result", optionally create "result_exploded" — a cq.Workplane that shows major sub-features translated apart along Z by 1.5× their height for visual separation. This is best-effort: if the model is a single continuous solid (e.g., one casting or 3D print), skip it. Always wrap result_exploded creation in try/except so it never blocks the main result.
- Output ONLY the Python code inside a single \`\`\`python code fence. No explanations before or after.

SELF-CONTAINED CODE (CRITICAL — violating this crashes execution):
- Your script MUST be executable with no unresolved names.
- You MAY call component-library functions that appear in the provided "COMPONENT LIBRARY" list.
- Any non-library helper function you call MUST be defined with \`def\` in YOUR script.
- If a needed part is not in the library, build it with your own make_*() function using cq.Workplane primitives (.box(), .cylinder(), .extrude(), .cut(), etc.).
- PRE-FLIGHT CHECK: Before outputting code, mentally trace every function call and verify it is either (a) in the provided library list or (b) defined in your script.

COMPONENT LIBRARY PRIORITY (CRITICAL):
- PREFER library components over custom geometry — they are pre-validated and produce correct CadQuery.
- When a library function exists for a component type, USE IT rather than building from scratch.
- Library parts include proper features that custom geometry typically omits.
- Check the COMPONENT LIBRARY list BEFORE writing any make_*() function.

Z-COORDINATE / VERTICAL POSITION SANITY (prevents doubled heights):
- When positioning components vertically, use EXACTLY ONE reference frame. Either:
  (a) All z-offsets are ABSOLUTE from z=0 (ground level), OR
  (b) All z-offsets are RELATIVE to a named base variable
- NEVER add a base_z that already includes wall_height and THEN add wall_height again. This doubles the height.
- Example of the BUG: roof_z = foundation_h + floor_h + wall_h  ... then later ...  .transformed(offset=(0, 0, roof_z + wall_h + rise/2))  ← wall_h is counted TWICE
- CORRECT pattern: define roof_base_z = foundation_h + floor_h + wall_h ONCE, then position roof at roof_base_z + rise/2
- VERIFY: After writing all z-positions, check that the highest point of the model matches the expected total height. If a house should be ~6000mm tall, the roof peak must be near 6000mm — not 9000mm or 12000mm.

ASSEMBLY STRATEGY FOR COMPLEX MODELS:
- For models with 20+ components (buildings, vehicles, complex machines), use cq.Assembly() at the top level instead of chaining .union() calls.
- .union() chains on large models are O(n²) and WILL timeout. Use .union() only within small sub-groups (max 10 unions per sub-group).
- Add each sub-group to the Assembly using .add() with a cq.Location for spatial placement.
- The final line should be: result = assy.toCompound()
- For simpler models (<15 components), the .union() chain pattern is fine.${domainHints ? `\n\n${domainHints}` : ""}${standardsSection ? `\n\n${standardsSection}` : ""}`
}

export async function generateCadLabModel(
  description: string,
  researchReport: string,
  interfaceDefinition: string,
  modelId: ClaudeModelId = "claude-opus-4-6",
  checkpointContext?: string,
  interfaceWarnings?: PreExecValidationResult[],
  cachedTemplateMatch?: TemplateMatchResult,
  designBrief?: CadLabDesignBrief,
  domainHint?: CadLabDomain,
  blueprintImageUrl?: string,
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
    console.info("[THE-FORGE] Step 3: Generating complete CadQuery code with Claude...")

    // H5/J1: Use cached domain hint if available, otherwise detect (best-effort)
    let domainHints = ""
    try {
      const domain = domainHint ?? await detectDomainFromResearchReport(researchReport)
      domainHints = getCodeGenDomainHints(domain)
      if (domainHints) console.info(`[THE-FORGE] Step 3: Domain detected: ${domain}${domainHint ? " (cached)" : ""}, injecting code gen hints`)
    } catch {
      // Silent — domain hints are best-effort enrichment
    }

    // ── Seed-geometry routing: check for matching step_templates ──
    // INTENT: Strong matches route to the mashup endpoint with real STEP geometry
    // as a starting point, producing better results than scratch generation.
    // #10: Also capture referenceTemplates for prompt injection on the scratch path.
    let referenceTemplatesForPrompt: TemplateMatch[] = []
    try {
      // QW3: Use cached template match if available
      let seedMatch: TemplateMatchResult
      if (cachedTemplateMatch) {
        seedMatch = cachedTemplateMatch
        console.info("[THE-FORGE] Step 3: Using cached template match result")
      } else {
        const moduleWords = description.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
        seedMatch = await matchTemplatesForModule(
          description,
          interfaceDefinition.slice(0, 200),
          moduleWords.slice(0, 10),
          description,
        )
      }
      // Capture reference templates regardless of seed routing
      referenceTemplatesForPrompt = seedMatch.referenceTemplates ?? []
      if (seedMatch.seedTemplate) {
        console.info(
          `[THE-FORGE] Step 3: Seed template found: ${seedMatch.seedTemplate.slug} (score: ${seedMatch.seedTemplate.score})`,
        )
        const seedResult = await generateCadLabModelWithSeed(
          description, researchReport, interfaceDefinition,
          seedMatch.seedTemplate, modelId, checkpointContext, designBrief, domainHint,
        )
        if (seedResult.success) return seedResult
        // FLOW: Seed path failed — propagate consumed tokens, then fall through to scratch
        totalTokensIn += seedResult.tokensIn ?? 0
        totalTokensOut += seedResult.tokensOut ?? 0
        console.warn("[THE-FORGE] Step 3: Seed path failed, falling back to scratch:", seedResult.error)
      }
    } catch (seedErr) {
      // Silent fallback — seed matching is best-effort
      console.warn("[THE-FORGE] Step 3: Seed matching error, continuing with scratch:", seedErr instanceof Error ? seedErr.message : seedErr)
    }

    // Look up user's sector and fetch filtered library for prompt injection
    const sector = await lookupUserSector(supabase, user.id)
    const librarySummary = await fetchLibrarySummary(sector)
    const librarySlugs = librarySummary.map((c) => c.slug)
    const libraryPromptSection = await formatLibraryForPrompt(librarySummary)

    // ── #10: Build reference template dimension section for prompt injection ──
    let referenceSection = ""
    if (referenceTemplatesForPrompt.length > 0) {
      const refLines = await Promise.all(
        referenceTemplatesForPrompt.slice(0, 5).map(async (t) => {
          const safeName = await sanitiseForPrompt(t.name)
          const safeCat = await sanitiseForPrompt(t.category)
          const safeDesc = t.description ? await sanitiseForPrompt(t.description.slice(0, 120)) : ""
          return `- ${safeName} [${safeCat}] (match: ${t.score.toFixed(2)})${safeDesc ? `: ${safeDesc}` : ""}`
        }),
      )
      referenceSection = `\n\n=== REFERENCE DIMENSIONS (from similar proven templates — use as cross-check) ===
${refLines.join("\n")}
Use these as dimensional cross-references. If your dimensions differ significantly, verify.`
    }

    // H4: Build manufacturing constraints section from design brief
    const manufacturingConstraints = designBrief ? formatDesignBriefForPrompt(designBrief) : ""

    const baseUserPrompt = `Build a parametric CadQuery model that matches the provided product image.

=== PRODUCT ===
${description}

=== RESEARCH DIMENSIONS (use real measurements — do NOT invent) ===
${researchReport}

=== GEOMETRY DESCRIPTION ===
${interfaceDefinition}
${referenceSection}
${checkpointContext ?? ""}${manufacturingConstraints ? `\n\n=== MANUFACTURING CONSTRAINTS ===\n${manufacturingConstraints}\n` : ""}
Generate CadQuery Python code:
1. "import cadquery as cq" and "import math" (if needed)
2. Study the image — identify every distinct geometric feature
3. Create a make_*() function for each major visual feature
4. Use real dimensions from the research — do NOT scale down large objects
5. Assemble all features into one "result", positioned to match the image
6. Optionally create "result_exploded" (try/except)

Resolve any ambiguities with engineering judgment — do not ask for clarification.`

    // ── A3: Append interface warnings to first-attempt prompt ──
    let interfaceIssueSection = ""
    if (interfaceWarnings && interfaceWarnings.length > 0) {
      const ifaceIssues = interfaceWarnings
        .filter((w) => w.severity !== "info")
        .map((w) => `- [${w.severity}] ${w.ruleId}: ${w.message}${w.repairHint ? `\n  Fix: ${w.repairHint}` : ""}`)
        .join("\n")
      if (ifaceIssues) {
        interfaceIssueSection = `\n\n=== INTERFACE ISSUES (address these in your code) ===\n${ifaceIssues}`
      }
    }

    // ── Fetch blueprint image for multimodal prompt (best-effort) ──
    // SECURITY: Only fetch from our own Supabase storage to prevent SSRF
    let blueprintImageBase64: string | undefined
    if (blueprintImageUrl) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
      const isAllowedOrigin = supabaseUrl && blueprintImageUrl.startsWith(supabaseUrl)
      if (!isAllowedOrigin) {
        console.warn("[THE-FORGE] Step 3: Blueprint image URL rejected — not from Supabase storage:", blueprintImageUrl.slice(0, 80))
      } else {
        try {
          const imgRes = await fetch(blueprintImageUrl, { signal: AbortSignal.timeout(10_000) })
          if (imgRes.ok) {
            const imgBuffer = Buffer.from(await imgRes.arrayBuffer())
            // SECURITY: Cap image size at 10MB to prevent memory abuse
            if (imgBuffer.length > 10 * 1024 * 1024) {
              console.warn("[THE-FORGE] Step 3: Blueprint image too large, skipping:", Math.round(imgBuffer.length / 1024), "KB")
            } else {
              blueprintImageBase64 = imgBuffer.toString("base64")
              console.info(`[THE-FORGE] Step 3: Blueprint image fetched (${Math.round(imgBuffer.length / 1024)}KB)`)
            }
          }
        } catch (imgErr) {
          // Silent — blueprint image is best-effort enrichment
          console.warn("[THE-FORGE] Step 3: Blueprint image fetch failed:", imgErr instanceof Error ? imgErr.message : imgErr)
        }
      }
    }

    // Retrieve full design standards for code generation (up to 200K tokens)
    let codeGenStandardsSection = ""
    try {
      const codeGenIndustryDomain = detectIndustryDomain(description)
      const codeGenStandards = await retrieveStandardsForPrompt(
        codeGenIndustryDomain, description, [], [], 200_000, "full",
      )
      if (codeGenStandards.content) {
        codeGenStandardsSection = codeGenStandards.content
        console.info(`[THE-FORGE] Step 3: Injected ${codeGenStandards.standardCodes.length} full standards (${codeGenStandards.tokensUsed} tokens)`)
      }
    } catch (stdErr) {
      console.warn("[THE-FORGE] Step 3: Standards retrieval failed (non-fatal):", stdErr instanceof Error ? stdErr.message : stdErr)
    }

    // Retrieve material properties, hardware specs, and process capabilities
    try {
      const engData = await retrieveEngineeringDataForPrompt(description)
      if (engData.content) {
        codeGenStandardsSection += (codeGenStandardsSection ? "\n\n" : "") + engData.content
        console.info(`[THE-FORGE] Step 3: Injected engineering data (${engData.materialsCount} materials, ${engData.hardwareCount} hardware, ${engData.processesCount} processes)`)
      }
    } catch (engErr) {
      console.warn("[THE-FORGE] Step 3: Engineering data retrieval failed (non-fatal):", engErr instanceof Error ? engErr.message : engErr)
    }

    if (!codeGenStandardsSection) {
      console.error("[THE-FORGE] Step 3: WARNING — no standards or engineering data available for this design")
    }

    // DECISION: Two system prompts — image-focused (compact, ~60 lines) vs full (with CAD_INSTRUCTIONS methodology).
    // When a hero image exists, the image IS the spec. The 500-line methodology examples (Nespresso capsules,
    // brine systems, drones) prime Claude to think in those shapes instead of the image. Stripping them lets
    // the vision signal dominate.
    const systemPrompt = blueprintImageBase64
      ? buildImageFocusedSystemPrompt(libraryPromptSection, domainHints, codeGenStandardsSection)
      : buildFullSystemPrompt(libraryPromptSection, domainHints, codeGenStandardsSection)

    // INTENT: Diagnostic logging to verify prompt sizes and image-based path selection
    console.info("[THE-FORGE] Prompt stats:", {
      hasImage: !!blueprintImageBase64,
      imageSizeKb: blueprintImageBase64 ? Math.round(blueprintImageBase64.length * 0.75 / 1024) : 0,
      systemPromptChars: systemPrompt.length,
      imageBasedPrompt: !!blueprintImageBase64,
    })

    // ── #7: Iterative repair loop ──
    // QW2: Opus gets 4 attempts (better at using repair feedback), others get 3
    const MAX_REPAIR_ATTEMPTS = modelId.includes("opus") ? 4 : 3
    const TOKEN_OUT_BUDGET = 200_000
    let finalCode = ""
    let assumptions: string[] = []
    let allPreExecResults: PreExecValidationResult[] = []
    let modalResult: ModalResponse | null = null
    let modalTime = 0
    let repairAttempts = 0
    let lastModalError: string | null = null
    // P2: Vision score captured in outer scope for return value
    let visionScoreResult: VisionScoreResult | null = null
    // B3: Track code hashes to detect divergence (same code generated twice = stuck)
    const seenCodeHashes = new Set<string>()

    for (let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS; attempt++) {
      repairAttempts = attempt

      // Token budget guard
      if (totalTokensOut > TOKEN_OUT_BUDGET) {
        console.warn(`[THE-FORGE] Step 3: Token budget exceeded (${totalTokensOut} > ${TOKEN_OUT_BUDGET}), stopping repair loop`)
        break
      }

      // ── Code generation ──
      let userPrompt: string
      if (attempt === 0) {
        userPrompt = baseUserPrompt + interfaceIssueSection
      } else {
        // Build repair prompt from previous failures
        const failureSummary = allPreExecResults
          .filter((r) => r.severity === "critical" || r.severity === "warning")
          .map((r) => `- [${r.severity}] ${r.ruleId}: ${r.message}${r.repairHint ? `\n  Fix: ${r.repairHint}` : ""}`)
          .join("\n")
        // F6: Categorize Modal error for targeted repair guidance
        const errorCategory = lastModalError ? categorizeModalError(lastModalError) : null
        const categorizedError = errorCategory
          ? `\n[${errorCategory.category}]: ${errorCategory.guidance}\nRaw error: ${lastModalError}`
          : lastModalError ? `\nModal execution error: ${lastModalError}` : ""
        const modalErrorSection = categorizedError
        // INTENT: When hero image + rendered SVG both exist, tell Claude to compare them visually
        const visualComparisonSection = (modalResult?.svg_iso && blueprintImageBase64)
          ? `\n\n=== VISUAL COMPARISON ===
Your previous code produced the SVG render shown as Image 2. Compare it to the hero image (Image 1).
Identify SPECIFIC geometric differences (wrong shape primitives, missing features, wrong proportions).
Fix the code to match the hero image more closely.`
          : ""
        userPrompt = `${baseUserPrompt}

=== REPAIR REQUIRED (attempt ${attempt + 1}/${MAX_REPAIR_ATTEMPTS}) ===
Previous code failed with ${allPreExecResults.filter((r) => r.severity !== "info").length} issue(s):
${failureSummary}${modalErrorSection}${visualComparisonSection}
Fix ONLY the listed issues. Previous code attached below.

\`\`\`python
${finalCode}
\`\`\``
        console.info(`[THE-FORGE] Step 3: Repair attempt ${attempt + 1}/${MAX_REPAIR_ATTEMPTS}`)
      }

      // INTENT: Send hero image on EVERY attempt (not just first) so Claude always has the visual reference.
      // On repair attempts, also send the rendered SVG from the previous attempt for side-by-side comparison.
      const prevRenderedSvg = (attempt > 0 && blueprintImageBase64 && modalResult?.svg_iso)
        ? modalResult.svg_iso
        : undefined
      const codeResult = await callClaude(systemPrompt, userPrompt, modelId, attempt === 0 ? 64000 : 32000, undefined, undefined, blueprintImageBase64, prevRenderedSvg)
      totalTokensIn += codeResult.tokensIn
      totalTokensOut += codeResult.tokensOut

      finalCode = extractCode(codeResult.text)

      // B3/H3: Divergence detection — if same code hash seen twice, the model is stuck
      const codeHash = createHash("sha256").update(finalCode).digest("hex")
      if (seenCodeHashes.has(codeHash)) {
        console.warn(`[THE-FORGE] Step 3: Divergence detected on attempt ${attempt + 1} — same code generated twice, breaking`)
        break
      }
      seenCodeHashes.add(codeHash)

      // INTENT: Guard against empty code — don't waste a Modal run on empty string
      if (!finalCode.trim()) {
        if (attempt < MAX_REPAIR_ATTEMPTS - 1) {
          lastModalError = "Code generation returned empty output"
          continue
        }
        return {
          success: false,
          error: "Code generation returned empty output after all attempts",
          generationTime: Date.now() - pipelineStart,
          tokensIn: totalTokensIn,
          tokensOut: totalTokensOut,
          modelUsed: modelId,
          repairAttempts: attempt,
        }
      }

      assumptions = extractAssumptions(interfaceDefinition, finalCode)

      // Safety: strip any export/print/os calls that slipped through
      finalCode = stripUnsafeCode(finalCode)

      // ── Pre-execution validation (#2, #3, #4, #5, #8, A2, B1) ──
      allPreExecResults = [
        ...checkPythonSyntax(finalCode),
        ...checkComponentCoverage(interfaceDefinition, finalCode),
        ...scanParametricIntegrity(finalCode),
        ...validateZStack(finalCode, interfaceDefinition),
        ...analyzeCadQueryCode(finalCode),
        ...checkFunctionInvocations(finalCode),
        ...validateInterfaceStructure(interfaceDefinition),
        ...checkLibraryUsage(finalCode, librarySlugs),
      ]

      // #8: Dimension estimation
      const dimEstimate = estimateDimensions(finalCode)
      allPreExecResults.push(...validateEstimatedDimensions(dimEstimate, interfaceDefinition))

      const criticalCount = allPreExecResults.filter((r) => r.severity === "critical").length
      if (criticalCount > 0) {
        console.warn(`[THE-FORGE] Step 3: ${criticalCount} critical pre-exec issue(s) on attempt ${attempt + 1}:`,
          allPreExecResults.filter((r) => r.severity === "critical").map((r) => r.ruleId))
        if (attempt < MAX_REPAIR_ATTEMPTS - 1) continue // Try repair
        // Final attempt — return failure with code attached
        return {
          success: false,
          error: `Pre-execution validation failed after ${MAX_REPAIR_ATTEMPTS} attempts: ${allPreExecResults.filter((r) => r.severity === "critical").map((r) => r.message).join("; ")}`,
          code: finalCode,
          codeLines: finalCode.split("\n").length,
          generationTime: Date.now() - pipelineStart,
          interfaceDefinition,
          tokensIn: totalTokensIn,
          tokensOut: totalTokensOut,
          modelUsed: modelId,
          assumptions: assumptions.length > 0 ? assumptions : undefined,
          repairAttempts,
          preExecValidation: allPreExecResults,
        }
      }

      if (allPreExecResults.length > 0) {
        console.info(`[THE-FORGE] Step 3: ${allPreExecResults.length} pre-exec finding(s) (non-critical), proceeding to Modal`)
      }

      // ── Prepend library function definitions for any used slugs ──
      const { combinedCode, libraryComponents } = await prepareCodeWithLibrary(finalCode)
      if (libraryComponents.length > 0) {
        console.info("[THE-FORGE] Library components prepended for execution:", {
          count: libraryComponents.length,
          slugs: libraryComponents,
        })
      }

      // ── Execute on Modal ──
      console.info("[THE-FORGE] Step 4: Executing on Modal...")
      const modalStart = Date.now()
      modalResult = await executeOnModal(combinedCode)
      modalTime = Date.now() - modalStart

      if (modalResult.error && !modalResult.svg_iso) {
        // INTENT: Python tracebacks put the actual error at the END.
        // Keep first line (error type) + last 400 chars (actual message).
        const err = modalResult.error
        const firstLine = err.split("\n")[0]
        const tail = err.length > 400 ? err.slice(-400) : err
        lastModalError = firstLine.length < 100 && err.length > 500
          ? `${firstLine}\n...\n${tail}`
          : err.slice(-500)
        console.warn(`[THE-FORGE] Step 4: Modal error on attempt ${attempt + 1}: ${modalResult.error.slice(0, 200)}`)
        if (attempt < MAX_REPAIR_ATTEMPTS - 1) continue // Try repair
        // Final attempt — return failure with code
        return {
          success: false,
          error: modalResult.error,
          code: finalCode,
          codeLines: finalCode.split("\n").length,
          generationTime: Date.now() - pipelineStart,
          modalTime,
          interfaceDefinition,
          tokensIn: totalTokensIn,
          tokensOut: totalTokensOut,
          modelUsed: modelId,
          assumptions: assumptions.length > 0 ? assumptions : undefined,
          repairAttempts,
          preExecValidation: allPreExecResults,
        }
      }

      // B4: Post-Modal quality-triggered repair — check for degenerate geometry
      // even on "success". Only degenerate bbox and extreme aspect ratio — fill ratio
      // and STEP size checks are too noisy.
      const qualityIssues: string[] = []
      const postModalBbox = modalResult.analysis?.mass_properties?.bounding_box
      if (postModalBbox && attempt < MAX_REPAIR_ATTEMPTS - 1) {
        const { xLen, yLen, zLen } = postModalBbox
        const minDim = Math.min(xLen, yLen, zLen)
        const maxDim = Math.max(xLen, yLen, zLen)

        if (minDim < 1) {
          qualityIssues.push(`Degenerate bbox dimension: ${xLen.toFixed(1)}×${yLen.toFixed(1)}×${zLen.toFixed(1)}mm (min axis <1mm)`)
        }
        if (minDim > 0 && maxDim / minDim > 50) {
          qualityIssues.push(`Extreme aspect ratio ${(maxDim / minDim).toFixed(1)}:1 — likely missing components`)
        }

        // E1: DFM critical issues — if Modal says part isn't printable, trigger repair
        const dfm = modalResult.analysis?.dfm
        if (dfm && !dfm.error && dfm.printable === false) {
          const criticalDfm = (dfm.issues ?? [])
            .filter((i: { severity?: string }) => i.severity === "critical" || i.severity === "error")
            .slice(0, 3) // Cap at 3 to avoid prompt bloat
          if (criticalDfm.length > 0) {
            const dfmMsg = `DFM: not printable — ${criticalDfm.map((i: { message?: string }) => i.message).join("; ")}`
            qualityIssues.push(dfmMsg)
            allPreExecResults.push({
              ruleId: "postmodal-dfm",
              severity: "warning",
              message: dfmMsg,
              repairHint: "The geometry has manufacturability issues. Increase wall thickness to at least 1mm, reduce overhang angles, and ensure no self-intersecting geometry.",
            })
          }
        }

        // E3: Dimensional mismatch vs interface spec — trigger repair if >2x off
        if (interfaceDefinition) {
          const dimMatch = interfaceDefinition.match(
            /Overall[:\s]*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*mm/i,
          )
          if (dimMatch) {
            const expected = [parseFloat(dimMatch[1]), parseFloat(dimMatch[2]), parseFloat(dimMatch[3])].sort((a, b) => a - b)
            const actual = [xLen, yLen, zLen].sort((a, b) => a - b)
            const mismatches: string[] = []
            for (let i = 0; i < 3; i++) {
              const ratio = actual[i] / expected[i]
              if (ratio > 2 || ratio < 0.5) {
                mismatches.push(`expected ~${expected[i].toFixed(0)}mm, got ${actual[i].toFixed(0)}mm`)
              }
            }
            if (mismatches.length > 0) {
              const scaleMsg = `Scale mismatch vs interface: ${mismatches.join("; ")}`
              qualityIssues.push(scaleMsg)
              allPreExecResults.push({
                ruleId: "postmodal-scale-mismatch",
                severity: "warning",
                message: scaleMsg,
                repairHint: "The model dimensions don't match the interface specification. Check that primary parameters use the correct scale (mm, not cm or m) and that derived calculations are correct.",
              })
            }
          }
        }

        // F7: COG orientation check — model may be upside-down
        const cog = modalResult.analysis?.mass_properties?.center_of_gravity as number[] | undefined
        if (cog && cog[2] < 0 && postModalBbox.zLen > 10) {
          const cogMsg = `Model center of gravity below Z=0 (COG z=${cog[2].toFixed(1)}mm) — may render upside-down`
          qualityIssues.push(cogMsg)
          allPreExecResults.push({
            ruleId: "postmodal-cog-orientation",
            severity: "warning",
            message: cogMsg,
            repairHint: "The model's center of gravity is below the Z=0 plane, suggesting it may be upside-down. Check that the base is at Z=0 and components build upward.",
          })
        }
      }

      // R6: Vision scoring runs independently of bbox — only needs SVG
      // INTENT: Pass hero image as reference for visual comparison when available
      if (modalResult.svg_iso && attempt < MAX_REPAIR_ATTEMPTS - 1) {
        const vr = await scoreRenderVision(modalResult.svg_iso, description, description.slice(0, 60), interfaceDefinition, blueprintImageBase64)
        if (vr) {
          visionScoreResult = vr
          // DECISION: With a hero image reference, demand score ≥ 7 (not ≥ 5). Visual comparison
          // is more accurate, so accepting 5-6 ("recognizable but wrong proportions") wastes the
          // repair loop when we can do better.
          const VISION_REPAIR_THRESHOLD = blueprintImageBase64 ? 7 : 5
          if (vr.score < VISION_REPAIR_THRESHOLD) {
            qualityIssues.push(`Vision score ${vr.score}/10 (threshold ${VISION_REPAIR_THRESHOLD}): ${vr.summary}`)
            allPreExecResults.push({
              ruleId: "postmodal-vision",
              severity: "warning",
              message: `Vision: ${vr.summary}`,
              repairHint: `The render doesn't match the ${blueprintImageBase64 ? "hero image" : "product description"}. Missing features: ${vr.issues.join(", ")}`,
            })
          }
        }
      }

      if (qualityIssues.length > 0 && attempt < MAX_REPAIR_ATTEMPTS - 1) {
        lastModalError = qualityIssues.join("; ")
        allPreExecResults.push({
          ruleId: "postmodal-quality",
          severity: "warning",
          message: qualityIssues.join("; "),
        })
        console.warn(`[THE-FORGE] Step 4: Post-Modal quality issue on attempt ${attempt + 1}: ${qualityIssues.join("; ")}`)
        continue
      }

      // Success — break out of repair loop
      break
    }

    // QW1: Log first-attempt success rate metric for quality tracking
    const firstAttemptSuccess = repairAttempts === 0
    console.info("[THE-FORGE] METRIC first_attempt_success:", firstAttemptSuccess, {
      repairAttempts,
      modelId,
    })

    if (!modalResult) {
      return {
        success: false,
        error: "Code generation failed — no Modal result produced",
        generationTime: Date.now() - pipelineStart,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        modelUsed: modelId,
        repairAttempts,
        preExecValidation: allPreExecResults,
      }
    }

    // J4: Always score the final result for metrics, even if loop is done
    // Runs only when the loop didn't already produce a vision score (avoids double-scoring on success)
    if (modalResult.svg_iso && !visionScoreResult) {
      try {
        const vr = await scoreRenderVision(modalResult.svg_iso, description, description.slice(0, 60), interfaceDefinition, blueprintImageBase64)
        if (vr) visionScoreResult = vr
      } catch {
        // Silent — vision scoring is best-effort enrichment
      }
    }

    // INTENT: .translate() and .rotate() are forbidden by CadQuery methodology — they corrupt
    // workplane chains and shift geometry off-origin. Flag as warnings, not blocking errors.
    const translateCount = (finalCode.match(/\.translate\s*\(/g) || []).length
    const rotateCount = (finalCode.match(/\.rotate\s*\(/g) || []).length
    const codeWarnings: string[] = []
    if (translateCount > 0) {
      codeWarnings.push(`.translate() used ${translateCount}x — may shift geometry off-origin`)
    }
    if (rotateCount > 0) {
      codeWarnings.push(`.rotate() used ${rotateCount}x — may shift geometry off-origin`)
    }

    const codeLines = finalCode.split("\n").length
    const generationTime = Date.now() - pipelineStart

    console.info(`[THE-FORGE] Step 3: Code generated (${codeLines} lines, ${generationTime}ms)`)

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

    // Merge translate/rotate code warnings
    warnings.push(...codeWarnings)

    // INTENT: Dimensional mismatch vs interface spec is now handled in the repair loop (E3).
    // Post-loop warnings only surface if the repair loop exhausted attempts without fixing.

    console.info(
      `[THE-FORGE] Pipeline complete: ${codeLines} lines, ${bboxResult?.xLen ?? "?"}×${bboxResult?.yLen ?? "?"}×${bboxResult?.zLen ?? "?"}mm, ${Date.now() - pipelineStart}ms total${repairAttempts > 0 ? ` (${repairAttempts} repair(s))` : ""}`,
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
      assumptions: assumptions.length > 0 ? assumptions : undefined,
      repairAttempts: repairAttempts > 0 ? repairAttempts : undefined,
      firstAttemptSuccess,
      preExecValidation: allPreExecResults.length > 0 ? allPreExecResults : undefined,
      visionScore: visionScoreResult?.score,
      visionIssues: visionScoreResult?.issues,
      error: modalResult.error ?? undefined,
    }
  } catch (err) {
    return {
      success: false,
      error: sanitizeErrorMessage(err),
      generationTime: Date.now() - pipelineStart,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      modelUsed: modelId,
    }
  }
}

// ─── Seed-Geometry Generation (private) ──────────────────────────────

/**
 * Generates a CAD model using a matched step_template as seed geometry.
 *
 * @description Instead of generating from scratch, this path:
 * 1. Fetches the seed template's STEP file
 * 2. Prompts Claude with hybrid instructions (CAD_INSTRUCTIONS + mashup-style seed loading)
 * 3. Executes via the /mashup Modal endpoint with the seed as a source
 * 4. Falls back to scratch generation on any failure
 *
 * INTENT: Templates have proven, detailed geometry. Starting from real parts
 * produces significantly better results than scratch CadQuery for modules
 * that closely match existing templates.
 *
 * @param description - Product/module description
 * @param researchReport - Research report from Step 1
 * @param interfaceDefinition - Interface definition from Step 2
 * @param seedTemplate - Matched template with step URL and metadata
 * @param modelId - Claude model to use
 * @param checkpointContext - Optional specialist checkpoint context
 * @returns CadLabResult with seedTemplateSlug/Score set
 */
async function generateCadLabModelWithSeed(
  description: string,
  researchReport: string,
  interfaceDefinition: string,
  seedTemplate: { slug: string; name: string; category: string; stepUrl: string; score: number },
  modelId: ClaudeModelId = "claude-opus-4-6",
  checkpointContext?: string,
  designBrief?: CadLabDesignBrief,
  domainHint?: CadLabDomain,
): Promise<CadLabResult> {
  const pipelineStart = Date.now()
  let totalTokensIn = 0
  let totalTokensOut = 0

  try {
    // SECURITY: Validate URL before fetching (SSRF protection)
    if (!(await isAllowedStepUrl(seedTemplate.stepUrl))) {
      throw new Error(`Seed template URL blocked by allowlist: ${seedTemplate.slug}`)
    }

    // ── Fetch seed STEP file with size guard ──
    console.info(`[THE-FORGE] Seed path: Fetching STEP from ${seedTemplate.slug}...`)
    const stepResponse = await fetch(seedTemplate.stepUrl, {
      signal: AbortSignal.timeout(30_000),
    })
    if (!stepResponse.ok) {
      throw new Error(`Failed to fetch seed STEP (${stepResponse.status})`)
    }

    // SECURITY: Check Content-Length to prevent memory exhaustion
    const contentLength = stepResponse.headers.get("content-length")
    if (contentLength && parseInt(contentLength, 10) > MAX_STEP_FILE_SIZE) {
      throw new Error(`Seed STEP file too large (${contentLength} bytes, max ${MAX_STEP_FILE_SIZE})`)
    }

    const stepBuffer = await stepResponse.arrayBuffer()

    // Runtime size check (Content-Length header can be missing or spoofed)
    if (stepBuffer.byteLength > MAX_STEP_FILE_SIZE) {
      throw new Error(`Seed STEP file too large (${stepBuffer.byteLength} bytes)`)
    }

    const stepB64 = Buffer.from(stepBuffer).toString("base64")
    if (!stepB64 || stepB64.length < 100) {
      throw new Error("Seed STEP file is empty or too small")
    }

    const seedFileName = `${seedTemplate.slug.replace(/[^a-zA-Z0-9_-]/g, "_")}.step`

    // ── Look up library for prompt injection ──
    // DECISION: Re-using the caller's auth context would be ideal but createClient()
    // reads from the same cookie, so the overhead is minimal (~1ms, no network call).
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const sector = user ? await lookupUserSector(supabase, user.id) : null
    const librarySummary = await fetchLibrarySummary(sector)
    const libraryPromptSection = await formatLibraryForPrompt(librarySummary)

    // SECURITY: Sanitise template metadata before prompt injection
    const safeName = await sanitiseForPrompt(seedTemplate.name)
    const safeCategory = await sanitiseForPrompt(seedTemplate.category)

    // J2: Detect domain for seed path hints (use cached hint or detect)
    let seedDomainHints = ""
    try {
      const seedDomain = domainHint ?? await detectDomainFromResearchReport(researchReport)
      seedDomainHints = getCodeGenDomainHints(seedDomain)
      if (seedDomainHints) console.info(`[THE-FORGE] Seed path: Domain ${seedDomain}${domainHint ? " (cached)" : ""}, injecting hints`)
    } catch {
      // Silent — domain hints are best-effort enrichment
    }

    // ── Build hybrid system prompt ──
    const systemPrompt = `You are generating a CadQuery parametric CAD model that starts from an existing STEP file as seed geometry. Follow the methodology in this document:

${CAD_INSTRUCTIONS}

${libraryPromptSection}

SEED GEOMETRY INSTRUCTIONS:
You have access to a seed STEP file: "${seedFileName}" (from template: "${safeName}" [${safeCategory}])
- Load it with: seed = cq.importers.importStep(SOURCE_DIR + "/${seedFileName}")
- The seed is a STARTING POINT, not gospel — modify, extend, cut, or adapt as needed
- If the seed geometry is close to what's needed, use it directly with modifications
- If parts of the seed don't match the interface definition, cut them away and add new geometry
- The final result MUST match the interface definition — the seed just gives you a head start

EXECUTION ENVIRONMENT RULES:
- SOURCE_DIR is pre-defined — do NOT define it yourself
- The final variable MUST be called "result" and be a cq.Workplane or cq.Compound object
- Do NOT include any cq.exporters calls — the execution environment handles export
- Do NOT include any print() statements
- Do NOT import os, sys, or use open(). Only import cadquery and math.
- After assembling "result", also create "result_exploded" — wrap in try/except so it never blocks the main result.
- Output ONLY the Python code inside a single \`\`\`python code fence. No explanations before or after.

SELF-CONTAINED CODE (CRITICAL):
- Your script MUST be executable with no unresolved names.
- You MAY call component-library functions that appear in the provided "COMPONENT LIBRARY" list.
- Any non-library helper function you call MUST be defined with \`def\` in YOUR script.
- PRE-FLIGHT CHECK: Before outputting code, mentally trace every function call.${seedDomainHints ? `\n\n${seedDomainHints}` : ""}`

    const userPrompt = `Build a parametric CAD model of: ${description}

=== SEED TEMPLATE ===
Name: ${safeName}
Category: ${safeCategory}
Match score: ${seedTemplate.score}
Load with: seed = cq.importers.importStep(SOURCE_DIR + "/${seedFileName}")
Use this as your starting geometry — modify/extend to match the interface definition below.

=== RESEARCH REPORT (use these real dimensions — do NOT invent dimensions) ===
${researchReport}

=== INTERFACE DEFINITION (implement EVERY component listed here) ===
${interfaceDefinition}
${checkpointContext ?? ""}${designBrief ? `\n\n=== MANUFACTURING CONSTRAINTS ===\n${formatDesignBriefForPrompt(designBrief)}\nApply these constraints when choosing wall thicknesses, tolerances, fillet radii, and assembly clearances.\n` : ""}
Generate CadQuery Python code that:
1. Loads the seed STEP as a starting point
2. Modifies/extends it to match the interface definition
3. Assigns the final assembly to "result"
4. Creates "result_exploded" (wrap in try/except)`

    console.info("[THE-FORGE] Seed path: Generating hybrid CadQuery code...")
    const codeResult = await callClaude(systemPrompt, userPrompt, modelId, 64000)
    totalTokensIn += codeResult.tokensIn
    totalTokensOut += codeResult.tokensOut

    let finalCode = extractCode(codeResult.text)

    // INTENT: Guard against empty code — don't waste a Modal run on empty string
    if (!finalCode.trim()) {
      throw new Error("Seed path: code generation returned empty output")
    }

    const assumptions = extractAssumptions(interfaceDefinition, finalCode)

    // Safety: strip unsafe calls
    finalCode = stripUnsafeCode(finalCode)

    // R2: 2-attempt repair loop for seed path pre-exec validation
    const SEED_MAX_ATTEMPTS = 2
    let preExecResults: PreExecValidationResult[] = []

    for (let seedAttempt = 0; seedAttempt < SEED_MAX_ATTEMPTS; seedAttempt++) {
      preExecResults = [
        ...checkPythonSyntax(finalCode),
        ...analyzeCadQueryCode(finalCode),
        ...checkComponentCoverage(interfaceDefinition, finalCode),
        ...scanParametricIntegrity(finalCode),
        ...validateZStack(finalCode, interfaceDefinition),
        ...checkFunctionInvocations(finalCode),
        ...validateInterfaceStructure(interfaceDefinition),
      ]
      const dimEstimate = estimateDimensions(finalCode)
      preExecResults.push(...validateEstimatedDimensions(dimEstimate, interfaceDefinition))

      const criticalIssues = preExecResults.filter((r) => r.severity === "critical")
      if (criticalIssues.length === 0) break // Validation passed

      console.warn(`[THE-FORGE] Seed path: ${criticalIssues.length} critical pre-exec issue(s) on attempt ${seedAttempt + 1}:`,
        criticalIssues.map((r) => r.ruleId))

      if (seedAttempt >= SEED_MAX_ATTEMPTS - 1) {
        // Final attempt — return failure
        return {
          success: false,
          error: `Seed path pre-execution validation failed after ${SEED_MAX_ATTEMPTS} attempts: ${criticalIssues.map((r) => r.message).join("; ")}`,
          code: finalCode,
          codeLines: finalCode.split("\n").length,
          generationTime: Date.now() - pipelineStart,
          interfaceDefinition,
          tokensIn: totalTokensIn,
          tokensOut: totalTokensOut,
          modelUsed: modelId,
          assumptions: assumptions.length > 0 ? assumptions : undefined,
          preExecValidation: preExecResults,
          seedTemplateSlug: seedTemplate.slug,
          seedTemplateScore: seedTemplate.score,
        }
      }

      // ── Attempt repair via Claude ──
      const failureSummary = criticalIssues
        .map((r) => `[${r.ruleId}] ${r.message}${r.repairHint ? ` — Fix: ${r.repairHint}` : ""}`)
        .join("\n")

      const repairPrompt = `The following CadQuery code has critical issues that must be fixed before execution:

ISSUES:
${failureSummary}

ORIGINAL CODE:
\`\`\`python
${finalCode}
\`\`\`

Fix ALL listed issues and output the corrected Python code inside a single \`\`\`python code fence. Preserve all working logic — only fix the listed issues.`

      console.info("[THE-FORGE] Seed path: Attempting repair...")
      const repairResult = await callClaude(systemPrompt, repairPrompt, modelId, 64000)
      totalTokensIn += repairResult.tokensIn
      totalTokensOut += repairResult.tokensOut

      const repairedCode = extractCode(repairResult.text)

      // Divergence check: if repaired code is identical, stop — repair didn't help
      if (repairedCode.trim() === finalCode.trim()) {
        console.warn("[THE-FORGE] Seed path: Repair produced identical code, stopping")
        return {
          success: false,
          error: `Seed path repair produced identical code: ${criticalIssues.map((r) => r.message).join("; ")}`,
          code: finalCode,
          codeLines: finalCode.split("\n").length,
          generationTime: Date.now() - pipelineStart,
          interfaceDefinition,
          tokensIn: totalTokensIn,
          tokensOut: totalTokensOut,
          modelUsed: modelId,
          assumptions: assumptions.length > 0 ? assumptions : undefined,
          preExecValidation: preExecResults,
          seedTemplateSlug: seedTemplate.slug,
          seedTemplateScore: seedTemplate.score,
        }
      }

      // Apply same safety strip to repaired code
      finalCode = stripUnsafeCode(repairedCode)
    }

    const codeLines = finalCode.split("\n").length
    console.info(`[THE-FORGE] Seed path: Code generated (${codeLines} lines)`)

    // ── Prepend library function definitions ──
    const { combinedCode, libraryComponents } = await prepareCodeWithLibrary(finalCode)
    if (libraryComponents.length > 0) {
      console.info("[THE-FORGE] Seed path: Library components prepended:", libraryComponents)
    }

    // ── Execute via mashup endpoint (supports SOURCE_DIR with STEP files) ──
    console.info("[THE-FORGE] Seed path: Executing on Modal (mashup endpoint)...")
    const modalStart = Date.now()
    const modalResult = await executeMashupOnModal(
      [{ name: seedFileName, step_b64: stepB64 }],
      combinedCode,
    )
    const modalTime = Date.now() - modalStart

    if (modalResult.error && !modalResult.svg_iso) {
      throw new Error(`Modal execution failed: ${modalResult.error}`)
    }

    // ── Extract metrics ──
    // GOTCHA: MashupModalResponse types `analysis` as `unknown`. We safely extract
    // nested properties with optional chaining — no unsafe `as` cast needed.
    const rawAnalysis = modalResult.analysis as Record<string, unknown> | null | undefined
    const mp = rawAnalysis?.mass_properties as ModalResponse["analysis"] extends infer A
      ? A extends { mass_properties?: infer MP } ? MP : undefined
      : undefined
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

    // Post-execution validation
    const warnings: string[] = []
    if (bboxResult) {
      if (bboxResult.xLen < 1 || bboxResult.yLen < 1 || bboxResult.zLen < 1) {
        warnings.push(`BBox has degenerate dimension(s): ${bboxResult.xLen}×${bboxResult.yLen}×${bboxResult.zLen}mm`)
      }
      const maxDim = Math.max(bboxResult.xLen, bboxResult.yLen, bboxResult.zLen)
      const minDim = Math.min(bboxResult.xLen, bboxResult.yLen, bboxResult.zLen)
      if (maxDim / minDim > 50) {
        warnings.push(`Extreme aspect ratio ${(maxDim / minDim).toFixed(1)}:1`)
      }
    }
    if (fillRatio != null && fillRatio > 15) {
      warnings.push(`Fill ratio ${fillRatio}% is high`)
    }
    if (stepSizeKb != null && stepSizeKb < 100) {
      warnings.push(`STEP size ${stepSizeKb}KB is small`)
    }

    // DFM
    const dfmRaw = rawAnalysis?.dfm as ModalResponse["analysis"] extends infer A
      ? A extends { dfm?: infer D } ? D : undefined
      : undefined
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

    // Mass properties
    const massPropsResult = mp && !mp.error
      ? {
          massKg: mp.mass_kg ?? 0,
          volumeMm3: mp.volume_mm3 ?? 0,
          surfaceAreaMm2: mp.surface_area_mm2 ?? 0,
          centerOfGravity: (mp.center_of_gravity ?? [0, 0, 0]) as [number, number, number],
          materialDensityKgM3: mp.material_density_kg_m3 ?? 1240,
        }
      : undefined

    const svgUri = (b64: string | null | undefined): string | undefined =>
      b64 ? `data:image/svg+xml;base64,${b64}` : undefined

    // GOTCHA: MashupModalResponse only types svg_iso, but the Modal endpoint may
    // return additional SVG views. Extract any extra views from the raw response.
    const rawResult = modalResult as Record<string, unknown>

    console.info(
      `[THE-FORGE] Seed path complete: ${seedTemplate.slug}, ${codeLines} lines, ${bboxResult?.xLen ?? "?"}×${bboxResult?.yLen ?? "?"}×${bboxResult?.zLen ?? "?"}mm, ${Date.now() - pipelineStart}ms`,
    )

    return {
      success: true,
      code: finalCode,
      codeLines,
      generationTime: Date.now() - pipelineStart,
      modalTime,
      svgIso: svgUri(modalResult.svg_iso),
      svgTop: svgUri(rawResult.svg_top as string | null),
      svgFront: svgUri(rawResult.svg_front as string | null),
      svgBack: svgUri(rawResult.svg_back as string | null),
      svgRight: svgUri(rawResult.svg_right as string | null),
      svgLeft: svgUri(rawResult.svg_left as string | null),
      svgExploded: svgUri(rawResult.svg_exploded as string | null),
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
      assumptions: assumptions.length > 0 ? assumptions : undefined,
      preExecValidation: preExecResults.length > 0 ? preExecResults : undefined,
      seedTemplateSlug: seedTemplate.slug,
      seedTemplateScore: seedTemplate.score,
      error: modalResult.error ?? undefined,
    }
  } catch (err) {
    console.warn("[THE-FORGE] Seed path error:", err instanceof Error ? err.message : err)
    return {
      success: false,
      error: sanitizeErrorMessage(err),
      generationTime: Date.now() - pipelineStart,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      modelUsed: modelId,
    }
  }
}

// ─── Decomposition Preparation (exported) ────────────────────────────

/**
 * Prepares for module decomposition by detecting domain and estimating tokens.
 *
 * @description Surfaces the domain-detection Claude call as a visible progress
 * step so the UI can report real status instead of fake timers.
 *
 * @param description - Product description
 * @param researchReport - Research report from Step 1
 * @returns Domain info and estimated input token count
 */
export async function prepareDecomposition(
  description: string,
  researchReport: string,
): Promise<{
  domain: CadLabDomain
  domainLabel: string
  domainDescription: string
  estimatedInputTokens: number
}> {
  // AUTH: Verify user is authenticated (no rate limit — that stays in decomposeIntoModules)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  // DECISION: Keyword heuristic instead of Claude API call — saves 2-5s with equivalent accuracy
  const domain = detectDomainFromText(researchReport)
  const prompt = getModuleDecompositionPrompt(domain)

  // INTENT: Rough token estimate so the UI can display an honest number.
  // ~4 chars per token is a standard approximation for English text.
  const userPrompt = `Product: ${description}\n\nResearch Report:\n${researchReport}\n\nDecompose this product into physical modules (sub-assemblies). Output ONLY the JSON array.`
  const estimatedInputTokens = Math.round((prompt.length + userPrompt.length) / 4)

  return {
    domain,
    domainLabel: getDomainLabel(domain),
    domainDescription: getDomainDescription(domain),
    estimatedInputTokens,
  }
}

// ─── Skeleton Decomposition (Progressive Phase 1) ────────────────────

/**
 * Fast skeleton decomposition — returns module names, purposes, inputs/outputs
 * and connections in ~10-15s. No keyParts, descriptions, or failure modes.
 *
 * @description Phase 1 of progressive decomposition. The lightweight prompt
 * produces a small JSON (~500 tokens) so even complex products complete quickly.
 * Phase 2 (expandModuleDetail) fills in the detail per-module.
 *
 * @param description - Product description
 * @param researchReport - Research report from Step 1
 * @param modelId - Claude model to use (always Opus for quality)
 * @param domainHint - Pre-detected domain (skips re-detection)
 * @returns Skeleton modules and connections
 */
export async function skeletonDecompose(
  description: string,
  researchReport: string,
  modelId: ClaudeModelId = "claude-opus-4-6",
  domainHint?: CadLabDomain,
): Promise<SkeletonDecompositionResult> {
  // AUTH: Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Unauthorized", modules: [], decompositionTime: 0, tokensIn: 0, tokensOut: 0 }

  // SECURITY: Rate limit
  const rateLimitError = await checkRateLimit("aiCadLab", `ai:${user.id}`)
  if (rateLimitError) return { success: false, error: rateLimitError, modules: [], decompositionTime: 0, tokensIn: 0, tokensOut: 0 }

  const start = Date.now()

  try {
    const domain = domainHint ?? detectDomainFromText(researchReport)
    const systemPrompt = getSkeletonDecompositionPrompt(domain)

    // DECISION: Truncate research report — skeleton only needs high-level structure
    const truncatedReport = researchReport.length > 12_000
      ? researchReport.slice(0, 12_000) + "\n\n[Report truncated — full report available in later stages]"
      : researchReport

    const userPrompt = `Product: ${description}\n\nResearch Report:\n${truncatedReport}\n\nIdentify the physical modules (sub-assemblies). Output ONLY the JSON object with "modules" and "connections".`

    // DECISION: Direct call with Opus — small output (~500 tokens) but complex products with
    // 12K-char research reports need 30-60s. 60s stays well within Vercel 300s cap.
    const { text, tokensIn, tokensOut } = await callClaude(
      systemPrompt, userPrompt, modelId, 2048, 60_000, 1,
    )

    // Parse JSON response
    let parsed: unknown
    try {
      const jsonText = extractJsonObject(text)
      parsed = JSON.parse(jsonText)
    } catch {
      try {
        const jsonArr = extractJsonArray(text)
        parsed = JSON.parse(jsonArr)
      } catch {
        return {
          success: false,
          error: "Failed to parse skeleton — AI returned invalid JSON",
          modules: [],
          decompositionTime: Date.now() - start,
          tokensIn, tokensOut,
        }
      }
    }

    let rawModules: unknown[]
    let rawConnections: unknown[] | undefined

    if (Array.isArray(parsed)) {
      rawModules = parsed
    } else if (parsed && typeof parsed === "object" && "modules" in (parsed as Record<string, unknown>)) {
      const obj = parsed as Record<string, unknown>
      rawModules = Array.isArray(obj.modules) ? obj.modules : []
      rawConnections = Array.isArray(obj.connections) ? obj.connections : undefined
    } else {
      rawModules = []
    }

    if (rawModules.length === 0) {
      return {
        success: false,
        error: "AI returned empty module array",
        modules: [],
        decompositionTime: Date.now() - start,
        tokensIn, tokensOut,
      }
    }

    // Validate skeleton modules (lightweight — just id, name, purpose, inputs, outputs, mirrorOf)
    const modules: SkeletonModule[] = rawModules.map((raw) => {
      const m = raw as Record<string, unknown>
      const mirrorOfRaw = m.mirrorOf
      return {
        id: String(m.id || "unknown").toLowerCase().replace(/\s+/g, "_"),
        name: String(m.name || "Unnamed Module"),
        purpose: String(m.purpose || ""),
        inputs: Array.isArray(m.inputs) ? m.inputs.map(String) : ["Input"],
        outputs: Array.isArray(m.outputs) ? m.outputs.map(String) : ["Output"],
        ...(typeof mirrorOfRaw === "string" && mirrorOfRaw.trim() ? { mirrorOf: mirrorOfRaw.trim().toLowerCase().replace(/\s+/g, "_") } : {}),
      }
    })

    // Validate mirrorOf references — must point to a real module ID
    const moduleIds = new Set(modules.map(m => m.id))
    for (const mod of modules) {
      if (mod.mirrorOf && !moduleIds.has(mod.mirrorOf)) {
        console.warn(`[THE-FORGE] Dropped invalid mirrorOf: ${mod.id} → ${mod.mirrorOf}`)
        delete mod.mirrorOf
      }
    }

    // Validate connections against skeleton modules
    const modulePortLookup = new Map(modules.map(m => [m.id, { inputs: m.inputs, outputs: m.outputs }]))
    let connections: ModuleConnection[] | undefined

    if (rawConnections && rawConnections.length > 0) {
      connections = []
      for (const raw of rawConnections) {
        const c = raw as Record<string, unknown>
        const from = String(c.from || "")
        const output = String(c.output || "")
        const to = String(c.to || "")
        const input = String(c.input || "")
        if (!moduleIds.has(from) || !moduleIds.has(to)) continue
        const sourcePorts = modulePortLookup.get(from)
        const targetPorts = modulePortLookup.get(to)
        if (!sourcePorts?.outputs.includes(output)) continue
        if (!targetPorts?.inputs.includes(input)) continue
        connections.push({ from, output, to, input })
      }
      if (connections.length === 0) connections = undefined
    }

    console.info(`[THE-FORGE] Skeleton decomposition: ${modules.length} modules in ${Date.now() - start}ms`)

    return {
      success: true,
      modules,
      connections,
      decompositionTime: Date.now() - start,
      tokensIn, tokensOut,
      modelUsed: "Opus",
    }
  } catch (error) {
    console.error("[THE-FORGE] Skeleton decomposition failed:", error instanceof Error ? error.message : error)
    return {
      success: false,
      error: classifyDecompositionError(error),
      modules: [],
      decompositionTime: Date.now() - start,
      tokensIn: 0, tokensOut: 0,
    }
  }
}

// ─── Module Expansion (Progressive Phase 2) ──────────────────────────

/**
 * Expands a single skeleton module with full details (keyParts, description,
 * failureModes, unknowns, etc.).
 *
 * @description Phase 2 of progressive decomposition. Called once per module,
 * sequentially, so the UI can show each module's details as they arrive.
 * Takes the full skeleton list for inter-module context.
 *
 * @param skeletonModules - All skeleton modules (for context)
 * @param targetModuleId - Which module to expand
 * @param description - Product description
 * @param researchReport - Research report from Step 1
 * @param modelId - Claude model to use
 * @param domainHint - Pre-detected domain
 * @returns Expanded detail fields for the target module
 */
export async function expandModuleDetail(
  skeletonModules: SkeletonModule[],
  targetModuleId: string,
  description: string,
  researchReport: string,
  modelId: ClaudeModelId = "claude-opus-4-6",
  domainHint?: CadLabDomain,
  consistencyBrief?: string,
): Promise<ModuleExpansionResult> {
  // AUTH: Verify user is authenticated (no separate rate limit — skeleton already rate-limited)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Unauthorized", moduleId: targetModuleId, tokensIn: 0, tokensOut: 0 }

  const target = skeletonModules.find(m => m.id === targetModuleId)
  if (!target) return { success: false, error: `Module ${targetModuleId} not found in skeleton`, moduleId: targetModuleId, tokensIn: 0, tokensOut: 0 }

  try {
    const domain = domainHint ?? detectDomainFromText(researchReport)
    const systemPrompt = getModuleExpansionPrompt(domain, consistencyBrief)

    // DECISION: Truncate research report — expansion only needs context, not full detail
    const truncatedReport = researchReport.length > 8_000
      ? researchReport.slice(0, 8_000) + "\n\n[Report truncated]"
      : researchReport

    // INTENT: Include full skeleton for inter-module context so the AI understands
    // how this module fits into the broader system
    const skeletonSummary = skeletonModules.map(m =>
      `- ${m.name} (${m.id}): ${m.purpose} | inputs: [${m.inputs.join(", ")}] | outputs: [${m.outputs.join(", ")}]`
    ).join("\n")

    const userPrompt = `Product: ${description}

Research Report:
${truncatedReport}

Full product skeleton:
${skeletonSummary}

TARGET MODULE TO EXPAND: "${target.name}" (id: ${target.id})
Purpose: ${target.purpose}
Inputs: ${target.inputs.join(", ")}
Outputs: ${target.outputs.join(", ")}

Provide the detailed engineering specification for this module ONLY. Output ONLY the JSON object.`

    const { text, tokensIn, tokensOut } = await callClaude(
      systemPrompt, userPrompt, modelId, 2048, 90_000, 2,
    )

    // Parse expansion JSON
    let parsed: Record<string, unknown>
    try {
      const jsonText = extractJsonObject(text)
      parsed = JSON.parse(jsonText) as Record<string, unknown>
    } catch {
      return {
        success: false,
        error: "Failed to parse module expansion — AI returned invalid JSON",
        moduleId: targetModuleId,
        tokensIn, tokensOut,
      }
    }

    return {
      success: true,
      moduleId: targetModuleId,
      expansion: {
        keyParts: Array.isArray(parsed.keyParts) ? parsed.keyParts.map(String) : [],
        leadWeeks: typeof parsed.leadWeeks === "number" ? parsed.leadWeeks : 4,
        estimatedMassKg: typeof parsed.estimatedMassKg === "number" && parsed.estimatedMassKg > 0
          ? parsed.estimatedMassKg : undefined,
        description: String(parsed.description || ""),
        whyItMatters: String(parsed.whyItMatters || ""),
        failureModes: Array.isArray(parsed.failureModes) ? parsed.failureModes.map(String) : [],
        unknowns: Array.isArray(parsed.unknowns) ? parsed.unknowns.map(String) : [],
      },
      tokensIn, tokensOut,
    }
  } catch (error) {
    console.error(`[THE-FORGE] Module expansion failed for ${targetModuleId}:`, error instanceof Error ? error.message : error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Module expansion failed",
      moduleId: targetModuleId,
      tokensIn: 0, tokensOut: 0,
    }
  }
}

// ─── Decomposition Error Classification ──────────────────────────────

/**
 * Maps known AI API error patterns to user-friendly messages.
 *
 * @description Local to decomposition — not added to the global sanitizeErrorMessage
 * because that function is a security boundary used by 30+ actions. Adding AI-specific
 * patterns there could leak context in unrelated error surfaces.
 */
function classifyDecompositionError(
  error: unknown,
  triedModels: Array<{ model: string; error: string }> = [],
): string {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : ""
  const lower = msg.toLowerCase()

  // INTENT: Append fallback chain info so the user knows which models were attempted
  const chainSuffix = triedModels.length > 0
    ? ` (tried ${triedModels.map((m) => m.model).join(" → ")})`
    : ""

  if (lower.includes("429") || lower.includes("rate limit"))
    return `AI rate limit reached. Please wait a moment and try again.${chainSuffix}`
  if (lower.includes("529") || lower.includes("overloaded"))
    return `AI service is temporarily overloaded. Please try again shortly.${chainSuffix}`
  if (/spend|billing|credit|quota/.test(lower))
    return `AI usage limit reached. Please check your API billing.${chainSuffix}`
  if (/401|403|unauthorized|forbidden/.test(lower))
    return `AI service authentication failed. Please contact support.${chainSuffix}`
  if (/500|502|503/.test(lower))
    return `AI service error. Please try again in a few minutes.${chainSuffix}`
  if (/timeout|abort|timed out/.test(lower))
    return `Request timed out. The AI service may be under heavy load.${chainSuffix}`
  if (/fetch failed|econnrefused|network/.test(lower))
    return `Could not reach AI service. Check your connection.${chainSuffix}`
  if (lower.includes("api_key not configured"))
    return "AI service not configured. Please contact support."

  return sanitizeErrorMessage(error)
}

// ─── Temporary debug logging (remove after diagnosing decomposition hang) ───
const DECOMP_LOG = "/tmp/forge-decomposition.log"
function dlog(msg: string) {
  const ts = new Date().toISOString()
  appendFileSync(DECOMP_LOG, `[${ts}] ${msg}\n`)
}

// ─── Module Decomposition (exported) ─────────────────────────────────

/**
 * Decomposes a product into physical modules based on the research report.
 *
 * @description After Step 1 research is complete, this action breaks the
 * product into 4-8 physical sub-assemblies. Each module can then
 * independently go through the 3-step CAD pipeline.
 *
 * @param description - Product description
 * @param researchReport - Research report from Step 1
 * @param modelId - Claude model to use
 * @returns Array of decomposed modules
 */
export async function decomposeIntoModules(
  description: string,
  researchReport: string,
  modelId: ClaudeModelId = "claude-opus-4-6",
  domainHint?: CadLabDomain,
): Promise<CadLabDecompositionResult> {
  // AUTH: Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" } as unknown as CadLabDecompositionResult

  // SECURITY: Rate limit
  const rateLimitError = await checkRateLimit("aiCadLab", `ai:${user.id}`)
  if (rateLimitError) return { error: rateLimitError } as unknown as CadLabDecompositionResult

  const start = Date.now()
  const triedModels: Array<{ model: string; error: string }> = []

  // Clear log file for this run
  writeFileSync(DECOMP_LOG, `=== DECOMPOSITION START === ${new Date().toISOString()}\n`)
  dlog(`Product: ${description.slice(0, 100)}`)
  dlog(`Research report length: ${researchReport.length} chars`)
  dlog(`Model hint: ${modelId}, Domain hint: ${domainHint ?? "none"}`)

  try {
    // DECISION: Keyword heuristic fallback instead of Claude API call — saves 2-5s
    const domain = domainHint ?? detectDomainFromText(researchReport)
    console.info("[THE-FORGE] Decomposing product into modules (domain: %s)...", domain)
    dlog(`Detected domain: ${domain}`)
    const modulePrompt = getModuleDecompositionPrompt(domain)

    // DECISION: Catalogue removed from decomposition prompt — saves 5-15s (fewer input tokens).
    // Real-part grounding happens later during the Specify stage where individual modules get attention.

    // DECISION: Truncate research report to 12K chars — decomposition only needs high-level structure,
    // not every detail. Full report remains available for later stages.
    const truncatedReport = researchReport.length > 12_000
      ? researchReport.slice(0, 12_000) + "\n\n[Report truncated for decomposition — full report available in later stages]"
      : researchReport

    const userPrompt = `Product: ${description}

Research Report:
${truncatedReport}

Decompose this product into physical modules (sub-assemblies). Output ONLY the JSON object with "modules" and "connections" arrays.`

    // DECISION: Race Sonnet + Gemini in parallel via Promise.any, then OpenAI sequential fallback.
    // Parallel racing means total time = max(150s, 150s) + 120s = 270s worst case — fits Vercel 300s cap.
    // TRIED: Sequential Opus(120s)→Sonnet(120s)→Qwen(120s)→Gemini(120s)→OpenAI(120s) — 600s worst case,
    //   far exceeds Vercel 300s cap. All models genuinely timeout at 120s for complex prompts (~13.5K chars).
    // TRIED: AbortSignal.timeout — silently fails in Next.js server actions (commit 0795994c fixed mechanism,
    //   but sequential chain still too slow).
    dlog(`System prompt length: ${modulePrompt.length} chars`)
    dlog(`User prompt length: ${userPrompt.length} chars`)
    let text: string, tokensIn: number, tokensOut: number
    let winnerModel = ""

    // Race user's chosen Claude model + Gemini in parallel — first success wins
    const claudeLabel = modelId.includes("opus") ? "Opus" : modelId.includes("haiku") ? "Haiku" : "Sonnet"
    dlog(`>>> RACING: ${claudeLabel}(150s) + Gemini(150s) in parallel`)
    const raceStart = Date.now()

    type RaceResult = { text: string; tokensIn: number; tokensOut: number; model: string }

    const claudePromise: Promise<RaceResult> = callClaude(
      modulePrompt, userPrompt, modelId, 8192, 150_000, 1,
    ).then(r => {
      dlog(`<<< ${claudeLabel.toUpperCase()} SUCCEEDED in ${Date.now() - raceStart}ms`)
      return { ...r, model: claudeLabel }
    }).catch(err => {
      const msg = err instanceof Error ? err.message.slice(0, 200) : String(err)
      dlog(`<<< ${claudeLabel.toUpperCase()} FAILED in ${Date.now() - raceStart}ms: ${msg}`)
      triedModels.push({ model: claudeLabel, error: msg })
      throw err
    })

    const geminiPromise: Promise<RaceResult> = callGemini(
      modulePrompt, userPrompt, "gemini-3.1-pro-preview", 8192, 150_000,
    ).then(r => {
      dlog(`<<< GEMINI SUCCEEDED in ${Date.now() - raceStart}ms`)
      return { ...r, model: "Gemini" }
    }).catch(err => {
      const msg = err instanceof Error ? err.message.slice(0, 200) : String(err)
      dlog(`<<< GEMINI FAILED in ${Date.now() - raceStart}ms: ${msg}`)
      triedModels.push({ model: "Gemini", error: msg })
      throw err
    })

    try {
      const winner = await Promise.any([claudePromise, geminiPromise])
      text = winner.text; tokensIn = winner.tokensIn; tokensOut = winner.tokensOut
      winnerModel = winner.model
      dlog(`<<< RACE WON by ${winner.model} in ${Date.now() - raceStart}ms`)
    } catch {
      // Both failed — try OpenAI as final resort
      dlog(">>> ATTEMPTING OPENAI (timeout=120s) — final fallback")
      const openaiStart = Date.now()
      try {
        ;({ text, tokensIn, tokensOut } = await callOpenAI(modulePrompt, userPrompt, "gpt-5.3-instant", 8192, 120_000))
        winnerModel = "GPT-5.3-Instant"
        dlog(`<<< OPENAI SUCCEEDED in ${Date.now() - openaiStart}ms`)
      } catch (openaiErr) {
        const msg = openaiErr instanceof Error ? openaiErr.message.slice(0, 200) : String(openaiErr)
        dlog(`<<< OPENAI FAILED in ${Date.now() - openaiStart}ms: ${msg}`)
        triedModels.push({ model: "OpenAI", error: msg })
        throw openaiErr
      }
    }

    // Parse JSON from response — AI may return { modules, connections } object or bare array
    // DECISION: Try object parse first (new format), fall back to array (legacy/fallback models)
    let rawModules: unknown[]
    let rawConnections: unknown[] | undefined

    // Try parsing as object first, then array
    let parsed: unknown
    try {
      const jsonObjText = extractJsonObject(text)
      parsed = JSON.parse(jsonObjText)
    } catch {
      try {
        const jsonArrText = extractJsonArray(text)
        parsed = JSON.parse(jsonArrText)
      } catch {
        // Both failed — try repair
        parsed = null
      }
    }

    if (parsed === null) {
      console.warn("[THE-FORGE] Initial JSON parse failed, attempting repair. Fragment:", text.slice(0, 500))
      try {
        const repairSystem = "You are a JSON repair tool. Fix the following broken JSON so it parses correctly. The expected format is a JSON object with \"modules\" (array) and \"connections\" (array) keys, OR a bare JSON array of modules. Output ONLY the corrected JSON, nothing else."
        let repairedText: string
        try {
          ({ text: repairedText } = await callClaude(repairSystem, text, modelId, 8192))
        } catch {
          ({ text: repairedText } = await callGemini(repairSystem, text))
        }
        // Try object first, then array
        try {
          const repairedObj = extractJsonObject(repairedText)
          parsed = JSON.parse(repairedObj)
        } catch {
          const repairedArr = extractJsonArray(repairedText)
          parsed = JSON.parse(repairedArr)
        }
        console.info("[THE-FORGE] JSON repair succeeded")
      } catch {
        console.error("[THE-FORGE] JSON repair also failed. Original fragment:", text.slice(0, 500))
        return {
          success: false,
          error: "Failed to parse module decomposition — AI returned invalid JSON",
          modules: [],
          decompositionTime: Date.now() - start,
          tokensIn,
          tokensOut,
        }
      }
    }

    // INTENT: Backward compat — if AI returns bare array, treat as modules-only
    if (Array.isArray(parsed)) {
      rawModules = parsed
      rawConnections = undefined
    } else if (parsed && typeof parsed === "object" && "modules" in (parsed as Record<string, unknown>)) {
      const obj = parsed as Record<string, unknown>
      rawModules = Array.isArray(obj.modules) ? obj.modules : []
      rawConnections = Array.isArray(obj.connections) ? obj.connections : undefined
    } else {
      rawModules = []
    }

    if (rawModules.length === 0) {
      return {
        success: false,
        error: "AI returned empty or invalid module array",
        modules: [],
        decompositionTime: Date.now() - start,
        tokensIn,
        tokensOut,
      }
    }

    // Validate and clean each module
    const modules: CadLabModule[] = rawModules.map((raw) => {
      const m = raw as Record<string, unknown>
      const mirrorOfRaw = m.mirrorOf
      return {
        id: String(m.id || "unknown").toLowerCase().replace(/\s+/g, "_"),
        name: String(m.name || "Unnamed Module"),
        purpose: String(m.purpose || ""),
        inputs: Array.isArray(m.inputs) ? m.inputs.map(String) : ["Input"],
        outputs: Array.isArray(m.outputs) ? m.outputs.map(String) : ["Output"],
        keyParts: Array.isArray(m.keyParts) ? m.keyParts.map(String) : [],
        leadWeeks: typeof m.leadWeeks === "number" ? m.leadWeeks : 4,
        estimatedMassKg: typeof m.estimatedMassKg === "number" && m.estimatedMassKg > 0
          ? m.estimatedMassKg : undefined,
        ...(typeof mirrorOfRaw === "string" && mirrorOfRaw.trim() ? { mirrorOf: mirrorOfRaw.trim().toLowerCase().replace(/\s+/g, "_") } : {}),
        description: String(m.description || ""),
        whyItMatters: String(m.whyItMatters || ""),
        failureModes: Array.isArray(m.failureModes) ? m.failureModes.map(String) : [],
        unknowns: Array.isArray(m.unknowns) ? m.unknowns.map(String) : [],
        status: "pending" as const,
      }
    })

    // Validate mirrorOf references — must point to a real module ID
    const moduleIds = new Set(modules.map(m => m.id))
    for (const mod of modules) {
      if (mod.mirrorOf && !moduleIds.has(mod.mirrorOf)) {
        console.warn(`[THE-FORGE] Dropped invalid mirrorOf: ${mod.id} → ${mod.mirrorOf}`)
        delete mod.mirrorOf
      }
    }
    const modulePortLookup = new Map(modules.map(m => [m.id, { inputs: m.inputs, outputs: m.outputs }]))
    let connections: ModuleConnection[] | undefined

    if (rawConnections && rawConnections.length > 0) {
      connections = []
      for (const raw of rawConnections) {
        const c = raw as Record<string, unknown>
        const from = String(c.from || "")
        const output = String(c.output || "")
        const to = String(c.to || "")
        const input = String(c.input || "")

        // Validate: from/to must be valid module IDs, output/input must exist in port arrays
        if (!moduleIds.has(from) || !moduleIds.has(to)) {
          console.warn("[THE-FORGE] Dropped connection: invalid module ID", { from, to })
          continue
        }
        const sourcePorts = modulePortLookup.get(from)
        const targetPorts = modulePortLookup.get(to)
        if (!sourcePorts?.outputs.includes(output)) {
          console.warn("[THE-FORGE] Dropped connection: output not in module ports", { from, output, available: sourcePorts?.outputs })
          continue
        }
        if (!targetPorts?.inputs.includes(input)) {
          console.warn("[THE-FORGE] Dropped connection: input not in module ports", { to, input, available: targetPorts?.inputs })
          continue
        }
        connections.push({ from, output, to, input })
      }
      if (connections.length === 0) connections = undefined
      dlog(`Validated ${connections?.length ?? 0}/${rawConnections.length} connections`)
    }

    const totalMs = Date.now() - start
    dlog(`SUCCESS: ${modules.length} modules, ${connections?.length ?? 0} connections in ${totalMs}ms`)
    dlog(`=== DECOMPOSITION END ===`)
    console.info(
      `[THE-FORGE] Decomposed into ${modules.length} modules with ${connections?.length ?? 0} connections in ${totalMs}ms`,
    )

    return {
      success: true,
      modules,
      connections,
      decompositionTime: totalMs,
      tokensIn,
      tokensOut,
      modelUsed: winnerModel,
    }
  } catch (error) {
    const totalMs = Date.now() - start
    const errMsg = error instanceof Error ? error.message : String(error)
    dlog(`FATAL ERROR after ${totalMs}ms: ${errMsg}`)
    if (triedModels.length > 0) {
      dlog(`Fallback chain: ${JSON.stringify(triedModels)}`)
    }
    dlog(`=== DECOMPOSITION END (FAILED) ===`)
    console.error("[THE-FORGE] Module decomposition failed:", error instanceof Error ? error.message : error)
    if (triedModels.length > 0) {
      console.error("[THE-FORGE] Fallback chain:", JSON.stringify(triedModels))
    }
    return {
      success: false,
      error: classifyDecompositionError(error, triedModels),
      modules: [],
      decompositionTime: Date.now() - start,
      tokensIn: 0,
      tokensOut: 0,
    }
  }
}

// ─── P1: Interface Contract Extraction ────────────────────────────────

/**
 * Formats unmatched ports into a focused prompt for the re-extraction pass.
 *
 * @description Lists only the ports that have no contract from the first pass,
 * grouped by module, so the second Claude call can focus on filling gaps.
 */
function buildUnmatchedPortsSummary(
  modules: CadLabModule[],
  unmatchedOutputs: Array<{ moduleId: string; portName: string }>,
  unmatchedInputs: Array<{ moduleId: string; portName: string }>,
): string {
  const moduleMap = new Map(modules.map((m) => [m.id, m]))
  const lines: string[] = ["The following ports were NOT connected in the first extraction pass. Identify a connection for each.\n"]

  // Group by module for readability
  const outputsByModule = new Map<string, string[]>()
  for (const u of unmatchedOutputs) {
    if (!outputsByModule.has(u.moduleId)) outputsByModule.set(u.moduleId, [])
    outputsByModule.get(u.moduleId)!.push(u.portName)
  }
  const inputsByModule = new Map<string, string[]>()
  for (const u of unmatchedInputs) {
    if (!inputsByModule.has(u.moduleId)) inputsByModule.set(u.moduleId, [])
    inputsByModule.get(u.moduleId)!.push(u.portName)
  }

  const allModuleIds = new Set([...outputsByModule.keys(), ...inputsByModule.keys()])
  for (const modId of allModuleIds) {
    const mod = moduleMap.get(modId)
    const name = mod?.name ?? modId
    lines.push(`## ${name} (id: ${modId})`)
    if (mod) lines.push(`Purpose: ${mod.purpose}`)
    const outs = outputsByModule.get(modId)
    if (outs) lines.push(`Unmatched OUTPUTS:\n${outs.map((o, i) => `  ${i + 1}. "${o}"`).join("\n")}`)
    const ins = inputsByModule.get(modId)
    if (ins) lines.push(`Unmatched INPUTS:\n${ins.map((inp, i) => `  ${i + 1}. "${inp}"`).join("\n")}`)
    lines.push("")
  }

  // Also list all module IDs so Claude knows what targets are available
  lines.push("Available modules:")
  for (const m of modules) {
    lines.push(`- ${m.name} (id: ${m.id})`)
  }

  return lines.join("\n")
}

/**
 * Extracts interface contracts between modules using Claude.
 *
 * @description Analyses module inputs/outputs and asks Claude to identify
 * which ports connect, their types, specs, and compatibility. Then runs
 * deterministic validation to find unmatched ports.
 *
 * @param modules - Decomposed modules with inputs/outputs
 * @param researchReport - Research report for additional context
 * @param modelId - Claude model to use
 * @returns Contract extraction result with contracts, unmatched ports, and warnings
 */
export async function extractInterfaceContracts(
  modules: CadLabModule[],
  researchReport: string,
  modelId: ClaudeModelId = "claude-opus-4-6",
): Promise<InterfaceContractResult> {
  const start = Date.now()

  if (modules.length < 2) {
    return {
      contracts: [],
      unmatchedOutputs: [],
      unmatchedInputs: [],
      warnings: ["Need at least 2 modules to extract contracts"],
      extractionTimeMs: Date.now() - start,
      tokensIn: 0,
      tokensOut: 0,
    }
  }

  // INTENT: Enumerate every port in numbered lists so Claude can copy names verbatim.
  // Count totals so the prompt can mandate 100% coverage.
  let totalOutputs = 0
  let totalInputs = 0
  const moduleSummary = modules.map((m) => {
    const outputList = m.outputs.length > 0
      ? m.outputs.map((o, i) => `  ${i + 1}. "${o}"`).join("\n")
      : "  (none)"
    const inputList = m.inputs.length > 0
      ? m.inputs.map((inp, i) => `  ${i + 1}. "${inp}"`).join("\n")
      : "  (none)"
    totalOutputs += m.outputs.length
    totalInputs += m.inputs.length
    return [
      `## ${m.name} (id: ${m.id})`,
      `Purpose: ${m.purpose}`,
      `Outputs (${m.outputs.length}):`,
      outputList,
      `Inputs (${m.inputs.length}):`,
      inputList,
    ].join("\n")
  }).join("\n\n")

  const systemPrompt = `You are an engineering systems integration specialist. Analyse the module interfaces and identify which output ports connect to which input ports across modules.

For each connection, determine:
1. The port type: power, data, mechanical, thermal, fluid, optical, or other
2. Any specs you can infer (e.g., "24V DC", "M8 bolt pattern", "CAN bus")
3. Whether the connection appears compatible based on the specs

Return a JSON array of contracts. Each contract:
{
  "sourceModuleId": "module-id",
  "sourcePort": "exact output name",
  "targetModuleId": "module-id",
  "targetPort": "exact input name",
  "portType": "power|data|mechanical|thermal|fluid|optical|other",
  "sourceSpec": "optional spec string",
  "targetSpec": "optional spec string",
  "compatible": true|false|null,
  "incompatibilityReason": "optional reason if compatible=false"
}

Rules:
- Match outputs to inputs across different modules (never within same module)
- Copy port names EXACTLY as listed — do not rephrase, abbreviate, or expand them
- Set compatible=null if you cannot determine compatibility
- Your response MUST contain at least one contract for EVERY listed port (${totalOutputs} outputs and ${totalInputs} inputs)
- For ports that interface with the external environment (user input, environmental output, ground, ambient air, etc.) rather than another module, use "external" as the sourceModuleId or targetModuleId
- Return ONLY the JSON array, no markdown fences or explanation`

  const userPrompt = `Here are the modules to analyse:\n\n${moduleSummary}\n\nResearch context (abbreviated):\n${researchReport.slice(0, 6000)}`

  try {
    const res = await callClaude(systemPrompt, userPrompt, modelId, 8192)

    // Parse JSON from response (handle potential markdown fences)
    let jsonText = res.text.trim()
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonText = fenceMatch[1].trim()

    const rawContracts = JSON.parse(jsonText) as InterfaceContract[]

    // Validate module IDs exist ("external" is allowed for environment-facing ports)
    const moduleIds = new Set(modules.map((m) => m.id))
    const validContracts = rawContracts.filter(
      (c) =>
        (moduleIds.has(c.sourceModuleId) || c.sourceModuleId === "external") &&
        (moduleIds.has(c.targetModuleId) || c.targetModuleId === "external"),
    )

    // Run deterministic validation
    let validation = validateInterfaceContracts(modules, validContracts)
    const allContracts = [...validContracts]
    let totalTokensIn = res.tokensIn
    let totalTokensOut = res.tokensOut

    // INTENT: Re-extraction pass — if unmatched ports remain, run a focused second call
    // asking specifically for those ports. This catches gaps the initial prompt missed.
    const unmatchedCount = validation.unmatchedOutputs.length + validation.unmatchedInputs.length
    if (unmatchedCount > 0 && unmatchedCount <= 30) {
      try {
        const unmatchedSummary = buildUnmatchedPortsSummary(modules, validation.unmatchedOutputs, validation.unmatchedInputs)
        const reExtractSystem = `You are an engineering systems integration specialist. You are given ports that were NOT connected in a first pass. For each port, identify its connection — either to another module's port or to the external environment ("external").

Return a JSON array of contracts in the same format:
{
  "sourceModuleId": "module-id or external",
  "sourcePort": "exact port name",
  "targetModuleId": "module-id or external",
  "targetPort": "exact port name",
  "portType": "power|data|mechanical|thermal|fluid|optical|other",
  "sourceSpec": "optional",
  "targetSpec": "optional",
  "compatible": true|false|null,
  "incompatibilityReason": "optional"
}

Rules:
- Copy port names EXACTLY as listed
- Use "external" for ports that interface with the environment
- Return ONLY the JSON array`

        const reExtractRes = await callClaude(reExtractSystem, unmatchedSummary, modelId, 4096)
        totalTokensIn += reExtractRes.tokensIn
        totalTokensOut += reExtractRes.tokensOut

        let reJsonText = reExtractRes.text.trim()
        const reFenceMatch = reJsonText.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (reFenceMatch) reJsonText = reFenceMatch[1].trim()

        const reContracts = JSON.parse(reJsonText) as InterfaceContract[]
        const validReContracts = reContracts.filter(
          (c) =>
            (moduleIds.has(c.sourceModuleId) || c.sourceModuleId === "external") &&
            (moduleIds.has(c.targetModuleId) || c.targetModuleId === "external"),
        )

        // Merge, deduplicating by source→target key
        const existingKeys = new Set(allContracts.map((c) => `${c.sourceModuleId}:${c.sourcePort}→${c.targetModuleId}:${c.targetPort}`))
        for (const c of validReContracts) {
          const key = `${c.sourceModuleId}:${c.sourcePort}→${c.targetModuleId}:${c.targetPort}`
          if (!existingKeys.has(key)) {
            allContracts.push(c)
            existingKeys.add(key)
          }
        }

        // Re-validate merged set
        validation = validateInterfaceContracts(modules, allContracts)
        console.info(`[THE-FORGE] Re-extraction added ${validReContracts.length} contracts, ${validation.unmatchedOutputs.length + validation.unmatchedInputs.length} ports still unmatched`)
      } catch (reErr) {
        console.warn("[THE-FORGE] Re-extraction pass failed (non-critical):", reErr instanceof Error ? reErr.message : reErr)
      }
    }

    return {
      contracts: allContracts,
      unmatchedOutputs: validation.unmatchedOutputs,
      unmatchedInputs: validation.unmatchedInputs,
      warnings: validation.warnings,
      extractionTimeMs: Date.now() - start,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
    }
  } catch (error) {
    console.error("[THE-FORGE] Interface contract extraction failed:", error instanceof Error ? error.message : error)
    return {
      contracts: [],
      unmatchedOutputs: [],
      unmatchedInputs: [],
      warnings: [`Extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`],
      extractionTimeMs: Date.now() - start,
      tokensIn: 0,
      tokensOut: 0,
    }
  }
}

// ─── Smart Diagnostics Pre-Fill ─────────────────────────────────────

/**
 * Uses Claude to pre-fill diagnostic answers based on research + modules.
 *
 * @description Analyses the research report and each module's context to
 * recommend manufacturing process, material, tolerance, surface finish,
 * batch size, and operating environment. Returns a DiagnosticAnswers-shaped
 * object that can be merged into client state.
 *
 * @param modules - Decomposed modules
 * @param researchReport - The full research report text
 * @param modelId - Claude model to use
 * @returns Mapping of moduleId → { questionId → answer }
 *
 * @security Requires authenticated user.
 * @audit None (advisory data, not persisted directly).
 */
export async function prefillDiagnostics(
  modules: CadLabModule[],
  researchReport: string,
  modelId: ClaudeModelId = "claude-opus-4-6",
  domainHint?: CadLabDomain,
  options?: { useConsensusForMaterial?: boolean },
): Promise<{ success: boolean; answers: Record<string, Record<string, string>>; enrichment: DiagnosticEnrichment; error?: string }> {
  // AUTH: Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, answers: {}, enrichment: {}, error: "Unauthorized" }

  // SECURITY: Rate limit
  const rateLimitError = await checkRateLimit("aiCadLab", `ai:${user.id}`)
  if (rateLimitError) return { success: false, answers: {}, enrichment: {}, error: rateLimitError }

  try {
    const domain = domainHint ?? (await detectDomainFromResearchReport(researchReport))
    console.info("[THE-FORGE] Pre-filling diagnostics (domain: %s)...", domain)
    const systemPrompt = getDiagnosticsSystemPrompt(domain)

    const moduleSummaries = modules.map((m) =>
      `Module "${m.name}" (${m.id}): ${m.purpose}. Key parts: ${m.keyParts.join(", ")}. Description: ${m.description.slice(0, 200)}`
    ).join("\n")

    const userPrompt = `Research Report:
${researchReport.slice(0, 3000)}

Modules:
${moduleSummaries}

Recommend diagnostic answers for each module. Output JSON only.`

    const { text } = await callClaude(systemPrompt, userPrompt, modelId, 6144)

    // Parse JSON object from response — AI may wrap in markdown fences or add prose
    const jsonText = extractJsonObject(text)
    const parsed = JSON.parse(jsonText) as Record<string, unknown>

    // INTENT: Support both new { answers, enrichment } format and legacy flat format
    const rawAnswers = (parsed.answers ?? parsed) as Record<string, Record<string, string>>
    const rawEnrichment = (parsed.enrichment ?? {}) as Record<string, Record<string, unknown>>

    // VALIDATION: Only keep valid module IDs and valid question IDs
    const validModuleIds = new Set(modules.map((m) => m.id))
    const validQuestionIds = new Set(["mfg_process", "material", "tolerance", "surface_finish", "batch_size", "environment"])
    const cleanAnswers: Record<string, Record<string, string>> = {}
    const cleanEnrichment: DiagnosticEnrichment = {}

    for (const [moduleId, answers] of Object.entries(rawAnswers)) {
      if (!validModuleIds.has(moduleId)) continue
      cleanAnswers[moduleId] = {}
      for (const [qId, answer] of Object.entries(answers)) {
        if (validQuestionIds.has(qId) && typeof answer === "string") {
          cleanAnswers[moduleId][qId] = answer
        }
      }
    }

    // Validate enrichment structure
    for (const [moduleId, fields] of Object.entries(rawEnrichment)) {
      if (!validModuleIds.has(moduleId)) continue
      cleanEnrichment[moduleId] = {}
      for (const [qId, field] of Object.entries(fields)) {
        if (!validQuestionIds.has(qId)) continue
        const f = field as { reason?: unknown; alternatives?: unknown }
        if (typeof f?.reason !== "string") continue
        const alts = Array.isArray(f.alternatives)
          ? f.alternatives
              .filter((a: unknown): a is { value: string; reason: string } =>
                typeof (a as Record<string, unknown>)?.value === "string" &&
                typeof (a as Record<string, unknown>)?.reason === "string"
              )
              .slice(0, 3)
          : []
        cleanEnrichment[moduleId][qId] = { reason: f.reason, alternatives: alts } satisfies FieldEnrichment
      }
    }

    if (options?.useConsensusForMaterial) {
      const materialSystem = `You recommend exactly one material from this list for a manufacturing module: PLA/PETG, ABS/Nylon, Aluminium, Steel/Iron, Stainless Steel, Copper/Brass, Titanium, Carbon Fiber Composite, CFRP/GFRP, Wood/Plywood, Silicone/Rubber, Glass/Ceramic, PCB/Electronic, Other. Reply with only the single choice, nothing else.`
      for (const mod of modules) {
        if (!cleanAnswers[mod.id]?.material) continue
        try {
          const consensusUser = `Research excerpt:\n${researchReport.slice(0, 1500)}\n\nModule: ${mod.name} (${mod.id}). Purpose: ${mod.purpose}. Key parts: ${mod.keyParts.join(", ")}. Recommend the single best material.`
          const result = await runMaterialConsensus(materialSystem, consensusUser)
          const material = result.consensus ?? result.alternatives[0]?.output ?? cleanAnswers[mod.id].material
          cleanAnswers[mod.id].material = material
          if (!result.agreed) {
            console.info(`[THE-FORGE] Material consensus disagreed for ${mod.id}, using: ${material}`)
          }
        } catch (err) {
          console.warn("[THE-FORGE] Material consensus failed for module", mod.id, err instanceof Error ? err.message : err)
        }
      }
    }

    console.info(`[THE-FORGE] Pre-filled diagnostics for ${Object.keys(cleanAnswers).length} modules (enrichment: ${Object.keys(cleanEnrichment).length} modules)`)

    return { success: true, answers: cleanAnswers, enrichment: cleanEnrichment }
  } catch (error) {
    console.error("[THE-FORGE] Diagnostic pre-fill failed:", error instanceof Error ? error.message : error)
    return { success: false, answers: {}, enrichment: {}, error: "Failed to pre-fill diagnostics" }
  }
}

// ─── Execute Edited CadQuery Code ────────────────────────────────────

/** Result shape from executeCadQueryAction — serializable for client consumption */
export interface ExecuteCadQueryResult {
  stlData?: string
  stepData?: string
  svgIso?: string
  svgTop?: string
  svgFront?: string
  svgBack?: string
  svgRight?: string
  svgLeft?: string
  svgExploded?: string
  bbox?: { xLen: number; yLen: number; zLen: number }
  massGrams?: number
  volumeMm3?: number
  surfaceAreaMm2?: number
  fillRatio?: number
  dfm?: {
    printable: boolean
    issues: Array<{ severity: string; category: string; message: string }>
    estimatedPrintTimeMin: number
    estimatedMaterialG: number
    supportVolumePct: number
    compatiblePrinters: string[]
  }
}

/**
 * Executes user-edited CadQuery code on Modal and returns the result.
 *
 * @description Used by the interactive code editor to re-run modified code
 * without going through the full generation pipeline. Validates the code,
 * executes it on Modal, and returns structured results.
 *
 * @param code - Complete CadQuery Python code to execute
 * @returns Structured result with STL/STEP/SVG data and metrics, or error
 *
 * @security Requires authenticated user. Rate limited.
 */
export async function executeCadQueryAction(
  code: string,
): Promise<{ success: true; result: ExecuteCadQueryResult } | { success: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Unauthorized" }

  // Rate limit
  const rateLimitError = await checkRateLimit("aiCadLab", `ai:${user.id}`)
  if (rateLimitError) return { success: false, error: rateLimitError }

  // VALIDATION: Length bounds to prevent abuse
  if (!code || code.length < 50) {
    return { success: false, error: "Code too short to be a valid CadQuery script" }
  }
  if (code.length > 500_000) {
    return { success: false, error: "Code exceeds 500KB limit" }
  }
  if (!code.includes("import cadquery") && !code.includes("import cq")) {
    return { success: false, error: "Missing CadQuery import" }
  }
  if (!code.includes("result")) {
    return { success: false, error: "No 'result' variable — Modal has nothing to export" }
  }

  // Strip unsafe code
  const safeCode = stripUnsafeCode(code)

  try {
    const modalResult = await executeOnModal(safeCode)

    if (modalResult.error) {
      return { success: false, error: modalResult.error }
    }

    // Map Modal response to client-friendly shape
    const mp = modalResult.analysis?.mass_properties
    const dfmRaw = modalResult.analysis?.dfm
    const bbox = mp?.bounding_box
    const massGrams = mp?.mass_kg != null ? Math.round(mp.mass_kg * 1000) : undefined
    const volumeMm3 = mp?.volume_mm3
    const surfaceAreaMm2 = mp?.surface_area_mm2

    let fillRatio: number | undefined
    if (bbox && volumeMm3) {
      const envelopeVol = bbox.xLen * bbox.yLen * bbox.zLen
      if (envelopeVol > 0) fillRatio = Math.round((volumeMm3 / envelopeVol) * 100)
    }

    const result: ExecuteCadQueryResult = {
      stlData: modalResult.stl ?? undefined,
      stepData: modalResult.step ?? undefined,
      svgIso: modalResult.svg_iso ?? undefined,
      svgTop: modalResult.svg_top ?? undefined,
      svgFront: modalResult.svg_front ?? undefined,
      svgBack: modalResult.svg_back ?? undefined,
      svgRight: modalResult.svg_right ?? undefined,
      svgLeft: modalResult.svg_left ?? undefined,
      svgExploded: modalResult.svg_exploded ?? undefined,
      bbox,
      massGrams,
      volumeMm3,
      surfaceAreaMm2,
      fillRatio,
      dfm: dfmRaw ? {
        printable: dfmRaw.printable ?? false,
        issues: dfmRaw.issues ?? [],
        estimatedPrintTimeMin: dfmRaw.estimated_print_time_min ?? 0,
        estimatedMaterialG: dfmRaw.estimated_material_g ?? 0,
        supportVolumePct: dfmRaw.support_volume_pct ?? 0,
        compatiblePrinters: dfmRaw.compatible_printers ?? [],
      } : undefined,
    }

    return { success: true, result }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Modal execution failed" }
  }
}

// ─── Refine CadQuery Code with Natural Language ─────────────────────

/**
 * Refines existing CadQuery code based on a natural language instruction.
 *
 * @description Uses Claude Sonnet to make targeted modifications to existing
 * CadQuery code. Returns ONLY the modified code, not explanations.
 *
 * @param currentCode - The current CadQuery Python code
 * @param instruction - Natural language instruction (e.g., "make walls 3mm thick")
 * @param moduleContext - Module name/purpose/description for context
 * @returns Modified code or error
 *
 * @security Requires authenticated user. Rate limited.
 */
export async function refineCadQueryCodeAction(
  currentCode: string,
  instruction: string,
  moduleContext: { name: string; purpose: string; description: string },
): Promise<{ success: true; code: string } | { success: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Unauthorized" }

  const rateLimitError = await checkRateLimit("aiCadLab", `ai:${user.id}`)
  if (rateLimitError) return { success: false, error: rateLimitError }

  if (!currentCode.trim() || !instruction.trim()) {
    return { success: false, error: "Code and instruction are required" }
  }
  // SECURITY: Prevent cost amplification and prompt injection via oversized inputs
  if (instruction.length > 2000) {
    return { success: false, error: "Instruction too long (max 2000 characters)" }
  }
  if (currentCode.length > 500_000) {
    return { success: false, error: "Code exceeds 500KB limit" }
  }

  try {
    const systemPrompt = `You are modifying existing CadQuery Python code. Return ONLY the complete modified Python code inside a single \`\`\`python code fence. No explanations before or after.

Rules:
- Keep all existing imports and the "result" variable
- Maintain the parametric structure (variables at top, derived values calculated)
- Do NOT break the code — it must remain executable
- If the instruction is unclear, make your best engineering judgment
- Preserve the result_exploded variable if it exists`

    const userPrompt = `Module: ${moduleContext.name}
Purpose: ${moduleContext.purpose}
Description: ${moduleContext.description}

Current code:
\`\`\`python
${currentCode}
\`\`\`

Instruction: ${instruction}

Return the complete modified code.`

    // DECISION: Use Sonnet for refinement — fast and cheap for targeted edits
    const result = await callClaude(systemPrompt, userPrompt, "claude-sonnet-4-6" as ClaudeModelId, 8192, 120_000, 1)
    const code = extractCode(result.text)

    if (!code.trim()) {
      return { success: false, error: "Refinement returned empty code" }
    }

    return { success: true, code }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Refinement failed" }
  }
}

// ─── Smart Generation (Grammar-First with Fallback) ─────────────────

/**
 * Smart CAD generation that tries grammar-based generation first,
 * then falls back to the raw CadQuery pipeline if no grammar matches.
 *
 * @description This is the recommended entry point for generating CAD models.
 * It first attempts to match the product description to a domain grammar
 * (building, drone, etc.) which produces deterministic, engineering-validated
 * geometry. If no grammar matches, it falls back to the full research →
 * interface → CadQuery pipeline.
 *
 * @param description - Product description from user
 * @param researchReport - Research report (used only if fallback needed)
 * @param interfaceDefinition - Interface definition (used only if fallback needed)
 * @param modelId - Claude model for fallback pipeline
 * @returns CadLabResult with grammarUsed field if grammar was used
 *
 * @security Requires authenticated user.
 * @audit Logs which path was used (grammar vs raw CadQuery).
 */
export async function generateCadLabModelSmart(
  description: string,
  researchReport: string,
  interfaceDefinition: string,
  modelId: ClaudeModelId = "claude-opus-4-6",
  checkpointContext?: string,
  cachedTemplateMatch?: TemplateMatchResult,
  designBrief?: CadLabDesignBrief,
  domainHint?: CadLabDomain,
  blueprintImageUrl?: string,
): Promise<CadLabResult & { grammarUsed?: string }> {
  // ── Try grammar-based generation first ──
  console.info("[THE-FORGE] Smart generation: attempting grammar-based path...")
  try {
    const grammarResult = await generateFromGrammar(description)

    if (grammarResult.success) {
      // INTENT: Run static analysis on grammar-generated code to catch critical issues
      // (e.g. missing `result =`) before returning success
      if (grammarResult.code) {
        const grammarAnalysis = analyzeCadQueryCode(grammarResult.code)
        const hasCritical = grammarAnalysis.some((r) => r.severity === "critical")
        if (hasCritical) {
          console.warn("[THE-FORGE] Grammar code failed static analysis, falling through to raw pipeline:",
            grammarAnalysis.filter((r) => r.severity === "critical").map((r) => r.ruleId))
          // Fall through to raw CadQuery pipeline instead of returning bad grammar result
        } else {
          console.info(`[THE-FORGE] Grammar-based generation succeeded (${grammarResult.grammarUsed})`)
          return grammarResult
        }
      } else {
        console.info(`[THE-FORGE] Grammar-based generation succeeded (${grammarResult.grammarUsed})`)
        return grammarResult
      }
    }

    if (!grammarResult.shouldFallback) {
      // Grammar was found but execution failed — return the error
      console.warn("[THE-FORGE] Grammar found but execution failed:", grammarResult.error)
      return grammarResult
    }

    console.info("[THE-FORGE] No grammar matched, falling back to raw CadQuery pipeline...")
  } catch (err) {
    // Grammar pipeline threw — fall back gracefully
    console.warn("[THE-FORGE] Grammar pipeline error, falling back:", err instanceof Error ? err.message : err)
  }

  // ── Fallback to existing raw CadQuery pipeline ──
  return generateCadLabModel(description, researchReport, interfaceDefinition, modelId, checkpointContext, undefined, cachedTemplateMatch, designBrief, domainHint, blueprintImageUrl)
}

// ─── Mashup Generation ────────────────────────────────────────────────

/**
 * Generates a mashup from 2+ source STEP files and a concept description.
 *
 * @description Pipeline: (1) Claude produces a structured mashup plan from concept + source info,
 * (2) Claude generates CadQuery code that imports STEPs and combines them per the plan,
 * (3) Modal executes the code and returns STEP/STL/SVG, (4) results are uploaded to storage.
 *
 * @param sources - Array of { name, step_url?, step_b64?, bounding_box?, description? }
 * @param concept - User's mashup concept (e.g. "radio player inside a toaster")
 * @param mashupProjectId - Optional project ID for storage path
 * @param modelId - Claude model for planning and code gen
 * @returns MashupResult with plan, code, step_url, stl_url, analysis
 *
 * @security Requires authenticated user. Rate limited.
 */
export async function generateMashup(
  sources: MashupSourceInput[],
  concept: string,
  options?: {
    mashupProjectId?: string
    modelId?: ClaudeModelId
    materialDensity?: number
  },
): Promise<MashupResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Unauthorized" }
  }

  const rateLimitError = await checkRateLimit("aiCadLab", `mashup:${user.id}`)
  if (rateLimitError) {
    return { success: false, error: rateLimitError }
  }

  if (!concept?.trim()) {
    return { success: false, error: "Mashup concept is required" }
  }
  if (!Array.isArray(sources) || sources.length < 2) {
    return { success: false, error: "At least two sources are required" }
  }

  const modelId = options?.modelId ?? "claude-opus-4-6"
  const materialDensity = options?.materialDensity ?? 1240
  const startTime = Date.now()
  let tokensIn = 0
  let tokensOut = 0

  try {
    // ── Resolve source STEPs to base64 ──
    const modalSources: Array<{ name: string; step_b64: string }> = []
    const sourceInfos: Array<{ name: string; description?: string; bounding_box?: { xLen: number; yLen: number; zLen: number } }> = []

    for (let i = 0; i < sources.length; i++) {
      const s = sources[i]
      const name = (s?.name ?? `source_${i}`).trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || `source_${i}`
      let step_b64: string

      if (s?.step_b64) {
        step_b64 = s.step_b64
      } else if (s?.step_url) {
        const res = await fetch(s.step_url, { signal: AbortSignal.timeout(30_000) })
        if (!res.ok) throw new Error(`Failed to fetch source ${name}: ${res.status}`)
        const buf = Buffer.from(await res.arrayBuffer())
        step_b64 = buf.toString("base64")
      } else {
        return { success: false, error: `Source "${name}" must have step_url or step_b64` }
      }

      modalSources.push({ name, step_b64 })
      sourceInfos.push({
        name,
        description: s?.description,
        bounding_box: s?.bounding_box,
      })
    }

    // ── Step 1: Mashup planning ──
    const planSys = getMashupPlanningSystemPrompt()
    const planUser = getMashupPlanningUserPrompt(sourceInfos, concept)
    const planResult = await callClaude(planSys, planUser, modelId, 4096)
    tokensIn += planResult.tokensIn
    tokensOut += planResult.tokensOut

    let plan: MashupPlan
    try {
      plan = JSON.parse(extractJsonObject(planResult.text)) as MashupPlan
    } catch {
      return {
        success: false,
        error: "Failed to parse mashup plan from Claude response",
        tokensIn,
        tokensOut,
        elapsedMs: Date.now() - startTime,
      }
    }

    if (!plan.strategy || !Array.isArray(plan.steps)) {
      return {
        success: false,
        error: "Invalid mashup plan: missing strategy or steps",
        mashup_plan: plan,
        tokensIn,
        tokensOut,
        elapsedMs: Date.now() - startTime,
      }
    }

    // ── Step 2: Code generation ──
    const sourceNames = modalSources.map((s) => s.name)
    const codeSys = getMashupCodeGenSystemPrompt(sourceNames)
    const codeUser = getMashupCodeGenUserPrompt(plan, sourceNames)
    const codeResult = await callClaude(codeSys, codeUser, modelId, 16384)
    tokensIn += codeResult.tokensIn
    tokensOut += codeResult.tokensOut

    let mashupCode = extractCode(codeResult.text)
    mashupCode = stripUnsafeCode(mashupCode)

    // J3: Pre-exec validation — catch syntax/CadQuery errors before burning a Modal cold start
    const preExecResults = [
      ...checkPythonSyntax(mashupCode),
      ...analyzeCadQueryCode(mashupCode),
    ]
    const criticalPreExec = preExecResults.filter((r) => r.severity === "critical")
    if (criticalPreExec.length > 0) {
      console.warn(`[THE-FORGE] Mashup pre-exec: ${criticalPreExec.length} critical issue(s), attempting repair`)
      const repairPrompt = `The following CadQuery mashup code has critical issues:\n\nISSUES:\n${criticalPreExec.map((r) => `[${r.ruleId}] ${r.message}${r.repairHint ? ` — Fix: ${r.repairHint}` : ""}`).join("\n")}\n\nORIGINAL CODE:\n\`\`\`python\n${mashupCode}\n\`\`\`\n\nFix ALL listed issues. Output corrected Python code in a single \`\`\`python code fence.`
      const repairResult = await callClaude(codeSys, repairPrompt, modelId, 16384)
      tokensIn += repairResult.tokensIn
      tokensOut += repairResult.tokensOut
      const repairedCode = extractCode(repairResult.text)
      if (repairedCode.trim() && repairedCode.trim() !== mashupCode.trim()) {
        mashupCode = stripUnsafeCode(repairedCode)
      }
    }

    // ── Step 3: Execute on Modal (with single retry on failure) ──
    let modalResult = await executeMashupOnModal(modalSources, mashupCode, materialDensity)

    // J3: Single retry — if Modal fails, categorize error and attempt one repair
    if (modalResult.error && !modalResult.step) {
      const errorCat = categorizeModalError(modalResult.error)
      const catLabel = errorCat?.category ?? "unknown"
      console.warn(`[THE-FORGE] Mashup Modal failed (${catLabel}), attempting single retry`)
      const retryPrompt = `The following CadQuery mashup code failed during execution:\n\nERROR (${catLabel}): ${modalResult.error}\n\nORIGINAL CODE:\n\`\`\`python\n${mashupCode}\n\`\`\`\n\nFix the error. Output corrected Python code in a single \`\`\`python code fence.`
      const retryResult = await callClaude(codeSys, retryPrompt, modelId, 16384)
      tokensIn += retryResult.tokensIn
      tokensOut += retryResult.tokensOut
      const retriedCode = extractCode(retryResult.text)
      if (retriedCode.trim() && retriedCode.trim() !== mashupCode.trim()) {
        mashupCode = stripUnsafeCode(retriedCode)
        modalResult = await executeMashupOnModal(modalSources, mashupCode, materialDensity)
      }

      if (modalResult.error && !modalResult.step) {
        return {
          success: false,
          error: modalResult.error,
          mashup_plan: plan,
          mashup_code: mashupCode,
          tokensIn,
          tokensOut,
          elapsedMs: Date.now() - startTime,
          error_category: catLabel,
        }
      }
    }

    // ── Step 4: Upload to storage ──
    const pathPrefix = options?.mashupProjectId
      ? `cad-lab/mashup/${options.mashupProjectId}`
      : `cad-lab/mashup/${user.id}/${startTime}`
    const bucket = "xray-images"
    const admin = createAdminClient()
    let stepUrl = ""
    let stlUrl = ""

    if (modalResult.step) {
      const { error: stepErr } = await admin.storage
        .from(bucket)
        .upload(`${pathPrefix}/mashup.step`, Buffer.from(modalResult.step, "base64"), {
          contentType: "application/step",
          upsert: true,
        })
      if (!stepErr) {
        const { data: d } = admin.storage.from(bucket).getPublicUrl(`${pathPrefix}/mashup.step`)
        stepUrl = d.publicUrl
      }
    }
    if (modalResult.stl) {
      const { error: stlErr } = await admin.storage
        .from(bucket)
        .upload(`${pathPrefix}/mashup.stl`, Buffer.from(modalResult.stl, "base64"), {
          contentType: "model/stl",
          upsert: true,
        })
      if (!stlErr) {
        const { data: d } = admin.storage.from(bucket).getPublicUrl(`${pathPrefix}/mashup.stl`)
        stlUrl = d.publicUrl
      }
    }

    const elapsedMs = Date.now() - startTime
    console.info("[THE-FORGE] Mashup generation complete:", { elapsedMs, sourceCount: sources.length })

    return {
      success: true,
      mashup_plan: plan,
      mashup_code: mashupCode,
      step_url: stepUrl || undefined,
      stl_url: stlUrl || undefined,
      step_b64: modalResult.step ?? undefined,
      stl_b64: modalResult.stl ?? undefined,
      svg_iso: modalResult.svg_iso ?? undefined,
      analysis: modalResult.analysis,
      elapsedMs,
      tokensIn,
      tokensOut,
    }
  } catch (err) {
    const msg = sanitizeErrorMessage(err)
    console.error("[THE-FORGE] Mashup generation failed:", msg)
    return {
      success: false,
      error: msg,
      elapsedMs: Date.now() - startTime,
      tokensIn,
      tokensOut,
    }
  }
}

// ─── Mashup Split API (plan then execute) ─────────────────────────────

/**
 * Phase 1: Plans a mashup without executing it.
 *
 * INTENT: Splitting the pipeline lets the UI show the mashup plan (strategy,
 * assembly steps, part names) ~10-15s into the process while the heavier
 * code-gen + Modal execution continues in a second call. This turns 1-3 min
 * of dead time into an engaging "here's what we're building" reveal.
 *
 * @param sources - 2+ STEP source inputs
 * @param concept - Natural language concept description
 * @returns MashupPlanResult with the plan and resolved sources (for phase 2)
 */
export async function planMashup(
  sources: MashupSourceInput[],
  concept: string,
  options?: { modelId?: ClaudeModelId },
): Promise<MashupPlanResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Unauthorized" }

  const rateLimitError = await checkRateLimit("aiCadLab", `mashup:${user.id}`)
  if (rateLimitError) return { success: false, error: rateLimitError }

  if (!concept?.trim()) return { success: false, error: "Mashup concept is required" }
  if (!Array.isArray(sources) || sources.length < 2) {
    return { success: false, error: "At least two sources are required" }
  }

  const modelId = options?.modelId ?? "claude-opus-4-6"
  const startTime = Date.now()

  try {
    const resolvedSources: Array<{ name: string; step_b64: string }> = []
    const sourceInfos: Array<{ name: string; description?: string; bounding_box?: { xLen: number; yLen: number; zLen: number } }> = []

    for (let i = 0; i < sources.length; i++) {
      const s = sources[i]
      const name = (s?.name ?? `source_${i}`).trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || `source_${i}`
      let step_b64: string

      if (s?.step_b64) {
        step_b64 = s.step_b64
      } else if (s?.step_url) {
        const res = await fetch(s.step_url, { signal: AbortSignal.timeout(30_000) })
        if (!res.ok) throw new Error(`Failed to fetch source ${name}: ${res.status}`)
        const buf = Buffer.from(await res.arrayBuffer())
        step_b64 = buf.toString("base64")
      } else {
        return { success: false, error: `Source "${name}" must have step_url or step_b64` }
      }

      resolvedSources.push({ name, step_b64 })
      sourceInfos.push({ name, description: s?.description, bounding_box: s?.bounding_box })
    }

    const planSys = getMashupPlanningSystemPrompt()
    const planUser = getMashupPlanningUserPrompt(sourceInfos, concept)
    const planResult = await callClaude(planSys, planUser, modelId, 4096)

    let plan: MashupPlan
    try {
      plan = JSON.parse(extractJsonObject(planResult.text)) as MashupPlan
    } catch {
      return {
        success: false,
        error: "Failed to parse mashup plan from Claude response",
        tokensIn: planResult.tokensIn,
        tokensOut: planResult.tokensOut,
        elapsedMs: Date.now() - startTime,
      }
    }

    if (!plan.strategy || !Array.isArray(plan.steps)) {
      return {
        success: false,
        error: "Invalid mashup plan: missing strategy or steps",
        tokensIn: planResult.tokensIn,
        tokensOut: planResult.tokensOut,
        elapsedMs: Date.now() - startTime,
      }
    }

    return {
      success: true,
      plan,
      resolvedSources,
      sourceInfos: sourceInfos.map(({ name, description }) => ({ name, description })),
      tokensIn: planResult.tokensIn,
      tokensOut: planResult.tokensOut,
      elapsedMs: Date.now() - startTime,
    }
  } catch (err) {
    const msg = sanitizeErrorMessage(err)
    console.error("[THE-FORGE] planMashup failed:", msg)
    return { success: false, error: msg, elapsedMs: Date.now() - startTime }
  }
}

/**
 * Phase 2: Executes a previously-planned mashup (code gen + Modal + upload).
 *
 * INTENT: Called after planMashup. The UI already has the plan displayed, so
 * this phase handles the heavy compute: CadQuery code generation, Modal
 * execution, and file upload.
 *
 * @param resolvedSources - Sources with base64 STEP data (from planMashup)
 * @param plan - The MashupPlan from phase 1
 * @param concept - Original concept (for logging)
 * @returns MashupExecuteResult with URLs and artifacts
 */
export async function executeMashupPlan(
  resolvedSources: Array<{ name: string; step_b64: string }>,
  plan: MashupPlan,
  concept: string,
  options?: { modelId?: ClaudeModelId; materialDensity?: number; mashupProjectId?: string },
): Promise<MashupExecuteResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Unauthorized" }

  const modelId = options?.modelId ?? "claude-opus-4-6"
  const materialDensity = options?.materialDensity ?? 1240
  const startTime = Date.now()
  let tokensIn = 0
  let tokensOut = 0

  try {
    const sourceNames = resolvedSources.map((s) => s.name)
    const codeSys = getMashupCodeGenSystemPrompt(sourceNames)
    const codeUser = getMashupCodeGenUserPrompt(plan, sourceNames)
    const codeResult = await callClaude(codeSys, codeUser, modelId, 16384)
    tokensIn += codeResult.tokensIn
    tokensOut += codeResult.tokensOut

    let mashupCode = extractCode(codeResult.text)
    mashupCode = stripUnsafeCode(mashupCode)

    // Pre-flight: generated code must assign final geometry to "result"
    if (!/\bresult\s*=/.test(mashupCode)) {
      return {
        success: false,
        error:
          "Generated mashup code does not assign the final model to 'result'. The CadQuery script must end with result = <Workplane>. Please try again.",
        mashup_plan: plan,
        mashup_code: mashupCode,
        tokensIn,
        tokensOut,
        elapsedMs: Date.now() - startTime,
      }
    }

    // J3: Pre-exec validation — catch syntax/CadQuery errors before Modal
    const assemblyPreExec = [
      ...checkPythonSyntax(mashupCode),
      ...analyzeCadQueryCode(mashupCode),
    ]
    const assemblyCritical = assemblyPreExec.filter((r) => r.severity === "critical")
    if (assemblyCritical.length > 0) {
      console.warn(`[THE-FORGE] Assembly pre-exec: ${assemblyCritical.length} critical issue(s), attempting repair`)
      const repairPrompt = `The following CadQuery assembly code has critical issues:\n\nISSUES:\n${assemblyCritical.map((r) => `[${r.ruleId}] ${r.message}${r.repairHint ? ` — Fix: ${r.repairHint}` : ""}`).join("\n")}\n\nORIGINAL CODE:\n\`\`\`python\n${mashupCode}\n\`\`\`\n\nFix ALL listed issues. Output corrected Python code in a single \`\`\`python code fence.`
      const repairResult = await callClaude(codeSys, repairPrompt, modelId, 16384)
      tokensIn += repairResult.tokensIn
      tokensOut += repairResult.tokensOut
      const repairedCode = extractCode(repairResult.text)
      if (repairedCode.trim() && repairedCode.trim() !== mashupCode.trim()) {
        mashupCode = stripUnsafeCode(repairedCode)
      }
    }

    let modalResult = await executeMashupOnModal(resolvedSources, mashupCode, materialDensity)

    // J3: Single retry — if Modal fails, categorize error and attempt one repair
    if (modalResult.error && !modalResult.step) {
      const errorCat = categorizeModalError(modalResult.error)
      const catLabel = errorCat?.category ?? "unknown"
      console.warn(`[THE-FORGE] Assembly Modal failed (${catLabel}), attempting single retry`)
      const retryPrompt = `The following CadQuery assembly code failed during execution:\n\nERROR (${catLabel}): ${modalResult.error}\n\nORIGINAL CODE:\n\`\`\`python\n${mashupCode}\n\`\`\`\n\nFix the error. Output corrected Python code in a single \`\`\`python code fence.`
      const retryResult = await callClaude(codeSys, retryPrompt, modelId, 16384)
      tokensIn += retryResult.tokensIn
      tokensOut += retryResult.tokensOut
      const retriedCode = extractCode(retryResult.text)
      if (retriedCode.trim() && retriedCode.trim() !== mashupCode.trim()) {
        mashupCode = stripUnsafeCode(retriedCode)
        modalResult = await executeMashupOnModal(resolvedSources, mashupCode, materialDensity)
      }

      if (modalResult.error && !modalResult.step) {
        return {
          success: false,
          error: modalResult.error,
          mashup_plan: plan,
          mashup_code: mashupCode,
          tokensIn,
          tokensOut,
          elapsedMs: Date.now() - startTime,
          error_category: catLabel,
        }
      }
    }

    const pathPrefix = options?.mashupProjectId
      ? `cad-lab/mashup/${options.mashupProjectId}`
      : `cad-lab/mashup/${user.id}/${startTime}`
    const bucket = "xray-images"
    const admin = createAdminClient()
    let stepUrl = ""
    let stlUrl = ""

    if (modalResult.step) {
      const { error: stepErr } = await admin.storage
        .from(bucket)
        .upload(`${pathPrefix}/mashup.step`, Buffer.from(modalResult.step, "base64"), {
          contentType: "application/step",
          upsert: true,
        })
      if (!stepErr) {
        const { data: d } = admin.storage.from(bucket).getPublicUrl(`${pathPrefix}/mashup.step`)
        stepUrl = d.publicUrl
      }
    }
    if (modalResult.stl) {
      const { error: stlErr } = await admin.storage
        .from(bucket)
        .upload(`${pathPrefix}/mashup.stl`, Buffer.from(modalResult.stl, "base64"), {
          contentType: "model/stl",
          upsert: true,
        })
      if (!stlErr) {
        const { data: d } = admin.storage.from(bucket).getPublicUrl(`${pathPrefix}/mashup.stl`)
        stlUrl = d.publicUrl
      }
    }

    const elapsedMs = Date.now() - startTime
    console.info("[THE-FORGE] executeMashupPlan complete:", { elapsedMs, sourceCount: resolvedSources.length })

    return {
      success: true,
      mashup_plan: plan,
      mashup_code: mashupCode,
      step_url: stepUrl || undefined,
      stl_url: stlUrl || undefined,
      step_b64: modalResult.step ?? undefined,
      stl_b64: modalResult.stl ?? undefined,
      svg_iso: modalResult.svg_iso ?? undefined,
      analysis: modalResult.analysis,
      elapsedMs,
      tokensIn,
      tokensOut,
    }
  } catch (err) {
    const msg = sanitizeErrorMessage(err)
    console.error("[THE-FORGE] executeMashupPlan failed:", msg)
    return {
      success: false,
      error: msg,
      mashup_plan: plan,
      elapsedMs: Date.now() - startTime,
      tokensIn,
      tokensOut,
    }
  }
}

// ─── System Assembly (Integration Step) ───────────────────────────────

/**
 * Generates a combined system assembly from all generated module STEP files.
 *
 * @description Components-first assembly: template components (real parts from the
 * 7,400+ library) are positioned as anchors, then generated geometry (chassis,
 * adapters, mounting plates) is positioned relative to them. Uses interface
 * definitions with placement tables and connection maps for spatial context.
 *
 * FLOW: Auth → Load project → Validate modules → Fetch STEPs → Classify →
 *       Claude code gen → Sanitise → Execute on Modal → Upload → Return URLs
 *
 * @param projectId - CAD Lab project ID (must have all modules generated)
 * @returns Assembly STL/STEP URLs on success, or error
 *
 * @security Requires authenticated user; rate-limited; SSRF + size guards on STEP fetches.
 */
export async function generateSystemAssembly(
  projectId: string,
): Promise<
  | { success: true; stlUrl: string; stepUrl: string; assemblyCode?: string }
  | { success: false; error: string; assemblyCode?: string }
> {
  // VALIDATION: Check UUID format to prevent path traversal in storage paths
  if (!projectId || !/^[0-9a-f-]{36}$/.test(projectId)) {
    return { success: false, error: "Invalid project ID" }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Unauthorized" }

  // SECURITY: Rate limit AI calls to prevent cost abuse
  const rateLimitError = await checkRateLimit("aiCadLab", `ai:${user.id}`)
  if (rateLimitError) return { success: false, error: rateLimitError }

  const startTime = Date.now()

  // DECISION: 12 modules is safe — cq.Assembly() has linear memory cost (no booleans).
  // Modal allocates 8GB + 600s timeout, plenty for 12 STEP imports.
  const ASSEMBLY_MAX_MODULES = 12

  try {
    // ── Load project with modules ──
    const { data: project, error: loadErr } = await supabase
      .from("cad_lab_projects")
      .select("id, subject, modules, interface_contracts")
      .eq("id", projectId)
      .single()

    if (loadErr || !project) {
      return { success: false, error: "Project not found" }
    }

    const modules = (project.modules as CadLabModule[] | null) ?? []
    // R1: Extract validated interface contracts for richer assembly positioning
    const interfaceContracts = (project.interface_contracts as InterfaceContractResult | null)?.contracts ?? []
    if (modules.length === 0) {
      return { success: false, error: "No modules found in project" }
    }

    // SECURITY: Modal /mashup endpoint limits source count
    if (modules.length > ASSEMBLY_MAX_MODULES) {
      return {
        success: false,
        error: `Assembly supports up to ${ASSEMBLY_MAX_MODULES} modules (this project has ${modules.length}).`,
      }
    }

    // ── Validate all modules are generated with STEP URLs ──
    const incomplete = modules.filter((m) => m.status !== "generated" || !m.result?.stepUrl)
    if (incomplete.length > 0) {
      const names = incomplete.map((m) => m.name).join(", ")
      return { success: false, error: `Modules not ready: ${names}. All modules must be generated before assembly.` }
    }

    // ── Fetch all module STEPs sequentially (with SSRF + size guards) ──
    const MAX_CUMULATIVE_SIZE = 200 * 1024 * 1024 // 200MB total
    let cumulativeSize = 0
    const resolvedSources: Array<{ name: string; step_b64: string }> = []

    for (const mod of modules) {
      const stepUrl = mod.result!.stepUrl!
      const safeName = mod.id.replace(/[^a-z0-9_-]/g, "_")

      // SECURITY: Validate URL before fetching (SSRF protection)
      if (!(await isAllowedStepUrl(stepUrl))) {
        return { success: false, error: `Module "${mod.name}" STEP URL blocked by allowlist` }
      }

      const stepResponse = await fetch(stepUrl, { signal: AbortSignal.timeout(60_000) })
      if (!stepResponse.ok) {
        return { success: false, error: `Failed to fetch STEP for module "${mod.name}" (${stepResponse.status})` }
      }

      // SECURITY: Check Content-Length to prevent memory exhaustion
      const contentLength = stepResponse.headers.get("content-length")
      if (contentLength && parseInt(contentLength, 10) > MAX_STEP_FILE_SIZE) {
        return { success: false, error: `STEP file too large for module "${mod.name}" (${contentLength} bytes)` }
      }

      const stepBuffer = await stepResponse.arrayBuffer()

      // Runtime size check (Content-Length header can be missing or spoofed)
      if (stepBuffer.byteLength > MAX_STEP_FILE_SIZE) {
        return { success: false, error: `STEP file too large for module "${mod.name}" (${stepBuffer.byteLength} bytes)` }
      }

      cumulativeSize += stepBuffer.byteLength
      if (cumulativeSize > MAX_CUMULATIVE_SIZE) {
        return { success: false, error: `Cumulative STEP file size exceeds 200MB limit` }
      }

      resolvedSources.push({
        name: safeName,
        step_b64: Buffer.from(stepBuffer).toString("base64"),
      })
    }

    // ── Classify modules and build AssemblyModuleInfo ──
    let templateCount = 0
    const assemblyModules: AssemblyModuleInfo[] = modules.map((mod, i) => {
      const safeName = resolvedSources[i].name
      const isTemplate = !!(mod.seedTemplateSlug || mod.result?.seedTemplateSlug)
      if (isTemplate) templateCount++

      const massProps = mod.result?.massProperties
      const cog = massProps?.centerOfGravity

      return {
        name: safeName,
        displayName: mod.name,
        isTemplateComponent: isTemplate,
        seedTemplateSlug: mod.seedTemplateSlug || mod.result?.seedTemplateSlug,
        bbox: mod.result?.bbox,
        centerOfGravity: cog,
        massGrams: mod.result?.massGrams,
        purpose: mod.purpose,
        keyParts: mod.keyParts ?? [],
        inputs: mod.inputs ?? [],
        outputs: mod.outputs ?? [],
        interfaceDefinition: mod.interfaceDefinition || mod.result?.interfaceDefinition,
      }
    })

    console.info("[THE-FORGE] Assembly: sources resolved", {
      moduleCount: modules.length,
      templateCount,
      cumulativeSizeMB: (cumulativeSize / (1024 * 1024)).toFixed(1),
    })

    // ── Generate assembly CadQuery code via Claude (with retry) ──
    const sourceNames = resolvedSources.map((s) => s.name)
    const systemPrompt = getAssemblyCodeGenSystemPrompt(sourceNames)
    const baseUserPrompt = getAssemblyCodeGenUserPrompt(assemblyModules, project.subject ?? "product", interfaceContracts)

    const MAX_ATTEMPTS = 2
    let lastCode: string | undefined
    let lastError: string | undefined

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let userPrompt = baseUserPrompt
      if (attempt > 1 && lastError && lastCode) {
        console.info(`[THE-FORGE] Assembly: attempt ${attempt - 1} failed, retrying with error context`)
        userPrompt += `\n\nPREVIOUS ATTEMPT FAILED:\nError: ${lastError}\nCode:\n\`\`\`python\n${lastCode}\n\`\`\`\nFix the issue.`
      }

      const codeResult = await callClaude(systemPrompt, userPrompt, "claude-sonnet-4-6", 16384)

      let assemblyCode = extractCode(codeResult.text)

      // SECURITY: Defence-in-depth. Modal's validate_code() catches these too,
      // but stripping here avoids wasting a Modal call on obviously bad code.
      assemblyCode = stripUnsafeCode(assemblyCode)

      lastCode = assemblyCode

      // Pre-flight: generated code must assign final geometry to "result"
      if (!/\bresult\s*=/.test(assemblyCode)) {
        lastError = "Generated assembly code does not assign the final model to 'result'."
        if (attempt < MAX_ATTEMPTS) continue
        return {
          success: false,
          error: lastError,
          assemblyCode: lastCode,
        }
      }

      // ── Execute on Modal ──
      const modalResult = await executeMashupOnModal(resolvedSources, assemblyCode)

      if (modalResult.error && !modalResult.step) {
        lastError = `Modal execution failed: ${modalResult.error}`
        if (attempt < MAX_ATTEMPTS) continue
        return { success: false, error: lastError, assemblyCode: lastCode }
      }

      // ── Upload STEP + STL to Supabase Storage ──
      const pathPrefix = `cad-lab/assembly/${projectId}`
      const bucket = "xray-images"
      const admin = createAdminClient()
      let stepUrl = ""
      let stlUrl = ""

      if (modalResult.step) {
        const { error: stepErr } = await admin.storage
          .from(bucket)
          .upload(`${pathPrefix}/assembly.step`, Buffer.from(modalResult.step, "base64"), {
            contentType: "application/step",
            upsert: true,
          })
        if (stepErr) {
          console.error("[THE-FORGE] Assembly STEP upload failed:", stepErr.message)
        } else {
          const { data: d } = admin.storage.from(bucket).getPublicUrl(`${pathPrefix}/assembly.step`)
          stepUrl = d.publicUrl
        }
      }
      if (modalResult.stl) {
        const { error: stlErr } = await admin.storage
          .from(bucket)
          .upload(`${pathPrefix}/assembly.stl`, Buffer.from(modalResult.stl, "base64"), {
            contentType: "model/stl",
            upsert: true,
          })
        if (stlErr) {
          console.error("[THE-FORGE] Assembly STL upload failed:", stlErr.message)
        } else {
          const { data: d } = admin.storage.from(bucket).getPublicUrl(`${pathPrefix}/assembly.stl`)
          stlUrl = d.publicUrl
        }
      }

      if (!stepUrl && !stlUrl) {
        return { success: false, error: "Assembly executed but no output files were produced", assemblyCode: lastCode }
      }

      const elapsedMs = Date.now() - startTime
      console.info("[THE-FORGE] Assembly complete:", {
        projectId,
        elapsedMs,
        moduleCount: modules.length,
        templateCount,
        attempts: attempt,
        tokensIn: codeResult.tokensIn,
        tokensOut: codeResult.tokensOut,
      })

      return { success: true, stlUrl, stepUrl, assemblyCode: lastCode }
    }

    // INTENT: Unreachable — loop always returns. Satisfies TypeScript.
    return { success: false, error: lastError ?? "Assembly generation failed", assemblyCode: lastCode }
  } catch (err) {
    const msg = sanitizeErrorMessage(err)
    console.error("[THE-FORGE] generateSystemAssembly failed:", msg)
    return { success: false, error: msg }
  }
}

// ─── Mashup Concept Suggestions ───────────────────────────────────────

/**
 * Suggests 3–4 STEP template combinations for a given natural language concept.
 *
 * @description Fetches all step_templates, sends them + the user's query to
 * Claude (fast variant for real-time UX), and returns curated mashup "recipes"
 * each with a name, description, pre-filled concept text, and resolved sources.
 *
 * INTENT: Discovery layer for Mashup Lab. Before this, users had to manually
 * browse 200+ templates with no guidance. Now they describe what they want
 * and get smart starting combinations in seconds.
 *
 * @param query - Natural language description, e.g. "humanoid robot with quadcopter propellers"
 * @returns Array of MashupSuggestion objects with resolved sources, or error string
 */
export async function suggestMashupCombinations(
  query: string,
): Promise<{ suggestions: MashupSuggestion[] } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const trimmedQuery = query.trim()
  if (!trimmedQuery) return { error: "Query is required" }

  const { data: templates, error: dbError } = await supabase
    .from("step_templates")
    .select("id, slug, name, category, subcategory, description, step_url, stl_url, thumbnail_url")
    .order("name")
    .limit(500)

  if (dbError) {
    console.error("[THE-FORGE] suggestMashupCombinations: failed to fetch templates:", dbError.message)
    return { error: "Failed to load template library" }
  }

  const templateList = (templates ?? []) as Array<{
    id: string
    slug: string
    name: string
    category: string
    subcategory: string | null
    description: string | null
    step_url: string | null
    stl_url: string | null
    thumbnail_url: string | null
  }>

  if (templateList.length === 0) return { error: "No templates available" }

  const catalogue = templateList
    .map((t) => `${t.slug} | ${t.name} | ${t.category}${t.subcategory ? `/${t.subcategory}` : ""}`)
    .join("\n")

  const systemPrompt = `You are a creative mechanical designer and mashup concept generator for ForgeOS Mashup Lab.
Your job: given a user's concept description and a library of available STEP template files, suggest 3–4 coherent, imaginative, and physically plausible STEP file combinations.

Rules:
- ONLY use slugs that appear in the provided template catalogue. Do not invent slugs.
- Each suggestion must use 2–4 templates.
- Prefer combinations where the parts can realistically be merged (attach, stack, integrate).
- The "concept" field should be a vivid 1–2 sentence description of the resulting hybrid product that the AI will use as its generation brief.
- Return ONLY valid JSON — no markdown fences, no explanation outside the JSON array.

Response format (JSON array):
[
  {
    "name": "Short catchy name for the mashup",
    "description": "One sentence on how the parts combine",
    "concept": "2-sentence generation brief describing the hybrid product and how parts relate spatially",
    "templateSlugs": ["slug-one", "slug-two", "slug-three"]
  }
]`

  const userPrompt = `User concept: "${trimmedQuery}"

Available templates (slug | name | category):
${catalogue}

Return 3–4 suggestions as a JSON array.`

  try {
    // DECISION: Using claude-sonnet-4-6 (fast variant) — this is a
    // lightweight template-matching task, not code generation. Speed matters
    // here for a real-time UX response.
    const { text } = await callClaude(systemPrompt, userPrompt, "claude-sonnet-4-6", 2048)

    let raw: Array<{ name: string; description: string; concept: string; templateSlugs: string[] }>
    try {
      raw = JSON.parse(extractJsonArray(text))
    } catch {
      console.error("[THE-FORGE] suggestMashupCombinations: JSON parse failed:", text.slice(0, 300))
      return { error: "Failed to parse suggestions from AI response" }
    }

    if (!Array.isArray(raw)) return { error: "Unexpected AI response format" }

    const templateBySlug = new Map(templateList.map((t) => [t.slug, t]))

    const suggestions: MashupSuggestion[] = raw
      .slice(0, 4)
      .map((s) => {
        const sourceCandidates = (s.templateSlugs ?? []).map((slug): MashupSourceInput | null => {
          const t = templateBySlug.get(slug)
          if (!t) return null
          const url = t.step_url ?? t.stl_url
          if (!url) return null
          return {
            name: t.slug.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || t.slug,
            step_url: url,
            description: t.description ?? t.name,
            thumbnail_url: t.thumbnail_url ?? undefined,
          }
        })
        const sources: MashupSourceInput[] = sourceCandidates.filter(
          (x): x is MashupSourceInput => x !== null
        )
        return {
          name: s.name ?? "Unnamed mashup",
          description: s.description ?? "",
          concept: s.concept ?? "",
          templateSlugs: s.templateSlugs ?? [],
          sources,
        } satisfies MashupSuggestion
      })
      .filter((s) => s.sources.length >= 2)

    return { suggestions }
  } catch (err) {
    const msg = sanitizeErrorMessage(err)
    console.error("[THE-FORGE] suggestMashupCombinations failed:", msg)
    return { error: "Failed to generate suggestions. Please try again." }
  }
}
