'use client'

import { useCallback, useState } from 'react'
import { TalentFinder } from '@/components/marketplace/talent-finder'
import { MarketplaceDetailDialog } from '../marketplace-v2/components/MarketplaceDetailDialog'
import type { MarketplaceListing } from '@/actions/marketplace'

/**
 * Client wrapper for TalentFinder on the Recruits page.
 *
 * @description Wraps the TalentFinder component with detail dialog state
 * management so users can view matched listings inline.
 */
export function TalentFinderWrapper() {
    const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null)

    const handleViewDetail = useCallback((listing: MarketplaceListing) => {
        setSelectedListing(listing)
    }, [])

    return (
        <>
            <TalentFinder onViewDetail={handleViewDetail} />
            <MarketplaceDetailDialog
                listing={selectedListing}
                onClose={() => setSelectedListing(null)}
            />
        </>
    )
}
