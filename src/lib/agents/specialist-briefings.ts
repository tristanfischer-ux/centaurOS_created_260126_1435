/**
 * @file specialist-briefings.ts
 *
 * @description Generates 3x-daily news briefings per specialist: fetches RSS feeds
 * by domain, synthesizes via MiniMax M2.5 into headline summary, domain impact,
 * and watch items; stores in specialist_briefings; optionally creates agent_insights
 * for visibility on the Today page.
 *
 * Invoked by /api/cron/specialist-briefings at 6am, 12pm, 5pm (UTC).
 *
 * @dependencies
 * - rss-parser for RSS fetching
 * - MiniMax M2.5 via OpenAI-compatible API
 * - specialist_briefings table, insert_agent_insight RPC
 *
 * @audit Briefings stored in specialist_briefings; insights in agent_insights
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import Parser from 'rss-parser'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOpenAIClient } from '@/lib/ai/openai-lazy'
import { estimateAICost } from '@/lib/ai/usage-tracking'
import { SPECIALISTS } from '@/app/(platform)/agents/specialists-data'
import { getFeedsForSpecialist } from './news-feeds'
import type { SpecialistId } from '@/app/(platform)/agents/specialists-data'
import type { Database } from '@/types/database.types'

const BRIEFING_MODEL = 'MiniMax-M2.5'
const BRIEFING_MAX_TOKENS = 1024
const RSS_FETCH_TIMEOUT_MS = 10_000
const BATCH_SIZE = 4

export type BriefingType = 'morning' | 'midday' | 'evening'

export interface SpecialistBriefingResult {
  specialistId: SpecialistId
  status: 'completed' | 'failed' | 'skipped'
  briefingId?: string
  tokensIn?: number
  tokensOut?: number
  estimatedCostUsd?: number
  error?: string
}

export interface GenerateBriefingsResult {
  briefingType: BriefingType
  results: SpecialistBriefingResult[]
  totalCostUsd: number
  durationMs: number
}

interface RawHeadline {
  title: string
  link: string
  source: string
  pubDate?: string
}

const parser = new Parser({ timeout: RSS_FETCH_TIMEOUT_MS })

/**
 * Fetch a single RSS feed and return items with title, link, pubDate.
 */
async function fetchFeed(url: string, label: string): Promise<RawHeadline[]> {
  try {
    const feed = await parser.parseURL(url)
    const items = (feed.items ?? []).slice(0, 20).map((item) => ({
      title: item.title?.trim() ?? '',
      link: item.link ?? '',
      source: label,
      pubDate: item.pubDate ?? item.isoDate ?? undefined,
    }))
    return items.filter((i) => i.title)
  } catch (err) {
    console.warn(`[SpecialistBriefings] Failed to fetch ${label} (${url}):`, err instanceof Error ? err.message : err)
    return []
  }
}

/**
 * Filter headlines to those within the time window for the briefing type.
 */
function filterByWindow(
  items: RawHeadline[],
  briefingType: BriefingType
): RawHeadline[] {
  const now = Date.now()
  let since: number
  if (briefingType === 'morning') {
    since = now - 12 * 60 * 60 * 1000
  } else if (briefingType === 'midday') {
    since = now - 6 * 60 * 60 * 1000
  } else {
    since = now - 24 * 60 * 60 * 1000
  }
  return items.filter((item) => {
    if (!item.pubDate) return true
    const t = new Date(item.pubDate).getTime()
    return t >= since
  })
}

/**
 * Fetch all feeds for a specialist, dedupe by URL, filter by time window.
 */
async function fetchHeadlinesForSpecialist(
  specialistId: SpecialistId,
  briefingType: BriefingType
): Promise<RawHeadline[]> {
  const feeds = getFeedsForSpecialist(specialistId)
  const results = await Promise.all(
    feeds.map((f) => fetchFeed(f.url, f.label))
  )
  const combined = results.flat()
  const byUrl = new Map<string, RawHeadline>()
  for (const h of combined) {
    if (h.link && !byUrl.has(h.link)) byUrl.set(h.link, h)
    else if (!h.link && h.title) byUrl.set(h.title, h)
  }
  const deduped = Array.from(byUrl.values())
  return filterByWindow(deduped, briefingType)
}

/**
 * Build the synthesis prompt and call MiniMax; return structured briefing.
 */
