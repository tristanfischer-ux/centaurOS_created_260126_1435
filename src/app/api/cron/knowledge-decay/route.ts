/**
 * Cron Job: Knowledge Base Confidence Decay
 *
 * @description Decays confidence scores on specialist knowledge entries that
 * haven't been updated in 30+ days, then prunes entries whose confidence has
 * dropped below 0.3. This keeps the knowledge base fresh and prevents stale
 * facts from polluting specialist context.
 *
 * Formula: confidence -= 0.05 * months_since_last_update (30-day grace period)
 *
 * Schedule: Daily at 03:00 UTC (configured in vercel.json)
 *
 * @security Requires CRON_SECRET Bearer token for authorization.
 *           Uses admin client (service_role) since this is a system-level job.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getClientIP, rateLimit } from '@/lib/security/rate-limit'
import { verifyCronSecret } from '@/lib/security/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest): Promise<NextResponse> {
    // 1. Rate limit — same pattern as all cron routes
    const ip = getClientIP(req.headers)
    const ipLimit = await rateLimit('webhook', `cron-knowledge-decay:${ip}`)
    if (!ipLimit.success) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    // 2. Auth — fail-closed cron secret verification
    const authFailure = verifyCronSecret(req)
    if (authFailure) return authFailure

    try {
        const admin = createAdminClient()

        // 3. Decay confidence for stale entries via RPC
        // INTENT: The RPC handles the computed UPDATE (confidence -= 0.05 * months)
        // which can't be expressed through the Supabase query builder.
        const { data: decayedCount, error: decayError } = await admin.rpc(
            'decay_knowledge_confidence'
        )

        if (decayError) {
            console.error('[knowledge-decay] Decay RPC failed:', decayError)
            return NextResponse.json(
                { error: 'Decay operation failed' },
                { status: 500 }
            )
        }

        // 4. Delete entries with confidence below threshold
        // INTENT: Entries that have decayed below 0.3 are too unreliable to keep.
        const { data: deleted, error: deleteError } = await admin
            .from('specialist_knowledge_base')
            .delete()
            .lt('confidence', 0.3)
            .select('id')

        if (deleteError) {
            console.error('[knowledge-decay] Delete failed:', deleteError)
            return NextResponse.json(
                { error: 'Pruning operation failed' },
                { status: 500 }
            )
        }

        const deletedCount = deleted?.length ?? 0

        console.info(
            `[knowledge-decay] Completed: decayed ${decayedCount ?? 0} entries, deleted ${deletedCount} low-confidence entries`
        )

        return NextResponse.json({
            success: true,
            decayedCount: decayedCount ?? 0,
            deletedCount,
        })
    } catch (err) {
        console.error('[knowledge-decay] Error:', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
