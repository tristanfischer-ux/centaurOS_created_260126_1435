'use server'

/**
 * @file foundry.ts
 * 
 * @description Server actions for foundry (company) management including purpose/mission/vision.
 * 
 * @security Only founders can update foundry data
 * @audit Foundry updates are logged to audit trail
 */

import { revalidatePath } from 'next/cache'
import { withAuth } from '@/lib/server-action-utils'
import type { FoundryPurposeData, CompanyProfile } from '@/types/foundry'
import type { Json } from '@/types/database.types'

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
  return withAuth(async ({ supabase, user }) => {
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
      // Update foundry purpose_data via RPC function (SECURITY DEFINER)
      // SECURITY: The DB function verifies auth.uid(), foundry ownership, and Founder role internally.
      // This avoids needing a service role key / admin client entirely.
      const { data, error: rpcError } = await supabase.rpc('update_foundry_purpose', {
        p_foundry_id: foundryId,
        p_purpose_data: purposeData as unknown as Json,
      })
      
      if (rpcError) {
        console.error('[FoundryActions] Failed to update purpose via RPC:', {
          foundryId,
          error: rpcError.message,
          code: rpcError.code,
        })
        return { success: false, error: `Failed to update company purpose: ${rpcError.message}` }
      }
      
      // AUDIT: Log the purpose update
      console.info('[FoundryActions] Foundry purpose updated:', {
        foundryId,
        updatedBy: user.id,
        hasPurpose: !!purposeData.purpose,
        hasMission: !!purposeData.mission,
        hasVision: !!purposeData.vision,
      })
      
      // Revalidate objectives pages where purpose is displayed
      revalidatePath('/objectives')
      revalidatePath('/new-objectives')
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
  })
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
  return withAuth(async ({ supabase, user }) => {
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
      // Fetch foundry with purpose_data via RPC (bypasses RLS issue on foundries table)
      const { data, error: fetchError } = await supabase.rpc('ensure_foundry_exists', {
        p_foundry_id: foundryId,
      })
      
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
        data: (data as { purpose_data?: FoundryPurposeData | null })?.purpose_data ?? null
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
  })
}

// --- Company Profile Actions ---

/**
 * Updates the foundry's company profile (stage, size, revenue, funding status).
 * 
 * @description Allows founders to set structured company context so the AI
 * can provide more relevant recommendations across advisory, marketplace,
 * and workflow features.
 * 
 * @param {string} foundryId - The foundry to update
 * @param {CompanyProfile} profileData - Complete company profile data
 * 
 * @returns {Promise<ActionResult>} Success status with error message if failed
 * 
 * @security Only founders can update company profile
 * @audit Logs company_profile_updated event
 */
export async function updateCompanyProfile(
  foundryId: string,
  profileData: CompanyProfile
): Promise<ActionResult> {
  return withAuth(async ({ supabase, user }) => {
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

    // AUTH: Verify user belongs to this foundry
    if (currentProfile.foundry_id !== foundryId) {
      console.warn('[FoundryActions] Foundry isolation violation attempt (company profile):', {
        userId: user.id,
        userFoundryId: currentProfile.foundry_id,
        targetFoundryId: foundryId,
      })
      return { success: false, error: 'Cannot update profile for different foundry' }
    }

    // AUTH: Only founders can update company profile
    if (currentProfile.role !== 'Founder') {
      console.warn('[FoundryActions] Non-founder attempted to update company profile:', {
        userId: user.id,
        role: currentProfile.role,
        foundryId,
      })
      return { success: false, error: 'Only founders can update company profile' }
    }

    // VALIDATION: Ensure metadata is set
    if (!profileData.updatedAt || !profileData.updatedBy) {
      return { success: false, error: 'Update metadata is required' }
    }

    try {
      const { data, error: rpcError } = await supabase.rpc('update_company_profile', {
        p_foundry_id: foundryId,
        p_company_profile: profileData as unknown as Record<string, unknown>,
      })

      if (rpcError) {
        console.error('[FoundryActions] Failed to update company profile via RPC:', {
          foundryId,
          error: rpcError.message,
          code: rpcError.code,
        })
        return { success: false, error: `Failed to update company profile: ${rpcError.message}` }
      }

      // AUDIT: Log the profile update
      console.info('[FoundryActions] Company profile updated:', {
        foundryId,
        updatedBy: user.id,
        hasEmployeeCount: !!profileData.employee_count,
        hasRevenueRange: !!profileData.revenue_range,
        hasFundingStatus: !!profileData.funding_status,
      })

      // Revalidate pages that use company context
      revalidatePath('/settings')
      revalidatePath('/objectives')
      revalidatePath('/advisory')

      return {
        success: true,
        error: null,
        data,
      }
    } catch (error) {
      console.error('[FoundryActions] Unexpected error updating company profile:', {
        foundryId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return {
        success: false,
        error: 'An unexpected error occurred',
      }
    }
  })
}

/**
 * Fetches foundry company profile data.
 * 
 * @description Retrieves the foundry's structured company profile.
 * Accessible by all members of the foundry.
 * 
 * @param {string} foundryId - The foundry to fetch profile for
 * 
 * @returns {Promise<ActionResult>} Success status with company profile data or error
 * 
 * @security Users can only fetch profile for their own foundry (foundry isolation)
 */
export async function getCompanyProfile(
  foundryId: string
): Promise<ActionResult> {
  return withAuth(async ({ supabase, user }) => {
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
      return { success: false, error: 'Cannot access profile for different foundry' }
    }

    try {
      // Fetch foundry data via RPC (bypasses RLS issue on foundries table)
      const { data, error: fetchError } = await supabase.rpc('ensure_foundry_exists', {
        p_foundry_id: foundryId,
      })

      if (fetchError) {
        console.error('[FoundryActions] Failed to fetch company profile:', {
          foundryId,
          error: fetchError.message,
        })
        return { success: false, error: 'Failed to fetch company profile' }
      }

      return {
        success: true,
        error: null,
        data: (data as { company_profile?: CompanyProfile | null })?.company_profile ?? null,
      }
    } catch (error) {
      console.error('[FoundryActions] Unexpected error fetching company profile:', {
        foundryId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return {
        success: false,
        error: 'An unexpected error occurred',
      }
    }
  })
}
