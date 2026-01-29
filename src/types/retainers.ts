// ==========================================
// RETAINER TYPES
// ==========================================

/**
 * Types for the retainer and timesheet system
 * Supporting weekly billing model for People marketplace bookings
 */

// ==========================================
// ENUMS / STATUS TYPES
// ==========================================

export type RetainerStatus = 'pending' | 'active' | 'paused' | 'cancelled'

export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'disputed' | 'paid'

export type WeeklyHoursCommitment = 10 | 20 | 40

// ==========================================
// RETAINER TYPES
// ==========================================

export interface Retainer {
  id: string
  buyer_id: string
  seller_id: string
  weekly_hours: number
  hourly_rate: number
  currency: string
  status: RetainerStatus
  started_at: string | null
  cancelled_at: string | null
  cancellation_effective: string | null
  created_at: string
}

export interface RetainerWithDetails extends Retainer {
  buyer: {
    id: string
    full_name: string | null
    email: string
    avatar_url: string | null
  }
  seller: {
    id: string
    user_id: string
    display_name?: string
    profile?: {
      id: string
      full_name: string | null
      email: string
      avatar_url: string | null
    }
  }
}

export interface CreateRetainerParams {
  sellerId: string
  weeklyHours: WeeklyHoursCommitment
  hourlyRate: number
  currency?: string
}

export interface UpdateRetainerParams {
  weeklyHours?: WeeklyHoursCommitment
  hourlyRate?: number
}

// ==========================================
// TIMESHEET TYPES
// ==========================================

export interface TimesheetEntry {
  id: string
  retainer_id: string
  week_start: string // DATE in YYYY-MM-DD format
  hours_logged: number
  description: string | null
  status: TimesheetStatus
  submitted_at: string | null
  approved_at: string | null
  paid_at: string | null
  stripe_payment_intent_id: string | null
}

export interface TimesheetWithDetails extends TimesheetEntry {
  retainer: RetainerWithDetails
}

export interface DailyHoursEntry {
  date: string // YYYY-MM-DD
  hours: number
  description: string
}

export interface CreateTimesheetParams {
  retainerId: string
  weekStart: string // YYYY-MM-DD (must be a Monday)
}

export interface LogHoursParams {
  timesheetId: string
  hours: number
  description: string
}

// ==========================================
// WEEKLY BILLING TYPES
// ==========================================

export interface WeeklyBilling {
  timesheetId: string
  retainerId: string
  weekStart: string
  weekEnd: string
  hoursLogged: number
  hourlyRate: number
  subtotal: number
  platformFee: number
  platformFeePercent: number
  vatAmount: number
  vatRate: number
  total: number
  currency: string
  status: TimesheetStatus
}

export interface WeeklyBillingLineItem {
  label: string
  amount: number
  type: 'hours' | 'fee' | 'tax' | 'total'
  description?: string
}

export interface WeeklyBillingSummary {
  items: WeeklyBillingLineItem[]
  hoursLogged: number
  hoursCommitted: number
  hourlyRate: number
  subtotal: number
  platformFee: number
  vatAmount: number
  total: number
  currency: string
  weekStart: string
  weekEnd: string
  status: TimesheetStatus
}

// ==========================================
// RETAINER STATS
// ==========================================

export interface RetainerStats {
  totalHoursThisWeek: number
  totalHoursThisMonth: number
  weeklyCommitment: number
  hoursRemaining: number
  totalEarnings: number
  totalSpend: number
  weeksActive: number
  approvalRate: number
  averageHoursPerWeek: number
  currency: string
}

// ==========================================
// RETAINER PRICING
// ==========================================

/**
 * Discount tiers for different weekly hour commitments
 * 10 hours/week = standard rate
 * 20 hours/week = 5% discount
 * 40 hours/week = 10% discount
 */
export const RETAINER_DISCOUNTS: Record<WeeklyHoursCommitment, number> = {
  10: 0,
  20: 0.05,
  40: 0.10
}

export interface RetainerPricing {
  weeklyHours: WeeklyHoursCommitment
  baseHourlyRate: number
  discountPercent: number
  discountedRate: number
  weeklyTotal: number
  monthlyEstimate: number
  currency: string
}

// ==========================================
// CANCELLATION
// ==========================================

export const CANCELLATION_NOTICE_DAYS = 14 // 2-week notice period

export interface CancellationDetails {
  retainerId: string
  requestedAt: string
  effectiveDate: string
  noticePeriodDays: number
  remainingTimesheets: number
  pendingAmount: number
  currency: string
}

// ==========================================
// FILTER & QUERY TYPES
// ==========================================

export interface RetainerFilters {
  role?: 'buyer' | 'seller'
  status?: RetainerStatus | RetainerStatus[]
  limit?: number
  offset?: number
}

export interface TimesheetFilters {
  retainerId?: string
  status?: TimesheetStatus | TimesheetStatus[]
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

// ==========================================
// RETAINER SETUP FORM
// ==========================================

export interface RetainerSetupFormData {
  providerId: string
  listingId?: string
  weeklyHours: WeeklyHoursCommitment
  customHourlyRate?: number
  message?: string
}

// ==========================================
// ACTION RESULT TYPES
// ==========================================

export interface RetainerActionResult {
  data: Retainer | null
  error: string | null
}

export interface TimesheetActionResult {
  data: TimesheetEntry | null
  error: string | null
}
