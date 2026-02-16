import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GuildPageContent } from './guild-page-content'

export const dynamic = 'force-dynamic'

/**
 * Guild page — community hub for apprentice management, events, and networking.
 *
 * @description Server component that handles auth, role checks, and data loading.
 * Passes pre-fetched data to GuildPageContent client component.
 *
 * @security
 * - Requires authentication
 * - Only Founders, Executives, and Apprentices can access
 * - Non-authorized roles are redirected to /updates
 * - Members are filtered to Guild-relevant roles only
 */
export default async function GuildPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // AUTH: Get current user profile for role-based access
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, foundry_id')
        .eq('id', user.id)
        .single()

    if (!profile) {
        return (
            <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-status-warning-light mx-auto">
                    <AlertTriangle className="h-7 w-7 text-status-warning" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-xl font-bold text-foreground">Profile Setup Incomplete</h1>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Your account profile hasn&apos;t been fully set up yet.
                        Please complete the onboarding process or contact support if this persists.
                    </p>
                </div>
                <div className="flex gap-3 justify-center">
                    <Button asChild>
                        <Link href="/today">Go to Dashboard</Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/settings">Settings</Link>
                    </Button>
                </div>
            </div>
        )
    }

    // AUTH: Role-based access control
    const canManageAssignments = profile.role === 'Founder' || profile.role === 'Executive'
    const isApprentice = profile.role === 'Apprentice'
    const isExecutive = profile.role === 'Founder' || profile.role === 'Executive'

    if (!canManageAssignments && !isApprentice) {
        redirect('/updates')
    }

    // Fetch guild-relevant members for the network tab
    // SECURITY: Only show members from the current user's foundry
    const { data: members } = await supabase
        .from('profiles')
        .select('id, full_name, role, email, foundry_id')
        .eq('foundry_id', profile.foundry_id)
        .in('role', ['Apprentice', 'Executive', 'Founder'])
        .order('full_name', { ascending: true })
        .limit(50)

    // Resolve foundry names in a single batch query to avoid FK join issues
    const foundryIds = [...new Set((members || [])
        .map(m => m.foundry_id)
        .filter((id): id is string => !!id)
    )]

    let foundryMap: Record<string, string> = {}
    if (foundryIds.length > 0) {
        const { data: foundries } = await supabase
            .from('foundries')
            .select('id, name')
            .in('id', foundryIds)

        foundryMap = (foundries || []).reduce((acc, f) => {
            acc[f.id] = f.name
            return acc
        }, {} as Record<string, string>)
    }

    const membersWithFoundry = (members || []).map(m => ({
        id: m.id,
        full_name: m.full_name,
        role: m.role,
        email: m.email,
        foundry_name: m.foundry_id ? foundryMap[m.foundry_id] : undefined,
    }))

    return (
        <GuildPageContent
            isManager={canManageAssignments}
            isApprentice={isApprentice}
            isExecutive={isExecutive}
            currentUserId={user.id}
            members={membersWithFoundry}
        />
    )
}
