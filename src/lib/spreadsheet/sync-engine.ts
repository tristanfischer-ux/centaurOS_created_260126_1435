/**
 * @file sync-engine.ts
 *
 * @description Provider-agnostic sync engine for spreadsheet bidirectional sync.
 * Handles spreadsheet creation, full sync, incremental task/objective updates,
 * Gantt tab rendering, and inbound change application.
 *
 * DECISION: This is a refactor of the original src/lib/google/sheets-sync-engine.ts
 * to work with any SpreadsheetProvider (Google Sheets or Excel Online). The core
 * logic (column layouts, row building, Gantt rendering, inbound validation) is
 * preserved; only the API calls are delegated to the provider.
 *
 * @security
 * - All DB operations use admin client (service role) since sync runs server-side
 * - Foundry isolation enforced via foundryId parameter on every operation
 * - Inbound changes are validated against allowed columns and value ranges
 *
 * @related
 * - src/lib/spreadsheet/provider.ts — SpreadsheetProvider interface
 * - src/lib/spreadsheet/google-sheets-provider.ts — Google Sheets provider
 * - src/lib/spreadsheet/excel-online-provider.ts — Excel Online provider
 * - src/lib/spreadsheet/sync-dispatcher.ts — Fire-and-forget dispatcher
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { SpreadsheetProvider, CellColor } from './provider'

// ============================================================
// Types
// ============================================================

export interface InboundChange {
    tabName: string
    rowNumber: number
    column: string
    oldValue: string
    newValue: string
    entityId: string
}

interface TaskRow {
    id: string
    task_number: number | null
    title: string
    description: string | null
    status: string
    start_date: string | null
    end_date: string | null
    progress: number | null
    risk_level: string | null
    assignee_name: string | null
    assignee_id: string | null
    objective_title: string | null
    strategic_goal_title: string | null
}

// ============================================================
// Constants — Column layout
// ============================================================

// DECISION: Task ID is in column A (hidden) to enable row mapping from Sheets back to ForgeOS.
export const MASTER_HEADERS = [
    'Task ID', 'Task #', 'Strategic Goal', 'Objective', 'Task Title',
    'Description', 'Assignee', 'Status', 'Start Date', 'End Date',
    'Progress %', 'Risk Level',
]

// Per-person tabs omit the Assignee column (tab name = the person)
const PERSON_HEADERS = [
    'Task ID', 'Task #', 'Strategic Goal', 'Objective', 'Task Title',
    'Description', 'Status', 'Start Date', 'End Date',
    'Progress %', 'Risk Level',
]

const VALID_STATUSES = ['Pending', 'Accepted', 'Rejected', 'Amended', 'Amended_Pending_Approval', 'Completed']
const VALID_RISK_LEVELS = ['Low', 'Medium', 'High']

// Read-only column indices (0-based) — Task ID, Task #, Strategic Goal, Objective
const MASTER_READONLY_COLS = [0, 1, 2, 3]
const PERSON_READONLY_COLS = [0, 1, 2, 3]

// ============================================================
// Spreadsheet Lifecycle
// ============================================================

/**
 * Create a new spreadsheet for the foundry and initialize its structure.
 *
 * @param provider - The spreadsheet provider to use
 * @param foundryId - The foundry creating the spreadsheet
 * @returns Spreadsheet ID and URL
 */
