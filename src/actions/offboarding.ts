'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

export type OffboardingAction = 'reassign_delete' | 'soft_delete' | 'anonymize'

export interface OffboardingTask {
    task_id: string
    task_title: string
    task_status: string
    relationship_type: 'creator' | 'assignee'
    current_assignee_name: string | null
}

/**
 * Log an admin action to the audit trail
 */
async function logAdminAction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    foundryId: string,
    actorId: string,
    action: string,
    targetUserId?: string,
    details?: Record<string, unknown>
) {
    try {
        await supabase.from('foundry_admin_audit_log').insert({
            foundry_id: foundryId,
            actor_id: actorId,
            action,
            target_user_id: targetUserId || null,
            details: details || {}
        })
    } catch (err) {
        // Don't fail the main operation if audit logging fails
        console.error('Failed to log admin action:', err)
    }
}

/**
 * Get all tasks that need attention during offboarding
 */
export async function getOffboardingTasks(userId: string): Promise<{
    tasks: OffboardingTask[]
    error?: string
}> {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { tasks: [], error: 'Unauthorized' }
    
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { tasks: [], error: 'User not in a foundry' }
    
    // Verify current user has permission (Executive/Founder only)
    const { data: currentProfile } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', user.id)
        .single()
    
    if (!currentProfile || !currentProfile.is_active) {
        return { tasks: [], error: 'Your account is not active' }
    }
    
    if (currentProfile.role !== 'Executive' && currentProfile.role !== 'Founder') {
        return { tasks: [], error: 'Only Executives and Founders can offboard users' }
    }
    
    // Get tasks created by the user
    const { data: createdTasks } = await supabase
        .from('tasks')
        .select('id, title, status, assignee_id, profiles!tasks_assignee_id_fkey(full_name)')
        .eq('creator_id', userId)
        .eq('foundry_id', foundry_id)
    
    // Get tasks assigned to the user (via assignee_id)
    const { data: assignedTasks } = await supabase
        .from('tasks')
        .select('id, title, status')
        .eq('assignee_id', userId)
        .eq('foundry_id', foundry_id)
    
    // Get tasks from task_assignees table
    const { data: taskAssignees } = await supabase
        .from('task_assignees')
        .select('task_id, tasks!inner(id, title, status, foundry_id)')
        .eq('profile_id', userId)
    
    const tasks: OffboardingTask[] = []
    const seenTaskIds = new Set<string>()
    
    // Add created tasks
    for (const task of createdTasks || []) {
        if (!seenTaskIds.has(`${task.id}-creator`)) {
            tasks.push({
                task_id: task.id,
                task_title: task.title,
                task_status: String(task.status),
                relationship_type: 'creator',
                current_assignee_name: (task.profiles as { full_name: string | null } | null)?.full_name || null
            })
            seenTaskIds.add(`${task.id}-creator`)
        }
    }
    
    // Add directly assigned tasks
    for (const task of assignedTasks || []) {
        if (!seenTaskIds.has(`${task.id}-assignee`)) {
            tasks.push({
                task_id: task.id,
                task_title: task.title,
                task_status: String(task.status),
                relationship_type: 'assignee',
                current_assignee_name: null
            })
            seenTaskIds.add(`${task.id}-assignee`)
        }
    }
    
    // Add task_assignees tasks
    for (const ta of taskAssignees || []) {
        const task = ta.tasks as { id: string; title: string; status: string; foundry_id: string }
        if (task.foundry_id === foundry_id && !seenTaskIds.has(`${task.id}-assignee`)) {
            tasks.push({
                task_id: task.id,
                task_title: task.title,
                task_status: String(task.status),
                relationship_type: 'assignee',
                current_assignee_name: null
            })
            seenTaskIds.add(`${task.id}-assignee`)
        }
    }
    
    return { tasks }
}

/**
 * Offboard a member from the foundry
 * Supports three modes: reassign_delete, soft_delete, anonymize
 * 
 * RED TEAM FIXES:
 * - Prevents offboarding the last active Founder
 * - Cancels pending invitations from the departing user
 * - Logs all actions to audit trail
 * - Uses transaction-like error handling
 */
