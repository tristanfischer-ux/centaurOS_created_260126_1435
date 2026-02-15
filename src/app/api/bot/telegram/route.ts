/**
 * Telegram Bot Webhook Handler
 * Receives messages from Telegram and processes them into objectives
 */

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { TelegramUpdate, TelegramMessage, TelegramCallbackQuery, ParsedObjective } from '@/lib/telegram/types'
import {
    sendMessage,
    editMessage,
    answerCallbackQuery,
    getFile,
    downloadFile,
    createConfirmationKeyboard,
    createTaskEditKeyboard,
    formatObjectiveMessage,
    sendWelcomeMessage,
    sendLinkedConfirmation,
    sendProcessingMessage,
    sendErrorMessage,
    sendObjectiveCreatedMessage,
    escapeHtml,
    // New exports for expanded features
    formatDailyBriefing,
    formatTasksList,
    createTasksListKeyboard,
    createTaskActionKeyboard,
    formatDecision,
    createDecisionKeyboard,
    formatDecisionsQueue,
    createIdeaKeyboard,
    formatIdeaCaptured,
    formatIdeasList,
    createSettingsKeyboard,
    deleteMessage,
    DailyBriefingData,
    TaskForDisplay,
    DecisionForDisplay,
} from '@/lib/telegram/bot'
import {
    transcribeVoice,
    parseTextToObjective,
    refineObjective,
    generateHelpResponse,
    looksLikeObjective,
} from '@/lib/telegram/ai-processor'
import { createObjectiveFromInput } from '@/actions/objective-from-input'
import { calculateTaskDates } from '@/lib/objective-utils'

const getAdminClient = createAdminClient

/**
 * Helper to extract objective title from Supabase join result
 * Handles both array and single object returns from the query
 */
function getObjectiveTitle(objectives: unknown): string | undefined {
    if (!objectives) return undefined
    if (Array.isArray(objectives)) {
        return (objectives[0] as { title?: string })?.title
    }
    return (objectives as { title?: string })?.title
}

// Verify webhook secret (required in all environments).
function verifyWebhookSecret(req: NextRequest): NextResponse | null {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET

    // SECURITY: Fail closed when secret is not configured.
    if (!secret) {
        console.error('[SECURITY] TELEGRAM_WEBHOOK_SECRET not configured')
        return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 })
    }

    const providedSecret = req.headers.get('X-Telegram-Bot-Api-Secret-Token')
    const authHeader = req.headers.get('authorization')

    // SECURITY: Telegram POST uses the secret-token header. Allow bearer auth for manual checks.
    if (providedSecret === secret || authHeader === `Bearer ${secret}`) {
        return null
    }

    return NextResponse.json({ ok: false }, { status: 403 })
}

export async function POST(req: NextRequest) {
    try {
        // Verify webhook secret
        const authFailure = verifyWebhookSecret(req)
        if (authFailure) {
            console.warn('Invalid webhook secret')
            return authFailure
        }

        // SECURITY: IP-based rate limit on webhook endpoint
        const ip = getClientIP(req.headers)
        const ipLimit = await rateLimit('webhook', `webhook:${ip}`)
        if (!ipLimit.success) {
            return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
        }

        const update: TelegramUpdate = await req.json()
        // SENSITIVE: Redacted PII from Telegram webhook logging
        console.log('[TelegramWebhook] Received update:', {
            update_id: update.update_id,
            chat_id: update.message?.chat?.id ?? update.callback_query?.message?.chat?.id,
            has_message: !!update.message,
            has_callback: !!update.callback_query,
        })

        // Handle callback queries (button presses)
        if (update.callback_query) {
            await handleCallbackQuery(update.callback_query)
            return NextResponse.json({ ok: true })
        }

        // Handle messages
        if (update.message) {
            await handleMessage(update.message)
            return NextResponse.json({ ok: true })
        }

        return NextResponse.json({ ok: true })
    } catch (error) {
        console.error('Telegram webhook error:', error)
        // Always return 200 to Telegram to prevent retries
        return NextResponse.json({ ok: true })
    }
}

/**
 * Handle incoming messages (text or voice)
 */
