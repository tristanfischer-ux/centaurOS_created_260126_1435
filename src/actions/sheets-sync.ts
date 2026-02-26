'use server'

/**
 * @file sheets-sync.ts
 *
 * @description Server actions for spreadsheet sync configuration. Admins use these
 * to connect providers (Google Sheets / Microsoft Excel), create spreadsheets,
 * trigger syncs, and manage integration settings.
 *
 * DECISION: Replaced the Service Account flow with OAuth-based per-user auth.
 * The admin who connects their account has their user ID stored in the config
 * so background sync operations know whose token to use.
 *
 * @security All actions guarded by requireAdmin() — only Founder/Executive roles
 * or users with foundry_admin_permissions.
 *
 * @related
 * - src/lib/spreadsheet/sync-engine.ts — Core sync logic
 * - src/lib/spreadsheet/provider.ts — SpreadsheetProvider interface
 * - src/app/(platform)/settings/integrations/sheets-config-form.tsx — UI
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGoogleToken, deleteGoogleToken } from '@/lib/google/tokens'
import { deleteMicrosoftToken } from '@/lib/microsoft/tokens'
import type { ProviderType } from '@/lib/spreadsheet/provider'

export interface SheetsIntegrationConfig {
    spreadsheet_id: string | null
    spreadsheet_url: string | null
    sync_enabled: boolean
    sync_version: number
    last_sync_at: string | null
    sync_errors: string[]
    oauth_user_id: string | null
    oauth_email: string | null
    provider_type: ProviderType | null
}

interface IntegrationRecord {
    id: string
    foundry_id: string
    service_type: string
    config: Record<string, unknown>
    is_active: boolean
}

// ============================================================
// Permission check helper
// ============================================================

async function requireAdmin(): Promise<{
    foundryId: string
    userId: string
    error?: string
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { foundryId: '', userId: '', error: 'Unauthorized' }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { foundryId: '', userId: '', error: 'User not in a foundry' }

    // SECURITY: Verify user actually belongs to this foundry via membership table
    const { data: membership } = await supabase
        .from('foundry_memberships')
        .select('foundry_id')
        .eq('user_id', user.id)
        .eq('foundry_id', foundryId)
        .maybeSingle()

    if (!membership) {
        return { foundryId: '', userId: '', error: 'Not a member of this foundry' }
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', user.id)
        .single()

    if (!profile || !profile.is_active) {
        return { foundryId: '', userId: '', error: 'Your account is not active' }
    }

    const hasAccess = profile.role === 'Founder' || profile.role === 'Executive'
    if (!hasAccess) {
        const { data: adminPerm } = await supabase
            .from('foundry_admin_permissions')
            .select('id')
            .eq('foundry_id', foundryId)
            .eq('profile_id', user.id)
            .maybeSingle()

        if (!adminPerm) {
            return { foundryId: '', userId: '', error: 'Admin permission required' }
        }
    }

    return { foundryId, userId: user.id }
}

// ============================================================
// Get integration config
// ============================================================

/**
 * Get the current spreadsheet integration configuration for a specific provider.
 *
 * @param providerType - 'google_sheets' or 'microsoft_excel'
 */
export async function getSheetsIntegration(
    providerType: ProviderType = 'google_sheets'
): Promise<{
    config: SheetsIntegrationConfig | null
    error?: string
}> {
    const { foundryId, error: authError } = await requireAdmin()
    if (authError) return { config: null, error: authError }

    const supabase = await createClient()

    const { data, error } = await supabase
        .from('foundry_integrations')
        .select('*')
        .eq('foundry_id', foundryId)
        .eq('service_type', providerType)
        .maybeSingle()

    if (error) {
        console.error('[SheetsSync] Error fetching integration:', error)
        return { config: null, error: sanitizeErrorMessage(error) }
    }

    if (!data) {
        return {
            config: {
                spreadsheet_id: null,
                spreadsheet_url: null,
                sync_enabled: false,
                sync_version: 0,
                last_sync_at: null,
                sync_errors: [],
                oauth_user_id: null,
                oauth_email: null,
                provider_type: providerType,
            }
        }
    }

    const record = data as IntegrationRecord
    return {
        config: {
            spreadsheet_id: (record.config.spreadsheet_id as string) || null,
            spreadsheet_url: (record.config.spreadsheet_url as string) || null,
            sync_enabled: !!record.config.sync_enabled,
            sync_version: (record.config.sync_version as number) || 0,
            last_sync_at: (record.config.last_sync_at as string) || null,
            sync_errors: (record.config.sync_errors as string[]) || [],
            oauth_user_id: (record.config.oauth_user_id as string) || null,
            oauth_email: (record.config.oauth_email as string) || null,
            provider_type: providerType,
        }
    }
}

