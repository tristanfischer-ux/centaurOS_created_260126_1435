"use client"

/**
 * @file page-action-card.tsx -- Approval card for specialist-proposed page actions.
 *
 * @description Renders a compact approval card when a specialist proposes a
 * page-specific mutation (e.g. create project, create objective, create task).
 * The user can review the proposed action details and either approve or dismiss.
 *
 * @security Actions are NEVER auto-executed. This card is the approval gate between
 * the specialist's proposal and the actual server action call.
 *
 * @related
 * - Types: src/lib/agents/tools/page-action-types.ts
 * - Executor: src/actions/page-action-executor.ts
 * - External action card (sibling pattern): src/components/specialists/external-action-card.tsx
 */

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { FolderPlus, Target, ListTodo, Loader2, Check, X, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { ProposedPageAction } from "@/lib/agents/tools/page-action-types"
import { executePageAction } from "@/actions/page-action-executor"
import type { LucideIcon } from "lucide-react"

interface PageActionCardProps {
    action: ProposedPageAction
    onDismiss: () => void
}

/** Maps action types to their icon, label, and color scheme. */
const ACTION_CONFIG: Record<string, {
    icon: LucideIcon
    label: string
    approveLabel: string
    colorClass: string
    bgClass: string
    borderClass: string
}> = {
    create_finance_project: {
        icon: FolderPlus,
        label: "Finance Project",
        approveLabel: "Create Project",
        colorClass: "text-international-orange",
        bgClass: "bg-international-orange/10",
        borderClass: "border-international-orange/20",
    },
    create_objective: {
        icon: Target,
        label: "Objective",
        approveLabel: "Create Objective",
        colorClass: "text-info",
        bgClass: "bg-info/10",
        borderClass: "border-info/20",
    },
    create_task: {
        icon: ListTodo,
        label: "Task",
        approveLabel: "Create Task",
        colorClass: "text-status-success",
        bgClass: "bg-status-success/10",
        borderClass: "border-status-success/20",
    },
}

const DEFAULT_CONFIG = {
    icon: FolderPlus,
    label: "Page Action",
    approveLabel: "Execute",
    colorClass: "text-muted-foreground",
    bgClass: "bg-muted/50",
    borderClass: "border-border",
}

/**
 * PageActionCard -- Renders an approval card for a proposed page action.
 *
 * @description Shows the action type, title, description, and a preview of the payload.
 * On approval, calls executePageAction() and shows success/error feedback.
 * On success, triggers a router refresh so the page reflects the new data.
 */
export function PageActionCard({ action, onDismiss }: PageActionCardProps) {
    const [isExecuting, setIsExecuting] = useState(false)
    const [result, setResult] = useState<{ success: boolean; redirectUrl?: string } | null>(null)
    const router = useRouter()

    const config = ACTION_CONFIG[action.type] ?? DEFAULT_CONFIG
    const Icon = config.icon

    const handleApprove = useCallback(async () => {
        setIsExecuting(true)

        try {
            const res = await executePageAction(action.type, action.payload)
            if (!res.success) {
                toast.error("Action failed", { description: res.error })
                setResult({ success: false })
            } else {
                const redirectUrl = res.data?.redirectUrl as string | undefined
                toast.success(action.title, {
                    description: `${config.label} created successfully`,
                    action: redirectUrl
                        ? { label: "View", onClick: () => router.push(redirectUrl) }
                        : undefined,
                })
                setResult({ success: true, redirectUrl })
                // Refresh page data so the newly created entity appears
                router.refresh()
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to execute action"
            toast.error(message)
            setResult({ success: false })
        } finally {
            setIsExecuting(false)
        }
    }, [action, config.label, router])

    // After successful execution, show a compact success state
    if (result?.success) {
        return (
            <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", config.bgClass, config.borderClass)}>
                <Check className={cn("h-4 w-4 flex-shrink-0", config.colorClass)} />
                <span className="text-xs font-medium text-foreground flex-1 truncate">
                    {action.title}
                </span>
                {result.redirectUrl && (
                    <button
                        onClick={() => router.push(result.redirectUrl!)}
                        className={cn("text-xs flex items-center gap-1 hover:underline flex-shrink-0", config.colorClass)}
                    >
                        View <ExternalLink className="h-3 w-3" />
                    </button>
                )}
            </div>
        )
    }

    return (
        <div className={cn("rounded-lg border p-3", config.bgClass, config.borderClass)}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
                <div className={cn("flex items-center justify-center h-6 w-6 rounded", config.bgClass)}>
                    <Icon className={cn("h-3.5 w-3.5", config.colorClass)} />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">
                        {action.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                        {config.label}
                    </p>
                </div>
            </div>

            {/* Description */}
            {action.description && (
                <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                    {action.description}
                </p>
            )}

            {/* Payload preview -- generic key-value pairs */}
            <PayloadPreview payload={action.payload} />

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 mt-2">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={onDismiss}
                    disabled={isExecuting}
                >
                    <X className="h-3 w-3 mr-1" />
                    Dismiss
                </Button>
                <Button
                    size="sm"
                    className="h-7 text-xs bg-international-orange hover:bg-international-orange-hover"
                    onClick={handleApprove}
                    disabled={isExecuting}
                >
                    {isExecuting ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : null}
                    {config.approveLabel}
                </Button>
            </div>
        </div>
    )
}

// ─── Payload Preview ────────────────────────────────────────────────

/**
 * Renders a generic key-value preview of the action payload.
 */
function PayloadPreview({ payload }: { payload: Record<string, unknown> }) {
    const entries = Object.entries(payload).filter(
        ([, v]) => v !== undefined && v !== null && v !== "",
    )

    if (entries.length === 0) return null

    return (
        <div className="rounded bg-card/50 border border-border/50 p-2 text-[10px] space-y-0.5">
            {entries.map(([key, value]) => (
                <p key={key} className="text-foreground truncate">
                    <span className="text-muted-foreground capitalize">
                        {key.replace(/([A-Z])/g, " $1").trim()}:
                    </span>{" "}
                    {String(value)}
                </p>
            ))}
        </div>
    )
}
