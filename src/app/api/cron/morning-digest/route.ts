/**
 * @file Morning Digest Cron — sends branded daily task digest emails.
 *
 * @description Runs at 08:00 Europe/London daily via Vercel Cron.
 * For each active user with tasks due today:
 *   1. Queries tasks via both `tasks.assignee_id` and `task_assignees` join
 *   2. Generates a brief motivational message from Cal (Chief of Staff) via Haiku
 *   3. Sends a branded HTML email via Resend
 *
 * Idempotency: uses a `morning_digest_log` table to track (profile_id, digest_date)
 * pairs, preventing duplicate sends if the cron fires twice.
 *
 * @security
 * - CRON_SECRET bearer authentication (timing-safe)
 * - Service-role admin client for cross-tenant queries
 * - Rate-limited to prevent abuse
 * - All user data escaped in email template
 *
 * @related
 * - src/lib/email/morning-digest-template.ts — HTML template
 * - src/lib/security/cron-auth.ts — Shared auth utility
 * - src/lib/supabase/admin.ts — Admin client
 * - vercel.json — Cron schedule definition
 */

import { NextResponse } from 'next/server'
import { Resend } from 'resend'

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronSecret } from '@/lib/security/cron-auth'
import { getClientIP, rateLimit } from '@/lib/security/rate-limit'
import { renderMorningDigestEmail, type DigestTask } from '@/lib/email/morning-digest-template'

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // seconds — generous for sequential LLM + email sends

// ─── Config ──────────────────────────────────────────────────────────────

const MAX_USERS_PER_RUN = 200
const MAX_TASKS_PER_USER = 20
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'https://fractionalforge.app'

// DECISION: Use Resend directly (same pattern as report-email.ts and onboarding-drip)
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS
  || 'ForgeOS <noreply@fractionalforge.app>'

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Get today's date in Europe/London timezone as YYYY-MM-DD string.
 *
 * INTENT: The digest is anchored to UK morning time. A task with end_date
 * "2026-04-12" should appear in the digest sent at 08:00 London time on
 * that date, regardless of the server's system clock timezone.
 */
function getTodayUK(): string {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(now) // Returns YYYY-MM-DD in en-CA locale
}

function getDisplayDate(): string {
  const now = new Date()
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)
}

/**
 * Generate a brief motivational message from Cal (Chief of Staff) via GPT-4.1-mini.
 *
 * DECISION: GPT-4.1-mini is fast and cheap. Perfect for a short motivational blurb.
 * Falls back to a static message if the API call fails to avoid blocking the entire
 * digest run.
 */
