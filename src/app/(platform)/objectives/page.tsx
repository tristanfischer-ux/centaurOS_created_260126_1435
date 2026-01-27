import { createClient } from '@/lib/supabase/server'
import { CreateObjectiveDialog } from './create-objective-dialog'
import { ObjectivesListView } from './objectives-list-view'

// Revalidate every 60 seconds
export const revalidate = 60

export default async function ObjectivesPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return <div className="p-8 text-red-500">Unauthenticated. Please login.</div>
    }

    // Fetch objectives
    const { data: objectives, error } = await supabase
        .from('objectives')
        .select('id, title, description, status, progress, parent_objective_id, creator_id, foundry_id, created_at, updated_at')
        .order('created_at', { ascending: false })

    if (error) {
        console.error(error)
        return <div className="text-red-500">Error loading objectives</div>
    }

    // Fetch tasks with assignee info for all objectives
    const { data: tasks } = await supabase
        .from('tasks')
        .select(`
            id,
            title,
            status,
            assignee_id,
            end_date,
            objective_id,
            assignee:profiles!tasks_assignee_id_fkey(full_name, role),
            task_comments(id, is_system_log),
            task_files(id, file_name, file_size, created_at)
        `)
        .not('objective_id', 'is', null)
        .order('end_date', { ascending: true })

    // Group tasks by objective
    const objectivesWithTasks = objectives?.map(obj => ({
        ...obj,
        tasks: tasks?.filter(t => t.objective_id === obj.id).map(t => ({
            ...t,
            assignee: t.assignee as unknown as { full_name: string | null; role: string | null } | null,
            notesCount: t.task_comments?.filter((c: { is_system_log: boolean | null }) => !c.is_system_log).length || 0,
            attachmentCount: (t.task_files as unknown as any[])?.length || 0
        })) || []
    })) || []

    // Fetch data for CreateTaskDialog
    const objectivesForDialog = await supabase.from('objectives').select('id, title').then(r => r.data || [])
    const membersData = await supabase.from('profiles').select('id, full_name, role')
    const members = (membersData.data || []).map(p => ({
        id: p.id,
        full_name: p.full_name || 'Unknown',
        role: p.role
    }))

    // Fetch Teams
    const { data: teamsData } = await supabase.from('teams').select('id, name')
    const teams = teamsData || []

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Strategic Objectives</h1>
                    <p className="text-slate-500">High-level goals driving the Foundry.</p>
                </div>
                <CreateObjectiveDialog />
            </div>

            <ObjectivesListView 
                objectives={objectivesWithTasks}
                objectivesForDialog={objectivesForDialog}
                members={members}
                teams={teams}
                currentUserId={user.id}
            />
        </div>
    )
}
