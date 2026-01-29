// @ts-nocheck
// TODO: Fix type mismatches
/**
 * Timesheet Service
 * Core business logic for timesheet management and weekly billing
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'
import {
  TimesheetEntry,
  TimesheetWithDetails,
  TimesheetStatus,
  TimesheetFilters,
  CreateTimesheetParams,
  LogHoursParams,
  WeeklyBillingSummary,
  WeeklyBillingLineItem,
} from '@/types/retainers'
import { format, startOfWeek, addDays, getDay, parseISO } from 'date-fns'

type TypedSupabaseClient = SupabaseClient<Database>

const PLATFORM_FEE_PERCENT = 10 // 10% platform fee
const VAT_RATE = 0.20 // 20% VAT (UK standard rate)

/**
 * Get the Monday of the current week
 */
export function getCurrentWeekStart(): string {
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }) // Monday
  return format(weekStart, 'yyyy-MM-dd')
}

/**
 * Get the Friday of the current week (billing period end)
 */
export function getCurrentWeekEnd(): string {
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = addDays(weekStart, 4) // Friday
  return format(weekEnd, 'yyyy-MM-dd')
}

/**
 * Validate that a date is a Monday
 */
function isMonday(dateStr: string): boolean {
  const date = parseISO(dateStr)
  return getDay(date) === 1
}

/**
 * Create a new timesheet for a week
 */
