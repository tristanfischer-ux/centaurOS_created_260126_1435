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
 * GET /api/cron/agent-sweep
 *
 * @description Main entry point for the cron job. Runs the full sweep
 * orchestration and returns aggregated results.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // AUTH: Verify cron authorization
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    console.error('[Cron] Agent sweep error:', error)

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
