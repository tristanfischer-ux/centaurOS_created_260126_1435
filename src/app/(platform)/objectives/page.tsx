import { createClient } from '@/lib/supabase/server'
import { CreateObjectiveDialog } from './create-objective-dialog'
import { ObjectivesListView } from './objectives-list-view'

export default async function ObjectivesPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return <div className="p-8 text-red-500">Unauthenticated. Please login.</div>
    }

    // Fetch objectives
    const { data: objectives, error } = await supabase
        .from('objectives')
        .select('*')
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
            assignee:profiles!tasks_assignee_id_fkey(full_name, role)
        `)
        .not('objective_id', 'is', null)
        .order('end_date', { ascending: true })

    // Group tasks by objective
    const objectivesWithTasks = objectives?.map(obj => ({
        ...obj,
        tasks: tasks?.filter(t => t.objective_id === obj.id).map(t => ({
            ...t,
            assignee: t.assignee as unknown as { full_name: string | null; role: string | null } | null
        })) || []
    })) || []

    const count = objectives?.length || 0
    const maxObjectives = 10
    const usagePercentage = (count / maxObjectives) * 100

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Strategic Objectives</h1>
                    <p className="text-slate-500">High-level goals driving the Foundry.</p>
                </div>
                <CreateObjectiveDialog disabled={count >= maxObjectives} />
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4 max-w-md shadow-sm">
                <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-500">Capacity</span>
                    <span className={count >= maxObjectives ? "text-red-500 font-bold" : "text-amber-600"}>
                        {count} / {maxObjectives}
                    </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-500 ${count >= maxObjectives ? 'bg-red-600' : 'bg-accent'}`}
                        style={{ width: `${usagePercentage}%` }}
                    />
                </div>
            </div>

            <ObjectivesListView objectives={objectivesWithTasks} />
        </div>
    )
}
