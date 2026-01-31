/**
 * Check if Telegram is linked
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Admin client for messaging_links table (not in types yet)
function getAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) throw new Error('Missing Supabase config')
    return createAdminClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const admin = getAdminClient()

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
