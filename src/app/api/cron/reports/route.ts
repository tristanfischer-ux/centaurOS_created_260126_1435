/**
 * @file route.ts — Scheduled report delivery cron
 *
 * @description Vercel cron endpoint that delivers the latest report snapshot
 * to users who opted into automatic scheduled delivery. Runs on a schedule
 * (e.g. daily at midnight UTC) and checks which users are due for a report
 * based on their schedule_frequency and day-of-week/month settings.
 *
 * INTENT: Stakeholders (board members, investors, team leads) want to receive
 * periodic reports without anyone manually clicking "share". This cron
 * delivers the most recently generated report for each foundry, so the user
 * only needs to generate a report once — delivery happens automatically.
 *
 * DECISION: The cron delivers existing report snapshots rather than
 * re-generating reports. This avoids the complexity of AI generation without
 * an auth context and keeps the cron fast and cheap. Users must have at least
 * one manually-generated report for delivery to work.
 *
 * FLOW:
 * 1. Vercel Cron triggers GET /api/cron/reports
 * 2. This route queries report_preferences for schedule_enabled = true
 * 3. Filters to users whose day-of-week/month matches today
 * 4. For each: fetches latest report_snapshots row, composes email, sends via Resend
 * 5. Updates last_scheduled_at to prevent double-delivery
 *
 * @security Requires CRON_SECRET Bearer token. Uses service-role admin client
 *           to bypass RLS (no user auth context in cron jobs).
 *
 * @related
 * - supabase/migrations/20260220200000_report_schedule.sql — Schedule columns
 * - src/actions/report-email.ts — Email HTML composition (same design language)
 * - src/app/api/cron/reports/daily/route.ts — Separate daily pulse cron
 */

import { NextRequest, NextResponse } from 'next/server'

import { Resend } from 'resend'

import { verifyCronSecret } from '@/lib/security/cron-auth'
import { getClientIP, rateLimit } from '@/lib/security/rate-limit'
import { escapeHtml } from '@/lib/security/sanitize'
import { createAdminClient } from '@/lib/supabase/admin'

import type { ReportDocument } from '@/lib/reports/report-document-types'

export const dynamic = 'force-dynamic'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const FROM_ADDRESS =
  process.env.EMAIL_FROM_ADDRESS || 'ForgeOS <noreply@fractionalforge.app>'

const DOUBLE_RUN_WINDOW_MS = 20 * 60 * 60 * 1000 // 20 hours

// GOTCHA: Vercel Cron can fire the same job multiple times in rare cases
// (at-least-once delivery). The 20-hour window on last_scheduled_at
// prevents duplicate emails even when this happens.

interface ScheduleRow {
  profile_id: string
  schedule_frequency: string
  schedule_recipients: string[]
  schedule_template: string
  schedule_tone: string
  schedule_detail_level: string
  last_scheduled_at: string | null
  schedule_day_of_week: number
  schedule_day_of_month: number
}

