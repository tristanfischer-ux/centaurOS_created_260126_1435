import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PrivacySettings } from '@/components/gdpr/PrivacySettings'

// Type helper for untyped tables
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = any

/**
 * Privacy & Data Settings Page
 * 
 * @description GDPR privacy controls including data access, export, and deletion
 * requests. Accessible to all users. Personal preferences (Telegram, notifications)
 * have moved to My Profile > Preferences tab.
 */
export default async function SettingsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Get user's data requests for privacy section
    const untypedSupabase = supabase as UntypedClient
    const { data: dataRequests } = await untypedSupabase
        .from("data_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

    return (
        <div className="space-y-6">
            <PrivacySettings initialRequests={dataRequests || []} />
        </div>
    )
}
