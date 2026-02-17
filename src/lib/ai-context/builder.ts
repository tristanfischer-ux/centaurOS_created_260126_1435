/**
 * @file builder.ts
 * 
 * @description Unified AI Context Builder that assembles all available company
 * and behavioral context into a structured string for AI system prompts.
 * 
 * Collects:
 * 1. Company identity (name, sector, website)
 * 2. Company profile (foundries.company_profile)
 * 3. Purpose / mission / vision + strategic questionnaire
 * 4. Founder professional profile (bio, skills, expertise)
 * 5. Team composition
 * 6. Activity insights (aggregated from activity_events)
 * 7. Active objectives summary
 * 8. Company intelligence (website analysis, competitors) when available
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
import { getLatestBriefingFormatted } from '@/lib/agents/specialist-briefings'
import type { CompanyProfile } from '@/types/foundry'
import type { FoundryPurposeData } from '@/types/foundry'
import {
  EMPLOYEE_COUNT_LABELS,
  REVENUE_RANGE_LABELS,
  FUNDING_STATUS_LABELS,
  BUSINESS_MODEL_LABELS,
  SECTOR_LABELS,
} from '@/types/foundry'
import type { Sector, CompanyIntelligence } from '@/types/foundry'

// ─── Context Cache ───────────────────────────────────────────────────
// Company context changes slowly (profile, objectives, team). We cache
// aggressively to avoid repeating 6+ DB queries on every specialist message.
//
// Strategy: stale-while-revalidate
// - FRESH (< CACHE_FRESH_MS): return cached, no refresh
// - STALE (< CACHE_STALE_MS): return cached immediately, refresh in background
// - EXPIRED (>= CACHE_STALE_MS): block and rebuild
//
// On Vercel serverless, module-level state persists across warm invocations
// within the same isolate, making this effective for back-to-back requests.
const CACHE_FRESH_MS = 60_000   // 60 seconds — serve without refresh
const CACHE_STALE_MS = 300_000  // 5 minutes — serve stale, refresh in background

interface CacheEntry {
    value: string
    timestamp: number
    refreshing?: boolean // Prevents concurrent background refreshes
}

const contextCache = new Map<string, CacheEntry>()

export interface AIContextOptions {
  /** Include activity insights (slightly slower — queries activity_events) */
  includeActivity?: boolean
  /** Include active objectives summary */
  includeObjectives?: boolean
  /** Include user intelligence profile (productivity patterns, blockers, etc.) */
  includeUserProfile?: boolean
  /** Include recent insight log for dedup (prevents repeating AI advice) */
  includeInsightHistory?: boolean
  /** Include latest news briefing for this specialist (requires specialistId) */
  includeBriefings?: boolean
  /** Specialist ID when building context for a specific specialist (enables includeBriefings) */
  specialistId?: string
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
  const cacheKey = `${foundryId}:${userId}:${JSON.stringify(options)}`
  const cached = contextCache.get(cacheKey)
  const now = Date.now()

  if (cached) {
    const age = now - cached.timestamp

    if (age < CACHE_FRESH_MS) {
      // Fresh: return immediately, no refresh needed
      return cached.value
    }

    if (age < CACHE_STALE_MS) {
      // Stale: return immediately, refresh in background (once)
      if (!cached.refreshing) {
        cached.refreshing = true
        buildAIContextUncached(foundryId, userId, options).then((freshValue) => {
          contextCache.set(cacheKey, { value: freshValue, timestamp: Date.now() })
        }).catch((err) => {
          console.warn('[AIContextBuilder] Background refresh failed:', err)
          cached.refreshing = false
        })
      }
      return cached.value
    }
    // Expired: fall through to rebuild
  }

  const result = await buildAIContextUncached(foundryId, userId, options)
  contextCache.set(cacheKey, { value: result, timestamp: Date.now() })
  return result
}

/**
 * Builds AI context without caching. Used by both the main function
 * (on cache miss) and the background stale-while-revalidate refresh.
 */
