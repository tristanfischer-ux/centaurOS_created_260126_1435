'use server'

/**
 * @file whiteboard-to-task.ts
 *
 * @description Server action to convert Excalidraw sticky note / text elements
 * into CentaurOS tasks. This bridges the freeform brainstorming layer with the
 * structured task management system.
 *
 * @security Uses withAuth wrapper for authentication + foundry isolation.
 */

import { withAuth } from '@/lib/server-action-utils'
import { revalidatePath } from 'next/cache'

interface StickyNoteData {
  /** The text content of the sticky note */
  text: string
  /** Optional objective to link the new task to */
  objectiveId?: string
}

interface ConvertResult {
  data: { id: string; title: string; task_number: number }[] | null
  error: string | null
}

/**
 * Convert one or more sticky note texts into tasks.
 *
 * @description Creates tasks from Excalidraw text/sticky note content.
 * Each sticky note becomes a separate task with "Pending" status,
 * assigned to the current user by default.
 *
 * @param notes - Array of sticky note data to convert
 * @returns Created tasks with their IDs and task numbers
 *
 * @security Requires authenticated user with foundry membership
 */
export async function convertStickyNotesToTasks(
  notes: StickyNoteData[]
): Promise<ConvertResult> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // VALIDATION: Must have at least one note
    if (!notes || notes.length === 0) {
      return { data: null, error: 'No sticky notes provided' }
    }

    // VALIDATION: Cap at 20 tasks per conversion to prevent abuse
    if (notes.length > 20) {
      return { data: null, error: 'Cannot convert more than 20 sticky notes at once' }
    }

    const createdTasks: { id: string; title: string; task_number: number }[] = []

    for (const note of notes) {
      const title = note.text?.trim()
      if (!title) continue

      // Truncate extremely long titles
      const truncatedTitle = title.length > 200 ? title.substring(0, 197) + '...' : title

      // Determine objective_id: use provided or find the first objective
      let objectiveId = note.objectiveId
      if (!objectiveId) {
        // Get the first objective in this foundry as default
        const { data: firstObjective } = await supabase
          .from('objectives')
          .select('id')
          .eq('foundry_id', foundryId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        objectiveId = firstObjective?.id
      }

      if (!objectiveId) {
        return {
          data: null,
          error: 'No objectives found. Create an objective first to convert sticky notes to tasks.',
        }
      }

      // Create the task
      const { data: task, error } = await supabase
        .from('tasks')
        .insert({
          foundry_id: foundryId,
          title: truncatedTitle,
          description: title.length > 200 ? `Full text from whiteboard:\n${title}` : null,
          objective_id: objectiveId,
          creator_id: user.id,
          assignee_id: user.id, // Default to creator
          status: 'Pending',
          risk_level: 'Medium',
          client_visible: false,
        })
        .select('id, title, task_number')
        .single()

      if (error) {
        console.error('[WhiteboardToTask] Failed to create task:', {
          title: truncatedTitle,
          foundryId,
          error: error.message,
        })
        return { data: null, error: `Failed to create task "${truncatedTitle}": ${error.message}` }
      }

      if (task) {
        createdTasks.push(task)

        // Insert into task_assignees for the creator
        await supabase.from('task_assignees').insert({
          task_id: task.id,
          profile_id: user.id,
        })
      }
    }

    if (createdTasks.length === 0) {
      return { data: null, error: 'No tasks created (sticky notes may have been empty)' }
    }

    revalidatePath('/new-tasks')
    revalidatePath('/canvas')

    return { data: createdTasks, error: null }
  }) as Promise<ConvertResult>
}
