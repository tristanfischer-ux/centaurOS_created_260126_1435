/**
 * Data Request Service
 * Handles GDPR data access, deletion, and export requests
 */

import { SupabaseClient } from "@supabase/supabase-js"
import {
  DataRequest,
  DataRequestType,
  DataRequestStatus,
  DataRequestWithUser,
} from "@/types/gdpr"
import { generateDataExport } from "./data-export"
import { canDeleteUser, anonymizeUser, scheduleFullDeletion } from "./data-deletion"
import { logDataAccess } from "./audit"

// Type helper for untyped tables
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = SupabaseClient<any>

/**
 * Create a new data request
 */
export async function createDataRequest(
  supabase: UntypedClient,
  userId: string,
  type: DataRequestType,
  reason?: string
): Promise<{ data: DataRequest | null; error: string | null }> {
  // Check for existing pending requests of same type
  const { data: existingRequest } = await supabase
    .from("data_requests")
    .select("id, status")
    .eq("user_id", userId)
    .eq("request_type", type)
    .in("status", ["pending", "processing"])
    .maybeSingle()

  if (existingRequest) {
    return {
      data: null,
      error: `You already have a ${type} request in progress`,
    }
  }

  const { data, error } = await supabase
    .from("data_requests")
    .insert({
      user_id: userId,
      request_type: type,
      reason: reason || null,
      status: "pending",
    })
    .select()
    .single()

  if (error) {
    console.error("Error creating data request:", error)
    return { data: null, error: "Failed to create data request" }
  }

  return { data: data as DataRequest, error: null }
}

/**
 * Get a specific data request by ID
 */
export async function getDataRequest(
  supabase: UntypedClient,
  requestId: string
): Promise<{ data: DataRequestWithUser | null; error: string | null }> {
  const { data, error } = await supabase
    .from("data_requests")
    .select(`
      *,
      user:profiles!data_requests_user_id_fkey(id, email, full_name),
      processor:admin_users!data_requests_processed_by_fkey(
        id,
        user:profiles!admin_users_user_id_fkey(id, email, full_name)
      )
    `)
    .eq("id", requestId)
    .single()

  if (error) {
    console.error("Error fetching data request:", error)
    return { data: null, error: "Data request not found" }
  }

  // Transform the data to match our type
  const result: DataRequestWithUser = {
    ...data,
    user: data.user,
    processor: data.processor?.user || null,
  }

  return { data: result, error: null }
}

/**
 * Update data request status
 */
export async function updateDataRequestStatus(
  supabase: UntypedClient,
  requestId: string,
  status: DataRequestStatus,
  processedBy?: string,
  exportUrl?: string
): Promise<{ success: boolean; error: string | null }> {
  const updateData: Record<string, unknown> = {
    status,
  }

  if (processedBy) {
    updateData.processed_by = processedBy
  }

  if (status === "completed") {
    updateData.completed_at = new Date().toISOString()
  }

  if (exportUrl) {
    updateData.export_url = exportUrl
  }

  const { error } = await supabase
    .from("data_requests")
    .update(updateData)
    .eq("id", requestId)

  if (error) {
    console.error("Error updating data request status:", error)
    return { success: false, error: "Failed to update request status" }
  }

  return { success: true, error: null }
}

/**
 * Process a data request (admin action)
 */
export async function processDataRequest(
  supabase: UntypedClient,
  requestId: string,
  adminId: string
): Promise<{ success: boolean; error: string | null }> {
  // Get the request details
  const { data: request, error: fetchError } = await getDataRequest(
    supabase,
    requestId
  )

  if (fetchError || !request) {
    return { success: false, error: fetchError || "Request not found" }
  }

  if (request.status !== "pending") {
    return { success: false, error: "Request is not in pending status" }
  }

  // Update to processing
  await updateDataRequestStatus(supabase, requestId, "processing", adminId)

  try {
    switch (request.request_type) {
      case "access":
        // Generate data export for access request
        const accessExport = await generateDataExport(
          supabase,
          request.user_id,
          requestId
        )
        if (accessExport.error) {
          throw new Error(accessExport.error)
        }

        // Log the data access
        await logDataAccess(supabase, request.user_id, adminId, "full_export")

        // Update with export URL
        await updateDataRequestStatus(
          supabase,
          requestId,
          "completed",
          adminId,
          accessExport.url || undefined
        )
        break

      case "export":
        // Generate machine-readable export
        const exportResult = await generateDataExport(
          supabase,
          request.user_id,
          requestId
        )
        if (exportResult.error) {
          throw new Error(exportResult.error)
        }

        // Log the data export
        await logDataAccess(supabase, request.user_id, adminId, "full_export")

        // Update with export URL
        await updateDataRequestStatus(
          supabase,
          requestId,
          "completed",
          adminId,
          exportResult.url || undefined
        )
        break

      case "deletion":
        // Check if deletion is allowed
        const deletionCheck = await canDeleteUser(supabase, request.user_id)

        if (!deletionCheck.canDelete && !deletionCheck.canAnonymize) {
          // Deny the request - data retention requirements
          await updateDataRequestStatus(supabase, requestId, "denied", adminId)
          return {
            success: false,
            error: `Cannot delete data: ${deletionCheck.blockers
              .map((b) => b.reason)
              .join(", ")}`,
          }
        }

        if (deletionCheck.canDelete) {
          // Immediate deletion allowed
          await anonymizeUser(supabase, request.user_id)
        } else if (deletionCheck.retentionEndDate) {
          // Schedule for later deletion
          await scheduleFullDeletion(
            supabase,
            request.user_id,
            new Date(deletionCheck.retentionEndDate)
          )
        }

        await updateDataRequestStatus(
          supabase,
          requestId,
          "completed",
          adminId
        )
        break

      default:
        throw new Error(`Unknown request type: ${request.request_type}`)
    }

    return { success: true, error: null }
  } catch (err) {
    console.error("Error processing data request:", err)

    // Revert to pending on failure
    await updateDataRequestStatus(supabase, requestId, "pending")

    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to process request",
    }
  }
}

