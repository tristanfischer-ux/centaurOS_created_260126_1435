"use client"

import { useState, useEffect, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
    Briefcase,
    CheckCircle2,
    XCircle,
    MoreHorizontal,
    Loader2,
    Clock,
    Award,
    PartyPopper,
} from "lucide-react"
import { getFoundryAssignments, updateAssignmentStatus } from "@/actions/project-assignments"
import { createEndorsement } from "@/actions/endorsements"
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
    // Cancel confirmation
    const [cancelTarget, setCancelTarget] = useState<Assignment | null>(null)
    // Completion feedback dialog
    const [completedAssignment, setCompletedAssignment] = useState<Assignment | null>(null)
    const [endorseText, setEndorseText] = useState("")
    const [endorsing, setEndorsing] = useState(false)

    useEffect(() => {
        loadAssignments(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const loadAssignments = async (initial = false) => {
        if (initial) setLoading(true)
        try {
            const result = await getFoundryAssignments()
            if (result.assignments) {
                setAssignments(result.assignments)
            }
            if (result.error) {
                toast.error(result.error)
            }
        } catch (error) {
            console.error('[ProjectAssignments] Failed to load assignments:', error instanceof Error ? error.message : 'Unknown error')
            toast.error('Failed to load assignments')
        } finally {
            setLoading(false)
        }
    }

    const handleStatusUpdate = (assignmentId: string, status: 'completed' | 'cancelled') => {
        // GOTCHA: Capture assignment BEFORE startTransition — assignments state may be stale inside the closure
        const assignment = assignments.find(a => a.id === assignmentId)
        setActionId(assignmentId)
        startTransition(async () => {
            try {
                const result = await updateAssignmentStatus(assignmentId, status)
                if (result.success) {
                    // Show feedback dialog for completions
                    if (status === 'completed' && assignment) {
                        setCompletedAssignment(assignment)
                    }
                    toast.success(`Assignment ${status}`)
                    loadAssignments()
                } else {
                    toast.error(result.error || "Failed to update")
                }
            } catch (error) {
                console.error('[ProjectAssignments] Status update failed:', error instanceof Error ? error.message : 'Unknown error')
                toast.error('Failed to update assignment')
            } finally {
                setActionId(null)
            }
        })
    }

    const handleEndorse = async () => {
        if (!completedAssignment || !endorseText.trim()) return
        setEndorsing(true)
        try {
            const result = await createEndorsement(
                completedAssignment.apprenticeId,
                endorseText.trim(),
                'Project assignment'
            )
            if (result.success) {
                toast.success(`Endorsement sent to ${completedAssignment.apprenticeName}`)
                // Only close dialog on success — preserve text on failure for retry
                setCompletedAssignment(null)
                setEndorseText("")
            } else {
                toast.error(result.error || 'Failed to send endorsement')
            }
        } catch {
            toast.error('Failed to send endorsement')
        } finally {
            setEndorsing(false)
        }
    }

    const activeAssignments = assignments.filter(a => a.status === 'active')
    const completedAssignmentsList = assignments.filter(a => a.status !== 'active')

    if (loading) {
        return (
            <Card className="border">
                <CardContent className="p-8 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-status-info mx-auto mb-4" />
                    <p className="text-muted-foreground">Loading assignments...</p>
                </CardContent>
            </Card>
        )
    }

    if (assignments.length === 0) {
        return (
            <Card className="border">
                <CardContent className="p-8 text-center">
                    <Briefcase className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Project Assignments</h3>
                    <p className="text-muted-foreground">
                        Assign apprentices from the Guild pool to your projects.
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <>
            <Card className="border">
                <CardHeader className="pb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-status-success-light flex items-center justify-center">
                            <Briefcase className="h-5 w-5 text-status-success" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">Project Assignments</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                {activeAssignments.length} active assignment{activeAssignments.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Active Assignments */}
                    {activeAssignments.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active</h4>
                            <div className="divide-y divide-muted border rounded-lg overflow-hidden">
                                {activeAssignments.map((assignment) => (
                                    <div
                                        key={assignment.id}
                                        className="flex items-center justify-between p-4 hover:bg-muted transition-colors"
                                    >
                                        <div className="flex items-center gap-4">
                                            <UserAvatar
                                                name={assignment.apprenticeName}
                                                role="Apprentice"
                                                size="lg"
                                            />
                                            <div>
                                                <h4 className="font-medium text-foreground">{assignment.apprenticeName}</h4>
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <Briefcase className="h-3 w-3" />
                                                    <span>{assignment.projectName}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                                    <Clock className="h-3 w-3" />
                                                    <span>Started {formatDistanceToNow(new Date(assignment.startedAt), { addSuffix: true })}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="bg-status-success-light text-status-success-dark border-status-success">
                                                Active
                                            </Badge>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Assignment actions">
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
                                                        className="text-status-success"
                                                    >
                                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                                        Mark Complete
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => setCancelTarget(assignment)}
                                                        className="text-destructive"
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
                    {completedAssignmentsList.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">History</h4>
                            <div className="divide-y divide-muted border rounded-lg overflow-hidden opacity-70">
                                {completedAssignmentsList.slice(0, 5).map((assignment) => (
                                    <div
                                        key={assignment.id}
                                        className="flex items-center justify-between p-4"
                                    >
                                        <div className="flex items-center gap-4">
                                            <UserAvatar
                                                name={assignment.apprenticeName}
                                                role="Apprentice"
                                                size="lg"
                                            />
                                            <div>
                                                <h4 className="font-medium text-foreground">{assignment.apprenticeName}</h4>
                                                <div className="text-sm text-muted-foreground">{assignment.projectName}</div>
                                            </div>
                                        </div>
                                        <Badge
                                            variant="outline"
                                            className={
                                                assignment.status === 'completed'
                                                    ? 'bg-status-info-light text-status-info border-status-info'
                                                    : 'bg-status-error-light text-destructive border-destructive'
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

            {/* Completion Feedback Dialog */}
            <Dialog open={!!completedAssignment} onOpenChange={(open) => {
                if (!open) {
                    setCompletedAssignment(null)
                    setEndorseText("")
                }
            }}>
                <DialogContent size="sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <PartyPopper className="h-5 w-5 text-international-orange" />
                            Assignment Complete
                        </DialogTitle>
                    </DialogHeader>

                    <div className="py-4 space-y-4">
                        <div className="flex items-center gap-4 p-4 bg-status-success-light rounded-lg">
                            <UserAvatar
                                name={completedAssignment?.apprenticeName}
                                role="Apprentice"
                                size="lg"
                            />
                            <div>
                                <p className="font-medium text-foreground">{completedAssignment?.apprenticeName}</p>
                                <p className="text-sm text-muted-foreground">
                                    Completed: {completedAssignment?.projectName}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="completion-endorse" className="flex items-center gap-1.5">
                                <Award className="h-4 w-4 text-international-orange" />
                                Send an endorsement? <span className="text-muted-foreground text-xs">(optional)</span>
                            </Label>
                            <Textarea
                                id="completion-endorse"
                                placeholder="Great job on this project! They demonstrated..."
                                value={endorseText}
                                onChange={e => setEndorseText(e.target.value)}
                                rows={3}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setCompletedAssignment(null)
                                setEndorseText("")
                            }}
                        >
                            Done
                        </Button>
                        <Button
                            onClick={handleEndorse}
                            disabled={!endorseText.trim() || endorsing}
                            className="gap-1.5"
                        >
                            {endorsing && <Loader2 className="h-4 w-4 animate-spin" />}
                            <Award className="h-4 w-4" />
                            Endorse
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Cancel Confirmation */}
            <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancel this assignment?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will end {cancelTarget?.apprenticeName}&apos;s work on &ldquo;{cancelTarget?.projectName}&rdquo;. They will be notified.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep Assignment</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                if (cancelTarget) {
                                    handleStatusUpdate(cancelTarget.id, 'cancelled')
                                    setCancelTarget(null)
                                }
                            }}
                        >
                            Cancel Assignment
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
