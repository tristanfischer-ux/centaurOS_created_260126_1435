'use server'

import { withAuth } from '@/lib/server-action-utils'

export type XeroConnectionState = {
  connected: boolean
  organisation_name: string | null
  organisation_id: string | null
  sync_state: 'healthy' | 'syncing' | 'error' | 'paused' | null
  last_sync_at: string | null
  last_error_message: string | null
}

export async function getXeroConnection(): Promise<XeroConnectionState | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data } = await supabase
      .from('xero_connection')
      .select('organisation_id, organisation_name, sync_state, last_sync_at, last_error_message')
      .eq('foundry_id', foundryId)
      .maybeSingle()

    if (!data) {
      return {
        connected: false,
        organisation_name: null,
        organisation_id: null,
        sync_state: null,
        last_sync_at: null,
        last_error_message: null,
      }
    }

    return {
      connected: true,
      organisation_id: data.organisation_id,
      organisation_name: data.organisation_name,
      sync_state: data.sync_state as XeroConnectionState['sync_state'],
      last_sync_at: data.last_sync_at,
      last_error_message: data.last_error_message,
    }
  })
}

/**
 * Pre-flight check for the OAuth flow — rejects connecting a Xero org that
 * is already linked to a different foundry (red-team #6 fix).
 */
export async function checkXeroOrgAvailable(
  organisationId: string,
): Promise<{ available: true } | { available: false; conflict_foundry_id: string } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data } = await supabase
      .from('xero_connection')
      .select('foundry_id')
      .eq('organisation_id', organisationId)
      .maybeSingle()

    if (!data) return { available: true as const }
    if (data.foundry_id === foundryId) return { available: true as const } // same foundry = reconnect
    return { available: false as const, conflict_foundry_id: data.foundry_id }
  })
}
