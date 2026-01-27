'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Database } from '@/types/database.types'
import { createObjectiveSchema, validate } from '@/lib/validations'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { withRetry } from '@/lib/retry'



export async function createObjective(formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    // Get foundry_id using cached helper
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    const title = formData.get('title') as string
    const description = formData.get('description') as string
    const playbookId = formData.get('playbookId') as string

    // Get selected tasks (handle multiple values with same name)
    const selectedTaskIds = formData.getAll('selectedTaskIds') as string[]
    // AI Import tasks (JSON strings)
    const aiTasksJson = formData.getAll('aiTasks') as string[]

    // Validate using Zod schema
    const rawData = {
        title: title || '',
        description: description || undefined,
        playbookId: playbookId && playbookId !== 'none' ? playbookId : undefined,
        selectedTaskIds: selectedTaskIds.length > 0 ? selectedTaskIds : undefined
    }

    const validation = validate(createObjectiveSchema, rawData)
    if (!validation.success) {
        return { error: validation.error }
    }

    const { title: validatedTitle, description: validatedDescription, playbookId: validatedPlaybookId, selectedTaskIds: validatedSelectedTaskIds } = validation.data

    // 2. Create the objective
    let objective
    try {
        const result = await withRetry(async () => {
            const res = await supabase.from('objectives').insert({
                title: validatedTitle,
                description: validatedDescription || null,
                creator_id: user.id,
                foundry_id
            }).select().single()
            if (res.error) throw res.error
            return res.data
        })
        objective = result
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to create objective' }
    }

    if (!objective) return { error: 'Failed to create objective' }

    // 3. Create Tasks
    let tasksToInsert: Database['public']['Tables']['tasks']['Insert'][] = []

    // A. From Playbook
    if (validatedPlaybookId && validatedSelectedTaskIds && validatedSelectedTaskIds.length > 0) {
        // Optimize query: only fetch selected pack items
        const { data: packItems, error: packError } = await supabase
            .from('pack_items')
            .select('*')
            .eq('pack_id', validatedPlaybookId)
            .in('id', validatedSelectedTaskIds)

        // Handle pack fetch errors
        if (packError) {
            console.error('Error fetching pack items:', packError)
            // Delete the objective to prevent partial creation
            const { error: deleteError } = await supabase
                .from('objectives')
                .delete()
                .eq('id', objective.id)
            
            if (deleteError) {
                console.error('Failed to clean up objective after pack fetch failure:', deleteError)
                return { error: `Failed to fetch pack items and cleanup failed. Objective ID: ${objective.id}` }
            }
            
            return { error: `Failed to fetch pack items: ${packError.message}` }
        }

        // Validate that we got the expected pack items
        if (!packItems || packItems.length === 0) {
            console.warn(`No pack items found for pack_id: ${validatedPlaybookId} with selected IDs: ${validatedSelectedTaskIds.join(', ')}`)
            // Don't fail here - user might have selected invalid items, but objective should still be created
        } else {
            // Validate that all pack items have required fields
            const invalidItems = packItems.filter(item => !item.title || item.title.trim().length === 0)
            if (invalidItems.length > 0) {
                console.error('Pack items with missing or empty titles:', invalidItems.map(i => i.id))
                // Delete the objective to prevent partial creation
                const { error: deleteError } = await supabase
                    .from('objectives')
                    .delete()
                    .eq('id', objective.id)
                
                if (deleteError) {
                    console.error('Failed to clean up objective after validation failure:', deleteError)
                    return { error: `Invalid pack items detected and cleanup failed. Objective ID: ${objective.id}` }
                }
                
                return { error: 'One or more pack items are missing required fields (title)' }
            }

            // Check if any tasks need AI Agent assignment
            const needsAIAgent = packItems.some(t => t.role === 'AI_Agent')
            let aiAgentId: string | null = null
            
            if (needsAIAgent) {
                const { data: aiAgents, error: aiAgentError } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('role', 'AI_Agent')
                    .limit(1)
                
                if (aiAgentError) {
                    console.error('Error fetching AI Agent:', aiAgentError)
                    // Non-fatal: continue without AI agent assignment, will assign to creator
                } else {
                    aiAgentId = aiAgents?.[0]?.id || null
                    if (!aiAgentId) {
                        console.warn('AI Agent role tasks found but no AI Agent profile exists. Assigning to creator.')
                    }
                }
            }

            // Create task objects from pack items
            const now = new Date()
            const nextWeek = new Date(now)
            nextWeek.setDate(now.getDate() + 7)

            const packTasks = packItems.map(item => {
                // Validate title (should already be validated above, but double-check)
                if (!item.title || item.title.trim().length === 0) {
                    throw new Error(`Pack item ${item.id} has invalid title`)
                }

                // Determine assignee: AI Agent if role matches and exists, otherwise creator
                const assigneeId = (item.role === 'AI_Agent' && aiAgentId) ? aiAgentId : user.id

                return {
                    title: item.title.trim(),
                    description: item.description?.trim() || '',
                    objective_id: objective.id,
                    creator_id: user.id,
                    foundry_id,
                    status: 'Pending' as const,
                    assignee_id: assigneeId,
                    start_date: now.toISOString(),
                    end_date: nextWeek.toISOString(),
                    risk_level: 'Low' as const,
                    client_visible: true
                }
            })

            tasksToInsert = [...tasksToInsert, ...packTasks]
        }
    }

    // B. From AI Import
    if (aiTasksJson.length > 0) {
        // Find AI Agent if needed
        let aiAgentId = null
        const { data: aiAgents } = await supabase
            .from('profiles')
            .select('id')
            .eq('role', 'AI_Agent')
            .limit(1)
        aiAgentId = aiAgents?.[0]?.id || null

        const aiTasks = aiTasksJson.map(str => {
            try {
                return JSON.parse(str)
            } catch (parseError) {
                console.error('Failed to parse AI task JSON:', parseError)
                throw new Error(`Invalid task data format: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`)
            }
        })
        tasksToInsert = [
            ...tasksToInsert,
            ...aiTasks.map(task => ({
                title: task.title,
                description: task.description,
                objective_id: objective.id,
                creator_id: user.id,
                foundry_id,
                status: 'Pending' as const,
                assignee_id: task.role === 'AI_Agent' ? aiAgentId : user.id, // Assign to creator by default
                risk_level: 'Low' as const,
                client_visible: true
            }))
        ]
    }

    if (tasksToInsert.length > 0) {
        try {
            await withRetry(async () => {
                const result = await supabase.from('tasks').insert(tasksToInsert)
                if (result.error) throw result.error
                return result
            })
        } catch (taskError) {
            console.error('Error creating tasks:', taskError)
            // Delete the objective to prevent partial creation
            const { error: deleteError } = await supabase
                .from('objectives')
                .delete()
                .eq('id', objective.id)
            
            if (deleteError) {
                console.error('Failed to clean up objective after task creation failure:', deleteError)
                return { error: `Failed to create tasks and cleanup failed. Objective ID: ${objective.id}` }
            }
            
            const errorMessage = taskError instanceof Error ? taskError.message : 'Unknown error'
            return { error: `Failed to create tasks: ${errorMessage}` }
        }
    }

    revalidatePath('/objectives')
    revalidatePath('/tasks')
    return { success: true }
}


