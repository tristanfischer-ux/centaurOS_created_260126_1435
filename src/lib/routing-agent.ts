'use server'

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

export interface RoutingSuggestion {
    userId: string
    fullName: string | null
    role: string
    skills: string[]
    skillMatchScore: number
    workloadScore: number
    totalScore: number
    matchReason: string
    presenceStatus?: 'online' | 'away' | 'focus' | 'offline'
}

export interface RoutingInput {
    requiredSkills?: string[]
    preferredSkills?: string[]
    excludeUserIds?: string[]
    limit?: number
}

// Get smart assignee suggestions for a task
export async function getAssigneeSuggestions(input: RoutingInput): Promise<{
    suggestions: RoutingSuggestion[]
    error: string | null
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { suggestions: [], error: 'Unauthorized' }

    try {
        // Use the database function for skill/workload matching
        const { data, error } = await supabase.rpc('suggest_task_assignees', {
            p_required_skills: input.requiredSkills || [],
            p_preferred_skills: input.preferredSkills || [],
            p_exclude_user_ids: input.excludeUserIds || [],
            p_limit: input.limit || 5
        })

        if (error) {
            console.error('Routing error:', error)
            return { suggestions: [], error: error.message }
        }

        // Get presence status for suggested users
        const userIds = (data || []).map((d: { user_id: string }) => d.user_id)
        const { data: presenceData } = await supabase
            .from('presence')
            .select('user_id, status')
            .in('user_id', userIds)

        const presenceMap = new Map(
            (presenceData || []).map(p => [p.user_id, p.status])
        )

        const suggestions: RoutingSuggestion[] = (data || []).map((row: {
            user_id: string
            full_name: string | null
            role: string
            skills: string[]
            skill_match_score: number
            workload_score: number
            total_score: number
            match_reason: string
        }) => ({
            userId: row.user_id,
            fullName: row.full_name,
            role: row.role,
            skills: row.skills || [],
            skillMatchScore: row.skill_match_score,
            workloadScore: row.workload_score,
            totalScore: row.total_score,
            matchReason: row.match_reason,
            presenceStatus: presenceMap.get(row.user_id) || 'offline'
        }))

        return { suggestions, error: null }
    } catch (err) {
        console.error('Routing agent error:', err)
        return { suggestions: [], error: 'Failed to get suggestions' }
    }
}

// Get available team members with their workload
export async function getTeamAvailability(): Promise<{
    members: {
        id: string
        fullName: string | null
        role: string
        skills: string[]
        activeTasks: number
        pendingTasks: number
        workloadScore: number
        presenceStatus: 'online' | 'away' | 'focus' | 'offline'
    }[]
    error: string | null
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { members: [], error: 'Unauthorized' }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { members: [], error: 'No foundry' }

    // Get all team members
    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, role, skills')
        .eq('foundry_id', foundryId)
        .in('role', ['Apprentice', 'Executive'])

    if (profilesError) return { members: [], error: profilesError.message }

    // Get task counts for each member
    const memberIds = (profiles || []).map(p => p.id)
    
    // Get active tasks count
    const { data: activeTasks } = await supabase
        .from('tasks')
        .select('assignee_id')
        .eq('status', 'Accepted')
        .in('assignee_id', memberIds)

    // Get pending tasks count
    const { data: pendingTasks } = await supabase
        .from('tasks')
        .select('assignee_id')
        .eq('status', 'Pending')
        .in('assignee_id', memberIds)

    // Get presence
    const { data: presenceData } = await supabase
        .from('presence')
        .select('user_id, status')
        .in('user_id', memberIds)

    // Build counts maps
    const activeTasksMap = new Map<string, number>()
    const pendingTasksMap = new Map<string, number>()
    const memberPresenceMap = new Map<string, 'online' | 'away' | 'focus' | 'offline'>()

    (activeTasks || []).forEach(t => {
        const count = activeTasksMap.get(t.assignee_id) || 0
        activeTasksMap.set(t.assignee_id, count + 1)
    })

    (pendingTasks || []).forEach(t => {
        const count = pendingTasksMap.get(t.assignee_id) || 0
        pendingTasksMap.set(t.assignee_id, count + 1)
    })

    (presenceData || []).forEach(p => {
        memberPresenceMap.set(p.user_id, p.status as 'online' | 'away' | 'focus' | 'offline')
    })

    const members = (profiles || []).map(p => {
        const active = activeTasksMap.get(p.id) || 0
        const pending = pendingTasksMap.get(p.id) || 0
        return {
            id: p.id,
            fullName: p.full_name,
            role: p.role,
            skills: p.skills || [],
            activeTasks: active,
            pendingTasks: pending,
            workloadScore: Math.min(100, (active * 20) + (pending * 10)),
            presenceStatus: memberPresenceMap.get(p.id) || 'offline'
        }
    })

    // Sort by workload (least busy first)
    members.sort((a, b) => a.workloadScore - b.workloadScore)

    return { members, error: null }
}

// Update user skills
export async function updateUserSkills(userId: string, skills: string[]): Promise<{ error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Users can only update their own skills, or executives can update others
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    
    if (user.id !== userId && profile?.role !== 'Executive' && profile?.role !== 'Founder') {
        return { error: 'Unauthorized to update this user\'s skills' }
    }

    const { error } = await supabase
        .from('profiles')
        .update({ skills })
        .eq('id', userId)

    if (error) return { error: error.message }
    return { error: null }
}

// Get common skills in the organization (for autocomplete)
export async function getCommonSkills(): Promise<{ skills: string[]; error: string | null }> {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { skills: [], error: 'No foundry' }

    const { data, error } = await supabase
        .from('profiles')
        .select('skills')
        .eq('foundry_id', foundryId)
        .not('skills', 'is', null)

    if (error) return { skills: [], error: error.message }

    // Flatten and count skills
    const skillCounts = new Map<string, number>()
    ;(data || []).forEach(p => {
        ;(p.skills || []).forEach((skill: string) => {
            const count = skillCounts.get(skill) || 0
            skillCounts.set(skill, count + 1)
        })
    })

    // Sort by frequency
    const skills = Array.from(skillCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([skill]) => skill)

    return { skills, error: null }
}

// Common skill presets
export const COMMON_SKILLS = [
    // Technical
    'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'SQL', 'AWS', 'Docker',
    // Design
    'UI Design', 'UX Design', 'Figma', 'Branding', 'Illustration',
    // Business
    'Project Management', 'Sales', 'Marketing', 'Finance', 'Legal',
    // Content
    'Writing', 'Editing', 'Research', 'Translation',
    // Operations
    'HR', 'Recruiting', 'Customer Support', 'Data Entry'
]
