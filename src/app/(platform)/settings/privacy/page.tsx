import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PrivacySettings } from '@/components/gdpr/PrivacySettings'
import type { DataRequest } from '@/types/gdpr'

export const dynamic = 'force-dynamic'

/**
 * Privacy & Data Settings Page
 *
 * @description GDPR privacy controls including data access, export, and deletion
 * requests. Accessible to all users.
 */
export default async function PrivacyPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // GOTCHA: data_requests table may not be in generated types yet, so we
    // query untyped. The table exists via GDPR migration.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dataRequests } = await (supabase as any)
        .from("data_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

    return (
        <div className="space-y-6">
            <PrivacySettings initialRequests={(dataRequests as DataRequest[]) || []} />
        </div>
    )
}
