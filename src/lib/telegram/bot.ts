/**
 * Telegram Bot Client for CentaurOS
 * Handles sending messages, inline keyboards, and file downloads
 */

import {
    SendMessageOptions,
    EditMessageOptions,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    TelegramFile,
    ParsedObjective,
} from './types'

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

function getBotToken(): string {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set')
    }
    return token
}

/**
 * Make a request to the Telegram Bot API
 */
async function telegramRequest<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const token = getBotToken()
    const url = `${TELEGRAM_API_BASE}${token}/${method}`

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    })

    const data = await response.json()

    if (!data.ok) {
        console.error('Telegram API Error:', data)
        throw new Error(data.description || 'Telegram API request failed')
    }

    return data.result
}

/**
 * Send a text message to a chat
 */
export async function sendMessage(options: SendMessageOptions): Promise<{ message_id: number }> {
    return telegramRequest<{ message_id: number }>('sendMessage', {
        chat_id: options.chat_id,
        text: options.text,
        parse_mode: options.parse_mode,
        reply_markup: options.reply_markup,
        reply_to_message_id: options.reply_to_message_id,
    })
}

/**
 * Edit an existing message
 */
export async function editMessage(options: EditMessageOptions): Promise<void> {
    await telegramRequest('editMessageText', {
        chat_id: options.chat_id,
        message_id: options.message_id,
        text: options.text,
        parse_mode: options.parse_mode,
        reply_markup: options.reply_markup,
    })
}

/**
 * Answer a callback query (acknowledge button press)
 */
export async function answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert?: boolean
): Promise<void> {
    await telegramRequest('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
    })
}

/**
 * Get file info for downloading
 */
export async function getFile(fileId: string): Promise<TelegramFile> {
    return telegramRequest<TelegramFile>('getFile', { file_id: fileId })
}

/**
 * Download a file from Telegram servers
 */
