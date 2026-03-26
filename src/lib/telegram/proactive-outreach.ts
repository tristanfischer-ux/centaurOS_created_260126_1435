/**
 * @file proactive-outreach.ts
 *
 * @description Handles proactive specialist outreach via Telegram.
 * Specialists can reach out to users when they have important insights,
 * morning check-ins, or end-of-day reflections.
 *
 * Rate limited to 5 proactive messages per user per day to avoid
 * notification fatigue. All outreach is logged for analytics.
 *
 * @security Uses admin client for cross-user queries. Rate limiting
 * prevents abuse. Only verified Telegram links are eligible.
 *
 * @related
 * - Sweep orchestrator: src/lib/agents/sweep-orchestrator.ts
 * - Notification bridge: src/lib/telegram/notification-bridge.ts
 * - Bot: src/lib/telegram/bot.ts
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { sendMessage, escapeHtml } from './bot'
import { getSpecialistById } from '@/lib/agents/specialists-config'
import type { SpecialistId } from '@/lib/agents/specialists-config'

// ─── Constants ──────────────────────────────────────────────────────

/** Maximum proactive messages per user per 24-hour window */
const MAX_DAILY_OUTREACH = 5

// ─── Types ──────────────────────────────────────────────────────────

export type OutreachType =
    | 'urgent_insight'
    | 'morning_checkin'
    | 'evening_reflection'
    | 'nudge'
    | 'weekly_summary'

// ─── Morning Check-in ───────────────────────────────────────────────

/**
 * Sends a personalized morning check-in from the Chief of Staff.
 * Called by the daily briefing cron job.
 *
 * @param userId - The user's ID
 * @param chatId - Telegram chat ID
 * @param focusItems - Top 3 focus items for the day
 * @param userName - The user's first name
 */
export async function sendMorningCheckin(
    userId: string,
    chatId: string,
    focusItems: string[],
    userName: string,
): Promise<void> {
    const specialist = getSpecialistById('chief-of-staff')!

    let message = `☀️ <b>Good morning, ${escapeHtml(userName)}!</b>\n\n`
    message += `<b>${escapeHtml(specialist.name)} here.</b> Here's what I think you should focus on today:\n\n`

    focusItems.forEach((item, index) => {
        message += `${index + 1}. ${escapeHtml(item)}\n`
    })

    message += `\n<i>Reply to discuss any of these, or /chat cal for a deeper conversation.</i>`

    await sendMessage({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
    })

    // AUDIT: Log outreach for rate limiting and analytics
    await logOutreach(userId, 'chief-of-staff', 'morning_checkin')
}

/**
 * Sends an end-of-day reflection from the Chief of Staff.
 *
 * @param userId - The user's ID
 * @param chatId - Telegram chat ID
 * @param completedCount - Tasks completed today
 * @param objectivesMoved - Objectives that progressed
 * @param reflection - A thought to consider overnight
 * @param userName - The user's first name
 */
export async function sendEveningReflection(
    userId: string,
    chatId: string,
    completedCount: number,
    objectivesMoved: number,
    reflection: string,
    userName: string,
): Promise<void> {
    const specialist = getSpecialistById('chief-of-staff')!

    let message = `🌙 <b>End of day, ${escapeHtml(userName)}</b>\n\n`
    message += `<b>${escapeHtml(specialist.name)} here</b> with your daily wrap-up:\n\n`

    if (completedCount > 0 || objectivesMoved > 0) {
        message += `📊 <b>Today's Progress:</b>\n`
        if (completedCount > 0) message += `  ✅ ${completedCount} task${completedCount !== 1 ? 's' : ''} completed\n`
        if (objectivesMoved > 0) message += `  🎯 ${objectivesMoved} objective${objectivesMoved !== 1 ? 's' : ''} moved forward\n`
        message += '\n'
    }

    if (reflection) {
        message += `💭 <b>Something to think about:</b>\n${escapeHtml(reflection)}\n\n`
    }

    message += `<i>Rest well. Tomorrow's a new day.</i>`

    await sendMessage({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
    })

    // AUDIT: Log outreach for rate limiting and analytics
    await logOutreach(userId, 'chief-of-staff', 'evening_reflection')
}

/**
 * Sends an urgent insight from a specialist via Telegram.
 * Called when a sweep detects something critical.
 *
 * @param userId - The user's ID
 * @param chatId - Telegram chat ID
 * @param specialistId - The specialist sending the insight
 * @param insight - The insight title and summary
 */
export async function sendUrgentInsight(
    userId: string,
    chatId: string,
    specialistId: SpecialistId,
    insight: { title: string; summary: string },
): Promise<void> {
    const specialist = getSpecialistById(specialistId)
    if (!specialist) return

    let message = `🔔 <b>${escapeHtml(specialist.name)} (${escapeHtml(specialist.title)})</b>\n\n`
    message += `${escapeHtml(insight.summary)}\n\n`
    message += `<i>Reply to discuss, or /chat ${escapeHtml(specialist.name.toLowerCase())} for a full conversation.</i>`

    await sendMessage({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
    })

    // AUDIT: Log outreach for rate limiting and analytics
    await logOutreach(userId, specialistId, 'urgent_insight')
}

