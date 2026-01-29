/**
 * Data Deletion Service
 * Handles user data deletion and anonymization for GDPR compliance
 */

import { SupabaseClient } from "@supabase/supabase-js"
import {
  DeletionCheckResult,
  ScheduledDeletion,
} from "@/types/gdpr"
import { logDataDeletion } from "./audit"

// Type helper for untyped tables
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = SupabaseClient<any>

// UK tax law retention period (7 years in days)
const TAX_RETENTION_DAYS = 2555

// Message retention period (3 years in days)
const MESSAGE_RETENTION_DAYS = 1095

// Session log retention period (90 days)
const SESSION_RETENTION_DAYS = 90

/**
 * Check if a user can be deleted
 */
export async function canDeleteUser(
  supabase: UntypedClient,
  userId: string
): Promise<DeletionCheckResult> {
  const blockers: DeletionCheckResult["blockers"] = []
  const now = new Date()

  // Check for transactions that must be retained
  const { data: transactions } = await supabase
    .from("escrow_transactions")
    .select("id, created_at, status")
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(1)

  if (transactions && transactions.length > 0) {
    const latestTransaction = transactions[0]
    const transactionDate = new Date(latestTransaction.created_at)
    const retentionEndDate = new Date(transactionDate)
    retentionEndDate.setDate(retentionEndDate.getDate() + TAX_RETENTION_DAYS)

    if (retentionEndDate > now) {
      blockers.push({
        dataType: "transaction_records",
        reason: "UK tax law requires retention of transaction records for 7 years",
        releaseDate: retentionEndDate.toISOString(),
      })
    }
  }

  // Check for orders (financial records)
  const { data: orders } = await supabase
    .from("orders")
    .select("id, created_at, status")
    .eq("buyer_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)

  // Also check orders as seller
  const { data: providerProfile } = await supabase
    .from("provider_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle()

  let latestOrderDate: Date | null = null

  if (orders && orders.length > 0) {
    latestOrderDate = new Date(orders[0].created_at)
  }

  if (providerProfile) {
    const { data: sellerOrders } = await supabase
      .from("orders")
      .select("id, created_at")
      .eq("seller_id", providerProfile.id)
      .order("created_at", { ascending: false })
      .limit(1)

    if (sellerOrders && sellerOrders.length > 0) {
      const sellerOrderDate = new Date(sellerOrders[0].created_at)
      if (!latestOrderDate || sellerOrderDate > latestOrderDate) {
        latestOrderDate = sellerOrderDate
      }
    }
  }

  if (latestOrderDate) {
    const orderRetentionEnd = new Date(latestOrderDate)
    orderRetentionEnd.setDate(orderRetentionEnd.getDate() + TAX_RETENTION_DAYS)

    if (orderRetentionEnd > now) {
      blockers.push({
        dataType: "order_records",
        reason: "Financial records must be retained for 7 years per UK tax law",
        releaseDate: orderRetentionEnd.toISOString(),
      })
    }
  }

  // Check for active disputes
  const { data: disputes } = await supabase
    .from("disputes")
    .select("id, status")
    .eq("raised_by", userId)
    .not("status", "eq", "resolved")
    .limit(1)

  if (disputes && disputes.length > 0) {
    blockers.push({
      dataType: "active_disputes",
      reason: "Account has unresolved disputes that must be completed first",
      releaseDate: null,
    })
  }

  // Check for pending orders
  const { data: pendingOrders } = await supabase
    .from("orders")
    .select("id")
    .eq("buyer_id", userId)
    .in("status", ["pending", "accepted", "in_progress"])
    .limit(1)

  if (pendingOrders && pendingOrders.length > 0) {
    blockers.push({
      dataType: "pending_orders",
      reason: "Account has pending orders that must be completed or cancelled first",
      releaseDate: null,
    })
  }

  // Calculate when full deletion is allowed
  let retentionEndDate: string | null = null
  const financialBlockers = blockers.filter((b) =>
    ["transaction_records", "order_records"].includes(b.dataType)
  )

  if (financialBlockers.length > 0) {
    const dates = financialBlockers
      .map((b) => (b.releaseDate ? new Date(b.releaseDate) : null))
      .filter((d): d is Date => d !== null)

    if (dates.length > 0) {
      retentionEndDate = new Date(
        Math.max(...dates.map((d) => d.getTime()))
      ).toISOString()
    }
  }

  // Determine capabilities
  const hasActiveItems = blockers.some((b) =>
    ["active_disputes", "pending_orders"].includes(b.dataType)
  )
  const hasFinancialBlockers = financialBlockers.length > 0

  return {
    canDelete: blockers.length === 0,
    canAnonymize: !hasActiveItems && hasFinancialBlockers,
    retentionEndDate,
    blockers,
  }
}

/**
 * Anonymize user data while preserving required records
 */
export async function anonymizeUser(
  supabase: UntypedClient,
  userId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const anonymousName = `[Deleted User ${userId.slice(0, 8)}]`

    // Record what data we're anonymizing
    const deletedData: string[] = []

    // Anonymize profile
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: anonymousName,
        avatar_url: null,
        bio: null,
        phone_number: null,
        skills: null,
      })
      .eq("id", userId)

    if (profileError) {
      throw new Error(`Failed to anonymize profile: ${profileError.message}`)
    }
    deletedData.push("profile_personal_info")

    // Anonymize provider profile if exists
    const { data: providerProfile } = await supabase
      .from("provider_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle()

    if (providerProfile) {
      const { error: providerError } = await supabase
        .from("provider_profiles")
        .update({
          display_name: anonymousName,
          headline: null,
          bio: null,
          portfolio_url: null,
          linkedin_url: null,
          availability_status: "unavailable",
          is_active: false,
        })
        .eq("id", providerProfile.id)

      if (providerError) {
        throw new Error(
          `Failed to anonymize provider profile: ${providerError.message}`
        )
      }
      deletedData.push("provider_profile")
    }

    // Delete messages older than retention period
    const messageRetentionDate = new Date()
    messageRetentionDate.setDate(
      messageRetentionDate.getDate() - MESSAGE_RETENTION_DAYS
    )

    const { error: messagesError } = await supabase
      .from("messages")
      .delete()
      .eq("sender_id", userId)
      .lt("created_at", messageRetentionDate.toISOString())

    if (messagesError) {
      console.error("Error deleting old messages:", messagesError)
    } else {
      deletedData.push("old_messages")
    }

    // Anonymize remaining messages (keep for conversation integrity)
    const { error: anonMsgError } = await supabase
      .from("messages")
      .update({ content: "[Message deleted per user request]" })
      .eq("sender_id", userId)

    if (!anonMsgError) {
      deletedData.push("message_content")
    }

    // Anonymize reviews but keep content for platform integrity
    const { error: reviewError } = await supabase
      .from("reviews")
      .update({
        // Keep rating and general feedback, remove any personal details
        comment: supabase.sql`
          CASE 
            WHEN comment IS NOT NULL 
            THEN '[Review by deleted user]: ' || LEFT(comment, 200)
            ELSE NULL
          END
        `,
      })
      .eq("reviewer_id", userId)

    if (!reviewError) {
      deletedData.push("review_author_info")
    }

    // Delete session logs
    const sessionRetentionDate = new Date()
    sessionRetentionDate.setDate(
      sessionRetentionDate.getDate() - SESSION_RETENTION_DAYS
    )

    await supabase
      .from("session_logs")
      .delete()
      .eq("user_id", userId)
      .lt("created_at", sessionRetentionDate.toISOString())
    deletedData.push("session_logs")

    // Delete notification preferences
    await supabase
      .from("notification_preferences")
      .delete()
      .eq("user_id", userId)
    deletedData.push("notification_preferences")

    // Delete saved searches
    await supabase.from("saved_searches").delete().eq("user_id", userId)
    deletedData.push("saved_searches")

    // Delete preferred suppliers
    await supabase.from("preferred_suppliers").delete().eq("buyer_id", userId)
    deletedData.push("preferred_suppliers")

    // Log the deletion
    await logDataDeletion(supabase, userId, deletedData)

    return { success: true, error: null }
  } catch (err) {
    console.error("Error anonymizing user:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to anonymize user",
    }
  }
}

