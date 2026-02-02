import { getMarketplaceListings } from '@/actions/marketplace'

// Force dynamic since we're fetching data that might change
export const dynamic = 'force-dynamic'

export default async function MarketplacePage() {
    // Simplified version to test what's breaking
    let listingsCount = 0
    let errorMessage: string | null = null

    try {
        const listings = await getMarketplaceListings()
        listingsCount = listings.length
    } catch (err) {
        errorMessage = String(err)
    }

    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold mb-4">Marketplace Debug</h1>
            <p>Listings count: {listingsCount}</p>
            {errorMessage && <p className="text-red-600">Error: {errorMessage}</p>}
            <p className="mt-4 text-muted-foreground">
                If you see this, the basic page renders. The issue is in one of the removed components.
            </p>
        </div>
    )
}