export async function downloadFile(filePath: string): Promise<ArrayBuffer> {
    const token = getBotToken()
    const url = `https://api.telegram.org/file/bot${token}/${filePath}`

    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`)
    }

    return response.arrayBuffer()
}

/**
 * Create inline keyboard markup for confirmation flow
 */
export function createConfirmationKeyboard(intentId: string): InlineKeyboardMarkup {
    return {
        inline_keyboard: [
            [
                { text: '✅ Confirm & Create', callback_data: `confirm:${intentId}` },
                { text: '❌ Cancel', callback_data: `reject:${intentId}` },
            ],
            [
                { text: '✏️ Edit Objective', callback_data: `edit_obj:${intentId}` },
                { text: '📝 Edit Tasks', callback_data: `edit_tasks:${intentId}` },
            ],
        ],
    }
}

/**
 * Create task editing keyboard
 */
export function createTaskEditKeyboard(intentId: string, taskCount: number): InlineKeyboardMarkup {
    const taskButtons: { text: string; callback_data: string }[][] = []

    // Create rows of 2 task buttons each
    for (let i = 0; i < taskCount; i += 2) {
        const row: { text: string; callback_data: string }[] = []
        row.push({ text: `Task ${i + 1}`, callback_data: `edit_task:${intentId}:${i}` })
        if (i + 1 < taskCount) {
            row.push({ text: `Task ${i + 2}`, callback_data: `edit_task:${intentId}:${i + 1}` })
        }
        taskButtons.push(row)
    }

    // Add back button
    taskButtons.push([{ text: '⬅️ Back', callback_data: `back:${intentId}` }])

    return { inline_keyboard: taskButtons }
}

/**
 * Format a parsed objective for display in Telegram message
 */
export function formatObjectiveMessage(objective: ParsedObjective, startDate: Date): string {
    let message = `🎯 <b>Objective:</b> ${escapeHtml(objective.title)}\n\n`
    message += `📄 <b>Description:</b>\n${escapeHtml(objective.description)}\n\n`
    message += `📋 <b>Tasks (${objective.tasks.length}):</b>\n\n`

    // Calculate dates
    const dates = calculateTaskDates(startDate, objective.tasks)

    objective.tasks.forEach((task, index) => {
        const taskDates = dates[index]
        const riskEmoji = task.risk_level === 'High' ? '🔴' : task.risk_level === 'Medium' ? '🟡' : '🟢'

        message += `<b>${index + 1}. ${escapeHtml(task.title)}</b>\n`
        if (task.description) {
            message += `   ${escapeHtml(task.description)}\n`
        }
        message += `   📅 ${formatDate(taskDates.start)} → ${formatDate(taskDates.end)}\n`
        message += `   ${riskEmoji} Risk: ${task.risk_level}\n\n`
    })

    const totalDays = Math.ceil(
        (dates[dates.length - 1].end.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    )
    message += `\n⏱ <b>Total Duration:</b> ${totalDays} days`
    message += `\n📅 <b>Timeline:</b> ${formatDate(startDate)} → ${formatDate(dates[dates.length - 1].end)}`

    return message
}

/**
 * Calculate task dates based on dependencies
 */
function calculateTaskDates(
    startDate: Date,
    tasks: ParsedObjective['tasks']
): Array<{ start: Date; end: Date }> {
    const results: Array<{ start: Date; end: Date }> = []

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i]
        let taskStart: Date

        if (!task.depends_on || task.depends_on.length === 0) {
            // No dependencies - start from the global start date
            taskStart = new Date(startDate)
        } else {
            // Has dependencies - start after all dependencies complete
            const depEndDates = task.depends_on.map((depIndex) => {
                const dep = results[depIndex]
                return dep ? dep.end : startDate
            })
            const latestDepEnd = new Date(Math.max(...depEndDates.map((d) => d.getTime())))
            taskStart = new Date(latestDepEnd)
            taskStart.setDate(taskStart.getDate() + 1)
        }

        const taskEnd = new Date(taskStart)
        taskEnd.setDate(taskEnd.getDate() + task.duration_days - 1)

        results.push({ start: taskStart, end: taskEnd })
    }

    return results
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    })
}

/**
 * Escape HTML special characters for Telegram HTML parse mode
 */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

/**
 * Send welcome message with linking instructions
 */
export async function sendWelcomeMessage(chatId: number, verificationCode: string): Promise<void> {
    const message = `👋 <b>Welcome to CentaurOS!</b>

To link your Telegram account, enter this code in CentaurOS Settings:

<code>${verificationCode}</code>

Or scan the QR code in your CentaurOS settings page.

Once linked, you can send me:
• 💬 Text messages with your goals
• 🎤 Voice messages describing objectives

I'll turn them into structured objectives with tasks for your review!`

    await sendMessage({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
    })
}

/**
 * Send account linked confirmation
 */
export async function sendLinkedConfirmation(chatId: number, userName: string): Promise<void> {
    const message = `✅ <b>Account Linked Successfully!</b>

Welcome, ${escapeHtml(userName)}! Your Telegram is now connected to CentaurOS.

<b>How to use:</b>
• Send me a text message with any goal, idea, or project
• Send a voice note describing what you want to accomplish
• I'll create a structured objective with tasks for you to review

<b>Example:</b>
"I want to launch a new marketing campaign for Q2"

Try it now! Send me your first objective.`

    await sendMessage({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
    })
}

/**
 * Send processing message while handling voice/text
 */
export async function sendProcessingMessage(chatId: number): Promise<{ message_id: number }> {
    return sendMessage({
        chat_id: chatId,
        text: '⏳ Processing your message...',
    })
}

/**
 * Send error message
 */
export async function sendErrorMessage(chatId: number, error: string): Promise<void> {
    await sendMessage({
        chat_id: chatId,
        text: `❌ <b>Error:</b> ${escapeHtml(error)}`,
        parse_mode: 'HTML',
    })
}

/**
 * Send objective created confirmation
 */
export async function sendObjectiveCreatedMessage(
    chatId: number,
    objectiveTitle: string,
    taskCount: number
): Promise<void> {
    const message = `✅ <b>Objective Created!</b>

<b>${escapeHtml(objectiveTitle)}</b>

${taskCount} tasks have been added to your CentaurOS account.

View it in CentaurOS → Objectives`

    await sendMessage({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
    })
}

