"use client"

import { useState } from "react"
import { TaskCard } from "./task-card"
import { Button } from "@/components/ui/button"
import { LayoutGrid, List } from "lucide-react"
import { CreateTaskDialog } from "./create-task-dialog"
import { Database } from "@/types/database.types"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { ThreadDrawer } from "./thread-drawer"

type Task = Database["public"]["Tables"]["tasks"]["Row"] & {
    assignee?: { id: string, full_name: string | null, role: string, email: string }
}

type Objective = {
    id: string
    title: string
}

type Member = {
    id: string
    full_name: string
    role: string
}

interface TasksViewProps {
    tasks: Task[]
    objectives: Objective[]
    members: Member[]
    currentUserId: string
    currentUserRole?: string
}

export function TasksView({ tasks, objectives, members, currentUserId, currentUserRole }: TasksViewProps) {
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [selectedTask, setSelectedTask] = useState<Task | null>(null)

    // Group tasks by objective
    const tasksByObjective: Record<string, Task[]> = {}
    const orphanedTasks: Task[] = []

    tasks.forEach(task => {
        if (task.objective_id) {
            if (!tasksByObjective[task.objective_id]) {
                tasksByObjective[task.objective_id] = []
            }
            tasksByObjective[task.objective_id].push(task)
        } else {
            orphanedTasks.push(task)
        }
    })

    return (
        <>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Tasks</h1>
                        <p className="text-slate-500">Democratic workflow management.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="bg-slate-100 p-1 rounded-lg flex items-center mr-2">
                            <Button
                                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setViewMode('grid')}
                                className={viewMode === 'grid' ? 'shadow-sm' : ''}
                            >
                                <LayoutGrid className="h-4 w-4" />
                            </Button>
                            <Button
                                variant={viewMode === 'list' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setViewMode('list')}
                                className={viewMode === 'list' ? 'shadow-sm' : ''}
                            >
                                <List className="h-4 w-4" />
                            </Button>
                        </div>
                        <CreateTaskDialog
                            objectives={objectives}
                            members={members}
                            currentUserId={currentUserId}
                        />
                    </div>
                </div>

                {viewMode === 'grid' ? (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {tasks.map(task => (
                            <TaskCard
                                key={task.id}
                                task={task}
                                currentUserId={currentUserId}
                                userRole={currentUserRole}
                                members={members}
                            />
                        ))}
                        {tasks.length === 0 && (
                            <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 rounded-lg text-slate-500">
                                No active tasks. Create one to start the engine.
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {objectives.map(objective => {
                            const objectiveTasks = tasksByObjective[objective.id] || []
                            if (objectiveTasks.length === 0) return null

                            return (
                                <div key={objective.id} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                                        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                                            <div className="bg-blue-600 w-2 h-2 rounded-full" />
                                            {objective.title}
                                            <Badge variant="outline" className="ml-2 bg-white text-slate-600 font-normal">
                                                {objectiveTasks.length} Tasks
                                            </Badge>
                                        </h3>
                                    </div>
                                    <div>
                                        {objectiveTasks.map(task => (
                                            <div
                                                key={task.id}
                                                className="pl-12 pr-6 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 flex items-center justify-between group gap-4 relative cursor-pointer"
                                                onClick={() => setSelectedTask(task)}
                                            >
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-blue-500 transition-colors" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-medium text-slate-900 truncate">{task.title}</span>
                                                        <StatusBadge status={task.status} />
                                                    </div>
                                                    <div className="flex items-center gap-4 text-xs text-slate-500">
                                                        <span className="truncate">{task.description}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6 flex-shrink-0 text-sm">
                                                    <div className="flex items-center gap-1 text-slate-600 w-32">
                                                        {task.assignee ? (
                                                            <>
                                                                {task.assignee.role === "AI_Agent" ? "🤖" : "👤"}
                                                                <span className="truncate">{task.assignee.full_name}</span>
                                                            </>
                                                        ) : (
                                                            <span className="text-slate-400 italic">Unassigned</span>
                                                        )}
                                                    </div>
                                                    <div className="text-slate-500 w-24 text-right">
                                                        {task.end_date ? format(new Date(task.end_date), 'MMM d') : '-'}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}

                        {orphanedTasks.length > 0 && (
                            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                                    <h3 className="font-semibold text-slate-600 flex items-center gap-2">
                                        <div className="bg-slate-400 w-2 h-2 rounded-full" />
                                        General Tasks (No Objective)
                                    </h3>
                                </div>
                                <div>
                                    {orphanedTasks.map(task => (
                                        <div
                                            key={task.id}
                                            className="px-6 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 flex items-center justify-between group gap-4 cursor-pointer"
                                            onClick={() => setSelectedTask(task)}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium text-slate-900 truncate">{task.title}</span>
                                                    <StatusBadge status={task.status} />
                                                </div>
                                                <div className="flex items-center gap-4 text-xs text-slate-500">
                                                    <span className="truncate">{task.description}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-6 flex-shrink-0 text-sm">
                                                <div className="flex items-center gap-1 text-slate-600 w-32">
                                                    {task.assignee ? (
                                                        <>
                                                            {task.assignee.role === "AI_Agent" ? "🤖" : "👤"}
                                                            <span className="truncate">{task.assignee.full_name}</span>
                                                        </>
                                                    ) : (
                                                        <span className="text-slate-400 italic">Unassigned</span>
                                                    )}
                                                </div>
                                                <div className="text-slate-500 w-24 text-right">
                                                    {task.end_date ? format(new Date(task.end_date), 'MMM d') : '-'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Task Detail Drawer */}
            <ThreadDrawer
                open={!!selectedTask}
                onOpenChange={(open) => !open && setSelectedTask(null)}
                taskId={selectedTask?.id || ''}
                taskTitle={selectedTask?.title || ''}
                taskStatus={selectedTask?.status || 'Pending'}
                taskDescription={selectedTask?.description || undefined}
                assigneeName={selectedTask?.assignee?.full_name || undefined}
                isAssignee={selectedTask?.assignee_id === currentUserId}
                isCreator={selectedTask?.creator_id === currentUserId}
            />
        </>
    )
}

function StatusBadge({ status }: { status: string | null }) {
    let color = 'bg-gray-500'
    if (status === 'Accepted') color = 'bg-green-600'
    if (status === 'Completed') color = 'bg-slate-800'
    if (status === 'Rejected') color = 'bg-red-600'

    return (
        <span className={`${color} text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium inline-block`}>
            {status || 'Pending'}
        </span>
    )
}
