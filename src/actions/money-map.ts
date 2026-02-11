'use server'

/**
 * @file money-map.ts
 *
 * @description Server actions for the Money Map feature. Provides CRUD
 * operations for revenue streams, cost items, cost allocation links,
 * and snapshots. Also handles auto-population from platform data.
 *
 * @security All actions require authentication and foundry membership
 *           (enforced by RLS policies on the underlying tables).
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

import type {
  RevenueStream,
  RevenueStreamInput,
  CostItem,
  CostItemInput,
  CostLink,
  CostLinkInput,
  MoneyMapSnapshot,
  MoneyMapData,
  MoneyMapSnapshotData,
} from '@/types/money-map'

import { computeMoneyMapSummary, computeProfitability } from '@/lib/money-map/allocation'

// ============================================================
// Helpers
// ============================================================

interface ActionResult<T = null> {
  data: T | null
  error: string | null
}

/**
 * Get the current user's active foundry_id.
 *
 * @description Reads the user's profile to determine their active foundry.
 * @returns foundry_id string or null
 */
async function getFoundryId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: member } = await supabase
    .from('foundry_members')
    .select('foundry_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .single()

  return member?.foundry_id ?? null
}

// ============================================================
// Revenue Streams
// ============================================================

/**
 * Fetch all active revenue streams for the current foundry.
 *
 * @returns Array of revenue streams ordered by sort_order
 * @security RLS ensures foundry isolation
 */
export async function getRevenueStreams(): Promise<ActionResult<RevenueStream[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryId(supabase)
    if (!foundryId) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('money_map_revenue_streams')
      .select('*')
      .eq('foundry_id', foundryId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('[MoneyMap] Failed to fetch revenue streams:', { foundryId, error: error.message })
      return { data: null, error: error.message }
    }

    return { data: data as RevenueStream[], error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[MoneyMap] Unexpected error fetching revenue streams:', message)
    return { data: null, error: message }
  }
}

/**
 * Create a new revenue stream.
 *
 * @param input - Revenue stream data
 * @returns The created revenue stream
 * @security RLS ensures foundry membership
 */
export async function createRevenueStream(input: RevenueStreamInput): Promise<ActionResult<RevenueStream>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryId(supabase)
    if (!foundryId) return { data: null, error: 'Not authenticated' }

    // VALIDATION: Name is required
    if (!input.name?.trim()) {
      return { data: null, error: 'Name is required' }
    }

    const { data, error } = await supabase
      .from('money_map_revenue_streams')
      .insert({
        foundry_id: foundryId,
        name: input.name.trim(),
        category: input.category,
        amount: input.amount,
        currency: input.currency ?? 'GBP',
        period: input.period ?? 'monthly',
        source: input.source ?? 'manual',
        auto_source_type: input.auto_source_type ?? null,
        description: input.description ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[MoneyMap] Failed to create revenue stream:', { foundryId, error: error.message })
      return { data: null, error: error.message }
    }

    revalidatePath('/money-map')
    return { data: data as RevenueStream, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[MoneyMap] Unexpected error creating revenue stream:', message)
    return { data: null, error: message }
  }
}

/**
 * Update an existing revenue stream.
 *
 * @param id - Revenue stream ID
 * @param input - Partial update data
 * @returns The updated revenue stream
 */
export async function updateRevenueStream(
  id: string,
  input: Partial<RevenueStreamInput>
): Promise<ActionResult<RevenueStream>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryId(supabase)
    if (!foundryId) return { data: null, error: 'Not authenticated' }

    const updateData: Record<string, unknown> = {}
    if (input.name !== undefined) updateData.name = input.name.trim()
    if (input.category !== undefined) updateData.category = input.category
    if (input.amount !== undefined) updateData.amount = input.amount
    if (input.currency !== undefined) updateData.currency = input.currency
    if (input.period !== undefined) updateData.period = input.period
    if (input.description !== undefined) updateData.description = input.description

    const { data, error } = await supabase
      .from('money_map_revenue_streams')
      .update(updateData)
      .eq('id', id)
      .eq('foundry_id', foundryId)
      .select()
      .single()

    if (error) {
      console.error('[MoneyMap] Failed to update revenue stream:', { id, error: error.message })
      return { data: null, error: error.message }
    }

    revalidatePath('/money-map')
    return { data: data as RevenueStream, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[MoneyMap] Unexpected error updating revenue stream:', message)
    return { data: null, error: message }
  }
}

