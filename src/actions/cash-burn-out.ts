'use server'

/**
 * @file cash-burn-out.ts — Server actions for cash out (cost) items
 *
 * @description CRUD for fixed and variable cost items used in burn modelling.
 * @security All queries filter by foundry_id via getFoundryIdCached().
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { revalidatePath } from 'next/cache'
import type {
  ActionResult,
  CashOutItem,
  CreateCashOutInput,
  Frequency,
  CostType,
  PnlCategory,
} from '@/types/cash-burn'
import { normaliseToWeeklyPence } from '@/lib/cash-burn/weekly-projection'

// ============================================================
// Wizard profile type (lightweight for client)
// ============================================================

export interface WizardProfile {
  id: string
  fullName: string
  role: string
}

// ============================================================
// Fetch human team members for wizard salary rows
// ============================================================

export async function getFoundryHumanProfiles(): Promise<ActionResult<WizardProfile[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('foundry_id', foundryId)
      .in('role', ['Founder', 'Executive', 'Apprentice'])
      .eq('is_active', true)
      .order('role')
      .order('full_name')

    if (error) {
      console.error('[CashBurn] Failed to fetch human profiles:', error)
      return { data: null, error: 'Failed to load team profiles' }
    }

    return {
      data: (data ?? []).map(p => ({
        id: p.id,
        fullName: p.full_name ?? 'Team Member',
        role: p.role,
      })),
      error: null,
    }
  } catch (err) {
    console.error('[CashBurn] Failed to fetch human profiles:', err)
    return { data: null, error: 'Failed to load team profiles' }
  }
}

// ============================================================
// Default pnl_category by expense category
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
// CRUD
// ============================================================

export async function getCashOutItems(): Promise<ActionResult<CashOutItem[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('cash_out_items')
      .select('*')
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)
      .eq('is_active', true)
      .order('sort_order')
      .order('created_at')

    if (error) {
      console.error('[CashBurn] Failed to fetch cash out items:', error)
      return { data: null, error: 'Failed to load cost items' }
    }

    return { data: (data ?? []).map(mapCashOutItem), error: null }
  } catch (err) {
    console.error('[CashBurn] Failed to fetch cash out items:', err)
    return { data: null, error: 'Failed to load cost items' }
  }
}

export async function createCashOutItem(
  input: CreateCashOutInput
): Promise<ActionResult<CashOutItem>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const pnlCategory = input.pnl_category ?? getDefaultPnlCategory(input.category)

    const { data, error } = await supabase
      .from('cash_out_items')
      .insert({
        foundry_id: foundryId,
        created_by: user.id,
        name: input.name,
        category: input.category,
        cost_type: input.cost_type,
        pnl_category: pnlCategory,
        amount: input.amount,
        frequency: input.frequency,
        effective_from: input.effective_from,
        effective_to: input.effective_to ?? null,
        notes: input.notes ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[CashBurn] Failed to create cash out item:', error)
      return { data: null, error: 'Failed to create cost item' }
    }

    revalidatePath('/cash-burn')
    revalidatePath('/cash-burn/cash-out')
    return { data: mapCashOutItem(data), error: null }
  } catch (err) {
    console.error('[CashBurn] Failed to create cash out item:', err)
    return { data: null, error: 'Failed to create cost item' }
  }
}

export async function updateCashOutItem(
  id: string,
  input: Partial<CreateCashOutInput>
): Promise<ActionResult<CashOutItem>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {}
    if (input.name !== undefined) updates.name = input.name
    if (input.category !== undefined) updates.category = input.category
    if (input.cost_type !== undefined) updates.cost_type = input.cost_type
    if (input.pnl_category !== undefined) updates.pnl_category = input.pnl_category
    if (input.amount !== undefined) updates.amount = input.amount
    if (input.frequency !== undefined) updates.frequency = input.frequency
    if (input.effective_from !== undefined) updates.effective_from = input.effective_from
    if (input.effective_to !== undefined) updates.effective_to = input.effective_to || null
    if (input.notes !== undefined) updates.notes = input.notes || null

    const { data, error } = await supabase
      .from('cash_out_items')
      .update(updates)
      .eq('id', id)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)
      .select()
      .single()

    if (error) {
      console.error('[CashBurn] Failed to update cash out item:', error)
      return { data: null, error: 'Failed to update cost item' }
    }

    revalidatePath('/cash-burn')
    revalidatePath('/cash-burn/cash-out')
    return { data: mapCashOutItem(data), error: null }
  } catch (err) {
    console.error('[CashBurn] Failed to update cash out item:', err)
    return { data: null, error: 'Failed to update cost item' }
  }
}

export async function deleteCashOutItem(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { error } = await supabase
      .from('cash_out_items')
      .update({ is_active: false })
      .eq('id', id)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)

    if (error) {
      console.error('[CashBurn] Failed to delete cash out item:', error)
      return { data: null, error: 'Failed to delete cost item' }
    }

    revalidatePath('/cash-burn')
    revalidatePath('/cash-burn/cash-out')
    return { data: null, error: null }
  } catch (err) {
    console.error('[CashBurn] Failed to delete cash out item:', err)
    return { data: null, error: 'Failed to delete cost item' }
  }
}

// ============================================================
// Mapper
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
    sortOrder: row.sort_order ?? 0,
    isActive: row.is_active,
    weeklyAmount,
  }
}
