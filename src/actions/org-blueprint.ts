'use server'
// @ts-nocheck - Database types out of sync

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { FunctionCategory } from '@/types/org-blueprint'

// Database types (matching the migration schema)
interface DBBusinessFunction {
    id: string
    category: string
    name: string
    description: string | null
    typical_roles: string[] | null
    is_critical: boolean
    display_order: number
    created_at: string
}

interface DBFunctionCoverage {
    id: string
    foundry_id: string
    function_id: string
    coverage_status: 'covered' | 'partial' | 'gap' | 'not_needed'
    covered_by: string | null
    notes: string | null
    assessed_at: string | null
    assessed_by: string | null
    created_at: string
    updated_at: string
}

// Combined type for the view
export interface BusinessFunctionWithCoverage {
    id: string
    function_id: string
    category: string
    name: string
    description: string | null
    is_critical: boolean
    coverage_status: 'covered' | 'partial' | 'gap' | 'not_needed'
    covered_by: string | null
    notes: string | null
}

export interface CoverageSummary {
    totalFunctions: number
    covered: number
    partial: number
    gaps: number
    notApplicable: number
    overallCoveragePercentage: number
    byCategory: {
        category: FunctionCategory
        total: number
        covered: number
        partial: number
        gaps: number
        notApplicable: number
        coveragePercentage: number
    }[]
}

// Get all business functions with coverage status for current foundry
export async function getBusinessFunctions(): Promise<{ data: BusinessFunctionWithCoverage[] | null; error: string | null }> {
    const supabase = await createClient()
    const foundry_id = await getFoundryIdCached()

    if (!foundry_id) {
        return { data: null, error: 'No foundry context' }
    }

    // Get all business functions from the catalog
    const { data: functions, error: functionsError } = await supabase
        .from('business_functions')
        .select('*')
        .order('category')
        .order('display_order')

    if (functionsError) {
        // Table may not exist - return empty array instead of failing
        console.warn('Business functions table not available:', functionsError.code || 'unknown')
        return { data: [], error: null }
    }

    // Get coverage records for this foundry
    const { data: coverage, error: coverageError } = await supabase
        .from('foundry_function_coverage')
        .select('*')
        .eq('foundry_id', foundry_id)

    if (coverageError) {
        console.error('Error fetching coverage:', coverageError)
        return { data: null, error: coverageError.message }
    }

    // Create a map of coverage by function_id
    const coverageMap = new Map<string, DBFunctionCoverage>()
    if (coverage) {
        (coverage as unknown as DBFunctionCoverage[]).forEach((c: DBFunctionCoverage) => coverageMap.set(c.function_id, c))
    }

    // Combine functions with their coverage
    const combined: BusinessFunctionWithCoverage[] = (functions as DBBusinessFunction[]).map(fn => {
        const fnCoverage = coverageMap.get(fn.id)
        return {
            id: fnCoverage?.id || fn.id, // Use coverage ID if exists, else function ID
            function_id: fn.id,
            category: fn.category,
            name: fn.name,
            description: fn.description,
            is_critical: fn.is_critical,
            coverage_status: fnCoverage?.coverage_status || 'gap',
            covered_by: fnCoverage?.covered_by || null,
            notes: fnCoverage?.notes || null,
        }
    })

    return { data: combined, error: null }
}

// Get coverage summary
export async function getCoverageSummary(): Promise<{ data: CoverageSummary | null; error: string | null }> {
    const { data: functions, error } = await getBusinessFunctions()

    if (error || !functions) {
        return { data: null, error: error || 'No functions found' }
    }

    // Get unique categories
    const categories = [...new Set(functions.map(f => f.category))]

    const byCategory = categories.map(category => {
        const categoryFunctions = functions.filter(f => f.category === category)
        const total = categoryFunctions.length
        const covered = categoryFunctions.filter(f => f.coverage_status === 'covered').length
        const partial = categoryFunctions.filter(f => f.coverage_status === 'partial').length
        const gaps = categoryFunctions.filter(f => f.coverage_status === 'gap').length
        const notApplicable = categoryFunctions.filter(f => f.coverage_status === 'not_needed').length

        const applicableTotal = total - notApplicable
        const coveragePercentage = applicableTotal > 0
            ? Math.round(((covered + partial * 0.5) / applicableTotal) * 100)
            : 100

        return {
            category: category as FunctionCategory,
            total,
            covered,
            partial,
            gaps,
            notApplicable,
            coveragePercentage,
        }
    })

    const totalFunctions = functions.length
    const covered = functions.filter(f => f.coverage_status === 'covered').length
    const partial = functions.filter(f => f.coverage_status === 'partial').length
    const gaps = functions.filter(f => f.coverage_status === 'gap').length
    const notApplicable = functions.filter(f => f.coverage_status === 'not_needed').length

    const applicableTotal = totalFunctions - notApplicable
    const overallCoveragePercentage = applicableTotal > 0
        ? Math.round(((covered + partial * 0.5) / applicableTotal) * 100)
        : 100

    return {
        data: {
            totalFunctions,
            covered,
            partial,
            gaps,
            notApplicable,
            overallCoveragePercentage,
            byCategory,
        },
        error: null,
    }
}

