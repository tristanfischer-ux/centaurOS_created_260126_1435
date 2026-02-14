/**
 * @file sweep-notifications.ts
 *
 * @description Notification dispatch for Always-On Agent Intelligence insights.
 * Routes notifications based on urgency level and foundry preferences:
 *
 * - Critical: Telegram push + in-app notification
 * - Important: In-app notification (optional Telegram)
 * - Informational: In-app only (included in weekly digest)
 *
 * @security Uses admin client for cross-user notification delivery.
 * Only called from the sweep orchestrator (cron context).
 *
 * @dependencies
 * - Telegram notification bridge
 * - foundry_agent_preferences table
 * - profiles table (for user lookup)
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { pushNotificationToTelegram } from '@/lib/telegram/notification-bridge'
import { SPECIALISTS } from '@/app/(platform)/agents/specialists-data'
import type { AgentInsight } from '@/actions/agent-insights'

// ─── Types ──────────────────────────────────────────────────────────

interface NotificationPreferences {
  notify_critical_telegram: boolean
  notify_critical_in_app: boolean
  notify_important_telegram: boolean
  notify_important_in_app: boolean
  notify_digest_telegram: boolean
}

// ─── Notification Dispatch ──────────────────────────────────────────

/**
 * Dispatches notifications for newly generated insights.
 *
 * @description Routes each insight to the appropriate notification
 * channels based on urgency and foundry preferences. Called after
 * a sweep run completes and insights are stored.
 *
 * @param foundryId - The foundry the insights belong to
 * @param insights - Array of newly created insights to notify about
 *
 * @audit Logs notification delivery to console for debugging
 */
export async function dispatchInsightNotifications(
  foundryId: string,
  insights: AgentInsight[],
): Promise<void> {
  if (insights.length === 0) return

  const supabase = createAdminClient()

  try {
    // 1. Load foundry preferences
    const { data: prefs } = await supabase
      .from('foundry_agent_preferences')
      .select('notify_critical_telegram, notify_critical_in_app, notify_important_telegram, notify_important_in_app, notify_digest_telegram')
      .eq('foundry_id', foundryId)
      .single()

    const preferences: NotificationPreferences = {
      notify_critical_telegram: prefs?.notify_critical_telegram ?? true,
      notify_critical_in_app: prefs?.notify_critical_in_app ?? true,
      notify_important_telegram: prefs?.notify_important_telegram ?? false,
      notify_important_in_app: prefs?.notify_important_in_app ?? true,
      notify_digest_telegram: prefs?.notify_digest_telegram ?? true,
    }

    // 2. Get foundry members to notify
    const { data: members } = await supabase
      .from('profiles')
      .select('id, role')
      .or(`foundry_id.eq.${foundryId},active_foundry_id.eq.${foundryId}`)

    if (!members || members.length === 0) return

    // Only notify Founders and Executives (not Apprentices)
    const notifyMembers = members.filter(
      m => m.role === 'Founder' || m.role === 'Executive'
    )

    // 3. Collect all notification work and run in parallel
    const tasks: Promise<unknown>[] = []

    for (const insight of insights) {
      const specialist = SPECIALISTS.find(s => s.id === insight.specialist_id)
      const specialistName = specialist?.name ?? 'Specialist'

      const shouldTelegram =
        (insight.urgency === 'critical' && preferences.notify_critical_telegram) ||
        (insight.urgency === 'important' && preferences.notify_important_telegram)

      const shouldInApp =
        (insight.urgency === 'critical' && preferences.notify_critical_in_app) ||
        (insight.urgency === 'important' && preferences.notify_important_in_app)

      if (shouldInApp) {
        for (const member of notifyMembers) {
          tasks.push(
            supabase
              .from('notifications')
              .insert({
                user_id: member.id,
                type: `agent_insight_${insight.urgency}`,
                title: `${specialistName}: ${insight.title}`,
                message: insight.body.slice(0, 200),
                link: '/today',
                metadata: {
                  insight_id: insight.id,
                  specialist_id: insight.specialist_id,
                  urgency: insight.urgency,
                  insight_type: insight.insight_type,
                },
              })
              .then(() => {})
              .catch(() => {
                console.debug(`[SweepNotifications] In-app notification skipped for ${member.id}`)
              })
          )
        }
      }

      if (shouldTelegram) {
        const urgencyEmoji = insight.urgency === 'critical' ? '🔴' : '🟡'
        const telegramTitle = `${urgencyEmoji} ${specialistName}: ${insight.title}`

        for (const member of notifyMembers) {
          tasks.push(
            pushNotificationToTelegram({
              user_id: member.id,
              type: 'agent_insight',
              title: telegramTitle,
              message: insight.body.slice(0, 300),
              link: '/today',
              metadata: {
                insight_id: insight.id,
                specialist_id: insight.specialist_id,
                urgency: insight.urgency,
              },
            }).catch(err => {
              console.debug(`[SweepNotifications] Telegram push failed for ${member.id}:`, err)
            })
          )
        }
      }
    }

    await Promise.allSettled(tasks)

    console.info(
      `[SweepNotifications] Dispatched notifications for ${insights.length} insights ` +
      `to ${notifyMembers.length} members in foundry ${foundryId}`
    )
  } catch (error) {
    console.error('[SweepNotifications] Error dispatching notifications:', error)
  }
}

