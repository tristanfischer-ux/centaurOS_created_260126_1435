"use server"

/**
 * Dispute Server Actions
 * Server-side actions for dispute management
 */

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  createDispute as createDisputeService,
  getDispute as getDisputeService,
  updateDisputeStatus,
  assignDispute as assignDisputeService,
  resolveDispute as resolveDisputeService,
  addDisputeEvidence,
  getUserDisputes,
  checkAutoResolution,
  getDisputeStats,
  DisputeStatus,
  DisputeWithDetails,
  ResolveDisputeParams,
} from "@/lib/disputes/service"

// Re-export types
export type { DisputeStatus, DisputeWithDetails, ResolveDisputeParams }

// ==========================================
// PUBLIC ACTIONS
// ==========================================

/**
 * Create a new dispute
 */
export async function createDisputeAction(
  orderId: string,
  reason: string,
  evidenceUrls?: string[]
): Promise<{
  data: { id: string } | null
  error: string | null
}> {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }

  const { data, error } = await createDisputeService(supabase, user.id, {
    orderId,
    reason,
    evidenceUrls,
  })

  if (error) {
    return { data: null, error }
  }

  revalidatePath("/orders")
  revalidatePath(`/orders/${orderId}`)
  revalidatePath("/my-orders")

  return { data: { id: data!.id }, error: null }
}

/**
 * Get user's disputes
 */
export async function getMyDisputes(options?: {
  status?: DisputeStatus[]
  limit?: number
  offset?: number
}): Promise<{
  data: DisputeWithDetails[]
  error: string | null
  total: number
}> {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Not authenticated", total: 0 }
  }

  return getUserDisputes(supabase, user.id, options)
}

/**
 * Get dispute details
 */
export async function getDisputeDetail(disputeId: string): Promise<{
  data: DisputeWithDetails | null
  error: string | null
  canAddEvidence: boolean
  isParty: boolean
}> {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated", canAddEvidence: false, isParty: false }
  }

  const { data, error } = await getDisputeService(supabase, disputeId, user.id)

  if (error) {
    return { data: null, error, canAddEvidence: false, isParty: false }
  }

  // Determine if user can add evidence
  const canAddEvidenceStatuses: DisputeStatus[] = ["open", "under_review", "mediation"]
  const canAddEvidence = canAddEvidenceStatuses.includes(data!.status as DisputeStatus)

  // Check if user is a party
  const isParty =
    data!.raised_by === user.id ||
    data!.order?.buyer_id === user.id ||
    data!.assigned_to === user.id

  return { data, error: null, canAddEvidence, isParty }
}

/**
 * Add evidence to a dispute
 */
export async function addDisputeEvidenceAction(
  disputeId: string,
  evidenceUrls: string[],
  description?: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  const { success, error } = await addDisputeEvidence(
    supabase,
    disputeId,
    user.id,
    evidenceUrls,
    description
  )

  if (success) {
    revalidatePath(`/disputes/${disputeId}`)
  }

  return { success, error }
}

/**
 * Accept dispute resolution
 */
export async function acceptDisputeResolution(
  disputeId: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  // Get dispute to verify user is a party
  const { data: dispute, error: fetchError } = await getDisputeService(
    supabase,
    disputeId,
    user.id
  )

  if (fetchError || !dispute) {
    return { success: false, error: fetchError || "Dispute not found" }
  }

  // Check if user is a party
  const isBuyer = dispute.order?.buyer_id === user.id
  const isRaiser = dispute.raised_by === user.id

  if (!isBuyer && !isRaiser) {
    // Check if user is seller
    const { data: sellerProfile } = await supabase
      .from("provider_profiles")
      .select("user_id")
      .eq("id", dispute.order?.seller_id)
      .single()

    if (sellerProfile?.user_id !== user.id) {
      return { success: false, error: "Not authorized to accept resolution" }
    }
  }

  // Verify dispute is in a state that can be accepted
  if (dispute.status !== "resolved") {
    return { success: false, error: "Dispute must be resolved before accepting" }
  }

  // Log acceptance (in a real implementation, this might trigger final payment release)
  // For now, just acknowledge the acceptance

  revalidatePath(`/disputes/${disputeId}`)
  return { success: true, error: null }
}

/**
 * Cancel a dispute (only if still open)
 */
