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

/**
 * Verifies the cron secret to prevent unauthorized access.
 *
 * @param req - Incoming request
 * @returns true if authorized, false otherwise
 *
 * @security In production, CRON_SECRET is required. In development, allows open access.
 */
function verifyCronSecret(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET

  // SECURITY: In production, require the secret
  if (!cronSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[SECURITY] CRON_SECRET not configured in production!')
      return false
    }
    return true // Allow in development
  }

  const authHeader = req.headers.get('authorization')
  return authHeader === `Bearer ${cronSecret}`
}

/**
 * GET /api/cron/weekly-synthesis
 *
 * @description Main entry point for the weekly synthesis cron job.
 * Cal produces unified executive briefs for all active foundries.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // AUTH: Verify cron authorization
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    console.error('[Cron] Weekly synthesis error:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

/** Also allow POST for manual triggering from admin panel */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return GET(req)
}
