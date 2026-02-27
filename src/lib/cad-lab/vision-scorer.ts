/**
 * @file vision-scorer.ts — P2: Vision-based render quality scoring
 *
 * @description Sends SVG renders to Claude vision API to assess how well
 * the generated CAD model matches the product description. Returns a 1-10
 * score with specific issues identified.
 *
 * INTENT: ~20% of generation failures pass deterministic validators but look
 * wrong. This catches visual mismatches that geometry checks miss.
 *
 * @security Uses ANTHROPIC_API_KEY server-side only. Never exposes to client.
 */

export interface VisionScoreResult {
  score: number // 1-10
  issues: string[] // Missing/wrong features
  summary: string // One-sentence assessment
}

/**
 * Sends an SVG render to Claude vision API and scores how well it matches
 * the product description.
 *
 * @param svgIsoBase64 - Base64-encoded SVG of the isometric view
 * @param productDescription - What the product should look like
 * @param moduleName - Name of the module being scored
 * @param interfaceDefinition - Optional interface spec for more precise scoring
 * @returns Score result, or null on any failure (non-blocking)
 */
export async function scoreRenderVision(
  svgIsoBase64: string,
  productDescription: string,
  moduleName: string,
  interfaceDefinition?: string,
): Promise<VisionScoreResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn("[VISION-SCORER] ANTHROPIC_API_KEY not configured, skipping")
    return null
  }

  if (!svgIsoBase64 || !productDescription) return null

  try {
    const interfaceContext = interfaceDefinition
      ? `\n\nInterface specification excerpt:\n${interfaceDefinition.slice(0, 2000)}`
      : ""

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6-20250514",
        max_tokens: 1024,
        system: `You are a CAD quality inspector. Score how well the rendered model matches the product description on a scale of 1-10.

Scoring guide:
- 9-10: Excellent match — all major features present and correctly proportioned
- 7-8: Good match — most features present, minor issues
- 5-6: Acceptable — recognizable but missing some features or has proportion issues
- 3-4: Poor — major features missing or significantly wrong
- 1-2: Failed — does not resemble the description at all

Return ONLY valid JSON: { "score": <number>, "issues": [<string>, ...], "summary": "<one sentence>" }
Do not include any text outside the JSON.`,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/svg+xml",
                  data: svgIsoBase64,
                },
              },
              {
                type: "text",
                text: `Module: ${moduleName}\n\nProduct description: ${productDescription}${interfaceContext}\n\nScore this render against the description. Return JSON only.`,
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      console.warn(`[VISION-SCORER] API returned ${response.status}: ${response.statusText}`)
      return null
    }

    const data = await response.json()
    const text = data?.content?.[0]?.text
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
