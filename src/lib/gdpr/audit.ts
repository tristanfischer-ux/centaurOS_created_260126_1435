/**
 * GDPR Audit Logging Service
 * Tracks data access, modifications, and deletions for compliance
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { AuditLogEntry, AuditAction } from "@/types/gdpr"

// Type helper for untyped tables
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = SupabaseClient<any>

/**
 * Log data access event
 */
export async function logDataAccess(
  supabase: UntypedClient,
  userId: string,
  accessorId: string,
  dataType: string,
  details?: Record<string, unknown>
): Promise<{ success: boolean; error: string | null }> {
  return logAuditEvent(supabase, {
    userId,
    accessorId,
    accessorType: accessorId === userId ? "user" : "admin",
    action: "data_accessed",
    dataType,
    details: details || {},
  })
}

/**
 * Log data modification event
 */
export async function logDataModification(
  supabase: UntypedClient,
  userId: string,
  modifierId: string,
  changes: Record<string, { old: unknown; new: unknown }>
): Promise<{ success: boolean; error: string | null }> {
  return logAuditEvent(supabase, {
    userId,
    accessorId: modifierId,
    accessorType: modifierId === userId ? "user" : "admin",
    action: "data_modified",
    dataType: "profile",
    details: { changes },
  })
}

/**
 * Log data deletion event
 */
export async function logDataDeletion(
  supabase: UntypedClient,
  userId: string,
  deletedData: string[]
): Promise<{ success: boolean; error: string | null }> {
  return logAuditEvent(supabase, {
    userId,
    accessorId: "system",
    accessorType: "system",
    action: "data_deleted",
    dataType: "multiple",
    details: { deleted_data_types: deletedData },
  })
}

/**
 * Core audit logging function
 */
async function logAuditEvent(
  supabase: UntypedClient,
  event: {
    userId: string
    accessorId: string
    accessorType: "user" | "admin" | "system"
    action: AuditAction
    dataType: string
    details: Record<string, unknown>
  }
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase.from("gdpr_audit_log").insert({
      user_id: event.userId,
      accessor_id: event.accessorId,
      accessor_type: event.accessorType,
      action: event.action,
      data_type: event.dataType,
      details: event.details,
      created_at: new Date().toISOString(),
    })

    if (error) {
      // If table doesn't exist, log to console and continue
      if (error.code === "42P01") {
        console.warn("GDPR audit log table does not exist, logging to console")
        console.log("AUDIT:", JSON.stringify(event))
        return { success: true, error: null }
      }
      throw error
    }

    return { success: true, error: null }
  } catch (err) {
    console.error("Error logging audit event:", err)
    // Don't fail the parent operation if audit logging fails
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to log audit event",
    }
  }
}

/**
 * Get audit log for a user
 */
export async function getAuditLog(
  supabase: UntypedClient,
  userId: string,
  options?: {
    action?: AuditAction
    startDate?: string
    endDate?: string
    limit?: number
    offset?: number
  }
): Promise<{ data: AuditLogEntry[]; error: string | null; count: number }> {
  try {
    let query = supabase
      .from("gdpr_audit_log")
      .select("*", { count: "exact" })
      .eq("user_id", userId)

    if (options?.action) {
      query = query.eq("action", options.action)
    }

    if (options?.startDate) {
      query = query.gte("created_at", options.startDate)
    }

    if (options?.endDate) {
      query = query.lte("created_at", options.endDate)
    }

    query = query
      .order("created_at", { ascending: false })
      .range(
        options?.offset || 0,
        (options?.offset || 0) + (options?.limit || 100) - 1
      )

    const { data, error, count } = await query

    if (error) {
      // If table doesn't exist, return empty
      if (error.code === "42P01") {
        return { data: [], error: null, count: 0 }
      }
      throw error
    }

    return {
      data: (data || []) as AuditLogEntry[],
      error: null,
      count: count || 0,
    }
  } catch (err) {
    console.error("Error fetching audit log:", err)
    return {
      data: [],
      error: err instanceof Error ? err.message : "Failed to fetch audit log",
      count: 0,
    }
  }
}

/**
 * Export audit log for a user (for GDPR data export)
 */
export async function exportAuditLog(
  supabase: UntypedClient,
  userId: string
): Promise<{ data: AuditLogEntry[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from("gdpr_audit_log")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })

    if (error) {
      // If table doesn't exist, return empty
      if (error.code === "42P01") {
        return { data: [], error: null }
      }
      throw error
    }

    return { data: (data || []) as AuditLogEntry[], error: null }
  } catch (err) {
    console.error("Error exporting audit log:", err)
    return {
      data: [],
      error: err instanceof Error ? err.message : "Failed to export audit log",
    }
  }
}

