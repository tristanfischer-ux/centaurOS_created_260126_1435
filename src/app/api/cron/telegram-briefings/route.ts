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
function verifyCronSecret(req: NextRequest): boolean {
    const cronSecret = process.env.CRON_SECRET
    
    // In production, require the secret
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

export async function GET(req: NextRequest) {
    // Verify authorization
    if (!verifyCronSecret(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
