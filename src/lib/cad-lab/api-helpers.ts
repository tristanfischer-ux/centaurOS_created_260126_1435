/**
 * @file api-helpers.ts — Shared AI API call helpers for the CAD Lab pipeline.
 *
 * @description Extracted from actions/cad-lab.ts to enable file splitting.
 * Contains: callClaude, callGeminiWithSearch, callGeminiPlain, extractJson
 * helpers, Thingiverse search, Modal execution, code extraction, sector lookup.
 *
 * These are pure functions (no server action auth) — they take API keys and
 * Supabase clients as parameters rather than creating them internally.
 */

import type { ClaudeModelId } from "@/lib/cad-lab-types"
import type { Sector } from "@/types/foundry"
import { createClient } from "@/lib/supabase/server"
import { fetchWithTimeout } from "@/lib/fetch-with-timeout"
import { withRetry } from "@/lib/retry"

// ─── Sector Lookup ───────────────────────────────────────────────────

/**
 * Looks up the authenticated user's foundry sector for component filtering.
 *
 * @param supabase - Authenticated Supabase client
 * @param userId - Authenticated user ID
 * @returns The sector string or null if not set
 */
export async function lookupUserSector(
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
export function extractJsonArray(text: string): string {
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
export function extractJsonObject(text: string): string {
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
export async function callClaude(
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
export async function callGeminiWithSearch(
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

  // SECURITY: API key in header, not URL — prevents leaking in fetch error messages and server logs
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
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
    .filter((c): c is { web: { uri: string; title: string } } => {
      if (!c.web?.uri || !c.web?.title) return false
      // SECURITY: Reject non-HTTP(S) URLs from search results (prevents javascript: injection)
      try { return /^https?:$/.test(new URL(c.web.uri).protocol) } catch { return false }
    })
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
export async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  modelId: string = "gemini-3.1-pro-preview",
  maxTokens: number = 8192,
  timeoutMs: number = 120_000,
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim()
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured")

  // SECURITY: API key in header, not URL — prevents leaking in fetch error messages and server logs
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
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

export async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  modelId: string = "gpt-5.3-chat-latest",
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

export async function callTogether(
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
export interface ThingiverseResult {
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
export async function searchCadModels(
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
      .filter((h): h is { name: string; public_url: string; description: string; preview_image?: string } => {
        if (!h.name || !h.public_url) return false
        // SECURITY: Reject non-HTTP(S) URLs from Thingiverse results
        try { return /^https?:$/.test(new URL(h.public_url).protocol) } catch { return false }
      })
      .slice(0, 5)
      .map((h) => ({
        name: h.name.slice(0, 200),
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

export interface ModalResponse {
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
export function getModalCadBaseUrl(): string {
  const url = process.env.MODAL_CAD_ENDPOINT_URL
  if (!url) throw new Error("MODAL_CAD_ENDPOINT_URL not configured")
  return url.replace(/\/$/, "")
}

export async function executeOnModal(code: string): Promise<ModalResponse> {
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
export interface MashupModalResponse {
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
export async function executeMashupOnModal(
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
export function extractCode(text: string): string {
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
export function extractAssumptions(
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
