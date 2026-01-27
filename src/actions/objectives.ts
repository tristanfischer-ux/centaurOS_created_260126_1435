'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

import { OBJECTIVE_PLAYBOOKS } from '@/lib/playbooks'

export async function createObjective(formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    const title = formData.get('title') as string
    const description = formData.get('description') as string
    const playbookId = formData.get('playbookId') as string

    if (!title) return { error: 'Title is required' }

    // 1. Create the objective
    const { data: objective, error } = await supabase.from('objectives').insert({
        title,
        description,
        creator_id: user.id,
        foundry_id: 'foundry-demo' // Hardcoded for demo
    }).select().single()

    if (error) return { error: error.message }
    if (!objective) return { error: 'Failed to create objective' }

    // 2. If playbook selected, generate tasks
    if (playbookId && playbookId !== 'none') {
        const playbook = OBJECTIVE_PLAYBOOKS.find(pb => pb.id === playbookId)
        if (playbook) {
            // Find an AI agent to assign AI tasks to (optional)
            const { data: aiAgents } = await supabase
                .from('profiles')
                .select('id')
                .eq('role', 'AI_Agent')
                .limit(1)

            const aiAgentId = aiAgents && aiAgents.length > 0 ? aiAgents[0].id : null

            // Create tasks
            const tasksToInsert = playbook.tasks.map(task => ({
                title: task.title,
                description: task.description,
                objective_id: objective.id,
                creator_id: user.id,
                foundry_id: 'foundry-demo',
                status: 'Pending' as const,
                assignee_id: task.role === 'AI_Agent' ? aiAgentId : null,
                // If it's an Executive task, maybe assign to creator? keeping null for now to let them choose
            }))

            const { error: taskError } = await supabase.from('tasks').insert(tasksToInsert)

            if (taskError) {
                console.error('Error creating playbook tasks:', taskError)
                // Don't fail the whole request, just log it
            }
        }
    }

    revalidatePath('/objectives')
    revalidatePath('/tasks') // Because tasks dropdown uses objectives
    return { success: true }
}

export async function deleteObjective(id: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('objectives').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/objectives')
    return { success: true }
}
