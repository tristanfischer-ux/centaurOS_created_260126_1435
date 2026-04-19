/**
 * @file Cron · Plan task-overdue sweep.
 *
 * PLAN-SCHEMA §14.1 row 5:
 *   `task` · due_date overdue > 3 days · urgency=medium · decay=1d ·
 *   cta="Update task" → plan:task:[id]
 *
 * Can't fire inline from server actions — emergence is driven by wall-clock
 * drift, not by the founder clicking anything. This cron sweeps every 4h
 * and emits one event per overdue task that doesn't already have an
 * unresolved event_log row.
 *
 * @schedule "0 ASTERISK/4 * * *" (every 4 hours on the hour — see vercel.json)
 * @security verifyCronSecret · rate-limit per-IP · admin client
 */

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { emitPlanEvent } from '@/lib/plan/emit-event'
import { verifyCronSecret } from '@/lib/security/cron-auth'
import { getClientIP, rateLimit } from '@/lib/security/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Safety caps — prevent runaway bursts in a single run. */
const MAX_TASKS_PER_RUN = 500

export async function GET(req: NextRequest): Promise<NextResponse> {
    const ip = getClientIP(req.headers)
    const ipLimit = await rateLimit('webhook', `cron-plan-overdue:${ip}`)
    if (!ipLimit.success) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const authFailure = verifyCronSecret(req)
    if (authFailure) return authFailure

    try {
        const admin = createAdminClient()

        // "Overdue > 3 days" window. `tasks.end_date` is the due date column
        // (PLAN-SCHEMA uses "due_date" loosely; the concrete column is
        // `end_date`, confirmed via database.types.ts + morning-digest cron).
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0]

        const { data: tasks, error: tasksErr } = await admin
            .from('tasks')
            .select('id, foundry_id, title, end_date, status, assignee_id')
            .lt('end_date', threeDaysAgo)
            .neq('status', 'completed')
            .is('deleted_at', null)
            .limit(MAX_TASKS_PER_RUN)

        if (tasksErr) {
            console.error('[cron/plan-task-overdue-sweep] tasks query failed:', tasksErr.message)
            return NextResponse.json({ error: 'Internal error' }, { status: 500 })
        }
        if (!tasks || tasks.length === 0) {
            return NextResponse.json({ processed: 0, emitted: 0 })
        }

        // De-dupe against unresolved event_log rows so we never re-emit the
        // same "overdue" signal every 4h. An event_log row resolves when the
        // founder acts on the CTA or the task transitions to completed.
        const taskIds = tasks.map((t) => t.id)
        const { data: existing, error: existingErr } = await admin
            .from('event_log')
            .select('source_entity_id')
            .eq('section', 'plan')
            .eq('source_entity_type', 'task')
            .in('source_entity_id', taskIds)
            .is('resolved_at', null)

        if (existingErr) {
            console.error('[cron/plan-task-overdue-sweep] existing event_log query failed:', existingErr.message)
            return NextResponse.json({ error: 'Internal error' }, { status: 500 })
        }

        const alreadyOpen = new Set(
            (existing ?? []).map((r) => r.source_entity_id as string),
        )

        let emitted = 0
        for (const t of tasks) {
            if (alreadyOpen.has(t.id)) continue
            await emitPlanEvent({
                foundryId: t.foundry_id,
                sourceEntityType: 'task',
                sourceEntityId: t.id,
                urgency: 'medium',
                decayRate: '1d',
                title: 'Task overdue for more than 3 days',
                body: t.title ?? null,
                ctaLabel: 'Update task',
                ctaHref: `plan:task:${t.id}`,
                assignedTo: t.assignee_id ?? null,
            })
            emitted += 1
        }

        return NextResponse.json({
            processed: tasks.length,
            alreadyOpen: alreadyOpen.size,
            emitted,
            timestamp: new Date().toISOString(),
        })
    } catch (err) {
        console.error('[cron/plan-task-overdue-sweep] unexpected:', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    return GET(req)
}
