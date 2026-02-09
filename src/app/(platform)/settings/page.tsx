import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { TelegramLink } from '@/components/settings/telegram-link'
import { ReportPreferences } from '@/components/settings/report-preferences'
import { PrivacySettings } from '@/components/gdpr/PrivacySettings'

// Type helper for untyped tables
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = any

// Admin client for messaging_links table (not in types yet)
function getAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) return null
    return createAdminClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

/**
 * Personal Settings Page
 * 
 * @description Personal user preferences including messaging integrations,
 * notifications, and GDPR privacy controls. Accessible to all users.
 */
export default async function SettingsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Get existing Telegram link using admin client (table not in types yet)
    const admin = getAdminClient()
    let telegramLink: { id: string; platform_username: string | null; verified_at: string | null } | null = null
    
    if (admin) {
        const { data } = await admin
            .from('messaging_links')
            .select('id, platform_username, verified_at')
            .eq('profile_id', user.id)
            .eq('platform', 'telegram')
            .single()
        telegramLink = data as typeof telegramLink
    }

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'ForgeOSBot'

    // Get user's data requests for privacy section
    const untypedSupabase = supabase as UntypedClient
    const { data: dataRequests } = await untypedSupabase
        .from("data_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

    return (
        <div className="space-y-6">
            <TelegramLink 
                initialLink={telegramLink} 
                botUsername={botUsername}
            />

            <ReportPreferences 
                hasTelegramLinked={!!telegramLink?.verified_at}
            />

            <PrivacySettings initialRequests={dataRequests || []} />
        </div>
    )
}
