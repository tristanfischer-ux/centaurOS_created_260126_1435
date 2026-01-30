import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { MarketplaceListingDetail } from "./listing-detail"
import { MarketplaceListing } from "@/actions/marketplace"
import { getProviderTrustSignals } from "@/actions/trust-signals"
import { getProviderRatings } from "@/actions/ratings"

interface PageProps {
    params: Promise<{ id: string }>
}

export default async function MarketplaceListingPage({ params }: PageProps) {
    const { id } = await params
    const supabase = await createClient()

    // Fetch the listing
    const { data: listing, error } = await supabase
        .from('marketplace_listings')
        .select('*')
        .eq('id', id)
        .single()

    if (error || !listing) {
        notFound()
    }

    // Fetch trust signals and ratings if there's a provider_id
    let trustSignals = null
    let ratings = null
    
    if (listing.created_by_provider_id) {
        const [trustResult, ratingsResult] = await Promise.all([
            getProviderTrustSignals(listing.created_by_provider_id),
            getProviderRatings(listing.created_by_provider_id)
        ])
        
        // getProviderTrustSignals returns { portfolio, certifications, badges, error }
        if (!trustResult.error) {
            trustSignals = {
                portfolio: trustResult.portfolio,
                certifications: trustResult.certifications,
                badges: trustResult.badges
            }
        }
        ratings = ratingsResult
    }

    return (
        <MarketplaceListingDetail 
            listing={listing as MarketplaceListing}
            trustSignals={trustSignals}
            ratings={ratings}
        />
    )
}
