'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

import { OBJECTIVE_PLAYBOOKS } from '@/lib/playbooks'

export async function createObjective(formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    // 1. Get real foundry_id
    const { data: profile } = await supabase
        .from('profiles')
        .select('foundry_id')
        .eq('id', user.id)
        .single()

    if (!profile?.foundry_id) return { error: 'No foundry associated with user' }

    const title = formData.get('title') as string
    const description = formData.get('description') as string
    const playbookId = formData.get('playbookId') as string

    // Get selected tasks (handle multiple values with same name)
    const selectedTaskIds = formData.getAll('selectedTaskIds') as string[]
    // AI Import tasks (JSON strings)
    const aiTasksJson = formData.getAll('aiTasks') as string[]

    if (!title) return { error: 'Title is required' }

    // 2. Create the objective
    const { data: objective, error } = await supabase.from('objectives').insert({
        title,
        description,
        creator_id: user.id,
        foundry_id: profile.foundry_id
    }).select().single()

    if (error) return { error: error.message }
    if (!objective) return { error: 'Failed to create objective' }

    // 3. Create Tasks
    let tasksToInsert: any[] = []

    // A. From Playbook
    if (playbookId && playbookId !== 'none') {
        const playbook = OBJECTIVE_PLAYBOOKS.find(pb => pb.id === playbookId)
        if (playbook) {
            // Filter tasks based on selection
            const tasksFromBook = playbook.tasks.filter(t => selectedTaskIds.includes(t.id))

            // Find AI Agent if needed
            let aiAgentId = null
            if (tasksFromBook.some(t => t.role === 'AI_Agent')) {
                const { data: aiAgents } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('role', 'AI_Agent')
                    .limit(1)
                aiAgentId = aiAgents?.[0]?.id || null
            }

            tasksToInsert = [
                ...tasksToInsert,
                ...tasksFromBook.map(task => ({
                    title: task.title,
                    description: task.description,
                    objective_id: objective.id,
                    creator_id: user.id,
                    foundry_id: profile.foundry_id,
                    status: 'Pending' as const,
                    assignee_id: task.role === 'AI_Agent' ? aiAgentId : null,
                }))
            ]
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

        const aiTasks = aiTasksJson.map(str => JSON.parse(str))
        tasksToInsert = [
            ...tasksToInsert,
            ...aiTasks.map(task => ({
                title: task.title,
                description: task.description,
                objective_id: objective.id,
                creator_id: user.id,
                foundry_id: profile.foundry_id,
                status: 'Pending' as const,
                assignee_id: task.role === 'AI_Agent' ? aiAgentId : null,
            }))
        ]
    }

    if (tasksToInsert.length > 0) {
        const { error: taskError } = await supabase.from('tasks').insert(tasksToInsert)
        if (taskError) {
            console.error('Error creating tasks:', taskError)
        }
    }

    revalidatePath('/objectives')
    revalidatePath('/tasks')
    return { success: true }
}

export async function deleteObjective(id: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('objectives').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/objectives')
    return { success: true }
}
