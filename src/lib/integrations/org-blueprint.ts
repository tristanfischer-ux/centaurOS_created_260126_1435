/**
 * Org Blueprint → Marketplace Integration
 * Connect capability gaps to marketplace listings and orders
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'
import { OrderType } from '@/types/orders'

type TypedSupabaseClient = SupabaseClient<Database>
type MarketplaceCategory = Database['public']['Enums']['marketplace_category']

export interface MarketplaceListing {
  id: string
  title: string
  category: MarketplaceCategory
  subcategory: string
  description: string | null
  imageUrl: string | null
  isVerified: boolean
  provider?: {
    id: string
    displayName: string
    tier: string
  }
  relevanceScore?: number
  matchReason?: string
}

export interface GapWithMatches {
  functionId: string
  functionName: string
  category: string
  description: string | null
  isCritical: boolean
  coverageStatus: 'gap' | 'partial'
  listings: MarketplaceListing[]
  matchCount: number
}

export interface GapFillResult {
  success: boolean
  orderId?: string
  error?: string
}

// Category mappings from business function categories to marketplace categories
const categoryMappings: Record<string, MarketplaceCategory[]> = {
  'Finance & Accounting': ['agencies', 'individual_freelancers'],
  'Legal & Compliance': ['agencies', 'individual_freelancers'],
  'Human Resources': ['agencies', 'individual_freelancers'],
  'Marketing & Sales': ['agencies', 'individual_freelancers'],
  'Operations': ['agencies', 'individual_freelancers', 'products_rfq'],
  'Technology': ['agencies', 'individual_freelancers', 'products_rfq'],
  'Customer Support': ['agencies', 'individual_freelancers'],
  'Product & Design': ['agencies', 'individual_freelancers'],
  'Administration': ['agencies', 'individual_freelancers'],
}

// Subcategory mappings for more precise matching
const subcategoryMappings: Record<string, string[]> = {
  // Finance
  'Bookkeeping': ['bookkeeping', 'accounting', 'financial services'],
  'Financial Reporting': ['accounting', 'financial services', 'cfo'],
  'Tax Planning': ['tax', 'accounting', 'financial services'],
  'Payroll': ['payroll', 'hr services', 'accounting'],
  // Legal
  'Contract Review': ['legal', 'legal counsel', 'contracts'],
  'IP Protection': ['legal', 'ip', 'intellectual property'],
  'Compliance': ['compliance', 'regulatory', 'legal'],
  // HR
  'Recruitment': ['recruitment', 'hr services', 'talent acquisition'],
  'Benefits Admin': ['hr services', 'benefits', 'payroll'],
  // Marketing
  'Brand Strategy': ['branding', 'marketing', 'creative'],
  'Content Creation': ['content', 'copywriting', 'marketing'],
  'Digital Marketing': ['digital marketing', 'ppc', 'seo', 'marketing'],
  'Social Media': ['social media', 'marketing', 'content'],
  // Tech
  'Software Development': ['development', 'software', 'engineering'],
  'IT Support': ['it support', 'tech support', 'infrastructure'],
  'Cybersecurity': ['security', 'cybersecurity', 'infosec'],
  'Data Analytics': ['analytics', 'data', 'business intelligence'],
}

/**
 * Get marketplace listings recommended for a business function gap
 */
