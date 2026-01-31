/**
 * Unlink Telegram account
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

export async function POST() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const admin = getAdminClient()

        // Delete the messaging link
        const { error } = await admin
            .from('messaging_links')
            .delete()
            .eq('profile_id', user.id)
            .eq('platform', 'telegram')

        if (error) {
            console.error('Error unlinking Telegram:', error)
            return NextResponse.json({ error: 'Failed to unlink' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Unlink error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
