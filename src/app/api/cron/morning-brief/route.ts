/**
 * Morning Briefing Cron
 *
 * Runs daily at 8am to generate briefings for all foundries.
 * Cal (Chief of Staff) synthesizes overnight AI team activity.
 *
 * Cron schedule: 0 8 * * * (8am daily)
 */

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/server'
import { runMorningBriefing } from '@/lib/agents/morning-brief'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/morning-brief
 *
 * Generates morning briefings for all active foundries.
 * Called by Vercel Cron.
 */
export async function GET(request: Request) {
  // Verify cron secret
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
    // Get all active foundries
    const { data: foundries, error: foundriesError } = await supabase
      .from('foundries')
      .select('id, founder_id, name, settings')
      .eq('status', 'active')
      .limit(100) // Process in batches

    if (foundriesError) {
      console.error('[MorningBriefCron] Error fetching foundries:', foundriesError)
      return NextResponse.json(
        { error: 'Failed to fetch foundries', details: foundriesError },
        { status: 500 }
      )
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
          results.failed++
          results.details.push({
            foundryId: foundry.id,
            success: false,
            error: result.error
          })
        }
      } catch (error) {
        results.failed++
        results.details.push({
          foundryId: foundry.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
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

    return NextResponse.json(
      {
        error: 'Fatal error',
        details: error instanceof Error ? error.message : 'Unknown error',
        results
      },
      { status: 500 }
    )
  }
}
