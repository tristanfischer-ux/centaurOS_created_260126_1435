'use server'

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

/**
 * Foundry context data used for personalising Inspiration and Marketplace pages.
 * Fetches industry, stage, and coverage gaps in a single call.
 */
export interface FoundryContext {
    foundryId: string | null
    industry: string | null
    stage: string | null
    /** Business function categories where coverage_status is 'gap' */
    gapCategories: string[]
    /** Detailed gaps: category + function name */
    gaps: { category: string; name: string; isCritical: boolean }[]
}

const EMPTY_CONTEXT: FoundryContext = {
    foundryId: null,
    industry: null,
    stage: null,
    gapCategories: [],
    gaps: [],
}

/**
 * Get the current foundry's context for personalisation.
 * Returns industry, company stage, and coverage gaps.
 * Gracefully returns empty context if no foundry or on error.
 */
export async function getFoundryContext(): Promise<FoundryContext> {
    try {
        const foundryId = await getFoundryIdCached()
        if (!foundryId) return EMPTY_CONTEXT

        const supabase = await createClient()

        // Fetch foundry profile and coverage gaps in parallel
        const [foundryResult, gapsResult] = await Promise.all([
            supabase
                .from('foundries')
                .select('industry, stage')
                .eq('id', foundryId)
                .single(),
            supabase
                .from('foundry_function_coverage')
                .select('function_id, coverage_status')
                .eq('foundry_id', foundryId)
                .eq('coverage_status', 'gap'),
        ])

        const industry = foundryResult.data?.industry || null
        const stage = foundryResult.data?.stage || null

        // If we have gaps, fetch the function details
        let gaps: FoundryContext['gaps'] = []
        let gapCategories: string[] = []

        if (gapsResult.data && gapsResult.data.length > 0) {
            const functionIds = gapsResult.data.map(g => g.function_id)

            const { data: functions } = await supabase
                .from('business_functions')
                .select('id, category, name, is_critical')
                .in('id', functionIds)

            if (functions) {
                gaps = functions.map(f => ({
                    category: f.category,
                    name: f.name,
                    isCritical: f.is_critical,
                }))
                gapCategories = [...new Set(functions.map(f => f.category))]
            }
        }

        return { foundryId, industry, stage, gapCategories, gaps }
    } catch (err) {
        console.error('[FoundryContext] Failed to fetch:', err)
        return EMPTY_CONTEXT
    }
}
