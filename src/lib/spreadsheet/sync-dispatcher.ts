/**
 * @file sync-dispatcher.ts
 *
 * @description Lightweight fire-and-forget dispatcher for spreadsheet sync.
 * Called from server actions after task/objective mutations. Checks if sync is
 * enabled for any provider before delegating to the sync engine.
 * Sync failures never block the calling action.
 *
 * DECISION: This replaces src/lib/google/sheets-sync-dispatcher.ts with a
 * provider-agnostic version that checks all enabled providers (Google Sheets
 * and/or Microsoft Excel).
 *
 * @related
 * - src/lib/spreadsheet/sync-engine.ts — Core sync logic
 * - src/actions/tasks.ts — Calls dispatchSheetSync after mutations
 * - src/actions/objectives.ts — Calls dispatchSheetSync after mutations
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { ProviderType } from './provider'

const SUPPORTED_SERVICE_TYPES: ProviderType[] = ['google_sheets', 'microsoft_excel']

/**
 * Dispatch a sync operation to all enabled spreadsheet providers (non-blocking).
 * Returns immediately — sync errors are logged but never thrown.
 *
 * @param foundryId - The foundry to sync for
 * @param entityType - 'task' or 'objective'
 * @param entityId - The entity UUID
 * @param operation - 'create', 'update', or 'delete'
 */
export async function dispatchSheetSync(
    foundryId: string,
    entityType: 'task' | 'objective',
    entityId: string,
    operation: 'create' | 'update' | 'delete'
): Promise<void> {
    try {
        const admin = createAdminClient()

        // Find all active spreadsheet integrations for this foundry
        const { data: integrations } = await admin
            .from('foundry_integrations')
            .select('config, is_active, service_type')
            .eq('foundry_id', foundryId)
            .in('service_type', SUPPORTED_SERVICE_TYPES)

        if (!integrations || integrations.length === 0) return

        for (const integration of integrations) {
            if (!integration.is_active) continue

            const config = integration.config as Record<string, unknown> | null
            if (!config?.sync_enabled || !config?.spreadsheet_id) continue

            const serviceType = integration.service_type as ProviderType

            try {
                // INTENT: Dynamic import keeps the sync engine out of the bundle
                // when sync is disabled (most server action calls)
                const { syncTaskToSheet, syncObjectiveToSheet } = await import('./sync-engine')
                const provider = await resolveProvider(serviceType, foundryId, config)
                if (!provider) continue

                if (entityType === 'task') {
                    await syncTaskToSheet(provider, foundryId, entityId, operation, serviceType)
                } else {
                    await syncObjectiveToSheet(provider, foundryId, entityId, operation, serviceType)
                }

                // Log success
                await admin.from('sheets_sync_log').insert({
                    foundry_id: foundryId,
                    direction: 'outbound',
                    entity_type: entityType,
                    entity_id: entityId,
                    operation,
                    status: 'success',
                    metadata: { provider: serviceType },
                })
            } catch (err) {
                console.error('[SyncDispatcher] Sync failed:', {
                    foundryId,
                    serviceType,
                    entityType,
                    entityId,
                    operation,
                    error: err instanceof Error ? err.message : 'Unknown error',
                })

                // Log failure (best-effort)
                try {
                    await admin.from('sheets_sync_log').insert({
                        foundry_id: foundryId,
                        direction: 'outbound',
                        entity_type: entityType,
                        entity_id: entityId,
                        operation,
                        status: 'failed',
                        error_message: err instanceof Error ? err.message : 'Unknown error',
                        metadata: { provider: serviceType },
                    })
                } catch {
                    // Double failure — nothing more we can do
                }
            }
        }
    } catch (err) {
        // INTENT: Sync failure never blocks the calling server action
        console.error('[SyncDispatcher] Dispatch failed:', {
            foundryId,
            entityType,
            entityId,
            operation,
            error: err instanceof Error ? err.message : 'Unknown error',
        })
    }
}

/**
 * Resolve a SpreadsheetProvider instance for a given service type.
 *
 * @param serviceType - 'google_sheets' or 'microsoft_excel'
 * @param foundryId - The foundry context
 * @param config - Integration config containing oauth_user_id
 * @returns Provider instance, or null if not available
 */
async function resolveProvider(
    serviceType: ProviderType,
    foundryId: string,
    config: Record<string, unknown>
): Promise<import('./provider').SpreadsheetProvider | null> {
    // INTENT: The admin who connected the integration has their user ID stored
    // in the config so the sync engine knows whose OAuth token to use.
    const oauthUserId = config.oauth_user_id as string | undefined
    if (!oauthUserId) {
        console.warn('[SyncDispatcher] No oauth_user_id in config:', { foundryId, serviceType })
        return null
    }

    switch (serviceType) {
        case 'google_sheets': {
            const { GoogleSheetsProvider } = await import('./google-sheets-provider')
            return new GoogleSheetsProvider(oauthUserId, foundryId)
        }
        case 'microsoft_excel': {
            const { ExcelOnlineProvider } = await import('./excel-online-provider')
            return new ExcelOnlineProvider(oauthUserId, foundryId)
        }
        default:
            return null
    }
}
