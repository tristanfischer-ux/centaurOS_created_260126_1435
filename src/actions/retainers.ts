"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  createRetainer,
  getRetainer,
  updateRetainer,
  pauseRetainer,
  resumeRetainer,
  cancelRetainer,
  activateRetainer,
  getRetainers,
  getRetainerStats,
  calculateRetainerPricing,
} from "@/lib/retainers/service"
import {
  CreateRetainerParams,
  UpdateRetainerParams,
  RetainerWithDetails,
  RetainerStats,
  RetainerFilters,
  RetainerPricing,
  CancellationDetails,
} from "@/types/retainers"

// ==========================================
// CREATE RETAINER AGREEMENT
// ==========================================

export async function createRetainerAgreement(
  params: CreateRetainerParams
): Promise<{ data: { retainerId: string } | null; error: string | null }> {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { data: null, error: "Not authenticated" }
    }

    // Validate provider exists
    const { data: provider, error: providerError } = await supabase
      .from("provider_profiles")
      .select("id, user_id, is_active")
      .eq("id", params.sellerId)
      .single()

    if (providerError || !provider) {
      return { data: null, error: "Provider not found" }
    }

    if (!provider.is_active) {
      return { data: null, error: "Provider is not currently available" }
    }

    // Cannot create retainer with yourself
    if (provider.user_id === user.id) {
      return { data: null, error: "Cannot create a retainer with yourself" }
    }

    // Create the retainer
    const { data: retainer, error } = await createRetainer(supabase, user.id, params)

    if (error || !retainer) {
      return { data: null, error: error || "Failed to create retainer" }
    }

    // Create a conversation for the retainer
    await supabase
      .from("conversations")
      .insert({
        buyer_id: user.id,
        seller_id: provider.user_id,
        status: "active",
      })

    revalidatePath("/retainers")
    revalidatePath("/marketplace")

    return { data: { retainerId: retainer.id }, error: null }
  } catch (err) {
    console.error("Failed to create retainer agreement:", err)
    return { data: null, error: "Failed to create retainer agreement" }
  }
}

// ==========================================
// GET MY RETAINERS
// ==========================================

export async function getMyRetainers(
  role?: "buyer" | "seller",
  status?: RetainerFilters["status"]
): Promise<{ data: RetainerWithDetails[]; error: string | null; count: number }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { data: [], error: "Not authenticated", count: 0 }
    }

    const filters: RetainerFilters = {
      role,
      status,
    }

    const result = await getRetainers(supabase, user.id, filters)
    return result
  } catch (err) {
    console.error("Failed to get retainers:", err)
    return { data: [], error: "Failed to load retainers", count: 0 }
  }
}

// ==========================================
// GET RETAINER DETAIL
// ==========================================

export async function getRetainerDetail(
  retainerId: string
): Promise<{ data: RetainerWithDetails | null; error: string | null }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { data: null, error: "Not authenticated" }
    }

    const result = await getRetainer(supabase, retainerId)

    if (result.data) {
      // Verify user has access to this retainer
      const isBuyer = result.data.buyer_id === user.id
      const isSeller = result.data.seller?.profile?.id === user.id

      if (!isBuyer && !isSeller) {
        return { data: null, error: "Access denied" }
      }
    }

    return result
  } catch (err) {
    console.error("Failed to get retainer detail:", err)
    return { data: null, error: "Failed to load retainer" }
  }
}

// ==========================================
// UPDATE RETAINER TERMS
// ==========================================

export async function updateRetainerTerms(
  retainerId: string,
  terms: UpdateRetainerParams
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Verify user is buyer or seller on this retainer
    const { data: retainer, error: fetchError } = await supabase
      .from("retainers")
      .select(`
        buyer_id,
        seller:provider_profiles!retainers_seller_id_fkey (
          user_id
        )
      `)
      .eq("id", retainerId)
      .single()

    if (fetchError || !retainer) {
      return { success: false, error: "Retainer not found" }
    }

    const isBuyer = retainer.buyer_id === user.id
    const isSeller = retainer.seller?.user_id === user.id

    if (!isBuyer && !isSeller) {
      return { success: false, error: "Access denied" }
    }

    const result = await updateRetainer(supabase, retainerId, terms)

    if (result.success) {
      revalidatePath("/retainers")
      revalidatePath(`/retainers/${retainerId}`)
    }

    return result
  } catch (err) {
    console.error("Failed to update retainer terms:", err)
    return { success: false, error: "Failed to update retainer" }
  }
}

