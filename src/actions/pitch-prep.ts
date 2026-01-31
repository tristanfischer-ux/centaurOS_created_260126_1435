// @ts-nocheck - pitch_prep_requests table exists but types not regenerated
"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"
import {
  CreatePitchPrepParams,
  UpdatePitchPrepParams,
  PitchPrepRequest,
  PitchPrepRequestWithUser,
  PitchPrepStatus,
} from "@/types/pitch-prep"

// =============================================
// PITCH PREP CRUD ACTIONS
// =============================================

/**
 * Create a new pitch preparation request
 * 
 * LEGAL NOTE: This is a preparation service only. CentaurOS does not
 * provide investment advice or facilitate securities transactions.
 */
export async function createPitchPrepRequest(params: CreatePitchPrepParams): Promise<{
  data: { id: string } | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) return { data: null, error: "User not in a foundry" }

  // Validate required fields
  if (!params.company_name?.trim()) {
    return { data: null, error: "Company name is required" }
  }

  if (!params.product_description?.trim()) {
    return { data: null, error: "Product description is required" }
  }

  if (!params.stage) {
    return { data: null, error: "Funding stage is required" }
  }

  if (!params.services_requested?.length) {
    return { data: null, error: "Please select at least one service" }
  }

  // Insert the pitch prep request
  const { data: request, error: insertError } = await supabase
    .from("pitch_prep_requests")
    .insert({
      foundry_id: foundryId,
      user_id: user.id,
      company_name: params.company_name.trim(),
      company_website: params.company_website?.trim() || null,
      founding_date: params.founding_date || null,
      legal_structure: params.legal_structure || null,
      headquarters: params.headquarters?.trim() || null,
      founder_count: params.founder_count || null,
      team_size: params.team_size || null,
      key_team_members: params.key_team_members || null,
      product_description: params.product_description.trim(),
      problem_solved: params.problem_solved?.trim() || null,
      target_market: params.target_market?.trim() || null,
      competitive_landscape: params.competitive_landscape?.trim() || null,
      stage: params.stage,
      has_revenue: params.has_revenue,
      traction_summary: params.traction_summary?.trim() || null,
      amount_seeking: params.amount_seeking?.trim() || null,
      use_of_funds: params.use_of_funds?.trim() || null,
      timeline: params.timeline?.trim() || null,
      services_requested: params.services_requested,
      target_investor_types: params.target_investor_types || null,
      specific_questions: params.specific_questions?.trim() || null,
      pitch_deck_url: params.pitch_deck_url || null,
      financial_model_url: params.financial_model_url || null,
      additional_files: params.additional_files || null,
      status: 'submitted' as PitchPrepStatus,
    })
    .select("id")
    .single()

  if (insertError || !request) {
    console.error("Failed to create pitch prep request:", insertError)
    return { data: null, error: insertError?.message || "Failed to create request" }
  }

  revalidatePath("/marketplace")
  revalidatePath("/pitch-prep")
  return { data: { id: request.id }, error: null }
}

/**
 * Get all pitch prep requests for the current user
 */
export async function getMyPitchPrepRequests(): Promise<{
  data: PitchPrepRequest[] | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) return { data: null, error: "User not in a foundry" }

  const { data, error } = await supabase
    .from("pitch_prep_requests")
    .select("*")
    .eq("foundry_id", foundryId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Failed to fetch pitch prep requests:", error)
    return { data: null, error: error.message }
  }

  return { data: data as PitchPrepRequest[], error: null }
}

/**
 * Get a single pitch prep request by ID
 */
export async function getPitchPrepRequest(id: string): Promise<{
  data: PitchPrepRequestWithUser | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) return { data: null, error: "User not in a foundry" }

  const { data, error } = await supabase
    .from("pitch_prep_requests")
    .select(`
      *,
      user:profiles!pitch_prep_requests_user_id_fkey (
        id,
        full_name,
        email,
        avatar_url
      )
    `)
    .eq("id", id)
    .eq("foundry_id", foundryId)
    .single()

  if (error) {
    console.error("Failed to fetch pitch prep request:", error)
    return { data: null, error: error.message }
  }

  return { data: data as PitchPrepRequestWithUser, error: null }
}

/**
 * Update a pitch prep request
 */
