/**
 * Cron Job: Specialist News Briefings
 *
 * @description Generates 3x-daily news briefings per specialist (6am, 12pm, 5pm UTC).
 * Fetches RSS feeds by domain, synthesizes via MiniMax M2.5, stores in
 * specialist_briefings, and creates agent_insights for the Today page.
 *
 * Schedule: 6am, 12pm, 5pm UTC (vercel.json)
 *
 * @security Requires CRON_SECRET Bearer token for authorization
 * @audit Briefings stored in specialist_briefings; insights in agent_insights
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateSpecialistBriefings, type BriefingType } from '@/lib/agents/specialist-briefings'
import { getClientIP, rateLimit } from '@/lib/security/rate-limit'

function verifyCronSecret(req: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET
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
 * Map UTC hour (0-23) to briefing type. 6 = morning, 12 = midday, 17 = evening.
 */
function getBriefingTypeForHour(utcHour: number): BriefingType | null {
  if (utcHour === 6) return 'morning'
  if (utcHour === 12) return 'midday'
  if (utcHour === 17) return 'evening'
  return null
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIP(req.headers)
  const ipLimit = await rateLimit('webhook', `cron-specialist-briefings:${ip}`)
  if (!ipLimit.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const authFailure = verifyCronSecret(req)
  if (authFailure) return authFailure

  const utcHour = new Date().getUTCHours()
  const briefingType = getBriefingTypeForHour(utcHour)

  if (!briefingType) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: `No briefing scheduled for UTC hour ${utcHour}`,
      timestamp: new Date().toISOString(),
    })
  }

  try {
    console.info('[Cron] Starting specialist briefings:', briefingType)

    const result = await generateSpecialistBriefings(briefingType)

    const completed = result.results.filter((r) => r.status === 'completed').length
    const failed = result.results.filter((r) => r.status === 'failed').length

    console.info(
      `[Cron] Specialist briefings complete: ${briefingType}, ${completed} ok, ${failed} failed, $${result.totalCostUsd.toFixed(4)} cost`
    )

    return NextResponse.json({
      success: true,
      briefingType,
      completed,
      failed,
      totalCostUsd: Number(result.totalCostUsd.toFixed(4)),
      durationMs: result.durationMs,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron] Specialist briefings error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { success: false, error: 'Specialist briefings job failed' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return GET(req)
}
