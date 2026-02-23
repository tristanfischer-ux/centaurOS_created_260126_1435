'use server'

/**
 * @file finance-integrations.ts — Server actions for accounting integrations
 *
 * @description Manages connections to external accounting providers
 * (Xero, QuickBooks, FreeAgent). Actual API clients are TODO.
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

export type IntegrationProvider = 'xero' | 'quickbooks' | 'freeagent'

export type IntegrationStatus = 'disconnected' | 'connected' | 'error' | 'syncing'

export interface AccountingIntegration {
  id: string
  foundryId: string
  provider: IntegrationProvider
  status: IntegrationStatus
  externalOrgId: string | null
  lastSyncAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SyncLogEntry {
  id: string
  integrationId: string
  direction: 'push' | 'pull'
  entityType: string
  entityCount: number
  status: 'in_progress' | 'success' | 'partial' | 'failed'
  errorMessage: string | null
  startedAt: string
  completedAt: string | null
}

// ============================================================
// Integration Management
// ============================================================

/**
 * Get all accounting integrations for the current foundry.
 */
export async function getIntegrations(): Promise<FinanceActionResult<AccountingIntegration[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('finance_integrations')
      .select('*')
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)

    if (error) {
      console.error('[Finance] Failed to fetch integrations:', error)
      return { data: null, error: 'Failed to load integrations' }
    }

    return { data: (data ?? []).map(mapIntegration), error: null }
  } catch (err) {
    console.error('[Finance] Failed to get integrations:', err)
    return { data: null, error: 'Failed to load integrations' }
  }
}

/**
 * Initialize an integration record (before OAuth flow).
 * INTENT: The actual OAuth flow will redirect to the provider's auth page
 * and handle the callback at /api/finance/integrations/[provider]/callback.
 */
export async function initializeIntegration(
  provider: IntegrationProvider
): Promise<FinanceActionResult<AccountingIntegration>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Upsert: create if not exists, update if already exists
    const { data, error } = await supabase
      .from('finance_integrations')
      .upsert(
        {
          foundry_id: foundryId,
          created_by: user.id,
          provider,
          status: 'disconnected',
        },
        { onConflict: 'foundry_id,provider' }
      )
      .select()
      .single()

    if (error) {
      console.error('[Finance] Failed to initialize integration:', error)
      return { data: null, error: 'Failed to initialize integration' }
    }

    revalidatePath('/finance/integrations')
    return { data: mapIntegration(data), error: null }
  } catch (err) {
    console.error('[Finance] Failed to initialize integration:', err)
    return { data: null, error: 'Failed to initialize integration' }
  }
}

/**
 * Disconnect an integration.
 */
export async function disconnectIntegration(
  integrationId: string
): Promise<FinanceActionResult<null>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { error } = await supabase
      .from('finance_integrations')
      .update({
        status: 'disconnected',
        access_token_encrypted: null,
        refresh_token_encrypted: null,
        token_expires_at: null,
        external_org_id: null,
      })
      .eq('id', integrationId)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)

    if (error) {
      console.error('[Finance] Failed to disconnect integration:', error)
      return { data: null, error: 'Failed to disconnect' }
    }

    revalidatePath('/finance/integrations')
    return { data: null, error: null }
  } catch (err) {
    console.error('[Finance] Failed to disconnect integration:', err)
    return { data: null, error: 'Failed to disconnect' }
  }
}

/**
 * Get sync history for an integration.
 */
export async function getSyncHistory(
  integrationId: string
): Promise<FinanceActionResult<SyncLogEntry[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Verify ownership
    const { data: integration } = await supabase
      .from('finance_integrations')
      .select('id')
      .eq('id', integrationId)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)
      .single()

    if (!integration) return { data: null, error: 'Integration not found' }

    const { data, error } = await supabase
      .from('finance_sync_log')
      .select('*')
      .eq('integration_id', integrationId)
      .order('started_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[Finance] Failed to fetch sync history:', error)
      return { data: null, error: 'Failed to load sync history' }
    }

    return {
      data: (data ?? []).map(row => ({
        id: row.id,
        integrationId: row.integration_id,
        direction: row.direction as 'push' | 'pull',
        entityType: row.entity_type,
        entityCount: row.entity_count ?? 0,
        status: row.status as SyncLogEntry['status'],
        errorMessage: row.error_message,
        startedAt: row.started_at,
        completedAt: row.completed_at,
      })),
      error: null,
    }
  } catch (err) {
    console.error('[Finance] Failed to get sync history:', err)
    return { data: null, error: 'Failed to load sync history' }
  }
}

// ============================================================
// Helpers
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapIntegration(row: any): AccountingIntegration {
  return {
    id: row.id,
    foundryId: row.foundry_id,
    provider: row.provider,
    status: row.status,
    externalOrgId: row.external_org_id,
    lastSyncAt: row.last_sync_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
