import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { TelegramLink } from '@/components/settings/telegram-link'
import { ReportPreferences } from '@/components/settings/report-preferences'
import { AIProviders } from '@/components/settings/ai-providers'
import { ProfileCard } from './profile-card'
import { SignOutCard } from './sign-out-card'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HelpCircle, Keyboard, GraduationCap, Book, MessageSquare, ExternalLink } from 'lucide-react'
import Link from 'next/link'

// Admin client for messaging_links table (not in types yet)
function getAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) return null
    return createAdminClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

export default async function SettingsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

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

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'CentaurOSBot'

    return (
        <div className="space-y-6">
            {/* Profile Configuration */}
            <ProfileCard
                profileId={profile?.id || user.id}
                fullName={profile?.full_name || ''}
                email={profile?.email || user.email || ''}
                role={profile?.role || ''}
                foundryId={profile?.foundry_id || ''}
            />

            {/* AI Providers */}
            <AIProviders />

            {/* Telegram Integration */}
            <TelegramLink 
                initialLink={telegramLink} 
                botUsername={botUsername}
            />

            {/* Report Preferences */}
            <ReportPreferences 
                hasTelegramLinked={!!telegramLink?.verified_at}
            />

            {/* Help & Support Section */}
            <Card className="bg-background border-slate-200 shadow-[0_2px_15px_rgba(0,0,0,0.03)] overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-amber-50/60 to-transparent border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 rounded-lg">
                            <HelpCircle className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                            <CardTitle>Help & Support</CardTitle>
                            <CardDescription>Resources and guides to help you get the most out of CentaurOS.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                    {/* Quick Tips */}
                    <div className="p-4 bg-gradient-to-r from-international-orange-light to-orange-50/30 rounded-lg border border-international-orange/15">
                        <div className="flex items-start gap-3">
                            <Keyboard className="h-5 w-5 text-international-orange mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-medium text-foreground">Pro Tip: Command Palette</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Press <kbd className="px-1.5 py-0.5 bg-white rounded border border-slate-200 font-mono text-xs shadow-sm">⌘K</kbd> (Mac) or <kbd className="px-1.5 py-0.5 bg-white rounded border border-slate-200 font-mono text-xs shadow-sm">Ctrl+K</kbd> (Windows) to quickly navigate, search, or perform actions from anywhere in the app.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Resource Links */}
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Link 
                            href="/advisory" 
                            className="group flex items-start gap-3 p-4 rounded-lg border border-slate-200 hover:border-international-orange/40 hover:bg-international-orange-light hover:shadow-sm transition-all duration-200"
                        >
                            <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-international-orange-light transition-colors">
                                <GraduationCap className="h-4 w-4 text-muted-foreground group-hover:text-international-orange transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground group-hover:text-international-orange transition-colors">Getting Started</p>
                                <p className="text-sm text-muted-foreground mt-0.5">Learn the fundamentals and set up your workspace.</p>
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                        </Link>

                        <Link 
                            href="/advisory" 
                            className="group flex items-start gap-3 p-4 rounded-lg border border-slate-200 hover:border-international-orange/40 hover:bg-international-orange-light hover:shadow-sm transition-all duration-200"
                        >
                            <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-international-orange-light transition-colors">
                                <Book className="h-4 w-4 text-muted-foreground group-hover:text-international-orange transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground group-hover:text-international-orange transition-colors">Documentation</p>
                                <p className="text-sm text-muted-foreground mt-0.5">Explore AI tools, integrations, and workflows.</p>
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                        </Link>

                        <Link 
                            href="mailto:support@centauros.ai" 
                            className="group flex items-start gap-3 p-4 rounded-lg border border-slate-200 hover:border-international-orange/40 hover:bg-international-orange-light hover:shadow-sm transition-all duration-200 sm:col-span-2"
                        >
                            <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-international-orange-light transition-colors">
                                <MessageSquare className="h-4 w-4 text-muted-foreground group-hover:text-international-orange transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground group-hover:text-international-orange transition-colors">Contact Support</p>
                                <p className="text-sm text-muted-foreground mt-0.5">Get personalised help from our team at support@centauros.ai</p>
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                        </Link>
                    </div>
                </CardContent>
            </Card>

            {/* Sign Out */}
            <SignOutCard />
        </div>
    )
}
