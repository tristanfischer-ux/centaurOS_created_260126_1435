'use server'


import { createClient } from '@/lib/supabase/server'
import { unstable_noStore as noStore } from 'next/cache'

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
    difficulty: string | null
    estimated_duration: string | null
    icon_name: string | null
    items?: PackItem[]
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
 * Fetches all objective packs from both objective_packs and subsystem_objective_packs tables.
 * Combines and normalizes the data into a unified ObjectivePack format.
 */
export async function getObjectivePacks(): Promise<{ packs: ObjectivePack[], error?: string }> {
    noStore()
    const supabase = await createClient()

    // Fetch from original objective_packs table
    const { data: originalPacks, error: originalError } = await supabase
        .from('objective_packs')
        .select('*, items:pack_items(*)')
        .order('title')

    if (originalError) {
        console.error('Error fetching objective packs:', originalError)
        return { packs: [], error: originalError.message }
    }

    // Fetch from subsystem_objective_packs table with subsystem category
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: subsystemPacks, error: subsystemError } = await (supabase as any)
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

    if (subsystemError) {
        console.error('Error fetching subsystem packs:', subsystemError)
        // Don't fail completely, just return original packs
    }

    // Transform subsystem packs to match ObjectivePack format
    const transformedSubsystemPacks: ObjectivePack[] = (subsystemPacks || []).map((pack: {
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
            difficulty: pack.difficulty ? pack.difficulty.charAt(0).toUpperCase() + pack.difficulty.slice(1) : null,
            estimated_duration: pack.estimated_duration,
            icon_name: pack.subsystem?.icon_name || 'boxes',
            items,
        }
    })

    // Combine both sources
    const allPacks = [...(originalPacks as ObjectivePack[]), ...transformedSubsystemPacks]

    // Sort combined results by title
    allPacks.sort((a, b) => a.title.localeCompare(b.title))

    return { packs: allPacks }
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
        return { pack: null, error: packError?.message || 'Pack not found' }
    }

    // Fetch items
    const { data: items, error: itemsError } = await supabase
        .from('pack_items')
        .select('*')
        .eq('pack_id', packId)
        .order('order_index')

    if (itemsError) {
        return { pack: null, error: itemsError.message }
    }

    return {
        pack: {
            ...pack,
            items: items as PackItem[]
        }
    }
}
