"use server"

/**
 * @file web-fetch.ts
 *
 * @description Server action that fetches a web page, extracts its readable
 * content using Mozilla Readability, and returns clean text + sanitized HTML
 * for the in-app browser's reader view and specialist context injection.
 *
 * @security
 * - Validates URL format and blocks private/internal IPs
 * - Rate limited per user (30 requests/minute)
 * - Content truncated to prevent excessive token usage
 * - HTML sanitized with isomorphic-dompurify before returning
 *
 * @related
 * - Browse page: src/app/(platform)/browse/page.tsx
 * - Specialist execute: src/app/api/agents/execute/route.ts
 */

import { Readability } from "@mozilla/readability"
import DOMPurify from "isomorphic-dompurify"
import { JSDOM } from "jsdom"
import { createClient } from "@/lib/supabase/server"
import { checkRateLimit } from "@/lib/security/rate-limit"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WebPageResult {
  /** The final URL (after redirects) */
  url: string
  /** Page title */
  title: string
  /** Meta description */
  description: string
  /** Clean extracted text for specialist context (truncated to ~8000 chars) */
  content: string
  /** Sanitized HTML for reader view rendering */
  htmlContent: string
  /** Site name from meta tags */
  siteName: string | null
  /** Favicon URL */
  favicon: string | null
  /** Byline / author */
  byline: string | null
  /** Estimated reading time in minutes */
  readingTimeMinutes: number
  /** Whether the site likely allows iframe embedding (based on X-Frame-Options / CSP headers) */
  embeddable: boolean
}

export interface WebFetchResponse {
  success: boolean
  data?: WebPageResult
  error?: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_CONTENT_LENGTH = 8000
const MAX_HTML_LENGTH = 50000
const MAX_RAW_HTML_BYTES = 3_000_000 // 3 MB — skip JSDOM for monster pages
const FETCH_TIMEOUT_MS = 10000

// ─── LRU Cache ──────────────────────────────────────────────────────────────

interface CacheEntry {
  result: WebFetchResponse
  timestamp: number
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const CACHE_MAX_ENTRIES = 50

const pageCache = new Map<string, CacheEntry>()

/**
 * Blocked IP ranges: private networks, loopback, link-local, metadata endpoints.
 * Prevents SSRF attacks where a user could probe internal infrastructure.
 */
const BLOCKED_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
  /^fd/,
]

const BLOCKED_HOSTNAMES = [
  "localhost",
  "metadata.google.internal",
  "169.254.169.254",
]

// ─── Embed Detection ────────────────────────────────────────────────────────

/**
 * Checks response headers to determine if a site allows iframe embedding.
 *
 * @description Reads X-Frame-Options and Content-Security-Policy frame-ancestors
 * directives. These are the same headers browsers use to decide whether to render
 * an iframe — checking them server-side lets us skip the iframe attempt entirely
 * for sites that will block it.
 *
 * @param response - The fetch Response object
 * @returns true if the site likely allows embedding, false if it blocks it
 *
 * @security This is a best-effort check. Some sites block iframes via JavaScript
 * instead of headers, which this cannot detect.
 */
function checkEmbeddable(response: Response): boolean {
  // SECURITY: Check X-Frame-Options header
  const xfo = response.headers.get("x-frame-options")?.toLowerCase()
  if (xfo === "deny" || xfo === "sameorigin") return false

  // SECURITY: Check Content-Security-Policy frame-ancestors directive
  const csp = response.headers.get("content-security-policy")?.toLowerCase() ?? ""
  if (csp.includes("frame-ancestors 'none'") || csp.includes("frame-ancestors 'self'")) return false

  return true
}

// ─── URL Validation ─────────────────────────────────────────────────────────

/**
 * Validates a URL is safe to fetch server-side.
 *
 * @param urlString - The URL to validate
 * @returns The validated URL object, or null if unsafe
 *
 * @security Blocks javascript:, data:, file: schemes and private IPs
 */
function validateUrl(urlString: string): URL | null {
  try {
    const url = new URL(urlString)

    // SECURITY: Only allow http and https
    if (!["http:", "https:"].includes(url.protocol)) {
      return null
    }

    // SECURITY: Block known internal hostnames
    if (BLOCKED_HOSTNAMES.includes(url.hostname.toLowerCase())) {
      return null
    }

    // SECURITY: Block private IP ranges
    for (const pattern of BLOCKED_IP_PATTERNS) {
      if (pattern.test(url.hostname)) {
        return null
      }
    }

    return url
  } catch {
    return null
  }
}

// ─── HTML Sanitization ──────────────────────────────────────────────────────

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "a", "strong", "em", "b", "i", "u", "s",
  "table", "thead", "tbody", "tr", "th", "td",
  "img", "figure", "figcaption",
  "div", "span", "section", "article",
]

