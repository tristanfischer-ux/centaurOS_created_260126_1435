/**
 * @file image-generator.ts — Image generation for X-Ray blueprints
 *
 * @description Image generation with automatic provider fallback:
 * - Primary: Gemini 3 Pro Image (gemini-3-pro-image-preview) — highest quality 4K blueprints
 * - Fallback: OpenAI gpt-image-1 — activated on retryable errors (503, 429, network)
 *
 * Uses direct Gemini REST API calls with full imageConfig support.
 * Falls back to OpenAI SDK when Gemini is unavailable.
 *
 * @security Requires GOOGLE_AI_API_KEY; optionally OPENAI_API_KEY for fallback
 *
 * @related
 * - AI provider registry: src/lib/ai-providers/registry.ts (existing Gemini pattern)
 * - Server actions: src/actions/xray.ts (orchestrates generation)
 * - Error classification: src/lib/agents/error-classification.ts (retryable error detection)
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { isRetryableError } from "@/lib/agents/error-classification"

import type { ModuleSpec, XRaySpec } from "./xray-schema"
import type { StructuralBrief, SystemStructuralBrief } from "./structural-brief"

// ─── Constants ───────────────────────────────────────────────────────

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
const MODULE_MODEL = "gemini-3-pro-image-preview" // Gemini 3 Pro Image (Nano Banana Pro) — highest quality 4K blueprints
const SYSTEM_MODEL = "gemini-3-pro-image-preview" // Gemini 3 Pro Image — professional system P&ID diagrams
const OPENAI_IMAGE_MODEL = "gpt-image-1" // OpenAI fallback — high-quality technical illustrations
const STORAGE_BUCKET = "xray-images"

// ─── Types ───────────────────────────────────────────────────────────

interface GeminiImageResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
        inlineData?: {
          mimeType: string
          data: string
        }
      }>
    }
  }>
  error?: { message: string }
}

// ─── Prompt Templates ────────────────────────────────────────────────

/**
 * Builds a descriptive prompt for generating a module blueprint image.
 * Uses the structural brief from Opus when available for consistency
 * with the 3D CAD model.
 *
 * @param module - The module to generate an image for
 * @param brief - Optional structural brief from Opus orchestrator
 * @returns A narrative prompt optimized for Gemini image generation
 */
function buildModulePrompt(module: ModuleSpec, brief?: StructuralBrief): string {
  // If we have an Opus structural brief, use its image prompt for consistency
  if (brief?.imagePrompt) {
    return brief.imagePrompt
  }

  // Fallback: build prompt directly from module spec
  return `Create a clean, professional technical engineering illustration showing a ${module.detail.whatItIs}.

The diagram should clearly depict these key components, each labeled with callout lines: ${module.keyParts.join(", ")}.

Show inputs (${module.io.in.join(", ")}) flowing in from the left side, and outputs (${module.io.out.join(", ")}) flowing out to the right.

Style: Modern industrial engineering diagram on a white background with thin, precise lines. Use an isometric or cutaway view to show internal arrangement of components. No decorative elements -- this should look like a page from a professional engineering specification document. Labeled components with clean callout lines. Subtle light gray grid lines in the background for a technical feel.`
}

/**
 * Builds a descriptive prompt for generating the system-level diagram.
 * Uses the system structural brief from Opus when available.
 *
 * @param spec - The full X-Ray spec with all modules
 * @param brief - Optional system structural brief from Opus orchestrator
 * @returns A narrative prompt for the system P&ID diagram
 */
function buildSystemPrompt(spec: XRaySpec, brief?: SystemStructuralBrief): string {
  // If we have an Opus structural brief, use its image prompt for consistency
  if (brief?.imagePrompt) {
    return brief.imagePrompt
  }
  const moduleFlow = spec.modules
    .map((m) => `${m.name}: ${m.purpose}`)
    .join("\n")

  // Build IO chain description
  const ioChain = spec.modules
    .map((m) => `${m.io.in.join("/")} → [${m.name}] → ${m.io.out.join("/")}`)
    .join(" → ")

  return `Create a professional engineering process flow diagram for: ${spec.function}.

This system is composed of ${spec.modules.length} connected subsystems:
${moduleFlow}

Material/signal flow path: ${ioChain}

Style: Clean, modern process flow diagram on a pure white background. Each subsystem shown as a distinct, softly color-coded rounded block with clear flow arrows showing material and signal paths between them. Label each subsystem block and each flow arrow with clean sans-serif typography. Use a minimal, contemporary design style with generous whitespace — NOT a traditional P&ID with dense annotations. The overall composition should read left-to-right. With ${spec.modules.length} modules, use a multi-row layout if needed to fit all blocks clearly without crowding — maintain clear spacing between blocks and keep all labels legible. Do NOT include any title block, document ID, revision number, date, project name, or engineer name anywhere on the diagram. No borders or frames around the diagram.`
}

// ─── Gemini API Caller ───────────────────────────────────────────────

