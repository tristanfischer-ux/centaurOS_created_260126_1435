/**
 * @file investor-intel.ts
 *
 * @description Server actions for investor news intelligence. Uses Anthropic web search
 * to find current news, social media activity, and deal signals about investor firms.
 * Results are cached in the investor_news_intel table for 7 days.
 *
 * @security No foundry isolation — investor intel is read-only and public within platform.
 * Writes go through admin client (RLS blocks authenticated INSERT).
 * Reads are open to authenticated users.
 */

"use server"

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAnthropicKey } from '@/lib/ai/api-keys'
import Anthropic from '@anthropic-ai/sdk'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvestorIntel {
  id: string
  listing_id: string
  intel_summary: string
  key_signals: Array<{
    signal: string
    sentiment: 'positive' | 'negative' | 'neutral'
    source_url?: string
    date?: string
  }>
  sources: Array<{
    title: string
    url: string
    snippet?: string
  }>
  social_activity: string | null
  current_focus: string | null
  recent_deals: string | null
  generated_at: string
  generated_by: string
  generated_by_user_id: string | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// DECISION: 14-day cache — investor news is relatively stable at firm level.
// Extended from 7 days during Apr 2026 profitability audit. Reduces web search
// costs ($0.01/search) with minimal staleness risk for most data.
const INTEL_CACHE_DAYS = 14

// SECURITY: Rate limit — max generations per user per hour
const MAX_GENERATIONS_PER_HOUR = 10

// SECURITY: UUID format validator
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// SECURITY: Max batch size for IN queries
const MAX_BATCH_SIZE = 100

// ---------------------------------------------------------------------------
// Read Actions
// ---------------------------------------------------------------------------

/**
 * Fetches cached intel for a single investor listing.
 * Returns null if no intel exists or if the cache has expired.
 */
export async function getInvestorIntel(listingId: string): Promise<InvestorIntel | null> {
  if (!UUID_RE.test(listingId)) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('investor_news_intel')
    .select('*')
    .eq('listing_id', listingId)
    .single()

  if (error || !data) return null

  // Check if cache has expired
  const generatedAt = new Date(data.generated_at)
  const expiresAt = new Date(generatedAt.getTime() + INTEL_CACHE_DAYS * 24 * 60 * 60 * 1000)
  if (new Date() > expiresAt) return null

  return data as unknown as InvestorIntel
}

/**
 * Fetches cached intel for multiple investor listings (batch).
 * Used by the table view to populate Intel Preview column efficiently.
 */
export async function getInvestorIntelBatch(
  listingIds: string[]
): Promise<Record<string, InvestorIntel>> {
  if (listingIds.length === 0) return {}

  // SECURITY: Validate all IDs and cap array length (H-1: prevent unbounded IN queries)
  const safeIds = listingIds.filter(id => UUID_RE.test(id)).slice(0, MAX_BATCH_SIZE)
  if (safeIds.length === 0) return {}

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('investor_news_intel')
    .select('*')
    .in('listing_id', safeIds)

  if (error || !data) return {}

  const cutoff = new Date(Date.now() - INTEL_CACHE_DAYS * 24 * 60 * 60 * 1000)
  const result: Record<string, InvestorIntel> = {}

  for (const row of data) {
    if (new Date(row.generated_at) > cutoff) {
      result[row.listing_id] = row as unknown as InvestorIntel
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Generate Action
// ---------------------------------------------------------------------------

/**
 * Generates fresh intelligence for an investor firm using Anthropic web search.
 * Upserts the result into investor_news_intel (replacing any previous intel).
 *
 * @returns The generated intel, or null if generation failed.
 */
export async function generateInvestorIntel(
  listingId: string,
  forceRefresh = false
): Promise<InvestorIntel | null> {
  if (!UUID_RE.test(listingId)) return null

  // SECURITY C-1: Require authenticated user
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.error('[generateInvestorIntel] Unauthenticated request')
    return null
  }

  // SECURITY C-2: Check cache first — don't regenerate if valid intel exists
  // Unless forceRefresh is true (user clicked the refresh button)
  if (!forceRefresh) {
    const existingIntel = await getInvestorIntel(listingId)
    if (existingIntel) return existingIntel
  }

  // SECURITY C-2: Rate limit — check how many generations this user has done recently
  const admin = createAdminClient()
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recentCount } = await admin
    .from('investor_news_intel')
    .select('id', { count: 'exact', head: true })
    .eq('generated_by_user_id', user.id)
    .gte('generated_at', oneHourAgo)

  if ((recentCount ?? 0) >= MAX_GENERATIONS_PER_HOUR) {
    console.warn('[generateInvestorIntel] Rate limit exceeded for user:', user.id)
    return null
  }

  const apiKey = getAnthropicKey()
  if (!apiKey) {
    console.error('[generateInvestorIntel] No Anthropic API key')
    return null
  }

  // Fetch the investor firm data for context
  const { data: listing, error: listingError } = await supabase
    .from('marketplace_listings')
    .select('title, description, attributes')
    .eq('id', listingId)
    .eq('category', 'Finance')
    .single()

  if (listingError || !listing) {
    console.error('[generateInvestorIntel] Listing not found:', listingError)
    return null
  }

  const attrs = (listing.attributes as Record<string, unknown>) ?? {}
  const firmName = listing.title
  const firmType = (attrs.firm_type as string) ?? 'investor'
  const website = (attrs.website_url as string) ?? ''
  const sectors = (attrs.sectors as string[]) ?? []
  const location = (attrs.hq_city as string) ?? (attrs.location as string) ?? ''

  // Build the web search prompt
  const searchPrompt = buildIntelPrompt(firmName, firmType, website, sectors, location)

  try {
    const client = new Anthropic({ apiKey })

    // DECISION: Use web_search tool to get current data about the firm.
    // Non-streaming because we need to parse the structured response.
    // GOTCHA: Use non-beta messages.create with a structured prompt instead
    // of beta.messages.create — the beta web_search tool types are unstable
    // and cause TS errors. The non-beta API + explicit web research prompt
    // achieves the same result without type gymnastics.
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: `You are an investor intelligence analyst. Research the specified investment firm and provide a structured intelligence briefing based on your knowledge and any publicly available information. Focus on: recent fund activity, portfolio news, team changes, social media presence, and market signals. Be factual. If you're not confident about recent information, say so honestly rather than fabricating. Include source URLs where possible.`,
      messages: [{ role: 'user', content: searchPrompt }],
    })

    // Extract text content from response
    let textContent = ''
    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text
      }
    }

    if (!textContent) {
      console.error('[generateInvestorIntel] No text content in response')
      return null
    }

    // Extract inline URLs from the text as sources (non-beta API doesn't return structured sources)
    const sources = extractUrlsFromText(textContent)

    // Parse the structured response
    const intel = parseIntelResponse(textContent, sources)

    // Upsert into database via admin client (RLS blocks authenticated INSERT)
    // M-3: Include user attribution for cost tracking and audit trail
    const { data: upserted, error: upsertError } = await admin
      .from('investor_news_intel')
      .upsert({
        listing_id: listingId,
        intel_summary: intel.summary.slice(0, 5000),
        key_signals: intel.signals.slice(0, 20),
        sources: deduplicateSources(sources),
        social_activity: intel.socialActivity?.slice(0, 2000) ?? null,
        current_focus: intel.currentFocus?.slice(0, 2000) ?? null,
        recent_deals: intel.recentDeals?.slice(0, 2000) ?? null,
        generated_at: new Date().toISOString(),
        generated_by: 'anthropic-sonnet',
        generated_by_user_id: user.id,
      }, { onConflict: 'listing_id' })
      .select()
      .single()

    if (upsertError) {
      console.error('[generateInvestorIntel] Upsert error:', upsertError)
      return null
    }

    return upserted as InvestorIntel
  } catch (err) {
    console.error('[generateInvestorIntel] API error:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildIntelPrompt(
  firmName: string,
  firmType: string,
  website: string,
  sectors: string[],
  location: string
): string {
  const parts = [
    `Research the ${firmType} firm "${firmName}"`,
  ]
  if (website) parts.push(`(website: ${website})`)
  if (location) parts.push(`based in ${location}`)
  if (sectors.length > 0) parts.push(`focused on ${sectors.slice(0, 5).join(', ')}`)

  return `${parts.join(' ')}.

Please search for and provide:

1. **SUMMARY**: A 2-3 sentence overview of the firm's current status and recent activity.

2. **KEY SIGNALS** (up to 5): Recent notable events, each tagged as [POSITIVE], [NEGATIVE], or [NEUTRAL]:
   - New fund launches or closes
   - Notable investments or exits
   - Team hires or departures
   - Strategic shifts or market comments
   - Awards or rankings

3. **SOCIAL ACTIVITY**: Summary of their recent social media presence (LinkedIn posts, Twitter/X activity, blog posts). If no social media presence found, note that.

4. **CURRENT FOCUS**: What sectors, stages, or themes they appear to be currently focused on (based on recent activity, not just their stated thesis).

5. **RECENT DEALS**: Any investments, exits, or fund activity in the last 6 months.

Format each section with the header in capitals. Be concise and factual.`
}

interface ParsedIntel {
  summary: string
  signals: Array<{
    signal: string
    sentiment: 'positive' | 'negative' | 'neutral'
  }>
  socialActivity: string | null
  currentFocus: string | null
  recentDeals: string | null
}

function parseIntelResponse(text: string, _sources: Array<{ title: string; url: string; snippet: string }>): ParsedIntel {
  // Extract sections from the response
  const sections: Record<string, string> = {}
  const sectionRegex = /(?:^|\n)(?:\d+\.\s*)?(?:\*\*)?([A-Z][A-Z\s]+?)(?:\*\*)?(?:\s*:|\n)/g
  let lastKey = ''
  let lastEnd = 0

  const matches = [...text.matchAll(sectionRegex)]
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    if (lastKey && match.index != null) {
      sections[lastKey] = text.slice(lastEnd, match.index).trim()
    }
    lastKey = match[1].trim().toLowerCase()
    lastEnd = (match.index ?? 0) + match[0].length
  }
  if (lastKey) {
    sections[lastKey] = text.slice(lastEnd).trim()
  }

  // Parse signals
  const signalText = sections['key signals'] ?? ''
  const signals: ParsedIntel['signals'] = []
  const signalLines = signalText.split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('•'))
  for (const line of signalLines.slice(0, 5)) {
    const cleaned = line.replace(/^[\s\-•]+/, '').trim()
    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral'
    if (/\[POSITIVE\]/i.test(cleaned)) sentiment = 'positive'
    else if (/\[NEGATIVE\]/i.test(cleaned)) sentiment = 'negative'
    const signal = cleaned.replace(/\[(POSITIVE|NEGATIVE|NEUTRAL)\]/gi, '').trim()
    if (signal) signals.push({ signal, sentiment })
  }

  return {
    summary: sections['summary'] ?? text.slice(0, 500),
    signals,
    socialActivity: sections['social activity'] ?? null,
    currentFocus: sections['current focus'] ?? null,
    recentDeals: sections['recent deals'] ?? null,
  }
}

function deduplicateSources(
  sources: Array<{ title: string; url: string; snippet: string }>
): Array<{ title: string; url: string; snippet: string }> {
  const seen = new Set<string>()
  return sources.filter(s => {
    if (seen.has(s.url)) return false
    seen.add(s.url)
    return true
  }).slice(0, 10)
}

/**
 * Extracts HTTP(S) URLs from AI-generated text as sources.
 * SECURITY: Only extracts http/https URLs (no javascript: etc.)
 */
function extractUrlsFromText(text: string): Array<{ title: string; url: string; snippet: string }> {
  const urlRegex = /https?:\/\/[^\s\])>"',]+/gi
  const matches = text.match(urlRegex) ?? []
  return matches.slice(0, 10).map(url => ({
    title: '',
    // Clean trailing punctuation that might have been captured
    url: url.replace(/[.,;:!?)]+$/, ''),
    snippet: '',
  }))
}
