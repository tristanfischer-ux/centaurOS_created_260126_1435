'use server'


import { revalidatePath } from 'next/cache'
import { createTeamSchema, inviteMemberSchema, validate } from '@/lib/validations'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { withAuth } from '@/lib/server-action-utils'

// ============ MEMBER ACTIONS ============

/**
 * Creates a new team member profile in the user's foundry.
 *
 * @description Verifies the caller has Executive/Founder role, validates input via
 * Zod schema, then creates a new profile record with a generated UUID. The new
 * member is placed in the caller's foundry.
 *
 * @param {FormData} formData - Form data containing email, full_name, and role_type
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires Executive or Founder role to create members.
 *   Foundry isolation enforced via withAuth.
 */
export async function createMember(formData: FormData) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Verify user has permission to create members (Executive or Founder only)
        const { data: currentProfile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (profileError || !currentProfile) {
            return { error: 'Failed to verify user permissions' }
        }

        if (currentProfile.role !== 'Executive' && currentProfile.role !== 'Founder') {
            return { error: 'Unauthorized: Only Executives and Founders can create members' }
        }

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
            return { error: 'error' in validation ? validation.error : 'Validation failed' }
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
                foundry_id: foundryId
            })

        if (error) {
            return { error: sanitizeErrorMessage(error) }
        }

        revalidatePath('/team')
        return { success: true }
    })
}

/**
 * Pairs a human team member with an AI agent.
 *
 * @description Verifies both profiles exist, the AI profile has the AI_Agent role,
 * and both belong to the caller's foundry, then sets the paired_ai_id on the human profile.
 *
 * @param {string} humanId - The profile ID of the human team member
 * @param {string} aiId - The profile ID of the AI agent to pair with
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires both profiles to belong to the same foundry as the caller.
 */
export async function pairAIAgent(humanId: string, aiId: string) {
    return withAuth(async ({ supabase, foundryId }) => {
        // Verify AI exists, is an AI_Agent, and belongs to the same foundry
        const { data: aiProfile, error: aiProfileError } = await supabase
            .from('profiles')
            .select('role, foundry_id')
            .eq('id', aiId)
            .single()

        if (aiProfileError || !aiProfile || aiProfile.role !== 'AI_Agent') {
            return { error: 'Invalid AI Agent selected' }
        }

        if (aiProfile.foundry_id !== foundryId) {
            return { error: 'AI Agent must belong to the same foundry' }
        }

        // Verify human profile exists and belongs to the same foundry
        const { data: humanProfile, error: humanProfileError } = await supabase
            .from('profiles')
            .select('foundry_id')
            .eq('id', humanId)
            .single()

        if (humanProfileError || !humanProfile) {
            return { error: 'Human profile not found' }
        }

        if (humanProfile.foundry_id !== foundryId) {
            return { error: 'Human profile must belong to the same foundry' }
        }

        // Link the human profile to the AI agent
        const { error } = await supabase
            .from('profiles')
            .update({ paired_ai_id: aiId })
            .eq('id', humanId)

        if (error) return { error: sanitizeErrorMessage(error) }

        revalidatePath('/team')
        return { success: true }
    })
}

/**
 * Removes the AI agent pairing from a human team member.
 *
 * @description Verifies the target profile belongs to the caller's foundry, checks
 * that the caller has permission (self-unpair or Executive/Founder role), then
 * clears the paired_ai_id field.
 *
 * @param {string} humanId - The profile ID of the human to unpair
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Users can unpair themselves. Unpairing others requires Executive/Founder role.
 *   Foundry isolation enforced via foundry_id check.
 */
export async function unpairAIAgent(humanId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Security: Verify the human profile belongs to the same foundry
        const { data: humanProfile, error: profileError } = await supabase
            .from('profiles')
            .select('foundry_id')
            .eq('id', humanId)
            .single()

        if (profileError || !humanProfile) {
            return { error: 'Profile not found' }
        }

        if (humanProfile.foundry_id !== foundryId) {
            return { error: 'Unauthorized: Profile belongs to a different foundry' }
        }

        // Security: Verify user has permission (Executive/Founder only, or self)
        if (humanId !== user.id) {
            const { data: currentProfile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single()

            if (!currentProfile || (currentProfile.role !== 'Executive' && currentProfile.role !== 'Founder')) {
                return { error: 'Unauthorized: Only Executives and Founders can unpair other members' }
            }
        }

        const { error } = await supabase
            .from('profiles')
            .update({ paired_ai_id: null })
            .eq('id', humanId)

        if (error) return { error: sanitizeErrorMessage(error) }

        revalidatePath('/team')
        return { success: true }
    })
}