// ===========================================
// Extended Bot Functions for Telegram Expansion
// ===========================================

/**
 * Daily briefing data type
 */
export interface DailyBriefingData {
    tasks_due_today: number
    tasks_overdue: number
    pending_decisions: number
    unread_notifications: number
    active_objectives: number
    ideas_in_inbox: number
}

/**
 * Task data for display
 */
export interface TaskForDisplay {
    id: string
    title: string
    status: string
    end_date: string | null
    objective_title?: string
    risk_level?: string
}

/**
 * Format daily briefing message
 */
export function formatDailyBriefing(data: DailyBriefingData, userName: string): string {
    const today = new Date().toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    })

    let message = `☀️ <b>Good morning, ${escapeHtml(userName)}!</b>\n`
    message += `📅 ${today}\n\n`

    // Priority alerts
    const alerts: string[] = []
    if (data.tasks_overdue > 0) {
        alerts.push(`🔴 ${data.tasks_overdue} overdue task${data.tasks_overdue > 1 ? 's' : ''}`)
    }
    if (data.pending_decisions > 0) {
        alerts.push(`⚡ ${data.pending_decisions} decision${data.pending_decisions > 1 ? 's' : ''} waiting`)
    }

    if (alerts.length > 0) {
        message += `<b>⚠️ Needs Attention:</b>\n`
        message += alerts.map(a => `  ${a}`).join('\n')
        message += '\n\n'
    }

    // Today's snapshot
    message += `<b>📊 Today's Snapshot:</b>\n`
    message += `  📋 ${data.tasks_due_today} task${data.tasks_due_today !== 1 ? 's' : ''} due today\n`
    message += `  🎯 ${data.active_objectives} active objective${data.active_objectives !== 1 ? 's' : ''}\n`
    message += `  🔔 ${data.unread_notifications} unread notification${data.unread_notifications !== 1 ? 's' : ''}\n`

    if (data.ideas_in_inbox > 0) {
        message += `  💡 ${data.ideas_in_inbox} idea${data.ideas_in_inbox !== 1 ? 's' : ''} in inbox\n`
    }

    message += '\n<i>Use /tasks to see your task list, /decisions for pending approvals</i>'

    return message
}

/**
 * Format tasks list for Telegram
 */
export function formatTasksList(tasks: TaskForDisplay[], title: string): string {
    if (tasks.length === 0) {
        return `📋 <b>${escapeHtml(title)}</b>\n\n✨ No tasks! You're all caught up.`
    }

    let message = `📋 <b>${escapeHtml(title)}</b>\n\n`

    tasks.forEach((task, index) => {
        const statusEmoji = getTaskStatusEmoji(task.status)
        const riskEmoji = task.risk_level === 'High' ? '🔴' : task.risk_level === 'Medium' ? '🟡' : '🟢'
        
        message += `${index + 1}. ${statusEmoji} <b>${escapeHtml(task.title)}</b>\n`
        if (task.objective_title) {
            message += `   🎯 ${escapeHtml(task.objective_title)}\n`
        }
        if (task.end_date) {
            const dueDate = new Date(task.end_date)
            const isOverdue = dueDate < new Date() && task.status !== 'Completed'
            message += `   📅 ${isOverdue ? '⚠️ ' : ''}${formatDate(dueDate)}\n`
        }
        message += '\n'
    })

    return message
}

/**
 * Get emoji for task status
 */
function getTaskStatusEmoji(status: string): string {
    const statusEmojis: Record<string, string> = {
        'Pending': '⏳',
        'In Progress': '🔄',
        'Ready for Review': '👀',
        'Completed': '✅',
        'Blocked': '🚫',
        'Cancelled': '❌',
    }
    return statusEmojis[status] || '📌'
}

/**
 * Create keyboard for tasks list with actions
 */
