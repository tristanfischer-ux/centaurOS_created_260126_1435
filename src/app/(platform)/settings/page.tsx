import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { redirect } from 'next/navigation'
import { TelegramLink } from '@/components/settings/telegram-link'
import { ReportPreferences } from '@/components/settings/report-preferences'
import { HelpCircle, GraduationCap, Book, Keyboard, MessageSquare, FileText, ExternalLink } from 'lucide-react'
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
            <div className="pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3 mb-1">
                    <div className="h-8 w-1 bg-orange-600 rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                    <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">Settings</h1>
                </div>
                <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">Configure your profile and preferences</p>
            </div>

            <Card className="bg-background border-slate-100 shadow-[0_2px_15px_rgba(0,0,0,0.03)]">
                <CardHeader>
                    <CardTitle>Profile Configuration</CardTitle>
                    <CardDescription>Manage your persona and foundry settings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Full Name</Label>
                            <div className="p-2 bg-muted rounded border border-slate-200">{profile?.full_name}</div>
                        </div>
                        <div>
                            <Label>Email</Label>
                            <div className="p-2 bg-muted rounded border border-slate-200">{profile?.email}</div>
                        </div>
                        <div>
                            <Label>Role</Label>
                            <div className="p-2 bg-muted rounded border border-slate-200 font-mono text-status-warning">{profile?.role}</div>
                        </div>
                        <div>
                            <Label>Company ID</Label>
                            <div className="p-2 bg-muted rounded border border-slate-200 text-xs font-mono">{profile?.foundry_id}</div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <TelegramLink 
                initialLink={telegramLink} 
                botUsername={botUsername}
            />

            <ReportPreferences 
                hasTelegramLinked={!!telegramLink?.verified_at}
            />

            {/* Help & Support Section */}
            <Card className="bg-background border-slate-100 shadow-[0_2px_15px_rgba(0,0,0,0.03)]">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <HelpCircle className="h-5 w-5 text-orange-600" />
                        <CardTitle>Help & Support</CardTitle>
                    </div>
                    <CardDescription>Resources and guides to help you get the most out of CentaurOS.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Quick Tips */}
                    <div className="p-4 bg-orange-50 rounded-lg border border-orange-100">
                        <div className="flex items-start gap-3">
                            <Keyboard className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-medium text-foreground">Pro Tip: Command Palette</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Press <kbd className="px-1.5 py-0.5 bg-white rounded border border-slate-200 font-mono text-xs">⌘K</kbd> (Mac) or <kbd className="px-1.5 py-0.5 bg-white rounded border border-slate-200 font-mono text-xs">Ctrl+K</kbd> (Windows) to quickly navigate, search, or perform actions from anywhere in the app.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Resource Links */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Link 
                            href="/advisory" 
                            className="group flex items-start gap-3 p-4 rounded-lg border border-slate-200 hover:border-orange-200 hover:bg-orange-50/50 transition-colors"
                        >
                            <div className="p-2 bg-muted rounded-lg group-hover:bg-orange-100 transition-colors">
                                <GraduationCap className="h-4 w-4 text-muted-foreground group-hover:text-orange-600 transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground group-hover:text-orange-700 transition-colors">Getting Started</p>
                                <p className="text-sm text-muted-foreground mt-0.5">Learn the fundamentals and maximize your productivity.</p>
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>

                        <Link 
                            href="/advisory" 
                            className="group flex items-start gap-3 p-4 rounded-lg border border-slate-200 hover:border-orange-200 hover:bg-orange-50/50 transition-colors"
                        >
                            <div className="p-2 bg-muted rounded-lg group-hover:bg-orange-100 transition-colors">
                                <Book className="h-4 w-4 text-muted-foreground group-hover:text-orange-600 transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground group-hover:text-orange-700 transition-colors">Documentation</p>
                                <p className="text-sm text-muted-foreground mt-0.5">Explore AI tools, integrations, and workflows.</p>
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>

                        <Link 
                            href="/advisory" 
                            className="group flex items-start gap-3 p-4 rounded-lg border border-slate-200 hover:border-orange-200 hover:bg-orange-50/50 transition-colors"
                        >
                            <div className="p-2 bg-muted rounded-lg group-hover:bg-orange-100 transition-colors">
                                <FileText className="h-4 w-4 text-muted-foreground group-hover:text-orange-600 transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground group-hover:text-orange-700 transition-colors">Best Practices</p>
                                <p className="text-sm text-muted-foreground mt-0.5">Task delegation, approvals, and team coordination.</p>
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>

                        <Link 
                            href="/advisory" 
                            className="group flex items-start gap-3 p-4 rounded-lg border border-slate-200 hover:border-orange-200 hover:bg-orange-50/50 transition-colors"
                        >
                            <div className="p-2 bg-muted rounded-lg group-hover:bg-orange-100 transition-colors">
                                <MessageSquare className="h-4 w-4 text-muted-foreground group-hover:text-orange-600 transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground group-hover:text-orange-700 transition-colors">Ask the Community</p>
                                <p className="text-sm text-muted-foreground mt-0.5">Get AI-powered insights verified by Guild experts.</p>
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                    </div>

                    {/* Support Contact */}
                    <div className="pt-4 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-foreground">Need more help?</p>
                                <p className="text-sm text-muted-foreground">Contact our support team for personalized assistance.</p>
                            </div>
                            <Link 
                                href="mailto:support@centauros.ai" 
                                className="text-sm font-medium text-orange-600 hover:text-orange-700 transition-colors"
                            >
                                support@centauros.ai
                            </Link>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-destructive/20 bg-status-error-light/50">
                <CardHeader>
                    <CardTitle className="text-destructive">Sign Out</CardTitle>
                    <CardDescription className="text-destructive">
                        Securely sign out of your account on this device. You will need to sign in again to access the platform.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={async () => {
                        'use server'
                        const { logSecurityEvent } = await import('@/lib/security/audit-log')
                        const supabase = await createClient()
                        const { data: { user } } = await supabase.auth.getUser()
                        // SECURITY: Log logout event before signing out
                        if (user) {
                            await logSecurityEvent({ type: 'LOGOUT', userId: user.id, success: true })
                        }
                        await supabase.auth.signOut()
                        redirect('/login')
                    }}>
                        <Button variant="destructive" className="w-full h-12 text-lg font-semibold">
                            Sign Out
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
