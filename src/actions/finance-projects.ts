'use server'

/**
 * @file finance-projects.ts — Server actions for project-level P&L tracking
 *
 * @description CRUD for finance projects and their transactions.
 * Computes per-project revenue, expenses, and margin.
 *
 * @security All queries filter by foundry_id via getFoundryIdCached().
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { revalidatePath } from 'next/cache'
import type {
  FinanceActionResult,
  FinanceProject,
  ProjectPnL,
  ProjectTransaction,
  CreateProjectInput,
  AddProjectTransactionInput,
} from '@/types/finance'

// ============================================================
// Projects CRUD
// ============================================================

/**
 * Create a new finance project.
 */
export async function createProject(
  input: CreateProjectInput
): Promise<FinanceActionResult<FinanceProject>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('finance_projects')
      .insert({
        foundry_id: foundryId,
        created_by: user.id,
        name: input.name,
        client_name: input.clientName ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[Finance] Failed to create project:', error)
      return { data: null, error: 'Failed to create project' }
    }

    revalidatePath('/finance/projects')
    return { data: mapProject(data), error: null }
  } catch (err) {
    console.error('[Finance] Failed to create project:', err)
    return { data: null, error: 'Failed to create project' }
  }
}

/**
 * Get all projects with P&L summaries.
 */
export async function getProjectsWithPnL(): Promise<FinanceActionResult<ProjectPnL[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Fetch projects
    const { data: projects, error: projectsError } = await supabase
      .from('finance_projects')
      .select('*')
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })

    if (projectsError) {
      console.error('[Finance] Failed to fetch projects:', projectsError)
      return { data: null, error: 'Failed to load projects' }
    }

    if (!projects || projects.length === 0) {
      return { data: [], error: null }
    }

    // Fetch manual transactions + linked expenses for all projects in parallel
    const projectIds = projects.map(p => p.id)
    const [{ data: transactions }, { data: linkedExpenses }] = await Promise.all([
      supabase
        .from('finance_project_transactions')
        .select('project_id, amount, is_revenue')
        .in('project_id', projectIds),
      supabase
        .from('finance_expenses')
        .select('project_id, amount')
        .in('project_id', projectIds)
        .in('status', ['approved', 'paid']),
    ])

    // Group all cost entries by project
    const txByProject: Record<string, Array<{ amount: number; is_revenue: boolean }>> = {}
    for (const tx of (transactions ?? [])) {
      const pid = tx.project_id
      if (!txByProject[pid]) txByProject[pid] = []
      txByProject[pid].push({ amount: Number(tx.amount), is_revenue: tx.is_revenue ?? false })
    }
    // Linked expenses are always costs (is_revenue: false)
    for (const exp of (linkedExpenses ?? [])) {
      const pid = exp.project_id
      if (!pid) continue
      if (!txByProject[pid]) txByProject[pid] = []
      txByProject[pid].push({ amount: Number(exp.amount), is_revenue: false })
    }

    const results: ProjectPnL[] = projects.map(row => {
      const project = mapProject(row)
      const txs = txByProject[project.id] ?? []
      const totalRevenue = txs.filter(t => t.is_revenue).reduce((sum, t) => sum + t.amount, 0)
      const totalExpenses = txs.filter(t => !t.is_revenue).reduce((sum, t) => sum + t.amount, 0)
      const netProfit = totalRevenue - totalExpenses
      const marginPct = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0

      return {
        project,
        totalRevenue,
        totalExpenses,
        netProfit,
        marginPct,
        transactionCount: txs.length,
      }
    })

    return { data: results, error: null }
  } catch (err) {
    console.error('[Finance] Failed to get projects with P&L:', err)
    return { data: null, error: 'Failed to load projects' }
  }
}

/**
 * Get a single project with full transaction history.
 */
