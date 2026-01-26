'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function uploadTaskAttachment(taskId: string, formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const file = formData.get('file') as File
    if (!file) return { error: 'No file provided' }

    // Upload to Supabase Storage
    const fileExt = file.name.split('.').pop()
    const fileName = `${taskId}/${Date.now()}.${fileExt}`

    const { error } = await supabase.storage
        .from('task-attachments')
        .upload(fileName, file)

    if (error) return { error: error.message }

    // Get public URL
    const { data: urlData } = supabase.storage
        .from('task-attachments')
        .getPublicUrl(fileName)

    // Store reference as a system comment (since we don't have attachments table)
    await supabase.from('task_comments').insert({
        task_id: taskId,
        foundry_id: (await supabase.from('tasks').select('foundry_id').eq('id', taskId).single()).data?.foundry_id || '',
        user_id: user.id,
        content: `📎 Attached: [${file.name}](${urlData.publicUrl})`,
        is_system_log: true
    })

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