export async function createSyncSpreadsheet(
    provider: SpreadsheetProvider,
    foundryId: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
    const admin = createAdminClient()

    // Get foundry name for the spreadsheet title
    const { data: foundry } = await admin
        .from('foundries')
        .select('name')
        .eq('id', foundryId)
        .single()

    const foundryName = foundry?.name || 'ForgeOS'

    // Get active team members to create per-person tabs
    const { data: members } = await admin
        .from('profiles')
        .select('id, full_name, role')
        .eq('foundry_id', foundryId)
        .eq('is_active', true)
        .in('role', ['Founder', 'Executive', 'Apprentice'])
        .order('full_name')

    const memberNames = (members || []).map(m => m.full_name || 'Unnamed')

    // Build tab names: Master Task List + per-person + Master Gantt + _sync (hidden)
    const tabNames = [
        'Master Task List',
        ...memberNames,
        'Master Gantt',
        '_sync',
    ]

    const result = await provider.createSpreadsheet(
        `ForgeOS - ${foundryName} - Task Tracker`,
        tabNames,
        ['_sync']
    )

    // Initialize headers, formatting, data validation
    await initializeSpreadsheet(provider, foundryId, result.id, memberNames)

    console.info('[SyncEngine] Spreadsheet created:', { foundryId, spreadsheetId: result.id })
    return { spreadsheetId: result.id, spreadsheetUrl: result.url }
}

/**
 * Initialize an existing spreadsheet with headers, formatting, and validation.
 */
async function initializeSpreadsheet(
    provider: SpreadsheetProvider,
    foundryId: string,
    spreadsheetId: string,
    memberNames: string[]
): Promise<void> {
    const allTabs = ['Master Task List', ...memberNames]

    for (const tabName of allTabs) {
        const isMaster = tabName === 'Master Task List'
        const headers = isMaster ? MASTER_HEADERS : PERSON_HEADERS

        // Write headers
        await provider.writeHeaders(spreadsheetId, tabName, headers)

        // Format: freeze header, bold header, hide Task ID column (col 0)
        await provider.formatTab(spreadsheetId, tabName, {
            freezeRows: 1,
            boldHeaderRow: true,
            hideColumns: [0],
        })

        // Protect header row
        await provider.protectHeaders(spreadsheetId, tabName)

        // Protect read-only columns
        const readonlyCols = isMaster ? MASTER_READONLY_COLS : PERSON_READONLY_COLS
        await provider.protectColumns(spreadsheetId, tabName, readonlyCols)

        // Status dropdown validation
        const statusColIndex = isMaster ? 7 : 6
        await provider.addDataValidation(spreadsheetId, tabName, statusColIndex, {
            type: 'one_of_list',
            values: VALID_STATUSES,
            strict: true,
        })

        // Risk Level dropdown validation
        const riskColIndex = isMaster ? 11 : 10
        await provider.addDataValidation(spreadsheetId, tabName, riskColIndex, {
            type: 'one_of_list',
            values: VALID_RISK_LEVELS,
            strict: true,
        })

        // Progress validation (0-100)
        const progressColIndex = isMaster ? 10 : 9
        await provider.addDataValidation(spreadsheetId, tabName, progressColIndex, {
            type: 'number_range',
            min: 0,
            max: 100,
            strict: true,
        })

        // Date validation for Start Date / End Date
        const startDateIdx = isMaster ? 8 : 7
        const endDateIdx = isMaster ? 9 : 8
        await provider.addDataValidation(spreadsheetId, tabName, startDateIdx, { type: 'date' })
        await provider.addDataValidation(spreadsheetId, tabName, endDateIdx, { type: 'date' })

        // Assignee dropdown (master tab only)
        if (isMaster) {
            const admin = createAdminClient()
            const { data: allMembers } = await admin
                .from('profiles')
                .select('full_name')
                .eq('foundry_id', foundryId)
                .eq('is_active', true)
                .in('role', ['Founder', 'Executive', 'Apprentice'])
                .order('full_name')

            if (allMembers && allMembers.length > 0) {
                await provider.addDataValidation(spreadsheetId, tabName, 6, {
                    type: 'one_of_list',
                    values: allMembers.map(m => m.full_name || 'Unnamed'),
                    strict: false, // Allow unassigned
                })
            }
        }
    }

    // Protect Gantt tab as read-only
    await provider.protectTab(spreadsheetId, 'Master Gantt')
}

// ============================================================
// Full Sync
// ============================================================

/**
 * Full sync: writes all tasks to all tabs, rebuilds Gantt, updates row map.
 *
 * @param provider - The spreadsheet provider
 * @param foundryId - The foundry to sync
 * @param serviceType - The service type in foundry_integrations
 * @returns Stats about the sync operation
 */
