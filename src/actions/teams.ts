'use server'


import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { updateTeamNameSchema, validate } from '@/lib/validations'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

export async function deleteTeam(teamId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    // Verify team exists and user has access
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) {
        return { error: 'Missing Foundry ID' }
    }

    const { data: team, error: teamError } = await supabase
        .from('teams')
        .select('foundry_id')
        .eq('id', teamId)
        .single()

    if (teamError || !team) {
        return { error: 'Team not found' }
    }

    if (team.foundry_id !== foundry_id) {
        return { error: 'Unauthorized: Team not in your Foundry' }
    }

    // Verify user is Executive or Founder (admin role)
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profileError || !profile || (profile.role !== 'Executive' && profile.role !== 'Founder')) {
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

    // Check for active tasks assigned to this team
    // Note: Deleting a team will cascade delete team_members but task_assignees
    // with this team_id will have their team_id set to null (if FK allows) or fail
    const { data: activeTasks, error: taskCheckError } = await supabase
        .from('task_assignees')
        .select('task_id, tasks!inner(status)')
        .eq('team_id', teamId)
        .not('tasks.status', 'in', '("done","cancelled")')

    if (taskCheckError) {
        return { error: 'Failed to check for active tasks' }
    }

    if (activeTasks && activeTasks.length > 0) {
        return { 
            error: `Cannot delete team: ${activeTasks.length} active task(s) are assigned to this team. Please reassign or complete them first.` 
        }
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

    // Validate using Zod schema
    const validation = validate(updateTeamNameSchema, { teamId, name: name || '' })
    if (!validation.success) {
        return { error: 'error' in validation ? validation.error : 'Validation failed' }
    }

    const { name: validatedName } = validation.data

    // Verify team exists and user has access
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) {
        return { error: 'Missing Foundry ID' }
    }

    const { data: team, error: teamError } = await supabase
        .from('teams')
        .select('foundry_id')
        .eq('id', teamId)
        .single()

    if (teamError || !team) {
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
        .update({ name: validatedName.trim() })
        .eq('id', teamId)

    if (error) {
        return { error: `Failed to update team name: ${error.message}` }
    }

    revalidatePath('/team')
    return { success: true }
}
