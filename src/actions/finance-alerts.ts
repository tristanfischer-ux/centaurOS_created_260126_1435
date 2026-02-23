'use server'

/**
 * @file finance-alerts.ts — Server actions for financial alert preferences
 *
 * @description CRUD operations for finance alert preferences, plus threshold
 * evaluation functions used by the cron job.
 *
 * @security All queries filter by user_id via auth + foundry_id via getFoundryIdCached().
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { revalidatePath } from 'next/cache'
import type { FinanceActionResult } from '@/types/finance'

// ============================================================
// Types
// ============================================================

export type AlertType =
  | 'payment_received'
  | 'invoice_overdue'
  | 'payout_completed'
  | 'payout_failed'
  | 'budget_threshold'
  | 'cash_low'
  | 'retainer_payment_due'

export type DigestFrequency = 'daily' | 'weekly' | 'monthly' | 'none'

export interface FinanceAlertPreferences {
  id: string
  foundryId: string
  userId: string
  alertTypes: Record<AlertType, boolean>
  cashLowThreshold: number | null
  budgetThresholdPct: number
  digestFrequency: DigestFrequency
  digestDay: number
  createdAt: string
  updatedAt: string
}

export interface UpdateAlertPreferencesInput {
  alertTypes?: Partial<Record<AlertType, boolean>>
  cashLowThreshold?: number | null
  budgetThresholdPct?: number
  digestFrequency?: DigestFrequency
  digestDay?: number
}

// ============================================================
// Default preferences
// ============================================================

const DEFAULT_ALERT_TYPES: Record<AlertType, boolean> = {
  payment_received: true,
  invoice_overdue: true,
  payout_completed: true,
  payout_failed: true,
  budget_threshold: true,
  cash_low: false,
  retainer_payment_due: true,
}

// ============================================================
// CRUD
// ============================================================

/**
 * Get the current user's finance alert preferences, creating defaults if none exist.
 */
export async function getAlertPreferences(): Promise<FinanceActionResult<FinanceAlertPreferences>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Try to fetch existing preferences
    const { data, error } = await supabase
      .from('finance_alert_preferences')
      .select('*')
      .eq('foundry_id', foundryId)
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('[Finance] Failed to fetch alert preferences:', error)
      return { data: null, error: 'Failed to load preferences' }
    }

    // If no preferences exist, create defaults
    if (!data) {
      const { data: newPrefs, error: insertError } = await supabase
        .from('finance_alert_preferences')
        .insert({
          foundry_id: foundryId,
          user_id: user.id,
          alert_types: DEFAULT_ALERT_TYPES,
        })
        .select()
        .single()

      if (insertError) {
        console.error('[Finance] Failed to create alert preferences:', insertError)
        return { data: null, error: 'Failed to create preferences' }
      }

      return { data: mapPreferences(newPrefs), error: null }
    }

    return { data: mapPreferences(data), error: null }
  } catch (err) {
    console.error('[Finance] Failed to get alert preferences:', err)
    return { data: null, error: 'Failed to load preferences' }
  }
}

/**
 * Update the current user's finance alert preferences.
 */
export async function updateAlertPreferences(
  input: UpdateAlertPreferencesInput
): Promise<FinanceActionResult<FinanceAlertPreferences>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Build update object
    const updates: Record<string, unknown> = {}

    if (input.alertTypes !== undefined) {
      // Merge with existing alert types
      const { data: existing } = await supabase
        .from('finance_alert_preferences')
        .select('alert_types')
        .eq('foundry_id', foundryId)
        .eq('user_id', user.id)
        .single()

      const currentTypes = (existing?.alert_types as Record<string, boolean>) ?? DEFAULT_ALERT_TYPES
      updates.alert_types = { ...currentTypes, ...input.alertTypes }
    }

    if (input.cashLowThreshold !== undefined) {
      updates.cash_low_threshold = input.cashLowThreshold
    }

    if (input.budgetThresholdPct !== undefined) {
      updates.budget_threshold_pct = input.budgetThresholdPct
    }

    if (input.digestFrequency !== undefined) {
      updates.digest_frequency = input.digestFrequency
    }

    if (input.digestDay !== undefined) {
      updates.digest_day = input.digestDay
    }

    const { data, error } = await supabase
      .from('finance_alert_preferences')
      .update(updates)
      .eq('foundry_id', foundryId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('[Finance] Failed to update alert preferences:', error)
      return { data: null, error: 'Failed to update preferences' }
    }

    revalidatePath('/finance')
    return { data: mapPreferences(data), error: null }
  } catch (err) {
    console.error('[Finance] Failed to update alert preferences:', err)
    return { data: null, error: 'Failed to update preferences' }
  }
}

// ============================================================
// Helpers
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPreferences(row: any): FinanceAlertPreferences {
  return {
    id: row.id,
    foundryId: row.foundry_id,
    userId: row.user_id,
    alertTypes: (row.alert_types as Record<AlertType, boolean>) ?? DEFAULT_ALERT_TYPES,
    cashLowThreshold: row.cash_low_threshold,
    budgetThresholdPct: row.budget_threshold_pct ?? 80,
    digestFrequency: row.digest_frequency ?? 'weekly',
    digestDay: row.digest_day ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