export async function getProjectDetail(
  projectId: string
): Promise<FinanceActionResult<{ project: FinanceProject; transactions: ProjectTransaction[] }>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [projectResult, txResult, linkedExpensesResult] = await Promise.all([
      supabase
        .from('finance_projects')
        .select('*')
        .eq('id', projectId)
        .eq('foundry_id', foundryId)
        .eq('created_by', user.id)
        .single(),
      supabase
        .from('finance_project_transactions')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      // INTENT: Auto-load expenses that have been linked to this project via project_id.
      // Previously the project_id FK existed on finance_expenses but was never read here,
      // so project costs were always understated for anyone using the expense module.
      supabase
        .from('finance_expenses')
        .select('id, description, amount, category, expense_date, status')
        .eq('project_id', projectId)
        .in('status', ['approved', 'paid'])
        .order('expense_date', { ascending: false }),
    ])

    if (projectResult.error) {
      console.error('[Finance] Failed to fetch project:', projectResult.error)
      return { data: null, error: 'Project not found' }
    }

    // Map linked expenses to ProjectTransaction shape for unified display
    const linkedExpenses: ProjectTransaction[] = (linkedExpensesResult.data ?? []).map(e => ({
      id: e.id,
      projectId,
      transactionType: 'expense' as const,
      referenceId: null,
      description: e.description ?? `${e.category ?? 'Expense'}`,
      amount: Number(e.amount),
      isRevenue: false,
      createdAt: e.expense_date ?? new Date().toISOString(),
    }))

    // Merge manual transactions + linked expenses, sorted by date descending
    const allTransactions = [...(txResult.data ?? []).map(mapTransaction), ...linkedExpenses]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return {
      data: {
        project: mapProject(projectResult.data),
        transactions: allTransactions,
      },
      error: null,
    }
  } catch (err) {
    console.error('[Finance] Failed to get project detail:', err)
    return { data: null, error: 'Failed to load project' }
  }
}

/**
 * Add a transaction to a project.
 */
export async function addProjectTransaction(
  input: AddProjectTransactionInput
): Promise<FinanceActionResult<ProjectTransaction>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Verify project ownership
    const { data: project } = await supabase
      .from('finance_projects')
      .select('id')
      .eq('id', input.projectId)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)
      .single()

    if (!project) return { data: null, error: 'Project not found' }

    const { data, error } = await supabase
      .from('finance_project_transactions')
      .insert({
        project_id: input.projectId,
        transaction_type: input.transactionType,
        description: input.description,
        amount: input.amount,
        is_revenue: input.isRevenue,
        reference_id: input.referenceId ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[Finance] Failed to add transaction:', error)
      return { data: null, error: 'Failed to add transaction' }
    }

    revalidatePath(`/finance/projects/${input.projectId}`)
    revalidatePath('/finance/projects')
    return { data: mapTransaction(data), error: null }
  } catch (err) {
    console.error('[Finance] Failed to add transaction:', err)
    return { data: null, error: 'Failed to add transaction' }
  }
}

/**
 * Update project status.
 */
export async function updateProjectStatus(
  projectId: string,
  status: string
): Promise<FinanceActionResult<null>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { error } = await supabase
      .from('finance_projects')
      .update({ status })
      .eq('id', projectId)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)

    if (error) {
      console.error('[Finance] Failed to update project status:', error)
      return { data: null, error: 'Failed to update project' }
    }

    revalidatePath('/finance/projects')
    revalidatePath(`/finance/projects/${projectId}`)
    return { data: null, error: null }
  } catch (err) {
    console.error('[Finance] Failed to update project status:', err)
    return { data: null, error: 'Failed to update project' }
  }
}

// ============================================================
// Helpers
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProject(row: any): FinanceProject {
  return {
    id: row.id,
    foundryId: row.foundry_id,
    createdBy: row.created_by,
    name: row.name,
    clientName: row.client_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTransaction(row: any): ProjectTransaction {
  return {
    id: row.id,
    projectId: row.project_id,
    transactionType: row.transaction_type,
    referenceId: row.reference_id,
    description: row.description,
    amount: Number(row.amount),
    isRevenue: row.is_revenue,
    createdAt: row.created_at,
  }
}
