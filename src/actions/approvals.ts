'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

export interface ApprovalDelegation {
    id: string
    delegator_id: string
    delegate_id: string
    foundry_id: string
    start_date: string
    end_date: string | null
    all_tasks: boolean
    task_types: string[]
    reason: string | null
    is_active: boolean
    created_at: string
    delegator?: {
        id: string
        full_name: string | null
        role: string
    }
    delegate?: {
        id: string
        full_name: string | null
        role: string
    }
}

// Get active delegations for current user (as delegator)
export async function getMyDelegations(): Promise<{ data: ApprovalDelegation[]; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { data: [], error: 'Not authenticated' }

        const { data, error } = await supabase
            .from('approval_delegations')
            .select(`
                *,
                delegate:profiles!approval_delegations_delegate_id_fkey(id, full_name, role)
            `)
            .eq('delegator_id', user.id)
            .eq('is_active', true)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching delegations:', error)
            return { data: [], error: error.message }
        }

        return { 
            data: (data || []).map(d => ({
                ...d,
                all_tasks: d.all_tasks ?? false,
                task_types: d.task_types ?? [],
                is_active: d.is_active ?? true
            })) as ApprovalDelegation[], 
            error: null 
        }
    } catch (err) {
        console.error('Failed to fetch delegations:', err)
        return { data: [], error: 'Failed to fetch delegations' }
    }
}

// Get delegations where current user is the delegate
export async function getDelegationsToMe(): Promise<{ data: ApprovalDelegation[]; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { data: [], error: 'Not authenticated' }

        const { data, error } = await supabase
            .from('approval_delegations')
            .select(`
                *,
                delegator:profiles!approval_delegations_delegator_id_fkey(id, full_name, role)
            `)
            .eq('delegate_id', user.id)
            .eq('is_active', true)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching delegations to me:', error)
            return { data: [], error: error.message }
        }

        return { 
            data: (data || []).map(d => ({
                ...d,
                all_tasks: d.all_tasks ?? false,
                task_types: d.task_types ?? [],
                is_active: d.is_active ?? true
            })) as ApprovalDelegation[], 
            error: null 
        }
    } catch (err) {
        console.error('Failed to fetch delegations to me:', err)
        return { data: [], error: 'Failed to fetch delegations' }
    }
}

// Create a new delegation
export async function createDelegation(formData: {
    delegateId: string
    startDate?: string
    endDate?: string
    reason?: string
}): Promise<{ data: ApprovalDelegation | null; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { data: null, error: 'Not authenticated' }

        const foundryId = await getFoundryIdCached()
        if (!foundryId) return { data: null, error: 'No foundry context' }

        const { data, error } = await supabase
            .from('approval_delegations')
            .insert({
                delegator_id: user.id,
                delegate_id: formData.delegateId,
                foundry_id: foundryId,
                start_date: formData.startDate || new Date().toISOString(),
                end_date: formData.endDate || null,
                reason: formData.reason || null,
                all_tasks: true,
                is_active: true
            })
            .select()
            .single()

        if (error) {
            console.error('Error creating delegation:', error)
            return { data: null, error: error.message }
        }

        revalidatePath('/settings')
        return { 
            data: {
                ...data,
                all_tasks: data.all_tasks ?? false,
                task_types: data.task_types ?? [],
                is_active: data.is_active ?? true
            } as ApprovalDelegation, 
            error: null 
        }
    } catch (err) {
        console.error('Failed to create delegation:', err)
        return { data: null, error: 'Failed to create delegation' }
    }
}

// Revoke a delegation
export async function revokeDelegation(delegationId: string): Promise<{ error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated' }

        const { error } = await supabase
            .from('approval_delegations')
            .update({ is_active: false })
            .eq('id', delegationId)
            .eq('delegator_id', user.id)

        if (error) {
            console.error('Error revoking delegation:', error)
            return { error: error.message }
        }

        revalidatePath('/settings')
        return { error: null }
    } catch (err) {
        console.error('Failed to revoke delegation:', err)
        return { error: 'Failed to revoke delegation' }
    }
}

