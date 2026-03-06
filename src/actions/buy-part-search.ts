"use server"

/**
 * @file buy-part-search.ts — Server action: find purchase URLs for buy parts via Claude Sonnet + web_search.
 *
 * @description Batches buy parts into groups of ~5, asks Sonnet to find product URLs
 * from RS Components, McMaster-Carr, Misumi, Farnell, etc.
 */

import Anthropic from "@anthropic-ai/sdk"

// ─── Types ──────────────────────────────────────────────────────────

export interface BuyPartProduct {
  title: string
  url: string
  source: string        // "RS Components", "McMaster-Carr", etc.
  estimatedPrice?: string
  /** Parsed numeric price (GBP). Derived from estimatedPrice during post-processing. */
  numericPrice?: number
}

export interface BuyPartSearchResult {
  partName: string
  products: BuyPartProduct[]
}

// ─── Constants ──────────────────────────────────────────────────────

const BATCH_SIZE = 5

/**
 * Strip quantity markers (×12, x4, etc.) and parenthesized spec suffixes
 * to produce cleaner search queries. Keeps core part identity.
 * E.g. "M5 socket-head cap screws (×12, 304 SS)" → "M5 socket-head cap screws"
 */
function cleanPartName(name: string): string {
  return name
    .replace(/\s*\(.*\)\s*/g, "")     // remove parenthesized suffixes
    .replace(/\s*[×x]\s*\d+/gi, "")   // remove ×12, x4 etc.
    .trim()
}

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
      const partList = batch.map((name, i) => `${i + 1}. ${cleanPartName(name)}`).join("\n")
      console.log(`[BUY-SEARCH] Searching batch of ${batch.length} parts:`, batch.map((n) => `"${n}" → "${cleanPartName(n)}"`).join(", "))

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
        model: "claude-sonnet-4-5-20250514",
        max_tokens: 8192,
        system: systemPrompt,
        tools: [{ type: "web_search_20260209" as any, name: "web_search", max_uses: 10 }],
        messages: [
          {
            role: "user",
            content: `Find purchase URLs for these parts:\n\n${partList}`,
          },
        ],
      })

      // Handle pause_turn responses (web search continuation)
      let turns = 0
      while (response.stop_reason === "pause_turn" && turns < 8) {
        turns++
        console.log(`[BUY-SEARCH] pause_turn #${turns}, continuing…`)
        response = await client.messages.create({
          model: "claude-sonnet-4-5-20250514",
          max_tokens: 8192,
          system: systemPrompt,
          tools: [{ type: "web_search_20260209" as any, name: "web_search", max_uses: 10 }],
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

      // Diagnostic logging
      const blockTypes = response.content.map((b) => b.type)
      console.log(`[BUY-SEARCH] stop_reason=${response.stop_reason}, blocks=[${blockTypes.join(",")}], turns=${turns}`)

      // Extract text content from response
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === "text",
      )
      const text = textBlocks.map((b) => b.text).join("")

      if (!text) {
        console.warn(`[BUY-SEARCH] No text blocks in response. Block types: [${blockTypes.join(",")}]`)
      }

      // Build clean→original name map for this batch
      const cleanToOriginal = new Map<string, string>()
      for (const name of batch) {
        cleanToOriginal.set(cleanPartName(name).toLowerCase(), name)
      }

      // Parse JSON from response
      try {
        // Try to extract JSON from the text (handles markdown fences)
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as BuyPartSearchResult[]
          // INTENT: Map cleaned names back to original names so buyResultsMap lookup works
          for (const result of parsed) {
            result.partName = cleanToOriginal.get(result.partName.toLowerCase()) ?? result.partName
          }
          const withProducts = parsed.filter((r) => r.products.length > 0).length
          console.log(`[BUY-SEARCH] Batch results: ${withProducts}/${parsed.length} parts have products`)
          allResults.push(...parsed)
        } else {
          console.warn("[BUY-SEARCH] No JSON found in response")
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
    const cost = (totalInputTokens * 3.00 + totalOutputTokens * 15.00) / 1_000_000
    console.log(`[BUY-SEARCH] Sonnet usage: ${totalInputTokens} in / ${totalOutputTokens} out ≈ $${cost.toFixed(4)}`)
  }

  // Post-process: parse numeric prices from estimatedPrice strings
  for (const result of allResults) {
    for (const product of result.products) {
      if (product.estimatedPrice && product.numericPrice == null) {
        const match = product.estimatedPrice.match(/[\d,.]+/)
        if (match) {
          const num = parseFloat(match[0].replace(/,/g, ""))
          if (!isNaN(num)) product.numericPrice = num
        }
      }
    }
  }

  const totalWithProducts = allResults.filter((r) => r.products.length > 0).length
  console.log(`[BUY-SEARCH] Final: ${totalWithProducts}/${allResults.length} parts have products`)

  return allResults
}
