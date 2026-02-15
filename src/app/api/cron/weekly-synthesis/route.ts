/**
 * Cron Job: Weekly Executive Brief Synthesis
 *
 * @description Triggers Cal (Chief of Staff) to synthesize all specialist
 * insights from the past week into a unified executive brief for each foundry.
 *
 * Schedule: Every Monday at 8:00 UTC
 *
 * Vercel cron config in vercel.json:
 * path: /api/cron/weekly-synthesis
 * schedule: 0 8 * * 1
 *
 * @security Requires CRON_SECRET Bearer token for authorization
 * @audit Synthesis runs logged to agent_sweep_log table
 */

import { NextRequest, NextResponse } from 'next/server'
import { runWeeklySynthesis } from '@/lib/agents/sweep-synthesis'
import { getClientIP, rateLimit } from '@/lib/security/rate-limit'

/**
 * Verifies the cron secret to prevent unauthorized access.
 *
 * @param req - Incoming request
 * @returns Unauthorized/configuration response when invalid; otherwise null.
 *
 * @security Fail-closed in all environments when CRON_SECRET is missing.
 */
function verifyCronSecret(req: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET

  // SECURITY: Fail closed when cron secret is not configured.
  if (!cronSecret) {
    console.error('[SECURITY] CRON_SECRET not configured')
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 503 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

/**
 * GET /api/cron/weekly-synthesis
 *
 * @description Main entry point for the weekly synthesis cron job.
 * Cal produces unified executive briefs for all active foundries.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIP(req.headers)
  const ipLimit = await rateLimit('webhook', `cron-weekly-synthesis:${ip}`)
  if (!ipLimit.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  // AUTH: Verify cron authorization
  const authFailure = verifyCronSecret(req)
  if (authFailure) {
    return authFailure
  }

  try {
    console.info('[Cron] Starting weekly synthesis...')

    const result = await runWeeklySynthesis()

    console.info(
      `[Cron] Weekly synthesis complete: ${result.briefsGenerated} briefs, ` +
      `$${result.totalCostUsd.toFixed(4)} cost, ${result.durationMs}ms`
    )

    return NextResponse.json({
      success: true,
      foundriesProcessed: result.foundriesProcessed,
      briefsGenerated: result.briefsGenerated,
      briefsFailed: result.briefsFailed,
      totalCostUsd: Number(result.totalCostUsd.toFixed(4)),
      durationMs: result.durationMs,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron] Weekly synthesis error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json({
      success: false,
      error: 'Weekly synthesis job failed',
    }, { status: 500 })
  }
}

/** Also allow POST for manual triggering from admin panel */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return GET(req)
}
