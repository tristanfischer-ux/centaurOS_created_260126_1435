'use server'


import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Database } from '@/types/database.types'
import { createObjectiveSchema, updateObjectiveSchema, validate } from '@/lib/validations'
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
    const extendedDescription = formData.get('extendedDescription') as string
    const playbookId = formData.get('playbookId') as string
    const isPrivate = formData.get('is_private') === 'true'
    const shareWithJson = formData.get('share_with') as string

    // Get selected tasks (handle multiple values with same name)
    const selectedTaskIds = formData.getAll('selectedTaskIds') as string[]
    // AI Import tasks (JSON strings)
    const aiTasksJson = formData.getAll('aiTasks') as string[]

    // Parse task assignee selections (packItemId -> userId or 'unassigned')
    const taskAssigneesJson = formData.get('taskAssignees') as string | null
    let taskAssignees: Record<string, string> = {}
    if (taskAssigneesJson) {
        try {
            taskAssignees = JSON.parse(taskAssigneesJson)
        } catch (parseError) {
            console.error('[ObjectiveService] Failed to parse taskAssignees:', parseError)
        }
    }

    // Validate using Zod schema
    const rawData = {
        title: title || '',
        description: description || undefined,
        playbookId: playbookId && playbookId !== 'none' ? playbookId : undefined,
        selectedTaskIds: selectedTaskIds.length > 0 ? selectedTaskIds : undefined
    }

    const validation = validate(createObjectiveSchema, rawData)
    if (!validation.success) {
        return { error: 'error' in validation ? validation.error : 'Validation failed' }
    }

    const { title: validatedTitle, description: validatedDescription, playbookId: validatedPlaybookId, selectedTaskIds: validatedSelectedTaskIds } = validation.data

    // 2. Create the objective
    let objective
    try {
        const result = await withRetry(async () => {
            const res = await supabase.from('objectives').insert({
                title: validatedTitle,
                description: validatedDescription || null,
                extended_description: extendedDescription?.trim() || null,
                creator_id: user.id,
                foundry_id,
                is_private: isPrivate,
            }).select().single()
            if (res.error) throw res.error
            return res.data
        })
        objective = result
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to create objective' }
    }

    if (!objective) return { error: 'Failed to create objective' }

    // Insert share records for private objectives
    if (isPrivate && shareWithJson) {
        try {
            const shareTargets = JSON.parse(shareWithJson) as { type: string; id: string }[]
            const shareRecords = shareTargets.map(target => ({
                objective_id: objective.id,
                shared_with_user_id: target.type === 'user' ? target.id : null,
                shared_with_team_id: target.type === 'team' ? target.id : null,
                shared_by: user.id,
            }))
            if (shareRecords.length > 0) {
                const { error: shareError } = await supabase.from('objective_shares').insert(shareRecords)
                if (shareError) {
                    console.error('[ObjectiveService] Failed to create objective shares:', shareError)
                }
            }
        } catch (error) {
            console.error('[ObjectiveService] Failed to parse share targets:', error)
        }
    }

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

            // Create task objects from pack items
            const now = new Date()
            const nextWeek = new Date(now)
            nextWeek.setDate(now.getDate() + 7)

            const packTasks = packItems.map(item => {
                // Validate title (should already be validated above, but double-check)
                if (!item.title || item.title.trim().length === 0) {
                    throw new Error(`Pack item ${item.id} has invalid title`)
                }

                // Determine assignee from user selection, fallback to creator
                const selectedAssignee = taskAssignees[item.id]
                const assigneeId = (selectedAssignee && selectedAssignee !== 'unassigned')
                    ? selectedAssignee
                    : user.id

                return {
                    title: item.title.trim(),
                    description: item.description?.trim() || '',
                    objective_id: objective.id,
                    creator_id: user.id,
                    foundry_id,
                    status: 'Pending' as const,
                    assignee_id: assigneeId,
                    start_date: now.toISOString(),
                    end_date: nextWeek.toISOString()
                }
            })

            tasksToInsert = [...tasksToInsert, ...packTasks]
        }
    }

    // B. From AI Import
    if (aiTasksJson.length > 0) {
        const aiTasks = aiTasksJson.map(str => {
            try {
                return JSON.parse(str)
            } catch (parseError) {
                console.error('Failed to parse AI task JSON:', parseError)
                throw new Error(`Invalid task data format: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`)
            }
        })

        // Validate parsed task properties
        for (const task of aiTasks) {
            if (!task || typeof task !== 'object') {
                return { error: 'Invalid task data: expected an object' }
            }
            if (!task.title || typeof task.title !== 'string' || task.title.trim().length === 0) {
                return { error: 'Invalid task data: title is required and must be a non-empty string' }
            }
        }

        tasksToInsert = [
            ...tasksToInsert,
            ...aiTasks.map(task => ({
                title: task.title.trim(),
                description: typeof task.description === 'string' ? task.description.trim() : '',
                objective_id: objective.id,
                creator_id: user.id,
                foundry_id,
                status: 'Pending' as const,
                assignee_id: user.id
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


/**
 * Updates an existing objective's title, description, or extended description.
 * 
 * @description Allows the creator or foundry members to update objective details.
 * Only foundry members can edit objectives within their foundry.
 * 
 * @param objectiveId - The ID of the objective to update
 * @param updates - Object containing fields to update (title, description, extendedDescription)
 * @returns Success status or error message
 * 
 * @throws {UnauthorizedError} If user is not authenticated or not in the foundry
 * @throws {NotFoundError} If objective doesn't exist or user can't access it
 * 
 * @security Verifies user is authenticated and objective belongs to their foundry
 * @audit Logs objective_updated event
 */
export async function updateObjective(
    objectiveId: string,
    updates: {
        title?: string
        description?: string | null
        extendedDescription?: string | null
    }
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // AUTH: Verify user is authenticated
    if (!user) return { error: 'Unauthorized' }

    // SECURITY: Get user's foundry_id for multi-tenant isolation
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    // VALIDATION: Validate input using Zod schema
    const rawData = {
        objectiveId,
        title: updates.title,
        description: updates.description,
        extendedDescription: updates.extendedDescription
    }

    const validation = validate(updateObjectiveSchema, rawData)
    if (!validation.success) {
        return { error: 'error' in validation ? validation.error : 'Validation failed' }
    }

    const { title, description, extendedDescription } = validation.data

    // SECURITY: Verify objective exists and belongs to user's foundry
    const { data: objective, error: fetchError } = await supabase
        .from('objectives')
        .select('id, foundry_id')
        .eq('id', objectiveId)
        .single()

    if (fetchError || !objective) {
        return { error: 'Objective not found' }
    }

    // SECURITY: Check foundry isolation
    if (objective.foundry_id !== foundry_id) {
        console.warn(`[SECURITY] User ${user.id} attempted to update objective ${objectiveId} from different foundry`)
        return { error: 'Objective not found' } // Don't reveal it exists
    }

    // Build update object with only provided fields
    const updateData: {
        title?: string
        description?: string | null
        extended_description?: string | null
        updated_at: string
    } = {
        updated_at: new Date().toISOString()
    }

    if (title !== undefined) {
        updateData.title = title
    }
    if (description !== undefined) {
        updateData.description = description
    }
    if (extendedDescription !== undefined) {
        updateData.extended_description = extendedDescription
    }

    // Perform the update
    try {
        const { error: updateError } = await withRetry(async () => {
            const res = await supabase
                .from('objectives')
                .update(updateData)
                .eq('id', objectiveId)
            if (res.error) throw res.error
            return res
        })

        if (updateError) {
            console.error('[ObjectiveService] Failed to update objective:', {
                objectiveId,
                error: updateError.message
            })
            return { error: updateError.message }
        }
    } catch (error) {
        console.error('[ObjectiveService] Unexpected error updating objective:', {
            objectiveId,
            error: error instanceof Error ? error.message : 'Unknown error'
        })
        return { error: error instanceof Error ? error.message : 'Failed to update objective' }
    }

    // AUDIT: Log update event
    console.info('[ObjectiveService] Objective updated:', {
        objectiveId,
        updatedBy: user.id,
        foundryId: foundry_id,
        fieldsUpdated: Object.keys(updateData).filter(k => k !== 'updated_at')
    })

    revalidatePath('/objectives')
    revalidatePath(`/objectives/${objectiveId}`)
    return { success: true }
}
/**
 * Deletes an objective, handling child objectives based on the specified action.
 *
 * @description When an objective has children (sub-objectives that reference it via
 * parent_objective_id), the caller must specify how to handle them. Without this,
 * the database foreign key constraint would block the delete.
 *
 * @param id - The objective ID to delete
 * @param childAction - What to do with child objectives:
 *   'keep' = unlink children (set parent_objective_id to null, they become top-level)
 *   'cascade' = delete children recursively along with the parent
 *   Defaults to 'keep' for safety.
 *
 * @returns Success or error result
 *
 * @security Requires authenticated user who is the creator or has Executive/Founder role
 * @audit Foundry isolation enforced — cannot delete across foundries
 */
export async function deleteObjective(id: string, childAction: 'keep' | 'cascade' = 'keep') {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    // SECURITY: Get user's foundry_id for multi-tenant isolation
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    // 1. Verify ownership AND foundry isolation
    const { data: objective, error: fetchError } = await supabase
        .from('objectives')
        .select('creator_id, foundry_id')
        .eq('id', id)
        .single()

    if (fetchError || !objective) return { error: 'Objective not found' }
    
    // SECURITY: Check foundry isolation first
    if (objective.foundry_id !== foundry_id) {
        console.warn(`[SECURITY] User ${user.id} attempted to delete objective ${id} from different foundry`)
        return { error: 'Objective not found' } // Don't reveal it exists
    }
    
    // AUTH: Get user role to check for elevated permissions
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    const canDeleteAny = profile?.role === 'Executive' || profile?.role === 'Founder'

    // SECURITY: Allow delete if creator OR has elevated role (Executive/Founder)
    if (objective.creator_id !== user.id && !canDeleteAny) {
        return { error: 'Unauthorized: Only the creator or admins can delete this objective' }
    }

    // 2. Handle child objectives before deleting
    if (childAction === 'cascade') {
        // Recursively find all descendant objectives to delete in one pass
        const { data: children } = await supabase
            .from('objectives')
            .select('id')
            .eq('parent_objective_id', id)

        if (children && children.length > 0) {
            // Recurse into each child (depth-first) so leaves are deleted before parents
            for (const child of children) {
                const result = await deleteObjective(child.id, 'cascade')
                if (result?.error) {
                    console.error('[ObjectiveService] Failed to cascade-delete child:', {
                        parentId: id,
                        childId: child.id,
                        error: result.error,
                    })
                    return { error: `Failed to delete sub-objective: ${result.error}` }
                }
            }
        }
    } else {
        // 'keep' — unlink children so they become top-level objectives
        const { error: unlinkError } = await supabase
            .from('objectives')
            .update({ parent_objective_id: null })
            .eq('parent_objective_id', id)

        if (unlinkError) {
            console.error('[ObjectiveService] Failed to unlink children before delete:', {
                id,
                error: unlinkError.message,
            })
            return { error: 'Failed to unlink sub-objectives before deleting' }
        }
    }

    // 3. Perform delete — children are now handled
    const { error: deleteError } = await supabase
        .from('objectives')
        .delete()
        .eq('id', id)

    if (deleteError) {
        console.error('[ObjectiveService] Delete error:', { id, error: deleteError.message })
        return { error: deleteError.message }
    }

    revalidatePath('/objectives')
    return { success: true }
}

/**
 * Bulk-deletes multiple objectives, handling child objectives via childAction.
 *
 * @param ids - Array of objective IDs to delete
 * @param childAction - 'keep' (unlink children) or 'cascade' (delete children too). Defaults to 'keep'.
 *
 * @security Foundry isolation + creator/admin permission check on each objective
 */
export async function deleteObjectives(ids: string[], childAction: 'keep' | 'cascade' = 'keep') {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    // SECURITY: Get user's foundry_id for multi-tenant isolation
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    // AUTH: Get user role to check for elevated permissions
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    const canDeleteAny = profile?.role === 'Executive' || profile?.role === 'Founder'

    // 1. Verify ownership AND foundry isolation of ALL objectives
    const { data: objectives, error: fetchError } = await supabase
        .from('objectives')
        .select('id, creator_id, foundry_id')
        .in('id', ids)

    if (fetchError) return { error: fetchError.message }

    // SECURITY: Filter objectives - must belong to user's foundry, and either:
    // - User is creator, OR
    // - User has elevated role (Executive/Founder)
    const idsToDelete = objectives
        .filter(o => o.foundry_id === foundry_id && (canDeleteAny || o.creator_id === user.id))
        .map(o => o.id)

    if (idsToDelete.length === 0) return { error: 'No authorized objectives to delete' }

    // 2. Handle children for each objective using the single-delete function
    // This ensures consistent child-handling logic in one place
    const errors: string[] = []
    for (const id of idsToDelete) {
        const result = await deleteObjective(id, childAction)
        if (result?.error) {
            errors.push(`${id}: ${result.error}`)
        }
    }

    if (errors.length > 0) {
        console.error('[ObjectiveService] Bulk delete partial failures:', errors)
        return { error: `Failed to delete ${errors.length} objective(s)` }
    }

    revalidatePath('/objectives')
    return { success: true }
}

/**
 * Creates an objective from a universal subsystem objective pack
 * 
 * @description Creates an objective with pre-built tasks from a subsystem pack.
 * Tasks are created with proper role assignments and marketplace task markers.
 * 
 * @param input - The subsystem objective creation input
 * @returns The created objective ID or an error
 * 
 * @security Requires authenticated user with foundry membership
 */
export async function createObjectiveFromSubsystem(input: {
    subsystemId: string
    subsystemName: string
    packId: string
    packTitle: string
    packSummary: string | null
    packDescription: string | null
    selectedTaskIndices: number[]
    tasks: Array<{
        order: number
        title: string
        description: string
        role: 'Executive' | 'Apprentice' | 'AI_Agent'
        estimated_hours?: number
        is_marketplace_task?: boolean
        marketplace_filter?: {
            categories?: string[]
            type?: 'advice' | 'supplier'
            subcategory?: string
        }
    }>
}): Promise<{ objectiveId?: string; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    // AUTH: Get foundry_id for multi-tenant isolation
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    // VALIDATION: Ensure we have tasks to create
    if (input.selectedTaskIndices.length === 0) {
        return { error: 'Please select at least one task' }
    }

    // Get selected tasks
    const selectedTasks = input.tasks.filter((_, index) => 
        input.selectedTaskIndices.includes(index)
    )

    // Create the objective
    const objectiveTitle = input.packTitle
    const objectiveDescription = input.packSummary || `Objective pack for ${input.subsystemName}`
    const extendedDescription = input.packDescription || null

    try {
        // 1. Create the objective
        const { data: objective, error: objError } = await supabase
            .from('objectives')
            .insert({
                title: objectiveTitle,
                description: objectiveDescription,
                extended_description: extendedDescription,
                creator_id: user.id,
                foundry_id,
            })
            .select()
            .single()

        if (objError || !objective) {
            console.error('[CreateSubsystemObjective] Failed to create objective:', objError)
            return { error: objError?.message || 'Failed to create objective' }
        }

        // 2. Create tasks from the selected pack tasks
        const tasksToInsert = selectedTasks.map((task) => {
            // Assign Executive tasks to creator, leave Apprentice tasks
            // unassigned for manual team assignment
            let assignee_id: string | null = null
            if (task.role === 'Executive') {
                assignee_id = user.id
            }
            // Apprentice and other tasks left unassigned for team assignment

            // Add marketplace context to description if it's a marketplace task
            let description = task.description
            if (task.is_marketplace_task && task.marketplace_filter) {
                const filterType = task.marketplace_filter.type === 'advice' 
                    ? 'experts and advisors' 
                    : 'suppliers and service providers'
                const categories = task.marketplace_filter.categories?.join(', ') || 'relevant categories'
                description += `\n\n---\n**Marketplace Discovery Task**\nSearch the ForgeOS marketplace for ${filterType} in: ${categories}`
            }

            return {
                title: task.title,
                description,
                objective_id: objective.id,
                creator_id: user.id,
                assignee_id,
                foundry_id,
                status: 'Pending' as const,
                start_date: new Date().toISOString(),
                end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // +7 days
            }
        })

        if (tasksToInsert.length > 0) {
            const { error: tasksError } = await supabase
                .from('tasks')
                .insert(tasksToInsert)

            if (tasksError) {
                console.error('[CreateSubsystemObjective] Failed to create tasks:', tasksError)
                // Clean up the objective if task creation fails
                await supabase.from('objectives').delete().eq('id', objective.id)
                return { error: `Failed to create tasks: ${tasksError.message}` }
            }
        }

        // AUDIT: Log the objective creation
        console.info('[CreateSubsystemObjective] Created objective:', {
            objectiveId: objective.id,
            subsystemId: input.subsystemId,
            subsystemName: input.subsystemName,
            taskCount: tasksToInsert.length,
            userId: user.id,
            foundryId: foundry_id,
        })

        revalidatePath('/objectives')
        return { objectiveId: objective.id }

    } catch (error) {
        console.error('[CreateSubsystemObjective] Unexpected error:', error)
        return { error: error instanceof Error ? error.message : 'Failed to create objective' }
    }
}

/**
 * Updates the privacy setting and share targets for an objective.
 *
 * @param objectiveId - The objective to update
 * @param isPrivate - Whether the objective should be private
 * @param shareTargets - Array of { type: 'user'|'team', id: string }
 *
 * @security Only the objective creator can change privacy settings
 */
export async function updateObjectivePrivacy(
    objectiveId: string,
    isPrivate: boolean,
    shareTargets: { type: string; id: string }[]
): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // AUTH: Verify user is the objective creator
    const { data: objective, error: fetchError } = await supabase
        .from('objectives')
        .select('id, creator_id')
        .eq('id', objectiveId)
        .single()

    if (fetchError || !objective) return { error: 'Objective not found' }
    if (objective.creator_id !== user.id) return { error: 'Only the objective creator can change privacy settings' }

    // Update is_private flag
    const { error: updateError } = await supabase
        .from('objectives')
        .update({ is_private: isPrivate })
        .eq('id', objectiveId)

    if (updateError) return { error: 'Failed to update privacy setting' }

    // Replace all shares: delete existing, insert new
    const { error: deleteError } = await supabase
        .from('objective_shares')
        .delete()
        .eq('objective_id', objectiveId)

    if (deleteError) {
        console.error('[ObjectiveService] Failed to clear objective shares:', deleteError)
    }

    if (isPrivate && shareTargets.length > 0) {
        const shareRecords = shareTargets.map(target => ({
            objective_id: objectiveId,
            shared_with_user_id: target.type === 'user' ? target.id : null,
            shared_with_team_id: target.type === 'team' ? target.id : null,
            shared_by: user.id,
        }))
        const { error: shareError } = await supabase.from('objective_shares').insert(shareRecords)
        if (shareError) {
            console.error('[ObjectiveService] Failed to create objective shares:', shareError)
            return { error: 'Privacy updated but failed to save share settings' }
        }
    }

    revalidatePath('/objectives')
    return {}
}

/**
 * Gets share targets for an objective.
 *
 * @param objectiveId - The objective to get shares for
 * @returns Array of share targets with names for display
 */
export async function getObjectiveShares(objectiveId: string): Promise<{
    data: { type: 'user' | 'team'; id: string; name: string }[]
    error?: string
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Unauthorized' }

    const { data: shares, error } = await supabase
        .from('objective_shares')
        .select(`
            shared_with_user_id,
            shared_with_team_id,
            user:profiles!shared_with_user_id(id, full_name),
            team:teams!shared_with_team_id(id, name)
        `)
        .eq('objective_id', objectiveId)

    if (error) return { data: [], error: 'Failed to fetch shares' }

    const targets = (shares || []).map(s => {
        if (s.shared_with_user_id && s.user) {
            return { type: 'user' as const, id: s.shared_with_user_id, name: (s.user as { full_name: string }).full_name || 'Unknown' }
        }
        if (s.shared_with_team_id && s.team) {
            return { type: 'team' as const, id: s.shared_with_team_id, name: (s.team as { name: string }).name || 'Unknown' }
        }
        return null
    }).filter(Boolean) as { type: 'user' | 'team'; id: string; name: string }[]

    return { data: targets }
}

// ============================================================================
// STRATEGIC OBJECTIVES (high-level pillars that regular objectives link to)
// ============================================================================

/**
 * Fetches all strategic objectives for the current user's foundry.
 *
 * @description Returns objectives where is_strategic_goal = true,
 * ordered by creation date. These serve as high-level grouping pillars
 * on the Strategy page.
 *
 * @returns Array of strategic objectives or error
 *
 * @security Scoped to user's foundry via foundry_id check
 */
export async function getStrategicObjectives(): Promise<{
    data: { id: string; title: string; created_at: string }[]
    error?: string
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Unauthorized' }

    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { data: [], error: 'User not in a foundry' }

    const { data, error } = await supabase
        .from('objectives')
        .select('id, title, created_at')
        .eq('foundry_id', foundry_id)
        .eq('is_strategic_goal', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })

    if (error) {
        console.error('[ObjectiveService] Failed to fetch strategic objectives:', {
            foundryId: foundry_id,
            error: error.message,
        })
        return { data: [], error: error.message }
    }

    return { data: data || [] }
}

/**
 * Creates a new strategic objective (high-level pillar).
 *
 * @description Creates an objective row with is_strategic_goal = true.
 * These serve as grouping labels for regular objectives on the Strategy page.
 *
 * @param title - The strategic objective title
 * @returns The created strategic objective or error
 *
 * @throws {UnauthorizedError} If user is not authenticated
 * @security Requires authenticated user with foundry membership
 * @audit Logs strategic_objective_created event
 */
export async function createStrategicObjective(title: string): Promise<{
    data?: { id: string; title: string; created_at: string }
    error?: string
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    // VALIDATION: Title must be non-empty
    const trimmed = title.trim()
    if (!trimmed || trimmed.length > 200) {
        return { error: 'Title must be between 1 and 200 characters' }
    }

    const { data, error } = await supabase
        .from('objectives')
        .insert({
            title: trimmed,
            creator_id: user.id,
            foundry_id,
            is_strategic_goal: true,
        })
        .select('id, title, created_at')
        .single()

    if (error) {
        console.error('[ObjectiveService] Failed to create strategic objective:', {
            foundryId: foundry_id,
            error: error.message,
        })
        return { error: error.message }
    }

    // AUDIT: Log creation
    console.info('[ObjectiveService] Strategic objective created:', {
        id: data.id,
        title: trimmed,
        createdBy: user.id,
        foundryId: foundry_id,
    })

    revalidatePath('/new-objectives')
    return { data }
}

/**
 * Updates a strategic objective's title.
 *
 * @description Updates the title of a strategic objective (is_strategic_goal = true).
 *
 * @param id - The strategic objective ID
 * @param title - The new title
 * @returns Success or error
 *
 * @security Verifies objective belongs to user's foundry and is a strategic goal
 * @audit Logs strategic_objective_updated event
 */
export async function updateStrategicObjective(
    id: string,
    title: string
): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    // VALIDATION: Title must be non-empty
    const trimmed = title.trim()
    if (!trimmed || trimmed.length > 200) {
        return { error: 'Title must be between 1 and 200 characters' }
    }

    // SECURITY: Verify objective exists, belongs to foundry, and is a strategic goal
    const { data: existing, error: fetchError } = await supabase
        .from('objectives')
        .select('id, foundry_id, is_strategic_goal')
        .eq('id', id)
        .single()

    if (fetchError || !existing) return { error: 'Strategic objective not found' }
    if (existing.foundry_id !== foundry_id) {
        console.warn(`[SECURITY] User ${user.id} attempted to update strategic objective ${id} from different foundry`)
        return { error: 'Strategic objective not found' }
    }
    if (!existing.is_strategic_goal) {
        return { error: 'Not a strategic objective' }
    }

    const { error: updateError } = await supabase
        .from('objectives')
        .update({ title: trimmed, updated_at: new Date().toISOString() })
        .eq('id', id)

    if (updateError) {
        console.error('[ObjectiveService] Failed to update strategic objective:', {
            id,
            error: updateError.message,
        })
        return { error: updateError.message }
    }

    // AUDIT: Log update
    console.info('[ObjectiveService] Strategic objective updated:', {
        id,
        newTitle: trimmed,
        updatedBy: user.id,
        foundryId: foundry_id,
    })

    revalidatePath('/new-objectives')
    return {}
}

/**
 * Deletes a strategic objective and unlinks all child objectives.
 *
 * @description Hard-deletes the strategic objective and sets parent_objective_id = null
 * on any regular objectives that were linked to it.
 *
 * @param id - The strategic objective ID
 * @returns Success or error
 *
 * @security Verifies objective belongs to user's foundry, is a strategic goal,
 * and user has elevated permissions (Founder/Executive)
 * @audit Logs strategic_objective_deleted event
 */
export async function deleteStrategicObjective(id: string): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    // SECURITY: Verify objective exists, belongs to foundry, and is a strategic goal
    const { data: existing, error: fetchError } = await supabase
        .from('objectives')
        .select('id, foundry_id, is_strategic_goal, creator_id')
        .eq('id', id)
        .single()

    if (fetchError || !existing) return { error: 'Strategic objective not found' }
    if (existing.foundry_id !== foundry_id) {
        console.warn(`[SECURITY] User ${user.id} attempted to delete strategic objective ${id} from different foundry`)
        return { error: 'Strategic objective not found' }
    }
    if (!existing.is_strategic_goal) {
        return { error: 'Not a strategic objective' }
    }

    // AUTH: Check permissions — creator or elevated role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    const canDelete = existing.creator_id === user.id ||
        profile?.role === 'Founder' || profile?.role === 'Executive'

    if (!canDelete) {
        return { error: 'Only the creator or admins can delete strategic objectives' }
    }

    // Unlink child objectives first (set parent_objective_id to null)
    const { error: unlinkError } = await supabase
        .from('objectives')
        .update({ parent_objective_id: null })
        .eq('parent_objective_id', id)

    if (unlinkError) {
        console.error('[ObjectiveService] Failed to unlink children before deleting strategic objective:', {
            id,
            error: unlinkError.message,
        })
        // Continue with delete anyway — orphaned references are less harmful than leaving stale strategic objectives
    }

    // Delete the strategic objective
    const { error: deleteError } = await supabase
        .from('objectives')
        .delete()
        .eq('id', id)

    if (deleteError) {
        console.error('[ObjectiveService] Failed to delete strategic objective:', {
            id,
            error: deleteError.message,
        })
        return { error: deleteError.message }
    }

    // AUDIT: Log deletion
    console.info('[ObjectiveService] Strategic objective deleted:', {
        id,
        deletedBy: user.id,
        foundryId: foundry_id,
    })

    revalidatePath('/new-objectives')
    return {}
}

/**
 * Links or unlinks a regular objective to/from a strategic objective.
 *
 * @description Sets or clears parent_objective_id on a regular objective
 * to associate it with a strategic objective pillar.
 *
 * @param objectiveId - The regular objective to link
 * @param strategicObjectiveId - The strategic objective to link to, or null to unlink
 * @returns Success or error
 *
 * @security Verifies both objectives belong to user's foundry
 * @audit Logs objective_linked / objective_unlinked event
 */
export async function linkObjectiveToStrategic(
    objectiveId: string,
    strategicObjectiveId: string | null
): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    // SECURITY: Verify the objective exists and belongs to foundry
    const { data: objective, error: fetchError } = await supabase
        .from('objectives')
        .select('id, foundry_id, is_strategic_goal')
        .eq('id', objectiveId)
        .single()

    if (fetchError || !objective) return { error: 'Objective not found' }
    if (objective.foundry_id !== foundry_id) return { error: 'Objective not found' }
    if (objective.is_strategic_goal) return { error: 'Cannot link a strategic objective to another' }

    // SECURITY: If linking (not unlinking), verify strategic objective exists and belongs to foundry
    if (strategicObjectiveId) {
        const { data: strategic, error: stratError } = await supabase
            .from('objectives')
            .select('id, foundry_id, is_strategic_goal')
            .eq('id', strategicObjectiveId)
            .single()

        if (stratError || !strategic) return { error: 'Strategic objective not found' }
        if (strategic.foundry_id !== foundry_id) return { error: 'Strategic objective not found' }
        if (!strategic.is_strategic_goal) return { error: 'Target is not a strategic objective' }
    }

    // Update the link
    const { error: updateError } = await supabase
        .from('objectives')
        .update({ parent_objective_id: strategicObjectiveId })
        .eq('id', objectiveId)

    if (updateError) {
        console.error('[ObjectiveService] Failed to link objective to strategic:', {
            objectiveId,
            strategicObjectiveId,
            error: updateError.message,
        })
        return { error: updateError.message }
    }

    // AUDIT: Log the link/unlink
    console.info('[ObjectiveService] Objective link updated:', {
        objectiveId,
        strategicObjectiveId: strategicObjectiveId || 'unlinked',
        updatedBy: user.id,
        foundryId: foundry_id,
    })

    revalidatePath('/new-objectives')
    return {}
}
