/**
 * GDPR Data Types
 * Types for GDPR compliance and data handling
 */

// Data request types from database enum
export type DataRequestType = 'access' | 'deletion' | 'export'

// Data request status from database enum
export type DataRequestStatus = 'pending' | 'processing' | 'completed' | 'denied'

// Data request record
export interface DataRequest {
  id: string
  user_id: string
  request_type: DataRequestType
  status: DataRequestStatus
  reason: string | null
  processed_by: string | null
  completed_at: string | null
  export_url: string | null
  created_at: string
}

// Data request with user details
export interface DataRequestWithUser extends DataRequest {
  user: {
    id: string
    email: string
    full_name: string | null
  }
  processor?: {
    id: string
    email: string
    full_name: string | null
  } | null
}

// Audit log entry types
export type AuditAction = 
  | 'data_accessed'
  | 'data_modified'
  | 'data_deleted'
  | 'data_exported'
  | 'profile_viewed'
  | 'messages_accessed'
  | 'orders_accessed'
  | 'payment_data_accessed'

// Audit log entry
export interface AuditLogEntry {
  id: string
  user_id: string
  accessor_id: string
  accessor_type: 'user' | 'admin' | 'system'
  action: AuditAction
  data_type: string
  details: Record<string, unknown>
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

// User data export structure
export interface UserDataExport {
  exportedAt: string
  userId: string
  requestId: string
  data: {
    profile: ProfileExportData | null
    providerProfile: ProviderProfileExportData | null
    orders: OrderExportData[]
    messages: MessageExportData[]
    reviews: ReviewExportData[]
    payments: PaymentExportData[]
    bookings: BookingExportData[]
    auditLog: AuditLogEntry[]
  }
}

// Profile export data
export interface ProfileExportData {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  phone_number: string | null
  skills: string[] | null
  created_at: string | null
  updated_at: string | null
}

// Provider profile export data
export interface ProviderProfileExportData {
  id: string
  display_name: string
  business_type: string
  headline: string | null
  bio: string | null
  hourly_rate: number | null
  skills: string[]
  certifications: string[]
  availability_status: string | null
  created_at: string | null
}

// Order export data (both buyer and seller)
export interface OrderExportData {
  id: string
  order_number: string | null
  role: 'buyer' | 'seller'
  status: string
  total_amount: number
  currency: string
  order_type: string
  created_at: string
  completed_at: string | null
  counterparty_name: string | null
}

// Message export data
export interface MessageExportData {
  id: string
  conversation_id: string
  content: string
  is_sender: boolean
  created_at: string
  other_party_name: string | null
}

// Review export data
export interface ReviewExportData {
  id: string
  type: 'given' | 'received'
  rating: number
  comment: string | null
  order_id: string | null
  other_party_name: string | null
  created_at: string
}

// Payment export data (anonymized where needed)
export interface PaymentExportData {
  id: string
  type: 'received' | 'sent'
  amount: number
  currency: string
  status: string
  payment_method: string | null
  created_at: string
  // Transaction IDs kept for 7 years per UK tax law
  transaction_reference: string | null
}

// Booking export data
export interface BookingExportData {
  id: string
  status: string
  scheduled_at: string
  duration_minutes: number
  provider_name: string | null
  created_at: string
}

// Retention rule configuration
export interface RetentionRule {
  dataType: string
  retentionPeriod: number // in days
  reason: string
  canAnonymize: boolean
  canDelete: boolean
}

// Retention rules based on UK GDPR requirements
export const RETENTION_RULES: RetentionRule[] = [
  {
    dataType: 'transaction_records',
    retentionPeriod: 2555, // 7 years (UK tax law)
    reason: 'UK tax law requires retention for 7 years',
    canAnonymize: false,
    canDelete: false,
  },
  {
    dataType: 'payment_data',
    retentionPeriod: 2555, // 7 years (UK tax law)
    reason: 'UK tax law requires retention for 7 years',
    canAnonymize: false,
    canDelete: false,
  },
  {
    dataType: 'messages',
    retentionPeriod: 1095, // 3 years after last activity
    reason: 'Business record retention',
    canAnonymize: true,
    canDelete: true,
  },
  {
    dataType: 'reviews',
    retentionPeriod: -1, // indefinite, but anonymized
    reason: 'Platform integrity - anonymized reviews retained',
    canAnonymize: true,
    canDelete: false,
  },
  {
    dataType: 'session_logs',
    retentionPeriod: 90, // 90 days
    reason: 'Security monitoring',
    canAnonymize: true,
    canDelete: true,
  },
  {
    dataType: 'profile_data',
    retentionPeriod: 0, // Can be deleted immediately
    reason: 'User-controlled data',
    canAnonymize: true,
    canDelete: true,
  },
]

// Deletion check result
export interface DeletionCheckResult {
  canDelete: boolean
  canAnonymize: boolean
  retentionEndDate: string | null
  blockers: {
    dataType: string
    reason: string
    releaseDate: string | null
  }[]
}

// Scheduled deletion record
export interface ScheduledDeletion {
  id: string
  user_id: string
  scheduled_for: string
  deletion_type: 'full' | 'partial'
  data_to_delete: string[]
  created_at: string
  processed_at: string | null
  cancelled_at: string | null
}

// Admin GDPR dashboard stats
export interface GDPRDashboardStats {
  pendingRequests: number
  processingRequests: number
  completedThisMonth: number
  deniedThisMonth: number
  averageProcessingTime: number // in hours
  requestsByType: {
    access: number
    deletion: number
    export: number
  }
}

// Create data request params
export interface CreateDataRequestParams {
  requestType: DataRequestType
  reason?: string
}

// Process data request params
export interface ProcessDataRequestParams {
  requestId: string
  action: 'approve' | 'deny'
  denyReason?: string
}
