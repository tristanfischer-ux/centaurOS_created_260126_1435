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

// ============ MEMBER ACTIONS ============

export async function createMember(formData: FormData) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const foundry_id = user.app_metadata.foundry_id
    if (!foundry_id) return { error: 'Missing Foundry ID' }

    const email = formData.get('email') as string
    const full_name = formData.get('full_name') as string
    const role_type = formData.get('role_type') as "Executive" | "Apprentice" | "AI_Agent"

    if (!email) return { error: 'Email is required' }
    if (!full_name) return { error: 'Full name is required' }
    if (!role_type) return { error: 'Role is required' }

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

    const foundry_id = await getFoundryId()
    if (!foundry_id) return { error: 'Missing Foundry ID' }

    if (!name.trim()) return { error: 'Team name is required' }
    if (memberIds.length < 2) return { error: 'Team must have at least 2 members' }

    const { data: team, error: teamError } = await supabase
        .from('teams')
        .insert({
            name: name.trim(),
            foundry_id,
            is_auto_generated: false
        })
        .select()
        .single()

    if (teamError) return { error: teamError.message }

    const memberInserts = memberIds.map(profileId => ({
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
    const foundry_id = await getFoundryId()
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

    const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', teamId)
        .eq('profile_id', profileId)

    if (error) return { error: error.message }

    const { data: remaining } = await supabase
        .from('team_members')
        .select('profile_id')
        .eq('team_id', teamId)

    if (!remaining || remaining.length < 2) {
        const { data: team } = await supabase
            .from('teams')
            .select('is_auto_generated')
            .eq('id', teamId)
            .single()

        if (team?.is_auto_generated) {
            await supabase.from('teams').delete().eq('id', teamId)
        }
    }

    revalidatePath('/team')
    return { success: true }
}

export async function deleteTeam(teamId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', teamId)

    if (error) return { error: error.message }

    revalidatePath('/team')
    return { success: true }
}

export async function getTeamsForFoundry() {
    const supabase = await createClient()
    const foundry_id = await getFoundryId()
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
