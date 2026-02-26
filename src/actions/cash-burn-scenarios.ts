'use server'

/**
 * @file cash-burn-scenarios.ts — Server actions for burn scenarios
 *
 * @description CRUD for named burn scenarios + composite fetcher for the main page.
 * @security All queries filter by foundry_id via getFoundryIdCached().
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { revalidatePath } from 'next/cache'
import type {
  ActionResult,
  BurnScenario,
  CashOutItem,
  CashInItem,
  CreateScenarioInput,
} from '@/types/cash-burn'
import { getCashOutItems } from './cash-burn-out'
import { getCashInItems } from './cash-burn-in'

// ============================================================
// CRUD
// ============================================================

export async function getScenarios(): Promise<ActionResult<BurnScenario[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('burn_scenarios')
      .select('*')
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)
      .order('sort_order')
      .order('created_at')

    if (error) {
      console.error('[CashBurn] Failed to fetch scenarios:', error)
      return { data: null, error: 'Failed to load scenarios' }
    }

    return { data: (data ?? []).map(mapScenario), error: null }
  } catch (err) {
    console.error('[CashBurn] Failed to fetch scenarios:', err)
    return { data: null, error: 'Failed to load scenarios' }
  }
}

/**
 * Seed default scenarios (Base Case, Optimistic, Pessimistic) if none exist.
 */
export async function ensureDefaultScenarios(): Promise<ActionResult<BurnScenario[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Check if scenarios already exist
    const { count } = await supabase
      .from('burn_scenarios')
      .select('id', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)

    if (count && count > 0) {
      // Already seeded — just fetch
      return getScenarios()
    }

    const defaults = [
      { name: 'Base Case', opening_balance: 0, revenue_delay_weeks: 0, cost_delay_weeks: 0, revenue_growth_pct: 0, is_default: true, sort_order: 0 },
      { name: 'Optimistic', opening_balance: 0, revenue_delay_weeks: 0, cost_delay_weeks: 0, revenue_growth_pct: 20, is_default: false, sort_order: 1 },
      { name: 'Pessimistic', opening_balance: 0, revenue_delay_weeks: 4, cost_delay_weeks: 0, revenue_growth_pct: -20, is_default: false, sort_order: 2 },
    ]

    const { data, error } = await supabase
      .from('burn_scenarios')
      .insert(defaults.map(d => ({
        ...d,
        foundry_id: foundryId,
        created_by: user.id,
      })))
      .select()

    if (error) {
      console.error('[CashBurn] Failed to seed default scenarios:', error)
      return { data: null, error: 'Failed to create default scenarios' }
    }

    return { data: (data ?? []).map(mapScenario), error: null }
  } catch (err) {
    console.error('[CashBurn] Failed to seed default scenarios:', err)
    return { data: null, error: 'Failed to create default scenarios' }
  }
}

/**
 * Get the default (Base Case) scenario, seeding defaults if none exist.
 */
export async function getDefaultScenario(): Promise<ActionResult<BurnScenario>> {
  try {
    const result = await ensureDefaultScenarios()
    if (result.error) return { data: null, error: result.error }

    const defaultScenario = (result.data ?? []).find(s => s.isDefault)
    if (!defaultScenario) return { data: null, error: 'No default scenario found' }

    return { data: defaultScenario, error: null }
  } catch (err) {
    console.error('[CashBurn] Failed to get default scenario:', err)
    return { data: null, error: 'Failed to load default scenario' }
  }
}

/**
 * Update the opening balance on a scenario. Thin wrapper for the Cash In page.
 * @param scenarioId - The scenario UUID
 * @param balancePence - Opening balance in pence
 */
export async function updateOpeningBalance(
  scenarioId: string,
  balancePence: number
): Promise<ActionResult<BurnScenario>> {
  return updateScenario(scenarioId, { opening_balance: balancePence })
}

