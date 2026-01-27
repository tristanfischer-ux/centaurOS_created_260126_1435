import { getMarketplaceListings } from '@/actions/marketplace'
import { createClient } from '@/lib/supabase/server'
import { MarketplaceView } from './marketplace-view'

// Force dynamic since we're fetching data that might change
export const dynamic = 'force-dynamic'

export default async function MarketplacePage() {
    const supabase = await createClient()

    // Fetch new marketplace listings
    const marketplaceListings = await getMarketplaceListings()

    return (
        <MarketplaceView
            initialListings={marketplaceListings}
        />
    )
}
