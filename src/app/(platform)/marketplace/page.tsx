import { getMarketplaceListings } from '@/actions/marketplace'
import { CreateRFQSheet } from './create-rfq-sheet'

// Force dynamic since we're fetching data that might change
export const dynamic = 'force-dynamic'

export default async function MarketplacePage() {
    // Step 1: Test CreateRFQSheet first
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
            <h1 className="text-2xl font-bold mb-4">Marketplace Debug - Testing CreateRFQSheet</h1>
            <p>Listings count: {listingsCount}</p>
            {errorMessage && <p className="text-destructive">Error: {errorMessage}</p>}
            
            <div className="mt-4 border p-4 rounded-lg">
                <p className="mb-2 text-muted-foreground">Testing CreateRFQSheet component:</p>
                <CreateRFQSheet />
            </div>
            
            <p className="mt-4 text-muted-foreground">
                If you see this with a working Create RFQ button, CreateRFQSheet is not the problem.
            </p>
        </div>
    )
}
