import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { redirect } from 'next/navigation'
import { TelegramLink } from '@/components/settings/telegram-link'
import { ReportPreferences } from '@/components/settings/report-preferences'
import { AIProviders } from '@/components/settings/ai-providers'
import { CompanyProfileCard } from '@/components/settings/company-profile-card'
import type { CompanyProfile } from '@/types/foundry'
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

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'ForgeOSBot'

    // Fetch company profile data for the foundry
    let companyProfile: CompanyProfile | null = null
    if (profile?.foundry_id) {
        const { data: foundryData } = await supabase.rpc('ensure_foundry_exists', {
            p_foundry_id: profile.foundry_id,
        })
        companyProfile = (foundryData as { company_profile?: CompanyProfile | null })?.company_profile ?? null
    }

    return (
        <div className="space-y-6">
            <CompanyProfileCard
                companyProfile={companyProfile}
                foundryId={profile?.foundry_id || ''}
                userId={user.id}
                isFounder={profile?.role === 'Founder'}
            />

            <AIProviders />

            <TelegramLink 
                initialLink={telegramLink} 
                botUsername={botUsername}
            />

            <ReportPreferences 
                hasTelegramLinked={!!telegramLink?.verified_at}
            />

            {/* Help & Support Section */}
            <Card className="bg-background border-muted shadow-[0_2px_15px_rgba(0,0,0,0.03)]">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <HelpCircle className="h-5 w-5 text-international-orange" />
                        <CardTitle>Help & Support</CardTitle>
                    </div>
                    <CardDescription>Resources and guides to help you get the most out of ForgeOS.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Quick Tips */}
                    <div className="p-4 bg-international-orange-light rounded-lg border border-international-orange/20">
                        <div className="flex items-start gap-3">
                            <Keyboard className="h-5 w-5 text-international-orange mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-medium text-foreground">Pro Tip: Command Palette</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Press <kbd className="px-1.5 py-0.5 bg-white rounded border border-muted font-mono text-xs">⌘K</kbd> (Mac) or <kbd className="px-1.5 py-0.5 bg-white rounded border border-muted font-mono text-xs">Ctrl+K</kbd> (Windows) to quickly navigate, search, or perform actions from anywhere in the app.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Resource Links */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Link 
                            href="/advisory" 
                            className="group flex items-start gap-3 p-4 rounded-lg border border-muted hover:border-international-orange/50 hover:bg-international-orange-light transition-colors"
                        >
                            <div className="p-2 bg-muted rounded-lg group-hover:bg-international-orange-light transition-colors">
                                <GraduationCap className="h-4 w-4 text-muted-foreground group-hover:text-international-orange transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground group-hover:text-international-orange transition-colors">Getting Started</p>
                                <p className="text-sm text-muted-foreground mt-0.5">Learn the fundamentals and maximize your productivity.</p>
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>

                        <Link 
                            href="/advisory" 
                            className="group flex items-start gap-3 p-4 rounded-lg border border-muted hover:border-international-orange/50 hover:bg-international-orange-light transition-colors"
                        >
                            <div className="p-2 bg-muted rounded-lg group-hover:bg-international-orange-light transition-colors">
                                <Book className="h-4 w-4 text-muted-foreground group-hover:text-international-orange transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground group-hover:text-international-orange transition-colors">Documentation</p>
                                <p className="text-sm text-muted-foreground mt-0.5">Explore AI tools, integrations, and workflows.</p>
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>

                        <Link 
                            href="/advisory" 
                            className="group flex items-start gap-3 p-4 rounded-lg border border-muted hover:border-international-orange/50 hover:bg-international-orange-light transition-colors"
                        >
                            <div className="p-2 bg-muted rounded-lg group-hover:bg-international-orange-light transition-colors">
                                <FileText className="h-4 w-4 text-muted-foreground group-hover:text-international-orange transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground group-hover:text-international-orange transition-colors">Best Practices</p>
                                <p className="text-sm text-muted-foreground mt-0.5">Task delegation, approvals, and team coordination.</p>
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>

                        <Link 
                            href="/advisory" 
                            className="group flex items-start gap-3 p-4 rounded-lg border border-muted hover:border-international-orange/50 hover:bg-international-orange-light transition-colors"
                        >
                            <div className="p-2 bg-muted rounded-lg group-hover:bg-international-orange-light transition-colors">
                                <MessageSquare className="h-4 w-4 text-muted-foreground group-hover:text-international-orange transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground group-hover:text-international-orange transition-colors">Ask the Community</p>
                                <p className="text-sm text-muted-foreground mt-0.5">Get AI-powered insights verified by Guild experts.</p>
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                    </div>

                    {/* Support Contact */}
                    <div className="pt-4 border-t border-muted">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-foreground">Need more help?</p>
                                <p className="text-sm text-muted-foreground">Contact our support team for personalized assistance.</p>
                            </div>
                            <Link 
                                href="mailto:support@forgeos.ai" 
                                className="text-sm font-medium text-international-orange hover:text-international-orange-hover transition-colors"
                            >
                                support@forgeos.ai
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
