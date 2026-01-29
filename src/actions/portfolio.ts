"use server"

/**
 * Portfolio actions module
 * Re-exports portfolio-related functions from trust-signals.ts
 * and adds any additional portfolio-specific functionality
 */

export {
    getPortfolioItems as getPortfolio,
    addPortfolioItem,
    updatePortfolioItem,
    deletePortfolioItem,
    reorderPortfolioItems as reorderPortfolio,
    type PortfolioItem,
} from './trust-signals'

import { updatePortfolioItem } from './trust-signals'

/**
 * Set an item as featured (convenience wrapper)
 */
export async function setFeaturedItem(id: string): Promise<{
    success: boolean
    error: string | null
}> {
    const result = await updatePortfolioItem(id, { is_featured: true })
    
    if (result.error) {
        return { success: false, error: result.error }
    }
    
    return { success: true, error: null }
}
