/**
 * Telegram Bot Webhook Handler
 * Receives messages from Telegram and processes them into objectives
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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

// Use service role for webhook operations (bypasses RLS)
function getAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
        throw new Error('Missing Supabase configuration')
    }

    return createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

// Verify webhook secret (REQUIRED in production)
function verifyWebhookSecret(req: NextRequest): boolean {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    
    // SECURITY: Require webhook secret in production to prevent unauthorized access
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[SECURITY] TELEGRAM_WEBHOOK_SECRET not configured in production!')
            return false
        }
        // Allow in development only with warning
        console.warn('[DEV] TELEGRAM_WEBHOOK_SECRET not configured - allowing request in development')
        return true
    }

    const providedSecret = req.headers.get('X-Telegram-Bot-Api-Secret-Token')
    return providedSecret === secret
}

export async function POST(req: NextRequest) {
    try {
        // Verify webhook secret
        if (!verifyWebhookSecret(req)) {
            console.warn('Invalid webhook secret')
            return NextResponse.json({ ok: false }, { status: 403 })
        }

        const update: TelegramUpdate = await req.json()
        console.log('Telegram update:', JSON.stringify(update, null, 2))

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
            text: `⚠️ Your Telegram isn't linked to CentaurOS yet.\n\nUse /start to get linking instructions, or enter your verification code with:\n/link YOUR_CODE`,
        })
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
    const allowedActions = ['confirm', 'reject', 'edit_obj', 'edit_tasks', 'edit_task', 'back']
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

    // Send instructions - user needs to generate code from CentaurOS settings
    await sendMessage({
        chat_id: chatId,
        text: `👋 <b>Welcome to CentaurOS!</b>

To link your Telegram account:

1️⃣ Go to CentaurOS → Settings
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
            text: '❌ This verification code has expired. Please generate a new one in CentaurOS Settings.',
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
            text: `✅ <b>Objective Created!</b>\n\n<b>${escapeHtml(objective.title)}</b>\n\n${objective.tasks.length} tasks added to your CentaurOS account.\n\n<i>View in CentaurOS → Objectives</i>`,
            parse_mode: 'HTML',
        })
    } catch (error) {
        console.error('Error creating objective:', error)
        await editMessage({
            chat_id: chatId,
            message_id: messageId,
            text: `❌ Failed to create objective: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again.`,
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
    supabase: ReturnType<typeof getAdminClient>,
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

// GET endpoint for webhook verification (Telegram doesn't use this, but good to have)
export async function GET() {
    return NextResponse.json({ status: 'ok', service: 'CentaurOS Telegram Bot' })
}
