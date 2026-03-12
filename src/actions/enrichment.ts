/**
 * @file enrichment.ts
 *
 * @description Server actions for the company intelligence enrichment pipeline.
 * Orchestrates website scraping, AI summarization, and storage of enriched
 * company data that powers contextually-aware specialist conversations.
 *
 * @security
 * - All actions require authentication
 * - Foundry membership verified before enrichment
 * - Only Founder/Executive roles can trigger enrichment
 *
 * @audit Enrichment events logged to console with foundry context
 *
 * @related
 * - src/lib/enrichment/website-scraper.ts -- website scraping
 * - src/lib/enrichment/website-summarizer.ts -- AI summarization
 * - src/types/foundry.ts -- CompanyIntelligence type
 * - src/lib/ai-context/builder.ts -- consumes enriched data
 */

'use server'

import { createClient } from '@/lib/supabase/server'
import { scrapeWebsite } from '@/lib/enrichment/website-scraper'
import { summarizeWebsiteContent } from '@/lib/enrichment/website-summarizer'
import { analyzeCompetitors } from '@/lib/enrichment/competitor-discovery'
import type { CompanyIntelligence, CompanyProfile } from '@/types/foundry'
import type { Json } from '@/types/database.types'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { checkAILimit } from '@/lib/ai/limit-check'
import { trackAIUsage } from '@/lib/ai/usage-tracking'
import { rateLimit } from '@/lib/security/rate-limit'

// ─── Types ──────────────────────────────────────────────────────────

/** Result from an enrichment action */
export type EnrichmentActionResult =
  | { success: true; data: { fieldsEnriched: string[]; totalChars: number } }
  | { success: false; error: string }

// ─── Website Enrichment ─────────────────────────────────────────────

/**
 * Enriches a foundry's company intelligence by scraping its website.
 *
 * @description Fetches the company website (homepage + key internal pages),
 * extracts text content, summarizes it with AI, and stores the structured
 * intelligence in foundries.company_intel. This data is then injected into
 * all specialist conversations via the AI Context Builder.
 *
 * @param foundryId - The foundry to enrich
 * @returns Success with enrichment stats, or failure with error
 *
 * @security Requires authenticated user with Founder/Executive role in the foundry
 * @audit Logs enrichment events with foundry context
 */