// Initialize coverage records for a foundry (creates gap records for all functions)
export async function initializeBusinessFunctions(): Promise<{ error: string | null }> {
    const supabase = await createClient()
    const foundry_id = await getFoundryIdCached()

    if (!foundry_id) {
        return { error: 'No foundry context' }
    }

    // Check if any coverage records already exist
    const { data: existing } = await supabase
        .from('foundry_function_coverage')
        .select('id')
        .eq('foundry_id', foundry_id)
        .limit(1)

    if (existing && existing.length > 0) {
        return { error: null } // Already initialized
    }

    // Get all business functions from the catalog
    const { data: functions, error: functionsError } = await supabase
        .from('business_functions')
        .select('id')

    if (functionsError) {
        // Table may not exist - silently return
        console.warn('Business functions table not available:', functionsError.code || 'unknown')
        return { error: null }
    }

    if (!functions || functions.length === 0) {
        // No functions in catalog - nothing to initialize
        return { error: null }
    }

    // Create coverage records for all functions (default to gap)
    const coverageRecords = functions.map((fn: { id: string }) => ({
        foundry_id,
        function_id: fn.id,
        coverage_status: 'gap',
        covered_by: null,
        notes: null,
    }))

    const { error } = await supabase
        .from('foundry_function_coverage')
        .insert(coverageRecords)

    if (error) {
        console.error('Error initializing coverage:', error)
        return { error: error.message }
    }

    revalidatePath('/org-blueprint')
    return { error: null }
}

// Update the coverage status of a function
export async function updateFunctionStatus(
    functionId: string,
    status: 'covered' | 'partial' | 'gap' | 'not_needed',
    coveredBy?: string,
    notes?: string
): Promise<{ error: string | null }> {
    const supabase = await createClient()
    const foundry_id = await getFoundryIdCached()

    if (!foundry_id) {
        return { error: 'No foundry context' }
    }

    // Upsert the coverage record
    const { error } = await supabase
        .from('foundry_function_coverage')
        .upsert({
            foundry_id,
            function_id: functionId,
            coverage_status: status,
            covered_by: status === 'covered' || status === 'partial' ? coveredBy : null,
            notes: notes || null,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'foundry_id,function_id'
        })

    if (error) {
        console.error('Error updating function status:', error)
        return { error: error.message }
    }

    revalidatePath('/org-blueprint')
    revalidatePath('/dashboard')
    return { error: null }
}

// Save assessment answers (batch update)
export async function saveAssessment(answers: {
    functionId: string
    status: 'covered' | 'partial' | 'gap' | 'not_needed'
    coveredBy?: string
    notes?: string
}[]): Promise<{ error: string | null }> {
    const supabase = await createClient()
    const foundry_id = await getFoundryIdCached()

    if (!foundry_id) {
        return { error: 'No foundry context' }
    }

    // Update each function's coverage
    for (const answer of answers) {
        const { error } = await supabase
            .from('foundry_function_coverage')
            .upsert({
                foundry_id,
                function_id: answer.functionId,
                coverage_status: answer.status,
                covered_by: answer.coveredBy || null,
                notes: answer.notes || null,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'foundry_id,function_id'
            })

        if (error) {
            console.error('Error updating function:', error)
            return { error: `Failed to update function: ${error.message}` }
        }
    }

    revalidatePath('/org-blueprint')
    revalidatePath('/dashboard')
    return { error: null }
}
