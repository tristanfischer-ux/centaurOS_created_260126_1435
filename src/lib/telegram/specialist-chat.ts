/**
 * @file specialist-chat.ts
 *
 * @description Handles specialist conversations via Telegram. Allows users
 * to chat with any of the 13 specialists from their phone, with the same
 * personality, memory, and context as the web app.
 *
 * Architecture: Instead of calling the /api/agents/execute HTTP endpoint
 * (which requires Supabase auth), this module calls the AI text provider
 * directly and uses the admin client for all DB operations. This mirrors
 * the execute route's logic but bypasses the auth layer since the Telegram
 * webhook has already verified the user via messaging_links.
 *
 * @related
 * - Bot: src/lib/telegram/bot.ts
 * - Route: src/app/api/bot/telegram/route.ts
 * - Execute: src/app/api/agents/execute/route.ts
 * - Specialists: src/app/(platform)/agents/specialists-data.ts
 * - Memory: src/lib/agent-memory/manager.ts
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { SPECIALISTS, getSpecialistById } from '@/app/(platform)/agents/specialists-data'
import type { SpecialistId } from '@/app/(platform)/agents/specialists-data'
import { sendMessage, editMessage, escapeHtml, deleteMessage } from './bot'
import { getTextProvider } from '@/lib/ai-providers/registry'
import { compilePersonalityPrompt, compileRelationshipContext } from '@/lib/agents/personality'
import { compileTemporalPrompt } from '@/lib/agents/temporal-context'
import { compileEmotionalPrompt } from '@/lib/agents/emotional-context'
import { buildAIContext } from '@/lib/ai-context/builder'
import {
    getMemoryContext,
    formatObservationsForPrompt,
    getConversationHistory,
} from '@/lib/agent-memory'

import type { AIProviderId } from '@/lib/ai-providers/types'

// ─── Types ──────────────────────────────────────────────────────────

interface TelegramSpecialistSession {
    foundryId: string
    userId: string
    chatId: number
    specialistId: SpecialistId
    threadId: string
}

// ─── Specialist Resolution ──────────────────────────────────────────

/** Map of short aliases to specialist IDs */
const SPECIALIST_ALIASES: Record<string, SpecialistId> = {
    sage: 'strategist',
    strategy: 'strategist',
    max: 'cto',
    cto: 'cto',
    tech: 'cto',
    jian: 'vp-engineering',
    engineering: 'vp-engineering',
    eng: 'vp-engineering',
    fang: 'vp-manufacturing',
    manufacturing: 'vp-manufacturing',
    mfg: 'vp-manufacturing',
    chase: 'vp-supply-chain',
    supply: 'vp-supply-chain',
    'supply-chain': 'vp-supply-chain',
    priya: 'product-lead',
    product: 'product-lead',
    mia: 'growth-marketer',
    marketing: 'growth-marketer',
    sal: 'sales-lead',
    sales: 'sales-lead',
    cal: 'chief-of-staff',
    cos: 'chief-of-staff',
    'chief-of-staff': 'chief-of-staff',
    finn: 'finance-lead',
    finance: 'finance-lead',
    fiona: 'fundraising-advisor',
    fundraising: 'fundraising-advisor',
    harper: 'hiring-team',
    hr: 'hiring-team',
    people: 'hiring-team',
    leo: 'legal-counsel',
    legal: 'legal-counsel',
}

/**
 * Resolves a specialist from user input (name, alias, or ID).
 *
 * @param input - User's specialist reference (e.g., "sage", "strategy", "cto")
 * @returns The specialist ID, or null if not found
 */
export function resolveSpecialistFromInput(input: string): SpecialistId | null {
    const normalized = input.toLowerCase().trim()
    return SPECIALIST_ALIASES[normalized] ?? null
}

// ─── Memory Thread Management ───────────────────────────────────────

/**
 * Gets or creates a memory thread for a Telegram specialist conversation.
 * Uses the admin client since Telegram webhook has no user session.
 *
 * @param foundryId - The user's foundry ID
 * @param userId - The user's profile ID
 * @param specialistId - The specialist being chatted with
 * @returns The thread ID
 *
 * @security Uses admin client — caller must have already verified the user
 */
