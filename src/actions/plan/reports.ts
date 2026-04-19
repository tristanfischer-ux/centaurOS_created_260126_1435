'use server'

/**
 * @file src/actions/plan/reports.ts
 *
 * @description Server actions for the Plan Report composer (PLAN-SCHEMA §12, §18).
 *
 * V1 scope (locked per HANDOVER-plan.md Chunk C + PLAN-SCHEMA §17.7):
 *   • No real email send — sendReport persists a `reports_sent` row and that's it.
 *     sent_via defaults to ['link']; external_share_url tokenisation ships later.
 *   • No draft persistence — draftReport assembles markdown from live foundry
 *     data and returns it synchronously. sendReport is the only write path.
 *     (Alternative path in the brief: insert a reports_sent row with a draft
 *     flag. Rejected for V1 — the schema has no draft column and adding one is
 *     out of scope for this chunk.)
 *
 * Every mutating action mirrors the sibling goals.ts pattern:
 *   1. Zod input validation (schemas in ./types.ts)
 *   2. withAuth wrapper — provides {supabase, user, foundryId}
 *   3. plan_can() RPC permissions check against §16.1 matrix
 *   4. audit_log row on success (§15.2: `report_drafted`, `report_sent`)
 *   5. history_entries row (entry_type='update_sent') on send
 *
 * Reference: PLAN-SCHEMA §12 (reports_sent row), §15.2 (audit events),
 *            §16.1 (view_sent_reports / draft_report / send_report),
 *            §18 (action signatures).
 */

import { revalidatePath } from 'next/cache'

import { withAuth } from '@/lib/server-action-utils'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { logAudit } from '@/actions/audit'

import {
  draftReportInputSchema,
  sendReportInputSchema,
  type DraftReportInput,
  type SendReportInput,
  type PlanActionResult,
} from './types'

import type {
  ReportTarget,
  ReportsSentRow,
  StrategicGoalRow,
} from '@/types/plan'

// ──────────────────────────────────────────────────────────────────────────
// Internal helpers (module-local, not exported per "use server" rule)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Calls the plan_can() SQL helper via RPC. Returns true only on explicit
 * boolean true — any RPC error or null defaults to DENY.
 */
async function planCan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  foundryId: string,
  action: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('plan_can', {
    p_user_id: userId,
    p_foundry_id: foundryId,
    p_action: action,
  })
  if (error) {
    console.error('[plan/reports] plan_can RPC failed:', {
      action,
      error: error.message,
    })
    return false
  }
  return data === true
}

function defaultSubjectFor(target: ReportTarget): string {
  const when = new Date().toISOString().slice(0, 10)
  switch (target) {
    case 'weekly_team':
      return `Weekly team update · ${when}`
    case 'monthly_investor':
      return `Monthly investor update · ${when}`
    case 'quarterly_board':
      return `Quarterly board update · ${when}`
    case 'custom':
      return `Update · ${when}`
  }
}

/**
 * Assemble a starter markdown body from the foundry's current pinned goals
 * + this-week tasks + recent decisions. Deliberately concise — this is the
 * "Cal drafts the update" experience; the founder edits it in the composer.
 *
 * Copy rule (CLAUDE.md + HANDOVER §No AI Emphasis): specialists are named
 * by role, never "AI agents". We write "Cal drafted" not "AI drafted".
 */