async function handleMessage(message: TelegramMessage) {
    const chatId = message.chat.id
    const userId = message.from?.id?.toString()

    if (!userId) {
        console.warn('Message without user ID')
        return
    }

    const supabase = getAdminClient()

    // Check if user is linked
    const { data: link } = await supabase
        .from('messaging_links')
        .select('profile_id, foundry_id, verified_at')
        .eq('platform', 'telegram')
        .eq('platform_user_id', userId)
        .single()

    // Handle /start command
    if (message.text?.startsWith('/start')) {
        await handleStartCommand(chatId, userId, link)
        return
    }

    // Handle /link command with code
    if (message.text?.startsWith('/link ')) {
        const code = message.text.replace('/link ', '').trim()
        await handleLinkCommand(chatId, userId, code, message.from?.username)
        return
    }

    // If not linked, prompt to link
    if (!link || !link.verified_at) {
        await sendMessage({
            chat_id: chatId,
            text: `⚠️ Your Telegram isn't linked to ForgeOS yet.\n\nUse /start to get linking instructions, or enter your verification code with:\n/link YOUR_CODE`,
        })
        return
    }

    // SECURITY: Per-user rate limit on Telegram bot commands
    const userRateLimit = await rateLimit('telegram', `telegram:${link.profile_id}`)
    if (!userRateLimit.success) {
        await sendMessage({
            chat_id: chatId,
            text: '⏳ You\'re sending commands too quickly. Please wait a bit and try again.',
        })
        return
    }

    // ===========================================
    // Command Handlers (for linked users)
    // ===========================================

    // /today - Daily briefing
    if (message.text === '/today' || message.text === '/briefing') {
        await handleTodayCommand(chatId, link.profile_id)
        return
    }

    // /tasks - List today's tasks
    if (message.text === '/tasks') {
        await handleTasksCommand(chatId, link.profile_id)
        return
    }

    // /done [task-id or number] - Mark task complete
    if (message.text?.startsWith('/done')) {
        const taskRef = message.text.replace('/done', '').trim()
        await handleDoneCommand(chatId, link.profile_id, taskRef)
        return
    }

    // /idea [text] - Quick capture idea
    if (message.text?.startsWith('/idea')) {
        const ideaText = message.text.replace('/idea', '').trim()
        await handleIdeaCommand(chatId, link.profile_id, link.foundry_id, ideaText, message.message_id.toString())
        return
    }

    // /ideas - List ideas in inbox
    if (message.text === '/ideas') {
        await handleIdeasListCommand(chatId, link.profile_id)
        return
    }

    // /decisions - Show decision queue
    if (message.text === '/decisions') {
        await handleDecisionsCommand(chatId, link.profile_id)
        return
    }

    // /mute [duration] - Mute notifications
    if (message.text?.startsWith('/mute')) {
        const duration = message.text.replace('/mute', '').trim()
        await handleMuteCommand(chatId, link.profile_id, duration)
        return
    }

    // /unmute - Unmute notifications
    if (message.text === '/unmute') {
        await handleUnmuteCommand(chatId, link.profile_id)
        return
    }

    // /settings - Show settings
    if (message.text === '/settings') {
        await handleSettingsCommand(chatId, link.profile_id)
        return
    }

    // /help - Show help
    if (message.text === '/help') {
        await handleHelpCommand(chatId)
        return
    }

    // Check if user is in editing mode (has pending intent being edited)
    const { data: editingIntent } = await supabase
        .from('pending_intents')
        .select('id, status, parsed_objective')
        .eq('platform_user_id', userId)
        .eq('status', 'editing')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    if (editingIntent && message.text) {
        // Apply edit to the pending intent
        await handleEditResponse(chatId, editingIntent, message.text)
        return
    }

    // Process new message (text or voice)
    const processingMsg = await sendProcessingMessage(chatId)

    try {
        let inputText: string
        let transcribedText: string | undefined

        if (message.voice || message.audio) {
            // Handle voice message
            const fileId = message.voice?.file_id || message.audio?.file_id
            if (!fileId) throw new Error('No audio file ID')

            const file = await getFile(fileId)
            if (!file.file_path) throw new Error('Could not get file path')

            const audioBuffer = await downloadFile(file.file_path)
            const mimeType = message.voice?.mime_type || message.audio?.mime_type || 'audio/ogg'

            transcribedText = await transcribeVoice(audioBuffer, mimeType)
            inputText = transcribedText

            // Update processing message with transcription
            await editMessage({
                chat_id: chatId,
                message_id: processingMsg.message_id,
                text: `🎤 <b>Transcription:</b>\n"${escapeHtml(transcribedText)}"\n\n⏳ Analyzing...`,
                parse_mode: 'HTML',
            })
        } else if (message.text) {
            inputText = message.text
        } else {
            throw new Error('Unsupported message type')
        }

        // Check if it looks like an objective
        if (!looksLikeObjective(inputText)) {
            const helpResponse = await generateHelpResponse(inputText)
            await editMessage({
                chat_id: chatId,
                message_id: processingMsg.message_id,
                text: helpResponse,
            })
            return
        }

        // Parse text to objective
        const objective = await parseTextToObjective(inputText)

        // Store as pending intent
        const { data: intent, error: intentError } = await supabase
            .from('pending_intents')
            .insert({
                profile_id: link.profile_id,
                foundry_id: link.foundry_id,
                platform: 'telegram',
                platform_user_id: userId,
                platform_message_id: message.message_id.toString(),
                original_message: inputText,
                transcribed_text: transcribedText,
                parsed_objective: objective,
                status: 'pending',
            })
            .select('id')
            .single()

        if (intentError || !intent) {
            throw new Error('Failed to save intent')
        }

        // Send confirmation message with inline keyboard
        const confirmationText = formatObjectiveMessage(objective, new Date())
        const keyboard = createConfirmationKeyboard(intent.id)

        const sentMsg = await sendMessage({
            chat_id: chatId,
            text: confirmationText + '\n\n<i>Review and confirm to create this objective:</i>',
            parse_mode: 'HTML',
            reply_markup: keyboard,
        })

        // Update intent with confirmation message ID
        await supabase
            .from('pending_intents')
            .update({ confirmation_message_id: sentMsg.message_id.toString() })
            .eq('id', intent.id)

        // Delete processing message
        try {
            await fetch(
                `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteMessage`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        message_id: processingMsg.message_id,
                    }),
                }
            )
        } catch {
            // Ignore delete errors
        }
    } catch (error) {
        console.error('Message processing error:', error)
        // SECURITY: Don't expose error details to users
        await editMessage({
            chat_id: chatId,
            message_id: processingMsg.message_id,
            text: `❌ Sorry, I couldn't process your message. Please try again later.`,
        })
    }
}

/**
 * Handle callback queries from inline keyboards
 */
async function handleCallbackQuery(query: TelegramCallbackQuery) {
    const chatId = query.message?.chat.id
    const messageId = query.message?.message_id
    const data = query.data

    if (!chatId || !messageId || !data) {
        await answerCallbackQuery(query.id, 'Invalid callback')
        return
    }

    const supabase = getAdminClient()
    const [action, intentId, extra] = data.split(':')
    
    // SECURITY: Validate intent ID format to prevent injection
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!intentId || !uuidRegex.test(intentId)) {
        await answerCallbackQuery(query.id, 'Invalid request')
        return
    }
    
    // SECURITY: Validate action against allowed values
    const allowedActions = [
        'confirm', 'reject', 'edit_obj', 'edit_tasks', 'edit_task', 'back',
        // Task actions
        'task_done', 'task_view', 'task_snooze', 'tasks_refresh',
        // Decision actions
        'decision_approve', 'decision_reject', 'decision_defer', 'decision_view', 'decisions_next',
        // Idea actions
        'idea_promote', 'idea_dismiss', 'idea_keep',
        // Settings actions
        'settings_toggle', 'settings_briefing_time',
    ]
    if (!allowedActions.includes(action)) {
        await answerCallbackQuery(query.id, 'Invalid action')
        return
    }

    // Fetch the intent
    const { data: intent } = await supabase
        .from('pending_intents')
        .select('*')
        .eq('id', intentId)
        .single()

    if (!intent) {
        await answerCallbackQuery(query.id, 'This request has expired')
        return
    }

    const objective = intent.parsed_objective as ParsedObjective

    switch (action) {
        case 'confirm':
            await handleConfirm(query, chatId, messageId, intent, objective)
            break

        case 'reject':
            await handleReject(query, chatId, messageId, intentId)
            break

        case 'edit_obj':
            await handleEditObjective(query, chatId, messageId, intentId)
            break

        case 'edit_tasks':
            await handleEditTasks(query, chatId, messageId, intentId, objective)
            break

        case 'edit_task':
            await handleEditSingleTask(query, chatId, messageId, intentId, parseInt(extra))
            break

        case 'back':
            await handleBack(query, chatId, messageId, intentId, objective)
            break

        // ===========================================
        // Task Actions
        // ===========================================
        case 'task_done':
            await handleTaskDoneCallback(query, chatId, messageId, intentId)
            break

        case 'task_view':
            await handleTaskViewCallback(query, chatId, messageId, intentId)
            break

        case 'task_snooze':
            await handleTaskSnoozeCallback(query, chatId, messageId, intentId, parseInt(extra))
            break

        case 'tasks_refresh':
            await handleTasksRefreshCallback(query, chatId, messageId)
            break

        // ===========================================
        // Decision Actions
        // ===========================================
        case 'decision_approve':
            await handleDecisionCallback(query, chatId, messageId, intentId, 'approved')
            break

        case 'decision_reject':
            await handleDecisionCallback(query, chatId, messageId, intentId, 'rejected')
            break

        case 'decision_defer':
            await handleDecisionCallback(query, chatId, messageId, intentId, 'deferred')
            break

        case 'decision_view':
            await handleDecisionViewCallback(query, chatId, messageId, intentId)
            break

        case 'decisions_next':
            await handleDecisionsNextCallback(query, chatId, messageId)
            break

        // ===========================================
        // Idea Actions
        // ===========================================
        case 'idea_promote':
            await handleIdeaPromoteCallback(query, chatId, messageId, intentId)
            break

        case 'idea_dismiss':
            await handleIdeaDismissCallback(query, chatId, messageId, intentId)
            break

        case 'idea_keep':
            await answerCallbackQuery(query.id, '📥 Kept in inbox')
            break

        // ===========================================
        // Settings Actions
        // ===========================================
        case 'settings_toggle':
            await handleSettingsToggleCallback(query, chatId, messageId, intentId)
            break

        default:
            await answerCallbackQuery(query.id, 'Unknown action')
    }
}

