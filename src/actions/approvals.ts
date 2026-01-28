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
    // TODO: Enable when approval_delegations table is added to database types
    return { data: [], error: null }
}

// Get delegations where current user is the delegate
export async function getDelegationsToMe(): Promise<{ data: ApprovalDelegation[]; error: string | null }> {
    // TODO: Enable when approval_delegations table is added to database types
    return { data: [], error: null }
}

// Create a new delegation
export async function createDelegation(formData: {
    delegateId: string
    startDate?: string
    endDate?: string
    reason?: string
}): Promise<{ data: ApprovalDelegation | null; error: string | null }> {
    // TODO: Enable when approval_delegations table is added to database types
    return { data: null, error: 'Delegation feature not yet available' }
}

// Revoke a delegation
export async function revokeDelegation(delegationId: string): Promise<{ error: string | null }> {
    // TODO: Enable when approval_delegations table is added to database types
    return { error: 'Delegation feature not yet available' }
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

    // TODO: Enable delegation check when approval_delegations table is added to database types
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
    // TODO: Enable when escalation RPC is added to database types
    return { data: [], error: null }
}

// Escalate a task
export async function escalateTask(taskId: string, reason?: string): Promise<{ error: string | null }> {
    // TODO: Enable when escalation RPC is added to database types
    return { error: 'Escalation feature not yet available' }
}

// Get all delegations in foundry (for Founders)
export async function getAllDelegations(): Promise<{ data: ApprovalDelegation[]; error: string | null }> {
    // TODO: Enable when approval_delegations table is added to database types
    return { data: [], error: null }
}
