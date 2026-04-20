/**
 * @file Cron · Plan Friday wrap-up.
 *
 * PLAN-SCHEMA §14.1 row 6:
 *   `task` · `is_pinned=true AND horizon='this_week' AND status != done`
 *   on Friday · urgency=medium · decay=1d ·
 *   cta="Close the week" → plan:task:[id]
 *
 * @schedule 0 16 * * 5  (Friday 16:00 UTC — end of working day across EU/UK)
 * @security verifyCronSecret · rate-limit per-IP · admin client
 */

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { emitPlanEvent } from '@/lib/plan/emit-event'
import { verifyCronSecret } from '@/lib/security/cron-auth'
import { getClientIP, rateLimit } from '@/lib/security/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_TASKS_PER_RUN = 500

export async function GET(req: NextRequest): Promise<NextResponse> {
    const ip = getClientIP(req.headers)
    const ipLimit = await rateLimit('webhook', `cron-plan-friday:${ip}`)
    if (!ipLimit.success) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const authFailure = verifyCronSecret(req)
    if (authFailure) return authFailure

    try {
        const admin = createAdminClient()

        // Pinned this-week tasks that still haven't landed. `horizon` +
        // `is_pinned` are Plan §A.5 additive columns; status 'completed'
        // is the canonical done-state.
        const { data: tasks, error: tasksErr } = await admin
            .from('tasks')
            .select('id, foundry_id, title, assignee_id, status')
            .eq('is_pinned', true)
            .eq('horizon', 'this_week')
            .neq('status', 'completed')
            .is('deleted_at', null)
            .limit(MAX_TASKS_PER_RUN)

        if (tasksErr) {
            console.error('[cron/plan-friday-wrap-up] tasks query failed:', tasksErr.message)
            return NextResponse.json({ error: 'Internal error' }, { status: 500 })
        }
        if (!tasks || tasks.length === 0) {
            return NextResponse.json({ processed: 0, emitted: 0 })
        }

        // De-dupe against existing unresolved rows.
        const taskIds = tasks.map((t) => t.id)
        const { data: existing, error: existingErr } = await admin
            .from('event_log')
            .select('source_entity_id')
            .eq('section', 'plan')
            .eq('source_entity_type', 'task')
            .in('source_entity_id', taskIds)
            .is('resolved_at', null)

        if (existingErr) {
            console.error('[cron/plan-friday-wrap-up] existing event_log query failed:', existingErr.message)
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
                title: 'Close the week',
                body: t.title ?? null,
                ctaLabel: 'Close the week',
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
        console.error('[cron/plan-friday-wrap-up] unexpected:', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    return GET(req)
}
