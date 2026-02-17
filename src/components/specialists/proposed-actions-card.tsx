"use client"

import { useState, useCallback, useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { Target, CheckSquare, Loader2, Check, X, Archive, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { createObjective } from "@/actions/objectives"
import { archiveObjectiveByTitle } from "@/actions/objectives"
import { createTask } from "@/actions/tasks"
import { archiveTaskByTitle } from "@/actions/tasks"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { isDestructiveAction } from "@/app/(platform)/agents/brief-specialist-dialog"
import type { ProposedAction } from "@/app/(platform)/agents/brief-specialist-dialog"
import type { Specialist } from "@/app/(platform)/agents/specialists-data"

interface ProposedActionsCardProps {
    proposals: ProposedAction[]
    specialist: Specialist
    onDismiss: () => void
    onCreated?: (count: number) => void
}

/** Tracks which proposals have been executed (by index). */
type ExecutedState = Record<number, { success: boolean; id?: string }>

export function ProposedActionsCard({
    proposals,
    specialist,
    onDismiss,
    onCreated,
}: ProposedActionsCardProps) {
    const [isExecuting, setIsExecuting] = useState(false)
    const [dismissed, setDismissed] = useState(false)
    const [executed, setExecuted] = useState<ExecutedState>({})

    // Selection state: all items start selected
    const [selected, setSelected] = useState<Set<number>>(
        () => new Set(proposals.map((_, i) => i))
    )

    const toggleItem = useCallback((index: number) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(index)) {
                next.delete(index)
            } else {
                next.add(index)
            }
            return next
        })
    }, [])

    const selectedProposals = useMemo(
        () => proposals.filter((_, i) => selected.has(i)),
        [proposals, selected]
    )

    const selectedArchiveCount = useMemo(
        () => selectedProposals.filter((p) => isDestructiveAction(p)).length,
        [selectedProposals]
    )
    const selectedCreateCount = useMemo(
        () => selectedProposals.filter((p) => !isDestructiveAction(p)).length,
        [selectedProposals]
    )

    const hasArchiveActions = proposals.some((p) => isDestructiveAction(p))
    const hasCreateActions = proposals.some((p) => !isDestructiveAction(p))

    const handleExecuteSelected = useCallback(async () => {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
            toast.error("You must be signed in")
            return
        }

        if (selected.size === 0) {
            toast.error("No items selected")
            return
        }

        setIsExecuting(true)
        const results: ExecutedState = {}

        try {
            // Phase 1: Archive actions first (remove old items before creating new ones)
            for (let i = 0; i < proposals.length; i++) {
                if (!selected.has(i)) continue
                const p = proposals[i]
                if (!isDestructiveAction(p)) continue

                if (p.type === "archive_objective") {
                    const result = await archiveObjectiveByTitle(p.title)
                    if ("error" in result) {
                        console.warn("[ProposedActions] Failed to archive objective:", {
                            title: p.title,
                            error: result.error,
                        })
                        results[i] = { success: false }
                    } else {
                        results[i] = { success: true, id: result.objectiveId }
                    }
                } else if (p.type === "archive_task") {
                    const result = await archiveTaskByTitle(p.title)
                    if ("error" in result) {
                        console.warn("[ProposedActions] Failed to archive task:", {
                            title: p.title,
                            error: result.error,
                        })
                        results[i] = { success: false }
                    } else {
                        results[i] = { success: true, id: result.taskId }
                    }
                }
            }

            // Phase 2: Create objectives (in order); map title -> id for linking tasks
            const objectiveTitleToId = new Map<string, string>()

            for (let i = 0; i < proposals.length; i++) {
                if (!selected.has(i)) continue
                const p = proposals[i]
                if (p.type !== "objective") continue
                const fd = new FormData()
                fd.set("title", p.title.trim().slice(0, 200))
                if (p.description?.trim()) {
                    fd.set("description", p.description.trim().slice(0, 10000))
                }
                const result = await createObjective(fd)
                if (result.error) {
                    toast.error(result.error)
                    setIsExecuting(false)
                    return
                }
                if ("objectiveId" in result && result.objectiveId) {
                    results[i] = { success: true, id: result.objectiveId }
                    objectiveTitleToId.set(p.title.trim(), result.objectiveId)
                }
            }

            // Phase 3: Create tasks (link to objective by objectiveTitle when present)
            for (let i = 0; i < proposals.length; i++) {
                if (!selected.has(i)) continue
                const p = proposals[i]
                if (p.type !== "task") continue
                const fd = new FormData()
                fd.set("title", p.title.trim().slice(0, 500))
                if (p.description?.trim()) {
                    fd.set("description", p.description.trim().slice(0, 10000))
                }
                fd.set("assignee_id", user.id)
                fd.set("assignee_ids", JSON.stringify([user.id]))

                if (p.objectiveTitle?.trim()) {
                    const linkedId = objectiveTitleToId.get(p.objectiveTitle.trim())
                    if (linkedId) {
                        fd.set("objective_id", linkedId)
                    }
                }

                const result = await createTask(fd)
                if (result.error) {
                    toast.error(result.error)
                    setIsExecuting(false)
                    return
                }
                if ("taskId" in result && result.taskId) {
                    results[i] = { success: true, id: result.taskId }
                }
            }

            setExecuted(results)

            // Build summary toast
            const archivedCount = Object.entries(results).filter(
                ([idx]) => isDestructiveAction(proposals[Number(idx)])
            ).filter(([, r]) => r.success).length
            const createdCount = Object.entries(results).filter(
                ([idx]) => !isDestructiveAction(proposals[Number(idx)])
            ).filter(([, r]) => r.success).length

            const parts: string[] = []
            if (archivedCount > 0) parts.push(`${archivedCount} archived`)
            if (createdCount > 0) parts.push(`${createdCount} created`)
            toast.success(parts.join(", "), { duration: 3000 })

            onCreated?.(createdCount + archivedCount)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to execute"
            toast.error(message)
        } finally {
            setIsExecuting(false)
        }
    }, [proposals, selected, onCreated])

    const handleDismiss = useCallback(() => {
        setDismissed(true)
        onDismiss()
    }, [onDismiss])

    if (dismissed) return null

    const executedCount = Object.keys(executed).length
    const allDone = executedCount > 0 && executedCount >= selected.size

    /** Build the primary button label based on what's selected. */
    function getButtonLabel(): string {
        if (selectedArchiveCount > 0 && selectedCreateCount > 0) {
            return `Apply ${selected.size} selected`
        }
        if (selectedArchiveCount > 0) {
            return selectedArchiveCount === 1
                ? "Archive 1 selected"
                : `Archive ${selectedArchiveCount} selected`
        }
        if (selectedCreateCount > 0) {
            return selectedCreateCount === proposals.length
                ? "Create all"
                : `Create ${selectedCreateCount} selected`
        }
        return "Apply selected"
    }

    return (
        <div className="mb-4 p-3 rounded-lg bg-international-orange/5 border border-international-orange/20">
            <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                    {specialist.avatarImage ? (
                        <div className="relative h-6 w-6 rounded-full overflow-hidden flex-shrink-0">
                            <Image
                                src={specialist.avatarImage}
                                alt={specialist.name}
                                fill
                                className="object-cover"
                                sizes="24px"
                            />
                        </div>
                    ) : null}
                    <p className="text-xs font-medium text-international-orange">
                        Suggested actions
                    </p>
                </div>
                <div className="flex items-center gap-1">
                    {!allDone ? (
                        <>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={handleDismiss}
                                disabled={isExecuting}
                            >
                                <X className="h-3 w-3 mr-1" />
                                Dismiss
                            </Button>
                            <Button
                                size="sm"
                                className="h-7 text-xs bg-international-orange hover:bg-international-orange-hover"
                                onClick={handleExecuteSelected}
                                disabled={isExecuting || selected.size === 0}
                            >
                                {isExecuting ? (
                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : null}
                                {getButtonLabel()}
                            </Button>
                        </>
                    ) : null}
                </div>
            </div>

            {/* Archive section (destructive actions shown first) */}
            {hasArchiveActions ? (
                <div className="space-y-1.5 mb-3">
                    <p className="text-xs font-medium text-destructive flex items-center gap-1">
                        <Archive className="h-3 w-3" />
                        Remove
                    </p>
                    {proposals.map((p, i) => {
                        if (!isDestructiveAction(p)) return null
                        const result = executed[i]
                        const isSelected = selected.has(i)
                        const isArchiveObj = p.type === "archive_objective"
                        const isDone = result !== undefined

                        return (
                            <button
                                type="button"
                                key={`${p.type}-${i}-${p.title}`}
                                onClick={() => { if (!isDone && !isExecuting) toggleItem(i) }}
                                disabled={isDone || isExecuting}
                                className={cn(
                                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm w-full text-left transition-colors",
                                    isDone && result.success
                                        ? "bg-muted border-muted line-through opacity-60"
                                        : isDone && !result.success
                                          ? "bg-status-error-light border-destructive"
                                          : isSelected
                                            ? "bg-destructive/5 border-destructive/20 hover:bg-destructive/10"
                                            : "bg-muted/30 border-muted opacity-50 hover:opacity-70"
                                )}
                            >
                                {!isDone ? (
                                    <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => toggleItem(i)}
                                        disabled={isExecuting}
                                        className={cn(
                                            "flex-shrink-0",
                                            isSelected
                                                ? "border-destructive data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
                                                : ""
                                        )}
                                        aria-label={`${isSelected ? "Deselect" : "Select"}: ${p.title}`}
                                    />
                                ) : (
                                    <Trash2 className={cn(
                                        "h-3.5 w-3.5 flex-shrink-0",
                                        result.success ? "text-muted-foreground" : "text-destructive"
                                    )} />
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className={cn(
                                        "font-medium truncate",
                                        isDone && result.success ? "text-muted-foreground" : "text-foreground"
                                    )}>
                                        {p.title}
                                    </p>
                                    {p.description ? (
                                        <p className="text-xs text-muted-foreground truncate">
                                            {p.description}
                                        </p>
                                    ) : null}
                                </div>
                                {isDone && result.success ? (
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <Check className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-xs text-muted-foreground">Archived</span>
                                    </div>
                                ) : isDone && !result.success ? (
                                    <span className="text-xs text-destructive flex-shrink-0">Not found</span>
                                ) : (
                                    <span className="text-xs text-destructive/60 flex-shrink-0">
                                        {isArchiveObj ? "Objective" : "Task"}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            ) : null}

            {/* Create section (constructive actions) */}
            {hasCreateActions ? (
                <div className="space-y-1.5">
                    {hasArchiveActions ? (
                        <p className="text-xs font-medium text-status-success flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            Replace with
                        </p>
                    ) : null}
                    {proposals.map((p, i) => {
                        if (isDestructiveAction(p)) return null
                        const isObjective = p.type === "objective"
                        const isSelected = selected.has(i)
                        const result = executed[i]
                        const isDone = result !== undefined

                        return (
                            <button
                                type="button"
                                key={`${p.type}-${i}-${p.title}`}
                                onClick={() => { if (!isDone && !isExecuting) toggleItem(i) }}
                                disabled={isDone || isExecuting}
                                className={cn(
                                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm w-full text-left transition-colors",
                                    isDone && result.success
                                        ? "bg-status-success-light border-status-success"
                                        : isSelected
                                          ? "bg-background border-muted hover:bg-muted/30"
                                          : "bg-muted/30 border-muted opacity-50 hover:opacity-70"
                                )}
                            >
                                {!isDone ? (
                                    <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => toggleItem(i)}
                                        disabled={isExecuting}
                                        className="flex-shrink-0"
                                        aria-label={`${isSelected ? "Deselect" : "Select"}: ${p.title}`}
                                    />
                                ) : isObjective ? (
                                    <Target className="h-3.5 w-3.5 text-international-orange flex-shrink-0" />
                                ) : (
                                    <CheckSquare className="h-3.5 w-3.5 text-electric-blue flex-shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium text-foreground truncate">
                                        {p.title}
                                    </p>
                                    {p.description ? (
                                        <p className="text-xs text-muted-foreground truncate">
                                            {p.description}
                                        </p>
                                    ) : null}
                                </div>
                                {isDone && result.success && result.id ? (
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <Check className="h-4 w-4 text-status-success" />
                                        <Link
                                            href={
                                                isObjective
                                                    ? `/new-objectives?objectiveId=${result.id}`
                                                    : `/new-tasks?taskId=${result.id}`
                                            }
                                            className="text-xs font-medium text-international-orange hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            View
                                        </Link>
                                    </div>
                                ) : null}
                            </button>
                        )
                    })}
                </div>
            ) : null}

            {allDone ? (
                <p className="text-xs text-muted-foreground mt-2">
                    {hasArchiveActions && hasCreateActions
                        ? "Strategy updated. Old items archived, new items created."
                        : hasArchiveActions
                          ? "Items archived. You can continue the conversation."
                          : "All items created. You can continue the conversation or open them from Plan."}
                </p>
            ) : null}
        </div>
    )
}
