'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Database } from '@/types/database.types'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { withRetry } from '@/lib/retry'

type RiskLevel = Database['public']['Enums']['risk_level']

export interface TaskInput {
    title: string
    description?: string
    start_date?: string  // ISO 8601
    end_date?: string    // ISO 8601
    risk_level?: RiskLevel
    assignee_id?: string // Optional - defaults to creator
}

export interface ObjectiveInput {
    title: string
    description?: string
    tasks: TaskInput[]
}

/**
 * Create an objective with multiple tasks in a single transaction
 * Used by the objective-creator skill to turn raw input into structured objectives
 * 
 * @param input - The objective and tasks to create
 * @returns Success status and created objective ID, or error
 */
export async function createObjectiveFromInput(input: ObjectiveInput) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    // Get foundry_id using cached helper
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    // Validate input
    if (!input.title || input.title.trim().length === 0) {
        return { error: 'Objective title is required' }
    }
    if (input.title.length > 200) {
        return { error: 'Objective title must be 200 characters or less' }
    }
    if (input.description && input.description.length > 10000) {
        return { error: 'Objective description must be 10,000 characters or less' }
    }

    // Validate tasks
    if (!input.tasks || input.tasks.length === 0) {
        return { error: 'At least one task is required' }
    }

    for (const task of input.tasks) {
        if (!task.title || task.title.trim().length === 0) {
            return { error: 'All tasks must have a title' }
        }
        if (task.title.length > 500) {
            return { error: `Task title "${task.title.substring(0, 50)}..." exceeds 500 characters` }
        }
        if (task.description && task.description.length > 10000) {
            return { error: `Task "${task.title.substring(0, 30)}..." description exceeds 10,000 characters` }
        }
        // Validate dates if provided
        if (task.start_date && task.end_date) {
            const start = new Date(task.start_date)
            const end = new Date(task.end_date)
            if (start > end) {
                return { error: `Task "${task.title.substring(0, 30)}..." has start date after end date` }
            }
        }
    }

    // Create the objective
    let objective
    try {
        objective = await withRetry(async () => {
            const result = await supabase.from('objectives').insert({
                title: input.title.trim(),
                description: input.description?.trim() || null,
                creator_id: user.id,
                foundry_id,
                status: 'In Progress',
                progress: 0
            }).select().single()
            if (result.error) throw result.error
            return result.data
        })
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to create objective' }
    }

    if (!objective) return { error: 'Failed to create objective' }

    // Find AI Agent if any tasks need it
    let aiAgentId: string | null = null
    const needsAIAgent = input.tasks.some(t => t.assignee_id === 'ai_agent')
    if (needsAIAgent) {
        const { data: aiAgents } = await supabase
            .from('profiles')
            .select('id')
            .eq('role', 'AI_Agent')
            .limit(1)
        aiAgentId = aiAgents?.[0]?.id || null
    }

    // Create tasks
    const tasksToInsert: Database['public']['Tables']['tasks']['Insert'][] = input.tasks.map(task => {
        // Determine assignee
        let assigneeId = user.id // Default to creator
        if (task.assignee_id === 'ai_agent' && aiAgentId) {
            assigneeId = aiAgentId
        } else if (task.assignee_id && task.assignee_id !== 'ai_agent') {
            assigneeId = task.assignee_id
        }

        return {
            title: task.title.trim(),
            description: task.description?.trim() || null,
            objective_id: objective.id,
            creator_id: user.id,
            assignee_id: assigneeId,
            foundry_id,
            status: 'Pending' as const,
            start_date: task.start_date || null,
            end_date: task.end_date || null,
            risk_level: task.risk_level || 'Medium',
            client_visible: false
        }
    })

    try {
        await withRetry(async () => {
            const result = await supabase.from('tasks').insert(tasksToInsert)
            if (result.error) throw result.error
            return result
        })
    } catch (taskError) {
        console.error('Error creating tasks:', taskError)
        // Rollback: delete the objective
        await supabase.from('objectives').delete().eq('id', objective.id)
        return { error: taskError instanceof Error ? taskError.message : 'Failed to create tasks' }
    }

    // Insert into task_assignees for each task
    // First, fetch created tasks to get their IDs
    const { data: createdTasks } = await supabase
        .from('tasks')
        .select('id, assignee_id')
        .eq('objective_id', objective.id)

    if (createdTasks && createdTasks.length > 0) {
        const assigneeRecords = createdTasks
            .filter(t => t.assignee_id)
            .map(t => ({
                task_id: t.id,
                profile_id: t.assignee_id!
            }))
        
        if (assigneeRecords.length > 0) {
            const { error: assigneeError } = await supabase
                .from('task_assignees')
                .insert(assigneeRecords)
            
            if (assigneeError) {
                console.error('Failed to create task_assignees:', assigneeError)
                // Non-fatal - tasks are created, just assignee join table failed
            }
        }
    }

    revalidatePath('/objectives')
    revalidatePath('/tasks')
    
    return { 
        success: true, 
        objectiveId: objective.id,
        taskCount: input.tasks.length
    }
}
