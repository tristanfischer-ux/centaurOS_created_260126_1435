import { createClient } from '@/lib/supabase/server'

export type AuditActionType = 'CREATED' | 'UPDATED' | 'STATUS_CHANGE' | 'ASSIGNED' | 'COMPLETED' | 'FORWARDED'

export async function logTaskHistory(
    taskId: string,
    actionType: AuditActionType,
    userId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    changes: Record<string, any> = {}
) {
    const supabase = await createClient()

    // Insert into task_history.
    const { error } = await supabase.from('task_history').insert({
        task_id: taskId,
        user_id: userId,
        action_type: actionType,
        changes: changes
    })

    if (error) {
        console.error('Failed to log task history:', error)
    }
}
