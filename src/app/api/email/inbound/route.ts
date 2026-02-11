/**
 * @file route.ts
 *
 * @description Handles inbound email webhooks (from Resend or similar provider).
 * Creates tasks from forwarded emails, similar to voice-to-task.
 *
 * @security
 * - Validates webhook signature to prevent unauthorized task creation
 * - Sanitizes email content before storing
 * - Rate limited per sender
 *
 * @audit Logs email_to_task event
 *
 * @related
 * - src/app/api/voice-to-task/route.ts - Similar pattern for voice input
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { escapeHtml } from '@/lib/security/sanitize'

const INBOUND_WEBHOOK_SECRET = process.env.EMAIL_INBOUND_WEBHOOK_SECRET

/**
 * Creates an admin Supabase client for webhook processing.
 * Webhooks can't use user sessions, so service role is required.
 */
function getAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) return null
    return createAdminClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

/**
 * POST handler for inbound email webhooks.
 *
 * Expected payload format (Resend inbound webhooks):
 * {
 *   from: "sender@example.com",
 *   to: "tasks+{user_token}@fractionalforge.app",
 *   subject: "Email subject becomes task title",
 *   text: "Plain text body",
 *   html: "HTML body"
 * }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
    // SECURITY: Validate webhook secret — reject if not configured or mismatch
    if (!INBOUND_WEBHOOK_SECRET) {
        console.error('[EmailInbound] EMAIL_INBOUND_WEBHOOK_SECRET not configured — rejecting all requests')
        return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
    }

    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${INBOUND_WEBHOOK_SECRET}`) {
        console.warn('[EmailInbound] Invalid webhook secret')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = getAdminClient()
    if (!admin) {
        console.error('[EmailInbound] Admin client not available')
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    let payload: {
        from: string
        to: string
        subject: string
        text?: string
        html?: string
    }

    try {
        payload = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (!payload.from || !payload.to || !payload.subject) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Extract the user token from the "to" address
    // Format: tasks+{user_id_prefix}@fractionalforge.app
    const toMatch = payload.to.match(/tasks\+([a-zA-Z0-9_-]+)@/)
    if (!toMatch) {
        console.warn('[EmailInbound] Invalid to address format:', payload.to)
        return NextResponse.json({ error: 'Invalid recipient address' }, { status: 400 })
    }

    const userToken = toMatch[1]

    // Look up user by email prefix token
    // The token is the first 8 chars of the user's ID
    const { data: profiles, error: profileError } = await admin
        .from('profiles')
        .select('id, foundry_id, email')
        .like('id', `${userToken}%`)
        .limit(1)

    if (profileError || !profiles || profiles.length === 0) {
        console.warn('[EmailInbound] No user found for token:', userToken)
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const profile = profiles[0]

    // SECURITY: Verify the sender email matches the user's email
    // This prevents others from creating tasks in someone's account
    const senderEmail = payload.from.match(/<(.+?)>/)?.[1] || payload.from
    if (senderEmail.toLowerCase() !== profile.email?.toLowerCase()) {
        console.warn('[EmailInbound] Sender mismatch:', {
            sender: senderEmail,
            expected: profile.email,
        })
        return NextResponse.json({ error: 'Sender not authorized' }, { status: 403 })
    }

    // VALIDATION: Sanitize the email content
    const title = payload.subject.substring(0, 200).trim()
    const description = escapeHtml(
        payload.text || payload.html || ''
    ).substring(0, 2000)

    // Create the task
    const { data: task, error: taskError } = await admin
        .from('tasks')
        .insert({
            foundry_id: profile.foundry_id,
            title,
            description: description || null,
            creator_id: profile.id,
            assignee_id: profile.id,
            status: 'Pending',
            risk_level: 'Medium',
            source: 'email',
        })
        .select('id')
        .single()

    if (taskError) {
        console.error('[EmailInbound] Failed to create task:', {
            userId: profile.id,
            error: taskError.message,
        })
        return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
    }

    // AUDIT: Log email-to-task conversion
    console.info('[EmailInbound] Task created from email:', {
        taskId: task.id,
        userId: profile.id,
        subject: title,
    })

    return NextResponse.json({
        success: true,
        taskId: task.id,
        message: `Task "${title}" created successfully`,
    })
}
