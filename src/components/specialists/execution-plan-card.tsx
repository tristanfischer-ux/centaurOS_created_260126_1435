"use client"

import { useState, useCallback } from "react"
import Image from "next/image"
import {
    Play,
    Check,
    X,
    Loader2,
    ChevronDown,
    ChevronRight,
    SkipForward,
    ListChecks,
    AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getSpecialistById } from "@/app/(platform)/agents/specialists-data"
import type { Specialist } from "@/app/(platform)/agents/specialists-data"
import type { ExecutionPlan, StepStatus } from "@/lib/agents/execution-plan-types"
import { countCompletedSteps } from "@/lib/agents/execution-plan-types"

// ─── Props ──────────────────────────────────────────────────────────

interface ExecutionPlanCardProps {
    plan: ExecutionPlan
    specialist: Specialist
    onExecuteStep: (stepIndex: number) => void
    onApproveStep: (stepIndex: number) => void
    onSkipStep: (stepIndex: number) => void
    onRunAll: () => void
    onCancel: () => void
    onDismiss: () => void
}

// ─── Status Helpers ─────────────────────────────────────────────────

function getStatusColor(status: StepStatus): string {
    switch (status) {
        case "pending": return "text-muted-foreground bg-muted"
        case "running": return "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950"
        case "review": return "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950"
        case "approved": return "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950"
        case "error": return "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950"
        case "skipped": return "text-muted-foreground bg-muted/50"
    }
}

function getStatusIcon(status: StepStatus) {
    switch (status) {
        case "pending": return null
        case "running": return <Loader2 className="h-3 w-3 animate-spin" />
        case "review": return <AlertCircle className="h-3 w-3" />
        case "approved": return <Check className="h-3 w-3" />
        case "error": return <AlertCircle className="h-3 w-3" />
        case "skipped": return <SkipForward className="h-3 w-3" />
    }
}

function getStatusLabel(status: StepStatus): string {
    switch (status) {
        case "pending": return "Pending"
        case "running": return "Running..."
        case "review": return "Review output"
        case "approved": return "Done"
        case "error": return "Error"
        case "skipped": return "Skipped"
    }
}

// ─── Component ──────────────────────────────────────────────────────

