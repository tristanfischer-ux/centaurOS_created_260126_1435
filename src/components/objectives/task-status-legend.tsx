"use client"

import { CheckCircle2, ArrowRight, Clock, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatusItem {
    label: string
    color: string
    icon: typeof CheckCircle2
}

const STATUS_ITEMS: StatusItem[] = [
    {
        label: "Pending",
        color: "bg-muted-foreground",
        icon: Clock,
    },
    {
        label: "In Progress",
        color: "bg-status-info",
        icon: ArrowRight,
    },
    {
        label: "Completed",
        color: "bg-status-success",
        icon: CheckCircle2,
    },
    {
        label: "Rejected",
        color: "bg-status-error",
        icon: AlertCircle,
    },
]

export function TaskStatusLegend({ className }: { className?: string }) {
    return (
        <div className={cn("flex flex-wrap items-center gap-4 sm:gap-6 text-sm p-4 bg-muted/20 rounded-xl border border-muted", className)}>
            <span className="text-muted-foreground font-medium">Task Status:</span>
            {STATUS_ITEMS.map((item) => {
                const Icon = item.icon
                return (
                    <div key={item.label} className="flex items-center gap-2">
                        <div className={cn("h-2 w-8 sm:w-10 rounded-full", item.color)} />
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-foreground font-medium">{item.label}</span>
                    </div>
                )
            })}
        </div>
    )
}
