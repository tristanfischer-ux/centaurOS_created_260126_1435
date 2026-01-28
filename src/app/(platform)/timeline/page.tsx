import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GanttView, JoinedTask } from '@/components/timeline/GanttView'
import { TimelineListView } from '@/components/timeline/TimelineListView'
import { CreateTaskDialog } from '@/app/(platform)/tasks/create-task-dialog'

export default async function TimelinePage() {
    const supabase = await createClient()

    // Verify Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect('/login')
    }

    // Fetch Tasks with Joins
    const { data: tasks, error } = await supabase
        .from('tasks')
        .select(`
        *,
        profiles:assignee_id(*),
        objectives:objective_id(*)
    `)
        .order('start_date', { ascending: true })

    // Fetch Filter Data
    const { data: objectives } = await supabase.from('objectives').select('*')
    const { data: profiles } = await supabase.from('profiles').select('*')

    if (error) {
        console.error(error)
        return <div className="text-red-500">Error loading timeline data</div>
    }

    // Format members for CreateTaskDialog
    const members = (profiles || []).map(p => ({
        id: p.id,
        full_name: p.full_name || 'Unnamed',
        role: p.role || 'Apprentice'
    }))

    // Format objectives for CreateTaskDialog
    const objectivesList = (objectives || []).map(o => ({
        id: o.id,
        title: o.title || 'Untitled'
    }))

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex-none flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Campaign Timeline</h1>
                    <p className="text-muted-foreground">Visualizing the Foundry&apos;s execution vector.</p>
                </div>
                <CreateTaskDialog
                    objectives={objectivesList}
                    members={members}
                    currentUserId={user.id}
                />
            </div>

            {/* Desktop: Gantt Chart */}
            <div className="flex-1 min-h-[500px] hidden md:block">
                <GanttView
                    tasks={tasks as unknown as JoinedTask[]}
                    objectives={objectives || []}
                    profiles={profiles || []}
                />
            </div>

            {/* Mobile: List Timeline View */}
            <div className="md:hidden">
                <TimelineListView
                    tasks={tasks as unknown as JoinedTask[]}
                    members={members}
                    currentUserId={user.id}
                />
            </div>
        </div>
    )
}
