"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { Database } from "@/types/database.types"
import { createRFQSchema, validate } from "@/lib/validations"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"



export async function addToStack(id: string, type: 'provider' | 'tool' = 'provider') {
    if (type === 'tool') {
        return { error: "AI Agents cannot be added to stack yet (Database update pending)" }
    }

    const providerId = id
    const supabase = await createClient()

    // Get current user and foundry_id
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: "Not authenticated" }

    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: "User not in a foundry" }

    // Add to stack
    const { error } = await supabase
        .from("foundry_stack")
        .insert({
            foundry_id,
            provider_id: providerId,
            status: "Active"
        })

    if (error) {
        if (error.code === '23505') { // Unique violation
            return { error: "Already in stack" }
        }
        return { error: "Failed to add to stack" }
    }

    revalidatePath("/marketplace")
    return { success: true }
}

export async function removeFromStack(id: string, type: 'provider' | 'tool' = 'provider') {
    if (type === 'tool') {
        return { error: "AI Agents cannot be removed from stack yet" }
    }

    const providerId = id
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: "Not authenticated" }

    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: "User not in a foundry" }

    const { error } = await supabase
        .from("foundry_stack")
        .delete()
        .eq("foundry_id", foundry_id)
        .eq("provider_id", providerId)

    if (error) return { error: "Failed to remove from stack" }

    revalidatePath("/marketplace")
    return { success: true }
}

export async function submitRFQ(formData: {
    title: string;
    specifications: string;
    budget_range: string;
}) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: "Not authenticated" }

    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: "User not in a foundry" }

    // Early validation for formData structure
    if (!formData || typeof formData !== 'object') {
        return { error: "Invalid request data" }
    }

    // Sanitize and prepare input for Zod validation
    // Zod schema handles: title (1-200 chars), specifications (10-5000 chars), budgetRange (format: "$X - $Y")
    const rawData = {
        title: typeof formData.title === 'string' ? formData.title.trim() : '',
        specifications: typeof formData.specifications === 'string' && formData.specifications.trim() 
            ? formData.specifications.trim() 
            : undefined,
        budgetRange: typeof formData.budget_range === 'string' && formData.budget_range.trim()
            ? formData.budget_range.trim()
            : undefined
    }

    const validation = validate(createRFQSchema, rawData)
    if (!validation.success) {
        return { error: 'error' in validation ? validation.error : 'Validation failed' }
    }

    const { title: validatedTitle, specifications: validatedSpecifications, budgetRange: validatedBudgetRange } = validation.data

    const { error } = await supabase
        .from("manufacturing_rfqs")
        .insert({
            title: validatedTitle as string,
            specifications: validatedSpecifications || '',
            budget_range: validatedBudgetRange || null,
            foundry_id: foundry_id as string,
            created_by: user.id,
            status: "Open"
        })

    if (error) {
        console.error("RFQ Error:", error)
        return { error: "Failed to submit RFQ" }
    }

    revalidatePath("/marketplace")
    return { success: true }
}

export interface MarketplaceListing {
    id: string
    category: 'People' | 'Products' | 'Services' | 'AI'
    subcategory: string
    title: string
    description: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attributes: Record<string, any>
    image_url: string | null
    is_verified: boolean
}

export async function getMarketplaceListings(category?: string) {
    const supabase = await createClient()

    let query = supabase
        .from('marketplace_listings')
        .select('*')
        .order('is_verified', { ascending: false })

    if (category) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = query.eq('category', category as any)
    }

    const { data, error } = await query

    if (error) {
        console.error('Marketplace Fetch Error:', error)
        return []
    }

    return (data || []) as MarketplaceListing[]
}

// ==========================================
// MARKETPLACE RECOMMENDATIONS
// ==========================================

export interface MarketplaceRecommendation {
    id: string
    source_type: 'advisory' | 'coverage_gap' | 'ai_suggestion' | 'manual'
    category: 'People' | 'Products' | 'Services' | 'AI'
    subcategory: string | null
    search_term: string | null
    reasoning: string | null
    priority: number
    created_at: string
}

/**
 * Get marketplace recommendations using the database function
 */
export async function getMarketplaceRecommendations(limit: number = 10): Promise<{
    data: MarketplaceRecommendation[]
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const foundryId = await getFoundryIdCached()
        
        if (!foundryId) {
            return { data: [], error: 'No foundry context' }
        }

        const { data, error } = await supabase.rpc('get_marketplace_recommendations', {
            p_foundry_id: foundryId,
            p_limit: limit
        })

        if (error) {
            console.error('Error fetching marketplace recommendations:', error)
            return { data: [], error: error.message }
        }

        return { data: (data || []) as MarketplaceRecommendation[], error: null }
    } catch (err) {
        console.error('Failed to fetch marketplace recommendations:', err)
        return { data: [], error: 'Failed to fetch recommendations' }
    }
}

/**
 * Generate recommendations from coverage gaps using the database function
 */
export async function generateGapRecommendations(): Promise<{
    count: number
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const foundryId = await getFoundryIdCached()
        
        if (!foundryId) {
            return { count: 0, error: 'No foundry context' }
        }

        const { data, error } = await supabase.rpc('generate_gap_recommendations', {
            p_foundry_id: foundryId
        })

        if (error) {
            console.error('Error generating gap recommendations:', error)
            return { count: 0, error: error.message }
        }

        revalidatePath('/marketplace')
        return { count: data || 0, error: null }
    } catch (err) {
        console.error('Failed to generate gap recommendations:', err)
        return { count: 0, error: 'Failed to generate recommendations' }
    }
}

/**
 * Dismiss a marketplace recommendation
 */
export async function dismissRecommendation(recommendationId: string): Promise<{
    success: boolean
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }

        const { error } = await supabase
            .from('marketplace_recommendations')
            .update({
                is_dismissed: true,
                dismissed_at: new Date().toISOString(),
                dismissed_by: user.id
            })
            .eq('id', recommendationId)

        if (error) {
            console.error('Error dismissing recommendation:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/marketplace')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to dismiss recommendation:', err)
        return { success: false, error: 'Failed to dismiss recommendation' }
    }
}

/**
 * Create a manual recommendation
 */
export async function createManualRecommendation(data: {
    category: 'People' | 'Products' | 'Services' | 'AI'
    subcategory?: string
    searchTerm: string
    reasoning?: string
    priority?: number
}): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()
        const foundryId = await getFoundryIdCached()
        
        if (!foundryId) {
            return { success: false, error: 'No foundry context' }
        }

        const { error } = await supabase
            .from('marketplace_recommendations')
            .insert({
                foundry_id: foundryId,
                source_type: 'manual',
                category: data.category,
                subcategory: data.subcategory || null,
                search_term: data.searchTerm,
                reasoning: data.reasoning || null,
                priority: data.priority || 50
            })

        if (error) {
            console.error('Error creating manual recommendation:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/marketplace')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to create manual recommendation:', err)
        return { success: false, error: 'Failed to create recommendation' }
    }
}
