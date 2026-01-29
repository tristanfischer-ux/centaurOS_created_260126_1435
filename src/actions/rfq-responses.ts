"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  RFQResponse,
  RFQResponseWithProvider,
  SubmitRFQResponseParams,
  UpdateRFQResponseParams,
} from "@/types/rfq"

// =============================================
// RFQ RESPONSE ACTIONS
// =============================================

/**
 * Submit an RFQ response
 */
export async function submitRFQResponse(
  params: SubmitRFQResponseParams
): Promise<{
  data: { id: string } | null
  awarded?: boolean
  priority_hold?: boolean
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  // Get provider profile
  const { data: providerProfile } = await supabase
    .from('provider_profiles')
    .select('id, tier')
    .eq('user_id', user.id)
    .single()

  if (!providerProfile) {
    return { data: null, error: "You need a provider profile to respond to RFQs" }
  }

  // Check if RFQ exists and is accepting responses
  const { data: rfq, error: rfqError } = await supabase
    .from('rfqs')
    .select('id, status, rfq_type, race_opens_at')
    .eq('id', params.rfq_id)
    .single()

  if (rfqError || !rfq) {
    return { data: null, error: "RFQ not found" }
  }

  if (rfq.status !== 'Open' && rfq.status !== 'Bidding') {
    return { data: null, error: `RFQ is ${rfq.status}, cannot respond` }
  }

  // Check if race has started
  if (rfq.race_opens_at && new Date(rfq.race_opens_at) > new Date()) {
    return { data: null, error: "Race has not started yet" }
  }

  // Check for existing response
  const { data: existingResponse } = await supabase
    .from('rfq_responses')
    .select('id')
    .eq('rfq_id', params.rfq_id)
    .eq('provider_id', providerProfile.id)
    .single()

  if (existingResponse) {
    return { data: null, error: "Already responded to this RFQ" }
  }

  // Validate response type
  if (!['accept', 'decline', 'info_request'].includes(params.response_type)) {
    return { data: null, error: "Invalid response type" }
  }

  // Validate info_request has a message
  if (params.response_type === 'info_request' && !params.message?.trim()) {
    return { data: null, error: "Please provide your questions" }
  }

  // Create the response
  const { data: response, error: insertError } = await supabase
    .from('rfq_responses')
    .insert({
      rfq_id: params.rfq_id,
      provider_id: providerProfile.id,
      response_type: params.response_type,
      quoted_price: params.quoted_price || null,
      message: params.message?.trim() || null,
    })
    .select()
    .single()

  if (insertError) {
    console.error("Error creating RFQ response:", insertError)
    return { data: null, error: "Failed to submit response" }
  }

  // Handle race mechanics for accept responses
  let awarded = false
  let priority_hold = false

  if (params.response_type === 'accept') {
    // Check if this is the first accept
    const { data: acceptResponses } = await supabase
      .from('rfq_responses')
      .select('id')
      .eq('rfq_id', params.rfq_id)
      .eq('response_type', 'accept')

    const isFirstAccept = acceptResponses?.length === 1

    if (isFirstAccept) {
      if (rfq.rfq_type === 'commodity') {
        // Commodity: First click wins - auto award
        await supabase
          .from('rfqs')
          .update({
            status: 'Awarded',
            awarded_to: providerProfile.id,
          })
          .eq('id', params.rfq_id)

        awarded = true
      } else if (rfq.rfq_type === 'custom') {
        // Custom: Set priority hold (2 hours)
        const holdExpires = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours

        await supabase
          .from('rfqs')
          .update({
            status: 'priority_hold',
            priority_holder_id: providerProfile.id,
            priority_hold_expires_at: holdExpires.toISOString(),
          })
          .eq('id', params.rfq_id)

        priority_hold = true
      }
    }
  }

  // Update broadcast as delivered/viewed
  await supabase
    .from('rfq_broadcasts')
    .update({
      delivered_at: new Date().toISOString(),
      viewed_at: new Date().toISOString(),
    })
    .eq('rfq_id', params.rfq_id)
    .eq('provider_id', providerProfile.id)

  revalidatePath("/rfq")
  revalidatePath(`/rfq/${params.rfq_id}`)

  return { 
    data: { id: response.id }, 
    awarded,
    priority_hold,
    error: null 
  }
}

/**
 * Update an existing RFQ response
 * Only allows updating quoted_price and message before RFQ is awarded
 */
export async function updateRFQResponse(
  responseId: string,
  data: UpdateRFQResponseParams
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  // Get provider profile
  const { data: providerProfile } = await supabase
    .from('provider_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!providerProfile) {
    return { success: false, error: "No provider profile" }
  }

  // Get the response and verify ownership
  const { data: response, error: responseError } = await supabase
    .from('rfq_responses')
    .select('id, rfq_id, provider_id')
    .eq('id', responseId)
    .single()

  if (responseError || !response) {
    return { success: false, error: "Response not found" }
  }

  if (response.provider_id !== providerProfile.id) {
    return { success: false, error: "Not authorized" }
  }

  // Check if RFQ is still editable
  const { data: rfq } = await supabase
    .from('rfqs')
    .select('status')
    .eq('id', response.rfq_id)
    .single()

  if (rfq?.status === 'Awarded' || rfq?.status === 'Closed' || rfq?.status === 'cancelled') {
    return { success: false, error: "Cannot update response after RFQ is closed" }
  }

  // Update the response
  const { error: updateError } = await supabase
    .from('rfq_responses')
    .update({
      quoted_price: data.quoted_price,
      message: data.message?.trim() || null,
    })
    .eq('id', responseId)

  if (updateError) {
    console.error("Error updating RFQ response:", updateError)
    return { success: false, error: "Failed to update response" }
  }

  revalidatePath("/rfq")
  revalidatePath(`/rfq/${response.rfq_id}`)

  return { success: true, error: null }
}

