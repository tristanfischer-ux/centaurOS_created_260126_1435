/**
 * Cron Job: Decision Follow-Up Engine
 *
 * @description Scans decisions older than 30 days with pending outcomes
 * and creates reminder insights so the founder is nudged to record outcomes.
 *
 * Schedule: Daily (configurable in vercel.json)
 *
 * @security Requires CRON_SECRET Bearer token for authorization
 */

import { NextRequest, NextResponse } from 'next/server'
import { getClientIP, rateLimit } from '@/lib/security/rate-limit'
import { verifyCronSecret } from '@/lib/security/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SPECIALISTS } from '@/app/(platform)/agents/specialists-data'

export async function GET(req: NextRequest): Promise<NextResponse> {
    const ip = getClientIP(req.headers)
    const ipLimit = await rateLimit('webhook', `cron-decision-followups:${ip}`)
    if (!ipLimit.success) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const authFailure = verifyCronSecret(req)
    if (authFailure) return authFailure

    try {
        const admin = createAdminClient()
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

        // Find all foundries with pending decisions older than 30 days
        const { data: pendingDecisions } = await admin
            .from('specialist_decision_journal')
            .select('id, foundry_id, specialist_id, decision, created_at')
            .or('outcome_status.is.null,outcome_status.eq.pending')
            .lt('created_at', thirtyDaysAgo)
            .order('created_at', { ascending: true })
            .limit(100)

        if (!pendingDecisions?.length) {
            return NextResponse.json({ followUpsCreated: 0 })
        }

        // Get existing follow-up insights to avoid duplicates
        const decisionIds = pendingDecisions.map(d => d.id)
        const { data: existingInsights } = await admin
            .from('agent_insights')
            .select('domain_data')
            .in('domain_data->>decision_id', decisionIds)
            .eq('insight_type', 'reminder')

        const existingDecisionIds = new Set(
            (existingInsights ?? []).map(i => (i.domain_data as Record<string, unknown>)?.decision_id as string).filter(Boolean)
        )

        // Build batch of inserts
        const rows = pendingDecisions
            .filter(decision => !existingDecisionIds.has(decision.id))
            .map(decision => {
                const specialist = SPECIALISTS.find(s => s.id === decision.specialist_id)
                const specialistName = specialist?.name ?? decision.specialist_id
                const daysAgo = Math.floor((Date.now() - new Date(decision.created_at).getTime()) / 86400000)
                return {
                    foundry_id: decision.foundry_id,
                    specialist_id: decision.specialist_id,
                    insight_type: 'reminder' as const,
                    urgency: 'important' as const,
                    title: 'How did this decision work out?',
                    body: `You decided "${decision.decision.slice(0, 150)}" with ${specialistName} ${daysAgo} days ago. Recording the outcome helps us learn from past decisions.`,
                    domain_data: {
                        decision_id: decision.id,
                        decision_created_at: decision.created_at,
                        action_type: 'record_outcome',
                        days_since_decision: daysAgo,
                    },
                    suggested_actions: [
                        { label: 'Record outcome', action_type: 'record_outcome', action_data: { decisionId: decision.id } },
                    ],
                    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                }
            })

        if (rows.length > 0) {
            await admin.from('agent_insights').insert(rows)
        }

        return NextResponse.json({ followUpsCreated: rows.length })
    } catch (err) {
        console.error('[Cron] Decision follow-ups failed:', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