/**
 * Sends a contextual nudge (e.g., "You haven't talked to Harper in 2 weeks").
 *
 * @param userId - The user's ID
 * @param chatId - Telegram chat ID
 * @param specialistId - The specialist to nudge about
 * @param nudgeMessage - The nudge message
 */
export async function sendNudge(
    userId: string,
    chatId: string,
    specialistId: SpecialistId,
    nudgeMessage: string,
): Promise<void> {
    const specialist = getSpecialistById(specialistId)
    if (!specialist) return

    const message = `💡 <b>Quick thought:</b> ${escapeHtml(nudgeMessage)}\n\n<i>/chat ${escapeHtml(specialist.name.toLowerCase())} to connect</i>`

    await sendMessage({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
    })

    // AUDIT: Log outreach for rate limiting and analytics
    await logOutreach(userId, specialistId, 'nudge')
}

/**
 * Sends a weekly domain summary from a specialist.
 *
 * @param userId - The user's ID
 * @param chatId - Telegram chat ID
 * @param specialistId - The specialist sending the summary
 * @param summary - The weekly summary text
 */
export async function sendWeeklySummary(
    userId: string,
    chatId: string,
    specialistId: SpecialistId,
    summary: string,
): Promise<void> {
    const specialist = getSpecialistById(specialistId)
    if (!specialist) return

    let message = `📊 <b>Weekly Update from ${escapeHtml(specialist.name)} (${escapeHtml(specialist.title)})</b>\n\n`
    message += escapeHtml(summary)
    message += `\n\n<i>/chat ${escapeHtml(specialist.name.toLowerCase())} to discuss</i>`

    await sendMessage({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
    })

    // AUDIT: Log outreach for rate limiting and analytics
    await logOutreach(userId, specialistId, 'weekly_summary')
}

// ─── Outreach Logging ───────────────────────────────────────────────

/**
 * Logs an outreach event for rate limiting and analytics.
 *
 * @description Inserts a row into telegram_outreach_log. This table
 * is used both for rate limiting (max 5/day) and for analytics on
 * which outreach types drive engagement.
 *
 * @param userId - The user who received the outreach
 * @param specialistId - The specialist who sent it
 * @param type - The type of outreach
 */
async function logOutreach(
    userId: string,
    specialistId: string,
    type: OutreachType,
): Promise<void> {
    const supabase = createAdminClient()

    try {
        await supabase.from('telegram_outreach_log').insert({
            user_id: userId,
            specialist_id: specialistId,
            outreach_type: type,
        })
    } catch (error) {
        // Non-critical — don't fail the outreach over a logging error
        console.error('[proactive-outreach] Failed to log outreach:', error)
    }
}

/**
 * Checks if outreach is allowed (rate limiting).
 *
 * @description Enforces a maximum of MAX_DAILY_OUTREACH proactive
 * messages per user per 24-hour window to prevent notification fatigue.
 *
 * @param userId - The user's ID
 * @returns Whether outreach is allowed
 */
export async function isOutreachAllowed(userId: string): Promise<boolean> {
    const supabase = createAdminClient()

    const { count } = await supabase
        .from('telegram_outreach_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    return (count ?? 0) < MAX_DAILY_OUTREACH
}

/**
 * Gets all Telegram-linked users who have outreach enabled.
 *
 * @description Queries messaging_links for verified Telegram connections
 * and joins with profiles to get foundry context. Only returns users
 * with a valid foundry ID (needed for specialist context).
 *
 * @returns Array of user IDs, chat IDs, foundry IDs, and names
 */
export async function getOutreachEligibleUsers(): Promise<Array<{
    userId: string
    chatId: string
    foundryId: string
    userName: string
}>> {
    const supabase = createAdminClient()

    const { data } = await supabase
        .from('messaging_links')
        .select(`
            profile_id,
            platform_user_id,
            profiles!inner(full_name, foundry_id, active_foundry_id)
        `)
        .eq('platform', 'telegram')
        .not('verified_at', 'is', null)
        .not('platform_user_id', 'is', null)

    if (!data) return []

    return data
        .filter(row => row.platform_user_id)
        .map(row => {
            const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
            return {
                userId: row.profile_id,
                chatId: row.platform_user_id!,
                foundryId: (profile as { active_foundry_id?: string; foundry_id?: string })?.active_foundry_id
                    ?? (profile as { foundry_id?: string })?.foundry_id ?? '',
                userName: (profile as { full_name?: string })?.full_name ?? 'there',
            }
        })
        .filter(u => u.foundryId)
}
