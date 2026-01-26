'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createMember(formData: FormData) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Extract foundry_id from session metadata
    const foundry_id = user.app_metadata.foundry_id
    if (!foundry_id) return { error: 'Missing Foundry ID' }

    const email = formData.get('email') as string
    const full_name = formData.get('full_name') as string
    const role_type = formData.get('role_type') as "Executive" | "Apprentice"

    if (!email) return { error: 'Email is required' }
    if (!full_name) return { error: 'Full name is required' }
    if (!role_type) return { error: 'Role is required' }

    // Generate random ID for pre-provisioned profile (will need reconciling with Auth later)
    const id = crypto.randomUUID()

    const { error } = await supabase
        .from('profiles')
        .insert({
            id,
            email,
            full_name,
            role: role_type,
            foundry_id: foundry_id
        })

    if (error) {
        return { error: error.message }
    }

    revalidatePath('/team')
    return { success: true }
}
