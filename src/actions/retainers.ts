'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface RetainerInput {
    providerId: string
    weeklyHours: number
    hourlyRate?: number
    notes?: string
}

export interface Retainer {
    id: string
    buyer_id: string
    seller_id: string
    weekly_hours: number
    hourly_rate: number
    currency: string
    status: 'pending' | 'active' | 'paused' | 'cancelled'
    started_at: string | null
    cancelled_at: string | null
    cancellation_effective: string | null
    created_at: string
}

export interface TimesheetEntry {
    id: string
    retainer_id: string
    week_start: string
    hours_logged: number
    description: string | null
    status: 'draft' | 'submitted' | 'approved' | 'disputed' | 'paid'
    submitted_at: string | null
    approved_at: string | null
    paid_at: string | null
}

// Create a retainer engagement
export async function createRetainer(input: RetainerInput) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, retainerId: null, error: 'Not authenticated' }
    
    // Get provider details
    const { data: provider } = await supabase
        .from('provider_profiles')
        .select('id, user_id, hourly_rate, day_rate, currency')
        .eq('id', input.providerId)
        .single()
    
    if (!provider) {
        return { success: false, retainerId: null, error: 'Provider not found' }
    }
    
    if (provider.user_id === user.id) {
        return { success: false, retainerId: null, error: 'Cannot create a retainer with yourself' }
    }
    
    // Calculate hourly rate
    const hourlyRate = input.hourlyRate || provider.hourly_rate || (provider.day_rate ? provider.day_rate / 8 : 100)
    
    // Create the retainer
    const { data: retainer, error } = await supabase
        .from('retainers')
        .insert({
            buyer_id: user.id,
            seller_id: input.providerId,
            weekly_hours: input.weeklyHours,
            hourly_rate: hourlyRate,
            currency: provider.currency || 'GBP',
            status: 'pending'
        })
        .select()
        .single()
    
    if (error) {
        return { success: false, retainerId: null, error: error.message }
    }
    
    revalidatePath('/retainers')
    return { success: true, retainerId: retainer.id, error: null }
}

// Get retainers for buyer or provider
export async function getRetainers(role: 'buyer' | 'provider' = 'buyer') {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { retainers: [], error: 'Not authenticated' }
    
    let query = supabase
        .from('retainers')
        .select(`
            *,
            provider_profiles!retainers_seller_id_fkey (
                id,
                headline,
                profiles!provider_profiles_user_id_fkey (
                    full_name,
                    avatar_url
                )
            ),
            buyer:profiles!retainers_buyer_id_fkey (
                id,
                full_name,
                avatar_url
            )
        `)
    
    if (role === 'buyer') {
        query = query.eq('buyer_id', user.id)
    } else {
        const { data: provider } = await supabase
            .from('provider_profiles')
            .select('id')
            .eq('user_id', user.id)
            .single()
        
        if (!provider) return { retainers: [], error: 'Provider profile not found' }
        
        query = query.eq('seller_id', provider.id)
    }
    
    const { data, error } = await query.order('created_at', { ascending: false })
    
    return { retainers: (data || []) as Retainer[], error: error?.message || null }
}

// Accept or decline retainer (provider)
export async function respondToRetainer(retainerId: string, accept: boolean) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Verify provider owns this retainer
    const { data: retainer } = await supabase
        .from('retainers')
        .select('seller_id, status, provider_profiles!inner(user_id)')
        .eq('id', retainerId)
        .single()
    
    if (!retainer || (retainer.provider_profiles as { user_id: string }).user_id !== user.id) {
        return { success: false, error: 'Retainer not found or not authorized' }
    }
    
    if (retainer.status !== 'pending') {
        return { success: false, error: 'Retainer is not pending' }
    }
    
    const updates: Record<string, unknown> = {
        status: accept ? 'active' : 'cancelled'
    }
    
    if (accept) {
        updates.started_at = new Date().toISOString()
    } else {
        updates.cancelled_at = new Date().toISOString()
    }
    
    const { error } = await supabase
        .from('retainers')
        .update(updates)
        .eq('id', retainerId)
    
    if (error) return { success: false, error: error.message }
    
    revalidatePath('/retainers')
    revalidatePath('/provider-portal/orders')
    return { success: true, error: null }
}