export async function createScenario(
  input: CreateScenarioInput
): Promise<ActionResult<BurnScenario>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('burn_scenarios')
      .insert({
        foundry_id: foundryId,
        created_by: user.id,
        name: input.name,
        opening_balance: input.opening_balance,
        revenue_delay_weeks: input.revenue_delay_weeks ?? 0,
        cost_delay_weeks: input.cost_delay_weeks ?? 0,
        revenue_growth_pct: input.revenue_growth_pct ?? 0,
      })
      .select()
      .single()

    if (error) {
      console.error('[CashBurn] Failed to create scenario:', error)
      return { data: null, error: 'Failed to create scenario' }
    }

    revalidatePath('/cash-burn')
    return { data: mapScenario(data), error: null }
  } catch (err) {
    console.error('[CashBurn] Failed to create scenario:', err)
    return { data: null, error: 'Failed to create scenario' }
  }
}

export async function updateScenario(
  id: string,
  input: Partial<CreateScenarioInput>
): Promise<ActionResult<BurnScenario>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {}
    if (input.name !== undefined) updates.name = input.name
    if (input.opening_balance !== undefined) updates.opening_balance = input.opening_balance
    if (input.revenue_delay_weeks !== undefined) updates.revenue_delay_weeks = input.revenue_delay_weeks
    if (input.cost_delay_weeks !== undefined) updates.cost_delay_weeks = input.cost_delay_weeks
    if (input.revenue_growth_pct !== undefined) updates.revenue_growth_pct = input.revenue_growth_pct

    const { data, error } = await supabase
      .from('burn_scenarios')
      .update(updates)
      .eq('id', id)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)
      .select()
      .single()

    if (error) {
      console.error('[CashBurn] Failed to update scenario:', error)
      return { data: null, error: 'Failed to update scenario' }
    }

    revalidatePath('/cash-burn')
    return { data: mapScenario(data), error: null }
  } catch (err) {
    console.error('[CashBurn] Failed to update scenario:', err)
    return { data: null, error: 'Failed to update scenario' }
  }
}

export async function deleteScenario(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { error } = await supabase
      .from('burn_scenarios')
      .delete()
      .eq('id', id)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)

    if (error) {
      console.error('[CashBurn] Failed to delete scenario:', error)
      return { data: null, error: 'Failed to delete scenario' }
    }

    revalidatePath('/cash-burn')
    return { data: null, error: null }
  } catch (err) {
    console.error('[CashBurn] Failed to delete scenario:', err)
    return { data: null, error: 'Failed to delete scenario' }
  }
}

// ============================================================
// Composite fetcher for the main burn page
// ============================================================

export async function getBurnPageData(): Promise<ActionResult<{
  cashOut: CashOutItem[]
  cashIn: CashInItem[]
  scenarios: BurnScenario[]
}>> {
  try {
    // Ensure defaults exist, then fetch all in parallel
    const [cashOutResult, cashInResult, scenariosResult] = await Promise.all([
      getCashOutItems(),
      getCashInItems(),
      ensureDefaultScenarios(),
    ])

    if (cashOutResult.error) return { data: null, error: cashOutResult.error }
    if (cashInResult.error) return { data: null, error: cashInResult.error }
    if (scenariosResult.error) return { data: null, error: scenariosResult.error }

    return {
      data: {
        cashOut: cashOutResult.data ?? [],
        cashIn: cashInResult.data ?? [],
        scenarios: scenariosResult.data ?? [],
      },
      error: null,
    }
  } catch (err) {
    console.error('[CashBurn] Failed to fetch burn page data:', err)
    return { data: null, error: 'Failed to load burn data' }
  }
}

// ============================================================
// Mapper
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapScenario(row: any): BurnScenario {
  return {
    id: row.id,
    name: row.name,
    openingBalance: Number(row.opening_balance),
    revenueDelayWeeks: row.revenue_delay_weeks,
    costDelayWeeks: row.cost_delay_weeks,
    revenueGrowthPct: Number(row.revenue_growth_pct),
    isDefault: row.is_default,
    sortOrder: row.sort_order ?? 0,
  }
}
