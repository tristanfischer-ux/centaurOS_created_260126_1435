"use client"

import { useState, useCallback, useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { Target, CheckSquare, Loader2, Check, X, Archive, Trash2, AlertTriangle } from "lucide-react"
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

/**
 * Looks up active strategic goals in the user's foundry.
 *
 * @description Fetches all objectives where is_strategic_goal = true
 * and deleted_at is null to enable linking new objectives to strategic goals.
 *
 * @returns Map of lowercased strategic goal title to its objective ID.
 */
async function fetchStrategicGoalMap(): Promise<Map<string, string>> {
    const supabase = createClient()
    const { data } = await supabase
        .from("objectives")
        .select("id, title")
        .eq("is_strategic_goal", true)
        .is("deleted_at", null)

    const map = new Map<string, string>()
    if (data) {
        for (const row of data) {
            map.set(row.title.trim().toLowerCase(), row.id)
        }
    }
    return map
}

export function ProposedActionsCard({
    proposals,
    specialist,
    onDismiss,
    onCreated,
}: ProposedActionsCardProps) {
    const [isExecuting, setIsExecuting] = useState(false)
    const [dismissed, setDismissed] = useState(false)
    const [executed, setExecuted] = useState<ExecutedState>({})

    // Track which section is currently running so we can disable the other
    const [activeSection, setActiveSection] = useState<"archive" | "create" | "all" | null>(null)

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

    // Derived counts
    const archiveIndices = useMemo(
        () => proposals.map((p, i) => ({ p, i })).filter(({ p }) => isDestructiveAction(p)).map(({ i }) => i),
        [proposals]
    )
    const createIndices = useMemo(
        () => proposals.map((p, i) => ({ p, i })).filter(({ p }) => !isDestructiveAction(p)).map(({ i }) => i),
        [proposals]
    )

    const selectedArchiveCount = useMemo(
        () => archiveIndices.filter((i) => selected.has(i)).length,
        [archiveIndices, selected]
    )
    const selectedCreateCount = useMemo(
        () => createIndices.filter((i) => selected.has(i)).length,
        [createIndices, selected]
    )

    const hasArchiveActions = archiveIndices.length > 0
    const hasCreateActions = createIndices.length > 0

    // Track if all archives are done (to auto-collapse)
    const allArchivesDone = useMemo(
        () => archiveIndices.length > 0 && archiveIndices.every((i) => executed[i] !== undefined),
        [archiveIndices, executed]
    )
    const allCreatesDone = useMemo(
        () => createIndices.length > 0 && createIndices.every((i) => executed[i] !== undefined),
        [createIndices, executed]
    )

    // ─── Execute only archive actions ────────────────────────────────────────────
    const handleExecuteArchives = useCallback(async () => {
        setIsExecuting(true)
        setActiveSection("archive")
        const results: ExecutedState = { ...executed }

        try {
            for (const i of archiveIndices) {
                if (!selected.has(i)) continue
                if (executed[i]) continue // already processed
                const p = proposals[i]

                if (p.type === "archive_objective") {
                    const result = await archiveObjectiveByTitle(p.title)
                    if ("error" in result) {
                        console.warn("[ProposedActions] Failed to archive objective:", { title: p.title, error: result.error })
                        results[i] = { success: false }
                    } else {
                        results[i] = { success: true, id: result.objectiveId }
                    }
                } else if (p.type === "archive_task") {
                    const result = await archiveTaskByTitle(p.title)
                    if ("error" in result) {
                        console.warn("[ProposedActions] Failed to archive task:", { title: p.title, error: result.error })
                        results[i] = { success: false }
                    } else {
                        results[i] = { success: true, id: result.taskId }
                    }
                }
            }

            setExecuted(results)

            const archivedCount = archiveIndices
                .filter((i) => results[i]?.success)
                .length
            if (archivedCount > 0) {
                toast.success(`${archivedCount} item${archivedCount > 1 ? "s" : ""} archived`)
            }
            const failedCount = archiveIndices
                .filter((i) => selected.has(i) && results[i] && !results[i].success)
                .length
            if (failedCount > 0) {
                toast.warning(`${failedCount} item${failedCount > 1 ? "s" : ""} could not be found to archive`)
            }

            onCreated?.(archivedCount)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to archive"
            toast.error(message)
        } finally {
            setIsExecuting(false)
            setActiveSection(null)
        }
    }, [proposals, selected, executed, archiveIndices, onCreated])

    // ─── Execute only create actions ─────────────────────────────────────────────
    const handleExecuteCreates = useCallback(async () => {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
            toast.error("You must be signed in")
            return
        }

        setIsExecuting(true)
        setActiveSection("create")
        const results: ExecutedState = { ...executed }

        try {
            // Fetch strategic goals so we can link objectives by title
            const strategicGoalMap = await fetchStrategicGoalMap()
            const objectiveTitleToId = new Map<string, string>()
            const unlinkWarnings: string[] = []

            // Phase 1: Create objectives
            for (const i of createIndices) {
                if (!selected.has(i)) continue
                if (executed[i]) continue
                const p = proposals[i]
                if (p.type !== "objective") continue

                const fd = new FormData()
                fd.set("title", p.title.trim().slice(0, 200))
                if (p.description?.trim()) {
                    fd.set("description", p.description.trim().slice(0, 10000))
                }

                // Link to strategic goal if specified
                if (p.strategicGoalTitle?.trim()) {
                    const goalId = strategicGoalMap.get(p.strategicGoalTitle.trim().toLowerCase())
                    if (goalId) {
                        fd.set("parent_objective_id", goalId)
                    } else {
                        unlinkWarnings.push(p.title)
                    }
                }

                const result = await createObjective(fd)
                if (result.error) {
                    toast.error(result.error)
                    setIsExecuting(false)
                    setActiveSection(null)
                    return
                }
                if ("objectiveId" in result && result.objectiveId) {
                    results[i] = { success: true, id: result.objectiveId }
                    objectiveTitleToId.set(p.title.trim(), result.objectiveId)
                }
            }

            // Phase 2: Create tasks (link to objective by objectiveTitle when present)
            for (const i of createIndices) {
                if (!selected.has(i)) continue
                if (executed[i]) continue
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
                    setActiveSection(null)
                    return
                }
                if ("taskId" in result && result.taskId) {
                    results[i] = { success: true, id: result.taskId }
                }
            }

            setExecuted(results)

            const createdCount = createIndices.filter((i) => results[i]?.success).length
            if (createdCount > 0) {
                toast.success(`${createdCount} item${createdCount > 1 ? "s" : ""} created`)
            }
            if (unlinkWarnings.length > 0) {
                toast.warning(
                    `${unlinkWarnings.length} objective${unlinkWarnings.length > 1 ? "s" : ""} created but not linked to a strategic goal (no matching goal found)`,
                    { duration: 5000 }
                )
            }

            onCreated?.(createdCount)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to create"
            toast.error(message)
        } finally {
            setIsExecuting(false)
            setActiveSection(null)
        }
    }, [proposals, selected, executed, createIndices, onCreated])

    // ─── Execute all: archive first, then create ─────────────────────────────────
    const handleExecuteAll = useCallback(async () => {
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
        setActiveSection("all")
        const results: ExecutedState = { ...executed }

        try {
            // Phase 1: Archive actions first
            for (const i of archiveIndices) {
                if (!selected.has(i)) continue
                if (executed[i]) continue
                const p = proposals[i]

                if (p.type === "archive_objective") {
                    const result = await archiveObjectiveByTitle(p.title)
                    if ("error" in result) {
                        console.warn("[ProposedActions] Failed to archive objective:", { title: p.title, error: result.error })
                        results[i] = { success: false }
                    } else {
                        results[i] = { success: true, id: result.objectiveId }
                    }
                } else if (p.type === "archive_task") {
                    const result = await archiveTaskByTitle(p.title)
                    if ("error" in result) {
                        console.warn("[ProposedActions] Failed to archive task:", { title: p.title, error: result.error })
                        results[i] = { success: false }
                    } else {
                        results[i] = { success: true, id: result.taskId }
                    }
                }
            }

            // Phase 2: Create objectives (link to strategic goals)
            const strategicGoalMap = await fetchStrategicGoalMap()
            const objectiveTitleToId = new Map<string, string>()
            const unlinkWarnings: string[] = []

            for (const i of createIndices) {
                if (!selected.has(i)) continue
                if (executed[i]) continue
                const p = proposals[i]
                if (p.type !== "objective") continue

                const fd = new FormData()
                fd.set("title", p.title.trim().slice(0, 200))
                if (p.description?.trim()) {
                    fd.set("description", p.description.trim().slice(0, 10000))
                }

                if (p.strategicGoalTitle?.trim()) {
                    const goalId = strategicGoalMap.get(p.strategicGoalTitle.trim().toLowerCase())
                    if (goalId) {
                        fd.set("parent_objective_id", goalId)
                    } else {
                        unlinkWarnings.push(p.title)
                    }
                }

                const result = await createObjective(fd)
                if (result.error) {
                    toast.error(result.error)
                    setIsExecuting(false)
                    setActiveSection(null)
                    return
                }
                if ("objectiveId" in result && result.objectiveId) {
                    results[i] = { success: true, id: result.objectiveId }
                    objectiveTitleToId.set(p.title.trim(), result.objectiveId)
                }
            }

            // Phase 3: Create tasks
            for (const i of createIndices) {
                if (!selected.has(i)) continue
                if (executed[i]) continue
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
                    setActiveSection(null)
                    return
                }
                if ("taskId" in result && result.taskId) {
                    results[i] = { success: true, id: result.taskId }
                }
            }

            setExecuted(results)

            // Summary toast
            const archivedCount = archiveIndices.filter((i) => results[i]?.success).length
            const createdCount = createIndices.filter((i) => results[i]?.success).length
            const parts: string[] = []
            if (archivedCount > 0) parts.push(`${archivedCount} archived`)
            if (createdCount > 0) parts.push(`${createdCount} created`)
            if (parts.length > 0) toast.success(parts.join(", "), { duration: 3000 })

            if (unlinkWarnings.length > 0) {
                toast.warning(
                    `${unlinkWarnings.length} objective${unlinkWarnings.length > 1 ? "s" : ""} not linked to a strategic goal`,
                    { duration: 5000 }
                )
            }

            onCreated?.(archivedCount + createdCount)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to execute"
            toast.error(message)
        } finally {
            setIsExecuting(false)
            setActiveSection(null)
        }
    }, [proposals, selected, executed, archiveIndices, createIndices, onCreated])

    const handleDismiss = useCallback(() => {
        setDismissed(true)
        onDismiss()
    }, [onDismiss])

    if (dismissed) return null

    const allDone =
        Object.keys(executed).length > 0 &&
        [...selected].every((i) => executed[i] !== undefined)

    // Global button label (for "Apply all selected")
    function getGlobalButtonLabel(): string {
        const totalSelected = selectedArchiveCount + selectedCreateCount
        if (totalSelected === 0) return "Apply selected"
        if (selectedArchiveCount > 0 && selectedCreateCount > 0) {
            return `Apply all ${totalSelected} selected`
        }
        if (selectedArchiveCount > 0) {
            return `Archive ${selectedArchiveCount} selected`
        }
        return `Create ${selectedCreateCount} selected`
    }

    return (
        <div className="mb-4 p-3 rounded-lg bg-international-orange/5 border border-international-orange/20">
            {/* Header */}
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
                            {/* Global "Apply all" only when both sections exist */}
                            {hasArchiveActions && hasCreateActions && !allArchivesDone && !allCreatesDone ? (
                                <Button
                                    size="sm"
                                    className="h-7 text-xs bg-international-orange hover:bg-international-orange-hover"
                                    onClick={handleExecuteAll}
                                    disabled={isExecuting || selected.size === 0}
                                >
                                    {isExecuting && activeSection === "all" ? (
                                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                    ) : null}
                                    {getGlobalButtonLabel()}
                                </Button>
                            ) : null}
                        </>
                    ) : null}
                </div>
            </div>

            {/* ─── Archive section ───────────────────────────────────────────────── */}
            {hasArchiveActions ? (
                <div className={cn("space-y-1.5", allArchivesDone ? "mb-2" : "mb-3")}>
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-destructive flex items-center gap-1">
                            <Archive className="h-3 w-3" />
                            Remove
                        </p>
                        {!allArchivesDone ? (
                            <Button
                                variant="destructive"
                                size="sm"
                                className="h-6 text-[11px] px-2"
                                onClick={handleExecuteArchives}
                                disabled={isExecuting || selectedArchiveCount === 0}
                            >
                                {isExecuting && activeSection === "archive" ? (
                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : null}
                                {selectedArchiveCount === archiveIndices.length
                                    ? `Archive all (${selectedArchiveCount})`
                                    : `Archive ${selectedArchiveCount} selected`}
                            </Button>
                        ) : (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Check className="h-3 w-3" /> Done
                            </span>
                        )}
                    </div>

                    {/* Collapse completed archive items */}
                    {allArchivesDone ? (
                        <p className="text-xs text-muted-foreground">
                            {archiveIndices.length} item{archiveIndices.length > 1 ? "s" : ""} archived
                        </p>
                    ) : (
                        proposals.map((p, i) => {
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
                        })
                    )}
                </div>
            ) : null}

            {/* ─── Create section ────────────────────────────────────────────────── */}
            {hasCreateActions ? (
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-status-success flex items-center gap-1">
                            {hasArchiveActions ? (
                                <Target className="h-3 w-3" />
                            ) : (
                                <Target className="h-3 w-3" />
                            )}
                            {hasArchiveActions ? "Replace with" : "Suggested actions"}
                        </p>
                        {!allCreatesDone ? (
                            <Button
                                size="sm"
                                className="h-6 text-[11px] px-2 bg-international-orange hover:bg-international-orange-hover"
                                onClick={handleExecuteCreates}
                                disabled={isExecuting || selectedCreateCount === 0}
                            >
                                {isExecuting && activeSection === "create" ? (
                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : null}
                                {selectedCreateCount === createIndices.length
                                    ? `Create all (${selectedCreateCount})`
                                    : `Create ${selectedCreateCount} selected`}
                            </Button>
                        ) : (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Check className="h-3 w-3" /> Done
                            </span>
                        )}
                    </div>

                    {allCreatesDone ? (
                        <p className="text-xs text-muted-foreground">
                            {createIndices.length} item{createIndices.length > 1 ? "s" : ""} created
                        </p>
                    ) : (
                        proposals.map((p, i) => {
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
                                        {isObjective && p.strategicGoalTitle ? (
                                            <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                                                <AlertTriangle className="h-2.5 w-2.5 inline-block" />
                                                Under: {p.strategicGoalTitle}
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
                        })
                    )}
                </div>
            ) : null}

            {/* ─── Completion message ────────────────────────────────────────────── */}
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
