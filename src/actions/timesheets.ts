"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  getOrCreateCurrentTimesheet,
  getTimesheet,
  getTimesheetHistory,
  updateTimesheetHours,
  submitTimesheet,
  approveTimesheet,
  disputeTimesheet,
  calculateWeeklyBilling,
} from "@/lib/retainers/timesheets"
import {
  TimesheetEntry,
  TimesheetWithDetails,
  WeeklyBillingSummary,
  TimesheetFilters,
  TimesheetStatus,
} from "@/types/retainers"

// ==========================================
// GET CURRENT TIMESHEET
// ==========================================

export async function getCurrentTimesheet(
  retainerId: string
): Promise<{ data: TimesheetEntry | null; error: string | null }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { data: null, error: "Not authenticated" }
    }

    // Verify user has access to this retainer
    const { data: retainer, error: retainerError } = await supabase
      .from("retainers")
      .select(`
        status,
        buyer_id,
        seller:provider_profiles!retainers_seller_id_fkey (
          user_id
        )
      `)
      .eq("id", retainerId)
      .single()

    if (retainerError || !retainer) {
      return { data: null, error: "Retainer not found" }
    }

    const isBuyer = retainer.buyer_id === user.id
    const isSeller = retainer.seller?.user_id === user.id

    if (!isBuyer && !isSeller) {
      return { data: null, error: "Access denied" }
    }

    // Only create timesheet for active retainers
    if (retainer.status !== "active") {
      // Try to get existing timesheet without creating
      const { data: existing } = await supabase
        .from("timesheet_entries")
        .select("*")
        .eq("retainer_id", retainerId)
        .order("week_start", { ascending: false })
        .limit(1)
        .single()

      return { data: existing as TimesheetEntry | null, error: null }
    }

    return await getOrCreateCurrentTimesheet(supabase, retainerId)
  } catch (err) {
    console.error("Failed to get current timesheet:", err)
    return { data: null, error: "Failed to load timesheet" }
  }
}

// ==========================================
// GET TIMESHEET HISTORY
// ==========================================

export async function getTimesheetHistoryAction(
  retainerId: string,
  limit?: number
): Promise<{ data: TimesheetEntry[]; error: string | null; count: number }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { data: [], error: "Not authenticated", count: 0 }
    }

    // Verify user has access
    const { data: retainer, error: retainerError } = await supabase
      .from("retainers")
      .select(`
        buyer_id,
        seller:provider_profiles!retainers_seller_id_fkey (
          user_id
        )
      `)
      .eq("id", retainerId)
      .single()

    if (retainerError || !retainer) {
      return { data: [], error: "Retainer not found", count: 0 }
    }

    const isBuyer = retainer.buyer_id === user.id
    const isSeller = retainer.seller?.user_id === user.id

    if (!isBuyer && !isSeller) {
      return { data: [], error: "Access denied", count: 0 }
    }

    const filters: TimesheetFilters = { limit: limit || 10 }
    return await getTimesheetHistory(supabase, retainerId, filters)
  } catch (err) {
    console.error("Failed to get timesheet history:", err)
    return { data: [], error: "Failed to load history", count: 0 }
  }
}

// ==========================================
// GET TIMESHEET DETAIL
// ==========================================

export async function getTimesheetDetail(
  timesheetId: string
): Promise<{ data: TimesheetWithDetails | null; error: string | null }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { data: null, error: "Not authenticated" }
    }

    const result = await getTimesheet(supabase, timesheetId)

    if (result.data) {
      // Verify access
      const isBuyer = result.data.retainer.buyer_id === user.id
      const isSeller = result.data.retainer.seller?.profile?.id === user.id

      if (!isBuyer && !isSeller) {
        return { data: null, error: "Access denied" }
      }
    }

    return result
  } catch (err) {
    console.error("Failed to get timesheet detail:", err)
    return { data: null, error: "Failed to load timesheet" }
  }
}

// ==========================================
// LOG TIMESHEET HOURS
// ==========================================

