"use server"

/**
 * @file buy-part-search.ts — Server action: find purchase URLs for buy parts via direct RS scraping.
 *
 * @description For each buy part, constructs an RS Components search URL, fetches the
 * search results page, and extracts product data from RS's embedded __NEXT_DATA__ JSON
 * payload (which contains prices, titles, and URLs). Falls back to Haiku on stripped
 * text if JSON extraction fails.
 */

import Anthropic from "@anthropic-ai/sdk"
import { withAIGate } from '@/lib/ai/with-ai-gate'
import { checkRateLimit } from '@/lib/security/rate-limit'

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

const SCRAPE_CONCURRENCY = 3
// GOTCHA: RS search pages are ~400-500KB with __NEXT_DATA__ near the end.
// 200KB truncated before the JSON payload. 600KB captures it reliably.
const MAX_HTML_BYTES = 600_000
const MIN_TEXT_LENGTH = 200
const FETCH_TIMEOUT_MS = 8_000
const RS_BASE = "https://uk.rs-online.com"

/**
 * Strip quantity markers, parenthesized suffixes, BOM status metadata,
 * and em-dashes to produce cleaner RS search queries.
 * E.g. "M4 tapped inserts (×8 top) – brass, bought" → "M4 tapped inserts brass"
 */
function cleanPartName(name: string): string {
  return name
    .replace(/\s*\(.*\)\s*/g, "")                          // remove parenthesized suffixes (handles "×8 top" inside parens)
    // DECISION: Removed [×x]\s*\d+ — was stripping dimensions ("M4 × 12" → "M4").
    // Quantity markers like "×8" are inside parens and already handled above.
    .replace(/,\s*(bought|outsourced|custom|fabricated)\b/gi, "")  // strip BOM status metadata
    .replace(/[–—]/g, " ")                                  // em-dashes → spaces
    .replace(/\s+/g, " ")                                   // collapse whitespace
    .trim()
}

// ─── Unsourceable Part Filter ────────────────────────────────────────

/**
 * Conservative filter: skip RS fetch for parts that RS can't supply.
 * These consistently produce bad matches (e.g. fibre optic dome cover for a custom spun dome).
 * Returns true if the part should be skipped.
 */
const UNSOURCEABLE_PATTERNS = [
  // Custom fabrication
  /\bspun\s+alumini?um\b/i,
  /\bvacuum[- ]?formed\b/i,
  // Services (not purchasable components)
  /\bpowder\s*coat/i,
  /\bpaint\s+finish/i,
  /\bgraphics?\b/i,
  /\banodis[ei]d\b/i,
  /\bplating\b/i,
  // Custom assemblies
  /\bwiring\s+harness/i,
  /\bcable\s+assembly/i,
  // Custom shapes
  /\bhemispherical\s+dome\b/i,
  /\bdome\s+shell\b/i,
  // Other
  /\bsub[- ]?assembly\b/i,
  /\bweldment\b/i,
  /\bfabrication\b/i,
]

function isUnsourceableFromRS(partName: string): boolean {
  return UNSOURCEABLE_PATTERNS.some((pattern) => pattern.test(partName))
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
    const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 0 })
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

// ─── RS Embedded JSON Extraction ────────────────────────────────────

interface RSProduct {
  title: string
  url: string
  price: number
}

/**
 * Extract product data from RS Components' embedded __NEXT_DATA__ JSON payload.
 *
 * RS search pages are a Next.js SPA — product links are NOT in anchor tags.
 * Instead, product data lives in a <script id="__NEXT_DATA__"> tag at:
 *   props.pageProps.discoverData.records[].article[0].discoverArticleAttributes
 *
 * @param html - Raw RS search results HTML
 * @returns Array of products with title, url, and price (max 10)
 */
function extractRSProducts(html: string): RSProduct[] {
  // INTENT: RS embeds all search result data in __NEXT_DATA__ as a Next.js app
  const scriptRegex = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
  const nextDataMatch = html.match(scriptRegex)

  if (!nextDataMatch) {
    console.log("[BUY-SEARCH] No __NEXT_DATA__ script tag found in RS HTML")
    return []
  }

  try {
    const parsed = JSON.parse(nextDataMatch[1])

    // INTENT: Navigate the Next.js data structure to find product records
    const records = parsed?.props?.pageProps?.discoverData?.records
    if (!Array.isArray(records) || records.length === 0) {
      console.log("[BUY-SEARCH] No records found in discoverData")
      return []
    }

    const products: RSProduct[] = []

    for (const record of records) {
      if (!Array.isArray(record.article) || record.article.length === 0) continue

      const article = record.article[0]
      const attrs = article?.discoverArticleAttributes
      if (!attrs) continue

      const priceStr = attrs.price ?? attrs.displayPrice
      if (!priceStr) continue

      // INTENT: Parse price — strip currency symbols and commas
      const priceNum = parseFloat(String(priceStr).replace(/[^0-9.]/g, ""))
      if (isNaN(priceNum) || priceNum <= 0) continue

      const title = article.title || ""
      const url = attrs.productURL || ""

      if (title && url) {
        products.push({ title, url, price: priceNum })
      }

      if (products.length >= 10) break
    }

    console.log(`[BUY-SEARCH] Extracted ${products.length} products from RS __NEXT_DATA__`)
    return products
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(`[BUY-SEARCH] Failed to parse __NEXT_DATA__ JSON: ${message}`)
    return []
  }
}