export async function offboardMember(
    memberId: string,
    action: OffboardingAction,
    reassignments: Record<string, string> = {}
): Promise<{ success?: boolean; error?: string }> {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }
    
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }
    
    // Verify current user has permission (Executive/Founder only)
    const { data: currentProfile } = await supabase
        .from('profiles')
        .select('id, role, is_active')
        .eq('id', user.id)
        .single()
    
    if (!currentProfile || !currentProfile.is_active) {
        return { error: 'Your account is not active' }
    }
    
    if (currentProfile.role !== 'Executive' && currentProfile.role !== 'Founder') {
        return { error: 'Only Executives and Founders can offboard users' }
    }
    
    // Get the member being offboarded
    const { data: memberProfile } = await supabase
        .from('profiles')
        .select('foundry_id, role, full_name, email, is_active')
        .eq('id', memberId)
        .single()
    
    if (!memberProfile || memberProfile.foundry_id !== foundry_id) {
        return { error: 'Member not found in your foundry' }
    }
    
    // RED TEAM FIX: Prevent offboarding already deactivated users
    if (!memberProfile.is_active && action !== 'reassign_delete') {
        return { error: 'This user has already been deactivated' }
    }
    
    // Prevent offboarding Founders (only another Founder can do this)
    if (memberProfile.role === 'Founder' && currentProfile.role !== 'Founder') {
        return { error: 'Only Founders can offboard other Founders' }
    }
    
    // RED TEAM FIX: Prevent offboarding the LAST active Founder
    if (memberProfile.role === 'Founder') {
        const { count } = await supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('foundry_id', foundry_id)
            .eq('role', 'Founder')
            .eq('is_active', true)
        
        if ((count || 0) <= 1) {
            return { error: 'Cannot offboard the last active Founder. Promote another user to Founder first.' }
        }
    }
    
    // Prevent self-offboarding
    if (memberId === user.id) {
        return { error: 'Cannot offboard yourself' }
    }
    
    // Process reassignments if provided
    if (Object.keys(reassignments).length > 0) {
        for (const [key, assigneeId] of Object.entries(reassignments)) {
            const [taskId, relationshipType] = key.split('-')
            
            if (relationshipType === 'creator') {
                // Reassign creator
                const newCreatorId = assigneeId === 'unassign' ? currentProfile.id : assigneeId
                await supabase
                    .from('tasks')
                    .update({ creator_id: newCreatorId })
                    .eq('id', taskId)
                    .eq('creator_id', memberId)
            } else if (relationshipType === 'assignee') {
                if (assigneeId === 'unassign') {
                    // Unassign from task
                    await supabase
                        .from('tasks')
                        .update({ assignee_id: null })
                        .eq('id', taskId)
                        .eq('assignee_id', memberId)
                    
                    await supabase
                        .from('task_assignees')
                        .delete()
                        .eq('task_id', taskId)
                        .eq('profile_id', memberId)
                } else {
                    // Reassign to new person
                    await supabase
                        .from('tasks')
                        .update({ assignee_id: assigneeId })
                        .eq('id', taskId)
                        .eq('assignee_id', memberId)
                    
                    // Update task_assignees
                    await supabase
                        .from('task_assignees')
                        .update({ profile_id: assigneeId })
                        .eq('task_id', taskId)
                        .eq('profile_id', memberId)
                }
            }
        }
    }
    
    // RED TEAM FIX: Cancel any pending invitations sent BY the departing user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
        .from('company_invitations')
        .delete()
        .eq('invited_by', memberId)
        .is('accepted_at', null)
    
    // Perform the offboarding action
    switch (action) {
        case 'reassign_delete': {
            // Reassign any remaining objectives
            await supabase
                .from('objectives')
                .update({ creator_id: currentProfile.id })
                .eq('creator_id', memberId)
            
            // Reassign any remaining tasks created by member
            await supabase
                .from('tasks')
                .update({ creator_id: currentProfile.id })
                .eq('creator_id', memberId)
            
            // Unassign any remaining tasks assigned to member
            await supabase
                .from('tasks')
                .update({ assignee_id: null })
                .eq('assignee_id', memberId)
            
            // Delete from team_members
            await supabase.from('team_members').delete().eq('profile_id', memberId)
            
            // Delete from task_assignees
            await supabase.from('task_assignees').delete().eq('profile_id', memberId)
            
            // Delete admin permissions
            await supabase.from('foundry_admin_permissions').delete().eq('profile_id', memberId)
            
            // Log action BEFORE deletion (profile will be gone after)
            await logAdminAction(supabase, foundry_id, user.id, 'offboard_user_delete', memberId, {
                action: 'reassign_delete',
                departing_user_name: memberProfile.full_name,
                departing_user_email: memberProfile.email,
                reassignments_count: Object.keys(reassignments).length
            })
            
            // Delete the profile
            const { error: deleteError } = await supabase
                .from('profiles')
                .delete()
                .eq('id', memberId)
            
            if (deleteError) {
                return { error: `Failed to delete profile: ${deleteError.message}` }
            }
            break
        }
        
        case 'soft_delete': {
            // Mark as inactive
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ 
                    is_active: false, 
                    deactivated_at: new Date().toISOString() 
                })
                .eq('id', memberId)
            
            if (updateError) {
                return { error: `Failed to deactivate profile: ${updateError.message}` }
            }
            
            // Revoke admin permissions
            await supabase.from('foundry_admin_permissions').delete().eq('profile_id', memberId)
            
            // Log action
            await logAdminAction(supabase, foundry_id, user.id, 'offboard_user_deactivate', memberId, {
                action: 'soft_delete',
                departing_user_name: memberProfile.full_name
            })
            break
        }
        
        case 'anonymize': {
            // RED TEAM FIX: Generate unique anonymized email to avoid conflicts
            const anonymizedEmail = `anonymized_${memberId.slice(0, 8)}_${Date.now()}@removed.local`
            
            // Anonymize the profile
            const { error: anonymizeError } = await supabase
                .from('profiles')
                .update({ 
                    full_name: 'Former Employee',
                    email: anonymizedEmail,
                    avatar_url: null,
                    is_active: false,
                    deactivated_at: new Date().toISOString()
                })
                .eq('id', memberId)
            
            if (anonymizeError) {
                return { error: `Failed to anonymize profile: ${anonymizeError.message}` }
            }
            
            // Revoke admin permissions
            await supabase.from('foundry_admin_permissions').delete().eq('profile_id', memberId)
            
            // Log action
            await logAdminAction(supabase, foundry_id, user.id, 'offboard_user_anonymize', memberId, {
                action: 'anonymize',
                original_email_hash: Buffer.from(memberProfile.email).toString('base64').slice(0, 16)
            })
            break
        }
    }
    
    revalidatePath('/team')
    revalidatePath('/', 'layout')
    
    return { success: true }
}

