"use client"

/**
 * @file meeting-history.tsx
 *
 * @description Displays a list of past team meetings with summaries,
 * attendees, and action items. Clicking a meeting opens a detail dialog
 * showing the full notes and allowing objective creation from action items.
 *
 * @related
 * - src/actions/agent-artifacts.ts -- getMeetingHistory server action
 * - meeting-outputs.tsx -- Reused for detailed meeting view
 * - specialists-landing.tsx -- Parent integration
 */

import { useState, useEffect, useCallback } from "react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
    FileText,
    Users,
    Calendar,
    ChevronDown,
    ChevronUp,
    ArrowRight,
    CheckCircle2,
    Target,
    Loader2,
    Plus,
    MessageSquare,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { Markdown } from "@/components/ui/markdown"
import { toast } from "sonner"
import { getMeetingHistory } from "@/actions/agent-artifacts"
import { createObjective } from "@/actions/objectives"
import type { MeetingHistoryItem } from "@/actions/agent-artifacts"

// ─── Types ────────────────────────────────────────────────────────────────────

interface MeetingHistoryProps {
    /** Max meetings to show initially (before "View All") */
    initialLimit?: number
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * MeetingHistory -- Displays past team meetings with summaries and actions.
 *
 * @description Fetches saved team meetings from agent_artifacts and renders
 * compact cards. Clicking a card opens a detail dialog with full notes
 * and the ability to create objectives from action items.
 */
export function MeetingHistory({ initialLimit = 3 }: MeetingHistoryProps) {
    const [meetings, setMeetings] = useState<MeetingHistoryItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [showAll, setShowAll] = useState(false)
    const [selectedMeeting, setSelectedMeeting] = useState<MeetingHistoryItem | null>(null)
    const [createdActions, setCreatedActions] = useState<Set<string>>(new Set())
    const [creatingAction, setCreatingAction] = useState<string | null>(null)

    // Fetch meeting history on mount
    useEffect(() => {
        async function fetchMeetings(): Promise<void> {
            setIsLoading(true)
            const result = await getMeetingHistory(50)
            if (result.error) {
                console.error("[MeetingHistory] Failed to fetch:", result.error)
            }
            setMeetings(result.data)
            setIsLoading(false)
        }
        fetchMeetings()
    }, [])

    /**
     * Create an objective from a meeting action item.
     */
    const handleCreateObjective = useCallback(
        async (actionItem: string, meetingTopic: string) => {
            const key = `${meetingTopic}:${actionItem}`
            setCreatingAction(key)

            try {
                const formData = new FormData()
                formData.set("title", actionItem)
                formData.set(
                    "description",
                    `Action item from team meeting: "${meetingTopic}"`
                )

                const result = await createObjective(formData)

                if ("error" in result && result.error) {
                    toast.error("Failed to create objective", {
                        description: result.error,
                    })
                } else {
                    setCreatedActions((prev) => new Set(prev).add(key))
                    toast.success("Objective created", {
                        description: `"${actionItem.slice(0, 60)}..."`,
                    })
                }
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : "Unknown error"
                toast.error("Failed to create objective", {
                    description: message,
                })
            } finally {
                setCreatingAction(null)
            }
        },
        []
    )

    // Nothing to show
    if (!isLoading && meetings.length === 0) {
        return null
    }

    const visibleMeetings = showAll
        ? meetings
        : meetings.slice(0, initialLimit)
    const hasMore = meetings.length > initialLimit

    return (
        <div className="space-y-4">
            {/* Section Header */}
            <div className="flex items-center gap-3">
                <div className="h-6 w-1 rounded-full bg-electric-blue" />
                <div className="flex-1">
                    <h3 className="text-xs font-mono uppercase tracking-widest text-foreground font-semibold">
                        Meeting History
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        Previous team discussions and action items
                    </p>
                </div>
                {hasMore && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAll(!showAll)}
                        className="text-xs"
                    >
                        {showAll ? (
                            <>
                                Show Less
                                <ChevronUp className="h-3.5 w-3.5 ml-1" />
                            </>
                        ) : (
                            <>
                                View All ({meetings.length})
                                <ChevronDown className="h-3.5 w-3.5 ml-1" />
                            </>
                        )}
                    </Button>
                )}
            </div>