/**
 * Soft-delete a revenue stream (sets is_active = false).
 *
 * @param id - Revenue stream ID
 */
export async function deleteRevenueStream(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryId(supabase)
    if (!foundryId) return { data: null, error: 'Not authenticated' }

    const { error } = await supabase
      .from('money_map_revenue_streams')
      .update({ is_active: false })
      .eq('id', id)
      .eq('foundry_id', foundryId)

    if (error) {
      console.error('[MoneyMap] Failed to delete revenue stream:', { id, error: error.message })
      return { data: null, error: error.message }
    }

    revalidatePath('/money-map')
    return { data: null, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[MoneyMap] Unexpected error deleting revenue stream:', message)
    return { data: null, error: message }
  }
}

// ============================================================
// Cost Items
// ============================================================

/**
 * Fetch all active cost items for the current foundry.
 *
 * @returns Array of cost items ordered by cost_type then sort_order
 */
export async function getCostItems(): Promise<ActionResult<CostItem[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryId(supabase)
    if (!foundryId) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('money_map_cost_items')
      .select('*')
      .eq('foundry_id', foundryId)
      .eq('is_active', true)
      .order('cost_type', { ascending: true })
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('[MoneyMap] Failed to fetch cost items:', { foundryId, error: error.message })
      return { data: null, error: error.message }
    }

    return { data: data as CostItem[], error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[MoneyMap] Unexpected error fetching cost items:', message)
    return { data: null, error: message }
  }
}

/**
 * Create a new cost item.
 *
 * @param input - Cost item data
 * @returns The created cost item
 */
export async function createCostItem(input: CostItemInput): Promise<ActionResult<CostItem>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryId(supabase)
    if (!foundryId) return { data: null, error: 'Not authenticated' }

    if (!input.name?.trim()) {
      return { data: null, error: 'Name is required' }
    }

    const { data, error } = await supabase
      .from('money_map_cost_items')
      .insert({
        foundry_id: foundryId,
        name: input.name.trim(),
        category: input.category,
        amount: input.amount,
        currency: input.currency ?? 'GBP',
        period: input.period ?? 'monthly',
        cost_type: input.cost_type,
        source: input.source ?? 'manual',
        description: input.description ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[MoneyMap] Failed to create cost item:', { foundryId, error: error.message })
      return { data: null, error: error.message }
    }

    revalidatePath('/money-map')
    return { data: data as CostItem, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[MoneyMap] Unexpected error creating cost item:', message)
    return { data: null, error: message }
  }
}

/**
 * Update an existing cost item.
 *
 * @param id - Cost item ID
 * @param input - Partial update data
 * @returns The updated cost item
 */
export async function updateCostItem(
  id: string,
  input: Partial<CostItemInput>
): Promise<ActionResult<CostItem>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryId(supabase)
    if (!foundryId) return { data: null, error: 'Not authenticated' }

    const updateData: Record<string, unknown> = {}
    if (input.name !== undefined) updateData.name = input.name.trim()
    if (input.category !== undefined) updateData.category = input.category
    if (input.amount !== undefined) updateData.amount = input.amount
    if (input.currency !== undefined) updateData.currency = input.currency
    if (input.period !== undefined) updateData.period = input.period
    if (input.cost_type !== undefined) updateData.cost_type = input.cost_type
    if (input.description !== undefined) updateData.description = input.description

    const { data, error } = await supabase
      .from('money_map_cost_items')
      .update(updateData)
      .eq('id', id)
      .eq('foundry_id', foundryId)
      .select()
      .single()

    if (error) {
      console.error('[MoneyMap] Failed to update cost item:', { id, error: error.message })
      return { data: null, error: error.message }
    }

    revalidatePath('/money-map')
    return { data: data as CostItem, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[MoneyMap] Unexpected error updating cost item:', message)
    return { data: null, error: message }
  }
}

