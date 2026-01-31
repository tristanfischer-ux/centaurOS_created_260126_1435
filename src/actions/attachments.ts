'use server'


import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { uploadAttachmentSchema, validate } from '@/lib/validations'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { sanitizeFileName, escapeHtml } from '@/lib/security/sanitize'

export async function uploadTaskAttachment(taskId: string, formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const file = formData.get('file') as File
    if (!file) return { error: 'No file provided' }

    // Validate using Zod schema
    const validation = validate(uploadAttachmentSchema, {
        taskId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
    })
    if (!validation.success) {
        return { error: 'error' in validation ? validation.error : 'Validation failed' }
    }

    // Get user's foundry_id using cached helper
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) {
        return { error: 'User not in a foundry' }
    }

    // Get task's foundry_id and validate it matches user's foundry
    const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('foundry_id')
        .eq('id', taskId)
        .single()

    if (taskError || !task) {
        console.error('Failed to fetch task:', taskError)
        return { error: 'Task not found' }
    }

    if (!task.foundry_id) {
        return { error: 'Task is not associated with a foundry' }
    }

    if (task.foundry_id !== foundry_id) {
        return { error: 'Unauthorized: Task belongs to a different foundry' }
    }

    // SECURITY: Sanitize filename to prevent path traversal
    const sanitizedOriginalName = sanitizeFileName(file.name)
    
    // Upload to Supabase Storage with safe filename
    const fileExt = sanitizedOriginalName.split('.').pop() || 'bin'
    const fileName = `${taskId}/${Date.now()}.${fileExt}`

    // Use task-files bucket (consolidated storage with proper RLS policies)
    const { error: uploadError } = await supabase.storage
        .from('task-files')
        .upload(fileName, file)

    if (uploadError) {
        console.error('File upload failed:', uploadError)
        return { error: uploadError.message }
    }

    // SECURITY: Use signed URLs instead of public URLs to prevent unauthorized access
    const { data: urlData } = await supabase.storage
        .from('task-files')
        .createSignedUrl(fileName, 60 * 60) // 1 hour expiry

    if (!urlData?.signedUrl) {
        return { error: 'Failed to generate file URL' }
    }

    // SECURITY: Escape filename to prevent XSS in markdown rendering
    const safeFileName = escapeHtml(sanitizedOriginalName)
    
    // Store reference as a system comment (keeping this for the thread)
    // Note: We store the file reference, actual URL is generated on-demand via task_files
    const { error: commentError } = await supabase.from('task_comments').insert({
        task_id: taskId,
        foundry_id: task.foundry_id,
        user_id: user.id,
        content: `📎 Attached: ${safeFileName}`,
        is_system_log: true
    })

    if (commentError) {
        console.error('Failed to create comment:', commentError)
        return { error: 'File uploaded but failed to record attachment' }
    }

    // Insert into task_files table for the attachment count
    const { error: fileRecordError } = await supabase.from('task_files').insert({
        task_id: taskId,
        file_name: sanitizedOriginalName, // Use sanitized name
        file_path: fileName, // Store the full storage path
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: user.id
    })

    if (fileRecordError) {
        console.error('Failed to record file:', fileRecordError)
        return { error: 'File uploaded but failed to record in database' }
    }

    revalidatePath('/tasks')
    return { success: true, url: urlData.signedUrl }
}

export async function getTaskAttachments(taskId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // Get user's foundry_id
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return []

    // Verify user has access to the task's foundry
    const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('foundry_id')
        .eq('id', taskId)
        .single()

    if (taskError || !task) return []

    if (task.foundry_id !== foundry_id) {
        return [] // User doesn't have access to this task's foundry
    }

    // List files in task folder (using consolidated task-files bucket)
    const { data, error } = await supabase.storage
        .from('task-files')
        .list(taskId)

    if (error || !data) return []

    // Get public URLs for each
    return data.map(file => {
        const { data: urlData } = supabase.storage
            .from('task-files')
            .getPublicUrl(`${taskId}/${file.name}`)
        // Check if urlData exists before accessing publicUrl
        if (!urlData) {
            return {
                name: file.name,
                url: '',
                size: file.metadata?.size || 0
            }
        }
        return {
            name: file.name,
            url: urlData.publicUrl,
            size: file.metadata?.size || 0
        }
    })
}
