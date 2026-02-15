"use client"

import { useState, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { Target, CheckSquare, Loader2, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createObjective } from "@/actions/objectives"
import { createTask } from "@/actions/tasks"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type { ProposedAction } from "@/app/(platform)/agents/brief-specialist-dialog"
import type { Specialist } from "@/app/(platform)/agents/specialists-data"

interface ProposedActionsCardProps {
    proposals: ProposedAction[]
    specialist: Specialist
    onDismiss: () => void
    onCreated?: (count: number) => void
}

type CreatedState = {
    objectiveIds: string[]
    taskIds: string[]
}

export function ProposedActionsCard({
    proposals,
    specialist,
    onDismiss,
    onCreated,
}: ProposedActionsCardProps) {
    const [isCreating, setIsCreating] = useState(false)
    const [dismissed, setDismissed] = useState(false)
    const [created, setCreated] = useState<CreatedState | null>(null)

    const handleCreateAll = useCallback(async () => {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
            toast.error("You must be signed in to create items")
            return
        }

        setIsCreating(true)
        const objectiveIds: string[] = []
        const taskIds: string[] = []

        try {
            // Create objectives first (in order); map title -> id for linking tasks
            const objectiveTitleToId = new Map<string, string>()

            for (const p of proposals) {
                if (p.type !== "objective") continue
                const fd = new FormData()
                fd.set("title", p.title.trim().slice(0, 200))
                if (p.description?.trim()) {
                    fd.set("description", p.description.trim().slice(0, 10000))
                }
                const result = await createObjective(fd)
                if (result.error) {
                    toast.error(result.error)
                    setIsCreating(false)
                    return
                }
                if ("objectiveId" in result && result.objectiveId) {
                    objectiveIds.push(result.objectiveId)
                    objectiveTitleToId.set(p.title.trim(), result.objectiveId)
                }
            }

            // Create tasks (link to objective by objectiveTitle when present)
            for (const p of proposals) {
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
                    setIsCreating(false)
                    return
                }
                if ("taskId" in result && result.taskId) {
                    taskIds.push(result.taskId)
                }
            }

            setCreated({ objectiveIds, taskIds })
            const total = objectiveIds.length + taskIds.length
            toast.success(
                total === 1 ? "1 item created" : `${total} items created`,
                { duration: 3000 }
            )
            onCreated?.(total)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to create"
            toast.error(message)
        } finally {
            setIsCreating(false)
        }
    }, [proposals, onCreated])

    const handleDismiss = useCallback(() => {
        setDismissed(true)
        onDismiss()
    }, [onDismiss])

    if (dismissed) return null

    const objectives = proposals.filter((p) => p.type === "objective")
    const tasks = proposals.filter((p) => p.type === "task")
    const createdCount = created
        ? created.objectiveIds.length + created.taskIds.length
        : 0

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
                    {!created ? (
                        <>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={handleDismiss}
                                disabled={isCreating}
                            >
                                <X className="h-3 w-3 mr-1" />
                                Dismiss
                            </Button>
                            <Button
                                size="sm"
                                className="h-7 text-xs bg-international-orange hover:bg-international-orange-hover"
                                onClick={handleCreateAll}
                                disabled={isCreating}
                            >
                                {isCreating ? (
                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : null}
                                Create all
                            </Button>
                        </>
                    ) : null}
                </div>
            </div>

            <div className="space-y-2">
                {proposals.map((p, i) => {
                    const isObjective = p.type === "objective"
                    const icon = isObjective ? (
                        <Target className="h-3.5 w-3.5 text-international-orange flex-shrink-0" />
                    ) : (
                        <CheckSquare className="h-3.5 w-3.5 text-electric-blue flex-shrink-0" />
                    )
                    const createdId =
                        isObjective && created
                            ? created.objectiveIds[
                                  proposals
                                      .slice(0, i)
                                      .filter((x) => x.type === "objective")
                                      .length
                              ]
                            : !isObjective && created
                              ? created.taskIds[
                                    proposals
                                        .slice(0, i)
                                        .filter((x) => x.type === "task")
                                        .length
                                ]
                              : undefined

                    return (
                        <div
                            key={`${p.type}-${i}-${p.title}`}
                            className={cn(
                                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                                createdId
                                    ? "bg-status-success-light border-status-success"
                                    : "bg-background border-muted"
                            )}
                        >
                            {icon}
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
                            {createdId ? (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <Check className="h-4 w-4 text-status-success" />
                                    <Link
                                        href={
                                            isObjective
                                                ? `/new-objectives?objectiveId=${createdId}`
                                                : `/new-tasks?taskId=${createdId}`
                                        }
                                        className="text-xs font-medium text-international-orange hover:underline"
                                    >
                                        View
                                    </Link>
                                </div>
                            ) : null}
                        </div>
                    )
                })}
            </div>

            {created && createdCount === proposals.length ? (
                <p className="text-xs text-muted-foreground mt-2">
                    All items created. You can continue the conversation or open
                    them from Plan.
                </p>
            ) : null}
        </div>
    )
}
