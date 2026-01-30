"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { UserAvatarStack } from "@/components/ui/user-avatar"
import { FullTaskView } from "@/components/tasks/full-task-view"
import { format } from "date-fns"
import { Calendar, Target, User } from "lucide-react"
import { cn } from "@/lib/utils"

interface InteractiveTaskItemProps {
    task: {
        id: string
        title: string
        description: string | null
        status: string
        risk_level: string | null
        start_date: string | null
        end_date: string | null
        task_number?: number
        assignee?: {
            id: string
            full_name: string | null
            role: string
            email: string
            avatar_url?: string | null
        } | null
        assignees?: {
            id: string
            full_name: string | null
            role: string
            email: string
            avatar_url?: string | null
        }[]
        objective?: {
            id: string
            title: string
        } | null
        creator?: {
            id: string
            full_name: string | null
        }
    }
    members: Array<{
        id: string
        full_name: string
        role: string
        email: string
    }>
    currentUserId: string
    variant?: "default" | "compact"
}

export function InteractiveTaskItem({ task, members, currentUserId, variant = "default" }: InteractiveTaskItemProps) {
    const [modalOpen, setModalOpen] = useState(false)
    
    const assignees = task.assignees && task.assignees.length > 0
        ? task.assignees
        : task.assignee ? [task.assignee] : []
    
    const isOverdue = task.end_date && new Date(task.end_date) < new Date() && task.status !== 'Completed'
    
    if (variant === "compact") {
        return (
            <>
                <button
                    onClick={() => setModalOpen(true)}
                    className="w-full text-left transition-all group hover:shadow-md active:shadow-sm"
                >
                    <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 bg-background hover:bg-foundry-50/30 hover:border-foundry-300 transition-colors">
                        <div className="flex-1 min-w-0 space-y-2">
                            <p className="text-sm font-medium text-foreground truncate group-hover:text-international-orange transition-colors">
                                {task.title}
                            </p>
                            
                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                {task.objective?.title && (
                                    <span className="flex items-center text-status-info-dark font-medium">
                                        <Target className="h-3 w-3 mr-1" />
                                        {task.objective.title}
                                    </span>
                                )}
                                
                                {assignees.length > 0 && (
                                    <span className="flex items-center gap-1">
                                        <User className="h-3 w-3" />
                                        {assignees.length === 1 
                                            ? assignees[0].full_name 
                                            : `${assignees.length} people`}
                                    </span>
                                )}
                                
                                {task.end_date && (
                                    <span className={cn(
                                        "flex items-center gap-1",
                                        isOverdue && "text-destructive font-medium"
                                    )}>
                                        <Calendar className="h-3 w-3" />
                                        Due {format(new Date(task.end_date), "MMM d")}
                                    </span>
                                )}
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-3 ml-4">
                            {assignees.length > 0 && (
                                <UserAvatarStack
                                    users={assignees.map(a => ({
                                        id: a.id,
                                        name: a.full_name,
                                        role: a.role,
                                        avatarUrl: a.avatar_url,
                                    }))}
                                    size="md"
                                    max={3}
                                />
                            )}
                            
                            <Badge className={cn(
                                "capitalize text-xs shrink-0",
                                task.risk_level === 'High' ? "bg-red-100 text-red-700 border-red-200" :
                                task.risk_level === 'Medium' ? "bg-amber-100 text-amber-700 border-amber-200" :
                                "bg-foundry-100 text-foundry-600 border"
                            )}>
                                {task.risk_level || 'Low'}
                            </Badge>
                        </div>
                    </div>
                </button>
                
                <FullTaskView
                    open={modalOpen}
                    onOpenChange={setModalOpen}
                    task={task}
                    members={members}
                    currentUserId={currentUserId}
                />
            </>
        )
    }
    
    // Default variant - Rich card layout with generous spacing
    return (
        <>
            <button
                onClick={() => setModalOpen(true)}
                className="w-full text-left transition-all group cursor-pointer"
            >
                <div className="bg-background border-2 border rounded-xl p-6 hover:border-international-orange hover:shadow-xl hover:-translate-y-1 active:translate-y-0 active:shadow-lg transition-all duration-200 space-y-5">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-2">
                            {task.objective && (
                                <div className="flex items-center gap-1.5 text-xs text-status-info font-semibold uppercase tracking-wider">
                                    <Target className="h-3.5 w-3.5" />
                                    {task.objective.title}
                                </div>
                            )}
                            <h3 className="font-display font-bold text-xl text-foreground leading-tight group-hover:text-international-orange transition-colors">
                                {task.title}
                            </h3>
                            {task.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed mt-2">
                                    {task.description}
                                </p>
                            )}
                        </div>
                        
                        <Badge className="shrink-0 capitalize text-xs px-3 py-1">
                            {task.status?.replace(/_/g, ' ') || 'Pending'}
                        </Badge>
                    </div>
                    
                    {/* Metadata Grid - Better spacing and visual hierarchy */}
                    <div className="grid grid-cols-2 gap-5 pt-4 border-t-2 border-foundry-100">
                        {/* Assignees */}
                        <div className="space-y-2">
                            <div className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
                                Team Members
                            </div>
                            {assignees.length > 0 ? (
                                <div className="flex items-center gap-2">
                                    <UserAvatarStack
                                        users={assignees.map(a => ({
                                            id: a.id,
                                            name: a.full_name,
                                            role: a.role,
                                            avatarUrl: a.avatar_url,
                                        }))}
                                        size="md"
                                        max={3}
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-sm text-foreground font-semibold">
                                            {assignees.length === 1 
                                                ? assignees[0].full_name?.split(' ')[0]
                                                : `${assignees.length} people`}
                                        </span>
                                        {assignees.length === 1 && assignees[0].role && (
                                            <span className="text-xs text-muted-foreground">
                                                {assignees[0].role}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <span className="text-sm text-muted-foreground italic">Unassigned</span>
                            )}
                        </div>
                        
                        {/* Risk Level */}
                        <div className="space-y-2">
                            <div className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
                                Risk Level
                            </div>
                            <Badge className={cn(
                                "text-xs px-3 py-1",
                                task.risk_level === 'High' ? "bg-status-error-light text-destructive border-destructive" :
                                task.risk_level === 'Medium' ? "bg-status-warning-light text-status-warning-dark border-status-warning" :
                                "bg-status-success-light text-status-success-dark border-status-success"
                            )}>
                                {task.risk_level || 'Low'}
                            </Badge>
                        </div>
                        
                        {/* Start Date */}
                        {task.start_date && (
                            <div className="space-y-2">
                                <div className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
                                    Start Date
                                </div>
                                <div className="flex items-center gap-2 text-sm text-foreground font-medium">
                                    <Calendar className="h-4 w-4 text-status-info" />
                                    {format(new Date(task.start_date), "MMM d, yyyy")}
                                </div>
                            </div>
                        )}
                        
                        {/* Due Date */}
                        {task.end_date && (
                            <div className="space-y-2">
                                <div className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
                                    Due Date
                                </div>
                                <div className={cn(
                                    "flex items-center gap-2 text-sm font-semibold",
                                    isOverdue ? "text-destructive" : "text-foreground"
                                )}>
                                    <Calendar className="h-4 w-4" />
                                    {format(new Date(task.end_date), "MMM d, yyyy")}
                                    {isOverdue && " ⚠️"}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </button>
            
            <FullTaskView
                open={modalOpen}
                onOpenChange={setModalOpen}
                task={task}
                members={members}
                currentUserId={currentUserId}
            />
        </>
    )
}
