"use client"

import { useState, useEffect, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { 
    Briefcase, 
    CheckCircle2, 
    XCircle, 
    MoreHorizontal,
    Loader2,
    Mail,
    Clock
} from "lucide-react"
import { getFoundryAssignments, updateAssignmentStatus } from "@/actions/project-assignments"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

interface Assignment {
    id: string
    apprenticeId: string
    apprenticeName: string
    apprenticeEmail: string
    projectName: string
    projectDescription: string | null
    status: string
    startedAt: string
    endedAt: string | null
}

export function ProjectAssignmentsList() {
    const [assignments, setAssignments] = useState<Assignment[]>([])
    const [loading, setLoading] = useState(true)
    const [isPending, startTransition] = useTransition()
    const [actionId, setActionId] = useState<string | null>(null)

    useEffect(() => {
        loadAssignments()
    }, [])

    const loadAssignments = async () => {
        setLoading(true)
        const result = await getFoundryAssignments()
        if (result.assignments) {
            setAssignments(result.assignments)
        }
        if (result.error) {
            toast.error(result.error)
        }
        setLoading(false)
    }

    const handleStatusUpdate = (assignmentId: string, status: 'completed' | 'cancelled') => {
        setActionId(assignmentId)
        startTransition(async () => {
            const result = await updateAssignmentStatus(assignmentId, status)
            if (result.success) {
                toast.success(`Assignment ${status}`)
                loadAssignments()
            } else {
                toast.error(result.error || "Failed to update")
            }
            setActionId(null)
        })
    }

    const getInitials = (name: string) => {
        const parts = name.trim().split(/\s+/)
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
    }

    const activeAssignments = assignments.filter(a => a.status === 'active')
    const completedAssignments = assignments.filter(a => a.status !== 'active')

    if (loading) {
        return (
            <Card className="border-slate-200">
                <CardContent className="p-8 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
                    <p className="text-slate-500">Loading assignments...</p>
                </CardContent>
            </Card>
        )
    }

    if (assignments.length === 0) {
        return (
            <Card className="border-slate-200">
                <CardContent className="p-8 text-center">
                    <Briefcase className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-700 mb-2">No Project Assignments</h3>
                    <p className="text-slate-500">
                        Assign apprentices from the Guild pool to your projects.
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="border-slate-200">
            <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                        <Briefcase className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                        <CardTitle className="text-lg">Project Assignments</CardTitle>
                        <p className="text-sm text-slate-500">
                            {activeAssignments.length} active assignment{activeAssignments.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Active Assignments */}
                {activeAssignments.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Active</h4>
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                            {activeAssignments.map((assignment) => (
                                <div
                                    key={assignment.id}
                                    className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <Avatar className="h-10 w-10 border-2 border-green-200">
                                            <AvatarFallback className="bg-green-100 text-green-700 font-bold">
                                                {getInitials(assignment.apprenticeName)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <h4 className="font-medium text-slate-900">{assignment.apprenticeName}</h4>
                                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                                <Briefcase className="h-3 w-3" />
                                                <span>{assignment.projectName}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                                                <Clock className="h-3 w-3" />
                                                <span>Started {formatDistanceToNow(new Date(assignment.startedAt), { addSuffix: true })}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                            Active
                                        </Badge>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                    {isPending && actionId === assignment.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    )}
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onClick={() => handleStatusUpdate(assignment.id, 'completed')}
                                                    className="text-green-600"
                                                >
                                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                                    Mark Complete
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => handleStatusUpdate(assignment.id, 'cancelled')}
                                                    className="text-red-600"
                                                >
                                                    <XCircle className="h-4 w-4 mr-2" />
                                                    Cancel Assignment
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Completed/Cancelled Assignments */}
                {completedAssignments.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium text-slate-500 uppercase tracking-wider">History</h4>
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden opacity-70">
                            {completedAssignments.slice(0, 5).map((assignment) => (
                                <div
                                    key={assignment.id}
                                    className="flex items-center justify-between p-4"
                                >
                                    <div className="flex items-center gap-4">
                                        <Avatar className="h-10 w-10 border border-slate-200">
                                            <AvatarFallback className="bg-slate-100 text-slate-500">
                                                {getInitials(assignment.apprenticeName)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <h4 className="font-medium text-slate-700">{assignment.apprenticeName}</h4>
                                            <div className="text-sm text-slate-500">{assignment.projectName}</div>
                                        </div>
                                    </div>
                                    <Badge 
                                        variant="outline" 
                                        className={
                                            assignment.status === 'completed'
                                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                : 'bg-red-50 text-red-700 border-red-200'
                                        }
                                    >
                                        {assignment.status}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