export async function fullSync(
    provider: SpreadsheetProvider,
    foundryId: string,
    serviceType: string
): Promise<{
    tasksWritten: number
    tabsUpdated: number
    error?: string
}> {
    const admin = createAdminClient()

    // Get spreadsheet ID from integration config
    const { data: integration } = await admin
        .from('foundry_integrations')
        .select('config')
        .eq('foundry_id', foundryId)
        .eq('service_type', serviceType)
        .single()

    const config = integration?.config as Record<string, unknown> | null
    const spreadsheetId = config?.spreadsheet_id as string | undefined
    if (!spreadsheetId) return { tasksWritten: 0, tabsUpdated: 0, error: 'No spreadsheet configured' }

    // Fetch all active tasks with related data
    const { data: tasks, error: taskError } = await admin
        .from('tasks')
        .select(`
            id, task_number, title, description, status, start_date, end_date,
            progress, risk_level, assignee_id,
            objectives!inner(id, title, parent_objective_id, is_strategic_goal)
        `)
        .eq('foundry_id', foundryId)
        .is('deleted_at', null)
        .order('task_number', { ascending: true })

    if (taskError) {
        console.error('[SyncEngine] Failed to fetch tasks:', { foundryId, error: taskError.message })
        return { tasksWritten: 0, tabsUpdated: 0, error: taskError.message }
    }

    // Fetch profiles for assignee names
    const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name')
        .eq('foundry_id', foundryId)
        .eq('is_active', true)

    const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name || 'Unnamed']))

    // Fetch all objectives for strategic goal resolution
    const { data: allObjectives } = await admin
        .from('objectives')
        .select('id, title, parent_objective_id, is_strategic_goal')
        .eq('foundry_id', foundryId)
        .is('deleted_at', null)

    const objectiveMap = new Map((allObjectives || []).map(o => [o.id, o]))

    // Resolve strategic goal for each task (walk up parent chain)
    function getStrategicGoalTitle(objectiveId: string | null): string {
        if (!objectiveId) return ''
        let current = objectiveMap.get(objectiveId)
        const visited = new Set<string>()
        while (current) {
            if (visited.has(current.id)) break
            visited.add(current.id)
            if (current.is_strategic_goal) return current.title
            if (!current.parent_objective_id) break
            current = objectiveMap.get(current.parent_objective_id)
        }
        return ''
    }

    // Build task rows
    const taskRows: TaskRow[] = (tasks || []).map(task => {
        const objective = task.objectives as unknown as {
            id: string; title: string; parent_objective_id: string | null; is_strategic_goal: boolean
        } | null

        return {
            id: task.id,
            task_number: task.task_number,
            title: task.title,
            description: task.description,
            status: task.status || 'Pending',
            start_date: task.start_date,
            end_date: task.end_date,
            progress: task.progress,
            risk_level: task.risk_level,
            assignee_name: task.assignee_id ? (profileMap.get(task.assignee_id) || null) : null,
            assignee_id: task.assignee_id,
            objective_title: objective?.title || '',
            strategic_goal_title: objective?.id
                ? getStrategicGoalTitle(objective.is_strategic_goal ? objective.id : objective.parent_objective_id)
                : '',
        }
    })

    // Get existing sheet tabs
    const existingTabs = await provider.getTabs(spreadsheetId)
    const tabMap = new Map(existingTabs.map(t => [t.title, t.id]))

    // Clear row map for this foundry/spreadsheet
    await admin
        .from('sheets_row_map')
        .delete()
        .eq('foundry_id', foundryId)
        .eq('spreadsheet_id', spreadsheetId)

    const rowMapInserts: Array<{
        foundry_id: string; spreadsheet_id: string; sheet_tab_name: string;
        sheet_tab_gid: string; entity_type: string; entity_id: string; row_number: number
    }> = []
    let tabsUpdated = 0

    // --- Master Task List ---
    const masterTabGid = tabMap.get('Master Task List')
    if (masterTabGid !== undefined) {
        // Clear existing data (rows 2+)
        await provider.clearRows(spreadsheetId, 'Master Task List', 2)

        const rows = taskRows.map(t => taskToMasterRow(t))
        if (rows.length > 0) {
            await provider.writeRows(spreadsheetId, 'Master Task List', 2, rows)
            rows.forEach((_, i) => {
                rowMapInserts.push({
                    foundry_id: foundryId,
                    spreadsheet_id: spreadsheetId,
                    sheet_tab_name: 'Master Task List',
                    sheet_tab_gid: String(masterTabGid),
                    entity_type: 'task',
                    entity_id: taskRows[i].id,
                    row_number: i + 2,
                })
            })
        }
        tabsUpdated++
    }

    // --- Per-Person Tabs ---
    const tasksByPerson = new Map<string, TaskRow[]>()
    for (const row of taskRows) {
        const name = row.assignee_name || 'Unassigned'
        if (!tasksByPerson.has(name)) tasksByPerson.set(name, [])
        tasksByPerson.get(name)!.push(row)
    }

    for (const [personName, personTasks] of tasksByPerson) {
        const tabGid = tabMap.get(personName)
        if (tabGid === undefined) continue

        await provider.clearRows(spreadsheetId, personName, 2)

        const rows = personTasks.map(t => taskToPersonRow(t))
        if (rows.length > 0) {
            await provider.writeRows(spreadsheetId, personName, 2, rows)
            rows.forEach((_, i) => {
                rowMapInserts.push({
                    foundry_id: foundryId,
                    spreadsheet_id: spreadsheetId,
                    sheet_tab_name: personName,
                    sheet_tab_gid: String(tabGid),
                    entity_type: 'task',
                    entity_id: personTasks[i].id,
                    row_number: i + 2,
                })
            })
        }
        tabsUpdated++
    }

    // Save row map
    if (rowMapInserts.length > 0) {
        for (let i = 0; i < rowMapInserts.length; i += 500) {
            const batch = rowMapInserts.slice(i, i + 500)
            await admin.from('sheets_row_map').insert(batch)
        }
    }

    // Rebuild Gantt tab
    await rebuildGanttTab(provider, spreadsheetId, taskRows)

    // Update sync version
    await incrementSyncVersion(foundryId, serviceType)

    // Write sync version to _sync tab
    const syncVersion = await getSyncVersion(foundryId, serviceType)
    await provider.writeCell(spreadsheetId, '_sync', 'A1', syncVersion).catch(() => {
        // INTENT: _sync update is best-effort
    })

    console.info('[SyncEngine] Full sync complete:', {
        foundryId,
        tasksWritten: taskRows.length,
        tabsUpdated,
    })

    return { tasksWritten: taskRows.length, tabsUpdated }
}