async function buildAIContextUncached(
  foundryId: string,
  userId: string,
  options: AIContextOptions,
): Promise<string> {
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

    // 1b. Fetch additional foundry columns not returned by the RPC
    const { data: foundryExtras } = await supabase
      .from('foundries')
      .select('sector, industry, stage, company_intel')
      .eq('id', foundryId)
      .single()

    // ── 2. Company Identity (name, sector, website) ──────────────────
    const companyName = foundry?.name
    const companyProfile = foundry?.company_profile
    const sectorKey = foundryExtras?.sector as Sector | null

    const identityParts: string[] = []
    if (companyName) {
      const sectorLabel = sectorKey ? SECTOR_LABELS[sectorKey] : null
      identityParts.push(sectorLabel ? `Company: ${companyName} (${sectorLabel})` : `Company: ${companyName}`)
    }
    if (foundryExtras?.industry) identityParts.push(`Industry: ${foundryExtras.industry}`)
    if (foundryExtras?.stage) identityParts.push(`Stage: ${foundryExtras.stage}`)
    if (companyProfile?.website) identityParts.push(`Website: ${companyProfile.website}`)

    if (identityParts.length > 0) {
      sections.push(identityParts.join('\n'))
    }

    // ── 3. Company Profile (size, model, revenue, funding) ───────────
    if (companyProfile) {
      const details: string[] = []
      if (companyProfile.employee_count) details.push(`Team size: ${EMPLOYEE_COUNT_LABELS[companyProfile.employee_count]}`)
      if (companyProfile.business_model) details.push(`Business model: ${BUSINESS_MODEL_LABELS[companyProfile.business_model]}`)
      if (companyProfile.revenue_range) details.push(`Revenue: ${REVENUE_RANGE_LABELS[companyProfile.revenue_range]}`)
      if (companyProfile.funding_status) details.push(`Funding: ${FUNDING_STATUS_LABELS[companyProfile.funding_status]}`)
      if (companyProfile.seeking_funding) details.push('Currently seeking funding')
      if (companyProfile.location) details.push(`Location: ${companyProfile.location}`)
      if (companyProfile.founded_year) details.push(`Founded: ${companyProfile.founded_year}`)

      if (details.length > 0) {
        sections.push(`Company profile:\n${details.join('\n')}`)
      }
    }

    // ── 4. Purpose / Mission / Vision + Strategic Questionnaire ──────
    const purpose = foundry?.purpose_data
    if (purpose) {
      const purposeParts: string[] = []
      if (purpose.purpose) purposeParts.push(`Purpose: ${purpose.purpose}`)
      if (purpose.mission) purposeParts.push(`Mission: ${purpose.mission}`)
      if (purpose.vision) purposeParts.push(`Vision: ${purpose.vision}`)

      if (purposeParts.length > 0) {
        sections.push(purposeParts.join('\n'))
      }

      // Inject the richer questionnaire responses — these give specialists
      // much deeper understanding than the synthesized one-liners above
      const q = purpose.questionnaire
      if (q) {
        const stratParts: string[] = []
        if (q.problemSolved) stratParts.push(`Problem we solve: ${q.problemSolved}`)
        if (q.whoServed) stratParts.push(`Who we serve: ${q.whoServed}`)
        if (q.uniqueValue) stratParts.push(`What makes us unique: ${q.uniqueValue}`)
        if (q.fiveYearVision) stratParts.push(`5-year vision: ${q.fiveYearVision}`)
        if (q.whyExists) stratParts.push(`Why we exist: ${q.whyExists}`)

        if (stratParts.length > 0) {
          sections.push(`Strategic context:\n${stratParts.join('\n')}`)
        }
      }
    }

    // ── 5. Founder / Current User Profile ────────────────────────────
    // Gives specialists the founder's professional identity, not just a first name
    try {
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('full_name, headline, bio, expertise_areas, skills, industries, years_experience, linkedin_url, role, professional_background')
        .eq('id', userId)
        .single()

      if (userProfile) {
        const founderParts: string[] = []
        if (userProfile.full_name) {
          const roleStr = userProfile.role ? ` (${userProfile.role})` : ''
          founderParts.push(`Name: ${userProfile.full_name}${roleStr}`)
        }
        if (userProfile.headline) founderParts.push(`Title: ${userProfile.headline}`)
        if (userProfile.bio) founderParts.push(`Bio: ${userProfile.bio}`)
        if (userProfile.years_experience) founderParts.push(`Experience: ${userProfile.years_experience} years`)
        if (userProfile.expertise_areas && userProfile.expertise_areas.length > 0) {
          founderParts.push(`Expertise: ${userProfile.expertise_areas.join(', ')}`)
        }
        if (userProfile.skills && userProfile.skills.length > 0) {
          founderParts.push(`Skills: ${userProfile.skills.join(', ')}`)
        }
        if (userProfile.industries && userProfile.industries.length > 0) {
          founderParts.push(`Industry background: ${userProfile.industries.join(', ')}`)
        }
        if (userProfile.linkedin_url) founderParts.push(`LinkedIn: ${userProfile.linkedin_url}`)

        // Professional background (structured data from profile wizard)
        const bg = userProfile.professional_background as {
          summary?: string | null
          previous_companies?: string | null
          education?: string | null
        } | null
        if (bg) {
          if (bg.summary) founderParts.push(`Career summary: ${bg.summary}`)
          if (bg.previous_companies) founderParts.push(`Previous companies: ${bg.previous_companies}`)
          if (bg.education) founderParts.push(`Education: ${bg.education}`)
        }

        if (founderParts.length > 0) {
          sections.push(`Founder profile:\n${founderParts.join('\n')}`)
        }
      }
    } catch (err) {
      console.debug('[AIContextBuilder] Failed to load founder profile:', err)
    }

    // ── 6. Team Composition ──────────────────────────────────────────
    // Lightweight team summary so specialists know who's on the team
    try {
      const { data: teamMembers } = await supabase
        .from('profiles')
        .select('full_name, role, headline')
        .or(`foundry_id.eq.${foundryId},active_foundry_id.eq.${foundryId}`)
        .neq('id', userId) // Exclude current user (already covered above)
        .eq('is_active', true)
        .limit(20)

      if (teamMembers && teamMembers.length > 0) {
        const memberLines = teamMembers.map(m => {
          const name = m.full_name ?? 'Unknown'
          const role = m.role ?? 'Member'
          const headline = m.headline ? ` — ${m.headline}` : ''
          return `- ${name} (${role})${headline}`
        })
        sections.push(`Team (${teamMembers.length} members):\n${memberLines.join('\n')}`)
      }
    } catch (err) {
      console.debug('[AIContextBuilder] Failed to load team members:', err)
    }

    // ── 7. Company Intelligence (website analysis, competitors) ──────
    // Enriched data from website scraping and competitor analysis
    const companyIntel = foundryExtras?.company_intel as CompanyIntelligence | null
    if (companyIntel) {
      const intelParts: string[] = []

      if (companyIntel.website_summary) {
        intelParts.push(`Website analysis: ${companyIntel.website_summary}`)
      }
      if (companyIntel.products_services && companyIntel.products_services.length > 0) {
        const productLines = companyIntel.products_services.map(p => `  - ${p.name}: ${p.description}`)
        intelParts.push(`Products/Services:\n${productLines.join('\n')}`)
      }
      if (companyIntel.target_customers) {
        intelParts.push(`Target customers: ${companyIntel.target_customers}`)
      }
      if (companyIntel.value_proposition) {
        intelParts.push(`Value proposition: ${companyIntel.value_proposition}`)
      }
      if (companyIntel.competitors && companyIntel.competitors.length > 0) {
        const compLines = companyIntel.competitors.map(c =>
          `  - ${c.name} (${c.website}): ${c.description}. Differentiator: ${c.differentiator}`
        )
        intelParts.push(`Competitive landscape:\n${compLines.join('\n')}`)
      }
      if (companyIntel.founder_background) {
        intelParts.push(`Founder background (enriched): ${companyIntel.founder_background}`)
      }

      if (intelParts.length > 0) {
        sections.push(`Company intelligence:\n${intelParts.join('\n')}`)
      }
    }

    // ── 8. Activity insights (optional) ────────────────────────────
    if (options.includeActivity) {
      const activitySummary = await getInsightsSummary(foundryId)
      if (activitySummary) {
        sections.push(activitySummary)
      }
    }

    // ── 9. Active objectives with hierarchy (optional) ────────────────
    // Fetches all active objectives with parent-child relationships so
    // specialists can recommend archiving specific items by exact title.
    // Includes is_strategic_goal so we can explicitly label strategic goals
    // and give the LLM an exact list of valid strategicGoalTitle values.
    if (options.includeObjectives) {
      const { data: objectives } = await supabase
        .from('objectives')
        .select('id, title, progress, status, parent_objective_id, is_strategic_goal')
        .eq('foundry_id', foundryId)
        .eq('is_ghost', false)
        .is('deleted_at', null)
        .in('status', ['In Progress', 'Not Started'])
        .order('created_at', { ascending: false })
        .limit(50)

      if (objectives && objectives.length > 0) {
        // Separate strategic goals from regular objectives for clear labeling
        const strategicGoals = objectives.filter((o) => o.is_strategic_goal)
        const regularObjectives = objectives.filter((o) => !o.is_strategic_goal)

        // List strategic goals explicitly so the LLM knows the exact valid titles
        if (strategicGoals.length > 0) {
          const goalLines = strategicGoals.map(
            (g) => `- "${g.title}" (${g.progress ?? 0}% complete, ${g.status})`
          )
          sections.push(
            `Strategic goals (use these EXACT titles as "strategicGoalTitle" when creating objectives):\n${goalLines.join('\n')}`
          )
        }

        // Build parent-child tree for regular objectives
        const topLevel = regularObjectives.filter((o) => !o.parent_objective_id)
        const children = regularObjectives.filter((o) => o.parent_objective_id)
        const childMap = new Map<string, typeof regularObjectives>()
        for (const child of children) {
          const parentId = child.parent_objective_id as string
          if (!childMap.has(parentId)) childMap.set(parentId, [])
          childMap.get(parentId)!.push(child)
        }

        const lines: string[] = []
        for (const parent of topLevel) {
          lines.push(`- ${parent.title} (${parent.progress ?? 0}% complete, ${parent.status})`)
          const kids = childMap.get(parent.id)
          if (kids) {
            for (const kid of kids) {
              lines.push(`  - ${kid.title} (${kid.progress ?? 0}% complete)`)
              // Check for grandchildren
              const grandkids = childMap.get(kid.id)
              if (grandkids) {
                for (const gk of grandkids) {
                  lines.push(`    - ${gk.title} (${gk.progress ?? 0}% complete)`)
                }
              }
            }
          }
        }

        // Also list orphaned children (parent not in result set)
        const topIds = new Set(topLevel.map((o) => o.id))
        const childIds = new Set(children.map((o) => o.id))
        const orphans = children.filter(
          (c) => !topIds.has(c.parent_objective_id as string) && !childIds.has(c.parent_objective_id as string)
        )
        for (const orphan of orphans) {
          lines.push(`- ${orphan.title} (${orphan.progress ?? 0}% complete, child of unknown parent)`)
        }

        if (lines.length > 0) {
          sections.push(`Active objectives (use exact titles for archive actions):\n${lines.join('\n')}`)
        }
      }
    }

    // ── 10. User intelligence profile (patterns, productivity) ───────
    if (options.includeUserProfile) {
      try {
        const intelligenceProfile = await ensureFreshProfile(userId, foundryId)
        if (intelligenceProfile) {
          const profileText = formatProfileForAI(intelligenceProfile)
          if (profileText) {
            sections.push(profileText.trim())
          }
        }
      } catch (err) {
        console.debug('[AIContextBuilder] Failed to load user intelligence profile:', err)
      }
    }

    // ── 11. Recent insight history (for deduplication) ───────────────
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

    // ── 12. Latest news briefing for specialist ──────────────────────
    if (options.includeBriefings && options.specialistId) {
      try {
        const briefing = await getLatestBriefingFormatted(supabase, options.specialistId)
        if (briefing) {
          sections.push(briefing)
        }
      } catch (err) {
        console.debug('[AIContextBuilder] Failed to load specialist briefing:', err)
      }
    }
  } catch (err) {
    console.debug('[AIContextBuilder] Error building context:', err)
  }

  return sections.length > 0
    ? `\n--- Business Context ---\n${sections.join('\n\n')}\n--- End Business Context ---\n`
    : ''
}
