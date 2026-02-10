/**
 * @file image-generator.ts — Gemini image generation for X-Ray blueprints
 *
 * @description Two-tier image generation strategy:
 * - Module images: gemini-2.5-flash-image (fast, parallel, 1K)
 * - System diagram: gemini-3-pro-image-preview (professional, 2K, with module image references)
 *
 * Uses direct Gemini REST API calls with full imageConfig support.
 * No new SDK dependency -- uses fetch like existing code in registry.ts.
 *
 * @security Requires GOOGLE_AI_API_KEY environment variable
 *
 * @related
 * - AI provider registry: src/lib/ai-providers/registry.ts (existing Gemini pattern)
 * - Server actions: src/actions/xray.ts (orchestrates generation)
 */

import { createAdminClient } from "@/lib/supabase/admin"

import type { ModuleSpec, XRaySpec } from "./xray-schema"

// ─── Constants ───────────────────────────────────────────────────────

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
const MODULE_MODEL = "gemini-2.5-flash-image" // Nano Banana — fast module blueprints
const SYSTEM_MODEL = "gemini-3-pro-image-preview" // Nano Banana Pro — professional system P&ID diagrams
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
 *
 * @param module - The module to generate an image for
 * @returns A narrative prompt optimized for Gemini image generation
 */
function buildModulePrompt(module: ModuleSpec): string {
  return `Create a clean, professional technical engineering illustration showing a ${module.detail.whatItIs}.

The diagram should clearly depict these key components, each labeled with callout lines: ${module.keyParts.join(", ")}.

Show inputs (${module.io.in.join(", ")}) flowing in from the left side, and outputs (${module.io.out.join(", ")}) flowing out to the right.

Style: Modern industrial engineering diagram on a white background with thin, precise lines. Use an isometric or cutaway view to show internal arrangement of components. No decorative elements -- this should look like a page from a professional engineering specification document. Labeled components with clean callout lines. Subtle light gray grid lines in the background for a technical feel.`
}

/**
 * Builds a descriptive prompt for generating the system-level diagram.
 *
 * @param spec - The full X-Ray spec with all modules
 * @returns A narrative prompt for the system P&ID diagram
 */
function buildSystemPrompt(spec: XRaySpec): string {
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

Style: Clean P&ID (Piping and Instrumentation Diagram) on white background. Each subsystem shown as a distinct, color-coded block with clear flow arrows showing material and signal paths between them. Label each subsystem block and each flow arrow. Use a clean, modern engineering style suitable for a technical specification document. The overall composition should read left-to-right. With ${spec.modules.length} modules, use a multi-row layout if needed to fit all blocks clearly without crowding - maintain clear spacing between blocks and keep all labels legible. Include a title block in the bottom-right corner.`
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

  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`

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
      headers: { "Content-Type": "application/json" },
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
 * @returns The public URL of the generated image
 *
 * @throws Error if image generation or upload fails
 */
export async function generateModuleImage(
  scanId: string,
  module: ModuleSpec,
): Promise<string> {
  const prompt = buildModulePrompt(module)

  const imageData = await callGeminiImage(MODULE_MODEL, prompt, {
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
 * Generates the system-level P&ID diagram using module images as references.
 *
 * @param scanId - The scan ID for storage namespacing
 * @param spec - The full X-Ray spec
 * @param moduleImageUrls - Map of moduleId -> image URL (for downloading as references)
 * @returns The public URL of the generated system diagram
 *
 * @throws Error if image generation or upload fails
 */
export async function generateSystemImage(
  scanId: string,
  spec: XRaySpec,
): Promise<string> {
  const prompt = buildSystemPrompt(spec)

  // For now, generate without reference images (simpler, still effective)
  // Future: download module images and pass as references to Pro model
  const imageData = await callGeminiImage(SYSTEM_MODEL, prompt, {
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
