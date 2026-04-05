/**
 * @file report-image-generator.ts — AI image generation for report visuals
 *
 * @description Generates atmospheric/decorative images for report covers,
 * section accents, slide backgrounds, and infographics using the same
 * Gemini image generation pipeline proven in the CAD Lab X-Ray system.
 *
 * INTENT: Reports should "blow people away" visually. Recharts handles
 * precise data viz; these AI images provide the atmospheric hero visuals
 * above the data sections, cover backgrounds, and slide imagery.
 *
 * DECISION: Reuses exact same REST API call pattern from image-generator.ts
 * (not the SDK) because it supports responseModalities: ["TEXT", "IMAGE"].
 *
 * @security Requires GOOGLE_AI_API_KEY; optionally OPENAI_API_KEY for fallback
 *
 * @related
 * - src/app/(platform)/the-forge/services/image-generator.ts — CAD Lab image gen (same pattern)
 * - src/actions/report-generator.ts — Orchestrates report generation
 * - src/components/reports/sections/ — Section renderers consume imageUrls
 */

import { createAdminClient } from "@/lib/supabase/admin"

import type {
  ReportBranding,
  SectionData,
  ReportTemplateId,
} from "./report-document-types"

// ─── Constants ───────────────────────────────────────────────────────

const GOOGLE_AI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
const NANO_BANANA_MODEL = "gemini-3.1-flash-image-preview"
const NANO_BANANA_STABLE_MODEL = "gemini-2.5-flash-image"
const OPENAI_IMAGE_MODEL = "gpt-image-1"
const STORAGE_BUCKET = "report-images"
const IMAGE_TIMEOUT_MS = 30_000

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

const NO_TEXT_SUFFIX =
  "\n\nCRITICAL: This image must contain ZERO text, letters, words, numbers, labels, annotations, dimensions, or writing of any kind. The image should be purely visual with no readable characters anywhere."

function enforceNoText(prompt: string): string {
  if (prompt.includes("ZERO text")) return prompt
  return prompt + NO_TEXT_SUFFIX
}

// ─── Core Image Generation ──────────────────────────────────────────

/**
 * Call Gemini image generation API (Nano Banana).
 * Same REST pattern as CAD Lab image-generator.ts.
 */
async function callNanoBananaImage(
  prompt: string,
  aspectRatio: string = "16:9",
  model: string = NANO_BANANA_MODEL,
): Promise<string | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim()
  if (!apiKey) return null

  const url = `${GOOGLE_AI_API_BASE}/${model}:generateContent`
  const body = {
    contents: [{ parts: [{ text: enforceNoText(prompt) }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio },
    },
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      console.warn(`[ReportImageGen] ${model} returned ${response.status}`)
      return null
    }

    const data = (await response.json()) as NanoBananaResponse
    if (data.error) {
      console.warn(`[ReportImageGen] ${model} error:`, data.error.message)
      return null
    }

    const imagePart = data.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData?.data,
    )
    return imagePart?.inlineData?.data ?? null
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown"
    console.warn(`[ReportImageGen] ${model} failed:`, msg)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Call OpenAI image generation as final fallback.
 */
async function callOpenAIImage(
  prompt: string,
  size: "1024x1024" | "1536x1024" | "1024x1536" = "1536x1024",
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null

  try {
    const { default: OpenAI } = await import("openai")
    const client = new OpenAI({ apiKey })
    const result = await client.images.generate({
      model: OPENAI_IMAGE_MODEL,
      prompt: enforceNoText(prompt),
      n: 1,
      size,
      response_format: "b64_json",
    })
    return result.data?.[0]?.b64_json ?? null
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown"
    console.warn("[ReportImageGen] OpenAI fallback failed:", msg)
    return null
  }
}

/**
 * Generate an image with full fallback chain:
 * Nano Banana 2 → Nano Banana Stable → OpenAI
 */
async function generateImageWithFallback(
  prompt: string,
  aspectRatio: string = "16:9",
): Promise<string | null> {
  // Try Nano Banana 2 (primary)
  let base64 = await callNanoBananaImage(prompt, aspectRatio, NANO_BANANA_MODEL)
  if (base64) return base64

  // Try Nano Banana Stable (fallback 1)
  base64 = await callNanoBananaImage(prompt, aspectRatio, NANO_BANANA_STABLE_MODEL)
  if (base64) return base64

  // Try OpenAI (fallback 2)
  const sizeMap: Record<string, "1024x1024" | "1536x1024" | "1024x1536"> = {
    "16:9": "1536x1024",
    "3:4": "1024x1536",
    "1:1": "1024x1024",
    "4:3": "1536x1024",
  }
  base64 = await callOpenAIImage(prompt, sizeMap[aspectRatio] ?? "1536x1024")
  return base64
}