export function ExecutionPlanCard({
    plan,
    specialist,
    onExecuteStep,
    onApproveStep,
    onSkipStep,
    onRunAll,
    onCancel,
    onDismiss,
}: ExecutionPlanCardProps) {
    const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set())

    const toggleExpanded = useCallback((index: number) => {
        setExpandedSteps((prev) => {
            const next = new Set(prev)
            if (next.has(index)) next.delete(index)
            else next.add(index)
            return next
        })
    }, [])

    const completedCount = countCompletedSteps(plan)
    const totalSteps = plan.steps.length
    const isRunning = plan.status === "running"
    const isComplete = plan.status === "completed"
    const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0

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
                    <div>
                        <p className="text-xs font-medium text-international-orange flex items-center gap-1.5">
                            <ListChecks className="h-3 w-3" />
                            Execution Plan
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                            {plan.title} &middot; {totalSteps} steps
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {!isComplete && !isRunning ? (
                        <>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={onDismiss}
                            >
                                <X className="h-3 w-3 mr-1" />
                                Dismiss
                            </Button>
                            <Button
                                size="sm"
                                className="h-7 text-xs bg-international-orange hover:bg-international-orange-hover"
                                onClick={onRunAll}
                            >
                                <Play className="h-3 w-3 mr-1" />
                                Run All
                            </Button>
                        </>
                    ) : isRunning ? (
                        <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={onCancel}
                        >
                            <X className="h-3 w-3 mr-1" />
                            Cancel
                        </Button>
                    ) : null}
                </div>
            </div>

            {/* Progress bar */}
            {(isRunning || isComplete) && (
                <div className="mb-3">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                            className={cn(
                                "h-full rounded-full transition-all duration-500",
                                isComplete ? "bg-green-500" : "bg-international-orange"
                            )}
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                        {completedCount}/{totalSteps} steps completed
                    </p>
                </div>
            )}

            {/* Step timeline */}
            <div className="space-y-0">
                {plan.steps.map((step, i) => {
                    const exec = plan.executions[i]
                    const status: StepStatus = exec?.status ?? "pending"
                    const stepSpecialist = getSpecialistById(step.specialistId)
                    const isCrossSpecialist = step.specialistId !== specialist.id
                    const isExpanded = expandedSteps.has(i)
                    const hasOutput = exec?.output && (status === "review" || status === "approved")

                    return (
                        <div key={i} className="relative">
                            {/* Connecting line */}
                            {i < totalSteps - 1 && (
                                <div className="absolute left-[15px] top-[32px] bottom-0 w-px bg-border" />
                            )}

                            <div className="flex gap-3 py-2">
                                {/* Step number badge */}
                                <div
                                    className={cn(
                                        "flex-shrink-0 h-[30px] w-[30px] rounded-full flex items-center justify-center text-xs font-medium z-10",
                                        getStatusColor(status)
                                    )}
                                >
                                    {getStatusIcon(status) ?? (i + 1)}
                                </div>

                                {/* Step content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        {/* Cross-specialist avatar */}
                                        {isCrossSpecialist && stepSpecialist?.avatarImage ? (
                                            <div className="relative h-4 w-4 rounded-full overflow-hidden flex-shrink-0">
                                                <Image
                                                    src={stepSpecialist.avatarImage}
                                                    alt={stepSpecialist.name}
                                                    fill
                                                    className="object-cover"
                                                    sizes="16px"
                                                />
                                            </div>
                                        ) : null}

                                        <p className="text-xs font-medium truncate">
                                            {step.title}
                                            {isCrossSpecialist && stepSpecialist ? (
                                                <span className="text-muted-foreground font-normal ml-1">
                                                    ({stepSpecialist.name})
                                                </span>
                                            ) : null}
                                        </p>

                                        {/* Status label */}
                                        {status !== "pending" && (
                                            <span className={cn("text-[10px] font-medium", getStatusColor(status).split(" ")[0])}>
                                                {getStatusLabel(status)}
                                            </span>
                                        )}
                                    </div>

                                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                        {step.description}
                                    </p>

                                    {/* Output preview (expandable) */}
                                    {hasOutput && (
                                        <button
                                            onClick={() => toggleExpanded(i)}
                                            className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {isExpanded ? (
                                                <ChevronDown className="h-3 w-3" />
                                            ) : (
                                                <ChevronRight className="h-3 w-3" />
                                            )}
                                            {isExpanded ? "Hide output" : `Show ${step.outputLabel}`}
                                        </button>
                                    )}
                                    {hasOutput && isExpanded && (
                                        <div className="mt-2 p-2 rounded bg-muted/50 border border-border text-xs max-h-48 overflow-y-auto">
                                            <pre className="whitespace-pre-wrap font-sans">
                                                {exec.output!.slice(0, 2000)}
                                                {exec.output!.length > 2000 ? "\n\n[...truncated]" : ""}
                                            </pre>
                                        </div>
                                    )}

                                    {/* Error display */}
                                    {status === "error" && exec?.error && (
                                        <p className="text-[11px] text-red-500 mt-1">
                                            {exec.error}
                                        </p>
                                    )}

                                    {/* Action buttons */}
                                    <div className="flex gap-1.5 mt-2">
                                        {status === "pending" && !isRunning && (
                                            <Button
                                                size="sm"
                                                className="h-6 text-[11px] px-2 bg-international-orange hover:bg-international-orange-hover"
                                                onClick={() => onExecuteStep(i)}
                                            >
                                                <Play className="h-3 w-3 mr-1" />
                                                Run
                                            </Button>
                                        )}
                                        {status === "review" && (
                                            <>
                                                <Button
                                                    size="sm"
                                                    className="h-6 text-[11px] px-2 bg-green-600 hover:bg-green-700 text-white"
                                                    onClick={() => onApproveStep(i)}
                                                >
                                                    <Check className="h-3 w-3 mr-1" />
                                                    Approve &amp; Continue
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    className="h-6 text-[11px] px-2"
                                                    onClick={() => onSkipStep(i)}
                                                >
                                                    <SkipForward className="h-3 w-3 mr-1" />
                                                    Skip
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Completion message */}
            {isComplete && (
                <div className="mt-3 pt-2 border-t border-green-200 dark:border-green-900">
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5" />
                        Plan complete &middot; All outputs saved to Deliverables
                    </p>
                </div>
            )}
        </div>
    )
}
