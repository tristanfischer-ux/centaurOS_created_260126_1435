'use server'

/**
 * @file tasks-attachments.ts — Task file attachment actions.
 *
 * @description Extracted from tasks.ts to reduce file size. Contains:
 * uploadTaskAttachment, deleteTaskAttachment, getTaskAttachments.
 *
 * @security All queries filter by foundry_id. Uses withAuth() for multi-tenant isolation.
 */

import { revalidatePath } from 'next/cache'
import { withAuth } from '@/lib/server-action-utils'
import { sanitizeFileName, sanitizeErrorMessage } from '@/lib/security/sanitize'
import { canModifyTask, logSystemEvent } from '@/actions/tasks'

export async function uploadTaskAttachment(taskId: string, formData: FormData) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Security: Verify user has permission to modify this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error || 'Unauthorized' }
        }

        const file = formData.get('file') as File
        if (!file) return { error: 'No file provided' }

        // Security: Validate file size (max 25MB)
        const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB
        if (file.size > MAX_FILE_SIZE) {
            return { error: 'File size exceeds maximum limit of 25MB' }
        }

        // Security: Sanitize filename to prevent path traversal
        const safeFileName = sanitizeFileName(file.name)
        const filePath = `${foundryId}/${taskId}/${Date.now()}_${safeFileName}`
        const { error: uploadError } = await supabase.storage
            .from('task-files')
            .upload(filePath, file)

        if (uploadError) return { error: sanitizeErrorMessage(uploadError) }

        const { error: dbError } = await supabase.from('task_files').insert({
            task_id: taskId,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            mime_type: file.type,
            uploaded_by: user.id
        })

        if (dbError) return { error: sanitizeErrorMessage(dbError) }

        try {
            await logSystemEvent(supabase, foundryId, taskId, `Attachment added: ${file.name}`, user.id)
        } catch (logError) {
            console.error('[TaskService] Failed to log system event:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }
        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        return { success: true }
    })
}

/**
 * Deletes a file attachment from a task (both storage and database record).
 *
 * @description Verifies modify permissions, removes the file from Supabase Storage,
 * and deletes the task_files record. Storage deletion failures are logged but do not
 * block the database record cleanup.
 *
 * @param {string} fileId - The task_files record ID
 * @param {string} filePath - The storage path for the file
 * @param {string} taskId - The ID of the task the file belongs to
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires task modify permission via canModifyTask.
 * @audit Logs attachment removal to task_comments (system log)
 */
export async function deleteTaskAttachment(fileId: string, filePath: string, taskId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Security: Verify user has permission to modify this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error || 'Unauthorized' }
        }

        // SECURITY: Verify the file record belongs to the specified task before
        // deleting. Use the DB-stored path, not the user-supplied filePath, to
        // prevent cross-foundry file deletion via path traversal.
        const { data: fileRecord, error: lookupError } = await supabase
            .from('task_files')
            .select('file_path')
            .eq('id', fileId)
            .eq('task_id', taskId)
            .single()
        if (lookupError || !fileRecord) {
            return { error: 'File not found' }
        }

        // Delete from Storage using the verified DB path
        const { error: storageError } = await supabase.storage
            .from('task-files')
            .remove([fileRecord.file_path])

        if (storageError) {
            console.warn("Storage delete failed", storageError)
        }

        // Delete from DB (scoped to task for defense-in-depth)
        const { error: dbError } = await supabase.from('task_files')
            .delete()
            .eq('id', fileId)
            .eq('task_id', taskId)

        if (dbError) return { error: sanitizeErrorMessage(dbError) }

        // Log requires task ID. If we don't have it explicitly passed, we'd need to fetch before delete. 
        // Assuming taskId passed correctly.
        try {
            await logSystemEvent(supabase, foundryId, taskId, `Attachment removed`, user.id)
        } catch (logError) {
            console.error('[TaskService] Failed to log system event:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        return { success: true }
    })
}

/**
 * Fetches comments for a task from the server.
 * 
 * @description Retrieves all comments (notes and system logs) for a task.
 * Uses server-side auth to ensure consistent RLS behavior with addTaskComment.
 * 
 * @param taskId - The task ID to fetch comments for
 * @returns Comments array with user info, or error
 * 
 * @security Requires authenticated user with foundry membership
 */
export async function getTaskComments(taskId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // AUTH: Check user can access this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { data: null, error: authCheck.error || 'Unauthorized' }
        }

        const { data, error } = await supabase
            .from('task_comments')
            .select('id, content, is_system_log, created_at, user_id, user:user_id(full_name, role)')
            .eq('task_id', taskId)
            .order('created_at', { ascending: false })
            .limit(50)

        if (error) {
            console.error('[TaskActions] Failed to fetch comments:', { taskId, error: error.message })
            return { data: null, error: sanitizeErrorMessage(error) }
        }
        
        return { data }
    })
}

/**
 * Retrieves all file attachments for a task.
 *
 * @description Verifies the user has access to the task via canModifyTask, then
 * fetches all task_files records ordered by creation date (newest first).
 *
 * @param {string} taskId - The ID of the task to get attachments for
 * @returns {Promise<{ data: object[] } | { error: string }>} Array of attachment records or error
 *
 * @security Requires task access permission via canModifyTask.
 */
export async function getTaskAttachments(taskId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Security: Verify user has permission to view this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error || 'Unauthorized' }
        }

        const { data, error } = await supabase
            .from('task_files')
            .select('id, task_id, file_name, file_path, file_size, mime_type, uploaded_by, created_at')
            .eq('task_id', taskId)
            .order('created_at', { ascending: false })

        if (error) return { error: sanitizeErrorMessage(error) }
        return { data }
    })
}

/**
 * Retrieves the audit history for a task.
 *
 * @description Verifies the user has access to the task via canModifyTask, then
 * fetches all task_history records with user profile info, ordered by creation
 * date (newest first).
 *
 * @param {string} taskId - The ID of the task to get history for
 * @returns {Promise<{ data: object[] } | { error: string }>} Array of history records or error
 *
 * @security Requires task access permission via canModifyTask.
 */
export async function getTaskHistory(taskId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Security: Verify user has permission to view this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error || 'Unauthorized' }
        }

        const { data, error } = await supabase
            .from('task_history')
            .select(`
                id,
                task_id,
                action_type,
                changes,
                user_id,
                created_at,
                user:profiles(full_name, role, avatar_url)
            `)
            .eq('task_id', taskId)
            .order('created_at', { ascending: false })

        if (error) return { error: sanitizeErrorMessage(error) }
        return { data }
    })
}