// ============================================================
// Check OAuth connection status
// ============================================================

/**
 * Check if the current user has connected their Google account with Sheets scope.
 */
export async function getGoogleConnectionStatus(): Promise<{
    connected: boolean
    email: string | null
}> {
    const { foundryId, userId, error } = await requireAdmin()
    if (error) return { connected: false, email: null }

    const token = await getGoogleToken(userId, foundryId)
    if (!token) return { connected: false, email: null }

    const hasSheetScope = token.scopes.some(s =>
        s.includes('spreadsheets')
    )

    return {
        connected: hasSheetScope,
        email: hasSheetScope ? token.google_email : null,
    }
}

/**
 * Check if the current user has connected their Microsoft account.
 */
export async function getMicrosoftConnectionStatus(): Promise<{
    connected: boolean
    email: string | null
}> {
    const { foundryId, userId, error } = await requireAdmin()
    if (error) return { connected: false, email: null }

    const admin = createAdminClient()
    const { data } = await admin
        .from('microsoft_oauth_tokens')
        .select('microsoft_email')
        .eq('user_id', userId)
        .eq('foundry_id', foundryId)
        .maybeSingle()

    return {
        connected: !!data,
        email: data?.microsoft_email || null,
    }
}

// ============================================================
// Create spreadsheet
// ============================================================

/**
 * Create a new spreadsheet and initialize its structure.
 *
 * @param providerType - Which provider to use
 */
export async function createAndInitializeSpreadsheet(
    providerType: ProviderType = 'google_sheets'
): Promise<{
    spreadsheetId?: string
    spreadsheetUrl?: string
    error?: string
}> {
    const { foundryId, userId, error: authError } = await requireAdmin()
    if (authError) return { error: authError }

    try {
        // Resolve provider
        const provider = await buildProvider(providerType, userId, foundryId)
        if (!provider) {
            return { error: 'Account not connected. Please connect your account first.' }
        }

        const { createSyncSpreadsheet } = await import('@/lib/spreadsheet/sync-engine')
        const result = await createSyncSpreadsheet(provider, foundryId)

        // Get the user's connected email
        let oauthEmail: string | null = null
        if (providerType === 'google_sheets') {
            const token = await getGoogleToken(userId, foundryId)
            oauthEmail = token?.google_email || null
        } else {
            const admin = createAdminClient()
            const { data: msToken } = await admin
                .from('microsoft_oauth_tokens')
                .select('microsoft_email')
                .eq('user_id', userId)
                .eq('foundry_id', foundryId)
                .maybeSingle()
            oauthEmail = msToken?.microsoft_email || null
        }

        // Save to integration config
        const admin = createAdminClient()
        const { data: existing } = await admin
            .from('foundry_integrations')
            .select('config')
            .eq('foundry_id', foundryId)
            .eq('service_type', providerType)
            .maybeSingle()

        const existingConfig = (existing?.config as Record<string, unknown>) || {}

        const { error: upsertError } = await admin
            .from('foundry_integrations')
            .upsert({
                foundry_id: foundryId,
                service_type: providerType,
                config: {
                    ...existingConfig,
                    spreadsheet_id: result.spreadsheetId,
                    spreadsheet_url: result.spreadsheetUrl,
                    oauth_user_id: userId,
                    oauth_email: oauthEmail,
                    sync_version: 0,
                    sync_enabled: true,
                    sync_errors: [],
                },
                is_active: true,
            }, { onConflict: 'foundry_id,service_type' })

        if (upsertError) {
            console.error('[SheetsSync] Failed to save integration config:', upsertError)
            return { error: sanitizeErrorMessage(upsertError) }
        }

        console.info('[SheetsSync] Spreadsheet created:', {
            foundryId,
            providerType,
            spreadsheetId: result.spreadsheetId,
        })

        return {
            spreadsheetId: result.spreadsheetId,
            spreadsheetUrl: result.spreadsheetUrl,
        }
    } catch (err) {
        console.error('[SheetsSync] Spreadsheet creation failed:', err)
        return { error: sanitizeErrorMessage(err) }
    }
}