/**
 * Handle /start command
 */
async function handleStartCommand(
    chatId: number,
    userId: string,
    existingLink: { verified_at: string | null } | null
) {
    if (existingLink?.verified_at) {
        await sendMessage({
            chat_id: chatId,
            text: `✅ Your account is already linked!\n\nSend me a message with your goal or objective, and I'll create a structured plan for you.`,
        })
        return
    }

    // Send instructions - user needs to generate code from ForgeOS settings
    await sendMessage({
        chat_id: chatId,
        text: `👋 <b>Welcome to ForgeOS!</b>

To link your Telegram account:

1️⃣ Go to ForgeOS → Settings
2️⃣ Click "Link Telegram Account"
3️⃣ Scan the QR code, or
4️⃣ Send me: <code>/link YOUR_CODE</code>

Once linked, you can send text or voice messages to create objectives!`,
        parse_mode: 'HTML',
    })
}

/**
 * Handle /link command
 */
async function handleLinkCommand(
    chatId: number,
    telegramUserId: string,
    code: string,
    username?: string
) {
    const supabase = getAdminClient()

    // Find pending link with this code
    const { data: link } = await supabase
        .from('messaging_links')
        .select('id, profile_id, foundry_id, verification_expires_at')
        .eq('verification_code', code)
        .single()

    if (!link) {
        await sendMessage({
            chat_id: chatId,
            text: '❌ Invalid verification code. Please check the code and try again.',
        })
        return
    }

    // Check expiry
    if (link.verification_expires_at && new Date(link.verification_expires_at) < new Date()) {
        await sendMessage({
            chat_id: chatId,
            text: '❌ This verification code has expired. Please generate a new one in ForgeOS Settings.',
        })
        return
    }

    // Complete the link
    const { error } = await supabase
        .from('messaging_links')
        .update({
            platform_user_id: telegramUserId,
            platform_username: username,
            verified_at: new Date().toISOString(),
            verification_code: null,
            verification_expires_at: null,
        })
        .eq('id', link.id)

    if (error) {
        await sendErrorMessage(chatId, 'Failed to link account. Please try again.')
        return
    }

    // Get user name
    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', link.profile_id)
        .single()

    await sendLinkedConfirmation(chatId, profile?.full_name || 'there')
}

/**
 * Handle confirm button
 */
async function handleConfirm(
    query: TelegramCallbackQuery,
    chatId: number,
    messageId: number,
    intent: {
        id: string
        profile_id: string
        parsed_objective: unknown
    },
    objective: ParsedObjective
) {
    await answerCallbackQuery(query.id, 'Creating objective...')

    const supabase = getAdminClient()

    try {
        // Calculate task dates starting from today
        const today = new Date()
        const taskDurations = objective.tasks.map((task, index) => ({
            index,
            durationDays: task.duration_days,
            dependsOn: task.depends_on,
        }))
        const dates = calculateTaskDates(today, taskDurations)

        // Prepare tasks with dates
        const tasksWithDates = objective.tasks.map((task, index) => ({
            title: task.title,
            description: task.description,
            start_date: dates.find((d) => d.index === index)?.startDate,
            end_date: dates.find((d) => d.index === index)?.endDate,
            risk_level: task.risk_level,
        }))

        // Create the objective using the server action
        // Note: We need to call this as the user, so we'll use direct DB insert
        const { data: newObjective, error: objError } = await supabase
            .from('objectives')
            .insert({
                title: objective.title,
                description: objective.description,
                creator_id: intent.profile_id,
                foundry_id: await getFoundryId(supabase, intent.profile_id),
                status: 'In Progress',
                progress: 0,
            })
            .select('id')
            .single()

        if (objError || !newObjective) {
            throw new Error('Failed to create objective')
        }

        // Create tasks
        const foundryId = await getFoundryId(supabase, intent.profile_id)
        const tasksToInsert = tasksWithDates.map((task) => ({
            title: task.title,
            description: task.description || null,
            objective_id: newObjective.id,
            creator_id: intent.profile_id,
            assignee_id: intent.profile_id,
            foundry_id: foundryId,
            status: 'Pending' as const,
            start_date: task.start_date || null,
            end_date: task.end_date || null,
            risk_level: task.risk_level || 'Medium',
            client_visible: false,
        }))

        const { error: tasksError } = await supabase.from('tasks').insert(tasksToInsert)

        if (tasksError) {
            // Rollback objective
            await supabase.from('objectives').delete().eq('id', newObjective.id)
            throw new Error('Failed to create tasks')
        }

        // Update intent status
        await supabase.from('pending_intents').update({ status: 'confirmed' }).eq('id', intent.id)

        // Update message to show success
        await editMessage({
            chat_id: chatId,
            message_id: messageId,
            text: `✅ <b>Objective Created!</b>\n\n<b>${escapeHtml(objective.title)}</b>\n\n${objective.tasks.length} tasks added to your ForgeOS account.\n\n<i>View in ForgeOS → Objectives</i>`,
            parse_mode: 'HTML',
        })
    } catch (error) {
        console.error('Error creating objective:', error)
        await editMessage({
            chat_id: chatId,
            message_id: messageId,
            text: '❌ Failed to create objective. Please try again.',
            reply_markup: createConfirmationKeyboard(intent.id),
        })
    }
}

/**
 * Handle reject button
 */
async function handleReject(
    query: TelegramCallbackQuery,
    chatId: number,
    messageId: number,
    intentId: string
) {
    await answerCallbackQuery(query.id, 'Cancelled')

    const supabase = getAdminClient()
    await supabase.from('pending_intents').update({ status: 'rejected' }).eq('id', intentId)

    await editMessage({
        chat_id: chatId,
        message_id: messageId,
        text: '❌ <b>Cancelled</b>\n\nSend me another message when you want to create a new objective.',
        parse_mode: 'HTML',
    })
}

