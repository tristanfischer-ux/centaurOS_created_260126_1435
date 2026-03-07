"use server"

/**
 * @file buy-part-search.ts — Server action: find purchase URLs for buy parts via Claude Sonnet + web_search.
 *
 * @description Batches buy parts into groups of ~5, asks Sonnet to find product URLs
 * from RS Components, McMaster-Carr, Misumi, Farnell, etc.
 * Then verifies prices via a 3-tier pipeline: JSON-LD → meta tags → quality-gated Haiku.
 */

import Anthropic from "@anthropic-ai/sdk"
import { normalizeForMatch } from "@/lib/part-match"

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
const VERIFY_CONCURRENCY = 3
const VERIFY_BATCH_DELAY_MS = 500
const MAX_HTML_BYTES = 200_000
const MIN_TEXT_LENGTH = 200
const FETCH_TIMEOUT_MS = 8_000

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

// ─── Lightweight Page Fetcher ───────────────────────────────────────

/**
 * Fetch a page directly with browser-like headers, no auth, no JSDOM.
 * Returns raw HTML (capped at MAX_HTML_BYTES) and final URL after redirects.
 *
 * @param url - URL to fetch
 * @returns { html, finalUrl } or null on failure
 */
async function fetchPageRaw(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
      },
      redirect: "follow",
    })

    clearTimeout(timer)

    if (!res.ok) {
      console.log(`[BUY-VERIFY] fetchPageRaw failed: HTTP ${res.status} for ${url}`)
      return null
    }

    const buffer = await res.arrayBuffer()
    const html = new TextDecoder().decode(buffer.slice(0, MAX_HTML_BYTES))
    const finalUrl = res.url || url

    console.log(`[BUY-VERIFY] fetchPageRaw OK: ${html.length} chars from ${finalUrl}`)
    return { html, finalUrl }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(`[BUY-VERIFY] fetchPageRaw error for ${url}: ${message}`)
    return null
  }
}

// ─── Price Extraction: JSON-LD ──────────────────────────────────────

/**
 * Extract price from Schema.org JSON-LD structured data in HTML.
 * Free — no API calls. Works on well-structured product pages.
 *
 * @param html - Raw HTML string
 * @returns { price, title } or null
 */
function extractPriceFromJsonLd(html: string): { price: number; title: string } | null {
  // INTENT: Match all JSON-LD script blocks, parse each one
  const ldRegex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = ldRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1])
      const result = extractFromLdObject(data)
      if (result) return result
    } catch {
      // Malformed JSON-LD — try next block
    }
  }

  return null
}

/** Recursively search a JSON-LD object or array for Product schema with price. */
function extractFromLdObject(data: unknown): { price: number; title: string } | null {
  if (Array.isArray(data)) {
    for (const item of data) {
      const result = extractFromLdObject(item)
      if (result) return result
    }
    return null
  }

  if (typeof data !== "object" || data === null) return null

  const obj = data as Record<string, unknown>

  if (obj["@type"] === "Product" || obj["@type"] === "IndividualProduct") {
    const title = (typeof obj.name === "string" ? obj.name : "") as string
    const offers = obj.offers

    if (offers && typeof offers === "object") {
      const offerObj = Array.isArray(offers) ? offers[0] : offers
      if (offerObj && typeof offerObj === "object") {
        const o = offerObj as Record<string, unknown>
        // INTENT: Try price, then lowPrice (for AggregateOffer)
        const priceVal = o.price ?? o.lowPrice
        if (priceVal != null) {
          const num = typeof priceVal === "number" ? priceVal : parseFloat(String(priceVal))
          if (!isNaN(num) && num > 0) {
            return { price: num, title }
          }
        }
      }
    }
  }

  // Check @graph arrays
  if (obj["@graph"] && Array.isArray(obj["@graph"])) {
    return extractFromLdObject(obj["@graph"])
  }

  return null
}

// ─── Price Extraction: Meta Tags ────────────────────────────────────