// ============ TEAM ACTIONS ============

/**
 * Creates a new manually-defined team with the specified members.
 *
 * @description Validates the team name and member IDs via Zod schema, creates a
 * team record (is_auto_generated = false), then bulk-inserts team_members records.
 *
 * @param {string} name - The team name
 * @param {string[]} memberIds - Array of profile IDs to add as team members
 * @returns {Promise<{ success: true; teamId: string } | { error: string }>} Success with
 *   team ID, or error
 *
 * @security Requires authenticated user with foundry membership via withAuth.
 */
export async function createTeam(name: string, memberIds: string[]) {
    return withAuth(async ({ supabase, foundryId }) => {
        // Validate using Zod schema
        const rawData = {
            name: name || '',
            memberIds: memberIds || []
        }

        const validation = validate(createTeamSchema, rawData)
        if (!validation.success) {
            return { error: 'error' in validation ? validation.error : 'Validation failed' }
        }

        const { name: validatedName, memberIds: validatedMemberIds } = validation.data

        const { data: team, error: teamError } = await supabase
            .from('teams')
            .insert({
                name: validatedName.trim(),
                foundry_id: foundryId,
                is_auto_generated: false
            })
            .select()
            .single()

        if (teamError) return { error: sanitizeErrorMessage(teamError) }

        const memberInserts = validatedMemberIds.map(profileId => ({
            team_id: team.id,
            profile_id: profileId
        }))

        const { error: memberError } = await supabase
            .from('team_members')
            .insert(memberInserts)

        if (memberError) return { error: sanitizeErrorMessage(memberError) }

        revalidatePath('/team')
        return { success: true, teamId: team.id }
    })
}

/**
 * Finds or creates an auto-generated team matching the given member set.
 *
 * @description Checks for an existing auto-generated team with the exact same members.
 * If none exists, creates one with an auto-generated name based on member first names.
 * Returns null (no error) if fewer than 2 members are provided.
 *
 * @param {string[]} memberIds - Array of profile IDs for the team (minimum 2)
 * @returns {Promise<{ teamId: string | null; error?: string }>} The team ID or null,
 *   with optional error
 *
 * @security Scoped to the caller's foundry via withAuth.
 */
export async function getOrCreateAutoTeam(memberIds: string[]) {
    if (memberIds.length < 2) return { teamId: null }

    return withAuth(async ({ supabase, foundryId }) => {
        const sortedIds = [...memberIds].sort()

        const { data: existingTeams } = await supabase
            .from('teams')
            .select('id, team_members(profile_id)')
            .eq('foundry_id', foundryId)
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
                foundry_id: foundryId,
                is_auto_generated: true
            })
            .select()
            .single()

        if (teamError) return { teamId: null, error: sanitizeErrorMessage(teamError) }

        const memberInserts = memberIds.map(profileId => ({
            team_id: team.id,
            profile_id: profileId
        }))

        const { error: memberInsertError } = await supabase.from('team_members').insert(memberInserts)
        
        if (memberInsertError) {
            // Attempt to clean up the created team since member insert failed
            await supabase.from('teams').delete().eq('id', team.id)
            return { teamId: null, error: sanitizeErrorMessage(memberInsertError) }
        }

        revalidatePath('/team')
        return { teamId: team.id }
    })
}

/**
 * Adds a member to an existing team.
 *
 * @description Verifies the team and profile exist and belong to the caller's foundry,
 * checks the caller is already a team member (has permission to add), and prevents
 * duplicate membership before inserting.
 *
 * @param {string} teamId - The team to add the member to
 * @param {string} profileId - The profile ID of the member to add
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires caller to be an existing team member. Both team and profile
 *   must belong to the caller's foundry.
 */