/**
 * Handle edit objective button
 */
async function handleEditObjective(
    query: TelegramCallbackQuery,
    chatId: number,
    messageId: number,
    intentId: string
) {
    await answerCallbackQuery(query.id)

    const supabase = getAdminClient()
    await supabase.from('pending_intents').update({ status: 'editing' }).eq('id', intentId)

    await editMessage({
        chat_id: chatId,
        message_id: messageId,
        text: `✏️ <b>Edit Objective</b>\n\nSend me the changes you want to make to the objective title or description.\n\nFor example:\n• "Change the title to [new title]"\n• "Add to the description: [additional context]"\n• "Make the description shorter"`,
        parse_mode: 'HTML',
    })
}

/**
 * Handle edit tasks button
 */
async function handleEditTasks(
    query: TelegramCallbackQuery,
    chatId: number,
    messageId: number,
    intentId: string,
    objective: ParsedObjective
) {
    await answerCallbackQuery(query.id)

    const keyboard = createTaskEditKeyboard(intentId, objective.tasks.length)

    await editMessage({
        chat_id: chatId,
        message_id: messageId,
        text: '📝 <b>Edit Tasks</b>\n\nSelect a task to edit:',
        parse_mode: 'HTML',
        reply_markup: keyboard,
    })
}

/**
 * Handle edit single task button
 */
async function handleEditSingleTask(
    query: TelegramCallbackQuery,
    chatId: number,
    messageId: number,
    intentId: string,
    taskIndex: number
) {
    await answerCallbackQuery(query.id)

    const supabase = getAdminClient()

    // Store which task is being edited
    await supabase
        .from('pending_intents')
        .update({
            status: 'editing',
            // Store edit context in parsed_objective temporarily
        })
        .eq('id', intentId)

    await editMessage({
        chat_id: chatId,
        message_id: messageId,
        text: `✏️ <b>Edit Task ${taskIndex + 1}</b>\n\nSend me the changes you want to make.\n\nFor example:\n• "Change the title to [new title]"\n• "Set duration to 5 days"\n• "Change risk level to High"\n• "Remove this task"`,
        parse_mode: 'HTML',
    })
}

/**
 * Handle back button
 */
async function handleBack(
    query: TelegramCallbackQuery,
    chatId: number,
    messageId: number,
    intentId: string,
    objective: ParsedObjective
) {
    await answerCallbackQuery(query.id)

    const supabase = getAdminClient()
    await supabase.from('pending_intents').update({ status: 'pending' }).eq('id', intentId)

    const confirmationText = formatObjectiveMessage(objective, new Date())
    const keyboard = createConfirmationKeyboard(intentId)

    await editMessage({
        chat_id: chatId,
        message_id: messageId,
        text: confirmationText + '\n\n<i>Review and confirm to create this objective:</i>',
        parse_mode: 'HTML',
        reply_markup: keyboard,
    })
}

/**
 * Handle edit response from user
 */
async function handleEditResponse(
    chatId: number,
    intent: { id: string; status: string; parsed_objective: unknown },
    userText: string
) {
    const supabase = getAdminClient()
    const objective = intent.parsed_objective as ParsedObjective

    const processingMsg = await sendProcessingMessage(chatId)

    try {
        // Use AI to apply the edit
        const refined = await refineObjective(objective, userText, 'title')

        // Update intent
        await supabase
            .from('pending_intents')
            .update({
                parsed_objective: refined,
                status: 'pending',
            })
            .eq('id', intent.id)

        // Delete processing message
        try {
            await fetch(
                `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteMessage`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        message_id: processingMsg.message_id,
                    }),
                }
            )
        } catch {
            // Ignore
        }

        // Send updated confirmation
        const confirmationText = formatObjectiveMessage(refined, new Date())
        const keyboard = createConfirmationKeyboard(intent.id)

        await sendMessage({
            chat_id: chatId,
            text:
                '✅ <b>Updated!</b>\n\n' +
                confirmationText +
                '\n\n<i>Review and confirm to create this objective:</i>',
            parse_mode: 'HTML',
            reply_markup: keyboard,
        })
    } catch (error) {
        console.error('Edit error:', error)
        await editMessage({
            chat_id: chatId,
            message_id: processingMsg.message_id,
            text: '❌ Could not apply that edit. Please try again with different wording.',
        })
    }
}

/**
 * Get foundry ID for a profile
 */
async function getFoundryId(
    supabase: ReturnType<typeof createAdminClient>,
    profileId: string
): Promise<string> {
    const { data } = await supabase
        .from('profiles')
        .select('foundry_id')
        .eq('id', profileId)
        .single()

    if (!data?.foundry_id) {
        throw new Error('User has no foundry')
    }

    return data.foundry_id
}

/**
 * Generate a cryptographically secure 6-character verification code
 * SECURITY: Uses crypto.getRandomValues instead of Math.random
 */
function generateVerificationCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Avoid ambiguous chars
    const array = new Uint8Array(6)
    crypto.getRandomValues(array)
    
    let code = ''
    for (let i = 0; i < 6; i++) {
        code += chars[array[i] % chars.length]
    }
    return code
}

// ===========================================
// Command Handlers
// ===========================================

/**
 * Handle /today command - Daily briefing
 */