async function getOrCreateTelegramThread(
    foundryId: string,
    userId: string,
    specialistId: string,
): Promise<string> {
    const supabase = createAdminClient()

    // Check for existing specialist thread with telegram source metadata
    const { data: existing } = await supabase
        .from('agent_memory_threads')
        .select('id')
        .eq('foundry_id', foundryId)
        .eq('context_type', 'specialist')
        .eq('context_id', specialistId)
        .contains('metadata', { source: 'telegram' })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (existing) return existing.id

    // Create new thread with telegram source in metadata
    const { data: newThread, error } = await supabase
        .from('agent_memory_threads')
        .insert({
            foundry_id: foundryId,
            created_by: userId,
            context_type: 'specialist',
            context_id: specialistId,
            metadata: { specialistId, specialistType: 'specialist', source: 'telegram' },
        })
        .select('id')
        .single()

    if (error || !newThread) {
        console.error('[Telegram/SpecialistChat] Failed to create thread:', {
            foundryId,
            specialistId,
            error: error?.message,
        })
        throw new Error(`Failed to create thread: ${error?.message}`)
    }

    return newThread.id
}

// ─── AI Execution ───────────────────────────────────────────────────

/**
 * Sends a message to a specialist and returns the response.
 * Calls the AI provider directly (same pipeline as the execute route)
 * but uses admin client since Telegram has no user session.
 *
 * @param session - The Telegram specialist session
 * @param userMessage - The user's message text
 * @returns The specialist's response text
 *
 * @security Caller must verify user identity before calling
 */
