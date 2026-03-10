"use server"

/**
 * Portfolio actions module
 * Additional portfolio-specific server actions beyond trust-signals.ts
 */

import { updatePortfolioItem } from './trust-signals'
import { createClient } from '@/lib/supabase/server'

/**
 * Fetches portfolio items for a given provider (public read).
 *
 * @param providerId - The provider's user ID
 * @returns Array of portfolio items with id, title, client_name, description, image_urls
 */
export async function getProviderPortfolio(providerId: string): Promise<{
    id: string
    title: string
    client_name?: string
    description?: string
    image_urls?: string[]
}[]> {
    const supabase = await createClient()

    // AUTH: Verify user is authenticated before serving portfolio data
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('provider_portfolio')
        .select('id, title, client_name, description, image_urls')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false })
        .limit(10)

    if (error || !data) return []
    return data as { id: string; title: string; client_name?: string; description?: string; image_urls?: string[] }[]
}

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