/**
 * Sends a weekly digest of all informational insights via Telegram.
 *
 * @description Aggregates the past week's informational insights into
 * a single digest message. Called by a weekly cron job.
 *
 * @param foundryId - The foundry to send the digest for
 */
export async function sendWeeklyInsightDigest(foundryId: string): Promise<void> {
  const supabase = createAdminClient()

  try {
    // Get preferences
    const { data: prefs } = await supabase
      .from('foundry_agent_preferences')
      .select('notify_digest_telegram')
      .eq('foundry_id', foundryId)
      .single()

    if (prefs?.notify_digest_telegram === false) return

    // Get this week's insights
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: insights } = await supabase
      .from('agent_insights')
      .select('specialist_id, insight_type, urgency, title, acted_on')
      .eq('foundry_id', foundryId)
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false })

    if (!insights || insights.length === 0) return

    // Build digest
    const criticalCount = insights.filter(i => i.urgency === 'critical').length
    const importantCount = insights.filter(i => i.urgency === 'important').length
    const actedOnCount = insights.filter(i => i.acted_on).length

    const digestLines = [
      `📊 Weekly Intelligence Digest`,
      ``,
      `${insights.length} insights this week:`,
      criticalCount > 0 ? `🔴 ${criticalCount} critical` : null,
      importantCount > 0 ? `🟡 ${importantCount} important` : null,
      `ℹ️ ${insights.length - criticalCount - importantCount} informational`,
      `✅ ${actedOnCount} acted on`,
      ``,
      `Top findings:`,
      ...insights.slice(0, 5).map(i => {
        const specialist = SPECIALISTS.find(s => s.id === i.specialist_id)
        return `• ${specialist?.name ?? 'Specialist'}: ${i.title}`
      }),
      ``,
      `View all → /today`,
    ].filter(Boolean)

    // Send to Founders/Executives
    const { data: members } = await supabase
      .from('profiles')
      .select('id, role')
      .or(`foundry_id.eq.${foundryId},active_foundry_id.eq.${foundryId}`)

    const notifyMembers = (members ?? []).filter(
      m => m.role === 'Founder' || m.role === 'Executive'
    )

    for (const member of notifyMembers) {
      await pushNotificationToTelegram({
        user_id: member.id,
        type: 'agent_insight_digest',
        title: 'Weekly Intelligence Digest',
        message: digestLines.join('\n'),
        link: '/today',
      })
    }
  } catch (error) {
    console.error('[SweepNotifications] Error sending weekly digest:', error)
  }
}
