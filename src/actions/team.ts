'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createTeamSchema, inviteMemberSchema, validate } from '@/lib/validations'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

// ============ MEMBER ACTIONS ============

export async function createMember(formData: FormData) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const foundry_id = user.app_metadata.foundry_id
    if (!foundry_id) return { error: 'Missing Foundry ID' }

    const email = formData.get('email') as string
    const full_name = formData.get('full_name') as string
    const role_type = formData.get('role_type') as "Executive" | "Apprentice" | "AI_Agent" | "Founder"

    // Validate using Zod schema
    const rawData = {
        email: email || '',
        name: full_name || '',
        role: role_type || 'Apprentice'
    }

    const validation = validate(inviteMemberSchema, rawData)
    if (!validation.success) {
        return { error: validation.error }
    }

    const { email: validatedEmail, name: validatedName, role: validatedRole } = validation.data

    const id = crypto.randomUUID()

    const { error } = await supabase
        .from('profiles')
        .insert({
            id,
            email: validatedEmail,
            full_name: validatedName,
            role: validatedRole,
            foundry_id: foundry_id
        })

    if (error) {
        return { error: error.message }
    }

    revalidatePath('/team')
    return { success: true }
}

export async function pairCentaur(humanId: string, aiId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Verify AI exists and is an AI_Agent
    const { data: aiProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', aiId)
        .single()

    if (!aiProfile || aiProfile.role !== 'AI_Agent') {
        return { error: 'Invalid AI Agent selected' }
    }

    // Link the human profile to the AI agent
    const { error } = await supabase
        .from('profiles')
        .update({ paired_ai_id: aiId })
        .eq('id', humanId)

    if (error) return { error: error.message }

    revalidatePath('/team')
    return { success: true }
}

export async function unpairCentaur(humanId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase
        .from('profiles')
        .update({ paired_ai_id: null })
        .eq('id', humanId)

    if (error) return { error: error.message }

    revalidatePath('/team')
    return { success: true }
}

// ============ TEAM ACTIONS ============

export async function createTeam(name: string, memberIds: string[]) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'Missing Foundry ID' }

    // Validate using Zod schema
    const rawData = {
        name: name || '',
        memberIds: memberIds || []
    }

    const validation = validate(createTeamSchema, rawData)
    if (!validation.success) {
        return { error: validation.error }
    }

    const { name: validatedName, memberIds: validatedMemberIds } = validation.data

    const { data: team, error: teamError } = await supabase
        .from('teams')
        .insert({
            name: validatedName.trim(),
            foundry_id,
            is_auto_generated: false
        })
        .select()
        .single()

    if (teamError) return { error: teamError.message }

    const memberInserts = validatedMemberIds.map(profileId => ({
        team_id: team.id,
        profile_id: profileId
    }))

    const { error: memberError } = await supabase
        .from('team_members')
        .insert(memberInserts)

    if (memberError) return { error: memberError.message }

    revalidatePath('/team')
    return { success: true, teamId: team.id }
}

export async function getOrCreateAutoTeam(memberIds: string[]): Promise<{ teamId: string | null; error?: string }> {
    if (memberIds.length < 2) return { teamId: null }

    const supabase = await createClient()
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { teamId: null, error: 'Missing Foundry ID' }

    const sortedIds = [...memberIds].sort()

    const { data: existingTeams } = await supabase
        .from('teams')
        .select('id, team_members(profile_id)')
        .eq('foundry_id', foundry_id)
        .eq('is_auto_generated', true)

    for (const team of existingTeams || []) {
        const teamMemberIds = (team.team_members as Array<{ profile_id: string }>)
            .map(m => m.profile_id)
            .sort()

        if (teamMemberIds.length === sortedIds.length &&
            teamMemberIds.every((id, i) => id === sortedIds[i])) {
            return { teamId: team.id }
        }
    }

    const { data: profiles } = await supabase
        .from('profiles')
        .select('full_name')
        .in('id', memberIds)

    const names = (profiles || [])
        .map(p => p.full_name?.split(' ')[0] || 'Unknown')
        .slice(0, 3)

    const teamName = names.length > 2
        ? `${names.slice(0, 2).join(', ')} +${memberIds.length - 2}`
        : names.join(' & ')

    const { data: team, error: teamError } = await supabase
        .from('teams')
        .insert({
            name: teamName,
            foundry_id,
            is_auto_generated: true
        })
        .select()
        .single()

    if (teamError) return { teamId: null, error: teamError.message }

    const memberInserts = memberIds.map(profileId => ({
        team_id: team.id,
        profile_id: profileId
    }))

    await supabase.from('team_members').insert(memberInserts)

    revalidatePath('/team')
    return { teamId: team.id }
}