async function generateCalMessage(
  userName: string,
  taskCount: number,
  taskTitles: string[]
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return getStaticCalMessage(taskCount)
  }

  try {
    const taskContext = taskTitles.length > 0
      ? `Their tasks for today: ${taskTitles.slice(0, 5).join(', ')}${taskTitles.length > 5 ? ` and ${taskTitles.length - 5} more` : ''}.`
      : 'They have a clear day with no tasks due.'

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-4.1-mini',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `You are Cal, Chief of Staff at a hardware startup accelerator. Write a 1-2 sentence morning message for ${userName} to start their day. ${taskContext}

Rules:
- Be warm but professional. No cheese, no cliches, no exclamation marks.
- Reference their specific tasks if they have any.
- If they have no tasks, acknowledge the breathing room and suggest something productive.
- Keep it under 40 words. One thought, clearly expressed.
- Do NOT use greetings like "Good morning" — that's already in the email header.
- Do NOT use quotes, attributions, or sign-offs.`,
        }],
      }),
    })

    const data = await response.json()
    const text: string | null = data.choices?.[0]?.message?.content?.trim() ?? null

    if (text && text.length > 10 && text.length < 300) {
      return text
    }

    return getStaticCalMessage(taskCount)
  } catch (error) {
    console.warn('[MorningDigest] Cal message generation failed, using fallback:', {
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return getStaticCalMessage(taskCount)
  }
}

function getStaticCalMessage(taskCount: number): string {
  if (taskCount === 0) {
    return 'No tasks on the board today. A good day to step back, think strategically, and prepare for what comes next.'
  }
  if (taskCount === 1) {
    return 'One task in focus today. Single-tasking is underrated — give it your full attention and close it out.'
  }
  if (taskCount <= 3) {
    return `${taskCount} tasks on the board. A manageable load — aim to clear them all before lunch if you can.`
  }
  return `${taskCount} tasks today. Start with the highest-risk items and work down. Momentum builds from the first completed task.`
}

// ─── Types ───────────────────────────────────────────────────────────────

interface UserDigest {
  profileId: string
  email: string
  fullName: string
  foundryName: string
  tasks: DigestTask[]
}

// ─── Main Handler ────────────────────────────────────────────────────────

/**
 * GET /api/cron/morning-digest
 *
 * Generates and sends morning task digest emails to all active users
 * with tasks due today.
 *
 * @param request - Incoming cron request with Bearer CRON_SECRET
 * @returns Job execution summary with send counts
 *
 * @security Requires CRON_SECRET bearer authentication
 */
export async function GET(request: Request) {
  // Rate limit
  const ip = getClientIP(request.headers)
  const ipLimit = await rateLimit('webhook', `cron-morning-digest:${ip}`)
  if (!ipLimit.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  // Auth
  const authFailure = verifyCronSecret(request)
  if (authFailure) return authFailure

  const startTime = Date.now()
  const todayUK = getTodayUK()
  const dateDisplay = getDisplayDate()

  const stats = { sent: 0, skipped: 0, failed: 0, noTasks: 0 }

  try {
    const supabase = createAdminClient()

    // ──────────────────────────────────────────────────────────────────
    // Step 1: Ensure the digest log table exists (idempotent)
    // DECISION: We use a simple RPC call to check for prior sends rather
    // than creating a table on-the-fly. Instead, we query a lightweight
    // approach: store digest_date in activity_events.
    // ──────────────────────────────────────────────────────────────────

    // Step 2: Find all users who have tasks due today
    // Query tasks directly assigned (assignee_id) and via task_assignees
    const { data: directTasks, error: directError } = await supabase
      .from('tasks')
      .select(`
        id,
        title,
        status,
        risk_level,
        assignee_id,
        foundry_id,
        objectives!inner ( title )
      `)
      .eq('end_date', todayUK)
      .is('deleted_at', null)
      .neq('status', 'Completed')
      .neq('status', 'Rejected')
      .limit(1000)

    if (directError) {
      console.error('[MorningDigest] Failed to fetch tasks:', directError)
      return NextResponse.json({ error: 'Task query failed' }, { status: 500 })
    }

    // Also get assignees for the tasks we already found (via junction table)
    // DECISION: Query task_assignees by the task IDs we already have rather than
    // filtering through the join — avoids PostgREST embedded filter edge cases
    // with null checks on joined tables.
    const taskIds = (directTasks || []).map((t) => t.id)
    const { data: assignedTasks, error: assignedError } = taskIds.length > 0
      ? await supabase
          .from('task_assignees')
          .select('profile_id, task_id')
          .in('task_id', taskIds)
          .limit(1000)
      : { data: [] as { profile_id: string; task_id: string }[], error: null }

    if (assignedError) {
      console.error('[MorningDigest] Failed to fetch assigned tasks:', assignedError)
      // Non-fatal — continue with direct tasks only
    }

    // ──────────────────────────────────────────────────────────────────
    // Step 3: Build per-user digest map
    // ──────────────────────────────────────────────────────────────────
    const userTaskMap = new Map<string, {
      foundryId: string
      tasks: Map<string, DigestTask> // keyed by task ID to deduplicate
    }>()

    // Add direct-assigned tasks
    for (const task of directTasks || []) {
      if (!task.assignee_id) continue

      const userId = task.assignee_id
      if (!userTaskMap.has(userId)) {
        userTaskMap.set(userId, {
          foundryId: task.foundry_id,
          tasks: new Map(),
        })
      }

      const objectives = task.objectives as { title: string } | { title: string }[] | null
      const objTitle = Array.isArray(objectives)
        ? objectives[0]?.title
        : objectives?.title

      userTaskMap.get(userId)!.tasks.set(task.id, {
        title: task.title,
        status: task.status || 'Pending',
        objectiveTitle: objTitle || undefined,
        riskLevel: task.risk_level || undefined,
      })
    }

    // Build a lookup from task ID to task data for junction-table matching
    const taskLookup = new Map<string, (typeof directTasks extends (infer T)[] | null ? NonNullable<T> : never)>()
    for (const task of directTasks || []) {
      taskLookup.set(task.id, task)
    }

    // Add junction-table-assigned tasks (profile_id -> task_id mapping)
    for (const row of assignedTasks || []) {
      const userId = row.profile_id
      const task = taskLookup.get(row.task_id)
      if (!task) continue

      if (!userTaskMap.has(userId)) {
        userTaskMap.set(userId, {
          foundryId: task.foundry_id,
          tasks: new Map(),
        })
      }

      const objectives = task.objectives as { title: string } | { title: string }[] | null
      const objTitle = Array.isArray(objectives)
        ? objectives[0]?.title
        : objectives?.title

      userTaskMap.get(userId)!.tasks.set(task.id, {
        title: task.title,
        status: task.status || 'Pending',
        objectiveTitle: objTitle || undefined,
        riskLevel: task.risk_level || undefined,
      })
    }

    if (userTaskMap.size === 0) {
      return NextResponse.json({
        message: 'No users with tasks due today',
        stats,
        date: todayUK,
        duration: `${Date.now() - startTime}ms`,
      })
    }

    // ──────────────────────────────────────────────────────────────────
    // Step 4: Fetch user profiles and foundry names
    // ──────────────────────────────────────────────────────────────────
    const userIds = Array.from(userTaskMap.keys()).slice(0, MAX_USERS_PER_RUN)

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, foundry_id, is_active')
      .in('id', userIds)
      .eq('is_active', true)

    if (profileError) {
      console.error('[MorningDigest] Failed to fetch profiles:', profileError)
      return NextResponse.json({ error: 'Profile query failed' }, { status: 500 })
    }

    // Get unique foundry IDs to fetch names
    const foundryIds = [...new Set((profiles || []).map((p) => p.foundry_id))]
    const { data: foundries } = await supabase
      .from('foundries')
      .select('id, name')
      .in('id', foundryIds)

    const foundryNameMap = new Map<string, string>()
    for (const f of foundries || []) {
      foundryNameMap.set(f.id, f.name)
    }

    // ──────────────────────────────────────────────────────────────────
    // Step 5: Check for already-sent digests today (idempotency)
    // Use activity_events to track sends
    // ──────────────────────────────────────────────────────────────────
    const { data: alreadySent } = await supabase
      .from('activity_events')
      .select('user_id')
      .eq('event_type', 'morning_digest_sent')
      .gte('created_at', `${todayUK}T00:00:00Z`)
      .lte('created_at', `${todayUK}T23:59:59Z`)
      .in('user_id', userIds)

    const alreadySentSet = new Set(
      (alreadySent || []).map((e) => e.user_id)
    )

    // ──────────────────────────────────────────────────────────────────
    // Step 6: Build digests and send emails
    // ──────────────────────────────────────────────────────────────────
    const digests: UserDigest[] = []

    for (const profile of profiles || []) {
      if (alreadySentSet.has(profile.id)) {
        stats.skipped++
        continue
      }

      const userData = userTaskMap.get(profile.id)
      if (!userData) continue

      const tasks = Array.from(userData.tasks.values()).slice(0, MAX_TASKS_PER_USER)
      if (tasks.length === 0) {
        stats.noTasks++
        continue
      }

      digests.push({
        profileId: profile.id,
        email: profile.email,
        fullName: profile.full_name || 'there',
        foundryName: foundryNameMap.get(profile.foundry_id) || 'Fractional Forge',
        tasks,
      })
    }

    // Process digests sequentially to avoid overwhelming Resend rate limits
    for (const digest of digests) {
      try {
        const firstName = digest.fullName.split(' ')[0] || digest.fullName

        // Generate Cal's message
        const calMessage = await generateCalMessage(
          firstName,
          digest.tasks.length,
          digest.tasks.map((t) => t.title)
        )

        // Render email HTML
        const html = renderMorningDigestEmail({
          userName: firstName,
          dateDisplay,
          tasks: digest.tasks,
          calMessage,
          dashboardUrl: `${APP_DOMAIN}/the-forge`,
          foundryName: digest.foundryName,
        })

        const subject = `Your day ahead — ${digest.tasks.length} task${digest.tasks.length === 1 ? '' : 's'} due today`

        // Send email
        if (resend) {
          const { error: sendError } = await resend.emails.send({
            from: FROM_ADDRESS,
            to: [digest.email],
            subject,
            html,
          })

          if (sendError) {
            console.error('[MorningDigest] Send failed:', {
              profileId: digest.profileId,
              error: sendError.message,
            })
            stats.failed++
            continue
          }
        } else {
          console.info('[MorningDigest] No RESEND_API_KEY — would send:', {
            to: digest.email,
            subject,
            taskCount: digest.tasks.length,
          })
        }

        // Record send in activity_events for idempotency
        await supabase.from('activity_events').insert({
          user_id: digest.profileId,
          foundry_id: userTaskMap.get(digest.profileId)!.foundryId,
          event_type: 'morning_digest_sent',
          event_data: {
            task_count: digest.tasks.length,
            date: todayUK,
          },
        })

        stats.sent++
      } catch (error) {
        console.error('[MorningDigest] Digest processing failed:', {
          profileId: digest.profileId,
          error: error instanceof Error ? error.message : 'Unknown',
        })
        stats.failed++
      }
    }

    const duration = Date.now() - startTime

    console.log(`[MorningDigest] Completed in ${duration}ms`, {
      ...stats,
      date: todayUK,
      totalUsers: userTaskMap.size,
    })

    return NextResponse.json({
      message: `Morning digest processed for ${todayUK}`,
      stats,
      date: todayUK,
      duration: `${duration}ms`,
    })
  } catch (error) {
    console.error('[MorningDigest] Fatal error:', error)
    return NextResponse.json(
      { error: 'Morning digest cron failed', stats },
      { status: 500 }
    )
  }
}
