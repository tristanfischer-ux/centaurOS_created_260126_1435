import { createClient } from '@/lib/supabase/server'
import { VoiceRecorder } from '@/components/tasks/voice-recorder'
import { TasksView } from './tasks-view'

export default async function TasksPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return <div className="p-8 text-red-500">Unauthenticated.</div>
    }

    const { data: tasks, error } = await supabase
        .from('tasks')
        .select('*, assignee:profiles!assignee_id(id, full_name, role, email)')
        .order('created_at', { ascending: false })

    if (error) {
        return <div className="text-red-500">Error loading tasks</div>
    }

    // Fetch current user's profile to get role
    const { data: currentUserProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const currentUserRole = currentUserProfile?.role

    // Fetch data for the dialog and cards
    const objectives = await supabase.from('objectives').select('id, title').then(r => r.data || [])
    const membersData = await supabase.from('profiles').select('id, full_name, role, email')
    const members = (membersData.data || []).map(p => ({
        id: p.id,
        full_name: p.full_name || 'Unknown',
        role: p.role,
        email: p.email
    }))

    // Join tasks with assignees
    const tasksWithAssignees = tasks?.map(task => ({
        ...task,
        assignee: Array.isArray(task.assignee) ? task.assignee[0] : task.assignee
    })) || []

    return (
        <>
            <TasksView
                tasks={tasksWithAssignees}
                objectives={objectives}
                members={members}
                currentUserId={user.id}
                currentUserRole={currentUserRole}
            />
            <VoiceRecorder />
        </>
    )
}