// ─── Relevance Scoring ──────────────────────────────────────────────

const BULK_INDICATORS = ["kit", "set", "assortment", "piece", "pcs", "selection", "collection", "variety"]

/**
 * Score all extracted RS products against the cleaned query and pick the best match.
 * Avoids blindly picking rsProducts[0] which may be a bulk kit instead of the specific part.
 *
 * Scoring: +1 per query word found in title (substring), -3 per bulk indicator in title.
 * Returns null if best score < 2 (too weak a match → fall through to Haiku).
 */
function pickBestProduct(products: RSProduct[], cleanedQuery: string): RSProduct | null {
  if (products.length === 0) return null

  // INTENT: Normalize plurals so "inserts" matches "insert" in titles (and vice versa)
  const queryWords = cleanedQuery.toLowerCase().split(/\s+/).filter((w) => w.length >= 2)
  const queryVariants = queryWords.map((w) => w.endsWith("s") && w.length > 3 ? [w, w.slice(0, -1)] : [w])
  let bestProduct: RSProduct | null = null
  let bestScore = -Infinity

  for (const product of products) {
    const titleLower = product.title.toLowerCase()
    let score = 0

    // INTENT: +1 per query word found in product title (substring match — "M3" matches "M3x10")
    // Also checks singular form for plural query words ("inserts" → also tries "insert")
    for (const variants of queryVariants) {
      if (variants.some((v) => titleLower.includes(v))) score += 1
    }

    // INTENT: -3 penalty per bulk indicator to push kits/assortments down
    for (const bulk of BULK_INDICATORS) {
      if (titleLower.includes(bulk)) score -= 3
    }

    if (score > bestScore) {
      bestScore = score
      bestProduct = product
    }
  }

  // DECISION: Score < 1 means no query words matched at all — truly irrelevant.
  // Was < 2 but that rejected short part names with only 1 matching word (e.g. "encoder").
  // The bulk indicator penalty (-3) still protects against kits.
  if (bestScore < 1) {
    console.log(`[BUY-SEARCH] pickBestProduct: best score=${bestScore} too low, skipping`)
    return null
  }

  console.log(`[BUY-SEARCH] pickBestProduct: score=${bestScore} — "${bestProduct!.title}"`)
  return bestProduct
}

// ─── Per-Part RS Scraper ────────────────────────────────────────────

/**
 * Scrape RS Components for a single buy part.
 * 1. Search RS for the cleaned part name
 * 2. Extract product data from embedded __NEXT_DATA__ JSON
 * 3. If products found → return first match (price already in JSON, no verification needed)
 * 4. If extraction fails → use Haiku on stripped text as fallback
 *
 * @param partName - Original BOM part name
 * @param apiKey - Anthropic API key for Haiku fallback
 * @returns Search result with products array
 */
