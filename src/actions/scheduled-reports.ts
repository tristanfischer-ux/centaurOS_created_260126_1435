'use server'

/**
 * @file scheduled-reports.ts — Server actions for recurring report delivery
 *
 * @description 1.2B of the Reports Schedule restore. The table shipped in
 * 1.2A (migration 20260418200000); the cron worker + email dispatch ship in
 * 1.2C. This file lets the UI persist + cancel + list schedules. Nothing
 * here sends email — rows just describe what *should* happen when the cron
 * next runs.
 *
 * @security Foundry-isolated via withAuth. RLS on public.scheduled_reports
 * (see migration 20260418200000) provides defence in depth.
 *
 * @related
 * - Migration: supabase/migrations/20260418200000_scheduled_reports.sql
 * - UI: src/app/(platform)/reports/page.tsx — Schedule dialog (1.2B wires Save here)
 * - Cron (1.2C): /api/cron/scheduled-reports (not yet shipped)
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { isValidUUID } from '@/lib/validations'
import { revalidatePath } from 'next/cache'

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

export type ScheduledReportFrequency = 'weekly' | 'monthly'

export interface ScheduledReportRow {
  id: string
  templateId: string
  configJson: Record<string, unknown>
  frequency: ScheduledReportFrequency
  dayOfWeek: number | null
  dayOfMonth: number | null
  recipients: string[]
  enabled: boolean
  lastRunAt: string | null
  nextRunAt: string
  createdAt: string
  updatedAt: string
}

export interface ScheduleReportDeliveryInput {
  templateId: string
  config?: Record<string, unknown>
  frequency: ScheduledReportFrequency
  /** Required when frequency='weekly'. 0=Sunday through 6=Saturday. */
  dayOfWeek?: number
  /** Required when frequency='monthly'. 1-31 (clamped to last real day of short months by next_run_at calc). */
  dayOfMonth?: number
  recipients: string[]
  enabled?: boolean
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

// Simple email sanity check — server-side defence, not a full RFC 5322 parser.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateRecipients(recipients: string[]): { ok: true; cleaned: string[] } | { ok: false; error: string } {
  if (!Array.isArray(recipients)) return { ok: false, error: 'Recipients must be an array' }
  const cleaned = recipients.map((r) => r.trim()).filter(Boolean)
  if (cleaned.length === 0) return { ok: false, error: 'At least one recipient email is required' }
  if (cleaned.length > 20) return { ok: false, error: 'At most 20 recipients per schedule' }
  const bad = cleaned.find((r) => !EMAIL_RE.test(r))
  if (bad) return { ok: false, error: `Not a valid email: ${bad}` }
  return { ok: true, cleaned }
}

// GOTCHA: next_run_at calc stays in UTC-only arithmetic to avoid DST flips.
// We anchor delivery to 09:00 UTC — a founder in London gets 9/10am depending
// on BST, a founder in SF gets 1/2am; configurable per-schedule delivery hour
// is a future upgrade (add a delivery_hour_utc column and thread it through).
const DELIVERY_HOUR_UTC = 9

function daysInMonth(year: number, monthZeroBased: number): number {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate()
}

export function computeNextRunAt(frequency: ScheduledReportFrequency, dayOfWeek: number | undefined, dayOfMonth: number | undefined, from: Date = new Date()): Date {
  const nowUtc = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), from.getUTCHours(), from.getUTCMinutes()))
  if (frequency === 'weekly') {
    const targetDow = dayOfWeek ?? 1
    // Today's DOW in UTC (0..6)
    const todayDow = nowUtc.getUTCDay()
    let daysAhead = (targetDow - todayDow + 7) % 7
    // If the target day is today but we've already passed delivery hour, push to next week.
    if (daysAhead === 0 && nowUtc.getUTCHours() >= DELIVERY_HOUR_UTC) daysAhead = 7
    // If daysAhead stayed 0 (target is today, before delivery hour), deliver today at 09:00 UTC.
    const next = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate() + daysAhead, DELIVERY_HOUR_UTC, 0, 0, 0))
    return next
  }
  // monthly
  const targetDom = dayOfMonth ?? 1
  let year = nowUtc.getUTCFullYear()
  let month = nowUtc.getUTCMonth()
  const clamp = (y: number, m: number, d: number) => Math.min(d, daysInMonth(y, m))
  let day = clamp(year, month, targetDom)
  // If we've already passed the target day-time this month, roll to next month.
  const thisMonthMs = Date.UTC(year, month, day, DELIVERY_HOUR_UTC, 0, 0, 0)
  if (thisMonthMs <= nowUtc.getTime()) {
    month += 1
    if (month > 11) { month = 0; year += 1 }
    day = clamp(year, month, targetDom)
  }
  return new Date(Date.UTC(year, month, day, DELIVERY_HOUR_UTC, 0, 0, 0))
}

// ────────────────────────────────────────────────────────────────
// Actions
// ────────────────────────────────────────────────────────────────

/**
 * Upsert a scheduled report delivery by (foundry_id, created_by, template_id, frequency).
 *
 * @description No DB-level unique constraint; we do a lookup + update-or-insert in app code
 * so the founder can only ever have one "weekly board pack" per template rather than
 * accidentally creating duplicates.
 */