            {/* Loading State */}
            {isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: initialLimit }).map((_, i) => (
                        <Card key={i} className="border">
                            <CardContent className="pt-5 space-y-3">
                                <Skeleton className="h-5 w-3/4" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-2/3" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Meeting Cards */}
            {!isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visibleMeetings.map((meeting) => (
                        <Card
                            key={meeting.id}
                            className={cn(
                                "border rounded-xl cursor-pointer",
                                "transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                            )}
                            onClick={() => setSelectedMeeting(meeting)}
                        >
                            <CardContent className="pt-5 space-y-3">
                                {/* Topic */}
                                <h4 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
                                    {meeting.topic || meeting.title}
                                </h4>

                                {/* Summary snippet */}
                                {meeting.summary && (
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                        {meeting.summary.slice(0, 150)}
                                        {meeting.summary.length > 150 ? "..." : ""}
                                    </p>
                                )}

                                {/* Meta row */}
                                <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1">
                                    <span className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        {format(new Date(meeting.createdAt), "MMM d, yyyy")}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Users className="h-3 w-3" />
                                        {meeting.attendees.length}
                                    </span>
                                    {meeting.actionItemCount > 0 && (
                                        <Badge
                                            variant="secondary"
                                            className="text-[10px] px-1.5 py-0"
                                        >
                                            {meeting.actionItemCount} action{meeting.actionItemCount !== 1 ? "s" : ""}
                                        </Badge>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Detail Dialog */}
            <MeetingDetailDialog
                meeting={selectedMeeting}
                open={selectedMeeting !== null}
                onOpenChange={(open) => {
                    if (!open) setSelectedMeeting(null)
                }}
                createdActions={createdActions}
                creatingAction={creatingAction}
                onCreateObjective={handleCreateObjective}
            />
        </div>
    )
}

// ─── Detail Dialog ────────────────────────────────────────────────────────────

interface MeetingDetailDialogProps {
    meeting: MeetingHistoryItem | null
    open: boolean
    onOpenChange: (open: boolean) => void
    createdActions: Set<string>
    creatingAction: string | null
    onCreateObjective: (actionItem: string, meetingTopic: string) => Promise<void>
}

/**
 * MeetingDetailDialog -- Full view of a past team meeting.
 *
 * @description Shows the meeting summary, key decisions, action items,
 * open questions, and next steps. Action items can be turned into
 * objectives with one click.
 */
function MeetingDetailDialog({
    meeting,
    open,
    onOpenChange,
    createdActions,
    creatingAction,
    onCreateObjective,
}: MeetingDetailDialogProps) {
    if (!meeting) return null

    const notes = (meeting.metadata.notes ?? {}) as {
        summary?: string
        keyDecisions?: string[]
        actionItems?: string[]
        openQuestions?: string[]
        nextSteps?: string[]
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="lg" className="max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="font-display flex items-center gap-2">
                        <FileText className="h-5 w-5 text-electric-blue" />
                        {meeting.topic || meeting.title}
                    </DialogTitle>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(meeting.createdAt), "MMMM d, yyyy 'at' h:mm a")}
                        </span>
                        <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {meeting.attendees.join(", ")}
                        </span>
                        <span className="flex items-center gap-1">
                            <MessageSquare className="h-3.5 w-3.5" />
                            {meeting.roundCount} round{meeting.roundCount !== 1 ? "s" : ""}
                        </span>
                    </div>
                </DialogHeader>

                <div
                    className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-1"
                    style={{ maxHeight: "65vh" }}
                >
                    {/* Summary */}
                    {notes.summary && (
                        <div className="rounded-lg border border-muted bg-muted/20 p-5">
                            <h4 className="text-sm font-semibold text-foreground mb-2">
                                Summary
                            </h4>
                            <Markdown content={notes.summary} className="text-sm" />
                        </div>
                    )}

                    {/* Key Decisions */}
                    {notes.keyDecisions && notes.keyDecisions.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-foreground">
                                Key Decisions
                            </h4>
                            <ul className="space-y-1.5">
                                {notes.keyDecisions.map((d, i) => (
                                    <li
                                        key={i}
                                        className="flex items-start gap-2 text-sm text-foreground"
                                    >
                                        <CheckCircle2 className="h-4 w-4 text-status-success flex-shrink-0 mt-0.5" />
                                        {d}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Action Items (with create objective button) */}
                    {notes.actionItems && notes.actionItems.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold text-foreground">
                                    Action Items
                                </h4>
                                <Badge variant="secondary" className="text-[10px]">
                                    {notes.actionItems.length}
                                </Badge>
                            </div>
                            <ul className="space-y-2">
                                {notes.actionItems.map((action, i) => {
                                    const key = `${meeting.topic}:${action}`
                                    const isCreated = createdActions.has(key)
                                    const isCreating = creatingAction === key

                                    return (
                                        <li
                                            key={i}
                                            className={cn(
                                                "flex items-start gap-2 text-sm rounded-lg border p-3",
                                                isCreated
                                                    ? "border-status-success/30 bg-status-success-light/20"
                                                    : "border-muted bg-muted/20"
                                            )}
                                        >
                                            <ArrowRight className="h-4 w-4 text-international-orange flex-shrink-0 mt-0.5" />
                                            <span className="flex-1 text-foreground">
                                                {action}
                                            </span>
                                            <Button
                                                size="sm"
                                                variant={isCreated ? "secondary" : "ghost"}
                                                className="flex-shrink-0 h-7 text-xs"
                                                onClick={() =>
                                                    onCreateObjective(action, meeting.topic)
                                                }
                                                disabled={isCreated || isCreating}
                                            >
                                                {isCreating ? (
                                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                ) : isCreated ? (
                                                    <CheckCircle2 className="h-3 w-3 text-status-success mr-1" />
                                                ) : (
                                                    <Plus className="h-3 w-3 mr-1" />
                                                )}
                                                {isCreated ? "Created" : "Create Task"}
                                            </Button>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    )}

                    {/* Open Questions */}
                    {notes.openQuestions && notes.openQuestions.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-foreground">
                                Open Questions
                            </h4>
                            <ul className="space-y-1 list-disc list-inside text-sm text-muted-foreground">
                                {notes.openQuestions.map((q, i) => (
                                    <li key={i}>{q}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Next Steps */}
                    {notes.nextSteps && notes.nextSteps.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-foreground">
                                Next Steps
                            </h4>
                            <ol className="space-y-1 list-decimal list-inside text-sm text-foreground">
                                {notes.nextSteps.map((s, i) => (
                                    <li key={i}>{s}</li>
                                ))}
                            </ol>
                        </div>
                    )}

                    {/* Objectives summary */}
                    {meeting.objectiveCount > 0 && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                            <Target className="h-3.5 w-3.5" />
                            <span>
                                {meeting.objectiveCount} objective
                                {meeting.objectiveCount !== 1 ? "s" : ""} suggested
                                in this meeting
                            </span>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