/**
 * Withdraw an RFQ response
 */
export async function withdrawRFQResponse(responseId: string): Promise<{
  success: boolean
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  // Get provider profile
  const { data: providerProfile } = await supabase
    .from('provider_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!providerProfile) {
    return { success: false, error: "No provider profile" }
  }

  // Get the response and verify ownership
  const { data: response, error: responseError } = await supabase
    .from('rfq_responses')
    .select('id, rfq_id, provider_id, response_type')
    .eq('id', responseId)
    .single()

  if (responseError || !response) {
    return { success: false, error: "Response not found" }
  }

  if (response.provider_id !== providerProfile.id) {
    return { success: false, error: "Not authorized" }
  }

  // Check if RFQ allows withdrawal
  const { data: rfq } = await supabase
    .from('rfqs')
    .select('status, priority_holder_id, awarded_to')
    .eq('id', response.rfq_id)
    .single()

  if (!rfq) {
    return { success: false, error: "RFQ not found" }
  }

  if (rfq.status === 'Awarded' || rfq.status === 'Closed' || rfq.status === 'cancelled') {
    return { success: false, error: "Cannot withdraw after RFQ is closed" }
  }

  // If this provider holds priority, release it
  if (rfq.priority_holder_id === providerProfile.id) {
    await supabase
      .from('rfqs')
      .update({
        status: 'Bidding',
        priority_holder_id: null,
        priority_hold_expires_at: null,
      })
      .eq('id', response.rfq_id)
  }

  // If this provider was awarded (shouldn't happen but safety check)
  if (rfq.awarded_to === providerProfile.id) {
    return { success: false, error: "Cannot withdraw after being awarded" }
  }

  // Delete the response
  const { error: deleteError } = await supabase
    .from('rfq_responses')
    .delete()
    .eq('id', responseId)

  if (deleteError) {
    console.error("Error withdrawing RFQ response:", deleteError)
    return { success: false, error: "Failed to withdraw response" }
  }

  revalidatePath("/rfq")
  revalidatePath(`/rfq/${response.rfq_id}`)

  return { success: true, error: null }
}

/**
 * Get all responses for an RFQ (buyer only)
 */
export async function getRFQResponses(rfqId: string): Promise<{
  data: RFQResponseWithProvider[]
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: "Not authenticated" }

  // Verify user is the RFQ buyer
  const { data: rfq } = await supabase
    .from('rfqs')
    .select('buyer_id')
    .eq('id', rfqId)
    .single()

  if (!rfq || rfq.buyer_id !== user.id) {
    return { data: [], error: "Not authorized" }
  }

  // Get responses with provider details
  const { data: responses, error: responsesError } = await supabase
    .from('rfq_responses')
    .select(`
      *,
      provider:provider_profiles!rfq_responses_provider_id_fkey (
        id,
        user_id,
        headline,
        tier,
        day_rate
      )
    `)
    .eq('rfq_id', rfqId)
    .order('responded_at', { ascending: true })

  if (responsesError) {
    console.error("Error fetching RFQ responses:", responsesError)
    return { data: [], error: "Failed to fetch responses" }
  }

  // Get profile info for each provider
  const responsesWithProfiles: RFQResponseWithProvider[] = []

  for (const response of responses || []) {
    let providerProfile = null
    if (response.provider?.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('id', response.provider.user_id)
        .single()
      providerProfile = profile
    }

    responsesWithProfiles.push({
      ...response,
      provider: response.provider,
      provider_profile: providerProfile,
    } as RFQResponseWithProvider)
  }

  return { data: responsesWithProfiles, error: null }
}

/**
 * Get my response for a specific RFQ (supplier view)
 */
export async function getMyRFQResponse(rfqId: string): Promise<{
  data: RFQResponse | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  // Get provider profile
  const { data: providerProfile } = await supabase
    .from('provider_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!providerProfile) {
    return { data: null, error: null } // Not an error, just not a provider
  }

  // Get the response
  const { data: response, error: responseError } = await supabase
    .from('rfq_responses')
    .select('*')
    .eq('rfq_id', rfqId)
    .eq('provider_id', providerProfile.id)
    .single()

  if (responseError && responseError.code !== 'PGRST116') {
    // PGRST116 is "no rows returned" which is fine
    console.error("Error fetching my RFQ response:", responseError)
    return { data: null, error: "Failed to fetch response" }
  }

  return { data: response as RFQResponse | null, error: null }
}

/**
 * Get response count for an RFQ
 */
export async function getRFQResponseCount(rfqId: string): Promise<{
  total: number
  accepts: number
  declines: number
  info_requests: number
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { total: 0, accepts: 0, declines: 0, info_requests: 0, error: "Not authenticated" }
  }

  const { data: responses, error } = await supabase
    .from('rfq_responses')
    .select('response_type')
    .eq('rfq_id', rfqId)

  if (error) {
    console.error("Error fetching response count:", error)
    return { total: 0, accepts: 0, declines: 0, info_requests: 0, error: "Failed to fetch" }
  }

  const counts = {
    total: responses?.length || 0,
    accepts: 0,
    declines: 0,
    info_requests: 0,
    error: null,
  }

  for (const r of responses || []) {
    switch (r.response_type) {
      case 'accept':
        counts.accepts++
        break
      case 'decline':
        counts.declines++
        break
      case 'info_request':
        counts.info_requests++
        break
    }
  }

  return counts
}