export async function addTeamMember(teamId: string, profileId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Validate input
    if (!teamId || !profileId) {
        return { error: 'Team ID and Profile ID are required' }
    }

    // Verify team exists and user has access
    const foundry_id = await getFoundryIdCached()
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

    // Verify profile exists and is in same foundry
    const { data: profile } = await supabase
        .from('profiles')
        .select('foundry_id')
        .eq('id', profileId)
        .single()

    if (!profile) {
        return { error: 'Profile not found' }
    }

    if (profile.foundry_id !== foundry_id) {
        return { error: 'Unauthorized: Profile not in your Foundry' }
    }

    // Verify user is a team member (has permission to add members)
    const { data: membership } = await supabase
        .from('team_members')
        .select('profile_id')
        .eq('team_id', teamId)
        .eq('profile_id', user.id)
        .single()

    if (!membership) {
        return { error: 'Unauthorized: You must be a team member to add members' }
    }

    // Check if member is already in team
    const { data: existingMember } = await supabase
        .from('team_members')
        .select('profile_id')
        .eq('team_id', teamId)
        .eq('profile_id', profileId)
        .single()

    if (existingMember) {
        return { error: 'Member is already in this team' }
    }

    const { error } = await supabase
        .from('team_members')
        .insert({ team_id: teamId, profile_id: profileId })

    if (error) return { error: error.message }

    revalidatePath('/team')
    return { success: true }
}

export async function removeTeamMember(teamId: string, profileId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Validate input
    if (!teamId || !profileId) {
        return { error: 'Team ID and Profile ID are required' }
    }

    // Verify team exists and user has access
    const foundry_id = await getFoundryIdCached()
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

    // Verify user is a team member (has permission to remove members)
    const { data: membership } = await supabase
        .from('team_members')
        .select('profile_id')
        .eq('team_id', teamId)
        .eq('profile_id', user.id)
        .single()

    if (!membership) {
        return { error: 'Unauthorized: You must be a team member to remove members' }
    }

    // Verify the member to be removed exists in the team
    const { data: memberToRemove } = await supabase
        .from('team_members')
        .select('profile_id')
        .eq('team_id', teamId)
        .eq('profile_id', profileId)
        .single()

    if (!memberToRemove) {
        return { error: 'Member is not in this team' }
    }

    // Get current member count before deletion to prevent race conditions
    const { data: currentMembers, error: countError } = await supabase
        .from('team_members')
        .select('profile_id')
        .eq('team_id', teamId)

    if (countError) return { error: countError.message }

    // Verify team still has the expected number of members (prevent concurrent deletion race)
    if (!currentMembers || currentMembers.length < 2) {
        return { error: 'Cannot remove member: team must have at least 2 members' }
    }

    const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', teamId)
        .eq('profile_id', profileId)

    if (error) return { error: error.message }

    // Re-check remaining members after deletion to ensure we still have valid count
    const { data: remaining, error: remainingError } = await supabase
        .from('team_members')
        .select('profile_id')
        .eq('team_id', teamId)

    if (remainingError) {
        console.error('Failed to check remaining members:', remainingError)
        // Continue - deletion succeeded, just logging failed
    }

    // Only delete auto-generated teams if we have less than 2 members AND verify team still exists
    if (!remaining || remaining.length < 2) {
        const { data: teamData } = await supabase
            .from('teams')
            .select('is_auto_generated')
            .eq('id', teamId)
            .single()

        // Double-check: verify team is still auto-generated and exists before deletion
        if (teamData?.is_auto_generated) {
            // Verify count one more time to prevent race condition
            const { count: finalCount } = await supabase
                .from('team_members')
                .select('id', { count: 'exact', head: true })
                .eq('team_id', teamId)

            if (finalCount !== null && finalCount < 2) {
                await supabase.from('teams').delete().eq('id', teamId)
            }
        }
    }

    revalidatePath('/team')
    return { success: true }
}

