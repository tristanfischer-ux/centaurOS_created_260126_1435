/**
 * Telegram Bot Client for CentaurOS
 * Handles sending messages, inline keyboards, and file downloads
 */

import {
    SendMessageOptions,
    EditMessageOptions,
    InlineKeyboardMarkup,
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
