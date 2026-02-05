import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TasksView } from './tasks-view'

// Revalidate every 60 seconds
export const revalidate = 60

interface TasksPageProps {
    searchParams: Promise<{ taskId?: string }>
}

export default async function TasksPage({ searchParams }: TasksPageProps) {
    const params = await searchParams
    const taskId = params.taskId

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Get current user's foundry_id first for security filtering
    const { data: userProfile } = await supabase
        .from('profiles')
        .select('foundry_id, role')
        .eq('id', user.id)
        .single()

    const foundry_id = userProfile?.foundry_id

    if (!foundry_id) {
        return (
            <div className="p-8">
                <h1 className="font-bold mb-2 text-destructive">Error: No Foundry</h1>
                <p className="text-muted-foreground">
                    No foundry associated with your account. Please contact support.
                </p>
            </div>
        )
    }

    // SECURITY: Filter tasks by foundry_id to ensure data isolation
    // RLS policies also enforce this, but defense-in-depth is critical
    const { data: tasks, error } = await supabase
        .from('tasks')
        .select(`
            *,
            assignee:profiles!assignee_id(id, full_name, role),
            creator:profiles!creator_id(id, full_name, role),
            objective:objectives!objective_id(id, title),
            task_files(id, file_name, file_size, created_at),
            task_assignees(profile:profiles(id, full_name, role))
        `)
        .eq('foundry_id', foundry_id)
        .order('created_at', { ascending: false })

    if (error) {
        // SECURITY: Log detailed error server-side only, show generic message to user
        console.error("Error loading tasks:", error)
        return (
            <div className="p-8">
                <h1 className="font-bold mb-2 text-destructive">Error loading tasks</h1>
                <p className="text-muted-foreground">
                    Unable to load tasks. Please try refreshing the page or contact support if the problem persists.
                </p>
            </div>
        )
    }

    // Fetch message counts for all tasks
    const tasksWithMessageCounts = await Promise.all(
        (tasks || []).map(async (task) => {
            const { count } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('task_id', task.id)

            return {
                ...task,
                message_count: count || 0
            }
        })
    )

    // SECURITY: Filter all queries by foundry_id to ensure data isolation
    // Note: Profiles RLS is disabled due to recursion issues, so app-level filtering is CRITICAL
    const [
        { data: objectives },
        { data: membersData },
        { data: teamsData }
    ] = await Promise.all([
        supabase.from('objectives').select('id, title').eq('foundry_id', foundry_id),
        supabase.from('profiles').select('id, full_name, role, email').eq('foundry_id', foundry_id),
        supabase.from('teams').select('id, name').eq('foundry_id', foundry_id)
    ])

    const currentUserRole = userProfile?.role
    const objectivesList = objectives || []
    const members = (membersData || []).map(p => ({
        id: p.id,
        full_name: p.full_name || 'Unknown',
        role: p.role,
        email: p.email || ''
    }))
    const teams = teamsData || []

    // Join tasks with related data
    const tasksWithData = tasksWithMessageCounts.map(task => ({
        ...task,
        assignee: Array.isArray(task.assignee) ? task.assignee[0] : task.assignee,
        creator: Array.isArray(task.creator) ? task.creator[0] : task.creator,
        objective: Array.isArray(task.objective) ? task.objective[0] : task.objective,
        assignees: task.task_assignees?.map(ta => ta.profile).filter(Boolean) || [],
        task_files: task.task_files || []
    }))

    return (
        <TasksView
                tasks={tasksWithData}
                objectives={objectivesList}
                members={members}
                teams={teams}
                currentUserId={user.id}
                currentUserRole={currentUserRole}
                initialTaskId={taskId}
        />
    )
}
