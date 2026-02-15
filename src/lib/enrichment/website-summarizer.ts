/**
 * @file website-summarizer.ts
 *
 * @description AI-powered summarizer that takes raw scraped website content
 * and produces structured company intelligence. Uses MiniMax M2.5 (the same
 * model used for background sweeps) for cost efficiency.
 *
 * @dependencies
 * - openai (via lazy loader): For MiniMax API calls
 * - website-scraper: Provides ScrapedPage input
 *
 * @related
 * - src/lib/enrichment/website-scraper.ts -- produces input data
 * - src/types/foundry.ts -- CompanyIntelligence output type
 * - src/actions/enrichment.ts -- orchestrates the pipeline
 */

import { getOpenAIClient } from '@/lib/ai/openai-lazy'
import type { ScrapedPage } from './website-scraper'
import type { CompanyIntelligence } from '@/types/foundry'

// ─── Constants ──────────────────────────────────────────────────────

/** Model used for summarization (same as sweeps — cost efficient) */
const SUMMARIZER_MODEL = 'MiniMax-M2.5'

/** Maximum output tokens */
const MAX_TOKENS = 4096

/** Maximum input text chars to send to the model (prevents token overflow) */
const MAX_INPUT_CHARS = 40_000

// ─── Main Summarizer ────────────────────────────────────────────────

/**
 * Summarizes scraped website content into structured company intelligence.
 *
 * @description Takes an array of scraped pages and uses AI to extract
 * structured data: company description, products/services, target customers,
 * value proposition, team bios, and pricing model.
 *
 * @param pages - Scraped pages from the website scraper
 * @param companyName - Known company name (for better context)
 * @returns Partial CompanyIntelligence with website-derived fields
 *
 * @throws Error if MINIMAX_API_KEY is not configured
 */
export async function summarizeWebsiteContent(
  pages: ScrapedPage[],
  companyName: string,
): Promise<Partial<CompanyIntelligence>> {
  if (pages.length === 0) {
    return { website_summary: null }
  }

  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY not configured — cannot summarize website')
  }

  // Build the input text from scraped pages
  const inputText = buildInputText(pages)

  // Build prompts
  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(companyName, inputText)

  // Call MiniMax M2.5
  const OpenAI = await getOpenAIClient()
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.minimax.io/v1',
  })

  const completion = await client.chat.completions.create({
    model: SUMMARIZER_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: MAX_TOKENS,
    temperature: 0.2, // Low temperature for factual extraction
  })

  const responseText = completion.choices[0]?.message?.content ?? ''

  // Parse the JSON response
  return parseAIResponse(responseText)
}

// ─── Prompt Building ────────────────────────────────────────────────

/**
 * Builds concatenated input text from scraped pages, respecting char limit.
 */
function buildInputText(pages: ScrapedPage[]): string {
  const pageBlocks: string[] = []
  let totalChars = 0

  for (const page of pages) {
    const block = `--- Page: ${page.title} (${page.url}) ---\n${page.text}`

    if (totalChars + block.length > MAX_INPUT_CHARS) {
      // Include a truncated version of this page
      const remaining = MAX_INPUT_CHARS - totalChars
      if (remaining > 200) {
        pageBlocks.push(block.slice(0, remaining) + '\n[...truncated]')
      }
      break
    }

    pageBlocks.push(block)
    totalChars += block.length
  }

  return pageBlocks.join('\n\n')
}

function buildSystemPrompt(): string {
  return [
    'You are a business intelligence analyst. Your job is to extract structured',
    'company information from website content. Be factual — only include',
    'information that is directly stated or clearly implied on the website.',
    'Do not invent or assume information not present in the content.',
    '',
    'Respond with ONLY valid JSON. No markdown fences, no explanation.',
  ].join('\n')
}

function buildUserPrompt(companyName: string, websiteContent: string): string {
  return [
    `Analyze the following website content for "${companyName}" and extract structured intelligence.`,
    '',
    'Website content:',
    websiteContent,
    '',
    'Extract the following into a JSON object:',
    '{',
    '  "website_summary": "2-3 sentence description of what this company does (or null if unclear)",',
    '  "products_services": [{"name": "Product Name", "description": "Brief description"}] (or null if none found),',
    '  "target_customers": "Who they sell to / target audience (or null if unclear)",',
    '  "value_proposition": "Their core value prop in 1-2 sentences (or null if unclear)",',
    '  "team_bios": [{"name": "Person Name", "role": "Their Title", "bio": "Brief bio"}] (or null if no team info),',
    '  "pricing_model": "How they price (free, freemium, subscription, per-seat, custom, etc.) (or null if no pricing found)"',
    '}',
    '',
    'Rules:',
    '- Use null for any field where the website content does not contain enough information',
    '- Keep descriptions concise (under 100 words each)',
    '- For team_bios, only include people with named roles (not generic staff)',
    '- Maximum 10 products/services, 10 team members',
  ].join('\n')
}

// ─── Response Parsing ───────────────────────────────────────────────

/**
 * Parses the AI model's response into structured CompanyIntelligence fields.
 *
 * @param responseText - Raw text from the AI model
 * @returns Partial CompanyIntelligence with website-derived fields
 */
function parseAIResponse(responseText: string): Partial<CompanyIntelligence> {
  try {
    // Try to extract JSON from response (may be wrapped in markdown fences)
    const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    const jsonStr = jsonMatch?.[1]?.trim() ?? responseText.trim()

    const parsed = JSON.parse(jsonStr) as {
      website_summary?: string | null
      products_services?: Array<{ name: string; description: string }> | null
      target_customers?: string | null
      value_proposition?: string | null
      team_bios?: Array<{ name: string; role: string; bio: string }> | null
      pricing_model?: string | null
    }

    return {
      website_summary: parsed.website_summary ?? null,
      products_services: parsed.products_services ?? null,
      target_customers: parsed.target_customers ?? null,
      value_proposition: parsed.value_proposition ?? null,
      team_bios: parsed.team_bios ?? null,
      pricing_model: parsed.pricing_model ?? null,
    }
  } catch {
    console.error('[WebsiteSummarizer] Failed to parse AI response:', responseText.slice(0, 200))
    return {
      website_summary: responseText.slice(0, 500),
      products_services: null,
      target_customers: null,
      value_proposition: null,
      team_bios: null,
      pricing_model: null,
    }
  }
}