export async function enrichCompanyWebsite(foundryId: string): Promise<EnrichmentActionResult> {
  // AUTH: Verify authenticated user belongs to this foundry
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: 'Please sign in to enrich company intelligence' }
  }

  // AUTH: Verify user is Founder or Executive in this foundry
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, foundry_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.foundry_id !== foundryId) {
    return { success: false, error: 'You do not belong to this foundry' }
  }

  if (!['Founder', 'Executive'].includes(profile.role ?? '')) {
    return { success: false, error: 'Only Founders and Executives can trigger enrichment' }
  }

  // SECURITY: Check AI quota and rate limit before expensive AI calls
  const limitCheck = await checkAILimit(foundryId)
  if (!limitCheck.allowed) {
    return { success: false, error: limitCheck.message || 'AI usage limit reached' }
  }
  const rl = await rateLimit('aiEnrichment', foundryId)
  if (!rl.success) {
    return { success: false, error: rl.error || 'Too many enrichment requests. Please wait.' }
  }

  try {
    // 1. Fetch the company website URL
    const { data: foundry } = await supabase
      .from('foundries')
      .select('name, company_profile, company_intel')
      .eq('id', foundryId)
      .single()

    if (!foundry) {
      return { success: false, error: 'Foundry not found' }
    }

    const companyProfile = foundry.company_profile as CompanyProfile | null
    const websiteUrl = companyProfile?.website

    if (!websiteUrl) {
      return { success: false, error: 'No website URL configured. Add one in Settings > Company Profile.' }
    }

    const companyName = foundry.name ?? 'Unknown Company'

    console.info('[Enrichment] Starting website enrichment:', {
      foundryId,
      website: websiteUrl,
      companyName,
    })

    // 2. Scrape the website
    const scrapeResult = await scrapeWebsite(websiteUrl)

    if (scrapeResult.pages.length === 0) {
      const errorDetail = scrapeResult.errors.length > 0
        ? scrapeResult.errors.join('; ')
        : 'No accessible pages found'
      return { success: false, error: `Could not scrape website: ${errorDetail}` }
    }

    console.info('[Enrichment] Scrape complete:', {
      foundryId,
      pagesScraped: scrapeResult.pages.length,
      totalChars: scrapeResult.totalChars,
      errors: scrapeResult.errors.length,
    })

    // 3. Summarize with AI
    const aiSummary = await summarizeWebsiteContent(scrapeResult.pages, companyName)

    // Track AI usage (fire-and-forget)
    trackAIUsage({ foundryId, userId: user.id, feature: 'enrichment', model: 'MiniMax-M2.5' }).catch(() => {})

    // 4. Merge with existing company_intel (preserve competitor data, etc.)
    const existingIntel = foundry.company_intel as CompanyIntelligence | null
    const mergedIntel: CompanyIntelligence = {
      // Website-derived fields (overwrite with fresh data)
      website_summary: aiSummary.website_summary ?? null,
      products_services: aiSummary.products_services ?? null,
      target_customers: aiSummary.target_customers ?? null,
      value_proposition: aiSummary.value_proposition ?? null,
      team_bios: aiSummary.team_bios ?? null,
      pricing_model: aiSummary.pricing_model ?? null,

      // Preserve existing non-website fields
      competitors: existingIntel?.competitors ?? null,
      founder_background: existingIntel?.founder_background ?? null,

      // Metadata
      last_enriched_at: new Date().toISOString(),
      enrichment_source: 'website',
    }

    // 5. Store in foundries.company_intel
    const { error: updateError } = await supabase
      .from('foundries')
      .update({ company_intel: mergedIntel as unknown as Json })
      .eq('id', foundryId)

    if (updateError) {
      console.error('[Enrichment] Failed to store company_intel:', updateError.message)
      return { success: false, error: 'Failed to save enrichment data' }
    }

    // Count which fields were enriched
    const fieldsEnriched: string[] = []
    if (aiSummary.website_summary) fieldsEnriched.push('website_summary')
    if (aiSummary.products_services?.length) fieldsEnriched.push('products_services')
    if (aiSummary.target_customers) fieldsEnriched.push('target_customers')
    if (aiSummary.value_proposition) fieldsEnriched.push('value_proposition')
    if (aiSummary.team_bios?.length) fieldsEnriched.push('team_bios')
    if (aiSummary.pricing_model) fieldsEnriched.push('pricing_model')

    console.info('[Enrichment] Website enrichment complete:', {
      foundryId,
      fieldsEnriched,
      totalChars: scrapeResult.totalChars,
    })

    return {
      success: true,
      data: { fieldsEnriched, totalChars: scrapeResult.totalChars },
    }
  } catch (err) {
    const message = sanitizeErrorMessage(err)
    console.error('[Enrichment] Website enrichment failed:', { foundryId, error: message })
    return { success: false, error: `Enrichment failed: ${message}` }
  }
}

/**
 * Updates specific fields in the company_intel JSONB column.
 *
 * @description Allows manual updates to competitor data, founder background,
 * etc. without overwriting website-derived fields.
 *
 * @param foundryId - The foundry to update
 * @param updates - Partial CompanyIntelligence fields to merge
 * @returns Success or failure
 *
 * @security Requires authenticated Founder/Executive
 */
export async function updateCompanyIntel(
  foundryId: string,
  updates: Partial<CompanyIntelligence>,
): Promise<EnrichmentActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: 'Please sign in' }
  }

  // AUTH: Verify membership and role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, foundry_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.foundry_id !== foundryId || !['Founder', 'Executive'].includes(profile.role ?? '')) {
    return { success: false, error: 'Insufficient permissions' }
  }

  try {
    // Fetch existing intel
    const { data: foundry } = await supabase
      .from('foundries')
      .select('company_intel')
      .eq('id', foundryId)
      .single()

    const existingIntel = (foundry?.company_intel as CompanyIntelligence | null) ?? {
      website_summary: null,
      products_services: null,
      target_customers: null,
      value_proposition: null,
      team_bios: null,
      pricing_model: null,
      competitors: null,
      founder_background: null,
      last_enriched_at: null,
      enrichment_source: null,
    }

    // Merge updates
    const mergedIntel: CompanyIntelligence = {
      ...existingIntel,
      ...updates,
      last_enriched_at: new Date().toISOString(),
      enrichment_source: updates.enrichment_source ?? 'manual',
    }

    const { error: updateError } = await supabase
      .from('foundries')
      .update({ company_intel: mergedIntel as unknown as Json })
      .eq('id', foundryId)

    if (updateError) {
      return { success: false, error: 'Failed to update company intelligence' }
    }

    const fieldsEnriched = Object.keys(updates).filter(k => k !== 'enrichment_source' && k !== 'last_enriched_at')

    return {
      success: true,
      data: { fieldsEnriched, totalChars: 0 },
    }
  } catch (err) {
    const message = sanitizeErrorMessage(err)
    return { success: false, error: `Update failed: ${message}` }
  }
}

