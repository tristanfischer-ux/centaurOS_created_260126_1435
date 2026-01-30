import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { MarketplaceListingDetail } from "./listing-detail"
import { MarketplaceListing } from "@/actions/marketplace"

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

    return <MarketplaceListingDetail listing={listing as MarketplaceListing} />
}
