/**
 * @file image-generator.ts — Image generation for X-Ray blueprints
 *
 * @description Image generation with automatic provider fallback:
 * - Primary: Imagen 4 (imagen-4.0-generate-001) — 2K resolution, best for technical diagrams
 * - Fallback: OpenAI gpt-image-1 — activated on any Imagen failure
 *
 * Uses Imagen 4 predict API for high-quality technical illustrations.
 * Falls back to OpenAI SDK when Imagen is unavailable.
 *
 * @security Requires GOOGLE_AI_API_KEY; optionally OPENAI_API_KEY for fallback
 *
 * @related
 * - AI provider registry: src/lib/ai-providers/registry.ts (existing Gemini pattern)
 * - Server actions: src/actions/xray.ts (orchestrates generation)
 * - Error classification: src/lib/agents/error-classification.ts (retryable error detection)
 */

import sharp from "sharp"
import { createAdminClient } from "@/lib/supabase/admin"

import { overlayModuleLabels, overlaySystemLegend } from "./image-overlay"
import type { ModuleSpec, XRaySpec } from "./xray-schema"
import type { StructuralBrief, SystemStructuralBrief } from "./structural-brief"
import type { VisualStyleSpec } from "@/lib/cad-lab-types"

// ─── Constants ───────────────────────────────────────────────────────

const GOOGLE_AI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
const IMAGEN_MODEL = "imagen-4.0-generate-001" // Imagen 4 — 2K resolution, best text/label rendering
const OPENAI_IMAGE_MODEL = "gpt-image-1" // OpenAI fallback — high-quality technical illustrations
const STORAGE_BUCKET = "xray-images"

// ─── Types ───────────────────────────────────────────────────────────

interface ImagenResponse {
  predictions?: Array<{
    bytesBase64Encoded?: string
    mimeType?: string
  }>
  error?: { code: number; message: string; status: string }
}

// ─── No-Text Enforcement ────────────────────────────────────────────

const NO_TEXT_SUFFIX = "\n\nCRITICAL: This image must contain ZERO text, letters, words, numbers, labels, annotations, dimensions, or writing of any kind. The image should be purely visual with no readable characters anywhere."

/**
 * Appends a strong no-text instruction to any image prompt.
 * Applied as the last step before sending to the image API, ensuring
 * ALL codepaths (hardcoded fallback, Opus-generated briefs, research
 * banners) get the same guardrail.
 */
function enforceNoText(prompt: string): string {
  if (prompt.includes("ZERO text")) return prompt
  return prompt + NO_TEXT_SUFFIX
}

// ─── Cohesive Style Suffix ───────────────────────────────────────────

/**
 * Deterministic rendering rules appended to ALL image prompts.
 * This is the "floor" — even if the AI-generated VisualStyleSpec is vague,
 * all images share identical perspective, background, line weight, grid, and shadow.
 */
const COHESIVE_STYLE_SUFFIX = `

Rendering rules (mandatory for visual consistency across all illustrations in this set):
- Perspective: 30-degree isometric view, camera slightly above and to the right
- Background: pure white (#FFFFFF), no gradients or textures
- Line weight: thin, uniform 1px strokes for outlines and internal edges
- Grid: subtle light gray (#F0F0F0) engineering grid visible in background
- Shadows: single soft drop shadow, bottom-right, 15% opacity
- Lighting: single directional light from upper-left, soft ambient fill
- Scale: component fills 70-80% of frame with generous margins
- No decorative elements, borders, title blocks, or watermarks`

// ─── Prompt Templates ────────────────────────────────────────────────

/**
 * Builds a ghost-outline prompt that renders the complete product as a faint
 * wireframe/ghost with only the target subassembly highlighted in full color.
 *
 * @param module - The module (subassembly) to highlight
 * @param visualStyle - The visual style spec (must have productFormDescription)
 * @returns A narrative prompt for the ghost-outline rendering approach
 */