async function scrapePartFromRS(
  partName: string,
  apiKey: string,
): Promise<BuyPartSearchResult> {
  // INTENT: Skip parts RS can't supply — avoids wildly wrong matches (e.g. fibre optic dome for custom shell)
  if (isUnsourceableFromRS(partName)) {
    console.log(`[BUY-SEARCH] SKIP "${partName}": unsourceable from RS`)
    return { partName, products: [] }
  }

  const cleaned = cleanPartName(partName)
  const searchUrl = `${RS_BASE}/web/c/?searchTerm=${encodeURIComponent(cleaned)}`

  console.log(`[BUY-SEARCH] Scraping RS for "${partName}" → ${searchUrl}`)

  const searchPage = await fetchPageRaw(searchUrl)
  if (!searchPage) {
    console.log(`[BUY-SEARCH] SKIP "${partName}": RS search page fetch failed`)
    return { partName, products: [] }
  }

  // INTENT: Extract product data directly from RS's embedded JSON payload
  // Price, title, and URL are all available — no second fetch or verification needed
  const rsProducts = extractRSProducts(searchPage.html)

  if (rsProducts.length > 0) {
    // DECISION: Score all candidates instead of blindly picking rsProducts[0]
    // Avoids bulk kits (£73.46) being chosen over specific parts (£6.25)
    const best = pickBestProduct(rsProducts, cleaned)
    if (best) {
      console.log(`[BUY-SEARCH] RS JSON hit for "${partName}": £${best.price.toFixed(2)} — "${best.title}"`)
      return {
        partName,
        products: [
          {
            title: best.title,
            url: best.url,
            source: "RS Components",
            estimatedPrice: `£${best.price.toFixed(2)}`,
            numericPrice: best.price,
          },
        ],
      }
    }
    console.log(`[BUY-SEARCH] No strong RS match for "${partName}" (${rsProducts.length} candidates scored too low)`)
  }

  // INTENT: JSON extraction failed (structure changed, blocked, etc.) — Haiku fallback on stripped text
  console.log(`[BUY-SEARCH] No RS JSON products for "${partName}", trying Haiku fallback on search page`)

  const strippedText = searchPage.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  if (strippedText.length < MIN_TEXT_LENGTH) {
    console.log(`[BUY-SEARCH] SKIP "${partName}": search page too sparse (${strippedText.length} chars)`)
    return { partName, products: [] }
  }

  try {
    const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 0 })
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `This is an RS Components (uk.rs-online.com) search results page for "${cleaned}".
Find the best matching product and extract its details.

Return ONLY valid JSON, no markdown:
{"title": "Product name", "price": 12.34, "url": "https://uk.rs-online.com/web/p/..."}

If you cannot find a matching product, return: {"title": "", "price": 0, "url": ""}

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
        console.log(`[BUY-SEARCH] Haiku search page hit for "${partName}": £${parsed.price.toFixed(2)} — "${parsed.title || ""}"`)
        return {
          partName,
          products: [
            {
              title: parsed.title || cleaned,
              url: parsed.url || searchUrl,
              source: "RS Components",
              estimatedPrice: `£${parsed.price.toFixed(2)}`,
              numericPrice: parsed.price,
            },
          ],
        }
      }
    }

    console.log(`[BUY-SEARCH] Haiku search page miss for "${partName}"`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(`[BUY-SEARCH] Haiku fallback error for "${partName}": ${message}`)
  }

  return { partName, products: [] }
}

// ─── Concurrency Limiter ────────────────────────────────────────────

/**
 * Simple semaphore-style concurrency limiter.
 * Processes tasks with at most `limit` running concurrently.
 */
async function withConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex++
      try {
        results[index] = { status: "fulfilled", value: await tasks[index]() }
      } catch (reason) {
        results[index] = { status: "rejected", reason }
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker())
  await Promise.all(workers)

  return results
}

// ─── Web Search Fallback (pre-v7 Sonnet approach) ───────────────────

/**
 * Fallback: use Sonnet + web_search tool to find buy part products.
 * Restores the pre-v7 approach for when RS direct scraping fails (IP blocking on Vercel).
 * Anthropic handles the web fetching, so no IP blocking issues.
 *
 * @param partNames - Array of original BOM part names to search
 * @param apiKey - Anthropic API key
 * @returns Search results for each part
 */
async function searchViaWebSearch(
  partNames: string[],
  apiKey: string,
): Promise<BuyPartSearchResult[]> {
  const client = new Anthropic({ apiKey, timeout: 240_000, maxRetries: 0 })
  const allResults: BuyPartSearchResult[] = []

  // INTENT: Batch parts into groups of 5 to balance cost vs quality
  const batchSize = 5
  for (let i = 0; i < partNames.length; i += batchSize) {
    const batch = partNames.slice(i, i + batchSize)
    const cleanedBatch = batch.map((n) => ({ original: n, cleaned: cleanPartName(n) }))

    const partList = cleanedBatch.map((p, idx) => `${idx + 1}. "${p.cleaned}"`).join("\n")

    try {
      let messages: Anthropic.MessageParam[] = [
        {
          role: "user",
          content: `Find UK supplier products (with prices in GBP) for these parts. Search RS Components, Farnell, DigiKey, or McMaster-Carr.\n\n${partList}\n\nFor each part, return the best matching product with title, URL, price (GBP), and source.\nReturn a JSON array:\n[{"partName": "original name", "title": "Product Title", "url": "https://...", "price": 12.34, "source": "RS Components"}]\n\nIf you cannot find a product for a part, omit it from the array.`,
        },
      ]

      let finalText = ""
      const maxTurns = 8

      for (let turn = 0; turn < maxTurns; turn++) {
        const response = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          system: "You are a procurement assistant. Find real products from UK electronic/mechanical component suppliers. Always search for actual products with real prices. Return only valid JSON.",
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }],
          messages,
        })

        // INTENT: Collect text blocks from the response
        for (const block of response.content) {
          if (block.type === "text") finalText += block.text
        }

        // INTENT: Handle pause_turn — model needs more tool calls to finish
        if (response.stop_reason === "pause_turn") {
          messages = [
            ...messages,
            { role: "assistant", content: response.content },
            { role: "user", content: "Continue searching for the remaining parts." },
          ]
          continue
        }

        break // end_turn or max_tokens — done
      }

      // INTENT: Parse JSON array from response text
      const jsonMatch = finalText.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
          partName?: string
          title?: string
          url?: string
          price?: number
          source?: string
        }>

        for (const item of parsed) {
          if (!item.title || !item.price || item.price <= 0) continue
          if (isUnsourceableFromRS(item.partName || "")) continue

          // INTENT: Map cleaned name back to original BOM name
          const matchedPart = cleanedBatch.find(
            (p) =>
              p.cleaned.toLowerCase() === (item.partName || "").toLowerCase() ||
              p.original.toLowerCase() === (item.partName || "").toLowerCase(),
          )
          const originalName = matchedPart?.original || item.partName || ""
          if (!originalName) continue

          allResults.push({
            partName: originalName,
            products: [
              {
                title: item.title,
                url: item.url || "",
                source: item.source || "Web Search",
                estimatedPrice: `£${item.price.toFixed(2)}`,
                numericPrice: item.price,
              },
            ],
          })
        }
      }

      console.log(`[BUY-SEARCH] Web search batch ${Math.floor(i / batchSize) + 1}: found ${allResults.length} products so far`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[BUY-SEARCH] Web search batch failed: ${message}`)
    }
  }

  return allResults
}

