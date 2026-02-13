/**
 * @file builder.ts
 * 
 * @description Unified AI Context Builder that assembles all available company
 * and behavioral context into a structured string for AI system prompts.
 * 
 * Collects:
 * 1. Company profile (foundries.company_profile)
 * 2. Purpose / mission / vision (foundries.purpose_data)
 * 3. Activity insights (aggregated from activity_events)
 * 4. Active objectives summary
 * 
 * The output is a formatted text block that can be injected into any AI prompt
 * to make responses more relevant to the user's specific company context.
 * 
 * @example
 * const context = await buildAIContext(foundryId, userId)
 * const systemPrompt = `You are an advisor. ${context}`
 */

import { createClient } from '@/lib/supabase/server'
import { getInsightsSummary } from '@/lib/activity-intelligence/insights'
import { ensureFreshProfile, formatProfileForAI } from '@/lib/intelligence/profile-builder'
import { formatRecentInsightsForPrompt } from '@/lib/intelligence/insight-logger'
import type { CompanyProfile } from '@/types/foundry'
import type { FoundryPurposeData } from '@/types/foundry'
import {
  EMPLOYEE_COUNT_LABELS,
  REVENUE_RANGE_LABELS,
  FUNDING_STATUS_LABELS,
  BUSINESS_MODEL_LABELS,
} from '@/types/foundry'

// Per-request cache to avoid re-fetching within the same server request
let cachedContext: { key: string; value: string; timestamp: number } | null = null
const CACHE_TTL_MS = 10_000 // 10 seconds

export interface AIContextOptions {
  /** Include activity insights (slightly slower — queries activity_events) */
  includeActivity?: boolean
  /** Include active objectives summary */
  includeObjectives?: boolean
  /** Include user intelligence profile (productivity patterns, blockers, etc.) */
  includeUserProfile?: boolean
  /** Include recent insight log for dedup (prevents repeating AI advice) */
  includeInsightHistory?: boolean
}

/**
 * Builds a comprehensive AI context string for the given foundry.
 * 
 * @param foundryId - Foundry to build context for
 * @param userId - Current user ID
 * @param options - What to include in the context
 * @returns Formatted context string, or empty string if no data available
 */
export async function buildAIContext(
  foundryId: string,
  userId: string,
  options: AIContextOptions = { includeActivity: true, includeObjectives: true, includeUserProfile: true, includeInsightHistory: true }
): Promise<string> {
  // Check per-request cache
  const cacheKey = `${foundryId}:${userId}:${JSON.stringify(options)}`
  if (cachedContext && cachedContext.key === cacheKey && Date.now() - cachedContext.timestamp < CACHE_TTL_MS) {
    return cachedContext.value
  }

  const supabase = await createClient()
  const sections: string[] = []

  try {
    // 1. Fetch foundry data (company_profile + purpose_data) via RPC
    const { data: foundryData } = await supabase.rpc('ensure_foundry_exists', {
      p_foundry_id: foundryId,
    })

    const foundry = foundryData as {
      name?: string
      company_profile?: CompanyProfile | null
      purpose_data?: FoundryPurposeData | null
    } | null

    // 2. Company Profile section
    const profile = foundry?.company_profile
    if (profile) {
      const details: string[] = []
      if (profile.employee_count) details.push(`Team size: ${EMPLOYEE_COUNT_LABELS[profile.employee_count]}`)
      if (profile.business_model) details.push(`Business model: ${BUSINESS_MODEL_LABELS[profile.business_model]}`)
      if (profile.revenue_range) details.push(`Revenue: ${REVENUE_RANGE_LABELS[profile.revenue_range]}`)
      if (profile.funding_status) details.push(`Funding: ${FUNDING_STATUS_LABELS[profile.funding_status]}`)
      if (profile.seeking_funding) details.push('Currently seeking funding')
      if (profile.location) details.push(`Location: ${profile.location}`)
      if (profile.founded_year) details.push(`Founded: ${profile.founded_year}`)

      if (details.length > 0) {
        sections.push(`Company profile:\n${details.join('\n')}`)
      }
    }

    // 3. Purpose / Mission / Vision
    const purpose = foundry?.purpose_data
    if (purpose) {
      const purposeParts: string[] = []
      if (purpose.purpose) purposeParts.push(`Purpose: ${purpose.purpose}`)
      if (purpose.mission) purposeParts.push(`Mission: ${purpose.mission}`)
      if (purpose.vision) purposeParts.push(`Vision: ${purpose.vision}`)

      if (purposeParts.length > 0) {
        sections.push(purposeParts.join('\n'))
      }
    }

    // 4. Activity insights (optional)
    if (options.includeActivity) {
      const activitySummary = await getInsightsSummary(foundryId)
      if (activitySummary) {
        sections.push(activitySummary)
      }
    }

    // 5. Active objectives (optional)
    if (options.includeObjectives) {
      const { data: objectives } = await supabase
        .from('objectives')
        .select('title, progress, status')
        .eq('foundry_id', foundryId)
        .eq('is_ghost', false)
        .is('deleted_at', null)
        .in('status', ['In Progress', 'Not Started'])
        .order('created_at', { ascending: false })
        .limit(10)

      if (objectives && objectives.length > 0) {
        const objectiveLines = objectives.map(
          (o) => `- ${o.title} (${o.progress ?? 0}% complete, ${o.status})`
        )
        sections.push(`Active objectives:\n${objectiveLines.join('\n')}`)
      }
    }

    // 6. User intelligence profile (patterns, productivity, blockers)
    if (options.includeUserProfile) {
      try {
        const profile = await ensureFreshProfile(userId, foundryId)
        if (profile) {
          const profileText = formatProfileForAI(profile)
          if (profileText) {
            sections.push(profileText.trim())
          }
        }
      } catch (err) {
        console.debug('[AIContextBuilder] Failed to load user profile:', err)
      }
    }

    // 7. Recent insight history (for deduplication)
    if (options.includeInsightHistory) {
      try {
        const insightHistory = await formatRecentInsightsForPrompt(userId, foundryId)
        if (insightHistory) {
          sections.push(insightHistory.trim())
        }
      } catch (err) {
        console.debug('[AIContextBuilder] Failed to load insight history:', err)
      }
    }
  } catch (err) {
    console.debug('[AIContextBuilder] Error building context:', err)
  }

  const result = sections.length > 0
    ? `\n--- Business Context ---\n${sections.join('\n\n')}\n--- End Business Context ---\n`
    : ''

  // Cache the result
  cachedContext = { key: cacheKey, value: result, timestamp: Date.now() }

  return result
}