// Pause or resume retainer
export async function toggleRetainerPause(retainerId: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Get retainer and verify access
    const { data: retainer } = await supabase
        .from('retainers')
        .select('buyer_id, status, provider_profiles!inner(user_id)')
        .eq('id', retainerId)
        .single()
    
    if (!retainer) return { success: false, error: 'Retainer not found' }
    
    const isBuyer = retainer.buyer_id === user.id
    const isProvider = (retainer.provider_profiles as { user_id: string }).user_id === user.id
    
    if (!isBuyer && !isProvider) {
        return { success: false, error: 'Not authorized' }
    }
    
    if (retainer.status !== 'active' && retainer.status !== 'paused') {
        return { success: false, error: 'Can only pause/resume active retainers' }
    }
    
    const newStatus = retainer.status === 'active' ? 'paused' : 'active'
    
    const { error } = await supabase
        .from('retainers')
        .update({ status: newStatus })
        .eq('id', retainerId)
    
    if (error) return { success: false, error: error.message }
    
    revalidatePath('/retainers')
    return { success: true, error: null }
}

// Cancel retainer
export async function cancelRetainer(retainerId: string, effectiveDate?: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Get retainer and verify access
    const { data: retainer } = await supabase
        .from('retainers')
        .select('buyer_id, status, provider_profiles!inner(user_id)')
        .eq('id', retainerId)
        .single()
    
    if (!retainer) return { success: false, error: 'Retainer not found' }
    
    const isBuyer = retainer.buyer_id === user.id
    const isProvider = (retainer.provider_profiles as { user_id: string }).user_id === user.id
    
    if (!isBuyer && !isProvider) {
        return { success: false, error: 'Not authorized' }
    }
    
    // Default to 2 weeks notice if no date specified
    const cancellationEffective = effectiveDate || 
        new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    
    const { error } = await supabase
        .from('retainers')
        .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancellation_effective: cancellationEffective
        })
        .eq('id', retainerId)
    
    if (error) return { success: false, error: error.message }
    
    revalidatePath('/retainers')
    return { success: true, error: null }
}

// Log hours (provider)
export async function logTimesheetHours(input: {
    retainerId: string
    weekStart: string
    hoursLogged: number
    description?: string
}) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Verify provider owns this retainer
    const { data: retainer } = await supabase
        .from('retainers')
        .select('seller_id, weekly_hours, provider_profiles!inner(user_id)')
        .eq('id', input.retainerId)
        .single()
    
    if (!retainer || (retainer.provider_profiles as { user_id: string }).user_id !== user.id) {
        return { success: false, error: 'Retainer not found or not authorized' }
    }
    
    // Check if entry already exists for this week
    const { data: existing } = await supabase
        .from('timesheet_entries')
        .select('id')
        .eq('retainer_id', input.retainerId)
        .eq('week_start', input.weekStart)
        .single()
    
    if (existing) {
        // Update existing entry
        const { error } = await supabase
            .from('timesheet_entries')
            .update({
                hours_logged: input.hoursLogged,
                description: input.description,
                status: 'draft'
            })
            .eq('id', existing.id)
        
        if (error) return { success: false, error: error.message }
    } else {
        // Create new entry
        const { error } = await supabase
            .from('timesheet_entries')
            .insert({
                retainer_id: input.retainerId,
                week_start: input.weekStart,
                hours_logged: input.hoursLogged,
                description: input.description,
                status: 'draft'
            })
        
        if (error) return { success: false, error: error.message }
    }
    
    revalidatePath('/provider-portal/orders')
    return { success: true, error: null }
}

// Submit timesheet for approval
export async function submitTimesheet(entryId: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Verify ownership
    const { data: entry } = await supabase
        .from('timesheet_entries')
        .select('status, retainers!inner(provider_profiles!inner(user_id))')
        .eq('id', entryId)
        .single()
    
    if (!entry) return { success: false, error: 'Entry not found' }
    
    const retainer = entry.retainers as { provider_profiles: { user_id: string } }
    if (retainer.provider_profiles.user_id !== user.id) {
        return { success: false, error: 'Not authorized' }
    }
    
    if (entry.status !== 'draft') {
        return { success: false, error: 'Entry is not in draft status' }
    }
    
    const { error } = await supabase
        .from('timesheet_entries')
        .update({
            status: 'submitted',
            submitted_at: new Date().toISOString()
        })
        .eq('id', entryId)
    
    if (error) return { success: false, error: error.message }
    
    revalidatePath('/retainers')
    return { success: true, error: null }
}

