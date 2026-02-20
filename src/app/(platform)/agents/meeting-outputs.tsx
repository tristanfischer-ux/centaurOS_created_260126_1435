"use client"

/**
 * @file meeting-outputs.tsx
 *
 * @description Post-meeting outputs display with four tabs: Meeting Notes,
 * Suggested Objectives & Tasks, Cleanup (redundant items), and Marketplace
 * Recommendations. Cal's wrap-up generates all of these. Allows one-click
 * objective creation, redundant item archival, saving the meeting, and
 * sharing the report via email.
 *
 * @related
 * - team-meeting-dialog.tsx — Parent component
 * - huddle-report.tsx — Email sharing dialog
 * - src/actions/objectives.ts — createObjective, archiveObjectiveByTitle
 * - src/actions/tasks.ts — updateTaskStatus
 * - src/actions/agent-artifacts.ts — createArtifact for saving deliverables
 */

import { useState, useCallback, useEffect, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    FileText,
    Target,
    ShoppingBag,
    CheckCircle2,
    Plus,
    ExternalLink,
    Loader2,
    Save,
    ArrowRight,
    Flag,
    Trash2,
    Archive,
    AlertTriangle,
    Send,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Markdown } from "@/components/ui/markdown"
import { Input } from "@/components/ui/input"
import { createObjective, getStrategicObjectives, createStrategicObjective, archiveObjectiveByTitle } from "@/actions/objectives"
import { createArtifact } from "@/actions/agent-artifacts"
import type { MeetingOutputData } from "./team-meeting-dialog"