/**
 * Soft-delete a cost item.
 *
 * @param id - Cost item ID
 */
export async function deleteCostItem(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryId(supabase)
    if (!foundryId) return { data: null, error: 'Not authenticated' }

    const { error } = await supabase
      .from('money_map_cost_items')
      .update({ is_active: false })
      .eq('id', id)
      .eq('foundry_id', foundryId)

    if (error) {
      console.error('[MoneyMap] Failed to delete cost item:', { id, error: error.message })
      return { data: null, error: error.message }
    }

    revalidatePath('/money-map')
    return { data: null, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[MoneyMap] Unexpected error deleting cost item:', message)
    return { data: null, error: message }
  }
}

// ============================================================
// Cost Links
// ============================================================

/**
 * Fetch all cost links for the current foundry.
 *
 * @returns Array of cost allocation links
 */
export async function getCostLinks(): Promise<ActionResult<CostLink[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryId(supabase)
    if (!foundryId) return { data: null, error: 'Not authenticated' }

    // RLS handles foundry isolation through the cost_item join
    const { data, error } = await supabase
      .from('money_map_cost_links')
      .select('*')

    if (error) {
      console.error('[MoneyMap] Failed to fetch cost links:', { foundryId, error: error.message })
      return { data: null, error: error.message }
    }

    return { data: data as CostLink[], error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[MoneyMap] Unexpected error fetching cost links:', message)
    return { data: null, error: message }
  }
}

/**
 * Upsert cost links for a cost item. Replaces all existing links for the item.
 *
 * @param costItemId - The cost item to link
 * @param links - Array of revenue stream allocations
 */
export async function upsertCostLinks(
  costItemId: string,
  links: Omit<CostLinkInput, 'cost_item_id'>[]
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryId(supabase)
    if (!foundryId) return { data: null, error: 'Not authenticated' }

    // VALIDATION: Total allocation should not exceed 100%
    const totalPct = links.reduce((sum, l) => sum + l.allocation_pct, 0)
    if (totalPct > 100.01) {
      return { data: null, error: 'Total allocation cannot exceed 100%' }
    }

    // Delete existing links for this cost item
    await supabase
      .from('money_map_cost_links')
      .delete()
      .eq('cost_item_id', costItemId)

    // Insert new links
    if (links.length > 0) {
      const rows = links.map((l) => ({
        cost_item_id: costItemId,
        revenue_stream_id: l.revenue_stream_id,
        allocation_pct: l.allocation_pct,
        allocation_method: l.allocation_method,
      }))

      const { error } = await supabase
        .from('money_map_cost_links')
        .insert(rows)

      if (error) {
        console.error('[MoneyMap] Failed to upsert cost links:', { costItemId, error: error.message })
        return { data: null, error: error.message }
      }
    }

    revalidatePath('/money-map')
    return { data: null, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[MoneyMap] Unexpected error upserting cost links:', message)
    return { data: null, error: message }
  }
}

// ============================================================
// Full Money Map Data
// ============================================================

/**
 * Fetch the complete money map data with computed profitability.
 *
 * @description Loads all revenue streams, cost items, and cost links,
 * then computes allocation and profitability summaries.
 * @returns Full MoneyMapData object
 */
