/**
 * @file image-generator.ts — Image generation for X-Ray blueprints
 *
 * @description Image generation with automatic provider fallback:
 * - Primary: OpenAI gpt-image-2 (default quality) — selected 2026-04-22 after
 *   a 4-way shootout vs Nano Banana 2 and gpt-image-1. gpt-image-2 produces
 *   more physically-accurate industrial renders on engineering prompts; default
 *   quality beat "high"/thinking mode on proportion correctness.
 * - Fallback 1: Nano Banana 2 multimodal (reference-aware) or text-only
 * - Fallback 2: Nano Banana stable (gemini-2.5-flash-image)
 * - Fallback 3: OpenAI gpt-image-1 (deep fallback — kept so module renders
 *   don't fail outright if gpt-image-2 has a regional outage)
 *
 * gpt-image-2 is slower than banana (~50s vs ~10s) — the module render chain
 * compensates by running 2-at-a-time with `after()` so founders can leave
 * the page while the chain completes server-side.
 *
 * @security Requires OPENAI_API_KEY; optionally GOOGLE_AI_API_KEY for fallback
 *
 * @related
 * - AI provider registry: src/lib/ai-providers/registry.ts (existing Gemini pattern)
 * - Server actions: src/actions/xray.ts (orchestrates generation)
 * - Error classification: src/lib/agents/error-classification.ts (retryable error detection)
 * - Shootout evidence: ~/Downloads/image-shootout/compare.html (2026-04-22)
 */

import sharp from "sharp"
import { createAdminClient } from "@/lib/supabase/admin"
import { fetchWithTimeout } from "@/lib/fetch-with-timeout"

import { overlaySystemLegend } from "./image-overlay"
import type { ModuleSpec, XRaySpec } from "./xray-schema"
import type { StructuralBrief, SystemStructuralBrief } from "./structural-brief"
import type { VisualStyleSpec } from "@/lib/cad-lab-types"

// ─── Constants ───────────────────────────────────────────────────────

const GOOGLE_AI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
const NANO_BANANA_MODEL = "gemini-3.1-flash-image-preview" // Nano Banana 2 — 2K resolution, native 3:2 support
const NANO_BANANA_STABLE_MODEL = "gemini-2.5-flash-image" // Nano Banana (original) — confirmed available via ListModels
// INTENT: gpt-image-2 is the primary model (selected 2026-04-22 after a 4-way
// shootout). Default quality is deliberate — the "high"/thinking mode was
// evaluated and rejected for producing less physically-accurate proportions
// on engineering illustrations. Don't silently add `quality: "high"`.
const OPENAI_PRIMARY_MODEL = "gpt-image-2"
const OPENAI_FALLBACK_MODEL = "gpt-image-1" // Deep fallback — gpt-image-2 regional outage protection
const STORAGE_BUCKET = "xray-images"

// ─── Types ───────────────────────────────────────────────────────────

interface NanoBananaResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { mimeType?: string; data?: string }
      }>
    }
  }>
  error?: { code: number; message: string; status: string }
}

// ─── No-Text Enforcement ────────────────────────────────────────────

const NO_TEXT_SUFFIX = "\n\nCRITICAL: This image must contain ZERO text, letters, words, numbers, labels, annotations, dimensions, or writing of any kind. The image should be purely visual with no readable characters anywhere."

// INTENT: Image models (Nano Banana 2 especially) respond more reliably to an
// explicit NEGATIVE: clause than to positive "no text" framing buried in the
// prompt. This suffix is ALWAYS appended (independent of the ZERO-TEXT guard
// above) so every render — module, hero, system P&ID, reference-aware — ships
// with the same terminal instruction. Keeping it separate from NO_TEXT_SUFFIX
// means idempotent retries don't double-apply the positive clause but DO
// guarantee the negative clause rides every call.
const NEGATIVE_PROMPT_SUFFIX = "\n\nNEGATIVE: no text, no labels, no callouts, no annotations, no numbering, no dimensions written on the drawing, no watermarks, no title blocks, no revision tags."

// INTENT: Prepended to all AI-crafted prompts (heroImagePrompt, moduleImagePrompt,
// brief.imagePrompt) to enforce white background + full colour. Image models weight
// the start of the prompt most heavily — rules buried at the end get ignored.
const MANDATORY_RENDERING_PREAMBLE = `MANDATORY RENDERING RULES (override any conflicting instructions below):
1. Background MUST be pure white (#FFFFFF) — no dark backgrounds, no black, no gray, no gradients.
2. Use FULL COLOR rendering — realistic material colors, not grayscale or monochrome.
3. This image must contain ZERO text — no labels, annotations, words, letters, numbers, or callouts.

`

/**
 * Appends a strong no-text instruction to any image prompt.
 * Applied as the last step before sending to the image API, ensuring
 * ALL codepaths (hardcoded fallback, Opus-generated briefs, research
 * banners) get the same guardrail.
 *
 * Two-part guard:
 *   1. Positive clause (NO_TEXT_SUFFIX) — added only if the prompt doesn't
 *      already contain equivalent language (case-insensitive so we don't
 *      double up when COHESIVE_STYLE_SUFFIX already carries "ZERO TEXT").
 *   2. Negative clause (NEGATIVE_PROMPT_SUFFIX) — ALWAYS added. Image
 *      models weight explicit NEGATIVE: directives more reliably than
 *      positive "no text" instructions.
 */
