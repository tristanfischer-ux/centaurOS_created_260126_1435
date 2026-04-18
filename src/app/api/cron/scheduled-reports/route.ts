/**
 * Cron Job: Scheduled Reports
 *
 * @description Hourly scan for `scheduled_reports` rows where enabled=true AND
 * next_run_at <= now(). For each due row: generate the report via
 * generateReportForSchedule (service-role core, bypasses withAIGate since the
 * founder already authorised the schedule), email via Resend to the recipients
 * in the schedule, log the run, and advance next_run_at so the row drops out
 * of the due queue until its next beat.
 *
 * @status Phase 1.2D — dispatch is LIVE. Previously (1.2C) this cron logged
 *         status='skipped' with error='pending_dispatch' because generateReport
 *         required user cookies. 1.2D shipped generateReportForSchedule +
 *         sendReportEmailFromCron to close that gap.
 *
 * @security Requires CRON_SECRET Bearer token (verifyCronSecret). Uses the
 *           admin (service-role) client so the cross-foundry scan bypasses
 *           RLS. Matches the pattern in knowledge-decay and other cron routes.
 *
 * @related
 * - Migration (scheduled_reports): supabase/migrations/20260418200000_scheduled_reports.sql
 * - Migration (scheduled_report_runs): supabase/migrations/20260419000000_scheduled_report_runs.sql
 * - Action: src/actions/scheduled-reports.ts (computeNextRunAt — reused here)
 * - Generator: src/actions/report-generator.ts (generateReportForSchedule)
 * - Email: src/actions/report-email.ts (sendReportEmailFromCron)
 * - Vercel cron entry: vercel.json "/api/cron/scheduled-reports" hourly
 */

import { NextRequest, NextResponse } from 'next/server'
import { getClientIP, rateLimit } from '@/lib/security/rate-limit'
import { verifyCronSecret } from '@/lib/security/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeNextRunAt } from '@/lib/scheduled-reports/frequency'
import { generateReportForSchedule } from '@/actions/report-generator'
import { sendReportEmailFromCron } from '@/actions/report-email'
import type {
  ReportSectionType,
  ReportTemplateId,
  ReportTone,
  ReportDetailLevel,
} from '@/lib/reports/report-document-types'

interface DueRow {
  id: string
  foundry_id: string
  template_id: string
  frequency: 'weekly' | 'monthly'
  day_of_week: number | null
  day_of_month: number | null
  recipients: string[]
  config_json: {
    sections?: ReportSectionType[]
    tone?: ReportTone
    detailLevel?: ReportDetailLevel
  } | null
}

const VALID_TEMPLATE_IDS = new Set<ReportTemplateId>([
  'weekly-update', 'board-pack', 'custom',
  'strategic-briefing', 'skill-document', 'workshop-report',
])

/**
 * Date range the report should cover given the row's frequency.
 * Weekly → previous 7 days. Monthly → previous calendar month.
 */
function rangeForFrequency(frequency: 'weekly' | 'monthly', now: Date): { start: string; end: string } {
  const end = new Date(now)
  if (frequency === 'weekly') {
    const start = new Date(end)
    start.setUTCDate(start.getUTCDate() - 7)
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
  }
  // monthly: first → last day of previous month
  const lastMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1))
  const endLastMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0))
  return {
    start: lastMonth.toISOString().slice(0, 10),
    end: endLastMonth.toISOString().slice(0, 10),
  }
}

const DEFAULT_SECTIONS: ReportSectionType[] = [
  'cover',
  'executive-summary',
  'key-metrics',
  'objectives-progress',
  'team-activity',
  'blockers-risks',
  'week-ahead',
]

