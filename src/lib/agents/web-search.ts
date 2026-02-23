/**
 * @file web-search.ts
 *
 * @description Web search integration for AI specialists. Provides two paths:
 *
 * 1. **Claude-tier specialists** — native Anthropic web_search tool injected
 *    directly into the streaming call (handled in registry.ts)
 * 2. **Non-Claude-tier specialists** — pre-search proxy via Claude Haiku with
 *    web_search, results injected into the system prompt as "Research Context"
 *
 * A lightweight heuristic determines when search is needed (not every message
 * requires real-world data).
 *
 * @related
 * - Marketplace AI search: src/app/api/marketplace/ai-search/route.ts (pattern source)
 * - Execute route: src/app/api/agents/execute/route.ts (consumer)
 * - Registry: src/lib/ai-providers/registry.ts (Claude-tier streaming)
 */

// ─── Constants ──────────────────────────────────────────────────────

const WEB_SEARCH_BETA = "code-execution-web-tools-2026-02-09" as const
const PRE_SEARCH_MODEL = "claude-haiku-4-5"
const PRE_SEARCH_MAX_TOKENS = 4096
const PRE_SEARCH_MAX_USES = 2
const MAX_CONTINUE_LOOPS = 3

// ─── Types ──────────────────────────────────────────────────────────

export interface WebSearchSource {
  title: string
  url: string
  snippet: string
}

export interface WebSearchResult {
  summary: string
  sources: WebSearchSource[]
  searchCount: number
  estimatedCostUsd: number
}

// ─── Search Trigger Heuristic ───────────────────────────────────────

/** Keywords that indicate the user is asking about real-world data */
const SEARCH_TRIGGERS = {
  competitors: [
    /competitor/i, /competing/i, /alternative/i, /vs\.?\s/i,
    /compared?\s+to/i, /market\s+leader/i, /rival/i,
  ],
  marketData: [
    /\bTAM\b/, /\bSAM\b/, /\bSOM\b/, /market\s+size/i, /market\s+share/i,
    /market\s+cap/i, /industry\s+size/i, /growth\s+rate/i, /CAGR/i,
  ],
  pricing: [
    /pricing/i, /price\s+point/i, /how\s+much/i, /cost\s+of/i,
    /average\s+price/i, /subscription\s+fee/i,
  ],
  recency: [
    /latest/i, /current/i, /recent/i, /2025/i, /2026/i, /today/i,
    /this\s+(week|month|quarter|year)/i, /right\s+now/i, /up\s+to\s+date/i,
  ],
  regulation: [
    /regulat/i, /compliance/i, /\bGDPR\b/i, /\bHIPAA\b/i, /\bSOC\b/i,
    /\bISO\b/i, /\bPCI\b/i, /legal\s+require/i, /legislation/i,
  ],
  explicit: [
    /search\s+for/i, /look\s+up/i, /find\s+out/i, /research/i,
    /google/i, /what\s+is\s+the\s+latest/i, /can\s+you\s+check/i,
  ],
}

/**
 * Determines if a user message warrants web search.
 *
 * @param userMessage - The raw user input
 * @param companyName - Optional company name to detect competitor comparisons
 * @returns true if web search would add value to the response
 */
export function shouldTriggerWebSearch(userMessage: string, companyName?: string): boolean {
  if (!userMessage || userMessage.length < 10) return false

  // Check all trigger categories
  for (const patterns of Object.values(SEARCH_TRIGGERS)) {
    for (const pattern of patterns) {
      if (pattern.test(userMessage)) return true
    }
  }

  // Check for company name mentions that might be competitor references
  if (companyName && userMessage.length > 20) {
    // If the message mentions other company-like names (capitalized words not matching own company)
    const companyPattern = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\b/g
    const matches = userMessage.match(companyPattern) ?? []
    const otherCompanies = matches.filter(m =>
      m.toLowerCase() !== companyName.toLowerCase() &&
      !['The', 'How', 'What', 'When', 'Where', 'Why', 'Can', 'Should', 'Would', 'Could', 'Please'].includes(m)
    )
    if (otherCompanies.length > 0) return true
  }

  return false
}

// ─── Citation Extraction ────────────────────────────────────────────

/**
 * Extracts web sources from Anthropic response content blocks.
 * Same pattern as marketplace ai-search route.
 */