async function handleTodayCommand(chatId: number, profileId: string) {
    const supabase = getAdminClient()

    try {
        // Get user name
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', profileId)
            .single()

        // Get briefing data using the function
        const { data: briefingData } = await supabase
            .rpc('get_daily_briefing', { p_profile_id: profileId })

        if (!briefingData) {
            // Fallback: calculate manually
            const [tasksToday, tasksOverdue, decisions, notifications, objectives, ideas] = await Promise.all([
                supabase.from('tasks').select('id', { count: 'exact', head: true })
                    .eq('assignee_id', profileId)
                    .eq('is_ghost', false)
                    .is('deleted_at', null)
                    .gte('end_date', new Date().toISOString().split('T')[0])
                    .lte('end_date', new Date().toISOString().split('T')[0])
                    .not('status', 'in', '("Completed","Cancelled")'),
                supabase.from('tasks').select('id', { count: 'exact', head: true })
                    .eq('assignee_id', profileId)
                    .eq('is_ghost', false)
                    .is('deleted_at', null)
                    .lt('end_date', new Date().toISOString().split('T')[0])
                    .not('status', 'in', '("Completed","Cancelled")'),
                supabase.from('telegram_decisions').select('id', { count: 'exact', head: true })
                    .eq('profile_id', profileId)
                    .eq('status', 'pending'),
                supabase.from('notifications').select('id', { count: 'exact', head: true })
                    .eq('user_id', profileId)
                    .eq('is_read', false),
                supabase.from('objectives').select('id', { count: 'exact', head: true })
                    .eq('creator_id', profileId)
                    .eq('is_ghost', false)
                    .is('deleted_at', null)
                    .eq('status', 'In Progress'),
                supabase.from('telegram_ideas').select('id', { count: 'exact', head: true })
                    .eq('profile_id', profileId)
                    .eq('status', 'inbox'),
            ])

            const data: DailyBriefingData = {
                tasks_due_today: tasksToday.count || 0,
                tasks_overdue: tasksOverdue.count || 0,
                pending_decisions: decisions.count || 0,
                unread_notifications: notifications.count || 0,
                active_objectives: objectives.count || 0,
                ideas_in_inbox: ideas.count || 0,
            }

            const message = formatDailyBriefing(data, profile?.full_name || 'there')
            await sendMessage({ chat_id: chatId, text: message, parse_mode: 'HTML' })
            return
        }

        const message = formatDailyBriefing(briefingData as DailyBriefingData, profile?.full_name || 'there')
        await sendMessage({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    } catch (error) {
        console.error('Today command error:', error)
        await sendErrorMessage(chatId, 'Could not fetch your daily briefing. Please try again.')
    }
}

/**
 * Handle /tasks command - List tasks
 */
async function handleTasksCommand(chatId: number, profileId: string) {
    const supabase = getAdminClient()

    try {
        const today = new Date().toISOString().split('T')[0]
        
        const { data: tasks, error } = await supabase
            .from('tasks')
            .select(`
                id,
                title,
                status,
                end_date,
                risk_level,
                objectives(title)
            `)
            .eq('assignee_id', profileId)
            .eq('is_ghost', false)
            .is('deleted_at', null)
            .not('status', 'in', '("Completed","Cancelled")')
            .order('end_date', { ascending: true, nullsFirst: false })
            .limit(10)

        if (error) throw error

        const tasksForDisplay: TaskForDisplay[] = (tasks || []).map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            end_date: t.end_date,
            risk_level: t.risk_level,
            objective_title: getObjectiveTitle(t.objectives),
        }))

        const message = formatTasksList(tasksForDisplay, "Your Tasks")
        const keyboard = createTasksListKeyboard(tasksForDisplay)

        await sendMessage({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
            reply_markup: keyboard,
        })
    } catch (error) {
        console.error('Tasks command error:', error)
        await sendErrorMessage(chatId, 'Could not fetch your tasks. Please try again.')
    }
}

/**
 * Handle /done command - Mark task complete
 */
async function handleDoneCommand(chatId: number, profileId: string, taskRef: string) {
    const supabase = getAdminClient()

    try {
        if (!taskRef) {
            await sendMessage({
                chat_id: chatId,
                text: '❓ <b>Usage:</b> /done [task-id]\n\nOr use /tasks to see your tasks with quick-complete buttons.',
                parse_mode: 'HTML',
            })
            return
        }

        // Try to find task by ID or partial match
        let taskId = taskRef
        
        // If it looks like a UUID, use directly
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (!uuidRegex.test(taskRef)) {
            // Try to find by title match
            const { data: matchingTasks } = await supabase
                .from('tasks')
                .select('id, title')
                .eq('assignee_id', profileId)
                .not('status', 'in', '("Completed","Cancelled")')
                .ilike('title', `%${taskRef}%`)
                .limit(1)

            if (!matchingTasks || matchingTasks.length === 0) {
                await sendMessage({
                    chat_id: chatId,
                    text: `❌ No task found matching "${escapeHtml(taskRef)}"\n\nUse /tasks to see your task list.`,
                    parse_mode: 'HTML',
                })
                return
            }
            taskId = matchingTasks[0].id
        }

        // Update task status
        const { data: updatedTask, error } = await supabase
            .from('tasks')
            .update({ status: 'Completed' })
            .eq('id', taskId)
            .eq('assignee_id', profileId) // Security: only update own tasks
            .select('title')
            .single()

        if (error || !updatedTask) {
            await sendMessage({
                chat_id: chatId,
                text: '❌ Could not complete task. Make sure you have permission.',
                parse_mode: 'HTML',
            })
            return
        }

        await sendMessage({
            chat_id: chatId,
            text: `✅ <b>Task Completed!</b>\n\n"${escapeHtml(updatedTask.title)}"\n\n🎉 Nice work!`,
            parse_mode: 'HTML',
        })
    } catch (error) {
        console.error('Done command error:', error)
        await sendErrorMessage(chatId, 'Could not complete task. Please try again.')
    }
}

/**
 * Handle /idea command - Quick capture
 */
async function handleIdeaCommand(
    chatId: number,
    profileId: string,
    foundryId: string,
    ideaText: string,
    messageId: string
) {
    const supabase = getAdminClient()

    try {
        if (!ideaText) {
            await sendMessage({
                chat_id: chatId,
                text: '💡 <b>Quick Idea Capture</b>\n\nUsage: /idea [your idea]\n\nExample: /idea Build a mobile app for the platform',
                parse_mode: 'HTML',
            })
            return
        }

        // Save the idea
        const { data: idea, error } = await supabase
            .from('telegram_ideas')
            .insert({
                profile_id: profileId,
                foundry_id: foundryId,
                content: ideaText,
                telegram_message_id: messageId,
            })
            .select('id')
            .single()

        if (error || !idea) {
            throw new Error('Failed to save idea')
        }

        const message = formatIdeaCaptured(ideaText)
        const keyboard = createIdeaKeyboard(idea.id)

        await sendMessage({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
            reply_markup: keyboard,
        })
    } catch (error) {
        console.error('Idea command error:', error)
        await sendErrorMessage(chatId, 'Could not save your idea. Please try again.')
    }
}

/**
 * Handle /ideas command - List ideas
 */
async function handleIdeasListCommand(chatId: number, profileId: string) {
    const supabase = getAdminClient()

    try {
        const { data: ideas, error } = await supabase
            .from('telegram_ideas')
            .select('id, content, created_at')
            .eq('profile_id', profileId)
            .eq('status', 'inbox')
            .order('created_at', { ascending: false })
            .limit(20)

        if (error) throw error

        const message = formatIdeasList(ideas || [])

        await sendMessage({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
        })
    } catch (error) {
        console.error('Ideas list error:', error)
        await sendErrorMessage(chatId, 'Could not fetch your ideas. Please try again.')
    }
}

/**
 * Handle /decisions command - Show decision queue
 */