export function createTasksListKeyboard(tasks: TaskForDisplay[]): InlineKeyboardMarkup {
    const buttons: InlineKeyboardButton[][] = []

    // Quick action buttons for each task (max 5)
    const displayTasks = tasks.slice(0, 5)
    displayTasks.forEach((task, index) => {
        if (task.status !== 'Completed') {
            buttons.push([
                { text: `✅ Complete #${index + 1}`, callback_data: `task_done:${task.id}` },
                { text: `👁 View`, callback_data: `task_view:${task.id}` },
            ])
        }
    })

    // Navigation
    buttons.push([
        { text: '🔄 Refresh', callback_data: 'tasks_refresh' },
        { text: '📱 Open App', url: process.env.NEXT_PUBLIC_APP_URL + '/tasks' },
    ])

    return { inline_keyboard: buttons }
}

/**
 * Create keyboard for single task actions
 */
export function createTaskActionKeyboard(taskId: string, taskStatus: string): InlineKeyboardMarkup {
    const buttons: InlineKeyboardButton[][] = []

    if (taskStatus !== 'Completed') {
        buttons.push([
            { text: '✅ Mark Complete', callback_data: `task_done:${taskId}` },
        ])
        buttons.push([
            { text: '⏰ Snooze 1 day', callback_data: `task_snooze:${taskId}:1` },
            { text: '⏰ Snooze 3 days', callback_data: `task_snooze:${taskId}:3` },
        ])
    }

    buttons.push([
        { text: '⬅️ Back to Tasks', callback_data: 'tasks_refresh' },
    ])

    return { inline_keyboard: buttons }
}

/**
 * Decision data type
 */
export interface DecisionForDisplay {
    id: string
    decision_type: string
    title: string
    description?: string
    priority: string
    reference_type: string
    reference_id: string
    created_at: string
}

/**
 * Format decision for Telegram
 */
export function formatDecision(decision: DecisionForDisplay): string {
    const priorityEmoji = {
        'urgent': '🚨',
        'high': '🔴',
        'normal': '🟡',
        'low': '🟢',
    }[decision.priority] || '📌'

    const typeEmoji = {
        'task_review': '📋',
        'rfq_proposal': '📝',
        'order_milestone': '🎯',
        'team_request': '👥',
        'expense_approval': '💰',
        'other': '📌',
    }[decision.decision_type] || '📌'

    let message = `${priorityEmoji} <b>${typeEmoji} ${escapeHtml(decision.title)}</b>\n\n`
    
    if (decision.description) {
        message += `${escapeHtml(decision.description)}\n\n`
    }

    const createdDate = new Date(decision.created_at)
    message += `<i>Submitted: ${formatDate(createdDate)}</i>`

    return message
}

/**
 * Create keyboard for decision approval
 */
export function createDecisionKeyboard(decisionId: string, referenceType: string): InlineKeyboardMarkup {
    const buttons: { text: string; callback_data: string }[][] = []

    buttons.push([
        { text: '✅ Approve', callback_data: `decision_approve:${decisionId}` },
        { text: '❌ Reject', callback_data: `decision_reject:${decisionId}` },
    ])

    buttons.push([
        { text: '⏳ Defer', callback_data: `decision_defer:${decisionId}` },
        { text: '👁 View Details', callback_data: `decision_view:${decisionId}` },
    ])

    buttons.push([
        { text: '➡️ Next Decision', callback_data: 'decisions_next' },
    ])

    return { inline_keyboard: buttons }
}

/**
 * Format decisions queue summary
 */
export function formatDecisionsQueue(decisions: DecisionForDisplay[], total: number): string {
    if (decisions.length === 0) {
        return `⚡ <b>Decision Queue</b>\n\n✨ No pending decisions! You're all caught up.`
    }

    let message = `⚡ <b>Decision Queue</b> (${total} pending)\n\n`
    
    const urgentCount = decisions.filter(d => d.priority === 'urgent' || d.priority === 'high').length
    if (urgentCount > 0) {
        message += `🚨 ${urgentCount} require${urgentCount === 1 ? 's' : ''} urgent attention\n\n`
    }

    message += `<i>Tap "Next" to review decisions one by one</i>`

    return message
}

/**
 * Create keyboard for idea capture
 */