function collectWebSources(
  content: Array<{ type: string; text?: string; citations?: Array<{ url?: string; title?: string | null; cited_text?: string }> | null }>
): WebSearchSource[] {
  const seen = new Set<string>()
  const sources: WebSearchSource[] = []
  for (const block of content) {
    if (block.type !== "text" || !block.citations) continue
    for (const c of block.citations) {
      const url = c.url ?? ""
      if (!url || seen.has(url)) continue
      seen.add(url)
      sources.push({
        title: (c.title ?? "Source").toString(),
        url,
        snippet: (c.cited_text ?? "").slice(0, 200),
      })
    }
  }
  return sources
}

/**
 * Extracts text from Anthropic response content blocks.
 */
function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter(b => b.type === "text" && b.text)
    .map(b => b.text!)
    .join("\n")
}

// ─── Pre-Search Proxy ───────────────────────────────────────────────

/**
 * Runs a pre-search using Claude Haiku with web_search for non-Claude providers.
 *
 * @description Makes a quick, cheap API call to Claude Haiku with the web_search
 * tool enabled. The results are then formatted and injected into the non-Claude
 * specialist's system prompt as "Research Context."
 *
 * @param query - The user's question or search intent
 * @param specialistDomain - The specialist's domain (e.g., "Growth Marketing")
 * @param maxSearches - Maximum web searches to allow (default: 2)
 * @returns Search results with sources and cost estimate
 */
export async function runPreSearch(
  query: string,
  specialistDomain: string,
  maxSearches: number = PRE_SEARCH_MAX_USES,
): Promise<WebSearchResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { summary: '', sources: [], searchCount: 0, estimatedCostUsd: 0 }
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic({ apiKey })

    const webSearchTool = {
      type: "web_search_20260209",
      name: "web_search",
      max_uses: maxSearches,
    }

    const createParams = {
      model: PRE_SEARCH_MODEL,
      max_tokens: PRE_SEARCH_MAX_TOKENS,
      system: `You are a research assistant for a ${specialistDomain} specialist. Search the web and provide a concise summary of findings with key data points. Focus on facts, numbers, and recent developments. Be brief — this context will be injected into another AI's prompt.`,
      messages: [
        { role: "user" as const, content: query },
      ],
      tools: [webSearchTool],
      betas: [WEB_SEARCH_BETA],
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response = await client.beta.messages.create(createParams as any) as any

    // Handle pause_turn: continue until end_turn
    let continueCount = 0
    while (response.stop_reason === "pause_turn" && continueCount < MAX_CONTINUE_LOOPS) {
      continueCount++
      const prevMessages = [
        { role: "user" as const, content: query },
        { role: "assistant" as const, content: response.content },
        { role: "user" as const, content: "Continue." },
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response = await client.beta.messages.create({ ...createParams, messages: prevMessages } as any) as any
    }

    const tokensIn = response.usage?.input_tokens ?? 0
    const tokensOut = response.usage?.output_tokens ?? 0
    // Haiku pricing: $0.80/M input, $4.00/M output
    const estimatedCostUsd = (tokensIn * 0.80 + tokensOut * 4.00) / 1_000_000

    const sources = collectWebSources(response.content ?? [])
    const summary = extractText(response.content ?? [])

    return {
      summary,
      sources,
      searchCount: continueCount + 1,
      estimatedCostUsd,
    }
  } catch (err) {
    console.error("[WebSearch] Pre-search failed:", err)
    return { summary: '', sources: [], searchCount: 0, estimatedCostUsd: 0 }
  }
}

// ─── Formatting ─────────────────────────────────────────────────────

/**
 * Formats search results as a system prompt block for non-Claude specialists.
 *
 * @param results - The pre-search results
 * @returns Formatted markdown block to append to system prompt
 */
export function formatSearchResultsForPrompt(results: WebSearchResult): string {
  if (!results.summary && results.sources.length === 0) return ''

  const lines: string[] = [
    '## Web Research Context',
    '(Auto-researched from the web to support your response)',
    '',
  ]

  if (results.summary) {
    lines.push(results.summary)
    lines.push('')
  }

  if (results.sources.length > 0) {
    lines.push('### Sources')
    for (const s of results.sources.slice(0, 5)) {
      lines.push(`- [${s.title}](${s.url})${s.snippet ? ': ' + s.snippet : ''}`)
    }
  }

  return lines.join('\n')
}

/**
 * Returns the web search tool definition for Claude-tier specialists.
 * Used by the execute route to inject into streaming calls.
 */
export function getWebSearchToolDefinition(maxUses: number = 3) {
  return {
    type: "web_search_20260209" as const,
    name: "web_search" as const,
    max_uses: maxUses,
  }
}

/**
 * Returns the beta header needed for Anthropic web search.
 */
export function getWebSearchBeta(): string {
  return WEB_SEARCH_BETA
}
