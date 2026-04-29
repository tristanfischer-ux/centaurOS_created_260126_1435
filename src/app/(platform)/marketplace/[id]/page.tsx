import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { notFound } from "next/navigation"
import { MarketplaceListingDetail } from "./listing-detail"
import { MarketplaceListing } from "@/actions/marketplace"
import { getProviderTrustSignals } from "@/actions/trust-signals"
import { getProviderRatings } from "@/actions/ratings"
import { getListingExecutives } from "@/actions/listing-executives"
import { getReviewsForListing } from "@/actions/marketplace-reviews"
import { geocodeAddress } from "@/lib/geocoding"
import { hasValue } from "@/lib/has-value"

interface PageProps {
    params: Promise<{ id: string }>
}

// Dynamic page <title> per supplier so browser tabs / bookmarks / SEO snippets
// reflect the actual supplier instead of the generic site tagline. Council
// flagged the static tagline as a P1 across multiple loops 2026-04-26.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params
    const supabase = await createClient()
    const { data } = await supabase
        .from('marketplace_listings')
        .select('title, description')
        .eq('id', id)
        .single()
    if (!data) return { title: 'Supplier not found' }
    const desc = (data.description ?? '').slice(0, 155)
    return {
        title: data.title,
        description: desc || `${data.title} on the Fractional Forge supplier directory.`,
    }
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

    // Geocoding — lazy. If the row already has lat/lng, skip the API call.
    // If not, attempt Nominatim and persist the result so the next render
    // is free. Fails silently on any error (map simply won't render).
    let listingWithGeo = listing as MarketplaceListing
    if (listingWithGeo.latitude == null || listingWithGeo.longitude == null) {
        // Build the geocoding query from the best available address data
        const geoQuery = [listing.address, listing.city, listing.country]
            .filter((v) => hasValue(v))
            .join(', ')

        if (geoQuery.trim().length > 0) {
            try {
                const geo = await geocodeAddress(geoQuery)
                if (geo) {
                    // Persist to the row so future renders skip the geocode
                    const admin = createAdminClient()
                    await admin
                        .from('marketplace_listings')
                        .update({ latitude: geo.lat, longitude: geo.lon })
                        .eq('id', id)

                    listingWithGeo = {
                        ...listingWithGeo,
                        latitude: geo.lat,
                        longitude: geo.lon,
                    } as MarketplaceListing
                }
            } catch {
                // Geocoding failure must never break the page
            }
        }
    }

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
            listing={listingWithGeo}
            trustSignals={trustSignals}
            ratings={ratings}
            executives={executives}
            reviews={reviewsResult.reviews}
            currentUserId={user?.id ?? null}
        />
    )
}
