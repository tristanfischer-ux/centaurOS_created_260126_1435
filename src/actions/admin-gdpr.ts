"use server"

/**
 * Admin GDPR Server Actions
 * Admin-facing actions for managing data requests
 */

import { revalidatePath } from "next/cache"
import {
  DataRequestWithUser,
  DataRequestStatus,
  DataRequestType,
  GDPRDashboardStats,
} from "@/types/gdpr"
import { requireAdmin } from "@/lib/admin/access"
import {
  getDataRequest,
  getAllDataRequests,
  getPendingDataRequests,
  processDataRequest as processDataRequestService,
  denyDataRequest as denyDataRequestService,
  updateDataRequestStatus,
} from "@/lib/gdpr/data-requests"
import { getAuditLog, getAuditStats } from "@/lib/gdpr/audit"
import { canDeleteUser } from "@/lib/gdpr/data-deletion"

// Type helper for untyped tables
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = any

/**
 * Get all pending data requests (admin)
 */
export async function getPendingDataRequestsAction(): Promise<{
  data: DataRequestWithUser[]
  error: string | null
}> {
  try {
    const { supabase } = await requireAdmin()
    return getPendingDataRequests(supabase as UntypedClient)
  } catch (err) {
    return {
      data: [],
      error: err instanceof Error ? err.message : "Admin access required",
    }
  }
}

/**
 * Get all data requests with filters (admin)
 */
export async function getAllDataRequestsAction(
  filters?: {
    status?: DataRequestStatus
    type?: DataRequestType
    limit?: number
    offset?: number
  }
): Promise<{
  data: DataRequestWithUser[]
  error: string | null
  count: number
}> {
  try {
    const { supabase } = await requireAdmin()
    return getAllDataRequests(supabase as UntypedClient, filters)
  } catch (err) {
    return {
      data: [],
      error: err instanceof Error ? err.message : "Admin access required",
      count: 0,
    }
  }
}

/**
 * Process (approve) a data request (admin)
 */
export async function processDataRequest(
  requestId: string
): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const { adminUser, supabase } = await requireAdmin()

    const result = await processDataRequestService(
      supabase as UntypedClient,
      requestId,
      adminUser.id
    )

    if (result.success) {
      revalidatePath("/admin/gdpr")
    }

    return result
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Admin access required",
    }
  }
}

/**
 * Deny a data request (admin)
 */
export async function denyDataRequest(
  requestId: string,
  reason: string
): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const { adminUser, supabase } = await requireAdmin()

    if (!reason || reason.trim().length < 10) {
      return { success: false, error: "A detailed reason is required when denying a request" }
    }

    const result = await denyDataRequestService(
      supabase as UntypedClient,
      requestId,
      adminUser.id,
      reason
    )

    if (result.success) {
      revalidatePath("/admin/gdpr")
    }

    return result
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Admin access required",
    }
  }
}

/**
 * Get detailed information about a data request (admin)
 */
export async function getDataRequestDetail(
  requestId: string
): Promise<{
  data: DataRequestWithUser | null
  deletionEligibility?: {
    canDelete: boolean
    canAnonymize: boolean
    retentionEndDate: string | null
    blockers: string[]
  }
  error: string | null
}> {
  try {
    const { supabase } = await requireAdmin()

    const result = await getDataRequest(supabase as UntypedClient, requestId)

    if (!result.data) {
      return { data: null, error: result.error }
    }

    // If it's a deletion request, check eligibility
    let deletionEligibility = undefined
    if (result.data.request_type === "deletion") {
      const check = await canDeleteUser(supabase as UntypedClient, result.data.user_id)
      deletionEligibility = {
        canDelete: check.canDelete,
        canAnonymize: check.canAnonymize,
        retentionEndDate: check.retentionEndDate,
        blockers: check.blockers.map((b) => b.reason),
      }
    }

    return {
      data: result.data,
      deletionEligibility,
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Admin access required",
    }
  }
}

/**
 * Get GDPR dashboard statistics (admin)
 */
