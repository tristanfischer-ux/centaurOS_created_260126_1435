import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { IntelligenceContent } from './intelligence-content'
import type { CompanyProfile, CompanyIntelligence, FoundryPurposeData } from '@/types/foundry'

/**
 * Company Intelligence Settings Page
 *
 * @description Shows founders what their AI specialists know about their company,
 * with controls to trigger enrichment, manage competitors, and preview the
 * exact context injected into conversations.
 *
 * @security Only accessible to Founder/Executive roles (guarded in layout + page)
 */
export default async function IntelligencePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // AUTH: Verify role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, foundry_id, full_name, headline, bio, expertise_areas, skills, years_experience, linkedin_url, professional_background')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.foundry_id || !['Founder', 'Executive'].includes(profile.role ?? '')) {
    redirect('/settings')
  }

  // Fetch foundry data
  const { data: foundry } = await supabase
    .from('foundries')
    .select('id, name, company_profile, purpose_data, company_intel, sector, industry, stage')
    .eq('id', profile.foundry_id)
    .single()

  if (!foundry) {
    redirect('/settings')
  }

  // Fetch team member count
  const { count: teamCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .or(`foundry_id.eq.${foundry.id},active_foundry_id.eq.${foundry.id}`)
    .eq('is_active', true)

  return (
    <IntelligenceContent
      foundryId={foundry.id}
      foundryName={foundry.name ?? 'Your Company'}
      sector={foundry.sector}
      industry={foundry.industry}
      stage={foundry.stage}
      companyProfile={foundry.company_profile as CompanyProfile | null}
      purposeData={foundry.purpose_data as FoundryPurposeData | null}
      companyIntel={foundry.company_intel as CompanyIntelligence | null}
      founderProfile={{
        full_name: profile.full_name,
        headline: profile.headline,
        bio: profile.bio,
        expertise_areas: profile.expertise_areas,
        skills: profile.skills,
        years_experience: profile.years_experience,
        linkedin_url: profile.linkedin_url,
        professional_background: profile.professional_background as {
          summary?: string | null
          previous_companies?: string | null
          education?: string | null
        } | null,
      }}
      teamCount={teamCount ?? 0}
    />
  )
}
