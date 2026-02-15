/**
 * Check if Telegram is linked
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rate-limit'

export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // SECURITY: Rate limit link status checks to reduce abuse/enumeration.
        const rateLimitResult = await rateLimit('api', `telegram-check-link:${user.id}`, {
            limit: 60,
            window: 60 * 1000,
        })
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please wait before checking again.' },
                { status: 429 }
            )
        }

        const admin = createAdminClient()

        // Check for verified link
        const { data: link } = await admin
            .from('messaging_links')
            .select('id, platform_username, verified_at')
            .eq('profile_id', user.id)
            .eq('platform', 'telegram')
            .not('verified_at', 'is', null)
            .single()

        return NextResponse.json({
            linked: !!(link as { verified_at: string | null } | null)?.verified_at,
            link: link || null,
        })
    } catch (error) {
        console.error('Check link error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