export async function getMarketplaceRecommendations(
  supabase: TypedSupabaseClient,
  functionId: string,
  limit: number = 10
): Promise<{ listings: MarketplaceListing[]; error: string | null }> {
  try {
    // Get the business function details
    const { data: fn, error: fnError } = await supabase
      .from('business_functions')
      .select('id, name, category, description, typical_roles')
      .eq('id', functionId)
      .single()

    if (fnError || !fn) {
      return { listings: [], error: 'Business function not found' }
    }

    // Determine which marketplace categories to search
    const relevantCategories = categoryMappings[fn.category] || ['agencies', 'individual_freelancers']

    // Get relevant subcategories based on function name
    const functionKeywords = fn.name.toLowerCase().split(/\s+/)
    const matchingSubcategoryKeywords: string[] = []

    for (const [key, keywords] of Object.entries(subcategoryMappings)) {
      if (functionKeywords.some(word => key.toLowerCase().includes(word))) {
        matchingSubcategoryKeywords.push(...keywords)
      }
    }

    // Search for listings
    const { data: listings, error: listingsError } = await supabase
      .from('marketplace_listings')
      .select(`
        id,
        title,
        category,
        subcategory,
        description,
        image_url,
        is_verified
      `)
      .in('category', relevantCategories)
      .limit(limit * 2)

    if (listingsError) {
      return { listings: [], error: listingsError.message }
    }

    // Score and sort listings by relevance
    const scoredListings: MarketplaceListing[] = (listings || []).map(listing => {
      let score = 0
      const reasons: string[] = []

      const listingTitle = listing.title.toLowerCase()
      const listingSubcategory = listing.subcategory.toLowerCase()
      const listingDesc = (listing.description || '').toLowerCase()

      // Check function name match
      for (const word of functionKeywords) {
        if (word.length > 3) {
          if (listingTitle.includes(word)) {
            score += 20
            reasons.push(`Title match: ${word}`)
          }
          if (listingSubcategory.includes(word)) {
            score += 30
            reasons.push(`Subcategory match: ${word}`)
          }
          if (listingDesc.includes(word)) {
            score += 10
          }
        }
      }

      // Check subcategory keyword match
      for (const kw of matchingSubcategoryKeywords) {
        if (listingSubcategory.includes(kw) || listingTitle.includes(kw)) {
          score += 25
          reasons.push(`Keyword match: ${kw}`)
        }
      }

      // Boost verified listings
      if (listing.is_verified) {
        score += 10
        reasons.push('Verified provider')
      }

      return {
        id: listing.id,
        title: listing.title,
        category: listing.category,
        subcategory: listing.subcategory,
        description: listing.description,
        imageUrl: listing.image_url,
        isVerified: listing.is_verified || false,
        relevanceScore: score,
        matchReason: reasons.slice(0, 3).join('; '),
      }
    })

    // Filter out low-score listings and sort
    const relevantListings = scoredListings
      .filter(l => (l.relevanceScore || 0) > 0)
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
      .slice(0, limit)

    // Fetch provider info for top listings
    const listingIds = relevantListings.map(l => l.id)
    if (listingIds.length > 0) {
      const { data: providers } = await supabase
        .from('provider_profiles')
        .select('id, listing_id, display_name, tier')
        .in('listing_id', listingIds)

      if (providers) {
        const providerMap = new Map(providers.map(p => [p.listing_id, p]))
        for (const listing of relevantListings) {
          const provider = providerMap.get(listing.id)
          if (provider) {
            listing.provider = {
              id: provider.id,
              displayName: provider.display_name,
              tier: provider.tier || 'standard',
            }
          }
        }
      }
    }

    return { listings: relevantListings, error: null }
  } catch (err) {
    console.error('Error in getMarketplaceRecommendations:', err)
    return { listings: [], error: 'Failed to get recommendations' }
  }
}

/**
 * Create an order from a coverage gap
 */
export async function createOrderFromGap(
  supabase: TypedSupabaseClient,
  gapId: string,
  listingId: string,
  buyerId: string,
  totalAmount: number,
  currency: string = 'GBP'
): Promise<GapFillResult> {
  try {
    // Verify the gap exists
    const { data: coverage, error: coverageError } = await supabase
      .from('foundry_function_coverage')
      .select('id, function_id, coverage_status')
      .eq('id', gapId)
      .single()

    if (coverageError || !coverage) {
      return { success: false, error: 'Coverage gap not found' }
    }

    if (coverage.coverage_status !== 'gap' && coverage.coverage_status !== 'partial') {
      return { success: false, error: 'Function is already covered' }
    }

    // Get listing details
    const { data: listing, error: listingError } = await supabase
      .from('marketplace_listings')
      .select('id, title, category')
      .eq('id', listingId)
      .single()

    if (listingError || !listing) {
      return { success: false, error: 'Listing not found' }
    }

    // Get the provider profile for this listing
    const { data: provider, error: providerError } = await supabase
      .from('provider_profiles')
      .select('id, user_id')
      .eq('listing_id', listingId)
      .single()

    if (providerError || !provider) {
      return { success: false, error: 'Provider not found for this listing' }
    }

    // Determine order type from listing category
    let orderType: OrderType = 'service'
    if (listing.category === 'products_rfq') {
      orderType = 'product_rfq'
    } else if (listing.category === 'individual_freelancers') {
      orderType = 'people_booking'
    }

    // Calculate fees
    const vatRate = 0.20
    const vatAmount = totalAmount * vatRate
    const platformFee = totalAmount * 0.05

    // Create the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        buyer_id: buyerId,
        seller_id: provider.id,
        listing_id: listingId,
        order_type: orderType,
        total_amount: totalAmount,
        currency,
        platform_fee: platformFee,
        vat_amount: vatAmount,
        vat_rate: vatRate,
        business_function_id: coverage.function_id,
        status: 'pending',
        escrow_status: 'pending',
      })
      .select('id')
      .single()

    if (orderError || !order) {
      console.error('Failed to create order:', orderError)
      return { success: false, error: 'Failed to create order' }
    }

    // Log the order event
    await supabase.from('order_history').insert({
      order_id: order.id,
      event_type: 'created',
      details: {
        source: 'org_blueprint_gap',
        gap_id: gapId,
        function_id: coverage.function_id,
      },
      actor_id: buyerId,
    })

    return { success: true, orderId: order.id }
  } catch (err) {
    console.error('Error in createOrderFromGap:', err)
    return { success: false, error: 'Failed to create order from gap' }
  }
}

