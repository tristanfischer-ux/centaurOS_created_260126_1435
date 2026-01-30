import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GuildPageContent } from './guild-page-content'

export default async function GuildPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Get current user profile
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, foundry_id')
        .eq('id', user.id)
        .single()

    if (!profile) {
        redirect('/login')
    }

    // Check if user is a Founder or Executive (can browse pool and assign)
    // Or an Apprentice (can view their own assignments)
    const canManageAssignments = profile.role === 'Founder' || profile.role === 'Executive'
    const isApprentice = profile.role === 'Apprentice'

    if (!canManageAssignments && !isApprentice) {
        redirect('/dashboard')
    }

    return <GuildPageContent isManager={canManageAssignments} isApprentice={isApprentice} />
}