// ============================================================
// Incremental Sync — Task
// ============================================================

/**
 * Sync a single task to the spreadsheet (create, update, or delete).
 */
export async function syncTaskToSheet(
    provider: SpreadsheetProvider,
    foundryId: string,
    taskId: string,
    operation: 'create' | 'update' | 'delete',
    serviceType: string
): Promise<void> {
    const admin = createAdminClient()

    const { data: integration } = await admin
        .from('foundry_integrations')
        .select('config')
        .eq('foundry_id', foundryId)
        .eq('service_type', serviceType)
        .single()

    const config = integration?.config as Record<string, unknown> | null
    const spreadsheetId = config?.spreadsheet_id as string | undefined
    if (!spreadsheetId) return

    if (operation === 'delete') {
        await handleTaskDelete(provider, admin, foundryId, spreadsheetId, taskId)
        await incrementSyncVersion(foundryId, serviceType)
        return
    }

    // Fetch the task with objective data
    const { data: task } = await admin
        .from('tasks')
        .select(`
            id, task_number, title, description, status, start_date, end_date,
            progress, risk_level, assignee_id,
            objectives(id, title, parent_objective_id, is_strategic_goal)
        `)
        .eq('id', taskId)
        .eq('foundry_id', foundryId)
        .single()

    if (!task) return

    // Resolve assignee name
    let assigneeName: string | null = null
    if (task.assignee_id) {
        const { data: profile } = await admin
            .from('profiles')
            .select('full_name')
            .eq('id', task.assignee_id)
            .single()
        assigneeName = profile?.full_name || null
    }

    // Resolve strategic goal
    const objective = task.objectives as unknown as {
        id: string; title: string; parent_objective_id: string | null; is_strategic_goal: boolean
    } | null
    const strategicGoalTitle = await resolveStrategicGoal(admin, foundryId, objective)

    const taskRow: TaskRow = {
        id: task.id,
        task_number: task.task_number,
        title: task.title,
        description: task.description,
        status: task.status || 'Pending',
        start_date: task.start_date,
        end_date: task.end_date,
        progress: task.progress,
        risk_level: task.risk_level,
        assignee_name: assigneeName,
        assignee_id: task.assignee_id,
        objective_title: objective?.title || '',
        strategic_goal_title: strategicGoalTitle,
    }

    // Update Master Task List
    await upsertTaskInTab(
        provider, admin, foundryId, spreadsheetId,
        'Master Task List', taskRow, true
    )

    // Update person tab (if assignee exists)
    if (assigneeName) {
        await upsertTaskInTab(
            provider, admin, foundryId, spreadsheetId,
            assigneeName, taskRow, false
        )
    }

    await incrementSyncVersion(foundryId, serviceType)

    // Update _sync tab version
    const syncVersion = await getSyncVersion(foundryId, serviceType)
    await provider.writeCell(spreadsheetId, '_sync', 'A1', syncVersion).catch(() => {
        // INTENT: _sync update is best-effort
    })
}

