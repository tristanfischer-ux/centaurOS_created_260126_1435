"use client"

/**
 * @file meeting-outputs.tsx
 *
 * @description Post-meeting outputs display with three tabs: Meeting Notes,
 * Suggested Objectives & Tasks, and Marketplace Recommendations. Allows
 * one-click objective creation and saving the full meeting as a deliverable.
 *
 * @related
 * - team-meeting-dialog.tsx -- Parent component
 * - src/actions/objectives.ts -- createObjective for one-click creation
 * - src/actions/agent-artifacts.ts -- createArtifact for saving deliverables
 */

import { useState, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Markdown } from "@/components/ui/markdown"
import { createObjective } from "@/actions/objectives"
import { createArtifact } from "@/actions/agent-artifacts"
import type { MeetingOutputData } from "./team-meeting-dialog"

// ─── Props ────────────────────────────────────────────────────────────────────

interface MeetingOutputsProps {
    outputs: MeetingOutputData
    topic: string
    attendees: string[]
    transcript: string
    roundCount: number
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * MeetingOutputs -- Tabbed display of post-meeting AI-generated outputs.
 * Handles one-click objective creation and saving the meeting as a deliverable.
 */
export function MeetingOutputs({
    outputs,
    topic,
    attendees,
    transcript,
    roundCount,
}: MeetingOutputsProps) {
    const [createdObjectives, setCreatedObjectives] = useState<Set<number>>(new Set())
    const [creatingIdx, setCreatingIdx] = useState<number | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [isSaved, setIsSaved] = useState(false)

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

                // Add tasks as aiTasks JSON strings
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
                    setCreatedObjectives((prev) => new Set(prev).add(objIdx))
                    toast.success("Objective created", {
                        description: `"${obj.title}" with ${obj.tasks.length} tasks`,
                    })
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unknown error"
                toast.error("Failed to create objective", { description: message })
            } finally {
                setCreatingIdx(null)
            }
        },
        [outputs.objectives]
    )

    // ─── Save Meeting ─────────────────────────────────────────────────────
    const handleSaveMeeting = useCallback(async () => {
        setIsSaving(true)

        try {
            // Build meeting notes markdown
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
    }, [topic, attendees, roundCount, transcript, outputs])

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

                                        {/* Tasks */}
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

            {/* ── Save Button ──────────────────────────────────────────── */}
            <div className="flex justify-end pt-2 border-t">
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