export async function logTimesheetHours(
  timesheetId: string,
  hours: number,
  description: string
): Promise<{ data: TimesheetEntry | null; error: string | null }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { data: null, error: "Not authenticated" }
    }

    // Verify user is the seller for this timesheet
    const { data: timesheet, error: fetchError } = await supabase
      .from("timesheet_entries")
      .select(`
        retainer:retainers (
          id,
          seller:provider_profiles!retainers_seller_id_fkey (
            user_id
          )
        )
      `)
      .eq("id", timesheetId)
      .single()

    if (fetchError || !timesheet) {
      return { data: null, error: "Timesheet not found" }
    }

    if (timesheet.retainer?.seller?.user_id !== user.id) {
      return { data: null, error: "Only the provider can log hours" }
    }

    const result = await updateTimesheetHours(supabase, timesheetId, hours, description)

    if (result.data) {
      revalidatePath("/retainers")
      revalidatePath(`/retainers/${timesheet.retainer.id}`)
      revalidatePath(`/retainers/${timesheet.retainer.id}/timesheet`)
    }

    return result
  } catch (err) {
    console.error("Failed to log hours:", err)
    return { data: null, error: "Failed to log hours" }
  }
}

// ==========================================
// SUBMIT TIMESHEET FOR APPROVAL
// ==========================================

export async function submitTimesheetForApproval(
  timesheetId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Verify user is the seller
    const { data: timesheet, error: fetchError } = await supabase
      .from("timesheet_entries")
      .select(`
        retainer:retainers (
          id,
          seller:provider_profiles!retainers_seller_id_fkey (
            user_id
          )
        )
      `)
      .eq("id", timesheetId)
      .single()

    if (fetchError || !timesheet) {
      return { success: false, error: "Timesheet not found" }
    }

    if (timesheet.retainer?.seller?.user_id !== user.id) {
      return { success: false, error: "Only the provider can submit timesheets" }
    }

    const result = await submitTimesheet(supabase, timesheetId)

    if (result.success) {
      revalidatePath("/retainers")
      revalidatePath(`/retainers/${timesheet.retainer.id}`)
      revalidatePath(`/retainers/${timesheet.retainer.id}/timesheet`)
    }

    return result
  } catch (err) {
    console.error("Failed to submit timesheet:", err)
    return { success: false, error: "Failed to submit timesheet" }
  }
}

// ==========================================
// APPROVE TIMESHEET SUBMISSION
// ==========================================

export async function approveTimesheetSubmission(
  timesheetId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Verify user is the buyer
    const { data: timesheet, error: fetchError } = await supabase
      .from("timesheet_entries")
      .select(`
        retainer:retainers (
          id,
          buyer_id
        )
      `)
      .eq("id", timesheetId)
      .single()

    if (fetchError || !timesheet) {
      return { success: false, error: "Timesheet not found" }
    }

    if (timesheet.retainer?.buyer_id !== user.id) {
      return { success: false, error: "Only the buyer can approve timesheets" }
    }

    const result = await approveTimesheet(supabase, timesheetId)

    if (result.success) {
      revalidatePath("/retainers")
      revalidatePath(`/retainers/${timesheet.retainer.id}`)
      revalidatePath(`/retainers/${timesheet.retainer.id}/timesheet`)
    }

    return result
  } catch (err) {
    console.error("Failed to approve timesheet:", err)
    return { success: false, error: "Failed to approve timesheet" }
  }
}

// ==========================================
// DISPUTE TIMESHEET SUBMISSION
// ==========================================

export async function disputeTimesheetSubmission(
  timesheetId: string,
  reason: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Verify user is the buyer
    const { data: timesheet, error: fetchError } = await supabase
      .from("timesheet_entries")
      .select(`
        retainer:retainers (
          id,
          buyer_id
        )
      `)
      .eq("id", timesheetId)
      .single()

    if (fetchError || !timesheet) {
      return { success: false, error: "Timesheet not found" }
    }

    if (timesheet.retainer?.buyer_id !== user.id) {
      return { success: false, error: "Only the buyer can dispute timesheets" }
    }

    const result = await disputeTimesheet(supabase, timesheetId, reason)

    if (result.success) {
      revalidatePath("/retainers")
      revalidatePath(`/retainers/${timesheet.retainer.id}`)
      revalidatePath(`/retainers/${timesheet.retainer.id}/timesheet`)
    }

    return result
  } catch (err) {
    console.error("Failed to dispute timesheet:", err)
    return { success: false, error: "Failed to dispute timesheet" }
  }
}

// ==========================================
// GET WEEKLY BILLING SUMMARY
// ==========================================

