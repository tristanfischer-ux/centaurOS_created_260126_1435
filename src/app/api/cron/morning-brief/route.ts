/**
 * Morning Briefing Cron
 *
 * Runs daily at 8am to generate briefings for all foundries.
 * Cal (Chief of Staff) synthesizes overnight AI team activity.
 *
 * Cron schedule: 0 8 * * * (8am daily)
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runMorningBriefing } from '@/lib/agents/morning-brief'

export const dynamic = 'force-dynamic'

/**
 * Verifies cron authorization headers against the configured shared secret.
 *
 * @description Enforces fail-closed authorization for cron invocations. Returns
 * an HTTP response when authorization should be denied and null when the
 * request is authorized to proceed.
 *
 * @param {Request} request - Incoming cron request
 * @returns {NextResponse | null} Authorization failure response or null
 *
 * @security Requires CRON_SECRET and a matching Bearer token
 */
function verifyCronSecret(request: Request): NextResponse | null {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // SECURITY: Fail closed when CRON_SECRET is not configured.
  if (!cronSecret) {
    console.error('[MorningBriefCron] CRON_SECRET is not configured')
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 503 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

/**
 * GET /api/cron/morning-brief
 *
 * Generates morning briefings for all active foundries.
 * Called by Vercel Cron.
 *
 * @description Executes the daily morning brief generation workflow for all
 * active foundries with morning briefs enabled.
 *
 * @param {Request} request - Incoming cron request
 * @returns {Promise<NextResponse>} Job execution result summary
 *
 * @throws {Error} Logs internal failures and returns generic 500 response
 *
 * @security Requires CRON_SECRET bearer authentication
 */
export async function GET(request: Request) {
  const authFailureResponse = verifyCronSecret(request)
  if (authFailureResponse) {
    return authFailureResponse
  }

  const startTime = Date.now()
  const results: {
    success: number
    failed: number
    details: Array<{ foundryId: string; success: boolean; error?: string }>
  } = {
    success: 0,
    failed: 0,
    details: []
  }

  try {
    // SECURITY: Service-role client is required for unattended cron execution.
    const supabase = createAdminClient()

    // Get all active foundries
    const { data: foundries, error: foundriesError } = await supabase
      .from('foundries')
      .select('id, founder_id, name, settings')
      .eq('status', 'active')
      .limit(100) // Process in batches

    if (foundriesError) {
      console.error('[MorningBriefCron] Error fetching foundries:', foundriesError)
      return NextResponse.json({ error: 'Failed to fetch foundries' }, { status: 500 })
    }

    if (!foundries || foundries.length === 0) {
      return NextResponse.json({
        message: 'No active foundries to process',
        results
      })
    }

    // Process each foundry
    for (const foundry of foundries) {
      // Check if foundry has morning briefings enabled
      const settings = foundry.settings as Record<string, unknown> | null
      const morningBriefEnabled = settings?.morningBriefEnabled !== false // Default to true

      if (!morningBriefEnabled) {
        results.details.push({
          foundryId: foundry.id,
          success: true,
          error: 'Disabled'
        })
        continue
      }

      try {
        const result = await runMorningBriefing(foundry.id, foundry.founder_id)

        if (result.success) {
          results.success++
          results.details.push({
            foundryId: foundry.id,
            success: true
          })
        } else {
          console.error('[MorningBriefCron] Foundry briefing failed:', {
            foundryId: foundry.id,
            error: result.error ?? 'Unknown error'
          })
          results.failed++
          results.details.push({
            foundryId: foundry.id,
            success: false,
            error: 'Generation failed'
          })
        }
      } catch (error) {
        console.error('[MorningBriefCron] Foundry briefing exception:', {
          foundryId: foundry.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        results.failed++
        results.details.push({
          foundryId: foundry.id,
          success: false,
          error: 'Generation failed'
        })
      }
    }

    const duration = Date.now() - startTime

    console.log(`[MorningBriefCron] Completed in ${duration}ms`, {
      success: results.success,
      failed: results.failed,
      total: foundries.length
    })

    return NextResponse.json({
      message: `Processed ${foundries.length} foundries`,
      results,
      duration: `${duration}ms`
    })
  } catch (error) {
    console.error('[MorningBriefCron] Fatal error:', error)

    return NextResponse.json({ error: 'Morning brief job failed', results }, { status: 500 })
  }
}