function assembleDraftBody(params: {
  target: ReportTarget
  pinnedGoals: Array<Pick<StrategicGoalRow, 'title' | 'state' | 'quarter'>>
  thisWeekTaskTitles: string[]
  recentDecisionTitles: string[]
}): string {
  const { target, pinnedGoals, thisWeekTaskTitles, recentDecisionTitles } = params

  const targetLabel =
    target === 'weekly_team'
      ? 'this week'
      : target === 'monthly_investor'
        ? 'this month'
        : target === 'quarterly_board'
          ? 'this quarter'
          : 'since the last update'

  const lines: string[] = []
  lines.push(`## Progress ${targetLabel}`)
  if (pinnedGoals.length === 0) {
    lines.push('- _No Strategic Goals pinned yet — replace this line with what moved._')
  } else {
    for (const g of pinnedGoals) {
      lines.push(`- **${g.title}** (${g.state.replace(/_/g, ' ')})`)
    }
  }

  lines.push('')
  lines.push('## What we shipped')
  if (thisWeekTaskTitles.length === 0) {
    lines.push('- _Add the 2–3 most important tasks that closed._')
  } else {
    for (const t of thisWeekTaskTitles.slice(0, 8)) {
      lines.push(`- ${t}`)
    }
  }

  lines.push('')
  lines.push('## Decisions and direction')
  if (recentDecisionTitles.length === 0) {
    lines.push('- _What changed in thinking? What did we decide?_')
  } else {
    for (const d of recentDecisionTitles.slice(0, 5)) {
      lines.push(`- ${d}`)
    }
  }

  lines.push('')
  lines.push('## Asks')
  lines.push('- _Intros, hires, introductions — what do you need from the reader?_')

  return lines.join('\n')
}

// ──────────────────────────────────────────────────────────────────────────
// draftReport
// ──────────────────────────────────────────────────────────────────────────

/**
 * Assemble a starter markdown draft from live foundry data.
 *
 * V1 does NOT persist the draft — the composer edits the returned markdown
 * in local state and calls sendReport() when the founder hits Send.
 *
 * @permission draft_report
 * @audit action='report_drafted' · metadata.target
 */
