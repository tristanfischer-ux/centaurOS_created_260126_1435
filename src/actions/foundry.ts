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
import { revalidatePath } from 'next/cache'
import type { FoundryPurposeData, CompanyProfile } from '@/types/foundry'

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
    // Update foundry purpose_data via RPC function (SECURITY DEFINER)
    // SECURITY: The DB function verifies auth.uid(), foundry ownership, and Founder role internally.
    // This avoids needing a service role key / admin client entirely.
    const { data, error: rpcError } = await supabase.rpc('update_foundry_purpose', {
      p_foundry_id: foundryId,
      p_purpose_data: purposeData as unknown as Record<string, unknown>,
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
}

// --- Create Foundry (Solopreneur Journey) ---

/**
 * Creates a new foundry for the current user, enabling the transition
 * from Apprentice/Executive to business owner.
 * 
 * @description Allows any authenticated user to create their own foundry (business).
 * The user becomes the Founder of the new foundry while keeping their existing
 * memberships (e.g., The Forge Guild). Uses dual membership via foundry_memberships.
 * 
 * @param {string} companyName - Name of the new business (required, max 100 chars)
 * @param {string | null} industry - Business industry category
 * @param {string | null} stage - Business stage (idea, side_project, full_time, revenue)
 * 
 * @returns {Promise<ActionResult>} Success with foundry data { foundry_id, slug, name } or error
 * 
 * @throws {Error} If user is not authenticated
 * @throws {Error} If company name is empty or exceeds 100 chars
 * @throws {Error} If user already owns 3+ foundries (rate limit)
 * 
 * @security Authenticated users only. RPC function validates caller identity.
 * @audit Logs foundry_created event with foundry_id and created_by
 * 
 * @example
 * const result = await createFoundry('My Startup', 'technology', 'idea')
 * if (result.success) {
 *   router.refresh() // Sidebar will show new foundry
 * }
 */
export async function createFoundry(
  companyName: string,
  industry: string | null = null,
  stage: string | null = null
): Promise<ActionResult> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // VALIDATION: Company name is required
  const trimmedName = companyName?.trim()
  if (!trimmedName || trimmedName.length === 0) {
    return { success: false, error: 'Company name is required' }
  }

  // VALIDATION: Company name length
  if (trimmedName.length > 100) {
    return { success: false, error: 'Company name must be 100 characters or less' }
  }

  try {
    // Call the database function to create foundry atomically
    // SECURITY: The RPC function validates auth.uid() matches p_user_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: rpcError } = await (supabase as any).rpc('create_user_foundry', {
      p_user_id: user.id,
      p_company_name: trimmedName,
      p_industry: industry,
      p_stage: stage,
    })

    if (rpcError) {
      console.error('[FoundryActions] Failed to create foundry:', {
        userId: user.id,
        companyName: trimmedName,
        error: rpcError.message,
        code: rpcError.code,
      })

      // Return user-friendly error messages
      if (rpcError.message?.includes('maximum of 3')) {
        return { success: false, error: 'You can own a maximum of 3 businesses' }
      }

      return { success: false, error: 'Failed to create your business. Please try again.' }
    }

    // AUDIT: Log successful foundry creation
    console.info('[FoundryActions] Foundry created from platform:', {
      foundryId: data?.foundry_id,
      companyName: trimmedName,
      createdBy: user.id,
      industry,
      stage,
    })

    // Clear the foundry cache so the UI reflects the new foundry
    const { clearFoundryCache } = await import('@/lib/supabase/foundry-context')
    clearFoundryCache(user.id)

    // Revalidate all paths since foundry context affects everything
    revalidatePath('/', 'layout')

    return {
      success: true,
      error: null,
      data,
    }
  } catch (error) {
    console.error('[FoundryActions] Unexpected error creating foundry:', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return {
      success: false,
      error: 'An unexpected error occurred',
    }
  }
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
}
