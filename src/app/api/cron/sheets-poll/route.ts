/**
 * @file route.ts
 *
 * @description Polling cron for inbound spreadsheet sync. Replaces the
 * webhook/Apps Script approach with a simple pull-based diff.
 *
 * Triggered by Vercel Cron every 3 minutes. For each foundry with sync enabled,
 * reads the spreadsheet's Master Task List tab, diffs against last known state
 * (from sheets_row_map + DB), and applies changes.
 *
 * @security
 * - Secured with CRON_SECRET header (standard Vercel cron pattern)
 * - Uses admin client for DB operations (runs server-side without user context)
 * - Foundry isolation maintained per-integration
 *
 * @related
 * - src/lib/spreadsheet/sync-engine.ts — applyInboundChanges
 * - src/lib/spreadsheet/sync-dispatcher.ts — resolves providers
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ProviderType } from '@/lib/spreadsheet/provider'
import { getSyncVersion } from '@/lib/spreadsheet/sync-engine'
import type { InboundChange } from '@/lib/spreadsheet/sync-engine'

const SUPPORTED_SERVICE_TYPES: ProviderType[] = ['google_sheets', 'microsoft_excel']

// DECISION: Only these columns in the Master Task List are editable by users.
// Other columns are read-only (protected in the spreadsheet).
const EDITABLE_COLUMNS = [
    'Task Title', 'Description', 'Assignee', 'Status',
    'Start Date', 'End Date', 'Progress %', 'Risk Level',
]

export async function GET(req: NextRequest): Promise<NextResponse> {
    // SECURITY: Validate cron secret
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
        console.error('[SheetsPoll] CRON_SECRET not configured')
        return NextResponse.json({ error: 'Not configured' }, { status: 500 })
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    // Find all active spreadsheet integrations
    const { data: integrations, error: intError } = await admin
        .from('foundry_integrations')
        .select('foundry_id, service_type, config, is_active')
        .in('service_type', SUPPORTED_SERVICE_TYPES)
        .eq('is_active', true)

    if (intError) {
        console.error('[SheetsPoll] Failed to fetch integrations:', intError.message)
        return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }

    if (!integrations || integrations.length === 0) {
        return NextResponse.json({ message: 'No active integrations', polled: 0 })
    }

    const results: Array<{ foundryId: string; provider: string; applied: number; errors: number }> = []

    for (const integration of integrations) {
        const config = integration.config as Record<string, unknown> | null
        if (!config?.sync_enabled || !config?.spreadsheet_id) continue

        const foundryId = integration.foundry_id as string
        const serviceType = integration.service_type as ProviderType
        const spreadsheetId = config.spreadsheet_id as string
        const oauthUserId = config.oauth_user_id as string | undefined

        if (!oauthUserId) {
            console.warn('[SheetsPoll] No oauth_user_id for:', { foundryId, serviceType })
            continue
        }

        try {
            const provider = await resolveProvider(serviceType, oauthUserId, foundryId)
            if (!provider) continue

            // SECURITY: Check sync version to prevent applying stale inbound changes
            // while an outbound sync is in flight.
            try {
                const syncTabRows = await provider.readAllRows(spreadsheetId, '_sync')
                const sheetSyncVersion = syncTabRows?.[0]?.[0] != null
                    ? Number(syncTabRows[0][0])
                    : null
                const dbSyncVersion = await getSyncVersion(foundryId, serviceType)

                if (sheetSyncVersion !== null && sheetSyncVersion !== dbSyncVersion) {
                    console.info('[SheetsPoll] Sync version mismatch, skipping (outbound in flight):', {
                        foundryId, sheetSyncVersion, dbSyncVersion,
                    })
                    continue
                }
            } catch {
                // INTENT: _sync tab unreadable — fail-safe, skip this foundry
                console.info('[SheetsPoll] Could not read _sync tab, skipping:', { foundryId })
                continue
            }

            // Read the Master Task List tab
            const rows = await provider.readAllRows(spreadsheetId, 'Master Task List')
            if (!rows || rows.length <= 1) continue // No data rows

            // Build header index map from the actual first row
            const headerRow = rows[0] as string[]
            const headerIndex = new Map<string, number>()
            headerRow.forEach((h, i) => headerIndex.set(String(h).trim(), i))

            const taskIdCol = headerIndex.get('Task ID')
            if (taskIdCol === undefined) {
                console.warn('[SheetsPoll] No Task ID column found:', { foundryId })
                continue
            }

            // Fetch current DB state for all tasks in this foundry
            const { data: dbTasks } = await admin
                .from('tasks')
                .select('id, title, description, status, start_date, end_date, progress, risk_level, assignee_id')
                .eq('foundry_id', foundryId)
                .is('deleted_at', null)

            if (!dbTasks) continue

            // Fetch profiles for assignee resolution
            const { data: profiles } = await admin
                .from('profiles')
                .select('id, full_name')
                .eq('foundry_id', foundryId)
                .eq('is_active', true)

            const profileById = new Map((profiles || []).map(p => [p.id, p.full_name || 'Unnamed']))

            const taskMap = new Map(dbTasks.map(t => [t.id, {
                ...t,
                assignee_name: t.assignee_id ? (profileById.get(t.assignee_id) || '') : '',
            }]))

            // Diff each data row against DB
            const changes: InboundChange[] = []

            for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
                const row = rows[rowIdx] as string[]
                const entityId = String(row[taskIdCol] || '').trim()
                if (!entityId) continue

                const dbTask = taskMap.get(entityId)
                if (!dbTask) continue // Task not found in DB — skip

                for (const colName of EDITABLE_COLUMNS) {
                    const colIdx = headerIndex.get(colName)
                    if (colIdx === undefined) continue

                    const sheetValue = String(row[colIdx] ?? '').trim()
                    const dbValue = getDbValueForColumn(colName, dbTask)

                    if (sheetValue !== dbValue) {
                        changes.push({
                            tabName: 'Master Task List',
                            rowNumber: rowIdx + 1,
                            column: colName,
                            oldValue: dbValue,
                            newValue: sheetValue,
                            entityId,
                        })
                    }
                }
            }

            if (changes.length === 0) {
                results.push({ foundryId, provider: serviceType, applied: 0, errors: 0 })
                continue
            }

            // Apply changes
            const { applyInboundChanges } = await import('@/lib/spreadsheet/sync-engine')
            const result = await applyInboundChanges(foundryId, changes)

            // Log summary
            if (result.errors.length > 0) {
                console.warn('[SheetsPoll] Inbound sync had errors:', {
                    foundryId,
                    applied: result.applied,
                    errors: result.errors.slice(0, 5),
                })
            }

            results.push({
                foundryId,
                provider: serviceType,
                applied: result.applied,
                errors: result.errors.length,
            })
        } catch (err) {
            console.error('[SheetsPoll] Poll failed for foundry:', {
                foundryId,
                serviceType,
                error: err instanceof Error ? err.message : 'Unknown error',
            })

            // Log failure (best-effort)
            try {
                await admin.from('sheets_sync_log').insert({
                    foundry_id: foundryId,
                    direction: 'inbound',
                    entity_type: 'batch',
                    operation: 'full_sync',
                    status: 'failed',
                    error_message: err instanceof Error ? err.message : 'Unknown error',
                    metadata: { provider: serviceType, source: 'cron_poll' },
                })
            } catch {
                // Double failure — nothing more we can do
            }

            results.push({ foundryId, provider: serviceType, applied: 0, errors: 1 })
        }
    }

    return NextResponse.json({
        message: 'Poll complete',
        polled: results.length,
        results,
    })
}

// ============================================================
// Helpers
// ============================================================

/**
 * Map a column name to the corresponding DB value for comparison.
 */