// ============================================================
// Manual Full Sync
// ============================================================

/**
 * Trigger a manual full sync.
 */
export async function triggerManualSync(
    providerType: ProviderType = 'google_sheets'
): Promise<{
    success?: boolean
    tasksWritten?: number
    error?: string
}> {
    const { foundryId, userId, error: authError } = await requireAdmin()
    if (authError) return { error: authError }

    const configResult = await getSheetsIntegration(providerType)
    if (!configResult.config?.spreadsheet_id) {
        return { error: 'No spreadsheet configured. Create a spreadsheet first.' }
    }

    try {
        const provider = await buildProvider(providerType, userId, foundryId)
        if (!provider) return { error: 'Account not connected.' }

        const { fullSync } = await import('@/lib/spreadsheet/sync-engine')
        const result = await fullSync(provider, foundryId, providerType)

        if (result.error) {
            await addSyncError(foundryId, providerType, result.error)
            return { error: `Sync failed: ${result.error}` }
        }

        // Update last sync timestamp
        const admin = createAdminClient()
        const { data: existing } = await admin
            .from('foundry_integrations')
            .select('config')
            .eq('foundry_id', foundryId)
            .eq('service_type', providerType)
            .single()

        const existingConfig = (existing?.config as Record<string, unknown>) || {}

        // GOTCHA: This is a read-modify-write for last_sync_at and sync_errors,
        // which are informational fields. An atomic RPC is not worth the complexity
        // here since these fields are non-critical and only updated by manual sync.
        const { error: updateError } = await admin
            .from('foundry_integrations')
            .update({
                config: {
                    ...existingConfig,
                    last_sync_at: new Date().toISOString(),
                    sync_errors: [],
                },
            })
            .eq('foundry_id', foundryId)
            .eq('service_type', providerType)

        if (updateError) {
            console.error('[SheetsSync] Failed to update sync timestamp:', updateError)
        }

        return { success: true, tasksWritten: result.tasksWritten }
    } catch (err) {
        const sanitizedError = sanitizeErrorMessage(err)
        await addSyncError(foundryId, providerType, sanitizedError)
        return { error: `Sync failed: ${sanitizedError}` }
    }
}

// ============================================================
// Update integration config
// ============================================================

/**
 * Update integration configuration (enable/disable sync).
 */
export async function updateSheetsIntegration(
    updates: { sync_enabled?: boolean },
    providerType: ProviderType = 'google_sheets'
): Promise<{
    config?: SheetsIntegrationConfig
    error?: string
}> {
    const { foundryId, error: authError } = await requireAdmin()
    if (authError) return { error: authError }

    const supabase = await createClient()

    const { data: existing } = await supabase
        .from('foundry_integrations')
        .select('*')
        .eq('foundry_id', foundryId)
        .eq('service_type', providerType)
        .maybeSingle()

    const existingConfig = (existing as IntegrationRecord | null)?.config || {}

    const newConfig = {
        ...existingConfig,
        ...updates,
        sync_errors: (existingConfig.sync_errors as string[]) || [],
    }

    const { data, error } = await supabase
        .from('foundry_integrations')
        .upsert({
            foundry_id: foundryId,
            service_type: providerType,
            config: newConfig,
            is_active: updates.sync_enabled ?? !!existingConfig.sync_enabled
        }, {
            onConflict: 'foundry_id,service_type'
        })
        .select()
        .single()

    if (error) {
        console.error('[SheetsSync] Error updating integration:', error)
        return { error: sanitizeErrorMessage(error) }
    }

    const record = data as IntegrationRecord
    return {
        config: {
            spreadsheet_id: (record.config.spreadsheet_id as string) || null,
            spreadsheet_url: (record.config.spreadsheet_url as string) || null,
            sync_enabled: !!record.config.sync_enabled,
            sync_version: (record.config.sync_version as number) || 0,
            last_sync_at: (record.config.last_sync_at as string) || null,
            sync_errors: (record.config.sync_errors as string[]) || [],
            oauth_user_id: (record.config.oauth_user_id as string) || null,
            oauth_email: (record.config.oauth_email as string) || null,
            provider_type: providerType,
        }
    }
}

// ============================================================
// Disable / disconnect
// ============================================================