export async function sendToSpecialist(
    session: TelegramSpecialistSession,
    userMessage: string,
): Promise<string> {
    const specialist = getSpecialistById(session.specialistId)
    if (!specialist) throw new Error(`Unknown specialist: ${session.specialistId}`)

    const supabase = createAdminClient()

    // Determine provider and model from specialist config
    const providerId: AIProviderId = specialist.modelTier === 'claude' ? 'anthropic' : 'minimax'
    const modelId = specialist.modelTier === 'claude' ? 'claude-opus-4-6' : 'MiniMax-M2.5'

    // Resolve API key from environment
    const envMap: Partial<Record<AIProviderId, string>> = {
        anthropic: process.env.ANTHROPIC_API_KEY ?? '',
        qwen: process.env.DASHSCOPE_API_KEY ?? '',
        'qwen-local': 'ollama',
        minimax: process.env.MINIMAX_API_KEY ?? '',
        openai: process.env.OPENAI_API_KEY ?? '',
    }
    const apiKey = envMap[providerId]
    if (!apiKey) {
        throw new Error(`No API key configured for provider: ${providerId}`)
    }

    // Build system prompt: personality + context (mirrors execute route logic)
    let systemPrompt = ''

    // 1. Specialist personality (identity leads)
    const personalityPrompt = compilePersonalityPrompt(
        `${specialist.name}, the ${specialist.title} specialist`,
        specialist.personality,
        specialist.description,
        session.specialistId,
    )
    systemPrompt = personalityPrompt

    // 2. Relationship awareness
    if (specialist.personality.relationships) {
        const relationshipBlock = compileRelationshipContext(
            specialist.name,
            specialist.personality.relationships,
        )
        if (relationshipBlock) {
            systemPrompt += `\n\n${relationshipBlock}`
        }
    }

    // 3. Response standards
    systemPrompt += `\n\n## Response Standards
- Be direct and actionable. Use markdown: headers, tables, bullets.
- Distinguish between data the user provided, industry knowledge, and your estimates.
- Flag assumptions explicitly. Never fabricate statistics.
- End with clear next steps: who does what, by when.`

    // 4. User identity
    const { data: userProfile } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', session.userId)
        .single()

    if (userProfile?.full_name) {
        const roleSuffix = userProfile.role ? ` (${userProfile.role})` : ''
        systemPrompt += `\n\n## User Identity\nYou are speaking with ${userProfile.full_name}${roleSuffix}. Address them by name when natural.`
    }

    // 5. Temporal awareness
    let foundryCreatedAt: string | null = null
    try {
        const { data: foundryData } = await supabase
            .from('foundries')
            .select('created_at')
            .eq('id', session.foundryId)
            .single()
        foundryCreatedAt = foundryData?.created_at ?? null
    } catch {
        // Non-critical
    }
    const temporalBlock = compileTemporalPrompt(undefined, foundryCreatedAt)
    systemPrompt += `\n\n${temporalBlock}`

    // 6. Emotional awareness
    const emotionalBlock = compileEmotionalPrompt(userMessage)
    if (emotionalBlock) {
        systemPrompt += `\n\n${emotionalBlock}`
    }

    // 7. Company context
    try {
        const companyContext = await buildAIContext(session.foundryId, session.userId, {
            includeActivity: true,
            includeObjectives: true,
            includeUserProfile: false,
            includeInsightHistory: false,
            includeEngineeringHistory: true,
        })
        if (companyContext) {
            systemPrompt += `\n\n${companyContext}`
        }
    } catch (err) {
        console.warn('[Telegram/SpecialistChat] Could not load company context:', err)
    }

    // 8. Observational memory (compressed observations + recent messages as multi-turn context)
    let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
    try {
        const adminClient = createAdminClient()
        const memoryContext = await getMemoryContext(
            session.threadId,
            session.foundryId,
            false,
            adminClient,
        )
        const observationsBlock = formatObservationsForPrompt(memoryContext)
        if (observationsBlock) {
            systemPrompt += `\n\n## Agent Memory\n${observationsBlock}`
        }
        conversationHistory = getConversationHistory(memoryContext)
    } catch (err) {
        console.warn('[Telegram/SpecialistChat] Could not load memory:', err)
    }

    // 9. Telegram-specific suffix
    systemPrompt += `\n\nIMPORTANT: This conversation is happening via Telegram (mobile). Keep responses concise and well-formatted for a small screen. Use short paragraphs. Avoid very long bullet lists. The founder is likely on the go.`

    // Record user message to memory
    try {
        await supabase.from('agent_memory_messages').insert({
            thread_id: session.threadId,
            foundry_id: session.foundryId,
            role: 'user',
            content: userMessage,
            token_count: Math.ceil(userMessage.length / 4),
        })
    } catch (err) {
        console.warn('[Telegram/SpecialistChat] Failed to record user message:', err)
    }

    // Call AI provider directly
    const streamFn = getTextProvider(providerId)
    if (!streamFn) {
        throw new Error(`No text provider for: ${providerId}`)
    }

    let fullOutput = ''

    await streamFn({
        apiKey,
        modelId,
        systemPrompt,
        userPrompt: userMessage,
        conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
        maxTokens: 4096,
        onChunk(text: string) {
            fullOutput += text
        },
        onDone() {
            // Streaming complete
        },
        onError(error: unknown) {
            console.error('[Telegram/SpecialistChat] Stream error:', error)
        },
    })

    // Record assistant response to memory (fire-and-forget)
    if (fullOutput) {
        const cleanOutput = fullOutput
            .replace(/NEXT_SPECIALIST:\s*\S+\s*\|.*/gi, '')
            .replace(/<!--\s*PROPOSED_ACTIONS\s*[\s\S]*?\s*-->/gi, '')
            .replace(/<!--\s*PROPOSED_EXTERNAL_ACTION\s*[\s\S]*?\s*-->/gi, '')
            .trim()

        supabase.from('agent_memory_messages').insert({
            thread_id: session.threadId,
            foundry_id: session.foundryId,
            role: 'assistant',
            content: cleanOutput || fullOutput,
            token_count: Math.ceil(fullOutput.length / 4),
        }).then(({ error }) => {
            if (error) {
                console.warn('[Telegram/SpecialistChat] Failed to record assistant message:', error.message)
            }
        })
    }

    return fullOutput || 'I wasn\'t able to generate a response. Please try again.'
}

// ─── Telegram Formatting ────────────────────────────────────────────

/**
 * Formats a specialist response for Telegram HTML display.
 * Converts markdown to Telegram-compatible HTML.
 *
 * @param text - The raw specialist response (markdown)
 * @returns Telegram HTML-formatted text
 */