export async function cancelDispute(
  disputeId: string,
  reason?: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  // Get dispute to verify ownership
  const { data: dispute, error: fetchError } = await getDisputeService(
    supabase,
    disputeId,
    user.id
  )

  if (fetchError || !dispute) {
    return { success: false, error: fetchError || "Dispute not found" }
  }

  // Only raiser can cancel, and only if still open
  if (dispute.raised_by !== user.id) {
    return { success: false, error: "Only the person who raised the dispute can cancel it" }
  }

  if (dispute.status !== "open") {
    return { success: false, error: "Can only cancel disputes that are still open" }
  }

  const { success, error } = await updateDisputeStatus(
    supabase,
    disputeId,
    "cancelled",
    user.id,
    reason || "Cancelled by user"
  )

  if (success) {
    // Restore order status
    if (dispute.order_id) {
      await supabase
        .from("orders")
        .update({ status: "in_progress" })
        .eq("id", dispute.order_id)
    }

    revalidatePath("/disputes")
    revalidatePath(`/disputes/${disputeId}`)
    revalidatePath(`/orders/${dispute.order_id}`)
  }

  return { success, error }
}

// ==========================================
// ADMIN ACTIONS
// ==========================================

/**
 * Assign dispute to admin
 */
export async function assignDisputeToAdmin(
  disputeId: string,
  adminUserId?: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  // Verify admin access
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!adminUser) {
    return { success: false, error: "Admin access required" }
  }

  // Assign to specified admin or self
  const assigneeId = adminUserId || user.id

  const { success, error } = await assignDisputeService(
    supabase,
    disputeId,
    assigneeId,
    user.id
  )

  if (success) {
    revalidatePath("/admin")
    revalidatePath(`/admin/disputes/${disputeId}`)
  }

  return { success, error }
}

/**
 * Update dispute status (admin only)
 */
export async function updateDisputeStatusAdmin(
  disputeId: string,
  status: DisputeStatus,
  notes?: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  // Verify admin access
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!adminUser) {
    return { success: false, error: "Admin access required" }
  }

  const { success, error } = await updateDisputeStatus(
    supabase,
    disputeId,
    status,
    user.id,
    notes
  )

  if (success) {
    revalidatePath("/admin")
    revalidatePath(`/admin/disputes/${disputeId}`)
  }

  return { success, error }
}

/**
 * Resolve dispute (admin only)
 */
export async function resolveDisputeAdmin(
  disputeId: string,
  params: ResolveDisputeParams
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  // Verify admin access
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!adminUser) {
    return { success: false, error: "Admin access required" }
  }

  const { success, error } = await resolveDisputeService(
    supabase,
    disputeId,
    user.id,
    params
  )

  if (success) {
    revalidatePath("/admin")
    revalidatePath(`/admin/disputes/${disputeId}`)
  }

  return { success, error }
}

/**
 * Check for auto-resolution (admin only)
 */
export async function checkDisputeAutoResolution(disputeId: string): Promise<{
  shouldAutoResolve: boolean
  resolution: ResolveDisputeParams | null
  reason: string | null
  error: string | null
}> {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      shouldAutoResolve: false,
      resolution: null,
      reason: null,
      error: "Not authenticated",
    }
  }

  // Verify admin access
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!adminUser) {
    return {
      shouldAutoResolve: false,
      resolution: null,
      reason: null,
      error: "Admin access required",
    }
  }

  const result = await checkAutoResolution(supabase, disputeId)

  return { ...result, error: null }
}

/**
 * Get dispute statistics (admin only)
 */
export async function getDisputeStatistics(): Promise<{
  data: {
    total: number
    open: number
    resolved: number
    averageResolutionDays: number
    byStatus: Record<DisputeStatus, number>
  } | null
  error: string | null
}> {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }

  // Verify admin access
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!adminUser) {
    return { data: null, error: "Admin access required" }
  }

  return getDisputeStats(supabase)
}

/**
 * Get all disputes for admin view
 */
export async function getAllDisputes(options?: {
  status?: DisputeStatus[]
  assignedTo?: string
  limit?: number
  offset?: number
}): Promise<{
  data: DisputeWithDetails[]
  error: string | null
  total: number
}> {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Not authenticated", total: 0 }
  }

  // Verify admin access
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!adminUser) {
    return { data: [], error: "Admin access required", total: 0 }
  }

  const { status, assignedTo, limit = 20, offset = 0 } = options || {}

  let query = supabase
    .from("disputes")
    .select(
      `
      *,
      order:orders!disputes_order_id_fkey(
        order_number,
        total_amount,
        buyer_id,
        seller_id,
        status
      ),
      raiser:profiles!disputes_raised_by_fkey(
        full_name,
        email
      ),
      assignee:profiles!disputes_assigned_to_fkey(
        full_name,
        email
      )
    `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = query.in("status", status as any)
  }

  if (assignedTo) {
    query = query.eq("assigned_to", assignedTo)
  }

  const { data, error, count } = await query

  if (error) {
    return { data: [], error: error.message, total: 0 }
  }

  return {
    data: (data || []) as DisputeWithDetails[],
    error: null,
    total: count || 0,
  }
}
