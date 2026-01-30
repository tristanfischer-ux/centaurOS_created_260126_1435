// Order types for the marketplace order lifecycle system

// Base order status from the database enum
export type OrderStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'disputed' | 'cancelled'

// Order type classification
export type OrderType = 'people_booking' | 'product_rfq' | 'service'

// Escrow status for payment tracking
export type EscrowStatus = 'pending' | 'held' | 'partial_release' | 'released' | 'refunded'

// Order event types for audit trail
export type OrderEventType =
  | 'created'
  | 'accepted'
  | 'declined'
  | 'started'
  | 'milestone_submitted'
  | 'milestone_approved'
  | 'milestone_rejected'
  | 'disputed'
  | 'dispute_resolved'
  | 'completed'
  | 'cancelled'
  | 'payment_received'
  | 'payment_released'
  | 'refunded'

// User role in the context of an order
export type OrderRole = 'buyer' | 'seller'

// Base profile type for order participants
export interface OrderProfile {
  id: string
  full_name: string | null
  email: string
  avatar_url: string | null
}

// Provider profile for sellers
export interface OrderProviderProfile {
  id: string
  user_id: string
  display_name: string
  business_type: string
  stripe_account_id: string | null
  profile?: OrderProfile
}

// Milestone type for milestone-based orders
export interface OrderMilestone {
  id: string
  order_id: string
  title: string
  description: string | null
  amount: number
  due_date: string | null
  status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'paid'
  submitted_at: string | null
  approved_at: string | null
  created_at: string
}

// Order event for history/audit trail
export interface OrderEvent {
  id: string
  order_id: string
  event_type: OrderEventType
  details: Record<string, unknown>
  actor_id: string
  actor_name?: string | null
  created_at: string
}

// Base order type from the database
export interface Order {
  id: string
  order_number: string | null
  buyer_id: string
  seller_id: string
  listing_id: string | null
  order_type: OrderType
  status: OrderStatus
  total_amount: number
  platform_fee: number
  currency: string
  stripe_payment_intent_id: string | null
  escrow_status: EscrowStatus
  objective_id: string | null
  business_function_id: string | null
  vat_amount: number
  vat_rate: number
  tax_treatment: 'standard' | 'reverse_charge' | 'exempt' | 'zero_rated'
  created_at: string
  completed_at: string | null
}

// Order with full details including related entities
export interface OrderWithDetails extends Order {
  buyer: OrderProfile
  seller: OrderProviderProfile & { profile?: OrderProfile }
  listing?: {
    id: string
    title: string
    category: string
    subcategory: string
    description: string | null
  } | null
  milestones: OrderMilestone[]
  events?: OrderEvent[]
  dispute?: {
    id: string
    reason: string
    status: string
    created_at: string
  } | null
}

// Parameters for creating an order
export interface CreateOrderParams {
  listingId?: string
  sellerId: string
  orderType: OrderType
  totalAmount: number
  currency?: string
  milestones?: Omit<OrderMilestone, 'id' | 'order_id' | 'created_at' | 'submitted_at' | 'approved_at'>[]
  objectiveId?: string
  businessFunctionId?: string
}

// Parameters for updating order status
export interface UpdateOrderStatusParams {
  orderId: string
  status: OrderStatus
  reason?: string
}

// Available action for an order based on status and role
export interface OrderAction {
  action: string
  label: string
  variant: 'default' | 'destructive' | 'outline' | 'secondary' | 'success' | 'warning'
  requiresConfirmation: boolean
  confirmationMessage?: string
}

// Filter parameters for listing orders
export interface OrderFilters {
  role?: OrderRole
  status?: OrderStatus | OrderStatus[]
  search?: string
  limit?: number
  offset?: number
}

// Order summary for list views
export interface OrderSummary {
  id: string
  order_number: string | null
  status: OrderStatus
  escrow_status: EscrowStatus
  total_amount: number
  currency: string
  order_type: OrderType
  created_at: string
  completed_at: string | null
  buyer: {
    id: string
    full_name: string | null
  }
  seller: {
    id: string
    display_name: string
    profile?: {
      id: string
      full_name: string | null
    }
  }
  listing?: {
    id: string
    title: string
  } | null
}

// Parsed order number components
export interface ParsedOrderNumber {
  prefix: string
  year: number
  sequence: number
}
