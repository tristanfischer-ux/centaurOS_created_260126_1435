import { createClient } from '@/lib/supabase/server'
import { TeamComparisonView } from './team-comparison-view'
import { AddMemberDialog } from './add-member-dialog'

export default async function TeamPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return <div className="p-8 text-red-500">Unauthenticated. Please login.</div>
    }

    // Fetch profiles
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        return <div className="text-red-500">Error loading team</div>
    }

    // Fetch all tasks for task metrics
    const { data: tasks } = await supabase
        .from('tasks')
        .select('assignee_id, status')

    // Calculate metrics per member
    const membersWithMetrics = profiles?.map(profile => {
        const memberTasks = tasks?.filter(t => t.assignee_id === profile.id) || []
        return {
            id: profile.id,
            full_name: profile.full_name,
            email: profile.email,
            role: profile.role,
            activeTasks: memberTasks.filter(t => t.status === 'Accepted').length,
            completedTasks: memberTasks.filter(t => t.status === 'Completed').length,
            pendingTasks: memberTasks.filter(t => t.status === 'Pending').length,
            rejectedTasks: memberTasks.filter(t => t.status === 'Rejected').length,
        }
    }) || []

    const executives = membersWithMetrics.filter(p => p.role === 'Executive')
    const apprentices = membersWithMetrics.filter(p => p.role === 'Apprentice')

    return (
        <div className="relative">
            {/* Add Member button in top right */}
            <div className="absolute top-0 right-0">
                <AddMemberDialog />
            </div>
            <TeamComparisonView executives={executives} apprentices={apprentices} />
        </div>
    )
}
