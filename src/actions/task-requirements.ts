'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Types
export interface TaskRequirement {
    id: string
    task_id: string
    required_skills: string[] | null
    preferred_skills: string[] | null
    estimated_hours: number | null
    complexity: 'simple' | 'moderate' | 'complex' | null
    created_at: string
}

export interface AssigneeSuggestion {
    user_id: string
    full_name: string
    role: string
    skills: string[]
    skill_match_score: number
    workload_score: number
    total_score: number
    match_reason: string
}

// ==========================================
// TASK REQUIREMENTS CRUD
// ==========================================

/**
 * Set requirements for a task
 */
export async function setTaskRequirements(data: {
    taskId: string
    requiredSkills?: string[]
    preferredSkills?: string[]
    estimatedHours?: number
    complexity?: 'simple' | 'moderate' | 'complex'
}): Promise<{ data: TaskRequirement | null; error: string | null }> {
    try {
        const supabase = await createClient()

        // Upsert task requirements
        const { data: requirement, error } = await supabase
            .from('task_requirements')
            .upsert({
                task_id: data.taskId,
                required_skills: data.requiredSkills || [],
                preferred_skills: data.preferredSkills || [],
                estimated_hours: data.estimatedHours || null,
                complexity: data.complexity || null
            }, {
                onConflict: 'task_id'
            })
            .select()
            .single()

        if (error) {
            console.error('Error setting task requirements:', error)
            return { data: null, error: error.message }
        }

        revalidatePath('/tasks')
        return { data: requirement as TaskRequirement, error: null }
    } catch (err) {
        console.error('Failed to set task requirements:', err)
        return { data: null, error: 'Failed to set requirements' }
    }
}

/**
 * Get requirements for a task
 */
export async function getTaskRequirements(taskId: string): Promise<{ data: TaskRequirement | null; error: string | null }> {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase
            .from('task_requirements')
            .select('*')
            .eq('task_id', taskId)
            .single()

        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching task requirements:', error)
            return { data: null, error: error.message }
        }

        return { 
            data: data ? {
                ...data,
                required_skills: data.required_skills || [],
                preferred_skills: data.preferred_skills || []
            } as TaskRequirement : null, 
            error: null 
        }
    } catch (err) {
        console.error('Failed to fetch task requirements:', err)
        return { data: null, error: 'Failed to fetch requirements' }
    }
}

/**
 * Delete task requirements
 */
export async function deleteTaskRequirements(taskId: string): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()

        const { error } = await supabase
            .from('task_requirements')
            .delete()
            .eq('task_id', taskId)

        if (error) {
            console.error('Error deleting task requirements:', error)
            return { success: false, error: error.message }
        }

        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to delete task requirements:', err)
        return { success: false, error: 'Failed to delete requirements' }
    }
}

// ==========================================
// SKILL MATCHING & ASSIGNEE SUGGESTIONS
// ==========================================

/**
 * Get suggested assignees for a task based on skills using the database function
 */
export async function getSuggestedAssignees(options?: {
    requiredSkills?: string[]
    preferredSkills?: string[]
    excludeUserIds?: string[]
    limit?: number
}): Promise<{ data: AssigneeSuggestion[]; error: string | null }> {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase.rpc('suggest_task_assignees', {
            p_required_skills: options?.requiredSkills || [],
            p_preferred_skills: options?.preferredSkills || [],
            p_exclude_user_ids: options?.excludeUserIds || [],
            p_limit: options?.limit || 5
        })

        if (error) {
            console.error('Error fetching assignee suggestions:', error)
            return { data: [], error: error.message }
        }

        return { data: (data || []) as AssigneeSuggestion[], error: null }
    } catch (err) {
        console.error('Failed to fetch assignee suggestions:', err)
        return { data: [], error: 'Failed to fetch suggestions' }
    }
}

/**
 * Get suggested assignees for a specific task
 */
export async function getSuggestedAssigneesForTask(taskId: string): Promise<{ 
    data: AssigneeSuggestion[]; 
    requirements: TaskRequirement | null;
    error: string | null 
}> {
    try {
        // First get task requirements
        const { data: requirements } = await getTaskRequirements(taskId)

        if (!requirements) {
            // No requirements set, return empty suggestions
            return { data: [], requirements: null, error: null }
        }

        // Get suggestions based on requirements
        const { data, error } = await getSuggestedAssignees({
            requiredSkills: requirements.required_skills || [],
            preferredSkills: requirements.preferred_skills || []
        })

        return { data, requirements, error }
    } catch (err) {
        console.error('Failed to get task assignee suggestions:', err)
        return { data: [], requirements: null, error: 'Failed to get suggestions' }
    }
}

// ==========================================
// WORKLOAD CALCULATION
// ==========================================

/**
 * Calculate workload score for a user using the database function
 */
export async function calculateWorkloadScore(userId: string): Promise<{ score: number; error: string | null }> {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase.rpc('calculate_workload_score', {
            p_user_id: userId
        })

        if (error) {
            console.error('Error calculating workload score:', error)
            return { score: 0, error: error.message }
        }

        return { score: data || 0, error: null }
    } catch (err) {
        console.error('Failed to calculate workload score:', err)
        return { score: 0, error: 'Failed to calculate workload' }
    }
}

/**
 * Get workload scores for multiple users
 */
export async function getTeamWorkloads(userIds: string[]): Promise<{ 
    data: { userId: string; score: number }[]; 
    error: string | null 
}> {
    try {
        const scores = await Promise.all(
            userIds.map(async (userId) => {
                const { score } = await calculateWorkloadScore(userId)
                return { userId, score }
            })
        )

        return { data: scores, error: null }
    } catch (err) {
        console.error('Failed to get team workloads:', err)
        return { data: [], error: 'Failed to get workloads' }
    }
}

// ==========================================
// SKILL CATALOG
// ==========================================

/**
 * Get all unique skills used across profiles
 */
export async function getAvailableSkills(): Promise<{ data: string[]; error: string | null }> {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase
            .from('profiles')
            .select('skills')
            .not('skills', 'is', null)

        if (error) {
            console.error('Error fetching available skills:', error)
            return { data: [], error: error.message }
        }

        // Flatten and dedupe skills
        const allSkills = new Set<string>()
        data?.forEach(profile => {
            profile.skills?.forEach((skill: string) => {
                if (skill) allSkills.add(skill.toLowerCase())
            })
        })

        return { data: Array.from(allSkills).sort(), error: null }
    } catch (err) {
        console.error('Failed to fetch available skills:', err)
        return { data: [], error: 'Failed to fetch skills' }
    }
}

/**
 * Get skill statistics - how many people have each skill
 */
export async function getSkillDistribution(): Promise<{ 
    data: { skill: string; count: number }[]; 
    error: string | null 
}> {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase
            .from('profiles')
            .select('skills')
            .not('skills', 'is', null)

        if (error) {
            console.error('Error fetching skill distribution:', error)
            return { data: [], error: error.message }
        }

        // Count skill occurrences
        const skillCounts = new Map<string, number>()
        data?.forEach(profile => {
            profile.skills?.forEach((skill: string) => {
                if (skill) {
                    const normalized = skill.toLowerCase()
                    skillCounts.set(normalized, (skillCounts.get(normalized) || 0) + 1)
                }
            })
        })

        const distribution = Array.from(skillCounts.entries())
            .map(([skill, count]) => ({ skill, count }))
            .sort((a, b) => b.count - a.count)

        return { data: distribution, error: null }
    } catch (err) {
        console.error('Failed to fetch skill distribution:', err)
        return { data: [], error: 'Failed to fetch distribution' }
    }
}