/**
 * Extract price from OpenGraph / product meta tags.
 * Free — no API calls. Catches OG-tagged product pages.
 *
 * @param html - Raw HTML string
 * @returns { price, title } or null
 */
function extractPriceFromMeta(html: string): { price: number; title: string } | null {
  // INTENT: Check og:price:amount and product:price:amount meta tags
  const pricePatterns = [
    /content\s*=\s*["']([\d,.]+)["'][^>]*property\s*=\s*["'](?:og:price:amount|product:price:amount)["']/i,
    /property\s*=\s*["'](?:og:price:amount|product:price:amount)["'][^>]*content\s*=\s*["']([\d,.]+)["']/i,
  ]

  let priceStr: string | null = null
  for (const pattern of pricePatterns) {
    const m = html.match(pattern)
    if (m) {
      priceStr = m[1]
      break
    }
  }

  if (!priceStr) return null

  const price = parseFloat(priceStr.replace(/,/g, ""))
  if (isNaN(price) || price <= 0) return null

  // Grab title from og:title
  let title = ""
  const titleMatch = html.match(/property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']+)["']/i)
    || html.match(/content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:title["']/i)
  if (titleMatch) title = titleMatch[1]

  return { price, title }
}

// ─── Price Verification: 3-tier Pipeline ────────────────────────────

/**
 * Verify a product's price using a 3-tier pipeline:
 * 1. JSON-LD structured data (free)
 * 2. Meta tag extraction (free)
 * 3. Quality-gated Haiku extraction (paid, skipped for SPA skeletons)
 *
 * @param url - Product page URL to verify
 * @param apiKey - Anthropic API key for Haiku fallback
 * @param partName - Original part name for accurate matching on search result pages
 * @returns Extracted price data or null if all tiers fail
 */
async function verifyProductPrice(
  url: string,
  apiKey: string,
  partName: string,
): Promise<{ price: number; title: string; url: string } | null> {
  const page = await fetchPageRaw(url)
  if (!page) {
    console.log(`[BUY-VERIFY] SKIP "${partName}": fetch failed`)
    return null
  }

  // Tier 1: JSON-LD (free, best for proper product pages)
  const jsonLdResult = extractPriceFromJsonLd(page.html)
  if (jsonLdResult) {
    console.log(`[BUY-VERIFY] JSON-LD hit for "${partName}": £${jsonLdResult.price.toFixed(2)} — "${jsonLdResult.title}"`)
    return { price: jsonLdResult.price, title: jsonLdResult.title, url: page.finalUrl }
  }

  // Tier 2: Meta tags (free, catches OG-tagged pages)
  const metaResult = extractPriceFromMeta(page.html)
  if (metaResult) {
    console.log(`[BUY-VERIFY] Meta tag hit for "${partName}": £${metaResult.price.toFixed(2)} — "${metaResult.title}"`)
    return { price: metaResult.price, title: metaResult.title, url: page.finalUrl }
  }

  // Tier 3: Quality gate — strip HTML and check text length
  const strippedText = page.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  if (strippedText.length < MIN_TEXT_LENGTH) {
    console.log(`[BUY-VERIFY] SKIP "${partName}": SPA skeleton (${strippedText.length} chars stripped text)`)
    return null
  }

  // Tier 3: Haiku extraction (paid)
  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Find the product that best matches "${partName}" and extract its unit price in GBP (£).
Return ONLY valid JSON, no markdown:
{"title": "Product name", "price": 12.34, "url": "https://..."}

If you cannot determine the price in GBP, return: {"title": "", "price": 0, "url": ""}

Page URL: ${page.finalUrl}

Page content (first 4000 chars):
${strippedText.slice(0, 4000)}`,
        },
      ],
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.price && parsed.price > 0) {
        console.log(`[BUY-VERIFY] Haiku hit for "${partName}": £${parsed.price.toFixed(2)} — "${parsed.title || ""}"`)
        return {
          price: parsed.price,
          title: parsed.title || "",
          url: parsed.url || page.finalUrl,
        }
      }
    }

    console.log(`[BUY-VERIFY] Haiku miss for "${partName}": no valid price extracted`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(`[BUY-VERIFY] Haiku error for "${partName}": ${message}`)
  }

  return null
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

      const systemPrompt = `You are a procurement assistant. Search for purchase URLs for engineering/manufacturing parts from UK industrial suppliers: RS Components (uk.rs-online.com), Farnell (uk.farnell.com), Misumi (uk.misumi-ec.com), McMaster-Carr (mcmaster.com), or any relevant supplier.

For each part:
1. Search for the exact part by name/specification
2. Open the product page on the supplier website
3. Read the ACTUAL listed price from the product page (not a guess — the real GBP price shown on the page)
4. Copy the direct product URL (not a search results page)

You MUST visit the actual product page to get the real price. Do not estimate or guess prices.

Return your results as a JSON array. IMPORTANT: Return ONLY valid JSON, no markdown code fences, no explanation.
[
  {
    "partName": "exact part name from the list",
    "products": [
      { "title": "Product listing title", "url": "https://uk.rs-online.com/web/p/...", "source": "RS Components", "estimatedPrice": "£0.12" }
    ]
  }
]

For estimatedPrice: use the exact price shown on the product page in GBP. If the page shows a quantity-based price, use the unit price for qty 1.
If you cannot find a product for a part, include it with an empty products array.`

      let response = await client.messages.create({
        model: "claude-sonnet-4-5-20250514",
        max_tokens: 8192,
        system: systemPrompt,
        tools: [{ type: "web_search_20260209" as any, name: "web_search", max_uses: 20 }],
        messages: [
          {
            role: "user",
            content: `Find purchase URLs and exact listed prices for these parts. Visit each product page to read the real price.\n\n${partList}`,
          },
        ],
      })

      // Handle pause_turn responses (web search continuation)
      let turns = 0
      while (response.stop_reason === "pause_turn" && turns < 12) {
        turns++
        console.log(`[BUY-SEARCH] pause_turn #${turns}, continuing…`)
        response = await client.messages.create({
          model: "claude-sonnet-4-5-20250514",
          max_tokens: 8192,
          system: systemPrompt,
          tools: [{ type: "web_search_20260209" as any, name: "web_search", max_uses: 20 }],
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
        // INTENT: If Sonnet only returned tool_use/web_search blocks but no text, the search
        // completed but Sonnet never produced a final JSON summary. Push empty results.
        allResults.push(...batch.map((name) => ({ partName: name, products: [] })))
        continue
      }

      console.log(`[BUY-SEARCH] Response text length: ${text.length} chars, first 200: ${text.slice(0, 200)}`)

      // Build normalized→original name map for this batch
      const normalizedToOriginal = new Map<string, string>()
      for (const name of batch) {
        normalizedToOriginal.set(normalizeForMatch(cleanPartName(name)), name)
      }

      // Parse JSON from response
      try {
        // INTENT: Strip markdown fences before extraction — Sonnet often wraps JSON in ```json ... ```
        const stripped = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1")
        // INTENT: Try targeted regex first (array starting with [{ and ending with }])
        // then fall back to greedy match. Greedy \[[\s\S]*\] fails when response
        // contains unrelated brackets like "I found [these items]..."
        const jsonMatch = stripped.match(/\[\s*\{[\s\S]*\}\s*\]/) ?? stripped.match(/\[[\s\S]*\]/)

        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as BuyPartSearchResult[]
          // INTENT: Map Sonnet's returned names back to original BOM names.
          // Uses normalized matching (strips hyphens, special chars, parens) + positional fallback.
          for (let ri = 0; ri < parsed.length; ri++) {
            const result = parsed[ri]
            // DECISION: Also try normalizing WITHOUT cleanPartName so "stainless" etc. in the
            // returned name can match the full BOM name's normalized form.
            const matched = normalizedToOriginal.get(normalizeForMatch(result.partName))
              ?? normalizedToOriginal.get(normalizeForMatch(cleanPartName(result.partName)))
            if (matched) {
              result.partName = matched
            } else if (ri < batch.length) {
              // Positional fallback — Sonnet usually returns results in input order
              console.log(`[BUY-SEARCH] Name mismatch: "${result.partName}" → positional fallback to "${batch[ri]}"`)
              result.partName = batch[ri]
            }
          }
          const withProducts = parsed.filter((r) => r.products.length > 0).length
          console.log(`[BUY-SEARCH] Batch results: ${withProducts}/${parsed.length} parts have products`)
          allResults.push(...parsed)
        } else {
          console.warn(`[BUY-SEARCH] No JSON found in response. Raw text (first 500 chars): ${text.slice(0, 500)}`)
          allResults.push(...batch.map((name) => ({ partName: name, products: [] })))
        }
      } catch (parseErr) {
        console.error(`[BUY-SEARCH] Failed to parse JSON response:`, parseErr, `\nRaw text (first 500 chars): ${text.slice(0, 500)}`)
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

  // ── Step 2: Price verification — 3-tier pipeline (JSON-LD → meta → Haiku) ──
  // DECISION: Verify ALL URLs, not just non-search ones. The old searchTerm= filter excluded everything.
  const verificationsToRun: Array<{ resultIndex: number; productIndex: number; url: string; partName: string }> = []
  for (let ri = 0; ri < allResults.length; ri++) {
    const result = allResults[ri]
    if (result.products.length > 0) {
      verificationsToRun.push({
        resultIndex: ri,
        productIndex: 0,
        url: result.products[0].url,
        partName: result.partName,
      })
    }
  }

  if (verificationsToRun.length > 0 && apiKey) {
    console.log(`[BUY-VERIFY] Starting verification for ${verificationsToRun.length} products (batches of ${VERIFY_CONCURRENCY}, ${VERIFY_BATCH_DELAY_MS}ms delay)`)

    let verifiedCount = 0

    // Process in batches of VERIFY_CONCURRENCY with delay between batches
    for (let i = 0; i < verificationsToRun.length; i += VERIFY_CONCURRENCY) {
      const batch = verificationsToRun.slice(i, i + VERIFY_CONCURRENCY)

      const settled = await Promise.allSettled(
        batch.map(async (v) => {
          const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000))
          const verified = await Promise.race([verifyProductPrice(v.url, apiKey, v.partName), timeout])
          return { ...v, verified }
        }),
      )

      for (const s of settled) {
        if (s.status === "fulfilled" && s.value.verified) {
          const { resultIndex, productIndex, verified, partName } = s.value
          const product = allResults[resultIndex].products[productIndex]
          console.log(`[BUY-VERIFY] VERIFIED "${partName}": £${verified.price.toFixed(2)} (was "${product.estimatedPrice || "none"}")`)
          product.estimatedPrice = `£${verified.price.toFixed(2)}`
          product.numericPrice = verified.price
          if (verified.url && verified.url !== product.url) product.url = verified.url
          if (verified.title) product.title = verified.title
          verifiedCount++
        } else if (s.status === "fulfilled") {
          console.log(`[BUY-VERIFY] MISS "${s.value.partName}": no price extracted from ${s.value.url}`)
        } else {
          console.log(`[BUY-VERIFY] ERROR: verification rejected — ${s.reason}`)
        }
      }

      // Delay between batches to avoid overwhelming suppliers
      if (i + VERIFY_CONCURRENCY < verificationsToRun.length) {
        await new Promise((resolve) => setTimeout(resolve, VERIFY_BATCH_DELAY_MS))
      }
    }

    console.log(`[BUY-VERIFY] Done: ${verifiedCount}/${verificationsToRun.length} products verified with real prices`)
  }

  const totalWithProducts = allResults.filter((r) => r.products.length > 0).length
  console.log(`[BUY-SEARCH] Final: ${totalWithProducts}/${allResults.length} parts have products`)

  return allResults
}