async function synthesizeBriefing(
  specialistId: SpecialistId,
  briefingType: BriefingType,
  headlines: RawHeadline[]
): Promise<{
  headline_summary: string
  domain_impact: string
  watch_items: string
  tokensIn: number
  tokensOut: number
}> {
  const specialist = SPECIALISTS.find((s) => s.id === specialistId)
  const name = specialist?.name ?? specialistId
  const title = specialist?.title ?? specialistId

  const headlinesText =
    headlines.length > 0
      ? headlines
          .slice(0, 30)
          .map((h) => `- [${h.source}] ${h.title}${h.link ? ` ${h.link}` : ''}`)
          .join('\n')
      : 'No new headlines in the time window.'

  const typeContext =
    briefingType === 'morning'
      ? "today's landscape and what to watch"
      : briefingType === 'midday'
        ? 'developing stories this afternoon'
        : 'day in review and tomorrow outlook'

  const systemPrompt = `You are ${name}, ${title}. You are producing a concise ${briefingType} news briefing for a startup founder.
Focus on: what matters for your domain, implications for early-stage companies, and 1-2 actionable watch items.
Respond with ONLY valid JSON matching this schema (no markdown, no extra text):
{"headline_summary":"3-5 bullet points of most relevant developments","domain_impact":"2-4 sentences on how this affects your area","watch_items":"1-2 things to monitor"}`

  const userPrompt = `Here are headlines relevant to your domain:\n${headlinesText}\n\nProduce a concise ${typeContext} briefing. Output only the JSON object.`

  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY not configured')
  }

  const OpenAI = await getOpenAIClient()
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.minimax.io/v1',
  })

  const completion = await client.chat.completions.create({
    model: BRIEFING_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: BRIEFING_MAX_TOKENS,
    temperature: 0.3,
  })

  const responseText = completion.choices[0]?.message?.content ?? ''
  const tokensIn = completion.usage?.prompt_tokens ?? 0
  const tokensOut = completion.usage?.completion_tokens ?? 0

  let parsed: { headline_summary?: string; domain_impact?: string; watch_items?: string }
  try {
    const jsonStr = responseText.replace(/```(?:json)?\s*\n?/g, '').trim()
    parsed = JSON.parse(jsonStr) as {
      headline_summary?: string
      domain_impact?: string
      watch_items?: string
    }
  } catch {
    parsed = {}
  }

  return {
    headline_summary: parsed.headline_summary?.slice(0, 2000) ?? 'No summary generated.',
    domain_impact: parsed.domain_impact?.slice(0, 1500) ?? 'No domain impact.',
    watch_items: parsed.watch_items?.slice(0, 500) ?? 'None.',
    tokensIn,
    tokensOut,
  }
}

/**
 * Create one agent_insight per active foundry for this briefing (report, informational, 24h expiry).
 */
async function createBriefingInsights(
  foundryIds: string[],
  specialistId: SpecialistId,
  specialistName: string,
  briefingType: BriefingType,
  headlineSummary: string
): Promise<void> {
  const supabase = createAdminClient()
  const typeLabel =
    briefingType === 'morning' ? 'Morning' : briefingType === 'midday' ? 'Midday' : 'Evening'
  const title = `${specialistName}'s ${typeLabel} Brief`
  const body = headlineSummary.slice(0, 500)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  for (const foundryId of foundryIds) {
    try {
      await supabase.rpc('insert_agent_insight', {
        p_foundry_id: foundryId,
        p_specialist_id: specialistId,
        p_insight_type: 'report',
        p_urgency: 'informational',
        p_title: title.slice(0, 200),
        p_body: body,
        p_domain_data: {},
        p_suggested_actions: [],
        p_expires_at: expiresAt,
      })
    } catch (err) {
      console.warn(`[SpecialistBriefings] Failed to create insight for foundry ${foundryId}:`, err)
    }
  }
}

/**
 * Fetch the latest global briefing for a specialist and return a formatted string
 * for injection into AI context. Used by context builder and sweep orchestrator.
 *
 * @param client - Supabase client (server or admin)
 * @param specialistId - Specialist to fetch briefing for
 * @returns Formatted briefing block or null if none found
 */
export async function getLatestBriefingFormatted(
  client: SupabaseClient<Database>,
  specialistId: string
): Promise<string | null> {
  const { data: row, error } = await client
    .from('specialist_briefings')
    .select('headline_summary, domain_impact, watch_items, created_at')
    .eq('specialist_id', specialistId)
    .is('foundry_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !row) return null
  const createdAt = row.created_at ? new Date(row.created_at).toISOString() : 'unknown'
  return [
    `--- Current Events Briefing (as of ${createdAt}) ---`,
    row.headline_summary,
    '',
    'Domain Impact: ' + row.domain_impact,
    'Watch Items: ' + row.watch_items,
    '--- End Current Events ---',
  ].join('\n')
}

// ─── Activity Helpers (cost optimisation — Fix 8) ────────────────────────────

/**
 * Returns the set of foundry IDs that have had specialist activity within the
 * given number of days. Used to skip insight creation for dormant foundries.
 */
async function getActiveFoundryIds(supabase: ReturnType<typeof createAdminClient>, daysBack: number): Promise<string[]> {
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('agent_memory_threads')
    .select('foundry_id')
    .gt('last_interaction_at', cutoff)
  return [...new Set((data ?? []).map((t) => t.foundry_id).filter(Boolean))] as string[]
}

/**
 * Returns true if the specialist has at least one memory thread updated in the
 * given number of days — used to decide whether to skip non-morning briefings.
 */
async function hasRecentSpecialistActivity(
  supabase: ReturnType<typeof createAdminClient>,
  specialistId: string,
  daysBack: number,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('agent_memory_threads')
    .select('id', { count: 'exact', head: true })
    .eq('context_type', 'specialist')
    .eq('context_id', specialistId)
    .gt('last_interaction_at', cutoff)
  return (count ?? 0) > 0
}

// Minimum headline count to justify an LLM synthesis call
const MIN_RELEVANT_HEADLINES = 3

/**
 * Generate briefings for all specialists for the given briefing type.
 * Stores global rows (foundry_id NULL) and creates one agent_insight per foundry per specialist.
 *
 * Cost optimisations (Fix 8):
 * - Active foundries only: agent_insights skipped for foundries with no activity in 7 days
 * - Minimum headlines: skip synthesis entirely if <3 relevant headlines found
 * - Frequency reduction: skip midday/evening runs for specialists with 0 conversations in 30 days
 */
export async function generateSpecialistBriefings(
  briefingType: BriefingType
): Promise<GenerateBriefingsResult> {
  const startTime = Date.now()
  const supabase = createAdminClient()
  const specialistIds = SPECIALISTS.map((s) => s.id as SpecialistId)
  const results: SpecialistBriefingResult[] = []
  let totalCostUsd = 0

  // Active foundry IDs (activity in last 7 days) — insights only sent to these
  const activeFoundryIds = await getActiveFoundryIds(supabase, 7)
  console.info(`[SpecialistBriefings] Active foundries: ${activeFoundryIds.length} (last 7 days)`)

  for (let i = 0; i < specialistIds.length; i += BATCH_SIZE) {
    const batch = specialistIds.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async (specialistId): Promise<SpecialistBriefingResult> => {
        const specialist = SPECIALISTS.find((s) => s.id === specialistId)
        try {
          // Frequency reduction: skip non-morning runs for low-activity specialists
          if (briefingType !== 'morning') {
            const active = await hasRecentSpecialistActivity(supabase, specialistId, 30)
            if (!active) {
              console.info(`[SpecialistBriefings] Skipping ${briefingType} for inactive specialist: ${specialistId}`)
              return { specialistId, status: 'skipped', error: 'No activity in 30 days — morning-only mode' }
            }
          }

          const headlines = await fetchHeadlinesForSpecialist(specialistId, briefingType)

          // Minimum headline threshold: skip synthesis if too few relevant headlines
          if (headlines.length < MIN_RELEVANT_HEADLINES) {
            console.info(`[SpecialistBriefings] Skipping ${specialistId}: only ${headlines.length} headlines (min ${MIN_RELEVANT_HEADLINES})`)
            return { specialistId, status: 'skipped', error: `Only ${headlines.length} headlines found` }
          }

          const synthesized = await synthesizeBriefing(specialistId, briefingType, headlines)
          const costUsd = estimateAICost(
            BRIEFING_MODEL,
            synthesized.tokensIn,
            synthesized.tokensOut
          )
          totalCostUsd += costUsd

          const { data: row, error: insertError } = await supabase
            .from('specialist_briefings')
            .insert({
              foundry_id: null,
              specialist_id: specialistId,
              briefing_type: briefingType,
              headline_summary: synthesized.headline_summary,
              domain_impact: synthesized.domain_impact,
              watch_items: synthesized.watch_items,
              raw_headlines: headlines.slice(0, 50).map((h) => ({
                title: h.title,
                link: h.link,
                source: h.source,
              })),
              tokens_in: synthesized.tokensIn,
              tokens_out: synthesized.tokensOut,
              estimated_cost_usd: costUsd,
            })
            .select('id')
            .single()

          if (insertError) {
            console.error(`[SpecialistBriefings] Insert failed for ${specialistId}:`, insertError.message)
            return {
              specialistId,
              status: 'failed',
              error: insertError.message,
            }
          }

          // Only create insights for active foundries (activity in last 7 days)
          await createBriefingInsights(
            activeFoundryIds,
            specialistId,
            specialist?.name ?? specialistId,
            briefingType,
            synthesized.headline_summary
          )

          return {
            specialistId,
            status: 'completed',
            briefingId: (row as { id: string })?.id,
            tokensIn: synthesized.tokensIn,
            tokensOut: synthesized.tokensOut,
            estimatedCostUsd: costUsd,
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          console.error(`[SpecialistBriefings] Failed for ${specialistId}:`, message)
          return { specialistId, status: 'failed', error: message }
        }
      })
    )
    results.push(...batchResults)
  }

  return {
    briefingType,
    results,
    totalCostUsd,
    durationMs: Date.now() - startTime,
  }
}