/**
 * Sanitizes HTML using DOMPurify — a battle-tested, well-maintained sanitizer.
 *
 * @security Strips script, style, iframe, object, embed, form elements
 * and removes event handler attributes (onclick, onerror, etc.)
 */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "id"],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
  })
}

// ─── Content Extraction ─────────────────────────────────────────────────────

/**
 * Extracts favicon URL from a page's HTML.
 */
function extractFavicon(doc: Document, baseUrl: string): string | null {
  const iconLink =
    doc.querySelector('link[rel="icon"]') ??
    doc.querySelector('link[rel="shortcut icon"]') ??
    doc.querySelector('link[rel="apple-touch-icon"]')

  if (iconLink) {
    const href = iconLink.getAttribute("href")
    if (href) {
      try {
        return new URL(href, baseUrl).toString()
      } catch {
        return null
      }
    }
  }

  // Fallback: try /favicon.ico
  try {
    return new URL("/favicon.ico", baseUrl).toString()
  } catch {
    return null
  }
}

/**
 * Extracts meta description from a page's HTML.
 */
function extractDescription(doc: Document): string {
  const metaDesc =
    doc.querySelector('meta[name="description"]') ??
    doc.querySelector('meta[property="og:description"]')
  return metaDesc?.getAttribute("content")?.trim() ?? ""
}

/**
 * Extracts site name from meta tags.
 */
function extractSiteName(doc: Document): string | null {
  const ogSiteName = doc.querySelector('meta[property="og:site_name"]')
  return ogSiteName?.getAttribute("content")?.trim() ?? null
}

/**
 * Estimates reading time based on word count (~200 words/minute).
 */
function estimateReadingTime(text: string): number {
  const wordCount = text.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(wordCount / 200))
}

// ─── Main Action ────────────────────────────────────────────────────────────

/**
 * Fetches a web page and extracts its readable content.
 *
 * @description Fetches the URL server-side, parses it with JSDOM and
 * Mozilla Readability, sanitizes the HTML output, and returns both
 * clean text (for specialist context) and sanitized HTML (for reader view).
 *
 * @param url - The URL to fetch
 * @returns WebFetchResponse with extracted content or error
 *
 * @security Rate limited, URL validated, HTML sanitized
 * @audit Logs fetch attempts for usage tracking
 */