export async function addTeamMember(teamId: string, profileId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Validate input
        if (!teamId || !profileId) {
            return { error: 'Team ID and Profile ID are required' }
        }

        // Verify team exists and user has access
        const { data: team, error: teamError } = await supabase
            .from('teams')
            .select('foundry_id')
            .eq('id', teamId)
            .single()

        if (teamError || !team) {
            return { error: 'Team not found' }
        }

        if (team.foundry_id !== foundryId) {
            return { error: 'Unauthorized: Team not in your Foundry' }
        }

        // Verify profile exists and is in same foundry
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('foundry_id')
            .eq('id', profileId)
            .single()

        if (profileError || !profile) {
            return { error: 'Profile not found' }
        }

        if (profile.foundry_id !== foundryId) {
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

        if (error) return { error: sanitizeErrorMessage(error) }

        revalidatePath('/team')
        return { success: true }
    })
}

/**
 * Removes a member from a team, auto-deleting the team if it becomes too small.
 *
 * @description Verifies the team exists in the caller's foundry, the caller is a team
 * member, and the team has at least 2 members. After removal, auto-generated teams
 * with fewer than 2 members are automatically deleted.
 *
 * @param {string} teamId - The team to remove the member from
 * @param {string} profileId - The profile ID of the member to remove
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires caller to be an existing team member. Team must belong to
 *   the caller's foundry. Minimum team size of 2 enforced.
 */
export async function removeTeamMember(teamId: string, profileId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Validate input
        if (!teamId || !profileId) {
            return { error: 'Team ID and Profile ID are required' }
        }

        // Verify team exists and user has access
        const { data: team, error: teamError } = await supabase
            .from('teams')
            .select('foundry_id')
            .eq('id', teamId)
            .single()

        if (teamError || !team) {
            return { error: 'Team not found' }
        }

        if (team.foundry_id !== foundryId) {
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

        if (countError) return { error: sanitizeErrorMessage(countError) }

        // Verify team still has the expected number of members (prevent concurrent deletion race)
        if (!currentMembers || currentMembers.length < 2) {
            return { error: 'Cannot remove member: team must have at least 2 members' }
        }

        const { error } = await supabase
            .from('team_members')
            .delete()
            .eq('team_id', teamId)
            .eq('profile_id', profileId)

        if (error) return { error: sanitizeErrorMessage(error) }

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
    })
}

/**
 * Permanently deletes a team member, reassigning their created content.
 *
 * @description Verifies the caller has Executive/Founder role, handles Founder
 * protection rules, then reassigns the member's objectives and tasks to the caller,
 * unassigns tasks assigned TO the member, cleans up team_members and task_assignees,
 * and finally deletes the profile.
 *
 * @param {string} memberId - The profile ID of the member to delete
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires Executive/Founder role. Cannot delete self. Only Founders
 *   can delete other Founders. Foundry isolation enforced via foundry_id check.
 */
export async function deleteMember(memberId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Security: Verify the member belongs to the same foundry
        const { data: memberProfile, error: memberError } = await supabase
            .from('profiles')
            .select('foundry_id, role')
            .eq('id', memberId)
            .single()

        if (memberError || !memberProfile) {
            return { error: 'Member not found' }
        }

        if (memberProfile.foundry_id !== foundryId) {
            return { error: 'Unauthorized: Member belongs to a different foundry' }
        }

        // Security: Verify user has permission (Executive/Founder only)
        const { data: currentProfile } = await supabase
            .from('profiles')
            .select('id, role')
            .eq('id', user.id)
            .single()

        if (!currentProfile) return { error: 'Current user profile not found' }

        if (currentProfile.role !== 'Executive' && currentProfile.role !== 'Founder') {
            return { error: 'Unauthorized: Only Executives and Founders can delete members' }
        }

        // Prevent deleting Founders (only another Founder can do this)
        if (memberProfile.role === 'Founder' && currentProfile.role !== 'Founder') {
            return { error: 'Unauthorized: Only Founders can delete other Founders' }
        }

        // Prevent deleting yourself
        if (memberId === user.id) {
            return { error: 'Cannot delete your own profile' }
        }

        // 2. Reassign Objectives created by the member (foundry filter for defense-in-depth)
        const { error: objError } = await supabase
            .from('objectives')
            .update({ creator_id: currentProfile.id })
            .eq('creator_id', memberId)
            .eq('foundry_id', foundryId)

        if (objError) return { error: sanitizeErrorMessage(objError) }

        // 3. Reassign Tasks created by the member (foundry filter for defense-in-depth)
        const { error: taskError } = await supabase
            .from('tasks')
            .update({ creator_id: currentProfile.id })
            .eq('creator_id', memberId)
            .eq('foundry_id', foundryId)

        if (taskError) return { error: sanitizeErrorMessage(taskError) }

        // 4. Unassign Tasks assigned TO the member (foundry filter for defense-in-depth)
        const { error: unassignError } = await supabase
            .from('tasks')
            .update({ assignee_id: null })
            .eq('assignee_id', memberId)
            .eq('foundry_id', foundryId)

        if (unassignError) return { error: sanitizeErrorMessage(unassignError) }

        // 5. Delete from team_members (Manual cleanup if cascade missing)
        await supabase.from('team_members').delete().eq('profile_id', memberId)

        // 6. Delete from task_assignees (Manual cleanup if cascade missing)
        await supabase.from('task_assignees').delete().eq('profile_id', memberId)

        // 7. Finally, delete the profile
        const { error: deleteError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', memberId)

        if (deleteError) return { error: sanitizeErrorMessage(deleteError) }

        revalidatePath('/team')
        return { success: true }
    })
}

