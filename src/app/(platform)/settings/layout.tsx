import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsNavigation } from '@/components/settings/settings-navigation'

export default async function SettingsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="pb-4 border-b">
                <div className="flex items-center gap-3 mb-1">
                    <div className="h-8 w-1 bg-international-orange rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                    <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">Settings</h1>
                </div>
                <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">Account, billing, and privacy preferences</p>
            </div>

            {/* Tab Navigation */}
            <SettingsNavigation />

            {/* Content */}
            <div>{children}</div>
        </div>
    )
}
