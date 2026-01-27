'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Database } from '@/types/database.types'



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
    let tasksToInsert: Database['public']['Tables']['tasks']['Insert'][] = []

    // A. From Playbook
    if (playbookId && playbookId !== 'none') {
        const fs = require('fs');
        const logPath = '/tmp/centaur_debug_v2.log';
        fs.appendFileSync(logPath, `\n\n[${new Date().toISOString()}] START PROCESSING PLAYBOOK: ${playbookId}\n`);
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] Selected Task IDs Raw: ${JSON.stringify(selectedTaskIds)}\n`);

        const { data: packItems, error: packError } = await supabase
            .from('pack_items')
            .select('*')
            .eq('pack_id', playbookId)

        if (packError) {
            fs.appendFileSync(logPath, `[ERROR] Supabase Fetch Error: ${JSON.stringify(packError)}\n`);
        }

        fs.appendFileSync(logPath, `[${new Date().toISOString()}] Pack Items Found in DB: ${packItems?.length}\n`);

        if (packItems && packItems.length > 0) {
            // Filter tasks based on selection
            const tasksFromBook = packItems.filter(t => selectedTaskIds.includes(t.id))
            fs.appendFileSync(logPath, `[${new Date().toISOString()}] Tasks matched from selection: ${tasksFromBook.length}\n`);

            if (tasksFromBook.length === 0) {
                fs.appendFileSync(logPath, `[WARNING] No tasks matched! Checking ID types...\n`);
                fs.appendFileSync(logPath, `First PackItem ID: ${packItems[0].id} (${typeof packItems[0].id})\n`);
                if (selectedTaskIds.length > 0) {
                    fs.appendFileSync(logPath, `First Selected ID: ${selectedTaskIds[0]} (${typeof selectedTaskIds[0]})\n`);
                }
            }

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
                ...tasksFromBook.map(task => {
                    const now = new Date()
                    const nextWeek = new Date(now)
                    nextWeek.setDate(now.getDate() + 7)

                    return {
                        title: task.title,
                        description: task.description || '',
                        objective_id: objective.id,
                        creator_id: user.id,
                        foundry_id: profile.foundry_id,
                        status: 'Pending' as const,
                        assignee_id: task.role === 'AI_Agent' ? aiAgentId : user.id, // Assign to creator by default if not AI
                        start_date: now.toISOString(),
                        end_date: nextWeek.toISOString(),
                        risk_level: 'Low' as const,
                        client_visible: true
                    }
                })
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
                assignee_id: task.role === 'AI_Agent' ? aiAgentId : user.id, // Assign to creator by default
                risk_level: 'Low' as const,
                client_visible: true
            }))
        ]
    }

    if (tasksToInsert.length > 0) {
        const { error: taskError } = await supabase.from('tasks').insert(tasksToInsert)
        if (taskError) {
            console.error('Error creating tasks:', taskError)
            // We should probably return this error, or at least a warning. 
            // But since the objective was created, we might want to return { success: true, warning: 'Tasks failed' } 
            // or fail completely? 
            // For now, let's return the error so the user knows.
            return { error: `Objective created, but tasks failed: ${taskError.message}` }
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