// Check if user can approve via delegation
export async function canUserApprove(taskId: string): Promise<{ canApprove: boolean; viaDelegation: boolean }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { canApprove: false, viaDelegation: false }

    // Check user's role
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    
    if (profile?.role === 'Executive' || profile?.role === 'Founder') {
        return { canApprove: true, viaDelegation: false }
    }

    // Check for active delegations to this user
    const { data: delegations } = await supabase
        .from('approval_delegations')
        .select('*')
        .eq('delegate_id', user.id)
        .eq('is_active', true)
        .lte('start_date', new Date().toISOString())
        .or(`end_date.is.null,end_date.gte.${new Date().toISOString()}`)

    if (delegations && delegations.length > 0) {
        return { canApprove: true, viaDelegation: true }
    }

    return { canApprove: false, viaDelegation: false }
}

// Get tasks needing escalation
export async function getTasksNeedingEscalation(timeoutHours: number = 24): Promise<{
    data: {
        task_id: string
        task_title: string
        status: string
        approval_requested_at: string
        hours_pending: number
    }[]
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const foundryId = await getFoundryIdCached()
        if (!foundryId) return { data: [], error: 'No foundry context' }

        // Get tasks pending approval for longer than timeoutHours
        const cutoffTime = new Date(Date.now() - timeoutHours * 60 * 60 * 1000).toISOString()
        
        const { data, error } = await supabase
            .from('tasks')
            .select('id, title, status, updated_at')
            .eq('foundry_id', foundryId)
            .in('status', ['Pending_Executive_Approval', 'Pending_Peer_Review', 'Amended_Pending_Approval'])
            .lt('updated_at', cutoffTime)
            .order('updated_at', { ascending: true })

        if (error) {
            console.error('Error fetching tasks needing escalation:', error)
            return { data: [], error: error.message }
        }

        const result = (data || [])
            .filter((task): task is typeof task & { updated_at: string } => task.updated_at !== null)
            .map(task => ({
                task_id: task.id,
                task_title: task.title,
                status: task.status,
                approval_requested_at: task.updated_at,
                hours_pending: Math.round((Date.now() - new Date(task.updated_at).getTime()) / (60 * 60 * 1000))
            }))

        return { data: result, error: null }
    } catch (err) {
        console.error('Failed to fetch tasks needing escalation:', err)
        return { data: [], error: 'Failed to fetch tasks needing escalation' }
    }
}

// Escalate a task
export async function escalateTask(taskId: string, reason?: string): Promise<{ error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated' }

        // Update task priority and add escalation note
        const { error } = await supabase
            .from('tasks')
            .update({ 
                priority: 'Critical',
                amendment_notes: reason ? `Escalated: ${reason}` : 'Task escalated due to pending approval timeout'
            })
            .eq('id', taskId)

        if (error) {
            console.error('Error escalating task:', error)
            return { error: error.message }
        }

        revalidatePath('/tasks')
        return { error: null }
    } catch (err) {
        console.error('Failed to escalate task:', err)
        return { error: 'Failed to escalate task' }
    }
}

// Get all delegations in foundry (for Founders)
export async function getAllDelegations(): Promise<{ data: ApprovalDelegation[]; error: string | null }> {
    try {
        const supabase = await createClient()
        const foundryId = await getFoundryIdCached()
        if (!foundryId) return { data: [], error: 'No foundry context' }

        const { data, error } = await supabase
            .from('approval_delegations')
            .select(`
                *,
                delegator:profiles!approval_delegations_delegator_id_fkey(id, full_name, role),
                delegate:profiles!approval_delegations_delegate_id_fkey(id, full_name, role)
            `)
            .eq('foundry_id', foundryId)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching all delegations:', error)
            return { data: [], error: error.message }
        }

        return { 
            data: (data || []).map(d => ({
                ...d,
                all_tasks: d.all_tasks ?? false,
                task_types: d.task_types ?? [],
                is_active: d.is_active ?? true
            })) as ApprovalDelegation[], 
            error: null 
        }
    } catch (err) {
        console.error('Failed to fetch all delegations:', err)
        return { data: [], error: 'Failed to fetch delegations' }
    }
}
