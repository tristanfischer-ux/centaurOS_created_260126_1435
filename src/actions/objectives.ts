'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createObjective(formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    const title = formData.get('title') as string
    const description = formData.get('description') as string

    if (!title) return { error: 'Title is required' }

    const { error } = await supabase.from('objectives').insert({
        title,
        description,
        creator_id: user.id,
        foundry_id: 'foundry-demo' // Hardcoded for demo
    })

    if (error) return { error: error.message }

    revalidatePath('/objectives')
    revalidatePath('/tasks') // Because tasks dropdown uses objectives
    return { success: true }
}

export async function deleteObjective(id: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('objectives').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/objectives')
    return { success: true }
}
