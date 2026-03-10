'use server'


import { createClient } from '@/lib/supabase/server'
import { unstable_noStore as noStore } from 'next/cache'
import { revalidatePath } from 'next/cache'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'

export type PackItem = {
    id: string
    title: string
    description: string | null
    role: 'Executive' | 'Apprentice' | 'AI_Agent'
    order_index: number
}

export type ObjectivePack = {
    id: string
    title: string
    description: string | null
    category: string | null
    /** Industry category slug (e.g., 'robotics', 'rockets') for filtering by industry */
    product_category?: string | null
    difficulty: string | null
    estimated_duration: string | null
    icon_name: string | null
    prerequisites?: string[] | null
    success_criteria?: string[] | null
    tags?: string[] | null
    items?: PackItem[]
}

/**
 * Options for filtering objective packs
 */
export type GetObjectivePacksOptions = {
    /** Filter by product category (industry slug like 'robotics', 'rockets', etc.) */
    productCategory?: string
}

// Type for subsystem pack task from JSONB
type SubsystemTask = {
    order: number
    title: string
    description?: string
    role?: 'Executive' | 'Apprentice' | 'AI_Agent'
    estimated_hours?: number
    is_marketplace_task?: boolean
}

/**
 * Fetches objective packs from both objective_packs and subsystem_objective_packs tables.
 * Combines and normalizes the data into a unified ObjectivePack format.
 * 
 * @param options - Optional filtering options
 * @param options.productCategory - Filter by product category (industry slug like 'robotics', 'rockets', etc.)
 * @returns Promise with packs array and optional error
 */