// ==========================================
// ACCEPT RETAINER (Seller activates)
// ==========================================

export async function acceptRetainerAgreement(
  retainerId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Verify user is the seller
    const { data: retainer, error: fetchError } = await supabase
      .from("retainers")
      .select(`
        seller:provider_profiles!retainers_seller_id_fkey (
          user_id
        )
      `)
      .eq("id", retainerId)
      .single()

    if (fetchError || !retainer) {
      return { success: false, error: "Retainer not found" }
    }

    if (retainer.seller?.user_id !== user.id) {
      return { success: false, error: "Only the seller can accept a retainer" }
    }

    const result = await activateRetainer(supabase, retainerId)

    if (result.success) {
      revalidatePath("/retainers")
      revalidatePath(`/retainers/${retainerId}`)
    }

    return result
  } catch (err) {
    console.error("Failed to accept retainer:", err)
    return { success: false, error: "Failed to accept retainer" }
  }
}

// ==========================================
// PAUSE RETAINER
// ==========================================

export async function pauseRetainerAgreement(
  retainerId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Verify user is buyer or seller
    const { data: retainer, error: fetchError } = await supabase
      .from("retainers")
      .select(`
        buyer_id,
        seller:provider_profiles!retainers_seller_id_fkey (
          user_id
        )
      `)
      .eq("id", retainerId)
      .single()

    if (fetchError || !retainer) {
      return { success: false, error: "Retainer not found" }
    }

    const isBuyer = retainer.buyer_id === user.id
    const isSeller = retainer.seller?.user_id === user.id

    if (!isBuyer && !isSeller) {
      return { success: false, error: "Access denied" }
    }

    const result = await pauseRetainer(supabase, retainerId)

    if (result.success) {
      revalidatePath("/retainers")
      revalidatePath(`/retainers/${retainerId}`)
    }

    return result
  } catch (err) {
    console.error("Failed to pause retainer:", err)
    return { success: false, error: "Failed to pause retainer" }
  }
}

// ==========================================
// RESUME RETAINER
// ==========================================

export async function resumeRetainerAgreement(
  retainerId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Verify user is buyer or seller
    const { data: retainer, error: fetchError } = await supabase
      .from("retainers")
      .select(`
        buyer_id,
        seller:provider_profiles!retainers_seller_id_fkey (
          user_id
        )
      `)
      .eq("id", retainerId)
      .single()

    if (fetchError || !retainer) {
      return { success: false, error: "Retainer not found" }
    }

    const isBuyer = retainer.buyer_id === user.id
    const isSeller = retainer.seller?.user_id === user.id

    if (!isBuyer && !isSeller) {
      return { success: false, error: "Access denied" }
    }

    const result = await resumeRetainer(supabase, retainerId)

    if (result.success) {
      revalidatePath("/retainers")
      revalidatePath(`/retainers/${retainerId}`)
    }

    return result
  } catch (err) {
    console.error("Failed to resume retainer:", err)
    return { success: false, error: "Failed to resume retainer" }
  }
}

// ==========================================
// CANCEL RETAINER AGREEMENT
// ==========================================

export async function cancelRetainerAgreement(
  retainerId: string,
  effectiveDate?: string
): Promise<{ data: CancellationDetails | null; error: string | null }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { data: null, error: "Not authenticated" }
    }

    // Verify user is buyer or seller
    const { data: retainer, error: fetchError } = await supabase
      .from("retainers")
      .select(`
        buyer_id,
        seller:provider_profiles!retainers_seller_id_fkey (
          user_id
        )
      `)
      .eq("id", retainerId)
      .single()

    if (fetchError || !retainer) {
      return { data: null, error: "Retainer not found" }
    }

    const isBuyer = retainer.buyer_id === user.id
    const isSeller = retainer.seller?.user_id === user.id

    if (!isBuyer && !isSeller) {
      return { data: null, error: "Access denied" }
    }

    const result = await cancelRetainer(supabase, retainerId, effectiveDate)

    if (result.data) {
      revalidatePath("/retainers")
      revalidatePath(`/retainers/${retainerId}`)
    }

    return result
  } catch (err) {
    console.error("Failed to cancel retainer:", err)
    return { data: null, error: "Failed to cancel retainer" }
  }
}

