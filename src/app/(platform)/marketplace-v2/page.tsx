import { redirect } from 'next/navigation'

/**
 * Marketplace V2 has been promoted to the main /marketplace route.
 * This redirect ensures old bookmarks continue to work.
 */
export default function MarketplaceV2Redirect() {
    redirect('/marketplace')
}
