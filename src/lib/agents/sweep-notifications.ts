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

// ─── In-Character Notification Formatting ───────────────────────────

/**
 * Generates a notification that sounds like the specialist is reaching out
 * as a colleague, not as an automated system.
 *
 * @description Instead of "Sage: Market analysis complete", generates
 * "💬 Sage: Hey — I've been looking at your competitive landscape and
 * noticed something that changes the picture. Got 5 minutes?"
 *
 * Uses the specialist's tagline, tone, and signature style to create
 * notifications that feel personal and proactive.
 *
 * @param specialist - The specialist data (may be undefined if not found)
 * @param specialistName - Fallback name if specialist data not available
 * @param insight - The insight being notified about
 * @returns Formatted title and body for the notification
 */
function formatInCharacterNotification(
    specialist: (typeof SPECIALISTS)[number] | undefined,
    specialistName: string,
    insight: AgentInsight,
): { title: string; body: string } {
    if (!specialist) {
        return {
            title: `💬 ${specialistName}: ${insight.title}`,
            body: insight.body.slice(0, 200),
        }
    }

    // Generate an in-character opening based on urgency
    let opening: string
    switch (insight.urgency) {
        case "critical":
            opening = getCriticalOpening(specialist)
            break
        case "important":
            opening = getImportantOpening(specialist)
            break
        default:
            opening = getInformationalOpening(specialist)
    }

    // Build the notification body: in-character opening + insight summary
    const insightSummary = insight.body.length > 150
        ? insight.body.slice(0, 147) + "..."
        : insight.body

    return {
        title: `💬 ${specialist.name}: ${opening}`,
        body: insightSummary,
    }
}

/**
 * Critical urgency openers — each specialist has a unique "drop what you're doing" voice.
 */
function getCriticalOpening(specialist: (typeof SPECIALISTS)[number]): string {
    const openers: Record<string, string> = {
        strategist: "I need to flag something — this changes our competitive position.",
        cto: "Stop. There's a technical risk we need to address right now.",
        "vp-engineering": "We have a velocity blocker that's cascading. Let's talk.",
        "vp-manufacturing": "Production risk alert — this could affect our timeline.",
        "vp-supply-chain": "Supply chain issue detected. We need a backup plan today.",
        "product-lead": "The user data is telling us something we can't ignore.",
        "growth-marketer": "Our growth metrics just showed something unexpected.",
        "sales-lead": "Revenue risk — we need to address this before it hits pipeline.",
        "chief-of-staff": "I want to flag something that's falling through the cracks.",
        "finance-lead": "The numbers just told me something you need to hear.",
        "fundraising-advisor": "Investor landscape shift — this affects your raise timeline.",
        "hiring-team": "People situation that needs your attention today.",
        "legal-counsel": "Legal risk identified. This is time-sensitive.",
    }
    return openers[specialist.id] ?? "Something urgent came up — can we talk?"
}

/**
 * Important urgency openers — the "when you have a minute" voice.
 */
function getImportantOpening(specialist: (typeof SPECIALISTS)[number]): string {
    const openers: Record<string, string> = {
        strategist: "I've been thinking about our strategy — noticed something.",
        cto: "Found something in the technical landscape worth discussing.",
        "vp-engineering": "Saw a pattern in our build velocity. Worth a 5-min chat.",
        "vp-manufacturing": "Spotted something in our production pipeline.",
        "vp-supply-chain": "Quick heads up on a sourcing opportunity.",
        "product-lead": "User feedback pattern I want to walk you through.",
        "growth-marketer": "Marketing insight I think you'll find interesting.",
        "sales-lead": "Pipeline observation — think we have an opportunity here.",
        "chief-of-staff": "Something I noticed across the team this week.",
        "finance-lead": "Financial pattern worth discussing when you have time.",
        "fundraising-advisor": "Fundraising market update — relevant to us.",
        "hiring-team": "Team observation I want to share with you.",
        "legal-counsel": "Something legal I want to make sure we're ahead of.",
    }
    return openers[specialist.id] ?? "I noticed something worth discussing."
}

/**
 * Informational openers — the "FYI" voice.
 */
function getInformationalOpening(specialist: (typeof SPECIALISTS)[number]): string {
    const openers: Record<string, string> = {
        strategist: "Quick strategic note for your radar.",
        cto: "Technical update — no action needed, just awareness.",
        "chief-of-staff": "Weekly observation for your context.",
        "finance-lead": "Financial snapshot update.",
    }
    return openers[specialist.id] ?? "Quick update for your context."
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

      // Generate in-character notification message that feels like a colleague reaching out
      const inCharacterMessage = formatInCharacterNotification(
        specialist,
        specialistName,
        insight,
      )

      if (shouldInApp) {
        for (const member of notifyMembers) {
          tasks.push(
            (async () => {
              const { error } = await supabase
                .from('notifications')
                .insert({
                  user_id: member.id,
                  type: `agent_insight_${insight.urgency}`,
                  title: inCharacterMessage.title,
                  message: inCharacterMessage.body,
                  link: `/agents?specialist=${insight.specialist_id}`,
                  metadata: {
                    insight_id: insight.id,
                    specialist_id: insight.specialist_id,
                    urgency: insight.urgency,
                    insight_type: insight.insight_type,
                  },
                })

              if (error) {
                console.debug(`[SweepNotifications] In-app notification skipped for ${member.id}`)
              }
            })()
          )
        }
      }

      if (shouldTelegram) {
        const urgencyEmoji = insight.urgency === 'critical' ? '🔴' : '🟡'
        const telegramTitle = `${urgencyEmoji} ${inCharacterMessage.title}`

        for (const member of notifyMembers) {
          tasks.push(
            (async () => {
              try {
                await pushNotificationToTelegram({
                  user_id: member.id,
                  type: 'agent_insight',
                  title: telegramTitle,
                  message: inCharacterMessage.body,
                  link: `/agents?specialist=${insight.specialist_id}`,
                  metadata: {
                    insight_id: insight.id,
                    specialist_id: insight.specialist_id,
                    urgency: insight.urgency,
                  },
                })
              } catch (err) {
                console.debug(`[SweepNotifications] Telegram push failed for ${member.id}:`, err)
              }
            })()
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
