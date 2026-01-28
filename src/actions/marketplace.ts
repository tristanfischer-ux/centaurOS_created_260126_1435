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
        return { error: validation.error }
    }

    const { title: validatedTitle, specifications: validatedSpecifications, budgetRange: validatedBudgetRange } = validation.data

    const { error } = await supabase
        .from("manufacturing_rfqs")
        .insert({
            title: validatedTitle,
            specifications: validatedSpecifications || null,
            budget_range: validatedBudgetRange || null,
            foundry_id,
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
    attributes: Record<string, any>
    image_url: string | null
    is_verified: boolean
}

export async function getMarketplaceListings(category?: string) {
    const supabase = await createClient()

    // marketplace_listings table exists but may not be in generated Database types
    // Type assertion needed for table name since it's not in Database['public']['Tables']
    let query = supabase
        .from('marketplace_listings' as never)
        .select('*')
        .order('is_verified', { ascending: false })

    if (category) {
        query = query.eq('category', category)
    }

    const { data, error } = await query

    if (error) {
        console.error('Marketplace Fetch Error:', error)
        return []
    }

    // Properly type the result using the MarketplaceListing interface
    return (data || []) as MarketplaceListing[]
}
