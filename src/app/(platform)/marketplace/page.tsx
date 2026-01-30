import { getMarketplaceListings } from '@/actions/marketplace'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { MarketplaceView } from './marketplace-view'
import { CreateRFQDialog } from './create-rfq-dialog'
import { getMarketplaceOnboardingStatus } from '@/actions/onboarding'

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
    const { data: { user } } = await supabase.auth.getUser()

    // Fetch marketplace listings
    const marketplaceListings = await getMarketplaceListings()

    // Get user profile for role
    let userRole: 'Executive' | 'Apprentice' | 'Founder' | 'AI_Agent' = 'Apprentice'
    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()
        
        if (profile?.role) {
            userRole = profile.role as typeof userRole
        }
    }

    // Check if user needs marketplace onboarding
    const { needsOnboarding } = await getMarketplaceOnboardingStatus()

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

    // Get top 3 listings for onboarding recommendations
    const onboardingRecommendations = marketplaceListings.slice(0, 3)

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-blue-200">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="h-8 w-1 bg-orange-600 rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                        <h1 className="text-2xl sm:text-3xl sm:text-4xl font-display font-semibold text-foreground tracking-tight">
                            Marketplace
                        </h1>
                    </div>
                    <p className="text-muted-foreground text-sm font-medium pl-4">Discover people, products, services, and AI</p>
                </div>
                <div className="flex gap-2 flex-wrap shrink-0">
                    <CreateRFQDialog />
                </div>
            </div>

            <MarketplaceView
                initialListings={marketplaceListings}
                recommendations={recommendations}
                teamMembers={teamMembers}
                showOnboarding={needsOnboarding}
                userRole={userRole}
                onboardingRecommendations={onboardingRecommendations}
            />
        </div>
    )
}