export async function draftReport(
  target: ReportTarget,
  pullFromGoalIds?: string[],
): Promise<PlanActionResult<{ bodyMarkdown: string; subjectLine: string }>> {
  return withAuth<PlanActionResult<{ bodyMarkdown: string; subjectLine: string }>>(
    async ({ supabase, user, foundryId }) => {
      const parsed = draftReportInputSchema.safeParse({
        target,
        pullFromGoalIds,
      })
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
      }

      const allowed = await planCan(supabase, user.id, foundryId, 'draft_report')
      if (!allowed) return { error: 'Not permitted to draft reports' }

      // Plan tables aren't in the generated Database types yet — cast at the
      // query boundary (same pattern as /plan/page.tsx).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const untyped = supabase as any

      let goalQuery = untyped
        .from('strategic_goals')
        .select('title, state, quarter')
        .eq('foundry_id', foundryId)
        .is('deleted_at', null)

      if (parsed.data.pullFromGoalIds && parsed.data.pullFromGoalIds.length > 0) {
        goalQuery = goalQuery.in('id', parsed.data.pullFromGoalIds)
      } else {
        goalQuery = goalQuery.eq('is_pinned', true)
      }

      const [goalsRes, tasksRes, historyRes] = await Promise.all([
        goalQuery.order('pin_order', { ascending: true }).limit(5),
        untyped
          .from('tasks')
          .select('title, status')
          .eq('foundry_id', foundryId)
          .eq('horizon', 'this_week')
          .in('status', ['done', 'completed'])
          .limit(8),
        untyped
          .from('history_entries')
          .select('title, entry_type')
          .eq('foundry_id', foundryId)
          .in('entry_type', ['decision', 'goal_state_changed', 'pressure_test'])
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      const pinnedGoals =
        (goalsRes.data as Array<Pick<StrategicGoalRow, 'title' | 'state' | 'quarter'>> | null) ?? []
      const thisWeekTaskTitles =
        ((tasksRes.data as Array<{ title: string }> | null) ?? []).map((t) => t.title)
      const recentDecisionTitles =
        ((historyRes.data as Array<{ title: string }> | null) ?? []).map((h) => h.title)

      const bodyMarkdown = assembleDraftBody({
        target: parsed.data.target,
        pinnedGoals,
        thisWeekTaskTitles,
        recentDecisionTitles,
      })

      await logAudit({
        action: 'report_drafted' as never,
        entityType: 'reports_sent',
        entityId: null,
        userId: user.id,
        foundryId,
        metadata: {
          target: parsed.data.target,
          pulled_from_goal_ids: parsed.data.pullFromGoalIds ?? [],
          pinned_goal_count: pinnedGoals.length,
        },
      })

      return {
        success: true,
        data: {
          bodyMarkdown,
          subjectLine: defaultSubjectFor(parsed.data.target),
        },
      }
    },
  )
}

// ──────────────────────────────────────────────────────────────────────────
// sendReport
// ──────────────────────────────────────────────────────────────────────────

/**
 * Persist a reports_sent row, write a history_entries row, and emit audit.
 *
 * V1 does NOT dispatch email — sent_via defaults to ['link']; the row
 * represents "saved + shareable" until the Resend/SMTP wiring lands.
 * open_count + reply_count stay at 0 until webhooks are in place.
 *
 * @permission send_report
 * @audit action='report_sent' · metadata.{target, recipients_count, pressure_tested}
 * @history entry_type='update_sent', body=body_markdown (capped to 10k chars)
 */
export async function sendReport(
  input: SendReportInput,
): Promise<PlanActionResult<ReportsSentRow>> {
  return withAuth<PlanActionResult<ReportsSentRow>>(
    async ({ supabase, user, foundryId }) => {
      const parsed = sendReportInputSchema.safeParse(input)
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
      }
      const data = parsed.data

      const allowed = await planCan(supabase, user.id, foundryId, 'send_report')
      if (!allowed) return { error: 'Not permitted to send reports' }

      const sentVia: Array<'email' | 'slack' | 'link'> =
        data.sent_via && data.sent_via.length > 0 ? data.sent_via : ['link']

      // Plan tables aren't in the generated Database types yet — cast at the
      // query boundary (same pattern as sibling actions).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const untyped = supabase as any

      const { data: inserted, error: insErr } = await untyped
        .from('reports_sent')
        .insert({
          foundry_id: foundryId,
          target_type: data.target_type,
          subject_line: data.subject_line,
          body_markdown: data.body_markdown,
          body_html: null,
          pulled_from_json: {
            goal_ids: data.pulled_from_goal_ids ?? [],
          },
          recipients_json: data.recipients ?? [],
          sent_via: sentVia,
          sent_at: new Date().toISOString(),
          pressure_tested_before_send: data.pressure_tested_before_send ?? false,
          pressure_test_session_id: data.pressure_test_session_id ?? null,
          draft_by: 'founder',
        })
        .select('*')
        .single()

      if (insErr || !inserted) {
        return {
          error: sanitizeErrorMessage(insErr ?? 'Failed to save report'),
        }
      }

      const row = inserted as ReportsSentRow

      // history_entries — entry_type='update_sent' per §9
      const bodyPreview = data.body_markdown.slice(0, 10_000)
      const { error: historyErr } = await untyped
        .from('history_entries')
        .insert({
          foundry_id: foundryId,
          entry_type: 'update_sent',
          title: `Sent · ${data.subject_line}`,
          body: bodyPreview,
          actor_type: 'founder',
          actor_id: user.id,
          goal_id: null,
          related_ids_json: {
            report_id: row.id,
            pressure_test_id: data.pressure_test_session_id ?? undefined,
          },
          outcome: 'neutral',
        })
      if (historyErr) {
        // Non-fatal — the send was saved. Surface to logs.
        console.warn(
          '[plan/reports] history_entries insert failed:',
          historyErr.message,
        )
      }

      await logAudit({
        action: 'report_sent' as never,
        entityType: 'reports_sent',
        entityId: row.id,
        userId: user.id,
        foundryId,
        metadata: {
          target_type: data.target_type,
          recipients_count: data.recipients?.length ?? 0,
          sent_via: sentVia,
          pressure_tested_before_send: data.pressure_tested_before_send ?? false,
          pressure_test_session_id: data.pressure_test_session_id ?? null,
        },
      })

      revalidatePath('/plan/report')
      revalidatePath(`/plan/report/${row.id}`)

      // Chunk E cron: emit event_log trigger §14.1 row 11 (reports_sent
      // send-failed) from the Resend webhook handler. V1 has no real send
      // path, so no event is attention-worthy at this point.

      return { success: true, data: row }
    },
  )
}

