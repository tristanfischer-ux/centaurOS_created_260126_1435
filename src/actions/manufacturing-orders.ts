"use server"

/**
 * @file manufacturing-orders.ts — Server actions for manufacturing order management.
 *
 * @description Creates and manages manufacturing orders from awarded RFQ responses.
 * Links to the existing manufacturing_orders table in the database.
 *
 * @security All actions require authentication via withAuth. Foundry isolation enforced.
 */

import { withAuth } from "@/lib/server-action-utils"

/** Summary of a manufacturing order for UI display */
export interface ManufacturingOrderSummary {
  id: string
  orderNumber: string
  title: string | null
  status: string
  totalEstimatedCostGbp: number | null
  requiredBy: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Creates a manufacturing order from an awarded RFQ response.
 *
 * @param rfqId - The RFQ that was awarded
 * @param responseId - The winning response
 * @param projectId - The CAD Lab project to link
 * @param title - Order title
 * @param notes - Optional notes
 */
export async function createOrderFromAward(
  rfqId: string,
  responseId: string,
  projectId: string,
  title: string,
  notes?: string,
): Promise<{ orderId: string } | { error: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // Generate a unique order number
    const orderNumber = `MO-${Date.now().toString(36).toUpperCase()}`

    const { data, error } = await supabase
      .from("manufacturing_orders")
      .insert({
        order_number: orderNumber,
        title,
        notes: notes ?? null,
        cad_lab_project_id: projectId,
        created_by: user.id,
        foundry_id: foundryId,
        status: "confirmed",
      })
      .select("id")
      .single()

    if (error || !data) {
      return { error: error?.message ?? "Failed to create manufacturing order." }
    }

    return { orderId: data.id }
  })
}

/**
 * Fetches all manufacturing orders for a project.
 *
 * @param projectId - The project to fetch orders for
 */
export async function getProjectOrders(
  projectId: string,
): Promise<{ orders: ManufacturingOrderSummary[] } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data, error } = await supabase
      .from("manufacturing_orders")
      .select("id, order_number, title, status, total_estimated_cost_gbp, required_by, created_at, updated_at")
      .eq("foundry_id", foundryId)
      .eq("cad_lab_project_id", projectId)
      .order("created_at", { ascending: false })

    if (error) {
      return { orders: [] }
    }

    const orders: ManufacturingOrderSummary[] = (data ?? []).map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      title: o.title,
      status: o.status,
      totalEstimatedCostGbp: o.total_estimated_cost_gbp,
      requiredBy: o.required_by,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
    }))

    return { orders }
  })
}