// ─── Server Action ──────────────────────────────────────────────────

export async function searchBuyPartProducts(
  partNames: string[],
): Promise<BuyPartSearchResult[]> {
  if (partNames.length === 0) return []

  // SECURITY: Cap input to prevent unbounded scraping + AI calls
  const MAX_PARTS = 20
  if (partNames.length > MAX_PARTS) {
    return partNames.map((name) => ({ partName: name, products: [] }))
  }

  return withAIGate('cad_lab_buy_search', async ({ user }) => {

  // SECURITY: Rate limit buy-part search (10 per hour per user)
  const rateLimitError = await checkRateLimit('aiBuySearch', user.id)
  if (rateLimitError) {
    return partNames.map((name) => ({ partName: name, products: [] }))
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    console.error("[BUY-SEARCH] ANTHROPIC_API_KEY not set")
    return partNames.map((name) => ({ partName: name, products: [] }))
  }

  console.log(`[BUY-SEARCH] Starting direct RS scrape for ${partNames.length} parts (concurrency=${SCRAPE_CONCURRENCY})`)

  const tasks = partNames.map((name) => () => scrapePartFromRS(name, apiKey))
  const settled = await withConcurrencyLimit(tasks, SCRAPE_CONCURRENCY)

  const allResults: BuyPartSearchResult[] = settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value
    console.error(`[BUY-SEARCH] Part "${partNames[i]}" scrape rejected:`, s.reason)
    return { partName: partNames[i], products: [] }
  })

  // Post-process: parse numeric prices from estimatedPrice strings (for any missing)
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

  // INTENT: If RS blocked (>60% failure), fall back to web_search for failed parts only.
  // RS blocks Vercel IPs intermittently — Sonnet web_search bypasses this since Anthropic handles fetching.
  const failedParts = allResults.filter((r) => r.products.length === 0).map((r) => r.partName)
  const failRate = allResults.length > 0 ? failedParts.length / allResults.length : 0

  if (failRate > 0.6 && failedParts.length > 0) {
    console.log(`[BUY-SEARCH] RS fail rate ${Math.round(failRate * 100)}% — falling back to web_search for ${failedParts.length} parts`)
    const webResults = await searchViaWebSearch(failedParts, apiKey)
    // INTENT: Merge — replace empty RS results with web_search results
    for (const wr of webResults) {
      const idx = allResults.findIndex((r) => r.partName === wr.partName)
      if (idx >= 0 && wr.products.length > 0) allResults[idx] = wr
    }
  }

  const totalWithProducts = allResults.filter((r) => r.products.length > 0).length
  console.log(`[BUY-SEARCH] Final: ${totalWithProducts}/${allResults.length} parts have products`)

  return allResults
  })
}