function enforceNoText(prompt: string): string {
  let out = prompt
  if (!/zero text/i.test(out)) {
    out += NO_TEXT_SUFFIX
  }
  if (!/^NEGATIVE:/m.test(out)) {
    out += NEGATIVE_PROMPT_SUFFIX
  }
  return out
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
- No decorative elements, borders, title blocks, or watermarks
- ZERO TEXT: Do not render any text, letters, words, labels, annotations, callouts, captions, or numbers anywhere in the image. The image must contain only visual elements — no written language of any kind.`

// ─── Prompt Templates ────────────────────────────────────────────────

/**
 * Builds an optional DIMENSIONAL CONSTRAINTS block from VisualStyleSpec.
 * Returns empty string when no dimensional data is available.
 */
function buildDimensionalConstraints(moduleName: string, visualStyle?: VisualStyleSpec): string {
  const overall = visualStyle?.overallDimensionsMm
  const moduleNote = visualStyle?.moduleDimensionNotes?.[moduleName]
  if (!overall && !moduleNote) return ""

  const lines: string[] = ["\n\nDIMENSIONAL CONSTRAINTS (ensure proportions respect these measurements):"]
  if (overall) lines.push(`- Overall product: ${overall}`)
  if (moduleNote) lines.push(`- This module ("${moduleName}"): ${moduleNote}`)
  return lines.join("\n")
}

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
The highlighted sub-assembly's geometry must be consistent with its appearance within the ghost outline — same proportions, same structural forms, same component shapes.

The contrast between the faint ghost and the vivid highlighted section should be dramatic — the viewer's eye should immediately go to the highlighted subassembly while understanding exactly where it sits within the overall product.

Color palette: use ${visualStyle.colorPalette} for the highlighted subassembly.
Material rendering: ${visualStyle.materialRendering}.
Context: ${visualStyle.unifyingContext}.${buildDimensionalConstraints(module.name, visualStyle)}

Style: Modern industrial product render on a white background with thin, precise lines. Isometric view. No decorative elements. Subtle light gray grid lines in the background. ZERO TEXT: Do not render any text, labels, words, annotations, callouts, or writing of any kind in the image.${COHESIVE_STYLE_SUFFIX}`
}

/**
 * Builds a prompt optimized for the multimodal reference path, where the
 * hero image is literally provided as an inline image alongside this text.
 * Instructs Gemini to produce a detail view that visually matches the hero.
 *
 * @param module - The module (subassembly) to generate a detail view for
 * @param visualStyle - Optional visual style directives
 * @returns A prompt designed to be paired with the hero as inlineData
 */
