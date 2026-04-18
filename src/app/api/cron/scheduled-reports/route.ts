/**
 * Cron Job: Scheduled Reports
 *
 * @description Hourly scan for `scheduled_reports` rows where enabled=true AND
 * next_run_at <= now(). Phase 1.2C infrastructure: for each due row the cron
 * logs a `scheduled_report_runs` entry + advances next_run_at so the row
 * stops showing up until its next scheduled beat.
 *
 * @status 1.2C ships DETECTION + LOGGING + SCHEDULE ADVANCE. It does NOT yet
 *         generate reports or send emails — the existing generateReport()
 *         runs through withAIGate → withAuth which requires user cookies,
 *         unavailable to a cron context. A future chunk (1.2D) will refactor
 *         generateReport to accept a service-role context so dispatch can
 *         wire in cleanly. Until then every run logs status='skipped' with
 *         error='pending_dispatch' — honest surface over fake success.
 *
 * @security Requires CRON_SECRET Bearer token (verifyCronSecret). Uses the
 *           admin (service-role) client so the cross-foundry scan bypasses
 *           RLS. Matches the pattern in knowledge-decay and other cron routes.
 *
 * @related
 * - Migration (scheduled_reports): supabase/migrations/20260418200000_scheduled_reports.sql
 * - Migration (scheduled_report_runs): supabase/migrations/20260419000000_scheduled_report_runs.sql
 * - Action: src/actions/scheduled-reports.ts (computeNextRunAt — reused here)
 * - Vercel cron entry: vercel.json "/api/cron/scheduled-reports" hourly
 */

import { NextRequest, NextResponse } from 'next/server'
import { getClientIP, rateLimit } from '@/lib/security/rate-limit'
import { verifyCronSecret } from '@/lib/security/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeNextRunAt } from '@/actions/scheduled-reports'

interface DueRow {
  id: string
  foundry_id: string
  template_id: string
  frequency: 'weekly' | 'monthly'
  day_of_week: number | null
  day_of_month: number | null
  recipients: string[]
}

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
      .select('id, foundry_id, template_id, frequency, day_of_week, day_of_month, recipients')
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

    let skipped = 0
    const success = 0
    let failed = 0

    for (const row of dueRows) {
      const runRow = {
        schedule_id: row.id,
        foundry_id: row.foundry_id,
        template_id: row.template_id,
        run_at: nowIso,
        status: 'skipped' as const,
        error: 'pending_dispatch: Phase 1.2D will wire report generation + email. Cron infra is live; next_run_at advanced normally.',
        recipients_count: row.recipients?.length ?? 0,
      }

      try {
        // INTENT: advance next_run_at so this row doesn't stay in the due queue.
        // Once 1.2D refactors generateReport for service-role context, replace
        // the 'skipped' path with generate + email, status='success'.
        const nextRun = computeNextRunAt(
          row.frequency,
          row.frequency === 'weekly' ? (row.day_of_week ?? undefined) : undefined,
          row.frequency === 'monthly' ? (row.day_of_month ?? undefined) : undefined,
          now,
        )

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: logErr } = await (admin as any)
          .from('scheduled_report_runs')
          .insert(runRow)
        if (logErr) throw logErr

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

        skipped++
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
            ...runRow,
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
      skipped,
      success,
      failed,
      note: "Phase 1.2C: cron detects due rows and advances schedules. Report generation + email wires in at 1.2D.",
    })
  } catch (err) {
    console.error('[cron:scheduled-reports] unexpected error:', err)
    return NextResponse.json(
      { error: 'Unexpected error', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}