/**
 * Sync a single objective change (title updates propagate to task rows).
 */
export async function syncObjectiveToSheet(
    provider: SpreadsheetProvider,
    foundryId: string,
    objectiveId: string,
    operation: 'create' | 'update' | 'delete',
    serviceType: string
): Promise<void> {
    // DECISION: Objective changes are rare and affect multiple task rows.
    // For create/delete, the tasks themselves will trigger sync via their own hooks.
    if (operation !== 'update') return

    const admin = createAdminClient()

    const { data: tasks } = await admin
        .from('tasks')
        .select('id')
        .eq('objective_id', objectiveId)
        .eq('foundry_id', foundryId)
        .is('deleted_at', null)

    if (!tasks || tasks.length === 0) return

    for (const task of tasks) {
        await syncTaskToSheet(provider, foundryId, task.id, 'update', serviceType)
    }
}

// ============================================================
// Inbound Sync (Spreadsheet → ForgeOS)
// ============================================================

/**
 * Apply changes made in the spreadsheet back to ForgeOS.
 *
 * @param foundryId - The foundry the sheet belongs to
 * @param changes - Array of cell changes
 * @returns Count of applied changes and any errors
 */
export async function applyInboundChanges(
    foundryId: string,
    changes: InboundChange[]
): Promise<{ applied: number; errors: string[] }> {
    const admin = createAdminClient()
    let applied = 0
    const errors: string[] = []

    for (const change of changes) {
        try {
            const result = await applyOneChange(admin, foundryId, change)
            if (result.success) {
                applied++
            } else if (result.error) {
                errors.push(`${change.entityId}:${change.column}: ${result.error}`)
            }
        } catch (err) {
            errors.push(
                `${change.entityId}:${change.column}: ${err instanceof Error ? err.message : 'Unknown error'}`
            )
        }
    }

    return { applied, errors }
}

