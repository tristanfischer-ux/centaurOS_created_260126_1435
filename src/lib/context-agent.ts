'use server'

import { createClient } from '@/lib/supabase/server'

export interface TaskContext {
    taskId: string
    title: string
    description: string | null
    status: string
    objectiveTitle: string | null
    assignee: {
        id: string
        name: string | null
    } | null
    creator: {
        id: string
        name: string | null
    } | null
    timeline: {
        created: string
        lastUpdated: string
        deadline: string | null
    }
    commentCount: number
    fileCount: number
    forwardingHistory: Array<{
        from: string
        to: string
        reason: string
        date: string
    }>
}

export interface ContextSummary {
    summary: string
    keyPoints: string[]
    recentActivity: string[]
    blockers: string[]
    nextSteps: string[]
    generatedAt: string
}

// Get full context for a task (for handoff or catch-up)
export async function getTaskContext(taskId: string): Promise<{
    context: TaskContext | null
    error: string | null
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { context: null, error: 'Unauthorized' }

    const { data: task, error } = await supabase
        .from('tasks')
        .select(`
            id,
            title,
            description,
            status,
            created_at,
            updated_at,
            end_date,
            forwarding_history,
            assignee:profiles!assignee_id(id, full_name),
            creator:profiles!created_by(id, full_name),
            objective:objectives!objective_id(id, title)
        `)
        .eq('id', taskId)
        .single()

    if (error) return { context: null, error: error.message }
    if (!task) return { context: null, error: 'Task not found' }

    // Get comment count
    const { count: commentCount } = await supabase
        .from('task_comments')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', taskId)
        .eq('is_system_log', false)

    // Get file count
    const { count: fileCount } = await supabase
        .from('task_files')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', taskId)

    const assignee = task.assignee as { id: string; full_name: string | null } | null
    const creator = task.creator as { id: string; full_name: string | null } | null
    const objective = task.objective as { id: string; title: string } | null

    const context: TaskContext = {
        taskId: task.id,
        title: task.title,
        description: task.description,
        status: task.status || 'Unknown',
        objectiveTitle: objective?.title || null,
        assignee: assignee ? { id: assignee.id, name: assignee.full_name } : null,
        creator: creator ? { id: creator.id, name: creator.full_name } : null,
        timeline: {
            created: task.created_at,
            lastUpdated: task.updated_at,
            deadline: task.end_date
        },
        commentCount: commentCount || 0,
        fileCount: fileCount || 0,
        forwardingHistory: (task.forwarding_history || []) as TaskContext['forwardingHistory']
    }

    return { context, error: null }
}

// Generate a summary for task handoff
export async function generateHandoffSummary(taskId: string): Promise<{
    summary: ContextSummary | null
    error: string | null
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { summary: null, error: 'Unauthorized' }

    // Get task with full details
    const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select(`
            id,
            title,
            description,
            status,
            risk_level,
            created_at,
            updated_at,
            end_date,
            forwarding_history,
            assignee:profiles!assignee_id(id, full_name),
            creator:profiles!created_by(id, full_name),
            objective:objectives!objective_id(id, title, description)
        `)
        .eq('id', taskId)
        .single()

    if (taskError) return { summary: null, error: taskError.message }
    if (!task) return { summary: null, error: 'Task not found' }

    // Get recent comments (last 10)
    const { data: comments } = await supabase
        .from('task_comments')
        .select(`
            content,
            is_system_log,
            created_at,
            user:profiles!task_comments_user_id_fkey(full_name)
        `)
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .limit(10)

    // Get task history
    const { data: history } = await supabase
        .from('task_history')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .limit(10)

    // Generate summary (simplified - would use AI in production)
    const assignee = task.assignee as { full_name: string | null } | null
    const creator = task.creator as { full_name: string | null } | null
    const objective = task.objective as { title: string; description: string | null } | null

    const keyPoints: string[] = []
    const recentActivity: string[] = []
    const blockers: string[] = []
    const nextSteps: string[] = []

    // Key points
    if (task.description) {
        keyPoints.push(`Task: ${task.description.substring(0, 200)}...`)
    }
    if (objective?.title) {
        keyPoints.push(`Part of objective: ${objective.title}`)
    }
    if (task.risk_level === 'High') {
        keyPoints.push('High risk task - requires executive approval')
    }
    if (task.end_date) {
        const dueDate = new Date(task.end_date)
        const now = new Date()
        if (dueDate < now) {
            blockers.push(`Overdue by ${Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))} days`)
        } else {
            keyPoints.push(`Due: ${dueDate.toLocaleDateString()}`)
        }
    }

    // Recent activity from comments
    const userComments = (comments || []).filter(c => !c.is_system_log).slice(0, 3)
    userComments.forEach(c => {
        const userName = (c.user as { full_name: string | null })?.full_name || 'Someone'
        recentActivity.push(`${userName}: ${c.content.substring(0, 100)}...`)
    })

    // System logs as activity
    const systemLogs = (comments || []).filter(c => c.is_system_log).slice(0, 3)
    systemLogs.forEach(c => {
        recentActivity.push(c.content.substring(0, 100))
    })

    // Forwarding history
    const forwardingHistory = task.forwarding_history as Array<{ from: string; to: string; reason: string }> || []
    if (forwardingHistory.length > 0) {
        const lastForward = forwardingHistory[forwardingHistory.length - 1]
        keyPoints.push(`Previously forwarded: ${lastForward.reason}`)
    }

    // Next steps based on status
    switch (task.status) {
        case 'Pending':
            nextSteps.push('Review task requirements')
            nextSteps.push('Accept or reject the task')
            break
        case 'Accepted':
            nextSteps.push('Complete the assigned work')
            nextSteps.push('Mark as complete when done')
            break
        case 'Pending_Executive_Approval':
            nextSteps.push('Awaiting executive approval')
            break
    }

    const summary: ContextSummary = {
        summary: `**${task.title}** is currently ${task.status?.replace(/_/g, ' ')}. ${
            assignee ? `Assigned to ${assignee.full_name}.` : 'Not yet assigned.'
        } ${creator ? `Created by ${creator.full_name}.` : ''} ${
            (comments || []).length
        } comments, ${forwardingHistory.length} forwards.`,
        keyPoints,
        recentActivity,
        blockers,
        nextSteps,
        generatedAt: new Date().toISOString()
    }

    return { summary, error: null }
}

