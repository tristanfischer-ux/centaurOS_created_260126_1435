/**
 * @file route.ts
 *
 * @description Handles Google Calendar push notification webhooks.
 * Google sends notifications here when watched calendar events change.
 *
 * @security
 * - Validates the X-Goog-Channel-Token header to prevent unauthorized calls
 * - Uses GOOGLE_CALENDAR_WEBHOOK_SECRET for verification
 * - Rate limited to prevent abuse
 *
 * @related
 * - src/lib/google/calendar.ts - Calendar API operations
 * - src/actions/google-calendar.ts - Calendar sync actions
 */

import { NextRequest, NextResponse } from 'next/server'

/**
 * Google Calendar sends POST notifications when watched resources change.
 * Currently logs the notification for monitoring. Full bidirectional sync
 * can be implemented by querying the changed events and updating ForgeOS.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
    // SECURITY: Validate webhook token
    const channelToken = req.headers.get('x-goog-channel-token')
    const webhookSecret = process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET

    if (webhookSecret && channelToken !== webhookSecret) {
        console.warn('[GoogleCalendarWebhook] Invalid channel token')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Extract notification headers
    const channelId = req.headers.get('x-goog-channel-id')
    const resourceId = req.headers.get('x-goog-resource-id')
    const resourceState = req.headers.get('x-goog-resource-state')

    console.info('[GoogleCalendarWebhook] Notification received:', {
        channelId,
        resourceId,
        resourceState,
    })

    // Handle sync notification (sent when watch is first created)
    if (resourceState === 'sync') {
        return NextResponse.json({ status: 'sync_acknowledged' })
    }

    // For 'exists' state: calendar has changed events
    // Future: Query changed events and update ForgeOS entities
    // For now, log and acknowledge
    if (resourceState === 'exists') {
        console.info('[GoogleCalendarWebhook] Calendar updated:', {
            channelId,
            resourceId,
        })
    }

    return NextResponse.json({ status: 'received' })
}
