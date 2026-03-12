import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { MarketplaceListingDetail } from "./listing-detail"
import { MarketplaceListing } from "@/actions/marketplace"
import { getProviderTrustSignals } from "@/actions/trust-signals"
import { getProviderRatings } from "@/actions/ratings"
import { getListingExecutives } from "@/actions/listing-executives"
import { getReviewsForListing } from "@/actions/marketplace-reviews"

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

    // Get the current user (may be null for unauthenticated visitors)
    const { data: { user } } = await supabase.auth.getUser()

    // Fetch trust signals, ratings, executives, and reviews in parallel
    let trustSignals = null
    let ratings = null

    const [execResult, reviewsResult, ...providerResults] = await Promise.all([
        getListingExecutives(id),
        getReviewsForListing(id),
        ...(listing.created_by_provider_id
            ? [
                getProviderTrustSignals(listing.created_by_provider_id),
                getProviderRatings(listing.created_by_provider_id),
              ]
            : []),
    ])

    if (listing.created_by_provider_id && providerResults.length === 2) {
        const [trustResult, ratingsResult] = providerResults as [
            Awaited<ReturnType<typeof getProviderTrustSignals>>,
            Awaited<ReturnType<typeof getProviderRatings>>,
        ]
        if (!trustResult.error) {
            trustSignals = {
                portfolio: trustResult.portfolio,
                certifications: trustResult.certifications,
                badges: trustResult.badges,
            }
        }
        ratings = { summary: ratingsResult.data, reviews: [], error: ratingsResult.error }
    }

    const executives = execResult.data ?? []

    return (
        <MarketplaceListingDetail
            listing={listing as MarketplaceListing}
            trustSignals={trustSignals}
            ratings={ratings}
            executives={executives}
            reviews={reviewsResult.reviews}
            currentUserId={user?.id ?? null}
        />
    )
}
