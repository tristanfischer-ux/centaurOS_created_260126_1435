'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function uploadTaskAttachment(taskId: string, formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const file = formData.get('file') as File
    if (!file) return { error: 'No file provided' }

    // Get user's foundry_id
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('foundry_id')
        .eq('id', user.id)
        .single()

    if (profileError || !profile) {
        console.error('Failed to fetch user profile:', profileError)
        return { error: 'Failed to verify user permissions' }
    }

    if (!profile.foundry_id) {
        return { error: 'User is not associated with a foundry' }
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

    if (task.foundry_id !== profile.foundry_id) {
        return { error: 'Unauthorized: Task belongs to a different foundry' }
    }

    // Upload to Supabase Storage
    const fileExt = file.name.split('.').pop()
    const fileName = `${taskId}/${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
        .from('task-attachments')
        .upload(fileName, file)

    if (uploadError) {
        console.error('File upload failed:', uploadError)
        return { error: uploadError.message }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
        .from('task-attachments')
        .getPublicUrl(fileName)

    // Store reference as a system comment (keeping this for the thread)
    const { error: commentError } = await supabase.from('task_comments').insert({
        task_id: taskId,
        foundry_id: task.foundry_id,
        user_id: user.id,
        content: `📎 Attached: [${file.name}](${urlData.publicUrl})`,
        is_system_log: true
    })

    if (commentError) {
        console.error('Failed to create comment:', commentError)
        return { error: 'File uploaded but failed to record attachment' }
    }

    // Insert into task_files table for the attachment count
    const { error: fileRecordError } = await supabase.from('task_files').insert({
        task_id: taskId,
        file_name: file.name,
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
    return { success: true, url: urlData.publicUrl }
}

export async function getTaskAttachments(taskId: string) {
    const supabase = await createClient()

    // List files in task folder
    const { data, error } = await supabase.storage
        .from('task-attachments')
        .list(taskId)

    if (error || !data) return []

    // Get public URLs for each
    return data.map(file => {
        const { data: urlData } = supabase.storage
            .from('task-attachments')
            .getPublicUrl(`${taskId}/${file.name}`)
        return {
            name: file.name,
            url: urlData.publicUrl,
            size: file.metadata?.size || 0
        }
    })
}