// Admin client for bypassing RLS during deletions (cascading)
import { createClient as createAdminClient } from '@supabase/supabase-js'

const getAdminClient = () => {
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const sbServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!sbUrl || !sbServiceRoleKey) {
        throw new Error('Missing Supabase Service Role configuration')
    }

    return createAdminClient<Database>(sbUrl, sbServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
}

export async function deleteObjective(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    // 1. Verify ownership
    const { data: objective, error: fetchError } = await supabase
        .from('objectives')
        .select('creator_id')
        .eq('id', id)
        .single()

    if (fetchError || !objective) return { error: 'Objective not found' }
    if (objective.creator_id !== user.id) return { error: 'Unauthorized: Only the creator can delete this objective' }

    // 2. Perform delete with Admin Client to bypass RLS on child tables (tasks, history, comments)
    try {
        const adminClient = getAdminClient()
        const { error: deleteError } = await adminClient
            .from('objectives')
            .delete()
            .eq('id', id)

        if (deleteError) {
            console.error('Delete error:', deleteError)
            return { error: deleteError.message }
        }
    } catch (e) {
        console.error('Admin client error:', e)
        return { error: 'Server configuration error preventing deletion' }
    }

    revalidatePath('/objectives')
    return { success: true }
}

export async function deleteObjectives(ids: string[]) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    // 1. Verify ownership of ALL objectives
    // We only delete the ones the user owns to be safe, or fail if they don't own all?
    // Let's delete only what they own.
    const { data: objectives, error: fetchError } = await supabase
        .from('objectives')
        .select('id, creator_id')
        .in('id', ids)

    if (fetchError) return { error: fetchError.message }

    const idsToDelete = objectives
        .filter(o => o.creator_id === user.id)
        .map(o => o.id)

    if (idsToDelete.length === 0) return { error: 'No authorized objectives to delete' }

    // 2. Perform delete with Admin Client
    try {
        const adminClient = getAdminClient()
        const { error: deleteError } = await adminClient
            .from('objectives')
            .delete()
            .in('id', idsToDelete)

        if (deleteError) {
            console.error('Bulk delete error:', deleteError)
            return { error: deleteError.message }
        }
    } catch (e) {
        console.error('Admin client error:', e)
        return { error: 'Server configuration error preventing deletion' }
    }

    revalidatePath('/objectives')
    return { success: true }
}
