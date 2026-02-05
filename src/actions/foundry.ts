'use server'

/**
 * @file foundry.ts
 * 
 * @description Server actions for foundry (company) management including purpose/mission/vision.
 * 
 * @security Only founders can update foundry data
 * @audit Foundry updates are logged to audit trail
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { FoundryPurposeData } from '@/types/foundry'

export interface ActionResult {
  success: boolean
  error: string | null
  data?: any
}

/**
 * Updates the foundry's purpose data (mission, vision, purpose).
 * 
 * @description Allows founders to define or update their company's purpose through
 * a guided questionnaire. The purpose provides strategic context for all objectives.
 * 
 * @param {string} foundryId - The foundry to update
 * @param {FoundryPurposeData} purposeData - Complete purpose data including questionnaire responses
 * 
 * @returns {Promise<ActionResult>} Success status with error message if failed
 * 
 * @throws {Error} If user is not authenticated or not a founder
 * 
 * @security Only founders can update foundry purpose
 * @audit Logs foundry_purpose_updated event with foundry_id and updated_by
 * 
 * @example
 * const result = await updateFoundryPurpose(foundryId, {
 *   purpose: "We exist to democratize AI for small businesses",
 *   mission: "Build accessible AI tools for SMBs",
 *   vision: "Every small business has AI superpowers by 2030",
 *   questionnaire: { ... },
 *   updatedAt: new Date().toISOString(),
 *   updatedBy: userId
 * })
 */
export async function updateFoundryPurpose(
  foundryId: string,
  purposeData: FoundryPurposeData
): Promise<ActionResult> {
  const supabase = await createClient()
  
  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }
  
  // AUTH: Get current user's profile to check role
  const { data: currentProfile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, foundry_id')
    .eq('id', user.id)
    .single()
  
  if (profileError || !currentProfile) {
    console.error('[FoundryActions] Failed to fetch user profile:', {
      userId: user.id,
      error: profileError?.message,
    })
    return { success: false, error: 'User profile not found' }
  }
  
  // AUTH: Verify user belongs to the foundry they're trying to update
  if (currentProfile.foundry_id !== foundryId) {
    console.warn('[FoundryActions] Foundry isolation violation attempt:', {
      userId: user.id,
      userFoundryId: currentProfile.foundry_id,
      targetFoundryId: foundryId,
    })
    return { success: false, error: 'Cannot update purpose for different foundry' }
  }
  
  // AUTH: Only founders can update foundry purpose
  if (currentProfile.role !== 'Founder') {
    console.warn('[FoundryActions] Non-founder attempted to update purpose:', {
      userId: user.id,
      role: currentProfile.role,
      foundryId,
    })
    return { success: false, error: 'Only founders can update company purpose' }
  }
  
  // VALIDATION: Ensure required fields are present
  if (!purposeData.purpose || purposeData.purpose.trim().length === 0) {
    return { success: false, error: 'Purpose statement is required' }
  }
  
  // VALIDATION: Ensure updated metadata is set
  if (!purposeData.updatedAt || !purposeData.updatedBy) {
    return { success: false, error: 'Update metadata is required' }
  }
  
  try {
    // Update foundry purpose_data using admin client to bypass RLS
    // SECURITY: Auth checks above verify user is authenticated, owns this foundry, and is a Founder
    console.log('[FoundryActions] Creating admin client...')
    
    let adminClient
    try {
      adminClient = createAdminClient()
      console.log('[FoundryActions] Admin client created successfully')
    } catch (adminError) {
      console.error('[FoundryActions] Failed to create admin client:', adminError)
      return { success: false, error: 'Server configuration error' }
    }
    
    console.log('[FoundryActions] Executing update for foundryId:', foundryId)
    console.log('[FoundryActions] Purpose data keys:', Object.keys(purposeData))
    
    const { data, error: updateError } = await adminClient
      .from('foundries')
      .update({ 
        purpose_data: purposeData as any // JSONB field
      })
      .eq('id', foundryId)
      .select()
      .single()
    
    console.log('[FoundryActions] Update complete. Result:', JSON.stringify({
      hasData: !!data,
      hasError: !!updateError,
      errorMessage: updateError?.message,
      errorCode: updateError?.code,
      errorDetails: updateError?.details,
      errorHint: updateError?.hint,
    }))
    
    if (updateError) {
      console.error('[FoundryActions] Update failed:', JSON.stringify({
        foundryId,
        error: updateError.message,
        code: updateError.code,
        details: updateError.details,
        hint: updateError.hint,
      }))
      return { success: false, error: `Failed to update: ${updateError.message}` }
    }
    
    // AUDIT: Log the purpose update
    console.info('[FoundryActions] Foundry purpose updated:', {
      foundryId,
      updatedBy: user.id,
      hasPurpose: !!purposeData.purpose,
      hasMission: !!purposeData.mission,
      hasVision: !!purposeData.vision,
    })
    
    // Revalidate objectives page where purpose is displayed
    revalidatePath('/objectives')
    revalidatePath(`/foundry/${foundryId}`)
    
    return { 
      success: true, 
      error: null,
      data 
    }
  } catch (error) {
    console.error('[FoundryActions] Unexpected error updating purpose:', {
      foundryId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return { 
      success: false, 
      error: 'An unexpected error occurred' 
    }
  }
}

/**
 * Fetches foundry purpose data.
 * 
 * @description Retrieves the foundry's purpose, mission, and vision data.
 * Accessible by all members of the foundry.
 * 
 * @param {string} foundryId - The foundry to fetch purpose for
 * 
 * @returns {Promise<ActionResult>} Success status with purpose data or error
 * 
 * @security Users can only fetch purpose for their own foundry (foundry isolation)
 * 
 * @example
 * const result = await getFoundryPurpose(foundryId)
 * if (result.success) {
 *   const purpose = result.data as FoundryPurposeData
 * }
 */
export async function getFoundryPurpose(
  foundryId: string
): Promise<ActionResult> {
  const supabase = await createClient()
  
  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }
  
  // AUTH: Get current user's profile to verify foundry membership
  const { data: currentProfile, error: profileError } = await supabase
    .from('profiles')
    .select('foundry_id')
    .eq('id', user.id)
    .single()
  
  if (profileError || !currentProfile) {
    return { success: false, error: 'User profile not found' }
  }
  
  // AUTH: Verify user belongs to the foundry
  if (currentProfile.foundry_id !== foundryId) {
    return { success: false, error: 'Cannot access purpose for different foundry' }
  }
  
  try {
    // Fetch foundry with purpose_data
    const { data, error: fetchError } = await supabase
      .from('foundries')
      .select('id, name, purpose_data')
      .eq('id', foundryId)
      .single()
    
    if (fetchError) {
      console.error('[FoundryActions] Failed to fetch purpose:', {
        foundryId,
        error: fetchError.message,
      })
      return { success: false, error: 'Failed to fetch company purpose' }
    }
    
    return { 
      success: true, 
      error: null,
      data: data.purpose_data as FoundryPurposeData | null
    }
  } catch (error) {
    console.error('[FoundryActions] Unexpected error fetching purpose:', {
      foundryId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return { 
      success: false, 
      error: 'An unexpected error occurred' 
    }
  }
}
