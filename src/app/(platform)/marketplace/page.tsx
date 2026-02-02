import { getMarketplaceListings } from '@/actions/marketplace'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { MarketplaceView } from './marketplace-view'

// Force dynamic since we're fetching data that might change
export const dynamic = 'force-dynamic'

export interface MarketplaceRecommendation {
    id: string
    source_type: 'advisory' | 'coverage_gap' | 'ai_suggestion' | 'manual'
    category: 'People' | 'Products' | 'Services' | 'AI'
    subcategory: string | null
    search_term: string | null
    reasoning: string | null
    priority: number
    created_at: string
}

export default async function MarketplacePage() {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()

    // Fetch marketplace listings
    const marketplaceListings = await getMarketplaceListings()

    // Fetch AI recommendations for this foundry
    let recommendations: MarketplaceRecommendation[] = []
    
    if (foundryId) {
        const { data: recs } = await supabase
            .rpc('get_marketplace_recommendations', { 
                p_foundry_id: foundryId,
                p_limit: 5 
            })
        
        if (recs) {
            recommendations = recs as MarketplaceRecommendation[]
        }
    }

    // Also fetch team members for Centaur Matcher
    let teamMembers: { id: string; full_name: string | null; role: string }[] = []
    
    if (foundryId) {
        const { data: members } = await supabase
            .from('profiles')
            .select('id, full_name, role')
            .eq('foundry_id', foundryId)
            .neq('role', 'AI_Agent')
            .order('full_name')
        
        if (members) {
            teamMembers = members
        }
    }

    return (
        <MarketplaceView
            initialListings={marketplaceListings}
            recommendations={recommendations}
            teamMembers={teamMembers}
        />
    )
}
