/**
 * @file document-prefill.ts
 *
 * @description Server action to pre-populate the Document Writer textarea
 * with existing company data when a skill is selected. Formats JSONB columns
 * (company_intel, purpose_data, company_profile) into editable plain text.
 *
 * @related
 * - src/components/reports/SkillDocumentSection.tsx — Consumer
 * - src/types/foundry.ts — CompanyIntelligence, FoundryPurposeData, CompanyProfile
 */

'use server'

import { withAuth } from '@/lib/server-action-utils'
import type { CompanyIntelligence, FoundryPurposeData, CompanyProfile } from '@/types/foundry'

/**
 * Fetch a human-readable prefill for the Document Writer textarea.
 *
 * @param skillId - The document skill being selected
 * @returns Editable plain-text seed, or null if no data exists
 */
export async function getSkillPrefill(skillId: string): Promise<{ text: string | null }> {
  return withAuth(async ({ supabase, foundryId }) => {
    // INTENT: Extensible — add cases for other skill prefills later
    switch (skillId) {
      case 'doc-competitive-analysis':
        return { text: await buildCompetitiveAnalysisPrefill(supabase, foundryId) }
      default:
        return { text: null }
    }
  })
}

// ─── Internal ─────────────────────────────────────────────────────

type SupabaseClient = Parameters<Parameters<typeof withAuth>[0]>[0]['supabase']

async function buildCompetitiveAnalysisPrefill(
  supabase: SupabaseClient,
  foundryId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('foundries')
    .select('company_intel, purpose_data, company_profile')
    .eq('id', foundryId)
    .single()

  if (!data) return null

  const intel = data.company_intel as CompanyIntelligence | null
  const purpose = data.purpose_data as FoundryPurposeData | null
  const profile = data.company_profile as CompanyProfile | null

  const sections: string[] = []

  // Competitors
  // GOTCHA: JSONB arrays are cast via `as unknown as Json` — could be non-array or contain null fields
  if (Array.isArray(intel?.competitors) && intel.competitors.length > 0) {
    const lines = ['COMPETITORS:']
    for (const c of intel.competitors) {
      if (!c?.name) continue
      const parts = [c.name]
      if (c.website) parts[0] += ` (${c.website})`
      if (c.description) parts.push(`"${c.description}"`)
      if (c.differentiator) parts.push(`Differentiator: ${c.differentiator}`)
      lines.push(`- ${parts.join(' — ')}`)
    }
    if (lines.length > 1) sections.push(lines.join('\n'))
  }

  // Our positioning
  {
    const lines: string[] = []
    if (intel?.value_proposition) lines.push(`- Value proposition: ${intel.value_proposition}`)
    if (Array.isArray(intel?.products_services) && intel.products_services.length > 0) {
      const names = intel.products_services.map(p => p?.name).filter(Boolean)
      if (names.length > 0) lines.push(`- Products: ${names.join(', ')}`)
    }
    if (intel?.target_customers) lines.push(`- Target customers: ${intel.target_customers}`)
    if (profile?.business_model) lines.push(`- Business model: ${profile.business_model}`)
    if (lines.length > 0) {
      sections.push(['OUR POSITIONING:', ...lines].join('\n'))
    }
  }

  // Strategic context
  {
    const lines: string[] = []
    if (purpose?.purpose) lines.push(`- Purpose: ${purpose.purpose}`)
    if (purpose?.mission) lines.push(`- Mission: ${purpose.mission}`)
    if (purpose?.vision) lines.push(`- Vision: ${purpose.vision}`)
    if (intel?.website_summary) lines.push(`- Company overview: ${intel.website_summary}`)
    if (lines.length > 0) {
      sections.push(['STRATEGIC CONTEXT:', ...lines].join('\n'))
    }
  }

  if (sections.length === 0) return null

  // INTENT: Trailing section invites the user to add their own context
  // GOTCHA: Use empty line after header — placeholder text in brackets would be sent to the AI verbatim
  sections.push('ADDITIONAL CONTEXT:\n')

  return sections.join('\n\n')
}