/**
 * Calls the Gemini API to generate an image.
 *
 * @param model - The Gemini model to use
 * @param prompt - The text prompt
 * @param imageConfig - Image generation configuration
 * @param referenceImages - Optional base64 image buffers to include as references
 * @returns Base64 image data and mime type
 *
 * @throws Error if GOOGLE_AI_API_KEY is missing or API call fails
 */
async function callGeminiImage(
  model: string,
  prompt: string,
  imageConfig: { aspectRatio?: string; imageSize?: string } = {},
  referenceImages: Array<{ mimeType: string; data: string }> = [],
): Promise<{ mimeType: string; data: string }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    throw new Error("[XRayImageGen] GOOGLE_AI_API_KEY is not configured")
  }

  // SECURITY: Use x-goog-api-key header instead of URL query param (F6)
  // API key in URL is exposed in server logs, proxy logs, and error reports
  const url = `${GEMINI_API_BASE}/${model}:generateContent`

  // Build content parts: text prompt + optional reference images
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: prompt },
    ...referenceImages.map((img) => ({
      inlineData: { mimeType: img.mimeType, data: img.data },
    })),
  ]

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
    },
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    })
  } catch (fetchError) {
    const msg = fetchError instanceof Error ? fetchError.message : "Network error"
    console.error("[XRayImageGen] Fetch failed:", { model, error: msg })
    throw new Error(`[XRayImageGen] Network error calling Gemini: ${msg}`)
  }

  if (!response.ok) {
    const errText = await response.text()
    console.error("[XRayImageGen] Gemini API error:", { model, status: response.status, body: errText.slice(0, 500) })
    throw new Error(`[XRayImageGen] Gemini API error (${response.status}): ${errText.slice(0, 200)}`)
  }

  const data = (await response.json()) as GeminiImageResponse

  if (data.error) {
    console.error("[XRayImageGen] Gemini returned error:", { model, error: data.error.message })
    throw new Error(`[XRayImageGen] Gemini error: ${data.error.message}`)
  }

  const parts_ = data.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts_.find((p) => p.inlineData)

  if (!imagePart?.inlineData) {
    console.error("[XRayImageGen] No image in response:", { model, partsCount: parts_.length, hasText: parts_.some(p => p.text) })
    throw new Error("[XRayImageGen] No image data returned from Gemini — model may have returned text-only response")
  }

  return imagePart.inlineData
}

// ─── OpenAI Fallback ─────────────────────────────────────────────────

/**
 * Maps Gemini aspect ratio strings to OpenAI gpt-image-1 size strings.
 * gpt-image-1 supports: "1024x1024", "1024x1536", "1536x1024".
 */
function geminiAspectToOpenAISize(
  aspectRatio?: string,
): "1024x1024" | "1024x1536" | "1536x1024" {
  switch (aspectRatio) {
    case "3:2":
    case "16:9":
      return "1536x1024"
    case "2:3":
    case "9:16":
      return "1024x1536"
    default:
      return "1024x1024"
  }
}

/**
 * Calls the OpenAI gpt-image-1 API to generate an image.
 * Used as a fallback when Gemini is unavailable.
 *
 * @returns Base64 image data and mime type (same shape as callGeminiImage)
 * @throws Error if OPENAI_API_KEY is missing or API call fails
 */
async function callOpenAIImage(
  prompt: string,
  size: "1024x1024" | "1024x1536" | "1536x1024",
): Promise<{ mimeType: string; data: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("[XRayImageGen] OPENAI_API_KEY is not configured — cannot use OpenAI fallback")
  }

  const OpenAI = (await import("openai")).default
  const client = new OpenAI({ apiKey })

  // DECISION: gpt-image-1 only supports b64_json (not URL).
  // This is ideal — we need base64 for Supabase upload anyway.
  const response = await client.images.generate({
    model: OPENAI_IMAGE_MODEL,
    prompt,
    n: 1,
    size,
  })

  const b64Data = response.data?.[0]?.b64_json
  if (!b64Data) {
    throw new Error("[XRayImageGen] No image data returned from OpenAI")
  }

  return { mimeType: "image/png", data: b64Data }
}

/**
 * Generates an image using Gemini with automatic OpenAI fallback.
 *
 * FLOW: callGeminiImage() → [retryable error?] → callOpenAIImage() → result
 *
 * Only falls back on provider-side errors (503, 429, network).
 * Auth/content filter errors fail immediately.
 * Gracefully skips fallback if OPENAI_API_KEY is not set.
 */
async function callImageWithFallback(
  model: string,
  prompt: string,
  imageConfig: { aspectRatio?: string; imageSize?: string } = {},
  referenceImages: Array<{ mimeType: string; data: string }> = [],
): Promise<{ mimeType: string; data: string }> {
  try {
    return await callGeminiImage(model, prompt, imageConfig, referenceImages)
  } catch (geminiError) {
    const errorMessage = geminiError instanceof Error ? geminiError.message : String(geminiError)

    // DECISION: Only fallback for provider-side problems (503, 429, network).
    // Auth errors, content filter blocks, etc. should fail immediately —
    // they'd likely fail on OpenAI too or indicate a problem with the request.
    if (!isRetryableError(errorMessage)) {
      throw geminiError
    }

    if (!process.env.OPENAI_API_KEY) {
      console.warn("[XRayImageGen] Gemini failed with retryable error but OPENAI_API_KEY is not set — no fallback available")
      throw geminiError
    }

    console.warn(
      "[XRayImageGen] Gemini unavailable, falling back to OpenAI gpt-image-1:",
      { error: errorMessage.slice(0, 200) },
    )

    const size = geminiAspectToOpenAISize(imageConfig.aspectRatio)
    return await callOpenAIImage(prompt, size)
  }
}

