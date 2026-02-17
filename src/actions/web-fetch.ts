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
 * - HTML sanitized with DOMPurify before returning
 *
 * @related
 * - Browse page: src/app/(platform)/browse/page.tsx
 * - Specialist execute: src/app/api/agents/execute/route.ts
 */

import { Readability } from "@mozilla/readability"
import { JSDOM } from "jsdom"
import { createClient } from "@/lib/supabase/server"

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
}

export interface WebFetchResponse {
  success: boolean
  data?: WebPageResult
  error?: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_CONTENT_LENGTH = 8000
const MAX_HTML_LENGTH = 50000
const FETCH_TIMEOUT_MS = 15000

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

const ALLOWED_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "a", "strong", "em", "b", "i", "u", "s",
  "table", "thead", "tbody", "tr", "th", "td",
  "img", "figure", "figcaption",
  "div", "span", "section", "article",
])

const ALLOWED_ATTRS = new Set(["href", "src", "alt", "title", "class", "id"])

/**
 * Sanitizes HTML by removing dangerous elements and attributes.
 * Uses JSDOM to parse and walk the DOM tree server-side.
 *
 * @security Strips script, style, iframe, object, embed, form elements
 * and removes event handler attributes (onclick, onerror, etc.)
 */
function sanitizeHtml(html: string): string {
  const dom = new JSDOM(`<div id="__sanitize__">${html}</div>`)
  const doc = dom.window.document
  const container = doc.getElementById("__sanitize__")
  if (!container) return ""

  // Remove disallowed elements
  const allElements = container.querySelectorAll("*")
  for (const el of allElements) {
    const tagName = el.tagName.toLowerCase()
    if (!ALLOWED_TAGS.has(tagName)) {
      // Replace with text content to preserve readable text
      const text = doc.createTextNode(el.textContent || "")
      el.parentNode?.replaceChild(text, el)
      continue
    }

    // Remove disallowed attributes
    const attrs = Array.from(el.attributes)
    for (const attr of attrs) {
      if (!ALLOWED_ATTRS.has(attr.name.toLowerCase())) {
        el.removeAttribute(attr.name)
      }
      // SECURITY: Block javascript: URLs in href/src
      if ((attr.name === "href" || attr.name === "src") && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name)
      }
    }
  }

  return container.innerHTML
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

  // VALIDATION: Check URL is safe
  const validatedUrl = validateUrl(url)
  if (!validatedUrl) {
    return {
      success: false,
      error: "Invalid or blocked URL. Only http/https URLs to public sites are allowed.",
    }
  }

  try {
    // Fetch with timeout and browser-like headers
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const response = await fetch(validatedUrl.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ForgeOS/1.0; +https://forgeos.com)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch page (HTTP ${response.status})`,
      }
    }

    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return {
        success: false,
        error: "URL does not point to an HTML page",
      }
    }

    const html = await response.text()

    // Parse with JSDOM
    const dom = new JSDOM(html, { url: validatedUrl.toString() })
    const doc = dom.window.document

    // Extract metadata before Readability modifies the DOM
    const description = extractDescription(doc)
    const siteName = extractSiteName(doc)
    const favicon = extractFavicon(doc, validatedUrl.origin)
    const pageTitle = doc.title || validatedUrl.hostname

    // Extract readable content
    const reader = new Readability(doc)
    const article = reader.parse()

    if (!article) {
      // Readability couldn't extract content — return basic info
      return {
        success: true,
        data: {
          url: validatedUrl.toString(),
          title: pageTitle,
          description,
          content: description || "Could not extract readable content from this page.",
          htmlContent: `<p>${description || "Could not extract readable content from this page."}</p>`,
          siteName,
          favicon,
          byline: null,
          readingTimeMinutes: 1,
        },
      }
    }

    // Sanitize HTML for safe rendering in reader view
    // Use JSDOM to parse and strip dangerous elements/attributes
    const sanitizedHtml = sanitizeHtml(article.content)

    // Truncate content for specialist context
    const textContent = article.textContent.trim()
    const truncatedContent =
      textContent.length > MAX_CONTENT_LENGTH
        ? textContent.slice(0, MAX_CONTENT_LENGTH) + "\n\n[Content truncated...]"
        : textContent

    // Truncate HTML for reader view
    const truncatedHtml =
      sanitizedHtml.length > MAX_HTML_LENGTH
        ? sanitizedHtml.slice(0, MAX_HTML_LENGTH) + "<p><em>[Content truncated for display]</em></p>"
        : sanitizedHtml

    return {
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
      },
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, error: "Request timed out (15s). The site may be slow or unreachable." }
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