export function createIdeaKeyboard(ideaId: string): InlineKeyboardMarkup {
    return {
        inline_keyboard: [
            [
                { text: '🚀 Promote to Objective', callback_data: `idea_promote:${ideaId}` },
            ],
            [
                { text: '🗑 Dismiss', callback_data: `idea_dismiss:${ideaId}` },
                { text: '📥 Keep in Inbox', callback_data: `idea_keep:${ideaId}` },
            ],
        ],
    }
}

/**
 * Format idea captured confirmation
 */
export function formatIdeaCaptured(content: string): string {
    const truncated = content.length > 200 ? content.substring(0, 200) + '...' : content
    
    return `💡 <b>Idea Captured!</b>\n\n"${escapeHtml(truncated)}"\n\n<i>Find it in CentaurOS → Ideas, or use /ideas to see all</i>`
}

/**
 * Format ideas list
 */
export function formatIdeasList(ideas: { id: string; content: string; created_at: string }[]): string {
    if (ideas.length === 0) {
        return `💡 <b>Ideas Inbox</b>\n\n✨ No ideas yet. Use /idea [your idea] to capture thoughts!`
    }

    let message = `💡 <b>Ideas Inbox</b> (${ideas.length})\n\n`

    ideas.slice(0, 10).forEach((idea, index) => {
        const truncated = idea.content.length > 80 ? idea.content.substring(0, 80) + '...' : idea.content
        const date = new Date(idea.created_at)
        message += `${index + 1}. "${escapeHtml(truncated)}"\n`
        message += `   <i>${formatDate(date)}</i>\n\n`
    })

    if (ideas.length > 10) {
        message += `<i>... and ${ideas.length - 10} more. View all in CentaurOS.</i>`
    }

    return message
}

/**
 * Create settings keyboard
 */
export function createSettingsKeyboard(prefs: {
    notifications_enabled: boolean
    daily_briefing_enabled: boolean
}): InlineKeyboardMarkup {
    return {
        inline_keyboard: [
            [
                {
                    text: prefs.notifications_enabled ? '🔔 Notifications: ON' : '🔕 Notifications: OFF',
                    callback_data: `settings_toggle:notifications`,
                },
            ],
            [
                {
                    text: prefs.daily_briefing_enabled ? '☀️ Daily Briefing: ON' : '🌙 Daily Briefing: OFF',
                    callback_data: `settings_toggle:briefing`,
                },
            ],
            [
                { text: '⏰ Change Briefing Time', callback_data: 'settings_briefing_time' },
            ],
            [
                { text: '📱 Open Full Settings', url: process.env.NEXT_PUBLIC_APP_URL + '/settings' },
            ],
        ],
    }
}

/**
 * Send notification to Telegram
 */
export async function sendNotificationToTelegram(
    chatId: string,
    notification: {
        type: string
        title: string
        message?: string
        link?: string
    }
): Promise<{ message_id: number } | null> {
    const typeEmoji = {
        'task_assigned': '📋',
        'task_completed': '✅',
        'mention': '💬',
        'approval_needed': '⚡',
        'order_update': '📦',
        'rfq_response': '📝',
        'general': '🔔',
    }[notification.type] || '🔔'

    let message = `${typeEmoji} <b>${escapeHtml(notification.title)}</b>`
    
    if (notification.message) {
        message += `\n\n${escapeHtml(notification.message)}`
    }

    const keyboard: InlineKeyboardMarkup | undefined = notification.link ? {
        inline_keyboard: [[
            { text: '👁 View in App', url: process.env.NEXT_PUBLIC_APP_URL + notification.link },
        ]],
    } : undefined

    try {
        return await sendMessage({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
            reply_markup: keyboard,
        })
    } catch (error) {
        console.error('Failed to send Telegram notification:', error)
        return null
    }
}

/**
 * Delete a message
 */
export async function deleteMessage(chatId: number | string, messageId: number): Promise<void> {
    try {
        await telegramRequest('deleteMessage', {
            chat_id: chatId,
            message_id: messageId,
        })
    } catch {
        // Ignore delete errors (message may already be deleted)
    }
}
