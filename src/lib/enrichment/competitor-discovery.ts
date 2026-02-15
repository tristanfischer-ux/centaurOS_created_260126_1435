/**
 * @file competitor-discovery.ts
 *
 * @description Competitor analysis pipeline that takes user-provided competitor
 * names/URLs, scrapes their websites, and uses AI to produce structured
 * competitive intelligence. Results are stored in foundries.company_intel.competitors.
 *
 * @dependencies
 * - website-scraper: Scrapes competitor websites
 * - openai (via lazy loader): AI analysis
 *
 * @related
 * - src/lib/enrichment/website-scraper.ts -- scraping engine
 * - src/types/foundry.ts -- CompanyIntelCompetitor type
 * - src/actions/enrichment.ts -- orchestrating action
 */

import { getOpenAIClient } from '@/lib/ai/openai-lazy'
import { scrapeWebsite } from './website-scraper'
import type { CompanyIntelCompetitor } from '@/types/foundry'

// ─── Constants ──────────────────────────────────────────────────────

/** Model used for competitor analysis */
const ANALYSIS_MODEL = 'MiniMax-M2.5'

/** Maximum competitors to analyze in one batch */
const MAX_COMPETITORS = 5

/** Maximum output tokens for analysis */
const MAX_TOKENS = 4096

// ─── Main Pipeline ──────────────────────────────────────────────────

/**
 * Analyzes a list of competitors by scraping their websites and producing
 * structured intelligence.
 *
 * @description For each competitor name/URL:
 * 1. If it looks like a URL, scrape the website
 * 2. If it's a name, try adding .com and scraping
 * 3. Pass all scraped data + the user's company context to AI for analysis
 * 4. Returns structured competitor profiles with differentiators
 *
 * @param competitorInputs - User-provided competitor names or URLs
 * @param companyContext - Brief description of the user's own company (for comparison)
 * @returns Array of structured competitor profiles
 */
export async function analyzeCompetitors(
  competitorInputs: string[],
  companyContext: string,
): Promise<CompanyIntelCompetitor[]> {
  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    console.warn('[CompetitorDiscovery] MINIMAX_API_KEY not configured — skipping analysis')
    return []
  }

  // Limit to MAX_COMPETITORS
  const inputs = competitorInputs.slice(0, MAX_COMPETITORS)

  // Scrape each competitor's website
  const scrapedCompetitors: Array<{
    input: string
    domain: string
    text: string
  }> = []

  for (const input of inputs) {
    try {
      const url = normalizeToUrl(input)
      if (!url) {
        // If we can't form a URL, include the name as-is for AI analysis
        scrapedCompetitors.push({ input, domain: input, text: '' })
        continue
      }

      const result = await scrapeWebsite(url)
      const combinedText = result.pages.map(p => `${p.title}: ${p.text}`).join('\n\n')

      scrapedCompetitors.push({
        input,
        domain: result.domain || input,
        text: combinedText.slice(0, 8000), // Limit per competitor
      })
    } catch (err) {
      console.warn(`[CompetitorDiscovery] Failed to scrape ${input}:`, err)
      scrapedCompetitors.push({ input, domain: input, text: '' })
    }
  }

  // Use AI to analyze all competitors together
  return analyzeWithAI(scrapedCompetitors, companyContext, apiKey)
}

// ─── AI Analysis ────────────────────────────────────────────────────

/**
 * Uses AI to produce structured competitor profiles from scraped data.
 */
async function analyzeWithAI(
  competitors: Array<{ input: string; domain: string; text: string }>,
  companyContext: string,
  apiKey: string,
): Promise<CompanyIntelCompetitor[]> {
  const OpenAI = await getOpenAIClient()
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.minimax.io/v1',
  })

  // Build competitor content blocks
  const competitorBlocks = competitors.map((c, i) => {
    if (c.text) {
      return `--- Competitor ${i + 1}: ${c.input} (${c.domain}) ---\n${c.text}`
    }
    return `--- Competitor ${i + 1}: ${c.input} ---\n[No website data available — analyze based on name only]`
  }).join('\n\n')

  const systemPrompt = [
    'You are a competitive intelligence analyst. Analyze competitor websites and',
    'produce structured profiles comparing them to the user\'s company.',
    'Be factual — only state what is clearly evident from the data.',
    'If a competitor\'s website could not be scraped, make reasonable inferences',
    'from the company name but note the uncertainty.',
    '',
    'Respond with ONLY valid JSON. No markdown fences, no explanation.',
  ].join('\n')

  const userPrompt = [
    `Our company context: ${companyContext}`,
    '',
    'Competitor data:',
    competitorBlocks,
    '',
    'For each competitor, produce a JSON array:',
    '[',
    '  {',
    '    "name": "Company Name",',
    '    "website": "https://domain.com",',
    '    "description": "What they do in 1-2 sentences",',
    '    "differentiator": "How they differ from us / their key strength vs us"',
    '  }',
    ']',
    '',
    'Rules:',
    '- Include ALL competitors provided, even if website data is missing',
    '- Keep descriptions under 50 words',
    '- Keep differentiators under 30 words',
    '- If website is unknown, use "unknown" for the website field',
  ].join('\n')

  try {
    const completion = await client.chat.completions.create({
      model: ANALYSIS_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
    })

    const responseText = completion.choices[0]?.message?.content ?? ''

    // Parse JSON response
    const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    const jsonStr = jsonMatch?.[1]?.trim() ?? responseText.trim()
    const parsed = JSON.parse(jsonStr) as CompanyIntelCompetitor[]

    // Validate structure
    return parsed.filter(c =>
      typeof c.name === 'string' &&
      typeof c.description === 'string' &&
      typeof c.differentiator === 'string'
    ).map(c => ({
      name: c.name,
      website: c.website ?? 'unknown',
      description: c.description,
      differentiator: c.differentiator,
    }))
  } catch (err) {
    console.error('[CompetitorDiscovery] AI analysis failed:', err)
    // Fall back to basic entries without AI analysis
    return competitors.map(c => ({
      name: c.input,
      website: c.domain.includes('.') ? `https://${c.domain}` : 'unknown',
      description: 'Website analysis pending',
      differentiator: 'Analysis pending',
    }))
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Normalizes a user input (name or URL) to a full URL for scraping.
 *
 * @param input - Company name or URL
 * @returns Normalized URL, or null if can't form a valid URL
 */
function normalizeToUrl(input: string): string | null {
  // Already a URL
  if (input.startsWith('http://') || input.startsWith('https://')) {
    try {
      new URL(input)
      return input
    } catch {
      return null
    }
  }

  // Looks like a domain (contains a dot)
  if (input.includes('.')) {
    try {
      const url = `https://${input}`
      new URL(url)
      return url
    } catch {
      return null
    }
  }

  // Just a name — try adding .com
  const slugified = input.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (slugified.length > 0) {
    return `https://${slugified}.com`
  }

  return null
}
