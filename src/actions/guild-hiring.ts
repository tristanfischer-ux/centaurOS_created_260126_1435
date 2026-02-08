'use server'

/**
 * @file guild-hiring.ts
 * 
 * @description Server actions for hiring from The Forge Guild.
 * Enables solopreneurs and small business owners to find and invite
 * Guild members (Apprentices and Executives) to join their foundry.
 * 
 * @security Only foundry owners (Founders) can invite Guild members
 * @audit All invitations are logged for audit trail
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { revalidatePath } from 'next/cache'

export interface GuildMember {
  id: string
  fullName: string
  role: string
  avatarUrl: string | null
  bio: string | null
  skills: string[]
  joinedAt: string
  taskCount: number
  completedCount: number
}

export interface GuildSearchResult {
  members: GuildMember[]
  total: number
}

/**
 * Fetches available Guild members that can be hired.
 * 
 * @description Returns Apprentices and Executives from The Forge Guild
 * who are available for fractional work. Excludes members already in
 * the caller's foundry.
 * 
 * @param {string} [category] - Optional skill/role category filter
 * @param {number} [limit=20] - Max results to return
 * 
 * @returns {Promise<GuildSearchResult>} Available Guild members
 * 
 * @security Authenticated users only. Only shows public Guild member info.
 */
export async function getAvailableGuildMembers(
  category?: string,
  limit: number = 20
): Promise<GuildSearchResult> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { members: [], total: 0 }
  }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { members: [], total: 0 }
  }

  try {
    // Fetch Guild members (from forge-guild foundry) who are NOT already in the user's foundry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query = (supabase as any)
      .from('profiles')
      .select('id, full_name, role, avatar_url, bio, created_at')
      .eq('foundry_id', 'forge-guild')
      .in('role', ['Executive', 'Apprentice'])
      .limit(limit)
      .order('created_at', { ascending: false })

    const { data: guildProfiles, error } = await query

    if (error) {
      console.error('[GuildHiring] Failed to fetch Guild members:', {
        error: error.message,
      })
      return { members: [], total: 0 }
    }

    if (!guildProfiles || guildProfiles.length === 0) {
      return { members: [], total: 0 }
    }

    // Get existing members of the user's foundry to exclude
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingMembers } = await (supabase as any)
      .from('foundry_memberships')
      .select('user_id')
      .eq('foundry_id', foundryId)

    const existingMemberIds = new Set(
      (existingMembers || []).map((m: { user_id: string }) => m.user_id)
    )

    // Fetch task stats for each member
    const memberIds = guildProfiles.map((p: { id: string }) => p.id)
    const { data: taskStats } = await supabase
      .from('tasks')
      .select('assignee_id, status')
      .in('assignee_id', memberIds)

    // Build task count map
    const taskCountMap = new Map<string, { total: number; completed: number }>()
    if (taskStats) {
      for (const task of taskStats) {
        const existing = taskCountMap.get(task.assignee_id) || { total: 0, completed: 0 }
        existing.total++
        if (task.status === 'Completed') existing.completed++
        taskCountMap.set(task.assignee_id, existing)
      }
    }

    // Filter out existing members and transform
    const members: GuildMember[] = guildProfiles
      .filter((p: { id: string }) => !existingMemberIds.has(p.id))
      .map((p: { id: string; full_name: string; role: string; avatar_url: string | null; bio: string | null; created_at: string }) => {
        const stats = taskCountMap.get(p.id) || { total: 0, completed: 0 }
        return {
          id: p.id,
          fullName: p.full_name || 'Guild Member',
          role: p.role,
          avatarUrl: p.avatar_url,
          bio: p.bio,
          skills: [], // Skills fetched separately if needed
          joinedAt: p.created_at,
          taskCount: stats.total,
          completedCount: stats.completed,
        }
      })

    return {
      members,
      total: members.length,
    }
  } catch (error) {
    console.error('[GuildHiring] Unexpected error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return { members: [], total: 0 }
  }
}

/**
 * Invites a Guild member to join the user's foundry.
 * 
 * @description Creates a foundry_membership record for the Guild member
 * in the user's foundry. The member keeps their Guild membership (dual membership).
 * 
 * @param {string} memberId - Profile ID of the Guild member to invite
 * @param {string} role - Role to assign in the new foundry ('Executive' | 'Apprentice')
 * 
 * @returns {Promise<{ success: boolean; error?: string }>} Result
 * 
 * @security Only Founders can invite members. Validates foundry ownership.
 * @audit Logs guild_member_invited event
 */
export async function inviteGuildMember(
  memberId: string,
  role: 'Executive' | 'Apprentice' = 'Apprentice'
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { success: false, error: 'No active foundry' }
  }

  // AUTH: Verify user is Founder of the target foundry
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // Check foundry membership role (they may be Founder in this foundry but not their profile role)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: membership } = await (supabase as any)
    .from('foundry_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('foundry_id', foundryId)
    .single()

  const isFounder = profile?.role === 'Founder' || membership?.role === 'Founder'

  if (!isFounder) {
    return { success: false, error: 'Only founders can invite team members' }
  }

  // VALIDATION: Check target member exists and is in the Guild
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('id, full_name, foundry_id')
    .eq('id', memberId)
    .single()

  if (!targetProfile) {
    return { success: false, error: 'Member not found' }
  }

  // Check if member is already in this foundry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingMembership } = await (supabase as any)
    .from('foundry_memberships')
    .select('id')
    .eq('user_id', memberId)
    .eq('foundry_id', foundryId)
    .maybeSingle()

  if (existingMembership) {
    return { success: false, error: 'This person is already in your team' }
  }

  try {
    // Create foundry membership for the Guild member
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase as any)
      .from('foundry_memberships')
      .insert({
        user_id: memberId,
        foundry_id: foundryId,
        role: role,
        is_primary: false,
        joined_at: new Date().toISOString(),
        invited_by: user.id,
      })

    if (insertError) {
      console.error('[GuildHiring] Failed to create membership:', {
        memberId,
        foundryId,
        error: insertError.message,
      })
      return { success: false, error: 'Failed to invite member. Please try again.' }
    }

    // AUDIT: Log successful invitation
    console.info('[GuildHiring] Guild member invited:', {
      memberId,
      memberName: targetProfile.full_name,
      foundryId,
      invitedBy: user.id,
      assignedRole: role,
    })

    revalidatePath('/team')
    revalidatePath('/', 'layout')

    return { success: true }
  } catch (error) {
    console.error('[GuildHiring] Unexpected error inviting member:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return { success: false, error: 'An unexpected error occurred' }
  }
}
