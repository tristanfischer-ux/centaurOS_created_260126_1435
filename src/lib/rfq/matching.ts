/**
 * Smart RFQ Matching System
 * Matches RFQs to the most suitable suppliers based on multiple factors
 */

import { SupabaseClient } from '@supabase/supabase-js'

/** Known manufacturing/process terms to extract from specs for matching */
const MANUFACTURING_TERMS = new Set([
  'cnc', 'machining', 'milling', 'turning', 'lathe', 'injection', 'moulding', 'molding',
  '3d print', 'additive', 'fdm', 'sla', 'sls', 'metal', 'plastic', 'assembly',
  'fabrication', 'welding', 'sheet metal', 'stamping', 'casting', 'forging',
  'finish', 'anodize', 'paint', 'coating', 'tolerance', 'manufacturing', 'prototype',
])

/**
 * Extract skill-like tokens from RFQ specifications for supplier matching.
 */
function extractSkillsFromSpecifications(specifications: unknown): string[] {
  const skills: Set<string> = new Set()
  if (!specifications || typeof specifications !== 'object') return []

  const spec = specifications as Record<string, unknown>

  // From description: split on non-alpha and keep known terms or words >= 3 chars
  const description = spec.description
  if (typeof description === 'string') {
    const words = description.toLowerCase().split(/\W+/).filter(Boolean)
    for (const w of words) {
      if (MANUFACTURING_TERMS.has(w) || (w.length >= 3 && w.length <= 30)) {
        skills.add(w)
      }
    }
  }

  // From materials array
  const materials = spec.materials
  if (Array.isArray(materials)) {
    materials.forEach((m) => {
      if (typeof m === 'string' && m.trim()) skills.add(m.trim().toLowerCase())
    })
  }

  // From custom_fields (Forge CAD Lab / Assembly Builder)
  const customFields = spec.custom_fields as Record<string, unknown> | undefined
  if (customFields && typeof customFields === 'object') {
    const designBrief = customFields.design_brief as Record<string, unknown> | undefined
    if (designBrief && typeof designBrief === 'object') {
      const targetProcess = designBrief.targetProcess
      if (typeof targetProcess === 'string' && targetProcess.trim()) {
        skills.add(targetProcess.trim().toLowerCase())
      }
      const targetMaterial = designBrief.targetMaterial
      if (typeof targetMaterial === 'string' && targetMaterial.trim()) {
        skills.add(targetMaterial.trim().toLowerCase())
      }
    }
    const modules = customFields.modules as Array<Record<string, unknown>> | undefined
    if (Array.isArray(modules)) {
      for (const mod of modules) {
        if (mod && typeof mod === 'object') {
          const process = mod.process
          if (typeof process === 'string' && process.trim()) skills.add(process.trim().toLowerCase())
          const material = mod.material
          if (typeof material === 'string' && material.trim()) skills.add(material.trim().toLowerCase())
          const finish = mod.finish
          if (typeof finish === 'string' && finish.trim()) skills.add(finish.trim().toLowerCase())
        }
      }
    }
  }

  return Array.from(skills)
}

export interface SupplierMatch {
  providerId: string
  providerName: string
  userId?: string
  headline?: string | null
  timezone?: string | null
  matchScore: number
  matchReasons: string[]
  tier: 'pending' | 'standard' | 'verified' | 'premium'
  isAvailable: boolean
}

interface MatchingCriteria {
  category?: string
  skillsRequired?: string[]
  budgetRange?: { min?: number; max?: number }
  urgency?: 'urgent' | 'standard'
}

/**
 * Calculate match score between RFQ and supplier
 */
export function calculateMatchScore(
  rfqCriteria: MatchingCriteria,
  supplier: {
    categories: string[]
    skills: string[]
    dayRate?: number
    averageRating?: number
    completionRate?: number
    responseTime?: number // in hours
    tier: string
  }
): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []

  // Category match (30% weight)
  if (rfqCriteria.category && supplier.categories.includes(rfqCriteria.category)) {
    score += 30
    reasons.push(`Matches category: ${rfqCriteria.category}`)
  }

  // Skills match (20% weight)
  if (rfqCriteria.skillsRequired && rfqCriteria.skillsRequired.length > 0) {
    const matchedSkills = rfqCriteria.skillsRequired.filter(skill =>
      supplier.skills.some(s => s.toLowerCase().includes(skill.toLowerCase()))
    )
    const skillMatchPercent = matchedSkills.length / rfqCriteria.skillsRequired.length
    score += skillMatchPercent * 20
    if (matchedSkills.length > 0) {
      reasons.push(`Skills match: ${matchedSkills.join(', ')}`)
    }
  }

  // Historical performance (20% weight)
  if (supplier.completionRate && supplier.completionRate > 0.8) {
    score += 20
    reasons.push(`High completion rate (${(supplier.completionRate * 100).toFixed(0)}%)`)
  } else if (supplier.completionRate) {
    score += supplier.completionRate * 20
  }

  // Availability (15% weight)
  if (supplier.dayRate && rfqCriteria.budgetRange) {
    const budgetMax = rfqCriteria.budgetRange.max || Infinity
    if (supplier.dayRate <= budgetMax) {
      score += 15
      reasons.push('Within budget')
    } else {
      const priceDiff = ((supplier.dayRate - budgetMax) / budgetMax) * 100
      if (priceDiff < 20) {
        score += 10
        reasons.push('Close to budget range')
      }
    }
  } else {
    // If no pricing info, give neutral score
    score += 7.5
  }

  // Response time (15% weight)
  if (rfqCriteria.urgency === 'urgent') {
    if (supplier.responseTime && supplier.responseTime < 2) {
      score += 15
      reasons.push('Fast response time')
    } else if (supplier.responseTime && supplier.responseTime < 6) {
      score += 10
      reasons.push('Good response time')
    } else {
      score += 5
    }
  } else {
    score += 10 // Neutral score for standard urgency
  }

  // Tier bonus (premium/verified get slight advantage)
  if (supplier.tier === 'premium') {
    score += 5
    reasons.push('Premium supplier')
  } else if (supplier.tier === 'verified') {
    score += 3
    reasons.push('Verified supplier')
  }

  return { score: Math.min(100, Math.round(score)), reasons }
}