export async function scheduleReportDelivery(
  input: ScheduleReportDeliveryInput,
): Promise<ActionResult<{ id: string; nextRunAt: string }>> {
  try {
    // Shape validation
    if (!input.templateId || typeof input.templateId !== 'string') {
      return { error: 'Template id is required' }
    }
    if (input.frequency !== 'weekly' && input.frequency !== 'monthly') {
      return { error: 'Frequency must be weekly or monthly' }
    }
    if (input.frequency === 'weekly') {
      if (input.dayOfWeek == null || input.dayOfWeek < 0 || input.dayOfWeek > 6) {
        return { error: 'Day of week must be 0–6 (Sunday=0) for weekly schedules' }
      }
    } else {
      if (input.dayOfMonth == null || input.dayOfMonth < 1 || input.dayOfMonth > 31) {
        return { error: 'Day of month must be 1–31 for monthly schedules' }
      }
    }
    const recipientsCheck = validateRecipients(input.recipients)
    if (!recipientsCheck.ok) return { error: recipientsCheck.error }

    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const nextRunAt = computeNextRunAt(
      input.frequency,
      input.frequency === 'weekly' ? input.dayOfWeek : undefined,
      input.frequency === 'monthly' ? input.dayOfMonth : undefined,
    )

    // Look up an existing schedule for (foundry, user, template, frequency).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: existingErr } = await (supabase as any)
      .from('scheduled_reports')
      .select('id')
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)
      .eq('template_id', input.templateId)
      .eq('frequency', input.frequency)
      .maybeSingle()

    if (existingErr) {
      console.error('[scheduled-reports] lookup failed:', existingErr)
      return { error: 'Could not read existing schedule' }
    }

    const payload = {
      foundry_id: foundryId,
      created_by: user.id,
      template_id: input.templateId,
      config_json: input.config ?? {},
      frequency: input.frequency,
      day_of_week: input.frequency === 'weekly' ? input.dayOfWeek : null,
      day_of_month: input.frequency === 'monthly' ? input.dayOfMonth : null,
      recipients: recipientsCheck.cleaned,
      enabled: input.enabled ?? true,
      next_run_at: nextRunAt.toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (existing?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row, error: updateErr } = await (supabase as any)
        .from('scheduled_reports')
        .update(payload)
        .eq('id', existing.id)
        .eq('foundry_id', foundryId)
        .select('id, next_run_at')
        .single()
      if (updateErr || !row) {
        console.error('[scheduled-reports] update failed:', updateErr)
        return { error: 'Could not save schedule' }
      }
      revalidatePath('/reports')
      return { data: { id: row.id as string, nextRunAt: row.next_run_at as string } }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error: insertErr } = await (supabase as any)
      .from('scheduled_reports')
      .insert(payload)
      .select('id, next_run_at')
      .single()
    if (insertErr || !row) {
      console.error('[scheduled-reports] insert failed:', insertErr)
      return { error: 'Could not create schedule' }
    }

    revalidatePath('/reports')
    return { data: { id: row.id as string, nextRunAt: row.next_run_at as string } }
  } catch (err) {
    console.error('[scheduled-reports] scheduleReportDelivery failed:', err)
    return { error: 'Schedule failed — check server logs' }
  }
}

/**
 * Soft-cancel: flips enabled=false. Keeps the row for history; cron skips disabled rows.
 */
export async function cancelScheduledReport(id: string): Promise<ActionResult<{ success: true }>> {
  try {
    if (!id || typeof id !== 'string' || !isValidUUID(id)) {
      return { error: 'Invalid schedule id' }
    }
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('scheduled_reports')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('foundry_id', foundryId)

    if (error) {
      console.error('[scheduled-reports] cancel failed:', error)
      return { error: 'Could not cancel schedule' }
    }

    revalidatePath('/reports')
    return { data: { success: true as const } }
  } catch (err) {
    console.error('[scheduled-reports] cancelScheduledReport failed:', err)
    return { error: 'Cancel failed — check server logs' }
  }
}

/**
 * List the current foundry's scheduled reports. Includes cancelled (enabled=false)
 * rows so the UI can show "paused" state rather than hiding them.
 */
export async function getScheduledReports(): Promise<ActionResult<ScheduledReportRow[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { error: 'No active foundry' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('scheduled_reports')
      .select('*')
      .eq('foundry_id', foundryId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[scheduled-reports] list failed:', error)
      return { error: 'Could not load schedules' }
    }

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: (data ?? []).map((row: any): ScheduledReportRow => ({
        id: row.id as string,
        templateId: row.template_id as string,
        configJson: (row.config_json ?? {}) as Record<string, unknown>,
        frequency: row.frequency as ScheduledReportFrequency,
        dayOfWeek: row.day_of_week as number | null,
        dayOfMonth: row.day_of_month as number | null,
        recipients: (row.recipients ?? []) as string[],
        enabled: row.enabled as boolean,
        lastRunAt: (row.last_run_at ?? null) as string | null,
        nextRunAt: row.next_run_at as string,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      })),
    }
  } catch (err) {
    console.error('[scheduled-reports] getScheduledReports failed:', err)
    return { error: 'Load failed — check server logs' }
  }
}
