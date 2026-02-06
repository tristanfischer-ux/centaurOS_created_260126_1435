import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NewTeamForm } from './new-team-form'

export default async function NewTeamPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Get foundry_id
    const { data: currentUserProfile } = await supabase
        .from('profiles')
        .select('foundry_id, role')
        .eq('id', user.id)
        .single()

    const foundry_id = currentUserProfile?.foundry_id || user.app_metadata?.foundry_id

    if (!foundry_id) {
        return <div className="p-8 text-destructive">Error: No Foundry associated with your account.</div>
    }

    // Fetch all profiles for member selection
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, role, avatar_url, bio')
        .eq('foundry_id', foundry_id)
        .order('role', { ascending: true })

    // Fetch tasks for workload context
    const { data: tasks } = await supabase
        .from('tasks')
        .select('id, assignee_id, status')
        .eq('foundry_id', foundry_id)

    // Calculate task metrics per member
    const membersWithMetrics = (profiles || []).map(profile => {
        const memberTasks = (tasks || []).filter(t => t.assignee_id === profile.id)
        return {
            id: profile.id,
            full_name: profile.full_name || 'Unknown',
            role: profile.role || 'Apprentice',
            avatar_url: profile.avatar_url,
            bio: profile.bio,
            activeTasks: memberTasks.filter(t => t.status === 'Accepted').length,
            completedTasks: memberTasks.filter(t => t.status === 'Completed').length,
            pendingTasks: memberTasks.filter(t => t.status === 'Pending').length,
        }
    })

    return <NewTeamForm members={membersWithMetrics} />
}