/**
 * Get audit statistics for a user
 */
export async function getAuditStats(
  supabase: UntypedClient,
  userId: string
): Promise<{
  stats: {
    totalEvents: number
    accessEvents: number
    modificationEvents: number
    deletionEvents: number
    lastAccess: string | null
    lastModification: string | null
  } | null
  error: string | null
}> {
  try {
    // Get total counts by action type
    const { count: accessCount } = await supabase
      .from("gdpr_audit_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "data_accessed")

    const { count: modificationCount } = await supabase
      .from("gdpr_audit_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "data_modified")

    const { count: deletionCount } = await supabase
      .from("gdpr_audit_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "data_deleted")

    // Get last access
    const { data: lastAccessData } = await supabase
      .from("gdpr_audit_log")
      .select("created_at")
      .eq("user_id", userId)
      .eq("action", "data_accessed")
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    // Get last modification
    const { data: lastModData } = await supabase
      .from("gdpr_audit_log")
      .select("created_at")
      .eq("user_id", userId)
      .eq("action", "data_modified")
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    return {
      stats: {
        totalEvents: (accessCount || 0) + (modificationCount || 0) + (deletionCount || 0),
        accessEvents: accessCount || 0,
        modificationEvents: modificationCount || 0,
        deletionEvents: deletionCount || 0,
        lastAccess: lastAccessData?.created_at || null,
        lastModification: lastModData?.created_at || null,
      },
      error: null,
    }
  } catch (err) {
    console.error("Error getting audit stats:", err)
    return {
      stats: null,
      error: err instanceof Error ? err.message : "Failed to get audit stats",
    }
  }
}

/**
 * Log profile view event
 */
export async function logProfileView(
  supabase: UntypedClient,
  viewedUserId: string,
  viewerId: string
): Promise<{ success: boolean; error: string | null }> {
  return logAuditEvent(supabase, {
    userId: viewedUserId,
    accessorId: viewerId,
    accessorType: "user",
    action: "profile_viewed",
    dataType: "profile",
    details: { viewer_id: viewerId },
  })
}

/**
 * Log message access event
 */
export async function logMessagesAccess(
  supabase: UntypedClient,
  userId: string,
  accessorId: string,
  conversationId: string
): Promise<{ success: boolean; error: string | null }> {
  return logAuditEvent(supabase, {
    userId,
    accessorId,
    accessorType: accessorId === userId ? "user" : "admin",
    action: "messages_accessed",
    dataType: "messages",
    details: { conversation_id: conversationId },
  })
}

/**
 * Log orders access event
 */
export async function logOrdersAccess(
  supabase: UntypedClient,
  userId: string,
  accessorId: string,
  orderId?: string
): Promise<{ success: boolean; error: string | null }> {
  return logAuditEvent(supabase, {
    userId,
    accessorId,
    accessorType: accessorId === userId ? "user" : "admin",
    action: "orders_accessed",
    dataType: "orders",
    details: orderId ? { order_id: orderId } : { access_type: "list" },
  })
}

/**
 * Log payment data access event
 */
export async function logPaymentDataAccess(
  supabase: UntypedClient,
  userId: string,
  accessorId: string,
  transactionId?: string
): Promise<{ success: boolean; error: string | null }> {
  return logAuditEvent(supabase, {
    userId,
    accessorId,
    accessorType: accessorId === userId ? "user" : "admin",
    action: "payment_data_accessed",
    dataType: "payments",
    details: transactionId
      ? { transaction_id: transactionId }
      : { access_type: "list" },
  })
}

/**
 * Purge old audit logs (for data retention compliance)
 * Keeps logs for the configured retention period
 */
export async function purgeOldAuditLogs(
  supabase: UntypedClient,
  retentionDays: number = 2555 // 7 years default for financial audit
): Promise<{ deletedCount: number; error: string | null }> {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

    const { data, error } = await supabase
      .from("gdpr_audit_log")
      .delete()
      .lt("created_at", cutoffDate.toISOString())
      .select("id")

    if (error) {
      throw error
    }

    return { deletedCount: data?.length || 0, error: null }
  } catch (err) {
    console.error("Error purging old audit logs:", err)
    return {
      deletedCount: 0,
      error: err instanceof Error ? err.message : "Failed to purge audit logs",
    }
  }
}