// ─── Competitor Enrichment ──────────────────────────────────────────

/**
 * Enriches competitor intelligence by scraping competitor websites and
 * analyzing them against the user's company.
 *
 * @description Takes the user-provided competitor list from company_profile,
 * scrapes their websites, uses AI to produce structured competitive analysis,
 * and stores the results in company_intel.competitors.
 *
 * @param foundryId - The foundry to enrich
 * @returns Success with analysis stats, or failure with error
 *
 * @security Requires authenticated Founder/Executive
 * @audit Logs competitor analysis events
 */
export async function enrichCompetitors(foundryId: string): Promise<EnrichmentActionResult> {
  // AUTH: Verify authenticated user belongs to this foundry
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: 'Please sign in' }
  }

  // AUTH: Verify role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, foundry_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.foundry_id !== foundryId || !['Founder', 'Executive'].includes(profile.role ?? '')) {
    return { success: false, error: 'Insufficient permissions' }
  }

  // SECURITY: Check AI quota and rate limit before expensive AI calls
  const limitCheck = await checkAILimit(foundryId)
  if (!limitCheck.allowed) {
    return { success: false, error: limitCheck.message || 'AI usage limit reached' }
  }
  const rl = await rateLimit('aiEnrichment', foundryId)
  if (!rl.success) {
    return { success: false, error: rl.error || 'Too many enrichment requests. Please wait.' }
  }

  try {
    // 1. Fetch company data
    const { data: foundry } = await supabase
      .from('foundries')
      .select('name, company_profile, company_intel, purpose_data')
      .eq('id', foundryId)
      .single()

    if (!foundry) {
      return { success: false, error: 'Foundry not found' }
    }

    const companyProfile = foundry.company_profile as CompanyProfile | null
    const competitorInputs = companyProfile?.competitors

    if (!competitorInputs || competitorInputs.length === 0) {
      return { success: false, error: 'No competitors listed. Add them in Settings > Company Profile.' }
    }

    // Build a brief company context for comparison
    const purposeData = foundry.purpose_data as { purpose?: string; mission?: string } | null
    const companyContext = [
      foundry.name ?? 'Our company',
      purposeData?.purpose ? `Purpose: ${purposeData.purpose}` : '',
      companyProfile?.website ? `Website: ${companyProfile.website}` : '',
    ].filter(Boolean).join('. ')

    console.info('[Enrichment] Starting competitor analysis:', {
      foundryId,
      competitorCount: competitorInputs.length,
    })

    // 2. Analyze competitors
    const competitorProfiles = await analyzeCompetitors(competitorInputs, companyContext)

    // Track AI usage (fire-and-forget)
    trackAIUsage({ foundryId, userId: user.id, feature: 'enrichment', model: 'MiniMax-M2.5' }).catch(() => {})

    // 3. Merge into existing company_intel
    const existingIntel = foundry.company_intel as CompanyIntelligence | null
    const mergedIntel: CompanyIntelligence = {
      // Preserve existing website-derived fields
      website_summary: existingIntel?.website_summary ?? null,
      products_services: existingIntel?.products_services ?? null,
      target_customers: existingIntel?.target_customers ?? null,
      value_proposition: existingIntel?.value_proposition ?? null,
      team_bios: existingIntel?.team_bios ?? null,
      pricing_model: existingIntel?.pricing_model ?? null,

      // Update competitor data
      competitors: competitorProfiles,

      // Preserve existing founder data
      founder_background: existingIntel?.founder_background ?? null,

      // Metadata
      last_enriched_at: new Date().toISOString(),
      enrichment_source: 'competitor_scan',
    }

    // 4. Store
    const { error: updateError } = await supabase
      .from('foundries')
      .update({ company_intel: mergedIntel as unknown as Json })
      .eq('id', foundryId)

    if (updateError) {
      return { success: false, error: 'Failed to save competitor data' }
    }

    console.info('[Enrichment] Competitor analysis complete:', {
      foundryId,
      competitorsAnalyzed: competitorProfiles.length,
    })

    return {
      success: true,
      data: {
        fieldsEnriched: [`competitors (${competitorProfiles.length})`],
        totalChars: JSON.stringify(competitorProfiles).length,
      },
    }
  } catch (err) {
    const message = sanitizeErrorMessage(err)
    console.error('[Enrichment] Competitor analysis failed:', { foundryId, error: message })
    return { success: false, error: `Analysis failed: ${message}` }
  }
}