/**
 * Retrieves all teams for the current user's foundry with member details.
 *
 * @description Fetches teams with nested team_members and their profile data,
 * ordered by creation date (newest first). Transforms the nested join structure
 * into a flat members array.
 *
 * @returns {Promise<{ teams: object[] } | { teams: []; error: string }>} Array of teams
 *   with member profiles, or empty array with error
 *
 * @security Scoped to the caller's foundry via withAuth + foundry_id filter.
 */
export async function getTeamsForFoundry() {
    return withAuth(async ({ supabase, foundryId }) => {
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
            .eq('foundry_id', foundryId)
            .order('created_at', { ascending: false })

        if (error) return { teams: [], error: sanitizeErrorMessage(error) }

        const transformedTeams = teams?.map(team => ({
            ...team,
            members: (team.team_members as Array<{ profiles: unknown }>)?.map(tm => tm.profiles) || []
        }))

        return { teams: transformedTeams || [] }
    })
}

// ============ TASK ASSIGNEE ACTIONS ============

/**
 * Assigns one or more profiles to a task, replacing existing assignees.
 *
 * @description Verifies the caller has permission (task creator, assignee, or
 * Executive/Founder), confirms all assignees belong to the same foundry, creates
 * an auto-team if multiple assignees, replaces task_assignees records, and updates
 * the primary assignee on the tasks table.
 *
 * @param {string} taskId - The ID of the task to assign
 * @param {string[]} profileIds - Array of profile IDs to assign (first is primary)
 * @returns {Promise<{ success: true; teamId: string | null } | { error: string }>}
 *   Success with optional auto-team ID, or error
 *
 * @security Requires task creator, current assignee, or Executive/Founder role.
 *   All assignees must belong to the caller's foundry.
 */
export async function assignToTask(taskId: string, profileIds: string[]) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        if (profileIds.length === 0) return { error: 'At least one assignee required' }

        // Verify user has permission to assign the task
        // User must be the task creator, an Executive, Founder, or already assigned to the task
        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('creator_id, foundry_id')
            .eq('id', taskId)
            .single()

        if (taskError || !task) {
            return { error: 'Task not found' }
        }

        if (task.foundry_id !== foundryId) {
            return { error: 'Unauthorized: Task not in your foundry' }
        }

        // Check if user is the creator
        const isCreator = task.creator_id === user.id

        // Check user's role
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        const isAdmin = userProfile?.role === 'Executive' || userProfile?.role === 'Founder'

        // Check if user is currently assigned to the task
        const { data: existingAssignment } = await supabase
            .from('task_assignees')
            .select('profile_id')
            .eq('task_id', taskId)
            .eq('profile_id', user.id)
            .single()

        const isAssigned = !!existingAssignment

        if (!isCreator && !isAdmin && !isAssigned) {
            return { error: 'Unauthorized: You do not have permission to assign this task' }
        }

        // Verify all assignees belong to the same foundry
        const { data: assigneeProfiles, error: assigneeError } = await supabase
            .from('profiles')
            .select('id, foundry_id')
            .in('id', profileIds)

        if (assigneeError) {
            return { error: 'Failed to verify assignees' }
        }

        if (!assigneeProfiles || assigneeProfiles.length !== profileIds.length) {
            return { error: 'One or more assignees not found' }
        }

        const invalidAssignees = assigneeProfiles.filter(p => p.foundry_id !== foundryId)
        if (invalidAssignees.length > 0) {
            return { error: 'All assignees must belong to the same foundry' }
        }

        let teamId: string | null = null
        if (profileIds.length > 1) {
            const result = await getOrCreateAutoTeam(profileIds)
            teamId = 'teamId' in result ? result.teamId : null
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

        if (error) return { error: sanitizeErrorMessage(error) }

        const { error: updateError } = await supabase
            .from('tasks')
            .update({ assignee_id: profileIds[0] })
            .eq('id', taskId)

        if (updateError) return { error: sanitizeErrorMessage(updateError) }

        revalidatePath('/tasks')
        revalidatePath('/team')
        return { success: true, teamId }
    })
}

