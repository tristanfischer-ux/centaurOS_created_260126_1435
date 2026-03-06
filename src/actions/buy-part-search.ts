"use server"

/**
 * @file buy-part-search.ts — Server action: find purchase URLs for buy parts via Claude Haiku + web_search.
 *
 * @description Batches buy parts into groups of ~15, asks Haiku to find product URLs
 * from RS Components, McMaster-Carr, Misumi, Farnell, etc.
 */

import Anthropic from "@anthropic-ai/sdk"

// ─── Types ──────────────────────────────────────────────────────────

export interface BuyPartProduct {
  title: string
  url: string
  source: string        // "RS Components", "McMaster-Carr", etc.
  estimatedPrice?: string
}

export interface BuyPartSearchResult {
  partName: string
  products: BuyPartProduct[]
}

// ─── Constants ──────────────────────────────────────────────────────

const BATCH_SIZE = 15

// ─── Server Action ──────────────────────────────────────────────────

export async function searchBuyPartProducts(
  partNames: string[],
): Promise<BuyPartSearchResult[]> {
  if (partNames.length === 0) return []

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error("[BUY-SEARCH] ANTHROPIC_API_KEY not set")
    return partNames.map((name) => ({ partName: name, products: [] }))
  }

  const client = new Anthropic({ apiKey })
  const allResults: BuyPartSearchResult[] = []

  // Batch parts into groups of BATCH_SIZE
  const batches: string[][] = []
  for (let i = 0; i < partNames.length; i += BATCH_SIZE) {
    batches.push(partNames.slice(i, i + BATCH_SIZE))
  }

  let totalInputTokens = 0
  let totalOutputTokens = 0

  for (const batch of batches) {
    try {
      const partList = batch.map((name, i) => `${i + 1}. ${name}`).join("\n")

      const systemPrompt = `You are a procurement assistant. Search for purchase URLs for engineering/manufacturing parts from suppliers like RS Components (uk.rs-online.com), McMaster-Carr (mcmaster.com), Misumi (uk.misumi-ec.com), Farnell (uk.farnell.com), Amazon, or any relevant industrial supplier.

For each part, find 1-3 product URLs where the part can be purchased. Return your results as a JSON array.

IMPORTANT: Return ONLY valid JSON, no markdown code fences, no explanation. The JSON must be an array of objects with this structure:
[
  {
    "partName": "exact part name from the list",
    "products": [
      { "title": "Product listing title", "url": "https://...", "source": "RS Components", "estimatedPrice": "£0.12" }
    ]
  }
]

If you cannot find a product for a part, include it with an empty products array.`

      let response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: systemPrompt,
        tools: [{ type: "web_search_20260209" as any, name: "web_search", max_uses: 5 }],
        messages: [
          {
            role: "user",
            content: `Find purchase URLs for these parts:\n\n${partList}`,
          },
        ],
      })

      // Handle pause_turn responses (web search continuation)
      let turns = 0
      while (response.stop_reason === "pause_turn" && turns < 5) {
        turns++
        response = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 4096,
          system: systemPrompt,
          tools: [{ type: "web_search_20260209" as any, name: "web_search", max_uses: 5 }],
          messages: [
            {
              role: "user",
              content: `Find purchase URLs for these parts:\n\n${partList}`,
            },
            { role: "assistant", content: response.content },
            { role: "user", content: "Continue searching and provide the final JSON results." },
          ],
        })
      }

      totalInputTokens += response.usage?.input_tokens ?? 0
      totalOutputTokens += response.usage?.output_tokens ?? 0

      // Extract text content from response
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === "text",
      )
      const text = textBlocks.map((b) => b.text).join("")

      // Parse JSON from response
      try {
        // Try to extract JSON from the text (handles markdown fences)
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as BuyPartSearchResult[]
          allResults.push(...parsed)
        } else {
          // No JSON found — return empty results for this batch
          allResults.push(...batch.map((name) => ({ partName: name, products: [] })))
        }
      } catch (parseErr) {
        console.error("[BUY-SEARCH] Failed to parse JSON response:", parseErr)
        allResults.push(...batch.map((name) => ({ partName: name, products: [] })))
      }
    } catch (err) {
      console.error("[BUY-SEARCH] Batch search failed:", err)
      allResults.push(...batch.map((name) => ({ partName: name, products: [] })))
    }
  }

  // INTENT: Log usage for cost monitoring (no server-side tracking without auth context)
  if (totalInputTokens > 0 || totalOutputTokens > 0) {
    const cost = (totalInputTokens * 0.80 + totalOutputTokens * 4.00) / 1_000_000
    console.log(`[BUY-SEARCH] Haiku usage: ${totalInputTokens} in / ${totalOutputTokens} out ≈ $${cost.toFixed(4)}`)
  }

  return allResults
}
