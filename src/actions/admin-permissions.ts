// @ts-nocheck
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

// Type for admin permission record
export interface FoundryAdminPermission {
    id: string
    foundry_id: string
    profile_id: string
    granted_by: string
    created_at: string
    profile?: {
        id: string
        full_name: string | null
        email: string
        role: string
    }
    granter?: {
        id: string
        full_name: string | null
    }
}

/**
 * Check if the current user has foundry admin access
 * Founders always have admin access, others need explicit permission
 */
export async function hasFoundryAdminAccess(): Promise<boolean> {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return false
    
    // Check if user is a Founder
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
    
    if (profile?.role === 'Founder') {
        return true
    }
    
    // Check for explicit admin permission
    const { data: permission } = await supabase
        .from('foundry_admin_permissions')
        .select('id')
        .eq('foundry_id', foundry_id)
        .eq('profile_id', user.id)
        .maybeSingle()
    
    return !!permission
}

/**
 * Grant foundry admin permission to a user
 * Only Founders can grant admin permissions
 */
export async function grantAdminPermission(profileId: string): Promise<{ success?: boolean; error?: string }> {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }
    
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }
    
    // Verify current user is a Founder
    const { data: currentProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
    
    if (currentProfile?.role !== 'Founder') {
        return { error: 'Only Founders can grant admin permissions' }
    }
    
    // Verify target user is in the same foundry
    const { data: targetProfile } = await supabase
        .from('profiles')
        .select('foundry_id, role')
        .eq('id', profileId)
        .single()
    
    if (!targetProfile || targetProfile.foundry_id !== foundry_id) {
        return { error: 'User not found in your foundry' }
    }
    
    // Don't grant to Founders (they already have access)
    if (targetProfile.role === 'Founder') {
        return { error: 'Founders already have admin access' }
    }
    
    // Check if permission already exists
    const { data: existing } = await supabase
        .from('foundry_admin_permissions')
        .select('id')
        .eq('foundry_id', foundry_id)
        .eq('profile_id', profileId)
        .maybeSingle()
    
    if (existing) {
        return { error: 'User already has admin permission' }
    }
    
    // Grant permission
    const { error } = await supabase
        .from('foundry_admin_permissions')
        .insert({
            foundry_id,
            profile_id: profileId,
            granted_by: user.id
        })
    
    if (error) {
        return { error: error.message }
    }
    
    revalidatePath('/team')
    return { success: true }
}

/**
 * Revoke foundry admin permission from a user
 * Only Founders can revoke admin permissions
 */
export async function revokeAdminPermission(profileId: string): Promise<{ success?: boolean; error?: string }> {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }
    
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }
    
    // Verify current user is a Founder
    const { data: currentProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
    
    if (currentProfile?.role !== 'Founder') {
        return { error: 'Only Founders can revoke admin permissions' }
    }
    
    // Revoke permission
    const { error } = await supabase
        .from('foundry_admin_permissions')
        .delete()
        .eq('foundry_id', foundry_id)
        .eq('profile_id', profileId)
    
    if (error) {
        return { error: error.message }
    }
    
    revalidatePath('/team')
    return { success: true }
}

/**
 * List all users with admin permissions in the foundry
 */
export async function listAdminUsers(): Promise<{ 
    users: FoundryAdminPermission[]
    founders: Array<{ id: string; full_name: string | null; email: string }>
    error?: string 
}> {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { users: [], founders: [], error: 'Unauthorized' }
    
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { users: [], founders: [], error: 'User not in a foundry' }
    
    // Get Founders (always have admin access)
    const { data: founders } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('foundry_id', foundry_id)
        .eq('role', 'Founder')
    
    // Get explicitly granted permissions
    const { data: permissions, error } = await supabase
        .from('foundry_admin_permissions')
        .select(`
            id,
            foundry_id,
            profile_id,
            granted_by,
            created_at,
            profile:profiles!foundry_admin_permissions_profile_id_fkey(id, full_name, email, role),
            granter:profiles!foundry_admin_permissions_granted_by_fkey(id, full_name)
        `)
        .eq('foundry_id', foundry_id)
    
    if (error) {
        return { users: [], founders: founders || [], error: error.message }
    }
    
    return { 
        users: (permissions || []) as unknown as FoundryAdminPermission[], 
        founders: founders || [] 
    }
}

/**
 * Get foundry members who don't have admin access yet
 * Useful for the "grant admin" dropdown
 */
export async function getNonAdminMembers(): Promise<{
    members: Array<{ id: string; full_name: string | null; email: string; role: string }>
    error?: string
}> {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { members: [], error: 'Unauthorized' }
    
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { members: [], error: 'User not in a foundry' }
    
    // Get all foundry members
    const { data: allMembers } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('foundry_id', foundry_id)
        .eq('is_active', true)
    
    // Get existing admin permissions
    const { data: existingPermissions } = await supabase
        .from('foundry_admin_permissions')
        .select('profile_id')
        .eq('foundry_id', foundry_id)
    
    const adminIds = new Set(existingPermissions?.map(p => p.profile_id) || [])
    
    // Filter out Founders and users who already have admin permission
    const nonAdminMembers = (allMembers || []).filter(
        m => m.role !== 'Founder' && !adminIds.has(m.id)
    )
    
    return { members: nonAdminMembers }
}
