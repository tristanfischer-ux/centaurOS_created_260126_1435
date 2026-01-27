import { createClient } from '@/lib/supabase/server'
import { TasksView } from './tasks-view'

// Revalidate every 60 seconds
export const revalidate = 60

export default async function TasksPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return <div className="p-8 text-red-500">Unauthenticated.</div>
    }

    const { data: tasks, error } = await supabase
        .from('tasks')
        .select(`
            *,
            assignee:profiles!assignee_id(id, full_name, role, email),
            creator:profiles!creator_id(id, full_name, role),
            objective:objectives!objective_id(id, title),
            task_files(id, file_name, file_size, created_at)
        `)
        .order('created_at', { ascending: false })

    if (error) {
        console.error("Error loading tasks:", error)
        return (
            <div className="p-8 text-red-500">
                <h1 className="font-bold mb-2">Error loading tasks</h1>
                <pre className="bg-red-50 p-4 rounded text-sm overflow-auto">
                    {JSON.stringify(error, null, 2)}
                </pre>
            </div>
        )
    }

    // Parallelize independent queries
    const [
        { data: currentUserProfile },
        { data: objectives },
        { data: membersData },
        { data: teamsData }
    ] = await Promise.all([
        supabase.from('profiles').select('id, foundry_id, role').eq('id', user.id).single(),
        supabase.from('objectives').select('id, title'),
        supabase.from('profiles').select('id, full_name, role, email'),
        supabase.from('teams').select('id, name')
    ])

    const currentUserRole = currentUserProfile?.role
    const objectivesList = objectives || []
    const members = (membersData || []).map(p => ({
        id: p.id,
        full_name: p.full_name || 'Unknown',
        role: p.role,
        email: p.email
    }))
    const teams = teamsData || []

    // Join tasks with related data
    const tasksWithData = tasks?.map(task => ({
        ...task,
        assignee: Array.isArray(task.assignee) ? task.assignee[0] : task.assignee,
        creator: Array.isArray(task.creator) ? task.creator[0] : task.creator,
        objective: Array.isArray(task.objective) ? task.objective[0] : task.objective,
        assignees: [], // Temporarily disabled while debugging task_assignees join
        task_files: task.task_files || []
    })) || []

    return (
        <TasksView
            tasks={tasksWithData}
            objectives={objectivesList}
            members={members}
            teams={teams}
            currentUserId={user.id}
            currentUserRole={currentUserRole}
        />
    )
}