async function handleDecisionsCommand(chatId: number, profileId: string) {
    const supabase = getAdminClient()

    try {
        const { data: decisions, error, count } = await supabase
            .from('telegram_decisions')
            .select('*', { count: 'exact' })
            .eq('profile_id', profileId)
            .eq('status', 'pending')
            .order('priority', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(10)

        if (error) throw error

        if (!decisions || decisions.length === 0) {
            await sendMessage({
                chat_id: chatId,
                text: '⚡ <b>Decision Queue</b>\n\n✨ No pending decisions! You\'re all caught up.',
                parse_mode: 'HTML',
            })
            return
        }

        // Show the first decision
        const firstDecision = decisions[0] as DecisionForDisplay
        const message = formatDecision(firstDecision)
        const keyboard = createDecisionKeyboard(firstDecision.id, firstDecision.reference_type)

        await sendMessage({
            chat_id: chatId,
            text: `⚡ <b>Decision Queue</b> (${count || decisions.length} pending)\n\n${message}`,
            parse_mode: 'HTML',
            reply_markup: keyboard,
        })
    } catch (error) {
        console.error('Decisions command error:', error)
        await sendErrorMessage(chatId, 'Could not fetch decisions. Please try again.')
    }
}

/**
 * Handle /mute command
 */
async function handleMuteCommand(chatId: number, profileId: string, duration: string) {
    const supabase = getAdminClient()

    try {
        // Parse duration (e.g., "2h", "1d", "30m")
        let muteUntil: Date
        const now = new Date()

        if (!duration || duration === '') {
            // Default: 2 hours
            muteUntil = new Date(now.getTime() + 2 * 60 * 60 * 1000)
        } else if (duration.endsWith('h')) {
            const hours = parseInt(duration)
            muteUntil = new Date(now.getTime() + hours * 60 * 60 * 1000)
        } else if (duration.endsWith('d')) {
            const days = parseInt(duration)
            muteUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
        } else if (duration.endsWith('m')) {
            const minutes = parseInt(duration)
            muteUntil = new Date(now.getTime() + minutes * 60 * 1000)
        } else {
            await sendMessage({
                chat_id: chatId,
                text: '❓ <b>Mute Notifications</b>\n\nUsage: /mute [duration]\n\nExamples:\n• /mute 2h (2 hours)\n• /mute 1d (1 day)\n• /mute 30m (30 minutes)',
                parse_mode: 'HTML',
            })
            return
        }

        // Update or insert preferences
        await supabase
            .from('telegram_preferences')
            .upsert({
                profile_id: profileId,
                muted_until: muteUntil.toISOString(),
            }, {
                onConflict: 'profile_id',
            })

        const formattedTime = muteUntil.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
        })

        await sendMessage({
            chat_id: chatId,
            text: `🔕 <b>Notifications Muted</b>\n\nYou won't receive Telegram notifications until ${formattedTime}.\n\nUse /unmute to turn them back on.`,
            parse_mode: 'HTML',
        })
    } catch (error) {
        console.error('Mute command error:', error)
        await sendErrorMessage(chatId, 'Could not mute notifications. Please try again.')
    }
}

/**
 * Handle /unmute command
 */
async function handleUnmuteCommand(chatId: number, profileId: string) {
    const supabase = getAdminClient()

    try {
        await supabase
            .from('telegram_preferences')
            .upsert({
                profile_id: profileId,
                muted_until: null,
            }, {
                onConflict: 'profile_id',
            })

        await sendMessage({
            chat_id: chatId,
            text: '🔔 <b>Notifications Unmuted</b>\n\nYou\'ll now receive Telegram notifications again.',
            parse_mode: 'HTML',
        })
    } catch (error) {
        console.error('Unmute command error:', error)
        await sendErrorMessage(chatId, 'Could not unmute notifications. Please try again.')
    }
}

/**
 * Handle /settings command
 */
async function handleSettingsCommand(chatId: number, profileId: string) {
    const supabase = getAdminClient()

    try {
        // Get or create preferences
        let { data: prefs } = await supabase
            .from('telegram_preferences')
            .select('*')
            .eq('profile_id', profileId)
            .single()

        if (!prefs) {
            // Create default preferences
            const { data: newPrefs } = await supabase
                .from('telegram_preferences')
                .insert({ profile_id: profileId })
                .select()
                .single()
            prefs = newPrefs
        }

        const keyboard = createSettingsKeyboard({
            notifications_enabled: prefs?.notifications_enabled ?? true,
            daily_briefing_enabled: prefs?.daily_briefing_enabled ?? true,
        })

        await sendMessage({
            chat_id: chatId,
            text: '⚙️ <b>Telegram Settings</b>\n\nConfigure your notification preferences:',
            parse_mode: 'HTML',
            reply_markup: keyboard,
        })
    } catch (error) {
        console.error('Settings command error:', error)
        await sendErrorMessage(chatId, 'Could not load settings. Please try again.')
    }
}

/**
 * Handle /help command
 */
async function handleHelpCommand(chatId: number) {
    const helpText = `🤖 <b>ForgeOS Telegram Bot</b>

<b>📋 Task Management</b>
/tasks - View your task list
/done [task] - Mark a task complete
/today - Get your daily briefing

<b>💡 Ideas</b>
/idea [text] - Capture a quick idea
/ideas - View your ideas inbox

<b>⚡ Decisions</b>
/decisions - Review pending approvals

<b>🔔 Notifications</b>
/mute [2h/1d] - Pause notifications
/unmute - Resume notifications
/settings - Configure preferences

<b>📝 Create Objectives</b>
Just send me a message describing your goal, project, or objective - I'll turn it into a structured plan with tasks!

<b>🎤 Voice Messages</b>
Send a voice note and I'll transcribe it and create an objective from it.

<i>Need more help? Visit ForgeOS → Help</i>`

    await sendMessage({
        chat_id: chatId,
        text: helpText,
        parse_mode: 'HTML',
    })
}

// ===========================================
// Callback Handlers for Tasks
// ===========================================

async function handleTaskDoneCallback(
    query: TelegramCallbackQuery,
    chatId: number,
    messageId: number,
    taskId: string
) {
    const supabase = getAdminClient()

    try {
        // Get user from messaging link
        const { data: link } = await supabase
            .from('messaging_links')
            .select('profile_id')
            .eq('platform', 'telegram')
            .eq('platform_user_id', query.from.id.toString())
            .single()

        if (!link) {
            await answerCallbackQuery(query.id, 'Account not linked')
            return
        }

        const { data: task, error } = await supabase
            .from('tasks')
            .update({ status: 'Completed' })
            .eq('id', taskId)
            .eq('assignee_id', link.profile_id)
            .select('title')
            .single()

        if (error || !task) {
            await answerCallbackQuery(query.id, 'Could not complete task')
            return
        }

        await answerCallbackQuery(query.id, '✅ Task completed!')

        // Refresh the tasks list
        await handleTasksRefreshCallback(query, chatId, messageId)
    } catch (error) {
        console.error('Task done callback error:', error)
        await answerCallbackQuery(query.id, 'Error completing task')
    }
}

