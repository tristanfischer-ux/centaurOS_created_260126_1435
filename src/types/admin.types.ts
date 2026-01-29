/**
 * Admin-specific types for tables not yet in the generated database.types.ts
 * These should be replaced when Supabase types are regenerated.
 */

export type AdminRole = 'super_admin' | 'operations' | 'support' | 'finance' | 'readonly'
export type SupplierTier = 'verified_partner' | 'approved' | 'pending' | 'suspended'
export type ApplicationStatus = 'pending' | 'under_review' | 'approved' | 'rejected'
export type DisputeStatus = 'open' | 'under_review' | 'mediation' | 'arbitration' | 'resolved' | 'escalated'

export interface AdminUser {
    id: string
    user_id: string
    admin_role: AdminRole
    permissions: Record<string, boolean>
    created_at: string
}

export interface AdminAuditLog {
    id: string
    admin_id: string
    action: string
    entity_type: string
    entity_id: string | null
    before_state: Record<string, unknown> | null
    after_state: Record<string, unknown> | null
    reason: string | null
    created_at: string
}

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

export interface PlatformMetric {
    id: string
    metric_name: string
    metric_value: number
    recorded_at: string
}

export interface StripeEvent {
    id: string
    stripe_event_id: string
    event_type: string
    status: 'pending' | 'processed' | 'failed'
    error_message: string | null
    created_at: string
    processed_at: string | null
}