function buildReferenceAwareModulePrompt(module: ModuleSpec, visualStyle?: VisualStyleSpec, hasModuleCrop?: boolean): string {
  const styleDirective = visualStyle
    ? `\nColor palette: ${visualStyle.colorPalette}.\nMaterial rendering: ${visualStyle.materialRendering}.\nContext: ${visualStyle.unifyingContext}.`
    : ""

  const moduleGeometry = visualStyle?.moduleGeometryMap?.[module.name]

  const geometryDirective = visualStyle?.productFormDescription
    ? `\n\nPRODUCT GEOMETRY (the complete system shown in the reference image):\n${visualStyle.productFormDescription}\n\nThe "${module.name}" sub-assembly is one component of this product. Its geometry, proportions, and structural details MUST match exactly how it appears in the reference image above.`
    : ""

  const specificModuleGeometry = moduleGeometry
    ? `\n\nSPECIFIC MODULE GEOMETRY for "${module.name}":\n${moduleGeometry}\nReproduce these exact geometric features — do not substitute, simplify, or reinterpret any shapes.`
    : ""

  // When a module crop is provided as IMAGE 2, reference both images explicitly
  const imageReferenceText = hasModuleCrop
    ? `You are provided two reference images.
IMAGE 1: The complete system (full product view).
IMAGE 2: A cropped close-up of the specific region containing the "${module.name}" sub-assembly.
CRITICAL: Reproduce the geometry from IMAGE 2 exactly. IMAGE 1 provides overall context.
Generate a focused detail view of the "${module.name}" sub-assembly.`
    : `You are provided a reference image showing the complete system.
Generate a focused detail view of the "${module.name}" sub-assembly.`

  return `${imageReferenceText}

CRITICAL CONSISTENCY RULE: Match the reference image${hasModuleCrop ? "s" : ""} EXACTLY — both ${hasModuleCrop ? "their" : "its"} visual style AND ${hasModuleCrop ? "their" : "its"} physical geometry:
- GEOMETRY: The shapes, proportions, structural forms, and dimensions of components must be identical to the reference. If the reference shows ducted propellers, draw ducted propellers (not open blades). If the chassis is triangular, keep it triangular. Preserve exact proportions.
- STYLE: Same rendering technique, same color palette, same line weight, same perspective angle, same background treatment.
The viewer should feel like they are looking at a zoomed-in crop of the reference illustration — not a reinterpretation.

This sub-assembly is: ${module.detail.whatItIs}
It contains ${module.keyParts.length} key components shown through visual differentiation.${geometryDirective}

Frame the composition to show this specific sub-assembly at larger scale with more component detail visible. Do NOT redesign or reinterpret the component — reproduce it faithfully from the reference at higher magnification.${specificModuleGeometry}${buildDimensionalConstraints(module.name, visualStyle)}${styleDirective}${COHESIVE_STYLE_SUFFIX}`
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

Show input flow entering from the left side and output flow exiting to the right.${buildDimensionalConstraints(module.name, visualStyle)}

Style: Modern industrial product render on a white background with thin, precise lines. Use an isometric or cutaway view to show internal arrangement of components. No decorative elements. Use color coding to distinguish components. Subtle light gray grid lines in the background for a technical feel. ZERO TEXT: Do not render any text, labels, words, annotations, callouts, or writing of any kind in the image.${COHESIVE_STYLE_SUFFIX}`
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
  // If we have an Opus structural brief, use its image prompt for consistency.
  // Apply same guardrails as heroImagePrompt — raw AI prompts without the
  // preamble + suffix produce dark/monochrome renders.
  if (brief?.imagePrompt) {
    return MANDATORY_RENDERING_PREAMBLE + enforceNoText(brief.imagePrompt) + COHESIVE_STYLE_SUFFIX
  }

  // DECISION: Don't list module names or IO chains — image models render
  // them as garbled text labels on the diagram.  Use count-based description.
  return MANDATORY_RENDERING_PREAMBLE + `Create a professional engineering process flow diagram for a system that performs: ${spec.function}.

This system is composed of ${spec.modules.length} connected subsystems arranged in a processing chain.

Style: Clean, modern process flow diagram on a pure white background. Each subsystem shown as a distinct, softly color-coded rounded block with clear flow arrows showing material and signal paths between them. Differentiate each subsystem block using distinct colors and shapes. Use a minimal, contemporary design style with generous whitespace. The overall composition should read left-to-right. With ${spec.modules.length} modules, use a multi-row layout if needed to fit all blocks clearly without crowding — maintain clear spacing between blocks. No borders or frames around the diagram. ZERO TEXT: Do not render any text, labels, words, annotations, callouts, title blocks, document IDs, revision numbers, dates, or writing of any kind anywhere in the image.` + COHESIVE_STYLE_SUFFIX
}

// ─── Nano Banana 2 API Caller ────────────────────────────────────────

/**
 * Maps caller aspect ratios to Nano Banana 2 supported ratios.
 * Nano Banana 2 supports: "1:1", "3:4", "4:3", "9:16", "16:9", "3:2", "2:3".
 */
function toNanoBananaAspectRatio(aspectRatio?: string): string {
  const SUPPORTED = new Set(["1:1", "3:4", "4:3", "9:16", "16:9", "3:2", "2:3"])
  return aspectRatio && SUPPORTED.has(aspectRatio) ? aspectRatio : "1:1"
}

/**
 * Calls the Nano Banana 2 generateContent API to generate an image.
 *
 * @param prompt - The text prompt
 * @param aspectRatio - Aspect ratio (mapped to Nano Banana 2 supported values)
 * @returns Base64 image data and mime type
 *
 * @throws Error if GOOGLE_AI_API_KEY is missing or API call fails
 */
async function callNanoBananaImage(
  prompt: string,
  aspectRatio?: string,
  model: string = NANO_BANANA_MODEL,
): Promise<{ mimeType: string; data: string; modelUsed: string }> {
  // GOTCHA: Vercel env vars can have trailing whitespace/newlines — always trim
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("[XRayImageGen] GOOGLE_AI_API_KEY is not configured")
  }

  // SECURITY: Use x-goog-api-key header instead of URL query param
  const url = `${GOOGLE_AI_API_BASE}/${model}:generateContent`

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: toNanoBananaAspectRatio(aspectRatio),
        imageSize: "2K",
      },
    },
  }

  let response: Response
  try {
    // RELIABILITY: 90s timeout. Nano Banana 2 has a long tail at 2-4 min
    // on pathological prompts; without a cap a single hung call starves
    // the sequential batch loop in handleGenerateModuleImages and eventually
    // hits Vercel's 300s cap. Per forgeos-rules.md R4.
    response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    }, 90_000)
  } catch (fetchError) {
    const msg = fetchError instanceof Error ? fetchError.message : "Network error"
    console.error("[XRayImageGen] Fetch failed:", { model, error: msg })
    throw new Error(`[XRayImageGen] Network error calling ${model}: ${msg}`)
  }

  if (!response.ok) {
    const errText = await response.text()
    console.error("[XRayImageGen] Gemini API error:", { model, status: response.status, body: errText.slice(0, 500) })
    throw new Error(`[XRayImageGen] ${model} API error (${response.status}): ${errText.slice(0, 200)}`)
  }

  const data = (await response.json()) as NanoBananaResponse

  if (data.error) {
    console.error("[XRayImageGen] Gemini returned error:", { model, error: data.error.message })
    throw new Error(`[XRayImageGen] ${model} error: ${data.error.message}`)
  }

  // DECISION: Walk candidates[0].content.parts[] to find the first inlineData with image data.
  // Nano Banana 2 may return text parts alongside image parts.
  const parts = data.candidates?.[0]?.content?.parts
  const imagePart = parts?.find((p) => p.inlineData?.data)
  const b64Data = imagePart?.inlineData?.data
  if (!b64Data) {
    console.error("[XRayImageGen] No image in Gemini response:", { model, candidatesCount: data.candidates?.length ?? 0, partsCount: parts?.length ?? 0 })
    throw new Error(`[XRayImageGen] No image data returned from ${model}`)
  }

  const mimeType = imagePart?.inlineData?.mimeType ?? "image/png"
  return { mimeType, data: b64Data, modelUsed: model }
}

/** A reference image to send as multimodal input alongside the text prompt */
interface ReferenceImage {
  mimeType: string
  base64: string
}

/**
 * Calls the Nano Banana 2 generateContent API with one or more reference images
 * as multimodal input. Reference images are sent as inlineData parts alongside
 * the text prompt, allowing Gemini to visually match the style and geometry.
 *
 * Gemini supports up to 14 reference images per request.
 *
 * @param prompt - The text prompt
 * @param referenceImages - Array of reference images (PNG/JPEG)
 * @param aspectRatio - Aspect ratio (mapped to Nano Banana 2 supported values)
 * @returns Base64 image data and mime type
 *
 * @throws Error if GOOGLE_AI_API_KEY is missing or API call fails
 */
async function callNanoBananaImageWithReference(
  prompt: string,
  referenceImages: ReferenceImage[],
  aspectRatio?: string,
): Promise<{ mimeType: string; data: string; modelUsed: string }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("[XRayImageGen] GOOGLE_AI_API_KEY is not configured")
  }

  const url = `${GOOGLE_AI_API_BASE}/${NANO_BANANA_MODEL}:generateContent`

  // INTENT: Send reference images as inlineData parts so Gemini can visually
  // match the hero's exact style — same model that generated the hero now
  // sees it while generating each module image.
  const body = {
    contents: [{
      parts: [
        ...referenceImages.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.base64 } })),
        { text: prompt },
      ],
    }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: toNanoBananaAspectRatio(aspectRatio),
        imageSize: "2K",
      },
    },
  }

  let response: Response
  try {
    // RELIABILITY: 90s timeout to match callNanoBananaImage. Multimodal
    // prompts with reference images have the same pathological tail risk.
    response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    }, 90_000)
  } catch (fetchError) {
    const msg = fetchError instanceof Error ? fetchError.message : "Network error"
    console.error("[XRayImageGen] Fetch failed (multimodal):", { model: NANO_BANANA_MODEL, error: msg })
    throw new Error(`[XRayImageGen] Network error calling Nano Banana 2 (multimodal): ${msg}`)
  }

  if (!response.ok) {
    const errText = await response.text()
    console.error("[XRayImageGen] Nano Banana 2 multimodal API error:", { status: response.status, body: errText.slice(0, 500) })
    throw new Error(`[XRayImageGen] Nano Banana 2 multimodal API error (${response.status}): ${errText.slice(0, 200)}`)
  }

  const data = (await response.json()) as NanoBananaResponse

  if (data.error) {
    console.error("[XRayImageGen] Nano Banana 2 multimodal returned error:", { error: data.error.message })
    throw new Error(`[XRayImageGen] Nano Banana 2 multimodal error: ${data.error.message}`)
  }

  const parts = data.candidates?.[0]?.content?.parts
  const imagePart = parts?.find((p) => p.inlineData?.data)
  const b64Data = imagePart?.inlineData?.data
  if (!b64Data) {
    console.error("[XRayImageGen] No image in Nano Banana 2 multimodal response:", { candidatesCount: data.candidates?.length ?? 0, partsCount: parts?.length ?? 0 })
    throw new Error("[XRayImageGen] No image data returned from Nano Banana 2 (multimodal)")
  }

  const mimeType = imagePart?.inlineData?.mimeType ?? "image/png"
  return { mimeType, data: b64Data, modelUsed: NANO_BANANA_MODEL }
}

// ─── OpenAI Fallback ─────────────────────────────────────────────────

/**
 * Maps Gemini aspect ratio strings to OpenAI image size strings.
 * Both gpt-image-1 and gpt-image-2 support: "1024x1024", "1024x1536", "1536x1024".
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
 * Calls the OpenAI images.generate API.
 *
 * Defaults to gpt-image-2 (primary, default quality — see header for shootout
 * evidence). Falls through to gpt-image-1 with quality:"high" only when
 * explicitly routed there as a deep fallback.
 *
 * @throws Error if OPENAI_API_KEY is missing or API call fails
 */
async function callOpenAIImage(
  prompt: string,
  size: "1024x1024" | "1024x1536" | "1536x1024",
  model: string = OPENAI_PRIMARY_MODEL,
): Promise<{ mimeType: string; data: string; modelUsed: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("[XRayImageGen] OPENAI_API_KEY is not configured")
  }

  const OpenAI = (await import("openai")).default
  // RELIABILITY: 180s timeout + no retries. gpt-image-2 default-quality
  // renders land in ~50s typical; gpt-image-1 high-quality ~45s typical.
  // 180s gives headroom for pathological prompts without blowing past
  // Vercel's 300s function ceiling.
  const client = new OpenAI({ apiKey, timeout: 180_000, maxRetries: 0 })

  // DECISION: Tristan explicitly chose gpt-image-2 DEFAULT quality over
  // "high"/thinking mode after the 4-way shootout — high mode produced
  // less-accurate industrial proportions. quality:"high" is kept ONLY for
  // gpt-image-1 (the deep fallback) since that's where it's been validated.
  //
  // GOTCHA: OpenAI SDK v6's client.images.generate() has a union return type
  // (streaming vs non-streaming). Pass stream:false explicitly so TS infers
  // the ImagesResponse overload and we can access response.data.
  const response = model === OPENAI_FALLBACK_MODEL
    ? await client.images.generate({ model, prompt, n: 1, size, quality: "high", stream: false })
    : await client.images.generate({ model, prompt, n: 1, size, stream: false })

  const b64Data = response.data?.[0]?.b64_json
  if (!b64Data) {
    throw new Error(`[XRayImageGen] No image data returned from OpenAI (${model})`)
  }

  return { mimeType: "image/png", data: b64Data, modelUsed: model }
}

/**
 * Generates an image with automatic multi-model fallback.
 *
 * PRIMARY: OpenAI gpt-image-2 (default quality). Selected 2026-04-22 after a
 * 4-way shootout vs Nano Banana 2 and gpt-image-1. Default quality was chosen
 * over "high"/thinking mode because it produced more physically-accurate
 * industrial proportions on engineering illustrations.
 *
 * When referenceBase64 is provided:
 * FLOW: gpt-image-2 edit → gpt-image-2 generate → Nano Banana 2 multimodal →
 *       Nano Banana 2 text → Nano Banana stable → gpt-image-1 (deep fallback)
 *
 * When no reference:
 * FLOW: gpt-image-2 generate → Nano Banana 2 text → Nano Banana stable → gpt-image-1
 *
 * gemini-3.1-flash-image-preview is a preview model with intermittent 500 errors;
 * gemini-2.5-flash-image is the stable GA model — same API, same key, reliable
 * mid-chain fallback. gpt-image-1 sits at the bottom as a regional-outage cushion.
 */
async function callImageWithFallback(
  prompt: string,
  imageConfig: {
    aspectRatio?: string
    referenceBase64?: string
    referenceMimeType?: string
    moduleCropBase64?: string
  } = {},
): Promise<{ mimeType: string; data: string; modelUsed: string }> {
  // Enforce no-text guardrail on ALL prompts regardless of source
  const safePrompt = enforceNoText(prompt)
  const openaiSize = geminiAspectToOpenAISize(imageConfig.aspectRatio)
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY?.trim())
  // INTENT: Hero re-encoding in forge-v2-generate-one-module-image.ts outputs
  // JPEG to stay under provider upload caps (root cause: 2.52MB PNG hero → skipped
  // every coherence mechanism before this fix). Propagate the mimeType end-to-end
  // so OpenAI edit and Gemini multimodal both see the matching content-type.
  // Defaults to image/png for backwards-compat with paths that still pass PNG bytes.
  const referenceMimeType = imageConfig.referenceMimeType ?? "image/png"

  // ── Step 1: OpenAI gpt-image-2 edit (multimodal path) ─────────────
  // When a reference image is available, prefer gpt-image-2 in edit mode —
  // the shootout winner at the reference-aware path too (trial 2026-04-22).
  if (hasOpenAIKey && imageConfig.referenceBase64) {
    try {
      const result = await callOpenAIEdit(
        safePrompt,
        imageConfig.referenceBase64,
        openaiSize,
        OPENAI_PRIMARY_MODEL,
        referenceMimeType,
      )
      console.log("[XRayImageGen] gpt-image-2 edit succeeded (reference-aware)")
      return result
    } catch (editErr) {
      const msg = editErr instanceof Error ? editErr.message : String(editErr)
      console.warn("[XRayImageGen] gpt-image-2 edit failed, falling to generate:", { error: msg.slice(0, 200) })
    }
  }

  // ── Step 2: OpenAI gpt-image-2 generate (primary text-to-image) ───
  if (hasOpenAIKey) {
    try {
      return await callOpenAIImage(safePrompt, openaiSize, OPENAI_PRIMARY_MODEL)
    } catch (primaryErr) {
      const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
      console.warn("[XRayImageGen] gpt-image-2 generate failed, falling to Gemini:", { error: msg.slice(0, 200) })
    }
  }

  // ── Step 3: Nano Banana 2 multimodal (reference path) ─────────────
  if (imageConfig.referenceBase64) {
    const refs: ReferenceImage[] = [
      { mimeType: referenceMimeType, base64: imageConfig.referenceBase64 },
    ]
    if (imageConfig.moduleCropBase64) {
      // Module crops are always PNG — produced by cropModuleRegion() which
      // pipes through sharp().png(). The hero mime only affects the hero ref.
      refs.push({ mimeType: "image/png", base64: imageConfig.moduleCropBase64 })
    }
    try {
      return await callNanoBananaImageWithReference(safePrompt, refs, imageConfig.aspectRatio)
    } catch (multimodalErr) {
      const msg = multimodalErr instanceof Error ? multimodalErr.message : String(multimodalErr)
      console.warn("[XRayImageGen] Nano Banana 2 multimodal failed, trying text-only:", { error: msg.slice(0, 200) })
    }
  }

  // ── Step 4: Nano Banana 2 text-only ───────────────────────────────
  try {
    return await callNanoBananaImage(safePrompt, imageConfig.aspectRatio)
  } catch (nb2Err) {
    const msg = nb2Err instanceof Error ? nb2Err.message : String(nb2Err)
    console.warn("[XRayImageGen] Nano Banana 2 text-only failed, trying stable:", { error: msg.slice(0, 200) })
  }

  // ── Step 5: Nano Banana stable (gemini-2.5-flash-image) ──────────
  try {
    return await callNanoBananaImage(safePrompt, imageConfig.aspectRatio, NANO_BANANA_STABLE_MODEL)
  } catch (nbStableErr) {
    const msg = nbStableErr instanceof Error ? nbStableErr.message : String(nbStableErr)
    if (!hasOpenAIKey) {
      console.warn("[XRayImageGen] All Gemini models failed and OPENAI_API_KEY is not set — no deep fallback")
      throw nbStableErr
    }
    console.warn("[XRayImageGen] All Gemini models failed, dropping to gpt-image-1:", { error: msg.slice(0, 200) })
  }

  // ── Step 6: OpenAI gpt-image-1 (deep fallback) ────────────────────
  return await callOpenAIImage(safePrompt, openaiSize, OPENAI_FALLBACK_MODEL)
}

/**
 * Calls OpenAI images.edit with a reference image. Used by step 1 of the
 * fallback chain and by the dedicated generateModuleImageWithReference entry
 * point. Returns in the same shape as callOpenAIImage.
 */
async function callOpenAIEdit(
  prompt: string,
  referenceBase64: string,
  size: "1024x1024" | "1024x1536" | "1536x1024",
  model: string = OPENAI_PRIMARY_MODEL,
  referenceMimeType: string = "image/png",
): Promise<{ mimeType: string; data: string; modelUsed: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("[XRayImageGen] OPENAI_API_KEY is not configured")
  }

  const openaiModule = await import("openai")
  const OpenAI = openaiModule.default
  const { toFile } = openaiModule
  // Same 180s + no-retries rationale as callOpenAIImage.
  const client = new OpenAI({ apiKey, timeout: 180_000, maxRetries: 0 })

  // INTENT: filename extension + type header must match the actual bytes.
  // The hero re-encoder ships JPEG; an earlier hardcoded "reference.png"
  // caused OpenAI to reject mismatched JPEG bytes with 400 on upload.
  const isJpeg = /jpe?g/i.test(referenceMimeType)
  const filename = isJpeg ? "reference.jpg" : "reference.png"
  const normalizedMime = isJpeg ? "image/jpeg" : "image/png"
  const imageFile = await toFile(
    Buffer.from(referenceBase64, "base64"),
    filename,
    { type: normalizedMime },
  )

  const response = await client.images.edit({
    model,
    image: imageFile,
    prompt,
    size,
  })

  const b64Data = response.data?.[0]?.b64_json
  if (!b64Data) {
    throw new Error(`[XRayImageGen] No image data returned from OpenAI edit (${model})`)
  }

  // The rendered output from images.edit is always PNG regardless of the
  // reference mimeType we sent in — do not echo the reference mime here.
  return { mimeType: "image/png", data: b64Data, modelUsed: model }
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

  // SECURITY: getPublicUrl is the correct choice here despite C3's original switch to
  // createSignedUrl. Three reasons:
  //   1. The xray-images bucket is `public=true`. A 1-hour signed URL prevents nothing —
  //      `/object/public/{bucket}/{path}` resolves anyway for anyone with the path.
  //   2. Access control IS the UUID in `{scanId}/{filename}`. scanId is a v4 UUID (122 bits of
  //      entropy); the filename is a stable slug. Guessing a project's images requires guessing
  //      its UUID — infeasible.
  //   3. The URL is persisted into `cad_lab_projects.modules[].imageUrl` / `.system_illustration_url`
  //      and rendered via <img src={imageUrl}> on subsequent loads. A signed URL that expires 1h
  //      after generation breaks the project the next time the user opens it. Before commit
  //      1c45905a a race condition masked this by wiping the column entirely; now that the race
  //      is fixed, signed URLs would reach the DB and silently rot.
  // If the bucket is ever flipped to `public=false`, switch to on-read resigning (not on-write),
  // because storage objects outlive the 1h window.
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path)

  return urlData.publicUrl
}

// ─── Reference Image Preparation ────────────────────────────────────

/**
 * Prepares the hero image as a full-resolution reference for Gemini multimodal.
 * Keeps the full 16:9 aspect (no crop — cropping removes edge components),
 * resizes to 2048px wide (matching Gemini's native 2K output), lossless PNG.
 *
 * @param base64Png - Base64-encoded 16:9 PNG from system illustration
 * @returns Base64-encoded 16:9 PNG at 2048px wide
 */
export async function prepareReferenceImage(base64Png: string): Promise<string> {
  const buf = Buffer.from(base64Png, "base64")
  const meta = await sharp(buf).metadata()
  const w = meta.width ?? 1920
  const h = meta.height ?? 1080

  // Resize to 2048px wide, preserving aspect ratio, lossless PNG
  const targetWidth = Math.min(w, 2048)
  const targetHeight = Math.round(targetWidth * (h / w))

  const resized = await sharp(buf)
    .resize(targetWidth, targetHeight)
    .png()
    .toBuffer()

  return resized.toString("base64")
}

// ─── Bounding Box Analysis & Module Cropping (Layer 2) ──────────────

/** Normalised bounding box (0-1 coordinates) for a module region in the hero image */
export interface ModuleBoundingBox {
  x: number // left edge (0-1)
  y: number // top edge (0-1)
  w: number // width (0-1)
  h: number // height (0-1)
}

/**
 * Calls Claude Vision (Sonnet) to identify bounding box regions for each
 * named module in the hero image. Returns normalised (0-1) coordinates.
 *
 * @param heroBase64 - Base64-encoded PNG of the hero/system illustration
 * @param moduleNames - Names of modules to locate in the image
 * @returns Map of module name → normalised bounding box, or {} on failure
 */
export async function analyseHeroBoundingBoxes(
  heroBase64: string,
  moduleNames: string[],
  heroMimeType: string = "image/png",
): Promise<Record<string, ModuleBoundingBox>> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    console.warn("[XRayImageGen] No ANTHROPIC_API_KEY — skipping bounding box analysis")
    return {}
  }

  if (!heroBase64 || moduleNames.length === 0) return {}

  const normalizedMime = /^image\/(png|jpe?g|gif|webp)$/i.test(heroMimeType)
    ? heroMimeType.replace(/jpg/i, "jpeg")
    : "image/png"

  try {
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
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: `You are a vision analyst identifying component regions in engineering illustrations.

Given a technical illustration and a list of module/sub-assembly names, identify the approximate bounding box region for each module visible in the image. Return normalised coordinates (0-1 range, where 0,0 is top-left and 1,1 is bottom-right).

Return ONLY valid JSON: { "ModuleName": { "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4 }, ... }
If a module is not clearly visible, omit it from the result. Do not include text outside JSON.`,
          messages: [{
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: normalizedMime,
                  data: heroBase64,
                },
              },
              {
                type: "text",
                text: `Identify the bounding box region for each of these modules in the illustration:\n${moduleNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}\n\nReturn JSON with normalised 0-1 coordinates.`,
              },
            ],
          }],
        }),
      },
      20_000,
    )

    if (!response.ok) {
      console.warn(`[XRayImageGen] Bounding box API returned ${response.status}`)
      return {}
    }

    const data = await response.json()
    const text = data?.content?.[0]?.text
    if (!text) return {}

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn("[XRayImageGen] Could not extract JSON from bounding box response")
      return {}
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, ModuleBoundingBox>

    // Validate and clamp all bounding boxes
    const validated: Record<string, ModuleBoundingBox> = {}
    for (const [name, box] of Object.entries(parsed)) {
      if (
        typeof box.x === "number" && typeof box.y === "number" &&
        typeof box.w === "number" && typeof box.h === "number" &&
        box.w > 0 && box.h > 0
      ) {
        validated[name] = {
          x: Math.max(0, Math.min(1, box.x)),
          y: Math.max(0, Math.min(1, box.y)),
          w: Math.max(0.05, Math.min(1, box.w)),
          h: Math.max(0.05, Math.min(1, box.h)),
        }
      }
    }

    console.log(`[XRayImageGen] Bounding boxes detected for ${Object.keys(validated).length} modules`)
    return validated
  } catch (err) {
    console.warn("[XRayImageGen] Bounding box analysis failed:", err instanceof Error ? err.message : err)
    return {}
  }
}

/**
 * Crops a module's region from the hero image using a normalised bounding box.
 * Adds 10% padding, then resizes to 1024×1024 PNG for use as a second reference.
 *
 * @param heroBase64 - Base64-encoded PNG of the full hero image
 * @param box - Normalised bounding box (0-1 coordinates)
 * @returns Base64-encoded 1024×1024 PNG of the cropped region
 */
export async function cropModuleRegion(
  heroBase64: string,
  box: ModuleBoundingBox,
): Promise<string> {
  const buf = Buffer.from(heroBase64, "base64")
  const meta = await sharp(buf).metadata()
  const imgW = meta.width ?? 1920
  const imgH = meta.height ?? 1080

  // Convert normalised to pixel coords with 10% padding
  const pad = 0.1
  const px = Math.max(0, Math.round((box.x - box.w * pad) * imgW))
  const py = Math.max(0, Math.round((box.y - box.h * pad) * imgH))
  const pw = Math.min(imgW - px, Math.round(box.w * (1 + 2 * pad) * imgW))
  const ph = Math.min(imgH - py, Math.round(box.h * (1 + 2 * pad) * imgH))

  const cropped = await sharp(buf)
    .extract({ left: px, top: py, width: Math.max(1, pw), height: Math.max(1, ph) })
    .resize(1024, 1024, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer()

  return cropped.toString("base64")
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
    .jpeg({ quality: 85 })
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
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiKey) return null

  try {
    const openaiModule = await import("openai")
    const OpenAI = openaiModule.default
    const { toFile } = openaiModule
    // RELIABILITY: 120s timeout + no retries — see the other OpenAI ctor.
    const client = new OpenAI({ apiKey: openaiKey, timeout: 120_000, maxRetries: 0 })

    const prompt = buildReferenceEditPrompt(module, visualStyle)
    const imageFile = await toFile(Buffer.from(referenceBase64, "base64"), "reference.png", { type: "image/png" })

    const response = await client.images.edit({
      model: OPENAI_PRIMARY_MODEL,
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

// ─── Geometric Consistency Verification (Layer 3) ───────────────────

/** Result from geometric consistency scoring */
interface ConsistencyScoreResult {
  score: number // 1-10
  issues: string[]
  shouldRegenerate: boolean
}

/**
 * Sends hero + module image to Claude Vision and scores geometric consistency.
 * Returns null on any failure (non-blocking — keeps the first generation).
 *
 * @param heroBase64 - Base64-encoded PNG of the hero image
 * @param moduleBase64 - Base64-encoded PNG of the generated module image
 * @param moduleName - Name of the module being scored
 * @returns Score result, or null on failure
 */
async function scoreImageConsistency(
  heroBase64: string,
  moduleBase64: string,
  moduleName: string,
  heroMimeType: string = "image/png",
): Promise<ConsistencyScoreResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return null

  // Claude Vision accepts image/png, image/jpeg, image/gif, image/webp.
  // Normalise anything else back to PNG so the API call doesn't 400.
  const normalizedHeroMime = /^image\/(png|jpe?g|gif|webp)$/i.test(heroMimeType)
    ? heroMimeType.replace(/jpg/i, "jpeg")
    : "image/png"

  try {
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
          model: "claude-sonnet-4-6",
          max_tokens: 512,
          system: `You are an engineering illustration quality inspector. Compare a hero/overview image (IMAGE 1) with a module detail image (IMAGE 2) and score geometric consistency on a scale of 1-10.

Scoring guide:
- 9-10: Components in IMAGE 2 are geometrically identical to the corresponding region in IMAGE 1 — same shapes, proportions, and structural forms
- 7-8: Most geometry matches, minor proportional differences
- 5-6: Recognisably the same concept but with notable geometric differences (e.g. circular vs rectangular, different proportions)
- 3-4: Significant geometric mismatch — shapes or component types differ substantially
- 1-2: No geometric relationship — IMAGE 2 looks like a completely different design

Return ONLY valid JSON: { "score": <number>, "issues": ["<specific geometric difference>", ...] }
Do not include text outside JSON.`,
          messages: [{
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: normalizedHeroMime, data: heroBase64 },
              },
              {
                type: "image",
                // Module renders come from the provider as PNG — see uploadToStorage callsite.
                source: { type: "base64", media_type: "image/png", data: moduleBase64 },
              },
              {
                type: "text",
                text: `Score the geometric consistency of the "${moduleName}" module (IMAGE 2) against the hero image (IMAGE 1). Return JSON only.`,
              },
            ],
          }],
        }),
      },
      20_000,
    )

    if (!response.ok) {
      console.warn(`[XRayImageGen] Consistency scoring API returned ${response.status}`)
      return null
    }

    const data = await response.json()
    const text = data?.content?.[0]?.text
    if (!text) return null

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    if (typeof parsed.score !== "number" || !Array.isArray(parsed.issues)) return null

    const score = Math.round(Math.max(1, Math.min(10, parsed.score)))
    return {
      score,
      issues: parsed.issues.map(String),
      shouldRegenerate: score < 6,
    }
  } catch (err) {
    console.warn("[XRayImageGen] Consistency scoring failed:", err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Builds a constrained retry prompt that incorporates specific issues from
 * the consistency scorer. Appended to the original module prompt on retry.
 */
function buildConstrainedRetryPrompt(
  module: ModuleSpec,
  issues: string[],
  visualStyle?: VisualStyleSpec,
  hasModuleCrop?: boolean,
): string {
  const basePrompt = buildReferenceAwareModulePrompt(module, visualStyle, hasModuleCrop)
  const issueList = issues.map((i, idx) => `- ${idx + 1}. ${i}`).join("\n")

  return `${basePrompt}

RETRY: A previous generation failed geometric consistency review. Fix these specific issues:
${issueList}
Do NOT deviate from the reference image geometry. Every shape, proportion, and component type must match exactly.`
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Generates a blueprint image for a single module.
 *
 * When referenceBase64 is provided, uses the multimodal Gemini path:
 * the hero image is sent as inlineData so Gemini can visually match its style.
 * Falls back through text-only Gemini → OpenAI automatically.
 *
 * @param scanId - The scan ID for storage namespacing
 * @param module - The module to generate an image for
 * @param brief - Optional structural brief from Opus orchestrator for consistency with 3D model
 * @param visualStyle - Optional shared visual style for cross-module cohesion
 * @param referenceBase64 - Optional base64 PNG of the hero image (cropped to 3:2) for style matching
 * @returns The public URL of the generated image
 *
 * @throws Error if image generation or upload fails
 */
export async function generateModuleImage(
  scanId: string,
  module: ModuleSpec,
  brief?: StructuralBrief,
  visualStyle?: VisualStyleSpec,
  referenceBase64?: string,
  moduleCropBase64?: string,
  stylePreamble?: string,
  referenceMimeType?: string,
): Promise<{ url: string; modelUsed: string }> {
  // DECISION: Prefer AI-crafted prompt from reconciliation when available — these are
  // crafted together across all modules for visual consistency. Fall through to
  // existing programmatic prompts (reference-aware or text-only) when unset.
  // DECISION: Same white-background + full-colour prepend as the hero path.
  // Without this, Opus-crafted module prompts produce dark/monochrome renders.
  //
  // stylePreamble (optional): project-level illustration style contract
  // prepended at the very top so image models anchor style on it. Provided
  // by the V2 orchestrator (reads cad_lab_projects.illustration_style).
  // Without it, hero + per-module paths drift apart because only the V1
  // reconciliation path committed both to the same style.
  const rawPrompt = module.moduleImagePrompt
    ? MANDATORY_RENDERING_PREAMBLE + enforceNoText(module.moduleImagePrompt) + COHESIVE_STYLE_SUFFIX
    : referenceBase64
      ? buildReferenceAwareModulePrompt(module, visualStyle, !!moduleCropBase64)
      : buildModulePrompt(module, brief, visualStyle)
  const prompt = stylePreamble ? stylePreamble + rawPrompt : rawPrompt

  let imageData = await callImageWithFallback(prompt, {
    aspectRatio: "3:2",
    referenceBase64,
    referenceMimeType,
    moduleCropBase64,
  })

  // Layer 3: Geometric consistency verification + single retry
  if (referenceBase64 && process.env.ANTHROPIC_API_KEY?.trim()) {
    // Pass the hero's actual mime-type — when it's a JPEG re-encoded hero
    // (Fix 1) Claude Vision needs the matching media_type or it 400s.
    const consistencyResult = await scoreImageConsistency(
      referenceBase64,
      imageData.data,
      module.name,
      referenceMimeType,
    )
    if (consistencyResult) {
      console.log(`[XRayImageGen] Geometric consistency score ${consistencyResult.score}/10 for ${module.name}`)
      if (consistencyResult.shouldRegenerate) {
        console.log(`[XRayImageGen] Score below threshold, retrying with constraints for ${module.name}`)
        const retryPrompt = buildConstrainedRetryPrompt(module, consistencyResult.issues, visualStyle, !!moduleCropBase64)
        try {
          const retryData = await callImageWithFallback(retryPrompt, {
            aspectRatio: "3:2",
            referenceBase64,
            referenceMimeType,
            moduleCropBase64,
          })
          imageData = retryData
        } catch (retryErr) {
          console.warn(`[XRayImageGen] Retry failed for ${module.name}, keeping original:`, retryErr instanceof Error ? retryErr.message : retryErr)
          // Keep original imageData on retry failure
        }
      }
    }
  }

  // INTENT: overlayModuleLabels() was removed here because Sharp's SVG composite
  // falls back to missing-glyph tofu boxes on Vercel's Linux container — the
  // font family we pass ("system-ui, -apple-system, Helvetica, Arial, sans-serif")
  // doesn't resolve in the build image, so every module render baked in a black
  // frame + red corner brackets + rows of □□□□ where text should be. The PDF
  // export surface (src/actions/export-project-pdf.tsx) renders the module name,
  // weight, and lead-time as proper text outside the image, so the overlay was
  // also redundant. Pass the raw render through unchanged.
  const labeledData = imageData.data

  const url = await uploadToStorage(
    scanId,
    `module-${module.id}.png`,
    labeledData,
    imageData.mimeType,
  )

  return { url, modelUsed: imageData.modelUsed }
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
): Promise<{ url: string; modelUsed: string }> {
  // FLOW: tryOpenAIEdit → [fail] → text-only ghost prompt (existing path)
  const editResult = await tryOpenAIEdit(module, referenceBase64, visualStyle)

  let imageData: { mimeType: string; data: string; modelUsed: string }
  if (editResult) {
    imageData = { ...editResult, modelUsed: OPENAI_PRIMARY_MODEL }
  } else {
    // Fallback to text-only ghost prompt
    const prompt = buildModulePrompt(module, undefined, visualStyle)
    imageData = await callImageWithFallback(prompt, { aspectRatio: "3:2" })
  }

  // INTENT: overlayModuleLabels() was removed here because Sharp's SVG composite
  // falls back to missing-glyph tofu boxes on Vercel's Linux container — the
  // font family we pass ("system-ui, -apple-system, Helvetica, Arial, sans-serif")
  // doesn't resolve in the build image, so every module render baked in a black
  // frame + red corner brackets + rows of □□□□ where text should be. The PDF
  // export surface (src/actions/export-project-pdf.tsx) renders the module name,
  // weight, and lead-time as proper text outside the image, so the overlay was
  // also redundant. Pass the raw render through unchanged.
  const labeledData = imageData.data

  const url = await uploadToStorage(
    scanId,
    `module-${module.id}.png`,
    labeledData,
    imageData.mimeType,
  )

  return { url, modelUsed: imageData.modelUsed }
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
  researchExcerpt?: string,
  customPrompt?: string,
  referenceImageUrls?: string[],
  stylePreamble?: string,
): Promise<string> {
  let prompt: string

  if (customPrompt) {
    // INTENT: When Opus design synthesis provides a hero prompt, use it directly.
    // Prepend white-background + color + no-text enforcement (image models weight
    // the start of the prompt most heavily — putting these rules at the end caused
    // dark/monochrome renders).
    prompt = MANDATORY_RENDERING_PREAMBLE + enforceNoText(customPrompt) + COHESIVE_STYLE_SUFFIX
  } else {
    // Existing programmatic prompt construction
    const hasModules = moduleNames.length > 0

    // DECISION: Don't list module names — image models render them as garbled
    // text.  Use count-based description instead.
    const moduleContext = hasModules
      ? `\n\nThis is an engineering overview showing the complete system with its ${moduleNames.length} major sub-assemblies.`
      : ""

    // INTENT: productFormDescription is the geometric shape description from the visual style step.
    // It turns "draw a quadrotor drone" into "draw a product with a low rectangular chassis,
    // four cylindrical motor housings..." — the single highest-impact prompt enrichment.
    // Falls back to raw research excerpt when no visual style is available (Trigger A).
    const formDescription = visualStyle?.productFormDescription
      ? `\n\nPhysical form: ${visualStyle.productFormDescription}`
      : researchExcerpt
        ? `\n\nProduct description: ${researchExcerpt}`
        : ""

    // DECISION: Module purposes give the image model functional context about what the
    // sub-assemblies do, without listing names that would render as garbled text.
    const structuralContext = hasModules && modulePurposes.length > 0
      ? `\n\nThe sub-assemblies handle: ${modulePurposes.join("; ")}.`
      : ""

    const styleDirective = visualStyle
      ? `\n\nColor palette: use ${visualStyle.colorPalette} as the dominant colors. Material rendering: ${visualStyle.materialRendering}. Context: ${visualStyle.unifyingContext}.`
      : ""

    // DECISION: "engineering specification document" cues the image model to add labeled
    // annotations with leader lines — Gemini/DALL-E can't spell, producing garbled text.
    // Use "product render" framing instead, and triple-reinforce the no-text instruction.
    prompt = `IMPORTANT: This image must contain ZERO text — no labels, no annotations, no words, no letters, no numbers, no callouts, no captions anywhere.

Create a clean, professional technical illustration of a ${subject}.${moduleContext}${formDescription}${structuralContext}${styleDirective}

Style: Modern technical product render on a clean white background. Show the complete system in ${hasModules ? "an exploded or semi-transparent isometric view so the internal arrangement of sub-assemblies is visible" : "a detailed isometric or three-quarter view showing its key components and overall form factor"}. Use thin, precise lines with subtle color coding to differentiate ${hasModules ? "sub-assemblies" : "major components"}. Differentiate each major ${hasModules ? "sub-assembly" : "component"} using distinct colors and visual separation. No decorative elements, borders, title blocks, or watermarks. Generous whitespace around the illustration. Remember: absolutely no text, labels, annotations, or writing of any kind in the image.${COHESIVE_STYLE_SUFFIX}`
  }

  // Prepend the project-level style preamble so the hero is framed the same
  // way the per-module blueprints are framed (both paths receive the same
  // preamble from the V2 orchestrator). Without this, the programmatic hero
  // prompt above defaults to iso-illustrative while modules render thin-line
  // blueprint — two different projects in the PDF.
  if (stylePreamble) {
    prompt = stylePreamble + prompt
  }

  // INTENT: When user reference images are available, fetch them as base64 and
  // pass as multimodal reference so the image model can match the visual intent.
  let userRefBase64: string | undefined
  if (referenceImageUrls && referenceImageUrls.length > 0) {
    try {
      const res = await fetch(referenceImageUrls[0])
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        userRefBase64 = buf.toString("base64")
      }
    } catch { /* Non-critical — generate without reference */ }
  }

  const imageData = await callImageWithFallback(prompt, {
    aspectRatio: "16:9",
    referenceBase64: userRefBase64,
  })

  const url = await uploadToStorage(
    projectId,
    "research-illustration.png",
    imageData.data,
    imageData.mimeType,
  )

  return `${url}?v=${Date.now()}`
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
