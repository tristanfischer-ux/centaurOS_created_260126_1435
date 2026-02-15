/**
 * @file route.ts
 *
 * @description API endpoint for triggering intelligence sweeps.
 * Can be called by cron jobs or manually by authenticated users.
 *
 * @security Requires either a valid cron secret or authenticated user
 * with foundry membership.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 120 // Sweeps can take a while with multiple AI calls

/**
 * POST /api/agents/sweep
 *
 * Triggers an intelligence sweep for a foundry.
 *
 * @param request - Must include foundryId in body. Optional: sourceIds, force.
 * @returns Sweep results with generated reports
 *
 * @security Requires authenticated user with foundry membership,
 * or valid CRON_SECRET header for automated sweeps.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        // AUTH: Check for cron secret or authenticated user
        const cronSecret = request.headers.get('x-cron-secret')
        const isAutomated = cronSecret === process.env.CRON_SECRET

        let foundryId: string
        let sourceIds: string[] | undefined
        let force = false

        const body = (await request.json()) as {
            foundryId?: string
            sourceIds?: string[]
            force?: boolean
        }

        if (isAutomated) {
            // Automated sweep — foundryId must be in body
            if (!body.foundryId) {
                return NextResponse.json(
                    { error: 'foundryId required for automated sweeps' },
                    { status: 400 },
                )
            }
            foundryId = body.foundryId
            sourceIds = body.sourceIds
            force = body.force ?? false
        } else {
            // Manual sweep — verify authentication
            const supabase = await createClient()
            const {
                data: { user },
            } = await supabase.auth.getUser()

            if (!user) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
            }

            if (!body.foundryId) {
                return NextResponse.json(
                    { error: 'foundryId required' },
                    { status: 400 },
                )
            }

            // SECURITY: Verify user is a member of the foundry
            const { data: membership } = await supabase
                .from('foundry_memberships')
                .select('id')
                .eq('foundry_id', body.foundryId)
                .eq('user_id', user.id)
                .single()

            if (!membership) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            }

            foundryId = body.foundryId
            sourceIds = body.sourceIds
            force = body.force ?? false
        }

        // Run the sweep
        const { runIntelligenceSweep } = await import(
            '@/lib/agents/intelligence-sweep-orchestrator'
        )
        const result = await runIntelligenceSweep({
            foundryId,
            sourceIds,
            force,
        })

        return NextResponse.json({
            success: true,
            sourcesChecked: result.sourcesChecked,
            reportsGenerated: result.reports.length,
            errors: result.errors,
            durationMs: result.durationMs,
        })
    } catch (err) {
        console.error('[SweepAPI] Error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 },
        )
    }
}
