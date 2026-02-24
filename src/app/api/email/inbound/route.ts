/**
 * @file route.ts
 *
 * @description Handles inbound email webhooks (from Resend or similar provider).
 * Creates tasks from forwarded emails, similar to voice-to-task.
 *
 * @security
 * - Validates webhook Bearer token to prevent unauthorized task creation
 * - Resend inbound webhooks do NOT support cryptographic signatures (DKIM/SPF
 *   verification happens at Resend's infrastructure level, not in the webhook payload).
 *   Mitigation: Bearer token auth + sender-email-must-match-account check + rate limiting.
 * - Sanitizes email content before storing
 * - Rate limited per IP and per sender
 *
 * @audit Logs email_to_task event with sender, user, and task details
 *
 * @related
 * - src/app/api/voice-to-task/route.ts - Similar pattern for voice input
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { escapeHtml } from '@/lib/security/sanitize'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'

const INBOUND_WEBHOOK_SECRET = process.env.EMAIL_INBOUND_WEBHOOK_SECRET

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
    // SECURITY: IP-based rate limit on webhook endpoint
    const ip = getClientIP(req.headers)
    const ipLimit = await rateLimit('webhook', `email-inbound:${ip}`)
    if (!ipLimit.success) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

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

    let admin
    try {
        admin = createAdminClient()
    } catch (error) {
        console.error('[EmailInbound] Admin client initialization failed:', {
            error: error instanceof Error ? error.message : 'Unknown error',
        })
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

    // SECURITY: Normalize sender identity before any routing/authorization logic.
    const senderEmail = (payload.from.match(/<(.+?)>/)?.[1] || payload.from).trim().toLowerCase()
    if (!senderEmail.includes('@')) {
        return NextResponse.json({ error: 'Invalid sender address' }, { status: 400 })
    }

    // SECURITY: Add sender-scoped rate limiting in addition to IP throttling.
    const senderLimit = await rateLimit('webhook', `email-inbound-sender:${senderEmail}`, {
        limit: 30,
        window: 60 * 60 * 1000,
    })
    if (!senderLimit.success) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    // Extract the user token from the "to" address
    // Format: tasks+{user_id_prefix}@fractionalforge.app
    const toMatch = payload.to.match(/tasks\+([a-f0-9]{8})@/i)
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
        .limit(2)

    if (profileError || !profiles || profiles.length !== 1) {
        console.warn('[EmailInbound] No user found for token:', userToken)
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const profile = profiles[0]

    // SECURITY: Verify the sender email matches the user's email.
    // This is the primary defense against forged emails creating tasks in someone's
    // account, since Resend's inbound webhooks don't include DKIM/SPF verification
    // results in the payload.
    if (senderEmail !== profile.email?.toLowerCase()) {
        console.warn('[SECURITY] Email sender mismatch — possible spoofing attempt:', {
            sender: senderEmail,
            targetUser: profile.id,
            toAddress: payload.to,
        })
        return NextResponse.json({ error: 'Sender not authorized' }, { status: 403 })
    }

    // VALIDATION: Sanitize the email content
    const title = payload.subject.substring(0, 200).trim()
    const description = escapeHtml(
        payload.text || payload.html || ''
    ).substring(0, 2000)

    // Resolve objective context (tasks.objective_id is required by schema)
    let objectiveId: string | null = null

    const { data: defaultObjective } = await admin
        .from('objectives')
        .select('id')
        .eq('foundry_id', profile.foundry_id)
        .eq('title', 'No objective set')
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()

    objectiveId = defaultObjective?.id ?? null

    if (!objectiveId) {
        const { data: fallbackObjective } = await admin
            .from('objectives')
            .select('id')
            .eq('foundry_id', profile.foundry_id)
            .eq('is_ghost', false)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        objectiveId = fallbackObjective?.id ?? null
    }

    if (!objectiveId) {
        return NextResponse.json(
            { error: 'No objectives available for task creation' },
            { status: 400 }
        )
    }

    // Create the task
    const { data: task, error: taskError } = await admin
        .from('tasks')
        .insert({
            foundry_id: profile.foundry_id,
            title,
            description: description || null,
            objective_id: objectiveId,
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