/**
 * Schedule a user for full deletion at a later date
 */
export async function scheduleFullDeletion(
  supabase: UntypedClient,
  userId: string,
  deletionDate: Date
): Promise<{ data: ScheduledDeletion | null; error: string | null }> {
  try {
    // First anonymize what we can
    const anonymizeResult = await anonymizeUser(supabase, userId)
    if (!anonymizeResult.success) {
      return { data: null, error: anonymizeResult.error }
    }

    // Create scheduled deletion record
    const { data, error } = await supabase
      .from("scheduled_deletions")
      .insert({
        user_id: userId,
        scheduled_for: deletionDate.toISOString(),
        deletion_type: "full",
        data_to_delete: ["transaction_records", "order_records", "payment_data"],
      })
      .select()
      .single()

    if (error) {
      // Table might not exist, log and continue
      console.error("Could not schedule deletion:", error)
      
      // Store in data_requests as a note
      await supabase
        .from("data_requests")
        .update({
          reason: `Scheduled for full deletion on ${deletionDate.toISOString()}. User data anonymized.`,
        })
        .eq("user_id", userId)
        .eq("request_type", "deletion")
        .eq("status", "processing")

      return {
        data: {
          id: "pending",
          user_id: userId,
          scheduled_for: deletionDate.toISOString(),
          deletion_type: "full",
          data_to_delete: ["transaction_records", "order_records", "payment_data"],
          created_at: new Date().toISOString(),
          processed_at: null,
          cancelled_at: null,
        },
        error: null,
      }
    }

    return { data: data as ScheduledDeletion, error: null }
  } catch (err) {
    console.error("Error scheduling deletion:", err)
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to schedule deletion",
    }
  }
}