async function applyOneChange(
    admin: ReturnType<typeof createAdminClient>,
    foundryId: string,
    change: InboundChange
): Promise<{ success: boolean; error?: string }> {
    const { entityId, column, newValue } = change

    // SECURITY: Validate the entity belongs to this foundry
    const { data: task } = await admin
        .from('tasks')
        .select('id, foundry_id')
        .eq('id', entityId)
        .single()

    if (!task || task.foundry_id !== foundryId) {
        return { success: false, error: 'Task not found in this foundry' }
    }

    const updateData: Record<string, unknown> = {}

    switch (column) {
        case 'Task Title':
            if (!newValue.trim()) return { success: false, error: 'Title cannot be empty' }
            updateData.title = newValue.trim()
            break
        case 'Description':
            updateData.description = newValue || null
            break
        case 'Status':
            if (!VALID_STATUSES.includes(newValue)) {
                return { success: false, error: `Invalid status: ${newValue}` }
            }
            updateData.status = newValue
            break
        case 'Start Date':
            if (newValue && !isValidDate(newValue)) {
                return { success: false, error: 'Invalid date format' }
            }
            updateData.start_date = newValue || null
            break
        case 'End Date':
            if (newValue && !isValidDate(newValue)) {
                return { success: false, error: 'Invalid date format' }
            }
            updateData.end_date = newValue || null
            break
        case 'Progress %': {
            const progress = Number(newValue)
            if (isNaN(progress) || progress < 0 || progress > 100) {
                return { success: false, error: 'Progress must be 0-100' }
            }
            updateData.progress = Math.round(progress)
            break
        }
        case 'Risk Level':
            if (!VALID_RISK_LEVELS.includes(newValue)) {
                return { success: false, error: `Invalid risk level: ${newValue}` }
            }
            updateData.risk_level = newValue
            break
        case 'Assignee': {
            const { data: profile } = await admin
                .from('profiles')
                .select('id')
                .eq('foundry_id', foundryId)
                .eq('full_name', newValue)
                .eq('is_active', true)
                .maybeSingle()

            if (!profile && newValue.trim()) {
                return { success: false, error: `Unknown team member: ${newValue}` }
            }
            updateData.assignee_id = profile?.id || null
            break
        }
        default:
            // INTENT: Ignore edits to read-only columns (Task ID, Task #, Strategic Goal, Objective)
            return { success: false }
    }

    if (Object.keys(updateData).length === 0) return { success: false }

    const { error } = await admin
        .from('tasks')
        .update(updateData)
        .eq('id', entityId)
        .eq('foundry_id', foundryId)

    if (error) {
        return { success: false, error: error.message }
    }

    // Log inbound sync
    await admin.from('sheets_sync_log').insert({
        foundry_id: foundryId,
        direction: 'inbound',
        entity_type: 'task',
        entity_id: entityId,
        operation: 'update',
        status: 'success',
        metadata: { column, newValue },
    })

    return { success: true }
}

// ============================================================
// Gantt Tab
// ============================================================