/**
 * Update coverage status when an order is completed
 */
export async function updateCoverageOnOrderComplete(
  supabase: TypedSupabaseClient,
  orderId: string,
  userId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Get the order with business function reference
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, business_function_id, status, seller:provider_profiles(display_name)')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { success: false, error: 'Order not found' }
    }

    if (order.status !== 'completed') {
      return { success: false, error: 'Order is not completed' }
    }

    if (!order.business_function_id) {
      // No business function linked, nothing to update
      return { success: true, error: null }
    }

    const seller = order.seller as unknown as { display_name: string } | null
    const coveredBy = seller?.display_name || 'External Provider'

    // Get foundry_id from the order buyer
    const { data: buyerProfile, error: buyerError } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', userId)
      .single()

    if (buyerError || !buyerProfile?.foundry_id) {
      return { success: false, error: 'Could not determine foundry' }
    }

    // Update the coverage status
    const { error: updateError } = await supabase
      .from('foundry_function_coverage')
      .upsert({
        foundry_id: buyerProfile.foundry_id,
        function_id: order.business_function_id,
        coverage_status: 'covered',
        covered_by: coveredBy,
        notes: `Covered via marketplace order ${orderId}`,
        assessed_at: new Date().toISOString(),
        assessed_by: userId,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'foundry_id,function_id',
      })

    if (updateError) {
      console.error('Failed to update coverage:', updateError)
      return { success: false, error: 'Failed to update coverage status' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in updateCoverageOnOrderComplete:', err)
    return { success: false, error: 'Failed to update coverage' }
  }
}

/**
 * Get all gaps with marketplace matches for a foundry
 */
export async function getGapsWithMarketplaceMatches(
  supabase: TypedSupabaseClient,
  foundryId: string,
  limit: number = 5
): Promise<{ gaps: GapWithMatches[]; error: string | null }> {
  try {
    // Get all gaps and partial coverage for the foundry
    const { data: coverage, error: coverageError } = await supabase
      .from('foundry_function_coverage')
      .select(`
        id,
        function_id,
        coverage_status
      `)
      .eq('foundry_id', foundryId)
      .in('coverage_status', ['gap', 'partial'])

    if (coverageError) {
      return { gaps: [], error: coverageError.message }
    }

    if (!coverage || coverage.length === 0) {
      return { gaps: [], error: null }
    }

    // Get function details for all gaps
    const functionIds = coverage.map(c => c.function_id)
    const { data: functions, error: functionsError } = await supabase
      .from('business_functions')
      .select('id, name, category, description, is_critical')
      .in('id', functionIds)

    if (functionsError || !functions) {
      return { gaps: [], error: 'Failed to fetch function details' }
    }

    // Create function map
    const functionMap = new Map(functions.map(f => [f.id, f]))

    // Build gaps with matches
    const gapsWithMatches: GapWithMatches[] = []

    for (const cov of coverage) {
      const fn = functionMap.get(cov.function_id)
      if (!fn) continue

      // Get marketplace recommendations for this gap
      const { listings } = await getMarketplaceRecommendations(
        supabase,
        cov.function_id,
        limit
      )

      gapsWithMatches.push({
        functionId: fn.id,
        functionName: fn.name,
        category: fn.category,
        description: fn.description,
        isCritical: fn.is_critical,
        coverageStatus: cov.coverage_status as 'gap' | 'partial',
        listings,
        matchCount: listings.length,
      })
    }

    // Sort by critical first, then by match count
    gapsWithMatches.sort((a, b) => {
      if (a.isCritical !== b.isCritical) {
        return a.isCritical ? -1 : 1
      }
      return b.matchCount - a.matchCount
    })

    return { gaps: gapsWithMatches, error: null }
  } catch (err) {
    console.error('Error in getGapsWithMarketplaceMatches:', err)
    return { gaps: [], error: 'Failed to fetch gaps with matches' }
  }
}

/**
 * Build marketplace search URL for a gap
 */
export function buildMarketplaceSearchUrl(
  functionName: string,
  functionCategory: string
): string {
  const categories = categoryMappings[functionCategory] || ['agencies']
  const category = categories[0]
  
  // Build search query from function name
  const searchTerms = functionName
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 3)
    .slice(0, 3)
    .join(' ')

  const params = new URLSearchParams()
  params.set('category', category)
  if (searchTerms) {
    params.set('search', searchTerms)
  }

  return `/marketplace?${params.toString()}`
}
