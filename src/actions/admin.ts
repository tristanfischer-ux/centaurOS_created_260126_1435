"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/admin/access"

// ==========================================
// TYPES (inlined to avoid turbopack import issues)
// ==========================================

export type ApplicationStatus = 'pending' | 'under_review' | 'approved' | 'rejected'
export type SupplierTier = 'verified_partner' | 'approved' | 'pending' | 'suspended'
export type DisputeStatus = 'open' | 'under_review' | 'mediation' | 'arbitration' | 'resolved' | 'escalated'

export interface ProviderApplication {
    id: string
    user_id: string
    category: string
    company_name: string | null
    application_data: Record<string, unknown>
    status: ApplicationStatus
    assigned_tier: SupplierTier | null
    reviewer_id: string | null
    reviewer_notes: string | null
    submitted_at: string
    reviewed_at: string | null
    user?: {
        full_name: string | null
        email: string
    }
}

export interface Dispute {
    id: string
    order_id: string
    raised_by: string
    reason: string
    evidence_urls: string[]
    status: DisputeStatus
    resolution: string | null
    resolution_amount: number | null
    assigned_to: string | null
    resolved_at: string | null
    created_at: string
    order?: {
        order_number: string | null
        total_amount: number
    }
    raiser?: {
        full_name: string | null
        email: string
    }
}

interface PlatformMetric {
    name: string
    value: number
    unit: string
    change?: number
    trend?: 'up' | 'down' | 'stable'
}

// ==========================================
// TYPES
// ==========================================

export interface AdminDashboardStats {
    pendingApplications: number
    openDisputes: number
    platformHealth: 'healthy' | 'degraded' | 'critical'
    recentActivityCount: number
    failedPayments: number
    webhookBacklog: number
}

export interface PlatformHealth {
    database: {
        status: 'healthy' | 'degraded' | 'critical'
        message: string
    }
    stripe: {
        status: 'healthy' | 'degraded' | 'critical'
        message: string
        pendingEvents: number
        failedEvents: number
    }
    failedPayments: number
    recentErrors: Array<{
        type: string
        count: number
        lastOccurred: string
    }>
}

export interface RecentActivity {
    id: string
    action: string
    entity_type: string
    entity_id: string | null
    admin_name: string | null
    created_at: string
}

// ==========================================
// DASHBOARD STATS
// ==========================================

/**
 * Get aggregate stats for the admin dashboard
 */
export async function getAdminDashboardStats(): Promise<{
    data: AdminDashboardStats | null
    error: string | null
}> {
    try {
        const { supabase } = await requireAdmin()
        
        // Get pending applications count
        const { count: pendingApplications } = await supabase
            .from('provider_applications')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending')
        
        // Get open disputes count
        const { count: openDisputes } = await supabase
            .from('disputes')
            .select('*', { count: 'exact', head: true })
            .in('status', ['open', 'under_review', 'mediation'])
        
        // Get failed stripe events count (webhook backlog)
        const { count: failedEvents } = await supabase
            .from('stripe_events')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'failed')
        
        // Get pending stripe events (webhook backlog)
        const { count: pendingEvents } = await supabase
            .from('stripe_events')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending')
        
        // Get recent activity count (last 24 hours)
        const oneDayAgo = new Date()
        oneDayAgo.setDate(oneDayAgo.getDate() - 1)
        
        const { count: recentActivityCount } = await supabase
            .from('admin_audit_log')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', oneDayAgo.toISOString())
        
        // Determine platform health based on metrics
        let platformHealth: 'healthy' | 'degraded' | 'critical' = 'healthy'
        const webhookBacklog = (pendingEvents || 0) + (failedEvents || 0)
        
        if ((failedEvents || 0) > 10 || webhookBacklog > 100) {
            platformHealth = 'critical'
        } else if ((failedEvents || 0) > 0 || webhookBacklog > 20) {
            platformHealth = 'degraded'
        }
        
        return {
            data: {
                pendingApplications: pendingApplications || 0,
                openDisputes: openDisputes || 0,
                platformHealth,
                recentActivityCount: recentActivityCount || 0,
                failedPayments: failedEvents || 0,
                webhookBacklog
            },
            error: null
        }
    } catch (err) {
        console.error('Error fetching admin dashboard stats:', err)
        return {
            data: null,
            error: err instanceof Error ? err.message : 'Failed to fetch dashboard stats'
        }
    }
}

// ==========================================
// PROVIDER APPLICATIONS
// ==========================================

/**
 * Get provider applications with optional status filter
 */