/**
 * Find matched suppliers for an RFQ
 */
export async function matchSuppliersToRFQ(
  supabase: SupabaseClient,
  rfqId: string
): Promise<{ matches: SupplierMatch[]; error: string | null }> {
  try {
    // Get RFQ details
    const { data: rfq, error: rfqError } = await supabase
      .from('rfqs')
      .select('category, budget_min, budget_max, urgency, specifications')
      .eq('id', rfqId)
      .single()

    if (rfqError || !rfq) {
      return { matches: [], error: 'RFQ not found' }
    }

    // Get all active provider profiles
    const { data: allProviders, error: providersError } = await supabase
      .from('provider_profiles')
      .select(`
        id,
        user_id,
        tier,
        day_rate,
        currency,
        headline,
        timezone,
        is_active,
        current_order_count,
        max_concurrent_orders,
        profiles!provider_profiles_user_id_fkey (
          full_name
        )
      `)
      .eq('is_active', true)

    if (providersError || !allProviders) {
      return { matches: [], error: 'Failed to fetch providers' }
    }

    // Filter providers who have capacity for more orders
    const providers = allProviders.filter(p => 
      (p.current_order_count || 0) < (p.max_concurrent_orders || 999)
    )

    // Get marketplace listings for categories and skills
    const { data: listings } = await supabase
      .from('marketplace_listings')
      .select('provider_id, category, tags')
      .in('provider_id', providers.map(p => p.id))
      .eq('is_active', true)

    const listingsByProvider = new Map<string, typeof listings>()
    listings?.forEach(listing => {
      const existing = listingsByProvider.get(listing.provider_id) || []
      listingsByProvider.set(listing.provider_id, [...existing, listing])
    })

    // Calculate match scores for each provider
    const matches: SupplierMatch[] = providers
      .map(provider => {
        const providerListings = listingsByProvider.get(provider.id) || []
        const categories = [...new Set(providerListings.map(l => l.category).filter(Boolean))] as string[]
        const skills = [...new Set(providerListings.flatMap(l => l.tags || []))]

        const skillsRequired = extractSkillsFromSpecifications(rfq.specifications)

        const matchResult = calculateMatchScore(
          {
            category: rfq.category,
            skillsRequired: skillsRequired.length > 0 ? skillsRequired : undefined,
            budgetRange: { min: rfq.budget_min, max: rfq.budget_max },
            urgency: rfq.urgency as 'urgent' | 'standard',
          },
          {
            categories,
            skills,
            dayRate: provider.day_rate,
            tier: provider.tier,
            // These would come from historical data in a real implementation
            averageRating: undefined,
            completionRate: undefined,
            responseTime: undefined,
          }
        )

        const profile = Array.isArray(provider.profiles) ? provider.profiles[0] : provider.profiles
        const row = provider as { headline?: string | null; timezone?: string | null }

        return {
          providerId: provider.id,
          providerName: profile?.full_name || 'Unknown',
          userId: provider.user_id,
          headline: row.headline ?? null,
          timezone: row.timezone ?? null,
          matchScore: matchResult.score,
          matchReasons: matchResult.reasons,
          tier: provider.tier as SupplierMatch['tier'],
          isAvailable: provider.current_order_count < provider.max_concurrent_orders,
        }
      })
      .filter(match => match.matchScore >= 30) // Only include reasonable matches
      .sort((a, b) => b.matchScore - a.matchScore) // Sort by best match first

    return { matches, error: null }
  } catch (err) {
    console.error('Error matching suppliers:', err)
    return { matches: [], error: 'Failed to match suppliers' }
  }
}

/**
 * Get top matches for notification purposes
 */
export async function getTopMatches(
  supabase: SupabaseClient,
  rfqId: string,
  limit: number = 10
): Promise<SupplierMatch[]> {
  const { matches } = await matchSuppliersToRFQ(supabase, rfqId)
  return matches.slice(0, limit)
}