export async function updatePitchPrepRequest(
  id: string,
  params: UpdatePitchPrepParams
): Promise<{
  data: { id: string } | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) return { data: null, error: "User not in a foundry" }

  // Verify ownership
  const { data: existing } = await supabase
    .from("pitch_prep_requests")
    .select("id, user_id")
    .eq("id", id)
    .eq("foundry_id", foundryId)
    .single()

  if (!existing) {
    return { data: null, error: "Request not found" }
  }

  if (existing.user_id !== user.id) {
    return { data: null, error: "Not authorized to update this request" }
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  // Only include fields that are provided
  if (params.company_name !== undefined) updateData.company_name = params.company_name.trim()
  if (params.company_website !== undefined) updateData.company_website = params.company_website?.trim() || null
  if (params.founding_date !== undefined) updateData.founding_date = params.founding_date || null
  if (params.legal_structure !== undefined) updateData.legal_structure = params.legal_structure || null
  if (params.headquarters !== undefined) updateData.headquarters = params.headquarters?.trim() || null
  if (params.founder_count !== undefined) updateData.founder_count = params.founder_count || null
  if (params.team_size !== undefined) updateData.team_size = params.team_size || null
  if (params.key_team_members !== undefined) updateData.key_team_members = params.key_team_members || null
  if (params.product_description !== undefined) updateData.product_description = params.product_description.trim()
  if (params.problem_solved !== undefined) updateData.problem_solved = params.problem_solved?.trim() || null
  if (params.target_market !== undefined) updateData.target_market = params.target_market?.trim() || null
  if (params.competitive_landscape !== undefined) updateData.competitive_landscape = params.competitive_landscape?.trim() || null
  if (params.stage !== undefined) updateData.stage = params.stage
  if (params.has_revenue !== undefined) updateData.has_revenue = params.has_revenue
  if (params.traction_summary !== undefined) updateData.traction_summary = params.traction_summary?.trim() || null
  if (params.amount_seeking !== undefined) updateData.amount_seeking = params.amount_seeking?.trim() || null
  if (params.use_of_funds !== undefined) updateData.use_of_funds = params.use_of_funds?.trim() || null
  if (params.timeline !== undefined) updateData.timeline = params.timeline?.trim() || null
  if (params.services_requested !== undefined) updateData.services_requested = params.services_requested
  if (params.target_investor_types !== undefined) updateData.target_investor_types = params.target_investor_types || null
  if (params.specific_questions !== undefined) updateData.specific_questions = params.specific_questions?.trim() || null
  if (params.pitch_deck_url !== undefined) updateData.pitch_deck_url = params.pitch_deck_url || null
  if (params.financial_model_url !== undefined) updateData.financial_model_url = params.financial_model_url || null
  if (params.additional_files !== undefined) updateData.additional_files = params.additional_files || null
  if (params.status !== undefined) updateData.status = params.status

  const { error } = await supabase
    .from("pitch_prep_requests")
    .update(updateData)
    .eq("id", id)

  if (error) {
    console.error("Failed to update pitch prep request:", error)
    return { data: null, error: error.message }
  }

  revalidatePath("/pitch-prep")
  revalidatePath(`/pitch-prep/${id}`)
  return { data: { id }, error: null }
}

/**
 * Cancel a pitch prep request
 */
export async function cancelPitchPrepRequest(id: string): Promise<{
  success: boolean
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) return { success: false, error: "User not in a foundry" }

  // Verify ownership
  const { data: existing } = await supabase
    .from("pitch_prep_requests")
    .select("id, user_id, status")
    .eq("id", id)
    .eq("foundry_id", foundryId)
    .single()

  if (!existing) {
    return { success: false, error: "Request not found" }
  }

  if (existing.user_id !== user.id) {
    return { success: false, error: "Not authorized to cancel this request" }
  }

  if (existing.status === 'completed' || existing.status === 'cancelled') {
    return { success: false, error: "Cannot cancel a completed or already cancelled request" }
  }

  const { error } = await supabase
    .from("pitch_prep_requests")
    .update({ 
      status: 'cancelled' as PitchPrepStatus,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)

  if (error) {
    console.error("Failed to cancel pitch prep request:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/pitch-prep")
  return { success: true, error: null }
}
