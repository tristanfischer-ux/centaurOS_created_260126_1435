'use server'

/**
 * @file finance-budgets.ts — Server actions for budget tracking
 *
 * @description CRUD for budgets and budget-vs-actual comparison.
 * Actuals are computed from money_map_cost_items at query time.
 *
 * @security All queries filter by foundry_id via getFoundryIdCached().
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { revalidatePath } from 'next/cache'
import type { FinanceActionResult } from '@/types/finance'

// ============================================================
// Types
// ============================================================

export type BudgetCategory = 'personnel' | 'infrastructure' | 'marketing' | 'operations' | 'materials' | 'production' | 'other'

export type BudgetPeriod = 'monthly' | 'quarterly' | 'annual'

export interface Budget {
  id: string
  foundryId: string
  name: string
  category: BudgetCategory
  period: BudgetPeriod
  amount: number
  currency: string
  startDate: string
  endDate: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface BudgetVsActual {
  budget: Budget
  actual: number       // actual spend in pence (from cost items)
  variance: number     // budget - actual (positive = under budget)
  variancePct: number  // variance as % of budget
}

export interface CreateBudgetInput {
  name: string
  category: BudgetCategory
  period: BudgetPeriod
  amount: number // in pence
  startDate: string
  endDate?: string
}

// ============================================================
// CRUD
// ============================================================

/**
 * Create a new budget.
 */
export async function createBudget(
  input: CreateBudgetInput
): Promise<FinanceActionResult<Budget>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('finance_budgets')
      .insert({
        foundry_id: foundryId,
        created_by: user.id,
        name: input.name,
        category: input.category,
        period: input.period,
        amount: input.amount,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[Finance] Failed to create budget:', error)
      return { data: null, error: 'Failed to create budget' }
    }

    revalidatePath('/finance/budgets')
    return { data: mapBudget(data), error: null }
  } catch (err) {
    console.error('[Finance] Failed to create budget:', err)
    return { data: null, error: 'Failed to create budget' }
  }
}

/**
 * Get all budgets with actual spend comparison.
 */
export async function getBudgetsVsActual(): Promise<FinanceActionResult<BudgetVsActual[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Parallel fetches: budgets + cost items
    const [budgetsResult, costsResult] = await Promise.all([
      supabase
        .from('finance_budgets')
        .select('*')
        .eq('foundry_id', foundryId)
        .eq('created_by', user.id)
        .eq('is_active', true)
        .order('category'),

      supabase
        .from('money_map_cost_items')
        .select('amount, period, category, is_active')
        .eq('foundry_id', foundryId)
        .eq('is_active', true),
    ])

    if (budgetsResult.error) {
      console.error('[Finance] Failed to fetch budgets:', budgetsResult.error)
      return { data: null, error: 'Failed to load budgets' }
    }

    // Compute actual spend per category (normalised to monthly pence)
    const actualByCategory: Record<string, number> = {}
    for (const cost of (costsResult.data ?? [])) {
      const cat = cost.category ?? 'other'
      const monthlyPence = normaliseToMonthlyPence(Number(cost.amount), cost.period ?? 'monthly')
      actualByCategory[cat] = (actualByCategory[cat] ?? 0) + monthlyPence
    }

    const results: BudgetVsActual[] = (budgetsResult.data ?? []).map(row => {
      const budget = mapBudget(row)
      // Normalise budget to monthly for comparison
      const monthlyBudget = normaliseToMonthlyPence(budget.amount, budget.period)
      const actual = actualByCategory[budget.category] ?? 0
      const variance = monthlyBudget - actual
      const variancePct = monthlyBudget > 0 ? Math.round((variance / monthlyBudget) * 100) : 0

      return { budget, actual, variance, variancePct }
    })

    return { data: results, error: null }
  } catch (err) {
    console.error('[Finance] Failed to get budgets vs actual:', err)
    return { data: null, error: 'Failed to load budgets' }
  }
}

/**
 * Deactivate a budget.
 */
export async function deactivateBudget(
  budgetId: string
): Promise<FinanceActionResult<null>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { error } = await supabase
      .from('finance_budgets')
      .update({ is_active: false })
      .eq('id', budgetId)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)

    if (error) {
      console.error('[Finance] Failed to deactivate budget:', error)
      return { data: null, error: 'Failed to deactivate budget' }
    }

    revalidatePath('/finance/budgets')
    return { data: null, error: null }
  } catch (err) {
    console.error('[Finance] Failed to deactivate budget:', err)
    return { data: null, error: 'Failed to deactivate budget' }
  }
}

// ============================================================
// Helpers
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBudget(row: any): Budget {
  return {
    id: row.id,
    foundryId: row.foundry_id,
    name: row.name,
    category: row.category,
    period: row.period,
    amount: row.amount,
    currency: row.currency ?? 'GBP',
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normaliseToMonthlyPence(amount: number, period: string): number {
  switch (period) {
    case 'annual': return Math.round(amount / 12)
    case 'quarterly': return Math.round(amount / 3)
    default: return amount
  }
}
