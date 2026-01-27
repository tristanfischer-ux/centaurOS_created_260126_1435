"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Target, CheckCircle2, Clock, AlertCircle, ArrowRight, Trash2, Trash } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import Link from "next/link"
import { deleteObjective } from "@/actions/objectives"
import { toast } from "sonner"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface Task {
    id: string
    title: string
    status: string | null
    assignee_id: string | null
    end_date: string | null
    assignee?: {
        full_name: string | null
        role: string | null
    } | null
}

interface Objective {
    id: string
    title: string
    description: string | null
    created_at: string | null
    tasks: Task[]
}

interface ObjectivesListViewProps {
    objectives: Objective[]
}

function getStatusConfig(status: string | null) {
    switch (status) {
        case 'Completed':
            return { color: 'bg-green-100 text-green-700', icon: CheckCircle2 }
        case 'In_Progress':
            return { color: 'bg-blue-100 text-blue-700', icon: ArrowRight }
        case 'Pending':
            return { color: 'bg-amber-100 text-amber-700', icon: Clock }
        case 'Rejected':
            return { color: 'bg-red-100 text-red-700', icon: AlertCircle }
        default:
            return { color: 'bg-slate-100 text-slate-600', icon: Clock }
    }
}

export function ObjectivesListView({ objectives }: ObjectivesListViewProps) {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const [isDeleting, setIsDeleting] = useState(false)

    const handleDelete = async (id: string) => {
        setIsDeleting(true)
        const result = await deleteObjective(id)
        setIsDeleting(false)

        if (result?.error) {
            toast.error(result.error)
        } else {
            toast.success("Objective deleted")
        }
    }

    const toggleExpand = (id: string) => {
        const newSet = new Set(expandedIds)
        if (newSet.has(id)) {
            newSet.delete(id)
        } else {
            newSet.add(id)
        }
        setExpandedIds(newSet)
    }

    const expandAll = () => {
        setExpandedIds(new Set(objectives.map(o => o.id)))
    }

    const collapseAll = () => {
        setExpandedIds(new Set())
    }

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={expandAll}>
                    Expand All
                </Button>
                <Button variant="outline" size="sm" onClick={collapseAll}>
                    Collapse All
                </Button>
            </div>

            {/* Objectives List */}
            <div className="space-y-3">
                {objectives.map(objective => {
                    const isExpanded = expandedIds.has(objective.id)
                    const taskCount = objective.tasks.length
                    const completedCount = objective.tasks.filter(t => t.status === 'Completed').length
                    const progress = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0

                    return (
                        <div key={objective.id} className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                            {/* Objective Header */}
                            <div
                                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                                onClick={() => toggleExpand(objective.id)}
                            >
                                <button className="shrink-0 text-slate-400 hover:text-slate-600">
                                    {isExpanded ? (
                                        <ChevronDown className="h-5 w-5" />
                                    ) : (
                                        <ChevronRight className="h-5 w-5" />
                                    )}
                                </button>

                                <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                                    <Target className="h-5 w-5 text-amber-600" />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <Link href={`/objectives/${objective.id}`} className="font-semibold text-slate-900 hover:text-amber-600 transition-colors" onClick={(e) => e.stopPropagation()}>
                                        {objective.title}
                                    </Link>
                                    {objective.description && (
                                        <p className="text-sm text-slate-500 truncate">{objective.description}</p>
                                    )}
                                </div>

                                {/* Task stats */}
                                <div className="flex items-center gap-4 shrink-0">
                                    <div className="text-right">
                                        <span className="text-sm font-medium text-slate-700">{completedCount}/{taskCount}</span>
                                        <span className="text-xs text-slate-400 ml-1">completed</span>
                                    </div>
                                    <Progress value={progress} className="w-24 h-2 bg-slate-100" />
                                    <Badge variant="outline" className="text-xs">
                                        {progress}%
                                    </Badge>

                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <Trash className="h-4 w-4" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Delete Objective?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will permanently delete this objective and all associated tasks.
                                                    This action cannot be undone.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                    className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleDelete(objective.id)
                                                    }}
                                                >
                                                    Delete
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </div>

                            {/* Tasks List (expanded) */}
                            {isExpanded && (
                                <div className="border-t border-slate-100 bg-slate-50/50">
                                    {taskCount === 0 ? (
                                        <div className="p-4 text-center text-sm text-slate-400">
                                            No tasks assigned to this objective yet.
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-slate-100">
                                            {objective.tasks.map(task => {
                                                const statusConfig = getStatusConfig(task.status)
                                                const StatusIcon = statusConfig.icon

                                                return (
                                                    <div key={task.id} className="flex items-center gap-4 p-3 pl-14 hover:bg-white transition-colors">
                                                        <StatusIcon className={`h-4 w-4 ${statusConfig.color.split(' ')[1]}`} />

                                                        <Link href={`/tasks?task=${task.id}`} className="flex-1 text-sm text-slate-700 hover:text-amber-600">
                                                            {task.title}
                                                        </Link>

                                                        <Badge className={`${statusConfig.color} border-0 text-xs`}>
                                                            {task.status?.replace('_', ' ') || 'Pending'}
                                                        </Badge>

                                                        {task.assignee?.full_name && (
                                                            <span className="text-xs text-slate-400 max-w-[120px] truncate">
                                                                {task.assignee.full_name}
                                                            </span>
                                                        )}

                                                        {task.end_date && (
                                                            <span className="text-xs text-slate-400">
                                                                Due {new Date(task.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                            </span>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}

                {objectives.length === 0 && (
                    <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-lg text-slate-500">
                        No objectives set. Define your mission.
                    </div>
                )}
            </div>
        </div>
    )
}
