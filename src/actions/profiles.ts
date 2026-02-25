'use server'

/**
 * @file profiles.ts
 * 
 * @description Server actions for updating user profile information.
 * 
 * @security Users can edit their own profiles, Founders/Executives can edit any profile in their foundry
 * @audit TODO: Profile updates should be logged once audit_logs table is created
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'

/**
 * Validates email format
 */
function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
}

/**
 * Validates LinkedIn URL format
 */
function isValidLinkedInUrl(url: string): boolean {
    if (!url) return true // Empty is valid (optional field)
    const linkedInRegex = /^https?:\/\/(www\.)?linkedin\.com\/(in|company)\/[a-zA-Z0-9_-]+\/?$/
    return linkedInRegex.test(url)
}

/**
 * Update profile details
 * 
 * @description Updates editable fields on a user profile. Users can edit their own
 * profiles, and Founders/Executives can edit any profile in their foundry.
 * 
 * @param {string} profileId - Profile ID to update
 * @param {Object} updates - Fields to update
 * @param {string} [updates.full_name] - User's full name
 * @param {string} [updates.email] - User's email address
 * @param {string} [updates.role] - User's role (Founder | Executive | Apprentice | AI_Agent)
 * @param {string} [updates.bio] - User's bio/about text (markdown supported)
 * @param {string} [updates.phone_number] - User's phone number
 * @param {string} [updates.linkedin_url] - User's LinkedIn profile URL
 * 
 * @returns {Promise<{success: boolean; error: string | null}>}
 * 
 * @throws {Error} If user lacks permission or validation fails
 * 
 * @security Authenticated users can edit own profile, Founders/Executives can edit any
 * @audit TODO: Should log profile_updated event once audit_logs table is created
 */
export async function updateProfileDetails(
    profileId: string,
    updates: {
        full_name?: string
        email?: string
        role?: string
        bio?: string
        phone_number?: string
        linkedin_url?: string
    }
): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createClient()
    
    // AUTH: Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { success: false, error: 'Not authenticated' }
    }
    
    // AUTH: Get current user's profile to check permissions
    const { data: currentProfile } = await supabase
        .from('profiles')
        .select('id, role, foundry_id')
        .eq('id', user.id)
        .single()
    
    if (!currentProfile) {
        return { success: false, error: 'Current user profile not found' }
    }
    
    // AUTH: Get target profile to verify foundry isolation
    const { data: targetProfile } = await supabase
        .from('profiles')
        .select('id, foundry_id')
        .eq('id', profileId)
        .single()
    
    if (!targetProfile) {
        return { success: false, error: 'Profile not found' }
    }
    
    // AUTH: Check permission - own profile OR Founder/Executive in same foundry
    const isOwnProfile = currentProfile.id === profileId
    const canEditAnyProfile = ['Founder', 'Executive'].includes(currentProfile.role) && 
                               currentProfile.foundry_id === targetProfile.foundry_id
    
    if (!isOwnProfile && !canEditAnyProfile) {
        return { success: false, error: 'Permission denied: You can only edit your own profile' }
    }
    
    // VALIDATION: Check required fields
    if (updates.full_name !== undefined && updates.full_name.trim() === '') {
        return { success: false, error: 'Full name is required' }
    }
    
    if (updates.email !== undefined && updates.email.trim() === '') {
        return { success: false, error: 'Email is required' }
    }
    
    // VALIDATION: Email format
    if (updates.email && !isValidEmail(updates.email)) {
        return { success: false, error: 'Invalid email format' }
    }
    
    // VALIDATION: LinkedIn URL format
    if (updates.linkedin_url && !isValidLinkedInUrl(updates.linkedin_url)) {
        return { success: false, error: 'Invalid LinkedIn URL format. Must be like: https://linkedin.com/in/username' }
    }
    
    // VALIDATION: Role must be valid enum value
    if (updates.role && !['Founder', 'Executive', 'Apprentice', 'AI_Agent'].includes(updates.role)) {
        return { success: false, error: 'Invalid role. Must be Founder, Executive, Apprentice, or AI_Agent' }
    }
    
    // Build update object (only include provided fields)
    const updateData: Record<string, unknown> = {}
    if (updates.full_name !== undefined) updateData.full_name = updates.full_name.trim()
    if (updates.email !== undefined) updateData.email = updates.email.trim()
    if (updates.role !== undefined) updateData.role = updates.role
    if (updates.bio !== undefined) updateData.bio = updates.bio
    if (updates.phone_number !== undefined) updateData.phone_number = updates.phone_number.trim() || null
    if (updates.linkedin_url !== undefined) updateData.linkedin_url = updates.linkedin_url.trim() || null
    
    // Add updated_at timestamp
    updateData.updated_at = new Date().toISOString()
    
    // Update profile
    const { error: updateError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', profileId)
    
    if (updateError) {
        // Handle unique constraint violations (e.g., email already exists)
        if (updateError.code === '23505') {
            return { success: false, error: 'Email address is already in use' }
        }
        return { success: false, error: sanitizeErrorMessage(updateError) }
    }
    
    // TODO(TECH-DEBT): Add audit logging for profile updates
    
    // Revalidate relevant pages
    revalidatePath('/team')
    revalidatePath(`/team/${profileId}`)
    
    return { success: true, error: null }
}
