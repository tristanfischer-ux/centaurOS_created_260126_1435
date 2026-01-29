/**
 * Retainer Service
 * Core business logic for retainer management
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'
import {
  Retainer,
  RetainerWithDetails,
  CreateRetainerParams,
  UpdateRetainerParams,
  RetainerStats,
  RetainerFilters,
  RETAINER_DISCOUNTS,
  CANCELLATION_NOTICE_DAYS,
  WeeklyHoursCommitment,
  RetainerPricing,
  CancellationDetails,
} from '@/types/retainers'
import { addDays, format, startOfWeek, differenceInWeeks } from 'date-fns'

type TypedSupabaseClient = SupabaseClient<Database>

/**
 * Create a new retainer agreement
 */
export async function createRetainer(
  supabase: TypedSupabaseClient,
  buyerId: string,
  params: CreateRetainerParams
): Promise<{ data: Retainer | null; error: string | null }> {
  try {
    // Validate weekly hours commitment
    if (![10, 20, 40].includes(params.weeklyHours)) {
      return { data: null, error: 'Weekly hours must be 10, 20, or 40' }
    }

    // Apply discount based on commitment
    const discount = RETAINER_DISCOUNTS[params.weeklyHours as WeeklyHoursCommitment]
    const discountedRate = params.hourlyRate * (1 - discount)

    // Create the retainer
    const { data: retainer, error: retainerError } = await supabase
      .from('retainers')
      .insert({
        buyer_id: buyerId,
        seller_id: params.sellerId,
        weekly_hours: params.weeklyHours,
        hourly_rate: discountedRate,
        currency: params.currency || 'GBP',
        status: 'pending',
      })
      .select()
      .single()

    if (retainerError) {
      console.error('Error creating retainer:', retainerError)
      return { data: null, error: 'Failed to create retainer agreement' }
    }

    return { data: retainer as Retainer, error: null }
  } catch (err) {
    console.error('Error in createRetainer:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Get a retainer by ID with full details
 */
export async function getRetainer(
  supabase: TypedSupabaseClient,
  retainerId: string
): Promise<{ data: RetainerWithDetails | null; error: string | null }> {
  try {
    const { data: retainer, error } = await supabase
      .from('retainers')
      .select(`
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
      `)
      .eq('id', retainerId)
      .single()

    if (error) {
      console.error('Error fetching retainer:', error)
      return { data: null, error: 'Retainer not found' }
    }

    // Get seller profile info
    let sellerProfile = null
    if (retainer.seller?.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .eq('id', retainer.seller.user_id)
        .single()
      sellerProfile = profile
    }

    const retainerWithDetails: RetainerWithDetails = {
      ...retainer,
      buyer: retainer.buyer,
      seller: {
        ...retainer.seller,
        profile: sellerProfile,
      },
    }

    return { data: retainerWithDetails, error: null }
  } catch (err) {
    console.error('Error in getRetainer:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Update retainer terms
 */
export async function updateRetainer(
  supabase: TypedSupabaseClient,
  retainerId: string,
  updates: UpdateRetainerParams
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Get current retainer
    const { data: current, error: fetchError } = await supabase
      .from('retainers')
      .select('status, hourly_rate')
      .eq('id', retainerId)
      .single()

    if (fetchError || !current) {
      return { success: false, error: 'Retainer not found' }
    }

    // Only allow updates on pending or active retainers
    if (!['pending', 'active'].includes(current.status)) {
      return { success: false, error: 'Cannot update a cancelled or paused retainer' }
    }

    const updateData: Record<string, unknown> = {}

    if (updates.weeklyHours) {
      if (![10, 20, 40].includes(updates.weeklyHours)) {
        return { success: false, error: 'Weekly hours must be 10, 20, or 40' }
      }
      updateData.weekly_hours = updates.weeklyHours

      // Recalculate rate with new discount
      const baseRate = updates.hourlyRate || current.hourly_rate
      const discount = RETAINER_DISCOUNTS[updates.weeklyHours as WeeklyHoursCommitment]
      updateData.hourly_rate = baseRate * (1 - discount)
    }

    if (updates.hourlyRate && !updates.weeklyHours) {
      updateData.hourly_rate = updates.hourlyRate
    }

    const { error: updateError } = await supabase
      .from('retainers')
      .update(updateData)
      .eq('id', retainerId)

    if (updateError) {
      console.error('Error updating retainer:', updateError)
      return { success: false, error: 'Failed to update retainer' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in updateRetainer:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Activate a pending retainer
 */
export async function activateRetainer(
  supabase: TypedSupabaseClient,
  retainerId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { data: retainer, error: fetchError } = await supabase
      .from('retainers')
      .select('status')
      .eq('id', retainerId)
      .single()

    if (fetchError || !retainer) {
      return { success: false, error: 'Retainer not found' }
    }

    if (retainer.status !== 'pending') {
      return { success: false, error: 'Only pending retainers can be activated' }
    }

    const { error: updateError } = await supabase
      .from('retainers')
      .update({
        status: 'active',
        started_at: new Date().toISOString(),
      })
      .eq('id', retainerId)

    if (updateError) {
      console.error('Error activating retainer:', updateError)
      return { success: false, error: 'Failed to activate retainer' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in activateRetainer:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Pause a retainer
 */
export async function pauseRetainer(
  supabase: TypedSupabaseClient,
  retainerId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { data: retainer, error: fetchError } = await supabase
      .from('retainers')
      .select('status')
      .eq('id', retainerId)
      .single()

    if (fetchError || !retainer) {
      return { success: false, error: 'Retainer not found' }
    }

    if (retainer.status !== 'active') {
      return { success: false, error: 'Only active retainers can be paused' }
    }

    const { error: updateError } = await supabase
      .from('retainers')
      .update({ status: 'paused' })
      .eq('id', retainerId)

    if (updateError) {
      console.error('Error pausing retainer:', updateError)
      return { success: false, error: 'Failed to pause retainer' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in pauseRetainer:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Resume a paused retainer
 */
export async function resumeRetainer(
  supabase: TypedSupabaseClient,
  retainerId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { data: retainer, error: fetchError } = await supabase
      .from('retainers')
      .select('status')
      .eq('id', retainerId)
      .single()

    if (fetchError || !retainer) {
      return { success: false, error: 'Retainer not found' }
    }

    if (retainer.status !== 'paused') {
      return { success: false, error: 'Only paused retainers can be resumed' }
    }

    const { error: updateError } = await supabase
      .from('retainers')
      .update({ status: 'active' })
      .eq('id', retainerId)

    if (updateError) {
      console.error('Error resuming retainer:', updateError)
      return { success: false, error: 'Failed to resume retainer' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in resumeRetainer:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Cancel a retainer with 2-week notice period
 */
export async function cancelRetainer(
  supabase: TypedSupabaseClient,
  retainerId: string,
  effectiveDate?: string
): Promise<{ data: CancellationDetails | null; error: string | null }> {
  try {
    const { data: retainer, error: fetchError } = await supabase
      .from('retainers')
      .select('status, currency, hourly_rate, weekly_hours')
      .eq('id', retainerId)
      .single()

    if (fetchError || !retainer) {
      return { data: null, error: 'Retainer not found' }
    }

    if (!['active', 'paused'].includes(retainer.status)) {
      return { data: null, error: 'Retainer is already cancelled or not yet active' }
    }

    const now = new Date()
    const cancelledAt = now.toISOString()
    
    // Calculate effective date (minimum 2 weeks from now)
    let cancellationEffective: Date
    if (effectiveDate) {
      const requested = new Date(effectiveDate)
      const minDate = addDays(now, CANCELLATION_NOTICE_DAYS)
      cancellationEffective = requested > minDate ? requested : minDate
    } else {
      cancellationEffective = addDays(now, CANCELLATION_NOTICE_DAYS)
    }

    // Calculate remaining timesheets
    const weeksRemaining = Math.ceil(
      differenceInWeeks(cancellationEffective, now)
    )
    const pendingAmount = weeksRemaining * retainer.weekly_hours * retainer.hourly_rate

    const { error: updateError } = await supabase
      .from('retainers')
      .update({
        status: 'cancelled',
        cancelled_at: cancelledAt,
        cancellation_effective: cancellationEffective.toISOString(),
      })
      .eq('id', retainerId)

    if (updateError) {
      console.error('Error cancelling retainer:', updateError)
      return { data: null, error: 'Failed to cancel retainer' }
    }

    const details: CancellationDetails = {
      retainerId,
      requestedAt: cancelledAt,
      effectiveDate: cancellationEffective.toISOString(),
      noticePeriodDays: CANCELLATION_NOTICE_DAYS,
      remainingTimesheets: weeksRemaining,
      pendingAmount,
      currency: retainer.currency,
    }

    return { data: details, error: null }
  } catch (err) {
    console.error('Error in cancelRetainer:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Get retainers for a user with filters
 */
export async function getRetainers(
  supabase: TypedSupabaseClient,
  userId: string,
  filters: RetainerFilters
): Promise<{ data: RetainerWithDetails[]; error: string | null; count: number }> {
  try {
    let query = supabase
      .from('retainers')
      .select(`
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
      `, { count: 'exact' })

    // Filter by role
    if (filters.role === 'buyer') {
      query = query.eq('buyer_id', userId)
    } else if (filters.role === 'seller') {
      // For seller role, we need to match on provider_profile.user_id
      const { data: providerProfile } = await supabase
        .from('provider_profiles')
        .select('id')
        .eq('user_id', userId)
        .single()

      if (providerProfile) {
        query = query.eq('seller_id', providerProfile.id)
      } else {
        return { data: [], error: null, count: 0 }
      }
    } else {
      // No role filter - get retainers where user is buyer OR seller
      const { data: providerProfile } = await supabase
        .from('provider_profiles')
        .select('id')
        .eq('user_id', userId)
        .single()

      if (providerProfile) {
        query = query.or(`buyer_id.eq.${userId},seller_id.eq.${providerProfile.id}`)
      } else {
        query = query.eq('buyer_id', userId)
      }
    }

    // Filter by status
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('status', filters.status)
      } else {
        query = query.eq('status', filters.status)
      }
    }

    // Pagination
    const limit = filters.limit || 20
    const offset = filters.offset || 0
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching retainers:', error)
      return { data: [], error: 'Failed to fetch retainers', count: 0 }
    }

    // Fetch seller profiles
    const retainersWithDetails: RetainerWithDetails[] = await Promise.all(
      (data || []).map(async (retainer) => {
        let sellerProfile = null
        if (retainer.seller?.user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, full_name, email, avatar_url')
            .eq('id', retainer.seller.user_id)
            .single()
          sellerProfile = profile
        }

        return {
          ...retainer,
          seller: {
            ...retainer.seller,
            profile: sellerProfile,
          },
        } as RetainerWithDetails
      })
    )

    return { data: retainersWithDetails, error: null, count: count || 0 }
  } catch (err) {
    console.error('Error in getRetainers:', err)
    return { data: [], error: 'An unexpected error occurred', count: 0 }
  }
}

/**
 * Get retainer statistics
 * @param _userId - User ID, kept for future role-based filtering
 */
export async function getRetainerStats(
  supabase: TypedSupabaseClient,
  retainerId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userId: string
): Promise<{ data: RetainerStats | null; error: string | null }> {
  try {
    // Get the retainer
    const { data: retainer, error: retainerError } = await supabase
      .from('retainers')
      .select('weekly_hours, hourly_rate, currency, started_at, status')
      .eq('id', retainerId)
      .single()

    if (retainerError || !retainer) {
      return { data: null, error: 'Retainer not found' }
    }

    // Get this week's start
    const now = new Date()
    const weekStart = startOfWeek(now, { weekStartsOn: 1 })
    const weekStartStr = format(weekStart, 'yyyy-MM-dd')

    // Get all timesheets for this retainer
    const { data: timesheets, error: timesheetError } = await supabase
      .from('timesheet_entries')
      .select('hours_logged, week_start, status')
      .eq('retainer_id', retainerId)

    if (timesheetError) {
      console.error('Error fetching timesheets:', timesheetError)
      return { data: null, error: 'Failed to fetch timesheet data' }
    }

    // Calculate stats
    const thisWeekTimesheet = timesheets?.find(t => t.week_start === weekStartStr)
    const totalHoursThisWeek = thisWeekTimesheet?.hours_logged || 0

    // Calculate this month's hours
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const thisMonthTimesheets = timesheets?.filter(t => {
      const wsDate = new Date(t.week_start)
      return wsDate >= monthStart
    }) || []
    const totalHoursThisMonth = thisMonthTimesheets.reduce(
      (sum, t) => sum + (t.hours_logged || 0),
      0
    )

    // Calculate total earnings/spend
    const approvedTimesheets = timesheets?.filter(
      t => t.status === 'approved' || t.status === 'paid'
    ) || []
    const totalAmount = approvedTimesheets.reduce(
      (sum, t) => sum + (t.hours_logged || 0) * retainer.hourly_rate,
      0
    )

    // Calculate approval rate
    const submittedTimesheets = timesheets?.filter(
      t => t.status !== 'draft'
    ) || []
    const approvedCount = approvedTimesheets.length
    const approvalRate = submittedTimesheets.length > 0
      ? (approvedCount / submittedTimesheets.length) * 100
      : 100

    // Calculate weeks active
    const weeksActive = retainer.started_at
      ? differenceInWeeks(now, new Date(retainer.started_at)) + 1
      : 0

    // Calculate average hours per week
    const averageHoursPerWeek = weeksActive > 0
      ? (timesheets?.reduce((sum, t) => sum + (t.hours_logged || 0), 0) || 0) / weeksActive
      : 0

    const stats: RetainerStats = {
      totalHoursThisWeek,
      totalHoursThisMonth,
      weeklyCommitment: retainer.weekly_hours,
      hoursRemaining: Math.max(0, retainer.weekly_hours - totalHoursThisWeek),
      totalEarnings: totalAmount, // For seller
      totalSpend: totalAmount,    // For buyer
      weeksActive,
      approvalRate,
      averageHoursPerWeek,
      currency: retainer.currency,
    }

    return { data: stats, error: null }
  } catch (err) {
    console.error('Error in getRetainerStats:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Calculate retainer pricing with discounts
 */
export function calculateRetainerPricing(
  weeklyHours: WeeklyHoursCommitment,
  baseHourlyRate: number,
  currency: string = 'GBP'
): RetainerPricing {
  const discountPercent = RETAINER_DISCOUNTS[weeklyHours] * 100
  const discountedRate = baseHourlyRate * (1 - RETAINER_DISCOUNTS[weeklyHours])
  const weeklyTotal = discountedRate * weeklyHours
  const monthlyEstimate = weeklyTotal * 4.33 // Average weeks per month

  return {
    weeklyHours,
    baseHourlyRate,
    discountPercent,
    discountedRate,
    weeklyTotal,
    monthlyEstimate,
    currency,
  }
}
