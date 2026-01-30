/**
 * Weekly Billing Service
 * Handles automated weekly billing for retainer timesheets
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'
import { WeeklyBilling, TimesheetStatus } from '@/types/retainers'
import { format, subWeeks, startOfWeek, addDays, parseISO } from 'date-fns'
import { createPaymentIntent } from '@/lib/stripe/escrow'
import { markTimesheetPaid, revertTimesheetToPending } from './timesheets'
import { RETAINER_PLATFORM_FEE_PERCENT, DEFAULT_VAT_RATE } from '@/types/payments'

type TypedSupabaseClient = SupabaseClient<Database>

// Use centralized fee constants
const PLATFORM_FEE_PERCENT = RETAINER_PLATFORM_FEE_PERCENT
const VAT_RATE = DEFAULT_VAT_RATE

/**
 * Interface for weekly billing processing result
 */
interface BillingProcessResult {
  timesheetId: string
  retainerId: string
  success: boolean
  amount?: number
  paymentIntentId?: string
  error?: string
}

/**
 * Process weekly billing for all approved timesheets
 * This would typically be called by a cron job
 */
export async function processWeeklyBilling(
  supabase: TypedSupabaseClient
): Promise<{ processed: BillingProcessResult[]; errors: string[] }> {
  const results: BillingProcessResult[] = []
  const errors: string[] = []

  try {
    // Get all approved timesheets that haven't been paid yet
    const { data: approvedTimesheets, error: fetchError } = await supabase
      .from('timesheet_entries')
      .select(`
        *,
        retainer:retainers (
          id,
          buyer_id,
          seller_id,
          hourly_rate,
          currency,
          status,
          seller:provider_profiles!retainers_seller_id_fkey (
            stripe_account_id
          )
        )
      `)
      .eq('status', 'approved')

    if (fetchError) {
      console.error('Error fetching approved timesheets:', fetchError)
      errors.push('Failed to fetch approved timesheets')
      return { processed: results, errors }
    }

    if (!approvedTimesheets || approvedTimesheets.length === 0) {
      return { processed: results, errors }
    }

    // Process each approved timesheet
    for (const timesheet of approvedTimesheets) {
      try {
        // Skip if retainer is not active
        if (timesheet.retainer.status !== 'active') {
          results.push({
            timesheetId: timesheet.id,
            retainerId: timesheet.retainer.id,
            success: false,
            error: 'Retainer is not active',
          })
          continue
        }

        // Check if seller has Stripe account
        if (!timesheet.retainer.seller?.stripe_account_id) {
          results.push({
            timesheetId: timesheet.id,
            retainerId: timesheet.retainer.id,
            success: false,
            error: 'Seller does not have Stripe account connected',
          })
          continue
        }

        // Calculate billing amount
        const hoursLogged = timesheet.hours_logged || 0
        const hourlyRate = timesheet.retainer.hourly_rate
        const subtotal = hoursLogged * hourlyRate
        const platformFee = subtotal * (PLATFORM_FEE_PERCENT / 100)
        const subtotalWithFee = subtotal + platformFee
        const vatAmount = subtotalWithFee * VAT_RATE
        const total = subtotalWithFee + vatAmount

        // Convert to smallest currency unit (pence/cents)
        const amountInSmallestUnit = Math.round(total * 100)

        // Create payment intent with metadata to identify this as a retainer payment
        const { paymentIntent, error: paymentError } = await createPaymentIntent({
          amount: amountInSmallestUnit,
          currency: timesheet.retainer.currency.toLowerCase(),
          orderId: timesheet.id, // Using timesheet ID as reference
          buyerId: timesheet.retainer.buyer_id,
          description: `Retainer payment for week of ${timesheet.week_start}`,
        })

        if (paymentError || !paymentIntent) {
          results.push({
            timesheetId: timesheet.id,
            retainerId: timesheet.retainer.id,
            success: false,
            error: paymentError || 'Failed to create payment intent',
          })
          continue
        }

        // Store the pending payment intent ID WITHOUT marking as paid yet
        // The webhook will confirm and mark as paid once payment succeeds
        const { error: updateError } = await supabase
          .from('timesheet_entries')
          .update({
            stripe_payment_intent_id: paymentIntent.id,
            // Keep status as 'approved' - webhook will change to 'paid' on success
          })
          .eq('id', timesheet.id)

        if (updateError) {
          console.error('Error storing payment intent on timesheet:', updateError)
          results.push({
            timesheetId: timesheet.id,
            retainerId: timesheet.retainer.id,
            success: false,
            error: 'Failed to store payment intent',
          })
          continue
        }

        // Payment initiated but not yet confirmed - webhook will finalize
        results.push({
          timesheetId: timesheet.id,
          retainerId: timesheet.retainer.id,
          success: true,
          amount: total,
          paymentIntentId: paymentIntent.id,
        })
        
        console.log(`Retainer payment initiated for timesheet ${timesheet.id}, PI: ${paymentIntent.id}. Awaiting webhook confirmation.`)
      } catch (err) {
        console.error(`Error processing timesheet ${timesheet.id}:`, err)
        results.push({
          timesheetId: timesheet.id,
          retainerId: timesheet.retainer.id,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return { processed: results, errors }
  } catch (err) {
    console.error('Error in processWeeklyBilling:', err)
    errors.push('Failed to process weekly billing')
    return { processed: results, errors }
  }
}

/**
 * Generate a weekly invoice for a retainer
 */
export async function generateWeeklyInvoice(
  supabase: TypedSupabaseClient,
  retainerId: string,
  weekStart?: string
): Promise<{ data: WeeklyBilling | null; error: string | null }> {
  try {
    // Default to last week if no week specified
    const targetWeek = weekStart || format(
      startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }),
      'yyyy-MM-dd'
    )

    // Get the timesheet for the specified week
    const { data: timesheet, error: timesheetError } = await supabase
      .from('timesheet_entries')
      .select(`
        *,
        retainer:retainers (
          id,
          buyer_id,
          seller_id,
          hourly_rate,
          currency
        )
      `)
      .eq('retainer_id', retainerId)
      .eq('week_start', targetWeek)
      .single()

    if (timesheetError || !timesheet) {
      return { data: null, error: 'Timesheet not found for the specified week' }
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

    const billing: WeeklyBilling = {
      timesheetId: timesheet.id,
      retainerId: timesheet.retainer.id,
      weekStart: format(weekStartDate, 'yyyy-MM-dd'),
      weekEnd: format(weekEndDate, 'yyyy-MM-dd'),
      hoursLogged,
      hourlyRate,
      subtotal,
      platformFee,
      platformFeePercent: PLATFORM_FEE_PERCENT,
      vatAmount,
      vatRate: VAT_RATE,
      total,
      currency: timesheet.retainer.currency,
      status: timesheet.status as TimesheetStatus,
    }

    return { data: billing, error: null }
  } catch (err) {
    console.error('Error in generateWeeklyInvoice:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Charge a retainer payment
 * This processes a specific timesheet's payment
 */
export async function chargeRetainerPayment(
  supabase: TypedSupabaseClient,
  retainerId: string,
  timesheetId: string
): Promise<{ success: boolean; paymentIntentId?: string; error: string | null }> {
  try {
    // Get the timesheet with retainer details
    const { data: timesheet, error: fetchError } = await supabase
      .from('timesheet_entries')
      .select(`
        *,
        retainer:retainers (
          id,
          buyer_id,
          seller_id,
          hourly_rate,
          currency,
          status,
          seller:provider_profiles!retainers_seller_id_fkey (
            stripe_account_id
          )
        )
      `)
      .eq('id', timesheetId)
      .eq('retainer_id', retainerId)
      .single()

    if (fetchError || !timesheet) {
      return { success: false, error: 'Timesheet not found' }
    }

    if (timesheet.status !== 'approved') {
      return { success: false, error: 'Timesheet must be approved before payment' }
    }

    if (timesheet.retainer.status !== 'active') {
      return { success: false, error: 'Retainer is not active' }
    }

    if (!timesheet.retainer.seller?.stripe_account_id) {
      return { success: false, error: 'Seller does not have Stripe account' }
    }

    // Calculate total
    const hoursLogged = timesheet.hours_logged || 0
    const hourlyRate = timesheet.retainer.hourly_rate
    const subtotal = hoursLogged * hourlyRate
    const platformFee = subtotal * (PLATFORM_FEE_PERCENT / 100)
    const subtotalWithFee = subtotal + platformFee
    const vatAmount = subtotalWithFee * VAT_RATE
    const total = subtotalWithFee + vatAmount

    // Convert to smallest currency unit
    const amountInSmallestUnit = Math.round(total * 100)

    // Create payment intent
    const { paymentIntent, error: paymentError } = await createPaymentIntent({
      amount: amountInSmallestUnit,
      currency: timesheet.retainer.currency.toLowerCase(),
      orderId: timesheetId,
      buyerId: timesheet.retainer.buyer_id,
      description: `Retainer payment for week of ${timesheet.week_start}`,
    })

    if (paymentError || !paymentIntent) {
      return { success: false, error: paymentError || 'Failed to create payment' }
    }

    // Store the pending payment intent ID WITHOUT marking as paid yet
    // The webhook will confirm and mark as paid once payment succeeds
    const { error: updateError } = await supabase
      .from('timesheet_entries')
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        // Keep status as 'approved' - webhook will change to 'paid' on success
      })
      .eq('id', timesheetId)

    if (updateError) {
      console.error('Error storing payment intent on timesheet:', updateError)
      return { success: false, error: 'Failed to store payment intent' }
    }

    console.log(`Retainer payment initiated for timesheet ${timesheetId}, PI: ${paymentIntent.id}. Awaiting webhook confirmation.`)
    return { success: true, paymentIntentId: paymentIntent.id, error: null }
  } catch (err) {
    console.error('Error in chargeRetainerPayment:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Get pending billing for a retainer
 * Returns all approved timesheets that haven't been paid yet
 */
export async function getPendingBilling(
  supabase: TypedSupabaseClient,
  retainerId: string
): Promise<{ data: WeeklyBilling[]; error: string | null }> {
  try {
    const { data: timesheets, error } = await supabase
      .from('timesheet_entries')
      .select(`
        *,
        retainer:retainers (
          id,
          hourly_rate,
          currency
        )
      `)
      .eq('retainer_id', retainerId)
      .eq('status', 'approved')
      .order('week_start', { ascending: false })

    if (error) {
      console.error('Error fetching pending billing:', error)
      return { data: [], error: 'Failed to fetch pending billing' }
    }

    const billings: WeeklyBilling[] = (timesheets || []).map(timesheet => {
      const weekStartDate = parseISO(timesheet.week_start)
      const weekEndDate = addDays(weekStartDate, 4)

      const hoursLogged = timesheet.hours_logged || 0
      const hourlyRate = timesheet.retainer.hourly_rate
      const subtotal = hoursLogged * hourlyRate
      const platformFee = subtotal * (PLATFORM_FEE_PERCENT / 100)
      const subtotalWithFee = subtotal + platformFee
      const vatAmount = subtotalWithFee * VAT_RATE
      const total = subtotalWithFee + vatAmount

      return {
        timesheetId: timesheet.id,
        retainerId: timesheet.retainer.id,
        weekStart: format(weekStartDate, 'yyyy-MM-dd'),
        weekEnd: format(weekEndDate, 'yyyy-MM-dd'),
        hoursLogged,
        hourlyRate,
        subtotal,
        platformFee,
        platformFeePercent: PLATFORM_FEE_PERCENT,
        vatAmount,
        vatRate: VAT_RATE,
        total,
        currency: timesheet.retainer.currency,
        status: timesheet.status as TimesheetStatus,
      }
    })

    return { data: billings, error: null }
  } catch (err) {
    console.error('Error in getPendingBilling:', err)
    return { data: [], error: 'An unexpected error occurred' }
  }
}

/**
 * Get billing history for a retainer
 */
export async function getBillingHistory(
  supabase: TypedSupabaseClient,
  retainerId: string,
  limit: number = 12
): Promise<{ data: WeeklyBilling[]; error: string | null }> {
  try {
    const { data: timesheets, error } = await supabase
      .from('timesheet_entries')
      .select(`
        *,
        retainer:retainers (
          id,
          hourly_rate,
          currency
        )
      `)
      .eq('retainer_id', retainerId)
      .eq('status', 'paid')
      .order('week_start', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching billing history:', error)
      return { data: [], error: 'Failed to fetch billing history' }
    }

    const billings: WeeklyBilling[] = (timesheets || []).map(timesheet => {
      const weekStartDate = parseISO(timesheet.week_start)
      const weekEndDate = addDays(weekStartDate, 4)

      const hoursLogged = timesheet.hours_logged || 0
      const hourlyRate = timesheet.retainer.hourly_rate
      const subtotal = hoursLogged * hourlyRate
      const platformFee = subtotal * (PLATFORM_FEE_PERCENT / 100)
      const subtotalWithFee = subtotal + platformFee
      const vatAmount = subtotalWithFee * VAT_RATE
      const total = subtotalWithFee + vatAmount

      return {
        timesheetId: timesheet.id,
        retainerId: timesheet.retainer.id,
        weekStart: format(weekStartDate, 'yyyy-MM-dd'),
        weekEnd: format(weekEndDate, 'yyyy-MM-dd'),
        hoursLogged,
        hourlyRate,
        subtotal,
        platformFee,
        platformFeePercent: PLATFORM_FEE_PERCENT,
        vatAmount,
        vatRate: VAT_RATE,
        total,
        currency: timesheet.retainer.currency,
        status: timesheet.status as TimesheetStatus,
      }
    })

    return { data: billings, error: null }
  } catch (err) {
    console.error('Error in getBillingHistory:', err)
    return { data: [], error: 'An unexpected error occurred' }
  }
}
