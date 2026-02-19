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
import { getClientIP, rateLimit } from '@/lib/security/rate-limit'
// AUDIT: verifyCronSecret extracted to shared cron-auth.ts (2026-02-19, refactor step 1 of 8)
import { verifyCronSecret } from '@/lib/security/cron-auth'

export async function GET(req: NextRequest) {
    const ip = getClientIP(req.headers)
    const ipLimit = await rateLimit('webhook', `cron-telegram-briefings:${ip}`)
    if (!ipLimit.success) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

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
        console.error('[Cron] Daily briefings error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
        })
        
        return NextResponse.json({
            success: false,
            error: 'Daily briefings job failed',
        }, { status: 500 })
    }
}

// Also allow POST for manual triggering from admin panel
export async function POST(req: NextRequest) {
    return GET(req)
}