// ─── Storage Upload ─────────────────────────────────────────────────

/**
 * Upload base64 image data to Supabase Storage and return public URL.
 */
async function uploadReportImage(
  reportId: string,
  filename: string,
  base64Data: string,
): Promise<string | null> {
  try {
    const supabase = createAdminClient()
    const buffer = Buffer.from(base64Data, "base64")
    const path = `${reportId}/${filename}`

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, buffer, { contentType: "image/png", upsert: true })

    if (error) {
      console.error("[ReportImageGen] Upload failed:", error.message)
      return null
    }

    // SECURITY: Use signed URL — report images are confidential business content
    const { data: urlData } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(path, 3600)

    return urlData?.signedUrl ?? null
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown"
    console.error("[ReportImageGen] Upload error:", msg)
    return null
  }
}

// ─── Prompt Builders ────────────────────────────────────────────────

function buildBrandColorDirective(branding?: ReportBranding): string {
  const primary = branding?.primaryColor ?? "#FF4500"
  const accent = branding?.accentColor ?? "#3B82F6"
  return `Use these brand colors as accents: primary ${primary}, secondary ${accent}. Keep the overall palette restrained — these colors should appear as highlights, not dominate.`
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Generate a cover image for the report.
 *
 * @returns Public URL of the uploaded image, or null on failure
 */
export async function generateCoverImage(
  reportId: string,
  companyName: string,
  reportType: ReportTemplateId,
  dateLabel: string,
  branding?: ReportBranding,
): Promise<string | null> {
  const aspectRatio = reportType === "board-pack" ? "3:4" : "16:9"
  const mood =
    reportType === "board-pack"
      ? "formal, sophisticated, premium feel — deep navy and charcoal tones with subtle geometric patterns suggesting corporate governance and strategic oversight"
      : "modern, optimistic, forward-looking — warm orange and cool gray tones with flowing abstract shapes suggesting momentum and progress"

  const prompt = `Create an abstract geometric artwork for a business report cover. ${mood}.

Style: Stripe/Linear/Notion aesthetic — clean, minimal, sophisticated. Abstract shapes suggesting growth, progress, and engineering precision. No logos, no text, no charts, no people, no photographs.

${buildBrandColorDirective(branding)}

The image will be used as a background with text overlaid on top, so keep the center area relatively open and low-contrast. The edges can be more visually active.`

  const base64 = await generateImageWithFallback(prompt, aspectRatio)
  if (!base64) return null
  return uploadReportImage(reportId, "cover.png", base64)
}

/**
 * Generate a section accent image — atmospheric visual above the data.
 *
 * @returns Public URL of the uploaded image, or null on failure
 */
export async function generateSectionAccentImage(
  reportId: string,
  sectionType: string,
  sectionContext: string,
  branding?: ReportBranding,
): Promise<string | null> {
  const themeMap: Record<string, string> = {
    "key-metrics": "Abstract visualization suggesting measurement, gauges, and data flows — geometric circles, arcs, and flowing lines in a clean analytical style",
    "objectives-progress": "Abstract illustration suggesting targets, milestones, and forward motion — concentric rings, progress arcs, and directional arrows in a clean geometric style",
    "financial-snapshot": "Abstract illustration suggesting financial flows — smooth liquid shapes, flowing curves, and layered transparent planes in cool blue and warm amber tones",
    "sales-pipeline": "Abstract illustration suggesting momentum and expansion — funnel-like shapes, widening paths, and radiating geometric forms suggesting growth and conversion",
    "completion-trend": "Abstract illustration suggesting time progression and achievement — ascending curves, rhythmic patterns, and wave-like forms flowing left to right",
    "engineering-activity": "Abstract technical illustration with a blueprint aesthetic — precise geometric shapes, circuit-like patterns, and structured grid forms suggesting engineering precision",
  }

  const theme = themeMap[sectionType]
  if (!theme) return null // Only generate for supported sections

  const prompt = `Create a wide abstract illustration for a business report section. ${theme}.

Style: Modern, minimal, sophisticated — Stripe/Linear aesthetic. Pure abstract art, not a chart or diagram. Will be displayed as a hero banner above precise data charts.

${buildBrandColorDirective(branding)}

Keep it clean, airy, and visually interesting without being busy. Light background, subtle gradients, no text.`

  const base64 = await generateImageWithFallback(prompt, "16:9")
  if (!base64) return null
  return uploadReportImage(reportId, `section-${sectionType}.png`, base64)
}

/**
 * Generate a slide background image.
 *
 * @returns Public URL of the uploaded image, or null on failure
 */
export async function generateSlideBackgroundImage(
  reportId: string,
  slideType: string,
  headline: string,
  companyName: string,
): Promise<string | null> {
  const styleMap: Record<string, string> = {
    title:
      "Bold, confident abstract composition — geometric shapes and gradients suggesting the opening of a major presentation. Warm tones with orange and deep navy. More visually impactful than other slides.",
    "hero-insight":
      "Clean abstract composition with a single focal point — a glowing geometric form or radial pattern suggesting a key insight or revelation. Warm highlight on cool background.",
    "section-divider":
      "Dark, atmospheric abstract composition — deep navy/charcoal with subtle geometric textures and a thin accent line. Moody and dramatic, designed for white text overlay.",
  }

  const style = styleMap[slideType]
  if (!style) return null

  const prompt = `Create an abstract background image for a presentation slide. ${style}.

This will have text overlaid on it, so maintain good contrast zones — keep large areas relatively uniform in brightness. No text in the image itself.

Style: Premium, sophisticated — like a high-end consulting firm's deck. Pure abstract, no photos, no icons.`

  const base64 = await generateImageWithFallback(prompt, "16:9")
  if (!base64) return null
  return uploadReportImage(reportId, `slide-${slideType}-${Date.now()}.png`, base64)
}

/**
 * Generate a full-page AI infographic image from report metrics.
 *
 * @returns Public URL of the uploaded image, or null on failure
 */
export async function generateInfographicImage(
  reportId: string,
  metricsSnapshot: string,
  companyName: string,
  branding?: ReportBranding,
): Promise<string | null> {
  const prompt = `Create a beautiful, professional infographic illustration for ${companyName}. This is a visual summary of their business performance.

Key data to represent visually through abstract metaphors (NOT as text or numbers — use shapes, sizes, colors, and spatial relationships to convey meaning):

${metricsSnapshot}

Style: Modern editorial infographic aesthetic — clean geometric shapes, flowing connections between concepts, layered transparent planes, subtle gradients. Think Stripe Annual Letter or Linear changelog visual style.

${buildBrandColorDirective(branding)}

Layout: Portrait orientation (3:4). Organized in clear visual zones from top to bottom. Use varying shape sizes to convey relative magnitude. Connected elements to show relationships. The overall impression should be of a thriving, well-run operation.`

  const base64 = await generateImageWithFallback(prompt, "3:4")
  if (!base64) return null
  return uploadReportImage(reportId, "infographic.png", base64)
}

/**
 * Generate all report images in parallel.
 * Returns a map of imageType → public URL.
 * Individual failures return null (graceful degradation).
 *
 * @returns Map of image keys to public URLs
 */
export async function generateAllReportImages(
  reportId: string,
  sections: SectionData[],
  companyName: string,
  templateId: ReportTemplateId,
  dateLabel: string,
  branding?: ReportBranding,
): Promise<Map<string, string>> {
  const results = new Map<string, string>()

  if (!process.env.GOOGLE_AI_API_KEY?.trim()) {
    console.info("[ReportImageGen] No GOOGLE_AI_API_KEY — skipping image generation")
    return results
  }

  console.info("[ReportImageGen] Starting parallel image generation for", reportId)
  const startTime = Date.now()

  // Build all image generation promises
  const promises: Array<{ key: string; promise: Promise<string | null> }> = []

  // Cover image
  promises.push({
    key: "cover",
    promise: generateCoverImage(reportId, companyName, templateId, dateLabel, branding),
  })

  // Section accent images
  const accentSections = [
    "key-metrics",
    "objectives-progress",
    "financial-snapshot",
    "sales-pipeline",
    "completion-trend",
    "engineering-activity",
  ]

  for (const section of sections) {
    if (accentSections.includes(section.type)) {
      const narrative =
        "sectionNarrative" in section.data
          ? (section.data as { sectionNarrative?: string }).sectionNarrative ?? ""
          : ""
      promises.push({
        key: `section-${section.type}`,
        promise: generateSectionAccentImage(
          reportId,
          section.type,
          narrative,
          branding,
        ),
      })
    }
  }

  // Execute all in parallel
  const settled = await Promise.allSettled(
    promises.map(async ({ key, promise }) => {
      const url = await promise
      return { key, url }
    }),
  )

  for (const result of settled) {
    if (result.status === "fulfilled" && result.value.url) {
      results.set(result.value.key, result.value.url)
    }
  }

  console.info(
    `[ReportImageGen] Completed ${results.size}/${promises.length} images in ${Date.now() - startTime}ms`,
  )

  return results
}
