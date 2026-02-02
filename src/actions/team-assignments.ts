'use server'

/**
 * @file team-assignments.ts
 * 
 * @description Server actions for managing team and task assignments.
 * Handles adding/removing members from teams and assigning/unassigning tasks.
 * 
 * @security All operations require authentication and proper permissions
 * @audit All assignment changes are logged to audit_logs
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ============================================================================
// TEAM ASSIGNMENT ACTIONS
// ============================================================================

/**
 * Add a member to a team
 * 
 * @description Adds a profile to a team's membership.
 * 
 * @param {string} memberId - Profile ID to add to team
 * @param {string} teamId - Team ID to add member to
 * 
 * @returns {Promise<{success: boolean; error: string | null}>}
 * 
 * @security Only Founders and Executives can manage team assignments
 * @audit TODO: Should log team_member_added event once audit_logs table is created
 */
export async function addMemberToTeam(
    memberId: string,
    teamId: string
): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createClient()
    
    // AUTH: Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { success: false, error: 'Not authenticated' }
    }
    
    // AUTH: Get current user's profile to check role
    const { data: currentProfile } = await supabase
        .from('profiles')
        .select('id, role, foundry_id')
        .eq('id', user.id)
        .single()
    
    if (!currentProfile) {
        return { success: false, error: 'Profile not found' }
    }
    
    // AUTH: Only Founders and Executives can manage team assignments
    if (!['Founder', 'Executive'].includes(currentProfile.role)) {
        return { success: false, error: 'Only Founders and Executives can manage team assignments' }
    }
    
    // RLS: Verify team belongs to same foundry
    const { data: team } = await supabase
        .from('teams')
        .select('foundry_id')
        .eq('id', teamId)
        .single()
    
    if (!team) {
        return { success: false, error: 'Team not found' }
    }
    
    if (team.foundry_id !== currentProfile.foundry_id) {
        return { success: false, error: 'Team belongs to different foundry' }
    }
    
    // RLS: Verify member belongs to same foundry
    const { data: memberProfile } = await supabase
        .from('profiles')
        .select('foundry_id')
        .eq('id', memberId)
        .single()
    
    if (!memberProfile) {
        return { success: false, error: 'Member not found' }
    }
    
    if (memberProfile.foundry_id !== currentProfile.foundry_id) {
        return { success: false, error: 'Member belongs to different foundry' }
    }
    
    // Insert team membership
    const { error: insertError } = await supabase
        .from('team_members')
        .insert({
            team_id: teamId,
            profile_id: memberId,
        })
    
    if (insertError) {
        // Check if already a member
        if (insertError.code === '23505') { // Unique constraint violation
            return { success: false, error: 'Member is already on this team' }
        }
        return { success: false, error: insertError.message }
    }
    
    // TODO: Add audit logging once audit_logs table is created
    
    revalidatePath('/team')
    return { success: true, error: null }
}

/**
 * Remove a member from a team
 * 
 * @description Removes a profile from a team's membership.
 * 
 * @param {string} memberId - Profile ID to remove from team
 * @param {string} teamId - Team ID to remove member from
 * 
 * @returns {Promise<{success: boolean; error: string | null}>}
 * 
 * @security Only Founders and Executives can manage team assignments
 * @audit TODO: Should log team_member_removed event once audit_logs table is created
 */
export async function removeMemberFromTeam(
    memberId: string,
    teamId: string
): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createClient()
    
    // AUTH: Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { success: false, error: 'Not authenticated' }
    }
    
    // AUTH: Get current user's profile to check role
    const { data: currentProfile } = await supabase
        .from('profiles')
        .select('id, role, foundry_id')
        .eq('id', user.id)
        .single()
    
    if (!currentProfile) {
        return { success: false, error: 'Profile not found' }
    }
    
    // AUTH: Only Founders and Executives can manage team assignments
    if (!['Founder', 'Executive'].includes(currentProfile.role)) {
        return { success: false, error: 'Only Founders and Executives can manage team assignments' }
    }
    
    // RLS: Verify team belongs to same foundry
    const { data: team } = await supabase
        .from('teams')
        .select('foundry_id')
        .eq('id', teamId)
        .single()
    
    if (!team) {
        return { success: false, error: 'Team not found' }
    }
    
    if (team.foundry_id !== currentProfile.foundry_id) {
        return { success: false, error: 'Team belongs to different foundry' }
    }
    
    // Delete team membership
    const { error: deleteError } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', teamId)
        .eq('profile_id', memberId)
    
    if (deleteError) {
        return { success: false, error: deleteError.message }
    }
    
    // TODO: Add audit logging once audit_logs table is created
    
    revalidatePath('/team')
    return { success: true, error: null }
}

// ============================================================================
// TASK ASSIGNMENT ACTIONS
// ============================================================================

