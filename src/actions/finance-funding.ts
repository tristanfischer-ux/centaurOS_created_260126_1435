'use server'

/**
 * @file finance-funding.ts — Server actions for funding pipeline tracking
 *
 * @description CRUD for funding opportunities with stage management.
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

export type FundingType = 'grant' | 'investment' | 'r_and_d_tax_credit' | 'loan' | 'other'

export type FundingStage = 'researching' | 'applying' | 'submitted' | 'interview' | 'offered' | 'won' | 'lost'

export interface FundingOpportunity {
  id: string
  foundryId: string
  createdBy: string
  name: string
  type: FundingType
  stage: FundingStage
  amount: number | null
  currency: string
  funderName: string | null
  deadline: string | null
  appliedDate: string | null
  decisionDate: string | null
  probabilityPct: number | null
  notes: string | null
  url: string | null
  equityPct: number | null
  createdAt: string
  updatedAt: string
}

export interface CreateFundingInput {
  name: string
  type: FundingType
  amount?: number // in pence
  funderName?: string
  deadline?: string
  probabilityPct?: number
  notes?: string
  url?: string
  equityPct?: number
}

// ============================================================
// CRUD
// ============================================================

/**
 * Create a new funding opportunity.
 */
export async function createFundingOpportunity(
  input: CreateFundingInput
): Promise<FinanceActionResult<FundingOpportunity>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('finance_funding_opportunities')
      .insert({
        foundry_id: foundryId,
        created_by: user.id,
        name: input.name,
        type: input.type,
        amount: input.amount ?? null,
        funder_name: input.funderName ?? null,
        deadline: input.deadline ?? null,
        probability_pct: input.probabilityPct ?? null,
        notes: input.notes ?? null,
        url: input.url ?? null,
        equity_pct: input.equityPct ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[Finance] Failed to create funding opportunity:', error)
      return { data: null, error: 'Failed to create funding opportunity' }
    }

    revalidatePath('/finance/funding')
    return { data: mapFunding(data), error: null }
  } catch (err) {
    console.error('[Finance] Failed to create funding opportunity:', err)
    return { data: null, error: 'Failed to create funding opportunity' }
  }
}

/**
 * Update an existing funding opportunity.
 */
export async function updateFundingOpportunity(input: {
  opportunityId: string
  name: string
  type: FundingType
  amount?: number
  funderName?: string
  deadline?: string
  notes?: string
  url?: string
}): Promise<FinanceActionResult<FundingOpportunity>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('finance_funding_opportunities')
      .update({
        name: input.name,
        type: input.type,
        amount: input.amount ?? null,
        funder_name: input.funderName ?? null,
        deadline: input.deadline ?? null,
        notes: input.notes ?? null,
        url: input.url ?? null,
      })
      .eq('id', input.opportunityId)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)
      .select()
      .single()

    if (error) {
      console.error('[Finance] Failed to update funding opportunity:', error)
      return { data: null, error: 'Failed to update funding opportunity' }
    }

    revalidatePath('/finance/funding')
    return { data: mapFunding(data), error: null }
  } catch (err) {
    console.error('[Finance] Failed to update funding opportunity:', err)
    return { data: null, error: 'Failed to update funding opportunity' }
  }
}

/**
 * Get all funding opportunities.
 */
export async function getFundingOpportunities(): Promise<FinanceActionResult<FundingOpportunity[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('finance_funding_opportunities')
      .select('*')
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[Finance] Failed to fetch funding:', error)
      return { data: null, error: 'Failed to load funding opportunities' }
    }

    return { data: (data ?? []).map(mapFunding), error: null }
  } catch (err) {
    console.error('[Finance] Failed to get funding:', err)
    return { data: null, error: 'Failed to load funding opportunities' }
  }
}

/**
 * Move a funding opportunity to a new stage.
 */
export async function moveFundingStage(
  opportunityId: string,
  stage: FundingStage
): Promise<FinanceActionResult<null>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const updateData: Record<string, unknown> = { stage }
    if (stage === 'submitted' || stage === 'applying') {
      updateData.applied_date = new Date().toISOString().split('T')[0]
    }

    const { error } = await supabase
      .from('finance_funding_opportunities')
      .update(updateData)
      .eq('id', opportunityId)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)

    if (error) {
      console.error('[Finance] Failed to move funding stage:', error)
      return { data: null, error: 'Failed to update stage' }
    }

    revalidatePath('/finance/funding')
    return { data: null, error: null }
  } catch (err) {
    console.error('[Finance] Failed to move funding stage:', err)
    return { data: null, error: 'Failed to update stage' }
  }
}

/**
 * Delete a funding opportunity.
 */
export async function deleteFundingOpportunity(
  opportunityId: string
): Promise<FinanceActionResult<null>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { error } = await supabase
      .from('finance_funding_opportunities')
      .delete()
      .eq('id', opportunityId)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)

    if (error) {
      console.error('[Finance] Failed to delete funding opportunity:', error)
      return { data: null, error: 'Failed to delete opportunity' }
    }

    revalidatePath('/finance/funding')
    return { data: null, error: null }
  } catch (err) {
    console.error('[Finance] Failed to delete funding opportunity:', err)
    return { data: null, error: 'Failed to delete opportunity' }
  }
}

// ============================================================
// Helpers
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFunding(row: any): FundingOpportunity {
  return {
    id: row.id,
    foundryId: row.foundry_id,
    createdBy: row.created_by,
    name: row.name,
    type: row.type,
    stage: row.stage,
    amount: row.amount ? Number(row.amount) : null,
    currency: row.currency ?? 'GBP',
    funderName: row.funder_name,
    deadline: row.deadline,
    appliedDate: row.applied_date,
    decisionDate: row.decision_date,
    probabilityPct: row.probability_pct,
    notes: row.notes,
    url: row.url,
    equityPct: row.equity_pct ? Number(row.equity_pct) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
