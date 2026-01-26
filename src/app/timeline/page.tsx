import { createClient } from '@/lib/supabase/server'
import { GanttView, JoinedTask } from '@/components/timeline/GanttView'
import { TimelineListView } from '@/components/timeline/TimelineListView'

export default async function TimelinePage() {
    const supabase = await createClient()

    // Verify Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return <div className="p-8 text-red-500">Unauthenticated</div>
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

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex-none">
                <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Campaign Timeline</h1>
                <p className="text-gray-400">Visualizing the Foundry&apos;s execution vector.</p>
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
                <TimelineListView tasks={tasks as unknown as JoinedTask[]} />
            </div>
        </div>
    )
}
