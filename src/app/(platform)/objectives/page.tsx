import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateObjectiveDialog } from './create-objective-dialog'
import { ObjectivesListView } from './objectives-list-view'
import { FeatureTipWrapper } from './feature-tip-wrapper'

// Revalidate every 60 seconds
export const revalidate = 60

export default async function ObjectivesPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Fetch objectives
    const { data: objectives, error } = await supabase
        .from('objectives')
        .select('id, title, description, extended_description, status, progress, parent_objective_id, creator_id, foundry_id, created_at, updated_at')
        .order('created_at', { ascending: false })

    if (error) {
        console.error(error)
        return <div className="text-red-500">Error loading objectives</div>
    }

    // Type definitions for task joins
    interface TaskAssignee {
        full_name: string | null
        role: string | null
    }

    interface TaskComment {
        id: string
        is_system_log: boolean | null
    }

    interface TaskFile {
        id: string
        file_name: string
        file_size: number | null
        created_at: string | null
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
            assignee: t.assignee as TaskAssignee | null,
            notesCount: (t.task_comments as TaskComment[] | null)?.filter(c => !c.is_system_log).length || 0,
            attachmentCount: (t.task_files as TaskFile[] | null)?.length || 0
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
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="h-8 w-1 bg-orange-600 rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                        <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">Strategic Objectives</h1>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">High level goals for your company</p>
                </div>
                <FeatureTipWrapper>
                    <CreateObjectiveDialog />
                </FeatureTipWrapper>
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