// Generate "catch me up" summary for a task thread
export async function generateCatchUpSummary(taskId: string): Promise<{
    summary: string
    error: string | null
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { summary: '', error: 'Unauthorized' }

    // Get task
    const { data: task } = await supabase
        .from('tasks')
        .select(`
            title,
            description,
            status,
            assignee:profiles!assignee_id(full_name)
        `)
        .eq('id', taskId)
        .single()

    if (!task) return { summary: '', error: 'Task not found' }

    // Get all comments
    const { data: comments } = await supabase
        .from('task_comments')
        .select(`
            content,
            is_system_log,
            created_at,
            user:profiles!task_comments_user_id_fkey(full_name)
        `)
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })

    if (!comments || comments.length === 0) {
        return { 
            summary: `**${task.title}** - No activity yet. Status: ${task.status?.replace(/_/g, ' ')}.`,
            error: null 
        }
    }

    // Build summary (simplified - would use AI in production)
    const userComments = comments.filter(c => !c.is_system_log)
    const systemLogs = comments.filter(c => c.is_system_log)
    const assignee = task.assignee as { full_name: string | null } | null

    const parts: string[] = []
    
    parts.push(`**${task.title}**`)
    parts.push(`Status: ${task.status?.replace(/_/g, ' ')}`)
    if (assignee) {
        parts.push(`Assigned to: ${assignee.full_name}`)
    }
    parts.push('')
    
    if (userComments.length > 0) {
        parts.push(`**${userComments.length} comments in thread:**`)
        // Summarize key points from comments
        userComments.slice(-5).forEach(c => {
            const userName = (c.user as { full_name: string | null })?.full_name || 'Unknown'
            parts.push(`- ${userName}: "${c.content.substring(0, 100)}${c.content.length > 100 ? '...' : ''}"`)
        })
    }

    if (systemLogs.length > 0) {
        parts.push('')
        parts.push(`**Recent updates:**`)
        systemLogs.slice(-3).forEach(c => {
            parts.push(`- ${c.content}`)
        })
    }

    return {
        summary: parts.join('\n'),
        error: null
    }
}

// Generate context for forwarding a task
export async function generateForwardContext(taskId: string, reason: string): Promise<{
    context: string
    error: string | null
}> {
    const { summary, error } = await generateHandoffSummary(taskId)
    
    if (error) return { context: '', error }
    if (!summary) return { context: '', error: 'Could not generate summary' }

    const parts: string[] = []
    
    parts.push('📋 **Task Handoff Summary**')
    parts.push('')
    parts.push(summary.summary)
    parts.push('')
    
    if (reason) {
        parts.push(`**Forwarded because:** ${reason}`)
        parts.push('')
    }
    
    if (summary.keyPoints.length > 0) {
        parts.push('**Key Points:**')
        summary.keyPoints.forEach(p => parts.push(`- ${p}`))
        parts.push('')
    }
    
    if (summary.blockers.length > 0) {
        parts.push('⚠️ **Blockers:**')
        summary.blockers.forEach(b => parts.push(`- ${b}`))
        parts.push('')
    }
    
    if (summary.nextSteps.length > 0) {
        parts.push('**Suggested Next Steps:**')
        summary.nextSteps.forEach(s => parts.push(`- ${s}`))
    }

    return {
        context: parts.join('\n'),
        error: null
    }
}
