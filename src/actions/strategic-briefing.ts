'use server'

/**
 * @file strategic-briefing.ts
 *
 * @description Server action that generates a strategic briefing slide deck
 * using the Claude Opus API. Collects optional company data from Supabase and
 * combines it with user-provided source context to produce a full presentation.
 *
 * FLOW: User provides source text → action enriches with company data →
 * Claude generates slide structure → returns StrategicBriefing
 *
 * @related
 * - src/lib/reports/ai-slide-generator.ts — Core generation logic
 * - src/lib/reports/slide-deck-types.ts — Type definitions
 * - src/app/(platform)/reports/page.tsx — UI that calls this action
 */

import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { withAIGate } from '@/lib/ai/with-ai-gate'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateStrategicBriefing } from '@/lib/reports/ai-slide-generator'

import type {
  GenerateBriefingRequest,
  GenerateBriefingResponse,
} from '@/lib/reports/slide-deck-types'

// ─── Public Types ────────────────────────────────────────────────

interface GenerateBriefingActionRequest {
  sourceContext: string
  tone: 'internal' | 'board' | 'investor'
  includeCompanyData?: boolean
}

// ─── Main Action ─────────────────────────────────────────────────

/**
 * Generate a strategic briefing slide deck.
 *
 * @description Authenticates the user, optionally enriches source context
 * with company data from Supabase, then calls the Claude-powered slide
 * generator to produce a full presentation.
 *
 * @param request - Source context, tone, and whether to include company data
 * @returns The generated StrategicBriefing or an error
 */
export async function generateBriefingAction(
  request: GenerateBriefingActionRequest,
): Promise<GenerateBriefingResponse> {
  return withAIGate('strategic_briefing', async ({ supabase, user, foundryId }) => {
  try {
    console.info('[StrategicBriefing] Starting generation for user:', user.id)

    const { data: foundry } = await supabase
      .from('foundries')
      .select('name')
      .eq('id', foundryId)
      .single()

    const companyName = foundry?.name ?? 'My Company'
    console.info('[StrategicBriefing] Company:', companyName, '| Tone:', request.tone)

    // SECURITY: Cap source context length to prevent excessive API token consumption
    if (request.sourceContext.length > 50_000) {
      return { success: false, error: 'Source context too large (max 50,000 characters)' }
    }

    let enrichedContext = request.sourceContext

    if (request.includeCompanyData) {
      console.info('[StrategicBriefing] Gathering company context...')
      const companyData = await gatherCompanyContext(supabase, foundryId)
      if (companyData) {
        enrichedContext = `${request.sourceContext}\n\n## Company Data (from ForgeOS)\n\n${companyData}`
        console.info('[StrategicBriefing] Company context added:', companyData.length, 'chars')
      }
    }

    console.info('[StrategicBriefing] Calling Claude (source length:', enrichedContext.length, 'chars)')
    const genStart = Date.now()

    const generationRequest: GenerateBriefingRequest = {
      sourceContext: enrichedContext,
      tone: request.tone,
      companyName,
      includeCompanyData: request.includeCompanyData,
    }

    const result = await generateStrategicBriefing(generationRequest)
    console.info('[StrategicBriefing] Claude returned in', Date.now() - genStart, 'ms | success:', result.success, '| slides:', result.briefing?.slides?.length ?? 0)

    if (result.success && result.briefing) {
      result.briefing.foundryId = foundryId
    }

    return result
  } catch (error) {
    const message = sanitizeErrorMessage(error)
    console.error('[StrategicBriefing] Action failed:', { message })
    return {
      success: false,
      error: message,
    }
  }
  })
}

// ─── Company Data Enrichment ─────────────────────────────────────

// INTENT: Pull key company data points from Supabase so Claude can
// reference real metrics, objectives, and team information in the
// presentation. This bridges ForgeOS data with the narrative generator.
async function gatherCompanyContext(
  supabase: SupabaseClient,
  foundryId: string,
): Promise<string | null> {
  try {
    const sections: string[] = []

    // Active objectives
    const { data: objectives } = await supabase
      .from('objectives')
      .select('title, progress, status')
      .eq('foundry_id', foundryId)
      .is('deleted_at', null)
      .in('status', ['In Progress', 'Not Started'])
      .limit(10)

    if (objectives && objectives.length > 0) {
      const objLines = objectives.map(
        o => `- ${o.title} (${Math.round(o.progress ?? 0)}% complete, ${o.status})`
      )
      sections.push(`### Active Objectives\n${objLines.join('\n')}`)
    }

    // Team members
    const { data: profiles } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('active_foundry_id', foundryId)
      .limit(20)

    if (profiles && profiles.length > 0) {
      const memberLines = profiles
        .filter(p => p.full_name)
        .map(p => `- ${p.full_name} (${p.role ?? 'Member'})`)
      if (memberLines.length > 0) {
        sections.push(`### Team\n${memberLines.join('\n')}`)
      }
    }

    // Recent task completion count
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { count: tasksCompleted } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .eq('status', 'Completed')
      .gte('updated_at', thirtyDaysAgo.toISOString())

    if (tasksCompleted !== null && tasksCompleted > 0) {
      sections.push(`### Recent Activity\n- ${tasksCompleted} tasks completed in the last 30 days`)
    }

    return sections.length > 0 ? sections.join('\n\n') : null
  } catch (error) {
    const message = sanitizeErrorMessage(error)
    console.warn('[StrategicBriefing] Failed to gather company context:', { message })
    return null
  }
}