export async function createTimesheet(
  supabase: TypedSupabaseClient,
  params: CreateTimesheetParams
): Promise<{ data: TimesheetEntry | null; error: string | null }> {
  try {
    // Validate week_start is a Monday
    if (!isMonday(params.weekStart)) {
      return { data: null, error: 'Week start must be a Monday' }
    }

    // Check retainer exists and is active
    const { data: retainer, error: retainerError } = await supabase
      .from('retainers')
      .select('status')
      .eq('id', params.retainerId)
      .single()

    if (retainerError || !retainer) {
      return { data: null, error: 'Retainer not found' }
    }

    if (retainer.status !== 'active') {
      return { data: null, error: 'Retainer is not active' }
    }

    // Check if timesheet already exists for this week
    const { data: existing } = await supabase
      .from('timesheet_entries')
      .select('id')
      .eq('retainer_id', params.retainerId)
      .eq('week_start', params.weekStart)
      .single()

    if (existing) {
      return { data: null, error: 'Timesheet already exists for this week' }
    }

    // Create the timesheet
    const { data: timesheet, error: createError } = await supabase
      .from('timesheet_entries')
      .insert({
        retainer_id: params.retainerId,
        week_start: params.weekStart,
        hours_logged: 0,
        status: 'draft',
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating timesheet:', createError)
      return { data: null, error: 'Failed to create timesheet' }
    }

    return { data: timesheet as TimesheetEntry, error: null }
  } catch (err) {
    console.error('Error in createTimesheet:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Get or create current week's timesheet
 */
export async function getOrCreateCurrentTimesheet(
  supabase: TypedSupabaseClient,
  retainerId: string
): Promise<{ data: TimesheetEntry | null; error: string | null }> {
  try {
    const weekStart = getCurrentWeekStart()

    // Try to get existing timesheet
    const { data: existing, error: fetchError } = await supabase
      .from('timesheet_entries')
      .select('*')
      .eq('retainer_id', retainerId)
      .eq('week_start', weekStart)
      .single()

    if (existing) {
      return { data: existing as TimesheetEntry, error: null }
    }

    // Create new timesheet if not exists
    if (fetchError?.code === 'PGRST116') {
      // No rows returned
      return createTimesheet(supabase, { retainerId, weekStart })
    }

    console.error('Error fetching timesheet:', fetchError)
    return { data: null, error: 'Failed to get timesheet' }
  } catch (err) {
    console.error('Error in getOrCreateCurrentTimesheet:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Log hours on a timesheet
 */
export async function logHours(
  supabase: TypedSupabaseClient,
  params: LogHoursParams
): Promise<{ data: TimesheetEntry | null; error: string | null }> {
  try {
    // Get the timesheet
    const { data: timesheet, error: fetchError } = await supabase
      .from('timesheet_entries')
      .select('status, hours_logged, retainer_id')
      .eq('id', params.timesheetId)
      .single()

    if (fetchError || !timesheet) {
      return { data: null, error: 'Timesheet not found' }
    }

    // Only allow logging on draft or submitted (for amendments)
    if (!['draft', 'submitted'].includes(timesheet.status)) {
      return { data: null, error: 'Cannot log hours on this timesheet' }
    }

    // Get retainer to check weekly hours limit
    const { data: retainer } = await supabase
      .from('retainers')
      .select('weekly_hours')
      .eq('id', timesheet.retainer_id)
      .single()

    const maxHours = retainer?.weekly_hours || 40
    const newTotal = timesheet.hours_logged + params.hours

    if (newTotal > maxHours * 1.5) {
      // Allow up to 150% of committed hours
      return { data: null, error: `Total hours would exceed ${maxHours * 1.5} hours limit` }
    }

    if (params.hours < 0) {
      return { data: null, error: 'Hours must be positive' }
    }

    // Update the timesheet
    const { data: updated, error: updateError } = await supabase
      .from('timesheet_entries')
      .update({
        hours_logged: newTotal,
        description: params.description,
        status: 'draft', // Reset to draft if it was submitted
      })
      .eq('id', params.timesheetId)
      .select()
      .single()

    if (updateError) {
      console.error('Error logging hours:', updateError)
      return { data: null, error: 'Failed to log hours' }
    }

    return { data: updated as TimesheetEntry, error: null }
  } catch (err) {
    console.error('Error in logHours:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Update timesheet hours (replace rather than add)
 */
export async function updateTimesheetHours(
  supabase: TypedSupabaseClient,
  timesheetId: string,
  hours: number,
  description: string
): Promise<{ data: TimesheetEntry | null; error: string | null }> {
  try {
    const { data: timesheet, error: fetchError } = await supabase
      .from('timesheet_entries')
      .select('status, retainer_id')
      .eq('id', timesheetId)
      .single()

    if (fetchError || !timesheet) {
      return { data: null, error: 'Timesheet not found' }
    }

    if (!['draft', 'submitted'].includes(timesheet.status)) {
      return { data: null, error: 'Cannot modify this timesheet' }
    }

    // Get retainer to check weekly hours limit
    const { data: retainer } = await supabase
      .from('retainers')
      .select('weekly_hours')
      .eq('id', timesheet.retainer_id)
      .single()

    const maxHours = retainer?.weekly_hours || 40

    if (hours > maxHours * 1.5) {
      return { data: null, error: `Hours cannot exceed ${maxHours * 1.5}` }
    }

    if (hours < 0) {
      return { data: null, error: 'Hours must be positive' }
    }

    const { data: updated, error: updateError } = await supabase
      .from('timesheet_entries')
      .update({
        hours_logged: hours,
        description,
        status: 'draft',
      })
      .eq('id', timesheetId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating timesheet:', updateError)
      return { data: null, error: 'Failed to update timesheet' }
    }

    return { data: updated as TimesheetEntry, error: null }
  } catch (err) {
    console.error('Error in updateTimesheetHours:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Submit timesheet for approval
 */
export async function submitTimesheet(
  supabase: TypedSupabaseClient,
  timesheetId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { data: timesheet, error: fetchError } = await supabase
      .from('timesheet_entries')
      .select('status, hours_logged')
      .eq('id', timesheetId)
      .single()

    if (fetchError || !timesheet) {
      return { success: false, error: 'Timesheet not found' }
    }

    if (timesheet.status !== 'draft') {
      return { success: false, error: 'Timesheet is already submitted' }
    }

    if (timesheet.hours_logged === 0) {
      return { success: false, error: 'Cannot submit a timesheet with 0 hours' }
    }

    const { error: updateError } = await supabase
      .from('timesheet_entries')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      })
      .eq('id', timesheetId)

    if (updateError) {
      console.error('Error submitting timesheet:', updateError)
      return { success: false, error: 'Failed to submit timesheet' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in submitTimesheet:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Approve a submitted timesheet (buyer action)
 */
export async function approveTimesheet(
  supabase: TypedSupabaseClient,
  timesheetId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { data: timesheet, error: fetchError } = await supabase
      .from('timesheet_entries')
      .select('status')
      .eq('id', timesheetId)
      .single()

    if (fetchError || !timesheet) {
      return { success: false, error: 'Timesheet not found' }
    }

    if (timesheet.status !== 'submitted') {
      return { success: false, error: 'Timesheet must be submitted before approval' }
    }

    const { error: updateError } = await supabase
      .from('timesheet_entries')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
      })
      .eq('id', timesheetId)

    if (updateError) {
      console.error('Error approving timesheet:', updateError)
      return { success: false, error: 'Failed to approve timesheet' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in approveTimesheet:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Dispute a timesheet (buyer action)
 */
export async function disputeTimesheet(
  supabase: TypedSupabaseClient,
  timesheetId: string,
  reason: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!reason || reason.trim().length === 0) {
      return { success: false, error: 'Dispute reason is required' }
    }

    const { data: timesheet, error: fetchError } = await supabase
      .from('timesheet_entries')
      .select('status, description')
      .eq('id', timesheetId)
      .single()

    if (fetchError || !timesheet) {
      return { success: false, error: 'Timesheet not found' }
    }

    if (timesheet.status !== 'submitted') {
      return { success: false, error: 'Only submitted timesheets can be disputed' }
    }

    // Update status and add dispute reason to description
    const newDescription = `${timesheet.description || ''}\n\n[DISPUTE: ${reason}]`.trim()

    const { error: updateError } = await supabase
      .from('timesheet_entries')
      .update({
        status: 'disputed',
        description: newDescription,
      })
      .eq('id', timesheetId)

    if (updateError) {
      console.error('Error disputing timesheet:', updateError)
      return { success: false, error: 'Failed to dispute timesheet' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in disputeTimesheet:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Get timesheet by ID with retainer details
 */
export async function getTimesheet(
  supabase: TypedSupabaseClient,
  timesheetId: string
): Promise<{ data: TimesheetWithDetails | null; error: string | null }> {
  try {
    const { data: timesheet, error } = await supabase
      .from('timesheet_entries')
      .select(`
        *,
        retainer:retainers (
          *,
          buyer:profiles!retainers_buyer_id_fkey (
            id,
            full_name,
            email,
            avatar_url
          ),
          seller:provider_profiles!retainers_seller_id_fkey (
            id,
            user_id
          )
        )
      `)
      .eq('id', timesheetId)
      .single()

    if (error) {
      console.error('Error fetching timesheet:', error)
      return { data: null, error: 'Timesheet not found' }
    }

    // Get seller profile
    let sellerProfile = null
    if (timesheet.retainer?.seller?.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .eq('id', timesheet.retainer.seller.user_id)
        .single()
      sellerProfile = profile
    }

    const result: TimesheetWithDetails = {
      ...timesheet,
      retainer: {
        ...timesheet.retainer,
        seller: {
          ...timesheet.retainer.seller,
          profile: sellerProfile,
        },
      },
    }

    return { data: result, error: null }
  } catch (err) {
    console.error('Error in getTimesheet:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Get timesheet history for a retainer
 */
export async function getTimesheetHistory(
  supabase: TypedSupabaseClient,
  retainerId: string,
  filters: TimesheetFilters = {}
): Promise<{ data: TimesheetEntry[]; error: string | null; count: number }> {
  try {
    let query = supabase
      .from('timesheet_entries')
      .select('*', { count: 'exact' })
      .eq('retainer_id', retainerId)

    // Filter by status
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('status', filters.status)
      } else {
        query = query.eq('status', filters.status)
      }
    }

    // Date range filter
    if (filters.startDate) {
      query = query.gte('week_start', filters.startDate)
    }
    if (filters.endDate) {
      query = query.lte('week_start', filters.endDate)
    }

    // Pagination
    const limit = filters.limit || 10
    const offset = filters.offset || 0
    query = query
      .order('week_start', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching timesheets:', error)
      return { data: [], error: 'Failed to fetch timesheets', count: 0 }
    }

    return { data: data as TimesheetEntry[], error: null, count: count || 0 }
  } catch (err) {
    console.error('Error in getTimesheetHistory:', err)
    return { data: [], error: 'An unexpected error occurred', count: 0 }
  }
}

/**
 * Calculate weekly billing summary for a timesheet
 */
export async function calculateWeeklyBilling(
  supabase: TypedSupabaseClient,
  timesheetId: string
): Promise<{ data: WeeklyBillingSummary | null; error: string | null }> {
  try {
    // Get timesheet with retainer
    const { data: timesheet, error } = await supabase
      .from('timesheet_entries')
      .select(`
        *,
        retainer:retainers (
          weekly_hours,
          hourly_rate,
          currency
        )
      `)
      .eq('id', timesheetId)
      .single()

    if (error || !timesheet) {
      return { data: null, error: 'Timesheet not found' }
    }

    const weekStartDate = parseISO(timesheet.week_start)
    const weekEndDate = addDays(weekStartDate, 4) // Friday

    const hoursLogged = timesheet.hours_logged || 0
    const hourlyRate = timesheet.retainer.hourly_rate
    const subtotal = hoursLogged * hourlyRate
    const platformFee = subtotal * (PLATFORM_FEE_PERCENT / 100)
    const subtotalWithFee = subtotal + platformFee
    const vatAmount = subtotalWithFee * VAT_RATE
    const total = subtotalWithFee + vatAmount

    const items: WeeklyBillingLineItem[] = [
      {
        label: `${hoursLogged} hours @ ${timesheet.retainer.currency} ${hourlyRate.toFixed(2)}/hour`,
        amount: subtotal,
        type: 'hours',
      },
      {
        label: `Platform fee (${PLATFORM_FEE_PERCENT}%)`,
        amount: platformFee,
        type: 'fee',
        description: 'Includes escrow protection',
      },
      {
        label: `VAT (${VAT_RATE * 100}%)`,
        amount: vatAmount,
        type: 'tax',
      },
      {
        label: 'Total',
        amount: total,
        type: 'total',
      },
    ]

    const summary: WeeklyBillingSummary = {
      items,
      hoursLogged,
      hoursCommitted: timesheet.retainer.weekly_hours,
      hourlyRate,
      subtotal,
      platformFee,
      vatAmount,
      total,
      currency: timesheet.retainer.currency,
      weekStart: format(weekStartDate, 'dd MMM yyyy'),
      weekEnd: format(weekEndDate, 'dd MMM yyyy'),
      status: timesheet.status as TimesheetStatus,
    }

    return { data: summary, error: null }
  } catch (err) {
    console.error('Error in calculateWeeklyBilling:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Mark timesheet as paid
 */
export async function markTimesheetPaid(
  supabase: TypedSupabaseClient,
  timesheetId: string,
  stripePaymentIntentId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { data: timesheet, error: fetchError } = await supabase
      .from('timesheet_entries')
      .select('status')
      .eq('id', timesheetId)
      .single()

    if (fetchError || !timesheet) {
      return { success: false, error: 'Timesheet not found' }
    }

    if (timesheet.status !== 'approved') {
      return { success: false, error: 'Timesheet must be approved before marking as paid' }
    }

    const { error: updateError } = await supabase
      .from('timesheet_entries')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        stripe_payment_intent_id: stripePaymentIntentId,
      })
      .eq('id', timesheetId)

    if (updateError) {
      console.error('Error marking timesheet paid:', updateError)
      return { success: false, error: 'Failed to update timesheet' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in markTimesheetPaid:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}