// ==========================================
// GET RETAINER STATS
// ==========================================

export async function getRetainerStatistics(
  retainerId: string
): Promise<{ data: RetainerStats | null; error: string | null }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { data: null, error: "Not authenticated" }
    }

    // Verify user has access
    const { data: retainer, error: fetchError } = await supabase
      .from("retainers")
      .select(`
        buyer_id,
        seller:provider_profiles!retainers_seller_id_fkey (
          user_id
        )
      `)
      .eq("id", retainerId)
      .single()

    if (fetchError || !retainer) {
      return { data: null, error: "Retainer not found" }
    }

    const isBuyer = retainer.buyer_id === user.id
    const isSeller = retainer.seller?.user_id === user.id

    if (!isBuyer && !isSeller) {
      return { data: null, error: "Access denied" }
    }

    return await getRetainerStats(supabase, retainerId, user.id)
  } catch (err) {
    console.error("Failed to get retainer stats:", err)
    return { data: null, error: "Failed to load statistics" }
  }
}

// ==========================================
// CALCULATE RETAINER PRICING
// ==========================================

export async function calculateRetainerPricingOptions(
  providerId: string
): Promise<{ data: RetainerPricing[] | null; error: string | null }> {
  try {
    const supabase = await createClient()

    // Get provider's day rate to calculate hourly
    const { data: provider, error: providerError } = await supabase
      .from("provider_profiles")
      .select("day_rate, currency")
      .eq("id", providerId)
      .single()

    if (providerError || !provider) {
      return { data: null, error: "Provider not found" }
    }

    if (!provider.day_rate) {
      return { data: null, error: "Provider has not set their rate" }
    }

    // Assume 8-hour day for hourly rate calculation
    const baseHourlyRate = provider.day_rate / 8
    const currency = provider.currency || "GBP"

    // Calculate pricing for all commitment levels
    const pricingOptions: RetainerPricing[] = [
      calculateRetainerPricing(10, baseHourlyRate, currency),
      calculateRetainerPricing(20, baseHourlyRate, currency),
      calculateRetainerPricing(40, baseHourlyRate, currency),
    ]

    return { data: pricingOptions, error: null }
  } catch (err) {
    console.error("Failed to calculate pricing:", err)
    return { data: null, error: "Failed to calculate pricing" }
  }
}

// ==========================================
// GET PROVIDER FOR RETAINER
// ==========================================

export async function getProviderForRetainer(
  providerId: string
): Promise<{
  data: {
    id: string
    userId: string
    name: string
    avatarUrl?: string
    headline?: string
    dayRate?: number
    hourlyRate?: number
    currency: string
    isActive: boolean
    rating?: number
    totalReviews: number
  } | null
  error: string | null
}> {
  try {
    const supabase = await createClient()

    const { data: provider, error: providerError } = await supabase
      .from("provider_profiles")
      .select(`
        id,
        user_id,
        headline,
        day_rate,
        currency,
        is_active,
        profiles!provider_profiles_user_id_fkey (
          full_name,
          avatar_url
        )
      `)
      .eq("id", providerId)
      .single()

    if (providerError || !provider) {
      return { data: null, error: "Provider not found" }
    }

    // Get ratings
    const { data: ratings } = await supabase
      .from("provider_ratings")
      .select("average_rating, total_reviews")
      .eq("provider_id", providerId)
      .single()

    const profile = provider.profiles as { full_name?: string; avatar_url?: string }

    return {
      data: {
        id: provider.id,
        userId: provider.user_id,
        name: profile?.full_name || "Provider",
        avatarUrl: profile?.avatar_url,
        headline: provider.headline,
        dayRate: provider.day_rate ?? undefined,
        hourlyRate: provider.day_rate ? provider.day_rate / 8 : undefined,
        currency: provider.currency || "GBP",
        isActive: provider.is_active,
        rating: ratings?.average_rating ?? undefined,
        totalReviews: ratings?.total_reviews || 0,
      },
      error: null,
    }
  } catch (err) {
    console.error("Failed to get provider:", err)
    return { data: null, error: "Failed to load provider" }
  }
}
