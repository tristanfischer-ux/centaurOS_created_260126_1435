'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteTeam(teamId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', teamId)

    if (error) {
        console.error('Error deleting team:', error)
        throw new Error('Failed to delete team')
    }

    revalidatePath('/team')
}

export async function updateTeamName(teamId: string, name: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('teams')
        .update({ name })
        .eq('id', teamId)

    if (error) {
        console.error('Error updating team name:', error)
        throw new Error('Failed to update team name')
    }

    revalidatePath('/team')
}