// ─── Storage Upload ──────────────────────────────────────────────────

/**
 * Uploads a base64 image to Supabase Storage and returns the public URL.
 *
 * @param scanId - The scan ID for path namespacing
 * @param filename - The filename (e.g., "module-intake.png")
 * @param base64Data - The base64-encoded image data
 * @param mimeType - The MIME type of the image
 * @returns The public URL of the uploaded image
 */
async function uploadToStorage(
  scanId: string,
  filename: string,
  base64Data: string,
  mimeType: string,
): Promise<string> {
  const supabase = createAdminClient()
  const buffer = Buffer.from(base64Data, "base64")
  const path = `${scanId}/${filename}`

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: true,
    })

  if (error) {
    throw new Error(`[XRayImageGen] Storage upload failed: ${error.message}`)
  }

  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path)

  return urlData.publicUrl
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Generates a blueprint image for a single module.
 *
 * @param scanId - The scan ID for storage namespacing
 * @param module - The module to generate an image for
 * @param brief - Optional structural brief from Opus orchestrator for consistency with 3D model
 * @returns The public URL of the generated image
 *
 * @throws Error if image generation or upload fails
 */
export async function generateModuleImage(
  scanId: string,
  module: ModuleSpec,
  brief?: StructuralBrief,
): Promise<string> {
  const prompt = buildModulePrompt(module, brief)

  const imageData = await callImageWithFallback(MODULE_MODEL, prompt, {
    aspectRatio: "3:2",
  })

  const url = await uploadToStorage(
    scanId,
    `module-${module.id}.png`,
    imageData.data,
    imageData.mimeType,
  )

  return url
}

/**
 * Generates a 16:9 illustration banner for a CAD Lab research report.
 *
 * @param projectId - The CAD Lab project ID (storage namespace)
 * @param subject - The product/system being researched
 * @param moduleNames - Names of decomposed modules (for context)
 * @param modulePurposes - One-line purposes per module (for context)
 * @returns The public URL of the generated illustration
 *
 * @throws Error if image generation or upload fails
 */
export async function generateResearchIllustration(
  projectId: string,
  subject: string,
  moduleNames: string[],
  modulePurposes: string[],
): Promise<string> {
  const hasModules = moduleNames.length > 0
  const moduleList = hasModules
    ? moduleNames.map((name, i) => `- ${name}: ${modulePurposes[i] ?? ""}`).join("\n")
    : ""

  const moduleContext = hasModules
    ? `\n\nThis is an engineering overview showing the complete system with its major sub-assemblies:\n${moduleList}`
    : ""

  const prompt = `Create a clean, professional technical illustration of a ${subject}.${moduleContext}

Style: Modern technical illustration on a clean white background. Show the complete system in ${hasModules ? "an exploded or semi-transparent isometric view so the internal arrangement of sub-assemblies is visible" : "a detailed isometric or three-quarter view showing its key components and overall form factor"}. Use thin, precise lines with subtle color coding to differentiate ${hasModules ? "sub-assemblies" : "major components"}. Label each major ${hasModules ? "sub-assembly" : "component"} with clean callout lines and sans-serif text. The composition should feel like a hero image from a professional engineering specification document. No decorative elements, borders, title blocks, or watermarks. Generous whitespace around the illustration.`

  const imageData = await callImageWithFallback(SYSTEM_MODEL, prompt, {
    aspectRatio: "16:9",
  })

  const url = await uploadToStorage(
    projectId,
    "research-illustration.png",
    imageData.data,
    imageData.mimeType,
  )

  return url
}

/**
 * Generates the system-level P&ID diagram using module images as references.
 *
 * @param scanId - The scan ID for storage namespacing
 * @param spec - The full X-Ray spec
 * @param brief - Optional system structural brief from Opus orchestrator
 * @returns The public URL of the generated system diagram
 *
 * @throws Error if image generation or upload fails
 */
export async function generateSystemImage(
  scanId: string,
  spec: XRaySpec,
  brief?: SystemStructuralBrief,
): Promise<string> {
  const prompt = buildSystemPrompt(spec, brief)

  // For now, generate without reference images (simpler, still effective)
  // Future: download module images and pass as references to Pro model
  const imageData = await callImageWithFallback(SYSTEM_MODEL, prompt, {
    aspectRatio: "16:9",
  })

  const url = await uploadToStorage(
    scanId,
    "system-diagram.png",
    imageData.data,
    imageData.mimeType,
  )

  return url
}
