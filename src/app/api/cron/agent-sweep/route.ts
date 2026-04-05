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
// AUDIT: verifyCronSecret extracted to shared cron-auth.ts (2026-02-19, refactor step 1 of 8)
import { verifyCronSecret } from '@/lib/security/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

/** SECURITY: Daily cost ceiling in USD. If total AI spend across all foundries
 * exceeds this amount, the cron sweep is skipped to prevent runaway costs.
 * £50 ≈ $65 at typical exchange rates. */
const DAILY_COST_CEILING_USD = 65

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

  // SECURITY: Check daily cost ceiling before executing any sweeps
  try {
    const today = new Date().toISOString().split('T')[0]
    const adminSupabase = createAdminClient()
    const { data: costRows, error: costError } = await adminSupabase
      .from('ai_usage_log')
      .select('estimated_cost_usd')
      .gte('created_at', `${today}T00:00:00.000Z`)
      .lt('created_at', `${today}T23:59:59.999Z`)

    if (costError) {
      console.error('[AgentSweep] Failed to check daily cost ceiling:', costError.message)
      // SECURITY: Fail closed — skip sweep if we can't verify cost
      return NextResponse.json({
        skipped: true,
        reason: 'Failed to verify daily cost ceiling',
      }, { status: 500 })
    }

    const dailyCost = (costRows || []).reduce(
      (sum, row) => sum + (row.estimated_cost_usd || 0),
      0
    )

    if (dailyCost > DAILY_COST_CEILING_USD) {
      console.warn(`[AgentSweep] Daily cost ceiling exceeded: $${dailyCost.toFixed(2)} > $${DAILY_COST_CEILING_USD}`)
      return NextResponse.json({
        skipped: true,
        reason: 'Daily AI cost ceiling exceeded',
        dailyCost: Number(dailyCost.toFixed(2)),
        ceiling: DAILY_COST_CEILING_USD,
      })
    }
  } catch (ceilingError) {
    console.error('[AgentSweep] Cost ceiling check threw:', ceilingError)
    // SECURITY: Fail closed
    return NextResponse.json({
      skipped: true,
      reason: 'Cost ceiling check failed',
    }, { status: 500 })
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