export async function getMoneyMapData(): Promise<ActionResult<MoneyMapData>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryId(supabase)
    if (!foundryId) return { data: null, error: 'Not authenticated' }

    // Fetch all data in parallel
    const [streamsResult, costsResult, linksResult] = await Promise.all([
      supabase
        .from('money_map_revenue_streams')
        .select('*')
        .eq('foundry_id', foundryId)
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('money_map_cost_items')
        .select('*')
        .eq('foundry_id', foundryId)
        .eq('is_active', true)
        .order('cost_type')
        .order('sort_order'),
      supabase
        .from('money_map_cost_links')
        .select('*'),
    ])

    if (streamsResult.error || costsResult.error || linksResult.error) {
      const msg = streamsResult.error?.message || costsResult.error?.message || linksResult.error?.message || 'Unknown'
      console.error('[MoneyMap] Failed to fetch money map data:', { foundryId, error: msg })
      return { data: null, error: msg }
    }

    const revenueStreams = (streamsResult.data ?? []) as RevenueStream[]
    const costItems = (costsResult.data ?? []) as CostItem[]
    const costLinks = (linksResult.data ?? []) as CostLink[]

    // Compute derived data
    const profitability = computeProfitability(revenueStreams, costItems, costLinks)
    const summary = computeMoneyMapSummary(revenueStreams, costItems, profitability)

    return {
      data: {
        revenue_streams: revenueStreams,
        cost_items: costItems,
        cost_links: costLinks,
        summary,
        profitability,
      },
      error: null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[MoneyMap] Unexpected error fetching money map data:', message)
    return { data: null, error: message }
  }
}

// ============================================================
// Snapshots
// ============================================================

/**
 * Fetch all snapshots for the current foundry.
 *
 * @returns Array of snapshots ordered by created_at desc
 */
export async function getSnapshots(): Promise<ActionResult<MoneyMapSnapshot[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryId(supabase)
    if (!foundryId) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('money_map_snapshots')
      .select('*')
      .eq('foundry_id', foundryId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[MoneyMap] Failed to fetch snapshots:', { foundryId, error: error.message })
      return { data: null, error: error.message }
    }

    return { data: data as MoneyMapSnapshot[], error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[MoneyMap] Unexpected error fetching snapshots:', message)
    return { data: null, error: message }
  }
}

/**
 * Create a point-in-time snapshot of the current money map state.
 *
 * @param name - Snapshot name (e.g., "Q1 2026 Review")
 * @param periodLabel - Period label (e.g., "Q1 2026")
 * @returns The created snapshot
 * @audit Logs snapshot creation with foundry_id
 */
export async function createSnapshot(
  name: string,
  periodLabel: string
): Promise<ActionResult<MoneyMapSnapshot>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryId(supabase)
    if (!foundryId) return { data: null, error: 'Not authenticated' }

    if (!name?.trim()) return { data: null, error: 'Name is required' }
    if (!periodLabel?.trim()) return { data: null, error: 'Period label is required' }

    // Fetch current state
    const mapResult = await getMoneyMapData()
    if (mapResult.error || !mapResult.data) {
      return { data: null, error: mapResult.error ?? 'Failed to load data' }
    }

    const snapshotData: MoneyMapSnapshotData = {
      revenue_streams: mapResult.data.revenue_streams,
      cost_items: mapResult.data.cost_items,
      cost_links: mapResult.data.cost_links,
      profitability: mapResult.data.profitability,
      summary: mapResult.data.summary,
    }

    // AUDIT: Creating financial snapshot
    const { data, error } = await supabase
      .from('money_map_snapshots')
      .insert({
        foundry_id: foundryId,
        name: name.trim(),
        period_label: periodLabel.trim(),
        snapshot_data: snapshotData,
        total_revenue: mapResult.data.summary.total_revenue,
        total_costs: mapResult.data.summary.total_costs,
        net_margin_pct: mapResult.data.summary.net_margin_pct,
      })
      .select()
      .single()

    if (error) {
      console.error('[MoneyMap] Failed to create snapshot:', { foundryId, error: error.message })
      return { data: null, error: error.message }
    }

    revalidatePath('/money-map')
    return { data: data as MoneyMapSnapshot, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[MoneyMap] Unexpected error creating snapshot:', message)
    return { data: null, error: message }
  }
}
