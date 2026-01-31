/**
 * Generate Telegram verification code
 */

import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'

// SECURITY: Use cryptographically secure random number generation
function generateVerificationCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Avoid ambiguous chars
    const randomValues = new Uint8Array(6)
    crypto.getRandomValues(randomValues)
    return Array.from(randomValues)
        .map(byte => chars[byte % chars.length])
        .join('')
}

// Admin client for messaging_links table (not in types yet)
function getAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) throw new Error('Missing Supabase config')
    return createAdminClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

export async function POST() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // SECURITY: Rate limit code generation (3 codes per 15 minutes per user)
        const headersList = await headers()
        const clientIP = getClientIP(headersList)
        const rateLimitResult = await rateLimit('api', `telegram-code:${user.id}`, { limit: 3, window: 900 })
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please wait before generating another code.' },
                { status: 429 }
            )
        }

        // Get user's foundry_id
        const { data: profile } = await supabase
            .from('profiles')
            .select('foundry_id')
            .eq('id', user.id)
            .single()

        if (!profile?.foundry_id) {
            return NextResponse.json({ error: 'User not in a foundry' }, { status: 403 })
        }

        const admin = getAdminClient()

        // Generate new code
        const code = generateVerificationCode()
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

        // Check for existing link
        const { data: existingLink } = await admin
            .from('messaging_links')
            .select('id, verified_at')
            .eq('profile_id', user.id)
            .eq('platform', 'telegram')
            .single()

        if (existingLink?.verified_at) {
            return NextResponse.json({ error: 'Telegram already linked' }, { status: 400 })
        }

        // Update or insert
        let error
        if (existingLink) {
            // Update existing pending link
            const result = await admin
                .from('messaging_links')
                .update({
                    verification_code: code,
                    verification_expires_at: expiresAt.toISOString(),
                })
                .eq('id', existingLink.id)
            error = result.error
        } else {
            // Create new link
            const result = await admin.from('messaging_links').insert({
                profile_id: user.id,
                foundry_id: profile.foundry_id,
                platform: 'telegram',
                platform_user_id: `pending_${user.id}_${Date.now()}`, // Unique placeholder
                verification_code: code,
                verification_expires_at: expiresAt.toISOString(),
            })
            error = result.error
        }

        if (error) {
            console.error('Error creating verification code:', error)
            return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 })
        }

        return NextResponse.json({ code })
    } catch (error) {
        console.error('Generate code error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