export async function getObjectivePacks(options?: GetObjectivePacksOptions): Promise<{ packs: ObjectivePack[], error?: string }> {
    noStore()
    
    let supabase;
    try {
        supabase = await createClient()
    } catch (clientError) {
        console.error('[getObjectivePacks] Failed to create Supabase client:', clientError)
        return { packs: [], error: 'Failed to create database client' }
    }

    // Build query for original objective_packs table
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let originalQuery: any = supabase
        .from('objective_packs')
        .select('*, items:pack_items(*)')
    
    // Filter by product_category if specified
    // Note: product_category column added via migration, may not be in generated types yet
    if (options?.productCategory) {
        originalQuery = originalQuery.eq('product_category', options.productCategory)
    }
    
    let originalPacks, originalError;
    try {
        const result = await originalQuery.order('title')
        originalPacks = result.data
        originalError = result.error
    } catch (queryError) {
        console.error('[getObjectivePacks] Query threw exception:', queryError)
        return { packs: [], error: 'Database query failed' }
    }

    if (originalError) {
        console.error('[getObjectivePacks] Error fetching objective packs:', originalError)
        return { packs: [], error: sanitizeErrorMessage(originalError) }
    }

    // Skip subsystem packs when filtering by productCategory (they don't have product_category)
    // Only fetch from subsystem_objective_packs when not filtering by industry
    let subsystemPacks: unknown[] | null = null
    let subsystemError: Error | null = null
    
    if (!options?.productCategory) {
        try {
            // Fetch from subsystem_objective_packs table with subsystem category
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await supabase
                .from('subsystem_objective_packs')
                .select(`
                    id,
                    title,
                    summary,
                    extended_description,
                    difficulty,
                    estimated_duration,
                    tasks,
                    subsystem:universal_subsystems(category, icon_name)
                `)
                .order('title')
            
            subsystemPacks = result.data
            subsystemError = result.error
            
            if (subsystemError) {
                console.error('[getObjectivePacks] Error fetching subsystem packs:', subsystemError)
                // Don't fail completely, just return original packs
            }
        } catch (subsystemQueryError) {
            console.error('[getObjectivePacks] Subsystem query threw exception:', subsystemQueryError)
            // Don't fail completely, just return original packs
        }
    }

    // Transform subsystem packs to match ObjectivePack format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transformedSubsystemPacks: ObjectivePack[] = ((subsystemPacks || []) as any[]).map((pack: {
        id: string
        title: string
        summary: string | null
        extended_description: string | null
        difficulty: string | null
        estimated_duration: string | null
        tasks: SubsystemTask[]
        subsystem: { category: string | null; icon_name: string | null } | null
    }) => {
        // Transform tasks JSONB array to PackItem format
        const items: PackItem[] = (pack.tasks || []).map((task: SubsystemTask, index: number) => ({
            id: `${pack.id}-task-${index}`,
            title: task.title,
            description: task.description || null,
            role: task.role || 'Executive',
            order_index: task.order || index + 1,
        }))

        // Map subsystem categories to our category filter system
        // Subsystem categories: Electronics, Mechanical, Software, Manufacturing, Regulatory, Business, Operations
        // Our filters: engineering, security, infrastructure for 'subsystems'
        const subsystemCategory = pack.subsystem?.category?.toLowerCase() || 'infrastructure'
        let mappedCategory = 'Infrastructure'
        
        if (['electronics', 'mechanical', 'software'].includes(subsystemCategory)) {
            mappedCategory = 'Engineering'
        } else if (['regulatory'].includes(subsystemCategory)) {
            mappedCategory = 'Security'
        } else if (['manufacturing', 'operations', 'business'].includes(subsystemCategory)) {
            mappedCategory = 'Infrastructure'
        }

        return {
            id: pack.id,
            title: pack.title,
            description: pack.summary || pack.extended_description,
            category: mappedCategory,
            product_category: null, // Subsystem packs don't have product_category
            difficulty: pack.difficulty ? pack.difficulty.charAt(0).toUpperCase() + pack.difficulty.slice(1) : null,
            estimated_duration: pack.estimated_duration,
            icon_name: pack.subsystem?.icon_name || 'boxes',
            items,
        }
    })

    // Combine both sources
    // Cast through unknown to handle the product_category field which may not be in generated types yet
    try {
        const allPacks = [...(originalPacks as unknown as ObjectivePack[]), ...transformedSubsystemPacks]

        // Sort combined results by title
        allPacks.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))

        return { packs: allPacks }
    } catch (combineError) {
        console.error('[getObjectivePacks] Error combining packs:', combineError)
        // Fall back to original packs only
        return { packs: (originalPacks as unknown as ObjectivePack[]) || [] }
    }
}

export async function getPackDetails(packId: string): Promise<{ pack: ObjectivePack | null, error?: string }> {
    noStore()
    const supabase = await createClient()

    // Fetch pack info
    const { data: pack, error: packError } = await supabase
        .from('objective_packs')
        .select('*')
        .eq('id', packId)
        .single()

    if (packError || !pack) {
        return { pack: null, error: packError ? sanitizeErrorMessage(packError) : 'Pack not found' }
    }

    // Fetch items
    const { data: items, error: itemsError } = await supabase
        .from('pack_items')
        .select('*')
        .eq('pack_id', packId)
        .order('order_index')

    if (itemsError) {
        return { pack: null, error: sanitizeErrorMessage(itemsError) }
    }

    // Cast through unknown to handle the product_category field which may not be in generated types yet
    return {
        pack: {
            ...(pack as unknown as ObjectivePack),
            items: items as PackItem[]
        }
    }
}

/**
 * Save a pack to user's favorites
 * 
 * @param packId - The pack ID to save
 * @returns Success status and error message if failed
 * 
 * @security User can only save to their own favorites (enforced by RLS)
 * @audit Creates record in saved_packs table
 */
