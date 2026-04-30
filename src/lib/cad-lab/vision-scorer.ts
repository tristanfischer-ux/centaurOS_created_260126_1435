/**
 * @file vision-scorer.ts — P2: Vision-based render quality scoring
 *
 * @description Sends SVG renders to OpenAI vision API to assess how well
 * the generated CAD model matches the product description. Returns a 1-10
 * score with specific issues identified.
 *
 * INTENT: ~20% of generation failures pass deterministic validators but look
 * wrong. This catches visual mismatches that geometry checks miss.
 *
 * @security Uses OPENAI_API_KEY server-side only. Never exposes to client.
 */

import { withRetry } from '@/lib/retry'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

export interface VisionScoreResult {
  score: number // 1-10
  issues: string[] // Missing/wrong features
  summary: string // One-sentence assessment
}

/**
 * Sends an SVG render to Claude vision API and scores how well it matches
 * the product description (or a reference image when provided).
 *
 * @param svgIsoBase64 - Base64-encoded image to score (SVG by default; set
 *   `renderMediaType` to "image/png" or "image/jpeg" to score rasters)
 * @param productDescription - What the product should look like
 * @param moduleName - Name of the module being scored
 * @param interfaceDefinition - Optional interface spec for more precise scoring
 * @param referenceImageBase64 - Optional hero image for visual comparison (much more accurate than text-only)
 * @param renderMediaType - Media type of svgIsoBase64. Defaults to "image/svg+xml"
 *   for backward compatibility with the per-module caller. The hero caller
 *   passes "image/png" since hero illustrations are PNG.
 * @returns Score result, or null on any failure (non-blocking)
 */
export async function scoreRenderVision(
  svgIsoBase64: string,
  productDescription: string,
  moduleName: string,
  interfaceDefinition?: string,
  referenceImageBase64?: string,
  renderMediaType: "image/svg+xml" | "image/png" | "image/jpeg" = "image/svg+xml",
): Promise<VisionScoreResult | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    console.warn("[VISION-SCORER] OPENAI_API_KEY not configured, skipping")
    return null
  }

  if (!svgIsoBase64 || !productDescription) return null

  try {
    const interfaceContext = interfaceDefinition
      ? `\n\nInterface specification excerpt:\n${interfaceDefinition.slice(0, 2000)}`
      : ""

    // DECISION: When a reference image is provided, score visual similarity between the two images
    // instead of comparing render vs text description. Image-vs-image comparison is much more
    // accurate for detecting shape/proportion mismatches.
    const systemPrompt = referenceImageBase64
      ? `You are a CAD quality inspector. You will see TWO images:
- Image 1: The REFERENCE product design (target)
- Image 2: The rendered CAD model (output)

Score how well Image 2 matches Image 1 on a scale of 1-10.

Scoring guide:
- 9-10: Excellent match — silhouette, proportions, and all major features match closely
- 7-8: Good match — overall shape is right, most features present, minor proportion issues
- 5-6: Acceptable — recognizable as same product but missing features or wrong proportions
- 3-4: Poor — major shape differences, missing key features, wrong basic form
- 1-2: Failed — completely different shape, no visual resemblance

Return ONLY valid JSON: { "score": <number>, "issues": [<string>, ...], "summary": "<one sentence>" }
Do not include any text outside the JSON.`
      : `You are a CAD quality inspector. Score how well the rendered model matches the product description on a scale of 1-10.

Scoring guide:
- 9-10: Excellent match — all major features present and correctly proportioned
- 7-8: Good match — most features present, minor issues
- 5-6: Acceptable — recognizable but missing some features or has proportion issues
- 3-4: Poor — major features missing or significantly wrong
- 1-2: Failed — does not resemble the description at all

Return ONLY valid JSON: { "score": <number>, "issues": [<string>, ...], "summary": "<one sentence>" }
Do not include any text outside the JSON.`

    // INTENT: Build content array — with reference image, send both for visual comparison (OpenAI vision format)
    type ContentPart = { type: "image_url"; image_url: { url: string } } | { type: "text"; text: string }
    const contentParts: ContentPart[] = []

    if (referenceImageBase64) {
      contentParts.push({
        type: "image_url",
        image_url: { url: `data:image/png;base64,${referenceImageBase64}` },
      })
    }
    contentParts.push({
      type: "image_url",
      image_url: { url: `data:${renderMediaType};base64,${svgIsoBase64}` },
    })

    const textPrompt = referenceImageBase64
      ? `Module: ${moduleName}\n\nImage 1 is the target product design. Image 2 is the CAD render.\nScore how well Image 2 matches Image 1. Return JSON only.`
      : `Module: ${moduleName}\n\nProduct description: ${productDescription}${interfaceContext}\n\nScore this render against the description. Return JSON only.`

    contentParts.push({ type: "text", text: textPrompt })

    const data = await withRetry(async () => {
      const response = await fetchWithTimeout(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-5.4",
            max_completion_tokens: 1024,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: contentParts,
              },
            ],
          }),
        },
        30_000,
      )

      if (!response.ok) {
        throw new Error(`Vision scorer API error: ${response.status} ${response.statusText}`)
      }

      return response.json()
    }, {
      maxRetries: 2,
      baseDelay: 2000,
      shouldRetry: (error) => {
        const msg = error.message.toLowerCase()
        return msg.includes('429') || msg.includes('502') || msg.includes('503') ||
          msg.includes('network') || msg.includes('timeout') || msg.includes('529')
      },
    }).catch((err) => {
      console.warn(`[VISION-SCORER] ${err.message}`)
      return null
    })

    if (!data) return null
    const text = data?.choices?.[0]?.message?.content
    if (!text) return null

    // INTENT: Extract JSON from response — Claude may wrap in markdown code blocks
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn("[VISION-SCORER] Could not extract JSON from response")
      return null
    }

    const parsed = JSON.parse(jsonMatch[0])

    // Validate shape
    if (
      typeof parsed.score !== "number" ||
      parsed.score < 1 ||
      parsed.score > 10 ||
      !Array.isArray(parsed.issues) ||
      typeof parsed.summary !== "string"
    ) {
      console.warn("[VISION-SCORER] Invalid response shape:", parsed)
      return null
    }

    return {
      score: Math.round(parsed.score),
      issues: parsed.issues.map(String),
      summary: String(parsed.summary),
    }
  } catch (err) {
    console.warn("[VISION-SCORER] Failed:", err instanceof Error ? err.message : err)
    return null
  }
}
