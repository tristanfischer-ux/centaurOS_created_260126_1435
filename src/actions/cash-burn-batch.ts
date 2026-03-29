'use server'

/**
 * @file cash-burn-batch.ts — Batch server actions for quick-setup wizards
 *
 * @description Multi-row inserts for cash out and cash in items.
 * Used by the setup wizards to create many items in a single round-trip.
 * @security All queries filter by foundry_id via getFoundryIdCached().
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { revalidatePath } from 'next/cache'
import type {
  ActionResult,
  CashOutItem,
  CashInItem,
  CreateCashOutInput,
  CreateCashInInput,
  Frequency,
  CostType,
  PnlCategory,
  CashInSourceType,
} from '@/types/cash-burn'
import { normaliseToWeeklyPence } from '@/lib/cash-burn/weekly-projection'

// ============================================================
// Default pnl_category by expense category (same as cash-burn-out.ts)
// ============================================================

const PNL_CATEGORY_DEFAULTS: Record<string, PnlCategory> = {
  hardware_components: 'cogs',
  manufacturing: 'cogs',
  shipping: 'cogs',
  prototyping: 'rnd',
  r_and_d: 'rnd',
  equipment_purchase: 'capex',
}

function getDefaultPnlCategory(category: string): PnlCategory {
  return PNL_CATEGORY_DEFAULTS[category] ?? 'opex'
}

// ============================================================
// Batch Create Cash Out Items
// ============================================================

export async function batchCreateCashOutItems(
  inputs: CreateCashOutInput[]
): Promise<ActionResult<CashOutItem[]>> {
  try {
    if (inputs.length === 0) return { data: [], error: null }

    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const rows = inputs.map((input) => ({
      foundry_id: foundryId,
      created_by: user.id,
      name: input.name,
      category: input.category,
      cost_type: input.cost_type,
      pnl_category: input.pnl_category ?? getDefaultPnlCategory(input.category),
      amount: input.amount,
      frequency: input.frequency,
      effective_from: input.effective_from,
      effective_to: input.effective_to ?? null,
      notes: input.notes ?? null,
    }))

    const { data, error } = await supabase
      .from('cash_out_items')
      .insert(rows)
      .select()

    if (error) {
      console.error('[CashBurn] Failed to batch create cash out items:', error)
      return { data: null, error: 'Failed to create cost items' }
    }

    revalidatePath('/cash-burn')
    revalidatePath('/cash-burn/cash-out')
    return { data: (data ?? []).map(mapCashOutItem), error: null }
  } catch (err) {
    console.error('[CashBurn] Failed to batch create cash out items:', err)
    return { data: null, error: 'Failed to create cost items' }
  }
}

// ============================================================
// Batch Create Cash In Items
// ============================================================

export async function batchCreateCashInItems(
  inputs: CreateCashInInput[]
): Promise<ActionResult<CashInItem[]>> {
  try {
    if (inputs.length === 0) return { data: [], error: null }

    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const rows = inputs.map((input) => ({
      foundry_id: foundryId,
      created_by: user.id,
      name: input.name,
      source_type: input.source_type,
      amount: input.amount,
      frequency: input.frequency,
      probability_pct: input.probability_pct ?? 100,
      effective_from: input.effective_from,
      effective_to: input.effective_to ?? null,
      notes: input.notes ?? null,
    }))

    const { data, error } = await supabase
      .from('cash_in_items')
      .insert(rows)
      .select()

    if (error) {
      console.error('[CashBurn] Failed to batch create cash in items:', error)
      return { data: null, error: 'Failed to create income items' }
    }

    revalidatePath('/cash-burn')
    revalidatePath('/cash-burn/cash-in')
    return { data: (data ?? []).map(mapCashInItem), error: null }
  } catch (err) {
    console.error('[CashBurn] Failed to batch create cash in items:', err)
    return { data: null, error: 'Failed to create income items' }
  }
}

// ============================================================
// Mappers (same logic as individual action files)
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCashOutItem(row: any): CashOutItem {
  const frequency = row.frequency as Frequency
  const amount = Number(row.amount)
  const weeklyAmount = frequency === 'one_time'
    ? amount
    : normaliseToWeeklyPence(amount, frequency)

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    costType: row.cost_type as CostType,
    pnlCategory: row.pnl_category as PnlCategory,
    amount,
    currency: row.currency ?? 'GBP',
    frequency,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    notes: row.notes,
    productId: row.product_id ?? null,
    sortOrder: row.sort_order ?? 0,
    isActive: row.is_active,
    weeklyAmount,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCashInItem(row: any): CashInItem {
  const frequency = row.frequency as Frequency
  const amount = Number(row.amount)
  const probabilityPct = row.probability_pct ?? 100
  const rawWeekly = frequency === 'one_time'
    ? amount
    : normaliseToWeeklyPence(amount, frequency)
  const weeklyAmount = Math.round(rawWeekly * probabilityPct / 100)

  return {
    id: row.id,
    name: row.name,
    sourceType: row.source_type as CashInSourceType,
    amount,
    currency: row.currency ?? 'GBP',
    frequency,
    probabilityPct,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    notes: row.notes,
    productId: row.product_id ?? null,
    sortOrder: row.sort_order ?? 0,
    isActive: row.is_active,
    weeklyAmount,
  }
}