export async function savePack(packId: string): Promise<{
    success: boolean
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }

        // Insert saved pack
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
            .from('saved_packs')
            .insert({
                user_id: user.id,
                pack_id: packId
            })

        if (error) {
            // Unique constraint violation - already saved
            if (error.code === '23505') {
                return { success: true, error: null } // Treat as success
            }
            console.error('[savePack] Error:', error)
            return { success: false, error: 'Failed to save pack' }
        }

        revalidatePath('/playbooks')
        return { success: true, error: null }
    } catch (err) {
        console.error('[savePack] Exception:', err)
        return { success: false, error: 'Failed to save pack' }
    }
}

/**
 * Unsave a pack from user's favorites
 * 
 * @param packId - The pack ID to unsave
 * @returns Success status and error message if failed
 * 
 * @security User can only unsave their own favorites (enforced by RLS)
 * @audit Removes record from saved_packs table
 */
export async function unsavePack(packId: string): Promise<{
    success: boolean
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }

        const { error } = await supabase
            .from('saved_packs' as unknown as 'profiles')
            .delete()
            .eq('user_id', user.id)
            .eq('pack_id', packId)

        if (error) {
            console.error('[unsavePack] Error:', error)
            return { success: false, error: 'Failed to unsave pack' }
        }

        revalidatePath('/playbooks')
        return { success: true, error: null }
    } catch (err) {
        console.error('[unsavePack] Exception:', err)
        return { success: false, error: 'Failed to unsave pack' }
    }
}

/**
 * Get pack IDs that have already been used to create objectives in the current foundry.
 * Uses source_pack_id (reliable) with title-matching fallback for older objectives.
 *
 * @returns Set of used pack IDs
 * @security Scoped to user's foundry via profile lookup
 */
export async function getUsedPackIds(): Promise<{ usedIds: Set<string>, error: string | null }> {
    noStore()
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { usedIds: new Set(), error: null }

        // Get user's foundry
        const { data: profile } = await supabase
            .from('profiles')
            .select('foundry_id')
            .eq('id', user.id)
            .single()

        if (!profile?.foundry_id) return { usedIds: new Set(), error: null }

        // Get objectives with source_pack_id and titles for fallback matching
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: objectives } = await (supabase as any)
            .from('objectives')
            .select('title, source_pack_id')
            .eq('foundry_id', profile.foundry_id)

        if (!objectives) return { usedIds: new Set(), error: null }

        const usedIds = new Set<string>()

        // Primary: collect source_pack_ids (reliable tracking)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const obj of objectives as any[]) {
            if (obj.source_pack_id) {
                usedIds.add(obj.source_pack_id)
            }
        }

        // Fallback: title matching for older objectives without source_pack_id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const objectiveTitles = new Set((objectives as any[]).map((o: { title: string }) => o.title?.toLowerCase()))

        const { data: packs } = await supabase
            .from('objective_packs')
            .select('id, title')

        if (packs) {
            for (const pack of packs) {
                if (pack.title && objectiveTitles.has(pack.title.toLowerCase())) {
                    usedIds.add(pack.id)
                }
            }
        }

        return { usedIds, error: null }
    } catch (err) {
        console.error('[getUsedPackIds] Exception:', err)
        return { usedIds: new Set(), error: 'Failed to check used packs' }
    }
}

export async function getSavedPackIds(): Promise<{
    savedIds: Set<string>
    error: string | null
}> {
    noStore()
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { savedIds: new Set(), error: null }
        }

        const { data: savedPacks, error } = await supabase
            .from('saved_packs' as unknown as 'profiles')
            .select('pack_id')
            .eq('user_id', user.id)

        if (error) {
            console.error('[getSavedPackIds] Error:', error)
            return { savedIds: new Set(), error: 'Failed to fetch saved packs' }
        }

        const savedIds = new Set(
            ((savedPacks as unknown as Array<{ pack_id: string }>) || []).map(s => s.pack_id)
        )
        return { savedIds, error: null }
    } catch (err) {
        console.error('[getSavedPackIds] Exception:', err)
        return { savedIds: new Set(), error: 'Failed to fetch saved packs' }
    }
}