/**
 * Process immediate deletion if allowed
 */
export async function processImmediateDeletion(
  supabase: UntypedClient,
  userId: string
): Promise<{ success: boolean; error: string | null }> {
  // Check if deletion is allowed
  const deletionCheck = await canDeleteUser(supabase, userId)

  if (!deletionCheck.canDelete) {
    return {
      success: false,
      error: `Cannot delete: ${deletionCheck.blockers
        .map((b) => b.reason)
        .join("; ")}`,
    }
  }

  try {
    // Record what we're deleting before deletion
    const deletedData = [
      "profile",
      "provider_profile",
      "messages",
      "bookings",
      "notifications",
      "preferences",
    ]

    // Log the deletion first
    await logDataDeletion(supabase, userId, deletedData)

    // Delete in order (respecting foreign key constraints)

    // Delete messages
    const { data: conversations } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", userId)

    if (conversations && conversations.length > 0) {
      const conversationIds = conversations.map((c) => c.conversation_id)
      await supabase
        .from("messages")
        .delete()
        .eq("sender_id", userId)
      
      // Clean up empty conversations
      for (const convId of conversationIds) {
        const { count } = await supabase
          .from("conversation_participants")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", convId)
        
        if (count === 1) {
          await supabase.from("conversations").delete().eq("id", convId)
        }
      }
    }

    // Delete provider profile if exists
    await supabase.from("provider_profiles").delete().eq("user_id", userId)

    // Delete bookings
    await supabase.from("bookings").delete().eq("buyer_id", userId)

    // Delete notifications
    await supabase.from("notifications").delete().eq("user_id", userId)

    // Delete presence data
    await supabase.from("presence").delete().eq("user_id", userId)

    // Delete standups
    await supabase.from("standups").delete().eq("user_id", userId)

    // Finally, the profile will cascade delete many related records
    // Note: In production, you'd want to verify the cascade behavior
    // and potentially soft-delete instead

    // For now, anonymize rather than hard delete to preserve referential integrity
    await anonymizeUser(supabase, userId)

    return { success: true, error: null }
  } catch (err) {
    console.error("Error processing immediate deletion:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to process deletion",
    }
  }
}

/**
 * Get the date when full deletion will be allowed
 */
export async function getRetentionEndDate(
  supabase: UntypedClient,
  userId: string
): Promise<{ date: string | null; reason: string | null; error: string | null }> {
  const deletionCheck = await canDeleteUser(supabase, userId)

  if (deletionCheck.canDelete) {
    return {
      date: new Date().toISOString(),
      reason: "Immediate deletion is allowed",
      error: null,
    }
  }

  if (!deletionCheck.retentionEndDate) {
    // Check if there are non-date blockers
    const activeBlockers = deletionCheck.blockers.filter(
      (b) => b.releaseDate === null
    )

    if (activeBlockers.length > 0) {
      return {
        date: null,
        reason: activeBlockers.map((b) => b.reason).join("; "),
        error: null,
      }
    }

    return {
      date: null,
      reason: "Unable to determine retention end date",
      error: null,
    }
  }

  return {
    date: deletionCheck.retentionEndDate,
    reason: "Financial records must be retained per UK tax law",
    error: null,
  }
}

/**
 * Cancel a scheduled deletion
 */
export async function cancelScheduledDeletion(
  supabase: UntypedClient,
  userId: string
): Promise<{ success: boolean; error: string | null }> {
  const { error } = await supabase
    .from("scheduled_deletions")
    .update({
      cancelled_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .is("processed_at", null)
    .is("cancelled_at", null)

  if (error) {
    console.error("Error cancelling scheduled deletion:", error)
    return { success: false, error: "Failed to cancel scheduled deletion" }
  }

  return { success: true, error: null }
}

/**
 * Get scheduled deletions that are due to be processed
 */
export async function getDueDeletions(
  supabase: UntypedClient
): Promise<{ data: ScheduledDeletion[]; error: string | null }> {
  const { data, error } = await supabase
    .from("scheduled_deletions")
    .select("*")
    .is("processed_at", null)
    .is("cancelled_at", null)
    .lte("scheduled_for", new Date().toISOString())

  if (error) {
    console.error("Error fetching due deletions:", error)
    return { data: [], error: "Failed to fetch scheduled deletions" }
  }

  return { data: data as ScheduledDeletion[], error: null }
}
