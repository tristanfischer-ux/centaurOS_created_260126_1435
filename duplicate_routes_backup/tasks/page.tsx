import { createClient } from '@/lib/supabase/server'
import { TaskCard } from './task-card'
import { CreateTaskDialog } from './create-task-dialog'
import { VoiceRecorder } from '@/components/tasks/voice-recorder'

export default async function TasksPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return <div className="p-8 text-red-500">Unauthenticated.</div>
    }

    const { data: tasks, error } = await supabase
        .from('tasks')
        .select('*, assignee:assignee_id(id, full_name, role, email)')
        .order('created_at', { ascending: false })

    if (error) {
        return <div className="text-red-500">Error loading tasks</div>
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Task Engine</h1>
                    <p className="text-slate-500">Democratic workflow management.</p>
                </div>
                <CreateTaskDialog />
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {tasks?.map(task => (
                    <TaskCard key={task.id} task={task} currentUserId={user.id} />
                ))}
                {tasks?.length === 0 && (
                    <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 rounded-lg text-slate-500">
                        No active tasks. Create one to start the engine.
                    </div>
                )}
            </div>
            <VoiceRecorder />
        </div>
    )
}