/**
 * Retrieves the assignees and team for a given task.
 *
 * @param taskId - The task to fetch assignees for
 * @returns Assignee profiles and optional team, or error
 *
 * @security Requires authenticated user in the same foundry as the task
 */
export async function getTaskAssignees(taskId: string) {
    return withAuth(async ({ supabase, foundryId }) => {
        // SECURITY: Verify the task belongs to the user's foundry before returning assignees
        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('id')
            .eq('id', taskId)
            .eq('foundry_id', foundryId)
            .single()

        if (taskError || !task) {
            return { assignees: [], team: null, error: 'Task not found in your foundry' }
        }

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

        if (error) return { assignees: [], team: null, error: sanitizeErrorMessage(error) }

        const assignees = data?.map(d => d.profiles) || []
        const team = data?.[0]?.teams || null

        return { assignees, team }
    })
}

// ============ FOUNDRY BUSINESS FUNCTIONS ============

/**
 * Updates foundry-specific business function labels and display order
 * for the Company Orbit view.
 * 
 * @param targetFoundryId - The foundry ID to update
 * @param functions - Array of function configurations with IDs, labels, abbreviations, and order
 * @returns Success status or error message
 * 
 * @security Authenticated user in same foundry required
 * @audit Logs function configuration changes
 */
export async function updateFoundryFunctions(
    targetFoundryId: string,
    functions: Array<{
        function_id: string
        label: string
        short: string
        display_order: number
    }>
) {
    return withAuth(async ({ supabase, foundryId }) => {
        // AUTH: Verify user belongs to this foundry
        if (foundryId !== targetFoundryId) {
            return { success: false, error: 'Unauthorized: Cannot modify other foundries' }
        }

        // VALIDATION: Ensure all 7 core functions are present
        const requiredFunctionIds = ['sales', 'marketing', 'finance', 'hr', 'legal', 'operations', 'product']
        const providedIds = functions.map(f => f.function_id).sort()
        const missingIds = requiredFunctionIds.filter(id => !providedIds.includes(id))
        
        if (missingIds.length > 0) {
            return { success: false, error: `Missing required functions: ${missingIds.join(', ')}` }
        }
        
        if (providedIds.length !== 7) {
            return { success: false, error: 'Must provide exactly 7 functions' }
        }

        // VALIDATION: Check for duplicate abbreviations
        const shorts = functions.map(f => f.short)
        const duplicateShorts = shorts.filter((item, index) => shorts.indexOf(item) !== index)
        if (duplicateShorts.length > 0) {
            return { success: false, error: `Duplicate abbreviations: ${duplicateShorts.join(', ')}` }
        }

        // VALIDATION: Check display_order is 0-6
        const orders = functions.map(f => f.display_order)
        const invalidOrders = orders.filter(o => o < 0 || o > 6)
        if (invalidOrders.length > 0) {
            return { success: false, error: 'Display order must be between 0 and 6' }
        }

        // Delete existing custom functions for this foundry
        const { error: deleteError } = await supabase
            .from('foundry_business_functions')
            .delete()
            .eq('foundry_id', targetFoundryId)

        if (deleteError) {
            return { success: false, error: sanitizeErrorMessage(deleteError) }
        }

        // Insert new custom functions
        const { error: insertError } = await supabase
            .from('foundry_business_functions')
            .insert(functions.map(f => ({
                foundry_id: targetFoundryId,
                function_id: f.function_id,
                label: f.label,
                short: f.short,
                display_order: f.display_order,
            })))

        if (insertError) {
            return { success: false, error: sanitizeErrorMessage(insertError) }
        }

        // Revalidate team page to show updated function labels
        revalidatePath('/team')

        return { success: true }
    })
}
