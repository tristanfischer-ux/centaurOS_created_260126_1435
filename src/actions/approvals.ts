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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Unauthorized' }

    const { data, error } = await supabase
        .from('approval_delegations')
        .select(`
            *,
            delegate:profiles!delegate_id(id, full_name, role)
        `)
        .eq('delegator_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

    if (error) return { data: [], error: error.message }
    return { data: (data || []) as ApprovalDelegation[], error: null }
}

// Get delegations where current user is the delegate
export async function getDelegationsToMe(): Promise<{ data: ApprovalDelegation[]; error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Unauthorized' }

    const now = new Date().toISOString()

    const { data, error } = await supabase
        .from('approval_delegations')
        .select(`
            *,
            delegator:profiles!delegator_id(id, full_name, role)
        `)
        .eq('delegate_id', user.id)
        .eq('is_active', true)
        .lte('start_date', now)
        .or(`end_date.is.null,end_date.gte.${now}`)
        .order('created_at', { ascending: false })

    if (error) return { data: [], error: error.message }
    return { data: (data || []) as ApprovalDelegation[], error: null }
}

// Create a new delegation
export async function createDelegation(formData: {
    delegateId: string
    startDate?: string
    endDate?: string
    reason?: string
}): Promise<{ data: ApprovalDelegation | null; error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Unauthorized' }

    // Check if user is Executive or Founder
    const { data: profile } = await supabase.from('profiles').select('role, foundry_id').eq('id', user.id).single()
    if (!profile || (profile.role !== 'Executive' && profile.role !== 'Founder')) {
        return { data: null, error: 'Only Executives and Founders can delegate approval authority' }
    }

    // Validate delegate exists and is in same foundry
    const { data: delegate } = await supabase
        .from('profiles')
        .select('id, foundry_id')
        .eq('id', formData.delegateId)
        .single()

    if (!delegate || delegate.foundry_id !== profile.foundry_id) {
        return { data: null, error: 'Invalid delegate or different foundry' }
    }

    const { data, error } = await supabase
        .from('approval_delegations')
        .insert({
            delegator_id: user.id,
            delegate_id: formData.delegateId,
            foundry_id: profile.foundry_id,
            start_date: formData.startDate || new Date().toISOString(),
            end_date: formData.endDate || null,
            reason: formData.reason || null,
            all_tasks: true,
            is_active: true
        })
        .select(`
            *,
            delegate:profiles!delegate_id(id, full_name, role)
        `)
        .single()

    if (error) return { data: null, error: error.message }

    revalidatePath('/settings')
    return { data: data as ApprovalDelegation, error: null }
}

// Revoke a delegation
export async function revokeDelegation(delegationId: string): Promise<{ error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase
        .from('approval_delegations')
        .update({ is_active: false })
        .eq('id', delegationId)
        .eq('delegator_id', user.id)

    if (error) return { error: error.message }

    revalidatePath('/settings')
    return { error: null }
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

    // Check for active delegation
    const now = new Date().toISOString()
    const { data: delegation } = await supabase
        .from('approval_delegations')
        .select('id')
        .eq('delegate_id', user.id)
        .eq('is_active', true)
        .lte('start_date', now)
        .or(`end_date.is.null,end_date.gte.${now}`)
        .limit(1)
        .single()

    if (delegation) {
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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Unauthorized' }

    // Check if user is Executive or Founder
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || (profile.role !== 'Executive' && profile.role !== 'Founder')) {
        return { data: [], error: 'Only Executives and Founders can view escalations' }
    }

    const { data, error } = await supabase.rpc('get_tasks_needing_escalation', {
        p_timeout_hours: timeoutHours
    })

    if (error) return { data: [], error: error.message }
    return { data: data || [], error: null }
}

// Escalate a task
export async function escalateTask(taskId: string, reason?: string): Promise<{ error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase.rpc('escalate_task', {
        p_task_id: taskId,
        p_reason: reason || 'Approval timeout exceeded'
    })

    if (error) return { error: error.message }

    revalidatePath('/tasks')
    revalidatePath('/dashboard')
    return { error: null }
}

// Get all delegations in foundry (for Founders)
export async function getAllDelegations(): Promise<{ data: ApprovalDelegation[]; error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Unauthorized' }

    // Only Founders can see all delegations
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'Founder') {
        return { data: [], error: 'Only Founders can view all delegations' }
    }

    const { data, error } = await supabase
        .from('approval_delegations')
        .select(`
            *,
            delegator:profiles!delegator_id(id, full_name, role),
            delegate:profiles!delegate_id(id, full_name, role)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

    if (error) return { data: [], error: error.message }
    return { data: (data || []) as ApprovalDelegation[], error: null }
}
