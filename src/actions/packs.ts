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

export async function getObjectivePacks(): Promise<{ packs: ObjectivePack[], error?: string }> {
    noStore()
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('objective_packs')
        .select('*')
        .order('title')

    if (error) {
        console.error('Error fetching objective packs:', error)
        return { packs: [], error: error.message }
    }

    return { packs: data as ObjectivePack[] }
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
