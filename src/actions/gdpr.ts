"use server"

/**
 * GDPR Server Actions
 * User-facing actions for data access, deletion, and export requests
 */

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  DataRequest,
  DataRequestType,
} from "@/types/gdpr"
import {
  createDataRequest,
  getMyDataRequests as getMyDataRequestsService,
  cancelDataRequest as cancelDataRequestService,
} from "@/lib/gdpr/data-requests"
import {
  getExportUrl,
  getExportSummary,
} from "@/lib/gdpr/data-export"
import { canDeleteUser, getRetentionEndDate } from "@/lib/gdpr/data-deletion"

// Type helper for untyped tables
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = any

/**
 * Request access to own data (GDPR Article 15)
 */
export async function requestDataAccess(): Promise<{
  data: DataRequest | null
  error: string | null
}> {
  const supabase = (await createClient()) as UntypedClient

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }

  const result = await createDataRequest(
    supabase,
    user.id,
    "access"
  )

  if (result.data) {
    revalidatePath("/settings/privacy")
  }

  return result
}

/**
 * Request data deletion (GDPR Article 17 - Right to be Forgotten)
 */
export async function requestDataDeletion(
  reason: string
): Promise<{
  data: DataRequest | null
  error: string | null
  deletionInfo?: {
    canDeleteNow: boolean
    canAnonymize: boolean
    retentionEndDate: string | null
    blockers: string[]
  }
}> {
  const supabase = (await createClient()) as UntypedClient

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }

  // Check deletion eligibility first
  const deletionCheck = await canDeleteUser(supabase, user.id)

  // Create the request regardless (admin will process based on eligibility)
  const result = await createDataRequest(
    supabase,
    user.id,
    "deletion",
    reason
  )

  if (result.data) {
    revalidatePath("/settings/privacy")
  }

  return {
    ...result,
    deletionInfo: {
      canDeleteNow: deletionCheck.canDelete,
      canAnonymize: deletionCheck.canAnonymize,
      retentionEndDate: deletionCheck.retentionEndDate,
      blockers: deletionCheck.blockers.map((b) => b.reason),
    },
  }
}

/**
 * Request data export (GDPR Article 20 - Right to Data Portability)
 */
export async function requestDataExport(): Promise<{
  data: DataRequest | null
  error: string | null
}> {
  const supabase = (await createClient()) as UntypedClient

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }

  const result = await createDataRequest(
    supabase,
    user.id,
    "export"
  )

  if (result.data) {
    revalidatePath("/settings/privacy")
  }

  return result
}

/**
 * Download data export
 */
export async function downloadDataExport(
  requestId: string
): Promise<{
  url: string | null
  error: string | null
}> {
  const supabase = (await createClient()) as UntypedClient

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { url: null, error: "Not authenticated" }
  }

  return getExportUrl(supabase, requestId, user.id)
}

/**
 * Get user's data requests
 */
export async function getMyDataRequests(): Promise<{
  data: DataRequest[]
  error: string | null
}> {
  const supabase = (await createClient()) as UntypedClient

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Not authenticated" }
  }

  return getMyDataRequestsService(supabase, user.id)
}

/**
 * Cancel a pending data request
 */
export async function cancelDataRequest(
  requestId: string
): Promise<{
  success: boolean
  error: string | null
}> {
  const supabase = (await createClient()) as UntypedClient

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  const result = await cancelDataRequestService(supabase, requestId, user.id)

  if (result.success) {
    revalidatePath("/settings/privacy")
  }

  return result
}

/**
 * Get summary of data that will be exported
 */
export async function getMyExportSummary(): Promise<{
  summary: {
    category: string
    itemCount: number
    description: string
  }[]
  error: string | null
}> {
  const supabase = (await createClient()) as UntypedClient

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { summary: [], error: "Not authenticated" }
  }

  return getExportSummary(supabase, user.id)
}

/**
 * Get deletion eligibility info for current user
 */
export async function getDeletionEligibility(): Promise<{
  canDeleteNow: boolean
  canAnonymize: boolean
  retentionEndDate: string | null
  reason: string | null
  blockers: {
    dataType: string
    reason: string
    releaseDate: string | null
  }[]
  error: string | null
}> {
  const supabase = (await createClient()) as UntypedClient

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      canDeleteNow: false,
      canAnonymize: false,
      retentionEndDate: null,
      reason: null,
      blockers: [],
      error: "Not authenticated",
    }
  }

  const deletionCheck = await canDeleteUser(supabase, user.id)
  const retentionInfo = await getRetentionEndDate(supabase, user.id)

  return {
    canDeleteNow: deletionCheck.canDelete,
    canAnonymize: deletionCheck.canAnonymize,
    retentionEndDate: deletionCheck.retentionEndDate,
    reason: retentionInfo.reason,
    blockers: deletionCheck.blockers,
    error: null,
  }
}

/**
 * Get the status of a specific data request
 */
export async function getDataRequestStatus(
  requestId: string
): Promise<{
  data: DataRequest | null
  error: string | null
}> {
  const supabase = (await createClient()) as UntypedClient

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }

  // Fetch the request
  const { data, error } = await supabase
    .from("data_requests")
    .select("*")
    .eq("id", requestId)
    .eq("user_id", user.id) // Ensure user owns this request
    .single()

  if (error) {
    return { data: null, error: "Request not found" }
  }

  return { data: data as DataRequest, error: null }
}

/**
 * Check if user has any pending requests
 */
export async function hasPendingRequests(): Promise<{
  hasPending: boolean
  pendingTypes: DataRequestType[]
  error: string | null
}> {
  const supabase = (await createClient()) as UntypedClient

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { hasPending: false, pendingTypes: [], error: "Not authenticated" }
  }

  const { data, error } = await supabase
    .from("data_requests")
    .select("request_type")
    .eq("user_id", user.id)
    .in("status", ["pending", "processing"])

  if (error) {
    return { hasPending: false, pendingTypes: [], error: "Failed to check pending requests" }
  }

  const pendingTypes: DataRequestType[] = Array.from(new Set((data || []).map((r: { request_type: string }) => r.request_type))) as DataRequestType[]

  return {
    hasPending: pendingTypes.length > 0,
    pendingTypes,
    error: null,
  }
}