export async function fetchWebPage(url: string): Promise<WebFetchResponse> {
  // AUTH: Require authenticated user
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "Authentication required" }
  }

  // SECURITY: Rate limit web fetches to prevent abuse
  const rateLimitError = await checkRateLimit('webFetch', user.id)
  if (rateLimitError) {
    return { success: false, error: rateLimitError }
  }

  // VALIDATION: Check URL is safe
  const validatedUrl = validateUrl(url)
  if (!validatedUrl) {
    return {
      success: false,
      error: "Invalid or blocked URL. Only http/https URLs to public sites are allowed.",
    }
  }

  const cacheKey = validatedUrl.toString()

  // Check cache — return instantly if we have a fresh result
  const cached = pageCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const response = await fetch(validatedUrl.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const errorMsg = response.status === 403
        ? "This site blocks automated access. Try opening it in a new tab instead."
        : response.status === 429
          ? "Too many requests to this site. Wait a moment and try again."
          : `Failed to fetch page (HTTP ${response.status})`
      return { success: false, error: errorMsg }
    }

    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return {
        success: false,
        error: "URL does not point to an HTML page",
      }
    }

    const embeddable = checkEmbeddable(response)

    // Guard against extremely large pages that would stall JSDOM
    const contentLength = Number(response.headers.get("content-length") || 0)
    let html: string
    if (contentLength > MAX_RAW_HTML_BYTES) {
      // Read only the first chunk — enough for metadata + Readability
      const decoder = new TextDecoder()
      const reader = response.body?.getReader()
      if (!reader) {
        return { success: false, error: "Failed to read response body" }
      }
      let accumulated = ""
      while (accumulated.length < MAX_RAW_HTML_BYTES) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
      }
      reader.cancel()
      html = accumulated
    } else {
      html = await response.text()
      // Double-check actual size even when Content-Length was absent or wrong
      if (html.length > MAX_RAW_HTML_BYTES) {
        html = html.slice(0, MAX_RAW_HTML_BYTES)
      }
    }

    // Single JSDOM parse — reused for metadata, Readability, and sanitization
    const dom = new JSDOM(html, { url: validatedUrl.toString() })
    const doc = dom.window.document

    const description = extractDescription(doc)
    const siteName = extractSiteName(doc)
    const favicon = extractFavicon(doc, validatedUrl.origin)
    const pageTitle = doc.title || validatedUrl.hostname

    const reader2 = new Readability(doc)
    const article = reader2.parse()

    if (!article) {
      const result: WebFetchResponse = {
        success: true,
        data: {
          url: validatedUrl.toString(),
          title: pageTitle,
          description,
          content: description || "Could not extract readable content from this page.",
          htmlContent: `<p>${(description || "Could not extract readable content from this page.").replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`,
          siteName,
          favicon,
          byline: null,
          readingTimeMinutes: 1,
          embeddable,
        },
      }
      cacheResult(cacheKey, result)
      return result
    }

    // SECURITY: Sanitize extracted HTML with DOMPurify before returning to client
    const sanitizedHtml = sanitizeHtml(article.content ?? "")

    const textContent = (article.textContent ?? "").trim()
    const truncatedContent =
      textContent.length > MAX_CONTENT_LENGTH
        ? textContent.slice(0, MAX_CONTENT_LENGTH) + "\n\n[Content truncated...]"
        : textContent

    const truncatedHtml =
      sanitizedHtml.length > MAX_HTML_LENGTH
        ? sanitizedHtml.slice(0, MAX_HTML_LENGTH) + "<p><em>[Content truncated for display]</em></p>"
        : sanitizedHtml

    const result: WebFetchResponse = {
      success: true,
      data: {
        url: validatedUrl.toString(),
        title: article.title || pageTitle,
        description,
        content: truncatedContent,
        htmlContent: truncatedHtml,
        siteName: siteName || article.siteName || null,
        favicon,
        byline: article.byline || null,
        readingTimeMinutes: estimateReadingTime(textContent),
        embeddable,
      },
    }

    cacheResult(cacheKey, result)
    return result
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, error: "Request timed out (10s). The site may be slow or unreachable." }
    }

    console.error("[web-fetch] Failed to fetch page:", {
      url: validatedUrl?.toString(),
      error: error instanceof Error ? error.message : "Unknown error",
    })

    return {
      success: false,
      error: "Failed to fetch page. The site may be blocking automated requests.",
    }
  }
}

/**
 * Stores a result in the LRU page cache, evicting oldest entries when full.
 */
function cacheResult(key: string, result: WebFetchResponse): void {
  if (pageCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = pageCache.keys().next().value
    if (oldestKey) pageCache.delete(oldestKey)
  }
  pageCache.set(key, { result, timestamp: Date.now() })
}