// Approve timesheet (buyer)
export async function approveTimesheet(entryId: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Verify buyer owns this retainer
    const { data: entry } = await supabase
        .from('timesheet_entries')
        .select('status, retainers!inner(buyer_id)')
        .eq('id', entryId)
        .single()
    
    if (!entry) return { success: false, error: 'Entry not found' }
    
    if ((entry.retainers as { buyer_id: string }).buyer_id !== user.id) {
        return { success: false, error: 'Not authorized' }
    }
    
    if (entry.status !== 'submitted') {
        return { success: false, error: 'Entry is not submitted' }
    }
    
    const { error } = await supabase
        .from('timesheet_entries')
        .update({
            status: 'approved',
            approved_at: new Date().toISOString()
        })
        .eq('id', entryId)
    
    if (error) return { success: false, error: error.message }
    
    // TODO: Trigger payment processing
    
    revalidatePath('/retainers')
    return { success: true, error: null }
}

// Get timesheet entries for a retainer
export async function getTimesheetEntries(retainerId: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { entries: [], error: 'Not authenticated' }
    
    // Verify access
    const { data: retainer } = await supabase
        .from('retainers')
        .select('buyer_id, provider_profiles!inner(user_id)')
        .eq('id', retainerId)
        .single()
    
    if (!retainer) return { entries: [], error: 'Retainer not found' }
    
    const isBuyer = retainer.buyer_id === user.id
    const isProvider = (retainer.provider_profiles as { user_id: string }).user_id === user.id
    
    if (!isBuyer && !isProvider) {
        return { entries: [], error: 'Not authorized' }
    }
    
    const { data, error } = await supabase
        .from('timesheet_entries')
        .select('*')
        .eq('retainer_id', retainerId)
        .order('week_start', { ascending: false })
    
    return { entries: (data || []) as TimesheetEntry[], error: error?.message || null }
}

// Get retainer stats
export async function getRetainerStats(retainerId: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { stats: null, error: 'Not authenticated' }
    
    // Verify access
    const { data: retainer } = await supabase
        .from('retainers')
        .select('buyer_id, weekly_hours, hourly_rate, currency, started_at, provider_profiles!inner(user_id)')
        .eq('id', retainerId)
        .single()
    
    if (!retainer) return { stats: null, error: 'Retainer not found' }
    
    const isBuyer = retainer.buyer_id === user.id
    const isProvider = (retainer.provider_profiles as { user_id: string }).user_id === user.id
    
    if (!isBuyer && !isProvider) {
        return { stats: null, error: 'Not authorized' }
    }
    
    // Get timesheet entries
    const { data: entries } = await supabase
        .from('timesheet_entries')
        .select('hours_logged, status')
        .eq('retainer_id', retainerId)
    
    const totalHoursLogged = (entries || []).reduce((sum, e) => sum + e.hours_logged, 0)
    const approvedHours = (entries || []).filter(e => e.status === 'approved' || e.status === 'paid').reduce((sum, e) => sum + e.hours_logged, 0)
    const pendingHours = (entries || []).filter(e => e.status === 'submitted').reduce((sum, e) => sum + e.hours_logged, 0)
    
    // Calculate weeks since start
    const startDate = retainer.started_at ? new Date(retainer.started_at) : new Date()
    const weeksSinceStart = Math.floor((Date.now() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
    const expectedHours = weeksSinceStart * retainer.weekly_hours
    
    return {
        stats: {
            totalHoursLogged,
            approvedHours,
            pendingHours,
            expectedHours,
            weeksSinceStart,
            weeklyRate: retainer.weekly_hours * retainer.hourly_rate,
            monthlyRate: retainer.weekly_hours * retainer.hourly_rate * 4,
            currency: retainer.currency
        },
        error: null
    }
}
