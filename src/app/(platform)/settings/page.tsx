import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import { SignOutCard } from './sign-out-card'
import { RestartSetupWizardCard } from '@/components/onboarding/restart-setup-wizard-card'
import { ClearDemoDataButton } from '@/components/settings/clear-demo-data-button'
import {
    User,
    ArrowRight,
    Bell,
    Shield,
    Mail,
    FileSpreadsheet,
    Trash2,
} from 'lucide-react'

/**
 * Account Settings Page (default settings landing)
 *
 * @description Overview of the user's account with quick links to profile,
 * notification preferences, and sign-out. This is the first thing users see
 * when they click Settings.
 */
export default async function SettingsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role, avatar_url, email')
        .eq('id', user.id)
        .single()

    const displayName = profile?.full_name || user.email?.split('@')[0] || 'User'
    const displayEmail = profile?.email || user.email || ''
    const role = profile?.role || 'Member'

    return (
        <div className="space-y-6 max-w-3xl">
            {/* Profile summary card */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <UserAvatar
                            name={displayName}
                            role={role}
                            avatarUrl={profile?.avatar_url}
                            size="xl"
                        />
                        <div className="flex-1 min-w-0">
                            <h2 className="text-lg font-semibold text-foreground truncate">
                                {displayName}
                            </h2>
                            <p className="text-sm text-muted-foreground truncate">{displayEmail}</p>
                            <Badge variant="secondary" className="mt-1.5">{role}</Badge>
                        </div>
                        <Link href="/me">
                            <Button variant="outline" size="sm">
                                <User className="h-4 w-4 mr-2" />
                                Edit Profile
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>

            {/* Quick links */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                <Link href="/settings/billing" className="block">
                    <Card className="h-full hover:shadow-md transition-shadow">
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-international-orange-light text-international-orange">
                                    <Mail className="h-5 w-5" />
                                </div>
                                <CardTitle className="text-base">Billing & Usage</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <CardDescription>Manage your subscription, view AI usage, and upgrade your plan.</CardDescription>
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/settings/privacy" className="block">
                    <Card className="h-full hover:shadow-md transition-shadow">
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-status-info-light text-status-info">
                                    <Shield className="h-5 w-5" />
                                </div>
                                <CardTitle className="text-base">Privacy & Data</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <CardDescription>Exercise your GDPR rights: access, export, or delete your data.</CardDescription>
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/settings/integrations" className="block">
                    <Card className="h-full hover:shadow-md transition-shadow">
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-success/10 text-success">
                                    <FileSpreadsheet className="h-5 w-5" />
                                </div>
                                <CardTitle className="text-base">Integrations</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <CardDescription>Sync tasks and objectives to Google Sheets for your whole team.</CardDescription>
                        </CardContent>
                    </Card>
                </Link>
            </div>

            {/* Setup wizard restart */}
            <ClearDemoDataButton />
            <RestartSetupWizardCard />

            {/* Notification preferences teaser */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Bell className="h-5 w-5 text-international-orange" />
                        <CardTitle>Notifications</CardTitle>
                    </div>
                    <CardDescription>
                        Configure how and when you receive notifications from ForgeOS.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col items-center justify-center py-4 text-center rounded-lg bg-muted/30">
                        <Bell className="h-8 w-8 text-muted-foreground mb-3" />
                        <p className="text-sm font-medium text-foreground">Coming soon</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                            Granular notification controls are being built. You'll be able to configure
                            email, in-app, and Telegram notification preferences here.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Sign out */}
            <SignOutCard />

            {/* Delete account */}
            <Link href="/settings/account" className="block">
                <Card className="border-destructive/30 hover:shadow-md transition-shadow">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
                                <Trash2 className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-foreground">Delete Account</p>
                                <p className="text-xs text-muted-foreground">Permanently delete your account and all associated data.</p>
                            </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </CardContent>
                </Card>
            </Link>
        </div>
    )
}