function buildGhostOutlinePrompt(module: ModuleSpec, visualStyle: VisualStyleSpec): string {
  return `Create a professional technical engineering illustration using a ghost-outline technique.

GHOST OUTLINE (faint background):
Draw the complete product as a very faint, semi-transparent gray wireframe outline showing its full shape: ${visualStyle.productFormDescription}
The ghost should be rendered at roughly 10-15% opacity — just enough to show the overall product silhouette and spatial context, but clearly receded into the background.

HIGHLIGHTED SUBASSEMBLY (full color, foreground):
Within that ghost outline, render the "${module.name}" subassembly in full vivid color at its correct physical position inside the product. This is: ${module.detail.whatItIs}. It contains ${module.keyParts.length} key components shown through visual differentiation (color coding, positioning, distinct shapes).

The contrast between the faint ghost and the vivid highlighted section should be dramatic — the viewer's eye should immediately go to the highlighted subassembly while understanding exactly where it sits within the overall product.

Color palette: use ${visualStyle.colorPalette} for the highlighted subassembly.
Material rendering: ${visualStyle.materialRendering}.
Context: ${visualStyle.unifyingContext}.

Style: Modern industrial engineering diagram on a white background with thin, precise lines. Isometric view. No decorative elements — this should look like a page from a professional engineering specification document. Subtle light gray grid lines in the background. Do NOT include any text, labels, words, or annotations anywhere in the image.${COHESIVE_STYLE_SUFFIX}`
}

/**
 * Builds a descriptive prompt for generating a module blueprint image.
 * Uses the structural brief from Opus when available for consistency
 * with the 3D CAD model. When productFormDescription is present, uses
 * ghost-outline technique to show spatial context within the product.
 *
 * @param module - The module to generate an image for
 * @param brief - Optional structural brief from Opus orchestrator
 * @param visualStyle - Optional shared visual style for cross-module cohesion
 * @returns A narrative prompt optimized for Gemini image generation
 */
function buildModulePrompt(module: ModuleSpec, brief?: StructuralBrief, visualStyle?: VisualStyleSpec): string {
  // If we have an Opus structural brief, use its image prompt (+ cohesive suffix)
  if (brief?.imagePrompt) {
    let prompt = brief.imagePrompt
    if (visualStyle) {
      prompt = injectVisualStyle(prompt, visualStyle)
    }
    return prompt + COHESIVE_STYLE_SUFFIX
  }

  // DECISION: When productFormDescription is available, use ghost-outline
  // technique so each module image shows spatial context within the product.
  // Otherwise fall back to the legacy isolated-module prompt.
  if (visualStyle?.productFormDescription) {
    return buildGhostOutlinePrompt(module, visualStyle)
  }

  // Fallback: build prompt directly from module spec (legacy isolated-module)
  // DECISION: Avoid naming specific components/IOs — image models render
  // them as garbled text.  Describe visually instead.
  const styleContext = visualStyle
    ? `This is a detailed sub-view of a larger system: ${visualStyle.unifyingContext}.

Color palette: use ${visualStyle.colorPalette} as the dominant colors.
Material rendering: ${visualStyle.materialRendering}.

`
    : ""

  return `${styleContext}Create a clean, professional technical engineering illustration showing a ${module.detail.whatItIs}.

The diagram should clearly show ${module.keyParts.length} distinct key components through visual differentiation (color coding, positioning, distinct shapes).

Show input flow entering from the left side and output flow exiting to the right.

Style: Modern industrial engineering diagram on a white background with thin, precise lines. Use an isometric or cutaway view to show internal arrangement of components. No decorative elements -- this should look like a page from a professional engineering specification document. Use color coding to distinguish components. Subtle light gray grid lines in the background for a technical feel. Do NOT include any text, labels, words, or annotations anywhere in the image.${COHESIVE_STYLE_SUFFIX}`
}

/**
 * Injects VisualStyleSpec directives into an existing prompt string.
 * When productFormDescription is available, adds ghost-outline framing
 * so the brief-based path also benefits from spatial context.
 */
function injectVisualStyle(prompt: string, style: VisualStyleSpec): string {
  const ghostDirective = style.productFormDescription
    ? `\nProduct form (render as faint 10-15% opacity ghost/wireframe behind the highlighted subassembly): ${style.productFormDescription}\n`
    : ""

  return `Context: This is a detailed sub-view of ${style.unifyingContext}.
Color palette: ${style.colorPalette}.
Material rendering: ${style.materialRendering}.${ghostDirective}

${prompt}`
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

  // DECISION: Don't list module names or IO chains — image models render
  // them as garbled text labels on the diagram.  Use count-based description.
  return `Create a professional engineering process flow diagram for a system that performs: ${spec.function}.

This system is composed of ${spec.modules.length} connected subsystems arranged in a processing chain.

Style: Clean, modern process flow diagram on a pure white background. Each subsystem shown as a distinct, softly color-coded rounded block with clear flow arrows showing material and signal paths between them. Differentiate each subsystem block using distinct colors and shapes. Use a minimal, contemporary design style with generous whitespace — NOT a traditional P&ID with dense annotations. The overall composition should read left-to-right. With ${spec.modules.length} modules, use a multi-row layout if needed to fit all blocks clearly without crowding — maintain clear spacing between blocks. Do NOT include any text, labels, words, annotations, title block, document ID, revision number, date, project name, or engineer name anywhere on the diagram. No borders or frames around the diagram.`
}