/** Minimal strategic objective shape for the selector */
interface StrategicObjectiveOption {
    id: string
    title: string
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface MeetingOutputsProps {
    outputs: MeetingOutputData
    topic: string
    attendees: string[]
    transcript: string
    roundCount: number
    /** Called when user wants to share the report via email */
    onShareReport?: () => void
    /** When true, the meeting was auto-saved to deliverables on wrap-up */
    initialSaved?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MeetingOutputs({
    outputs,
    topic,
    attendees,
    transcript,
    roundCount,
    onShareReport,
    initialSaved = false,
}: MeetingOutputsProps) {
    const [createdObjectives, setCreatedObjectives] = useState<Set<number>>(new Set())
    const [creatingIdx, setCreatingIdx] = useState<number | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [isSaved, setIsSaved] = useState(initialSaved)
    const [archivedItems, setArchivedItems] = useState<Set<number>>(new Set())
    const [archivingIdx, setArchivingIdx] = useState<number | null>(null)

    const [strategicSelections, setStrategicSelections] = useState<Record<number, string>>({})
    const [strategicObjectives, setStrategicObjectives] = useState<StrategicObjectiveOption[]>([])
    const [creatingStrategicForIdx, setCreatingStrategicForIdx] = useState<number | null>(null)
    const [newStrategicTitle, setNewStrategicTitle] = useState("")
    const [isCreatingStrategic, setIsCreatingStrategic] = useState(false)

    // GOTCHA: initialSaved transitions from false to true AFTER this component mounts
    // (the parent does setMeetingOutputs then async auto-save). useState only reads
    // the initial value on mount, so we sync via useEffect.
    useEffect(() => {
        if (initialSaved) setIsSaved(true)
    }, [initialSaved])

    const redundantItems = useMemo(() => outputs.redundantItems ?? [], [outputs.redundantItems])
    const hasCleanupItems = redundantItems.length > 0

    // ─── Fetch Strategic Objectives ───────────────────────────────────────
    useEffect(() => {
        async function fetchStrategicObjectives(): Promise<void> {
            try {
                const result = await getStrategicObjectives()
                if (result.data) {
                    setStrategicObjectives(result.data)
                }
            } catch (err) {
                console.error("[MeetingOutputs] Failed to fetch strategic objectives:", err)
            }
        }
        fetchStrategicObjectives()
    }, [])

    const handleStrategicSelect = useCallback((objIdx: number, value: string) => {
        if (value === "create_new") {
            setCreatingStrategicForIdx(objIdx)
            setNewStrategicTitle("")
            return
        }
        setStrategicSelections((prev) => {
            const next = { ...prev }
            if (value === "none") {
                delete next[objIdx]
            } else {
                next[objIdx] = value
            }
            return next
        })
    }, [])

    // INTENT: Let users create a strategic objective inline from the meeting outputs
    // without leaving the dialog. This removes friction when no existing objective fits.
    const handleCreateStrategicObjective = useCallback(
        async (objIdx: number) => {
            const title = newStrategicTitle.trim()
            if (!title) return

            setIsCreatingStrategic(true)
            try {
                const result = await createStrategicObjective(title)
                if ("error" in result && result.error) {
                    toast.error("Failed to create strategic objective", {
                        description: result.error,
                    })
                    return
                }
                if (result.data) {
                    setStrategicObjectives((prev) => [...prev, result.data!])
                    setStrategicSelections((prev) => ({ ...prev, [objIdx]: result.data!.id }))
                    toast.success("Strategic objective created", {
                        description: `"${result.data.title}" created and linked`,
                    })
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unknown error"
                toast.error("Failed to create strategic objective", { description: message })
            } finally {
                setIsCreatingStrategic(false)
                setCreatingStrategicForIdx(null)
                setNewStrategicTitle("")
            }
        },
        [newStrategicTitle]
    )

    // ─── Create Objective ─────────────────────────────────────────────────
    const handleCreateObjective = useCallback(
        async (objIdx: number) => {
            const obj = outputs.objectives[objIdx]
            if (!obj) return

            setCreatingIdx(objIdx)

            try {
                const formData = new FormData()
                formData.set("title", obj.title)
                formData.set("description", obj.description)

                const selectedStrategicId = strategicSelections[objIdx]
                if (selectedStrategicId) {
                    formData.set("parent_objective_id", selectedStrategicId)
                }

                for (const task of obj.tasks) {
                    formData.append(
                        "aiTasks",
                        JSON.stringify({ title: task.title, description: task.description })
                    )
                }

                const result = await createObjective(formData)

                if ("error" in result && result.error) {
                    toast.error("Failed to create objective", {
                        description: result.error,
                    })
                } else {
                    const strategicTitle = selectedStrategicId
                        ? strategicObjectives.find((s) => s.id === selectedStrategicId)?.title
                        : null
                    setCreatedObjectives((prev) => new Set(prev).add(objIdx))
                    toast.success("Objective created", {
                        description: strategicTitle
                            ? `"${obj.title}" linked to "${strategicTitle}"`
                            : `"${obj.title}" with ${obj.tasks.length} tasks`,
                    })
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unknown error"
                toast.error("Failed to create objective", { description: message })
            } finally {
                setCreatingIdx(null)
            }
        },
        [outputs.objectives, strategicSelections, strategicObjectives]
    )

    // ─── Archive Redundant Item ───────────────────────────────────────────
    const handleArchiveItem = useCallback(
        async (itemIdx: number) => {
            const item = redundantItems[itemIdx]
            if (!item) return

            setArchivingIdx(itemIdx)

            try {
                if (item.type === "objective") {
                    const result = await archiveObjectiveByTitle(item.title)
                    if ("error" in result && result.error) {
                        toast.error("Could not archive", {
                            description: `"${item.title}" — ${result.error}. You may need to archive it manually.`,
                        })
                    } else {
                        setArchivedItems((prev) => new Set(prev).add(itemIdx))
                        toast.success("Archived", {
                            description: `"${item.title}" has been archived`,
                        })
                    }
                } else {
                    // GOTCHA: Tasks are archived by title search which is less reliable.
                    // For now, we mark them as done in the UI and let the user handle
                    // actual task archival through the task page. This is a safe default.
                    setArchivedItems((prev) => new Set(prev).add(itemIdx))
                    toast.success("Noted", {
                        description: `"${item.title}" marked for cleanup — review it on the Tasks page`,
                    })
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unknown error"
                toast.error("Failed to archive", { description: message })
            } finally {
                setArchivingIdx(null)
            }
        },
        [redundantItems]
    )

    const handleArchiveAll = useCallback(async () => {
        for (let i = 0; i < redundantItems.length; i++) {
            if (!archivedItems.has(i)) {
                await handleArchiveItem(i)
            }
        }
    }, [redundantItems, archivedItems, handleArchiveItem])

    // ─── Save Meeting ─────────────────────────────────────────────────────
    const handleSaveMeeting = useCallback(async () => {
        setIsSaving(true)

        try {
            const notesMarkdown = [
                `# Team Meeting: ${topic}`,
                `**Attendees:** ${attendees.join(", ")}`,
                `**Rounds:** ${roundCount}`,
                "",
                "## Summary",
                outputs.notes.summary,
                "",
                "## Key Decisions",
                ...outputs.notes.keyDecisions.map((d) => `- ${d}`),
                "",
                "## Action Items",
                ...outputs.notes.actionItems.map((a) => `- ${a}`),
                "",
                "## Open Questions",
                ...outputs.notes.openQuestions.map((q) => `- ${q}`),
                "",
                "## Next Steps",
                ...outputs.notes.nextSteps.map((s) => `- ${s}`),
                ...(redundantItems.length > 0
                    ? [
                          "",
                          "## Items Retired",
                          ...redundantItems.map(
                              (item) => `- **${item.title}** — ${item.reason} (${item.recommendation})`
                          ),
                      ]
                    : []),
                "",
                "---",
                "",
                "## Full Transcript",
                "",
                "*The complete meeting discussion is included below for reference.*",
                "",
                transcript,
            ].join("\n")

            const result = await createArtifact({
                title: `Team Meeting: ${topic.slice(0, 80)}`,
                content: notesMarkdown,
                contentType: "document",
                metadata: {
                    source: "team-meeting",
                    topic,
                    attendees,
                    roundCount,
                    notes: outputs.notes,
                    objectiveCount: outputs.objectives.length,
                    marketplaceCount: outputs.marketplaceSuggestions.length,
                    redundantItemCount: redundantItems.length,
                },
            })

            if (result.error) {
                toast.error("Failed to save meeting", { description: result.error })
            } else {
                setIsSaved(true)
                toast.success("Meeting saved to Deliverables", {
                    description: "You can find the full meeting notes and transcript in your Deliverables.",
                })
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error"
            toast.error("Failed to save meeting", { description: message })
        } finally {
            setIsSaving(false)
        }
    }, [topic, attendees, roundCount, transcript, outputs, redundantItems])

    // ─── Render ───────────────────────────────────────────────────────────
    return (
        <div className="space-y-4">
            <Tabs defaultValue="objectives">
                <TabsList className="w-full">
                    <TabsTrigger value="notes" className="flex-1 gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        Notes
                    </TabsTrigger>
                    <TabsTrigger value="objectives" className="flex-1 gap-1.5">
                        <Target className="h-3.5 w-3.5" />
                        Objectives
                        {outputs.objectives.length > 0 && (
                            <Badge variant="secondary" className="text-[10px] ml-1">
                                {outputs.objectives.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    {hasCleanupItems && (
                        <TabsTrigger value="cleanup" className="flex-1 gap-1.5">
                            <Archive className="h-3.5 w-3.5" />
                            Cleanup
                            <Badge variant="warning" className="text-[10px] ml-1">
                                {redundantItems.length}
                            </Badge>
                        </TabsTrigger>
                    )}
                    <TabsTrigger value="marketplace" className="flex-1 gap-1.5">
                        <ShoppingBag className="h-3.5 w-3.5" />
                        Resources
                        {outputs.marketplaceSuggestions.length > 0 && (
                            <Badge variant="secondary" className="text-[10px] ml-1">
                                {outputs.marketplaceSuggestions.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>

                {/* ── Notes Tab ─────────────────────────────────────────── */}
                <TabsContent value="notes" className="space-y-4 mt-4">
                    <div className="rounded-lg border border-muted bg-muted/20 p-5 space-y-4">
                        <div>
                            <h4 className="text-sm font-semibold text-foreground mb-1">Summary</h4>
                            <Markdown content={outputs.notes.summary} className="text-sm" />
                        </div>

                        {outputs.notes.keyDecisions.length > 0 && (
                            <div>
                                <h4 className="text-sm font-semibold text-foreground mb-1">
                                    Key Decisions
                                </h4>
                                <ul className="space-y-1">
                                    {outputs.notes.keyDecisions.map((d, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                                            <CheckCircle2 className="h-4 w-4 text-status-success flex-shrink-0 mt-0.5" />
                                            {d}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {outputs.notes.actionItems.length > 0 && (
                            <div>
                                <h4 className="text-sm font-semibold text-foreground mb-1">
                                    Action Items
                                </h4>
                                <ul className="space-y-1">
                                    {outputs.notes.actionItems.map((a, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                                            <ArrowRight className="h-4 w-4 text-international-orange flex-shrink-0 mt-0.5" />
                                            {a}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {outputs.notes.openQuestions.length > 0 && (
                            <div>
                                <h4 className="text-sm font-semibold text-foreground mb-1">
                                    Open Questions
                                </h4>
                                <ul className="space-y-1 list-disc list-inside text-sm text-muted-foreground">
                                    {outputs.notes.openQuestions.map((q, i) => (
                                        <li key={i}>{q}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {outputs.notes.nextSteps.length > 0 && (
                            <div>
                                <h4 className="text-sm font-semibold text-foreground mb-1">
                                    Next Steps
                                </h4>
                                <ol className="space-y-1 list-decimal list-inside text-sm text-foreground">
                                    {outputs.notes.nextSteps.map((s, i) => (
                                        <li key={i}>{s}</li>
                                    ))}
                                </ol>
                            </div>
                        )}
                    </div>
                </TabsContent>

                {/* ── Objectives Tab ────────────────────────────────────── */}
                <TabsContent value="objectives" className="space-y-4 mt-4">
                    {outputs.objectives.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            No specific objectives were identified from this meeting.
                        </p>
                    ) : (
                        outputs.objectives.map((obj, objIdx) => {
                            const isCreated = createdObjectives.has(objIdx)
                            const isCreating = creatingIdx === objIdx
                            const selectedStrategicId = strategicSelections[objIdx]
                            const linkedStrategic = selectedStrategicId
                                ? strategicObjectives.find((s) => s.id === selectedStrategicId)
                                : null
                            return (
                                <Card key={objIdx} className={cn("border", isCreated && "border-status-success/50 bg-status-success-light/20")}>
                                    <CardContent className="pt-5 space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <h4 className="text-sm font-semibold text-foreground">
                                                    {obj.title}
                                                </h4>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {obj.description}
                                                </p>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant={isCreated ? "secondary" : "default"}
                                                onClick={() => handleCreateObjective(objIdx)}
                                                disabled={isCreated || isCreating}
                                                className={cn(
                                                    "flex-shrink-0",
                                                    !isCreated && "bg-international-orange hover:bg-international-orange-hover text-white"
                                                )}
                                            >
                                                {isCreating ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                                ) : isCreated ? (
                                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-status-success" />
                                                ) : (
                                                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                                                )}
                                                {isCreated ? "Created" : "Create"}
                                            </Button>
                                        </div>

                                        {!isCreated && (
                                            <div className="flex items-center gap-2">
                                                <Flag className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                                {creatingStrategicForIdx === objIdx ? (
                                                    <div className="flex items-center gap-1.5 flex-1">
                                                        <Input
                                                            value={newStrategicTitle}
                                                            onChange={(e) => setNewStrategicTitle(e.target.value)}
                                                            placeholder="e.g. Secure Series A Funding"
                                                            className="h-8 text-xs flex-1"
                                                            autoFocus
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter" && newStrategicTitle.trim()) {
                                                                    handleCreateStrategicObjective(objIdx)
                                                                }
                                                                if (e.key === "Escape") {
                                                                    setCreatingStrategicForIdx(null)
                                                                    setNewStrategicTitle("")
                                                                }
                                                            }}
                                                            disabled={isCreatingStrategic}
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant="default"
                                                            onClick={() => handleCreateStrategicObjective(objIdx)}
                                                            disabled={isCreatingStrategic || !newStrategicTitle.trim()}
                                                            className="h-8 px-3 bg-international-orange hover:bg-international-orange-hover text-white"
                                                        >
                                                            {isCreatingStrategic ? (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                "Create"
                                                            )}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => {
                                                                setCreatingStrategicForIdx(null)
                                                                setNewStrategicTitle("")
                                                            }}
                                                            disabled={isCreatingStrategic}
                                                            className="h-8 px-2 text-muted-foreground"
                                                        >
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Select
                                                        value={selectedStrategicId || "none"}
                                                        onValueChange={(value) => handleStrategicSelect(objIdx, value)}
                                                    >
                                                        <SelectTrigger className="h-8 text-xs flex-1">
                                                            <SelectValue placeholder="Add to strategic objective..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="none">
                                                                <span className="text-muted-foreground">No strategic objective</span>
                                                            </SelectItem>
                                                            {strategicObjectives.map((so) => (
                                                                <SelectItem key={so.id} value={so.id}>
                                                                    {so.title}
                                                                </SelectItem>
                                                            ))}
                                                            <SelectItem value="create_new">
                                                                <span className="flex items-center gap-1.5 text-international-orange font-medium">
                                                                    <Plus className="h-3 w-3" />
                                                                    Create new strategic objective
                                                                </span>
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            </div>
                                        )}

                                        {isCreated && linkedStrategic && (
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <Flag className="h-3 w-3 text-international-orange" />
                                                <span>
                                                    Linked to <span className="font-medium text-foreground">{linkedStrategic.title}</span>
                                                </span>
                                            </div>
                                        )}

                                        <div className="space-y-1.5">
                                            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                                                {obj.tasks.length} tasks
                                            </p>
                                            {obj.tasks.map((task, tIdx) => (
                                                <div
                                                    key={tIdx}
                                                    className="flex items-start gap-2 text-xs text-foreground bg-muted/30 rounded px-2.5 py-1.5"
                                                >
                                                    <span className="text-muted-foreground font-mono flex-shrink-0">
                                                        {tIdx + 1}.
                                                    </span>
                                                    <div className="min-w-0">
                                                        <span className="font-medium">{task.title}</span>
                                                        {task.description && (
                                                            <span className="text-muted-foreground ml-1">
                                                                &mdash; {task.description}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })
                    )}
                </TabsContent>

                {/* ── Cleanup Tab ───────────────────────────────────────── */}
                {hasCleanupItems && (
                    <TabsContent value="cleanup" className="space-y-4 mt-4">
                        <div className="rounded-lg border border-status-warning/30 bg-status-warning-light/10 p-4">
                            <div className="flex items-start gap-2 mb-3">
                                <AlertTriangle className="h-4 w-4 text-status-warning flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-semibold text-foreground">
                                        Cal identified {redundantItems.length} item{redundantItems.length !== 1 ? "s" : ""} to clean up
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Based on the meeting discussion, these objectives or tasks are no longer necessary.
                                        Review and archive them to keep your workspace focused.
                                    </p>
                                </div>
                            </div>

                            {redundantItems.length > 1 && archivedItems.size < redundantItems.length && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleArchiveAll}
                                    className="mb-3"
                                >
                                    <Archive className="h-3.5 w-3.5 mr-1.5" />
                                    Archive All Recommended
                                </Button>
                            )}
                        </div>

                        {redundantItems.map((item, idx) => {
                            const isArchived = archivedItems.has(idx)
                            const isArchiving = archivingIdx === idx

                            return (
                                <Card
                                    key={idx}
                                    className={cn(
                                        "border",
                                        isArchived && "border-muted/50 opacity-60"
                                    )}
                                >
                                    <CardContent className="pt-5 space-y-2">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Badge
                                                        variant="secondary"
                                                        className="text-[10px]"
                                                    >
                                                        {item.type}
                                                    </Badge>
                                                    <Badge
                                                        variant={
                                                            item.recommendation === "delete"
                                                                ? "destructive"
                                                                : item.recommendation === "archive"
                                                                  ? "warning"
                                                                  : "info"
                                                        }
                                                        className="text-[10px]"
                                                    >
                                                        {item.recommendation}
                                                    </Badge>
                                                </div>
                                                <h4 className="text-sm font-semibold text-foreground">
                                                    {item.title}
                                                </h4>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {item.reason}
                                                </p>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant={isArchived ? "secondary" : "destructive"}
                                                onClick={() => handleArchiveItem(idx)}
                                                disabled={isArchived || isArchiving}
                                            >
                                                {isArchiving ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                                ) : isArchived ? (
                                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-status-success" />
                                                ) : item.recommendation === "delete" ? (
                                                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                                ) : (
                                                    <Archive className="h-3.5 w-3.5 mr-1.5" />
                                                )}
                                                {isArchived
                                                    ? "Done"
                                                    : item.recommendation === "delete"
                                                      ? "Remove"
                                                      : "Archive"}
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </TabsContent>
                )}

                {/* ── Marketplace Tab ───────────────────────────────────── */}
                <TabsContent value="marketplace" className="space-y-4 mt-4">
                    {outputs.marketplaceSuggestions.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            No specific resource needs were identified from this meeting.
                        </p>
                    ) : (
                        outputs.marketplaceSuggestions.map((suggestion, i) => {
                            const browseUrl =
                                suggestion.category === "People"
                                    ? `/recruits?q=${encodeURIComponent(suggestion.searchQuery)}`
                                    : `/marketplace?q=${encodeURIComponent(suggestion.searchQuery)}`

                            return (
                                <Card key={i} className="border">
                                    <CardContent className="pt-5 space-y-2">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-sm font-semibold text-foreground">
                                                        {suggestion.title}
                                                    </h4>
                                                    <Badge variant="secondary" className="text-[10px]">
                                                        {suggestion.category}
                                                    </Badge>
                                                    {suggestion.subcategory && (
                                                        <Badge variant="secondary" className="text-[10px]">
                                                            {suggestion.subcategory}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {suggestion.reasoning}
                                                </p>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                className="flex-shrink-0"
                                                asChild
                                            >
                                                <Link href={browseUrl}>
                                                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                                    Browse
                                                </Link>
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })
                    )}
                </TabsContent>
            </Tabs>

            {/* ── Action Buttons ──────────────────────────────────────── */}
            <div className="flex items-center justify-between pt-2 border-t gap-2">
                {outputs.report && onShareReport && (
                    <Button
                        onClick={onShareReport}
                        variant="secondary"
                    >
                        <Send className="h-4 w-4 mr-2" />
                        Share Report
                    </Button>
                )}
                <div className="flex-1" />
                <Button
                    onClick={handleSaveMeeting}
                    disabled={isSaving || isSaved}
                    variant={isSaved ? "secondary" : "default"}
                    className={cn(!isSaved && "bg-international-orange hover:bg-international-orange-hover text-white")}
                >
                    {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : isSaved ? (
                        <CheckCircle2 className="h-4 w-4 mr-2 text-status-success" />
                    ) : (
                        <Save className="h-4 w-4 mr-2" />
                    )}
                    {isSaved ? "Saved to Deliverables" : "Save Meeting"}
                </Button>
            </div>
        </div>
    )
}