/**
 * Get offboarding settings for the foundry
 */
export async function getOffboardingSettings(): Promise<{
    settings: {
        default_action: OffboardingAction
        require_task_reassignment: boolean
        retention_days: number
    } | null
    error?: string
}> {
    const supabase = await createClient()
    
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { settings: null, error: 'User not in a foundry' }
    
    const { data, error } = await supabase
        .from('foundry_offboarding_settings')
        .select('default_action, require_task_reassignment, retention_days')
        .eq('foundry_id', foundry_id)
        .maybeSingle()
    
    if (error) {
        return { settings: null, error: error.message }
    }
    
    // Return defaults if no settings exist
    if (!data) {
        return { 
            settings: {
                default_action: 'reassign_delete',
                require_task_reassignment: true,
                retention_days: 30
            }
        }
    }
    
    return { 
        settings: {
            default_action: data.default_action as OffboardingAction,
            require_task_reassignment: data.require_task_reassignment,
            retention_days: data.retention_days || 30
        }
    }
}

/**
 * Update offboarding settings for the foundry (Founders only)
 */
export async function updateOffboardingSettings(settings: {
    default_action?: OffboardingAction
    require_task_reassignment?: boolean
    retention_days?: number
}): Promise<{ success?: boolean; error?: string }> {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }
    
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }
    
    // Verify current user is a Founder
    const { data: currentProfile } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', user.id)
        .single()
    
    if (!currentProfile?.is_active) {
        return { error: 'Your account is not active' }
    }
    
    if (currentProfile.role !== 'Founder') {
        return { error: 'Only Founders can update offboarding settings' }
    }
    
    // Upsert settings
    const { error } = await supabase
        .from('foundry_offboarding_settings')
        .upsert({
            foundry_id,
            ...settings
        }, {
            onConflict: 'foundry_id'
        })
    
    if (error) {
        return { error: error.message }
    }
    
    // Log action
    await logAdminAction(supabase, foundry_id, user.id, 'update_offboarding_settings', undefined, settings)
    
    return { success: true }
}
