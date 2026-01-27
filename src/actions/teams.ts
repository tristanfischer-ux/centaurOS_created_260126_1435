'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getFoundryId() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    if (user.app_metadata.foundry_id) return user.app_metadata.foundry_id

    const { data: profile } = await supabase.from('profiles').select('foundry_id').eq('id', user.id).single()
    return profile?.foundry_id
}

export async function deleteTeam(teamId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    // Verify team exists and user has access
    const foundry_id = await getFoundryId()
    if (!foundry_id) {
        return { error: 'Missing Foundry ID' }
    }

    const { data: team } = await supabase
        .from('teams')
        .select('foundry_id')
        .eq('id', teamId)
        .single()

    if (!team) {
        return { error: 'Team not found' }
    }

    if (team.foundry_id !== foundry_id) {
        return { error: 'Unauthorized: Team not in your Foundry' }
    }

    // Verify user is Executive or Founder (admin role)
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || (profile.role !== 'Executive' && profile.role !== 'Founder')) {
        return { error: 'Unauthorized: Only Executives and Founders can delete teams' }
    }

    // Verify user is a member of the team (additional check)
    const { data: membership } = await supabase
        .from('team_members')
        .select('profile_id')
        .eq('team_id', teamId)
        .eq('profile_id', user.id)
        .single()

    if (!membership) {
        return { error: 'Unauthorized: You must be a team member to delete the team' }
    }

    const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', teamId)

    if (error) {
        console.error('Error deleting team:', error)
        return { error: 'Failed to delete team' }
    }

    revalidatePath('/team')
    return { success: true }
}

export async function updateTeamName(teamId: string, name: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    // Validate input
    if (!name || !name.trim()) {
        return { error: 'Team name is required' }
    }

    if (name.trim().length > 100) {
        return { error: 'Team name must be 100 characters or less' }
    }

    // Verify team exists and user has access
    const foundry_id = await getFoundryId()
    if (!foundry_id) {
        return { error: 'Missing Foundry ID' }
    }

    const { data: team } = await supabase
        .from('teams')
        .select('foundry_id')
        .eq('id', teamId)
        .single()

    if (!team) {
        return { error: 'Team not found' }
    }

    if (team.foundry_id !== foundry_id) {
        return { error: 'Unauthorized: Team not in your Foundry' }
    }

    // Verify user is a team member
    const { data: membership } = await supabase
        .from('team_members')
        .select('profile_id')
        .eq('team_id', teamId)
        .eq('profile_id', user.id)
        .single()

    if (!membership) {
        return { error: 'Unauthorized: You must be a team member to update the team name' }
    }

    const { error } = await supabase
        .from('teams')
        .update({ name: name.trim() })
        .eq('id', teamId)

    if (error) {
        console.error('Error updating team name:', error)
        return { error: 'Failed to update team name' }
    }

    revalidatePath('/team')
    return { success: true }
}