async function handleTaskViewCallback(
    query: TelegramCallbackQuery,
    chatId: number,
    messageId: number,
    taskId: string
) {
    const supabase = getAdminClient()

    try {
        const { data: task } = await supabase
            .from('tasks')
            .select(`
                id, title, description, status, end_date, risk_level,
                objectives(title)
            `)
            .eq('id', taskId)
            .single()

        if (!task) {
            await answerCallbackQuery(query.id, 'Task not found')
            return
        }

        await answerCallbackQuery(query.id)

        const riskEmoji = task.risk_level === 'High' ? '🔴' : task.risk_level === 'Medium' ? '🟡' : '🟢'
        let message = `📋 <b>${escapeHtml(task.title)}</b>\n\n`
        
        if (task.description) {
            message += `${escapeHtml(task.description)}\n\n`
        }

        message += `Status: ${task.status}\n`
        message += `${riskEmoji} Risk: ${task.risk_level}\n`
        
        if (task.end_date) {
            message += `📅 Due: ${new Date(task.end_date).toLocaleDateString('en-GB')}\n`
        }

        const objectiveTitle = getObjectiveTitle(task.objectives)
        if (objectiveTitle) {
            message += `🎯 Objective: ${escapeHtml(objectiveTitle)}`
        }

        const keyboard = createTaskActionKeyboard(taskId, task.status)

        await editMessage({
            chat_id: chatId,
            message_id: messageId,
            text: message,
            parse_mode: 'HTML',
            reply_markup: keyboard,
        })
    } catch (error) {
        console.error('Task view callback error:', error)
        await answerCallbackQuery(query.id, 'Error loading task')
    }
}

async function handleTaskSnoozeCallback(
    query: TelegramCallbackQuery,
    chatId: number,
    messageId: number,
    taskId: string,
    days: number
) {
    const supabase = getAdminClient()

    try {
        const { data: link } = await supabase
            .from('messaging_links')
            .select('profile_id')
            .eq('platform', 'telegram')
            .eq('platform_user_id', query.from.id.toString())
            .single()

        if (!link) {
            await answerCallbackQuery(query.id, 'Account not linked')
            return
        }

        // Get current end_date and add days
        const { data: task } = await supabase
            .from('tasks')
            .select('end_date')
            .eq('id', taskId)
            .single()

        const currentDate = task?.end_date ? new Date(task.end_date) : new Date()
        const newDate = new Date(currentDate)
        newDate.setDate(newDate.getDate() + days)

        await supabase
            .from('tasks')
            .update({ end_date: newDate.toISOString().split('T')[0] })
            .eq('id', taskId)
            .eq('assignee_id', link.profile_id)

        await answerCallbackQuery(query.id, `⏰ Snoozed ${days} day${days > 1 ? 's' : ''}`)

        // Refresh tasks
        await handleTasksRefreshCallback(query, chatId, messageId)
    } catch (error) {
        console.error('Task snooze callback error:', error)
        await answerCallbackQuery(query.id, 'Error snoozing task')
    }
}

async function handleTasksRefreshCallback(
    query: TelegramCallbackQuery,
    chatId: number,
    messageId: number
) {
    const supabase = getAdminClient()

    try {
        const { data: link } = await supabase
            .from('messaging_links')
            .select('profile_id')
            .eq('platform', 'telegram')
            .eq('platform_user_id', query.from.id.toString())
            .single()

        if (!link) {
            await answerCallbackQuery(query.id, 'Account not linked')
            return
        }

        await answerCallbackQuery(query.id, '🔄 Refreshing...')

        const { data: tasks } = await supabase
            .from('tasks')
            .select(`
                id, title, status, end_date, risk_level,
                objectives(title)
            `)
            .eq('assignee_id', link.profile_id)
            .eq('is_ghost', false)
            .is('deleted_at', null)
            .not('status', 'in', '("Completed","Cancelled")')
            .order('end_date', { ascending: true, nullsFirst: false })
            .limit(10)

        const tasksForDisplay: TaskForDisplay[] = (tasks || []).map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            end_date: t.end_date,
            risk_level: t.risk_level,
            objective_title: getObjectiveTitle(t.objectives),
        }))

        const message = formatTasksList(tasksForDisplay, "Your Tasks")
        const keyboard = createTasksListKeyboard(tasksForDisplay)

        await editMessage({
            chat_id: chatId,
            message_id: messageId,
            text: message,
            parse_mode: 'HTML',
            reply_markup: keyboard,
        })
    } catch (error) {
        console.error('Tasks refresh callback error:', error)
        await answerCallbackQuery(query.id, 'Error refreshing')
    }
}

// ===========================================
// Callback Handlers for Decisions
// ===========================================

async function handleDecisionCallback(
    query: TelegramCallbackQuery,
    chatId: number,
    messageId: number,
    decisionId: string,
    status: 'approved' | 'rejected' | 'deferred'
) {
    const supabase = getAdminClient()

    try {
        const { data: link } = await supabase
            .from('messaging_links')
            .select('profile_id')
            .eq('platform', 'telegram')
            .eq('platform_user_id', query.from.id.toString())
            .single()

        if (!link) {
            await answerCallbackQuery(query.id, 'Account not linked')
            return
        }

        const { data: decision, error } = await supabase
            .from('telegram_decisions')
            .update({
                status,
                decided_at: new Date().toISOString(),
            })
            .eq('id', decisionId)
            .eq('profile_id', link.profile_id)
            .select('title, reference_type, reference_id')
            .single()

        if (error || !decision) {
            await answerCallbackQuery(query.id, 'Could not update decision')
            return
        }

        // If approved/rejected, update the referenced item
        if (status === 'approved' && decision.reference_type === 'task') {
            await supabase
                .from('tasks')
                .update({ status: 'Completed' })
                .eq('id', decision.reference_id)
        }

        const statusEmoji = status === 'approved' ? '✅' : status === 'rejected' ? '❌' : '⏳'
        await answerCallbackQuery(query.id, `${statusEmoji} ${status.charAt(0).toUpperCase() + status.slice(1)}`)

        // Show next decision or completion message
        await handleDecisionsNextCallback(query, chatId, messageId)
    } catch (error) {
        console.error('Decision callback error:', error)
        await answerCallbackQuery(query.id, 'Error processing decision')
    }
}

async function handleDecisionViewCallback(
    query: TelegramCallbackQuery,
    chatId: number,
    messageId: number,
    decisionId: string
) {
    await answerCallbackQuery(query.id)
    
    // Open in app
    const { getBaseUrl } = await import('@/lib/domains')
    const appUrl = getBaseUrl()
    await sendMessage({
        chat_id: chatId,
        text: `👁 <b>View in App</b>\n\nOpen ForgeOS to see full details:\n${appUrl}/decisions/${decisionId}`,
        parse_mode: 'HTML',
    })
}

