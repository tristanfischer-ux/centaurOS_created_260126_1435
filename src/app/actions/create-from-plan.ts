'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ExtractedObjective } from './analyze-business-plan'

export async function createObjectivesFromPlan(
    data: ExtractedObjective[],
    foundryId: string = 'foundry-demo'
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    try {
        for (const obj of data) {
            // Create Objective
            const { data: objective, error: objError } = await supabase.from('objectives').insert({
                title: obj.title,
                description: obj.description || '',
                creator_id: user.id,
                foundry_id: foundryId,
                status: 'In Progress'
            }).select().single()

            if (objError) {
                console.error('Error creating objective:', objError)
                continue // Skip tasks if objective failed
            }

            if (obj.tasks && obj.tasks.length > 0) {
                const tasksToInsert = obj.tasks.map(task => ({
                    title: task.title,
                    description: task.description || '',
                    objective_id: objective.id,
                    creator_id: user.id,
                    foundry_id: foundryId,
                    status: 'Pending' as const,
                }))

                const { error: tasksError } = await supabase.from('tasks').insert(tasksToInsert)
                if (tasksError) {
                    console.error('Error creating tasks for objective ' + obj.title, tasksError)
                }
            }
        }

        revalidatePath('/objectives')
        revalidatePath('/tasks')
        return { success: true }
    } catch (error) {
        console.error('Error in createObjectivesFromPlan:', error)
        return { success: false, error: 'Failed to create objectives' }
    }
}
