/**
 * Smart RFQ Matching System
 * Matches RFQs to the most suitable suppliers based on multiple factors
 */

import { SupabaseClient } from '@supabase/supabase-js'

export interface SupplierMatch {
  providerId: string
  providerName: string
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

        const matchResult = calculateMatchScore(
          {
            category: rfq.category,
            budgetRange: { min: rfq.budget_min, max: rfq.budget_max },
            urgency: rfq.urgency as 'urgent' | 'standard',
            // Could extract skills from specifications JSON
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
        
        return {
          providerId: provider.id,
          providerName: profile?.full_name || 'Unknown',
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
