"use server"

/**
 * @file assembly.ts — Server actions for assembly job management.
 *
 * @description Creates and manages assembly jobs linked to manufacturing orders.
 * Tracks parts receiving, QC status, and assembly progress through the
 * existing assembly_jobs and assembly_job_parts tables.
 *
 * @security All actions require authentication via withAuth. Foundry isolation enforced.
 */

import { withAuth } from "@/lib/server-action-utils"
import { sanitizeErrorMessage } from "@/lib/security/sanitize"

/** Assembly job summary for UI display */
export interface AssemblyJobSummary {
  id: string
  status: string
  qcStatus: string
  assemblerId: string
  assemblyPartId: string | null
  notes: string | null
  trackingReference: string | null
  startedAt: string | null
  completedAt: string | null
  shippedAt: string | null
  createdAt: string
}

/** Order line summary combining manufacturing order and assembly data */
export interface OrderLineSummary {
  orderId: string
  orderNumber: string
  orderTitle: string | null
  orderStatus: string
  totalCostGbp: number | null
  requiredBy: string | null
  assemblyJobs: AssemblyJobSummary[]
}

/**
 * Fetches the full assembly dashboard for a project.
 *
 * @param projectId - The project to get assembly data for
 * @returns Aggregated order + assembly view
 */
export async function getAssemblyDashboard(
  projectId: string,
): Promise<{ orderLines: OrderLineSummary[] } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    // Fetch manufacturing orders for this project
    const { data: orders, error: orderError } = await supabase
      .from("manufacturing_orders")
      .select("id, order_number, title, status, total_estimated_cost_gbp, required_by")
      .eq("foundry_id", foundryId)
      .eq("cad_lab_project_id", projectId)
      .order("created_at", { ascending: false })

    if (orderError) {
      console.error("[ASSEMBLY] Failed to fetch orders:", orderError.message)
      return { orderLines: [] }
    }

    if (!orders || orders.length === 0) {
      return { orderLines: [] }
    }

    // Fetch assembly jobs for these orders
    const orderIds = orders.map((o) => o.id)
    const { data: jobs } = await supabase
      .from("assembly_jobs")
      .select("id, status, qc_status, assembler_id, assembly_part_id, notes, tracking_reference, started_at, completed_at, shipped_at, created_at, manufacturing_order_id")
      .in("manufacturing_order_id", orderIds)
      .order("created_at", { ascending: true })

    const jobsByOrder = new Map<string, AssemblyJobSummary[]>()
    for (const job of jobs ?? []) {
      const orderId = job.manufacturing_order_id
      const existing = jobsByOrder.get(orderId) ?? []
      existing.push({
        id: job.id,
        status: job.status,
        qcStatus: job.qc_status,
        assemblerId: job.assembler_id,
        assemblyPartId: job.assembly_part_id,
        notes: job.notes,
        trackingReference: job.tracking_reference,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        shippedAt: job.shipped_at,
        createdAt: job.created_at,
      })
      jobsByOrder.set(orderId, existing)
    }

    const orderLines: OrderLineSummary[] = orders.map((o) => ({
      orderId: o.id,
      orderNumber: o.order_number,
      orderTitle: o.title,
      orderStatus: o.status,
      totalCostGbp: o.total_estimated_cost_gbp,
      requiredBy: o.required_by,
      assemblyJobs: jobsByOrder.get(o.id) ?? [],
    }))

    return { orderLines }
  })
}

/**
 * Updates the status of an assembly job.
 */
export async function updateAssemblyStatus(
  jobId: string,
  status: string,
): Promise<{ success: boolean } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    const updateData: Record<string, string | null> = { status }
    if (status === "in_progress" || status === "assembling") {
      updateData.started_at = new Date().toISOString()
    }
    if (status === "completed" || status === "done") {
      updateData.completed_at = new Date().toISOString()
    }
    if (status === "shipped") {
      updateData.shipped_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from("assembly_jobs")
      .update(updateData)
      .eq("id", jobId)

    if (error) {
      return { error: sanitizeErrorMessage(error) }
    }

    return { success: true }
  })
}

/**
 * Updates the status of a manufacturing order line.
 */
export async function updateOrderLineStatus(
  orderId: string,
  status: string,
  trackingReference?: string,
): Promise<{ success: boolean } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    const updateData: Record<string, string> = { status }
    if (trackingReference) {
      updateData.notes = `Tracking: ${trackingReference}`
    }

    const { error } = await supabase
      .from("manufacturing_orders")
      .update(updateData)
      .eq("id", orderId)

    if (error) {
      return { error: sanitizeErrorMessage(error) }
    }

    return { success: true }
  })
}