async function rebuildGanttTab(
    provider: SpreadsheetProvider,
    spreadsheetId: string,
    taskRows: TaskRow[]
): Promise<void> {
    const datedTasks = taskRows.filter(t => t.start_date || t.end_date)
    if (datedTasks.length === 0) return

    // Calculate date range
    const allDates = datedTasks.flatMap(t => [t.start_date, t.end_date].filter(Boolean)) as string[]
    const minDate = new Date(allDates.reduce((min, d) => d < min ? d : min))
    const maxDate = new Date(allDates.reduce((max, d) => d > max ? d : max))

    minDate.setDate(minDate.getDate() - 7)
    maxDate.setDate(maxDate.getDate() + 14)

    // Round to start of week (Monday)
    const startWeek = new Date(minDate)
    startWeek.setDate(startWeek.getDate() - ((startWeek.getDay() + 6) % 7))

    // Generate week columns
    const weeks: Date[] = []
    const current = new Date(startWeek)
    while (current <= maxDate) {
        weeks.push(new Date(current))
        current.setDate(current.getDate() + 7)
    }

    // Build header + data rows
    const ganttHeaders = ['Objective', 'Task', 'Assignee', 'Start', 'End', ...weeks.map(formatWeekLabel)]

    const sortedTasks = [...datedTasks].sort((a, b) => {
        if (a.objective_title !== b.objective_title) {
            return (a.objective_title || '').localeCompare(b.objective_title || '')
        }
        return (a.task_number || 0) - (b.task_number || 0)
    })

    const ganttRows: string[][] = sortedTasks.map(task => [
        task.objective_title || '',
        task.title,
        task.assignee_name || '',
        task.start_date || '',
        task.end_date || '',
        ...weeks.map(() => ''),
    ])

    // Clear and write Gantt data
    await provider.clearRows(spreadsheetId, 'Master Gantt', 1)
    const allRows = [ganttHeaders, ...ganttRows]
    await provider.writeRows(spreadsheetId, 'Master Gantt', 1, allRows)

    // Build color data for each task
    const ganttColorTasks: Array<{ rowIndex: number; weekIndices: number[]; color: CellColor }> = []

    for (let rowIdx = 0; rowIdx < sortedTasks.length; rowIdx++) {
        const task = sortedTasks[rowIdx]
        const taskStart = task.start_date ? new Date(task.start_date) : null
        const taskEnd = task.end_date ? new Date(task.end_date) : null

        if (!taskStart && !taskEnd) continue

        const effectiveStart = taskStart || taskEnd!
        const effectiveEnd = taskEnd || taskStart!

        const weekIndices: number[] = []
        for (let weekIdx = 0; weekIdx < weeks.length; weekIdx++) {
            const weekStart = weeks[weekIdx]
            const weekEnd = new Date(weekStart)
            weekEnd.setDate(weekEnd.getDate() + 6)

            if (effectiveStart <= weekEnd && effectiveEnd >= weekStart) {
                weekIndices.push(weekIdx)
            }
        }

        if (weekIndices.length > 0) {
            ganttColorTasks.push({
                rowIndex: rowIdx,
                weekIndices,
                color: getGanttColor(task.status, task.risk_level),
            })
        }
    }

    await provider.formatGantt(spreadsheetId, 'Master Gantt', 5, ganttColorTasks)
}

// ============================================================
// Sync Version
// ============================================================

/**
 * Atomically increment the sync version counter via database RPC.
 * Uses SELECT ... FOR UPDATE to prevent race conditions.
 */
export async function incrementSyncVersion(foundryId: string, serviceType: string): Promise<number> {
    const admin = createAdminClient()

    const { data, error } = await admin.rpc('increment_sync_version', {
        p_foundry_id: foundryId,
        p_service_type: serviceType,
    })

    if (error) {
        console.error('[SyncEngine] increment_sync_version RPC failed:', { foundryId, serviceType, error: error.message })
        throw new Error(`Failed to increment sync version: ${error.message}`)
    }

    return data as number
}

/**
 * Get the current sync version for a foundry.
 */
export async function getSyncVersion(foundryId: string, serviceType: string): Promise<number> {
    const admin = createAdminClient()

    const { data } = await admin
        .from('foundry_integrations')
        .select('config')
        .eq('foundry_id', foundryId)
        .eq('service_type', serviceType)
        .single()

    const config = (data?.config as Record<string, unknown>) || {}
    return (config.sync_version as number) || 0
}

// ============================================================
// Helpers
// ============================================================

function taskToMasterRow(t: TaskRow): (string | number | null)[] {
    return [
        t.id,
        t.task_number,
        t.strategic_goal_title,
        t.objective_title,
        t.title,
        t.description || '',
        t.assignee_name || '',
        t.status,
        t.start_date || '',
        t.end_date || '',
        t.progress ?? '',
        t.risk_level || '',
    ]
}

function taskToPersonRow(t: TaskRow): (string | number | null)[] {
    return [
        t.id,
        t.task_number,
        t.strategic_goal_title,
        t.objective_title,
        t.title,
        t.description || '',
        t.status,
        t.start_date || '',
        t.end_date || '',
        t.progress ?? '',
        t.risk_level || '',
    ]
}