export async function getPendingApplications(status?: ApplicationStatus): Promise<{
    data: ProviderApplication[]
    error: string | null
}> {
    try {
        const { supabase } = await requireAdmin()
        
        let query = supabase
            .from('provider_applications')
            .select(`
                *,
                user:profiles!provider_applications_user_id_fkey(full_name, email)
            `)
            .order('submitted_at', { ascending: false })
        
        if (status) {
            query = query.eq('status', status)
        }
        
        const { data, error } = await query
        
        if (error) {
            throw error
        }
        
        return {
            data: (data || []) as ProviderApplication[],
            error: null
        }
    } catch (err) {
        console.error('Error fetching applications:', err)
        return {
            data: [],
            error: err instanceof Error ? err.message : 'Failed to fetch applications'
        }
    }
}

/**
 * Get a single application by ID
 */
export async function getApplicationDetail(id: string): Promise<{
    data: ProviderApplication | null
    error: string | null
}> {
    try {
        const { supabase } = await requireAdmin()
        
        const { data, error } = await supabase
            .from('provider_applications')
            .select(`
                *,
                user:profiles!provider_applications_user_id_fkey(full_name, email)
            `)
            .eq('id', id)
            .single()
        
        if (error) {
            throw error
        }
        
        return {
            data: data as ProviderApplication,
            error: null
        }
    } catch (err) {
        console.error('Error fetching application detail:', err)
        return {
            data: null,
            error: err instanceof Error ? err.message : 'Failed to fetch application'
        }
    }
}

/**
 * Approve a provider application
 */