/**
 * Get all data requests for a user
 */
export async function getMyDataRequests(
  supabase: UntypedClient,
  userId: string
): Promise<{ data: DataRequest[]; error: string | null }> {
  const { data, error } = await supabase
    .from("data_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching user data requests:", error)
    return { data: [], error: "Failed to fetch data requests" }
  }

  return { data: data as DataRequest[], error: null }
}

/**
 * Get pending data requests (admin view)
 */
export async function getPendingDataRequests(
  supabase: UntypedClient,
  limit: number = 50
): Promise<{ data: DataRequestWithUser[]; error: string | null }> {
  const { data, error } = await supabase
    .from("data_requests")
    .select(`
      *,
      user:profiles!data_requests_user_id_fkey(id, email, full_name)
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit)

  if (error) {
    console.error("Error fetching pending requests:", error)
    return { data: [], error: "Failed to fetch pending requests" }
  }

  return { data: data as DataRequestWithUser[], error: null }
}

/**
 * Get all data requests with filters (admin view)
 */
export async function getAllDataRequests(
  supabase: UntypedClient,
  filters: {
    status?: DataRequestStatus
    type?: DataRequestType
    limit?: number
    offset?: number
  } = {}
): Promise<{
  data: DataRequestWithUser[]
  error: string | null
  count: number
}> {
  let query = supabase
    .from("data_requests")
    .select(
      `
      *,
      user:profiles!data_requests_user_id_fkey(id, email, full_name),
      processor:admin_users!data_requests_processed_by_fkey(
        id,
        user:profiles!admin_users_user_id_fkey(id, email, full_name)
      )
    `,
      { count: "exact" }
    )

  if (filters.status) {
    query = query.eq("status", filters.status)
  }

  if (filters.type) {
    query = query.eq("request_type", filters.type)
  }

  query = query
    .order("created_at", { ascending: false })
    .range(filters.offset || 0, (filters.offset || 0) + (filters.limit || 50) - 1)

  const { data, error, count } = await query

  if (error) {
    console.error("Error fetching data requests:", error)
    return { data: [], error: "Failed to fetch data requests", count: 0 }
  }

  // Transform processor data
  const transformed = (data || []).map((d) => ({
    ...d,
    processor: d.processor?.user || null,
  }))

  return {
    data: transformed as DataRequestWithUser[],
    error: null,
    count: count || 0,
  }
}

/**
 * Cancel a pending data request
 */
export async function cancelDataRequest(
  supabase: UntypedClient,
  requestId: string,
  userId: string
): Promise<{ success: boolean; error: string | null }> {
  // Verify ownership and status
  const { data: request, error: fetchError } = await supabase
    .from("data_requests")
    .select("user_id, status")
    .eq("id", requestId)
    .single()

  if (fetchError || !request) {
    return { success: false, error: "Request not found" }
  }

  if (request.user_id !== userId) {
    return { success: false, error: "Not authorized to cancel this request" }
  }

  if (request.status !== "pending") {
    return { success: false, error: "Only pending requests can be cancelled" }
  }

  // Delete the request
  const { error: deleteError } = await supabase
    .from("data_requests")
    .delete()
    .eq("id", requestId)

  if (deleteError) {
    console.error("Error cancelling data request:", deleteError)
    return { success: false, error: "Failed to cancel request" }
  }

  return { success: true, error: null }
}

/**
 * Deny a data request (admin action)
 */
export async function denyDataRequest(
  supabase: UntypedClient,
  requestId: string,
  adminId: string,
  reason: string
): Promise<{ success: boolean; error: string | null }> {
  const { data: request } = await supabase
    .from("data_requests")
    .select("status")
    .eq("id", requestId)
    .single()

  if (!request || request.status !== "pending") {
    return { success: false, error: "Request not found or not pending" }
  }

  const { error } = await supabase
    .from("data_requests")
    .update({
      status: "denied",
      processed_by: adminId,
      completed_at: new Date().toISOString(),
      reason: reason,
    })
    .eq("id", requestId)

  if (error) {
    console.error("Error denying data request:", error)
    return { success: false, error: "Failed to deny request" }
  }

  return { success: true, error: null }
}
