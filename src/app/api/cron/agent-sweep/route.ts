/**
 * Cron Job: Always-On Agent Sweep
 *
 * @description Triggers background specialist sweeps across all active
 * foundries. Each specialist analyzes the company context and surfaces
 * actionable insights that appear on the Today page.
 *
 * Schedule: Every 2 hours (configurable per foundry via preferences)
 *
 * Vercel cron config in vercel.json:
 * path: /api/cron/agent-sweep
 * schedule: every 2 hours at :00
 *
 * @security Requires CRON_SECRET Bearer token for authorization
 * @audit All sweep executions logged to agent_sweep_log table
 */

import { NextRequest, NextResponse } from 'next/server'
import { runSweepOrchestration } from '@/lib/agents/sweep-orchestrator'
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
 * GET /api/cron/agent-sweep
 *
 * @description Main entry point for the cron job. Runs the full sweep
 * orchestration and returns aggregated results.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIP(req.headers)
  const ipLimit = await rateLimit('webhook', `cron-agent-sweep:${ip}`)
  if (!ipLimit.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  // AUTH: Verify cron authorization
  const authFailure = verifyCronSecret(req)
  if (authFailure) {
    return authFailure
  }

  try {
    console.info('[Cron] Starting agent sweep orchestration...')

    const result = await runSweepOrchestration()

    console.info(
      `[Cron] Agent sweep complete: ${result.sweepsExecuted} sweeps, ` +
      `${result.totalInsights} insights, $${result.totalCostUsd.toFixed(4)} cost`
    )

    return NextResponse.json({
      success: true,
      foundriesProcessed: result.foundriesProcessed,
      sweepsExecuted: result.sweepsExecuted,
      sweepsSkipped: result.sweepsSkipped,
      sweepsFailed: result.sweepsFailed,
      totalInsights: result.totalInsights,
      totalCostUsd: Number(result.totalCostUsd.toFixed(4)),
      durationMs: result.durationMs,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron] Agent sweep error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json({
      success: false,
      error: 'Agent sweep job failed',
    }, { status: 500 })
  }
}

/** Also allow POST for manual triggering from admin panel */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return GET(req)
}
