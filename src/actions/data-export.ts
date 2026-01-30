'use server'


import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

export type ExportFormat = 'csv' | 'excel'
export type ExportableTable = 'profiles' | 'tasks' | 'objectives' | 'standups' | 'teams' | 'orders'

interface DateRange {
    from: string
    to?: string
}

interface ExportRow {
    [key: string]: string | number | boolean | null
}

/**
 * Export foundry data to CSV or Excel format
 * 
 * RED TEAM FIX: Added proper permission checks for Executives
 */
export async function exportFoundryData(
    format: ExportFormat,
    tables: ExportableTable[],
    dateRange?: DateRange
): Promise<{ data?: string; error?: string }> {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }
    
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }
    
    // Verify user has permission (Founder, Executive, or admin permission)
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', user.id)
        .single()
    
    if (!profile) return { error: 'Profile not found' }
    
    // RED TEAM FIX: Check is_active status
    if (!profile.is_active) {
        return { error: 'Your account is not active' }
    }
    
    // Check if founder, executive, or has admin permission
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
            return { error: 'Admin permission required to export data' }
        }
    }
    
    try {
        const allData: Record<string, ExportRow[]> = {}
        
        // Fetch data for each requested table
        for (const table of tables) {
            const data = await fetchTableData(supabase, table, foundry_id, dateRange)
            if (data.length > 0) {
                allData[table] = data
            }
        }
        
        if (Object.keys(allData).length === 0) {
            return { error: 'No data found for the selected tables' }
        }
        
        // Convert to CSV format
        const csv = convertToCSV(allData)
        return { data: csv }
    } catch (err) {
        console.error('Export error:', err)
        return { error: 'Failed to export data' }
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchTableData(
    supabase: any,
    table: ExportableTable,
    foundryId: string,
    dateRange?: DateRange
): Promise<ExportRow[]> {
    let query
    
    switch (table) {
        case 'profiles':
            query = supabase
                .from('profiles')
                .select('id, email, full_name, role, is_active, created_at')
                .eq('foundry_id', foundryId)
            break
            
        case 'tasks':
            query = supabase
                .from('tasks')
                .select(`
                    id, 
                    title, 
                    description, 
                    status, 
                    start_date, 
                    end_date, 
                    created_at,
                    creator:creator_id(full_name),
                    assignee:assignee_id(full_name)
                `)
                .eq('foundry_id', foundryId)
            
            if (dateRange?.from) {
                query = query.gte('created_at', dateRange.from)
            }
            if (dateRange?.to) {
                query = query.lte('created_at', dateRange.to)
            }
            break
            
        case 'objectives':
            query = supabase
                .from('objectives')
                .select(`
                    id,
                    title,
                    description,
                    status,
                    progress,
                    created_at,
                    creator:creator_id(full_name)
                `)
                .eq('foundry_id', foundryId)
            
            if (dateRange?.from) {
                query = query.gte('created_at', dateRange.from)
            }
            if (dateRange?.to) {
                query = query.lte('created_at', dateRange.to)
            }
            break
            
        case 'standups':
            query = supabase
                .from('standups')
                .select(`
                    id,
                    standup_date,
                    completed,
                    planned,
                    blockers,
                    mood,
                    submitted_at,
                    user:user_id(full_name)
                `)
                .eq('foundry_id', foundryId)
            
            if (dateRange?.from) {
                query = query.gte('standup_date', dateRange.from)
            }
            if (dateRange?.to) {
                query = query.lte('standup_date', dateRange.to)
            }
            break
            
        case 'teams':
            query = supabase
                .from('teams')
                .select(`
                    id,
                    name,
                    is_auto_generated,
                    created_at,
                    team_members(profile_id, profiles:profile_id(full_name))
                `)
                .eq('foundry_id', foundryId)
            break
            
        case 'orders':
            // Orders might not have foundry_id directly
            try {
                query = supabase
                    .from('orders')
                    .select(`
                        id,
                        order_number,
                        status,
                        total_amount,
                        currency,
                        created_at,
                        completed_at
                    `)
                    .limit(1000)
            } catch {
                return []
            }
            break
            
        default:
            return []
    }
    
    const { data, error } = await query.order('created_at', { ascending: false }).limit(10000)
    
    if (error) {
        console.error(`Error fetching ${table}:`, error)
        return []
    }
    
    // Flatten nested objects
    return (data || []).map((row: Record<string, unknown>) => flattenObject(row))
}

function flattenObject(obj: Record<string, unknown>, prefix = ''): ExportRow {
    const result: ExportRow = {}
    
    for (const [key, value] of Object.entries(obj)) {
        const newKey = prefix ? `${prefix}_${key}` : key
        
        if (value === null || value === undefined) {
            result[newKey] = null
        } else if (typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(result, flattenObject(value as Record<string, unknown>, newKey))
        } else if (Array.isArray(value)) {
            result[newKey] = value.map(v => 
                typeof v === 'object' ? JSON.stringify(v) : String(v)
            ).join('; ')
        } else {
            result[newKey] = value as string | number | boolean
        }
    }
    
    return result
}

function convertToCSV(allData: Record<string, ExportRow[]>): string {
    const sections: string[] = []
    
    for (const [tableName, rows] of Object.entries(allData)) {
        if (rows.length === 0) continue
        
        // Add section header
        sections.push(`\n=== ${tableName.toUpperCase()} ===\n`)
        
        // Get all unique columns
        const columns = new Set<string>()
        rows.forEach(row => {
            Object.keys(row).forEach(key => columns.add(key))
        })
        const columnList = Array.from(columns)
        
        // Add header row
        sections.push(columnList.map(escapeCSV).join(','))
        
        // Add data rows
        rows.forEach(row => {
            const values = columnList.map(col => {
                const value = row[col]
                if (value === null || value === undefined) return ''
                return escapeCSV(String(value))
            })
            sections.push(values.join(','))
        })
    }
    
    return sections.join('\n')
}

function escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('\n') || value.includes('"')) {
        return `"${value.replace(/"/g, '""')}"`
    }
    return value
}

/**
 * Get export statistics (counts per table)
 */
export async function getExportStats(): Promise<{
    stats: Record<ExportableTable, number>
    error?: string
}> {
    const supabase = await createClient()
    
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { stats: {} as Record<ExportableTable, number>, error: 'User not in a foundry' }
    
    const stats: Partial<Record<ExportableTable, number>> = {}
    
    const tables: { table: ExportableTable; query: string }[] = [
        { table: 'profiles', query: 'profiles' },
        { table: 'tasks', query: 'tasks' },
        { table: 'objectives', query: 'objectives' },
        { table: 'standups', query: 'standups' },
        { table: 'teams', query: 'teams' },
    ]
    
    for (const { table, query } of tables) {
        // Use type assertion to avoid deep type instantiation error
        const { count } = await (supabase
            .from(query as 'profiles')
            .select('id', { count: 'exact', head: true })
            .eq('foundry_id', foundry_id) as unknown as Promise<{ count: number | null }>)
        
        stats[table] = count || 0
    }
    
    return { stats: stats as Record<ExportableTable, number> }
}