// ─── Imagen 4 API Caller ────────────────────────────────────────────

/**
 * Maps caller aspect ratios to Imagen 4 supported ratios.
 * Imagen 4 supports: "1:1", "3:4", "4:3", "9:16", "16:9".
 * Note: "3:2" is NOT supported — maps to "4:3" (closest landscape).
 */
function toImagenAspectRatio(aspectRatio?: string): string {
  switch (aspectRatio) {
    case "16:9":
      return "16:9"
    case "9:16":
      return "9:16"
    case "3:2":
    case "4:3":
      return "4:3"
    case "2:3":
    case "3:4":
      return "3:4"
    default:
      return "1:1"
  }
}

/**
 * Calls the Imagen 4 predict API to generate an image.
 *
 * @param prompt - The text prompt
 * @param aspectRatio - Aspect ratio (mapped to Imagen 4 supported values)
 * @returns Base64 image data and mime type
 *
 * @throws Error if GOOGLE_AI_API_KEY is missing or API call fails
 */
async function callImagenImage(
  prompt: string,
  aspectRatio?: string,
): Promise<{ mimeType: string; data: string }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    throw new Error("[XRayImageGen] GOOGLE_AI_API_KEY is not configured")
  }

  // SECURITY: Use x-goog-api-key header instead of URL query param
  const url = `${GOOGLE_AI_API_BASE}/${IMAGEN_MODEL}:predict`

  const body = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: toImagenAspectRatio(aspectRatio),
      imageSize: "2K",
      negativePrompt: "text, words, letters, labels, annotations, writing, captions, titles, numbers, measurements, dimensions, handwriting, typography, font",
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
    console.error("[XRayImageGen] Fetch failed:", { model: IMAGEN_MODEL, error: msg })
    throw new Error(`[XRayImageGen] Network error calling Imagen 4: ${msg}`)
  }

  if (!response.ok) {
    const errText = await response.text()
    console.error("[XRayImageGen] Imagen 4 API error:", { status: response.status, body: errText.slice(0, 500) })
    throw new Error(`[XRayImageGen] Imagen 4 API error (${response.status}): ${errText.slice(0, 200)}`)
  }

  const data = (await response.json()) as ImagenResponse

  if (data.error) {
    console.error("[XRayImageGen] Imagen 4 returned error:", { error: data.error.message })
    throw new Error(`[XRayImageGen] Imagen 4 error: ${data.error.message}`)
  }

  const b64Data = data.predictions?.[0]?.bytesBase64Encoded
  if (!b64Data) {
    console.error("[XRayImageGen] No image in Imagen 4 response:", { predictionsCount: data.predictions?.length ?? 0 })
    throw new Error("[XRayImageGen] No image data returned from Imagen 4")
  }

  return { mimeType: "image/png", data: b64Data }
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
 * @returns Base64 image data and mime type (same shape as callImagenImage)
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
    quality: "high",
  })

  const b64Data = response.data?.[0]?.b64_json
  if (!b64Data) {
    throw new Error("[XRayImageGen] No image data returned from OpenAI")
  }

  return { mimeType: "image/png", data: b64Data }
}

/**
 * Generates an image using Imagen 4 with automatic OpenAI fallback.
 *
 * FLOW: callImagenImage() → [any error] → callOpenAIImage() → result
 *
 * Falls back to OpenAI on ANY Imagen failure as long as OPENAI_API_KEY is set.
 */
