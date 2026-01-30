'use server'

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

export interface SheetsIntegrationConfig {
    sheet_id: string | null
    sync_enabled: boolean
    tables_to_sync: string[]
    last_sync_at: string | null
    sync_errors: string[]
}

interface IntegrationRecord {
    id: string
    foundry_id: string
    service_type: string
    config: {
        sheet_id?: string
        sync_enabled?: boolean
        tables_to_sync?: string[]
        last_sync_at?: string
        sync_errors?: string[]
    }
    is_active: boolean
}

/**
 * Get the current Google Sheets integration configuration
 */
export async function getSheetsIntegration(): Promise<{
    config: SheetsIntegrationConfig | null
    error?: string
}> {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { config: null, error: 'Unauthorized' }
    
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { config: null, error: 'User not in a foundry' }
    
    // Check if user has admin access
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', user.id)
        .single()
    
    if (!profile) return { config: null, error: 'Profile not found' }
    
    if (!profile.is_active) {
        return { config: null, error: 'Your account is not active' }
    }
    
    // Check permissions
    const hasAccess = profile.role === 'Founder' || profile.role === 'Executive'
    if (!hasAccess) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: adminPerm } = await (supabase as any)
            .from('foundry_admin_permissions')
            .select('id')
            .eq('foundry_id', foundry_id)
            .eq('profile_id', user.id)
            .maybeSingle()
        
        if (!adminPerm) {
            return { config: null, error: 'Admin permission required' }
        }
    }
    
    // Get integration config
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
        .from('foundry_integrations')
        .select('*')
        .eq('foundry_id', foundry_id)
        .eq('service_type', 'google_sheets')
        .maybeSingle()
    
    if (error) {
        console.error('Error fetching sheets integration:', error)
        return { config: null, error: error.message }
    }
    
    if (!data) {
        return {
            config: {
                sheet_id: null,
                sync_enabled: false,
                tables_to_sync: [],
                last_sync_at: null,
                sync_errors: []
            }
        }
    }
    
    const record = data as IntegrationRecord
    return {
        config: {
            sheet_id: record.config.sheet_id || null,
            sync_enabled: record.config.sync_enabled || false,
            tables_to_sync: record.config.tables_to_sync || [],
            last_sync_at: record.config.last_sync_at || null,
            sync_errors: record.config.sync_errors || []
        }
    }
}

/**
 * Update Google Sheets integration configuration
 */
export async function updateSheetsIntegration(updates: {
    sheet_id?: string
    sync_enabled?: boolean
    tables_to_sync?: string[]
}): Promise<{
    config?: SheetsIntegrationConfig
    error?: string
}> {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }
    
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }
    
    // Check if user has admin access
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', user.id)
        .single()
    
    if (!profile || !profile.is_active) {
        return { error: 'Your account is not active' }
    }
    
    const hasAccess = profile.role === 'Founder' || profile.role === 'Executive'
    if (!hasAccess) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: adminPerm } = await (supabase as any)
            .from('foundry_admin_permissions')
            .select('id')
            .eq('foundry_id', foundry_id)
            .eq('profile_id', user.id)
            .maybeSingle()
        
        if (!adminPerm) {
            return { error: 'Admin permission required' }
        }
    }
    
    // Get existing config
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
        .from('foundry_integrations')
        .select('*')
        .eq('foundry_id', foundry_id)
        .eq('service_type', 'google_sheets')
        .maybeSingle()
    
    const existingConfig = (existing as IntegrationRecord | null)?.config || {}
    
    const newConfig = {
        ...existingConfig,
        ...updates,
        sync_errors: existingConfig.sync_errors || []
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
        .from('foundry_integrations')
        .upsert({
            foundry_id,
            service_type: 'google_sheets',
            config: newConfig,
            is_active: updates.sync_enabled ?? existingConfig.sync_enabled ?? false
        }, {
            onConflict: 'foundry_id,service_type'
        })
        .select()
        .single()
    
    if (error) {
        console.error('Error updating sheets integration:', error)
        return { error: error.message }
    }
    
    const record = data as IntegrationRecord
    return {
        config: {
            sheet_id: record.config.sheet_id || null,
            sync_enabled: record.config.sync_enabled || false,
            tables_to_sync: record.config.tables_to_sync || [],
            last_sync_at: record.config.last_sync_at || null,
            sync_errors: record.config.sync_errors || []
        }
    }
}

/**
 * Trigger a manual sync to Google Sheets
 */
export async function triggerManualSync(): Promise<{
    success?: boolean
    error?: string
}> {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }
    
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }
    
    const configResult = await getSheetsIntegration()
    if (!configResult.config?.sync_enabled) {
        return { error: 'Google Sheets sync is not enabled' }
    }
    
    if (!configResult.config.sheet_id) {
        return { error: 'No Google Sheet ID configured' }
    }
    
    try {
        const { data, error } = await supabase.functions.invoke('sheets-sync', {
            body: {
                foundry_id,
                manual: true,
                tables: configResult.config.tables_to_sync
            }
        })
        
        if (error) {
            await addSyncError(supabase, foundry_id, error.message)
            return { error: `Sync failed: ${error.message}` }
        }
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
            .from('foundry_integrations')
            .update({
                config: {
                    ...configResult.config,
                    last_sync_at: new Date().toISOString(),
                    sync_errors: []
                }
            })
            .eq('foundry_id', foundry_id)
            .eq('service_type', 'google_sheets')
        
        return { success: true }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        await addSyncError(supabase, foundry_id, message)
        return { error: `Sync failed: ${message}` }
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function addSyncError(supabase: any, foundryId: string, error: string) {
    const { data } = await supabase
        .from('foundry_integrations')
        .select('config')
        .eq('foundry_id', foundryId)
        .eq('service_type', 'google_sheets')
        .single()
    
    if (data) {
        const config = data.config as SheetsIntegrationConfig
        const errors = config.sync_errors || []
        errors.unshift(`${new Date().toISOString()}: ${error}`)
        
        const trimmedErrors = errors.slice(0, 10)
        
        await supabase
            .from('foundry_integrations')
            .update({
                config: {
                    ...config,
                    sync_errors: trimmedErrors
                }
            })
            .eq('foundry_id', foundryId)
            .eq('service_type', 'google_sheets')
    }
}

/**
 * Get sync status and statistics
 */
export async function getSyncStatus(): Promise<{
    status: {
        is_connected: boolean
        last_sync: string | null
        tables_count: number
        recent_errors: string[]
    }
    error?: string
}> {
    const configResult = await getSheetsIntegration()
    
    if (configResult.error) {
        return {
            status: {
                is_connected: false,
                last_sync: null,
                tables_count: 0,
                recent_errors: []
            },
            error: configResult.error
        }
    }
    
    const config = configResult.config
    
    return {
        status: {
            is_connected: config?.sync_enabled || false,
            last_sync: config?.last_sync_at || null,
            tables_count: config?.tables_to_sync?.length || 0,
            recent_errors: config?.sync_errors?.slice(0, 5) || []
        }
    }
}