export function formatForTelegram(text: string): string {
    let formatted = text

    // Strip PROPOSED_ACTIONS and PROPOSED_EXTERNAL_ACTION blocks
    formatted = formatted.replace(/<!--\s*PROPOSED_ACTIONS[\s\S]*?-->/gi, '')
    formatted = formatted.replace(/<!--\s*PROPOSED_EXTERNAL_ACTION[\s\S]*?-->/gi, '')

    // Strip NEXT_SPECIALIST directives
    formatted = formatted.replace(/NEXT_SPECIALIST:\s*\S+\s*\|.*/gi, '')

    // Convert markdown bold to HTML bold
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')

    // Convert markdown italic to HTML italic
    formatted = formatted.replace(/\*(.+?)\*/g, '<i>$1</i>')

    // Convert markdown code blocks to HTML code
    formatted = formatted.replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre>$1</pre>')
    formatted = formatted.replace(/`(.+?)`/g, '<code>$1</code>')

    // Convert markdown headers to bold
    formatted = formatted.replace(/^#{1,3}\s+(.+)$/gm, '\n<b>$1</b>\n')

    // Convert markdown links to just text (Telegram doesn't support inline links in all contexts)
    formatted = formatted.replace(/\[(.+?)\]\(.+?\)/g, '$1')

    // Clean up excessive newlines
    formatted = formatted.replace(/\n{3,}/g, '\n\n')

    return formatted.trim()
}

// ─── Command Handlers ───────────────────────────────────────────────

/**
 * Handles the /chat command - starts or continues a specialist conversation.
 *
 * @param chatId - Telegram chat ID
 * @param userId - ForgeOS user ID (profile_id)
 * @param foundryId - ForgeOS foundry ID
 * @param specialistInput - The specialist name/alias from the command
 * @param initialMessage - Optional initial message to send
 */
export async function handleChatCommand(
    chatId: number,
    userId: string,
    foundryId: string,
    specialistInput: string,
    initialMessage?: string,
): Promise<void> {
    // Resolve specialist
    const specialistId = resolveSpecialistFromInput(specialistInput)
    if (!specialistId) {
        const specialistList = SPECIALISTS.map(s => `  • <b>${escapeHtml(s.name)}</b> — ${escapeHtml(s.title)}`).join('\n')
        await sendMessage({
            chat_id: chatId,
            text: `I don't recognize that specialist. Here's who's available:\n\n${specialistList}\n\nTry: /chat sage or /chat finn`,
            parse_mode: 'HTML',
        })
        return
    }

    const specialist = getSpecialistById(specialistId)!

    // Store active specialist session
    const supabase = createAdminClient()
    await supabase.from('telegram_specialist_sessions').upsert({
        chat_id: String(chatId),
        user_id: userId,
        foundry_id: foundryId,
        specialist_id: specialistId,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'chat_id' })

    // Get or create thread
    const threadId = await getOrCreateTelegramThread(foundryId, userId, specialistId)

    if (initialMessage) {
        // Send thinking indicator
        await sendMessage({
            chat_id: chatId,
            text: `<b>${escapeHtml(specialist.name)} (${escapeHtml(specialist.title)})</b>\n\n<i>${escapeHtml(specialist.thinkingPhases[0])}</i>`,
            parse_mode: 'HTML',
        })

        try {
            const response = await sendToSpecialist(
                { foundryId, userId, chatId, specialistId, threadId },
                initialMessage,
            )

            const formatted = formatForTelegram(response)
            const chunks = splitMessage(formatted, 4000)
            for (const chunk of chunks) {
                await sendMessage({
                    chat_id: chatId,
                    text: chunk,
                    parse_mode: 'HTML',
                })
            }
        } catch (error) {
            console.error('[Telegram/SpecialistChat] Chat command error:', error)
            await sendMessage({
                chat_id: chatId,
                text: `${escapeHtml(specialist.name)} couldn't respond right now. Please try again.`,
                parse_mode: 'HTML',
            })
        }
    } else {
        // Just announce the specialist
        await sendMessage({
            chat_id: chatId,
            text: `<b>Now chatting with ${escapeHtml(specialist.name)} (${escapeHtml(specialist.title)})</b>\n\n<i>"${escapeHtml(specialist.tagline)}"</i>\n\nSend me a message and ${escapeHtml(specialist.name)} will respond. Use /chat [name] to switch specialists, or /endchat to stop.`,
            parse_mode: 'HTML',
        })
    }
}

/**
 * Handles the /ask command - one-shot question to a specialist.
 *
 * @param chatId - Telegram chat ID
 * @param userId - ForgeOS user ID (profile_id)
 * @param foundryId - ForgeOS foundry ID
 * @param specialistInput - The specialist name/alias
 * @param question - The question to ask
 */
export async function handleAskCommand(
    chatId: number,
    userId: string,
    foundryId: string,
    specialistInput: string,
    question: string,
): Promise<void> {
    const specialistId = resolveSpecialistFromInput(specialistInput)
    if (!specialistId) {
        await sendMessage({
            chat_id: chatId,
            text: `I don't recognize "${escapeHtml(specialistInput)}". Try: /ask sage What should our Q2 strategy be?`,
            parse_mode: 'HTML',
        })
        return
    }

    const specialist = getSpecialistById(specialistId)!
    const threadId = await getOrCreateTelegramThread(foundryId, userId, specialistId)

    // Show thinking indicator
    const thinkingMsg = await sendMessage({
        chat_id: chatId,
        text: `<b>${escapeHtml(specialist.name)}</b>: <i>${escapeHtml(specialist.thinkingPhases[0])}</i>`,
        parse_mode: 'HTML',
    })

    try {
        const response = await sendToSpecialist(
            { foundryId, userId, chatId, specialistId, threadId },
            question,
        )

        const formatted = formatForTelegram(response)
        const header = `<b>${escapeHtml(specialist.name)} (${escapeHtml(specialist.title)})</b>\n\n`

        // Delete thinking message
        await deleteMessage(chatId, thinkingMsg.message_id)

        const chunks = splitMessage(header + formatted, 4000)
        for (const chunk of chunks) {
            await sendMessage({
                chat_id: chatId,
                text: chunk,
                parse_mode: 'HTML',
            })
        }
    } catch (error) {
        console.error('[Telegram/SpecialistChat] Ask command error:', error)
        await sendMessage({
            chat_id: chatId,
            text: `${escapeHtml(specialist.name)} couldn't respond right now. Please try again.`,
            parse_mode: 'HTML',
        })
    }
}

/**
 * Handles a regular message when the user has an active specialist session.
 *
 * @param chatId - Telegram chat ID
 * @param userId - ForgeOS user ID (profile_id)
 * @param foundryId - ForgeOS foundry ID
 * @param message - The user's message
 * @returns true if handled (active session exists), false if no active session
 */
export async function handleSpecialistMessage(
    chatId: number,
    userId: string,
    foundryId: string,
    message: string,
): Promise<boolean> {
    const supabase = createAdminClient()

    // Check for active specialist session
    const { data: session } = await supabase
        .from('telegram_specialist_sessions')
        .select('specialist_id')
        .eq('chat_id', String(chatId))
        .maybeSingle()

    if (!session) return false

    const specialistId = session.specialist_id as SpecialistId
    const specialist = getSpecialistById(specialistId)
    if (!specialist) return false

    const threadId = await getOrCreateTelegramThread(foundryId, userId, specialistId)

    // Update session timestamp
    await supabase
        .from('telegram_specialist_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('chat_id', String(chatId))

    // Show thinking indicator
    const thinkingMsg = await sendMessage({
        chat_id: chatId,
        text: `<i>${escapeHtml(specialist.thinkingPhases[0])}</i>`,
        parse_mode: 'HTML',
    })

    try {
        const response = await sendToSpecialist(
            { foundryId, userId, chatId, specialistId, threadId },
            message,
        )

        const formatted = formatForTelegram(response)

        // Delete thinking message
        await deleteMessage(chatId, thinkingMsg.message_id)

        const chunks = splitMessage(formatted, 4000)
        for (const chunk of chunks) {
            await sendMessage({
                chat_id: chatId,
                text: chunk,
                parse_mode: 'HTML',
            })
        }
    } catch (error) {
        console.error('[Telegram/SpecialistChat] Message error:', error)
        await sendMessage({
            chat_id: chatId,
            text: `Something went wrong. Try again or /endchat to exit.`,
            parse_mode: 'HTML',
        })
    }

    return true
}

/**
 * Ends the active specialist chat session.
 *
 * @param chatId - Telegram chat ID
 */
export async function handleEndChat(chatId: number): Promise<void> {
    const supabase = createAdminClient()

    const { data: session } = await supabase
        .from('telegram_specialist_sessions')
        .select('specialist_id')
        .eq('chat_id', String(chatId))
        .maybeSingle()

    await supabase
        .from('telegram_specialist_sessions')
        .delete()
        .eq('chat_id', String(chatId))

    if (session) {
        const specialist = getSpecialistById(session.specialist_id as SpecialistId)
        await sendMessage({
            chat_id: chatId,
            text: `Chat with ${specialist?.name ?? 'specialist'} ended.\n\nUse /chat [name] to start a new conversation.`,
            parse_mode: 'HTML',
        })
    } else {
        await sendMessage({
            chat_id: chatId,
            text: `No active specialist chat. Use /chat [name] to start one.`,
        })
    }
}

/**
 * Lists all available specialists for Telegram.
 *
 * @param chatId - Telegram chat ID
 */
export async function handleSpecialistList(chatId: number): Promise<void> {
    let message = `<b>Your Specialist Team</b>\n\n`

    const departments = new Map<string, typeof SPECIALISTS>()
    for (const s of SPECIALISTS) {
        const dept = s.department
        if (!departments.has(dept)) departments.set(dept, [])
        departments.get(dept)!.push(s)
    }

    for (const [dept, specs] of departments) {
        message += `<b>${escapeHtml(dept)}</b>\n`
        for (const s of specs) {
            message += `  • <b>${escapeHtml(s.name)}</b> — ${escapeHtml(s.title)}\n`
        }
        message += '\n'
    }

    message += `<i>Use /chat [name] to start a conversation\nUse /ask [name] [question] for a quick answer</i>`

    await sendMessage({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
    })
}

// ─── Voice Message Handling ─────────────────────────────────────────

/**
 * Handles a voice message when the user has an active specialist session.
 * Transcribes the voice, sends to specialist, and responds with text.
 *
 * @description Downloads the voice file, transcribes via OpenAI Whisper,
 * routes the transcription to the active specialist, and optionally
 * generates a TTS audio response using the specialist's configured voice.
 *
 * @param chatId - Telegram chat ID
 * @param userId - ForgeOS user ID
 * @param foundryId - ForgeOS foundry ID
 * @param audioBuffer - The audio file buffer
 * @param mimeType - The audio MIME type
 * @returns true if handled, false if no active session
 */
export async function handleSpecialistVoiceMessage(
    chatId: number,
    userId: string,
    foundryId: string,
    audioBuffer: ArrayBuffer,
    mimeType: string,
): Promise<boolean> {
    const supabase = createAdminClient()

    // Check for active specialist session
    const { data: session } = await supabase
        .from('telegram_specialist_sessions')
        .select('specialist_id')
        .eq('chat_id', String(chatId))
        .maybeSingle()

    if (!session) return false

    const specialistId = session.specialist_id as SpecialistId
    const specialist = getSpecialistById(specialistId)
    if (!specialist) return false

    // Show transcribing indicator
    const processingMsg = await sendMessage({
        chat_id: chatId,
        text: `🎤 <i>Transcribing your voice message...</i>`,
        parse_mode: 'HTML',
    })

    try {
        // Transcribe using Whisper
        const { transcribeVoice } = await import('./ai-processor')
        const transcription = await transcribeVoice(audioBuffer, mimeType)

        if (!transcription || transcription.trim().length === 0) {
            await editMessage({
                chat_id: chatId,
                message_id: processingMsg.message_id,
                text: `❌ Couldn't transcribe the voice message. Try again or type your message instead.`,
            })
            return true
        }

        // Update processing message with transcription
        await editMessage({
            chat_id: chatId,
            message_id: processingMsg.message_id,
            text: `🎤 <i>"${escapeHtml(transcription)}"</i>\n\n<i>${escapeHtml(specialist.thinkingPhases[0])}</i>`,
            parse_mode: 'HTML',
        })

        // Get or create thread and send to specialist
        const threadId = await getOrCreateTelegramThread(foundryId, userId, specialistId)
        const response = await sendToSpecialist(
            { foundryId, userId, chatId, specialistId, threadId },
            transcription,
        )

        const formatted = formatForTelegram(response)

        // Delete processing message
        await deleteMessage(chatId, processingMsg.message_id)

        // Send response
        const chunks = splitMessage(formatted, 4000)
        for (const chunk of chunks) {
            await sendMessage({
                chat_id: chatId,
                text: chunk,
                parse_mode: 'HTML',
            })
        }

        // Optionally generate TTS response (fire-and-forget)
        generateAndSendTTS(chatId, response, specialist.voice).catch((err) => {
            console.warn('[Telegram/TTS] Voice response failed (non-critical):', err)
        })
    } catch (error) {
        console.error('[Telegram/SpecialistChat] Specialist voice message error:', error)
        await sendMessage({
            chat_id: chatId,
            text: `❌ Something went wrong processing your voice message. Try again or type your message.`,
        })
    }

    return true
}

/**
 * Generates a TTS audio response and sends it as a voice message.
 * Uses OpenAI TTS with the specialist's configured voice.
 *
 * @description Only generates TTS for shorter responses (< 2000 chars)
 * since longer responses are better consumed as text. Strips markdown
 * for cleaner speech output. Non-critical — text response is already sent.
 *
 * @param chatId - Telegram chat ID
 * @param text - Text to convert to speech
 * @param voiceId - OpenAI TTS voice ID
 */
async function generateAndSendTTS(
    chatId: number,
    text: string,
    voiceId: string,
): Promise<void> {
    // Only generate TTS for shorter responses (< 2000 chars)
    // Longer responses are better read as text
    if (text.length > 2000) return

    // Strip markdown for cleaner TTS
    const cleanText = text
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`(.+?)`/g, '$1')
        .replace(/#{1,3}\s+/g, '')
        .replace(/\[(.+?)\]\(.+?\)/g, '$1')
        .replace(/<!--[\s\S]*?-->/g, '')
        .trim()

    if (!cleanText) return

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'tts-1',
            input: cleanText.slice(0, 4096), // TTS input limit
            voice: voiceId,
            response_format: 'opus', // Best for Telegram voice messages
        }),
    })

    if (!response.ok) {
        console.warn('[Telegram/TTS] Failed to generate speech:', response.status)
        return
    }

    const ttsBuffer = await response.arrayBuffer()
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) return

    // Send as voice message via Telegram API
    const formData = new FormData()
    formData.append('chat_id', String(chatId))
    formData.append('voice', new Blob([ttsBuffer], { type: 'audio/ogg' }), 'response.ogg')

    await fetch(`https://api.telegram.org/bot${botToken}/sendVoice`, {
        method: 'POST',
        body: formData,
    })
}

// ─── Utilities ──────────────────────────────────────────────────────

/**
 * Splits a long message into chunks that fit Telegram's 4096 char limit.
 * Tries to split at paragraph breaks, then line breaks, then word boundaries.
 *
 * @param text - The text to split
 * @param maxLength - Maximum chunk length (default 4000, leaving buffer for Telegram's 4096 limit)
 * @returns Array of text chunks
 */
function splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text]

    const chunks: string[] = []
    let remaining = text

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining)
            break
        }

        // Find a good split point (paragraph break, then sentence, then word)
        let splitAt = remaining.lastIndexOf('\n\n', maxLength)
        if (splitAt < maxLength * 0.5) splitAt = remaining.lastIndexOf('\n', maxLength)
        if (splitAt < maxLength * 0.5) splitAt = remaining.lastIndexOf(' ', maxLength)
        if (splitAt < maxLength * 0.5) splitAt = maxLength

        chunks.push(remaining.slice(0, splitAt))
        remaining = remaining.slice(splitAt).trimStart()
    }

    return chunks
}