export async function GET(req: NextRequest): Promise<NextResponse> {
  // 1. Rate limit
  const ip = getClientIP(req.headers)
  const ipLimit = await rateLimit('webhook', `cron-scheduled-reports:${ip}`)
  if (!ipLimit.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  // 2. Auth
  const authFailure = verifyCronSecret(req)
  if (authFailure) return authFailure

  const admin = createAdminClient()
  const now = new Date()
  const nowIso = now.toISOString()
  const oneHourAhead = new Date(now.getTime() + 60 * 60 * 1000).toISOString()

  try {
    // 3. Find due rows (service-role bypasses RLS → cross-foundry scan)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: due, error: dueErr } = await (admin as any)
      .from('scheduled_reports')
      .select('id, foundry_id, template_id, frequency, day_of_week, day_of_month, recipients, config_json')
      .eq('enabled', true)
      .lte('next_run_at', nowIso)
      .limit(100)

    if (dueErr) {
      console.error('[cron:scheduled-reports] due-rows query failed:', dueErr)
      return NextResponse.json({ error: 'Could not read schedules', details: dueErr.message }, { status: 500 })
    }

    const dueRows: DueRow[] = (due ?? []) as DueRow[]
    if (dueRows.length === 0) {
      return NextResponse.json({ ok: true, due: 0, skipped: 0, success: 0, failed: 0 })
    }

    let success = 0
    let failed = 0

    for (const row of dueRows) {
      const recipients = (row.recipients ?? []).filter(r => r && r.trim().length > 0)
      const runRowBase = {
        schedule_id: row.id,
        foundry_id: row.foundry_id,
        template_id: row.template_id,
        run_at: nowIso,
        recipients_count: recipients.length,
      }

      try {
        if (recipients.length === 0) {
          throw new Error('No recipients on schedule — cannot dispatch')
        }

        // FLOW: compose the GenerateReportRequest from the stored config_json.
        // Falls back to sensible defaults if the schedule was created before
        // a field existed (e.g. legacy rows without sections/tone/detailLevel).
        if (!VALID_TEMPLATE_IDS.has(row.template_id as ReportTemplateId)) {
          throw new Error(`Unknown template_id '${row.template_id}' on schedule`)
        }
        const templateId = row.template_id as ReportTemplateId
        const sections = (row.config_json?.sections && row.config_json.sections.length > 0)
          ? row.config_json.sections
          : DEFAULT_SECTIONS
        const tone: ReportTone = row.config_json?.tone ?? 'internal'
        const detailLevel: ReportDetailLevel = row.config_json?.detailLevel ?? 'standard'
        const dateRange = rangeForFrequency(row.frequency, now)

        // Generate
        const genResult = await generateReportForSchedule(row.foundry_id, {
          templateId,
          sections,
          dateRange,
          tone,
          detailLevel,
        })
        if (!genResult.success || !genResult.document) {
          throw new Error(genResult.error ?? 'Report generation returned no document')
        }

        // Send
        const emailResult = await sendReportEmailFromCron(recipients, genResult.document)
        if (!emailResult.success) {
          throw new Error(emailResult.error ?? 'Email send failed')
        }

        // Advance schedule
        const nextRun = computeNextRunAt(
          row.frequency,
          row.frequency === 'weekly' ? (row.day_of_week ?? undefined) : undefined,
          row.frequency === 'monthly' ? (row.day_of_month ?? undefined) : undefined,
          now,
        )

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: logErr } = await (admin as any)
          .from('scheduled_report_runs')
          .insert({
            ...runRowBase,
            status: 'success' as const,
            error: null,
          })
        if (logErr) console.error('[cron:scheduled-reports] run-log insert failed:', logErr)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateErr } = await (admin as any)
          .from('scheduled_reports')
          .update({
            last_run_at: nowIso,
            next_run_at: nextRun.toISOString(),
            updated_at: nowIso,
          })
          .eq('id', row.id)
        if (updateErr) throw updateErr

        success++
      } catch (err) {
        failed++
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('[cron:scheduled-reports] failure on schedule', row.id, errMsg)

        // Bump next_run_at +1h so cron retries, but don't get into a hot loop.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any)
          .from('scheduled_reports')
          .update({ next_run_at: oneHourAhead, updated_at: nowIso })
          .eq('id', row.id)

        // Best-effort run-log for the failure (separate from the +1h bump above).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any)
          .from('scheduled_report_runs')
          .insert({
            ...runRowBase,
            status: 'failed' as const,
            error: errMsg.slice(0, 500),
          })
          .then(() => { /* ignore logging errors */ })
          .catch((logInsertErr: unknown) => {
            console.error('[cron:scheduled-reports] failure-log insert failed:', logInsertErr)
          })
      }
    }

    return NextResponse.json({
      ok: true,
      due: dueRows.length,
      success,
      failed,
      note: "Phase 1.2D: cron generates reports and dispatches via Resend. Schedules advance after each run.",
    })
  } catch (err) {
    console.error('[cron:scheduled-reports] unexpected error:', err)
    return NextResponse.json(
      { error: 'Unexpected error', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}
