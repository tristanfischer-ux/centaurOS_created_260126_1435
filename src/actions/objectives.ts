'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createObjective(formData: FormData) {
    const supabase = await createClient()

    // Get current user to determine foundry_id (RLS handles security, but we need it for validation logic if any)
    // RLS policy: (foundry_id = (auth.jwt() -> 'app_metadata' ->> 'foundry_id')::uuid)
    // The insert just needs title/description. foundry_id is required in schema, but usually we'd insert it or rely on a default if setup differently?
    // Wait, the schema says `foundry_id UUID NOT NULL`.
    // The RLS policy CHECKS it, but the INSERT must provide it.
    // We need to fetch the foundry_id from the user's metadata to insert it.

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: 'Unauthorized' }
    }

    const foundry_id = user.app_metadata.foundry_id

    if (!foundry_id) {
        // Fallback for dev/testing if no custom claims yet, but in prod this is critical.
        // For MVP greenfield, we might just assume the user is valid if RLS passes.
        // However, we physically need to put the UUID in the INSERT statement.
        return { error: 'Missing Foundry ID' }
    }

    const title = formData.get('title') as string
    const description = formData.get('description') as string

    if (!title) {
        return { error: 'Title is required' }
    }

    // Soft limit check (10 max)
    const { count } = await supabase
        .from('objectives')
        .select('*', { count: 'exact', head: true })
        .eq('foundry_id', foundry_id)

    if (count !== null && count >= 10) {
        return { error: 'Objective limit reached (Max 10)' }
    }

    const { error } = await supabase
        .from('objectives')
        .insert({
            title,
            description,
            foundry_id: foundry_id,
            creator_id: user.id
        })

    if (error) {
        return { error: error.message }
    }

    revalidatePath('/objectives')
    return { success: true }
}