async function handleDecisionsNextCallback(
    query: TelegramCallbackQuery,
    chatId: number,
    messageId: number
) {
    const supabase = getAdminClient()

    try {
        const { data: link } = await supabase
            .from('messaging_links')
            .select('profile_id')
            .eq('platform', 'telegram')
            .eq('platform_user_id', query.from.id.toString())
            .single()

        if (!link) {
            await answerCallbackQuery(query.id, 'Account not linked')
            return
        }

        const { data: decisions, count } = await supabase
            .from('telegram_decisions')
            .select('*', { count: 'exact' })
            .eq('profile_id', link.profile_id)
            .eq('status', 'pending')
            .order('priority', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(1)

        if (!decisions || decisions.length === 0) {
            await editMessage({
                chat_id: chatId,
                message_id: messageId,
                text: '⚡ <b>Decision Queue</b>\n\n✨ All done! No more pending decisions.',
                parse_mode: 'HTML',
            })
            return
        }

        const decision = decisions[0] as DecisionForDisplay
        const message = formatDecision(decision)
        const keyboard = createDecisionKeyboard(decision.id, decision.reference_type)

        await editMessage({
            chat_id: chatId,
            message_id: messageId,
            text: `⚡ <b>Decision Queue</b> (${count} remaining)\n\n${message}`,
            parse_mode: 'HTML',
            reply_markup: keyboard,
        })
    } catch (error) {
        console.error('Decisions next callback error:', error)
        await answerCallbackQuery(query.id, 'Error loading next decision')
    }
}

// ===========================================
// Callback Handlers for Ideas
// ===========================================

async function handleIdeaPromoteCallback(
    query: TelegramCallbackQuery,
    chatId: number,
    messageId: number,
    ideaId: string
) {
    const supabase = getAdminClient()

    try {
        const { data: link } = await supabase
            .from('messaging_links')
            .select('profile_id, foundry_id')
            .eq('platform', 'telegram')
            .eq('platform_user_id', query.from.id.toString())
            .single()

        if (!link) {
            await answerCallbackQuery(query.id, 'Account not linked')
            return
        }

        // Get the idea
        const { data: idea } = await supabase
            .from('telegram_ideas')
            .select('content')
            .eq('id', ideaId)
            .eq('profile_id', link.profile_id)
            .single()

        if (!idea) {
            await answerCallbackQuery(query.id, 'Idea not found')
            return
        }

        await answerCallbackQuery(query.id, '🚀 Processing...')

        // Update idea status
        await supabase
            .from('telegram_ideas')
            .update({ status: 'promoted' })
            .eq('id', ideaId)

        // Store as pending intent for objective creation
        const { parseTextToObjective } = await import('@/lib/telegram/ai-processor')
        const objective = await parseTextToObjective(idea.content)

        const { data: intent } = await supabase
            .from('pending_intents')
            .insert({
                profile_id: link.profile_id,
                foundry_id: link.foundry_id,
                platform: 'telegram',
                platform_user_id: query.from.id.toString(),
                original_message: idea.content,
                parsed_objective: objective,
                status: 'pending',
            })
            .select('id')
            .single()

        if (!intent) {
            await sendErrorMessage(chatId, 'Could not process idea')
            return
        }

        // Send confirmation message
        const confirmationText = formatObjectiveMessage(objective, new Date())
        const keyboard = createConfirmationKeyboard(intent.id)

        await editMessage({
            chat_id: chatId,
            message_id: messageId,
            text: '🚀 <b>Idea Promoted!</b>\n\n' + confirmationText + '\n\n<i>Review and confirm to create this objective:</i>',
            parse_mode: 'HTML',
            reply_markup: keyboard,
        })
    } catch (error) {
        console.error('Idea promote callback error:', error)
        await answerCallbackQuery(query.id, 'Error promoting idea')
    }
}

async function handleIdeaDismissCallback(
    query: TelegramCallbackQuery,
    chatId: number,
    messageId: number,
    ideaId: string
) {
    const supabase = getAdminClient()

    try {
        const { data: link } = await supabase
            .from('messaging_links')
            .select('profile_id')
            .eq('platform', 'telegram')
            .eq('platform_user_id', query.from.id.toString())
            .single()

        if (!link) {
            await answerCallbackQuery(query.id, 'Account not linked')
            return
        }

        await supabase
            .from('telegram_ideas')
            .update({ status: 'dismissed' })
            .eq('id', ideaId)
            .eq('profile_id', link.profile_id)

        await answerCallbackQuery(query.id, '🗑 Idea dismissed')

        await editMessage({
            chat_id: chatId,
            message_id: messageId,
            text: '🗑 <b>Idea Dismissed</b>\n\n<i>Use /idea to capture a new thought</i>',
            parse_mode: 'HTML',
        })
    } catch (error) {
        console.error('Idea dismiss callback error:', error)
        await answerCallbackQuery(query.id, 'Error dismissing idea')
    }
}

// ===========================================
// Callback Handlers for Settings
// ===========================================

async function handleSettingsToggleCallback(
    query: TelegramCallbackQuery,
    chatId: number,
    messageId: number,
    setting: string
) {
    const supabase = getAdminClient()

    try {
        const { data: link } = await supabase
            .from('messaging_links')
            .select('profile_id')
            .eq('platform', 'telegram')
            .eq('platform_user_id', query.from.id.toString())
            .single()

        if (!link) {
            await answerCallbackQuery(query.id, 'Account not linked')
            return
        }

        // Get current prefs
        const { data: currentPrefs } = await supabase
            .from('telegram_preferences')
            .select('*')
            .eq('profile_id', link.profile_id)
            .single()

        const updates: Record<string, boolean> = {}
        
        if (setting === 'notifications') {
            updates.notifications_enabled = !(currentPrefs?.notifications_enabled ?? true)
        } else if (setting === 'briefing') {
            updates.daily_briefing_enabled = !(currentPrefs?.daily_briefing_enabled ?? true)
        }

        await supabase
            .from('telegram_preferences')
            .upsert({
                profile_id: link.profile_id,
                ...updates,
            }, {
                onConflict: 'profile_id',
            })

        await answerCallbackQuery(query.id, 'Updated!')

        // Refresh settings display
        const { data: newPrefs } = await supabase
            .from('telegram_preferences')
            .select('*')
            .eq('profile_id', link.profile_id)
            .single()

        const keyboard = createSettingsKeyboard({
            notifications_enabled: newPrefs?.notifications_enabled ?? true,
            daily_briefing_enabled: newPrefs?.daily_briefing_enabled ?? true,
        })

        await editMessage({
            chat_id: chatId,
            message_id: messageId,
            text: '⚙️ <b>Telegram Settings</b>\n\nConfigure your notification preferences:',
            parse_mode: 'HTML',
            reply_markup: keyboard,
        })
    } catch (error) {
        console.error('Settings toggle callback error:', error)
        await answerCallbackQuery(query.id, 'Error updating settings')
    }
}

// GET endpoint for webhook verification checks.
export async function GET(req: NextRequest) {
    const authFailure = verifyWebhookSecret(req)
    if (authFailure) {
        return authFailure
    }

    return NextResponse.json({ status: 'ok', service: 'ForgeOS Telegram Bot' })
}
