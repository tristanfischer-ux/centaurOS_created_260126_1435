import { getMarketplaceListings } from '@/actions/marketplace'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { MarketplaceView } from './marketplace-view'
import { CreateRFQSheet } from './create-rfq-sheet'
import { getMarketplaceOnboardingStatus } from '@/actions/onboarding'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Presentation, Sparkles } from 'lucide-react'

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
    // Initialize with safe defaults
    let marketplaceListings: Awaited<ReturnType<typeof getMarketplaceListings>> = []
    let userRole: 'Executive' | 'Apprentice' | 'Founder' | 'AI_Agent' = 'Apprentice'
    let needsOnboarding = false
    let recommendations: MarketplaceRecommendation[] = []
    let teamMembers: { id: string; full_name: string | null; role: string }[] = []

    // Each query is wrapped in try-catch to prevent any single failure from breaking the page
    const supabase = await createClient()
    
    // Get foundry context
    let foundryId: string | null = null
    try {
        foundryId = await getFoundryIdCached()
    } catch (err) {
        console.error('[Marketplace] Failed to get foundry ID:', err)
    }

    // Get current user
    let user: { id: string } | null = null
    try {
        const { data } = await supabase.auth.getUser()
        user = data?.user ?? null
    } catch (err) {
        console.error('[Marketplace] Failed to get user:', err)
    }

    // Fetch marketplace listings (critical - this is what users come for)
    try {
        marketplaceListings = await getMarketplaceListings()
        console.log('[Marketplace] Loaded', marketplaceListings.length, 'listings')
    } catch (err) {
        console.error('[Marketplace] Failed to fetch listings:', err)
        // Don't throw - show empty marketplace rather than error page
    }

    // Get user profile for role (non-critical)
    if (user) {
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single()
            
            if (profile?.role) {
                userRole = profile.role as typeof userRole
            }
        } catch (err) {
            console.error('[Marketplace] Failed to get user role:', err)
        }
    }

    // Check if user needs marketplace onboarding (non-critical)
    try {
        const result = await getMarketplaceOnboardingStatus()
        needsOnboarding = result.needsOnboarding ?? false
    } catch (err) {
        console.error('[Marketplace] Failed to check onboarding status:', err)
    }

    // Fetch AI recommendations for this foundry (non-critical)
    if (foundryId) {
        try {
            const { data: recs, error } = await supabase
                .rpc('get_marketplace_recommendations', { 
                    p_foundry_id: foundryId,
                    p_limit: 5 
                })
            
            if (error) {
                console.error('[Marketplace] Recommendations RPC error:', error)
            } else if (recs) {
                recommendations = recs as MarketplaceRecommendation[]
            }
        } catch (err) {
            console.error('[Marketplace] Failed to fetch recommendations:', err)
        }
    }

    // Fetch team members for Centaur Matcher (non-critical)
    if (foundryId) {
        try {
            const { data: members, error } = await supabase
                .from('profiles')
                .select('id, full_name, role')
                .eq('foundry_id', foundryId)
                .neq('role', 'AI_Agent')
                .order('full_name')
            
            if (error) {
                console.error('[Marketplace] Team members query error:', error)
            } else if (members) {
                teamMembers = members
            }
        } catch (err) {
            console.error('[Marketplace] Failed to fetch team members:', err)
        }
    }

    // Get top 3 listings for onboarding recommendations
    const onboardingRecommendations = marketplaceListings.slice(0, 3)

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100">
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
                    <CreateRFQSheet />
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

            {/* Pitch Prep - Coming Soon */}
            <section className="pt-4">
                <Link 
                    href="/pitch-prep"
                    className="block border border-dashed border-muted rounded-lg p-4 hover:border-muted-foreground hover:bg-muted/50 transition-all group"
                >
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-background transition-colors">
                            <Presentation className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">Pitch Prep</span>
                                <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground">
                                    <Sparkles className="h-3 w-3 mr-1" />
                                    Coming Soon
                                </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Get investor-ready with professional pitch preparation services
                            </p>
                        </div>
                    </div>
                </Link>
            </section>
        </div>
    )
}