function formatWeekLabel(date: Date): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[date.getMonth()]} ${date.getDate()}`
}

function getGanttColor(status: string, riskLevel: string | null): CellColor {
    if (status === 'Completed') return { red: 0.204, green: 0.659, blue: 0.325 }
    if (riskLevel === 'High') return { red: 0.918, green: 0.549, blue: 0.204 }
    if (status === 'Accepted') return { red: 0.263, green: 0.522, blue: 0.957 }
    return { red: 0.604, green: 0.627, blue: 0.651 }
}

function isValidDate(value: string): boolean {
    const d = new Date(value)
    return !isNaN(d.getTime())
}

async function resolveStrategicGoal(
    admin: ReturnType<typeof createAdminClient>,
    foundryId: string,
    objective: { id: string; title: string; parent_objective_id: string | null; is_strategic_goal: boolean } | null
): Promise<string> {
    if (!objective) return ''
    if (objective.is_strategic_goal) return objective.title

    let parentId = objective.parent_objective_id
    const visited = new Set<string>([objective.id])

    while (parentId) {
        if (visited.has(parentId)) break
        visited.add(parentId)

        const { data: parent } = await admin
            .from('objectives')
            .select('id, title, parent_objective_id, is_strategic_goal')
            .eq('id', parentId)
            .eq('foundry_id', foundryId)
            .single()

        if (!parent) break
        if (parent.is_strategic_goal) return parent.title
        parentId = parent.parent_objective_id
    }

    return ''
}

async function upsertTaskInTab(
    provider: SpreadsheetProvider,
    admin: ReturnType<typeof createAdminClient>,
    foundryId: string,
    spreadsheetId: string,
    tabName: string,
    taskRow: TaskRow,
    isMaster: boolean
): Promise<void> {
    const row = isMaster ? taskToMasterRow(taskRow) : taskToPersonRow(taskRow)

    // Check if we have a row mapping
    const { data: existing } = await admin
        .from('sheets_row_map')
        .select('row_number, sheet_tab_gid')
        .eq('foundry_id', foundryId)
        .eq('spreadsheet_id', spreadsheetId)
        .eq('sheet_tab_name', tabName)
        .eq('entity_id', taskRow.id)
        .maybeSingle()

    if (existing) {
        await provider.updateRow(spreadsheetId, tabName, existing.row_number, row)
    } else {
        const newRowNumber = await provider.appendRow(spreadsheetId, tabName, row)

        // Get tab GID
        const tabs = await provider.getTabs(spreadsheetId)
        const tabGid = tabs.find(t => t.title === tabName)?.id

        if (newRowNumber && tabGid !== undefined) {
            await admin.from('sheets_row_map').upsert({
                foundry_id: foundryId,
                spreadsheet_id: spreadsheetId,
                sheet_tab_name: tabName,
                sheet_tab_gid: String(tabGid),
                entity_type: 'task',
                entity_id: taskRow.id,
                row_number: newRowNumber,
            }, { onConflict: 'foundry_id,spreadsheet_id,sheet_tab_name,entity_id' })
        }
    }
}

async function handleTaskDelete(
    provider: SpreadsheetProvider,
    admin: ReturnType<typeof createAdminClient>,
    foundryId: string,
    spreadsheetId: string,
    taskId: string
): Promise<void> {
    const { data: mappings } = await admin
        .from('sheets_row_map')
        .select('sheet_tab_name, row_number')
        .eq('foundry_id', foundryId)
        .eq('spreadsheet_id', spreadsheetId)
        .eq('entity_id', taskId)

    if (!mappings || mappings.length === 0) return

    await provider.clearSpecificRows(
        spreadsheetId,
        mappings.map(m => ({ tabName: m.sheet_tab_name, rowNumber: m.row_number }))
    )

    await admin
        .from('sheets_row_map')
        .delete()
        .eq('foundry_id', foundryId)
        .eq('spreadsheet_id', spreadsheetId)
        .eq('entity_id', taskId)
}
