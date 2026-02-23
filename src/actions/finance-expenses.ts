'use server'

/**
 * @file finance-expenses.ts — Server actions for expense tracking
 *
 * @description CRUD for expenses with filtering and approval workflow.
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

export type ExpenseCategory =
  | 'personnel'
  | 'infrastructure'
  | 'marketing'
  | 'operations'
  | 'materials'
  | 'production'
  | 'travel'
  | 'office'
  | 'other'

export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'paid'

export interface Expense {
  id: string
  foundryId: string
  createdBy: string
  amount: number
  currency: string
  category: ExpenseCategory
  description: string
  vendor: string | null
  expenseDate: string
  receiptUrl: string | null
  status: ExpenseStatus
  approvedBy: string | null
  approvedAt: string | null
  projectId: string | null
  mileageKm: number | null
  createdAt: string
  updatedAt: string
}

export interface CreateExpenseInput {
  amount: number // in pence
  category: ExpenseCategory
  description: string
  vendor?: string
  expenseDate: string
  projectId?: string
  mileageKm?: number
}

export interface ExpenseFilters {
  status?: ExpenseStatus
  category?: ExpenseCategory
  fromDate?: string
  toDate?: string
}

// ============================================================
// CRUD
// ============================================================

/**
 * Create a new expense.
 */
export async function createExpense(
  input: CreateExpenseInput
): Promise<FinanceActionResult<Expense>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('finance_expenses')
      .insert({
        foundry_id: foundryId,
        created_by: user.id,
        amount: input.amount,
        category: input.category,
        description: input.description,
        vendor: input.vendor ?? null,
        expense_date: input.expenseDate,
        project_id: input.projectId ?? null,
        mileage_km: input.mileageKm ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[Finance] Failed to create expense:', error)
      return { data: null, error: 'Failed to create expense' }
    }

    revalidatePath('/finance/expenses')
    return { data: mapExpense(data), error: null }
  } catch (err) {
    console.error('[Finance] Failed to create expense:', err)
    return { data: null, error: 'Failed to create expense' }
  }
}

/**
 * Get all expenses with optional filters.
 */
export async function getExpenses(
  filters?: ExpenseFilters
): Promise<FinanceActionResult<Expense[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    let query = supabase
      .from('finance_expenses')
      .select('*')
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)
      .order('expense_date', { ascending: false })

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }
    if (filters?.category) {
      query = query.eq('category', filters.category)
    }
    if (filters?.fromDate) {
      query = query.gte('expense_date', filters.fromDate)
    }
    if (filters?.toDate) {
      query = query.lte('expense_date', filters.toDate)
    }

    const { data, error } = await query

    if (error) {
      console.error('[Finance] Failed to fetch expenses:', error)
      return { data: null, error: 'Failed to load expenses' }
    }

    return { data: (data ?? []).map(mapExpense), error: null }
  } catch (err) {
    console.error('[Finance] Failed to get expenses:', err)
    return { data: null, error: 'Failed to load expenses' }
  }
}

/**
 * Update expense status (approve/reject/mark paid).
 */
export async function updateExpenseStatus(
  expenseId: string,
  status: ExpenseStatus
): Promise<FinanceActionResult<null>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const updateData: Record<string, unknown> = { status }
    if (status === 'approved') {
      updateData.approved_by = user.id
      updateData.approved_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('finance_expenses')
      .update(updateData)
      .eq('id', expenseId)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)

    if (error) {
      console.error('[Finance] Failed to update expense:', error)
      return { data: null, error: 'Failed to update expense' }
    }

    revalidatePath('/finance/expenses')
    return { data: null, error: null }
  } catch (err) {
    console.error('[Finance] Failed to update expense:', err)
    return { data: null, error: 'Failed to update expense' }
  }
}

/**
 * Delete an expense.
 */
export async function deleteExpense(
  expenseId: string
): Promise<FinanceActionResult<null>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { error } = await supabase
      .from('finance_expenses')
      .delete()
      .eq('id', expenseId)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)

    if (error) {
      console.error('[Finance] Failed to delete expense:', error)
      return { data: null, error: 'Failed to delete expense' }
    }

    revalidatePath('/finance/expenses')
    return { data: null, error: null }
  } catch (err) {
    console.error('[Finance] Failed to delete expense:', err)
    return { data: null, error: 'Failed to delete expense' }
  }
}

// ============================================================
// Helpers
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapExpense(row: any): Expense {
  return {
    id: row.id,
    foundryId: row.foundry_id,
    createdBy: row.created_by,
    amount: Number(row.amount),
    currency: row.currency ?? 'GBP',
    category: row.category,
    description: row.description,
    vendor: row.vendor,
    expenseDate: row.expense_date,
    receiptUrl: row.receipt_url,
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    projectId: row.project_id,
    mileageKm: row.mileage_km ? Number(row.mileage_km) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