export async function getGDPRDashboardStats(): Promise<{
  stats: GDPRDashboardStats | null
  error: string | null
}> {
  try {
    const { supabase } = await requireAdmin()
    const client = supabase as UntypedClient

    // Get pending count
    const { count: pendingCount } = await client
      .from("data_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")

    // Get processing count
    const { count: processingCount } = await client
      .from("data_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "processing")

    // Get completed this month
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { count: completedCount } = await client
      .from("data_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("completed_at", startOfMonth.toISOString())

    // Get denied this month
    const { count: deniedCount } = await client
      .from("data_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "denied")
      .gte("completed_at", startOfMonth.toISOString())

    // Get counts by type
    const { count: accessCount } = await client
      .from("data_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("request_type", "access")

    const { count: deletionCount } = await client
      .from("data_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("request_type", "deletion")

    const { count: exportCount } = await client
      .from("data_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("request_type", "export")

    // Calculate average processing time (from last 50 completed requests)
    const { data: recentCompleted } = await client
      .from("data_requests")
      .select("created_at, completed_at")
      .eq("status", "completed")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(50)

    let averageProcessingTime = 0
    if (recentCompleted && recentCompleted.length > 0) {
      const totalTime = recentCompleted.reduce((sum: number, req: { created_at: string; completed_at: string }) => {
        const created = new Date(req.created_at).getTime()
        const completed = new Date(req.completed_at).getTime()
        return sum + (completed - created)
      }, 0)
      averageProcessingTime = totalTime / recentCompleted.length / (1000 * 60 * 60) // Convert to hours
    }

    return {
      stats: {
        pendingRequests: pendingCount || 0,
        processingRequests: processingCount || 0,
        completedThisMonth: completedCount || 0,
        deniedThisMonth: deniedCount || 0,
        averageProcessingTime: Math.round(averageProcessingTime * 10) / 10,
        requestsByType: {
          access: accessCount || 0,
          deletion: deletionCount || 0,
          export: exportCount || 0,
        },
      },
      error: null,
    }
  } catch (err) {
    return {
      stats: null,
      error: err instanceof Error ? err.message : "Admin access required",
    }
  }
}

/**
 * Get user's audit log (admin viewing another user's log)
 */
export async function getUserAuditLog(
  userId: string,
  options?: {
    limit?: number
    offset?: number
  }
): Promise<{
  data: {
    entries: {
      id: string
      action: string
      dataType: string
      details: Record<string, unknown>
      createdAt: string
    }[]
    stats: {
      totalEvents: number
      accessEvents: number
      modificationEvents: number
      deletionEvents: number
    } | null
  }
  error: string | null
}> {
  try {
    const { supabase } = await requireAdmin()
    const client = supabase as UntypedClient

    const logResult = await getAuditLog(client, userId, {
      limit: options?.limit || 50,
      offset: options?.offset || 0,
    })

    const statsResult = await getAuditStats(client, userId)

    return {
      data: {
        entries: logResult.data.map((entry) => ({
          id: entry.id,
          action: entry.action,
          dataType: entry.data_type,
          details: entry.details,
          createdAt: entry.created_at,
        })),
        stats: statsResult.stats
          ? {
              totalEvents: statsResult.stats.totalEvents,
              accessEvents: statsResult.stats.accessEvents,
              modificationEvents: statsResult.stats.modificationEvents,
              deletionEvents: statsResult.stats.deletionEvents,
            }
          : null,
      },
      error: null,
    }
  } catch (err) {
    return {
      data: { entries: [], stats: null },
      error: err instanceof Error ? err.message : "Admin access required",
    }
  }
}

/**
 * Mark a request as processing (admin)
 */
export async function startProcessingRequest(
  requestId: string
): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const { adminUser, supabase } = await requireAdmin()

    const result = await updateDataRequestStatus(
      supabase as UntypedClient,
      requestId,
      "processing",
      adminUser.id
    )

    if (result.success) {
      revalidatePath("/admin/gdpr")
    }

    return result
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Admin access required",
    }
  }
}

/**
 * Get recent GDPR activity (admin dashboard)
 */
export async function getRecentGDPRActivity(
  limit: number = 10
): Promise<{
  data: {
    id: string
    type: DataRequestType
    status: DataRequestStatus
    userName: string | null
    userEmail: string
    createdAt: string
    completedAt: string | null
  }[]
  error: string | null
}> {
  try {
    const { supabase } = await requireAdmin()
    const client = supabase as UntypedClient

    const { data, error } = await client
      .from("data_requests")
      .select(`
        id,
        request_type,
        status,
        created_at,
        completed_at,
        user:profiles!data_requests_user_id_fkey(full_name, email)
      `)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      throw error
    }

    interface DataRequestRow {
      id: string
      request_type: string
      status: string
      created_at: string
      completed_at: string | null
      user?: { full_name?: string; email?: string } | null
    }

    return {
      data: ((data || []) as DataRequestRow[]).map((item: DataRequestRow) => ({
        id: item.id,
        type: item.request_type as DataRequestType,
        status: item.status as DataRequestStatus,
        userName: item.user?.full_name || null,
        userEmail: item.user?.email || "Unknown",
        createdAt: item.created_at,
        completedAt: item.completed_at,
      })),
      error: null,
    }
  } catch (err) {
    return {
      data: [],
      error: err instanceof Error ? err.message : "Admin access required",
    }
  }
}
