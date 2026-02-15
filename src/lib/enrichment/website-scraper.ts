/**
 * @file website-scraper.ts
 *
 * @description Lightweight website scraper for company intelligence enrichment.
 * Fetches a company's website and key internal pages, extracts meaningful text
 * content, and returns structured page data for AI summarization.
 *
 * @security
 * - Only fetches public websites (no auth required)
 * - Respects robots.txt (checks before scraping)
 * - Rate-limited: max 5 pages per domain, 1.5s delay between requests
 * - Timeout: 10s per page to prevent hanging
 * - Strips scripts, styles, and navigation — only extracts body text
 *
 * @dependencies
 * - node-html-parser: Fast HTML parser (no browser needed)
 */

import { parse as parseHTML } from 'node-html-parser'

// ─── Types ──────────────────────────────────────────────────────────

/** A single scraped page result */
export interface ScrapedPage {
  /** Full URL of the page */
  url: string
  /** Page title from <title> tag */
  title: string
  /** Extracted text content (scripts/styles/nav stripped) */
  text: string
  /** HTTP status code */
  status: number
}

/** Result from scraping an entire website */
export interface WebsiteScrapeResult {
  /** Base domain that was scraped */
  domain: string
  /** All successfully scraped pages */
  pages: ScrapedPage[]
  /** Total character count of extracted text */
  totalChars: number
  /** Any errors encountered during scraping */
  errors: string[]
}

// ─── Constants ──────────────────────────────────────────────────────

/** Maximum pages to scrape per domain */
const MAX_PAGES = 5

/** Delay between requests in milliseconds */
const REQUEST_DELAY_MS = 1500

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 10_000

/** Maximum text content per page (chars) to prevent huge pages */
const MAX_TEXT_PER_PAGE = 15_000

/** Key internal paths to attempt scraping beyond the homepage */
const KEY_PATHS = ['/about', '/team', '/pricing', '/products', '/services']

/** User agent string for requests */
const USER_AGENT = 'ForgeOS-Enrichment/1.0 (company intelligence builder)'

// ─── Main Scraper ───────────────────────────────────────────────────

/**
 * Scrapes a company website to extract structured text content.
 *
 * @description Fetches the homepage and key internal pages (about, team,
 * pricing, products, services). Extracts clean text by stripping scripts,
 * styles, navigation elements, and boilerplate. Respects rate limits and
 * timeouts.
 *
 * @param websiteUrl - The company website URL to scrape
 * @returns Structured scrape result with pages, text, and any errors
 */
export async function scrapeWebsite(websiteUrl: string): Promise<WebsiteScrapeResult> {
  const errors: string[] = []
  const pages: ScrapedPage[] = []

  // Normalize URL
  let baseUrl: URL
  try {
    baseUrl = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`)
  } catch {
    return { domain: websiteUrl, pages: [], totalChars: 0, errors: ['Invalid URL'] }
  }

  const domain = baseUrl.hostname

  // Check robots.txt for disallowed paths
  const disallowedPaths = await fetchRobotsTxtDisallowed(baseUrl.origin)

  // Build page list: homepage + key paths
  const pagesToScrape = [baseUrl.origin]
  for (const path of KEY_PATHS) {
    if (!isPathDisallowed(path, disallowedPaths)) {
      pagesToScrape.push(`${baseUrl.origin}${path}`)
    }
  }

  // Scrape each page with rate limiting
  for (let i = 0; i < Math.min(pagesToScrape.length, MAX_PAGES); i++) {
    const pageUrl = pagesToScrape[i]

    // Rate limit: delay between requests (skip delay for first request)
    if (i > 0) {
      await sleep(REQUEST_DELAY_MS)
    }

    try {
      const page = await scrapeSinglePage(pageUrl)
      if (page) {
        pages.push(page)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      errors.push(`${pageUrl}: ${message}`)
    }
  }

  const totalChars = pages.reduce((sum, p) => sum + p.text.length, 0)

  return { domain, pages, totalChars, errors }
}

// ─── Single Page Scraper ────────────────────────────────────────────

/**
 * Fetches and extracts text from a single page.
 *
 * @param url - Page URL to fetch
 * @returns Scraped page data, or null if page returned non-200 or had no content
 */
async function scrapeSinglePage(url: string): Promise<ScrapedPage | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html',
      },
      redirect: 'follow',
    })

    clearTimeout(timeout)

    // Only process successful HTML responses
    if (!response.ok) {
      return null
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) {
      return null
    }

    const html = await response.text()
    const { title, text } = extractTextFromHTML(html)

    // Skip pages with very little content (likely error pages or redirects)
    if (text.length < 50) {
      return null
    }

    return {
      url,
      title,
      text: text.slice(0, MAX_TEXT_PER_PAGE),
      status: response.status,
    }
  } catch (err) {
    clearTimeout(timeout)
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out')
    }
    throw err
  }
}

// ─── HTML Text Extraction ───────────────────────────────────────────

/**
 * Extracts clean text content from raw HTML.
 *
 * @description Removes script, style, nav, footer, header elements,
 * then extracts text from the remaining body content. Collapses
 * whitespace for clean output.
 *
 * @param html - Raw HTML string
 * @returns Object with extracted title and body text
 */
function extractTextFromHTML(html: string): { title: string; text: string } {
  const root = parseHTML(html)

  // Extract title
  const titleEl = root.querySelector('title')
  const title = titleEl?.text?.trim() ?? ''

  // Remove elements that don't contain meaningful content
  const tagsToRemove = ['script', 'style', 'nav', 'footer', 'header', 'noscript', 'iframe', 'svg']
  for (const tag of tagsToRemove) {
    const elements = root.querySelectorAll(tag)
    for (const el of elements) {
      el.remove()
    }
  }

  // Also remove common boilerplate by class/id patterns
  const boilerplateSelectors = [
    '.cookie-banner', '.cookie-consent', '#cookie-banner',
    '.newsletter-signup', '.popup', '.modal',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  ]
  for (const selector of boilerplateSelectors) {
    try {
      const elements = root.querySelectorAll(selector)
      for (const el of elements) {
        el.remove()
      }
    } catch {
      // Some selectors may not be supported — skip
    }
  }

  // Extract text from body (or root if no body)
  const body = root.querySelector('body') ?? root
  const rawText = body.text

  // Collapse whitespace: multiple spaces/newlines -> single space
  const text = rawText
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim()

  return { title, text }
}

// ─── robots.txt ─────────────────────────────────────────────────────

/**
 * Fetches robots.txt and returns disallowed paths.
 *
 * @param origin - Site origin (e.g. https://example.com)
 * @returns Array of disallowed path prefixes
 */
async function fetchRobotsTxtDisallowed(origin: string): Promise<string[]> {
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) return []

    const text = await response.text()
    const disallowed: string[] = []
    let isRelevantAgent = false

    for (const line of text.split('\n')) {
      const trimmed = line.trim().toLowerCase()
      if (trimmed.startsWith('user-agent:')) {
        const agent = trimmed.slice('user-agent:'.length).trim()
        isRelevantAgent = agent === '*' || agent.includes('forgeOS')
      } else if (isRelevantAgent && trimmed.startsWith('disallow:')) {
        const path = trimmed.slice('disallow:'.length).trim()
        if (path) disallowed.push(path)
      }
    }

    return disallowed
  } catch {
    return [] // If robots.txt is unreachable, proceed with scraping
  }
}

/**
 * Checks if a path is disallowed by robots.txt rules.
 */
function isPathDisallowed(path: string, disallowed: string[]): boolean {
  return disallowed.some(rule => path.startsWith(rule))
}

// ─── Helpers ────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