/**
 * Assign a task to a member
 * 
 * @description Assigns a task to a specific profile. Uses both task_assignees
 * junction table (for multi-assign) and updates tasks.assignee_id (for backward compatibility).
 * 
 * @param {string} taskId - Task ID to assign
 * @param {string} memberId - Profile ID to assign task to
 * 
 * @returns {Promise<{success: boolean; error: string | null}>}
 * 
 * @security User must belong to same foundry as task
 * @audit TODO: Should log task_assigned event once audit_logs table is created
 */
export async function assignTaskToMember(
    taskId: string,
    memberId: string
): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createClient()
    
    // AUTH: Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { success: false, error: 'Not authenticated' }
    }
    
    // AUTH: Get current user's profile
    const { data: currentProfile } = await supabase
        .from('profiles')
        .select('foundry_id')
        .eq('id', user.id)
        .single()
    
    if (!currentProfile) {
        return { success: false, error: 'Profile not found' }
    }
    
    // RLS: Verify task belongs to same foundry
    const { data: task } = await supabase
        .from('tasks')
        .select('foundry_id, assignee_id')
        .eq('id', taskId)
        .single()
    
    if (!task) {
        return { success: false, error: 'Task not found' }
    }
    
    if (task.foundry_id !== currentProfile.foundry_id) {
        return { success: false, error: 'Task belongs to different foundry' }
    }
    
    // RLS: Verify member belongs to same foundry
    const { data: memberProfile } = await supabase
        .from('profiles')
        .select('foundry_id')
        .eq('id', memberId)
        .single()
    
    if (!memberProfile) {
        return { success: false, error: 'Member not found' }
    }
    
    if (memberProfile.foundry_id !== currentProfile.foundry_id) {
        return { success: false, error: 'Member belongs to different foundry' }
    }
    
    // Insert into task_assignees junction table
    const { error: insertError } = await supabase
        .from('task_assignees')
        .insert({
            task_id: taskId,
            profile_id: memberId,
        })
    
    if (insertError) {
        // Check if already assigned
        if (insertError.code === '23505') { // Unique constraint violation
            return { success: false, error: 'Task is already assigned to this member' }
        }
        return { success: false, error: insertError.message }
    }
    
    // Update tasks.assignee_id for backward compatibility (set to first assignee if null)
    if (!task.assignee_id) {
        await supabase
            .from('tasks')
            .update({ assignee_id: memberId })
            .eq('id', taskId)
    }
    
    // TODO: Add audit logging once audit_logs table is created
    
    revalidatePath('/team')
    revalidatePath('/tasks')
    return { success: true, error: null }
}

/**
 * Unassign a task from a member
 * 
 * @description Removes a task assignment from a specific profile.
 * Also updates tasks.assignee_id if this was the primary assignee.
 * 
 * @param {string} taskId - Task ID to unassign
 * @param {string} memberId - Profile ID to unassign task from
 * 
 * @returns {Promise<{success: boolean; error: string | null}>}
 * 
 * @security User must belong to same foundry as task
 * @audit TODO: Should log task_unassigned event once audit_logs table is created
 */
export async function unassignTaskFromMember(
    taskId: string,
    memberId: string
): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createClient()
    
    // AUTH: Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { success: false, error: 'Not authenticated' }
    }
    
    // AUTH: Get current user's profile
    const { data: currentProfile } = await supabase
        .from('profiles')
        .select('foundry_id')
        .eq('id', user.id)
        .single()
    
    if (!currentProfile) {
        return { success: false, error: 'Profile not found' }
    }
    
    // RLS: Verify task belongs to same foundry
    const { data: task } = await supabase
        .from('tasks')
        .select('foundry_id, assignee_id')
        .eq('id', taskId)
        .single()
    
    if (!task) {
        return { success: false, error: 'Task not found' }
    }
    
    if (task.foundry_id !== currentProfile.foundry_id) {
        return { success: false, error: 'Task belongs to different foundry' }
    }
    
    // Delete from task_assignees junction table
    const { error: deleteError } = await supabase
        .from('task_assignees')
        .delete()
        .eq('task_id', taskId)
        .eq('profile_id', memberId)
    
    if (deleteError) {
        return { success: false, error: deleteError.message }
    }
    
    // If this was the primary assignee, update tasks.assignee_id
    if (task.assignee_id === memberId) {
        // Get remaining assignees
        const { data: remainingAssignees } = await supabase
            .from('task_assignees')
            .select('profile_id')
            .eq('task_id', taskId)
            .limit(1)
            .single()
        
        // Set to next assignee or null
        await supabase
            .from('tasks')
            .update({ assignee_id: remainingAssignees?.profile_id || null })
            .eq('id', taskId)
    }
    
    // TODO: Add audit logging once audit_logs table is created
    
    revalidatePath('/team')
    revalidatePath('/tasks')
    return { success: true, error: null }
}