/**
 * Disable sync for a provider (keeps the spreadsheet, stops syncing).
 */
export async function disableSync(
    providerType: ProviderType = 'google_sheets'
): Promise<{ error?: string }> {
    const { foundryId, userId, error: authError } = await requireAdmin()
    if (authError) return { error: authError }

    const admin = createAdminClient()

    const { data: existing } = await admin
        .from('foundry_integrations')
        .select('config')
        .eq('foundry_id', foundryId)
        .eq('service_type', providerType)
        .maybeSingle()

    if (!existing) return {}

    const existingConfig = (existing.config as Record<string, unknown>) || {}

    const { error: updateError } = await admin
        .from('foundry_integrations')
        .update({
            config: { ...existingConfig, sync_enabled: false },
            is_active: false,
        })
        .eq('foundry_id', foundryId)
        .eq('service_type', providerType)

    if (updateError) {
        console.error('[SheetsSync] Failed to disable sync:', updateError)
        return { error: sanitizeErrorMessage(updateError) }
    }

    // Clean up OAuth tokens for the disconnected provider
    if (providerType === 'google_sheets') {
        await deleteGoogleToken(userId, foundryId)
    } else if (providerType === 'microsoft_excel') {
        await deleteMicrosoftToken(userId, foundryId)
    }

    return {}
}

// ============================================================
// Sync Status
// ============================================================

/**
 * Get sync status and statistics for a provider.
 */
export async function getSyncStatus(
    providerType: ProviderType = 'google_sheets'
): Promise<{
    status: {
        is_connected: boolean
        has_spreadsheet: boolean
        last_sync: string | null
        recent_errors: string[]
        oauth_email: string | null
    }
    error?: string
}> {
    const { error: authError } = await requireAdmin()
    if (authError) {
        return {
            status: {
                is_connected: false,
                has_spreadsheet: false,
                last_sync: null,
                recent_errors: [],
                oauth_email: null,
            },
            error: authError,
        }
    }

    const configResult = await getSheetsIntegration(providerType)
    const config = configResult.config

    return {
        status: {
            is_connected: config?.sync_enabled || false,
            has_spreadsheet: !!config?.spreadsheet_id,
            last_sync: config?.last_sync_at || null,
            recent_errors: config?.sync_errors?.slice(0, 5) || [],
            oauth_email: config?.oauth_email || null,
        },
    }
}

// ============================================================
// Helpers
// ============================================================

async function buildProvider(
    providerType: ProviderType,
    userId: string,
    foundryId: string
): Promise<import('@/lib/spreadsheet/provider').SpreadsheetProvider | null> {
    switch (providerType) {
        case 'google_sheets': {
            const token = await getGoogleToken(userId, foundryId)
            if (!token || !token.scopes.some(s => s.includes('spreadsheets'))) {
                return null
            }
            const { GoogleSheetsProvider } = await import('@/lib/spreadsheet/google-sheets-provider')
            return new GoogleSheetsProvider(userId, foundryId)
        }
        case 'microsoft_excel': {
            const admin = createAdminClient()
            const { data } = await admin
                .from('microsoft_oauth_tokens')
                .select('id')
                .eq('user_id', userId)
                .eq('foundry_id', foundryId)
                .maybeSingle()
            if (!data) return null
            const { ExcelOnlineProvider } = await import('@/lib/spreadsheet/excel-online-provider')
            return new ExcelOnlineProvider(userId, foundryId)
        }
        default:
            return null
    }
}

async function addSyncError(foundryId: string, serviceType: string, error: string): Promise<void> {
    try {
        const admin = createAdminClient()
        const { data } = await admin
            .from('foundry_integrations')
            .select('config')
            .eq('foundry_id', foundryId)
            .eq('service_type', serviceType)
            .single()

        if (data) {
            const config = data.config as Record<string, unknown>
            const errors = (config.sync_errors as string[]) || []
            errors.unshift(`${new Date().toISOString()}: ${error}`)
            const trimmedErrors = errors.slice(0, 10)

            await admin
                .from('foundry_integrations')
                .update({
                    config: { ...config, sync_errors: trimmedErrors },
                })
                .eq('foundry_id', foundryId)
                .eq('service_type', serviceType)
        }
    } catch (logErr) {
        console.error('[SheetsSync] Failed to log sync error:', logErr)
    }
}