export async function approveApplication(
    id: string,
    tier: SupplierTier,
    notes?: string
): Promise<{ success: boolean; error: string | null }> {
    try {
        const { userId, supabase } = await requireAdmin()
        
        // Get application before state for audit log
        const { data: beforeState } = await supabase
            .from('provider_applications')
            .select('*')
            .eq('id', id)
            .single()
        
        // Update application
        const { data: afterState, error } = await supabase
            .from('provider_applications')
            .update({
                status: 'approved',
                assigned_tier: tier,
                reviewer_id: userId,
                reviewer_notes: notes || null,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single()
        
        if (error) {
            throw error
        }
        
        // Log the action
        await logAdminAction(
            'approve_application',
            'provider_application',
            id,
            beforeState,
            afterState
        )
        
        revalidatePath('/admin/applications')
        return { success: true, error: null }
    } catch (err) {
        console.error('Error approving application:', err)
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to approve application'
        }
    }
}

/**
 * Reject a provider application
 */
export async function rejectApplication(
    id: string,
    reason: string
): Promise<{ success: boolean; error: string | null }> {
    try {
        const { userId, supabase } = await requireAdmin()
        
        // Get application before state for audit log
        const { data: beforeState } = await supabase
            .from('provider_applications')
            .select('*')
            .eq('id', id)
            .single()
        
        // Update application
        const { data: afterState, error } = await supabase
            .from('provider_applications')
            .update({
                status: 'rejected',
                reviewer_id: userId,
                reviewer_notes: reason,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single()
        
        if (error) {
            throw error
        }
        
        // Log the action
        await logAdminAction(
            'reject_application',
            'provider_application',
            id,
            beforeState,
            afterState
        )
        
        revalidatePath('/admin/applications')
        return { success: true, error: null }
    } catch (err) {
        console.error('Error rejecting application:', err)
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to reject application'
        }
    }
}

// ==========================================
// DISPUTES
// ==========================================

/**
 * Get open disputes
 */
export async function getOpenDisputes(): Promise<{
    data: Dispute[]
    error: string | null
}> {
    try {
        const { supabase } = await requireAdmin()
        
        const { data, error } = await supabase
            .from('disputes')
            .select(`
                *,
                order:orders!disputes_order_id_fkey(order_number, total_amount),
                raiser:profiles!disputes_raised_by_fkey(full_name, email)
            `)
            .in('status', ['open', 'under_review', 'mediation', 'arbitration'])
            .order('created_at', { ascending: false })
        
        if (error) {
            throw error
        }
        
        return {
            data: (data || []) as Dispute[],
            error: null
        }
    } catch (err) {
        console.error('Error fetching disputes:', err)
        return {
            data: [],
            error: err instanceof Error ? err.message : 'Failed to fetch disputes'
        }
    }
}

// ==========================================
// PLATFORM HEALTH
// ==========================================

/**
 * Get platform health metrics
 */
export async function getPlatformHealth(): Promise<{
    data: PlatformHealth | null
    error: string | null
}> {
    try {
        const { supabase } = await requireAdmin()
        
        // Check database connectivity (implicit - if we got here, it works)
        const dbStatus: 'healthy' | 'degraded' | 'critical' = 'healthy'
        const dbMessage = 'Database responding normally'
        
        // Check Stripe webhook status
        const { data: stripeEvents, error: stripeError } = await supabase
            .from('stripe_events')
            .select('status, created_at')
            .order('created_at', { ascending: false })
            .limit(100)
        
        let stripeStatus: 'healthy' | 'degraded' | 'critical' = 'healthy'
        let stripeMessage = 'Stripe webhooks processing normally'
        let pendingEvents = 0
        let failedEvents = 0
        
        if (stripeError) {
            stripeStatus = 'degraded'
            stripeMessage = 'Unable to query Stripe events'
        } else if (stripeEvents) {
            pendingEvents = stripeEvents.filter((e: { status: string }) => e.status === 'pending').length
            failedEvents = stripeEvents.filter((e: { status: string }) => e.status === 'failed').length
            
            if (failedEvents > 10) {
                stripeStatus = 'critical'
                stripeMessage = `${failedEvents} failed webhook events need attention`
            } else if (failedEvents > 0 || pendingEvents > 20) {
                stripeStatus = 'degraded'
                stripeMessage = `${pendingEvents} pending, ${failedEvents} failed events`
            }
        }
        
        // Get failed payment count from orders
        const { count: failedPayments } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('escrow_status', 'pending')
            .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        
        // Get recent error summary from platform metrics
        const { data: recentMetrics } = await supabase
            .from('platform_metrics')
            .select('metric_name, metric_value, recorded_at')
            .ilike('metric_name', '%error%')
            .order('recorded_at', { ascending: false })
            .limit(10)
        
        interface PlatformMetricRow {
            metric_name: string
            metric_value: string | number
            recorded_at: string
        }
        
        const recentErrors = (recentMetrics as PlatformMetricRow[] | null)?.map((m) => ({
            type: m.metric_name,
            count: Number(m.metric_value),
            lastOccurred: m.recorded_at
        })) || []
        
        return {
            data: {
                database: {
                    status: dbStatus,
                    message: dbMessage
                },
                stripe: {
                    status: stripeStatus,
                    message: stripeMessage,
                    pendingEvents,
                    failedEvents
                },
                failedPayments: failedPayments || 0,
                recentErrors
            },
            error: null
        }
    } catch (err) {
        console.error('Error fetching platform health:', err)
        return {
            data: null,
            error: err instanceof Error ? err.message : 'Failed to fetch platform health'
        }
    }
}

// ==========================================
// AUDIT LOG
// ==========================================

/**
 * Log an admin action for audit purposes
 */
export async function logAdminAction(
    action: string,
    entityType: string,
    entityId: string | null,
    beforeState?: unknown,
    afterState?: unknown,
    reason?: string
): Promise<{ success: boolean; error: string | null }> {
    try {
        const { adminUser, supabase } = await requireAdmin()
        
        const { error } = await supabase
            .from('admin_audit_log')
            .insert({
                admin_id: adminUser.id,
                action,
                entity_type: entityType,
                entity_id: entityId,
                before_state: beforeState ? JSON.parse(JSON.stringify(beforeState)) : null,
                after_state: afterState ? JSON.parse(JSON.stringify(afterState)) : null,
                reason
            })
        
        if (error) {
            throw error
        }
        
        return { success: true, error: null }
    } catch (err) {
        console.error('Error logging admin action:', err)
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to log admin action'
        }
    }
}

/**
 * Get recent admin activity
 */
export async function getRecentActivity(limit: number = 20): Promise<{
    data: RecentActivity[]
    error: string | null
}> {
    try {
        const { supabase } = await requireAdmin()
        
        const { data, error } = await supabase
            .from('admin_audit_log')
            .select(`
                id,
                action,
                entity_type,
                entity_id,
                created_at,
                admin:admin_users!admin_audit_log_admin_id_fkey(
                    user:profiles!admin_users_user_id_fkey(full_name)
                )
            `)
            .order('created_at', { ascending: false })
            .limit(limit)
        
        if (error) {
            throw error
        }
        
        interface AuditLogRow {
            id: string
            action: string
            entity_type: string
            entity_id: string | null
            created_at: string
            admin?: {
                user?: {
                    full_name: string | null
                }
            }
        }
        
        const activities = (data || []).map((item: AuditLogRow) => ({
            id: item.id,
            action: item.action,
            entity_type: item.entity_type,
            entity_id: item.entity_id,
            admin_name: item.admin?.user?.full_name || 'Unknown Admin',
            created_at: item.created_at
        }))
        
        return {
            data: activities,
            error: null
        }
    } catch (err) {
        console.error('Error fetching recent activity:', err)
        return {
            data: [],
            error: err instanceof Error ? err.message : 'Failed to fetch recent activity'
        }
    }
}
