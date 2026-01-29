/**
 * RFQ (Request for Quote) Types
 * Types for the RFQ race system in the Product Marketplace
 */

// =============================================
// ENUMS
// =============================================

/** RFQ type classification */
export type RFQType = 'commodity' | 'custom' | 'service'

/** RFQ status enum - matches database rfq_status */
export type RFQStatus = 'Open' | 'Bidding' | 'Awarded' | 'Closed' | 'priority_hold' | 'cancelled'

/** RFQ response type */
export type RFQResponseType = 'accept' | 'info_request' | 'decline'

/** Supplier tier - determines race delay timing */
export type SupplierTier = 'verified_partner' | 'approved' | 'pending' | 'suspended'

/** RFQ urgency level */
export type RFQUrgency = 'urgent' | 'standard'

// =============================================
// CORE TYPES
// =============================================

/** RFQ specifications - flexible schema for different product types */
export interface RFQSpecifications {
  description?: string
  quantity?: number
  unit?: string
  materials?: string[]
  dimensions?: {
    length?: number
    width?: number
    height?: number
    unit?: string
  }
  attachments?: string[]
  custom_fields?: Record<string, unknown>
  [key: string]: unknown
}

/** Core RFQ type */
export interface RFQ {
  id: string
  buyer_id: string
  rfq_type: RFQType
  title: string
  specifications: RFQSpecifications
  budget_min: number | null
  budget_max: number | null
  deadline: string | null
  category: string | null
  status: RFQStatus
  priority_holder_id: string | null
  priority_hold_expires_at: string | null
  awarded_to: string | null
  urgency: RFQUrgency
  race_opens_at: string | null
  foundry_id: string
  created_at: string
}

/** RFQ with buyer profile information */
export interface RFQWithBuyer extends RFQ {
  buyer: {
    id: string
    full_name: string | null
    email: string
    avatar_url: string | null
  } | null
}

/** RFQ Response from a supplier */
export interface RFQResponse {
  id: string
  rfq_id: string
  provider_id: string
  response_type: RFQResponseType
  quoted_price: number | null
  message: string | null
  responded_at: string
}

/** RFQ Response with provider details */
export interface RFQResponseWithProvider extends RFQResponse {
  provider: {
    id: string
    user_id: string
    headline: string | null
    tier: SupplierTier
    day_rate: number | null
  } | null
  provider_profile?: {
    id: string
    full_name: string | null
    avatar_url: string | null
  } | null
}

/** RFQ Broadcast record - tracks timezone-aware delivery */
export interface RFQBroadcast {
  id: string
  rfq_id: string
  provider_id: string
  scheduled_at: string
  delivered_at: string | null
  viewed_at: string | null
  created_at: string
}

/** RFQ Broadcast with provider details */
export interface RFQBroadcastWithProvider extends RFQBroadcast {
  provider: {
    id: string
    user_id: string
    timezone: string | null
    tier: SupplierTier
  } | null
}

// =============================================
// COMPOSITE TYPES
// =============================================

/** Full RFQ details including responses and broadcasts */
export interface RFQWithDetails extends RFQWithBuyer {
  responses: RFQResponseWithProvider[]
  broadcasts: RFQBroadcastWithProvider[]
  response_count: number
  has_user_responded: boolean
}

/** RFQ summary for list views */
export interface RFQSummary {
  id: string
  title: string
  rfq_type: RFQType
  status: RFQStatus
  budget_min: number | null
  budget_max: number | null
  deadline: string | null
  category: string | null
  urgency: RFQUrgency
  created_at: string
  response_count: number
  buyer: {
    full_name: string | null
  } | null
}

// =============================================
// RACE STATUS TYPES
// =============================================

/** Race status for UI display */
export interface RaceStatus {
  status: 'scheduled' | 'open' | 'priority_hold' | 'awarded' | 'closed' | 'cancelled'
  race_opens_at: string | null
  time_until_open_ms: number | null
  priority_holder?: {
    id: string
    full_name: string | null
  } | null
  priority_hold_expires_at: string | null
  winner?: {
    id: string
    full_name: string | null
    quoted_price: number | null
  } | null
  total_responses: number
  accept_count: number
}

/** Broadcast schedule for a provider */
export interface ProviderBroadcastSchedule {
  provider_id: string
  timezone: string
  scheduled_at: string
  local_time: string
  tier: SupplierTier
  delay_seconds: number
}

// =============================================
// CREATE/UPDATE PARAMS
// =============================================

/** Parameters for creating a new RFQ */
export interface CreateRFQParams {
  title: string
  rfq_type: RFQType
  specifications?: RFQSpecifications
  budget_min?: number | null
  budget_max?: number | null
  deadline?: string | null
  category?: string | null
  urgency?: RFQUrgency
}

/** Parameters for updating an RFQ */
export interface UpdateRFQParams {
  title?: string
  specifications?: RFQSpecifications
  budget_min?: number | null
  budget_max?: number | null
  deadline?: string | null
  category?: string | null
  urgency?: RFQUrgency
}

/** Parameters for submitting an RFQ response */
export interface SubmitRFQResponseParams {
  rfq_id: string
  response_type: RFQResponseType
  quoted_price?: number | null
  message?: string | null
}

/** Parameters for updating an RFQ response */
export interface UpdateRFQResponseParams {
  quoted_price?: number | null
  message?: string | null
}

// =============================================
// FILTER/QUERY TYPES
// =============================================

/** RFQ list filters */
export interface RFQFilters {
  status?: RFQStatus | RFQStatus[]
  rfq_type?: RFQType | RFQType[]
  category?: string
  urgency?: RFQUrgency
  buyer_id?: string
  search?: string
  limit?: number
  offset?: number
}

/** Role for fetching RFQs */
export type RFQRole = 'buyer' | 'supplier'

// =============================================
// MATCHING TYPES
// =============================================

/** Supplier match result */
export interface SupplierMatch {
  provider_id: string
  user_id: string
  full_name: string | null
  headline: string | null
  tier: SupplierTier
  timezone: string | null
  match_score: number
  match_reasons: string[]
}

// =============================================
// RACE MECHANICS CONSTANTS
// =============================================

/** Race mechanics timing constants */
export const RACE_CONSTANTS = {
  /** Priority hold duration for custom RFQs (2 hours) */
  PRIORITY_HOLD_DURATION_MS: 2 * 60 * 60 * 1000,
  /** Delay for approved suppliers vs verified partners (30 seconds) */
  TIER_DELAY_MS: 30 * 1000,
  /** Minimum time before race opens from creation */
  MIN_RACE_DELAY_MS: 5 * 60 * 1000,
  /** Default broadcast hour (9am local time) */
  DEFAULT_BROADCAST_HOUR: 9,
  /** Business hours start */
  BUSINESS_HOURS_START: 9,
  /** Business hours end */
  BUSINESS_HOURS_END: 18,
} as const

/** RFQ categories for the product marketplace */
export const RFQ_CATEGORIES = [
  'Raw Materials',
  'Components',
  'Electronics',
  'Packaging',
  'Tools & Equipment',
  'Safety Equipment',
  'Office Supplies',
  'Custom Manufacturing',
  'Prototyping',
  'Assembly Services',
  'Quality Testing',
  'Logistics',
  'Other',
] as const

export type RFQCategory = (typeof RFQ_CATEGORIES)[number]
