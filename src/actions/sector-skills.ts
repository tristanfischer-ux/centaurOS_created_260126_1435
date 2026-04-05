'use server'

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import type { SectorSkill, RFQTemplate } from '@/types/review-gates'

// ============================================================================
// SECTOR SKILLS
// ============================================================================

/**
 * Get all skills for a given sector
 */
export async function getSectorSkills(
  sector: string
): Promise<{ data: SectorSkill[]; error: string | null }> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('sector_skills')
      .select('*')
      .eq('sector', sector)
      .order('skill_category')
      .order('skill_name')

    if (error) {
      console.error('Error fetching sector skills:', error)
      return { data: [], error: sanitizeErrorMessage(error) }
    }

    return { data: (data || []) as SectorSkill[], error: null }
  } catch (err) {
    console.error('Failed to fetch sector skills:', err)
    return { data: [], error: 'Failed to fetch sector skills' }
  }
}

/**
 * Get all sectors and their skill counts
 */
export async function getSectorSkillCounts(): Promise<{
  data: { sector: string; count: number; expert_count: number }[]
  error: string | null
}> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('sector_skills')
      .select('sector, is_expert_level')

    if (error) {
      console.error('Error fetching sector skill counts:', error)
      return { data: [], error: sanitizeErrorMessage(error) }
    }

    // Group by sector
    const sectorMap = new Map<string, { count: number; expert_count: number }>()
    for (const skill of data || []) {
      const existing = sectorMap.get(skill.sector) || { count: 0, expert_count: 0 }
      existing.count++
      if (skill.is_expert_level) existing.expert_count++
      sectorMap.set(skill.sector, existing)
    }

    return {
      data: Array.from(sectorMap.entries()).map(([sector, counts]) => ({
        sector,
        ...counts,
      })),
      error: null,
    }
  } catch (err) {
    console.error('Failed to fetch sector skill counts:', err)
    return { data: [], error: 'Failed to fetch sector skill counts' }
  }
}

/**
 * Find team members with skills matching a given sector
 */
export async function getExpertsForSector(
  sector: string
): Promise<{
  data: { id: string; full_name: string | null; role: string; skills: string[]; matching_skills: string[] }[]
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Not authenticated' }

    // Get sector skills
    const { data: sectorSkills, error: skillsError } = await supabase
      .from('sector_skills')
      .select('skill_name')
      .eq('sector', sector)

    if (skillsError) {
      console.error('Error fetching sector skills:', skillsError)
      return { data: [], error: sanitizeErrorMessage(skillsError) }
    }

    const skillNames = (sectorSkills || []).map((s) => s.skill_name)
    if (skillNames.length === 0) return { data: [], error: null }

    // SECURITY: Scope to foundry (RLS disabled on profiles)
    const foundryId = await getFoundryIdCached()

    // Get team members with their skills
    let profilesQuery = supabase
      .from('profiles')
      .select('id, full_name, role, skills')
      .not('skills', 'is', null)
    // SECURITY: foundry_id filter is MANDATORY
    if (!foundryId) return { data: [], error: 'No foundry context' }
    profilesQuery = profilesQuery.eq('foundry_id', foundryId)
    const { data: profiles, error: profilesError } = await profilesQuery

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError)
      return { data: [], error: sanitizeErrorMessage(profilesError) }
    }

    // Match profiles to sector skills
    const matches = (profiles || [])
      .map((profile) => {
        const profileSkills = (profile.skills as string[]) || []
        const matching = profileSkills.filter((s) =>
          skillNames.some((sn) => s.toLowerCase().includes(sn.toLowerCase()))
        )
        return {
          id: profile.id,
          full_name: profile.full_name,
          role: profile.role || 'Apprentice',
          skills: profileSkills,
          matching_skills: matching,
        }
      })
      .filter((m) => m.matching_skills.length > 0)
      .sort((a, b) => b.matching_skills.length - a.matching_skills.length)

    return { data: matches, error: null }
  } catch (err) {
    console.error('Failed to find experts for sector:', err)
    return { data: [], error: 'Failed to find sector experts' }
  }
}

// ============================================================================
// RFQ TEMPLATES
// ============================================================================

/**
 * Get RFQ templates, optionally filtered by sector
 */
export async function getRFQTemplates(
  sector?: string
): Promise<{ data: RFQTemplate[]; error: string | null }> {
  try {
    const supabase = await createClient()

    let query = supabase
      .from('rfq_templates')
      .select('*')
      .order('display_order')

    if (sector) {
      // Get templates for the sector + cross-sector (null sector) templates
      query = query.or(`sector.eq.${sector},sector.is.null`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching RFQ templates:', error)
      return { data: [], error: sanitizeErrorMessage(error) }
    }

    return { data: (data || []) as RFQTemplate[], error: null }
  } catch (err) {
    console.error('Failed to fetch RFQ templates:', err)
    return { data: [], error: 'Failed to fetch RFQ templates' }
  }
}

/**
 * Get manufacturing-specific RFQ templates
 */
export async function getManufacturingRFQTemplates(): Promise<{
  data: RFQTemplate[]
  error: string | null
}> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('rfq_templates')
      .select('*')
      .eq('is_manufacturing', true)
      .order('display_order')

    if (error) {
      console.error('Error fetching manufacturing RFQ templates:', error)
      return { data: [], error: sanitizeErrorMessage(error) }
    }

    return { data: (data || []) as RFQTemplate[], error: null }
  } catch (err) {
    console.error('Failed to fetch manufacturing RFQ templates:', err)
    return { data: [], error: 'Failed to fetch manufacturing RFQ templates' }
  }
}
