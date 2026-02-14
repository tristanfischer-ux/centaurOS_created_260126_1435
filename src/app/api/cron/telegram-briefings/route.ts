/**
 * Cron Job: Daily Telegram Briefings
 * 
 * Sends daily briefings to users who have enabled them.
 * Should be triggered by Vercel Cron or similar scheduler.
 * 
 * Schedule: Every hour at :00 (to catch different timezone briefing times)
 * 
 * Vercel cron config in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/telegram-briefings",
 *     "schedule": "0 * * * *"
 *   }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendDailyBriefings } from '@/lib/telegram/notification-bridge'

// Verify cron secret to prevent unauthorized access
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

export async function GET(req: NextRequest) {
    // Verify authorization
    const authFailure = verifyCronSecret(req)
    if (authFailure) {
        return authFailure
    }

    try {
        console.log('[Cron] Starting daily briefings job...')
        
        const result = await sendDailyBriefings()
        
        console.log(`[Cron] Daily briefings complete: ${result.sent} sent, ${result.failed} failed`)
        
        return NextResponse.json({
            success: true,
            sent: result.sent,
            failed: result.failed,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('[Cron] Daily briefings error:', error)
        
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 })
    }
}

// Also allow POST for manual triggering from admin panel
export async function POST(req: NextRequest) {
    return GET(req)
}
