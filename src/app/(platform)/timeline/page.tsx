import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GanttView, JoinedTask } from '@/components/timeline/GanttView'
import { TimelineListView } from '@/components/timeline/TimelineListView'
import { CreateTaskDialog } from '@/app/(platform)/tasks/create-task-dialog'
import { Database } from '@/types/database.types'

// Force dynamic rendering to ensure fresh data on router.refresh()
export const dynamic = 'force-dynamic'

export default async function TimelinePage() {
    const supabase = await createClient()

    // Verify Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect('/login')
    }

    // Fetch Tasks with Joins (including multiple assignees)
    const { data: tasks, error } = await supabase
        .from('tasks')
        .select(`
        *,
        profiles:assignee_id(*),
        objectives:objective_id(*),
        task_assignees(profile:profiles(id, full_name, role))
    `)
        .order('start_date', { ascending: true })

    // Fetch Filter Data
    // SECURITY: Don't fetch email in SSR to prevent exposure in page source
    const { data: objectives } = await supabase.from('objectives').select('*')
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, role')

    if (error) {
        console.error(error)
        return <div className="text-destructive">Error loading timeline data</div>
    }

    // Format members for CreateTaskDialog and TimelineListView
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
            <div className="flex-none flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="h-8 w-1 bg-orange-600 rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                        <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">Timeline</h1>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">When tasks are due</p>
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
                    profiles={profiles as unknown as Database["public"]["Tables"]["profiles"]["Row"][]}
                    members={members}
                    currentUserId={user.id}
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
