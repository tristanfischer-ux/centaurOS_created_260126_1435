'use server'

/**
 * @file cash-burn-in.ts — Server actions for cash in (revenue/funding) items
 *
 * @description CRUD for revenue, loans, equity, grants, and other cash inflows.
 * @security All queries filter by foundry_id via getFoundryIdCached().
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { revalidatePath } from 'next/cache'
import type {
  ActionResult,
  CashInItem,
  CreateCashInInput,
  Frequency,
  CashInSourceType,
} from '@/types/cash-burn'
import { normaliseToWeeklyPence } from '@/lib/cash-burn/weekly-projection'

// ============================================================
// CRUD
// ============================================================

export async function getCashInItems(): Promise<ActionResult<CashInItem[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('cash_in_items')
      .select('*')
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)
      .eq('is_active', true)
      .order('sort_order')
      .order('created_at')

    if (error) {
      console.error('[CashBurn] Failed to fetch cash in items:', error)
      return { data: null, error: 'Failed to load income items' }
    }

    return { data: (data ?? []).map(mapCashInItem), error: null }
  } catch (err) {
    console.error('[CashBurn] Failed to fetch cash in items:', err)
    return { data: null, error: 'Failed to load income items' }
  }
}

export async function createCashInItem(
  input: CreateCashInInput
): Promise<ActionResult<CashInItem>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('cash_in_items')
      .insert({
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
        product_id: input.product_id ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[CashBurn] Failed to create cash in item:', error)
      return { data: null, error: 'Failed to create income item' }
    }

    revalidatePath('/cash-burn')
    revalidatePath('/cash-burn/cash-in')
    return { data: mapCashInItem(data), error: null }
  } catch (err) {
    console.error('[CashBurn] Failed to create cash in item:', err)
    return { data: null, error: 'Failed to create income item' }
  }
}

export async function updateCashInItem(
  id: string,
  input: Partial<CreateCashInInput>
): Promise<ActionResult<CashInItem>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {}
    if (input.name !== undefined) updates.name = input.name
    if (input.source_type !== undefined) updates.source_type = input.source_type
    if (input.amount !== undefined) updates.amount = input.amount
    if (input.frequency !== undefined) updates.frequency = input.frequency
    if (input.probability_pct !== undefined) updates.probability_pct = input.probability_pct
    if (input.effective_from !== undefined) updates.effective_from = input.effective_from
    if (input.effective_to !== undefined) updates.effective_to = input.effective_to || null
    if (input.notes !== undefined) updates.notes = input.notes || null
    if (input.product_id !== undefined) updates.product_id = input.product_id || null

    const { data, error } = await supabase
      .from('cash_in_items')
      .update(updates)
      .eq('id', id)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)
      .select()
      .single()

    if (error) {
      console.error('[CashBurn] Failed to update cash in item:', error)
      return { data: null, error: 'Failed to update income item' }
    }

    revalidatePath('/cash-burn')
    revalidatePath('/cash-burn/cash-in')
    return { data: mapCashInItem(data), error: null }
  } catch (err) {
    console.error('[CashBurn] Failed to update cash in item:', err)
    return { data: null, error: 'Failed to update income item' }
  }
}

export async function deleteCashInItem(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { error } = await supabase
      .from('cash_in_items')
      .update({ is_active: false })
      .eq('id', id)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)

    if (error) {
      console.error('[CashBurn] Failed to delete cash in item:', error)
      return { data: null, error: 'Failed to delete income item' }
    }

    revalidatePath('/cash-burn')
    revalidatePath('/cash-burn/cash-in')
    return { data: null, error: null }
  } catch (err) {
    console.error('[CashBurn] Failed to delete cash in item:', err)
    return { data: null, error: 'Failed to delete income item' }
  }
}

// ============================================================
// Mapper
// ============================================================

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
