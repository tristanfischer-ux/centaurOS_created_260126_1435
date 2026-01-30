"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
    GraduationCap, 
    Briefcase, 
    Building2,
    Clock,
    Loader2
} from "lucide-react"
import { ApprenticePoolBrowser } from "@/components/guild/ApprenticePoolBrowser"
import { ProjectAssignmentsList } from "@/components/guild/ProjectAssignmentsList"
import { getMyAssignments } from "@/actions/project-assignments"
import { formatDistanceToNow } from "date-fns"

interface GuildPageContentProps {
    isManager: boolean
    isApprentice: boolean
}

interface MyAssignment {
    id: string
    foundryName: string
    projectName: string
    projectDescription: string | null
    status: string
    startedAt: string
    assignedByName: string
}

export function GuildPageContent({ isManager, isApprentice }: GuildPageContentProps) {
    const [myAssignments, setMyAssignments] = useState<MyAssignment[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (isApprentice) {
            loadMyAssignments()
        } else {
            setLoading(false)
        }
    }, [isApprentice])

    const loadMyAssignments = async () => {
        setLoading(true)
        const result = await getMyAssignments()
        if (result.assignments) {
            setMyAssignments(result.assignments)
        }
        setLoading(false)
    }

    // Manager view - can browse pool and manage assignments
    if (isManager) {
        return (
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 mb-1">
                            <div className="h-8 w-1 bg-blue-600 rounded-full shadow-[0_0_8px_rgba(37,99,235,0.6)]" />
                            <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">Guild</h1>
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">
                            Browse and assign apprentices from the Guild pool to your projects
                        </p>
                    </div>
                </div>

                <Tabs defaultValue="pool" className="space-y-6">
                    <TabsList className="bg-muted">
                        <TabsTrigger value="pool" className="flex items-center gap-2">
                            <GraduationCap className="h-4 w-4" />
                            Apprentice Pool
                        </TabsTrigger>
                        <TabsTrigger value="assignments" className="flex items-center gap-2">
                            <Briefcase className="h-4 w-4" />
                            Assignments
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="pool">
                        <ApprenticePoolBrowser />
                    </TabsContent>

                    <TabsContent value="assignments">
                        <ProjectAssignmentsList />
                    </TabsContent>
                </Tabs>
            </div>
        )
    }

    // Apprentice view - can see their own assignments
    if (isApprentice) {
        const activeAssignments = myAssignments.filter(a => a.status === 'active')
        const pastAssignments = myAssignments.filter(a => a.status !== 'active')

        return (
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 mb-1">
                            <div className="h-8 w-1 bg-blue-600 rounded-full shadow-[0_0_8px_rgba(37,99,235,0.6)]" />
                            <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">My Guild Assignments</h1>
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">
                            Projects you've been assigned to from the Guild
                        </p>
                    </div>
                </div>

                {loading ? (
                    <Card className="border">
                        <CardContent className="p-8 text-center">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
                            <p className="text-muted-foreground">Loading your assignments...</p>
                        </CardContent>
                    </Card>
                ) : myAssignments.length === 0 ? (
                    <Card className="border">
                        <CardContent className="p-8 text-center">
                            <GraduationCap className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-foreground mb-2">No Assignments Yet</h3>
                            <p className="text-muted-foreground">
                                You haven't been assigned to any projects yet. Companies can find you in the Guild pool and assign you to their projects.
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-6">
                        {/* Active Assignments */}
                        {activeAssignments.length > 0 && (
                            <Card className="border">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-lg">
                                        <Briefcase className="h-5 w-5 text-green-600" />
                                        Active Assignments
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {activeAssignments.map((assignment) => (
                                        <div
                                            key={assignment.id}
                                            className="p-4 border border-green-200 rounded-lg bg-green-50"
                                        >
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <h4 className="font-semibold text-foreground">{assignment.projectName}</h4>
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                                        <Building2 className="h-4 w-4" />
                                                        <span>{assignment.foundryName}</span>
                                                    </div>
                                                    {assignment.projectDescription && (
                                                        <p className="text-sm text-muted-foreground mt-2">
                                                            {assignment.projectDescription}
                                                        </p>
                                                    )}
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-3">
                                                        <Clock className="h-3 w-3" />
                                                        <span>Started {formatDistanceToNow(new Date(assignment.startedAt), { addSuffix: true })}</span>
                                                        <span className="text-slate-300">|</span>
                                                        <span>Assigned by {assignment.assignedByName}</span>
                                                    </div>
                                                </div>
                                                <Badge className="bg-green-600">Active</Badge>
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        )}

                        {/* Past Assignments */}
                        {pastAssignments.length > 0 && (
                            <Card className="border">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-lg text-muted-foreground">
                                        <Clock className="h-5 w-5" />
                                        Past Assignments
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {pastAssignments.map((assignment) => (
                                        <div
                                            key={assignment.id}
                                            className="p-4 border border rounded-lg opacity-70"
                                        >
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <h4 className="font-medium text-foreground">{assignment.projectName}</h4>
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                                        <Building2 className="h-4 w-4" />
                                                        <span>{assignment.foundryName}</span>
                                                    </div>
                                                </div>
                                                <Badge 
                                                    variant="outline"
                                                    className={
                                                        assignment.status === 'completed'
                                                            ? 'border text-blue-700'
                                                            : 'border-red-200 text-red-700'
                                                    }
                                                >
                                                    {assignment.status}
                                                </Badge>
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        )}
                    </div>
                )}
            </div>
        )
    }

    return null
}