function getDbValueForColumn(
    colName: string,
    task: {
        title: string
        description: string | null
        status: string
        start_date: string | null
        end_date: string | null
        progress: number | null
        risk_level: string | null
        assignee_name: string
    }
): string {
    switch (colName) {
        case 'Task Title': return task.title || ''
        case 'Description': return task.description || ''
        case 'Status': return task.status || ''
        case 'Start Date': return task.start_date || ''
        case 'End Date': return task.end_date || ''
        case 'Progress %': return task.progress != null ? String(task.progress) : ''
        case 'Risk Level': return task.risk_level || ''
        case 'Assignee': return task.assignee_name || ''
        default: return ''
    }
}

/**
 * Resolve a SpreadsheetProvider instance for a given service type.
 */
async function resolveProvider(
    serviceType: ProviderType,
    userId: string,
    foundryId: string
): Promise<import('@/lib/spreadsheet/provider').SpreadsheetProvider | null> {
    switch (serviceType) {
        case 'google_sheets': {
            const { GoogleSheetsProvider } = await import('@/lib/spreadsheet/google-sheets-provider')
            return new GoogleSheetsProvider(userId, foundryId)
        }
        case 'microsoft_excel': {
            const { ExcelOnlineProvider } = await import('@/lib/spreadsheet/excel-online-provider')
            return new ExcelOnlineProvider(userId, foundryId)
        }
        default:
            return null
    }
}