async function callImageWithFallback(
  prompt: string,
  imageConfig: { aspectRatio?: string } = {},
): Promise<{ mimeType: string; data: string }> {
  // Enforce no-text guardrail on ALL prompts regardless of source
  const safePrompt = enforceNoText(prompt)
  try {
    return await callImagenImage(safePrompt, imageConfig.aspectRatio)
  } catch (imagenError) {
    const errorMessage = imagenError instanceof Error ? imagenError.message : String(imagenError)

    if (!process.env.OPENAI_API_KEY) {
      console.warn("[XRayImageGen] Imagen 4 failed and OPENAI_API_KEY is not set — no fallback available")
      throw imagenError
    }

    console.warn(
      "[XRayImageGen] Imagen 4 failed, falling back to OpenAI gpt-image-1:",
      { error: errorMessage.slice(0, 200) },
    )

    const size = geminiAspectToOpenAISize(imageConfig.aspectRatio)
    return await callOpenAIImage(safePrompt, size)
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

// ─── Reference Image Editing (Two-Pass) ─────────────────────────────

/**
 * Center-crops a 16:9 PNG to 3:2, then resizes to 1536×1024 (OpenAI max landscape).
 * Used to convert the system illustration into a reference image for images.edit().
 *
 * @param base64Png - Base64-encoded 16:9 PNG from system illustration
 * @returns Base64-encoded 3:2 PNG at 1536×1024
 */
export async function cropReferenceFor3x2(base64Png: string): Promise<string> {
  const buf = Buffer.from(base64Png, "base64")
  const meta = await sharp(buf).metadata()
  const w = meta.width ?? 1920
  const h = meta.height ?? 1080

  // Target 3:2 aspect — crop from center of 16:9
  const targetRatio = 3 / 2
  const currentRatio = w / h

  let cropWidth = w
  let cropHeight = h
  if (currentRatio > targetRatio) {
    // Wider than 3:2 — crop sides
    cropWidth = Math.round(h * targetRatio)
  } else {
    // Taller than 3:2 — crop top/bottom
    cropHeight = Math.round(w / targetRatio)
  }

  const left = Math.round((w - cropWidth) / 2)
  const top = Math.round((h - cropHeight) / 2)

  const cropped = await sharp(buf)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize(1536, 1024)
    .png()
    .toBuffer()

  return cropped.toString("base64")
}

/**
 * Builds a prompt for OpenAI images.edit() that desaturates the reference
 * image except for the target module's subassembly region.
 */
function buildReferenceEditPrompt(module: ModuleSpec, visualStyle: VisualStyleSpec): string {
  return enforceNoText(`Edit this technical engineering illustration to create a focused subassembly highlight view.

DESATURATION: Convert the entire image to a very faint, low-contrast grayscale (10-15% opacity feel) — like a ghost/wireframe outline of the complete product.

HIGHLIGHT: Keep ONLY the "${module.name}" section in full vivid color at its original position. This component is: ${module.detail.whatItIs}. It should stand out dramatically against the faded background — the viewer's eye should immediately go to this highlighted region.

The highlighted region should use this color palette: ${visualStyle.colorPalette}.
Material rendering: ${visualStyle.materialRendering}.

Style: Clean engineering diagram aesthetic. Maintain the isometric perspective. The ghost outline provides spatial context showing where this subassembly fits within the complete product.${COHESIVE_STYLE_SUFFIX}`)
}

/**
 * Attempts to generate a module image using OpenAI images.edit() with the
 * system illustration as a reference. Returns null on any failure so the
 * caller can fall back to the text-only path.
 */
async function tryOpenAIEdit(
  module: ModuleSpec,
  referenceBase64: string,
  visualStyle: VisualStyleSpec,
): Promise<{ mimeType: string; data: string } | null> {
  if (!process.env.OPENAI_API_KEY) return null

  try {
    const openaiModule = await import("openai")
    const OpenAI = openaiModule.default
    const { toFile } = openaiModule
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const prompt = buildReferenceEditPrompt(module, visualStyle)
    const imageFile = await toFile(Buffer.from(referenceBase64, "base64"), "reference.png", { type: "image/png" })

    const response = await client.images.edit({
      model: OPENAI_IMAGE_MODEL,
      image: imageFile,
      prompt,
      size: "1536x1024",
    })

    const b64Data = response.data?.[0]?.b64_json
    if (!b64Data) return null

    return { mimeType: "image/png", data: b64Data }
  } catch (err) {
    console.warn(
      "[XRayImageGen] OpenAI images.edit() failed, will fall back to text-only:",
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Generates a blueprint image for a single module.
 *
 * @param scanId - The scan ID for storage namespacing
 * @param module - The module to generate an image for
 * @param brief - Optional structural brief from Opus orchestrator for consistency with 3D model
 * @param visualStyle - Optional shared visual style for cross-module cohesion
 * @returns The public URL of the generated image
 *
 * @throws Error if image generation or upload fails
 */
export async function generateModuleImage(
  scanId: string,
  module: ModuleSpec,
  brief?: StructuralBrief,
  visualStyle?: VisualStyleSpec,
): Promise<string> {
  const prompt = buildModulePrompt(module, brief, visualStyle)

  const imageData = await callImageWithFallback(prompt, {
    aspectRatio: "3:2",
  })

  // Post-process: add engineering annotation frame with labels
  const labeledData = await overlayModuleLabels(imageData.data, {
    name: module.name,
    purpose: module.purpose,
    keyParts: module.keyParts,
    io: module.io,
  })

  const url = await uploadToStorage(
    scanId,
    `module-${module.id}.png`,
    labeledData,
    imageData.mimeType,
  )

  return url
}

/**
 * Generates a module image using the system illustration as a reference.
 * Two-pass approach: the system illustration (Pass 1) is fed into OpenAI
 * images.edit() so each module image starts from the same base — guaranteeing
 * spatial consistency of the ghost outline across all module images.
 *
 * Falls back gracefully to the existing text-only ghost prompt when:
 * - OPENAI_API_KEY is not set
 * - images.edit() call fails for any reason
 *
 * @param scanId - The scan ID for storage namespacing
 * @param module - The module to generate an image for
 * @param referenceBase64 - Base64 PNG of the system illustration (cropped to 3:2)
 * @param visualStyle - Shared visual style for cross-module cohesion
 * @returns The public URL of the generated image
 */
export async function generateModuleImageWithReference(
  scanId: string,
  module: ModuleSpec,
  referenceBase64: string,
  visualStyle: VisualStyleSpec,
): Promise<string> {
  // FLOW: tryOpenAIEdit → [fail] → text-only ghost prompt (existing path)
  const editResult = await tryOpenAIEdit(module, referenceBase64, visualStyle)

  let imageData: { mimeType: string; data: string }
  if (editResult) {
    imageData = editResult
  } else {
    // Fallback to text-only ghost prompt
    const prompt = buildModulePrompt(module, undefined, visualStyle)
    imageData = await callImageWithFallback(prompt, { aspectRatio: "3:2" })
  }

  // Post-process: add engineering annotation frame with labels
  const labeledData = await overlayModuleLabels(imageData.data, {
    name: module.name,
    purpose: module.purpose,
    keyParts: module.keyParts,
    io: module.io,
  })

  const url = await uploadToStorage(
    scanId,
    `module-${module.id}.png`,
    labeledData,
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
 * @param visualStyle - Optional shared visual style for cross-module cohesion
 * @returns The public URL of the generated illustration
 *
 * @throws Error if image generation or upload fails
 */
export async function generateResearchIllustration(
  projectId: string,
  subject: string,
  moduleNames: string[],
  modulePurposes: string[],
  visualStyle?: VisualStyleSpec,
): Promise<string> {
  const hasModules = moduleNames.length > 0

  // DECISION: Don't list module names — image models render them as garbled
  // text.  Use count-based description instead.
  const moduleContext = hasModules
    ? `\n\nThis is an engineering overview showing the complete system with its ${moduleNames.length} major sub-assemblies.`
    : ""

  const styleDirective = visualStyle
    ? `\n\nColor palette: use ${visualStyle.colorPalette} as the dominant colors. Material rendering: ${visualStyle.materialRendering}. Context: ${visualStyle.unifyingContext}.`
    : ""

  const prompt = `Create a clean, professional technical illustration of a ${subject}.${moduleContext}${styleDirective}

Style: Modern technical illustration on a clean white background. Show the complete system in ${hasModules ? "an exploded or semi-transparent isometric view so the internal arrangement of sub-assemblies is visible" : "a detailed isometric or three-quarter view showing its key components and overall form factor"}. Use thin, precise lines with subtle color coding to differentiate ${hasModules ? "sub-assemblies" : "major components"}. Differentiate each major ${hasModules ? "sub-assembly" : "component"} using distinct colors and visual separation. The composition should feel like a hero image from a professional engineering specification document. No decorative elements, borders, title blocks, or watermarks. Do NOT include any text, labels, words, or annotations anywhere in the image. Generous whitespace around the illustration.${COHESIVE_STYLE_SUFFIX}`

  const imageData = await callImageWithFallback(prompt, {
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

  const imageData = await callImageWithFallback(prompt, {
    aspectRatio: "16:9",
  })

  // Post-process: add bottom legend bar with module names
  const labeledData = await overlaySystemLegend(
    imageData.data,
    spec.function,
    spec.modules.map((m) => ({ name: m.name, purpose: m.purpose })),
  )

  const url = await uploadToStorage(
    scanId,
    "system-diagram.png",
    labeledData,
    imageData.mimeType,
  )

  return url
}
