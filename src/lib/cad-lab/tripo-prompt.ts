/**
 * @file tripo-prompt.ts — Builds 3D-focused text prompts for Tripo's text-to-model API.
 *
 * @description Uses the rich semantic data already stored in visual_style JSONB
 * (cadGeometryPrompt, productFormDescription, colorPalette, materialRendering)
 * to generate a text prompt that accurately describes the product geometry.
 * This produces far better 3D models than reverse-engineering geometry from a
 * 2D illustration pixel-by-pixel.
 *
 * @see tripo-client.ts for the API call that consumes these prompts.
 */

import type { VisualStyleSpec } from "@/lib/cad-lab-types"

export interface TripoPromptResult {
  prompt: string
  negativePrompt: string
}

const NEGATIVE_PROMPT =
  "low quality, blurry, distorted, cartoon, stylized, wireframe, flat, 2D, text, watermark"

/**
 * Build a 3D-focused text prompt from visual style data for Tripo's text-to-model API.
 *
 * @param subject - Product name/title (e.g. "Filter Press Assembly")
 * @param visualStyle - Visual style spec from DB (may be null)
 * @returns Prompt and negative prompt, or null if insufficient context for text-to-model
 */
export function buildTripo3DPrompt(
  subject: string | null | undefined,
  visualStyle: VisualStyleSpec | null | undefined,
): TripoPromptResult | null {
  // INTENT: Build the most geometrically accurate prompt possible from available data.
  // Priority: cadGeometryPrompt (explicit CAD recipe) > productFormDescription
  // (concise shape) > subject-only (minimal fallback).

  const geometryDescription =
    visualStyle?.cadGeometryPrompt ?? visualStyle?.productFormDescription ?? null

  // If no geometry data and no meaningful subject, fall back to image-to-model
  if (!geometryDescription && (!subject || subject.trim().length < 3)) {
    return null
  }

  const parts: string[] = []

  // Identity: what is this product?
  if (subject?.trim()) {
    parts.push(`3D model of: ${subject.trim()}.`)
  }

  // Geometry: the core description
  if (geometryDescription) {
    // Strip 2D-specific rendering instructions that don't apply to 3D generation
    const cleaned = geometryDescription
      .replace(/white background/gi, "")
      .replace(/isometric (camera|view|projection|perspective)/gi, "")
      .replace(/exploded view/gi, "")
      .replace(/technical illustration/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim()
    if (cleaned) {
      parts.push(cleaned)
    }
  }

  // Materials and colors from visual style
  if (visualStyle?.materialRendering) {
    parts.push(`Materials: ${visualStyle.materialRendering}.`)
  }
  if (visualStyle?.colorPalette) {
    parts.push(`Colors: ${visualStyle.colorPalette}.`)
  }

  // If we only have a very short subject and nothing else, it's still better
  // than zero context — but only if it's at least 3 chars
  if (parts.length === 0) {
    return null
  }

  return {
    prompt: parts.join(" "),
    negativePrompt: NEGATIVE_PROMPT,
  }
}