export async function getWeeklyBillingSummary(
  timesheetId: string
): Promise<{ data: WeeklyBillingSummary | null; error: string | null }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { data: null, error: "Not authenticated" }
    }

    // Verify access
    const { data: timesheet, error: fetchError } = await supabase
      .from("timesheet_entries")
      .select(`
        retainer:retainers (
          buyer_id,
          seller:provider_profiles!retainers_seller_id_fkey (
            user_id
          )
        )
      `)
      .eq("id", timesheetId)
      .single()

    if (fetchError || !timesheet) {
      return { data: null, error: "Timesheet not found" }
    }

    const isBuyer = timesheet.retainer?.buyer_id === user.id
    const isSeller = timesheet.retainer?.seller?.user_id === user.id

    if (!isBuyer && !isSeller) {
      return { data: null, error: "Access denied" }
    }

    return await calculateWeeklyBilling(supabase, timesheetId)
  } catch (err) {
    console.error("Failed to get billing summary:", err)
    return { data: null, error: "Failed to load billing summary" }
  }
}

// ==========================================
// GET PENDING TIMESHEETS FOR APPROVAL
// ==========================================

export async function getPendingTimesheetsForApproval(): Promise<{
  data: Array<TimesheetEntry & { retainer: { id: string; seller_name?: string } }>
  error: string | null
}> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { data: [], error: "Not authenticated" }
    }

    // Get all submitted timesheets where user is the buyer
    const { data: timesheets, error } = await supabase
      .from("timesheet_entries")
      .select(`
        *,
        retainer:retainers (
          id,
          buyer_id,
          seller:provider_profiles!retainers_seller_id_fkey (
            user_id,
            profiles:profiles!provider_profiles_user_id_fkey (
              full_name
            )
          )
        )
      `)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: true })

    if (error) {
      console.error("Error fetching pending timesheets:", error)
      return { data: [], error: "Failed to load pending timesheets" }
    }

    // Filter to only timesheets where user is buyer
    const userTimesheets = (timesheets || [])
      .filter(t => t.retainer?.buyer_id === user.id)
      .map(t => ({
        ...t,
        retainer: {
          id: t.retainer.id,
          seller_name: (t.retainer.seller?.profiles as { full_name?: string })?.full_name,
        },
      }))

    return { data: userTimesheets as any, error: null }
  } catch (err) {
    console.error("Failed to get pending timesheets:", err)
    return { data: [], error: "Failed to load pending timesheets" }
  }
}

// ==========================================
// GET MY SUBMITTED TIMESHEETS
// ==========================================

export async function getMySubmittedTimesheets(): Promise<{
  data: Array<TimesheetEntry & { retainer: { id: string; buyer_name?: string } }>
  error: string | null
}> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { data: [], error: "Not authenticated" }
    }

    // Get provider profile
    const { data: providerProfile } = await supabase
      .from("provider_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!providerProfile) {
      return { data: [], error: null } // Not a provider
    }

    // Get all timesheets for retainers where user is seller
    const { data: timesheets, error } = await supabase
      .from("timesheet_entries")
      .select(`
        *,
        retainer:retainers (
          id,
          seller_id,
          buyer:profiles!retainers_buyer_id_fkey (
            full_name
          )
        )
      `)
      .in("status", ["submitted", "approved", "disputed"])
      .order("submitted_at", { ascending: false })
      .limit(20)

    if (error) {
      console.error("Error fetching submitted timesheets:", error)
      return { data: [], error: "Failed to load timesheets" }
    }

    // Filter to only timesheets where user is seller
    const userTimesheets = (timesheets || [])
      .filter(t => t.retainer?.seller_id === providerProfile.id && t.status)
      .map(t => ({
        id: t.id,
        retainer_id: t.retainer_id,
        week_start: t.week_start,
        hours_logged: t.hours_logged,
        description: t.description,
        status: t.status as TimesheetStatus,
        submitted_at: t.submitted_at,
        approved_at: t.approved_at,
        paid_at: t.paid_at,
        stripe_payment_intent_id: t.stripe_payment_intent_id,
        retainer: {
          id: t.retainer.id,
          buyer_name: (t.retainer.buyer as { full_name?: string })?.full_name,
        },
      }))

    return { 
      data: userTimesheets as Array<TimesheetEntry & { retainer: { id: string; buyer_name?: string } }>, 
      error: null 
    }
  } catch (err) {
    console.error("Failed to get submitted timesheets:", err)
    return { data: [], error: "Failed to load timesheets" }
  }
}
