"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"



export async function addToStack(id: string, type: 'provider' | 'tool' = 'provider') {
    if (type === 'tool') {
        return { error: "AI Agents cannot be added to stack yet (Database update pending)" }
    }

    const providerId = id
    const supabase = await createClient()

    // 1. Get current user profile to determine foundry_id
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: "Not authenticated" }

    const { data: profile } = await supabase
        .from("profiles")
        .select("foundry_id")
        .eq("id", user.id)
        .single()

    if (!profile) return { error: "Profile not found" }

    // 2. Add to stack
    const { error } = await supabase
        .from("foundry_stack")
        .insert({
            foundry_id: profile.foundry_id,
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

    const { data: profile } = await supabase
        .from("profiles")
        .select("foundry_id")
        .eq("id", user.id)
        .single()

    if (!profile) return { error: "Profile not found" }

    const { error } = await supabase
        .from("foundry_stack")
        .delete()
        .eq("foundry_id", profile.foundry_id)
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

    const { data: profile } = await supabase
        .from("profiles")
        .select("foundry_id")
        .eq("id", user.id)
        .single()

    if (!profile) return { error: "Profile not found" }

    const { error } = await supabase
        .from("manufacturing_rfqs")
        .insert({
            title: formData.title,
            specifications: formData.specifications,
            budget_range: formData.budget_range,
            foundry_id: profile.foundry_id,
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