export async function deleteMember(memberId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // 1. Get current user's profile ID to take ownership
    const { data: currentProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single()

    if (!currentProfile) return { error: 'Current user profile not found' }

    // 2. Reassign Objectives created by the member
    const { error: objError } = await supabase
        .from('objectives')
        .update({ creator_id: currentProfile.id })
        .eq('creator_id', memberId)

    if (objError) return { error: `Failed to reassign objectives: ${objError.message}` }

    // 3. Reassign Tasks created by the member
    const { error: taskError } = await supabase
        .from('tasks')
        .update({ creator_id: currentProfile.id })
        .eq('creator_id', memberId)

    if (taskError) return { error: `Failed to reassign tasks: ${taskError.message}` }

    // 4. Unassign Tasks assigned TO the member
    const { error: unassignError } = await supabase
        .from('tasks')
        .update({ assignee_id: null })
        .eq('assignee_id', memberId)

    if (unassignError) return { error: `Failed to unassign tasks: ${unassignError.message}` }

    // 5. Delete from team_members (Manual cleanup if cascade missing)
    await supabase.from('team_members').delete().eq('profile_id', memberId)

    // 6. Delete from task_assignees (Manual cleanup if cascade missing)
    await supabase.from('task_assignees').delete().eq('profile_id', memberId)

    // 7. Finally, delete the profile
    const { error: deleteError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', memberId)

    if (deleteError) return { error: `Failed to delete profile: ${deleteError.message}` }

    revalidatePath('/team')
    return { success: true }
}

export async function getTeamsForFoundry() {
    const supabase = await createClient()
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { teams: [], error: 'Missing Foundry ID' }

    const { data: teams, error } = await supabase
        .from('teams')
        .select(`
            id,
            name,
            foundry_id,
            is_auto_generated,
            created_at,
            team_members(
                profile_id,
                profiles:profile_id(id, full_name, role, email)
            )
        `)
        .eq('foundry_id', foundry_id)
        .order('created_at', { ascending: false })

    if (error) return { teams: [], error: error.message }

    const transformedTeams = teams?.map(team => ({
        ...team,
        members: (team.team_members as Array<{ profiles: unknown }>)?.map(tm => tm.profiles) || []
    }))

    return { teams: transformedTeams || [] }
}

// ============ TASK ASSIGNEE ACTIONS ============

export async function assignToTask(taskId: string, profileIds: string[]) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    if (profileIds.length === 0) return { error: 'At least one assignee required' }

    let teamId: string | null = null
    if (profileIds.length > 1) {
        const result = await getOrCreateAutoTeam(profileIds)
        teamId = result.teamId
    }

    await supabase.from('task_assignees').delete().eq('task_id', taskId)

    const assigneeInserts = profileIds.map(profileId => ({
        task_id: taskId,
        profile_id: profileId,
        team_id: teamId
    }))

    const { error } = await supabase
        .from('task_assignees')
        .insert(assigneeInserts)

    if (error) return { error: error.message }

    await supabase
        .from('tasks')
        .update({ assignee_id: profileIds[0] })
        .eq('id', taskId)

    revalidatePath('/tasks')
    revalidatePath('/team')
    return { success: true, teamId }
}

export async function getTaskAssignees(taskId: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('task_assignees')
        .select(`
            id,
            profile_id,
            team_id,
            profiles:profile_id(id, full_name, role, email),
            teams:team_id(id, name, is_auto_generated)
        `)
        .eq('task_id', taskId)

    if (error) return { assignees: [], team: null, error: error.message }

    const assignees = data?.map(d => d.profiles) || []
    const team = data?.[0]?.teams || null

    return { assignees, team }
}