/**
 * GET /api/cron/reports
 *
 * @description Delivers scheduled reports to opted-in users whose delivery
 * day matches today (UTC). Sends the most recent report snapshot for their
 * foundry via Resend email.
 *
 * @param req - Incoming cron request with Bearer CRON_SECRET
 * @returns JSON summary of sent/failed/skipped counts
 *
 * @security Requires CRON_SECRET bearer authentication
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIP(req.headers)
  const ipLimit = await rateLimit('webhook', `cron-reports:${ip}`)
  if (!ipLimit.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const authFailure = verifyCronSecret(req)
  if (authFailure) return authFailure

  // SECURITY: Service-role client is required for unattended cron execution.
  const supabase = createAdminClient()
  const today = new Date()
  const dayOfWeek = today.getUTCDay()
  const dayOfMonth = today.getUTCDate()

  let sent = 0
  let failed = 0
  let skipped = 0

  try {
    console.info('[Cron] Starting scheduled report delivery…')

    const { data: schedules, error } = await supabase
      .from('report_preferences')
      .select(
        'profile_id, schedule_frequency, schedule_recipients, schedule_template, schedule_tone, schedule_detail_level, last_scheduled_at, schedule_day_of_week, schedule_day_of_month'
      )
      .eq('schedule_enabled', true)
      .not('schedule_recipients', 'eq', '{}')

    if (error) {
      console.error('[Cron] Failed to query report_preferences:', {
        error: error.message,
        code: error.code,
      })
      return NextResponse.json(
        { error: 'Failed to query schedules' },
        { status: 500 }
      )
    }

    // DECISION: Filter in application code rather than SQL because Supabase
    // doesn't support OR conditions across different columns cleanly in a
    // single .or() when combined with the frequency-dependent column logic.
    const dueSchedules = (schedules as ScheduleRow[] | null ?? []).filter(
      (s) => {
        if (s.last_scheduled_at) {
          const lastRun = new Date(s.last_scheduled_at)
          if (today.getTime() - lastRun.getTime() < DOUBLE_RUN_WINDOW_MS) {
            return false
          }
        }

        if (s.schedule_frequency === 'weekly') {
          return s.schedule_day_of_week === dayOfWeek
        }
        if (s.schedule_frequency === 'monthly') {
          return s.schedule_day_of_month === dayOfMonth
        }
        return false
      }
    )

    console.info('[Cron] Schedules due today:', {
      total: schedules?.length ?? 0,
      due: dueSchedules.length,
      dayOfWeek,
      dayOfMonth,
    })

    for (const schedule of dueSchedules) {
      try {
        const result = await processSchedule(supabase, schedule)
        if (result === 'sent') sent++
        else if (result === 'skipped') skipped++
        else failed++
      } catch (err) {
        console.error('[Cron] Unhandled error processing schedule:', {
          profileId: schedule.profile_id,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
        failed++
      }
    }

    console.info('[Cron] Scheduled report delivery complete:', {
      sent,
      failed,
      skipped,
      totalDue: dueSchedules.length,
    })

    return NextResponse.json({
      success: true,
      sent,
      failed,
      skipped,
      totalDue: dueSchedules.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron] Fatal error in scheduled report delivery:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: 'Scheduled report delivery failed', sent, failed, skipped },
      { status: 500 }
    )
  }
}

// Allow POST for manual triggers from admin panel
export async function POST(req: NextRequest): Promise<NextResponse> {
  return GET(req)
}

// ========================
// Per-User Processing
// ========================

type ProcessResult = 'sent' | 'skipped' | 'failed'

// INTENT: Isolate per-user logic so a single user's failure doesn't abort
// the entire cron run. Each user is processed independently with its own
// error boundary (the try/catch in the caller).
async function processSchedule(
  supabase: ReturnType<typeof createAdminClient>,
  schedule: ScheduleRow
): Promise<ProcessResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id, full_name')
    .eq('id', schedule.profile_id)
    .single()

  if (!profile?.foundry_id) {
    console.warn('[Cron] No foundry for profile, skipping:', {
      profileId: schedule.profile_id,
    })
    return 'skipped'
  }

  const { data: snapshot } = await supabase
    .from('report_snapshots')
    .select('id, report_data')
    .eq('foundry_id', profile.foundry_id)
    .order('generated_at', { ascending: false })
    .limit(1)
    .single()

  if (!snapshot?.report_data) {
    console.info('[Cron] No report snapshot available, skipping:', {
      profileId: schedule.profile_id,
      foundryId: profile.foundry_id,
    })
    return 'skipped'
  }

  const document = snapshot.report_data as unknown as ReportDocument
  const recipients = schedule.schedule_recipients ?? []

  if (recipients.length === 0) {
    return 'skipped'
  }

  const subject = composeScheduledSubject(document)
  const html = composeScheduledEmailHtml(document)

  if (!resend) {
    console.info('[Cron] No RESEND_API_KEY — would send:', {
      to: recipients,
      subject,
    })
  } else {
    for (const recipient of recipients) {
      const { error: sendError } = await resend.emails.send({
        from: FROM_ADDRESS,
        to: [recipient],
        subject,
        html,
      })

      if (sendError) {
        console.error('[Cron] Email send failed:', {
          recipient,
          error: sendError.message,
        })
      }
    }
  }

  await supabase
    .from('report_preferences')
    .update({ last_scheduled_at: new Date().toISOString() })
    .eq('profile_id', schedule.profile_id)

  console.info('[Cron] Report delivered:', {
    profileId: schedule.profile_id,
    recipientCount: recipients.length,
    template: schedule.schedule_template,
  })

  return 'sent'
}

// ========================
// Email Composition
// ========================

// DECISION: Duplicate a minimal email composer here instead of importing from
// report-email.ts because that module is a 'use server' action requiring auth.
// The HTML structure mirrors the original for brand consistency.

function composeScheduledSubject(document: ReportDocument): string {
  const title = document.title || 'Report'
  const companyName = document.foundryName || 'ForgeOS'
  return `${companyName} — ${title} (Scheduled Delivery)`
}

function composeScheduledEmailHtml(document: ReportDocument): string {
  const companyName = escapeHtml(document.foundryName || 'ForgeOS')
  const reportTitle = escapeHtml(document.title || 'Report')
  const dateRange = document.dateRange
    ? `${formatDate(document.dateRange.start)} – ${formatDate(document.dateRange.end)}`
    : ''

  const summarySection = document.sections?.find(
    (s) => s.type === 'executive-summary'
  )
  const narrativeHtml = summarySection?.data &&
    'narrative' in summarySection.data
    ? `<tr>
        <td style="padding: 24px 32px 8px 32px;">
          <h2 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #1e293b; text-transform: uppercase; letter-spacing: 0.03em;">Executive Summary</h2>
          <p style="margin: 0; font-size: 15px; color: #334155; line-height: 1.6;">${escapeHtml(summarySection.data.narrative)}</p>
        </td>
      </tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${reportTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

          <!-- Orange accent bar -->
          <tr>
            <td style="height: 4px; background-color: #ff4500; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <p style="margin: 0 0 4px 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">${companyName}</p>
              <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #1e293b; line-height: 1.3;">${reportTitle}</h1>
              <p style="margin: 0; font-size: 14px; color: #64748b;">${escapeHtml(dateRange)}</p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0;" />
            </td>
          </tr>

          ${narrativeHtml}

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px 32px 32px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #94a3b8;">Scheduled delivery by <strong style="color: #64748b;">ForgeOS</strong></p>
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">Report generated ${escapeHtml(document.generatedAt ? new Date(document.generatedAt).toLocaleDateString('en-GB', { dateStyle: 'long' }) : '')}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}
